import { useQuery } from 'react-query'
import { api, ApiError } from '@/lib/api'

export interface TickerSearchResult {
  symbol: string
  name: string
  exchange: string
  type: string
}

export function useTickerSearch(query: string) {
  const q = query.trim()
  return useQuery<{ results: TickerSearchResult[] }, ApiError>(
    ['ticker-search', q],
    () => api.get<{ results: TickerSearchResult[] }>(`/api/quotes/search?q=${encodeURIComponent(q)}`),
    {
      enabled: q.length >= 2,
      staleTime: 5 * 60 * 1000,
      retry: 0,
      keepPreviousData: true,
    },
  )
}

export interface Quote {
  symbol: string
  current: number
  change: number
  percentChange: number
  previousClose: number
  error?: string
}

interface QuotesResponse {
  quotes: Quote[]
}

// ── Default watchlist + known-name lookup ────────────────────────
// The list of tickers can be overridden per-user via Configurações →
// Watchlist. KNOWN_NAMES is a static map: when the user adds a custom
// ticker we display the friendly name if we know it, else the ticker itself.
export const DEFAULT_WATCHLIST_SYMBOLS = [
  'NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD',
] as const

const KNOWN_NAMES: Record<string, string> = {
  NVDA:  'NVIDIA',
  AAPL:  'Apple',
  MSFT:  'Microsoft',
  GOOGL: 'Alphabet (Google)',
  GOOG:  'Alphabet (Google)',
  AMZN:  'Amazon',
  META:  'Meta Platforms',
  TSLA:  'Tesla',
  AMD:   'AMD',
  INTC:  'Intel',
  NFLX:  'Netflix',
  DIS:   'Walt Disney',
  KO:    'Coca-Cola',
  PEP:   'PepsiCo',
  V:     'Visa',
  MA:    'Mastercard',
  JPM:   'JPMorgan Chase',
  BRK:   'Berkshire Hathaway',
}

export function nameForSymbol(symbol: string): string {
  return KNOWN_NAMES[symbol.toUpperCase()] ?? symbol.toUpperCase()
}

/** Resolve the user's actual watchlist, falling back to the app default. */
export function resolveWatchlist(stored: string | null | undefined): Array<{ symbol: string; name: string }> {
  const raw = (stored ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  const symbols = raw.length > 0 ? raw : Array.from(DEFAULT_WATCHLIST_SYMBOLS)
  return symbols.map((symbol) => ({ symbol, name: nameForSymbol(symbol) }))
}

// ── CAGR metric (Yahoo Finance, multi-period annualized returns) ─
export interface AssetMetric {
  symbol: string
  resolvedSymbol: string | null
  currentPrice: number | null
  previousClose: number | null
  currency: string | null
  oneYearCAGR: number | null
  threeYearCAGR: number | null
  fiveYearCAGR: number | null
  tenYearCAGR: number | null
  dataPoints: number
}

export function useAssetMetric(symbol: string | undefined) {
  const upper = symbol?.trim().toUpperCase()
  return useQuery<AssetMetric, ApiError>(
    ['cagr', upper],
    () => api.get<AssetMetric>(`/api/quotes/cagr?symbol=${encodeURIComponent(upper!)}`),
    {
      enabled: !!upper && upper.length >= 1,
      staleTime: 60 * 60 * 1000, // 1h — matches backend cache
      retry: 0,                  // 1-shot; failure shows no hint
    },
  )
}

export interface CagrWindow {
  value: number
  label: string  // "10a", "5a", "3a", "1a"
  longLabel: string
}

/** Returns every available CAGR window as buttons can offer the user. */
export function availableCAGRs(m?: AssetMetric | null): CagrWindow[] {
  if (!m) return []
  const out: CagrWindow[] = []
  if (m.tenYearCAGR   != null) out.push({ value: m.tenYearCAGR,   label: '10a', longLabel: '10 anos' })
  if (m.fiveYearCAGR  != null) out.push({ value: m.fiveYearCAGR,  label: '5a',  longLabel: '5 anos' })
  if (m.threeYearCAGR != null) out.push({ value: m.threeYearCAGR, label: '3a',  longLabel: '3 anos' })
  if (m.oneYearCAGR   != null) out.push({ value: m.oneYearCAGR,   label: '1a',  longLabel: '1 ano' })
  return out
}

// ── Price history (per-stock progression chart) ──────────────────
export type HistoryRange = '1mo' | '6mo' | '1y' | '5y' | 'max'

export interface StockHistory {
  symbol: string
  range: string
  resolvedSymbol: string | null
  currency: string | null
  currentPrice: number | null
  points: { t: number; price: number }[]
  error?: string
}

export function useStockHistory(symbol: string | undefined, range: HistoryRange) {
  const upper = symbol?.trim().toUpperCase()
  return useQuery<StockHistory, ApiError>(
    ['history', upper, range],
    () => api.get<StockHistory>(`/api/quotes/history?symbol=${encodeURIComponent(upper!)}&range=${range}`),
    {
      enabled: !!upper && upper.length >= 1,
      staleTime: 15 * 60 * 1000, // matches backend cache
      retry: 0,
      keepPreviousData: true,    // smooth range switches
    },
  )
}

export function useQuotes(symbols: string[]) {
  const key = symbols.join(',').toUpperCase()
  return useQuery<QuotesResponse, ApiError>(
    ['quotes', key],
    () => api.get<QuotesResponse>(`/api/quotes?symbols=${encodeURIComponent(key)}`),
    {
      // Mirror backend cache TTL — no need to re-fetch sooner
      staleTime: 60 * 1000,
      // Refresh every minute when the tab is visible
      refetchInterval: 60 * 1000,
      refetchIntervalInBackground: false,
      enabled: symbols.length > 0,
      retry: 1,
    },
  )
}
