# Wallet360 — Living State

_The single source of truth for "where things stand." Replaces manual hand-offs.
Read at the start of a session with `/catchup`; update at the end with `/handoff`._

**Last updated:** 2026-06-18

> **Secrets policy:** never put real values (DB password, `SESSION_SECRET`, API keys)
> in this file or anywhere in the repo — it's public. Secrets live ONLY in Vercel →
> Settings → Environment Variables.

---

## Current status

- **Live:** https://wallet360.pt — deployed on **Vercel** (serverless API + static SPA). TLS ok, `/api/health` → `{"status":"ok"}`. ✅ Now **in active use with the owner's real data** (real bank-statement imports), so prod is no longer empty — secrets/backup hygiene matters.
- **Production alias:** https://wallet-app-delta-henna.vercel.app · Dashboard: vercel.com/fmarquestomas-6171s-projects/wallet-app
- **DB:** Neon Postgres `wallet360`, Frankfurt (`eu-central-1`), project `polished-bird-49052165`, db `neondb`.
- **Big launch push merged & deployed (2026-06-13/14, PR #1 + 3 follow-ups straight to `main`):** Phases 0–3 + FX1–FX3 + branding + budget fixes. What now works for users:
  - **Sessions:** sliding "stay signed in" (30-day rolling, `sameSite: lax`) + a **"Lembrar-me"** checkbox (1-day for shared devices). No more constant re-login.
  - **Installable PWA** (manifest + Workbox SW with `/api` NetworkOnly; full icon set; `.well-known/assetlinks.json` + Bubblewrap runbook scaffolded).
  - **Dashboard wedge:** proactive "Amortizar vs Investir" insight card → deep-links to `/comparar` (engine already existed; now surfaced). Uses real avg portfolio return (was wrongly using `gFY`).
  - **Budget plan-vs-actuals (FX1):** imported one-off lines are now "actuals" (derived from `source`), separate from the recurring plan; Análise → Mês a mês shows **planeado vs real** (no double-count) and the headline KPIs are plan-only. "Movimentos do mês" (Saldo → Tabelas) **lists the month's real transactions** (actuals + manual), editable/removable — fixed a regression where they'd vanished from that list after FX1.
  - **Onboarding (FX2):** dismissible first-run 3-step checklist.
  - **Empty/error states (FX3):** reusable `StateBlock` with "Tentar novamente"; no blank charts.
  - **Statement import encoding fix:** decode UTF-8 → fall back to Windows-1252 (PT banks) so accents survive; + a Saldo banner + `POST /api/budget/cleanup-encoding` to purge old mojibake rows so they can be re-imported.
  - **Hardening:** numeric input bounds, CSV/formula-injection sanitisation, Sentry-ready error handler + request ids (inert until `SENTRY_DSN` set).
- **Investments — currency-aware "Adicionar ativo" (shipped `8c62cef`, on `main`):** ticker-search dropdown shows a **currency badge** (EUR/USD/KRW…), type chip, readable exchange name, larger rows + loading/empty states. **Prices FX-converted to EUR** before auto-fill: `/api/quotes/cagr` returns `priceEur` (via `convertPrice()` + Frankfurter) so "Investido/Valor (€)" are correct for non-EUR listings.
- **i18n EN+PT — COMPLETE & DEPLOYED (`5723357`, on `main`):** full English support alongside Portuguese via `react-i18next`. **All modules converted** — nav, auth, Settings, Overview, Portfolio, Budget, Loan, Compare (9 namespaces, **796 keys, pt/en parity, zero gaps**). Language **picker** in Settings → Idioma; **auto-detect** browser lang (fallback pt); **localStorage + DB** persistence (`PortfolioSettings.language`); **locale-aware** formatting (en-IE `€1,234.56` vs pt-PT `1.234,56 €`, EUR always); `categoryLabel()` translates category display while the stored value stays canonical-pt. The deploy's `vercel-build` ran `db:push:prod`, adding the nullable `language` column to Neon (additive). Decisions: [`docs/decisions/i18n.md`](docs/decisions/i18n.md).
- **Budget — "Fixa" now promotes to a recurring item (shipped `c8d6ca6`, on `main`):** classifying a movement as **Fixed** (via "Por classificar → Fixa" or the bulk "Tipo → Fixa" panel) now **clears the imported `source` + month-scoping**, moving the row out of "Movimentos do mês" into Receitas/Despesas Fixas so it counts every month. `/classify` promotes only the clicked line (siblings stay actuals → no duplicate recurring rows); `/bulk-update` promotes all selected rows; Variable is unchanged. Backend-only, no schema change. **Note:** items marked fixed *before* this fix don't move retroactively — re-apply Tipo → Fixa to pull them across.
- **Schema sync:** `vercel-build` runs `db:push:prod` on every deploy. **Prisma migrations are now tracked in git** (were gitignored — fixed in Phase 0 so a fresh clone can build the DB; this also resolved the old "Crédito 500").
- **Branch:** on **`main`** at `c8d6ca6` (everything merged & pushed). **Pushing to `main` = prod deploy** (Vercel). Stale merged branches still exist locally + on origin — safe to delete: `feat/i18n-en-pt`, `fix/classify-fixed-becomes-recurring` (and old `docs/public-launch-plan-and-hub`). `gh` CLI is installed locally but **not authenticated**; deploys work via plain `git push` either way.
- **War room dashboard:** `npm run hub` → open `wallet360-hub/hub.html` (self-contained HTML rendering every project `.md` + phase progress; gitignored artifact).
- **Auth:** email/password + Google Sign In **both active**.
- **Env vars set in Vercel:** `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`. Empty/optional: `FINNHUB_API_KEY`, `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY`, `ALLOWED_ORIGINS`. **Not set yet:** `SENTRY_DSN` (monitoring stays inert until added).

## Next steps (priority order)

**Owner / external (only Tomás can do these):**
1. **Add `SENTRY_DSN` in Vercel** (+ optional `VITE_SENTRY_DSN`) to turn on the already-wired error monitoring.
2. **Clean the existing mojibake rows** on the real account: Saldo → click the "Remover N" banner → **re-import** that statement (the encoding fix only corrects *new* imports).
3. **Play Store**: PWA is ready — generate an APK via PWABuilder (`https://wallet360.pt` → Android) or Bubblewrap (see `wallet360-hub/PLAY-STORE.md`); needs Play account (€25) + asset-links fingerprint.
4. **Pre-public legal layer** — privacy policy + Play data-safety + account-deletion URL (MARKET-FEEDBACK #6). Required before opening to others.

_Done: Neon DB password rotated (2026-06-18) — prod `/api/health` ok; no plaintext creds in repo._

**Product / engineering (next build candidates):**
5. **Activate GoCardless** — still BLOCKED externally (signups disabled at bankaccountdata.gocardless.com). When reopened: create secret `wallet360-production`, add `GOCARDLESS_SECRET_ID/KEY` to Vercel, redeploy. Code built (`backend/src/routes/bank.ts`).
6. **i18n follow-up (optional, mostly done)** — common backend error messages now map to EN via `apiErrorMessage` (frontend). Remaining: less-common validation strings still fall back to pt; the Google Sign-In button self-localizes via Google's own widget (pass it a locale if it matters).
7. **Durable plan↔actual link (only if hand-renamed rows bite)** — auto-match is `merchantKey`-based, so a manually-renamed fixed plan row ("Salário") whose bank line differs ("ORDENADO ACME") isn't matched. An id-based link (needs schema) is the real fix; deferred until it actually matters.
8. **One-off / 13th-month income type** — first-class subsídio de férias / bonus concept instead of it surfacing as a positive variance (see Open threads). Needs a schema field (frequency or one-off flag) → two-schema + Neon snapshot.

_Done (uncommitted): **#9 Mortgage ↔ budget link** (`Expense.loanId` — **schema change**; a fixed expense links to a loan and its amount syncs live from the prestação); **#10 Yahoo failover** (stale last-good cache in `getYahooChart` — graceful when Yahoo blips); **#11 Legal drafts** (`docs/legal/` — privacy policy, account-deletion, Play data-safety, with placeholders, not yet published). See [`docs/decisions/budget.md`](docs/decisions/budget.md) + [`portfolio.md`](docs/decisions/portfolio.md)._

_Done (`ea12dcf`, on `main`/deployed): **Plan ↔ actual matching** — imports now auto-match existing recurring **fixed** rows instead of duplicating them; `MonthAnalysis`/`BudgetTimeline` fold the recurring item back into the "real" lane. Backend-only matching + new `frontend/src/lib/budgetReal.ts`. See [`docs/decisions/budget.md`](docs/decisions/budget.md)._

_Done (on `main`/deployed): **Quick-wins batch (5)** — (1) **i18n backend errors**: `apiErrorMessage` maps common pt API messages → EN (falls back to raw), applied at auth + the error display sites; (2) **asset flows history** (`FlowsModal` from the asset row); (3) **bundle split** (`vite manualChunks` → no >500 KB warning, app chunk ~282 KB); (4) **drag-to-reorder watchlist** (persists `watchlistSymbols`); (5) **correlation-aware risk** (covariance `σ_p=√(wᵀΣw)`, credits diversification; value-weighted fallback). All tsc + full build clean; unit-verified. See [`docs/decisions/portfolio.md`](docs/decisions/portfolio.md)._

_Done (`a4ae785`, on `main`/deployed): **Investment risk** — new `GET /api/portfolio/risk` computes **annualized volatility** (stddev of monthly returns × √12, from each holding's Yahoo 10y series) per asset + value-weighted portfolio level (`baixo|medio|alto|muito_alto`). Shown on the Portfolio page (`RiskCard`) and folded into "Amortizar vs Investir" as a **±1σ band** (bad-year/good-year net gain vs the guaranteed interest saved) with a robustness verdict. Pure helper `backend/src/lib/risk.ts`. Simplifications: value-weighted (no correlation), heuristic thresholds, no Finnhub beta (key unset). See [`docs/decisions/portfolio.md`](docs/decisions/portfolio.md) + [`loan.md`](docs/decisions/loan.md)._

_Done (on `main`/deployed): **Deeper wedge** — `/api/simulate/compare` now (a) invests across the **real portfolio** (per-asset returns, value-weighted) instead of a flat rate, with the slider kept as a manual override, and (b) supports **recurring amounts — monthly OR yearly** (`frequencia: unica|mensal|anual`), not just a lump sum (yearly = "recurrent all years", like the loan simulator). New toggles on `/comparar`; dashboard `WedgeInsight` benefits automatically. No schema change. See [`docs/decisions/loan.md`](docs/decisions/loan.md)._

## Open threads / deferred

- **Subsídio de férias / one-off income** — handled implicitly (shows as a positive real-vs-plan variance for that month); no first-class concept. A "one-off / 13th-month" income type would be clearer.
- **Mortgage triple-representation** — the prestação lives in the Loan module, the budget *plan*, and the budget *actual*, unlinked. Pairs with "plan ↔ actual matching" above.
- **Deferred Phase-1 items:** Redis shared store for rate-limit + change-password lockout (S2/F6, needs Upstash); email verification on signup (S3/F7, two-schema + migration); frontend Sentry (`VITE_SENTRY_DSN`).
- **Search currency is best-effort** — derived from the symbol suffix / exchange code (`SUFFIX_CCY` + `EXCHANGE_CCY` in `backend/src/lib/yahooFinance.ts`), since Yahoo's search endpoint returns no currency. Ambiguous venues (Cboe Europe `CXE`, London `IOB` GDRs) deliberately return `null` → a "—" badge rather than a wrong guess. Extend the maps as gaps surface.
- ~~**Initial `index` chunk is ~591 KB**~~ — **fixed (2026-06-20):** `manualChunks` in `vite.config.ts` splits vendors (charts/react/i18n/react-query/router/vendor); the app `index` chunk is now ~282 KB and there's no >500 KB warning.
- **Yahoo failover (F8)** — surface a cached/fallback valuation when Yahoo breaks; wire in the Finnhub backup.
- ~~Asset flows history view~~ (done 2026-06-20 — `FlowsModal`); loan milestone table; email-change flow; ~~drag-to-reorder watchlist~~ (done 2026-06-20); non-monthly cadences.

## Known traps (the ones that bite)

- **Two Prisma schema files** — `schema.prisma` (SQLite dev) + `schema.prod.prisma` (Postgres prod) must stay in sync on EVERY model change. Also update `backend/src/routes/export.ts` + `import.ts`. No automated guard.
- **Prisma migrations ARE tracked now** (`backend/prisma/migrations/` was previously gitignored, which hid drift and caused fresh-clone 500s). Keep committing migrations; don't re-ignore them.
- **Pushing to `main` deploys to prod** and runs `db:push:prod` — destructive on a column rename. Take a Neon snapshot before any rename/drop. **⚠️ Pending schema change (uncommitted):** `Expense.loanId` (nullable, **additive** — safe; migration `add_expense_loan_id`). The next deploy's `db:push:prod` adds the `expenses.loan_id` column automatically; a Neon snapshot first is good practice even though it's non-destructive.
- **Statement imports are NOT UTF-8** — most PT bank CSV/OFX exports are Windows-1252/Latin-1. `ImportStatementModal` reads as ArrayBuffer, tries UTF-8, falls back to windows-1252 when it sees `�`. Don't revert to `readAsText(file, 'utf-8')` (that's what produced "SOLU��O").
- **`gFY` is "anos sem aumento"** (an int, contribution-growth delay), NOT a return %. Don't use it as the investment return — the wedge default uses the avg per-asset `expectedReturn` (`frontend/src/lib/compareDefaults.ts`).
- **Plan vs actual is derived from `source`** (`!!source` ⇒ imported actual; `null` ⇒ recurring plan). Changing where `source` is set moves rows between lanes. **But note the deliberate split across views:** the headline KPIs (Início + top of Saldo) and Análise are plan-based / planeado-vs-real, while **"Movimentos do mês" (`VariableMonths`) intentionally shows the month's *real* movements** (actuals + manual) with a real summary. Don't "unify" them by making Movimentos plan-only — that's the regression we fixed earlier.
- **Classifying as "Fixed" deliberately clears `source` + `startYm`/`endYm`** (`/classify` + `/bulk-update` in `backend/src/routes/budget.ts`) — that promotion is what moves a movement into the recurring Fixas plan (`c8d6ca6`). Don't "fix" the source-clearing thinking it's a bug. `/classify` promotes only the clicked line; siblings stay actuals on purpose (avoids duplicate recurring rows).
- **Dev uses in-memory sessions** — restarting the local backend logs everyone out (re-login in the browser). Prod uses the Postgres session store, so it persists across deploys.
- **Yahoo ticker search is an unofficial endpoint** (`query1.finance.yahoo.com/v1/finance/search`). Finnhub search is the backup. It returns **no currency** — currency is derived backend-side from the symbol suffix/exchange (`currencyForResult`); it's a hint, not authoritative.
- **EUR auto-fill is EUR-only.** AssetModal's `fillPrice` uses `priceEur` (or the native price *only* when it's already EUR). If the FX lookup fails for a non-EUR listing, the amount fields stay empty on purpose — **don't reintroduce a `?? nativePrice` fallback** into the "(€)" fields, or you'll fill a USD/KRW number labelled "auto-preenchido".
- **GBp (pence) vs GBP.** LSE listings show a "GBP" badge but Yahoo reports prices in `GBp` (pence). `normalizeSubunit` in `fx.ts` divides by 100 before converting, so `priceEur` is correct — don't "fix" this by treating `GBp` as pounds in the conversion.
- **Merchant normalization** in `frontend/src/lib/merchant.ts` must match the backend normalizer or learned classification rules break.
- **Backend is CommonJS**, not ESM.
- **i18n: never hardcode UI strings** — all user-facing text goes through `react-i18next`. Add keys to BOTH `frontend/src/i18n/locales/pt/<ns>.json` AND `…/en/<ns>.json` (keep them in **parity** — there's a key-diff check + dev `missingKeyHandler`). Type-safe keys mean dynamic `t(variable)` needs the variable typed as a literal union (`as const` / explicit union), not `string`.
- **i18n categories: translate the LABEL, not the stored value.** `Income.category`/`Expense.category` persist the **canonical pt** string (`Habitação`); `categoryLabel()` maps it to the display label. An expense saved in English mode must still store `Habitação`, not `Housing`. The parsing `DICTIONARY` stays pt.
- Manual Neon schema push (from `backend/`): `DATABASE_URL="…" npx prisma db push --schema prisma/schema.prod.prisma`.

## Recent work (newest first)

- `c8d6ca6` budget — classifying a movement as **Fixa** promotes it to a recurring plan row (clears `source` + month-scoping in `/classify` + `/bulk-update`), so it shows in Receitas/Despesas Fixas and counts monthly. **(on `main`, deployed)** Decision logged in `docs/decisions/budget.md`.
- `5723357` **i18n EN+PT complete & deployed** — `react-i18next` infra (type-safe keys, detector, App remount), locale-aware `format.ts` (en-IE/pt-PT, EUR), `categoryLabel`, `PortfolioSettings.language` column + persistence; whole app converted across 5 phases (nav/auth/settings, Overview, Portfolio, Budget, Loan, Compare) — 9 namespaces, 796 keys, pt/en parity. The deploy added the nullable `language` column to Neon. **(on `main`, deployed)**
- `8c62cef` portfolio — EUR-convert ticker prices (`priceEur` via `convertPrice`) + currency-aware search dropdown; closed stale F11. **(now on `main`, deployed)**
- `7e050cb` portfolio — move "Adicionar ativo" button into the "A minha carteira" section header (below watchlist + summary cards).
- `82357ac` budget — "Movimentos do mês" shows the month's real movements (actuals + manual); fixed the FX1 regression where imported transactions vanished from that list.
- `bc5c199` War Room HTML dashboard generator (`wallet360-hub/build-hub.mjs`, `npm run hub`).
- `12007f8` one-off mojibake cleanup (`POST /api/budget/cleanup-encoding` + Saldo banner).
- `7817ef1` statement import encoding (UTF-8 → windows-1252) + clear bulk-edit selection.
- `aabf1dd` **PR #1 merged** — the full launch branch (everything below).
- `5b4d1e6` temporary leather-wallet logo (Take B) + regenerated icon set.
- `75bf2c3` FX3 — reusable empty/error states with retry (`StateBlock`).
- `e3c6e86` FX2 — first-run onboarding checklist.
- `724739b` FX1 — split planned vs actuals in the budget (no schema change).
- `6a41788` Phase 3 — use real portfolio return (not gFY) for the wedge default.
- `8d23eba` Phase 3 — surface the amortizar-vs-investir wedge on the dashboard.
- `fa7a7ac` Phase 2 — installable PWA + Play Store (TWA) scaffold.
- `acddeb0` Phase 1 — sliding sessions, input hardening, error monitoring.
- `4c58f52` Phase 0 — stabilize fresh-checkout DB (migrations), doc drift, imported-income UX.
- `9283c5e` docs — public-launch plan + `wallet360-hub/` war room.

---

_To update this file, prefer the `/handoff` command — it regenerates the sections
above from the current repo state and your recent changes._
