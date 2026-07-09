import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

// Wraps protected routes. While loading the session, shows a spinner.
// If not authenticated, redirects to /signin and preserves the intended path.
export function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="auth-loading">
        <div className="spinner" aria-label="A carregar" />
      </div>
    )
  }

  if (!isAuthenticated) {
    // Keep the QUERY STRING too — a household invite link (/casal/aceitar
    // ?token=…) must survive the sign-in/sign-up round-trip.
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

export default AuthGuard
