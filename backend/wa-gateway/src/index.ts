import { timingSafeEqual } from 'node:crypto'
import express, { type NextFunction, type Request, type Response } from 'express'
import { config } from './config'
import { logger } from './logger'
import { ensureSchema, pool } from './db'
import { Registry, NotLinkedError } from './registry'

const registry = new Registry()

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((error) => {
      if (error instanceof NotLinkedError) {
        res.status(409).json({ error: error.message })
        return
      }
      logger.error({ error, path: req.path }, 'request failed')
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
    })
  }
}

/** Constant-time shared-secret check on every route. */
function requireSecret(req: Request, res: Response, next: NextFunction): void {
  const given = String(req.header('x-gateway-secret') ?? '')
  const expected = config.secret
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length === b.length && timingSafeEqual(a, b)) return next()
  res.status(401).json({ error: 'bad gateway secret' })
}

async function main(): Promise<void> {
  await ensureSchema()
  await registry.resumeAll()

  const app = express()
  app.use(express.json({ limit: '1mb' }))

  app.get('/health', (_req, res) => res.json({ ok: true }))

  const api = express.Router()
  api.use(requireSecret)

  // Begin (or restart) linking a shop's number. With a phone, Baileys returns a
  // pairing code; without one, a QR. Either way the result is polled via status.
  api.post(
    '/sessions/:shopId/link',
    asyncHandler(async (req, res) => {
      const phone = String(req.body?.phone ?? '').replace(/\D/g, '') || undefined
      await registry.link(req.params.shopId!, phone)
      res.json({ ok: true })
    }),
  )

  api.get(
    '/sessions/:shopId/status',
    asyncHandler(async (req, res) => {
      res.json(registry.status(req.params.shopId!))
    }),
  )

  api.post(
    '/sessions/:shopId/send',
    asyncHandler(async (req, res) => {
      const to = String(req.body?.to ?? '').trim()
      const text = String(req.body?.text ?? '')
      if (!to || !text) return res.status(400).json({ error: 'to and text are required' })
      const wamid = await registry.send(req.params.shopId!, to, text)
      res.json({ wamid })
    }),
  )

  api.post(
    '/sessions/:shopId/logout',
    asyncHandler(async (req, res) => {
      await registry.logout(req.params.shopId!)
      res.json({ ok: true })
    }),
  )

  app.use(api)

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'wa-gateway listening')
  })

  const shutdown = async () => {
    logger.info('shutting down')
    server.close()
    await registry.stopAll()
    await pool.end().catch(() => {})
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((error) => {
  logger.error({ error }, 'wa-gateway startup failed')
  process.exitCode = 1
})
