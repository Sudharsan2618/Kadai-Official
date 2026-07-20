# Meta Tech Provider Setup — Step-by-Step Guide for Kadai

> What YOU (Sudharsan) must do on Meta's side, in order, to let Kadai onboard real
> sellers and message real customers. Grounded in Meta's official docs
> (scraped 2026-07 → `research/whatsapp-business-api/_scraped/`).
> Dev-effort items marked `[CODE]` are built by Claude; everything else is manual.

---

## The path at a glance

```
Phase A (you, ~1-2 days active work, 1-4 weeks Meta wait)
  A1 Create Meta app  →  A2 Verify business  →  A3 App Review (2 videos + permissions)

Phase B (after approval — mostly [CODE], ~1-2 weeks)
  B1 Embedded Signup config  →  B2 Webhook endpoint  →  B3 per-client onboarding calls

Phase C (per onboarded seller — automated by Kadai)
  token exchange → subscribe webhooks → register number → test message → payment method
```

**Start Phase A immediately — the App Review wait (days to weeks) hides all our dev time.**

---

## Phase A — Become a Tech Provider (manual, do now)

### A1. Create the Meta app + business portfolio
1. Go to https://developers.facebook.com/apps → **Create App**.
2. Choose the **WhatsApp** use case.
3. During creation, connect (or create) your **business portfolio** — this is the
   Meta Business that will get verified. Use your real company identity
   (name, GST/registration, domain email) — verification checks these.
4. After creation, open **App Dashboard → Use cases → Customize (pencil) →
   WhatsApp → Tech Provider onboarding** (left menu). This page is your
   checklist home for everything below.

### A2. Business verification (the gate)
1. On the Tech Provider onboarding page click **Start verification**
   (or Business Manager → Security Centre → Start verification).
2. You will need:
   - Legal business name, address, phone, email, **website** (a live site on your
     own domain — even a one-pager; landing page work can double for this)
   - A way for Meta to confirm your connection (domain email / phone / domain verification)
   - Documents if the business isn't auto-found: certificate of incorporation /
     GST registration / utility bill with matching name+address
3. Wait for the "verified" status. *Business must be verified before App Review.*

> Tip: mismatched name/address between documents and what you typed is the #1
> rejection cause. Copy exactly from the document.

### A3. App Review — request advanced access
You are requesting **Advanced access** to exactly two permissions:
- `whatsapp_business_messaging` — send messages on behalf of clients
- `whatsapp_business_management` — manage clients' WABAs/templates

Steps:
1. **Basic app settings** first (App Dashboard → Settings → Basic):
   app icon (use the Kadai mark), privacy policy URL, app category, business use-case description.
   `[CODE]` we must host a privacy policy page — included in landing-page work.
2. **Two screen-recording videos** (Meta explicitly allows the easy path):
   - Video 1 — *sending a message*: screen-record the **API Setup cURL** from the
     app dashboard sending a text to your own number added as a test recipient,
     and the message arriving in the WhatsApp app.
   - Video 2 — *creating a template*: screen-record **WhatsApp Manager** while you
     create a message template.
   Keep each under ~2-3 minutes, show the whole screen, no cuts.
3. Click **Begin App Review**, attach the two videos, write a short usage
   description ("Kadai lets small Indian sellers send order updates and stock
   broadcasts to their opted-in customers over WhatsApp; we onboard sellers via
   Embedded Signup as a Tech Provider").
4. Submit and wait (typically a few days to ~2 weeks; re-submit quickly if
   rejected — rejections come with reasons).

**Decision point (default: skip):** Meta also offers "Onboard with a Solution
Partner" (enter a partner's app ID). We onboard **without** a partner — full
independence, no revenue share.

---

## Phase B — Wire up the platform (after approval)

### B1. Configure Embedded Signup  `[CODE + small manual]`
- Manual: App Dashboard → WhatsApp → Embedded Signup → configure the flow,
  add your domain(s) to allowed domains, note the **Configuration ID**.
- `[CODE]`: replace the mock "Connect WhatsApp" button with Meta's JS SDK
  launch of Embedded Signup; capture the returned `code` + WABA ID + phone
  number ID via the message-event listener.

### B2. Webhooks  `[CODE + small manual]`
- `[CODE]`: public HTTPS endpoint `GET/POST /wa/webhook` (verify token echo +
  signature validation + event processing). We already built this pattern in
  the CRM backend — port it.
- Manual: App Dashboard → WhatsApp → Configuration → set Callback URL +
  Verify Token; subscribe to `messages` field.

### B3. App secrets into Kadai  `[CODE]`
- Store `APP_ID`, `APP_SECRET`, config ID in backend env; never client-side.

---

## Phase C — Per-seller onboarding (Kadai automates all 5 steps)  `[CODE]`

When a seller finishes Embedded Signup, Kadai's backend must run, server-to-server:

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /oauth/access_token?client_id&client_secret&code` | Exchange ES `code` → the seller's **business token** (store encrypted, per shop) |
| 2 | `POST /<WABA_ID>/subscribed_apps` (Bearer business token) | Subscribe our app to the seller's WABA webhooks |
| 3 | `POST /<PHONE_NUMBER_ID>/register` `{messaging_product, pin}` | Register the number on Cloud API (set + store the 6-digit 2FA pin) |
| 4 | (optional) send a test message to the seller's own phone | Prove the pipe works — maps to our onboarding "Send me a test message" step |
| 5 | Seller adds a **payment method** to their WhatsApp account | Required before real billing-grade sending; Kadai shows a guided prompt. (Later: shared credit line so WE carry billing — see `solution-providers/share-and-revoke-credit-lines`) |

Failure handling: every step is retryable; store per-shop onboarding state
(`code_exchanged` → `webhooks_subscribed` → `number_registered` → `live`).

---

## What to have ready before you start (checklist)

- [ ] Company legal name + registration/GST document (exact match)
- [ ] Live website on your own domain + `/privacy` page
- [ ] Domain email address (for verification contact)
- [ ] Kadai app icon (512px, the chosen mark)
- [ ] A test phone with WhatsApp for the videos
- [ ] Screen recorder (Windows: Win+G Game Bar is enough)

## Sources
- `_scraped/solution-providers_get-started-for-tech-providers.md`
- `_scraped/embedded-signup_onboarding-customers-as-a-tech-provider.md`
- `_scraped/embedded-signup_implementation.md`
- `_scraped/webhooks_overview.md`
- `_scraped/business-phone-numbers_registration.md`
