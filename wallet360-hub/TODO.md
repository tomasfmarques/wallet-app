# Wallet360 — Backlog (operationalized)

> Source of truth for *why*: [`../docs/PUBLIC-LAUNCH-PLAN.md`](../docs/PUBLIC-LAUNCH-PLAN.md)
> (Part 6 roadmap + Part 7 scope table). This file turns that plan into a pick-up-and-go
> checklist. Severity: 🔴 blocker · 🟠 fix before scale · 🟡 polish.
> IDs match the plan (F = fragility, S = security, FX = feature fix, P = sessions).
>
> **How to use:** start at the top unchecked box in Phase 0. Don't jump phases.

---

## Phase 0 — Stop the bleeding (do first, days)

_Done 2026-06-12 on branch `docs/public-launch-plan-and-hub` (plan: `~/.claude/plans/crispy-jumping-fairy.md`)._

- [x] **F1** 🔴 Fixed Prisma migration drift so a fresh checkout doesn't 500.
  Captured catch-up migration `backend/prisma/migrations/20260612163315_sync_schema_drift/` (via `prisma migrate diff`), marked applied on the existing dev.db with `prisma migrate resolve --applied`, and added `"postinstall": "prisma generate"` to `backend/package.json` so the client is never stale.
  ✅ Verified: a DB built purely from migrations (`prisma migrate deploy` on a fresh file) now has all columns + the 3 previously-missing tables.
  Correction: the migration history was **not** "only `migration_lock.toml`" — the 4 folders existed; the drift was missing columns (`bonificacao_mensal/meses`, `taeg`, `last_price_eur`) **and** 3 whole tables (`password_reset_tokens`, `bank_connections`, `classification_rules`) + `pending`/`source`/`day_of_month` on incomes/expenses. All now in the one catch-up migration.
- [x] **F10** 🟡 Fixed the `:3001`→`:4000` + Render→Vercel doc drift. Only `CLAUDE.md` was affected (line 29 port comment + line 23 deploy row); `docs/STATE.md` was already clean.
  → `CLAUDE.md`
- [ ] **S6** 🟠 Rotate the Neon DB password (shared in plaintext across old handoff files), update `DATABASE_URL` in Vercel, confirm no secret is committed. **(External console action — still open.)**
  → Vercel env vars · also `docs/STATE.md` next-step #5
- [x] **F4 / FX1 (minimum)** 🔴 Imported income no longer shows a false `0 €`/deficit on Visão geral. Added a presentation-only guard: when income is 0 but lines are pending, the SALDO/RECEITAS cards show a neutral "Classifica N importações" / "N por classificar" state instead of a red deficit. Frontend-only (no KPI/DB change); full planned-vs-actuals split remains FX1 in Phase 3.
  ✅ Verified in the live UI both ways (pending → neutral; classified → real green numbers return).
  → `frontend/src/components/overview/HeroKpis.tsx`, `frontend/src/pages/Overview.tsx`

---

## Phase 1 — Make it safe to be public (1–2 weeks)

_Pragmatic slice done 2026-06-12 on branch `docs/public-launch-plan-and-hub` (plan: `~/.claude/plans/crispy-jumping-fairy.md`). Account/schema-coupled items (S2, S3) deferred to their own PRs._

- [x] **S1 / F2** 🔴 Sentry error monitor + a real Express error handler. New `backend/src/lib/observability.ts` (inert unless `SENTRY_DSN` set, mirrors the SMTP-optional pattern); final error middleware in `index.ts` stamps every unhandled error with a `requestId`, console-logs it, and captures to Sentry when configured. ✅ Verified: boots clean with no DSN; malformed-JSON request returns `{error, requestId}`.
  Deferred: frontend Sentry (behind `VITE_SENTRY_DSN`) — skipped to keep the bundle lean (the >500 kB `pdfStatementParser` chunk is already a concern). Add when wanted.
- [ ] **S2 / F6** 🟠 Replace in-memory counters with a shared store (Upstash Redis). Move rate-limiting + the change-password lockout (`cpAttempts` Map) off per-instance memory. **(Deferred — needs Upstash account; do behind `REDIS_URL` with in-memory fallback.)**
  → `backend/src/routes/auth.ts`, rate-limiter middleware in `backend/src/index.ts`
- [ ] **S3 / F7** 🟠 Email verification on signup — reuse the password-reset token plumbing; gate sensitive actions until verified. **(Deferred — touches BOTH Prisma schemas + a migration + export/import + signup gating; warrants a focused PR. `lib/email.ts` console-fallback pattern is ready to reuse.)**
  → `backend/src/routes/auth.ts`
- [x] **S4 / F5** 🟠 CSV/formula-injection sanitisation. New `backend/src/lib/sanitize.ts` `stripFormulaPrefix()` strips leading `= + - @ \t \r` at the write boundary; applied to `budget.ts` `asName` (covers the statement-import path), plus loan/portfolio names. ✅ Verified: imported `=HYPERLINK(...)` stored as `HYPERLINK(...)`.
  → `backend/src/lib/sanitize.ts`, `backend/src/routes/budget.ts`, `loan.ts`, `portfolio.ts`
- [x] **S5 / F9** 🟡 Server-side API input bounds — rates ≤ 1.0 (100 %), capital ≤ 100 M, amount/qty/value ceilings; reject absurd values via the existing validator helpers. ✅ Verified: `tanFixa:5`→400, `capital:1e12`→400, valid loan→200.
  → `backend/src/routes/loan.ts`, `portfolio.ts`, `budget.ts`
