import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { BottomNav } from './BottomNav'

// Map route → label shown as section subtitle in the navbar
const SECTION_LABELS: Record<string, string> = {
  '/overview': 'Visão geral',
  '/loan': 'Crédito',
  '/investments': 'Investimentos',
  '/budget': 'Saldo',
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
            <NavLink to="/overview" className="brand brand-light" aria-label="Wallet360 — início">
              <span className="brand-emoji" aria-hidden>💸</span>
              <span className="brand-text">
                Wallet<span className="brand-360">360</span>
              </span>
            </NavLink>
            {section && (
              <div className="navbar-section">
                <div className="navbar-section-title">{section}</div>
                <div className="navbar-section-sub">Tracking financeiro pessoal</div>
              </div>
            )}
          </div>

          {/* Desktop nav links — hidden on mobile (BottomNav takes over) */}
          <nav className="nav-links nav-links-desktop" aria-label="Navegação principal">
            <NavLink to="/overview" className="nav-link" end>Visão geral</NavLink>
            <NavLink to="/loan" className="nav-link">Crédito</NavLink>
            <NavLink to="/investments" className="nav-link">Investimentos</NavLink>
            <NavLink to="/budget" className="nav-link">Saldo</NavLink>
            <NavLink to="/settings" className="nav-link">Configurações</NavLink>
          </nav>

          <div className="nav-user">
            {user && <span className="nav-user-name">{user.name}</span>}
            <button
              type="button"
              className="btn btn-navbar"
              onClick={handleSignOut}
              disabled={logout.isLoading}
              aria-label="Terminar sessão"
            >
              {logout.isLoading ? '…' : 'Sair'}
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  )
}

export default Layout
