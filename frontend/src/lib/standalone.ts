// ── Installed-PWA (standalone) detection ─────────────────────────────
// True when the app is running as an installed PWA (Android/desktop
// `display-mode: standalone`, or iOS Safari's `navigator.standalone`), as
// opposed to a normal browser tab. Used to decide whether "/" shows the
// public marketing landing (browser) or goes straight into the app (installed
// app — the user already converted, the landing would be a dead detour).
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return mqStandalone || iosStandalone
}

export default isStandalone
