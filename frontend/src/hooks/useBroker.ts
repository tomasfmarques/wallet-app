import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'

export interface BrokerStatus {
  configured: boolean // BROKER_ENC_KEY set on the server
  connection: {
    broker: string
    env: string
    accountCcy: string | null
    lastSyncAt: string | null
  } | null
}

export interface BrokerSyncResult {
  ok: true
  // `preview: true` means the sync would CLOSE positions and is awaiting an
  // explicit confirm (call sync again with confirm:true to apply).
  preview?: boolean
  summary: { created: number; updated: number; closed: number; closing?: string[] }
}
export type BrokerEnv = 'live' | 'demo'

const STATUS_KEY = ['broker', 'status'] as const

export function useBrokerStatus(enabled = true) {
  return useQuery<BrokerStatus, ApiError>(
    STATUS_KEY,
    () => api.get<BrokerStatus>('/api/broker/status'),
    { enabled, staleTime: 30 * 1000 },
  )
}

export function useBrokerConnect() {
  const qc = useQueryClient()
  return useMutation<
    { ok: true; accountCcy: string | null },
    ApiError,
    { apiKey: string; apiSecret?: string; env: BrokerEnv }
  >(
    (body) => api.post('/api/broker/connect', body),
    { onSuccess: () => { qc.invalidateQueries(STATUS_KEY) } },
  )
}

export function useBrokerSync() {
  const qc = useQueryClient()
  return useMutation<BrokerSyncResult, ApiError, { confirm?: boolean } | void>(
    (vars) => api.post('/api/broker/sync', { confirm: vars && 'confirm' in vars ? vars.confirm : false }),
    {
      onSuccess: () => {
        qc.invalidateQueries(STATUS_KEY)
        qc.invalidateQueries(['portfolio']) // changed holdings should appear
      },
    },
  )
}

export function useBrokerDisconnect() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, void>(
    () => api.delete('/api/broker/connection'),
    { onSuccess: () => { qc.invalidateQueries(STATUS_KEY) } },
  )
}
