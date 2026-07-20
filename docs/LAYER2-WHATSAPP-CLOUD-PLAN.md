# Layer 2 — Real WhatsApp (Meta Cloud API) Implementation Plan

> **STATUS (7 Jul 2026): CODE COMPLETE.** All sections below are implemented:
> `wa.py` (dispatcher), `wa_cloud.py` (Graph client: send/templates/register/
> Embedded Signup), `routes_webhook.py` (verify + inbound + statuses + template
> updates, signed + idempotent), `routes_wa.py` (seller-facing: /wa/config,
> /templates, submit/sync, /wa/register), `secure.py` (Fernet token encryption),
> Shop/Message/Template model + idempotent migration. Mock mode unchanged and
> still the default (`WA_MODE=mock` → demo; `WA_MODE=cloud` → production).
>
> **What remains is external, not code:**
> 1. Meta dashboard: create the app, add WhatsApp product, Embedded Signup
>    config → fill `META_APP_ID`, `META_APP_SECRET`, `META_ES_CONFIG_ID`.
> 2. Set `WA_VERIFY_TOKEN` (any random string) and register the webhook URL
>    `https://<your-domain>/wa/webhook` in the Meta app (subscribe to
>    `messages` + `message_template_status_update`).
> 3. Generate `WA_TOKEN_ENC_KEY`:
>    `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
> 4. Business Verification + App Review (days–2 weeks, start now).
> 5. Test with a Meta test number + tunnel (ngrok/cloudflared) per §10.

> Handoff doc. Everything below is what it takes to turn Kadai from the mock
> WhatsApp engine into a real one talking to Meta's WhatsApp Cloud API.
> Read this first in the new chat, then work top-to-bottom.

---

## 0. Where we are

Kadai is split into two layers:

- **Layer 1 — App / business backend: ~92% real ✅**
  FastAPI + PostgreSQL (`kadai` schema), auth (JWT + Google OAuth), Razorpay
  billing (live-verified), multi-tenant shop scoping, SSE realtime, broadcast
  pacing/retry/failed-state orchestration. All real.

- **Layer 2 — WhatsApp transport: ~10% real ⚠️ ← THIS DOC**
  Everything touching Meta is simulated by `backend/wa_mock.py`. The *interfaces*
  are real and already isolated (that was deliberate), so this is a swap-in job,
  not a rewrite.

### The current gap

| Piece | State | What "real" needs |
|---|---|---|
| Send message | ❌ Mock | `wa_mock.send_message()` → Graph API `POST /{phone_id}/messages` |
| Inbound messages | ❌ Mock | a **webhook receiver** for Meta (verify token + message payloads) |
| Delivery/read ticks | ❌ Mock | webhook `statuses` events (not simulated timers) |
| Onboarding/connect | ❌ Stub | real **Embedded Signup** token exchange → WABA + phone_number_id |
| Templates | ❌ None | template create + submit-for-approval + status sync |
| 24h window | 🟡 Half | logic exists, but keyed off mock timestamps |
| Number registration | ❌ None | register phone, set two-step PIN |
| Design / interface seam | ✅ Real | `send_message`, `current_shop`, `/onboarding/connect` are already the clean swap points |

**Why this is tractable:** the functions a real `wa_cloud.py` must replace are
already isolated behind a stable signature, and `docs/META-SETUP-GUIDE.md`
documents the 5 real API calls per seller.

---

## 1. Goal & guiding principle

Add a `WA_MODE=cloud` code path that uses the real Meta WhatsApp Cloud API,
**without touching any route or frontend code**. Mock and cloud must coexist so
we can keep developing offline and flip a single env var when Meta approves us.

**Principle:** one dispatcher, two backends.
```
wa.py          # thin dispatcher: reads WA_MODE, delegates to mock or cloud
  ├── wa_mock.py    (exists today)
  └── wa_cloud.py   (NEW — real Graph API client + webhook handlers)
