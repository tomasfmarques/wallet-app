import { Router } from 'express'
import { randomUUID } from 'crypto'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { processImportItems } from './budget'
import {
  isConfigured, getAspsps, startAuth, createSession, getSession,
  deleteSession, accountUids, getTransactions,
} from '../lib/enableBanking'

// ── Bank sync — Enable Banking (AIS) ─────────────────────────────
// Replaces the retired GoCardless flow. Enable Banking is a FIN-FSA-regulated
// AISP; the free "restricted production" tier returns real transactions for the
// bank accounts the app owner links in their Control Panel (docs/bank-sync-spec.md).
//
// Flow:
//   1. POST /connect { institutionId } → POST /auth upstream → the bank's
//      consent URL; the user authenticates ON THE BANK'S OWN SITE (SCA).
//   2. The bank redirects back to `${APP_ORIGIN}/budget?code=…&state=…`; the
//      frontend posts that to POST /callback, which exchanges the code for a
//      session (POST /sessions) and flips the connection to "linked".
//   3. POST /sync pulls booked transactions for every linked session and feeds
//      them through the SAME import pipeline as statement uploads (dedup +
//      learned rules + "Por classificar").
//
// `BankConnection.requisitionId` (kept from the GoCardless schema, no migration)
// stores the `state` uuid while awaiting consent, then the Enable Banking
// `session_id` once linked. Gated on ENABLE_BANKING_APP_ID +
// ENABLE_BANKING_PRIVATE_KEY_B64 — off until both are set.

const router = Router()
router.use(requireAuth)

const PT = 'PT'
const CONSENT_DAYS = 90

function sanitizeLogo(v: unknown): string | null {
  if (typeof v !== 'string') return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' ? v : null
  } catch { return null }
}

// Derive the app's public origin from server config, never from the request.
// Must match a redirect URL whitelisted in the Enable Banking Control Panel.
function appOrigin(): string {
  const configured = process.env.APP_ORIGIN
  if (configured) return configured.replace(/\/$/, '')
  const origins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (origins.length > 0) return origins[0]
  return 'http://localhost:5173'
}

