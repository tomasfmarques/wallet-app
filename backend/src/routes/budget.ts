import { Router } from 'express'
import { Prisma } from '@prisma/client'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { stripFormulaPrefix } from '../lib/sanitize'
import { computeKpis } from '../lib/loanEngine'

const router = Router()
router.use(requireAuth)

// ── Validation helpers ───────────────────────────────────────────
const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/

const MAX_AMOUNT = 10_000_000   // 10 M € ceiling per budget line (defence in depth)

function asPositiveNumber(v: unknown, field: string, errors: Record<string, string>): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) {
    errors[field] = `${field} deve ser > 0`
    return 0
  }
  if (n > MAX_AMOUNT) {
    errors[field] = `${field} fora do intervalo`
    return 0
  }
  return n
}

function asName(v: unknown, field: string, errors: Record<string, string>): string {
  if (typeof v !== 'string' || v.trim().length === 0 || v.length > 80) {
    errors[field] = `${field} obrigatório (1-80 caracteres)`
    return ''
  }
  // Neutralise CSV/formula-injection prefixes at the write boundary (F5). Also
  // guards the statement-import path, where names are attacker-controllable.
  const clean = stripFormulaPrefix(v)
  if (clean.length === 0) { errors[field] = `${field} inválido`; return '' }
  return clean
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

// Entry cadence. `amount` is always the monthly-equivalent; frequency is metadata.
const FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'quarterly', 'annual'] as const
function asFrequency(v: unknown): string {
  return typeof v === 'string' && (FREQUENCIES as readonly string[]).includes(v) ? v : 'monthly'
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

// ── Merchant key (for learned classification rules) ──────────────
// Normalize a transaction description down to a stable merchant key so that
// "CONTINENTE BELAS - Cartao 2824" and "CONTINENTE SINTRA - Cartao 3001" both
// map to "continente belas"/"continente sintra"… actually we strip the card
// suffix and digits so recurring merchants collapse to the same key.
function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')             // strip accents
    .replace(/-\s*(cartao|terminal|cart)\b.*$/i, '')     // drop "- Cartao 2824 …"
    .replace(/\b\d[\d.,/-]*\b/g, ' ')                    // drop numbers (card/ref)
    .replace(/[^a-z\s]/g, ' ')                           // drop punctuation
    .replace(/\s+/g, ' ')
    .trim()
}

// An imported actual is any row carrying a `source` (set only by the import /
// bank-sync pipeline; manual rows never have one). Everything else is the
// recurring PLAN. The headline KPIs and the Tabelas are plan-only — see FX1.
const isActual = (r: { source: string | null }) => !!r.source

// ── Loan-linked expenses ─────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100

