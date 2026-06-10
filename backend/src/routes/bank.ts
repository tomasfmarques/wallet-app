import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { processImportItems } from './budget'

// ── GoCardless Bank Account Data (ex-Nordigen) ───────────────────
// Free PSD2 API covering ~2500 EU banks (incl. Banco CTT, Millennium BCP,
// Montepio). Flow:
//   1. POST /connect { institutionId } → creates a requisition, returns the
//      bank's consent link; the user authenticates ON THE BANK'S OWN SITE.
//   2. The bank redirects back to the app; the connection turns "linked".
//   3. POST /sync pulls booked transactions for every linked account and
//      feeds them through the SAME import pipeline as statement uploads
//      (dedup + learned rules + "Por classificar").
//
// Requires GOCARDLESS_SECRET_ID + GOCARDLESS_SECRET_KEY env vars (free at
// bankaccountdata.gocardless.com). Until set, /status reports configured:false
// and the UI shows the banks as "brevemente".

const GC_BASE = 'https://bankaccountdata.gocardless.com/api/v2'

const router = Router()
router.use(requireAuth)

function credentials(): { id: string; key: string } | null {
  const id = process.env.GOCARDLESS_SECRET_ID
  const key = process.env.GOCARDLESS_SECRET_KEY
  return id && key ? { id, key } : null
}

