import type { ReactNode } from 'react'

// Wallet360 brand icon set — minimalist line icons (monochrome, inherit
// `currentColor`) matching the geometric feel of the Converge mark and the
// bottom-nav glyphs. Replaces emoji throughout the UI. Stroke-based, 24×24.
export type IconName =
  | 'trendingUp' | 'trendingDown' | 'home' | 'banknote' | 'wallet' | 'scale'
  | 'bulb' | 'flask' | 'lock' | 'search' | 'bank' | 'inbox' | 'tag'
  | 'barChart' | 'alert' | 'user' | 'link' | 'minus'

const PATHS: Record<IconName, ReactNode> = {
  trendingUp: (<><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></>),
  trendingDown: (<><polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /><polyline points="16 17 22 17 22 11" /></>),
  home: (<><path d="M3 9.6 12 3l9 6.6" /><path d="M5.5 8.7V20a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V8.7" /><path d="M9.5 21v-6h5v6" /></>),
  banknote: (<><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></>),
  wallet: (<><path d="M19 7.5V6a2 2 0 0 0-2-2H5.5a2.5 2.5 0 0 0 0 5H20a1 1 0 0 1 1 1v7a2 2 0 0 1-2 2H5.5a2.5 2.5 0 0 1-2.5-2.5v-11" /><path d="M16.5 13.5h.01" /></>),
  scale: (<><path d="M12 3.5v17" /><path d="M5 7.5h14" /><path d="M7 4.5 19 6.5" /><path d="M5 7.5 2.5 13a3 3 0 0 0 5 0Z" /><path d="M19 7.5 16.5 13a3 3 0 0 0 5 0Z" /><path d="M8.5 20.5h7" /></>),
  bulb: (<><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-3.8 10.6c.6.5 1 1.2 1.1 2.4h5.4c.1-1.2.5-1.9 1.1-2.4A6 6 0 0 0 12 3Z" /></>),
  flask: (<><path d="M9 3h6" /><path d="M10 3v6.5l-4.6 8A2 2 0 0 0 7.1 20.5h9.8a2 2 0 0 0 1.7-3l-4.6-8V3" /><path d="M7.5 15h9" /></>),
  lock: (<><rect x="4.5" y="11" width="15" height="9.5" rx="2.2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>),
  search: (<><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4-4" /></>),
  bank: (<><path d="M12 3 21 8H3Z" /><path d="M5 8v9.5M9.5 8v9.5M14.5 8v9.5M19 8v9.5" /><path d="M3.5 21h17" /></>),
  inbox: (<><path d="M21.5 12.5H16l-2 3h-4l-2-3H2.5" /><path d="M5.6 5.7 2.5 12.5v5a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5L18.4 5.7A2 2 0 0 0 16.6 4.5H7.4a2 2 0 0 0-1.8 1.2Z" /></>),
  tag: (<><path d="M12.6 2.6A2 2 0 0 0 11.2 2H4.5a2 2 0 0 0-2 2v6.7a2 2 0 0 0 .6 1.4l8.4 8.4a2 2 0 0 0 2.8 0l6.7-6.7a2 2 0 0 0 0-2.8Z" /><circle cx="7.5" cy="7.5" r="1.3" /></>),
  barChart: (<><path d="M3.5 3.5v17h17" /><path d="M8 17v-4.5M13 17V8M18 17v-2.5" /></>),
  alert: (<><path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4.5" /><path d="M12 17h.01" /></>),
  user: (<><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>),
  link: (<><path d="M10 13a5 5 0 0 0 7.1 0l2.5-2.5a5 5 0 0 0-7.1-7.1L11 4.9" /><path d="M14 11a5 5 0 0 0-7.1 0L4.4 13.5a5 5 0 0 0 7.1 7.1L13 19.1" /></>),
  minus: (<><path d="M5 12h14" /></>),
}

interface Props {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export function Icon({ name, size = 20, className, strokeWidth = 1.75 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  )
}

export default Icon
