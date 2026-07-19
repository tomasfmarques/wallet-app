// ── Static social/SEO meta for the marketing routes (docs/landing-spec.md A3) ──
//
// This is the HEAD-ONLY slice of A3, NOT the full prerender.
//
// The problem it solves: `usePageMeta` sets title/description/og:* from a React
// effect, so they only exist after JS runs. Google renders JS and copes, but the
// scrapers behind link previews — WhatsApp, LinkedIn, Facebook, Slack, iMessage —
// do NOT. They read the raw HTML. Since every route was served the same
// `index.html`, every marketing link previewed identically and imageless, no
// matter which simulator you shared.
//
// So: after `vite build`, copy the built `index.html` per route with a real
// static <head> baked in. The <body> is untouched — still an empty `#root`.
// That's the whole point: nothing is server-rendered, so there is no
// server/client markup to disagree and no hydration mismatch to risk. The SPA
// boots exactly as before and `usePageMeta` re-applies the same values on top.
//
// Routing: `vercel.json` has an EXPLICIT rewrite per route, above the
// `/(.*) → /index.html` catch-all. Relying on directory-index resolution was
// tempting but proved server-dependent — on `vite preview`,
// `/simuladores/irs-mais-valias` falls through to the SPA shell while
// `/simuladores/irs-mais-valias/` serves the route file, so the no-slash form
// (the one people actually share) would have silently gained nothing.
//
// ⚠️ ROUTES below and those rewrites must stay in sync — a route added here but
// not there gets the generic preview back; one rewritten there but missing here
// would 404. The latter can't survive a deploy: this script throws on any
// problem, which fails `npm run build` → fails `vercel-build` → no deploy. So
// the files always exist whenever the rewrites do.
//
// pt only, matching A3 ("pt content; lang=pt"): the scrapers don't negotiate
// language, pt-PT is the fallback language, and the audience is Portuguese.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dist = join(root, 'dist')
const ORIGIN = 'https://wallet360.pt'

const pt = JSON.parse(readFileSync(join(root, 'src/i18n/locales/pt/landing.json'), 'utf8'))
const t = (path) => {
  const value = path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), pt)
  if (typeof value !== 'string') throw new Error(`prerender-meta: missing pt/landing.json key "${path}"`)
  return value
}

// Keep in sync with each page's usePageMeta(...) call. A drifted description is
// invisible in the app (the effect wins) but is what every shared link shows.
const ROUTES = [
  { path: '/', title: 'meta.title', desc: 'meta.description', image: '/img/marketing/hero.webp' },
  { path: '/simuladores', title: 'toolsIndex.metaTitle', desc: 'toolsIndex.metaDescription', image: '/img/marketing/hero.webp' },
  { path: '/simuladores/irs-mais-valias', title: 'tool.irs.metaTitle', desc: 'tool.irs.metaDescription', image: '/img/marketing/tool-irs.webp' },
  { path: '/simuladores/credito-habitacao', title: 'tool.credito.metaTitle', desc: 'tool.credito.metaDescription', image: '/img/marketing/tool-credito.webp' },
  { path: '/simuladores/amortizar-ou-investir', title: 'tool.compare.metaTitle', desc: 'tool.compare.metaDescription', image: '/img/marketing/tool-comparar.webp' },
  { path: '/simuladores/revisao-euribor', title: 'tool.euribor.metaTitle', desc: 'tool.euribor.metaDescription', image: '/img/marketing/tool-euribor.webp' },
]

const escapeAttr = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function metaBlock({ path, title, desc, image }) {
  const url = `${ORIGIN}${path}`
  const img = `${ORIGIN}${image}`
  return [
    `<meta name="description" content="${escapeAttr(desc)}" />`,
    `<link rel="canonical" href="${escapeAttr(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Wallet360" />`,
    `<meta property="og:locale" content="pt_PT" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(desc)}" />`,
    `<meta property="og:url" content="${escapeAttr(url)}" />`,
    `<meta property="og:image" content="${escapeAttr(img)}" />`,
    `<meta property="og:image:type" content="image/webp" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(desc)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(img)}" />`,
  ].map((line) => `    ${line}`).join('\n')
}

function build() {
  const shellPath = join(dist, 'index.html')
  const shell = readFileSync(shellPath, 'utf8')

  // The shell ships a <title> and a description; swap rather than duplicate them
  // (two of either is ambiguous for a scraper).
  const TITLE_RE = /<title>[\s\S]*?<\/title>/
  const DESC_RE = /\n?\s*<meta\s+name="description"[^>]*>/
  if (!TITLE_RE.test(shell)) throw new Error('prerender-meta: no <title> in built index.html')

  let written = 0
  for (const route of ROUTES) {
    const title = t(route.title)
    const desc = t(route.desc)

    const html = shell
      .replace(DESC_RE, '')
      .replace(TITLE_RE, `<title>${escapeAttr(title)}</title>\n${metaBlock({ ...route, title, desc })}`)

    const outDir = route.path === '/' ? dist : join(dist, route.path)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'index.html'), html)
    written++
  }
  console.log(`[prerender-meta] wrote static <head> for ${written} marketing route(s).`)
}

build()
