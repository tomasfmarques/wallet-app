// ── Investment risk metrics ──────────────────────────────────────
// Risk = annualized volatility: the standard deviation of monthly returns,
// scaled to a year (× √12). Derived from a monthly adjusted-close price series
// (e.g. yahooFinance `prices`). This is the standard quantitative risk proxy.
// Pure functions, no I/O — safe to import anywhere and easy to test.

export type RiskLevel = 'baixo' | 'medio' | 'alto' | 'muito_alto'

// Annualized volatility (%) from a monthly price series (oldest → newest).
// Uses up to the last 60 monthly returns (~5y) for a stable, recent estimate.
// Returns null when there isn't enough data (need ≥ 13 prices → 12 returns).
export function annualizedVolatility(prices: number[]): number | null {
  if (!prices || prices.length < 13) return null
  const recent = prices.slice(-61) // ≤ 60 monthly returns
  const rets: number[] = []
  for (let i = 1; i < recent.length; i++) {
    const prev = recent[i - 1]
    if (prev > 0) rets.push(recent[i] / prev - 1)
  }
  if (rets.length < 12) return null
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1)
  return Math.sqrt(variance) * Math.sqrt(12) * 100
}

// Map an annualized volatility (%) to a coarse, human risk level. Thresholds are
// heuristics calibrated to typical asset classes: cash/bonds <10, broad equity
// ETFs ~10–20, single stocks ~20–35, crypto/leveraged >35.
export function riskLevel(volPct: number): RiskLevel {
  if (volPct < 10) return 'baixo'
  if (volPct < 20) return 'medio'
  if (volPct < 35) return 'alto'
  return 'muito_alto'
}

// Monthly returns keyed by calendar month (YYYY-MM), aligned to `timestamps`.
// Empty when we can't key them (timestamps missing/misaligned). Capped to the
// last 60 months to match annualizedVolatility's window.
export function monthlyReturns(prices: number[], timestamps: number[]): Array<{ ym: string; r: number }> {
  if (prices.length < 13 || timestamps.length !== prices.length) return []
  const out: Array<{ ym: string; r: number }> = []
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1]
    const ts = timestamps[i]
    if (prev > 0 && ts > 0) {
      const d = new Date(ts * 1000)
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      out.push({ ym, r: prices[i] / prev - 1 })
    }
  }
  return out.slice(-60)
}

// Correlation-aware portfolio volatility (annualized %): σ_p = √(wᵀΣw)×√12, where
// Σ is the sample covariance matrix of monthly returns over the months COMMON to
// all usable assets. This credits diversification (σ_p ≤ the value-weighted
// average). Returns null when it can't be modeled (need ≥2 assets with ≥12
// overlapping months) → caller falls back to the value-weighted figure.
export function correlatedPortfolioVol(
  assets: Array<{ value: number; returns: Array<{ ym: string; r: number }> }>,
): number | null {
  const usable = assets.filter((a) => a.value > 0 && a.returns.length >= 12)
  if (usable.length < 2) return null

  const maps = usable.map((a) => new Map(a.returns.map((x) => [x.ym, x.r])))
  let common = [...maps[0].keys()]
  for (let k = 1; k < maps.length; k++) common = common.filter((ym) => maps[k].has(ym))
  if (common.length < 12) return null

  const totalVal = usable.reduce((s, a) => s + a.value, 0)
  const w = usable.map((a) => a.value / totalVal)
  const series = maps.map((m) => common.map((ym) => m.get(ym) as number))
  const means = series.map((s) => s.reduce((a, b) => a + b, 0) / s.length)
  const n = common.length

  let portVar = 0
  for (let i = 0; i < usable.length; i++) {
    for (let j = 0; j < usable.length; j++) {
      let cov = 0
      for (let t = 0; t < n; t++) cov += (series[i][t] - means[i]) * (series[j][t] - means[j])
      cov /= n - 1
      portVar += w[i] * w[j] * cov
    }
  }
  if (portVar < 0) portVar = 0 // numerical guard
  return Math.sqrt(portVar) * Math.sqrt(12) * 100
}

export interface PortfolioRisk {
  volatility: number | null  // annualized %, value-weighted
  level: RiskLevel | null
  coverage: number           // 0..1 — share of total value that had an estimate
}

// Value-weighted portfolio volatility across assets that have an estimate.
// NOTE: this is a weighted average — it does NOT model correlation between
// assets, so it slightly OVERstates risk (a diversified portfolio's true vol is
// ≤ the weighted average). Conservative by design.
export function portfolioRisk(
  items: Array<{ value: number; volatility: number | null }>,
): PortfolioRisk {
  const withVol = items.filter((a) => a.volatility != null && a.value > 0)
  const totalWithVol = withVol.reduce((s, a) => s + a.value, 0)
  const totalAll = items.reduce((s, a) => s + Math.max(0, a.value), 0)
  if (totalWithVol <= 0) return { volatility: null, level: null, coverage: 0 }
  const vol = withVol.reduce((s, a) => s + (a.value / totalWithVol) * (a.volatility as number), 0)
  return { volatility: vol, level: riskLevel(vol), coverage: totalAll > 0 ? totalWithVol / totalAll : 0 }
}
