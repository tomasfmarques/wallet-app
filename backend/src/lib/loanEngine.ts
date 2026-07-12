// ── Loan amortization engine ─────────────────────────────────────
// French amortization (constant installment) with two rate regimes:
//   • Months 1..mesesFixos       → rate = tanFixa
//   • Months > mesesFixos        → rate = euribor + spread
// Extra amortizations can be scheduled at any month with two modes:
//   • 'prazo'     → reduce remaining term, keep PMT (pays off faster)
//   • 'prestacao' → keep remaining term, recompute PMT (lower monthly)
//
// Pure functions, no I/O, no DB. Safe to import from anywhere.
//
// ⚠️ ALSO COMPILED INTO THE FRONTEND BUNDLE via the `@engines` Vite alias
// (public simulators — docs/landing-spec.md A2). Keep this file free of
// imports, Node APIs and side effects, or the client build breaks.

export interface LoanInput {
  capital: number       // initial principal (€)
  prazoMeses: number    // total contracted term in months
  tanFixa: number       // fixed annual rate as fraction, e.g. 0.022
  mesesFixos: number    // months under the fixed rate
  spread: number        // bank spread over Euribor (fraction)
  euribor: number       // current Euribor (fraction)
  dataInicio: string    // "YYYY-MM" (first installment month)
  amortizacoes?: Amortization[]
}

export interface Amortization {
  ym: string                     // "YYYY-MM"
  valor: number                  // €
  modo: 'prazo' | 'prestacao'
}

export interface ScheduleRow {
  ym: string                   // "YYYY-MM"
  num: number                  // 1-based month number
  rate: number                 // annual rate applied this month (fraction)
  prestacao: number            // monthly installment (PMT)
  juros: number                // interest portion of the installment
  amortizacao: number          // principal portion of the installment
  amortExtra: number           // any extra amortization paid this month
  capital: number              // remaining capital AFTER this month
}

export interface Schedule {
  rows: ScheduleRow[]
  totalPaid: number             // sum of all prestacoes + extra amortizations
  totalInterest: number         // sum of all juros
  payoffYm: string              // ym of last row
  prazoMesesEfetivo: number     // actual number of months (≤ prazoMeses)
}

// ── Helpers ──────────────────────────────────────────────────────
const EPS = 0.005 // half a cent — clamp tiny leftovers to 0

function pmt(capital: number, monthlyRate: number, n: number): number {
  if (n <= 0) return capital
  if (monthlyRate === 0) return capital / n
  return (capital * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny.toString().padStart(4, '0')}-${nm.toString().padStart(2, '0')}`
}

// ── Main ─────────────────────────────────────────────────────────
export function computeSchedule(input: LoanInput): Schedule {
  const {
    capital: capital0,
    prazoMeses,
    tanFixa,
    mesesFixos,
    spread,
    euribor,
    dataInicio,
    amortizacoes = [],
  } = input

  // Index amortizations by YM for O(1) lookup
  const amortByYm = new Map<string, Amortization[]>()
  for (const a of amortizacoes) {
    const list = amortByYm.get(a.ym) ?? []
    list.push(a)
    amortByYm.set(a.ym, list)
  }

  let capital = capital0
  let remaining = prazoMeses
  let monthlyRate = tanFixa / 12
  let prestacao = pmt(capital, monthlyRate, remaining)
  let prevRate = tanFixa

  const rows: ScheduleRow[] = []
  let totalPaid = 0
  let totalInterest = 0

  for (let i = 0; i < prazoMeses && capital > EPS; i++) {
    const num = i + 1
    const ym = addMonths(dataInicio, i)

    // Rate switch: from month (mesesFixos + 1) onward, use euribor + spread
    const annualRate = num <= mesesFixos ? tanFixa : euribor + spread
    if (annualRate !== prevRate) {
      monthlyRate = annualRate / 12
      // Re-amortize across the remaining term with the new rate
      prestacao = pmt(capital, monthlyRate, remaining)
      prevRate = annualRate
    }

    const juros = capital * monthlyRate
    let amort = prestacao - juros

    // Last installment: cap principal portion to remaining capital
    if (amort > capital) {
      amort = capital
      prestacao = juros + amort
    }
    capital -= amort

    // Apply any extra amortizations scheduled this month (after the regular
    // installment so the interest above is correctly based on the pre-payment
    // capital).
    let amortExtra = 0
    const extras = amortByYm.get(ym)
    if (extras && extras.length > 0) {
      for (const ex of extras) {
        const applied = Math.min(ex.valor, capital)
        capital -= applied
        amortExtra += applied
        if (ex.modo === 'prestacao' && capital > EPS) {
          // Keep remaining term, recompute installment
          const remainingAfterThis = remaining - 1
          if (remainingAfterThis > 0) {
            prestacao = pmt(capital, monthlyRate, remainingAfterThis)
          }
        }
        // 'prazo' keeps PMT the same → the loop will exit earlier
      }
    }

    if (capital < EPS) capital = 0
    remaining--

    rows.push({
      ym,
      num,
      rate: annualRate,
      prestacao,
      juros,
      amortizacao: amort,
      amortExtra,
      capital,
    })

    totalPaid += prestacao + amortExtra
    totalInterest += juros

    if (capital === 0) break
  }

  return {
    rows,
    totalPaid,
    totalInterest,
    payoffYm: rows[rows.length - 1]?.ym ?? dataInicio,
    prazoMesesEfetivo: rows.length,
  }
}

// ── Derived KPIs for the dashboard ───────────────────────────────
export interface LoanKpis {
  capitalAtual: number       // remaining capital as of "today"
  pctPago: number            // % of principal paid (0..1)
  proximaPrestacao: number   // installment for next month
  proximaYm: string          // YM of next month
  conclusaoYm: string        // expected payoff YM
  mesesRestantes: number     // months between now and payoff
  juroPago: number           // interest paid up to today
  juroTotalPrevisto: number  // total interest over the whole life
  poupancaJuros: number      // savings vs. a no-amortizations scenario
}

/**
 * Compute current-state KPIs at a given reference YM (defaults to current).
 * Includes a "savings" figure comparing actual schedule (with amortizations)
 * against a counterfactual with no extra amortizations.
 */
export function computeKpis(input: LoanInput, referenceYm?: string): LoanKpis {
  const today = referenceYm ?? currentYm()
  const schedule = computeSchedule(input)
  const noAmortSchedule =
    (input.amortizacoes && input.amortizacoes.length > 0)
      ? computeSchedule({ ...input, amortizacoes: [] })
      : schedule

  // Find the row for the current month (or last past row if we're past payoff)
  const pastRows = schedule.rows.filter((r) => r.ym <= today)
  const lastPast = pastRows[pastRows.length - 1]
  const nextRow = schedule.rows.find((r) => r.ym > today) ?? schedule.rows[schedule.rows.length - 1]

  const capitalAtual = lastPast ? lastPast.capital : input.capital
  const pctPago = 1 - capitalAtual / input.capital
  const juroPago = pastRows.reduce((s, r) => s + r.juros, 0)

  return {
    capitalAtual,
    pctPago,
    proximaPrestacao: nextRow?.prestacao ?? 0,
    proximaYm: nextRow?.ym ?? today,
    conclusaoYm: schedule.payoffYm,
    mesesRestantes: Math.max(0, schedule.rows.length - pastRows.length),
    juroPago,
    juroTotalPrevisto: schedule.totalInterest,
    poupancaJuros: noAmortSchedule.totalInterest - schedule.totalInterest,
  }
}

function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}
