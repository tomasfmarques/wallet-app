# Landing page + free-tools funnel — build spec (2026-07-11)

**Objective.** Turn `wallet360.pt` into an acquisition funnel: people searching
for Portuguese finance simulators (IRS mais-valias, crédito habitação, Euribor,
amortizar-vs-investir) land on free, no-signup tools; the tools demonstrate
value; banners convert them to installing/signing up for the app. Monetize the
anonymous traffic with Google AdSense (tools pages only). The app itself stays
the product; the landing is the top of the funnel.

This is the agreed follow-up to [`MARKET-FEEDBACK.md`](../MARKET-FEEDBACK.md):
lead with the PT credit/invest wedge, privacy as the trust play ("os teus dados
são lidos no teu browser"), PWA install as the mobile answer.

**How to read this doc.** WS-L1…WS-L8 are agent-executable workstreams with
acceptance criteria. "Owner" boxes are things only Tomás can do (accounts,
approvals, copy blessing, pricing). Phases at the end give the shipping order.

---

## Product decisions already made (owner, 2026-07-11 session)

- Landing lives at the **root** `wallet360.pt/` for signed-out visitors;
  signed-in users keep landing in the app (`/overview`).
- **4 free tools**, each its own public page (SEO target in parentheses):
  1. **IRS mais-valias helper** — import T212 CSV **client-side, nothing
     stored**, free preview limited to **5 result rows**; beyond that, a
     gentle gate: install the app / create a free account for the full
     Anexo J report. ("IRS mais-valias trading 212", "anexo J ações")
  2. **Credit/mortgage simulator** — free, no limit. ("simulador crédito
     habitação", "simulador prestação casa")
  3. **Amortizar ou Investir** — the wedge, free. ("amortizar crédito ou
     investir")
  4. **Euribor revision simulator** — "quanto sobe a minha prestação na
     próxima revisão?" ("revisão euribor prestação")
- **As few pop-ups/sign-in walls as possible.** The only hard gate is the
  5-row IRS limit. Ads consent banner is legally unavoidable (see WS-L6) but
  must be the minimal Google CMP flavour.
- **AdSense** on tool pages to monetize anonymous traffic. Never inside the
  authenticated app.
- Every tool page: **header banner** (install/sign-up CTA) + **footer contact
  form**.
- Landing sections: hero (slogan + one pretty simple image) → 4 tool cards →
  free/pro comparison → install banner → footer.

## Open decisions (owner — answer before the matching WS starts)

| # | Decision | Needed for | Default if unanswered |
|---|----------|-----------|----------------------|
| D1 | Pricing tiers: what exactly is Pro vs Free in the app? (billing itself is OUT of scope here — see Non-goals) | WS-L2 free/pro section | Section ships as "Grátis" vs "Pro — brevemente" with feature bullets, no prices |
| D2 | Hero slogan (pt + en) and imagery (photo vs abstract gradient/illustration; must be licence-clean) | WS-L2 | Agent drafts 3 slogan options + uses a CSS gradient hero; owner swaps a photo later |
| D3 | Analytics: none / Plausible (~€9/mo, cookieless, no banner needed) / GA4 (free, needs consent) | WS-L8 | None in v1 (AdSense's own reporting covers ad revenue) |
| D4 | Contact-form destination address (suggest `hello@wallet360.pt` forwarding, or reuse privacy@) | WS-L7 | `fmarques.tomas@gmail.com` via Resend until a mailbox exists |

## Non-goals (explicitly out of scope for this spec)

- **Stripe/billing.** The free/pro section is marketing copy only; actually
  charging is its own future workstream (payment provider, invoicing/IVA,
  entitlement flags in the DB — do NOT start it here).
- Blog/content marketing (good later; the tool explainers cover SEO v1).
- Native app / Play Store (tracked separately in STATE.md Next steps).
- Bank-sync onboarding (Enable Banking evaluation is a separate thread).

---

## Architecture (agent: read this before any WS)

### A1. Marketing pages live in the existing SPA, root-gated by session

`/` currently redirects to `/overview` → AuthGuard → `/signin`. Change: `/`
renders **Landing** when there is no session, and keeps redirecting to
`/overview` when there is one (AuthProvider already knows). Tool pages are
plain public routes like the legal pages. No separate app, no subdomain, no
base-path move (PWA scope, SW, OAuth origins, TWA asset-links all stay
untouched).

### A2. Engines shared into the client — Vite alias (REVISED 2026-07-11)

`backend/src/lib/loanEngine.ts` and `backend/src/lib/capitalGains.ts` are
**pure modules with ZERO import statements** (verified) — fully
self-contained TS. So the original shared-workspace idea is over-engineering;
the minimal-risk sharing mechanism is:

- **Vite alias** `@engines` → `../backend/src/lib/` (in `vite.config.ts`
  `resolve.alias` + matching `paths` entry in `frontend/tsconfig.json`), and
  frontend `include` extended to those two files for type-checking.
- Frontend imports `computeSchedule`/`buildGainsReport` etc. straight from the
  backend source files — **one file, one engine, zero parity drift** (no new
  merchant.ts-style trap), and the **backend is 100% untouched** (no CJS/ESM
  dance, no Vercel-function bundling risk, no workspace churn).
- Guard: a comment atop both engine files noting they are ALSO compiled into
  the frontend bundle — keep them dependency-free and side-effect-free.
- Acceptance: both workspace builds green; `api/index.ts` function untouched;
  the two files appear in the frontend bundle only via the tool routes'
  lazy-loaded chunks (not in the app's main chunk).
- Euribor rates for the revision tool: reuse the public daily-cron-fed values
  via a tiny public endpoint (WS-L4) — rates aren't personal data.
- T212 CSV parsing is already client-side (`frontend/src/lib/trading212Parser.ts`) — reuse as-is.

### A3. SEO: prerender the 6 marketing routes to static HTML

SPA-only meta is not enough when the whole point is search traffic. Plan:

- Marketing pages must be **render-pure** (no api calls for first paint, no
  Chart.js on the landing itself; tools lazy-load interactivity after hydrate).
- Build step `frontend/scripts/prerender.mjs`: after `vite build`, render `/`,
  `/simuladores`, the 4 tool pages + the 2 legal pages with
  `ReactDOMServer.renderToString` + `StaticRouter` into
  `dist/<route>/index.html` (pt content; `lang=pt`).
- `vercel.json` rewrites: static-file hits win before the `/(.*) → index.html`
  catch-all (Vercel serves real files first by default — verify, else add
  explicit rewrites above the catch-all).
- Hydration: same bundle hydrates the prerendered HTML (`hydrateRoot` when
  `#root` has children, `createRoot` otherwise).
- **Fallback if this fights the stack** (i18n suspense, ESM issues in the
  prerender script): ship v1 with per-route `<title>/<meta>` via a
  `usePageMeta` hook + sitemap and accept Google-renders-JS; prerender becomes
  a fast-follow. Do NOT let prerender block the funnel shipping.

### A4. i18n

New namespace `landing` (pt + en, parity as always). pt-PT is the SEO target;
EN exists for completeness. Tool explainer long-form sections may use the
legal-pages pattern (per-language JSX blocks) — logged exception in
`docs/decisions/auth.md` applies; chrome/labels use JSON keys.

---

## Workstreams

### WS-L1 — Routing, marketing shell, meta (foundation)

- `/` gate: session → `/overview`, else Landing (no flash: reuse AuthProvider's
  resolved state; render nothing until known, or render Landing optimistically
  and swap — pick whichever the current `useAuth` supports without a spinner).
- `MarketingLayout`: top banner ("Instala a Wallet360 — grátis" + sign-in
  link; sticky, dismissible, remembers dismissal in localStorage), footer
  (contact form slot, links: Privacidade · Eliminar conta · Entrar · Criar
  conta), pt/en switch.
- `usePageMeta(title, description, canonical)` hook; JSON-LD helper
  (`WebApplication` for tools, `FAQPage` for explainer accordions).
- **Device-aware install CTA** (`useInstallPrompt` hook + `InstallCta`
  component) — the SAME component adapts to the visitor's device (owner
  requirement 2026-07-11):
  | Context | Detection | CTA behaviour |
  |---|---|---|
  | Already installed | `display-mode: standalone` media query or `navigator.standalone` | Hide install CTAs entirely; show "Abrir a app" → `/` |
  | Android / desktop Chromium | `beforeinstallprompt` fired (capture + stash the event) | "Instalar a app" button → `event.prompt()` native install dialog |
  | iOS Safari | UA iPhone/iPad + no `beforeinstallprompt` support | Button opens a small inline sheet: "Toca em Partilhar → Adicionar ao ecrã principal" with the share-icon glyph |
  | Anything else (Firefox etc.) | fallback | CTA becomes "Criar conta grátis" → `/signup` |
  - When the Play Store listing exists (STATE.md Next steps), the Android
    branch swaps to the Play badge via an env/flag — leave a marked TODO.
  - The hook must be SSR/prerender-safe (guard all `window`/`navigator`
    access) and register the `beforeinstallprompt` listener once at
    MarketingLayout level so deep pages don't miss the early event.
- Routes: `/simuladores` (index listing the 4), `/simuladores/irs-mais-valias`,
  `/simuladores/credito-habitacao`, `/simuladores/amortizar-ou-investir`,
  `/simuladores/revisao-euribor`.
- Acceptance: all routes reachable signed-out; signed-in `/` still lands on
  Overview; navbar/app untouched; lighthouse a11y ≥ 95 on landing.

### WS-L2 — Landing page (`/`)

Sections, in order:
1. **Hero**: slogan (D2), sub-line ("Simuladores gratuitos de crédito,
   Euribor, IRS e investimento — feitos para Portugal"), primary CTA
   "Experimentar grátis" (scroll to tools), secondary "Entrar". Background:
   image/gradient per D2, `prefers-color-scheme` aware, LCP-optimized
   (preloaded, compressed, no carousel).
2. **4 tool cards** (icon, name, one-liner, "Grátis · sem registo" badge) →
   tool pages.
3. **Porquê a Wallet360** (3 bullets: privacidade — "os teus ficheiros são
   lidos no teu browser"; feito para Portugal — Euribor/TAN/Anexo J; grátis
   para começar).
4. **Grátis vs Pro** (D1): two-column card; Pro column per D1 default
   "brevemente".
5. **Install banner**: "Instala a Wallet360" + PWA install CTA + screenshot.
6. Footer (shared, WS-L1).
- Acceptance: zero API calls before interaction; no pop-ups; CLS ≈ 0;
  prerendered HTML contains hero + card text (SEO), pt default.

### WS-L3 — The four tool pages

Common template: H1 + short intro (SEO text ~150 words) → the tool →
explainer/FAQ section (~300–500 words, accordions, FAQPage JSON-LD) → install
banner → contact footer. Ads slots per WS-L6 (inert until enabled).

1. **IRS mais-valias** (`/simuladores/irs-mais-valias`)
   - Upload T212 CSV → parsed **in-browser** (`trading212Parser`), FIFO gains
     via shared `capitalGains` for a chosen year → table styled like the
     in-app Anexo J helper.
   - Show first **5** realized-gain rows; remaining rows blurred (CSS) with
     count + totals hidden; inline card (not a modal): "Cria conta gratuita ou
     instala a app para o relatório completo" → `/signup`. THE ONLY GATE.
   - Explicit privacy line under the dropzone: "O ficheiro nunca sai do teu
     computador." Nothing sent, nothing stored — assert with a network-silence
     test in review.
   - Edge cases: non-T212 CSV → friendly error; multi-year files → year
     picker; sells with no matching buy in file → warning row (same semantics
     as the app).
2. **Crédito habitação** (`/simuladores/credito-habitacao`)
   - Inputs: montante, prazo, TAN fixa/mista (fixos meses), Euribor + spread;
     outputs: prestação, MTIC-ish total, amortization chart (lazy-loaded
     Chart.js) — all client-side via shared `loanEngine`. Unlimited, free.
   - Deep-link CTA: "Guarda este crédito na app para o acompanhares" →
     `/signup`.
3. **Amortizar ou Investir** (`/simuladores/amortizar-ou-investir`)
   - Public, simplified version of the in-app Compare: extra amount, loan
     params (or "usa os valores do simulador anterior" via sessionStorage —
     NOT persisted server-side), expected return → verdict card + chart.
     Reuses `loanEngine` + `compareDefaults` client-side.
4. **Revisão Euribor** (`/simuladores/revisao-euribor`)
   - Inputs: prestação atual OU (capital em dívida, prazo restante, spread);
     indexante (3/6/12M). Current Euribor from `GET /api/public/euribor`
     (WS-L4). Output: nova prestação estimada, delta €/mês, 12-month sparkline.
- Acceptance per tool: works signed-out with JS enabled and **no network
  requests carrying user data**; sensible on 375px; i18n pt+en; the IRS gate
  triggers at exactly >5 rows; each page has unique title/description/H1.

### WS-L4 — Minimal public API (only what can't be client-side)

- `GET /api/public/euribor` → `{ rate3m, rate6m, rate12m, asOf }` from the
  cron-fed table. Cache-Control 1h. No auth, no cookies needed.
- `POST /api/public/contact` (WS-L7 consumer): `{ name, email, message,
  honeypot }` → Resend mail to D4 address. kvStore rate-limit (e.g. 3/h/IP) —
  NOTE: until the Upstash env vars are set (STATE.md activation item #1) this
  falls back to per-instance in-memory counting, i.e. weak on serverless;
  acceptable for a contact form, but flag it in the WS review.
- NOTHING else public. No calc endpoints (client-side engines), no persistence
  of any anonymous-user data (explicit non-feature: it's the privacy pitch).
- Acceptance: endpoints work without session cookie; rate-limit returns 429
  with pt message; no new Prisma models.

### WS-L5 — SEO infrastructure

- `frontend/public/robots.txt` (allow all; sitemap pointer).
- Generated `sitemap.xml` at build (the 6 marketing + 2 legal routes,
  `lastmod` = build date).
- Prerender per A3 (or the documented fallback).
- OG/Twitter cards: one branded OG image per tool (agent generates simple
  branded SVG→PNG); `og:locale pt_PT`.
- Canonicals; `hreflang` pt/en only if EN pages get real URLs (v1: single URL,
  language by toggle → skip hreflang, canonical to pt).
- Acceptance: `curl` of each prerendered route returns HTML containing the H1
  without JS; Search Console-ready (owner submits property — owner box below).

### WS-L6 — Ads + consent (env-gated, inert until owner approval)

- Env: `VITE_ADSENSE_CLIENT` (build-time, like `VITE_SENTRY_DSN`; unset → zero
  ad code in bundle, zero CLS impact).
- When set: load AdSense + **Google CMP (Privacy & messaging)** consent flow
  on marketing routes ONLY (never `/app` routes, never for signed-in users on
  tools? — signed-in users still see tool-page ads: keep it simple, ads on
  marketing routes, period).
- 2 slots per tool page (below tool, mid-explainer), 1 on landing (below
  fold) — responsive display, reserved-height containers (no layout shift).
- `public/ads.txt` with the publisher ID (env-templated at build).
- ⚠️ Reality check recorded: EEA requires a certified CMP consent banner for
  ads — "no pop-ups" bends here, legally. Mitigation: banner appears only on
  marketing pages, once, minimal styling.
- Acceptance: with env unset nothing loads (verify bundle); with a test client
  ID, consent banner appears once, slots render placeholders, app routes
  clean.
- ⚠️ **CSP will block AdSense as-is** (found in the 2026-07-11 code review):
  the backend helmet config whitelists only `'self'` +
  `accounts.google.com` in `scriptSrc`. Before ever setting
  `VITE_ADSENSE_CLIENT`, extend CSP (`backend/src/index.ts`) with the Google
  ads origins (`pagead2.googlesyndication.com`,
  `googleads.g.doubleclick.net`, `tpc.googlesyndication.com`, plus
  `frameSrc`/`connectSrc` equivalents per Google's current docs) — otherwise
  ads are silently blocked in prod and revenue is zero with no visible error.

**Owner box (WS-L6):** create AdSense account, add site, pass review (needs
WS-L2/L3/L5 live first — AdSense rejects thin tool-only sites; our explainer
content is also the mitigation), then set `VITE_ADSENSE_CLIENT` + redeploy.
Expect the review to take days–weeks; revenue at this traffic will start tiny.

### WS-L7 — Contact form

- Footer component: nome, email, mensagem + honeypot field; posts to
  `/api/public/contact`; success/error inline (no toast lib, no redirect).
- Reuses `lib/email.ts` (Resend SMTP, live since 2026-07-09).
- Acceptance: mail arrives at D4 address; honeypot drops bots silently;
  rate-limited; works signed-out.

### WS-L8 — Analytics (optional, per D3)

- D3 = none → skip entirely. Plausible → single script on marketing routes,
  cookieless, no banner. GA4 → must ride the WS-L6 CMP. Decide before
  building; default skip.

---

## Owner checklist (everything that is NOT agent work)

1. Answer D1–D4 (pricing copy, slogan/imagery, analytics, contact address).
2. AdSense account + site review + `VITE_ADSENSE_CLIENT` env (after v1 live).
3. Google Search Console property + submit sitemap (after WS-L5).
4. (Optional) buy/forward `hello@wallet360.pt`.
5. Legal glance: ads + consent banner touch the privacy policy — add a
   "Publicidade nas páginas públicas" processor row (Google) when WS-L6 goes
   live. (Agent drafts it; owner blesses — same flow as the legal pages.)
6. Bless final pt copy before launch (it's the public face).

## Phases / shipping order

- **Phase 1 (ship first, no owner blockers):** WS-L1 → WS-L2 (D2 default) →
  WS-L3 tools 2+4 (credit, Euribor — smallest) → WS-L4 euribor endpoint.
  *Funnel live with 2 tools.*
- **Phase 2:** WS-L3 tools 1+3 (IRS with the 5-row gate, compare) + WS-L7
  contact + WS-L5 SEO infra. *Full funnel + indexable.*
- **Phase 3 (owner-gated):** WS-L6 ads after AdSense approval; WS-L8 per D3;
  free/pro copy per D1.
- Each phase ships via the normal `/ship` guards; engines move (A2) lands at
  the very start of Phase 1 as its own reviewed commit.

## Risks & traps (log to STATE.md as they materialize)

- **Prerender is the riskiest chunk** (i18n + SSR). Fallback documented in A3;
  do not block Phase 1 on it.
- **Shared workspace CJS/ESM** — acceptance in A2; test `vercel-build` in a
  preview deploy before merging (serverless bundling of `api/index.ts` must
  still include the moved engines).
- **`/` behavior change is outward-facing** — bookmarked signed-in users must
  not notice anything. Test with and without session cookie.
- **Service worker precache** — new routes/images enter the precache manifest;
  keep the hero image out of precache (network-first) to protect install size.
- **AdSense vs privacy positioning** — ads only on anonymous marketing pages,
  never in-app; say it explicitly on the landing ("a app não tem anúncios").
- **IRS correctness is reputational** — the free tool must reuse the exact
  in-app engine (A2 guarantees it) and show the same disclaimer the app shows.

## Success criteria (90 days after Phase 2)

- Tools indexed for the 4 target queries (Search Console impressions > 0 —
  position climbing is a months-long game, don't over-promise).
- ≥ 1 measurable funnel conversion path (tool → signup) — measured without
  analytics via signup attribution param (`?from=simulador-x` stored at
  signup; tiny, no schema change — add a `source` column? NO: reuse existing
  free-text mechanism or defer; decide at WS-L1 review).
- Zero regressions in the app (auth flow, PWA install, push, SW updates).
