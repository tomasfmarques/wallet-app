import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { computeSchedule, type LoanInput } from '../lib/loanEngine'

const router = Router()
router.use(requireAuth)

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12).toString().padStart(4, '0')}-${((total % 12) + 1).toString().padStart(2, '0')}`
}

function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}

// ── POST /api/simulate/compare ────────────────────────────────────
// Compares putting a lump sum toward a mortgage vs investing it.
// Returns interest saved, investment gain, and a recommendation.
router.post('/compare', async (req, res) => {
  const { loanId, valor, modo, ymAmortizacao, investReturn, taxRate, frequencia, returnMode, riskVolatility } = req.body

  if (!loanId || typeof loanId !== 'string') {
    res.status(400).json({ error: 'loanId obrigatório' }); return
  }
  const valorN = Number(valor)
  if (!Number.isFinite(valorN) || valorN <= 0) {
    res.status(400).json({ error: 'valor deve ser um número positivo' }); return
  }
  if (modo !== 'prazo' && modo !== 'prestacao') {
    res.status(400).json({ error: 'modo deve ser prazo ou prestacao' }); return
  }
  const investReturnN = Number(investReturn)
  if (!Number.isFinite(investReturnN) || investReturnN < 0 || investReturnN > 100) {
    res.status(400).json({ error: 'investReturn inválido (0–100%)' }); return
  }
  const taxRateN = Number(taxRate)
  if (!Number.isFinite(taxRateN) || taxRateN < 0 || taxRateN > 100) {
    res.status(400).json({ error: 'taxRate inválido (0–100%)' }); return
  }
  // Lump sum ('unica') vs recurring monthly ('mensal') vs recurring yearly
  // ('anual'). Default lump (back-compat).
  const freq: 'unica' | 'mensal' | 'anual' =
    frequencia === 'mensal' ? 'mensal' : frequencia === 'anual' ? 'anual' : 'unica'
  // 'portfolio' → invest by projecting the amount across the user's real assets
  // (per-asset returns); 'manual' → the flat investReturn slider. Default
  // portfolio; falls back to manual automatically when the user holds no assets.
  if (returnMode !== undefined && returnMode !== 'portfolio' && returnMode !== 'manual') {
    res.status(400).json({ error: 'returnMode inválido' }); return
  }
  const wantPortfolio = returnMode !== 'manual'

  try {
    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: { amortizations: { orderBy: { ym: 'asc' } } },
    })
    if (!loan || loan.userId !== req.session.userId) {
      res.status(404).json({ error: 'Crédito não encontrado' }); return
    }

    const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
    const ym = typeof ymAmortizacao === 'string' && YM_RE.test(ymAmortizacao)
      ? ymAmortizacao
      : addMonths(currentYm(), 1)

    const existingAmorts = loan.amortizations.map((a: { ym: string; valor: number; modo: string }) => ({
      ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao',
    }))

    const baseInput: LoanInput = {
      capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
      mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
      dataInicio: loan.dataInicio, amortizacoes: existingAmorts,
    }

    const base = computeSchedule(baseInput)
    if (base.rows.length === 0) {
      res.status(400).json({ error: 'O crédito já está liquidado' }); return
    }
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

    const assets = wantPortfolio
      ? await prisma.portfolioAsset.findMany({
          where: { userId: req.session.userId! },
          select: { value: true, expectedReturn: true },
        })
      : []
    const totalAssetValue = assets.reduce((s, a) => s + a.value, 0)
    const useProjection = wantPortfolio && assets.length > 0 && totalAssetValue > 0
    const usedReturnMode: 'portfolio' | 'manual' = useProjection ? 'portfolio' : 'manual'

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
    const riskVolN = Number(riskVolatility)
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

    res.json({
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
    })
  } catch (err) {
    console.error('POST /api/simulate/compare failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
