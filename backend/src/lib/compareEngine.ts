import { computeSchedule, type LoanInput } from './loanEngine'

// ── "Amortizar vs investir" engine ───────────────────────────────
// Lifted verbatim out of routes/simulate.ts so it has more than one caller: the
// route still owns HTTP (validation, ownership, status codes) and this owns the
// maths. WS4 deferred the digest's wedge line precisely because this lived
// inline in a route handler and an email can't POST to itself.
//
// Pure: every input is passed in (loan, amortizations, the user's assets), so
// the same numbers come out for the /comparar page, the dashboard card and the
// monthly digest. Anything that changes here changes all three.

export type Modo = 'prazo' | 'prestacao'
export type Frequencia = 'unica' | 'mensal' | 'anual'
export type ReturnMode = 'portfolio' | 'manual'

export interface CompareAsset {
  value: number
  expectedReturn: number   // FRACTION (0.07 = 7 %/yr), as stored on PortfolioAsset
}

export interface CompareParams {
  valor: number
  modo: Modo
  ym: string               // month of the (first) extra amortization
  investReturn: number     // PERCENT (7 = 7 %/yr) — manual mode / fallback
  taxRate: number          // PERCENT (28 = Portuguese mais-valias)
  frequencia: Frequencia
  wantPortfolio: boolean   // project across real assets when any exist
  riskVolatility?: number  // PERCENT annualized σ; omit to skip the band
}

