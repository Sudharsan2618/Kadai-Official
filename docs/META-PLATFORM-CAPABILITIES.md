# Meta WhatsApp Business Platform — Full Capability Map for Kadai

> **What this is.** A complete inventory of everything Meta's WhatsApp Business
> Platform exposes to us **now that we are an approved Tech Provider**, scored for
> relevance to Kadai, effort, and blocking dependencies.
>
> **Sources.** Meta's own documentation, scraped 2026-08-06 into
> `.firecrawl/md/` (285 pages of `developers.facebook.com/documentation/business-messaging/whatsapp/*`).
> Meta serves a clean markdown twin of every doc page at `<url>.md` — that is the
> cheapest way to re-pull this later.
>
> **Companion docs.** `PRODUCT-SCOPE-2026.md` (what we build, in what order) and
> `COMPETITIVE-LANDSCAPE.md` (what the market already ships).

---

## 0. Where we actually stand

We are a **Tech Provider**, not a Solution Partner. That single fact determines
a lot, and it is worth being blunt about what it costs us:

| | Solution Partner | **Tech Provider (us)** | Tech Partner |
|---|---|---|---|
| Full platform services to clients | Yes | **Yes** | Yes |
| Has a Meta credit line | Yes | **No** | No |
| Clients skip adding a payment method | Yes | **No — seller must add a card** | No |
| Bills clients directly for API usage | Yes | **No — Meta bills the seller** | No |
| Is a Meta Business Partner | Yes | **No** | Yes |
| SMB Accelerator program | Yes | **No** | Yes |
| Direct Support access | Yes | **Yes** | Yes |
| Partner-led Business Verification | Yes (Select/Premier) | **No** | No |

**The one that hurts:** every Tamil Nadu seller we onboard has to attach their
own credit/debit card to their WhatsApp Business account before they can send a
single billable template. For a fruit-shop owner in Coimbatore, that is a real
drop-off cliff, and it is the single biggest structural disadvantage we carry
against AiSensy and Interakt (who are Solution Partners / partnered with one and
therefore absorb billing).

**Two exits from that trap**, both documented and both real:
1. **Multi-Partner Solutions (MPS)** — pair with an existing Solution Partner who
   shares *their* credit line with sellers onboarded through our joint solution.
   We keep the product and the customer; they carry the billing rail.
2. **Upgrade to Tech Partner → apply for Meta Business Partner** — unlocks the
   SMB Accelerator, but still no credit line. Prestige, not plumbing.

MPS is the one that actually changes seller conversion. It should be a business
priority, not an engineering one.

> **Do not misread the dashboard.** The **App Dashboard → WhatsApp → Partner
> Solutions** panel is visible to us and offers a "Create a partner solution"
> button. That panel is open to Tech Providers by design — Meta's stated
> requirement is *"an approved Solution Partner, **a Tech Provider who has
> completed the steps in Get Started for Tech Providers**, or a Tech Partner."*
> Seeing that page confirms we are an eligible **Tech Provider**; it is **not**
> evidence of Solution Partner status. The credit line still comes from the
> Solution Partner on the other side of the solution: *"Clients onboarded via
> Embedded Signup configured with a solution ID share the credit line of the
> Solution Partner associated with the solution."* An MPS between two Tech
> Providers shares assets but **no credit line**.

### Onboarding throughput ceiling

| Stage | New sellers per rolling 7 days |
|---|---|
| Default (today) | **10** |
| After Business Verification + App Review + **Access Verification** | **200** |
| **As a Tech Provider inside an active Multi-Partner Solution** | **200** |
| Beyond that | Must become a Meta Business Partner |

We have App Review. There are **two independent routes off the 10/week cap**, and
we should pursue whichever lands first:

- **Access Verification** — entirely in our control, no counterparty needed.
- **Joining an MPS** — Meta states plainly that *"Tech Providers who are part of a
  solution can onboard up to 200 total new clients in a rolling one week period."*
  This lift comes as a side effect of the credit-line partnership we want anyway.

Current count is visible in WhatsApp Manager → Partner overview.

### What creating an MPS actually takes

