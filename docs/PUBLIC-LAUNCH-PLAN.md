# Wallet360 — Full-Spectrum "Go Public" Plan

_Authored 2026-06-12 (model: Fable 5). Companion to [`STATE.md`](STATE.md) and
[`MARKET-FEEDBACK.md`](../MARKET-FEEDBACK.md). This is the master plan to take
Wallet360 from "live for me" to "installable, secure, public product — including
the Google Play Store." It is grounded in a real end-to-end test session, not theory._

> **TL;DR verdict.** The app is **architecturally sound and surprisingly close** —
> cross-user data isolation holds, auth is well built (bcrypt cost 12, step-up
> auth on export, password-reset via hashed tokens, rate limiting, helmet/CSP).
> But it is **not yet publishable**, blocked by four things: (1) **migration drift**
> that 500s a fresh environment, (2) **zero production observability** (every error
> is a generic Portuguese string + an ephemeral `console.error`), (3) **no PWA
> shell** (the prerequisite for any Play Store path), and (4) **one headline UX
> trap** — imported income shows as `0 €` on the Overview, which makes a new user
> think the app is broken. None are deep; all are scoped below.

---

## Part 0 — How this was tested (so you can trust the findings)

I ran the app locally and drove it as a real first-time user — call her **Rita Santos**:

- Signed up fresh (`rita.teste@wallet360.pt`).
- Added **2 credits**: a `Casa` mortgage (180 000 €, 420 months, 24-month fixed
  period then Euribor+spread) and a `Carro` fixed-rate auto loan (18 000 €, 84
  months, 6.5 % TAN, TAEG 8.2 %).
- Added **3 investments**: Vanguard FTSE All-World (VWCE), iShares Core MSCI World
  (IWDA) with monthly contributions, and Certificados de Aforro.
- **Imported 2 bank statements** for May 2026 — Millennium BCP (13 lines: salary,
  mortgage, utilities, groceries, fuel, pharmacy, insurance, gym…) and ActivoBank
  (7 lines: freelance income, subscriptions, retail). Then re-imported one to test
  dedup, classified a merchant to test rule-learning, and imported April + March to
  confirm the learned rule auto-classifies.
- Marked a mortgage payment paid, registered an amortization, refreshed live
  market values, exported the full account, and probed cross-user isolation by
  having a second user (**Bruno**) try to read/modify/delete Rita's data.

