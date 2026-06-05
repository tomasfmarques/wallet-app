import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'

const router = Router()
router.use(requireAuth)

// ── Validation helpers ───────────────────────────────────────────
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function asPositiveNumber(v: unknown, field: string, errors: Record<string, string>): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    errors[field] = `${field} deve ser > 0`
    return 0
  }
  return n
}

function asName(v: unknown, field: string, errors: Record<string, string>): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > 80) {
    errors[field] = `${field} obrigatório (1-80 caracteres)`
    return ''
  }
  return v.trim()
}

function asOptionalString(v: unknown, max = 200): string | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || v.length > max) return null
  return v.trim()
}

function asOptionalYm(v: unknown, field: string, errors: Record<string, string>): string | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v !== 'string' || !YM_RE.test(v)) {
    errors[field] = `${field} deve ter o formato AAAA-MM`
    return null
  }
  return v
}

function asExpenseType(v: unknown, errors: Record<string, string>): 'fixed' | 'variable' {
  if (v === 'fixed' || v === 'variable') return v
  errors.type = "type deve ser 'fixed' ou 'variable'"
  return 'fixed'
}

function asOptionalDay(v: unknown, errors: Record<string, string>): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    errors.dayOfMonth = 'dayOfMonth entre 1 e 31'
    return null
  }
  return n
}

// ── KPI helper ───────────────────────────────────────────────────
async function summarize(userId: string) {
  const [incomes, expenses] = await Promise.all([
    prisma.income.findMany({ where: { userId, active: true } }),
    prisma.expense.findMany({ where: { userId, active: true } }),
  ])

  const incomeTotal = incomes.reduce((s, i) => s + i.amount, 0)
  const fixedTotal = expenses.filter((e) => e.type === 'fixed').reduce((s, e) => s + e.amount, 0)
  const variableTotal = expenses.filter((e) => e.type === 'variable').reduce((s, e) => s + e.amount, 0)
  const expensesTotal = fixedTotal + variableTotal

  return {
    incomeTotal,
    fixedTotal,
    variableTotal,
    expensesTotal,
    discretionary: incomeTotal - fixedTotal,  // "saldo livre" before variable spend
    netMonthly: incomeTotal - expensesTotal,  // saldo final
    netAnnual: (incomeTotal - expensesTotal) * 12,
  }
}

