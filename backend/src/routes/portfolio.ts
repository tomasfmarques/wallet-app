import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import {
  projectPortfolio,
  computePortfolioKpis,
  type AssetInput,
  type ProjectionSettings,
} from '../lib/portfolioEngine'
import { getYahooChart } from '../lib/yahooFinance'
import { annualizedVolatility, riskLevel, portfolioRisk, monthlyReturns, correlatedPortfolioVol } from '../lib/risk'
import { convertPrice } from '../lib/fx'
import { stripFormulaPrefix } from '../lib/sanitize'
import { buildGainsReport } from '../lib/capitalGains'

// Portfolio is reported in EUR. Yahoo returns prices in the native exchange
// currency; we convert via Frankfurter before persisting.
const PORTFOLIO_CCY = 'EUR'

const router = Router()
router.use(requireAuth)

// Round to 2 decimals — keeps stored/displayed MONEY clean (no 45.86789…).
const round2 = (n: number) => Math.round(n * 100) / 100
// Share quantities need finer precision than money (fractional shares like
// 0.57510927) — round to 8 dp, matching the live broker snapshot.
const round8 = (n: number) => Math.round(n * 1e8) / 1e8

// `PortfolioAsset.source` value for broker-originated holdings. The broker
// snapshot-reconcile only auto-closes holdings tagged with this.
const BROKER_SOURCE = 'trading212'

// ── Validation helpers ───────────────────────────────────────────
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// Sanity ceilings (defence in depth — reject absurd public-API input).
const MAX_MONEY = 1_000_000_000   // 1 B € for invested/value/monthly
const MAX_QTY = 1_000_000_000     // 1 B shares/units

function asNumber(v: unknown, field: string, errors: Record<string, string>, allowNeg = false, max = MAX_MONEY): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || (!allowNeg && n < 0)) {
    errors[field] = allowNeg ? `${field} inválido` : `${field} deve ser ≥ 0`
    return 0
  }
  if (Math.abs(n) > max) { errors[field] = `${field} fora do intervalo`; return 0 }
  return n
}

function asPositiveNumber(v: unknown, field: string, errors: Record<string, string>, max = MAX_QTY): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    errors[field] = `${field} deve ser > 0`
    return 0
  }
  if (n > max) { errors[field] = `${field} fora do intervalo`; return 0 }
  return n
}

function asString(v: unknown, field: string, errors: Record<string, string>, min = 1, max = 100): string {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) {
    errors[field] = `${field} obrigatório (${min}-${max} caracteres)`
    return ''
  }
  return v.trim()
}