export interface CompareResult {
  horizonMonths: number
  frequencia: Frequencia
  amortizar: {
    interestSaved: number
    monthsSaved: number
    payoffYm: string
    newPrestacao: number | null
    monthlyFreed: number | null
  }
  investir: {
    futureValue: number
    grossGain: number
    netGainAfterTax: number
    totalContributed: number
    effectiveReturn: number
    returnMode: ReturnMode
    riskVolatility: number | null
    pessimisticNet: number | null
    optimisticNet: number | null
  }
  curve: Array<{ ym: string; amortizar: number; investir: number }>
  recommendation: 'amortizar' | 'investir' | 'equivalente'
  breakEvenReturn: number
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12).toString().padStart(4, '0')}-${((total % 12) + 1).toString().padStart(2, '0')}`
}

export function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}

/**
 * Returns null when the loan is already paid off (no schedule left to compare).
 */
export function runCompare(
  baseInput: LoanInput,
  params: CompareParams,
  assets: CompareAsset[],
): CompareResult | null {
  const { valor: valorN, modo, ym, investReturn: investReturnN, taxRate: taxRateN, frequencia: freq, wantPortfolio } = params

  const existingAmorts = baseInput.amortizacoes ?? []
  const base = computeSchedule(baseInput)
  if (base.rows.length === 0) return null
  const horizonMonths = base.prazoMesesEfetivo

  // Extra amortization(s): a single lump at `ym`, or `valor` every month
  // ('mensal') / every 12 months ('anual') from `ym` over the loan's remaining
  // life (recurring overpayment). Entries past payoff are harmlessly capped to
  // the outstanding capital by the engine.
  const newAmorts =
    freq === 'mensal'
      ? Array.from({ length: horizonMonths }, (_, m) => ({ ym: addMonths(ym, m), valor: valorN, modo }))
      : freq === 'anual'
        ? Array.from({ length: Math.ceil(horizonMonths / 12) }, (_, k) => ({ ym: addMonths(ym, k * 12), valor: valorN, modo }))
        : [{ ym, valor: valorN, modo }]
  const amort = computeSchedule({ ...baseInput, amortizacoes: [...existingAmorts, ...newAmorts] })

  const interestSaved = base.totalInterest - amort.totalInterest
  const monthsSaved = base.prazoMesesEfetivo - amort.prazoMesesEfetivo

  // New monthly payment after the (first) amortization. Only meaningful for a
  // one-off 'prestacao' amortization — a recurring overpayment changes it every
  // month, so we don't surface a single "freed" figure there.
  const afterAmortIdx = amort.rows.findIndex((row) => row.ym > ym)
  const afterBaseIdx = base.rows.findIndex((row) => row.ym > ym)
  const newPrestacao = afterAmortIdx >= 0 ? amort.rows[afterAmortIdx].prestacao : null
  const basePrestacao = afterBaseIdx >= 0 ? base.rows[afterBaseIdx].prestacao : null
  const monthlyFreed = freq === 'unica' && modo === 'prestacao' && newPrestacao != null && basePrestacao != null
    ? Math.max(0, basePrestacao - newPrestacao)
    : null

  // ── Investment scenario ───────────────────────────────────────
  // Portfolio mode: spread the amount across the user's real assets by current
  // value weight and compound each at its own expected return (matches the
  // Portfolio projection). Manual mode (or no assets): a single flat rate.
  // 'mensal' invests `valor` every month; 'unica' invests once up front.
  const taxFraction = taxRateN / 100

  const totalAssetValue = assets.reduce((s, a) => s + a.value, 0)
  const useProjection = wantPortfolio && assets.length > 0 && totalAssetValue > 0
  const usedReturnMode: ReturnMode = useProjection ? 'portfolio' : 'manual'

  // Amount added in loop-month m for the recurring modes (at end of month):
  // every month, or every 12th month. Lump ('unica') is seeded up front instead.
  const contribMonth = (m: number) =>
    freq === 'mensal' ? valorN : freq === 'anual' && m % 12 === 0 ? valorN : 0

  // Gross invested value at the end of each month (length = horizonMonths).
  const grossByMonth = new Array<number>(horizonMonths)
  if (useProjection) {
    const w = assets.map((a) => a.value / totalAssetValue)
    const rm = assets.map((a) => a.expectedReturn / 12)
    const v = assets.map((_, i) => (freq === 'unica' ? valorN * w[i] : 0))
    for (let m = 0; m < horizonMonths; m++) {
      const add = freq === 'unica' ? 0 : contribMonth(m)
      let tot = 0
      for (let i = 0; i < v.length; i++) {
        v[i] = v[i] * (1 + rm[i]) + add * w[i]
        tot += v[i]
      }
      grossByMonth[m] = tot
    }
  } else {
    const rr = investReturnN / 100 / 12
    let v = freq === 'unica' ? valorN : 0
    for (let m = 0; m < horizonMonths; m++) {
      v = v * (1 + rr) + (freq === 'unica' ? 0 : contribMonth(m))
      grossByMonth[m] = v
    }
  }

  const contributedAt = (m: number) =>
    freq === 'unica' ? valorN : freq === 'mensal' ? valorN * (m + 1) : valorN * (Math.floor(m / 12) + 1)
  const totalContributed = contributedAt(horizonMonths - 1)
  const futureValue = grossByMonth[horizonMonths - 1]
  const grossGain = futureValue - totalContributed
  const netGainAfterTax = grossGain * (1 - taxFraction)

  // Effective annual return (value-weighted in portfolio mode) for display.
  const effectiveReturn = useProjection
    ? assets.reduce((s, a) => s + (a.value / totalAssetValue) * a.expectedReturn, 0) * 100
    : investReturnN

  // ── Break-even gross return (binary search) ───────────────────
  // The flat annual return at which investing the SAME cash-flow shape equals
  // amortizing — a clean "what return would I need" answer, independent of the
  // projection.
  // Flat-rate gross gain for a given annual % (same cash-flow shape). Net taxes
  // only POSITIVE gains — a loss stays a loss (you aren't taxed on it).
  const flatGross = (annual: number): number => {
    const rr = annual / 12
    let v = freq === 'unica' ? valorN : 0
    for (let m = 0; m < horizonMonths; m++) v = v * (1 + rr) + (freq === 'unica' ? 0 : contribMonth(m))
    return v - totalContributed
  }
  const netFromGross = (g: number) => (g >= 0 ? g * (1 - taxFraction) : g)
  const flatNetGain = (annual: number) => netFromGross(flatGross(annual))

  let lo = 0, hi = 2  // 0..200% annual
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (flatNetGain(mid) < interestSaved) { lo = mid } else { hi = mid }
  }
  const breakEvenReturn = ((lo + hi) / 2) * 100  // %

  // ── Risk band (±1σ over the horizon) ─────────────────────────
  // If the caller passes the portfolio's annualized volatility (σ), bracket
  // the projected net gain against the GUARANTEED interest saved by amortizing.
  //
  // σ is the std-dev of a SINGLE year's return. The uncertainty of the
  // *terminal* gain over T years does NOT grow by applying ±σ to every year —
  // compounding (mean ± σ) for T years produces absurd extremes (a "good year"
  // of millions, a perpetual-loss "bad year"). Under the usual lognormal model
  // the terminal value's ±1σ in log-space is σ·√T, so the band on the
  // ANNUALIZED return is σ/√T. We shift the rate by that and compound over the
  // horizon. (`flatGross` takes a FRACTION; effectiveReturn/riskVolN are
  // PERCENT, hence /100.)
  const riskVolN = Number(params.riskVolatility)
  const hasRisk = Number.isFinite(riskVolN) && riskVolN > 0 && riskVolN <= 200
  const horizonYears = Math.max(horizonMonths / 12, 1 / 12)
  const sigmaBand = riskVolN / Math.sqrt(horizonYears)  // σ of the annualized return over T years
  const pessimisticNet = hasRisk ? netFromGross(flatGross((effectiveReturn - sigmaBand) / 100)) : null
  const optimisticNet = hasRisk ? netFromGross(flatGross((effectiveReturn + sigmaBand) / 100)) : null

  // ── Curves for chart (sampled to keep payload small) ─────────
  const baseJuroByYm = new Map(base.rows.map((r2) => [r2.ym, r2.juros]))
  const amortJuroByYm = new Map(amort.rows.map((r2) => [r2.ym, r2.juros]))

  const sampleEvery = Math.max(1, Math.floor(horizonMonths / 60))
  const curve: Array<{ ym: string; amortizar: number; investir: number }> = []
  let cumBase = 0, cumAmort = 0

  for (let m = 0; m < horizonMonths; m++) {
    const rowYm = base.rows[m].ym
    cumBase += baseJuroByYm.get(rowYm) ?? 0
    cumAmort += amortJuroByYm.get(rowYm) ?? 0
    if (m % sampleEvery === 0 || m === horizonMonths - 1) {
      curve.push({
        ym: rowYm,
        amortizar: Math.max(0, cumBase - cumAmort),
        investir: Math.max(0, (grossByMonth[m] - contributedAt(m)) * (1 - taxFraction)),
      })
    }
  }

  // ── Recommendation ────────────────────────────────────────────
  const diff = netGainAfterTax - interestSaved
  const recommendation: 'amortizar' | 'investir' | 'equivalente' =
    diff > 100 ? 'investir' : diff < -100 ? 'amortizar' : 'equivalente'

  return {
    horizonMonths,
    frequencia: freq,
    amortizar: { interestSaved, monthsSaved, payoffYm: amort.payoffYm, newPrestacao, monthlyFreed },
    investir: {
      futureValue, grossGain, netGainAfterTax, totalContributed, effectiveReturn,
      returnMode: usedReturnMode,
      riskVolatility: hasRisk ? riskVolN : null,
      pessimisticNet, optimisticNet,
    },
    curve,
    recommendation,
    breakEvenReturn,
  }
}

// The defaults the dashboard card and the digest both simulate with — the
// backend twin of frontend/src/lib/compareDefaults.ts. Keep them in step: if
// these two drift, the email and the card quote different numbers for the same
// question, which is worse than the email not existing.
//
// ⚠️ investReturn is the average of per-asset expectedReturn — NOT settings.gFY
// ("anos sem aumento", an integer delay, not a rate). That confusion skewed the
// original Compare page.
export function defaultCompareParams(nextPrestacao: number, assets: CompareAsset[]): CompareParams {
  const avgAssetReturn = assets.length > 0
    ? (assets.reduce((s, a) => s + a.expectedReturn, 0) / assets.length) * 100
    : null
  return {
    // The loan's next installment, rounded to the nearest 100.
    valor: Math.max(100, Math.round((nextPrestacao || 5000) / 100) * 100),
    investReturn: Math.round((avgAssetReturn ?? 7) * 10) / 10,
    taxRate: 28,
    modo: 'prazo',
    frequencia: 'unica',
    ym: addMonths(currentYm(), 1),
    wantPortfolio: assets.length > 0,
  }
}