Both partners must agree; either side can initiate. Concretely:

1. Agree a solution name and **get the partner's app ID** (the creation dialog
   requires it — this is why the panel shows an empty state today).
2. Decide who hosts Embedded Signup — either or both partners can.
3. Choose which partner's app may send messages (**Only me** / **Only my partner**).
4. Subscribe to the **`account_update`** and **`partner_solutions`** webhook fields.
5. The invited partner accepts; the solution goes `Draft → Pending → Active`.
   Other states: `Inactive` (declined), `Deactivated`, `Pending deactivation`.
   Onboarding through a non-`Active` solution shows the seller an error.
6. Contracts, SLAs and revenue split are left entirely to the two partners.

Our app already satisfies the technical prerequisites (App Review approved for
`whatsapp_business_management` + `whatsapp_business_messaging`). The only missing
input is **a Solution Partner willing to be named** — a business development task,
not an engineering one.

### Version debt we already carry

- `backend/config.py` pins `WA_API_VERSION = v21.0`. Meta's current docs are on
  **v25.0**. Not urgent, but stale.
- **Embedded Signup v2 is deprecated on 15 October 2026.** We must be on **v4**
  before then. v4 is not a code change so much as a *configuration* change:
  you create a new Facebook Login for Business configuration, select your
  products, and the config ID switches you to v4 automatically.

---

## 1. Onboarding & account plumbing

This is the layer that decides whether a seller ever sends a message at all.

| # | Capability | What it gives us | Ease | Kadai priority |
|---|---|---|---|---|
| 1.1 | **Embedded Signup v4** | One-page asset selection + permissions; onboards Cloud API, MM API, CTWA, Conversions API in a *single* flow | Medium — new FB Login for Business config, then config ID swap | **P0** (v2 dies Oct 2026) |
| 1.2 | **Coexistence** (`onboarding-business-app-users`) | Seller keeps their existing WhatsApp Business app + number, and gets API on top. 6 months of chat history and all contacts sync into our app | Medium-high — 3 extra webhooks, 24h sync deadline | **P0 — this is our wedge** |
| 1.3 | **Hosted Embedded Signup** | Zero-integration onboarding: Meta hosts the page, we just link to it | **Very easy** — copy a URL from the dashboard | **P0** (fallback + sales demos) |
| 1.4 | **Sandbox accounts** | Simulate a full seller onboarding without polluting real assets | Easy — click "Claim sandbox account" | **P0** (dev/QA) |
| 1.5 | **Pre-filled data injection** | Pass what we already know (shop name, phone, address) into ES to cut screens | Easy | P1 |
| 1.6 | **555 test numbers** | Two free +1-555 numbers per seller, auto-verified, for demos | Easy | P2 |
| 1.7 | **Pre-verified numbers** | We supply the number instead of the seller | Medium | P3 |
| 1.8 | **Embedded Signup Builder** | Dashboard tool that generates our implementation code and onboarding queries | Free tooling | Use now |
| 1.9 | **Webhook overrides** | Per-WABA or per-number callback URLs instead of one global | Easy | P2 (multi-region later) |
| 1.10 | **Automatic Events API** | Notifies us of key CTWA events | Medium | P2 |
| 1.11 | **Multi-Partner Solutions** | Share a Solution Partner's credit line with our sellers, **and lift onboarding to 200/week**. Panel is live in our dashboard; needs a partner's app ID | Business deal + small code (`partner_solutions` webhook, solution ID in the ES config) | **P1 (business-critical)** |
| 1.12 | Partner-led Business Verification | Verify sellers on their behalf, fast | — | **Not available to us** |
| 1.13 | Credit line sharing | Seller skips payment method | — | **Not available to us** |

### The 5 server-to-server calls per seller (already built in `wa_cloud.py`)

```
1. GET  /oauth/access_token?client_id&client_secret&code   → business token
2. POST /<WABA_ID>/subscribed_apps                         → webhook subscription
3. POST /<PHONE_NUMBER_ID>/register {messaging_product,pin} → Cloud API registration
4. (optional) POST /<PHONE_NUMBER_ID>/messages             → test message
5. Seller adds payment method in WhatsApp Manager           → we can only prompt
```

