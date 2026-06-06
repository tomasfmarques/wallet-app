import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

// Fixed bottom navigation for mobile (≤768px). Hidden on desktop where the
// top navbar's nav-links take over. Five tabs covering the main routes.
//
// Icons are inline SVG (24×24 stroke-1.7) — keeps the bundle small, matches
// brand colour via currentColor, and renders crisply at any zoom level.

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

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

const items: NavItem[] = [
  {
    to: '/overview',
    label: 'Início',
    icon: (
      <svg {...COMMON}>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
      </svg>
    ),
  },
  {
    to: '/loan',
    label: 'Empréstimo',
    icon: (
      <svg {...COMMON}>
        <path d="M3 21h18" />
        <path d="M5 21V10l7-5 7 5v11" />
        <path d="M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    to: '/investments',
    label: 'Investir',
    icon: (
      <svg {...COMMON}>
        <path d="M3 18l5-6 4 4 8-10" />
        <path d="M14 6h6v6" />
      </svg>
    ),
  },
  {
    to: '/budget',
    label: 'Orçamento',
    icon: (
      <svg {...COMMON}>
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="M3 10h18" />
        <path d="M7 16h4" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Definições',
    icon: (
      <svg {...COMMON}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegação inferior">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'is-active' : ''}`}
          end={item.to === '/overview'}
        >
          <span className="bottom-nav-icon" aria-hidden>{item.icon}</span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export default BottomNav
