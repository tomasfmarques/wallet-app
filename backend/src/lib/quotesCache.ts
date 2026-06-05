// ── In-memory quote cache ────────────────────────────────────────
// Finnhub's free tier is 60 calls/minute. Caching by symbol with a 60s TTL
// keeps us comfortably under the limit even with multiple page loads.
//
// Map lifetime = process lifetime. Restarting the backend clears the cache.
// For multi-instance hosting, swap this for Redis.

interface RawFinnhubQuote {
  c: number   // current price
  d: number   // change vs previous close
  dp: number  // percent change
  h: number   // day high
  l: number   // day low
  o: number   // day open
  pc: number  // previous close
  t: number   // unix timestamp
}

interface CacheEntry {
  data: RawFinnhubQuote
  expiry: number
}

const cache = new Map<string, CacheEntry>()
const TTL_MS = 60_000

const FINNHUB_BASE = 'https://finnhub.io/api/v1/quote'

async function fetchQuote(symbol: string, apiKey: string): Promise<RawFinnhubQuote> {
  const url = `${FINNHUB_BASE}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub returned HTTP ${res.status}`)
  return res.json() as Promise<RawFinnhubQuote>
}

/** Fetch a symbol's quote, using the cache when fresh. */
export async function getQuoteCached(symbol: string, apiKey: string): Promise<RawFinnhubQuote> {
  const hit = cache.get(symbol)
  if (hit && hit.expiry > Date.now()) return hit.data
  const data = await fetchQuote(symbol, apiKey)
  cache.set(symbol, { data, expiry: Date.now() + TTL_MS })
  return data
}

/** Public shape returned to the client (snake-case → camel-case, no key leak). */
export interface PublicQuote {
  symbol: string
  current: number
  change: number
  percentChange: number
  previousClose: number
  error?: string
}

// ── Metric cache (1 hour TTL) ────────────────────────────────────
// Used for "rough average return" hints in the AssetModal. Metric data
// changes daily at most, so we cache more aggressively than live quotes.

interface MetricEntry {
  // Loose typing — Finnhub returns 100+ fields, we cherry-pick what we need
  data: { metric?: Record<string, unknown> }
  expiry: number
}

const metricCache = new Map<string, MetricEntry>()
const METRIC_TTL_MS = 60 * 60 * 1000

const FINNHUB_METRIC = 'https://finnhub.io/api/v1/stock/metric'

export async function getMetricCached(
  symbol: string,
  apiKey: string,
): Promise<MetricEntry['data']> {
  const hit = metricCache.get(symbol)
  if (hit && hit.expiry > Date.now()) return hit.data

  const url = `${FINNHUB_METRIC}?symbol=${encodeURIComponent(symbol)}&metric=all&token=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Finnhub metric returned HTTP ${res.status}`)
  const data = (await res.json()) as MetricEntry['data']
  metricCache.set(symbol, { data, expiry: Date.now() + METRIC_TTL_MS })
  return data
}

/** Distilled, client-facing metric shape. */
export interface PublicMetric {
  symbol: string
  oneYearReturn: number | null    // % (e.g. 25.3 → +25.3%)
  threeYearReturn: number | null
  fiveYearReturn: number | null
  tenYearReturn: number | null
  ytdReturn: number | null
  beta: number | null
  error?: string
}