**Sandbox caveat worth knowing before you plan QA:** a sandbox account returns a
real WABA ID, phone number ID and exchangeable code — so the whole onboarding
handshake is testable — but **the sandbox number cannot send or receive
messages**, and the account expires after 30 days. Message-path testing still
needs a real test number.

### Coexistence — why it is the wedge, in detail

Our target seller *already runs* the WhatsApp Business app. Today they blast
"today's stock" through **Broadcast Lists**. Coexistence onboarding does this:

- Their existing number and app keep working for 1:1 chats.
- Up to 6 months of chat history and **all contacts** sync into our app.
- Messages mirror both ways (`smb_message_echoes`).
- **Broadcast lists are disabled and become read-only.**

That last line is the whole business case. Meta removes their broadcast tool at
exactly the moment we arrive with a better one. We do not have to sell them on
"WhatsApp marketing" — we have to replace something Meta just took away.

Constraints to design around:
- Fixed throughput of **20 messages/second** while coexisting.
- We have **24 hours** after onboarding to pull history, or the seller must be
  offboarded and redo the flow.
- Requires three extra webhook subscriptions: `history`, `smb_app_state_sync`,
  `smb_message_echoes`.
- Group chats, disappearing messages, view-once and live location are not synced.

---

## 2. Messaging surface

| # | Capability | Notes | Ease | Priority |
|---|---|---|---|---|
| 2.1 | Text / image / video / document / audio / sticker | Free inside the 24h customer service window | Done (mock) / easy | **P0** |
| 2.2 | **Templates** (marketing / utility / authentication) | The only way to message outside the window | Built | **P0** |
| 2.3 | **Template Library** | Pre-written, **pre-categorised** utility templates — order updates, payment reminders, delivery. Adopt as-is and **skip the review wait** | **Very easy, very high leverage** | **P0** |
| 2.4 | Interactive reply buttons (≤3) | Tap instead of type — decisive for our end customers | Easy | **P1** |
| 2.5 | Interactive list messages (≤10) | "Choose today's vegetables" | Easy | **P1** |
| 2.6 | Interactive CTA URL | Trackable link button | Easy | P1 |
| 2.7 | Media carousel / product carousel | Multi-item promos | Medium | P2 |
| 2.8 | Location request messages | "Send me your delivery address" | Easy | **P1** (delivery!) |
| 2.9 | Typing indicators + mark as read | Makes a bot feel human | Very easy | P2 |
| 2.10 | Reactions, contextual replies | Chat polish | Easy | P2 |
| 2.11 | **MM API for WhatsApp** (`/marketing_messages`) | See §3 | Medium | **P1** |
| 2.12 | **Direct Send API** (beta) | Send utility/auth with a `category` field, **no template management** — Meta auto-generates templates behind the scenes | Easy once in beta | P2 (watch) |
| 2.13 | Message TTL | Expire time-sensitive sends | Easy | P2 |
| 2.14 | Groups messaging | New surface; group_analytics exists | Medium | P3 |
| 2.15 | Calling API | Business/user-initiated voice, SIP, recording, transcription | High | P3 |

### Pricing model — the thing that must shape every feature decision

Effective **1 July 2025**, Meta charges **per message**, not per conversation:

- **Only delivered template messages are charged.**
- **All non-template messages are free** (inside an open 24h window).
- **Utility templates inside an open window are free.**
- Rates vary by template category × recipient country.
- **Free Entry Point windows: 72 hours of completely free messaging** when the
  customer arrives via a Click-to-WhatsApp ad and we reply within 24h.
- Volume tiers lower utility/auth rates, aggregated at business-portfolio level,
  reset monthly. `account_update` webhook fires `VOLUME_BASED_PRICING_TIER_UPDATE`.
- **India-specific:** billing localisation launched 1 Jan 2026. All WABAs must be
  migrated to **INR by 31 December 2026** or Meta stops delivering their messages
  from 1 Jan 2027. WABA Currency Migration APIs are available from 1 June 2026.
  Also: India marketing rates went **up** on 1 Jan 2026.

