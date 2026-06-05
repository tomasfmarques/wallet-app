import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth, useLogout } from '@/hooks/useAuth'

// Map route → label shown as section subtitle in the dark navbar (matches the
// design's split brand: section title left, nav links right)
const SECTION_LABELS: Record<string, string> = {
  '/overview': 'Visão geral',
  '/loan': 'Empréstimo',
  '/investments': 'Investimentos',
  '/budget': 'Orçamento',
  '/settings': 'Configurações',
}

export function Layout() {
  const { user } = useAuth()
  const logout = useLogout()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    try {
      await logout.mutateAsync()
    } finally {
      navigate('/signin', { replace: true })
    }
  }

  const section = SECTION_LABELS[location.pathname] ?? ''

  return (
    <div className="app-shell">
      <header className="navbar">
        <div className="navbar-inner">
          <div className="navbar-left">
            <NavLink to="/overview" className="brand brand-light" aria-label="WALLET — início">
              <span className="brand-emoji" aria-hidden>💸</span>
              <span className="brand-text">WALLET</span>
            </NavLink>
            {section && (
              <div className="navbar-section">
                <div className="navbar-section-title">{section}</div>
                <div className="navbar-section-sub">Tracking financeiro pessoal</div>
              </div>
            )}
          </div>

          <nav className="nav-links" aria-label="Navegação principal">
            <NavLink to="/overview" className="nav-link">Visão geral</NavLink>
            <NavLink to="/loan" className="nav-link">Empréstimo</NavLink>
            <NavLink to="/investments" className="nav-link">Investimentos</NavLink>
            <NavLink to="/budget" className="nav-link">Orçamento</NavLink>
            <NavLink to="/settings" className="nav-link">Configurações</NavLink>
          </nav>

          <div className="nav-user">
            {user && <span className="nav-user-name">{user.name}</span>}
            <button
              type="button"
              className="btn btn-navbar"
              onClick={handleSignOut}
              disabled={logout.isLoading}
            >
              {logout.isLoading ? 'A terminar…' : 'Sair'}
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
