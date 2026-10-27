import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  type AnyMessageContent,
  type BaileysEventMap,
  type CacheStore,
  type ConnectionState,
  type WAMessage,
  type WAMessageKey,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import NodeCache from '@cacheable/node-cache'
import type { Logger } from './logger'
import { useDbAuthState } from './authStore'

const MAX_RECONNECT_DELAY_MS = 30_000

export type LinkStatus = 'connecting' | 'qr' | 'linked' | 'logged_out'

export interface ConnectionManagerOptions {
  shopId: string
  logger: Logger
  usePairingCode?: boolean
  phone?: string
  onQr?: (qrDataUrl: string) => void
  onPairingCode?: (code: string) => void
  onStatus?: (status: LinkStatus, number?: string) => void
  onLoggedOut?: () => void
  onInbound?: (message: WAMessage) => Promise<void>
}

/**
 * Owns one Baileys socket for one shop: auth persistence, reconnection,
 * keep-alive caches, and inbound delivery. Baileys does not reconnect on its
 * own, so closes other than logout are retried here with backoff. Adapted from
 * whatsapp-harness ConnectionManager; link status is reported through callbacks
 * rather than written to a tenant_numbers table.
 */
export class ConnectionManager {
  private sock?: ReturnType<typeof makeWASocket>
  private saveCreds?: () => Promise<void>
  private stopped = false
  private reconnectDelay = 1_000
  private pairingRequested = false
  private connectionState?: ConnectionState['connection']

  private readonly logger: Logger
  // Small LRU of messages we have seen, so Baileys' getMessage (used for
  // decryption retries) can resolve recent ids without a database.
  private readonly msgCache = new NodeCache({ stdTTL: 600, useClones: false })
  private readonly msgRetryCounterCache = new NodeCache() as unknown as CacheStore

  constructor(private readonly options: ConnectionManagerOptions) {
    this.logger = options.logger.child({ shopId: options.shopId })
  }

  async start(): Promise<void> {
    this.stopped = false
    this.options.onStatus?.('connecting')
    await this.connect()
  }

  get isStopped(): boolean {
    return this.stopped
  }

  /** Whether the WhatsApp socket is currently connected (the live link signal). */
  get isOpen(): boolean {
    return this.connectionState === 'open'
  }

  /** The linked number in local/E.164 digits, once the socket is open. */
  get number(): string | undefined {
    const id = this.sock?.user?.id
    if (!id) return undefined
    return id.split(':')[0]?.split('@')[0]
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.sock?.end(undefined)
  }

  /** Remove the linked device from WhatsApp and close the socket. */
  async logout(): Promise<void> {
    this.stopped = true
    try {
      await this.sock?.logout()
    } catch (error) {
      this.logger.warn({ error }, 'logout failed')
    }
    try {
      this.sock?.end(undefined)
    } catch {
      /* already closed */
    }
  }

  async rawSend(jid: string, content: AnyMessageContent): Promise<string> {
    if (!this.sock) throw new Error('socket not connected')
    const sent = await this.sock.sendMessage(jid, content)
    return sent?.key?.id ?? ''
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useDbAuthState(this.options.shopId)
    this.saveCreds = saveCreds

    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, this.logger),
      },
      logger: this.logger,
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      msgRetryCounterCache: this.msgRetryCounterCache,
      getMessage: async (key: WAMessageKey) =>
        (this.msgCache.get(key.id ?? '') as WAMessage['message']) ?? undefined,
    })
    this.sock = sock

    sock.ev.process(async (events) => {
      if (events['connection.update']) await this.onConnectionUpdate(events['connection.update'])
      if (events['creds.update']) await this.saveCreds?.()
      if (events['messages.upsert']) await this.onMessagesUpsert(events['messages.upsert'])
    })
  }

  private async onConnectionUpdate(update: Partial<ConnectionState>): Promise<void> {
    const { connection, lastDisconnect, qr } = update
    if (connection) this.connectionState = connection

    if (qr && this.sock) {
      if (this.options.usePairingCode) {
        if (!this.pairingRequested && !this.sock.authState.creds.registered && this.options.phone) {
          this.pairingRequested = true
          const phone = this.options.phone.replace(/\D/g, '')
          const code = await this.sock.requestPairingCode(phone)
          this.options.onPairingCode?.(code)
        }
      } else {
        // The QR callback encodes the raw string to a data URL (see registry).
        this.options.onQr?.(qr)
        this.options.onStatus?.('qr')
      }
    }

    if (connection === 'open') {
      this.reconnectDelay = 1_000
      this.options.onStatus?.('linked', this.number)
      this.logger.info({ number: this.number }, 'connection open')
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      if (code === DisconnectReason.loggedOut) {
        this.stopped = true
        this.logger.warn('logged out; clearing session')
        this.options.onStatus?.('logged_out')
        this.options.onLoggedOut?.()
        return
      }
      if (!this.stopped) await this.scheduleReconnect()
    }
  }

  private async scheduleReconnect(): Promise<void> {
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
    this.logger.info({ delay }, 'reconnecting')
    await new Promise((resolve) => setTimeout(resolve, delay))
    if (!this.stopped) await this.connect()
  }

  private async onMessagesUpsert(upsert: BaileysEventMap['messages.upsert']): Promise<void> {
    if (upsert.type !== 'notify') return
    for (const message of upsert.messages) {
      if (message.key.id && message.message) this.msgCache.set(message.key.id, message.message)
      if (message.key.fromMe) continue
      try {
        await this.options.onInbound?.(message)
      } catch (error) {
        this.logger.error({ error }, 'inbound handler failed')
      }
    }
  }
}
