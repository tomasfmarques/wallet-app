import { useMutation } from 'react-query'
import { api, ApiError } from '@/lib/api'

export interface CompareInput {
  loanId: string
  valor: number
  modo: 'prazo' | 'prestacao'
  ymAmortizacao?: string
  investReturn: number  // % e.g. 7.0
  taxRate: number       // % e.g. 28.0
}

export interface CurvePoint {
  ym: string
  amortizar: number
  investir: number
}

export interface CompareResult {
  horizonMonths: number
  amortizar: {
    interestSaved: number
    monthsSaved: number
    payoffYm: string
    newPrestacao: number | null
    monthlyFreed: number | null
  }
  investir: {
    futureValue: number
    grossGain: number
    netGainAfterTax: number
  }
  curve: CurvePoint[]
  recommendation: 'amortizar' | 'investir' | 'equivalente'
  breakEvenReturn: number  // gross annual % at which investing equals amortizing
}

export function useCompare() {
  return useMutation<CompareResult, ApiError, CompareInput>(
    (input) => api.post<CompareResult>('/api/simulate/compare', input),
  )
}
