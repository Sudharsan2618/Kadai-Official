import QRCode from 'qrcode'
import { config } from './config'
import { logger } from './logger'
import { clearDbAuthState } from './authStore'
import { shopsWithCreds } from './db'
import { ConnectionManager, type LinkStatus } from './connectionManager'
import { reportInbound, reportStatus } from './kadai'

interface Pairing {
  status: LinkStatus
  qr?: string // data URL
  code?: string
  number?: string
}

/**
 * Holds one ConnectionManager per shop. Serves already-linked shops and drives
 * pairing for new ones — never two sockets for one shop. Latest pairing/link
 * state per shop is cached here so Kadai can poll it over HTTP.
 */
export class Registry {
  private readonly managers = new Map<string, ConnectionManager>()
  private readonly pairing = new Map<string, Pairing>()

  /** Resume every shop that already has stored credentials (called on boot). */
  async resumeAll(): Promise<void> {
    for (const shopId of await shopsWithCreds()) {
      try {
        await this.ensure(shopId, false)
      } catch (error) {
        logger.warn({ error, shopId }, 'resume failed')
      }
    }
  }

  private build(shopId: string, usePairingCode: boolean, phone?: string): ConnectionManager {
    this.pairing.set(shopId, { status: 'connecting' })
    const manager = new ConnectionManager({
      shopId,
      logger,
      usePairingCode,
      phone,
      onQr: async (qr) => {
        const dataUrl = await QRCode.toDataURL(qr).catch(() => undefined)
        this.pairing.set(shopId, { ...this.pairing.get(shopId), status: 'qr', qr: dataUrl })
      },
      onPairingCode: (code) => {
        this.pairing.set(shopId, { ...this.pairing.get(shopId), status: 'qr', code })
      },
      onStatus: (status, number) => {
        const prev = this.pairing.get(shopId) ?? { status }
        this.pairing.set(shopId, {
          ...prev,
          status,
          number: number ?? prev.number,
          // Once linked, the QR/code are spent.
          qr: status === 'linked' ? undefined : prev.qr,
          code: status === 'linked' ? undefined : prev.code,
        })
        reportStatus(shopId, status, number)
      },
      onLoggedOut: () => {
        this.managers.delete(shopId)
        clearDbAuthState(shopId).catch((error) =>
          logger.warn({ error, shopId }, 'failed to clear auth after logout'),
        )
      },
      onInbound: (message) => reportInbound(shopId, message),
    })
    this.managers.set(shopId, manager)
    return manager
  }

  /** Ensure a live socket for a shop. Reuses an open one; (re)starts otherwise. */
  async ensure(shopId: string, usePairingCode: boolean, phone?: string): Promise<void> {
    const existing = this.managers.get(shopId)
    if (existing && !existing.isStopped) return
    if (existing) {
      await existing.stop()
      this.managers.delete(shopId)
    }
    const manager = this.build(shopId, usePairingCode, phone)
    await manager.start()
  }

  /** Begin a fresh link: drop any socket, wipe stale creds, start pairing clean. */
  async link(shopId: string, phone?: string): Promise<void> {
    const existing = this.managers.get(shopId)
    if (existing) {
      await existing.stop()
      this.managers.delete(shopId)
    }
    await clearDbAuthState(shopId)
    await this.ensure(shopId, Boolean(phone), phone)
  }

  status(shopId: string): Pairing {
    const manager = this.managers.get(shopId)
    const cached = this.pairing.get(shopId) ?? { status: 'logged_out' as LinkStatus }
    // The live socket is the source of truth for "linked".
    if (manager?.isOpen) return { ...cached, status: 'linked', number: manager.number ?? cached.number }
    return cached
  }

  manager(shopId: string): ConnectionManager | undefined {
    return this.managers.get(shopId)
  }

  async send(shopId: string, to: string, text: string): Promise<string> {
    const manager = this.managers.get(shopId)
    if (!manager?.isOpen) throw new NotLinkedError(shopId)
    return manager.rawSend(toJid(to), { text })
  }

  async logout(shopId: string): Promise<void> {
    const manager = this.managers.get(shopId)
    if (manager) {
      await manager.logout()
      this.managers.delete(shopId)
    }
    await clearDbAuthState(shopId)
    this.pairing.set(shopId, { status: 'logged_out' })
  }

  async stopAll(): Promise<void> {
    for (const manager of this.managers.values()) await manager.stop()
    this.managers.clear()
  }
}

export class NotLinkedError extends Error {
  constructor(shopId: string) {
    super(`WhatsApp is not linked for shop ${shopId}`)
  }
}

/** Turn a number (local or E.164) or an already-formed JID into a WhatsApp JID. */
export function toJid(to: string): string {
  if (to.includes('@')) return to
  let digits = to.replace(/\D/g, '')
  if (digits.length === 10) digits = config.defaultCountryCode + digits
  return `${digits}@s.whatsapp.net`
}
