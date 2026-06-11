import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'
import type {
  Loan, LoanPayment, LoanAmortization, EuriborHistory,
} from '@/types'

// ── Server response shapes ───────────────────────────────────────
export interface LoanScheduleRow {
  ym: string
  num: number
  rate: number
  prestacao: number
  juros: number
  amortizacao: number
  amortExtra: number
  capital: number
}

export interface LoanSchedule {
  rows: LoanScheduleRow[]
  totalPaid: number
  totalInterest: number
  payoffYm: string
  prazoMesesEfetivo: number
}

export interface LoanKpis {
  capitalAtual: number
  pctPago: number
  proximaPrestacao: number
  proximaYm: string
  conclusaoYm: string
  mesesRestantes: number
  juroPago: number
  juroTotalPrevisto: number
  poupancaJuros: number
}

export interface LoanWithRelations extends Loan {
  payments: LoanPayment[]
  amortizations: LoanAmortization[]
  euriborHistory: EuriborHistory[]
}

// One credit with its computed schedule + KPIs.
export interface LoanItem {
  loan: LoanWithRelations
  schedule: LoanSchedule
  kpis: LoanKpis
}

export interface LoanResponse {
  loans: LoanItem[]
}

export interface LoanInputBody {
  id?: string          // present → update that credit; absent → create new
  name: string
  capital: number
  prazoMeses: number
  tanFixa: number
  mesesFixos: number
  spread: number
  euribor: number
  dataInicio: string
  bonificacaoMensal?: number | null
  bonificacaoMeses?: number | null
  taeg?: number | null
}

// ── Query key ────────────────────────────────────────────────────
export const LOAN_KEY = ['loan'] as const

// ── Queries ──────────────────────────────────────────────────────
export function useLoan() {
  return useQuery<LoanResponse, ApiError>(
    LOAN_KEY,
    () => api.get<LoanResponse>('/api/loan'),
    { staleTime: 1000 * 60 },
  )
}

// ── Mutations ────────────────────────────────────────────────────
export function useUpsertLoan() {
  const qc = useQueryClient()
  return useMutation<{ loan: Loan }, ApiError, LoanInputBody>(
    (input) => api.put<{ loan: Loan }>('/api/loan', input),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

export function useDeleteLoan() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, string>(
    (id) => api.delete<{ ok: true }>(`/api/loan/${id}`),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

export function useUpdatePayment() {
  const qc = useQueryClient()
  return useMutation<
    { payment: LoanPayment },
    ApiError,
    { loanId: string; ym: string; paid?: boolean; real?: number | null }
  >(
    ({ loanId, ym, ...rest }) =>
      api.put<{ payment: LoanPayment }>(`/api/loan/${loanId}/payments/${ym}`, rest),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

export function useBulkUpdatePayments() {
  const qc = useQueryClient()
  return useMutation<
    { ok: true; updated: number },
    ApiError,
    { loanId: string; months: Array<{ ym: string; paid: boolean; real: number | null }> }
  >(
    ({ loanId, months }) =>
      api.put<{ ok: true; updated: number }>(`/api/loan/${loanId}/payments/bulk`, { months }),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

export function useAddAmortization() {
  const qc = useQueryClient()
  return useMutation<
    { amortization: LoanAmortization },
    ApiError,
    { loanId: string; ym: string; valor: number; modo: 'prazo' | 'prestacao' }
  >(
    ({ loanId, ...input }) =>
      api.post<{ amortization: LoanAmortization }>(`/api/loan/${loanId}/amortizations`, input),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

export function useDeleteAmortization() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, string>(
    (id) => api.delete<{ ok: true }>(`/api/loan/amortizations/${id}`),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

// ── Simulation ────────────────────────────────────────────────────
export interface SimulationInput {
  loanId: string
  annualAmount: number
  startYear: number
  futureEuribor: number
}

export interface SimulationResult {
  base: {
    totalInterest: number
    totalPaid: number
    payoffYm: string
    prazoMesesEfetivo: number
    rows: Array<{ ym: string; capital: number }>
  }
  simulated: {
    totalInterest: number
    totalPaid: number
    payoffYm: string
    prazoMesesEfetivo: number
    rows: Array<{ ym: string; capital: number }>
  }
  delta: {
    interestSaved: number
    monthsSaved: number
  }
}

export function useSimulation() {
  return useMutation<SimulationResult, ApiError, SimulationInput>(
    ({ loanId, ...input }) => api.post<SimulationResult>(`/api/loan/${loanId}/simulate`, input),
  )
}
