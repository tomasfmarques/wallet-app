// ── Yahoo Finance proxy ──────────────────────────────────────────
// Free, no API key needed, covers global exchanges. Uses the unofficial
// /v8/finance/chart/<SYMBOL> endpoint which returns:
//   - meta.regularMarketPrice (current spot price)
//   - meta.currency
//   - timestamp[]   (unix seconds, monthly cadence)
//   - indicators.adjclose[0].adjclose[]  (split/dividend adjusted closes)
//   - indicators.quote[0].close[]        (raw closes — fallback)
//
// We try the raw symbol first, then probe a small list of common exchange
// suffixes so European ETFs (IWDA → IWDA.L) and Asian stocks (SMSN → 005930.KS)
// can resolve too.

interface YahooChartResult {
  meta?: {
    symbol?: string
    regularMarketPrice?: number
    previousClose?: number
    chartPreviousClose?: number
    currency?: string
  }
  timestamp?: number[]
  indicators?: {
    adjclose?: Array<{ adjclose?: (number | null)[] }>
    quote?: Array<{ close?: (number | null)[] }>
  }
}
interface YahooChartResponse {
  chart?: { result?: YahooChartResult[]; error?: unknown }
}

export interface YahooChart {
  resolvedSymbol: string
  prices: number[]          // length ≥ 12, monthly cadence, oldest → newest
  currentPrice: number
  previousClose: number
  currency: string
}

interface CacheEntry { data: YahooChart | null; expiry: number }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 60 * 60 * 1000 // 1 hour

// Hand-curated mapping for tickers where the prototype's symbol doesn't match
// Yahoo's convention. Extend as needed.
const SYMBOL_OVERRIDES: Record<string, string> = {
  SMSN: '005930.KS',   // Samsung Electronics, KRX
}

// Suffix probes tried in order. Most users own US (no suffix), then
// London-listed UCITS ETFs (.L), then Xetra (.DE). Rest are best-effort.
const SUFFIX_PROBES = ['', '.L', '.DE', '.MI', '.PA', '.AS', '.HE', '.KS', '.TO']

const UA = 'Mozilla/5.0 (compatible; WalletApp/1.0; +https://wallet.local)'

async function fetchChart(symbol: string): Promise<YahooChart | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=1mo&includePrePost=false`
  let res: Response
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA } })
  } catch {
    return null
  }
  if (!res.ok) return null

  let body: YahooChartResponse
  try { body = await res.json() as YahooChartResponse } catch { return null }

  const r = body.chart?.result?.[0]
  if (!r || !r.meta || typeof r.meta.regularMarketPrice !== 'number') return null

  // Prefer adjclose (split + dividend adjusted). Fall back to raw close.
  const adj = r.indicators?.adjclose?.[0]?.adjclose
  const raw = r.indicators?.quote?.[0]?.close
  const series = adj ?? raw ?? []
  const prices = series.filter((p): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0)

  // Need at least 12 months for any useful CAGR
  if (prices.length < 12) return null

  return {
    resolvedSymbol: r.meta.symbol ?? symbol,
    prices,
    currentPrice: r.meta.regularMarketPrice,
    previousClose: r.meta.previousClose ?? r.meta.chartPreviousClose ?? r.meta.regularMarketPrice,
    currency: r.meta.currency ?? 'USD',
  }
}

/**
 * Resolve a user-supplied ticker against Yahoo. Tries the symbol as-is, then
 * common exchange suffixes. Caches by the input symbol (1h TTL).
 */
export async function getYahooChart(rawSymbol: string): Promise<YahooChart | null> {
  const key = rawSymbol.toUpperCase()
  const hit = cache.get(key)
  if (hit && hit.expiry > Date.now()) return hit.data

  const overridden = SYMBOL_OVERRIDES[key]
  const candidates = overridden
    ? [overridden]
    : SUFFIX_PROBES.map((suf) => key + suf)

  for (const candidate of candidates) {
    const data = await fetchChart(candidate)
    if (data) {
      cache.set(key, { data, expiry: Date.now() + TTL_MS })
      return data
    }
  }

  // Cache the miss so we don't hammer Yahoo for the same bad ticker
  cache.set(key, { data: null, expiry: Date.now() + TTL_MS })
  return null
}

// ── Price history (for the per-stock chart) ──────────────────────
// Returns a timestamped price series for a symbol over a chosen range, so the
// frontend can draw a Trading212-style progression chart. Reuses getYahooChart
// for symbol resolution (suffix probing), then fetches the requested window.

export interface YahooHistory {
  resolvedSymbol: string
  currency: string
  currentPrice: number
  points: { t: number; price: number }[]  // t = unix seconds, oldest → newest
}

// rangeKey → Yahoo (range, interval). Coarser interval for longer windows so
// the payload stays small and the line stays readable.
const RANGE_MAP: Record<string, { range: string; interval: string }> = {
  '1mo': { range: '1mo', interval: '1d' },
  '6mo': { range: '6mo', interval: '1d' },
  '1y':  { range: '1y',  interval: '1d' },
  '5y':  { range: '5y',  interval: '1wk' },
  'max': { range: 'max', interval: '1mo' },
}

const histCache = new Map<string, { data: YahooHistory | null; expiry: number }>()
const HIST_TTL_MS = 15 * 60 * 1000 // 15 min

async function fetchHistory(symbol: string, range: string, interval: string): Promise<YahooHistory | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`
  let res: Response
  try { res = await fetch(url, { headers: { 'User-Agent': UA } }) } catch { return null }
  if (!res.ok) return null

  let body: YahooChartResponse
  try { body = await res.json() as YahooChartResponse } catch { return null }

  const r = body.chart?.result?.[0]
  if (!r || !r.meta || typeof r.meta.regularMarketPrice !== 'number' || !r.timestamp) return null

  const series = r.indicators?.adjclose?.[0]?.adjclose ?? r.indicators?.quote?.[0]?.close ?? []
  const points: { t: number; price: number }[] = []
  for (let i = 0; i < r.timestamp.length; i++) {
    const p = series[i]
    if (typeof p === 'number' && Number.isFinite(p) && p > 0) points.push({ t: r.timestamp[i], price: p })
  }
  if (points.length < 2) return null

  return {
    resolvedSymbol: r.meta.symbol ?? symbol,
    currency: r.meta.currency ?? 'USD',
    currentPrice: r.meta.regularMarketPrice,
    points,
  }
}

