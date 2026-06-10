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
  const { loanId, valor, modo, ymAmortizacao, investReturn, taxRate } = req.body

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

    const amortInput: LoanInput = {
      ...baseInput,
      amortizacoes: [...existingAmorts, { ym, valor: valorN, modo }],
    }

    const base = computeSchedule(baseInput)
    const amort = computeSchedule(amortInput)

    if (base.rows.length === 0) {
      res.status(400).json({ error: 'O crédito já está liquidado' }); return
    }

    const horizonMonths = base.prazoMesesEfetivo
    const interestSaved = base.totalInterest - amort.totalInterest
    const monthsSaved = base.prazoMesesEfetivo - amort.prazoMesesEfetivo

    // New monthly payment after amortization (prestacao mode)
    const afterAmortIdx = amort.rows.findIndex((r) => r.ym > ym)
    const afterBaseIdx = base.rows.findIndex((r) => r.ym > ym)
    const newPrestacao = afterAmortIdx >= 0 ? amort.rows[afterAmortIdx].prestacao : null
    const basePrestacao = afterBaseIdx >= 0 ? base.rows[afterBaseIdx].prestacao : null
    const monthlyFreed = modo === 'prestacao' && newPrestacao != null && basePrestacao != null
      ? Math.max(0, basePrestacao - newPrestacao)
      : null

    // ── Investment scenario ───────────────────────────────────────
    const r = investReturnN / 100 / 12  // monthly rate
    const taxFraction = taxRateN / 100
    const futureValue = valorN * Math.pow(1 + r, horizonMonths)
    const grossGain = futureValue - valorN
    const netGainAfterTax = grossGain * (1 - taxFraction)

    // ── Break-even gross return (binary search) ───────────────────
    // The annual gross return at which investing equals amortizing.
    let lo = 0, hi = 2  // 0..200% annual
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      const g = (valorN * Math.pow(1 + mid / 12, horizonMonths) - valorN) * (1 - taxFraction)
      if (g < interestSaved) { lo = mid } else { hi = mid }
    }
    const breakEvenReturn = ((lo + hi) / 2) * 100  // %

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
        const investVal = valorN * Math.pow(1 + r, m + 1)
        curve.push({
          ym: rowYm,
          amortizar: Math.max(0, cumBase - cumAmort),
          investir: Math.max(0, (investVal - valorN) * (1 - taxFraction)),
        })
      }
    }

    // ── Recommendation ────────────────────────────────────────────
    const diff = netGainAfterTax - interestSaved
    const recommendation: 'amortizar' | 'investir' | 'equivalente' =
      diff > 100 ? 'investir' : diff < -100 ? 'amortizar' : 'equivalente'

    res.json({
      horizonMonths,
      amortizar: { interestSaved, monthsSaved, payoffYm: amort.payoffYm, newPrestacao, monthlyFreed },
      investir: { futureValue, grossGain, netGainAfterTax },
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
