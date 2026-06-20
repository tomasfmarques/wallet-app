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

// Portfolio is reported in EUR. Yahoo returns prices in the native exchange
// currency; we convert via Frankfurter before persisting.
const PORTFOLIO_CCY = 'EUR'

const router = Router()
router.use(requireAuth)

// Round to 2 decimals — keeps stored/displayed values clean (no 45.86789…).
const round2 = (n: number) => Math.round(n * 100) / 100

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

// ── POST /api/portfolio/assets/:id/refresh-value ────────────────
// Fetches the current market price from Yahoo and updates the asset's `value`
// to `qty * currentPrice`. Returns the updated asset plus diagnostic info.
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
    // Move `value` by the market's price change since the last refresh, rather
    // than recomputing qty*price (qty is often an unreliable placeholder, which
    // made refresh wildly break the user-curated value). First refresh has no
    // baseline → keep value as-is and just record the price.
    const newValue = asset.lastPriceEur && asset.lastPriceEur > 0
      ? round2(asset.value * (converted.price / asset.lastPriceEur))
      : round2(asset.value)
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
      // Scale value by price movement (see single-refresh route for rationale).
      const newValue = asset.lastPriceEur && asset.lastPriceEur > 0
        ? round2(asset.value * (converted.price / asset.lastPriceEur))
        : round2(asset.value)
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
