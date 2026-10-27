import { Pool } from 'pg'
import { config } from './config'

export const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
})

/**
 * Durable Baileys session state. Losing these rows forces a shop to re-scan the
 * QR, so they live in Postgres (shared with Kadai) rather than on the container
 * disk, which Cloud Run reclaims. Keyed by shop_id (text) to match Kadai's shops.
 */
export async function ensureSchema(): Promise<void> {
  await pool.query(`
    create table if not exists wa_auth_creds (
      shop_id text primary key,
      creds text not null,
      updated_at timestamptz not null default now()
    )`)
  await pool.query(`
    create table if not exists wa_signal_keys (
      shop_id text not null,
      category text not null,
      item_id text not null,
      value text not null,
      updated_at timestamptz not null default now(),
      primary key (shop_id, category, item_id)
    )`)
}

/** Shops that have stored credentials — resumed on boot. */
export async function shopsWithCreds(): Promise<string[]> {
  const { rows } = await pool.query<{ shop_id: string }>('select shop_id from wa_auth_creds')
  return rows.map((r) => r.shop_id)
}
