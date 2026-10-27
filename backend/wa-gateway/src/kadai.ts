import { config } from './config'
import { logger } from './logger'
import type { WAMessage } from '@whiskeysockets/baileys'
import type { LinkStatus } from './connectionManager'

/**
 * Calls back into the Kadai API. Both endpoints are authenticated with the
 * shared secret header and are best-effort: a failed callback is logged, never
 * thrown, so it can never take the WhatsApp socket down.
 */
async function post(path: string, body: unknown): Promise<void> {
  if (!config.kadaiCallbackUrl) return
  try {
    const res = await fetch(`${config.kadaiCallbackUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gateway-secret': config.secret },
      body: JSON.stringify(body),
    })
    if (!res.ok) logger.warn({ path, status: res.status }, 'kadai callback non-2xx')
  } catch (error) {
    logger.warn({ error, path }, 'kadai callback failed')
  }
}

/** Pull plain text out of the message types a seller's customer actually sends. */
export function extractText(m: WAMessage): string {
  const msg = m.message
  if (!msg) return ''
  if (msg.conversation) return msg.conversation
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text
  if (msg.imageMessage?.caption) return msg.imageMessage.caption
  if (msg.videoMessage?.caption) return msg.videoMessage.caption
  if (msg.buttonsResponseMessage?.selectedDisplayText)
    return msg.buttonsResponseMessage.selectedDisplayText
  if (msg.listResponseMessage?.title) return msg.listResponseMessage.title
  return '[media message]'
}

export async function reportInbound(shopId: string, m: WAMessage): Promise<void> {
  const from = (m.key.remoteJid ?? '').split('@')[0] ?? ''
  await post('/wa/baileys/inbound', {
    shopId,
    from,
    text: extractText(m),
    wamid: m.key.id ?? '',
    timestamp: Number(m.messageTimestamp ?? 0),
    pushName: m.pushName ?? '',
  })
}

export async function reportStatus(
  shopId: string,
  status: LinkStatus,
  number?: string,
): Promise<void> {
  await post('/wa/baileys/status', { shopId, status, number: number ?? '' })
}
