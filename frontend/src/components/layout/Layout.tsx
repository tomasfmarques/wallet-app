import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { useLanguageSync } from '@/hooks/useLanguage'
import { BottomNav } from './BottomNav'
import { BrandMark } from '@/components/ui/BrandMark'

// Map route → translation key for the navbar section subtitle
type NavItemKey =
  | 'items.overview' | 'items.loan' | 'items.investments'
  | 'items.budget' | 'items.compare' | 'items.settings'
const SECTION_KEYS: Record<string, NavItemKey> = {
  '/overview': 'items.overview',
  '/loan': 'items.loan',
  '/investments': 'items.investments',
  '/budget': 'items.budget',
  '/comparar': 'items.compare',
  '/settings': 'items.settings',
}

export function Layout() {
  const { t } = useTranslation('nav')
  useLanguageSync() // hydrate UI language from the user's saved preference
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

  const sectionKey = SECTION_KEYS[location.pathname]
  const section = sectionKey ? t(sectionKey) : ''

  return (
    <div className="app-shell">
      {user?.isDemo && (
        <div className="demo-banner" role="status">
          <span className="demo-banner-text">🧪 {t('demoBanner')}</span>
          <span className="demo-banner-actions">
            <NavLink to="/signup" className="demo-banner-link">{t('demoSignup')}</NavLink>
            <button type="button" className="demo-banner-exit" onClick={handleSignOut}>{t('demoExit')}</button>
          </span>
        </div>
      )}
      <header className="navbar">
        <div className="navbar-inner">
          <div className="navbar-left">
            <NavLink to="/overview" className="brand brand-light" aria-label={t('brandHome')}>
              <BrandMark size={26} tone="dark" />
              <span className="brand-text">
                wallet<span className="brand-360">360</span>
              </span>
            </NavLink>
            {section && (
              <div className="navbar-section">
                <div className="navbar-section-title">{section}</div>
                <div className="navbar-section-sub">{t('tagline')}</div>
              </div>
            )}
          </div>

          {/* Desktop nav links — hidden on mobile (BottomNav takes over) */}
          <nav className="nav-links nav-links-desktop" aria-label={t('mainNavAria')}>
            <NavLink to="/overview" className="nav-link" end>{t('items.overview')}</NavLink>
            <NavLink to="/loan" className="nav-link">{t('items.loan')}</NavLink>
            <NavLink to="/investments" className="nav-link">{t('items.investments')}</NavLink>
            <NavLink to="/comparar" className="nav-link">{t('compareShort')}</NavLink>
            <NavLink to="/budget" className="nav-link">{t('items.budget')}</NavLink>
            <NavLink to="/settings" className="nav-link">{t('items.settings')}</NavLink>
          </nav>

          <div className="nav-user">
            {user && <span className="nav-user-name">{user.name}</span>}
            <button
              type="button"
              className="btn btn-navbar"
              onClick={handleSignOut}
              disabled={logout.isLoading}
              aria-label={t('signOutAria')}
            >
              {logout.isLoading ? '…' : t('signOut')}
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
