import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'

import { AuthProvider } from '@/hooks/useAuth'
import AuthGuard from '@/components/auth/AuthGuard'
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 min
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public auth routes */}
            <Route path="/signin" element={<SignIn />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected routes — AuthGuard checks the session, Layout renders the navbar */}
            <Route
              element={
                <AuthGuard>
                  <Layout />
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
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
