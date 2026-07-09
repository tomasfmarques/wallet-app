import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'

// ── Modo Casal (household v1) ────────────────────────────────────

export interface HouseholdInfo {
  id: string
  name: string
  members: Array<{ name: string; isMe: boolean }>
}

export interface HouseholdMemberTotals {
  name: string
  isMe: boolean
  portfolioValue: number
  invested: number
  loanOutstanding: number
  loanNextPaymentTotal: number
  monthlyIncome: number
  monthlyExpenses: number
  monthlyBalance: number
}

export interface HouseholdOverview {
  householdName: string
  members: HouseholdMemberTotals[]
  combined: {
    portfolioValue: number
    invested: number
    gainLoss: number
    loanOutstanding: number
    loanNextPaymentTotal: number
    monthlyIncome: number
    monthlyExpenses: number
    monthlyBalance: number
  }
}

export const HOUSEHOLD_KEY = ['household'] as const

export function useHousehold() {
  return useQuery<{ household: HouseholdInfo | null }, ApiError>(
    HOUSEHOLD_KEY,
    () => api.get<{ household: HouseholdInfo | null }>('/api/household'),
    { staleTime: 1000 * 60 },
  )
}

export function useHouseholdOverview(enabled: boolean) {
  return useQuery<HouseholdOverview, ApiError>(
    [...HOUSEHOLD_KEY, 'overview'],
    () => api.get<HouseholdOverview>('/api/household/overview'),
    { enabled, staleTime: 1000 * 60 },
  )
}

export function useCreateHousehold() {
  const qc = useQueryClient()
  return useMutation<{ household: HouseholdInfo }, ApiError, void>(
    () => api.post<{ household: HouseholdInfo }>('/api/household'),
    { onSuccess: () => qc.invalidateQueries(HOUSEHOLD_KEY) },
  )
}

export function useCreateInvite() {
  return useMutation<{ link: string; expiresInDays: number }, ApiError, void>(
    () => api.post<{ link: string; expiresInDays: number }>('/api/household/invites'),
  )
}

export function useJoinHousehold() {
  const qc = useQueryClient()
  return useMutation<{ household: HouseholdInfo }, ApiError, string>(
    (token) => api.post<{ household: HouseholdInfo }>('/api/household/join', { token }),
    { onSuccess: () => qc.invalidateQueries(HOUSEHOLD_KEY) },
  )
}

export function useLeaveHousehold() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, void>(
    () => api.delete<{ ok: true }>('/api/household/membership'),
    { onSuccess: () => qc.invalidateQueries(HOUSEHOLD_KEY) },
  )
}
