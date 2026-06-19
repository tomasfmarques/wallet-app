import { useMutation } from 'react-query'
import { api, ApiError } from '@/lib/api'

export interface CompareInput {
  loanId: string
  valor: number
  modo: 'prazo' | 'prestacao'
  ymAmortizacao?: string
  investReturn: number  // % e.g. 7.0 — used in manual mode / as fallback
  taxRate: number       // % e.g. 28.0
  frequencia?: 'unica' | 'mensal' | 'anual'  // lump sum vs recurring monthly / yearly (default unica)
  returnMode?: 'portfolio' | 'manual'        // project across assets vs flat rate (default portfolio)
  riskVolatility?: number                     // portfolio annualized volatility % → enables ±1σ band
}

export interface CurvePoint {
  ym: string
  amortizar: number
  investir: number
}

export interface CompareResult {
  horizonMonths: number
  frequencia: 'unica' | 'mensal' | 'anual'
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
    totalContributed: number          // total invested over the horizon
    effectiveReturn: number           // annual % actually applied (blended in portfolio mode)
    returnMode: 'portfolio' | 'manual' // mode actually used (falls back to manual w/o assets)
    riskVolatility: number | null     // σ used for the band (null if not provided)
    pessimisticNet: number | null     // net gain at effectiveReturn − σ
    optimisticNet: number | null      // net gain at effectiveReturn + σ
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
