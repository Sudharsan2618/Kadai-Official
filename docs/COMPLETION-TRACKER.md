# Kadai — Completion Tracker (UI 75% → 100%, Backend 65% → 100%)

> # ⚠️ HISTORICAL — this pass is finished
>
> **Closed 8 Aug 2026.** Every item below shipped, and the backend has since been
> restructured into `backend/app/`, so the file references are stale. Kept as a
> record of what "done" meant for that milestone.
>
> Current status lives in **`STATE-OF-THE-CODEBASE.md`**; the forward backlog is
> **`PRODUCT-SCOPE-2026.md`**.

> First-priority gap-closure plan. Tamil i18n is explicitly DEFERRED (scaffold
> exists in `lib/i18n.ts`; only English ships now). Check items off as they land.

## Status legend
`[ ]` todo · `[x]` done · `[~]` partial

---

## Frontend gaps (→ 100%)

### F1. Toast system  `[x]`
- [x] `components/toast.tsx` — provider + `useToast()`; success / error variants;
  auto-dismiss; stacked bottom-right (desktop) / above tab bar (mobile)
- [x] Mounted once in root layout
- [x] Wired into every mutation: chat send, ready send, broadcast send,
  order status change, customer add, product add/price/stock, settings saves,
  ready-message CRUD, onboarding connect

### F2. Error states  `[x]`
- [x] Page-level fetch failure → inline error panel with Retry button
  (Today, Chats, Broadcast, Orders, Customers, Catalog, Settings)
- [x] Mutation failures → error toast with the backend's message
- [x] SSE silently reconnects (EventSource native) — no user-facing error

### F3. Form validation  `[x]`
- [x] Shared `validatePhone` (Indian 10-digit) + inline field error text
- [x] New customer: name required, phone valid + duplicate-aware (server 409)
- [x] New item: name required, price > 0
- [x] Ready-message editor: label + body required, body must be non-trivial
- [x] Onboarding step 1: shop name + valid phone before Next
- [x] Broadcast wizard: Next disabled until valid (already) + toast on send fail

### F4. Empty-flow polish  `[x]`
- [x] Every empty state gets a CTA that moves the user forward:
  Chats → "Send a broadcast"; Orders → "Open chats"; Customers → "Add customer";
  Catalog → "Add item"; Broadcast → "New broadcast" (already); Today cards → CTAs
- [x] Today first-run: if no customers yet, show a getting-started checklist card
  (add items → add customers → send first broadcast)

### Deferred (not in this pass)
- [ ] Tamil i18n (`lib/i18n.ts` scaffold ready)
- [ ] Real logo/favicon swap (waiting on final asset)

---

## Backend gaps (→ 100%)

### B1. Shop scoping enforcement  `[x]`
- [x] `current_shop()` FastAPI dependency — resolves the shop once per request
  (single-tenant today, auth-ready: swaps to token-derived shop later)
- [x] EVERY query filtered by `shop_id` (customers, products, orders, messages,
  ready-messages, broadcasts, conversations, today, unread math)
- [x] Cross-shop writes impossible: create/update paths take shop from the
  dependency, never from the client

### B2. Rate pacing  `[x]`
- [x] Broadcast engine paces sends (`BROADCAST_MSGS_PER_SEC`, default 10/s)
  instead of blasting the loop — mirrors Meta throughput limits
- [x] Pacing applied in mock engine so behaviour carries to cloud mode

### B3. Retries + failure states  `[x]`
- [x] `send_with_retry` wrapper: 2 retries with backoff on transient failure
- [x] Message rows can be `failed`; broadcast recipients can be `failed`
- [x] `POST /broadcasts/{id}/resend-failed` — resend only failed recipients
- [x] Failed count surfaced in broadcast API + UI chip + resend button

### B4. Pagination  `[x]`
- [x] `page`/`page_size` on `/customers`, `/orders`, `/broadcasts`, `/chats`
  (defaults keep current behaviour; responses include `total`, `has_more`)
- [x] `/chats/{id}` messages: `before_id` + `limit` (newest window by default)
- [x] Frontend: "Load more" affordances on Orders + Customers lists;
  chat thread loads older messages on demand

### B5. Robustness odds & ends  `[x]`
- [x] Duplicate-customer guard (same phone within shop → 409)
- [x] Consistent error shape `{detail}` everywhere (FastAPI default kept)
- [x] Input length caps on free-text sends (WhatsApp 4096-char body limit)

---

## Meta / real-WhatsApp track (separate doc)
See `META-SETUP-GUIDE.md`. Blocked on Meta review — start Phase A now.

## After this tracker completes
1. USER VERIFICATION PAUSE (you test everything, send feedback)
2. Auth + billing plan (on your go)
3. Landing page (you supply reference site → firecrawl clone of look/feel)