**Product consequence.** The cheapest good product is one that keeps
conversations *inside* the 24-hour window and routes as much as possible through
utility rather than marketing. Kadai's "reply to a customer" path is already free.
Our exposure is entirely the daily-stock broadcast — that is marketing, that is
charged, and that is exactly where MM API's optimisation and max-price belong.

### Per-user marketing limits — the silent broadcast killer

WhatsApp caps how many marketing templates a *user* receives, adaptively, based
on their recent read rate and inbox load. Exceeding it returns **error 131049**
and the message is simply not delivered.

- Retrying inside 24h makes it worse and can lock further attempts for 24h.
- Marketing messages sent inside an open 24h window **do not count**.
- Not active in EEA/UK/Japan/South Korea. **Active in India.**

This means a naive "blast everyone every morning" broadcast will quietly degrade.
Our broadcast engine must respect per-user cooldowns and prefer in-window sends.

---

## 3. Marketing Messages API for WhatsApp (MM API / "MM Lite")

This is the "Improve ROI with marketing messages with optimizations" card on your
dashboard. It is a **separate endpoint** (`/<PHONE_NUMBER_ID>/marketing_messages`)
with the same schema and billing model as Cloud API, so migrating a send path is
cheap.

**What Cloud API cannot do that MM API can:**

| Feature | MM API | Cloud API |
|---|---|---|
| Quality-based delivery optimisation | **Yes — up to 9% more delivered** | No |
| Automated creative optimisation (image/text) | Yes (pilot) | No |
| Animated GIF headers | **Yes** | No |
| Android app deep links | Yes | No |
| Custom TTL for marketing (12h–30d) | **Yes** | Utility/auth only |
| Benchmarks vs similar businesses | **Yes** | No |
| Data-derived recommendations | **Yes** | No |
| Web + app conversion metrics (add-to-cart, purchase) | **Yes** | No |
| Max-price per delivery | **Yes (2026)** | No |
| Onboarding via Intent API / Intent UI | Yes | ES only |

Meta's own A/B test that produced the 9% number was run **on Indian advertisers**,
12M messages, Jan 2025. That is our exact market.

**Status webhooks** carry `conversation.origin.type = marketing_lite` and
`pricing.category = marketing_lite`, so we can attribute cost cleanly.

**Verdict:** every Kadai broadcast should go through MM API, not Cloud API.
The only reason it is P1 and not P0 is that it needs an approved marketing
template and a ToS acceptance first.

---

## 4. Commerce & payments (India)

This is the richest untapped seam for a product literally named "shop".

| # | Capability | Notes | Priority |
|---|---|---|---|
| 4.1 | **Catalogs** | Upload inventory via Commerce API or Commerce Manager, attach to WABA | **P1** |
| 4.2 | Single-product messages | One item with image, price, description | **P1** |
| 4.3 | Multi-product messages | Up to 30 items in sections — *this is "today's stock" done properly* | **P1** |
| 4.4 | Catalog messages | Thumbnail of the whole catalog | P1 |
| 4.5 | Product card carousel | Scrollable cards | P2 |
| 4.6 | **Shopping cart + order webhook** | Customer builds a cart in chat and sends it; arrives as a webhook `order` | **P1** |
| 4.7 | Commerce settings API | Toggle cart on/off, catalog visibility | P1 |
| 4.8 | **Business Compliance API** | India online-selling law compliance details per number — **legally required for Indian sellers** | **P1** |
| 4.9 | **Payments India — `order_details` message** | In-chat invoice | **P1** |
| 4.10 | **PG Deep Integration** — Razorpay, PayU, Billdesk, Zaakpay | Native "other payment methods", refunds from WhatsApp APIs, payment status via WhatsApp webhooks | **P1 — we already run Razorpay** |
| 4.11 | UPI Intent mode | Any UPI-capable gateway; no native cards/netbanking, no refunds via WhatsApp | Alternative |
| 4.12 | `order_status` template | Post-payment status updates | P1 |
| 4.13 | Payment links / enhanced payment links | Simpler than full integration | P2 |
| 4.14 | `payment_configuration_update` webhook | PG config changes | P1 |