// ── GET /api/bank/status ─────────────────────────────────────────
// Whether the integration is configured + the user's connections, refreshing
// linked sessions so an expired consent flips to "expired" in the UI.
router.get('/status', async (req, res) => {
  const userId = req.session.userId!
  try {
    const connections = await prisma.bankConnection.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
    })
    if (isConfigured()) {
      for (const c of connections) {
        if (c.status !== 'linked') continue
        const s = await getSession(c.requisitionId)
        if (s && s.status && s.status !== 'AUTHORIZED') {
          await prisma.bankConnection.update({ where: { id: c.id }, data: { status: 'expired' } })
          c.status = 'expired'
        }
      }
    }
    res.json({ configured: isConfigured(), connections })
  } catch (err) {
    console.error('GET /bank/status failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── GET /api/bank/institutions ───────────────────────────────────
// PT ASPSP list. Enable Banking identifies banks by name (no id), so `id` = name.
router.get('/institutions', async (_req, res) => {
  if (!isConfigured()) { res.json({ configured: false, institutions: [] }); return }
  try {
    const list = await getAspsps(PT)
    res.json({
      configured: true,
      institutions: list.map((i) => ({ id: i.name, name: i.name, logo: sanitizeLogo(i.logo) })),
    })
  } catch (err) {
    console.error('GET /bank/institutions failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/bank/connect ───────────────────────────────────────
// Starts authorization for the chosen bank and returns the consent URL.
router.post('/connect', async (req, res) => {
  const institutionId = typeof req.body?.institutionId === 'string' ? req.body.institutionId : null // = ASPSP name
  const institutionName = typeof req.body?.institutionName === 'string'
    ? req.body.institutionName.slice(0, 80) : (institutionId ?? 'Banco')
  const logo = sanitizeLogo(req.body?.logo)
  if (!institutionId) { res.status(400).json({ error: 'institutionId obrigatório' }); return }
  if (!isConfigured()) { res.status(503).json({ error: 'Integração bancária não configurada' }); return }

  try {
    const state = randomUUID()
    const validUntil = new Date(Date.now() + CONSENT_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const url = await startAuth({
      name: institutionId, country: PT,
      redirectUrl: `${appOrigin()}/budget`, state, validUntil,
    })
    if (!url) { res.status(502).json({ error: 'Falha a criar a ligação ao banco' }); return }

    await prisma.bankConnection.create({
      data: {
        userId: req.session.userId!,
        requisitionId: state,           // holds the state until /callback swaps in the session_id
        institutionId, institutionName, logo,
        status: 'created',
      },
    })
    res.json({ link: url })
  } catch (err) {
    console.error('POST /bank/connect failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/bank/callback ──────────────────────────────────────
// Exchanges the ?code from the bank redirect for a session and links the
// connection. Idempotent: re-posting after it's already linked is a no-op
// (the single-use code would otherwise fail on a page reload).
router.post('/callback', async (req, res) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : null
  const state = typeof req.body?.state === 'string' ? req.body.state : null
  if (!code || !state) { res.status(400).json({ error: 'code e state obrigatórios' }); return }
  if (!isConfigured()) { res.status(503).json({ error: 'Integração bancária não configurada' }); return }

  const userId = req.session.userId!
  try {
    const conn = await prisma.bankConnection.findUnique({ where: { requisitionId: state } })
    if (!conn || conn.userId !== userId) { res.status(404).json({ error: 'Ligação não encontrada' }); return }
    if (conn.status === 'linked') { res.json({ ok: true }); return } // already exchanged (reload-safe)

    const session = await createSession(code)
    if (!session?.session_id) { res.status(502).json({ error: 'Falha a confirmar a ligação ao banco' }); return }

    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: { requisitionId: session.session_id, status: 'linked' },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /bank/callback failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/bank/connections/:id ─────────────────────────────
router.delete('/connections/:id', async (req, res) => {
  try {
    const conn = await prisma.bankConnection.findUnique({ where: { id: req.params.id } })
    if (!conn || conn.userId !== req.session.userId) { res.status(404).json({ error: 'Não encontrado' }); return }
    if (conn.status === 'linked') await deleteSession(conn.requisitionId)
    await prisma.bankConnection.delete({ where: { id: conn.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /bank/connections/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/bank/sync ──────────────────────────────────────────
// Pulls booked transactions from every linked session (last CONSENT_DAYS) and
// feeds them to the shared import pipeline. Dedup makes re-syncs safe.
router.post('/sync', async (req, res) => {
  const userId = req.session.userId!
  if (!isConfigured()) { res.status(503).json({ error: 'Integração bancária não configurada' }); return }

  try {
    const connections = await prisma.bankConnection.findMany({ where: { userId } })
    const items: Array<Record<string, unknown>> = []
    let linkedCount = 0
    const dateFrom = new Date(Date.now() - CONSENT_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    for (const conn of connections) {
      if (conn.status === 'created') continue // consent not completed yet
      const session = await getSession(conn.requisitionId)
      // `null` means the upstream call FAILED (network / 5xx) — indistinguishable
      // here from a revoked consent, so leave the connection alone rather than
      // forcing a needless re-consent over a transient blip. Only a session that
      // actually reports a non-AUTHORIZED status downgrades it. (Same
      // conservative rule as GET /status.)
      if (!session) continue
      if (session.status !== 'AUTHORIZED') {
        if (conn.status !== 'expired') {
          await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: 'expired' } })
        }
        continue
      }
      linkedCount++
      if (conn.status !== 'linked') {
        await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: 'linked' } })
      }

      for (const uid of accountUids(session)) {
        for (const t of await getTransactions(uid, dateFrom)) {
          const st = (t.transaction_status || t.status || '').toUpperCase()
          if (st === 'PDNG' || st === 'PENDING') continue // booked only

          const raw = Number(t.transaction_amount?.amount)
          if (!Number.isFinite(raw) || raw === 0) continue
          const mag = Math.abs(raw)
          // Amount magnitude is positive; sign comes from the indicator. Fall
          // back to the raw sign for ASPSPs that send it signed / omit the flag.
          const signed = t.credit_debit_indicator === 'DBIT' ? -mag
            : t.credit_debit_indicator === 'CRDT' ? mag : raw

          const date = t.booking_date ?? null // "YYYY-MM-DD"
          const ym = date ? date.slice(0, 7) : null
          const day = date ? Number(date.slice(8, 10)) : null
          const name = (t.creditor?.name || t.debtor?.name
            || (t.remittance_information ?? []).join(' ') || 'Transação').slice(0, 80)

          items.push({
            kind: signed >= 0 ? 'income' : 'expense',
            name,
            amount: Math.abs(signed),
            dayOfMonth: day,
            startYm: ym, endYm: ym,
            source: conn.institutionName,
          })
        }
      }
    }

    if (linkedCount === 0) {
      res.status(400).json({ error: 'Nenhum banco ligado ainda. Autoriza primeiro no site do banco.' }); return
    }

    const summary = await processImportItems(userId, items)
    res.json({ ok: true, summary })
  } catch (err) {
    console.error('POST /bank/sync failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
