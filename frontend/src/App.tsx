import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from 'react-query'

// Pages (to be implemented)
// import SignIn from '@/pages/SignIn'
// import SignUp from '@/pages/SignUp'
// import Overview from '@/pages/Overview'
// import Loan from '@/pages/Loan'
// import Portfolio from '@/pages/Portfolio'
// import Settings from '@/pages/Settings'
// import Layout from '@/components/layout/Layout'
// import AuthGuard from '@/components/auth/AuthGuard'

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
        <Routes>
          {/* Auth routes */}
          {/* <Route path="/signin" element={<SignIn />} /> */}
          {/* <Route path="/signup" element={<SignUp />} /> */}

          {/* Protected routes — wrapped in AuthGuard + Layout */}
          {/* <Route element={<AuthGuard><Layout /></AuthGuard>}> */}
          {/*   <Route path="/overview" element={<Overview />} /> */}
          {/*   <Route path="/loan" element={<Loan />} /> */}
          {/*   <Route path="/investments" element={<Portfolio />} /> */}
          {/*   <Route path="/settings" element={<Settings />} /> */}
          {/* </Route> */}

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/signin" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