**The strategic point.** Kadai already has Catalog, Orders and Razorpay. Meta's
commerce stack maps onto our existing data model almost one-to-one:

```
Kadai Product  → Meta catalog item
Kadai Order    → cart order webhook  +  order_details message
Kadai payment  → Razorpay PG deep integration (refunds + status via WhatsApp)
```

Cart limits worth knowing: one cart per chat thread per device, no expiry until
sent, up to 99 units per item, unlimited distinct items, **no edits after send**,
and businesses cannot send carts to customers.

---

## 5. Growth & acquisition

| # | Capability | Notes | Priority |
|---|---|---|---|
| 5.1 | **Click-to-WhatsApp ads (CTWA)** | Via Marketing API; needs `ads_management`, `pages_*` | P2 |
| 5.2 | **Welcome message sequences** | Text + prefilled message + FAQs attached to a CTWA ad, managed via `/welcome_message_sequences` | P2 |
| 5.3 | **Conversions API for CTWA** | Needs `whatsapp_business_manage_events` + Pixel; feeds ad optimisation | P2 |
| 5.4 | Partner pixel tracking | Attribution across our onboarded sellers | P2 |
| 5.5 | **Free Entry Point window** | 72h of free messaging after a CTWA-originated reply | **P1 — pure margin** |
| 5.6 | **QR codes / wa.me deep links** | "Scan to order" sticker for the shop counter | **P1 — very cheap, very Indian-retail** |
| 5.7 | **Ice breakers** (≤4, 80 chars) | Tappable prompts on first contact | **P1** |
| 5.8 | **Commands** (≤30, `/name`) | Slash commands in chat | P2 |
| 5.9 | Business profile API | About, address, website, vertical, photo | **P1** |
| 5.10 | Display name approval / Official Business Account | The green tick sellers ask for by name | P2 |
| 5.11 | Coupon / limited-time-offer / location templates | Promo formats | P2 |

Ice breakers and QR codes are the highest ratio of "seller visibly delighted" to
"engineering hours" on this entire page.

---

## 6. Measurement

All analytics come off the WABA node as fields with dot-filters:

| Field | Gives us | Priority |
|---|---|---|
| `analytics` | Messages sent/delivered, by phone number, country, product type | **P1** |
| `conversation_analytics` | Conversation counts + cost, breakdown by category/direction/type/country | P1 |
| `pricing_analytics` | Per-message cost + **volume tier progress** | **P1** |
| `template_analytics` | Sent, delivered, read, **clicked** (per button), cost per delivered, cost per click | **P1** |
| `template_group_analytics` | Cross-language template rollups | P2 |
| `call_analytics`, `group_analytics` | Calling / groups | P3 |

Gotchas that will bite if we do not design for them:
- **Must call `POST /<WABA_ID>?is_enabled_for_insights=true` once** before template
  analytics work at all — and it is **irreversible**.
- Read and click data only exists for **7 days** after send, then resets to zero.
  Anything we want to show long-term, we must snapshot ourselves.
- Template analytics lookback is 90 days; messaging/conversation/pricing dropped
  from 10 years to **1 year** on 1 Dec 2025.
- Button-click analytics only for MARKETING and UTILITY templates.
- MM API conversion metrics (`WEBSITE_PURCHASES`, `APP_ADD_TO_CART`, …) are
  MM-API-only.

---

## 7. Trust, compliance and account health

| # | Capability | Why it matters to us | Priority |
|---|---|---|---|
| 7.1 | **`user_preferences` webhook** | Fires when a user **stops or resumes** marketing messages. Values `stop` / `resume` | **P0 — legal + quality** |
| 7.2 | Opt-in management | Meta requires demonstrable opt-in | **P0** |
| 7.3 | **Messaging limits** | 250 → 2,000 → 10,000 → 100,000 → unlimited. Set at **business-portfolio** level | **P0 to surface** |
| 7.4 | `phone_number_quality_update` webhook | Green/yellow/red quality rating | **P0** |
| 7.5 | Template quality / pacing / pausing | Bad templates get throttled then paused | P1 |
| 7.6 | `account_alerts`, `account_review_update` | Meta telling us something is wrong | **P0** |
| 7.7 | `business_capability_update` | Limit changes | P1 |
| 7.8 | Throughput levels + auto-upgrade | 20 mps when coexisting; higher otherwise | P1 |
| 7.9 | Block API | Block abusive numbers | P2 |
| 7.10 | Two-step verification PIN | Already implemented | Done |
| 7.11 | Local storage / no-storage | Data residency | P3 |
| 7.12 | Business Verification | Gates limits and OBA status | **P0 (per seller)** |