```
Every caller imports from `wa` (or keeps importing `wa_mock`'s public names via
the dispatcher). The public surface stays identical.

---

## 2. The seams (exact functions/fields that must stay stable)

These already exist — do not change their signatures, only their bodies/backend:

- `wa_mock.send_message(db, customer_id, body, kind="text", ready_label="", broadcast_id=None, tick=True) -> Message`
  The single outbound choke point. Cloud version calls Graph API and stores the
  returned `wamid` on the Message.
- `wa_mock.send_with_retry() -> bool` — bounded retry wrapper (keep the shape).
- `wa_mock.start_broadcast(broadcast_id)` — paced fan-out; reuse as-is, it just
  calls `send_message` under the hood.
- `routes_core.onboarding_connect()` — sets `shop.wa_connected` + `shop.wa_number`.
  Cloud version performs the real Embedded Signup token exchange here.
- `deps.current_shop` — the tenant seam; cloud webhooks resolve the shop from the
  incoming `phone_number_id` instead (see §5).

---

## 3. Data model additions (`backend/models.py` + a migration)

Add to **`Shop`** (per-tenant WhatsApp credentials):
- `waba_id: str` — WhatsApp Business Account id
- `phone_number_id: str` — the Cloud API phone number id (indexed — webhooks key off it)
- `wa_access_token: str` — long-lived / system-user token (**store encrypted**, see §8)
- `wa_token_expiry: datetime | None`
- `wa_verified: bool` — number registered + 2FA PIN set

Add to **`Message`**:
- `wamid: str` (indexed) — Meta's message id, so `statuses` webhooks can map a
  delivery/read event back to our row. **This is the missing link for status ticks.**

New model **`Template`** (ready-messages that became approved WhatsApp templates):
- `id, shop_id (FK, indexed)`
- `name: str` — Meta template name (snake_case, unique per WABA)
- `language: str` — e.g. `en`, `ta`
- `category: str` — `MARKETING | UTILITY | AUTHENTICATION`
- `body: str` — with `{{1}}` positional params (map from our `{name}`/`{shop}`)
- `status: str` — `pending | approved | rejected | paused`
- `meta_template_id: str`
- `rejected_reason: str`

Write the migration idempotently in `backend/migrate.py` (same pattern already
used there: `ADD COLUMN IF NOT EXISTS`, create new tables via `create_all_kadai()`).
⚠️ Remember the **`public.users` schema-collision gotcha**: always create tables
through `db.create_all_kadai()` (pins `search_path` to `kadai`), never bare
`Base.metadata.create_all(engine)`.

---

## 4. `wa_cloud.py` — the Graph API client (NEW)

Base URL: `https://graph.facebook.com/v21.0` (pin a version).
Auth: `Authorization: Bearer {shop.wa_access_token}` per request (per-tenant).

