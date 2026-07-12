import { useCallback, useEffect, useState } from 'react'

// ── Device-aware PWA install CTA (WS-L1) ──────────────────────────
// docs/landing-spec.md WS-L1 behaviour matrix:
//   • Already installed (standalone display-mode)      → "Abrir a app"
//   • Android / desktop Chromium (beforeinstallprompt)  → native install dialog
//   • iOS Safari (no beforeinstallprompt support)       → inline instructions sheet
//   • Anything else                                     → "Criar conta grátis"
//
// The `beforeinstallprompt` event can fire before any component that wants it
// has mounted, so the listener is registered ONCE at module scope (as soon as
// this module is imported — MarketingLayout imports InstallCta, which imports
// this hook) and the event is stashed here, not in component state — so a
// visitor who lands directly on a deep tool page still gets the native prompt.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let listenerRegistered = false
const subscribers = new Set<() => void>()

function notify() {
  subscribers.forEach((cb) => cb())
}

function registerListenerOnce() {
  if (listenerRegistered || typeof window === 'undefined') return
  listenerRegistered = true
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

// Register as soon as this module loads (guarded — SSR/prerender-safe).
registerListenerOnce()

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const mqStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return mqStandalone || iosStandalone
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export type InstallCtaKind = 'standalone' | 'native-prompt' | 'ios' | 'fallback'

export interface UseInstallPromptResult {
  kind: InstallCtaKind
  /** Only meaningful when kind === 'native-prompt'. No-op otherwise. */
  promptInstall: () => Promise<void>
}

export function useInstallPrompt(): UseInstallPromptResult {
  // Re-render when the stashed event (or its consumption) changes.
  const [, bump] = useState(0)

  useEffect(() => {
    registerListenerOnce()
    const cb = () => bump((n) => n + 1)
    subscribers.add(cb)
    return () => { subscribers.delete(cb) }
  }, [])

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice.catch(() => undefined)
    deferredPrompt = null
    notify()
  }, [])

  // Guard all window/navigator access — safe on a render-pure first paint.
  const kind: InstallCtaKind =
    isStandalone() ? 'standalone'
    : deferredPrompt ? 'native-prompt'
    // TODO(Play Store): once the Wallet360 Play Store listing exists
    // (STATE.md Next steps), branch Android here to the official Play badge
    // instead of the generic native-prompt button.
    : isIOSDevice() ? 'ios'
    : 'fallback'

  return { kind, promptInstall }
}

export default useInstallPrompt
