# State of the Codebase

> **Verified against the working tree on 2026-08-08** by reading the source, not
> by trusting older docs. Several documents in this folder described a backend
> layout that no longer exists; this file is the current truth. When something
> here disagrees with `LAYER2-WHATSAPP-CLOUD-PLAN.md` or `COMPLETION-TRACKER.md`,
> this file wins — those two are now historical.

---

## 1. What changed since the last doc pass

The backend was restructured from a flat `backend/*.py` module set into a
layered `backend/app/` package. Every path in the older docs is wrong.

| Old (documented) | Now (actual) |
|---|---|
| `backend/main.py` | `backend/app/main.py` |
| `backend/config.py` | `backend/app/settings/{app,auth,billing,database,whatsapp}.py` |
| `backend/db.py` | `backend/app/db/{session,base,bootstrap,migrations,seed}.py` |
| `backend/models.py` | `backend/app/models/{user,shop,billing,commerce,messaging}.py` |
| `backend/wa.py` | `backend/app/services/wa/__init__.py` (dispatcher) |
| `backend/wa_mock.py` | `backend/app/services/wa/mock.py` |
| `backend/wa_cloud.py` | `backend/app/services/wa/cloud/{client,messaging,templates,signup}.py` |
| `backend/routes_webhook.py` | `backend/app/api/routes/meta_webhook.py` |
| `backend/routes_wa.py` | `backend/app/api/routes/whatsapp.py` |
| `backend/routes_core.py` | split into `routes/{shop,dashboard,health}.py` |
| `backend/routes_commerce.py` | split into `routes/{customers,products,orders}.py` |
| `backend/routes_chats.py` | split into `routes/{chats,broadcasts,ready_messages}.py` |
| `backend/deps.py` | `backend/app/api/deps.py` |
| `backend/secure.py` | `backend/app/core/crypto.py` |
| `backend/events.py` | `backend/app/core/events.py` |
| `backend/migrate.py` | `backend/app/db/migrations.py` |
| `backend/seed.py` | `backend/app/db/seed.py` |

Run command changed too: **`uvicorn app.main:app --reload --port 8010`** from
`backend/`, not `uvicorn main:app`.

`backend/README.md` is accurate and current — it is the best reference for
layout, local run, and Cloud Run deploy. This file covers product state instead.

---

## 2. Corrections to standing claims

Things other docs still assert that are no longer true:

| Claim | Reality |
|---|---|
| "`config.py` pins `WA_API_VERSION = v21.0`, four versions stale" (K-13) | **Fixed.** `app/settings/whatsapp.py` defaults to `v25.0`. |
| "Startup runs seed before migrations" | **Fixed.** `app/main.py` documents and enforces the order, and migrations now take a Postgres advisory lock so concurrent boots don't race. |
| "Coexistence (K-02) not started" | **Largely built.** See §4. |
| "MM API (K-14) not started" | **Largely built.** Broadcasts already route to `/marketing_messages`. |
| "Embedded Signup is a stub" | **Real.** Full v4 flow, both frontend and backend. |
| "`/onboarding/connect` lives in `routes_core.py`" | It is `app/api/routes/shop.py`. |

---

## 3. What is genuinely built and working

### Auth and account bootstrap
- JWT + Google OAuth (`app/api/routes/auth.py`, `app/core/security.py`).
- `bootstrap_account()` gives every new user an empty shop **and** a trialing
  subscription, idempotently, so every downstream route has a tenant to scope to.
- `current_user → current_shop → active_shop` is the single auth seam
  (`app/api/deps.py`). `active_shop` adds the 402 billing gate.

### Embedded Signup v4 — the real flow
`app/services/wa/cloud/signup.py::connect_embedded_signup` performs, server-side:

1. `GET /oauth/access_token` — exchange the short-lived code for a business token.
2. `GET /debug_token` (app token) — read `granular_scopes` to discover which WABA
   the seller actually granted. **The token scopes are treated as the source of
   truth**; the browser's `waba_id` is only a cross-check, and a mismatch is a
   hard error. This is the correct security posture.
