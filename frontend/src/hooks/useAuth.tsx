import { createContext, useContext, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'
import { apiErrorMessage } from '@/lib/apiError'
import type { User } from '@/types'

// ── Types ─────────────────────────────────────────────────────────
interface MeResponse {
  user: User
}

interface AuthResponse {
  user: User
}

export interface SignupInput {
  email: string
  password: string
  name: string
  remember?: boolean
}

export interface LoginInput {
  email: string
  password: string
  // "Lembrar-me": when false, the server issues a 1-day session instead of 30.
  remember?: boolean
}

// Errors API contract: { error: string } or { errors: Record<string,string> }
export interface FieldErrors {
  [field: string]: string
}

// ── Context for current user ──────────────────────────────────────
interface AuthContextValue {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const ME_KEY = ['auth', 'me'] as const

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery<MeResponse, ApiError>(
    ME_KEY,
    () => api.get<MeResponse>('/api/me'),
    {
      retry: false,
      // Don't surface 401 as an error — it just means "not signed in"
      onError: () => {},
      refetchOnWindowFocus: false,
    },
  )

  const user = data?.user ?? null

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

// ── Mutations ─────────────────────────────────────────────────────
export function useLogin() {
  const qc = useQueryClient()
  return useMutation<AuthResponse, ApiError, LoginInput>(
    (input) => api.post<AuthResponse>('/api/auth/login', input),
    {
      onSuccess: (data) => {
        qc.setQueryData(ME_KEY, data)
      },
    },
  )
}

export function useSignup() {
  const qc = useQueryClient()
  return useMutation<AuthResponse, ApiError, SignupInput>(
    (input) => api.post<AuthResponse>('/api/auth/signup', input),
    {
      onSuccess: (data) => {
        qc.setQueryData(ME_KEY, data)
      },
    },
  )
}

// Mint + log into a fresh seeded demo account. Replaces any current session.
export function useDemoLogin() {
  const qc = useQueryClient()
  return useMutation<AuthResponse, ApiError, void>(
    () => api.post<AuthResponse>('/api/auth/demo'),
    {
      onSuccess: (data) => {
        try { sessionStorage.removeItem('w360:unlocked') } catch { /* demo has no PIN */ }
        qc.setQueryData(ME_KEY, data)
        qc.invalidateQueries() // refetch all module data for the new account
      },
    },
  )
}

// Reset the current demo account's data back to the seeded state.
export function useDemoReset() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, void>(
    () => api.post<{ ok: true }>('/api/auth/demo/reset'),
    { onSuccess: () => { qc.invalidateQueries() } },
  )
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
}

export function useChangePassword() {
  return useMutation<{ ok: true }, ApiError, ChangePasswordInput>(
    (input) => api.post<{ ok: true }>('/api/auth/change-password', input),
  )
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation<{ user: User }, ApiError, { name: string }>(
    (input) => api.put<{ user: User }>('/api/me', input),
    {
      onSuccess: (data) => {
        qc.setQueryData(ME_KEY, data)
      },
    },
  )
}

// ── Dangerous operations: reset + delete account ─────────────────
export interface PasswordConfirm { currentPassword: string }

export function useResetData() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, PasswordConfirm>(
    (input) => api.post<{ ok: true }>('/api/me/reset', input),
    {
      onSuccess: () => {
        qc.invalidateQueries()
      },
    },
  )
}

export function useDeleteAccount() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError, PasswordConfirm>(
    (input) => api.delete<{ ok: true }>('/api/me', input),
    {
      onSuccess: () => {
        qc.setQueryData(ME_KEY, null)
        qc.clear()
      },
    },
  )
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation<{ ok: true }, ApiError>(
    () => api.post<{ ok: true }>('/api/auth/logout'),
    {
      onSuccess: () => {
        try { sessionStorage.removeItem('w360:unlocked') } catch { /* re-lock on next launch */ }
        // Don't silently re-sign the user right after an explicit logout.
        try {
          (window as unknown as { google?: { accounts?: { id?: { disableAutoSelect?: () => void } } } })
            .google?.accounts?.id?.disableAutoSelect?.()
        } catch { /* ignore */ }
        qc.setQueryData(ME_KEY, null)
        qc.clear() // drop all cached user-scoped data
      },
    },
  )
}

// Helper to extract per-field errors from a thrown ApiError
export function fieldErrorsFrom(err: unknown): FieldErrors {
  if (err instanceof ApiError && err.data && typeof err.data === 'object') {
    const data = err.data as { errors?: FieldErrors; error?: string }
    if (data.errors && typeof data.errors === 'object') return data.errors
  }
  // Translate the common backend messages; falls back to the raw string.
  return { _form: apiErrorMessage(err) }
}
