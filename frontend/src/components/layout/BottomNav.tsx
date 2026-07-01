import { useState, useEffect, useRef, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

// Fixed bottom navigation for mobile (≤768px). Hidden on desktop where the
// top navbar's nav-links take over. Four tabs: Início | Gestão | Saldo | Definições.
// "Gestão" opens a floating panel with Crédito, Investir, and Comparar.

const ICON_SIZE = 22
const STROKE = 1.7
const COMMON = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: STROKE,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

// Sub-items shown in the Gestão popup. Labels/descriptions are translation
// keys (resolved at render via the `nav` namespace). `as const` keeps the keys
// as literal types so the type-safe `t()` accepts them.
const GESTAO_ITEMS = [
  {
    to: '/loan',
    labelKey: 'items.loan',
    descKey: 'manage.loanDesc',
    icon: (
      <svg {...COMMON}>
        <path d="M12 3 21 8H3Z" />
        <path d="M5 8v9.5M9.5 8v9.5M14.5 8v9.5M19 8v9.5" />
        <path d="M3.5 21h17" />
      </svg>
    ),
  },
  {
    to: '/investments',
    labelKey: 'items.investments',
    descKey: 'manage.investmentsDesc',
    icon: (
      <svg {...COMMON}>
        <path d="M3 18l5-6 4 4 8-10" />
        <path d="M14 6h6v6" />
      </svg>
    ),
  },
  {
    to: '/comparar',
    labelKey: 'items.compare',
    descKey: 'manage.compareDesc',
    icon: (
      <svg {...COMMON}>
        <line x1="12" y1="3" x2="12" y2="21" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <path d="M3 9l3.5 7 3.5-7" />
        <path d="M14 9l3.5 7 3.5-7" />
      </svg>
    ),
  },
] as const

const GESTAO_ROUTES = new Set(['/loan', '/investments', '/comparar'])

interface NavTabProps {
  to?: string
  label: string
  icon: ReactNode
  isActive?: boolean
  onClick?: () => void
  end?: boolean
}

function NavTab({ to, label, icon, isActive, onClick, end }: NavTabProps) {
  if (to && !onClick) {
    return (
      <NavLink
        to={to}
        className={({ isActive: a }) => `bottom-nav-item ${a ? 'is-active' : ''}`}
        end={end}
      >
        <span className="bottom-nav-icon" aria-hidden>{icon}</span>
        <span className="bottom-nav-label">{label}</span>
      </NavLink>
    )
  }
  return (
    <button
      type="button"
      className={`bottom-nav-item ${isActive ? 'is-active' : ''}`}
      onClick={onClick}
      aria-expanded={isActive}
    >
      <span className="bottom-nav-icon" aria-hidden>{icon}</span>
      <span className="bottom-nav-label">{label}</span>
    </button>
  )
}

export function BottomNav() {
  const { t } = useTranslation('nav')
  const location = useLocation()
  const navigate = useNavigate()
  const [gestaoOpen, setGestaoOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const isGestaoActive = GESTAO_ROUTES.has(location.pathname)

  // Close the panel when the route changes
  useEffect(() => { setGestaoOpen(false) }, [location.pathname])

  // Close on outside tap
  useEffect(() => {
    if (!gestaoOpen) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setGestaoOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [gestaoOpen])

  return (
    <>
      {/* Gestão popup panel */}
      {gestaoOpen && (
        <div className="gestao-backdrop" onClick={() => setGestaoOpen(false)} aria-hidden />
      )}
      <div ref={panelRef}>
        {gestaoOpen && (
          <div className="gestao-panel" role="menu" aria-label={t('bottom.panelAria')}>
            <div className="gestao-panel-title">{t('bottom.panelTitle')}</div>
            {GESTAO_ITEMS.map((item) => (
              <button
                key={item.to}
                type="button"
                role="menuitem"
                className={`gestao-panel-item ${location.pathname === item.to ? 'gestao-panel-item-active' : ''}`}
                onClick={() => { navigate(item.to); setGestaoOpen(false) }}
              >
                <span className="gestao-panel-icon" aria-hidden>{item.icon}</span>
                <span className="gestao-panel-text">
                  <span className="gestao-panel-label">{t(item.labelKey)}</span>
                  <span className="gestao-panel-desc">{t(item.descKey)}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <nav className="bottom-nav" aria-label={t('bottom.navAria')}>
          {/* Início */}
          <NavTab
            to="/overview"
            label={t('bottom.home')}
            end
            icon={
              <svg {...COMMON}>
                <path d="M3 11l9-8 9 8" />
                <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
              </svg>
            }
          />

          {/* Gestão — triggers popup */}
          <NavTab
            label={t('bottom.manage')}
            isActive={isGestaoActive || gestaoOpen}
            onClick={() => setGestaoOpen((o) => !o)}
            icon={
              <svg {...COMMON}>
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path d="M17.5 14v6M14.5 17h6" />
              </svg>
            }
          />

          {/* Saldo */}
          <NavTab
            to="/budget"
            label={t('bottom.budget')}
            icon={
              <svg {...COMMON}>
                <rect x="3" y="6" width="18" height="14" rx="2" />
                <path d="M3 10h18" />
                <path d="M7 16h4" />
              </svg>
            }
          />

          {/* Definições */}
          <NavTab
            to="/settings"
            label={t('bottom.settings')}
            icon={
              <svg {...COMMON}>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            }
          />
        </nav>
      </div>
    </>
  )
}

export default BottomNav
