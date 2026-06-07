import { Router } from 'express'
import { Prisma } from '@prisma/client'
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

// Lenient variant for income (and partial updates): unknown → fallback, no error.
function asBudgetType(v: unknown, fallback: 'fixed' | 'variable'): 'fixed' | 'variable' {
  return v === 'fixed' || v === 'variable' ? v : fallback
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

// ── Duplicate signature ──────────────────────────────────────────
// Stable fingerprint for an imported transaction, used to skip re-imports of
// the same statement. MUST stay byte-for-byte identical to the frontend copy
// in `frontend/src/lib/statementParser.ts` (`dupSignature`). Keyed on kind +
// month + day + amount (2dp) + normalized name, so two same-amount
// transactions on different days are kept distinct.
function dupSignature(
  kind: 'income' | 'expense',
  name: string,
  amount: number,
  ym: string,
  day: number | null,
): string {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  const dd = day != null ? String(day).padStart(2, '0') : '00'
  return `${kind}|${ym}|${dd}|${amount.toFixed(2)}|${n}`
}

// ── KPI helper ───────────────────────────────────────────────────
async function summarize(userId: string) {
  // Pending (imported, not yet classified) items don't count toward totals
  // until the user assigns them fixed/variable.
  const [incomes, expenses] = await Promise.all([
    prisma.income.findMany({ where: { userId, active: true, pending: false } }),
    prisma.expense.findMany({ where: { userId, active: true, pending: false } }),
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
    const [incomes, expenses, pendingIncomes, pendingExpenses, kpis] = await Promise.all([
      prisma.income.findMany({ where: { userId, pending: false }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      prisma.expense.findMany({ where: { userId, pending: false }, orderBy: [{ active: 'desc' }, { type: 'asc' }, { name: 'asc' }] }),
      prisma.income.findMany({ where: { userId, pending: true }, orderBy: [{ createdAt: 'desc' }] }),
      prisma.expense.findMany({ where: { userId, pending: true }, orderBy: [{ createdAt: 'desc' }] }),
      summarize(userId),
    ])
    res.json({ incomes, expenses, pendingIncomes, pendingExpenses, kpis })
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
  const type = asBudgetType(req.body?.type, 'fixed')
  const category = asOptionalString(req.body?.category, 40)
  const startYm = asOptionalYm(req.body?.startYm, 'startYm', errors)
  const endYm = asOptionalYm(req.body?.endYm, 'endYm', errors)
  const notes = asOptionalString(req.body?.notes, 500)
  const active = typeof req.body?.active === 'boolean' ? req.body.active : true
  const pending = typeof req.body?.pending === 'boolean' ? req.body.pending : false

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const income = await prisma.income.create({
      data: { userId: req.session.userId!, name, amount, type, category, startYm, endYm, notes, active, pending },
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
  if (req.body?.type !== undefined)     data.type = asBudgetType(req.body.type, 'fixed')
  if (req.body?.category !== undefined) data.category = asOptionalString(req.body.category, 40)
  if (req.body?.startYm !== undefined)  data.startYm = asOptionalYm(req.body.startYm, 'startYm', errors)
  if (req.body?.endYm !== undefined)    data.endYm = asOptionalYm(req.body.endYm, 'endYm', errors)
  if (req.body?.notes !== undefined)    data.notes = asOptionalString(req.body.notes, 500)
  if (req.body?.active !== undefined && typeof req.body.active === 'boolean') data.active = req.body.active
  if (req.body?.pending !== undefined && typeof req.body.pending === 'boolean') data.pending = req.body.pending

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

// ── Statement import ────────────────────────────────────────────
// Bulk-insert transactions parsed from a bank statement (CSV/OFX) on the
// client. The frontend sends an array of already-reviewed rows; each row is
// classified as income or expense. Invalid rows are skipped (not fatal) and
// reported back in the summary so the user knows what didn't make it.
//
// Duplicate guard: re-importing the same statement is a common mistake, so we
// fingerprint every month-scoped row the user already has and skip incoming
// rows whose signature matches. The frontend pre-flags these too, but the
// backend is authoritative (catches re-imports from another device/session).
//
// NOTE (semantics): the budget model holds *monthly* recurring amounts. An
// imported statement line is a one-off actual, so we scope it to a single
// month via startYm = endYm = the transaction's month. That keeps the
// timeline correct (it won't recur forever) but does inflate that month's
// KPI totals — see CAVEATS for the planned vs. actuals follow-up.
router.post('/import', async (req, res) => {
  const items = req.body?.items
  if (!Array.isArray(items)) {
    res.status(400).json({ error: 'items deve ser um array' }); return
  }
  if (items.length === 0) {
    res.status(400).json({ error: 'Nenhuma transação para importar' }); return
  }
  if (items.length > 2000) {
    res.status(400).json({ error: 'Demasiadas transações (máx. 2000 por importação)' }); return
  }

  const userId = req.session.userId!

  try {
    // Build the set of signatures the user already has. Only month-scoped rows
    // (startYm === endYm) are considered — those are the one-off imported
    // lines; genuine recurring budget items must never block an import.
    const sel = { name: true, amount: true, dayOfMonth: true, startYm: true, endYm: true } as const
    const [existingIncomes, existingExpenses] = await Promise.all([
      prisma.income.findMany({ where: { userId }, select: sel }),
      prisma.expense.findMany({ where: { userId }, select: sel }),
    ])
    const seen = new Set<string>()
    for (const r of existingIncomes) {
      if (r.startYm && r.startYm === r.endYm) seen.add(dupSignature('income', r.name, r.amount, r.startYm, r.dayOfMonth))
    }
    for (const r of existingExpenses) {
      if (r.startYm && r.startYm === r.endYm) seen.add(dupSignature('expense', r.name, r.amount, r.startYm, r.dayOfMonth))
    }

    const incomeRows: Prisma.IncomeCreateManyInput[] = []
    const expenseRows: Prisma.ExpenseCreateManyInput[] = []
    let skipped = 0
    let duplicates = 0

    for (const raw of items) {
      if (typeof raw !== 'object' || raw === null) { skipped++; continue }
      const item = raw as Record<string, unknown>
      const errs: Record<string, string> = {}

      const name = asName(item.name, 'name', errs)
      const amount = asPositiveNumber(item.amount, 'amount', errs)
      const category = asOptionalString(item.category, 40)
      const dayOfMonth = asOptionalDay(item.dayOfMonth, errs)
      const startYm = asOptionalYm(item.startYm, 'startYm', errs)
      const endYm = asOptionalYm(item.endYm, 'endYm', errs)
      const notes = asOptionalString(item.notes, 500)

      if (Object.keys(errs).length > 0) { skipped++; continue }

      const kind = item.kind === 'income' ? 'income' : item.kind === 'expense' ? 'expense' : null
      if (!kind) { skipped++; continue }

      // Skip if this month-scoped line already exists. Also dedupes against
      // rows added earlier in this same batch (e.g. an accidentally doubled
      // file). Lines without a month can't be fingerprinted — always insert.
      if (startYm) {
        const sig = dupSignature(kind, name, amount, startYm, dayOfMonth)
        if (seen.has(sig)) { duplicates++; continue }
        seen.add(sig)
      }

      // Imported lines land as `pending` — they show in the "Por classificar"
      // box until the user assigns them fixed/variable, then move to a table.
      // The type here is a provisional placeholder, overwritten on classify.
      if (kind === 'income') {
        const type = item.type === 'variable' ? 'variable' : 'fixed'
        incomeRows.push({ userId, name, amount, type, category, dayOfMonth, startYm, endYm, notes, active: true, pending: true })
      } else {
        const type = item.type === 'fixed' ? 'fixed' : 'variable'
        expenseRows.push({ userId, name, amount, type, category, dayOfMonth, startYm, endYm, notes, active: true, pending: true })
      }
    }

    if (incomeRows.length === 0 && expenseRows.length === 0) {
      res.status(400).json({
        error: duplicates > 0
          ? 'Todas as transações já tinham sido importadas (duplicadas).'
          : 'Nenhuma transação válida para importar',
        summary: { incomes: 0, expenses: 0, skipped, duplicates },
      })
      return
    }

    await prisma.$transaction(async (tx) => {
      if (incomeRows.length > 0) await tx.income.createMany({ data: incomeRows })
      if (expenseRows.length > 0) await tx.expense.createMany({ data: expenseRows })
    })
    res.status(201).json({
      ok: true,
      summary: { incomes: incomeRows.length, expenses: expenseRows.length, skipped, duplicates },
    })
  } catch (err) {
    console.error('POST /budget/import failed:', err)
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
  const pending = typeof req.body?.pending === 'boolean' ? req.body.pending : false

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const expense = await prisma.expense.create({
      data: { userId: req.session.userId!, name, amount, type, category, dayOfMonth, startYm, endYm, notes, active, pending },
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
  if (req.body?.pending !== undefined && typeof req.body.pending === 'boolean') data.pending = req.body.pending

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