3. `GET /{waba_id}/phone_numbers` — resolve the number, validating any
   browser-supplied `phone_number_id` belongs to the granted WABA.
4. `POST /{waba_id}/subscribed_apps` — start the webhook flow.
5. `POST /{phone_number_id}/register` with a generated 6-digit PIN — **skipped for
   coexistence numbers**, which are already registered.

Credentials are persisted *before* registration so a register failure is
retryable from Settings rather than losing the token. `ALREADY_REGISTERED_CODE`
is correctly treated as success, not failure.

### Coexistence (K-02)
- Detects a Business-app number via `GET /{phone_number_id}?fields=is_on_biz_app`
  and falls back to the fresh path if the check fails.
- Skips `/register`, then fires `POST /{phone_number_id}/smb_app_data` twice
  (`smb_app_state_sync`, then `history`).
- Tracks `wa_history_sync_status` (`none|pending|done|failed|skipped`),
  `wa_contacts_synced`, `wa_messages_synced` on the shop.
- Treats "seller declined to share history" as `skipped`, not a failure.
- Webhook handles the coexistence fields.

### Marketing Messages API (K-14)
- Broadcasts send to `/{phone_number_id}/marketing_messages`; everything else to
  `/messages` (`cloud/messaging.py`).
- MM API only accepts templates, and the code knows it — broadcast sends never
  attempt free text even when the 24h window is open.
- `GET /wa/mm-status` reads and persists MM onboarding/ToS state, normalising
  Meta's string-vs-object status variants.
- `POST /wa/mm-test` gates on signed terms (409 if not) before sending.

### Webhooks
`app/api/routes/meta_webhook.py` — signature check, tenant resolution
(`phone_number_id` for message events, `entry.id` for WABA-level events),
dispatch to `services/wa/inbound.py`. Each change is wrapped so one poison entry
rolls back and logs without 500-ing the batch — Meta re-delivers on non-200, so
this is the right shape.

### Sending
- Bounded retries with backoff, transient vs permanent error classification.
- Token expiry (code 190) marks the shop for reconnect and publishes
  `wa_disconnected` instead of retrying forever.
- Outside the 24h window, ready/broadcast sends fall back to the approved
  template automatically; plain text is refused with an actionable message.
- Broadcast fan-out is paced and runs blocking urllib on a thread so the event
  loop stays free.

---

## 4. The gaps that block "sign up → connect → send"

This is the honest list for the current goal. Ordered by how hard they block.

| # | Gap | Where | Severity | Status |
|---|---|---|---|---|
| **G1** | "Send me a test message" was fake — `onClick={() => setTestSent(true)}`, no API call. | `frontend/app/onboarding/page.tsx` | Blocker | **Fixed** |
| **G2** | No endpoint behind it. `/wa/mm-test` needs a `customer_id` *and* an approved template — neither exists at the end of onboarding. | backend | Blocker | **Fixed** — `POST /wa/test-message` |
| **G3** | `/connect` showed hardcoded fiction ("+91 98430 21188", "182 / 250", "1,204 messages") regardless of real state. | `frontend/app/connect/page.tsx` | High | **Fixed** |
| **G4** | No endpoint exposed coexistence path, sync counts, or step state. | `app/api/routes/whatsapp.py` | High | **Fixed** — `GET /wa/onboarding-status` |
| **G5** | Onboarding hardcoded `path: "fresh"`, so the primary funnel couldn't reach coexistence. | `frontend/app/onboarding/page.tsx` | High | **Fixed** |
| **G6** | No payment-method status. Tech Provider sellers must attach a card before charged templates send. | backend + UI | Medium | **Open** — Meta exposes no API for this; `/connect` now links Meta's walkthrough and asks for manual confirmation |
| **G7** | `WA_EMBEDDED_SIGNUP` listener `useEffect` had no dependency array — re-subscribed every render. | both pages | Low | **Fixed** |
| **G8** | `completeConnect` closed over a stale `path`; worked only by accident of G7. | `connect/page.tsx` | Low | **Fixed** — `pathRef` |
| **G9** | Mock-mode `/onboarding/connect` never set `waba_id`/`phone_number_id`/`wa_verified`, so the demo showed a permanently unfinished checklist. Found while testing the G4 fix. | `app/api/routes/shop.py` | Medium | **Fixed** |

