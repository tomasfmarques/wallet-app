import { useEffect } from 'react'

// ── Ad slot scaffolding (WS-L6, INERT until owner approval) ───────
// Renders NOTHING at all unless VITE_ADSENSE_CLIENT is set at build time —
// zero ad code, zero CLS impact — until AdSense review passes (see
// docs/landing-spec.md WS-L6). When set: a reserved-height container +
// a once-per-page AdSense script injection.
//
// TODO(WS-L6 phase 3): this deliberately does NOT include a consent-management
// flow yet. EEA visitors legally need a certified CMP consent banner before
// ads render — that is out of scope here and must land before VITE_ADSENSE_CLIENT
// is ever set in production.

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT

let scriptInjected = false

function injectAdSenseScript(client: string) {
  if (scriptInjected || typeof document === 'undefined') return
  scriptInjected = true
  const script = document.createElement('script')
  script.async = true
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`
  script.crossOrigin = 'anonymous'
  document.head.appendChild(script)
}

interface Props {
  /** AdSense ad-slot id (from the AdSense dashboard, once created). */
  slotId?: string
  className?: string
}

export function AdSlot({ slotId, className }: Props) {
  useEffect(() => {
    if (!ADSENSE_CLIENT) return
    injectAdSenseScript(ADSENSE_CLIENT)
    try {
      const w = window as unknown as { adsbygoogle?: unknown[] }
      w.adsbygoogle = w.adsbygoogle || []
      w.adsbygoogle.push({})
    } catch {
      // AdSense script not ready yet — best effort, no user-facing error.
    }
  }, [])

  if (!ADSENSE_CLIENT) return null

  return (
    <div className={`mkt-ad-slot ${className ?? ''}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 100 }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

export default AdSlot