Functions to implement (mirror the mock's public names):

1. `send_message(db, customer_id, body, kind, ready_label, broadcast_id, tick=True) -> Message`
   - Resolve shop + customer phone (E.164, `+91…`).
   - Inside 24h window → free-form text:
     `POST /{phone_number_id}/messages`
     `{"messaging_product":"whatsapp","to":"<phone>","type":"text","text":{"body":"<body>"}}`
   - Outside window / marketing → must use an **approved template** (see §6).
   - Persist Message with `status="sent"`, `wamid=<messages[0].id>`.
   - On HTTP error → `status="failed"` (feeds existing resend UI). Keep
     `send_with_retry()` bounded-retry semantics for transient 5xx / rate limits.
   - Do **not** schedule fake delivery ticks — real ticks arrive via webhook.

2. `register_number(shop)` — `POST /{phone_number_id}/register` with a 6-digit
   `pin` (two-step verification). Sets `shop.wa_verified = True`.

3. `create_template(shop, template)` / `sync_template_status(shop)` — see §6.

4. Token/error helpers: central `_graph(method, path, shop, json=...)` that adds
   auth, handles Meta error envelopes (`error.code`, `error.message`,
   `error.error_subcode`), and maps 190 (token expired) → surface a re-connect
   prompt to the shop.

Use stdlib `urllib`/`httpx` (project already avoids heavy SDKs; Razorpay client
was done with stdlib — follow that convention).

---

## 5. `routes_webhook.py` — Meta webhook receiver (NEW router)

Register in `main.py`: `app.include_router(routes_webhook.router)`.

**GET `/wa/webhook`** — verification handshake:
- Read `hub.mode`, `hub.verify_token`, `hub.challenge`.
- If `hub.verify_token == config.WA_VERIFY_TOKEN` → return `hub.challenge` (plain).

**POST `/wa/webhook`** — events:
- **Verify signature**: `X-Hub-Signature-256` = `sha256=HMAC(app_secret, raw_body)`.
  (Same HMAC pattern already used for the Razorpay webhook — copy it.)
- Parse `entry[].changes[].value`:
  - `messages[]` → **inbound**: resolve shop via `value.metadata.phone_number_id`,
    upsert Customer by `wa_id` (phone), insert inbound `Message(direction="in")`
    with the real timestamp (this is what makes the **24h window real**), then
    `events.publish("message_in", …)` so SSE updates live.
  - `statuses[]` → **delivery/read**: look up Message by `wamid`, set
    `status` = `sent|delivered|read|failed`, `events.publish("message_status", …)`.
    Handle `errors[]` inside a status (e.g. re-engagement/1013) → mark failed.
- **Return 200 fast** (ack within seconds); do heavy work after ack or in a task.
  Meta retries on non-200, so make handlers **idempotent** (dedupe on `wamid` /
  message id).

**Tenant resolution:** every event carries `metadata.phone_number_id` →
`Shop.phone_number_id`. That replaces `current_shop` for webhook context.

---

## 6. Templates (the part with the longest lead time)

Free-form text only works **inside** a customer's 24h window. Broadcasts and
first-contact messages **require pre-approved templates**. This gates the
broadcast feature going live.

Flow to build:
1. In Settings/Ready-messages UI, "Submit for approval" →
   `POST /{waba_id}/message_templates` with `name`, `language`, `category`,
   `components` (BODY with `{{1}}` params). Convert our `{name}`/`{shop}`
   placeholders → positional `{{1}}`, `{{2}}` and keep a param-order map.
2. Store `Template(status="pending")`.
3. Poll/sync status via `GET /{waba_id}/message_templates` (or the
   `message_template_status_update` webhook field) → update to
   `approved|rejected` with reason.
4. Broadcast send path: if outside window → send `type:"template"` with the
   approved template name + language + filled params, instead of free-form text.

**Approval takes minutes-to-hours per template** and is external. Start a couple
of UTILITY templates (order confirmed, payment reminder) and one MARKETING
(daily stock) early.

---

## 7. Embedded Signup (real `/onboarding/connect`)

Replace the stub. In production the frontend opens Meta's **Embedded Signup**
popup (JS SDK) → seller approves → returns a short-lived `code`. Backend then:
1. Exchange `code` → access token: `GET /oauth/access_token`
   (`client_id`, `client_secret`, `code`).
2. Read the granted **WABA id** and **phone_number_id**
   (`GET /{waba_id}/phone_numbers` / debug_token).
3. **Subscribe** the app to the WABA: `POST /{waba_id}/subscribed_apps`.
4. **Register** the number (§4.2) with a 2FA PIN.
5. Send a test message to confirm.
6. Persist `waba_id`, `phone_number_id`, `wa_access_token`, set
   `shop.wa_connected = True`, `shop.wa_number`, `shop.wa_verified = True`.

These are exactly the **5 real API calls per seller** documented in
`docs/META-SETUP-GUIDE.md` — cross-reference it while wiring this.

---

## 8. Config / env additions (`backend/config.py` + `.env`)

```
WA_MODE=cloud                 # mock | cloud   (dispatcher switch)
WA_API_VERSION=v21.0
META_APP_ID=
META_APP_SECRET=              # used for webhook signature + token exchange
WA_VERIFY_TOKEN=              # your chosen random string for GET webhook handshake
WA_TOKEN_ENC_KEY=            # symmetric key to encrypt per-shop tokens at rest
# Embedded Signup config id (from the Meta app) if using the JS SDK flow
META_ES_CONFIG_ID=
```
Add `WA_MODE`, `plan_public()`-style getters as needed. **Never commit real
tokens** — `.env` is already gitignored. Encrypt `wa_access_token` at rest with
`WA_TOKEN_ENC_KEY` (e.g. Fernet); tokens are long-lived and sensitive.

---

## 9. Task breakdown (≈4–5 focused dev-days of code)

1. **Dispatcher + config switch** (`wa.py`, `WA_MODE`) — ~0.5d
2. **Model + migration** (Shop creds, `Message.wamid`, `Template`) — ~0.5d
3. **`wa_cloud.send_message` + retry/error mapping** — ~1d
4. **`routes_webhook.py`** (verify + inbound + statuses, idempotent, signed) — ~1d
5. **Embedded Signup token exchange** in `/onboarding/connect` — ~0.5d
6. **Templates** (create, submit, status sync, template-send path) — ~1–1.5d
7. **Number registration + 2FA PIN** — ~0.25d
8. **Token encryption at rest** — ~0.25d

Then the real bottleneck is **not code**: Meta **Business Verification + App
Review** (WhatsApp Business Management + `whatsapp_business_messaging`
permissions, 2 screencast videos) — **days to ~2 weeks of waiting**, external
and blocking. Kick this off in the Meta dashboard **in parallel with day 1**.

---

## 10. Testing plan

- **Mock stays default in dev** (`WA_MODE=mock`) — everything keeps working offline.
- Cloud path: use a **Meta test number** (free, no verification) to exercise
  send + webhook end-to-end before business verification completes.
- Point the webhook at your local box via a tunnel (ngrok/cloudflared) and
  register that URL + `WA_VERIFY_TOKEN` in the Meta app.
- Assert: outbound returns a `wamid`; inbound creates a Customer+Message and
  fires SSE; a real reply opens the 24h window; `statuses` flip the message to
  delivered/read; an out-of-window send is blocked unless a template is used.

---

## 11. Definition of done

- [ ] `WA_MODE=cloud` sends a real WhatsApp message and stores its `wamid`.
- [ ] Inbound customer messages appear in Chats live (SSE), with real timestamps.
- [ ] Delivery/read status updates arrive via webhook and update the UI.
- [ ] A new seller can connect their own number via Embedded Signup end-to-end.
- [ ] At least one approved template; broadcasts send via template outside the window.
- [ ] No route or frontend changes were required (the seam held).
- [ ] Mock mode still works with `WA_MODE=mock`.
- [ ] Meta Business Verification + App Review submitted (external clock running).

---

## Quick reference — files

| File | Action |
|---|---|
| `backend/wa.py` | NEW — dispatcher on `WA_MODE` |
| `backend/wa_cloud.py` | NEW — Graph API client + send/register/templates |
| `backend/routes_webhook.py` | NEW — Meta webhook (verify + messages + statuses) |
| `backend/models.py` | EDIT — Shop creds, `Message.wamid`, `Template` |
| `backend/migrate.py` | EDIT — idempotent columns/tables (use `create_all_kadai()`) |
| `backend/routes_core.py` | EDIT — real Embedded Signup in `onboarding_connect` |
| `backend/config.py` + `.env` | EDIT — WA_MODE + Meta creds + verify/enc keys |
| `backend/main.py` | EDIT — include `routes_webhook.router` |
| `docs/META-SETUP-GUIDE.md` | REFERENCE — the 5 per-seller calls + dashboard steps |

Layer 1 (auth/billing/app) is done and verified — do not re-touch it. This is
purely the transport swap behind existing seams.
