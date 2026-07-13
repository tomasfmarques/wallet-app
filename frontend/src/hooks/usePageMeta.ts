import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

// ── Per-route SEO meta (WS-L1) ────────────────────────────────────
// Sets document.title + meta description + og:title/og:description/og:locale
// for the marketing/tool pages (which are NOT prerendered in v1 — see
// docs/landing-spec.md A3 fallback). Tags are created if absent and restored
// to their previous value (or removed, if we created them) on unmount, so
// navigating between marketing pages never leaks stale meta.

function upsertMeta(selector: string, build: () => HTMLMetaElement, content: string) {
  let el = document.querySelector<HTMLMetaElement>(selector)
  const created = !el
  if (!el) {
    el = build()
    document.head.appendChild(el)
  }
  const prev = el.getAttribute('content')
  el.setAttribute('content', content)
  return () => {
    if (created) el!.remove()
    else if (prev != null) el!.setAttribute('content', prev)
  }
}

/**
 * canonicalPath, e.g. "/simuladores/credito-habitacao" — absolute URL is
 * built against wallet360.pt. `preloadImageHref` (Design v2, docs/landing-spec.md)
 * injects a high-priority `<link rel="preload" as="image">` for a route's LCP
 * photo (e.g. the landing hero) — self-hosted marketing WebPs only.
 */
export function usePageMeta(title: string, description: string, canonicalPath?: string, preloadImageHref?: string) {
  const { i18n } = useTranslation()
  const resolvedLng = i18n.resolvedLanguage

  useEffect(() => {
    const prevTitle = document.title
    document.title = title

    const restores: Array<() => void> = []

    if (preloadImageHref) {
      const link = document.createElement('link')
      link.setAttribute('rel', 'preload')
      link.setAttribute('as', 'image')
      link.setAttribute('href', preloadImageHref)
      link.setAttribute('type', 'image/webp')
      link.setAttribute('fetchpriority', 'high')
      document.head.appendChild(link)
      restores.push(() => link.remove())
    }

    restores.push(upsertMeta('meta[name="description"]', () => {
      const el = document.createElement('meta')
      el.setAttribute('name', 'description')
      return el
    }, description))

    restores.push(upsertMeta('meta[property="og:title"]', () => {
      const el = document.createElement('meta')
      el.setAttribute('property', 'og:title')
      return el
    }, title))

    restores.push(upsertMeta('meta[property="og:description"]', () => {
      const el = document.createElement('meta')
      el.setAttribute('property', 'og:description')
      return el
    }, description))

    const locale = (resolvedLng ?? 'pt').startsWith('en') ? 'en_US' : 'pt_PT'
    restores.push(upsertMeta('meta[property="og:locale"]', () => {
      const el = document.createElement('meta')
      el.setAttribute('property', 'og:locale')
      return el
    }, locale))

    let canonicalRestore: (() => void) | null = null
    if (canonicalPath) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      const created = !link
      if (!link) {
        link = document.createElement('link')
        link.setAttribute('rel', 'canonical')
        document.head.appendChild(link)
      }
      const prevHref = link.getAttribute('href')
      link.setAttribute('href', `https://wallet360.pt${canonicalPath}`)
      const linkRef = link
      canonicalRestore = () => {
        if (created) linkRef.remove()
        else if (prevHref != null) linkRef.setAttribute('href', prevHref)
      }
    }

    return () => {
      document.title = prevTitle
      restores.forEach((restore) => restore())
      canonicalRestore?.()
    }
  }, [title, description, canonicalPath, resolvedLng, preloadImageHref])
}

export default usePageMeta
