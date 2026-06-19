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
