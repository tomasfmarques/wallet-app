import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'
import { BUDGET_KEY, type ImportResult } from './useBudget'

export interface BankConnection {
  id: string
  institutionId: string
  institutionName: string
  logo: string | null
  status: 'created' | 'linked' | 'expired'
  createdAt: string
}

export interface BankStatus {
  configured: boolean
  connections: BankConnection[]
}

export interface BankInstitution {
  id: string
  name: string
  logo: string | null
}

const BANK_KEY = ['bank'] as const

export function useBankStatus(enabled = true) {
  return useQuery<BankStatus, ApiError>(
    BANK_KEY,
    () => api.get<BankStatus>('/api/bank/status'),
    { enabled, staleTime: 30 * 1000 },
  )
}

export function useBankInstitutions(enabled: boolean) {
  return useQuery<{ configured: boolean; institutions: BankInstitution[] }, ApiError>(
    ['bank', 'institutions'],
    () => api.get<{ configured: boolean; institutions: BankInstitution[] }>('/api/bank/institutions'),
    { enabled, staleTime: 60 * 60 * 1000 },
  )
}

export function useBankConnect() {
  const qc = useQueryClient()
  return useMutation<
    { link: string }, ApiError,
    { institutionId: string; institutionName: string; logo?: string | null }
  >(
    (input) => api.post<{ link: string }>('/api/bank/connect', input),
    { onSuccess: () => { qc.invalidateQueries(BANK_KEY) } },
  )
}

// Exchange the ?code&state from the bank redirect for a linked session.
export function useBankCallback() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, { code: string; state: string }>(
    (input) => api.post<{ ok: true }>('/api/bank/callback', input),
    { onSuccess: () => { qc.invalidateQueries(BANK_KEY) } },
  )
}

export function useBankSync() {
  const qc = useQueryClient()
  return useMutation<ImportResult, ApiError, void>(
    () => api.post<ImportResult>('/api/bank/sync'),
    { onSuccess: () => { qc.invalidateQueries(BUDGET_KEY); qc.invalidateQueries(BANK_KEY) } },
  )
}

export function useBankDisconnect() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, string>(
    (id) => api.delete<{ ok: true }>(`/api/bank/connections/${id}`),
    { onSuccess: () => { qc.invalidateQueries(BANK_KEY) } },
  )
}
