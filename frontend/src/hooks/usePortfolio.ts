import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'
import type { PortfolioAsset, PortfolioFlow, PortfolioSettings } from '@/types'

// ── Server response shapes ───────────────────────────────────────
export interface AssetWithFlows extends PortfolioAsset {
  flows: PortfolioFlow[]
}

export interface PortfolioProjectionData {
  perAsset: Array<{
    id: string
    name: string
    ticker: string
    rows: number[]
    finalValue: number
    totalContributed: number
  }>
  totalRows: number[]
  initialTotal: number
  finalTotal: number
  totalContributed: number
  totalReturn: number
}

export interface PortfolioKpisData {
  valorAtual: number
  jaInvestido: number
  ganhoPerda: number
  ganhoPerdaPct: number
  reforcoMensalTotal: number
  numAtivos: number
  projecaoFinal: number
}

export interface PortfolioResponse {
  assets: AssetWithFlows[]
  settings: PortfolioSettings & { id: string; userId: string }
  projection: PortfolioProjectionData
  kpis: PortfolioKpisData
}

export interface AssetInputBody {
  name: string
  ticker: string
  qty: number
  invested: number
  value: number
  monthly: number
  expectedReturn: number
}

export interface ReforcarInputBody {
  amount: number
  ym?: string
  /** EUR price per share. Omit + set useMarketPrice for auto-fetch. */
  price?: number
  /** Auto-fetch current market price from Yahoo+FX (backend does the math). */
  useMarketPrice?: boolean
}

// ── Risk (annualized volatility) ─────────────────────────────────
export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'muito_alto'

export interface AssetRisk {
  id: string
  name: string
  ticker: string
  value: number
  volatility: number | null   // annualized %
  level: RiskLevel | null
}
export interface PortfolioRiskResponse {
  assets: AssetRisk[]
  portfolio: {
    volatility: number | null        // headline (correlation-aware when modeled)
    level: RiskLevel | null
    coverage: number
    weightedVolatility: number | null // value-weighted (no correlation)
    correlationModeled: boolean       // true when covariance was used
  }
}

// Lazy + cached 30 min: hits Yahoo per holding, so we don't want it on every
// portfolio render. `enabled` lets callers defer until they actually need it.
export function usePortfolioRisk(enabled = true) {
  return useQuery<PortfolioRiskResponse, ApiError>(
    ['portfolio-risk'],
    () => api.get<PortfolioRiskResponse>('/api/portfolio/risk'),
    { staleTime: 1000 * 60 * 30, enabled },
  )
}

// ── Query key ────────────────────────────────────────────────────
const PORTFOLIO_KEY = ['portfolio'] as const

// ── Query ────────────────────────────────────────────────────────
export function usePortfolio() {
  return useQuery<PortfolioResponse, ApiError>(
    PORTFOLIO_KEY,
    () => api.get<PortfolioResponse>('/api/portfolio'),
    { staleTime: 1000 * 60 },
  )
}

// ── Mutations ────────────────────────────────────────────────────
export function useAddAsset() {
  const qc = useQueryClient()
  return useMutation<{ asset: PortfolioAsset }, ApiError, AssetInputBody>(
    (input) => api.post<{ asset: PortfolioAsset }>('/api/portfolio/assets', input),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

export interface PortfolioImportItem {
  name: string
  ticker: string
  isin?: string | null
  qty: number
  invested: number
  value?: number
  expectedReturn?: number
  flows?: { ym: string; amount: number }[]
}
export interface PortfolioImportResult {
  ok: true
  summary: { created: number; skipped: number }
}
export function useImportPortfolio() {
  const qc = useQueryClient()
  return useMutation<PortfolioImportResult, ApiError, PortfolioImportItem[]>(
    (items) => api.post<PortfolioImportResult>('/api/portfolio/import', { items }),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

// Reconciling transaction-delta import (Trading 212 CSV): applies buys AND sells
// against existing holdings. One order = one txn; an order id makes re-import idempotent.
export interface PortfolioTxnItem {
  name: string
  ticker: string
  isin?: string | null
  txns: { side: 'buy' | 'sell'; shares: number; total: number; ym: string | null; orderId: string | null; time: string }[]
}
export interface PortfolioTxnResult {
  ok: true
  summary: { created: number; updated: number; closed: number; skipped: number }
}
export function useApplyPortfolioTransactions() {
  const qc = useQueryClient()
  return useMutation<PortfolioTxnResult, ApiError, PortfolioTxnItem[]>(
    (items) => api.post<PortfolioTxnResult>('/api/portfolio/transactions', { items }),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation<
    { asset: PortfolioAsset },
    ApiError,
    { id: string; patch: Partial<AssetInputBody> }
  >(
    ({ id, patch }) => api.put<{ asset: PortfolioAsset }>(`/api/portfolio/assets/${id}`, patch),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, string>(
    (id) => api.delete<{ ok: true }>(`/api/portfolio/assets/${id}`),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

export function useReforcar() {
  const qc = useQueryClient()
  return useMutation<
    { asset: PortfolioAsset; flow: PortfolioFlow },
    ApiError,
    { id: string; body: ReforcarInputBody }
  >(
    ({ id, body }) =>
      api.post<{ asset: PortfolioAsset; flow: PortfolioFlow }>(
        `/api/portfolio/assets/${id}/reforcar`,
        body,
      ),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

// ── Refresh from market ──────────────────────────────────────────
export interface RefreshOneResult {
  asset: PortfolioAsset
  price: number          // native-currency price per share
  priceInEur: number     // EUR per share after FX
  fxRate: number
  currency: string
  resolvedSymbol: string
}

export function useRefreshAssetValue() {
  const qc = useQueryClient()
  return useMutation<RefreshOneResult, ApiError, string>(
    (id) => api.post<RefreshOneResult>(`/api/portfolio/assets/${id}/refresh-value`),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

export interface RefreshAllRow {
  id: string
  ticker: string
  ok: boolean
  price?: number
  priceInEur?: number
  fxRate?: number
  currency?: string
  resolvedSymbol?: string
  previousValue?: number
  newValue?: number
  error?: string
}
export interface RefreshAllResult {
  results: RefreshAllRow[]
  summary: { updated: number; failed: number }
}

export function useRefreshAllValues() {
  const qc = useQueryClient()
  return useMutation<RefreshAllResult, ApiError, void>(
    () => api.post<RefreshAllResult>('/api/portfolio/refresh-values'),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation<
    { settings: PortfolioSettings },
    ApiError,
    Partial<PortfolioSettings>
  >(
    (patch) => api.put<{ settings: PortfolioSettings }>('/api/portfolio/settings', patch),
    { onSuccess: () => { qc.invalidateQueries(PORTFOLIO_KEY) } },
  )
}