// ── GET /api/budget ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!
    const [incomes, expenses, kpis] = await Promise.all([
      prisma.income.findMany({ where: { userId }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      prisma.expense.findMany({ where: { userId }, orderBy: [{ active: 'desc' }, { type: 'asc' }, { name: 'asc' }] }),
      summarize(userId),
    ])
    res.json({ incomes, expenses, kpis })
  } catch (err) {
    console.error('GET /api/budget failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── Incomes CRUD ────────────────────────────────────────────────
router.post('/incomes', async (req, res) => {
  const errors: Record<string, string> = {}
  const name = asName(req.body?.name, 'name', errors)
  const amount = asPositiveNumber(req.body?.amount, 'amount', errors)
  const category = asOptionalString(req.body?.category, 40)
  const startYm = asOptionalYm(req.body?.startYm, 'startYm', errors)
  const endYm = asOptionalYm(req.body?.endYm, 'endYm', errors)
  const notes = asOptionalString(req.body?.notes, 500)
  const active = typeof req.body?.active === 'boolean' ? req.body.active : true

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const income = await prisma.income.create({
      data: { userId: req.session.userId!, name, amount, category, startYm, endYm, notes, active },
    })
    res.status(201).json({ income })
  } catch (err) {
    console.error('POST /incomes failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.put('/incomes/:id', async (req, res) => {
  const { id } = req.params
  const errors: Record<string, string> = {}
  const data: Record<string, unknown> = {}
  if (req.body?.name !== undefined)     data.name = asName(req.body.name, 'name', errors)
  if (req.body?.amount !== undefined)   data.amount = asPositiveNumber(req.body.amount, 'amount', errors)
  if (req.body?.category !== undefined) data.category = asOptionalString(req.body.category, 40)
  if (req.body?.startYm !== undefined)  data.startYm = asOptionalYm(req.body.startYm, 'startYm', errors)
  if (req.body?.endYm !== undefined)    data.endYm = asOptionalYm(req.body.endYm, 'endYm', errors)
  if (req.body?.notes !== undefined)    data.notes = asOptionalString(req.body.notes, 500)
  if (req.body?.active !== undefined && typeof req.body.active === 'boolean') data.active = req.body.active

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }
  if (Object.keys(data).length === 0) { res.status(400).json({ error: 'Nada para atualizar' }); return }

  try {
    const existing = await prisma.income.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.session.userId) {
      res.status(404).json({ error: 'Não encontrado' }); return
    }
    const income = await prisma.income.update({ where: { id }, data })
    res.json({ income })
  } catch (err) {
    console.error('PUT /incomes/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.delete('/incomes/:id', async (req, res) => {
  const { id } = req.params
  try {
    const existing = await prisma.income.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.session.userId) {
      res.status(404).json({ error: 'Não encontrado' }); return
    }
    await prisma.income.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /incomes/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── Expenses CRUD ───────────────────────────────────────────────
router.post('/expenses', async (req, res) => {
  const errors: Record<string, string> = {}
  const name = asName(req.body?.name, 'name', errors)
  const amount = asPositiveNumber(req.body?.amount, 'amount', errors)
  const type = asExpenseType(req.body?.type, errors)
  const category = asOptionalString(req.body?.category, 40)
  const dayOfMonth = asOptionalDay(req.body?.dayOfMonth, errors)
  const startYm = asOptionalYm(req.body?.startYm, 'startYm', errors)
  const endYm = asOptionalYm(req.body?.endYm, 'endYm', errors)
  const notes = asOptionalString(req.body?.notes, 500)
  const active = typeof req.body?.active === 'boolean' ? req.body.active : true

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const expense = await prisma.expense.create({
      data: { userId: req.session.userId!, name, amount, type, category, dayOfMonth, startYm, endYm, notes, active },
    })
    res.status(201).json({ expense })
  } catch (err) {
    console.error('POST /expenses failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.put('/expenses/:id', async (req, res) => {
  const { id } = req.params
  const errors: Record<string, string> = {}
  const data: Record<string, unknown> = {}
  if (req.body?.name !== undefined)        data.name = asName(req.body.name, 'name', errors)
  if (req.body?.amount !== undefined)      data.amount = asPositiveNumber(req.body.amount, 'amount', errors)
  if (req.body?.type !== undefined)        data.type = asExpenseType(req.body.type, errors)
  if (req.body?.category !== undefined)    data.category = asOptionalString(req.body.category, 40)
  if (req.body?.dayOfMonth !== undefined)  data.dayOfMonth = asOptionalDay(req.body.dayOfMonth, errors)
  if (req.body?.startYm !== undefined)     data.startYm = asOptionalYm(req.body.startYm, 'startYm', errors)
  if (req.body?.endYm !== undefined)       data.endYm = asOptionalYm(req.body.endYm, 'endYm', errors)
  if (req.body?.notes !== undefined)       data.notes = asOptionalString(req.body.notes, 500)
  if (req.body?.active !== undefined && typeof req.body.active === 'boolean') data.active = req.body.active

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }
  if (Object.keys(data).length === 0) { res.status(400).json({ error: 'Nada para atualizar' }); return }

  try {
    const existing = await prisma.expense.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.session.userId) {
      res.status(404).json({ error: 'Não encontrado' }); return
    }
    const expense = await prisma.expense.update({ where: { id }, data })
    res.json({ expense })
  } catch (err) {
    console.error('PUT /expenses/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.delete('/expenses/:id', async (req, res) => {
  const { id } = req.params
  try {
    const existing = await prisma.expense.findUnique({ where: { id } })
    if (!existing || existing.userId !== req.session.userId) {
      res.status(404).json({ error: 'Não encontrado' }); return
    }
    await prisma.expense.delete({ where: { id } })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /expenses/:id failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
