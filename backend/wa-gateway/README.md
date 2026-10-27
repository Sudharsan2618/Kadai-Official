# Kadai WhatsApp gateway

A small Node service that puts the Kadai backend on WhatsApp using
[Baileys](https://baileys.wiki) (WhatsApp Web over websocket — no browser, no
Meta Cloud API, no templates, no billing). It owns one WhatsApp socket per shop,
drives QR / pairing-code linking, and calls back into the Kadai API with inbound
messages and link-status changes.

It exists because Baileys is Node-only and the Kadai backend is Python: the
backend's `app/services/wa/baileys` engine talks to this over HTTP.

## Why a separate service

- **Baileys is Node.** There is no equivalent Python library.
- **One socket per number.** WhatsApp Web allows a number to be linked to a
  limited set of devices; the registry here guarantees exactly one socket per
  shop and never two.
- **Durable sessions.** Credentials and Signal keys are stored in Postgres
  (`wa_auth_creds`, `wa_signal_keys`, keyed by `shop_id`), so a redeploy or a
  reclaimed Cloud Run container does not force every seller to re-scan.

## Run

```bash
cp .env.example .env     # DATABASE_URL (same DB as Kadai), WA_GATEWAY_SECRET, WA_KADAI_CALLBACK_URL
npm install
npm start                # tsx src/index.ts — listens on PORT (default 8788)
```

Or bring it up with Postgres + the API via `docker compose up --build` from the
repo root.

## HTTP API (called by the Kadai API)

Every request must carry `x-gateway-secret: $WA_GATEWAY_SECRET`.

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| POST | `/sessions/:shopId/link` | `{phone?}` | `{ok}` — starts pairing (QR, or pairing code when a phone is given) |
| GET | `/sessions/:shopId/status` | — | `{status, qr?, code?, number?}` (`status`: connecting \| qr \| linked \| logged_out) |
| POST | `/sessions/:shopId/send` | `{to, text}` | `{wamid}` (409 when not linked) |
| POST | `/sessions/:shopId/logout` | — | `{ok}` |
| GET | `/health` | — | `{ok}` |

## Callbacks (posted to the Kadai API)

With the same secret header, to `WA_KADAI_CALLBACK_URL`:

- `POST /wa/baileys/inbound` — `{shopId, from, text, wamid, timestamp, pushName}`
- `POST /wa/baileys/status` — `{shopId, status, number}`

## Notes

- Outbound pacing (ban-avoidance) stays in the Kadai API's broadcast fan-out;
  the gateway just sends.
- This is adapted from the `whatsapp-harness` transport layer
  (`ConnectionManager`, `authStore`), trimmed to transport only and keyed by
  `shop_id` instead of a tenant-number UUID.