**Messaging limits deserve a callout.** A brand-new seller starts at **250 unique
recipients per rolling 24 hours**. A vegetable shop with 400 regulars will hit
that on day one and blame us. We must (a) show the limit prominently, (b) queue
and pace across the window rather than fail, and (c) actively drive the seller
down a scaling path — business verification is the fastest.

---

## 8. What "ease of use" actually looks like, ranked

Ordered by value delivered per engineering hour. This is the ordering I would
actually build in.

**Tier A — days, high impact**
1. Template Library adoption (skip template review entirely for utility)
2. Hosted Embedded Signup (a URL, not a JS integration)
3. Ice breakers + commands (one POST to `conversational_automation`)
4. QR code / wa.me deep link generation
5. Business profile management
6. Sandbox account for internal QA
7. Surfacing messaging limit + quality rating (one GET, huge trust win)

**Tier B — 1–2 weeks each, high impact**
8. Embedded Signup v4 migration (config-driven)
9. MM API send path for broadcasts
10. Template analytics + pricing analytics dashboard
11. Interactive buttons / lists / location request
12. `user_preferences` opt-out plumbing
13. Catalog sync + multi-product messages

**Tier C — multi-week, high impact but heavy**
14. **Coexistence onboarding** (worth every hour — it is the wedge)
15. India Payments with Razorpay deep integration
16. Cart order webhook → Kadai Order
17. CTWA + Conversions API + welcome sequences

**Tier D — later**
18. Calling API, Groups, Flows, Direct Send beta

**Not on this ladder: the MPS credit line.** The engineering is small — subscribe
to `partner_solutions`, put the solution ID in the Embedded Signup config. It sits
outside this ranking because it is gated on a business agreement, not on our
capacity to build it.

---

## 9. Immediate non-code actions (owner, not engineering)

1. **Claim a sandbox account** — App Dashboard → WhatsApp → Quickstart → Testing
   Integrations. Do this today; it unblocks QA.
2. **Accept MM API Terms of Service** — Quickstart → "Improve ROI with marketing
   messages with optimizations" → Get started → Continue to integration guide.
3. **Grab the Hosted ES URL** — Quickstart → View onboarding → Zero integration
   onboarding card → Copy.
4. **Create a Facebook Login for Business configuration selecting Cloud API +
   MM API for WhatsApp** → this issues the v4 config ID.
5. **Start Access Verification** — one of two routes from 10 to 200 sellers per
   week, and the one that needs nobody else's agreement.
6. **Open a conversation with a Solution Partner about a Multi-Partner Solution**
   — this does double duty: their credit line removes the "add a card" cliff, and
   being in an active solution *also* lifts us to 200 sellers per week. Go in
   knowing you need their **app ID**, and that you must agree who hosts Embedded
   Signup and whose app is allowed to send. Contracts and revenue split are
   entirely between the two of you; Meta does not arbitrate.
7. **Plan the INR WABA migration** before 31 Dec 2026.

---

## Appendix — local research cache

```
.firecrawl/md/          285 Meta doc pages (markdown twins)
.firecrawl/clean/       firecrawl scrapes with nav/footer stripped
.firecrawl/comp/        competitor pricing + feature pages
.firecrawl/nav-urls.txt full 360-URL doc index
.firecrawl/fetchmd.sh   re-pull script (Meta rate-limits ~285 pages/hour per IP)
```

`.firecrawl/` is gitignored. To refresh, run `bash .firecrawl/fetchmd.sh`; if
Meta returns 429, route through Firecrawl instead (`.firecrawl/gaps.sh` shows the
pattern).
