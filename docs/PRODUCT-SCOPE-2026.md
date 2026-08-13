# Kadai — Product Scope 2026 (retrospective re-scope, post Tech Provider approval)

> **Why this document exists.** We became an approved Meta Tech Provider before we
> had scoped what that actually unlocks. This is the retrospective pass: the whole
> Meta surface (`META-PLATFORM-CAPABILITIES.md`), the competitive picture
> (`COMPETITIVE-LANDSCAPE.md`), and our existing codebase, reconciled into one
> prioritised backlog.
>
> **How to read it.** Every item has an ID (`K-xx`), a priority, an effort, a mock
> screen (where UI is involved), and a GitHub issue. Mock screens ship first so we
> can validate flow with real sellers before paying for the backend.

---

## The strategy in one paragraph

We are a Tech Provider selling a ₹1,500/month WhatsApp shop tool to Tamil Nadu
neighbourhood sellers. We cannot out-feature AiSensy or Interakt and should not
try. We win by owning the one migration nobody else is doing — **taking a seller
who lives in the WhatsApp Business app and upgrading them in place, without
losing their number or their chats** — and then being the least confusing,
most honest, most shop-shaped tool they have ever used. Everything below is
ordered by how directly it serves that.

---

## Priority definitions

| | Meaning |
|---|---|
| **P0** | Blocks a real seller going live, or is a legal/quality obligation. Ship before launch. |
| **P1** | Core product value. Ship within one or two releases of launch. |
| **P2** | Growth and differentiation. Ship when P0/P1 are stable. |
| **P3** | Deliberately deferred. Recorded so we stop re-litigating it. |

---

## P0 — Launch blockers

