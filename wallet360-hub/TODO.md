# Wallet360 — Backlog (operationalized)

> Source of truth for *why*: [`../docs/PUBLIC-LAUNCH-PLAN.md`](../docs/PUBLIC-LAUNCH-PLAN.md)
> (Part 6 roadmap + Part 7 scope table). This file turns that plan into a pick-up-and-go
> checklist. Severity: 🔴 blocker · 🟠 fix before scale · 🟡 polish.
> IDs match the plan (F = fragility, S = security, FX = feature fix, P = sessions).
>
> **How to use:** start at the top unchecked box in Phase 0. Don't jump phases.

---

## Phase 0 — Stop the bleeding (do first, days)

- [ ] **F1** 🔴 Fix Prisma migration drift so a fresh checkout doesn't 500.
  Immediate: from `backend/` run `npx prisma db push && npx prisma generate`, restart, retry signup.
  Real fix: capture a migration for the drifted columns (`loans.bonificacao_mensal`, `loans.bonificacao_meses`, `loans.taeg`, `portfolio_assets.last_price_eur`) and make migrate-vs-push consistent.
  → `backend/prisma/schema.prisma`, `backend/prisma/schema.prod.prisma`, `backend/prisma/migrations/`
  ⚠️ In *this* checkout `backend/prisma/migrations/` has **only `migration_lock.toml`** — zero migration folders. The drift is worse than the plan's "stops at `_add_budget`" implies. See [plan F1](../docs/PUBLIC-LAUNCH-PLAN.md).
- [ ] **F10** 🟡 Fix the `:3001` → `:4000` doc drift. Backend default is `:4000` (`backend/src/index.ts` line 23 + Vite proxy).
  → `CLAUDE.md` (Commands block), `docs/STATE.md`
- [ ] **S6** 🟠 Rotate the Neon DB password (shared in plaintext across old handoff files), update `DATABASE_URL` in Vercel, confirm no secret is committed.
  → Vercel env vars · also `docs/STATE.md` next-step #5
- [ ] **F4 / FX1 (minimum)** 🔴 Make imported income *visible* on Visão geral so it doesn't show `0 €`. Quick win even before the full planned-vs-actuals refactor (full version is FX1 in Phase 3).
  → `frontend/src/components/overview/HeroKpis.tsx`, `frontend/src/hooks/useBudget.ts`, `backend/src/routes/budget.ts`

---

## Phase 1 — Make it safe to be public (1–2 weeks)

- [ ] **S1 / F2** 🔴 Wire an error monitor (Sentry or Logtail) into the Express error path + frontend. Capture stack + request id; alert on 500-rate. Today every failure is `console.error` + a generic pt string — ephemeral on serverless.
  → `backend/src/index.ts` (error middleware), `backend/src/routes/*`, frontend bootstrap
- [ ] **S2 / F6** 🟠 Replace in-memory counters with a shared store (Upstash Redis). Move rate-limiting + the change-password lockout (`cpAttempts` Map) off per-instance memory.
  → `backend/src/routes/auth.ts`, rate-limiter middleware in `backend/src/index.ts`
- [ ] **S3 / F7** 🟠 Email verification on signup — reuse the password-reset token plumbing; gate sensitive actions until verified.
  → `backend/src/routes/auth.ts`
- [ ] **S4 / F5** 🟠 Sanitise the import boundary — strip leading `= + - @` from merchant/names, enforce length, before persist. Pre-empts CSV formula injection ahead of any export-to-CSV feature.
  → `backend/src/routes/import.ts`, `backend/src/routes/budget.ts`
- [ ] **S5 / F9** 🟡 Server-side API input bounds — rate ≤ 100 %, capital/amount ceilings, reject absurd values.
  → `backend/src/routes/loan.ts`, `backend/src/routes/portfolio.ts`
- [ ] **F8** 🟠 Yahoo failover for valuation — surface a cached/fallback value when `query1.finance.yahoo.com` breaks; wire the already-present Finnhub backup into the valuation path.
  → `backend/src/lib/` (yahoo + fx engines), `backend/src/routes/quotes.ts`, `backend/src/routes/portfolio.ts`
- [ ] **S8** 🟡 CI audit gate — `npm audit --production` (fail on high) + a secret-scan (gitleaks). Pairs with S6.
  → CI config (GitHub Actions)
- [ ] **P1** 🟠 Sliding sessions — set `rolling: true`, raise `maxAge` to 30 days so an active user never silently re-logs (today: absolute 7-day window).
  → `backend/src/index.ts` (session config)
