# Embedded Signup v4 Implementation Checklist

## Meta configuration

- [ ] Confirm the app ID is `2854903808192123`.
- [ ] Confirm configuration ID is `2101636474114169`.
- [ ] Confirm the configuration was created as **WhatsApp Embedded Signup**.
- [ ] Select only the products Kadai needs: WhatsApp Cloud API and Marketing Messages API.
- [ ] Add the local and production HTTPS domains to Facebook Login for Business allowed domains.
- [ ] Add the same URLs to valid OAuth redirect URIs.
- [ ] Enable Client OAuth Login, Web OAuth Login, Enforce HTTPS, Embedded Browser OAuth Login,
      Strict Mode, and Login with the JavaScript SDK.
- [ ] Subscribe the app to `messages` and `account_update` webhook fields.
- [ ] Keep the configuration ID in backend `.env` as `META_ES_CONFIG_ID`; never hardcode it in React.

## Kadai implementation

- [x] Load the Facebook JavaScript SDK from `connect.facebook.net`.
- [x] Initialize the SDK with `META_APP_ID` and Graph API `v25.0`.
- [x] Launch `FB.login` with `response_type=code` and the v4 configuration ID.
- [x] Listen for the `WA_EMBEDDED_SIGNUP` `message` event.
- [x] Capture `waba_id`, `phone_number_id`, and the authorization code.
- [x] Handle Meta cancellation and reported error events without sending partial data.
- [x] Send the short-lived code to the backend immediately.
- [x] Exchange the code server-side using the app secret.
- [x] Validate the WABA and phone number returned by the browser event against Graph API data.
- [x] Subscribe the customer WABA to the app webhooks.
- [x] Register the customer phone number on Cloud API.
- [x] Encrypt and persist the customer-scoped token.
- [x] Process the `MM_LITE_TERMS_SIGNED` account update event.

**THE ES CONFIG ID** — where to get it (you asked):
1. Meta App Dashboard → **Facebook Login for Business** → **Configurations**.
2. Click **Create from template** → choose **"WhatsApp Embedded Signup Configuration With 60 Expiration Token"** (or create custom and pick the *WhatsApp Embedded Signup* login variation, then select the products: Cloud API + Marketing Messages API; add *WhatsApp Business app user onboarding* to enable the coexistence path).
3. After saving, the config shows a **Configuration ID** — a long numeric string. Copy it.
4. Put it in `backend/.env` as `META_ES_CONFIG_ID=...` (currently **empty** — that is why `/connect` and `/settings` throw "Meta Embedded Signup is not configured").
5. Also confirm **Facebook Login for Business** → **Client OAuth settings** has: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Strict Mode, Login with the JS SDK — all **Yes**, and your dev/prod HTTPS domains are in *Valid OAuth redirect URIs* + *Allowed domains*.
6. The existing app id `2854903808192123` and secret are already in `.env`.

> The `WHATSAPP_*` vars you pasted are a *personal* access token for a *fresh* Cloud-API number (`+91 93822 66724`, `is_on_biz_app: False`, MM API `ONBOARDED`). They are enough to test ES v4 onboarding of NEW numbers and MM API sends. They are **not** a sandbox, and **not** a Business-app (coexistence) number — so coexistence (K-02) can be *built and code-verified* but must be *live-tested* with a seller who actually runs the WhatsApp Business app.

## Per-customer acceptance and verification


- [ ] Customer completes the v4 flow using their own Meta Business credentials.
- [ ] Customer accepts Cloud API, WhatsApp Business, Meta Business Tool, and MM API terms.
- [ ] Customer adds a payment method if Kadai is not inside a Solution Partner solution.
- [ ] Confirm `GET /wa/mm-status` returns `TERM_OF_SERVICE_SIGNED` or `ONBOARDED`.
- [ ] Create or adopt one approved marketing template.
- [ ] Send one test message through `POST /wa/mm-test`.
- [ ] Confirm the status webhook reports `conversation.origin.type=marketing_lite`.
- [ ] Confirm delivery/read status reaches Kadai and updates the stored message.

## Sandbox integration test plan

The claimed sandbox is a disposable Meta test fixture. It is useful for validating
Kadai's Embedded Signup handshake, token exchange, webhook subscription, template
send payload, and MM API status handling without touching a real seller's WABA.
It is not proof that production billing, production template approval, customer
opt-in, or real seller onboarding works. Meta will delete this sandbox after its
expiry date.

### Sandbox facts

- Sandbox Business portfolio BMID: `1828952825145425`
- Sandbox features: Cloud API and Marketing Messages API
- Pre-approved template: `mm_lite_sandbox` in English
- Test recipients: up to five phone numbers added in Meta's sandbox screen
- Sandbox account and phone IDs must be captured from the completed Embedded Signup
  event or Meta's API setup screen; do not guess them from the BMID.

### Test S-01: Complete v4 signup with the sandbox

