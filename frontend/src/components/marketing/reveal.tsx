import { useEffect, useRef, type ReactNode } from 'react'

// ── Scroll-reveal for marketing pages (Design v2 motion pass) ─────────
// Elements start slightly translated + transparent (CSS `.mkt-reveal` /
// `.mkt-reveal-stagger`) and animate in the first time they enter the
// viewport. IntersectionObserver only — no scroll listeners, no rerenders
// (the class is toggled imperatively). `prefers-reduced-motion` is honoured
// in marketing.css, which force-shows everything. Marketing-only: imported
// solely by lazy marketing pages, so none of this enters the app chunk.

export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // No IO (very old browser / jsdom) → never hide content.
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible')
      return
    }
    let delivered = false
    const io = new IntersectionObserver(
      ([entry]) => {
        delivered = true
        if (entry.isIntersecting) {
          el.classList.add('is-visible')
          io.disconnect()
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -48px' },
    )
    io.observe(el)
    // Safety net: a working IO ALWAYS fires an initial callback right after
    // observe() (even when not intersecting). If nothing arrived within 1.2s,
    // this environment isn't delivering IO callbacks (some webviews/embeds) —
    // reveal everything rather than leave content invisible.
    const fallback = window.setTimeout(() => {
      if (!delivered) {
        el.classList.add('is-visible')
        io.disconnect()
      }
    }, 1200)
    return () => {
      window.clearTimeout(fallback)
      io.disconnect()
    }
  }, [])
  return ref
}

interface RevealProps {
  children: ReactNode
  /** Extra classes; pass 'mkt-reveal-stagger' to animate direct children in sequence instead. */
  className?: string
  /** Transition delay in ms for the simple (non-stagger) variant. */
  delay?: number
}

export function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const ref = useReveal()
  return (
    <div
      ref={ref}
      className={`mkt-reveal ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

export default Reveal