### What "onboarding end to end" now does

`/signup` → `/onboarding` (shop details → **choose coexistence or fresh** →
Embedded Signup v4 → **real test message**) → `/today`.

- `POST /wa/test-message` sends Meta's built-in `hello_world` template — the one
  template present on every WABA from day one — so it works before the seller
  has approved anything. It is deliberately not routed through `send_message()`,
  which requires a `Customer` row and an approved ready-message template.
- It refuses a send to the shop's own number with an explanation, because
  WhatsApp rejects self-sends with an opaque error.
- Nothing is persisted as a `Message`: this is a diagnostic, not a conversation,
  and inventing a Customer for it would pollute the seller's contact list.
- `shops.wa_test_message_sent_at` records the proof, which is what flips the
  final step in `GET /wa/onboarding-status`.
- Both engines implement `send_test_message`, so onboarding completes in demo
  mode too.

Verified end to end against the real API (both paths, mock mode): signup →
shop → connect → status → self-send guard (400) → test send (200) → all steps
done.

---

## 5. Frontend page inventory

| Route | State |
|---|---|
| `/signup`, `/login`, `/auth/callback` | Real |
| `/onboarding` | Real, complete — path choice + ES v4 + real test message |
| `/today`, `/chats`, `/broadcast`, `/orders`, `/customers`, `/catalog` | Real, backed by API |
| `/settings` | Real — ES launch, templates, ready messages |
| `/billing` | Real — Razorpay |
| `/connect` | Real — ES launch, live status hero, live step list. Partner-capacity panel is still illustrative |
| `/templates`, `/insights`, `/payments`, `/growth` | Design previews on mock data, as scoped |

---

## 6. Environment required for cloud mode

```env
WA_MODE=cloud
WA_API_VERSION=v25.0
META_APP_ID=2854903808192123
META_APP_SECRET=<server-only>
META_ES_CONFIG_ID=<from Facebook Login for Business → Configurations>
WA_VERIFY_TOKEN=<random>
WA_TOKEN_ENC_KEY=<fernet key>
```

`META_ES_CONFIG_ID` being empty is what produces "Meta Embedded Signup isn't
configured" on `/connect` and `/settings`. See `EMBEDDED-SIGNUP-V4-TODO.md` for
where to get it.

Frontend must point at the API: `NEXT_PUBLIC_API_URL` (defaults to
`http://localhost:8010`, which is also the port `backend/README.md` documents —
starting uvicorn on the default 8000 will not work with the CORS allowlist).

---

## 7. Document status

| Doc | Status |
|---|---|
| `backend/README.md` | **Current** — layout, run, deploy |
| `STATE-OF-THE-CODEBASE.md` | **Current** — this file |
| `META-PLATFORM-CAPABILITIES.md` | Current, minus the v21.0 note (corrected there) |
| `PRODUCT-SCOPE-2026.md` | Current, statuses refreshed |
| `COMPETITIVE-LANDSCAPE.md` | Current |
| `EMBEDDED-SIGNUP-V4-TODO.md` | Current — live checklist |
| `MM-API-SETUP.md` | Current |
| `META-SETUP-GUIDE.md` | Partly historical — Phase A is done |
| `LAYER2-WHATSAPP-CLOUD-PLAN.md` | **Historical** — every file path is stale |
| `COMPLETION-TRACKER.md` | **Historical** — that pass completed |
