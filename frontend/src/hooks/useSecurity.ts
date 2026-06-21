import { useMutation, useQuery, useQueryClient } from 'react-query'
import {
  startRegistration, startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { api, ApiError } from '@/lib/api'

type Ok = { ok: true }
const ME_KEY = ['auth', 'me'] as const
const CREDS_KEY = ['webauthn-credentials'] as const

// ── PIN ──────────────────────────────────────────────────────────
export function usePinSet() {
  const qc = useQueryClient()
  return useMutation<Ok, ApiError, { pin: string; currentPassword?: string }>(
    (body) => api.post<Ok>('/api/auth/pin/set', body),
    { onSuccess: () => { qc.invalidateQueries(ME_KEY) } },
  )
}

export function usePinVerify() {
  return useMutation<Ok, ApiError, { pin: string }>(
    (body) => api.post<Ok>('/api/auth/pin/verify', body),
  )
}

export function usePinDisable() {
  const qc = useQueryClient()
  return useMutation<Ok, ApiError, { pin?: string; currentPassword?: string }>(
    (body) => api.post<Ok>('/api/auth/pin/disable', body),
    { onSuccess: () => { qc.invalidateQueries(ME_KEY) } },
  )
}

// ── WebAuthn (biometrics) ────────────────────────────────────────
// Register a passkey on this device: options → browser ceremony → verify.
export function useWebAuthnRegister() {
  const qc = useQueryClient()
  return useMutation<Ok, Error, { deviceName?: string }>(
    async ({ deviceName }) => {
      const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>('/api/auth/webauthn/register/options', {})
      const response = await startRegistration({ optionsJSON })
      return api.post<Ok>('/api/auth/webauthn/register/verify', { response, deviceName })
    },
    { onSuccess: () => { qc.invalidateQueries(ME_KEY); qc.invalidateQueries(CREDS_KEY) } },
  )
}

// Unlock with biometrics: options → ceremony → verify.
export function useWebAuthnAuth() {
  return useMutation<Ok, Error, void>(async () => {
    const optionsJSON = await api.post<PublicKeyCredentialRequestOptionsJSON>('/api/auth/webauthn/auth/options', {})
    const response = await startAuthentication({ optionsJSON })
    return api.post<Ok>('/api/auth/webauthn/auth/verify', { response })
  })
}

export interface WebAuthnDevice { id: string; deviceName: string | null; createdAt: string }

export function useWebAuthnCredentials(enabled = true) {
  return useQuery<{ credentials: WebAuthnDevice[] }, ApiError>(
    CREDS_KEY,
    () => api.get<{ credentials: WebAuthnDevice[] }>('/api/auth/webauthn'),
    { enabled },
  )
}

export function useWebAuthnDelete() {
  const qc = useQueryClient()
  return useMutation<Ok, ApiError, string>(
    (id) => api.delete<Ok>(`/api/auth/webauthn/${id}`),
    { onSuccess: () => { qc.invalidateQueries(CREDS_KEY); qc.invalidateQueries(ME_KEY) } },
  )
}
