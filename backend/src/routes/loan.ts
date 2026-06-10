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
  if (!Number.isFinite(n) || n <= 0) { errors[field] = `${field} deve ser um número positivo`; return 0 }
  return n
}
function asNonNegativeNumber(v: unknown, field: string, errors: Record<string, string>): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) { errors[field] = `${field} deve ser ≥ 0`; return 0 }
  return n
}
function asPositiveInt(v: unknown, field: string, errors: Record<string, string>): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n <= 0) { errors[field] = `${field} deve ser um inteiro positivo`; return 0 }
  return n
}
function asYm(v: unknown, field: string, errors: Record<string, string>): string {
  if (typeof v !== 'string' || !YM_RE.test(v)) { errors[field] = `${field} deve ter o formato AAAA-MM`; return '' }
  return v
}
function asName(v: unknown): string {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim().slice(0, 40)
  return 'Crédito'
}

// Fetch a loan and confirm it belongs to the session user.
async function ownedLoan(loanId: string, userId: string) {
  const loan = await prisma.loan.findUnique({ where: { id: loanId } })
  return loan && loan.userId === userId ? loan : null
}

function inputFromLoan(loan: {
  capital: number; prazoMeses: number; tanFixa: number; mesesFixos: number
  spread: number; euribor: number; dataInicio: string
}, amortizacoes: Array<{ ym: string; valor: number; modo: string }>): LoanInput {
  return {
    capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
    mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
    dataInicio: loan.dataInicio,
    amortizacoes: amortizacoes.map((a) => ({ ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao' })),
  }
}

// ── GET /api/loan ────────────────────────────────────────────────
// Returns every credit with its computed schedule + KPIs.
router.get('/', async (req, res) => {
  try {
    const loans = await prisma.loan.findMany({
      where: { userId: req.session.userId! },
      orderBy: { name: 'asc' },
      include: {
        payments: { orderBy: { ym: 'asc' } },
        amortizations: { orderBy: { ym: 'asc' } },
        euriborHistory: { orderBy: { ym: 'asc' } },
      },
    })

    const items = loans.map((loan) => {
      const input = inputFromLoan(loan, loan.amortizations)
      return { loan, schedule: computeSchedule(input), kpis: computeKpis(input) }
    })

    res.json({ loans: items })
  } catch (err) {
    console.error('GET /api/loan failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── PUT /api/loan ────────────────────────────────────────────────
// Create a new credit, or update one when `id` is supplied.
router.put('/', async (req, res) => {
  const errors: Record<string, string> = {}
  const name        = asName(req.body?.name)
  const capital     = asPositiveNumber(req.body?.capital,     'capital',     errors)
  const prazoMeses  = asPositiveInt   (req.body?.prazoMeses,  'prazoMeses',  errors)
  const tanFixa     = asNonNegativeNumber(req.body?.tanFixa,  'tanFixa',     errors)
  const mesesFixos  = asPositiveInt   (req.body?.mesesFixos,  'mesesFixos',  errors)
  const spread      = asNonNegativeNumber(req.body?.spread,   'spread',      errors)
  const euribor     = asNonNegativeNumber(req.body?.euribor,  'euribor',     errors)
  const dataInicio  = asYm            (req.body?.dataInicio,  'dataInicio',  errors)

  if (mesesFixos > prazoMeses) errors.mesesFixos = 'mesesFixos não pode exceder prazoMeses'
  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  const data = { name, capital, prazoMeses, tanFixa, mesesFixos, spread, euribor, dataInicio }
  const id = typeof req.body?.id === 'string' ? req.body.id : null

  try {
    let loan
    if (id) {
      if (!(await ownedLoan(id, req.session.userId!))) { res.status(404).json({ error: 'Crédito não encontrado' }); return }
      loan = await prisma.loan.update({ where: { id }, data })
    } else {
      loan = await prisma.loan.create({ data: { ...data, userId: req.session.userId! } })
    }
    res.json({ loan })
  } catch (err) {
    console.error('PUT /api/loan failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/loan/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (!(await ownedLoan(req.params.id, req.session.userId!))) {
      res.status(404).json({ error: 'Crédito não encontrado' }); return
    }
    await prisma.loan.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/loan/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── PUT /api/loan/:loanId/payments/:ym ───────────────────────────
router.put('/:loanId/payments/:ym', async (req, res) => {
  const errors: Record<string, string> = {}
  const ym = asYm(req.params.ym, 'ym', errors)
  const paid = typeof req.body?.paid === 'boolean' ? req.body.paid : null
  const realRaw = req.body?.real
  let realValue: number | null = null
  if (realRaw !== undefined && realRaw !== null && realRaw !== '') {
    const n = Number(realRaw)
    if (!Number.isFinite(n) || n < 0) errors.real = 'real deve ser um número ≥ 0'
    else realValue = n
  }
  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const loan = await ownedLoan(req.params.loanId, req.session.userId!)
    if (!loan) { res.status(404).json({ error: 'Crédito não encontrado' }); return }

    const payment = await prisma.loanPayment.upsert({
      where: { loanId_ym: { loanId: loan.id, ym } },
      create: { loanId: loan.id, ym, paid: paid ?? false, real: realValue },
      update: { ...(paid !== null ? { paid } : {}), ...(realRaw !== undefined ? { real: realValue } : {}) },
    })
    res.json({ payment })
  } catch (err) {
    console.error('PUT /api/loan/:loanId/payments/:ym failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/loan/:loanId/amortizations ─────────────────────────
router.post('/:loanId/amortizations', async (req, res) => {
  const errors: Record<string, string> = {}
  const ym = asYm(req.body?.ym, 'ym', errors)
  const valor = asPositiveNumber(req.body?.valor, 'valor', errors)
  const modoRaw = req.body?.modo
  let modo: 'prazo' | 'prestacao' = 'prazo'
  if (modoRaw !== 'prazo' && modoRaw !== 'prestacao') errors.modo = "modo deve ser 'prazo' ou 'prestacao'"
  else modo = modoRaw
  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const loan = await ownedLoan(req.params.loanId, req.session.userId!)
    if (!loan) { res.status(404).json({ error: 'Crédito não encontrado' }); return }
    const amort = await prisma.loanAmortization.create({ data: { loanId: loan.id, ym, valor, modo } })
    res.status(201).json({ amortization: amort })
  } catch (err) {
    console.error('POST /api/loan/:loanId/amortizations failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/loan/amortizations/:id ───────────────────────────
router.delete('/amortizations/:id', async (req, res) => {
  try {
    const amort = await prisma.loanAmortization.findUnique({
      where: { id: req.params.id }, include: { loan: { select: { userId: true } } },
    })
    if (!amort || amort.loan.userId !== req.session.userId) {
      res.status(404).json({ error: 'Amortização não encontrada' }); return
    }
    await prisma.loanAmortization.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/loan/amortizations/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/loan/:loanId/euribor ───────────────────────────────
router.post('/:loanId/euribor', async (req, res) => {
  const errors: Record<string, string> = {}
  const valor = asNonNegativeNumber(req.body?.valor, 'valor', errors)
  let ym = req.body?.ym
  if (ym !== undefined) ym = asYm(ym, 'ym', errors)
  else { const d = new Date(); ym = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}` }
  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const loan = await ownedLoan(req.params.loanId, req.session.userId!)
    if (!loan) { res.status(404).json({ error: 'Crédito não encontrado' }); return }
    const entry = await prisma.euriborHistory.upsert({
      where: { loanId_ym: { loanId: loan.id, ym } },
      create: { loanId: loan.id, ym, valor }, update: { valor },
    })
    const updated = await prisma.loan.update({ where: { id: loan.id }, data: { euribor: valor } })
    res.json({ loan: updated, entry })
  } catch (err) {
    console.error('POST /api/loan/:loanId/euribor failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/loan/:loanId/simulate ──────────────────────────────
router.post('/:loanId/simulate', async (req, res) => {
  const errors: Record<string, string> = {}
  const annualAmount = asNonNegativeNumber(req.body?.annualAmount ?? 0, 'annualAmount', errors)
  const startYear    = asPositiveInt(req.body?.startYear, 'startYear', errors)
  const futureEuribor = asNonNegativeNumber(req.body?.futureEuribor, 'futureEuribor', errors)
  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const loan = await ownedLoan(req.params.loanId, req.session.userId!)
    if (!loan) { res.status(404).json({ error: 'Crédito não encontrado' }); return }

    const baseInput: LoanInput = inputFromLoan(loan, [])
    const simAmortizations: Array<{ ym: string; valor: number; modo: 'prazo' | 'prestacao' }> = []
    if (annualAmount > 0) {
      const endYear = Number(loan.dataInicio.slice(0, 4)) + Math.ceil(loan.prazoMeses / 12)
      for (let y = startYear; y <= endYear; y++) simAmortizations.push({ ym: `${y}-01`, valor: annualAmount, modo: 'prazo' })
    }
    const simInput: LoanInput = { ...baseInput, euribor: futureEuribor, amortizacoes: simAmortizations }

    const base = computeSchedule(baseInput)
    const sim = computeSchedule(simInput)
    res.json({
      base: {
        totalInterest: base.totalInterest, totalPaid: base.totalPaid, payoffYm: base.payoffYm,
        prazoMesesEfetivo: base.prazoMesesEfetivo, rows: base.rows.map((r) => ({ ym: r.ym, capital: r.capital })),
      },
      simulated: {
        totalInterest: sim.totalInterest, totalPaid: sim.totalPaid, payoffYm: sim.payoffYm,
        prazoMesesEfetivo: sim.prazoMesesEfetivo, rows: sim.rows.map((r) => ({ ym: r.ym, capital: r.capital })),
      },
      delta: { interestSaved: base.totalInterest - sim.totalInterest, monthsSaved: base.prazoMesesEfetivo - sim.prazoMesesEfetivo },
    })
  } catch (err) {
    console.error('POST /api/loan/:loanId/simulate failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
