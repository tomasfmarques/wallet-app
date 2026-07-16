import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { brokerEncConfigured, encryptSecret, decryptSecret } from '../lib/crypto'
import { validateT212, fetchT212ImportItems, T212Error, type T212Creds, type T212Env, type BrokerImportItem } from '../lib/trading212'
import { reconcileBrokerSnapshot } from './portfolio'

// Snapshot stash for the two-step sell flow: the preview (dry run) fetches from
// T212; the user's confirm should apply EXACTLY that snapshot, not a fresh
// fetch — re-fetching seconds later both tripped T212's rate limits (the
// "too many attempts" bug) and could apply a different snapshot than the one
// the user approved. In-memory per user, short-lived; on a cold serverless
// instance the confirm just falls back to a fresh fetch.
const previewStash = new Map<string, { items: BrokerImportItem[]; expiry: number }>()
const PREVIEW_TTL_MS = 5 * 60 * 1000

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

    const confirm = req.body?.confirm === true

    // Per-user cooldown — sync is on-demand; this stops rapid re-syncs (and
    // repeated preview clicks, which also fetch from T212) from burning the
    // broker's per-account rate limit. The CONFIRM leg is exempt: it applies
    // the stashed preview snapshot, so blocking it would break the sell flow.
    if (!confirm && conn.lastSyncAt && Date.now() - new Date(conn.lastSyncAt).getTime() < 15_000) {
      res.status(429).json({ error: 'Sincronizado há instantes — espera uns segundos.' }); return
    }

    // Confirm leg: apply the snapshot the user just previewed (no second T212
    // fetch). Falls back to a fresh fetch if the stash is cold/expired.
    const stashed = confirm ? previewStash.get(userId) : undefined
    let items: BrokerImportItem[]
    if (stashed && stashed.expiry > Date.now()) {
      items = stashed.items
    } else {
      const creds: T212Creds = {
        key: decryptSecret(conn.keyEnc),
        secret: conn.secretEnc ? decryptSecret(conn.secretEnc) : null,
        env: asEnv(conn.env),
      }
      items = await fetchT212ImportItems(creds)
    }
    previewStash.delete(userId)

    // The live snapshot is authoritative, so reconciling it can CLOSE holdings
    // that are no longer present (i.e. sold). Don't do that silently: a dry run
    // first, and if it would close anything, return a preview and require an
    // explicit confirm before applying.
    const preview = await reconcileBrokerSnapshot(userId, items, { apply: false })
    if (preview.closed > 0 && !confirm) {
      previewStash.set(userId, { items, expiry: Date.now() + PREVIEW_TTL_MS })
      // Start the cooldown here too, so spamming the sync button can't repeat
      // the T212 fetch — the confirm leg is exempt from the cooldown above.
      await prisma.brokerConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } })
      res.json({ ok: true, preview: true, summary: preview }); return
    }
    const summary = await reconcileBrokerSnapshot(userId, items, { apply: true })
    await prisma.brokerConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } })
    res.json({ ok: true, preview: false, summary })
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