// Map of loanId → current monthly prestação. A budget fixed expense linked to a
// loan (`loanId`) shows this LIVE figure instead of a stale manual amount, so the
// mortgage isn't tracked in two places (#9).
async function loanPrestacoes(userId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const loans = await prisma.loan.findMany({
    where: { userId },
    include: { amortizations: { orderBy: { ym: 'asc' } } },
  })
  for (const loan of loans) {
    try {
      const kpis = computeKpis({
        capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
        mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
        dataInicio: loan.dataInicio,
        amortizacoes: loan.amortizations.map((a) => ({ ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao' })),
      })
      if (kpis.proximaPrestacao > 0) map.set(loan.id, round2(kpis.proximaPrestacao))
    } catch { /* skip a loan that can't be computed */ }
  }
  return map
}

// A linked expense's effective amount = its loan's current prestação (if the loan
// still resolves), else the stored amount (graceful when the loan was deleted).
const syncedAmount = (e: { loanId: string | null; amount: number }, prest: Map<string, number>): number =>
  e.loanId && prest.has(e.loanId) ? prest.get(e.loanId)! : e.amount

// ── KPI helper ───────────────────────────────────────────────────
async function summarize(userId: string, prest: Map<string, number>) {
  // Pending (imported, not yet classified) items don't count toward totals
  // until the user assigns them fixed/variable. Imported actuals (source set)
  // are one-off realised lines, NOT recurring — excluding them keeps this a
  // stable *monthly plan* figure instead of being inflated by every import.
  const [incomes, expenses] = await Promise.all([
    prisma.income.findMany({ where: { userId, active: true, pending: false, source: null } }),
    prisma.expense.findMany({ where: { userId, active: true, pending: false, source: null } }),
  ])

  const incomeTotal = incomes.reduce((s, i) => s + i.amount, 0)
  const fixedTotal = expenses.filter((e) => e.type === 'fixed').reduce((s, e) => s + syncedAmount(e, prest), 0)
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
    const prest = await loanPrestacoes(userId)
    const [allIncomes, allExpensesRaw, pendingIncomes, pendingExpenses, kpis] = await Promise.all([
      prisma.income.findMany({ where: { userId, pending: false }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      prisma.expense.findMany({ where: { userId, pending: false }, orderBy: [{ active: 'desc' }, { type: 'asc' }, { name: 'asc' }] }),
      prisma.income.findMany({ where: { userId, pending: true }, orderBy: [{ createdAt: 'desc' }] }),
      prisma.expense.findMany({ where: { userId, pending: true }, orderBy: [{ createdAt: 'desc' }] }),
      summarize(userId, prest),
    ])
    // Loan-linked fixed expenses show the loan's LIVE prestação (#9).
    const allExpenses = allExpensesRaw.map((e) => ({ ...e, amount: syncedAmount(e, prest) }))
    // Split the two lanes (FX1): `incomes`/`expenses` are the recurring PLAN
    // (what the Tabelas show); `actual*` are imported one-off realised lines.
    const incomes = allIncomes.filter((r) => !isActual(r))
    const expenses = allExpenses.filter((r) => !isActual(r))
    const actualIncomes = allIncomes.filter(isActual)
    const actualExpenses = allExpenses.filter(isActual)
    res.json({ incomes, expenses, actualIncomes, actualExpenses, pendingIncomes, pendingExpenses, kpis })
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
  const matchHint = asOptionalString(req.body?.matchHint, 80)
  const frequency = asFrequency(req.body?.frequency)
  const startYm = asOptionalYm(req.body?.startYm, 'startYm', errors)
  const endYm = asOptionalYm(req.body?.endYm, 'endYm', errors)
  const notes = asOptionalString(req.body?.notes, 500)
  const active = typeof req.body?.active === 'boolean' ? req.body.active : true
  const pending = typeof req.body?.pending === 'boolean' ? req.body.pending : false

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const income = await prisma.income.create({
      data: { userId: req.session.userId!, name, amount, type, category, matchHint, frequency, startYm, endYm, notes, active, pending },
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
  if (req.body?.matchHint !== undefined) data.matchHint = asOptionalString(req.body.matchHint, 80)
  if (req.body?.frequency !== undefined) data.frequency = asFrequency(req.body.frequency)
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
    const summary = await processImportItems(userId, items)
    if (summary.incomes === 0 && summary.expenses === 0) {
      // Everything matched an existing recurring item → nothing to insert, but
      // that's a successful no-op (not an error): the money is already tracked.
      if (summary.matchedToPlan > 0) {
        res.status(201).json({ ok: true, summary })
        return
      }
      res.status(400).json({
        error: summary.duplicates > 0
          ? 'Todas as transações já tinham sido importadas (duplicadas).'
          : 'Nenhuma transação válida para importar',
        summary,
      })
      return
    }
    res.status(201).json({ ok: true, summary })
  } catch (err) {
    console.error('POST /budget/import failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// Shared import pipeline: dedup → learned-rule auto-classify → insert.
// Used by the statement import above AND by the bank sync (routes/bank.ts),
// so file uploads and live bank transactions behave identically.
export interface ImportSummary {
  incomes: number; expenses: number; skipped: number; duplicates: number; autoClassified: number; matchedToPlan: number
}
export async function processImportItems(userId: string, items: unknown[]): Promise<ImportSummary> {
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

  // Learned rules: a matched line is auto-classified (skips "Por classificar").
  const rules = await prisma.classificationRule.findMany({ where: { userId } })
  const ruleByKey = new Map(rules.map((r) => [r.matchKey, r]))

  // Recurring FIXED plan rows the user already has (salary, rent, subscriptions:
  // source = null, type = fixed, active). An imported line matching one of these
  // is the realisation of that recurring item, not a new movement — we skip it so
  // the same money isn't shown twice (recurring plan row + a duplicate imported
  // "actual"). VARIABLE plan rows are budgets, not fixed amounts, so they do NOT
  // suppress their actuals. Keyed `${kind}|${merchantKey}` to reuse the same
  // normalization as learned rules. (Frontend folds these plan rows back into the
  // "real" month view so planeado-vs-real stays correct — see lib/budgetReal.ts.)
  const [planIncomes, planExpenses] = await Promise.all([
    prisma.income.findMany({ where: { userId, source: null, type: 'fixed', active: true }, select: { name: true, matchHint: true } }),
    prisma.expense.findMany({ where: { userId, source: null, type: 'fixed', active: true }, select: { name: true, matchHint: true } }),
  ])
  const recurringFixed = new Set<string>()
  for (const r of planIncomes) {
    const k = merchantKey(r.name); if (k) recurringFixed.add(`income|${k}`)
    // A fixed income's bank-statement description also matches (so a salary line
    // "ORDENADO ACME" links to an income named "Salário" — the hand-renamed case).
    if (r.matchHint) { const h = merchantKey(r.matchHint); if (h) recurringFixed.add(`income|${h}`) }
  }
  for (const r of planExpenses) {
    const k = merchantKey(r.name); if (k) recurringFixed.add(`expense|${k}`)
    // A fixed expense's bank-statement description also matches (so a mortgage line
    // links to "Prestação casa" regardless of the display name).
    if (r.matchHint) { const h = merchantKey(r.matchHint); if (h) recurringFixed.add(`expense|${h}`) }
  }

  const incomeRows: Prisma.IncomeCreateManyInput[] = []
  const expenseRows: Prisma.ExpenseCreateManyInput[] = []
  let skipped = 0
  let duplicates = 0
  let autoClassified = 0
  let matchedToPlan = 0

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
    const source = asOptionalString(item.source, 40)

    if (Object.keys(errs).length > 0) { skipped++; continue }

    const kind = item.kind === 'income' ? 'income' : item.kind === 'expense' ? 'expense' : null
    if (!kind) { skipped++; continue }

    const mKey = merchantKey(name)

    // Auto-match to an existing recurring fixed plan row (salary/rent/mortgage):
    // the recurring entry already accounts for this money every month, so don't
    // create a duplicate one-off "actual". Kind-AGNOSTIC: a debit (the cost) OR a
    // credit (a refund/devolução of that cost, e.g. a spread bonification) both
    // match, so a refund doesn't surface as spurious income. Reported as
    // matchedToPlan.
    if (mKey && (recurringFixed.has(`expense|${mKey}`) || recurringFixed.has(`income|${mKey}`))) { matchedToPlan++; continue }

    // Skip if this month-scoped line already exists. Also dedupes against
    // rows added earlier in this same batch (e.g. an accidentally doubled
    // file). Lines without a month can't be fingerprinted — always insert.
    if (startYm) {
      const sig = dupSignature(kind, name, amount, startYm, dayOfMonth)
      if (seen.has(sig)) { duplicates++; continue }
      seen.add(sig)
    }

    // If a learned rule matches this merchant, auto-classify (skip the box).
    // Otherwise the line lands as `pending` for manual fixed/variable triage.
    const rule = ruleByKey.get(mKey)
    const matched = !!rule && rule.kind === kind
    if (matched) autoClassified++
    const pending = !matched
    const cat = category ?? (matched ? rule!.category : null)

    if (kind === 'income') {
      const type = matched ? (rule!.type as 'fixed' | 'variable') : (item.type === 'variable' ? 'variable' : 'fixed')
      incomeRows.push({ userId, name, amount, type, category: cat, dayOfMonth, source, startYm, endYm, notes, active: true, pending })
    } else {
      const type = matched ? (rule!.type as 'fixed' | 'variable') : (item.type === 'fixed' ? 'fixed' : 'variable')
      expenseRows.push({ userId, name, amount, type, category: cat, dayOfMonth, source, startYm, endYm, notes, active: true, pending })
    }
  }

  if (incomeRows.length > 0 || expenseRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      if (incomeRows.length > 0) await tx.income.createMany({ data: incomeRows })
      if (expenseRows.length > 0) await tx.expense.createMany({ data: expenseRows })
    })
  }
  return { incomes: incomeRows.length, expenses: expenseRows.length, skipped, duplicates, autoClassified, matchedToPlan }
}

// ── Classify a pending line (and learn a rule) ──────────────────
// Sets one pending item's type + clears pending, saves a merchant rule, and
// applies it to every other pending item from the same merchant. Future
// imports auto-classify matches, so "Por classificar" shrinks over time.
router.post('/classify', async (req, res) => {
  const id = typeof req.body?.id === 'string' ? req.body.id : null
  const kind = req.body?.kind === 'income' ? 'income' : req.body?.kind === 'expense' ? 'expense' : null
  const type = req.body?.type === 'fixed' ? 'fixed' : req.body?.type === 'variable' ? 'variable' : null
  if (!id || !kind || !type) { res.status(400).json({ error: 'id, kind e type obrigatórios' }); return }

  const userId = req.session.userId!
  try {
    const target = kind === 'income'
      ? await prisma.income.findUnique({ where: { id } })
      : await prisma.expense.findUnique({ where: { id } })
    if (!target || target.userId !== userId) { res.status(404).json({ error: 'Não encontrado' }); return }

    const key = merchantKey(target.name)

    await prisma.classificationRule.upsert({
      where: { userId_matchKey: { userId, matchKey: key } },
      create: { userId, matchKey: key, kind, type, category: target.category ?? null },
      update: { kind, type, category: target.category ?? null },
    })

    // Classifying as FIXED promotes the line to a recurring PLAN entry — it
    // leaves "Movimentos do mês" and shows in Receitas/Despesas Fixas, counting
    // every month. We do this for the clicked line only: clear its `source`
    // (so it's no longer an imported one-off "actual") and its month-scoping
    // (startYm/endYm) so it recurs. Same-merchant siblings are just classified
    // and kept as actuals — so the user doesn't get N duplicate recurring rows.
    // Variable classification keeps the existing one-off "actual" behaviour.
    const promote = type === 'fixed'
    const targetData = promote
      ? { type, pending: false, source: null, startYm: null, endYm: null, active: true }
      : { type, pending: false }

    // Apply to this item + all pending siblings of the same kind/merchant.
    let applied = 0
    if (kind === 'income') {
      const pend = await prisma.income.findMany({ where: { userId, pending: true } })
      const sibIds = new Set(pend.filter((i) => merchantKey(i.name) === key).map((i) => i.id))
      sibIds.delete(id)
      await prisma.income.update({ where: { id }, data: targetData })
      if (sibIds.size > 0) await prisma.income.updateMany({ where: { id: { in: [...sibIds] } }, data: { type, pending: false } })
      applied = sibIds.size + 1
    } else {
      const pend = await prisma.expense.findMany({ where: { userId, pending: true } })
      const sibIds = new Set(pend.filter((e) => merchantKey(e.name) === key).map((e) => e.id))
      sibIds.delete(id)
      await prisma.expense.update({ where: { id }, data: targetData })
      if (sibIds.size > 0) await prisma.expense.updateMany({ where: { id: { in: [...sibIds] } }, data: { type, pending: false } })
      applied = sibIds.size + 1
    }

    res.json({ ok: true, applied })
  } catch (err) {
    console.error('POST /budget/classify failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── Bulk delete (checkbox multi-select on the month view) ───────
// ── PUT /api/budget/bulk-update ─────────────────────────────────
// Patches category and/or type on multiple incomes and/or expenses.
router.put('/bulk-update', async (req, res) => {
  const incomeIds = Array.isArray(req.body?.incomeIds)
    ? (req.body.incomeIds as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const expenseIds = Array.isArray(req.body?.expenseIds)
    ? (req.body.expenseIds as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (incomeIds.length === 0 && expenseIds.length === 0) {
    res.status(400).json({ error: 'Nada para actualizar' }); return
  }
  const patch = req.body?.patch
  if (typeof patch !== 'object' || patch === null) {
    res.status(400).json({ error: 'patch obrigatório' }); return
  }
  const data: {
    category?: string | null
    type?: 'fixed' | 'variable'
    source?: null
    startYm?: null
    endYm?: null
    active?: boolean
  } = {}
  if ('category' in patch) data.category = asOptionalString(patch.category, 40)
  if ('type' in patch) {
    if (patch.type !== 'fixed' && patch.type !== 'variable') {
      res.status(400).json({ error: "type deve ser 'fixed' ou 'variable'" }); return
    }
    data.type = patch.type
    // Setting type to FIXED promotes the selected rows to recurring PLAN
    // entries: clear the imported `source` + month-scoping so they move out of
    // "Movimentos do mês" and into Receitas/Despesas Fixas, counting monthly.
    if (patch.type === 'fixed') {
      data.source = null
      data.startYm = null
      data.endYm = null
      data.active = true
    }
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'patch vazio — indica category ou type' }); return
  }
  const userId = req.session.userId!
  try {
    const ops: Prisma.PrismaPromise<unknown>[] = []
    if (incomeIds.length > 0)
      ops.push(prisma.income.updateMany({ where: { userId, id: { in: incomeIds } }, data }))
    if (expenseIds.length > 0)
      ops.push(prisma.expense.updateMany({ where: { userId, id: { in: expenseIds } }, data }))
    await prisma.$transaction(ops)
    res.json({ ok: true })
  } catch (err) {
    console.error('PUT /budget/bulk-update failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/delete', async (req, res) => {
  const incomeIds = Array.isArray(req.body?.incomeIds)
    ? (req.body.incomeIds as unknown[]).filter((x): x is string => typeof x === 'string') : []
  const expenseIds = Array.isArray(req.body?.expenseIds)
    ? (req.body.expenseIds as unknown[]).filter((x): x is string => typeof x === 'string') : []
  if (incomeIds.length === 0 && expenseIds.length === 0) {
    res.status(400).json({ error: 'Nada para remover' }); return
  }
  const userId = req.session.userId!
  try {
    const [inc, exp] = await prisma.$transaction([
      prisma.income.deleteMany({ where: { userId, id: { in: incomeIds } } }),
      prisma.expense.deleteMany({ where: { userId, id: { in: expenseIds } } }),
    ])
    res.json({ ok: true, deleted: inc.count + exp.count })
  } catch (err) {
    console.error('POST /budget/delete failed:', err)
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
  const loanId = asOptionalString(req.body?.loanId, 40)
  const matchHint = asOptionalString(req.body?.matchHint, 80)
  const frequency = asFrequency(req.body?.frequency)
  const active = typeof req.body?.active === 'boolean' ? req.body.active : true
  const pending = typeof req.body?.pending === 'boolean' ? req.body.pending : false

  if (Object.keys(errors).length > 0) { res.status(400).json({ errors }); return }

  try {
    const expense = await prisma.expense.create({
      data: { userId: req.session.userId!, name, amount, type, category, dayOfMonth, startYm, endYm, notes, loanId, matchHint, frequency, active, pending },
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
  if (req.body?.loanId !== undefined)      data.loanId = asOptionalString(req.body.loanId, 40)
  if (req.body?.matchHint !== undefined)   data.matchHint = asOptionalString(req.body.matchHint, 80)
  if (req.body?.frequency !== undefined)   data.frequency = asFrequency(req.body.frequency)
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

// ── One-off cleanup: remove rows mangled by the old import encoding ──
// Lines imported before the UTF-8/Windows-1252 fix may contain the Unicode
// replacement char (�). The original bytes are unrecoverable, so we delete those
// rows; the user then re-imports the statement (now decoded correctly).
router.post('/cleanup-encoding', async (req, res) => {
  const userId = req.session.userId!
  try {
    const where = { userId, name: { contains: '�' } }
    const [inc, exp] = await prisma.$transaction([
      prisma.income.deleteMany({ where }),
      prisma.expense.deleteMany({ where }),
    ])
    res.json({ ok: true, deleted: inc.count + exp.count })
  } catch (err) {
    console.error('POST /budget/cleanup-encoding failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