- [ ] **P2** 🟠 "Lembrar-me" + explicit lock — default 30-day rolling cookie, offer a short session for shared devices.
  → `backend/src/routes/auth.ts`, sign-in UI in `frontend/src/pages/SignIn.tsx`

---

## Phase 2 — Make it installable (1–2 weeks)

- [ ] **F3** 🔴 PWA shell — add `manifest.webmanifest`, icon set (192/512 + maskable) + `apple-touch-icon`, and a service worker via `vite-plugin-pwa` (precache shell, network-first `/api`, offline fallback). `frontend/public/` is currently **empty** — this is greenfield.
  → `frontend/public/`, `frontend/vite.config.ts`, `frontend/index.html`
- [ ] **F11** 🟡 Lazy-load the PDF parser (~367 KB ships in the initial chunk). `lazy(() => import('./pdfStatementParser'))` cuts initial bundle ~30 %.
  → `frontend/src/components/budget/ImportStatementModal.tsx`, `frontend/src/lib/` (pdfStatementParser)
- [ ] **TWA** — Bubblewrap (or PWABuilder) → signed `.aab` + `.apk`; host `/.well-known/assetlinks.json` on Vercel; push to Play internal-testing track.
  → new Android project + `frontend/public/.well-known/assetlinks.json`
- [ ] **Store-gating** 🔴 Privacy policy + Data Safety declaration (financial data + bank statements), and a **public** account-deletion URL. Deletion logic already exists (`DELETE /api/me`) — just expose a web URL for it.
  → `backend/src/routes/me.ts` (exists), new public deletion page/route

---

## Phase 3 — Make it worth choosing (2–4 weeks)

- [ ] **Wedge** — Amortizar vs Investir **fused engine**. The compare screen + entry point already exist; the build is fusing the credit simulator and the portfolio projection into one recommendation (juros poupados vs ganho líquido após impostos, break-even, plain-pt recommendation). This is *the* reason someone picks Wallet360. See [plan Part 5(b)](../docs/PUBLIC-LAUNCH-PLAN.md) + [`../MARKET-FEEDBACK.md`](../MARKET-FEEDBACK.md).
  → `frontend/src/pages/Compare.tsx`, `frontend/src/hooks/useCompare.ts`, `backend/src/routes/simulate.ts`, `backend/src/lib/` (loan + portfolio engines)
- [ ] **FX1 (full)** 🔴→🟠 Planned vs. Actuals split — give imported one-off lines their own "realised this month" lane instead of conflating them with recurring budget items. Highest-ROI fix in the plan; permanently resolves F4.
  → `backend/src/routes/budget.ts`, `frontend/src/hooks/useBudget.ts`, `frontend/src/components/budget/`, `frontend/src/components/overview/HeroKpis.tsx`
- [ ] **FX2** 🟠 Onboarding wizard — first-run: add first credit → add first investment → import/connect a bank. Today a new user lands on an empty Visão geral with no guidance.
  → `frontend/src/pages/Overview.tsx`, new onboarding components
- [ ] **FX3** 🟠 Empty / loading / error states everywhere (Yahoo failure, import errors, no-data charts) so failures read "tenta novamente," not blank panels.
  → `frontend/src/components/**`
- [ ] **P4** 🟡 Biometric unlock (WebAuthn / `navigator.credentials`) once running as installed PWA/TWA — persistent session, Face/fingerprint on open.
  → frontend auth flow

---

## Phase 4 — Grow (ongoing, post-launch)

- [ ] **Bank** — GoCardless live sync. Code is built; blocked externally on GoCardless signups reopening. When live: create secret, add `GOCARDLESS_SECRET_ID` + `GOCARDLESS_SECRET_KEY` to Vercel, redeploy.
  → `backend/src/routes/bank.ts` (built), `frontend/src/components/budget/BankConnectModal.tsx`
- [ ] Proactive insights / push notifications ("a tua prestação sobe em Março," "gastaste 30 % mais em restauração"). Needs PWA push (F3).
- [ ] **CSV/Excel export** (with the S4 sanitisation in place), actual-vs-budget overlay, asset-flow history view (data already in `portfolio_flows`), drag-to-reorder watchlist, loan-milestone table, email-change flow, non-monthly cadences. All deferred in `docs/STATE.md`; none launch-blocking.

---

_Cross-reference: [plan Part 7 — one-glance scope table](../docs/PUBLIC-LAUNCH-PLAN.md) maps every ID to type/phase/severity._
