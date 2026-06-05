import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import {
  getQuoteCached, getMetricCached,
  type PublicQuote, type PublicMetric,
} from '../lib/quotesCache'
import { getYahooChart, computeCAGRs } from '../lib/yahooFinance'

// Pluck a numeric metric, return null if missing/non-numeric
function num(m: Record<string, unknown> | undefined, key: string): number | null {
  const v = m?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

const router = Router()
router.use(requireAuth)

const MAX_SYMBOLS = 20

// ── GET /api/quotes?symbols=NVDA,AAPL,... ─────────────────────────
// Proxies live Finnhub quotes. The API key never leaves the server.
// Results are cached for 60 seconds per symbol. One bad symbol does not
// poison the response — individual failures are returned per-symbol with
// an `error` field instead of crashing the whole request.
router.get('/', async (req, res) => {
  const symbolsParam = req.query.symbols as string | undefined
  if (!symbolsParam) {
    res.status(400).json({ error: 'symbols query param required' })
    return
  }

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'Finnhub API key not configured' })
    return
  }

  // Dedupe + normalize + cap
  const symbols = Array.from(
    new Set(
      symbolsParam
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).slice(0, MAX_SYMBOLS)

  if (symbols.length === 0) {
    res.json({ quotes: [] })
    return
  }

  // Fetch all in parallel; isolate failures per symbol
  const results: PublicQuote[] = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const q = await getQuoteCached(symbol, apiKey)
        // Finnhub returns c=0 for unknown symbols
        if (!q.c) {
          return { symbol, current: 0, change: 0, percentChange: 0, previousClose: 0, error: 'No data' }
        }
        return {
          symbol,
          current: q.c,
          change: q.d ?? 0,
          percentChange: q.dp ?? 0,
          previousClose: q.pc ?? 0,
        }
      } catch (err) {
        // Don't log the URL (contains the key) — log just the message
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`Quote fetch failed for ${symbol}: ${msg}`)
        return { symbol, current: 0, change: 0, percentChange: 0, previousClose: 0, error: 'Fetch failed' }
      }
    }),
  )

  res.json({ quotes: results })
})

// ── GET /api/quotes/metric?symbol=NVDA ────────────────────────────
// Returns a distilled metrics object for one ticker — the bits we actually
// use to populate "expected return" hints. Multi-year return fields may be
// null if Finnhub's free tier doesn't include them for this ticker.
router.get('/metric', async (req, res) => {
  const symbol = (req.query.symbol as string | undefined)?.toUpperCase()
  if (!symbol) {
    res.status(400).json({ error: 'symbol query param required' })
    return
  }

  const apiKey = process.env.FINNHUB_API_KEY
  if (!apiKey) {
    res.status(503).json({ error: 'Finnhub API key not configured' })
    return
  }

  try {
    const data = await getMetricCached(symbol, apiKey)
    const m = data.metric

    const out: PublicMetric = {
      symbol,
      // Finnhub's field names — try multiple casings to be safe
      oneYearReturn:   num(m, '52WeekPriceReturnDaily'),
      threeYearReturn: num(m, 'priceReturn3Y') ?? num(m, '3YearPriceReturn'),
      fiveYearReturn:  num(m, 'priceReturn5Y') ?? num(m, '5YearPriceReturn'),
      tenYearReturn:   num(m, 'priceReturn10Y') ?? num(m, '10YearPriceReturn'),
      ytdReturn:       num(m, 'yearToDatePriceReturnDaily'),
      beta:            num(m, 'beta'),
    }
    res.json(out)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`Metric fetch failed for ${symbol}: ${msg}`)
    res.status(502).json({ error: 'Failed to fetch metrics' })
  }
})

// ── GET /api/quotes/cagr?symbol=X ─────────────────────────────────
// Returns annualized historical returns (CAGR) over 1/3/5/10 years from Yahoo
// Finance. Free, no API key, covers global exchanges (auto-probes .L, .DE,
// etc.). Used by the AssetModal to populate the "expected return" hint with
// stable multi-year numbers instead of a volatile 1-year price change.
router.get('/cagr', async (req, res) => {
  const symbol = (req.query.symbol as string | undefined)?.toUpperCase()
  if (!symbol) {
    res.status(400).json({ error: 'symbol query param required' })
    return
  }

  try {
    const chart = await getYahooChart(symbol)
    if (!chart) {
      res.json({
        symbol, resolvedSymbol: null,
        currentPrice: null, previousClose: null, currency: null,
        oneYearCAGR: null, threeYearCAGR: null,
        fiveYearCAGR: null, tenYearCAGR: null,
        dataPoints: 0, error: 'No data',
      })
      return
    }
    res.json(computeCAGRs(symbol, chart))
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error(`CAGR fetch failed for ${symbol}: ${msg}`)
    res.status(502).json({ error: 'Failed to fetch historical data' })
  }
})

export default router
