import type { Income, Expense } from '@/types'
import { merchantKey } from './merchant'

function activeInMonth(
  item: { active: boolean; startYm: string | null; endYm: string | null },
  ym: string,
): boolean {
  if (!item.active) return false
  if (item.startYm && ym < item.startYm) return false
  if (item.endYm && ym > item.endYm) return false
  return true
}

export interface RealMonth {
  incomes: Income[]
  fixedExpenses: Expense[]
  variableExpenses: Expense[]
  hasActuals: boolean   // does the month have any imported actuals?
}

// Build the "real" (what actually happened) view of a single month, merging
// imported actuals with the recurring plan (FX1 lanes).
//
// - Imported **actuals** are month-scoped (startYm === ym) and always included.
// - Recurring **FIXED** plan rows (salary, rent, subscriptions; source = null)
//   are folded in as realised: the import pipeline auto-matches them to the plan
//   instead of duplicating them (see backend processImportItems → matchedToPlan),
//   so without folding they'd vanish from the real lane. Skipped when a
//   same-merchant actual already represents that month (no double-count, incl.
//   legacy data imported before auto-matching existed).
// - **VARIABLE** plan rows are budgets, not fixed amounts, so they are NOT
//   folded — real variable spend comes only from actuals.
//
// `hasActuals` is driven purely by actuals so callers keep showing the plan-only
// view for months with no import (it must NOT flip just because a recurring plan
// row is active that month).
export function realMonth(
  planIncomes: Income[],
  planExpenses: Expense[],
  actualIncomes: Income[],
  actualExpenses: Expense[],
  ym: string,
): RealMonth {
  const actInc = actualIncomes.filter((i) => i.startYm === ym)
  const actFixed = actualExpenses.filter((e) => e.type === 'fixed' && e.startYm === ym)
  const actVar = actualExpenses.filter((e) => e.type === 'variable' && e.startYm === ym)
  const hasActuals = actInc.length + actFixed.length + actVar.length > 0

  if (!hasActuals) {
    return { incomes: [], fixedExpenses: [], variableExpenses: [], hasActuals: false }
  }

  const incKeys = new Set(actInc.map((i) => merchantKey(i.name)))
  const fixedKeys = new Set(actFixed.map((e) => merchantKey(e.name)))
  const foldInc = planIncomes.filter(
    (i) => i.type === 'fixed' && activeInMonth(i, ym) && !incKeys.has(merchantKey(i.name)),
  )
  const foldFixed = planExpenses.filter(
    (e) => e.type === 'fixed' && activeInMonth(e, ym) && !fixedKeys.has(merchantKey(e.name)),
  )

  return {
    incomes: [...actInc, ...foldInc],
    fixedExpenses: [...actFixed, ...foldFixed],
    variableExpenses: actVar,
    hasActuals: true,
  }
}
