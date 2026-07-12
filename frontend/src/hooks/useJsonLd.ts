import { useEffect } from 'react'

/**
 * Injects a `<script type="application/ld+json">` tag with the given
 * structured-data object, removed on unmount. Used by the tool pages for a
 * `WebApplication` schema (docs/landing-spec.md WS-L1's JSON-LD helper).
 * Cheap SEO signal even without prerendering (Google executes JS).
 */
export function useJsonLd(id: string, data: Record<string, unknown>) {
  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.id = id
    script.textContent = JSON.stringify(data)
    document.head.appendChild(script)
    return () => { script.remove() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, JSON.stringify(data)])
}

export default useJsonLd