// ── Access-token cache (24h tokens; refresh a bit early) ─────────
let tokenCache: { token: string; expiry: number } | null = null
async function getToken(): Promise<string | null> {
  const creds = credentials()
  if (!creds) return null
  if (tokenCache && tokenCache.expiry > Date.now()) return tokenCache.token
  try {
    const res = await fetch(`${GC_BASE}/token/new/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret_id: creds.id, secret_key: creds.key }),
    })
    if (!res.ok) return null
    const json = await res.json() as { access?: string; access_expires?: number }
    if (!json.access) return null
    tokenCache = { token: json.access, expiry: Date.now() + ((json.access_expires ?? 86400) - 300) * 1000 }
    return json.access
  } catch { return null }
}

async function gc<T>(path: string, token: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${GC_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      console.error(`GoCardless ${path} → ${res.status}`)
      return null
    }
    return await res.json() as T
  } catch { return null }
}

// ── GET /api/bank/status ─────────────────────────────────────────
// Whether the integration is configured + the user's connections (with live
// status refresh so "created" flips to "linked" after bank consent).
router.get('/status', async (req, res) => {
  const userId = req.session.userId!
  try {
    const connections = await prisma.bankConnection.findMany({
      where: { userId }, orderBy: { createdAt: 'desc' },
    })

    const token = await getToken()
    if (token) {
      // Refresh live status for connections still awaiting consent
      for (const c of connections) {
        if (c.status === 'linked' || c.status === 'expired') continue
        const r = await gc<{ status?: string }>(`/requisitions/${c.requisitionId}/`, token)
        const s = r?.status === 'LN' ? 'linked' : r?.status === 'EX' ? 'expired' : c.status
        if (s !== c.status) {
          await prisma.bankConnection.update({ where: { id: c.id }, data: { status: s } })
          c.status = s
        }
      }
    }

    res.json({ configured: !!credentials(), connections })
  } catch (err) {
    console.error('GET /bank/status failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── GET /api/bank/institutions ───────────────────────────────────
// PT bank list (any bank GoCardless supports), cached 24h.
let instCache: { data: unknown[]; expiry: number } | null = null
router.get('/institutions', async (_req, res) => {
  const token = await getToken()
  if (!token) { res.json({ configured: false, institutions: [] }); return }
  try {
    if (!instCache || instCache.expiry < Date.now()) {
      const list = await gc<Array<{ id: string; name: string; logo?: string }>>('/institutions/?country=pt', token)
      if (!list) { res.status(502).json({ error: 'Falha a obter a lista de bancos' }); return }
      instCache = {
        data: list.map((i) => ({ id: i.id, name: i.name, logo: i.logo ?? null })),
        expiry: Date.now() + 24 * 60 * 60 * 1000,
      }
    }
    res.json({ configured: true, institutions: instCache.data })
  } catch (err) {
    console.error('GET /bank/institutions failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/bank/connect ───────────────────────────────────────
// Creates a requisition for the chosen bank and returns the consent link.
router.post('/connect', async (req, res) => {
  const institutionId = typeof req.body?.institutionId === 'string' ? req.body.institutionId : null
  const institutionName = typeof req.body?.institutionName === 'string' ? req.body.institutionName.slice(0, 80) : 'Banco'
  const logo = typeof req.body?.logo === 'string' ? req.body.logo : null
  if (!institutionId) { res.status(400).json({ error: 'institutionId obrigatório' }); return }

  const token = await getToken()
  if (!token) { res.status(503).json({ error: 'Integração bancária não configurada' }); return }

  try {
    const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`
    const reference = `${req.session.userId!.slice(0, 8)}-${Date.now()}`
    const requisition = await gc<{ id?: string; link?: string }>('/requisitions/', token, {
      method: 'POST',
      body: JSON.stringify({ redirect: `${origin}/budget?bank=back`, institution_id: institutionId, reference }),
    })
    if (!requisition?.id || !requisition.link) {
      res.status(502).json({ error: 'Falha a criar a ligação ao banco' }); return
    }

    await prisma.bankConnection.create({
      data: {
        userId: req.session.userId!,
        requisitionId: requisition.id,
        institutionId, institutionName, logo,
      },
    })
    res.json({ link: requisition.link })
  } catch (err) {
    console.error('POST /bank/connect failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/bank/connections/:id ─────────────────────────────
router.delete('/connections/:id', async (req, res) => {
  try {
    const conn = await prisma.bankConnection.findUnique({ where: { id: req.params.id } })
    if (!conn || conn.userId !== req.session.userId) { res.status(404).json({ error: 'Não encontrado' }); return }
    const token = await getToken()
    if (token) await gc(`/requisitions/${conn.requisitionId}/`, token, { method: 'DELETE' })
    await prisma.bankConnection.delete({ where: { id: conn.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /bank/connections/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/bank/sync ──────────────────────────────────────────
// Pulls booked transactions from every linked connection and feeds them to
// the shared import pipeline. Dedup makes re-syncs safe.
interface GcTransaction {
  bookingDate?: string
  transactionAmount?: { amount?: string; currency?: string }
  remittanceInformationUnstructured?: string
  creditorName?: string
  debtorName?: string
}
router.post('/sync', async (req, res) => {
  const userId = req.session.userId!
  const token = await getToken()
  if (!token) { res.status(503).json({ error: 'Integração bancária não configurada' }); return }

  try {
    const connections = await prisma.bankConnection.findMany({ where: { userId } })
    const items: Array<Record<string, unknown>> = []
    let linkedCount = 0

    for (const conn of connections) {
      const r = await gc<{ status?: string; accounts?: string[] }>(`/requisitions/${conn.requisitionId}/`, token)
      if (!r || r.status !== 'LN') continue
      linkedCount++
      if (conn.status !== 'linked') {
        await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: 'linked' } })
      }

      for (const accountId of r.accounts ?? []) {
        const tx = await gc<{ transactions?: { booked?: GcTransaction[] } }>(`/accounts/${accountId}/transactions/`, token)
        for (const t of tx?.transactions?.booked ?? []) {
          const amount = Number(t.transactionAmount?.amount)
          if (!Number.isFinite(amount) || amount === 0) continue
          const date = t.bookingDate ?? null            // "YYYY-MM-DD"
          const ym = date ? date.slice(0, 7) : null
          const day = date ? Number(date.slice(8, 10)) : null
          const name = (t.creditorName || t.debtorName || t.remittanceInformationUnstructured || 'Transação').slice(0, 80)
          items.push({
            kind: amount >= 0 ? 'income' : 'expense',
            name,
            amount: Math.abs(amount),
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
