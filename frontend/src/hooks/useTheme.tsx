import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// Light / Dark / follow-the-OS. The preference is stored in localStorage; the
// resolved theme is written to <html data-theme> which drives the CSS token
// overrides in index.css. The initial paint is handled by a tiny inline script
// in index.html (mirrors this file) so there's no flash before React mounts.
export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'w360:theme'

function systemDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolve(pref: ThemePref): 'light' | 'dark' {
  return pref === 'system' ? (systemDark() ? 'dark' : 'light') : pref
}

function applyDom(resolved: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', resolved)
  // Keep the PWA / mobile status-bar colour in step (navy in light, dark bg in dark).
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0E1621' : '#0D2740')
}

function stored(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch { /* ignore */ }
  return 'system'
}

interface ThemeCtx {
  theme: ThemePref
  resolved: 'light' | 'dark'
  setTheme: (t: ThemePref) => void
}

const ThemeContext = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => stored())
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolve(stored()))

  // Apply on mount and whenever the preference changes.
  useEffect(() => {
    const r = resolve(theme)
    applyDom(r)
    setResolved(r)
  }, [theme])

  // When following the OS, re-apply AND re-render consumers if the system scheme
  // flips while the app is open (so the canvas charts redraw with the new palette).
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { const r = resolve('system'); applyDom(r); setResolved(r) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const setTheme = useCallback((t: ThemePref) => {
    try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
    setThemeState(t)
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