| ID | Item | Why | Effort | Mock screen | Status |
|---|---|---|---|---|---|
| **[K-01](https://github.com/Sudharsan2618/Kadai-Official/issues/1)** | **Embedded Signup v4 migration** | v2 dies 15 Oct 2026. v4 is config-driven and onboards Cloud API + MM API in one flow | M | `/connect` | **Built** |
| **[K-02](https://github.com/Sudharsan2618/Kadai-Official/issues/2)** | **Coexistence onboarding** | The wedge. Seller keeps app + number + history; Meta kills their broadcast lists | L | `/connect` | **Built** (needs live test) |
| **[K-03](https://github.com/Sudharsan2618/Kadai-Official/issues/3)** | **Hosted Embedded Signup fallback** | Zero-integration URL; unblocks sales demos and rescues failed JS flows | S | `/connect` | Partial — URL in UI |
| **[K-04](https://github.com/Sudharsan2618/Kadai-Official/issues/4)** | **Sandbox mode** | 30-day test account; onboarding handshake testable without real assets | S | `/connect` | Partial — claimed, not wired |
| **[K-05](https://github.com/Sudharsan2618/Kadai-Official/issues/5)** | **Seller payment-method step** | Tech Provider reality: no card, no sending. Must be a guided, tracked step | S | `/connect` | Not started |
| **[K-06](https://github.com/Sudharsan2618/Kadai-Official/issues/6)** | **Onboarding state machine** | `code_exchanged → subscribed → registered → payment_added → live`, each retryable | M | `/connect` | Partial |
| **[K-07](https://github.com/Sudharsan2618/Kadai-Official/issues/7)** | **Template Library adoption** | Pre-approved utility templates = seller live in minutes, no review wait | M | `/templates` | Preview only |
| **[K-08](https://github.com/Sudharsan2618/Kadai-Official/issues/8)** | **Opt-out handling (`user_preferences`)** | Legal + quality. `stop`/`resume` must suppress marketing sends permanently | M | `/templates`, `/insights` | Not started |
| **[K-09](https://github.com/Sudharsan2618/Kadai-Official/issues/9)** | **Opt-in capture and proof** | Meta requires demonstrable opt-in per contact | M | `/insights` | Not started |
| **[K-10](https://github.com/Sudharsan2618/Kadai-Official/issues/10)** | **Messaging-limit awareness** | Sellers start at 250 unique recipients / 24h. Must show it, pace within it, never silently fail | M | `/insights` | Not started |
| **[K-11](https://github.com/Sudharsan2618/Kadai-Official/issues/11)** | **Account-health webhooks** | `phone_number_quality_update`, `account_alerts`, `account_review_update`, `business_capability_update` | M | `/insights` | Partial — `account_update` |
| **[K-12](https://github.com/Sudharsan2618/Kadai-Official/issues/12)** | **Per-user marketing limit handling (131049)** | Adaptive per-recipient cap. Never retry inside 24h; prefer in-window sends | M | `/insights` | Not started |
| **[K-13](https://github.com/Sudharsan2618/Kadai-Official/issues/13)** | **Graph API version bump v21 → v25** | We are four versions stale | S | — | **Done** |

### Notes on the P0 set

> **Status refreshed 8 Aug 2026** against the working tree. K-01, K-02, K-13 and
> K-14 are built; the remaining P0 blockers for a real seller going live are
> **K-05** (payment method) and the two onboarding gaps recorded as G1/G2 in
> `STATE-OF-THE-CODEBASE.md` — the "send a test message" step is currently a
> no-op in the UI with no endpoint behind it.

**K-02 is the most valuable item in this document.** It is also the largest.
Constraints that must be designed in from the start: coexisting numbers are
capped at **20 messages/second**; we have a hard **24-hour window** after
onboarding to pull history or the seller must be offboarded and redo the flow;
and it needs three extra webhook subscriptions (`history`, `smb_app_state_sync`,
`smb_message_echoes`) on top of what we already handle.

**K-10 will otherwise be our first support fire.** A seller with 400 regulars
who broadcasts to all of them on day one hits the 250 cap and concludes we are
broken. Show the limit, pace against it, and drive them down a scaling path
(business verification is fastest).

**K-08 and K-09 are not optional.** They are the difference between a durable
account and a throttled then banned one.

---

## P1 — Core product value

| ID | Item | Why | Effort | Mock screen | Status |
|---|---|---|---|---|---|
| **[K-14](https://github.com/Sudharsan2618/Kadai-Official/issues/14)** | **MM API for WhatsApp send path** | Up to 9% more delivered (Meta's own India test), GIF headers, TTL 12h–30d, benchmarks, conversion metrics, max-price | M | `/insights`, broadcast | **Built** |
| **[K-15](https://github.com/Sudharsan2618/Kadai-Official/issues/15)** | **Template + pricing analytics** | Sent/delivered/read/**clicked**, cost per delivered, volume-tier progress | M | `/insights` | Preview only |
| **[K-16](https://github.com/Sudharsan2618/Kadai-Official/issues/16)** | **Interactive reply buttons + lists** | Our end customers should tap, not type. Decisive for low-literacy users | S | broadcast, chats | Not started |
| **[K-17](https://github.com/Sudharsan2618/Kadai-Official/issues/17)** | **Location request messages** | "Send your delivery address" as a native tap | S | chats | Not started |
| **[K-18](https://github.com/Sudharsan2618/Kadai-Official/issues/18)** | **WhatsApp Catalog sync** | Kadai Product → Meta catalog item | M | `/growth` | Not started |
| **[K-19](https://github.com/Sudharsan2618/Kadai-Official/issues/19)** | **Multi-product messages** | "Today's stock" as a real product list, up to 30 items | M | `/growth` | Not started |
| **[K-20](https://github.com/Sudharsan2618/Kadai-Official/issues/20)** | **Cart order webhook → Kadai Order** | Customer builds a cart in chat; it lands as an order | M | `/growth` | Not started |
| **[K-21](https://github.com/Sudharsan2618/Kadai-Official/issues/21)** | **India Payments — `order_details` + Razorpay deep integration** | We already run Razorpay. Native UPI/cards/netbanking, refunds and payment status via WhatsApp | L | `/payments` | Not started |
| **[K-22](https://github.com/Sudharsan2618/Kadai-Official/issues/22)** | **`order_status` template** | Post-payment updates | S | `/payments` | Not started |
| **[K-23](https://github.com/Sudharsan2618/Kadai-Official/issues/23)** | **Business Compliance API** | Legally required for Indian sellers selling online | S | `/payments` | Not started |
| **[K-24](https://github.com/Sudharsan2618/Kadai-Official/issues/24)** | **Ice breakers + commands** | 4 tappable prompts on first contact. One POST. Enormous perceived polish | S | `/growth` | Not started |
| **[K-25](https://github.com/Sudharsan2618/Kadai-Official/issues/25)** | **QR code / wa.me deep link** | Printable "scan to order" for the shop counter | S | `/growth` | Not started |
| **[K-26](https://github.com/Sudharsan2618/Kadai-Official/issues/26)** | **Business profile management** | About, address, hours, photo, vertical | S | `/growth` | Not started |
| **[K-27](https://github.com/Sudharsan2618/Kadai-Official/issues/27)** | **Campaign scheduler** | Competitors gate this behind their ₹3,200 tier | M | broadcast | Not started |
| **[K-28](https://github.com/Sudharsan2618/Kadai-Official/issues/28)** | **Free Entry Point exploitation** | 72h of free messaging after a CTWA-originated reply. Pure margin | S | `/insights` | Not started |
| **[K-29](https://github.com/Sudharsan2618/Kadai-Official/issues/29)** | **Multi-Partner Solution (credit line + 200/week)** | Removes the "add a card" cliff **and** lifts onboarding from 10 to 200 sellers/week. The Partner Solutions panel is already live in our dashboard; blocked only on a Solution Partner's app ID. Code is small: `partner_solutions` webhook + solution ID in the ES config | **S (code) / L (deal)** | `/connect` | Blocked — needs partner |
| **[K-30](https://github.com/Sudharsan2618/Kadai-Official/issues/30)** | **Tamil UI** | `lib/i18n.ts` scaffold exists. No competitor has it | M | all | Scaffold only |

---

## P2 — Growth and differentiation

| ID | Item | Effort | Mock screen |
|---|---|---|---|
| **[K-31](https://github.com/Sudharsan2618/Kadai-Official/issues/31)** | Click-to-WhatsApp ad creation (Marketing API) | L | `/growth` |
| **[K-32](https://github.com/Sudharsan2618/Kadai-Official/issues/32)** | Welcome message sequences for CTWA | M | `/growth` |
| **[K-33](https://github.com/Sudharsan2618/Kadai-Official/issues/33)** | Conversions API for CTWA (pixel + `whatsapp_business_manage_events`) | M | `/growth` |
| **[K-34](https://github.com/Sudharsan2618/Kadai-Official/issues/34)** | Coupon / limited-time-offer / carousel marketing templates | M | `/templates` |
| **[K-35](https://github.com/Sudharsan2618/Kadai-Official/issues/35)** | Volume-tier tracking and cost forecasting | S | `/insights` |
| **[K-36](https://github.com/Sudharsan2618/Kadai-Official/issues/36)** | Typing indicators + mark-as-read | S | chats |
| **[K-37](https://github.com/Sudharsan2618/Kadai-Official/issues/37)** | Shared team inbox / multi-agent | L | chats |
| **[K-38](https://github.com/Sudharsan2618/Kadai-Official/issues/38)** | Display name + Official Business Account (green tick) assistance | M | `/growth` |
| **[K-39](https://github.com/Sudharsan2618/Kadai-Official/issues/39)** | Block API | S | customers |
| **[K-40](https://github.com/Sudharsan2618/Kadai-Official/issues/40)** | Media carousel + CTA URL messages | M | broadcast |
| **[K-41](https://github.com/Sudharsan2618/Kadai-Official/issues/41)** | Webhook overrides per WABA/number | S | — |
| **[K-42](https://github.com/Sudharsan2618/Kadai-Official/issues/42)** | Audience segments and saved filters | M | broadcast |

---

## P3 — Deliberately deferred

Recorded with reasons so we stop revisiting them.

| ID | Item | Why not now |
|---|---|---|
| **[K-43](https://github.com/Sudharsan2618/Kadai-Official/issues/43)** | WhatsApp Flows (in-chat forms) | Heavy. Interactive lists cover the real need |
| **[K-44](https://github.com/Sudharsan2618/Kadai-Official/issues/44)** | Calling API (voice, SIP, recording, transcription) | Genuinely interesting for low-literacy sellers, but a whole product |
| **[K-45](https://github.com/Sudharsan2618/Kadai-Official/issues/45)** | Groups messaging | New surface, unproven for retail |
| **[K-46](https://github.com/Sudharsan2618/Kadai-Official/issues/46)** | Direct Send API | Still beta. Watch it — it could delete our template management entirely |
| **[K-47](https://github.com/Sudharsan2618/Kadai-Official/issues/47)** | AI chat agent | Competitors charge ₹3,500/mo. Not what a vegetable seller needs yet |
| **[K-48](https://github.com/Sudharsan2618/Kadai-Official/issues/48)** | Local storage / data residency | Enterprise concern |
| **[K-49](https://github.com/Sudharsan2618/Kadai-Official/issues/49)** | Solution Partner upgrade | Lengthy. MPS (K-29) gets the credit line faster |
| **[K-50](https://github.com/Sudharsan2618/Kadai-Official/issues/50)** | Pre-verified numbers, 555 numbers | Nice for demos, not for sellers |

---

## Mock screens shipping in this pass

Five new pages, built on the existing Carbon token system and `Section` layout,
with realistic mock data and an explicit "Preview" marker. They exist to validate
flow with real sellers before we spend backend effort.

| Route | Covers | Nav group |
|---|---|---|
| `/connect` | K-01 … K-06, K-29 — onboarding hub, coexistence choice, sandbox, number registration, payment method, live checklist | Platform |
| `/templates` | K-07, K-08, K-34 — Template Library browser, custom templates, review status, quality, opt-out counters | Platform |
| `/insights` | K-10 … K-12, K-14, K-15, K-28, K-35 — delivery, cost, template performance, account health, limits, volume tier | Platform |
| `/payments` | K-21 … K-23 — payment gateway link, in-chat invoices, payment status, compliance | Platform |
| `/growth` | K-18, K-19, K-24 … K-26, K-31 … K-33, K-38 — catalog on WhatsApp, ice breakers, QR, CTWA, welcome sequences | Platform |

---

## Sequencing

**Now (pre-launch)**
K-13, K-04, K-03, K-07 → then K-01, K-06, K-05 → then K-08, K-09, K-10, K-11, K-12
→ then K-02 (the big one).

In parallel, non-engineering: claim sandbox, accept MM API ToS, create the v4
Facebook Login for Business configuration, and **pursue both routes off the
10-sellers/week cap at once** — start **Access Verification** (needs nobody's
agreement) *and* open the Multi-Partner Solution conversation (also worth 200/week,
and carries the credit line with it). Whichever lands first, take it.

**Next (first releases after launch)**
K-14, K-15, K-16, K-17, K-24, K-25, K-26, K-27 → then commerce: K-18, K-19, K-20
→ then payments: K-21, K-22, K-23 → then K-30 (Tamil).

**After**
P2 in whatever order the first fifty sellers tell us matters.

---

## Open decisions for the owner

These change the work materially and are not mine to make:

1. **Multi-Partner Solution — yes or no?** It removes the biggest funnel cliff we
   have (sellers must attach a card) *and* independently lifts onboarding from 10
   to 200 sellers per week — but it means naming a Solution Partner inside our
   signup flow and agreeing who may send messages. This is the highest-stakes call
   on the page. Note the panel is already available to us; the only missing input
   is a partner willing to accept the request.
2. **Is the ₹1,500 price with pass-through message cost the position?** The
   research says transparency is a genuine, structurally uncopyable edge — but it
   caps revenue at subscription only.
3. **How hard do we commit to coexistence?** If yes, it should be the launch
   headline, not a feature bullet, and K-02 goes to the front of the queue.
