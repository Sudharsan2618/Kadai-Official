/**
 * Gateway configuration, read once from the environment.
 *
 * The gateway shares Kadai's Postgres (for durable Baileys session state), is
 * called by the Kadai API over HTTP, and calls back into Kadai when messages
 * arrive or a link goes up/down. Three secrets/URLs are all it needs.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`)
  return value
}

const DB_URL =
  process.env.DATABASE_URL ||
  (process.env.DB_HOST
    ? `postgres://${process.env.DB_USER ?? 'postgres'}:${process.env.DB_PASSWORD ?? 'postgres'}` +
      `@${process.env.DB_HOST}:${process.env.DB_PORT ?? '5432'}/${process.env.DB_NAME ?? 'kadai'}`
    : '')

export const config = {
  port: Number(process.env.PORT ?? 8788),
  databaseUrl: required('DATABASE_URL (or DB_HOST/...)', DB_URL),
  // Managed Postgres (Render/Cloud SQL) usually needs SSL without a CA chain.
  databaseSsl: (process.env.DATABASE_SSL ?? 'false').toLowerCase() === 'true',
  // Shared secret on every call in BOTH directions (Kadai→gateway, gateway→Kadai).
  secret: required('WA_GATEWAY_SECRET', process.env.WA_GATEWAY_SECRET),
  // Where the gateway posts inbound messages + link status. Empty disables callbacks
  // (useful in a pure send/link smoke test).
  kadaiCallbackUrl: (process.env.WA_KADAI_CALLBACK_URL ?? '').replace(/\/$/, ''),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // Default country code used to turn a bare local number into a WhatsApp JID
  // when the caller passes a short number. Mirrors Kadai's WA_DEFAULT_COUNTRY_CODE.
  defaultCountryCode: process.env.WA_DEFAULT_COUNTRY_CODE ?? '91',
}

export type Config = typeof config
