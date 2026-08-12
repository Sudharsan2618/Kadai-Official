# MM API for WhatsApp Setup

## What must be done manually

The Terms of Service acceptance cannot be performed by Kadai or by the Graph API.
It must be completed by a person with full control of the Meta business portfolio.

1. Open [Meta App Dashboard](https://developers.facebook.com/apps) and select the Kadai app.
2. Open **WhatsApp > Quickstart**.
3. Find **Improve ROI with marketing messages with optimizations**.
4. Click **Get started**.
5. Click **Continue to integration guide**.
6. Review and accept the Marketing Messages API for WhatsApp Terms of Service.
7. Return to the Quickstart page and confirm the module is enabled.

For a seller WABA managed through WhatsApp Manager, the equivalent path is **WhatsApp
Manager > Overview > Alerts > Accept terms**. The accepting user must have full
control of the business portfolio.

## Required prerequisites

- The WABA is active and not restricted.
- The WABA is in an eligible country.
- At least one phone number is registered on Cloud API.
- The app has advanced access to `whatsapp_business_messaging`.
- The `messages` webhook is subscribed.
- At least one approved `MARKETING` template exists before sending.

MM API is an additional send path on the same Cloud API phone number. It does not
replace Cloud API: inbound messages and non-marketing sends continue through
`/{PHONE_NUMBER_ID}/messages`.

## Verify the acceptance

After accepting the terms, refresh the seller's status through the authenticated app
endpoint:

```text
GET /wa/mm-status
```

The response should contain:

```json
{
  "status": "ONBOARDED",
  "signed": true,
  "signed_at": "2026-08-08T...",
  "waba_id": "..."
}
```

Meta's direct check is:

```bash
curl "https://graph.facebook.com/v25.0/<WABA_ID>?fields=marketing_messages_onboarding_status" \
  -H "Authorization: Bearer <CUSTOMER_ACCESS_TOKEN>"
```

Depending on the Graph response/version, the status can be a string or an object.
`ELIGIBLE` means the WABA can onboard but has not completed onboarding; `REQUEST_SENT`
means Meta has a pending request; `TERM_OF_SERVICE_SIGNED` or `ONBOARDED` means the
terms/onboarding is complete.

Kadai also records `MM_LITE_TERMS_SIGNED` from the `account_update` webhook. The
webhook subscription must include the `account_update` field and the Meta callback
must be able to reach `/wa/webhook`.

## End-to-end test

1. Create or adopt an approved marketing template.
2. Wait up to 10 minutes after creating/reactivating it for Meta's linked read-only
   ad account to sync.
3. Create a test customer whose number is your own WhatsApp number and ensure the
   customer has opted in to receive marketing messages.
4. Call Kadai's authenticated test endpoint:

```json
POST /wa/mm-test
{
  "customer_id": 123,
  "ready_label": "Daily stock"
}
```

The endpoint refuses to send unless MM terms are signed. It selects the approved
template matching `ready_label`, calls:

```text
POST /v25.0/<PHONE_NUMBER_ID>/marketing_messages
```

and stores the returned message ID. The normal status webhook should then update the
message from `sent` to `delivered`/`read`. Confirm that the status webhook includes:

```json
{
  "conversation": { "origin": { "type": "marketing_lite" } },
  "pricing": { "category": "marketing_lite" }
}
```

Every Kadai broadcast now uses this MM endpoint and never silently falls back to the
Cloud API endpoint. Free text and utility sends continue to use Cloud API.

## Failure handling

| Status | Meaning | Action |
|---|---|---|
| `NOT_STARTED` | Terms flow has not begun | Complete the Quickstart flow |
| `ELIGIBLE` | WABA can onboard | Continue the integration guide |
| `REQUEST_SENT` | Meta is processing the request | Refresh later; do not retry-send |
| `TERM_OF_SERVICE_SIGNED` | Terms accepted | Create/use an approved marketing template |
| `ONBOARDED` | MM API ready | Run the one-recipient test |
| `RESTRICTED` / `DISABLED` | WABA is blocked or ineligible | Resolve the Meta alert before sending |