Everything below is what that session actually produced. A repeatable script of
this exact profile is in [Appendix A](#appendix-a--seed-the-rita-test-profile) so
QA can recreate it on demand.

---

## Part 1 — Fragility audit (what testing exposed)

Severity: 🔴 blocker for public · 🟠 fix before scale · 🟡 polish · 🟢 verified good.

### 🔴 F1 — Prisma migration drift 500s a fresh environment
The columns `loans.bonificacao_mensal`, `loans.bonificacao_meses`, `loans.taeg`
and `portfolio_assets.last_price_eur` exist in `schema.prisma` **but in no
migration file** (`backend/prisma/migrations/` stops at `20260602234004_add_budget`).
They were only ever applied to prod via `db push`. Consequence I hit live: a clean
`npm install && npm run dev` produced a stale Prisma client and a `dev.db` missing
those columns — **every signup and every loan write returned 500
`Erro interno do servidor`**. I recovered with `prisma db push` + regenerate, but a
new contributor (or you on a new machine) hits a wall on first run.
**Root cause class:** same family as the documented "two schemas" trap — schema
truth and applied truth have diverged.

### 🔴 F2 — No production observability
Every failure path is `console.error(...)` + a generic `Erro interno do servidor`.
On Vercel serverless those logs are ephemeral and per-invocation; once the 500 is
in front of a real user you have **no stack trace, no breadcrumb, no alert**. The
"Crédito 500" already sitting in [`STATE.md`](STATE.md) next-steps is exactly the
kind of bug that stays unsolved without this. You cannot run a public app blind.

### 🔴 F3 — No PWA shell
No `manifest.webmanifest`, no service worker, no `apple-touch-icon`, no icons in
`frontend/public/`. This is the **foundation for everything mobile** — "add to home
screen," offline tolerance, and (critically) the Trusted Web Activity path to the
Play Store. Nothing ships to Android until this exists.

### 🔴 F4 — Imported income shows as "0 €" → looks broken
On the Overview after importing Rita's statements: **"RECEITAS MENSAIS 0 €"** and a
red **"SALDO MENSAL −393 € · A gastar mais do que ganhas,"** despite a clearly
imported 1 450 € salary. Cause: imported lines land as `pending` and month-scoped
(`startYm === endYm`), so they are excluded from "active monthly income." A first
-time user who imports a statement and sees *zero income and a scary deficit* will
conclude the app is broken and churn. This is the single most damaging first
-impression bug. (It's the user-visible face of the documented "planned vs actuals"
semantic gap.)

### 🟠 F5 — CSV/spreadsheet formula injection surface
The importer stores merchant names verbatim. React escapes them on render (I
injected `<script>alert(1)</script>` as a merchant — it displayed as inert text, so
**no DOM XSS**, 🟢). **But** a name beginning `=`, `+`, `-`, or `@` is a classic CSV
formula-injection payload the moment any export/report opens in Excel/Sheets.
Export today is JSON (safe), but a "download CSV" feature is an obvious near-term
ask — sanitise at the boundary now.

### 🟠 F6 — In-memory state won't survive serverless
The change-password lockout (`cpAttempts` Map) and the default rate-limiter store
are in-process. On Vercel each cold start / parallel instance has its own memory,
so lockouts and limits are **per-instance, not global** — trivially bypassed under
load and reset on every cold start. The code comments already flag this ("Replace
with a Redis counter"). For public scale it needs a shared store.

### 🟠 F7 — No email verification on signup
Anyone can register any address, including one they don't own. For a finance app
about to be public this enables impersonation and pollutes the user table. Password
reset is correctly built (hashed tokens, 1 h expiry, no user enumeration) — the same
email plumbing extends to a verification step.

### 🟠 F8 — Portfolio valuation rides one unofficial endpoint
`refresh-values` and quotes depend on `query1.finance.yahoo.com` (unofficial). It
worked in testing (VWCE resolved to 161.54 €), but it's a single point of failure
with no caching fallback surfaced to the user when it breaks. Finnhub is wired as
backup but not in the failover path for valuation.

### 🟡 F9 — Rate inputs have no upper sanity bound
The loan API accepts `tanFixa: 3.0` as 300 % without complaint (the UI form
correctly divides by 100, so real users are fine — but the API is public surface).
Add sane bounds (e.g. rate ≤ 1.0, capital ≤ 100 M) for defence in depth.

### 🟡 F10 — Doc drift
`CLAUDE.md` and `STATE.md` say backend runs on **:3001**; it actually runs on
**:4000** (`backend/src/index.ts` default + Vite proxy target). Small, but it's the
first thing a new session reads.

### 🟡 F11 — Heavy initial bundle
`pdfStatementParser` (~367 KB) ships in the initial chunk (Vite warns >500 KB).
Already noted in STATE; matters more on mobile data. `lazy()` import cuts ~30 %.

### 🟢 Verified strengths (don't regress these)
- **Cross-user isolation is solid.** Every one of Bruno's attempts to mark Rita's
  payments, add/delete her amortizations, edit her assets, or delete her loan
  returned **404** (ownership checked before action, not after). This is the
  hardest thing to get right and it's right.
- **Auth hygiene:** bcrypt cost 12; `session.regenerate()` on login/signup (no
  session fixation); login doesn't leak whether an email exists; password reset uses
  SHA-256-hashed single-use tokens with 1 h expiry; Google-only accounts handled
  gracefully.
- **Step-up auth on export** — re-prompts for the password before dumping all
  financial data. Genuinely good instinct.
- **Import pipeline** — dedup fingerprinting works (re-import → 13 duplicates, 0
  inserted), rule-learning works (classify once → auto-classifies next month),
  invalid rows are skipped not fatal, 2 000-row cap enforced.
- **Account deletion exists** (`DELETE /api/me`) — the GDPR erasure half of
  "export + delete" is already there.
- **Mobile layout is clean** — no horizontal scroll on any page at 375 px, bottom
  nav present throughout. A real foundation for the app-store story.

---

## Part 2 — Security hardening scope (pre-public)

Ordered by leverage. Items map to fragilities above.

| # | Action | Addresses | Effort |
|---|--------|-----------|--------|
| S1 | **Wire an error monitor** (Sentry or Logtail) into the Express error path + frontend. Capture stack + request id; alert on 500-rate. | F2 | S |
| S2 | **Replace in-memory counters with a shared store** (Upstash Redis — serverless-native, free tier). Move rate-limiting + change-password lockout there. | F6 | M |
| S3 | **Email verification on signup** — reuse the reset-token plumbing; gate sensitive actions until verified. | F7 | M |
| S4 | **Sanitise import boundary** — strip leading `= + - @` from names, enforce length, before persist. Pre-empts CSV injection ahead of any export-to-CSV feature. | F5 | S |
| S5 | **API input bounds** — rate ≤ 100 %, capital/amount ceilings, reject absurd values server-side. | F9 | S |
| S6 | **Rotate the Neon password** (flagged in STATE — it's been shared in plaintext across handoff files) and confirm no secret is committed. Add a CI secret-scan (gitleaks). | STATE #5 | S |
| S7 | **Security headers pass** — keep helmet; tighten CSP `imgSrc`/`styleSrc` off the broad `https:` once asset origins are known; scope COOP relaxation as narrowly as GIS allows. | hardening | S |
| S8 | **Dependency + audit gate** in CI (`npm audit --production`, fail on high). | hardening | S |
| S9 | **Session security review for mobile** — see Part 3; decide cookie-vs-token before packaging. | F-mobile | M |

**Explicitly already done (no action):** password hashing, session regeneration,
ownership checks, step-up export, no-enumeration login/reset, rate limiting (logic),
account deletion, secrets-out-of-repo policy.

---

## Part 3 — Persistent sessions ("don't always require sign-in")

This is a specific request, so it gets its own treatment. Today: an
`express-session` cookie named `wid`, `httpOnly` + `secure` + `sameSite:strict`,
`maxAge` **7 days**, backed by Postgres (`connect-pg-simple`) in prod. Good bones,
but two gaps for the "stay signed in" goal:

1. **The 7-day window is absolute, not sliding.** `rolling` is not set, so the
   cookie expires 7 days after *login* regardless of activity. A daily user is
   silently logged out weekly.
2. **`sameSite:strict`** means the session cookie isn't sent on cross-site
   navigations — fine for a same-origin SPA, but a constraint to remember for the
   mobile wrapper.

**Plan:**

- **P1 — Sliding sessions.** Set `rolling: true` and raise `maxAge` to **30 days**.
  Each request refreshes the expiry, so an active user effectively never re-logs.
  The Postgres store already persists across deploys, so this "just works" once set.
- **P2 — "Lembrar-me" + explicit lock.** Default to the 30-day rolling cookie;
  offer a shorter session for shared devices. Pair with a client-side idle re-auth
  for sensitive actions (export, delete, change-password already step-up).
- **P3 — Mobile session strategy (decide before packaging).**
  - **PWA / TWA (recommended path, Part 4):** runs same-origin in a Chrome
    container, so **the existing cookie session works unchanged** — this is a big
    reason to prefer TWA. Switch `sameSite` to `lax` to be safe inside the wrapper.
  - **If you ever go fully native (React Native/Capacitor):** cookies are awkward;
    issue a long-lived **refresh token** (rotating, stored in the OS secure
    keystore) + short-lived access token. This is more work and only needed if you
    leave the web-wrapper path. **Recommendation: don't, yet.**
- **P4 — Biometric unlock (mobile polish).** Once in a TWA/installed PWA, gate
  re-entry with the device credential (WebAuthn / `navigator.credentials`) so the
  session stays alive for weeks but the app still asks for Face/fingerprint on open.
  Best of both: persistent session, private by default.

---

## Part 4 — Path to Android / Google Play (and APK)

The app is a React SPA. There are three ways onto a phone; the recommended route is
deliberately the least-effort one that still lands in the Play Store.

### Step 1 (prerequisite for all paths) — make it a real PWA  🔴 F3
- Add `frontend/public/manifest.webmanifest` (name, short_name "Wallet360",
  theme/background color, `display: standalone`, `start_url`, `scope`).
- Generate the icon set (192/512 + maskable) and `apple-touch-icon`.
- Add a service worker — use **`vite-plugin-pwa`** (Workbox under the hood):
  precache the app shell, network-first for `/api`, offline fallback page.
- Result: installable "Add to Home Screen" on Android/iOS with no store at all.
  Ship this **first** — it delivers most of the "feels like an app" value in days
  and is the substrate for the store path.

### Step 2 (recommended store path) — TWA via Bubblewrap → Play Store
A **Trusted Web Activity** wraps the live PWA in a minimal Android shell that opens
your real site full-screen (no browser chrome). Because it's same-origin, **the
existing login/session works as-is** (see P3).
- Tooling: **Bubblewrap CLI** (`@bubblewrap/cli`) or **PWABuilder** (GUI, generates
  a signed `.aab` + the Digital Asset Links file).
- Host `/.well-known/assetlinks.json` (proves you own wallet360.pt → removes the
  URL bar). Vercel serves this fine.
- Output is an **`.aab`** for Play, or an **`.apk`** for direct/sideload
  distribution — both come out of the same Bubblewrap project, so you get the APK
  you asked for *and* the store artifact from one toolchain.
- Requirements checklist: Play Console account (one-time $25), app signing,
  privacy policy URL (you handle financial data — **mandatory**, and Play's Data
  Safety form must declare it), target API level compliance, content rating.

### Step 3 (only if TWA limits bite) — Capacitor
If you later need real native APIs (background sync, native biometrics beyond
WebAuthn, push that TWA can't do), wrap with **Capacitor** instead — same web
codebase, native shell, full plugin access. More overhead (native build, session
becomes token-based per P3). **Don't start here**; graduate to it only if a feature
demands it.

### Recommendation
**PWA now → TWA to the Play Store → Capacitor only if forced.** This reuses 100 %
of the web app and the existing session, gets a real APK *and* a store listing, and
defers all native complexity until a concrete feature requires it.

### Store-readiness gating items (don't skip — Play will reject without them)
- Privacy policy + Data Safety declaration (financial data, bank statements).
- Account deletion reachable from the app **and** via a public web URL (Play now
  requires a deletion path) — you already have `DELETE /api/me`, just expose the URL.
- No secrets/keys in the client bundle; confirm `VITE_*` vars are non-sensitive.
- Crash/ANR monitoring (Part 2 S1 covers the web side).

---

## Part 5 — Feature scope (new + upgrades)

Grouped as **(a) launch-blocking fixes**, **(b) the product wedge**, **(c) growth
features**. The wedge (b) is straight from `MARKET-FEEDBACK.md` and is what makes
this more than a tracker.

### (a) Launch-blocking feature fixes
- **FX1 — Planned vs. Actuals split (fixes F4).** Stop conflating imported
  one-off lines with recurring budget items. Give imported income/expense its own
  "realised this month" lane so the Overview shows real income instead of `0 €`.
  This is the highest-ROI fix in the whole plan — it's both a bug and the unlock for
  honest month-by-month reporting.
- **FX2 — Onboarding flow.** First-run wizard: add first credit → add first
  investment → import or connect a bank. Right now a new user lands on an empty
  Overview with no guidance. Critical for public conversion.
- **FX3 — Empty/loading/error states** everywhere (the Yahoo failure in F8, import
  errors, no-data charts) so failures read as "tenta novamente," not blank panels.

### (b) The product wedge — "Amortizar vs Investir" (already #4 in STATE)
Fuse the credit simulator and the investment projection engine into **one
recommendation screen**: given X € of spare cash, compare *juros poupados* from
amortising vs *ganho líquido após impostos* from investing, with the break-even and
a plain-Portuguese recommendation. The Overview already advertises this card
("⚖️ Amortizar ou Investir?") — testing showed the entry point exists; the fused
engine is the build. **This is the reason someone picks Wallet360 over a
spreadsheet.** Scope it as the flagship of the first public release.

### (c) Growth / retention features (post-launch, prioritised)
- **Proactive insights / push** — "a tua prestação sobe em Março quando acabar o
  período fixo," "gastaste 30 % mais em restauração este mês." Needs PWA push (Part
  4) — another reason the PWA work compounds.
- **GoCardless live bank sync** — code is built (`routes/bank.ts`), blocked only on
  GoCardless signups reopening (STATE #3). Flip on when available; replaces manual
  statement import with automatic feeds (the import pipeline is shared, so it
  "just works").
- **CSV/Excel export** (with F5 sanitisation), actual-vs-budget overlay, asset-flow
  history view (data already in `portfolio_flows`), drag-to-reorder watchlist,
  loan-milestone table, email-change flow, non-monthly cadences. All are noted as
  deferred in STATE — none are launch-blocking.

---

## Part 6 — Phased roadmap

### Phase 0 — Stop the bleeding (days, do first)
- F1 capture a migration for the drifted columns; make migrate-vs-push consistent.
- F10 fix the :3001→:4000 doc drift.
- S6 rotate Neon password.
- F4/FX1 at minimum: make imported income visible on Overview (even before the full
  planned-vs-actuals refactor).

### Phase 1 — Make it safe to be public (1–2 weeks)
- S1 observability (Sentry) · S2 shared store · S3 email verification · S4/S5 input
  hardening · S8 CI audit gate.
- P1/P2 sliding sessions + "lembrar-me."

### Phase 2 — Make it installable (1–2 weeks)
- F3 PWA shell (`vite-plugin-pwa`, manifest, icons, SW) · F11 lazy-load PDF parser.
- TWA build via Bubblewrap → internal-testing track on Play.
- Privacy policy, Data Safety form, public deletion URL.

### Phase 3 — Make it worth choosing (2–4 weeks)
- (b) Amortizar vs Investir fused engine — the wedge.
- FX2 onboarding · FX3 states · P4 biometric unlock.

### Phase 4 — Grow (ongoing)
- GoCardless live sync when unblocked · proactive insights + push · CSV export ·
  the deferred backlog.

---

## Part 7 — One-glance scope table

| ID | Item | Type | Phase | Sev |
|----|------|------|-------|-----|
| F1 | Migration drift → 500 on fresh env | Fix | 0 | 🔴 |
| F4/FX1 | Imported income shows 0 € (planned vs actual) | Fix/Feat | 0→3 | 🔴 |
| F2/S1 | Production observability | Infra | 1 | 🔴 |
| F3 | PWA shell | Infra | 2 | 🔴 |
| S2/F6 | Shared store for limits/lockout | Infra | 1 | 🟠 |
| S3/F7 | Email verification | Feat | 1 | 🟠 |
| S4/F5 | Import sanitisation (CSV-injection) | Fix | 1 | 🟠 |
| F8 | Yahoo failover for valuation | Fix | 1 | 🟠 |
| P1-P2 | Sliding "stay signed in" sessions | Feat | 1 | 🟠 |
| TWA | Bubblewrap → Play Store (.aab + .apk) | Infra | 2 | — |
| Wedge | Amortizar vs Investir engine | Feat | 3 | — |
| FX2/FX3 | Onboarding + states | Feat | 3 | 🟠 |
| P4 | Biometric unlock | Feat | 3 | 🟡 |
| Bank | GoCardless live sync | Feat | 4 | — |

---

## Appendix A — Seed the "Rita" test profile

Reproduces the exact account used for this audit. Backend on `:4000`, cookie jar in
`w360.jar`. (PowerShell users: run under the Bash tool or Git Bash.)

```bash
B=http://localhost:4000/api
curl -s -c w360.jar -H 'Content-Type: application/json' -X POST $B/auth/signup \
  -d '{"email":"rita.teste@wallet360.pt","password":"Rita2026!segura","name":"Rita Santos"}'
# Credits (UI sends rates as fractions: 3.0% → 0.03)
curl -s -b w360.jar -H 'Content-Type: application/json' -X PUT $B/loan \
  -d '{"name":"Casa","capital":180000,"prazoMeses":420,"tanFixa":0.03,"mesesFixos":24,"spread":0.0085,"euribor":0.021,"dataInicio":"2024-03"}'
curl -s -b w360.jar -H 'Content-Type: application/json' -X PUT $B/loan \
  -d '{"name":"Carro","capital":18000,"prazoMeses":84,"tanFixa":0.065,"mesesFixos":84,"spread":0,"euribor":0,"dataInicio":"2025-06","taeg":0.082}'
# Investments
curl -s -b w360.jar -H 'Content-Type: application/json' -X POST $B/portfolio/assets \
  -d '{"name":"Vanguard FTSE All-World","ticker":"VWCE.DE","qty":42,"invested":4800,"value":5390,"monthly":200,"expectedReturn":0.07}'
curl -s -b w360.jar -H 'Content-Type: application/json' -X POST $B/portfolio/assets \
  -d '{"name":"iShares Core MSCI World","ticker":"IWDA.AS","qty":30,"invested":2700,"value":3105,"monthly":100,"expectedReturn":0.065}'
curl -s -b w360.jar -H 'Content-Type: application/json' -X POST $B/portfolio/assets \
  -d '{"name":"Certificados de Aforro","ticker":"CA-SERIE-E","qty":1,"invested":5000,"value":5210,"monthly":0,"expectedReturn":0.021}'
# Then POST monthly statements to $B/budget/import as {items:[...]} — two banks,
# source "Millennium BCP" and "ActivoBank", startYm=endYm=the month.
```

If signup/loan writes 500 on a fresh checkout, you've hit **F1** — run from
`backend/`: `npx prisma db push && npx prisma generate`, restart, retry.
