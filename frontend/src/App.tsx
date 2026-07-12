import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { useTranslation } from 'react-i18next'

import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { ThemeProvider } from '@/hooks/useTheme'
import { LockProvider } from '@/hooks/useLock'
import AuthGuard from '@/components/auth/AuthGuard'
import LockGate from '@/components/auth/LockGate'
import Layout from '@/components/layout/Layout'

import SignIn from '@/pages/SignIn'
import SignUp from '@/pages/SignUp'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Overview from '@/pages/Overview'
import Loan from '@/pages/Loan'
import Portfolio from '@/pages/Portfolio'
import Budget from '@/pages/Budget'
import Settings from '@/pages/Settings'
import Compare from '@/pages/Compare'
import Household from '@/pages/Household'
import HouseholdJoin from '@/pages/HouseholdJoin'
import PrivacyPolicy from '@/pages/legal/PrivacyPolicy'
import AccountDeletion from '@/pages/legal/AccountDeletion'

// ── Public marketing / free-tools funnel (docs/landing-spec.md) ──────────
// Lazy-loaded so none of this (nor the @engines-powered tool logic) enters
// the authenticated app's main chunk.
const Landing = lazy(() => import('@/pages/marketing/Landing'))
const ToolsIndex = lazy(() => import('@/pages/marketing/ToolsIndex'))
const IrsMaisValias = lazy(() => import('@/pages/marketing/tools/IrsMaisValias'))
const CreditoHabitacao = lazy(() => import('@/pages/marketing/tools/CreditoHabitacao'))
const AmortizarOuInvestir = lazy(() => import('@/pages/marketing/tools/AmortizarOuInvestir'))
const RevisaoEuribor = lazy(() => import('@/pages/marketing/tools/RevisaoEuribor'))

// "/" — Landing for signed-out visitors, /overview for signed-in ones
// (docs/landing-spec.md A1). Renders nothing while the session is resolving
// (no spinner, no landing-then-redirect flash for bookmarked signed-in users).
function RootGate() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  if (isAuthenticated) return <Navigate to="/overview" replace />
  return (
    <Suspense fallback={null}>
      <Landing />
    </Suspense>
  )
}

// Unknown routes: signed-in users keep the existing behaviour (→ /overview);
// signed-out visitors land on the marketing page instead of a dead end.
function CatchAll() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  return <Navigate to={isAuthenticated ? '/overview' : '/'} replace />
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 min
      retry: 1,
    },
  },
})

function AppRoutes() {
  return (
    <Routes>
      {/* Public auth routes */}
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public legal pages (no auth) — linked from sign-in, sign-up, settings */}
      <Route path="/privacidade" element={<PrivacyPolicy />} />
      <Route path="/eliminar-conta" element={<AccountDeletion />} />

      {/* Public marketing / free-tools funnel (docs/landing-spec.md) — lazy-loaded,
          reachable whether or not the visitor is signed in. */}
      <Route path="/simuladores" element={<Suspense fallback={null}><ToolsIndex /></Suspense>} />
      <Route path="/simuladores/irs-mais-valias" element={<Suspense fallback={null}><IrsMaisValias /></Suspense>} />
      <Route path="/simuladores/credito-habitacao" element={<Suspense fallback={null}><CreditoHabitacao /></Suspense>} />
      <Route path="/simuladores/amortizar-ou-investir" element={<Suspense fallback={null}><AmortizarOuInvestir /></Suspense>} />
      <Route path="/simuladores/revisao-euribor" element={<Suspense fallback={null}><RevisaoEuribor /></Suspense>} />

      {/* Protected routes — AuthGuard checks the session, Layout renders the navbar */}
      <Route
        element={
          <AuthGuard>
            <LockProvider>
              <LockGate>
                <Layout />
              </LockGate>
            </LockProvider>
          </AuthGuard>
        }
      >
        <Route path="/overview" element={<Overview />} />
        <Route path="/loan" element={<Loan />} />
        <Route path="/investments" element={<Portfolio />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/comparar" element={<Compare />} />
        <Route path="/casal" element={<Household />} />
        <Route path="/casal/aceitar" element={<HouseholdJoin />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Defaults — "/" and unknown paths are session-aware (docs/landing-spec.md A1) */}
      <Route path="/" element={<RootGate />} />
      <Route path="*" element={<CatchAll />} />
    </Routes>
  )
}

function App() {
  const { i18n } = useTranslation()
  return (
    <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          {/* Remount the routed tree when the language flips so number/date
              formats and any non-`t` subtree refresh instantly. Providers above
              stay mounted (router history, query cache, auth all persist). */}
          <AppRoutes key={i18n.language} />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
    </ThemeProvider>
  )
}

export default App