async function ensureSettings(userId: string) {
  const existing = await prisma.portfolioSettings.findUnique({ where: { userId } })
  if (existing) return existing
  return prisma.portfolioSettings.create({
    data: { userId, gInc: 3, gFY: 2, gH: 20 },
  })
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/
const MAX_WATCHLIST = 16

/** Normalize a comma-separated ticker string. Returns null for invalid/empty. */
function normalizeWatchlist(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined          // caller didn't send → don't touch
  if (raw === null || raw === '') return null      // explicit clear
  if (typeof raw !== 'string') return undefined
  const items = Array.from(
    new Set(
      raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    ),
  ).slice(0, MAX_WATCHLIST).filter((s) => TICKER_RE.test(s))
  return items.length === 0 ? null : items.join(',')
}

function settingsToProjection(s: { gInc: number; gFY: number; gH: number }): ProjectionSettings {
  return { gInc: s.gInc, gFy: s.gFY, gH: s.gH }
}

// ── GET /api/portfolio ───────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!
    const [assets, settings] = await Promise.all([
      prisma.portfolioAsset.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
        include: { flows: { orderBy: { ym: 'asc' } } },
      }),
      ensureSettings(userId),
    ])

    const projInput: AssetInput[] = assets.map((a) => ({
      id: a.id,
      name: a.name,
      ticker: a.ticker,
      value: a.value,
      monthly: a.monthly,
      expectedReturn: a.expectedReturn,
    }))

    const projection = projectPortfolio(projInput, settingsToProjection(settings))
    const kpis = computePortfolioKpis(assets, projection.finalTotal)

    res.json({ assets, settings, projection, kpis })
  } catch (err) {
    console.error('GET /api/portfolio failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── GET /api/portfolio/risk ──────────────────────────────────────
// Investment risk = annualized volatility (stddev of monthly returns × √12),
// derived from each holding's Yahoo 10y monthly series. Kept SEPARATE from the
// main GET (which uses stored values and never touches Yahoo) so the dashboard
// stays fast — the Portfolio/Compare pages load this lazily. Yahoo charts are
// cached 1h, so repeat calls are cheap. Per-asset failures degrade to null
// rather than failing the whole request.
router.get('/risk', async (req, res) => {
  try {
    const userId = req.session.userId!
    const assets = await prisma.portfolioAsset.findMany({
      where: { userId },
      select: { id: true, name: true, ticker: true, value: true },
      orderBy: { value: 'desc' },
    })
    const enriched = await Promise.all(
      assets.map(async (a) => {
        let volatility: number | null = null
        let returns: Array<{ ym: string; r: number }> = []
        try {
          const chart = a.ticker ? await getYahooChart(a.ticker) : null
          if (chart) {
            volatility = annualizedVolatility(chart.prices)
            returns = monthlyReturns(chart.prices, chart.timestamps)
          }
        } catch { /* leave null — risk for this asset is just unknown */ }
        return { id: a.id, name: a.name, ticker: a.ticker, value: a.value, volatility, returns }
      }),
    )

    const perAsset = enriched.map((a) => ({
      id: a.id, name: a.name, ticker: a.ticker, value: a.value,
      volatility: a.volatility,
      level: a.volatility != null ? riskLevel(a.volatility) : null,
    }))

    // Headline = correlation-aware vol when we can model it (credits
    // diversification), else the value-weighted average.
    const weighted = portfolioRisk(perAsset)
    const correlated = correlatedPortfolioVol(enriched)
    const volatility = correlated ?? weighted.volatility

    res.json({
      assets: perAsset,
      portfolio: {
        volatility,
        level: volatility != null ? riskLevel(volatility) : null,
        coverage: weighted.coverage,
        weightedVolatility: weighted.volatility,
        correlationModeled: correlated != null,
      },
    })
  } catch (err) {
    console.error('GET /api/portfolio/risk failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── GET /api/portfolio/capital-gains?year=2026 ───────────────────
// IRS mais-valias report (WS6): FIFO realized gains from the imported broker
// transactions (lib/capitalGains), Anexo J-shaped rows. Display names resolve
// from the user's holdings (isin → ticker fallback → raw instrument key).
router.get('/capital-gains', async (req, res) => {
  const yearRaw = Number(req.query.year)
  const year = Number.isInteger(yearRaw) && yearRaw >= 2000 && yearRaw <= 2100
    ? yearRaw
    : new Date().getUTCFullYear()
  try {
    const userId = req.session.userId!
    const [txns, assets] = await Promise.all([
      prisma.importedTxn.findMany({
        where: { userId, side: { not: null } },
        select: { side: true, isin: true, ticker: true, qty: true, totalEur: true, ym: true, txnTime: true },
      }),
      prisma.portfolioAsset.findMany({ where: { userId }, select: { name: true, ticker: true, isin: true } }),
    ])
    const report = buildGainsReport(txns, year)
    const nameByIsin = new Map(assets.filter((a) => a.isin).map((a) => [a.isin!.toUpperCase(), a.name]))
    const nameByTicker = new Map(assets.map((a) => [a.ticker.toUpperCase(), a.name]))
    const rows = report.rows.map((r) => ({
      ...r,
      name: (r.isin && nameByIsin.get(r.isin.toUpperCase()))
        ?? (r.ticker && nameByTicker.get(r.ticker.toUpperCase()))
        ?? r.ticker ?? r.instrument,
    }))
    res.json({ ...report, rows })
  } catch (err) {
    console.error('GET /api/portfolio/capital-gains failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/portfolio/assets ───────────────────────────────────
router.post('/assets', async (req, res) => {
  const errors: Record<string, string> = {}
  const name           = stripFormulaPrefix(asString(req.body?.name, 'name', errors, 1, 80))
  const ticker         = asString(req.body?.ticker, 'ticker', errors, 1, 20).toUpperCase()
  const qty            = asPositiveNumber(req.body?.qty, 'qty', errors)
  const invested       = asNumber(req.body?.invested, 'invested', errors)
  const value          = asNumber(req.body?.value, 'value', errors)
  const monthly        = asNumber(req.body?.monthly ?? 0, 'monthly', errors)
  const expectedReturn = asNumber(req.body?.expectedReturn ?? 0.07, 'expectedReturn', errors)

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors }); return
  }

  try {
    const asset = await prisma.portfolioAsset.create({
      data: {
        userId: req.session.userId!,
        name, ticker, qty, invested, value, monthly, expectedReturn,
      },
    })
    res.status(201).json({ asset })
  } catch (err) {
    console.error('POST /api/portfolio/assets failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/portfolio/import ───────────────────────────────────
// Bulk-insert positions reviewed in the client (e.g. from a Trading212 CSV
// export, aggregated into net holdings). Each item: { name, ticker, isin?,
// qty, invested, value?, expectedReturn?, flows?: [{ ym, amount }] }. Invalid
// rows are skipped (not fatal). Dedups by ISIN (preferred) then ticker against
// the user's existing assets AND within the batch, so a re-import is a safe
// no-op. The client resolves a Yahoo-usable ticker before sending (the whole
// quote/CAGR/risk stack prices via Yahoo); `value` defaults to the cost basis
// and the user can then run "Atualizar valores" for live market prices.
const ISIN_RE = /^[A-Z0-9]{12}$/

// Shared portfolio import pipeline: validate + dedup (by ISIN→ticker, vs the
// user's existing assets AND within the batch) + bulk-create assets and their
// flows in one transaction. Reused by the CSV `/import` route AND the broker
// live-sync (routes/broker.ts). Bad rows are skipped, never thrown.
export async function processPortfolioImportItems(
  userId: string,
  items: unknown[],
): Promise<{ created: number; skipped: number }> {
  const existing = await prisma.portfolioAsset.findMany({ where: { userId }, select: { ticker: true, isin: true } })
  const haveIsin = new Set(existing.map((e) => e.isin?.toUpperCase()).filter(Boolean) as string[])
  const haveTicker = new Set(existing.map((e) => e.ticker.toUpperCase()))
  const seenIsin = new Set<string>()
  const seenTicker = new Set<string>()

  const toCreate: Array<{
    name: string; ticker: string; isin: string | null; qty: number
    invested: number; value: number; expectedReturn: number
    flows: Array<{ ym: string; amount: number }>
  }> = []
  let skipped = 0

  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) { skipped++; continue }
    const it = raw as Record<string, unknown>
    const errs: Record<string, string> = {}
    const name = stripFormulaPrefix(asString(it.name, 'name', errs, 1, 80))
    const ticker = asString(it.ticker, 'ticker', errs, 1, 20).toUpperCase()
    const qty = asPositiveNumber(it.qty, 'qty', errs)
    const invested = asNumber(it.invested, 'invested', errs)
    const value = asNumber(it.value ?? it.invested ?? 0, 'value', errs)
    const expectedReturn = asNumber(it.expectedReturn ?? 0.07, 'expectedReturn', errs)
    if (Object.keys(errs).length > 0) { skipped++; continue }

    const isin = typeof it.isin === 'string' && ISIN_RE.test(it.isin.toUpperCase()) ? it.isin.toUpperCase() : null

    // Skip if the ISIN OR the ticker already exists — against existing rows AND
    // within this batch — so a re-import (or a position already added manually)
    // never creates a duplicate holding. ISIN is the stable key; ticker is the
    // fallback for assets that have no ISIN.
    if ((isin && (haveIsin.has(isin) || seenIsin.has(isin))) || haveTicker.has(ticker) || seenTicker.has(ticker)) {
      skipped++; continue
    }
    if (isin) seenIsin.add(isin)
    seenTicker.add(ticker)

    const flows = (Array.isArray(it.flows) ? it.flows : [])
      .filter((f): f is { ym: string; amount: number } =>
        !!f && typeof f === 'object'
        && typeof (f as Record<string, unknown>).ym === 'string'
        && YM_RE.test((f as Record<string, unknown>).ym as string)
        && Number.isFinite(Number((f as Record<string, unknown>).amount)))
      .slice(0, 120) // ≤10 years of monthly flows — bound the nested write
      .map((f) => ({ ym: f.ym, amount: round2(Number(f.amount)) }))

    toCreate.push({ name, ticker, isin, qty, invested: round2(invested), value: round2(value), expectedReturn, flows })
  }

  if (toCreate.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const a of toCreate) {
        await tx.portfolioAsset.create({
          data: {
            userId, name: a.name, ticker: a.ticker, isin: a.isin,
            qty: a.qty, invested: a.invested, value: a.value, expectedReturn: a.expectedReturn,
            ...(a.flows.length > 0 ? { flows: { create: a.flows } } : {}),
          },
        })
      }
    })
  }
  return { created: toCreate.length, skipped }
}

router.post('/import', async (req, res) => {
  const items = req.body?.items
  if (!Array.isArray(items)) { res.status(400).json({ error: 'items deve ser um array' }); return }
  if (items.length === 0) { res.status(400).json({ error: 'Nenhum ativo para importar' }); return }
  if (items.length > 500) { res.status(400).json({ error: 'Demasiados ativos (máx. 500 por importação)' }); return }

  try {
    const summary = await processPortfolioImportItems(req.session.userId!, items)
    res.status(summary.created > 0 ? 201 : 200).json({ ok: true, summary })
  } catch (err) {
    console.error('POST /api/portfolio/import failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── Reconciling transaction-delta import (Trading 212 CSV) ────────
// Applies a broker order ledger (buys AND sells) as a DELTA on top of the
// user's *existing* holdings — the fix for "the import ignored my sell". Per
// instrument it seeds (qty, cost, value) from the current holding, replays the
// not-yet-applied orders chronologically (sell reduces at the holding's running
// average), and: a sell that empties a holding REMOVES it; a buy tops it up or
// creates it. Idempotent — orders already applied (by external order id) are
// skipped, so re-importing a file is safe.
export async function applyPortfolioTransactions(
  userId: string,
  items: unknown[],
): Promise<{ created: number; updated: number; closed: number; skipped: number }> {
  const existing = await prisma.portfolioAsset.findMany({ where: { userId } })
  const byIsin = new Map<string, (typeof existing)[number]>()
  const byTicker = new Map<string, (typeof existing)[number]>()
  for (const a of existing) {
    if (a.isin) byIsin.set(a.isin.toUpperCase(), a)
    byTicker.set(a.ticker.toUpperCase(), a)
  }
  const appliedRows = await prisma.importedTxn.findMany({
    where: { userId, source: BROKER_SOURCE }, select: { externalId: true, side: true },
  })
  const applied = new Set(appliedRows.map((r) => r.externalId))
  // Only rows that still lack gains data are backfill candidates — WITHOUT
  // this, every re-import would re-update the full history every time (and
  // time out the transaction for multi-year files).
  const needsBackfill = new Set(appliedRows.filter((r) => r.side === null).map((r) => r.externalId))

  interface Plan {
    action: 'update' | 'create' | 'delete'
    assetId?: string
    name: string; ticker: string; isin: string | null
    qty: number; invested: number; value: number
    newFlows: { ym: string; amount: number }[]
  }
  const plans: Plan[] = []
  // Per-order metadata for the IRS capital-gains report (WS6): persisted with
  // the dedup row on first apply; already-applied LEGACY rows (side null, from
  // before 2026-07) get BACKFILLED on re-import instead of re-applied.
  interface OrderMeta {
    side: string; isin: string | null; ticker: string
    qty: number; totalEur: number; ym: string | null; txnTime: string | null
  }
  const newOrderMeta = new Map<string, OrderMeta>()
  const backfillMeta = new Map<string, OrderMeta>()
  let skipped = 0

  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) { skipped++; continue }
    const it = raw as Record<string, unknown>
    const name = stripFormulaPrefix(typeof it.name === 'string' ? it.name.trim().slice(0, 80) : '')
    const ticker = typeof it.ticker === 'string' ? it.ticker.trim().toUpperCase().slice(0, 20) : ''
    const isin = typeof it.isin === 'string' && ISIN_RE.test(it.isin.toUpperCase()) ? it.isin.toUpperCase() : null
    if (!ticker || !Array.isArray(it.txns)) { skipped++; continue }

    const match = (isin ? byIsin.get(isin) : undefined) ?? byTicker.get(ticker) ?? null

    // Seed running state from the existing holding (or empty for a new one).
    let qty = match ? match.qty : 0
    let cost = match ? match.invested : 0
    let value = match ? match.value : 0

    const orders = (it.txns as unknown[])
      .map((t) => (typeof t === 'object' && t ? (t as Record<string, unknown>) : {}))
      .filter((t) => t.side === 'buy' || t.side === 'sell')
      .map((t) => ({
        side: t.side as 'buy' | 'sell',
        shares: Math.abs(Number(t.shares)) || 0,
        total: Math.abs(Number(t.total)) || 0,
        ym: typeof t.ym === 'string' && YM_RE.test(t.ym) ? t.ym : null,
        orderId: typeof t.orderId === 'string' && t.orderId.trim() ? t.orderId.trim().slice(0, 64) : null,
        time: typeof t.time === 'string' ? t.time : '',
      }))
      .filter((t) => t.shares > 0)
      .sort((a, b) => (a.time || '9999').localeCompare(b.time || '9999'))

    const flowByYm = new Map<string, number>()
    let appliedAny = false
    for (const o of orders) {
      const meta: OrderMeta = {
        side: o.side, isin, ticker, qty: o.shares, totalEur: o.total,
        ym: o.ym, txnTime: o.time ? o.time.slice(0, 32) : null,
      }
      if (o.orderId && applied.has(o.orderId)) {
        // Already applied → idempotent skip; queue a backfill ONLY for legacy
        // dedup rows that predate the gains columns (side still null).
        if (needsBackfill.has(o.orderId)) backfillMeta.set(o.orderId, meta)
        skipped++
        continue
      }
      if (o.side === 'buy') {
        qty += o.shares; cost += o.total; value += o.total
        if (o.ym) flowByYm.set(o.ym, (flowByYm.get(o.ym) ?? 0) + o.total)
      } else if (qty > 1e-9) {
        const sold = Math.min(o.shares, qty)
        cost -= (cost / qty) * sold
        value -= (value / qty) * sold
        qty -= sold
      }
      appliedAny = true
      if (o.orderId) { newOrderMeta.set(o.orderId, meta); applied.add(o.orderId) }
    }
    if (!appliedAny) continue // every order already applied → no change for this instrument

    const newFlows = [...flowByYm.entries()].map(([ym, amount]) => ({ ym, amount: round2(amount) }))
    if (match) {
      if (qty <= 1e-6) {
        plans.push({ action: 'delete', assetId: match.id, name, ticker, isin, qty: 0, invested: 0, value: 0, newFlows: [] })
      } else {
        plans.push({ action: 'update', assetId: match.id, name, ticker, isin, qty: round8(qty), invested: Math.max(0, round2(cost)), value: Math.max(0, round2(value)), newFlows })
      }
    } else if (qty > 1e-6) {
      plans.push({ action: 'create', name, ticker, isin, qty: round8(qty), invested: Math.max(0, round2(cost)), value: Math.max(0, round2(value)), newFlows })
    }
    // else: sell of an un-held instrument → no holding to touch; orders are still recorded below.
  }

  let created = 0, updated = 0, closed = 0
  if (plans.length > 0 || newOrderMeta.size > 0) {
    await prisma.$transaction(async (tx) => {
      for (const p of plans) {
        if (p.action === 'delete') {
          await tx.portfolioAsset.delete({ where: { id: p.assetId } }); closed++
        } else if (p.action === 'update') {
          await tx.portfolioAsset.update({ where: { id: p.assetId }, data: { qty: p.qty, invested: p.invested, value: p.value, source: BROKER_SOURCE } })
          if (p.newFlows.length > 0) await tx.portfolioFlow.createMany({ data: p.newFlows.map((f) => ({ assetId: p.assetId!, ym: f.ym, amount: f.amount })) })
          updated++
        } else {
          await tx.portfolioAsset.create({ data: { userId, name: p.name || p.ticker, ticker: p.ticker, isin: p.isin, qty: p.qty, invested: p.invested, value: p.value, source: BROKER_SOURCE, ...(p.newFlows.length > 0 ? { flows: { create: p.newFlows } } : {}) } })
          created++
        }
      }
      if (newOrderMeta.size > 0) {
        // Already-applied ids were filtered out and the Map de-dupes, so no
        // constraint clash. (skipDuplicates isn't supported on SQLite dev.)
        await tx.importedTxn.createMany({
          data: [...newOrderMeta.entries()].map(([externalId, m]) => ({
            userId, source: BROKER_SOURCE, externalId, ...m,
          })),
        })
      }
    })
  }

  // Backfill LEGACY dedup rows (pre-2026-07, no gains columns) OUTSIDE the
  // atomic transaction: it's independent, idempotent, metadata-only work — a
  // multi-year first re-import can carry thousands of rows and must not blow
  // the 5s interactive-transaction budget (it would roll back the holdings
  // update AND retry the same oversized batch forever). Chunked writes; the
  // `side: null` guard makes each write safe to repeat and means a partial
  // failure simply leaves the remainder for the next re-import.
  if (backfillMeta.size > 0) {
    const entries = [...backfillMeta.entries()]
    const CHUNK = 25
    for (let i = 0; i < entries.length; i += CHUNK) {
      await Promise.all(entries.slice(i, i + CHUNK).map(([externalId, m]) =>
        prisma.importedTxn.updateMany({
          where: { userId, source: BROKER_SOURCE, externalId, side: null },
          data: m,
        }),
      ))
    }
  }
  return { created, updated, closed, skipped }
}

// POST /api/portfolio/transactions — reconciling CSV import (buys + sells).
router.post('/transactions', async (req, res) => {
  const items = req.body?.items
  if (!Array.isArray(items)) { res.status(400).json({ error: 'items deve ser um array' }); return }
  if (items.length === 0) { res.status(400).json({ error: 'Nada para importar' }); return }
  if (items.length > 500) { res.status(400).json({ error: 'Demasiados ativos (máx. 500 por importação)' }); return }
  try {
    const summary = await applyPortfolioTransactions(req.session.userId!, items)
    const changed = summary.created + summary.updated + summary.closed
    res.status(changed > 0 ? 201 : 200).json({ ok: true, summary })
  } catch (err) {
    console.error('POST /api/portfolio/transactions failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── Snapshot reconcile (live broker sync) ────────────────────────
// The live API returns the AUTHORITATIVE current snapshot, so a position's
// absence means it was sold. Updates each holding to match the snapshot, creates
// new ones, and CLOSES broker-sourced holdings no longer present. Manual
// holdings are never auto-removed. With `apply:false` it only computes the plan
// (for a confirm step) — nothing is written.
export async function reconcileBrokerSnapshot(
  userId: string,
  items: unknown[],
  opts: { apply: boolean },
): Promise<{ created: number; updated: number; closed: number; closing: string[] }> {
  const existing = await prisma.portfolioAsset.findMany({ where: { userId } })
  const byIsin = new Map<string, (typeof existing)[number]>()
  const byTicker = new Map<string, (typeof existing)[number]>()
  for (const a of existing) {
    if (a.isin) byIsin.set(a.isin.toUpperCase(), a)
    byTicker.set(a.ticker.toUpperCase(), a)
  }

  const matchedIds = new Set<string>()
  const toUpdate: Array<{ id: string; qty: number; invested: number; value: number }> = []
  const toCreate: Array<{ name: string; ticker: string; isin: string | null; qty: number; invested: number; value: number }> = []

  for (const raw of items) {
    if (typeof raw !== 'object' || raw === null) continue
    const it = raw as Record<string, unknown>
    const ticker = typeof it.ticker === 'string' ? it.ticker.trim().toUpperCase().slice(0, 20) : ''
    const qty = Number(it.qty)
    if (!ticker || !Number.isFinite(qty) || qty <= 0) continue
    const isin = typeof it.isin === 'string' && ISIN_RE.test(it.isin.toUpperCase()) ? it.isin.toUpperCase() : null
    const name = stripFormulaPrefix(typeof it.name === 'string' ? it.name.trim().slice(0, 80) : ticker)
    const invested = Math.max(0, round2(Number(it.invested) || 0))
    const value = Math.max(0, round2(Number(it.value ?? it.invested) || 0))
    const match = (isin ? byIsin.get(isin) : undefined) ?? byTicker.get(ticker) ?? null
    if (match) { matchedIds.add(match.id); toUpdate.push({ id: match.id, qty: round8(qty), invested, value }) }
    else toCreate.push({ name, ticker, isin, qty: round8(qty), invested, value })
  }

  // Broker-sourced holdings absent from the snapshot → fully sold → close.
  const toClose = existing.filter((a) => a.source === BROKER_SOURCE && !matchedIds.has(a.id))

  if (opts.apply && (toUpdate.length || toCreate.length || toClose.length)) {
    await prisma.$transaction(async (tx) => {
      for (const u of toUpdate) await tx.portfolioAsset.update({ where: { id: u.id }, data: { qty: u.qty, invested: u.invested, value: u.value, source: BROKER_SOURCE } })
      for (const c of toCreate) await tx.portfolioAsset.create({ data: { userId, name: c.name || c.ticker, ticker: c.ticker, isin: c.isin, qty: c.qty, invested: c.invested, value: c.value, source: BROKER_SOURCE } })
      for (const a of toClose) await tx.portfolioAsset.delete({ where: { id: a.id } })
    })
  }
  return { created: toCreate.length, updated: toUpdate.length, closed: toClose.length, closing: toClose.map((a) => a.name) }
}

// ── PUT /api/portfolio/assets/:id ────────────────────────────────
router.put('/assets/:id', async (req, res) => {
  const { id } = req.params
  const errors: Record<string, string> = {}

  // Only update fields that were sent; this lets the UI patch e.g. only `monthly`
  const data: Record<string, unknown> = {}
  if (req.body?.name !== undefined)    data.name = stripFormulaPrefix(asString(req.body.name, 'name', errors, 1, 80))
  if (req.body?.ticker !== undefined)  data.ticker = asString(req.body.ticker, 'ticker', errors, 1, 20).toUpperCase()
  if (req.body?.qty !== undefined)     data.qty = asPositiveNumber(req.body.qty, 'qty', errors)
  if (req.body?.invested !== undefined) data.invested = asNumber(req.body.invested, 'invested', errors)
  if (req.body?.value !== undefined)   data.value = asNumber(req.body.value, 'value', errors)
  if (req.body?.monthly !== undefined) data.monthly = asNumber(req.body.monthly, 'monthly', errors)
  if (req.body?.expectedReturn !== undefined) {
    data.expectedReturn = asNumber(req.body.expectedReturn, 'expectedReturn', errors)
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors }); return
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Nada para atualizar' }); return
  }

  try {
    const asset = await prisma.portfolioAsset.findUnique({ where: { id } })
    if (!asset || asset.userId !== req.session.userId) {
      res.status(404).json({ error: 'Ativo não encontrado' }); return
    }
    const updated = await prisma.portfolioAsset.update({ where: { id }, data })
    res.json({ asset: updated })
  } catch (err) {
    console.error('PUT /api/portfolio/assets/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/portfolio/assets/:id ─────────────────────────────
router.delete('/assets/:id', async (req, res) => {
  const { id } = req.params
  try {
    const asset = await prisma.portfolioAsset.findUnique({ where: { id } })
    if (!asset || asset.userId !== req.session.userId) {
      res.status(404).json({ error: 'Ativo não encontrado' }); return
    }
    await prisma.portfolioAsset.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/portfolio/assets/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/portfolio/assets/:id/reforcar ──────────────────────
// Records a one-off contribution to an asset.
//   • If `price` is provided: qty grows by amount/price, value = qty * price.
//   • If `price` is omitted: qty unchanged, value grows by amount (assumes
//     no market move).
// invested always grows by amount. A PortfolioFlow row is created.
router.post('/assets/:id/reforcar', async (req, res) => {
  const { id } = req.params
  const errors: Record<string, string> = {}
  const amount = asPositiveNumber(req.body?.amount, 'amount', errors)
  const ymRaw = req.body?.ym ?? new Date().toISOString().slice(0, 7)
  if (typeof ymRaw !== 'string' || !YM_RE.test(ymRaw)) errors.ym = 'Formato AAAA-MM'
  const ym = ymRaw as string

  // The price field accepts: a number (manual EUR price per share), null
  // (no price → just bump invested + value by amount), or the magic string
  // "market" / boolean flag `useMarketPrice: true` (auto-fetch from Yahoo+FX).
  const useMarketPrice = req.body?.useMarketPrice === true || req.body?.price === 'market'
  let priceEur: number | null = null
  if (!useMarketPrice && req.body?.price !== undefined && req.body.price !== null && req.body.price !== '') {
    const n = Number(req.body.price)
    if (!Number.isFinite(n) || n <= 0) errors.price = 'price > 0'
    else priceEur = n
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors }); return
  }

  try {
    const asset = await prisma.portfolioAsset.findUnique({ where: { id } })
    if (!asset || asset.userId !== req.session.userId) {
      res.status(404).json({ error: 'Ativo não encontrado' }); return
    }

    // Auto-fetch market price (with FX) if requested
    let priceMeta: {
      nativePrice: number; currency: string;
      fxRate: number; resolvedSymbol: string
    } | null = null
    if (useMarketPrice) {
      const chart = await getYahooChart(asset.ticker)
      if (!chart || !chart.currentPrice) {
        res.status(502).json({ error: `Sem cotação para ${asset.ticker}` }); return
      }
      const converted = await convertPrice(chart.currentPrice, chart.currency, PORTFOLIO_CCY)
      if (!converted) {
        res.status(502).json({ error: `Sem câmbio ${chart.currency}→${PORTFOLIO_CCY}` }); return
      }
      priceEur = converted.price
      priceMeta = {
        nativePrice: chart.currentPrice,
        currency: chart.currency,
        fxRate: converted.rate,
        resolvedSymbol: chart.resolvedSymbol,
      }
    }

    // Cost basis ALWAYS grows by exactly what the user put in
    const newInvested = asset.invested + amount
    let newQty = asset.qty
    let newValue: number
    if (priceEur !== null) {
      newQty = asset.qty + amount / priceEur
      newValue = newQty * priceEur
    } else {
      // No price provided → assume no market move; qty stays, value grows by amount
      newValue = asset.value + amount
    }

    const [updated, flow] = await prisma.$transaction([
      prisma.portfolioAsset.update({
        where: { id },
        data: { qty: newQty, invested: newInvested, value: newValue },
      }),
      prisma.portfolioFlow.create({
        data: { assetId: id, ym, amount },
      }),
    ])

    res.json({ asset: updated, flow, priceEur, priceMeta })
  } catch (err) {
    console.error('POST /reforcar failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// Compute an asset's refreshed EUR value from the current market price.
// Imported assets (`isin` set) carry a broker-accurate `qty`, so their market
// value is simply qty × price — they show real gain/loss immediately instead of
// staying anchored to their imported cost basis. Manually-entered/legacy assets
// instead scale the user-curated value by the price change since the last
// refresh (their `qty` may be an unreliable placeholder); the first refresh has
// no baseline, so the value is kept as-is.
function refreshedValue(
  asset: { qty: number; value: number; lastPriceEur: number | null; isin: string | null },
  priceEur: number,
): number {
  if (asset.isin) return round2(asset.qty * priceEur)
  return asset.lastPriceEur && asset.lastPriceEur > 0
    ? round2(asset.value * (priceEur / asset.lastPriceEur))
    : round2(asset.value)
}

// ── POST /api/portfolio/assets/:id/refresh-value ────────────────
// Fetches the current market price from Yahoo and updates the asset's `value`.
// Imported assets → qty × price; manual/legacy → scaled by price movement.
router.post('/assets/:id/refresh-value', async (req, res) => {
  const { id } = req.params
  try {
    const asset = await prisma.portfolioAsset.findUnique({ where: { id } })
    if (!asset || asset.userId !== req.session.userId) {
      res.status(404).json({ error: 'Ativo não encontrado' }); return
    }
    const chart = await getYahooChart(asset.ticker)
    if (!chart || !chart.currentPrice) {
      res.status(502).json({
        error: `Sem cotação para ${asset.ticker}`,
        resolvedSymbol: null,
      })
      return
    }

    // Convert the market price to the portfolio's currency (EUR)
    const converted = await convertPrice(chart.currentPrice, chart.currency, PORTFOLIO_CCY)
    if (!converted) {
      res.status(502).json({
        error: `Sem taxa de câmbio ${chart.currency} → ${PORTFOLIO_CCY} para ${asset.ticker}`,
        resolvedSymbol: chart.resolvedSymbol,
      })
      return
    }
    const newValue = refreshedValue(asset, converted.price)
    const updated = await prisma.portfolioAsset.update({
      where: { id },
      data: { value: newValue, lastPriceEur: converted.price },
    })
    res.json({
      asset: updated,
      price: chart.currentPrice,          // native-currency price
      priceInEur: converted.price,         // EUR per share
      fxRate: converted.rate,
      currency: chart.currency,
      resolvedSymbol: chart.resolvedSymbol,
      previousValue: asset.value,
      newValue,
    })
  } catch (err) {
    console.error(`refresh-value failed:`, err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/portfolio/refresh-values ──────────────────────────
// Bulk: refresh every asset's value. Returns per-asset success/error so the
// UI can flag the ones Yahoo couldn't resolve.
router.post('/refresh-values', async (req, res) => {
  try {
    const userId = req.session.userId!
    const assets = await prisma.portfolioAsset.findMany({ where: { userId } })

    const results = await Promise.all(assets.map(async (asset) => {
      const chart = await getYahooChart(asset.ticker)
      if (!chart || !chart.currentPrice) {
        return { id: asset.id, ticker: asset.ticker, ok: false as const, error: 'No quote' }
      }
      const converted = await convertPrice(chart.currentPrice, chart.currency, PORTFOLIO_CCY)
      if (!converted) {
        return {
          id: asset.id, ticker: asset.ticker, ok: false as const,
          error: `No FX ${chart.currency}→${PORTFOLIO_CCY}`,
        }
      }
      const newValue = refreshedValue(asset, converted.price)
      await prisma.portfolioAsset.update({
        where: { id: asset.id },
        data: { value: newValue, lastPriceEur: converted.price },
      })
      return {
        id: asset.id,
        ticker: asset.ticker,
        ok: true as const,
        price: chart.currentPrice,
        priceInEur: converted.price,
        fxRate: converted.rate,
        currency: chart.currency,
        resolvedSymbol: chart.resolvedSymbol,
        previousValue: asset.value,
        newValue,
      }
    }))

    res.json({
      results,
      summary: {
        updated: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    })
  } catch (err) {
    console.error('bulk refresh-values failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── PUT /api/portfolio/settings ──────────────────────────────────
router.put('/settings', async (req, res) => {
  const errors: Record<string, string> = {}
  const gInc = req.body?.gInc !== undefined ? asNumber(req.body.gInc, 'gInc', errors) : undefined
  const gFY  = req.body?.gFY  !== undefined ? asNumber(req.body.gFY,  'gFY',  errors) : undefined
  const gH   = req.body?.gH   !== undefined ? asNumber(req.body.gH,   'gH',   errors) : undefined

  if (gH !== undefined && (gH < 1 || gH > 60)) errors.gH = 'gH entre 1 e 60'

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors }); return
  }

  const watchlistSymbols = normalizeWatchlist(req.body?.watchlistSymbols)

  // Validate language: accept 'pt' | 'en'; silently skip anything else.
  // undefined = caller didn't send → don't touch the stored value.
  // null = explicit clear.
  const VALID_LANGUAGES = ['pt', 'en'] as const
  type Language = typeof VALID_LANGUAGES[number]
  let language: Language | null | undefined = undefined
  if (req.body?.language !== undefined) {
    const raw = req.body.language
    if (raw === null) {
      language = null
    } else if (VALID_LANGUAGES.includes(raw as Language)) {
      language = raw as Language
    }
    // invalid string → leave language as undefined (skip, don't error)
  }

  try {
    const settings = await prisma.portfolioSettings.upsert({
      where: { userId: req.session.userId! },
      create: {
        userId: req.session.userId!,
        gInc: gInc ?? 3,
        gFY:  gFY  ?? 2,
        gH:   gH   ?? 20,
        watchlistSymbols: watchlistSymbols ?? null,
        language: language ?? null,
      },
      update: {
        ...(gInc !== undefined ? { gInc: Math.round(gInc) } : {}),
        ...(gFY  !== undefined ? { gFY:  Math.round(gFY)  } : {}),
        ...(gH   !== undefined ? { gH:   Math.round(gH)   } : {}),
        ...(watchlistSymbols !== undefined ? { watchlistSymbols } : {}),
        ...(language !== undefined ? { language } : {}),
      },
    })
    res.json({ settings })
  } catch (err) {
    console.error('PUT /api/portfolio/settings failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
