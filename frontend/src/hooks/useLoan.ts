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

export interface LoanResponse {
  loan: LoanWithRelations | null
  schedule?: LoanSchedule
  kpis?: LoanKpis
}

export interface LoanInputBody {
  capital: number
  prazoMeses: number
  tanFixa: number
  mesesFixos: number
  spread: number
  euribor: number
  dataInicio: string
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

export function useUpdatePayment() {
  const qc = useQueryClient()
  return useMutation<
    { payment: LoanPayment },
    ApiError,
    { ym: string; paid?: boolean; real?: number | null }
  >(
    ({ ym, ...rest }) =>
      api.put<{ payment: LoanPayment }>(`/api/loan/payments/${ym}`, rest),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

export function useAddAmortization() {
  const qc = useQueryClient()
  return useMutation<
    { amortization: LoanAmortization },
    ApiError,
    { ym: string; valor: number; modo: 'prazo' | 'prestacao' }
  >(
    (input) =>
      api.post<{ amortization: LoanAmortization }>('/api/loan/amortizations', input),
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
    (input) => api.post<SimulationResult>('/api/loan/simulate', input),
  )
}
