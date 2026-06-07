import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'
import type { Income, Expense, ExpenseType } from '@/types'

export interface BudgetKpis {
  incomeTotal: number
  fixedTotal: number
  variableTotal: number
  expensesTotal: number
  discretionary: number   // saldo livre (income − fixed)
  netMonthly: number      // saldo final (income − all expenses)
  netAnnual: number
}

export interface BudgetResponse {
  incomes: Income[]
  expenses: Expense[]
  pendingIncomes: Income[]    // imported, awaiting fixed/variable classification
  pendingExpenses: Expense[]
  kpis: BudgetKpis
}

export interface IncomeInput {
  name: string
  amount: number
  type?: ExpenseType
  category?: string | null
  active?: boolean
  pending?: boolean
  startYm?: string | null
  endYm?: string | null
  notes?: string | null
}

export interface ExpenseInput {
  name: string
  amount: number
  type: ExpenseType
  category?: string | null
  dayOfMonth?: number | null
  active?: boolean
  pending?: boolean
  startYm?: string | null
  endYm?: string | null
  notes?: string | null
}

// One reviewed statement line, ready to be inserted as income or expense.
export interface ImportItem {
  kind: 'income' | 'expense'
  name: string
  amount: number
  category?: string | null
  type?: ExpenseType        // expenses only; defaults to 'variable' server-side
  dayOfMonth?: number | null
  startYm?: string | null
  endYm?: string | null
  notes?: string | null
}

export interface ImportResult {
  ok: true
  summary: { incomes: number; expenses: number; skipped: number; duplicates: number; autoClassified: number }
}

export const BUDGET_KEY = ['budget'] as const

export function useBudget() {
  return useQuery<BudgetResponse, ApiError>(
    BUDGET_KEY,
    () => api.get<BudgetResponse>('/api/budget'),
    { staleTime: 30 * 1000 },
  )
}

// Incomes mutations
export function useAddIncome() {
  const qc = useQueryClient()
  return useMutation<{ income: Income }, ApiError, IncomeInput>(
    (i) => api.post<{ income: Income }>('/api/budget/incomes', i),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}
export function useUpdateIncome() {
  const qc = useQueryClient()
  return useMutation<
    { income: Income }, ApiError,
    { id: string; patch: Partial<IncomeInput> }
  >(
    ({ id, patch }) => api.put<{ income: Income }>(`/api/budget/incomes/${id}`, patch),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}
export function useDeleteIncome() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, string>(
    (id) => api.delete<{ ok: true }>(`/api/budget/incomes/${id}`),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}

// Classify a pending line + learn a rule that auto-applies to same-merchant
// lines (now and on future imports). Returns how many lines moved.
export function useClassifyPending() {
  const qc = useQueryClient()
  return useMutation<
    { ok: true; applied: number }, ApiError,
    { id: string; kind: 'income' | 'expense'; type: ExpenseType }
  >(
    (input) => api.post<{ ok: true; applied: number }>('/api/budget/classify', input),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}

// Bulk delete variable lines selected via checkboxes
export function useBulkDeleteBudget() {
  const qc = useQueryClient()
  return useMutation<
    { ok: true; deleted: number }, ApiError,
    { incomeIds?: string[]; expenseIds?: string[] }
  >(
    (input) => api.post<{ ok: true; deleted: number }>('/api/budget/delete', input),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}

// Bulk import from a parsed bank statement
export function useImportBudget() {
  const qc = useQueryClient()
  return useMutation<ImportResult, ApiError, ImportItem[]>(
    (items) => api.post<ImportResult>('/api/budget/import', { items }),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}

// Expenses mutations
export function useAddExpense() {
  const qc = useQueryClient()
  return useMutation<{ expense: Expense }, ApiError, ExpenseInput>(
    (e) => api.post<{ expense: Expense }>('/api/budget/expenses', e),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}
export function useUpdateExpense() {
  const qc = useQueryClient()
  return useMutation<
    { expense: Expense }, ApiError,
    { id: string; patch: Partial<ExpenseInput> }
  >(
    ({ id, patch }) => api.put<{ expense: Expense }>(`/api/budget/expenses/${id}`, patch),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}
export function useDeleteExpense() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, string>(
    (id) => api.delete<{ ok: true }>(`/api/budget/expenses/${id}`),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY) } },
  )
}