export async function getYahooHistory(rawSymbol: string, rangeKey: string): Promise<YahooHistory | null> {
  const mapped = RANGE_MAP[rangeKey] ?? RANGE_MAP['1y']
  // Resolve the symbol once (this also warms getYahooChart's cache).
  const base = await getYahooChart(rawSymbol)
  if (!base) return null

  const cacheKey = `${base.resolvedSymbol}:${rangeKey}`
  const hit = histCache.get(cacheKey)
  if (hit && hit.expiry > Date.now()) return hit.data

  const data = await fetchHistory(base.resolvedSymbol, mapped.range, mapped.interval)
  histCache.set(cacheKey, { data, expiry: Date.now() + HIST_TTL_MS })
  return data
}

// ── CAGR derivation ──────────────────────────────────────────────
export interface CAGRReport {
  symbol: string           // original input
  resolvedSymbol: string   // what Yahoo actually matched (might have a suffix)
  currentPrice: number
  previousClose: number
  currency: string
  // Each CAGR is a percentage (e.g. 18.4 for 18.4%/year). null if not enough
  // data points (e.g. you can't compute a 10-year CAGR for a 3-year-old stock).
  oneYearCAGR: number | null
  threeYearCAGR: number | null
  fiveYearCAGR: number | null
  tenYearCAGR: number | null
  dataPoints: number
}

function cagrAt(prices: number[], monthsBack: number, years: number): number | null {
  const idx = prices.length - 1 - monthsBack
  if (idx < 0) return null
  const start = prices[idx]
  const end = prices[prices.length - 1]
  if (!start || !end || start <= 0) return null
  return (Math.pow(end / start, 1 / years) - 1) * 100
}

export function computeCAGRs(input: string, chart: YahooChart): CAGRReport {
  return {
    symbol: input.toUpperCase(),
    resolvedSymbol: chart.resolvedSymbol,
    currentPrice: chart.currentPrice,
    previousClose: chart.previousClose,
    currency: chart.currency,
    oneYearCAGR:   cagrAt(chart.prices, 12, 1),
    threeYearCAGR: cagrAt(chart.prices, 36, 3),
    fiveYearCAGR:  cagrAt(chart.prices, 60, 5),
    tenYearCAGR:   cagrAt(chart.prices, 120, 10),
    dataPoints: chart.prices.length,
  }
}

// ── Symbol search ─────────────────────────────────────────────────
export interface SearchResult {
  symbol: string
  name: string
  exchange: string
  type: string   // EQUITY | ETF | INDEX | etc.
}

interface SearchCache { results: SearchResult[]; expiry: number }
const searchCache = new Map<string, SearchCache>()
const SEARCH_TTL = 5 * 60 * 1000

export async function searchTickers(query: string): Promise<SearchResult[]> {
  const key = query.toLowerCase()
  const hit = searchCache.get(key)
  if (hit && hit.expiry > Date.now()) return hit.results

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=10&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return []

  const json = await res.json() as {
    quotes?: Array<{
      symbol?: string
      shortname?: string
      longname?: string
      exchange?: string
      quoteType?: string
    }>
  }

  const results: SearchResult[] = (json.quotes ?? [])
    .filter((q) => q.symbol && q.quoteType !== 'CURRENCY' && q.quoteType !== 'MUTUALFUND' && q.quoteType !== 'OPTION')
    .slice(0, 8)
    .map((q) => ({
      symbol:   q.symbol!,
      name:     q.longname ?? q.shortname ?? q.symbol!,
      exchange: q.exchange ?? '',
      type:     q.quoteType ?? '',
    }))

  searchCache.set(key, { results, expiry: Date.now() + SEARCH_TTL })
  return results
}