- [ ] Add your own WhatsApp number as a sandbox recipient.
- [ ] Open Kadai `/settings` or `/onboarding`.
- [ ] Launch Embedded Signup.
- [ ] Select **Sandbox Business** for the business portfolio.
- [ ] Select **Sandbox WhatsApp Business Account** for the WABA.
- [ ] Finish the flow.
- [ ] Confirm the browser receives `WA_EMBEDDED_SIGNUP` with `event=FINISH`.
- [ ] Confirm the event includes `waba_id` and `phone_number_id`.
- [ ] Confirm Kadai sends the authorization `code` immediately to `/onboarding/connect`.

Expected result: Kadai stores the sandbox WABA ID, phone number ID, encrypted
customer token, and connected state. The raw authorization code must not be logged
or stored because it expires quickly.

### Test S-02: Verify server-side onboarding

- [ ] Confirm `GET /wa/config` returns `connected: true` and the sandbox IDs.
- [ ] Confirm the WABA webhook subscription succeeds.
- [ ] Confirm phone registration succeeds or returns Meta's already-registered result.
- [ ] Confirm `GET /wa/mm-status` returns an eligible/onboarded sandbox status.
- [ ] Confirm `MM_LITE_TERMS_SIGNED` is accepted if Meta emits it for the sandbox.

Expected result: the Kadai state is recoverable after a page reload and no token is
shown in the browser response or frontend state.

### Test S-03: Send the pre-approved MM API message

- [ ] Add a Kadai customer using one of the sandbox recipient phone numbers.
- [ ] Use the `mm_lite_sandbox` approved template.
- [ ] Call the authenticated Kadai test endpoint:

```json
POST /wa/mm-test
{
  "customer_id": 123,
  "ready_label": "mm_lite_sandbox"
}
```

- [ ] Confirm Kadai calls `/<PHONE_NUMBER_ID>/marketing_messages`.
- [ ] Confirm the response contains a Meta message ID (`wamid`).
- [ ] Confirm the recipient receives the free sandbox test message.

If testing directly with Meta's generated cURL, replace the placeholder token and
use the sandbox phone number ID, not the BMID:

```bash
curl -X POST "https://graph.facebook.com/v25.0/<PHONE_NUMBER_ID>/marketing_messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <sandbox-access-token>" \
  -d '{
    "messaging_product": "whatsapp",
    "recipient_type": "individual",
    "to": "<sandbox-recipient-e164-without-plus>",
    "type": "template",
    "template": {
      "name": "mm_lite_sandbox",
      "language": { "code": "en" }
    }
  }'
```

For repeatable checks, use the dependency-free local smoke test:

```bash
python scripts/test_mm_api.py --waba-id <WABA_ID> --phone-number-id <PHONE_NUMBER_ID>
python scripts/test_mm_api.py --waba-id <WABA_ID> --phone-number-id <PHONE_NUMBER_ID> --send
```

The script prompts securely for `META_ACCESS_TOKEN` when it is not set. It never
prints the token. Optional environment variables are `WABA_ID`, `PHONE_NUMBER_ID`,
`RECIPIENT_PHONE`, and `MM_TEMPLATE_NAME`.

### Test S-04: Verify webhooks and idempotency

- [ ] Confirm the message status webhook is received and keyed by `wamid`.
- [ ] Confirm the status payload identifies `marketing_lite` when provided.
- [ ] Confirm duplicate webhook delivery does not create duplicate messages.
- [ ] Confirm status progression never moves backwards from `read` to `sent`.
- [ ] Confirm a malformed or unknown sandbox event is acknowledged without breaking
      later events.

### Test S-05: Verify failure gates

- [ ] Call `/wa/mm-test` before MM status is signed; expect HTTP `409`.
- [ ] Use a non-approved template; expect a clear blocked error and no Graph send.
- [ ] Use a customer outside the sandbox recipient list; expect Meta rejection and a
      failed Kadai message, not a false success.
- [ ] Expire/revoke the sandbox token; expect reconnect guidance rather than retries.

### Exit criteria before real customer onboarding

- [ ] S-01 through S-05 pass.
- [ ] Production HTTPS callback and webhook verification are tested separately.
- [ ] A real approved marketing template exists for the production WABA.
- [ ] A real seller accepts all required terms during Embedded Signup.
- [ ] The first production test uses one opted-in recipient only.
- [ ] Sandbox credentials and IDs are not reused as production configuration.

## Required environment

```env
WA_MODE=cloud
WA_API_VERSION=v25.0
META_APP_ID=2854903808192123
META_APP_SECRET=<server-only-app-secret>
META_ES_CONFIG_ID=2101636474114169
WA_VERIFY_TOKEN=<new-random-webhook-token>
WA_TOKEN_ENC_KEY=<fernet-key>
```

The Embedded Signup authorization code expires quickly. The browser must post it to
`/onboarding/connect` immediately; never log or persist the raw code.