- [ ] **F8** 🟠 Yahoo failover for valuation — surface a cached/fallback value when `query1.finance.yahoo.com` breaks; wire the already-present Finnhub backup into the valuation path.
  → `backend/src/lib/` (yahoo + fx engines), `backend/src/routes/quotes.ts`, `backend/src/routes/portfolio.ts`
- [ ] **S8** 🟡 CI audit gate — `npm audit --production` (fail on high) + a secret-scan (gitleaks). Pairs with S6.
  → CI config (GitHub Actions)
- [x] **P1** 🟠 Sliding sessions — `rolling: true`, `maxAge` 30 days, `sameSite` `strict`→`lax` (mobile-wrapper friendly). Active users never silently re-log. ✅ Verified: 30-day cookie, expiry advances on each response.
  → `backend/src/index.ts` (session config)
- [x] **P2** 🟠 "Lembrar-me" — default 30-day rolling cookie; unchecking issues a 1-day session for shared devices. Checkbox on the sign-in screen (default checked). ✅ Verified both cookie lifetimes + UI renders.
  → `backend/src/routes/auth.ts`, `frontend/src/pages/SignIn.tsx`, `frontend/src/hooks/useAuth.tsx`, `frontend/src/index.css`

---

## Phase 2 — Make it installable (1–2 weeks)

_PWA shell done 2026-06-12 on branch `docs/public-launch-plan-and-hub` (plan: `~/.claude/plans/crispy-jumping-fairy.md`). TWA/Play submission scaffolded but manual — see [`PLAY-STORE.md`](PLAY-STORE.md)._

- [x] **F3** 🔴 PWA shell — `vite-plugin-pwa` with manifest (`name`/`short_name`/standalone/`start_url`/theme `#2563EB`/bg `#F0F4F9`), full icon set generated from `frontend/public/favicon.svg` (64/192/512 + maskable + apple-touch + favicon.ico), and a Workbox service worker (precache shell, **`/api` NetworkOnly** so financial data is never stale, Google-Fonts CacheFirst, SPA `navigateFallback` denylisting `/api`). App is installable. ✅ Verified: manifest 200, one active SW, icons 200, build emits `sw.js`/`workbox-*`.
  → `frontend/vite.config.ts`, `frontend/pwa-assets.config.ts`, `frontend/public/`, `frontend/index.html`
- [ ] **F11** 🟡 Lazy-load the PDF parser (~367 KB ships in the initial chunk). `lazy(() => import('./pdfStatementParser'))` cuts initial bundle ~30 %.
  → `frontend/src/components/budget/ImportStatementModal.tsx`, `frontend/src/lib/` (pdfStatementParser)
- [ ] **TWA** — Bubblewrap → signed `.aab` + `.apk`; host `/.well-known/assetlinks.json` on Vercel; push to Play internal-testing track. **(Scaffolded: `assetlinks.json` placeholder + full runbook in [`PLAY-STORE.md`](PLAY-STORE.md). Manual — needs Play account €25 + Android toolchain.)**
  → new Android project + `frontend/public/.well-known/assetlinks.json`
- [ ] **Store-gating** 🔴 Privacy policy + Data Safety declaration (financial data + bank statements), and a **public** account-deletion URL. Deletion logic already exists (`DELETE /api/me`) — just expose a web URL for it.
  → `backend/src/routes/me.ts` (exists), new public deletion page/route

---

## Phase 3 — Make it worth choosing (2–4 weeks)

_Sprint 1 (surface the wedge) done 2026-06-12 on branch `docs/public-launch-plan-and-hub` (plan: `~/.claude/plans/crispy-jumping-fairy.md`)._

- [x] **Wedge — surfaced.** Discovery during planning: the fused engine + `/comparar` screen already existed (interest-saved vs net-of-tax gain, break-even, pt-PT recommendation). The gap was that it was **passive**. Added a proactive **dashboard insight card** (`frontend/src/components/overview/WedgeInsight.tsx`) that runs the existing `simulate/compare` engine for the user's largest-capital loan and shows the verdict + figures, deep-linking to `/comparar?loan=<id>`. Gated to users with a loan **and** investments. Shared smart-default helper (`frontend/src/lib/compareDefaults.ts`) keeps the card and the page identical. ✅ Verified: card numbers match the engine, deep-link preselects, gating hides the card with no investments.
  ✅ **gFY fix shipped:** `compareDefaults` now uses the avg per-asset `expectedReturn` (fallback 7 %), not `gFY` — confirmed `gFY` is "Anos sem aumento" in `ProjectionPanel`/`portfolioEngine`, not a return. For Rita this corrected 2 %→5.2 % and flipped the verdict to *investir* (the right call vs the 3.35 % break-even). Also fixed the misleading slider hint on `/comparar`.
  → `frontend/src/components/overview/WedgeInsight.tsx`, `frontend/src/lib/compareDefaults.ts`, `frontend/src/pages/Overview.tsx`, `frontend/src/pages/Compare.tsx`
- [ ] **Wedge (deeper)** — optional next: use the portfolio *projection* (not a flat return) and a recurring-amount mode, per [plan Part 5(b)](../docs/PUBLIC-LAUNCH-PLAN.md).
  → `backend/src/routes/simulate.ts`, `backend/src/lib/` (loan + portfolio engines)
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
