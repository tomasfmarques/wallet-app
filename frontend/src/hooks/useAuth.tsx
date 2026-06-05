import { createContext, useContext, ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'
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
}

export interface LoginInput {
  email: string
  password: string
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
    (input) =>
      // DELETE with body — use fetch directly since the api helper's `delete`
      // doesn't take a body
      fetch('/api/me', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          const msg =
            (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
              ? data.error
              : null) ?? `Erro ${res.status}`
          throw new ApiError(res.status, msg, data)
        }
        return data as { ok: true }
      }),
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
    if (data.error) return { _form: data.error }
  }
  if (err instanceof Error) return { _form: err.message }
  return { _form: 'Erro inesperado' }
}
