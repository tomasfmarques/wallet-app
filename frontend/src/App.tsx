import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'
import { useTranslation } from 'react-i18next'

import { AuthProvider } from '@/hooks/useAuth'
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
import PrivacyPolicy from '@/pages/legal/PrivacyPolicy'
import AccountDeletion from '@/pages/legal/AccountDeletion'

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
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Defaults */}
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="*" element={<Navigate to="/overview" replace />} />
    </Routes>
  )
}

function App() {
  const { i18n } = useTranslation()
  return (
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
  )
}

export default App
