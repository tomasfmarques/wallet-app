import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { brokerEncConfigured, encryptSecret, decryptSecret } from '../lib/crypto'
import { validateT212, fetchT212ImportItems, T212Error, type T212Creds, type T212Env } from '../lib/trading212'
import { processPortfolioImportItems } from './portfolio'

// ── Broker live-sync (Trading 212) ───────────────────────────────
// Mirrors the GoCardless bank-connect flow: /status, /connect (validate + store
// an ENCRYPTED key), /sync (pull positions → the shared portfolio-import
// pipeline), DELETE /connection. Gated on BROKER_ENC_KEY (lib/crypto.ts) — until
// it's set, /status reports configured:false and the UI shows "brevemente".

const router = Router()
router.use(requireAuth)
const BROKER = 'trading212'

const asEnv = (v: unknown): T212Env => (v === 'demo' ? 'demo' : 'live')
const asKey = (v: unknown): string | null =>
  typeof v === 'string' && v.trim().length >= 8 && v.trim().length <= 400 ? v.trim() : null

// ── GET /api/broker/status ───────────────────────────────────────
router.get('/status', async (req, res) => {
  const userId = req.session.userId!
  try {
    const conn = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: BROKER } } })
    res.json({
      configured: brokerEncConfigured(),
      connection: conn
        ? { broker: conn.broker, env: conn.env, accountCcy: conn.accountCcy, lastSyncAt: conn.lastSyncAt }
        : null,
    })
  } catch (err) {
    console.error('GET /broker/status failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/broker/connect ─────────────────────────────────────
// Validates the key against the live API, then stores it encrypted.
router.post('/connect', async (req, res) => {
  if (!brokerEncConfigured()) { res.status(503).json({ error: 'Integração não configurada no servidor' }); return }
  const apiKey = asKey(req.body?.apiKey)
  const apiSecret = asKey(req.body?.apiSecret) // optional second credential
  const env = asEnv(req.body?.env)
  if (!apiKey) { res.status(400).json({ error: 'Chave da API obrigatória' }); return }

  const creds: T212Creds = { key: apiKey, secret: apiSecret, env }
  try {
    const { accountCcy } = await validateT212(creds)
    const userId = req.session.userId!
    const data = {
      env,
      keyEnc: encryptSecret(apiKey),
      secretEnc: apiSecret ? encryptSecret(apiSecret) : null,
      accountCcy,
    }
    await prisma.brokerConnection.upsert({
      where: { userId_broker: { userId, broker: BROKER } },
      create: { userId, broker: BROKER, ...data },
      update: data,
    })
    res.json({ ok: true, accountCcy })
  } catch (err) {
    if (err instanceof T212Error) {
      const msg = err.status === 401 || err.status === 403
        ? 'Chave inválida ou sem permissões (usa uma chave read-only do Trading 212).'
        : `Não foi possível validar a chave (${err.status || 'sem ligação'}).`
      res.status(400).json({ error: msg }); return
    }
    console.error('POST /broker/connect failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/broker/sync ────────────────────────────────────────
router.post('/sync', async (req, res) => {
  if (!brokerEncConfigured()) { res.status(503).json({ error: 'Integração não configurada no servidor' }); return }
  const userId = req.session.userId!
  try {
    const conn = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: BROKER } } })
    if (!conn) { res.status(400).json({ error: 'Nenhuma corretora ligada.' }); return }

    // Per-user cooldown — sync is on-demand; this stops rapid re-syncs from
    // burning the broker's per-account rate limit.
    if (conn.lastSyncAt && Date.now() - new Date(conn.lastSyncAt).getTime() < 15_000) {
      res.status(429).json({ error: 'Sincronizado há instantes — espera uns segundos.' }); return
    }

    const creds: T212Creds = {
      key: decryptSecret(conn.keyEnc),
      secret: conn.secretEnc ? decryptSecret(conn.secretEnc) : null,
      env: asEnv(conn.env),
    }
    const items = await fetchT212ImportItems(creds)
    const summary = await processPortfolioImportItems(userId, items)
    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } })
    res.json({ ok: true, summary })
  } catch (err) {
    if (err instanceof T212Error) {
      const msg = err.status === 401 || err.status === 403
        ? 'Chave inválida — volta a ligar a corretora.'
        : err.status === 429
          ? 'Limite de pedidos do Trading 212 — tenta novamente daqui a pouco.'
          : `Falha na sincronização (${err.status || 'sem ligação'}).`
      res.status(502).json({ error: msg }); return
    }
    console.error('POST /broker/sync failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/broker/connection ────────────────────────────────
router.delete('/connection', async (req, res) => {
  const userId = req.session.userId!
  try {
    await prisma.brokerConnection.deleteMany({ where: { userId, broker: BROKER } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /broker/connection failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
