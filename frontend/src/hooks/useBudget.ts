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
  kpis: BudgetKpis
}

export interface IncomeInput {
  name: string
  amount: number
  category?: string | null
  active?: boolean
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
  startYm?: string | null
  endYm?: string | null
  notes?: string | null
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
