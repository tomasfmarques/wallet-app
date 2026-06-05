import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { computeSchedule, computeKpis, type LoanInput } from '../lib/loanEngine'

const router = Router()
router.use(requireAuth)

// ── Validation helpers ───────────────────────────────────────────
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function asPositiveNumber(v: unknown, field: string, errors: Record<string, string>): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    errors[field] = `${field} deve ser um número positivo`
    return 0
  }
  return n
}

function asNonNegativeNumber(v: unknown, field: string, errors: Record<string, string>): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) {
    errors[field] = `${field} deve ser ≥ 0`
    return 0
  }
  return n
}

function asPositiveInt(v: unknown, field: string, errors: Record<string, string>): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n <= 0) {
    errors[field] = `${field} deve ser um inteiro positivo`
    return 0
  }
  return n
}

function asYm(v: unknown, field: string, errors: Record<string, string>): string {
  if (typeof v !== 'string' || !YM_RE.test(v)) {
    errors[field] = `${field} deve ter o formato AAAA-MM`
    return ''
  }
  return v
}

// ── GET /api/loan ────────────────────────────────────────────────
// Returns loan + all related data + the computed schedule and KPIs.
// Returns { loan: null } if the user hasn't configured a loan yet.
router.get('/', async (req, res) => {
  try {
    const loan = await prisma.loan.findFirst({
      where: { userId: req.session.userId! },
      include: {
        payments: { orderBy: { ym: 'asc' } },
        amortizations: { orderBy: { ym: 'asc' } },
        euriborHistory: { orderBy: { ym: 'asc' } },
      },
    })

    if (!loan) {
      res.json({ loan: null })
      return
    }

    const input: LoanInput = {
      capital: loan.capital,
      prazoMeses: loan.prazoMeses,
      tanFixa: loan.tanFixa,
      mesesFixos: loan.mesesFixos,
      spread: loan.spread,
      euribor: loan.euribor,
      dataInicio: loan.dataInicio,
      amortizacoes: loan.amortizations.map((a) => ({
        ym: a.ym,
        valor: a.valor,
        modo: a.modo as 'prazo' | 'prestacao',
      })),
    }

    const schedule = computeSchedule(input)
    const kpis = computeKpis(input)

    res.json({ loan, schedule, kpis })
  } catch (err) {
    console.error('GET /api/loan failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── PUT /api/loan ────────────────────────────────────────────────
// Upsert the user's loan. Creates on first call, updates afterwards.
router.put('/', async (req, res) => {
  const errors: Record<string, string> = {}
  const capital     = asPositiveNumber(req.body?.capital,     'capital',     errors)
  const prazoMeses  = asPositiveInt   (req.body?.prazoMeses,  'prazoMeses',  errors)
  const tanFixa     = asNonNegativeNumber(req.body?.tanFixa,  'tanFixa',     errors)
  const mesesFixos  = asPositiveInt   (req.body?.mesesFixos,  'mesesFixos',  errors)
  const spread      = asNonNegativeNumber(req.body?.spread,   'spread',      errors)
  const euribor     = asNonNegativeNumber(req.body?.euribor,  'euribor',     errors)
  const dataInicio  = asYm            (req.body?.dataInicio,  'dataInicio',  errors)

  if (mesesFixos > prazoMeses) errors.mesesFixos = 'mesesFixos não pode exceder prazoMeses'

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors })
    return
  }

  try {
    const existing = await prisma.loan.findFirst({
      where: { userId: req.session.userId! },
    })

    const data = { capital, prazoMeses, tanFixa, mesesFixos, spread, euribor, dataInicio }
    const loan = existing
      ? await prisma.loan.update({ where: { id: existing.id }, data })
      : await prisma.loan.create({ data: { ...data, userId: req.session.userId! } })

    res.json({ loan })
  } catch (err) {
    console.error('PUT /api/loan failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── PUT /api/loan/payments/:ym ───────────────────────────────────
// Mark a month as paid / record the real amount paid.
router.put('/payments/:ym', async (req, res) => {
  const errors: Record<string, string> = {}
  const ym = asYm(req.params.ym, 'ym', errors)

  const paid = typeof req.body?.paid === 'boolean' ? req.body.paid : null
  const realRaw = req.body?.real
  let realValue: number | null = null
  if (realRaw !== undefined && realRaw !== null && realRaw !== '') {
    const n = Number(realRaw)
    if (!Number.isFinite(n) || n < 0) {
      errors.real = 'real deve ser um número ≥ 0'
    } else {
      realValue = n
    }
  }
  if (paid === null && realValue === null && realRaw !== null) {
    errors._form = 'Nada para atualizar (envia `paid` e/ou `real`)'
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors })
    return
  }

  try {
    const loan = await prisma.loan.findFirst({
      where: { userId: req.session.userId! },
      select: { id: true },
    })
    if (!loan) {
      res.status(404).json({ error: 'Empréstimo não configurado' })
      return
    }

    const payment = await prisma.loanPayment.upsert({
      where: { loanId_ym: { loanId: loan.id, ym } },
      create: {
        loanId: loan.id,
        ym,
        paid: paid ?? false,
        real: realValue,
      },
      update: {
        ...(paid !== null ? { paid } : {}),
        ...(realRaw !== undefined ? { real: realValue } : {}),
      },
    })

    res.json({ payment })
  } catch (err) {
    console.error('PUT /api/loan/payments/:ym failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/loan/amortizations ─────────────────────────────────
router.post('/amortizations', async (req, res) => {
  const errors: Record<string, string> = {}
  const ym = asYm(req.body?.ym, 'ym', errors)
  const valor = asPositiveNumber(req.body?.valor, 'valor', errors)
  const modoRaw = req.body?.modo
  let modo: 'prazo' | 'prestacao' = 'prazo'
  if (modoRaw !== 'prazo' && modoRaw !== 'prestacao') {
    errors.modo = "modo deve ser 'prazo' ou 'prestacao'"
  } else {
    modo = modoRaw
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors })
    return
  }

  try {
    const loan = await prisma.loan.findFirst({
      where: { userId: req.session.userId! },
      select: { id: true },
    })
    if (!loan) {
      res.status(404).json({ error: 'Empréstimo não configurado' })
      return
    }

    const amort = await prisma.loanAmortization.create({
      data: { loanId: loan.id, ym, valor, modo },
    })

    res.status(201).json({ amortization: amort })
  } catch (err) {
    console.error('POST /api/loan/amortizations failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/loan/amortizations/:id ───────────────────────────
router.delete('/amortizations/:id', async (req, res) => {
  const { id } = req.params

  try {
    // Ensure the amortization belongs to a loan owned by this user
    const amort = await prisma.loanAmortization.findUnique({
      where: { id },
      include: { loan: { select: { userId: true } } },
    })
    if (!amort || amort.loan.userId !== req.session.userId) {
      res.status(404).json({ error: 'Amortização não encontrada' })
      return
    }

    await prisma.loanAmortization.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/loan/amortizations/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/loan/euribor ───────────────────────────────────────
// Append an entry to the euribor history AND update the current value on the
// loan. The body must contain `valor` (fraction, e.g. 0.02107). The YM defaults
// to the current month.
router.post('/euribor', async (req, res) => {
  const errors: Record<string, string> = {}
  const valor = asNonNegativeNumber(req.body?.valor, 'valor', errors)
  const ymRaw = req.body?.ym
  let ym = ymRaw
  if (ymRaw !== undefined) {
    ym = asYm(ymRaw, 'ym', errors)
  } else {
    const d = new Date()
    ym = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
  }

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors })
    return
  }

  try {
    const loan = await prisma.loan.findFirst({
      where: { userId: req.session.userId! },
    })
    if (!loan) {
      res.status(404).json({ error: 'Empréstimo não configurado' })
      return
    }

    // Upsert history entry (one per YM)
    const entry = await prisma.euriborHistory.upsert({
      where: { loanId_ym: { loanId: loan.id, ym } },
      create: { loanId: loan.id, ym, valor },
      update: { valor },
    })

    // Update the loan's current euribor
    const updated = await prisma.loan.update({
      where: { id: loan.id },
      data: { euribor: valor },
    })

    res.json({ loan: updated, entry })
  } catch (err) {
    console.error('POST /api/loan/euribor failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/loan/simulate ──────────────────────────────────────
// What-if scenario: takes optional overrides + a yearly recurring amortization
// and returns (a) the baseline schedule using current data and (b) the
// simulated schedule. The baseline ignores existing extra amortizations so the
// comparison is "what the contract says" vs "what I plan to do".
router.post('/simulate', async (req, res) => {
  const errors: Record<string, string> = {}
  const annualAmount = asNonNegativeNumber(req.body?.annualAmount ?? 0, 'annualAmount', errors)
  const startYear    = asPositiveInt(req.body?.startYear, 'startYear', errors)
  const futureEuribor = asNonNegativeNumber(req.body?.futureEuribor, 'futureEuribor', errors)

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors })
    return
  }

  try {
    const loan = await prisma.loan.findFirst({
      where: { userId: req.session.userId! },
    })
    if (!loan) {
      res.status(404).json({ error: 'Empréstimo não configurado' })
      return
    }

    const baseInput: LoanInput = {
      capital: loan.capital,
      prazoMeses: loan.prazoMeses,
      tanFixa: loan.tanFixa,
      mesesFixos: loan.mesesFixos,
      spread: loan.spread,
      euribor: loan.euribor, // baseline uses today's Euribor for the variable period
      dataInicio: loan.dataInicio,
      amortizacoes: [],      // baseline = no extra amortizations
    }

    // Simulated: override Euribor and add yearly amortizations from startYear
    const simAmortizations: Array<{ ym: string; valor: number; modo: 'prazo' | 'prestacao' }> = []
    if (annualAmount > 0) {
      const endYear = Number(loan.dataInicio.slice(0, 4)) + Math.ceil(loan.prazoMeses / 12)
      for (let y = startYear; y <= endYear; y++) {
        simAmortizations.push({
          ym: `${y}-01`,
          valor: annualAmount,
          modo: 'prazo',
        })
      }
    }
    const simInput: LoanInput = {
      ...baseInput,
      euribor: futureEuribor,
      amortizacoes: simAmortizations,
    }

    const base = computeSchedule(baseInput)
    const sim = computeSchedule(simInput)

    res.json({
      base: {
        totalInterest: base.totalInterest,
        totalPaid: base.totalPaid,
        payoffYm: base.payoffYm,
        prazoMesesEfetivo: base.prazoMesesEfetivo,
        rows: base.rows.map((r) => ({ ym: r.ym, capital: r.capital })),
      },
      simulated: {
        totalInterest: sim.totalInterest,
        totalPaid: sim.totalPaid,
        payoffYm: sim.payoffYm,
        prazoMesesEfetivo: sim.prazoMesesEfetivo,
        rows: sim.rows.map((r) => ({ ym: r.ym, capital: r.capital })),
      },
      delta: {
        interestSaved: base.totalInterest - sim.totalInterest,
        monthsSaved: base.prazoMesesEfetivo - sim.prazoMesesEfetivo,
      },
    })
  } catch (err) {
    console.error('POST /api/loan/simulate failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
