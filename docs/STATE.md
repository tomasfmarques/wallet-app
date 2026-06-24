# Wallet360 — Living State

_The single source of truth for "where things stand." Replaces manual hand-offs.
Read at the start of a session with `/catchup`; update at the end with `/handoff`._

**Last updated:** 2026-06-23

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
- **Compare risk band + biometric discoverability (shipped `dde91a9`, on `main`):** the "Risco do investimento (±1σ)" **"Ano bom (+1σ)" was overflowing to ~1e29** — `flatGross()` takes the annual rate as a FRACTION (the break-even search feeds it 0..2) but the ±1σ band passed PERCENT (`effectiveReturn ± riskVol`, e.g. 24.8), so `rr=24.8/12≈2.07` compounded to ~1e119. Fixed by ÷100 (verified: optimistic → ~€5M, pessimistic sane). Also: Settings → Segurança hid the whole Biometrics block until a PIN existed with no hint — added a one-line prompt when WebAuthn is supported but no PIN is set.
- **Schema sync:** `vercel-build` runs `db:push:prod` on every deploy. **Prisma migrations are now tracked in git** (were gitignored — fixed in Phase 0 so a fresh clone can build the DB; this also resolved the old "Crédito 500").
- **Branch:** on **`main`** at `dde91a9` (everything merged & pushed/deployed). **Pushing to `main` = prod deploy** (Vercel). Stale merged branches still exist — safe to delete: `feat/i18n-en-pt`, `fix/classify-fixed-becomes-recurring`, `fix/compare-risk-overflow-and-bio-hint` (and old `docs/public-launch-plan-and-hub`). `gh` CLI is installed locally but **not authenticated**; deploys work via plain `git push` either way.
- **War room dashboard:** `npm run hub` → open `wallet360-hub/hub.html` (self-contained HTML rendering every project `.md` + phase progress; gitignored artifact).
- **Auth:** email/password + Google Sign In **both active**.
- **Env vars set in Vercel:** `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`. Empty/optional: `FINNHUB_API_KEY`, `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY`, `ALLOWED_ORIGINS`. **Not set yet:** `SENTRY_DSN` (monitoring stays inert until added), `BROKER_ENC_KEY` (Trading 212 live-sync stays gated off until set — `openssl rand -base64 32`), `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (shared rate-limit/lockout store; falls back to in-memory until set).

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
7. ~~**Durable plan↔actual link**~~ — **DONE (`9dce101`)** via symmetric `Income.matchHint`. The hand-renamed "Salário" vs "ORDENADO ACME" case now matches (chose matchHint over a literal id-link — matched actuals are suppressed, so there's no row to hang an id on). See below + [`docs/decisions/budget.md`](docs/decisions/budget.md).
8. **One-off / 13th-month income type** — first-class subsídio de férias / bonus concept instead of it surfacing as a positive variance (see Open threads). Needs a schema field (frequency or one-off flag) → two-schema + Neon snapshot.

_Done (`9542e29`, on `main`/deployed, **gated**): **Trading 212 direct API live-sync (v2) + bank-style import hub.** "Ligar Trading 212" (mirrors GoCardless `bank.ts`) pulls live positions → the **same** `processPortfolioImportItems` pipeline as the CSV import. New `lib/crypto.ts` (AES-256-GCM) encrypts the key at rest; `BrokerConnection` schema (additive, **excluded from backup** like passkeys); `routes/broker.ts` (`/status|/connect|/sync|DELETE`, 15s sync cooldown, userId-scoped); `lib/trading212.ts` (auth-variant probing, 24h per-env instruments cache, ISIN→Yahoo + EUR mapping, FX-fail skips). UI: `BrokerConnectModal` (key form + how-to steps) + `FileImportModal` (platform cards: Trading 212 active, Revolut/DEGIRO/XTB/IBKR "brevemente"). **Gated on `BROKER_ENC_KEY`** — off until set. **Activate:** `openssl rand -base64 32` → set `BROKER_ENC_KEY` in Vercel + generate a read-only T212 key. See [`docs/trading212-v2-spec.md`](docs/trading212-v2-spec.md) + [`docs/decisions/portfolio.md`](docs/decisions/portfolio.md)._

_Done (`fad58ed`, on `main`/deployed): **Trading212 import — v1 (CSV).** Import a Trading212 transactions CSV → `frontend/src/lib/trading212Parser.ts` aggregates the buy/sell ledger per **ISIN** (average cost → net positions + monthly flows; dividends/deposits ignored; sorted chronologically so multi-year exports merge). `Trading212ImportModal` resolves ISIN→Yahoo symbol via `/api/quotes/search`, review table → new `POST /api/portfolio/import` (bulk-create + flows, dedup by ISIN→ticker vs existing + batch). Additive schema `PortfolioAsset.isin` (`add_portfolio_asset_isin`). `value`=cost basis (run "Atualizar valores" for live), `monthly`=0. Button by "+ Adicionar ativo". **Direct API live-sync is v2 (deferred).** Verified end-to-end. See [`docs/decisions/portfolio.md`](docs/decisions/portfolio.md)._

_Done (`9dce101`, on `main`/deployed): **Income.matchHint — closes the hand-renamed plan↔actual gap (next-step #7).** `matchHint` is now symmetric on `Income` (was Expense-only). A fixed income plan row renamed "Salário" whose bank line reads "ORDENADO ACME" now matches via `income|merchantKey(matchHint)` in `processImportItems`, so the import is absorbed instead of double-counting (folded plan + unmatched actual). Additive schema (`add_income_match_hint`, both schemas, `import.ts` whitelist, length-capped 80; `export.ts` carries via full-row dump). UI: matchHint field in `IncomeModal` (fixed income). Verified end-to-end. See [`docs/decisions/budget.md`](docs/decisions/budget.md)._

_Done (`5848d4e`, on `main`/deployed): **Lock screen — fingerprint keypad key + auto-prompt on launch.** The "Use biometrics" text button is now a fingerprint SVG in the keypad's empty bottom-left cell (mirrors ⌫); WebAuthn auto-triggers once on launch when a passkey exists (silent fallback to PIN if the browser needs a gesture). Removed the dead `lock.biometricChecking` key. See [`docs/decisions/auth.md`](docs/decisions/auth.md)._

_Done (`38aa136`, on `main`/deployed): **#9 Mortgage ↔ budget link** (`Expense.loanId` — schema; a fixed expense links to a loan and its amount syncs live from the prestação); **#10 Yahoo failover** (stale last-good cache in `getYahooChart`); **#11 Legal drafts** (`docs/legal/`, with placeholders, not yet published). See [`docs/decisions/budget.md`](docs/decisions/budget.md) + [`portfolio.md`](docs/decisions/portfolio.md)._

_Done (`724cd5e`, on `main`/deployed): **Mortgage import edges** — `Expense.matchHint` (**schema**) matches statement lines to a linked expense by bank description (not just display name); import matching is now **kind-agnostic** so a mortgage **refund/devolução** is absorbed into the plan instead of surfacing as spurious income. Trade-off: matched fixed lines are absorbed → budget shows the contracted prestação, not net-of-refund (documented). See [`docs/decisions/budget.md`](docs/decisions/budget.md)._

_Done (`ea12dcf`, on `main`/deployed): **Plan ↔ actual matching** — imports now auto-match existing recurring **fixed** rows instead of duplicating them; `MonthAnalysis`/`BudgetTimeline` fold the recurring item back into the "real" lane. Backend-only matching + new `frontend/src/lib/budgetReal.ts`. See [`docs/decisions/budget.md`](docs/decisions/budget.md)._

_Done (on `main`/deployed): **Quick-wins batch (5)** — (1) **i18n backend errors**: `apiErrorMessage` maps common pt API messages → EN (falls back to raw), applied at auth + the error display sites; (2) **asset flows history** (`FlowsModal` from the asset row); (3) **bundle split** (`vite manualChunks` → no >500 KB warning, app chunk ~282 KB); (4) **drag-to-reorder watchlist** (persists `watchlistSymbols`); (5) **correlation-aware risk** (covariance `σ_p=√(wᵀΣw)`, credits diversification; value-weighted fallback). All tsc + full build clean; unit-verified. See [`docs/decisions/portfolio.md`](docs/decisions/portfolio.md)._

_Done (`3a01d2c`, on `main`/deployed): **Demo mode** — a throwaway seeded sandbox account. Entry: small "Try the demo" link on the sign-in page + a Demo section in Settings → Account. Each entry mints a fresh ephemeral `User.isDemo` account (no password → unreachable by login), seeded via `backend/src/lib/demoSeed.ts` (loan + 3 assets + budget incl. monthly actuals). `POST /api/auth/demo` (+`/demo/reset`), **lazy-GC** of demo users >24h (no cron). Persistent demo banner in Layout. Schema: `User.isDemo` (additive). **Browser-verified** end-to-end. See [`docs/decisions/auth.md`](docs/decisions/auth.md)._

_Done (`8a8d721`, on `main`/deployed): **Google auto sign-in + PIN app-lock + biometrics** — (1) Google now **silently signs in a remembered account** (One Tap `auto_select`), chooser otherwise; `disableAutoSelect()` on logout. (2) **6-digit PIN app-lock** (server-verified bcrypt + rate-limit), full-screen `LockScreen` on launch (`LockGate` in App.tsx, sessionStorage `w360:unlocked` ⇒ launch-only). (3) **Biometric unlock** via WebAuthn passkeys (`@simplewebauthn`, new `webauthn.ts` + `WebAuthnCredential` table). Managed in Settings → **Security**. Schema: `User.pinHash` + `WebAuthnCredential` (additive). **Browser-verified**: signup→set PIN→reload locks→PIN unlocks→reload stays unlocked→wrong PIN stays locked. See [`docs/decisions/auth.md`](docs/decisions/auth.md)._

_Done (`a4ae785`, on `main`/deployed): **Investment risk** — new `GET /api/portfolio/risk` computes **annualized volatility** (stddev of monthly returns × √12, from each holding's Yahoo 10y series) per asset + value-weighted portfolio level (`baixo|medio|alto|muito_alto`). Shown on the Portfolio page (`RiskCard`) and folded into "Amortizar vs Investir" as a **±1σ band** (bad-year/good-year net gain vs the guaranteed interest saved) with a robustness verdict. Pure helper `backend/src/lib/risk.ts`. Simplifications: value-weighted (no correlation), heuristic thresholds, no Finnhub beta (key unset). See [`docs/decisions/portfolio.md`](docs/decisions/portfolio.md) + [`loan.md`](docs/decisions/loan.md)._

_Done (on `main`/deployed): **Deeper wedge** — `/api/simulate/compare` now (a) invests across the **real portfolio** (per-asset returns, value-weighted) instead of a flat rate, with the slider kept as a manual override, and (b) supports **recurring amounts — monthly OR yearly** (`frequencia: unica|mensal|anual`), not just a lump sum (yearly = "recurrent all years", like the loan simulator). New toggles on `/comparar`; dashboard `WedgeInsight` benefits automatically. No schema change. See [`docs/decisions/loan.md`](docs/decisions/loan.md)._

## Open threads / deferred

- ~~**Trading212 direct API — v2**~~ — **DONE (`9542e29`, gated)**: live "Sincronizar" via an encrypted per-user key (`BROKER_ENC_KEY`, AES-GCM), `/equity/portfolio` + cached instruments → shared import pipeline. **Activate:** set `BROKER_ENC_KEY` in Vercel + generate a read-only T212 key. Still to confirm with a real key: the winning auth-header variant + per-endpoint rate-limit numbers. See [`docs/trading212-v2-spec.md`](docs/trading212-v2-spec.md).
- **Subsídio de férias / one-off income** — handled implicitly (shows as a positive real-vs-plan variance for that month); no first-class concept. A "one-off / 13th-month" income type would be clearer.
- **Mortgage triple-representation** — the prestação lives in the Loan module, the budget *plan*, and the budget *actual*, unlinked. Pairs with "plan ↔ actual matching" above.
- **Deferred Phase-1 items:** ~~Redis shared store (S2/F6)~~ **done** (gated on Upstash env, in-memory fallback); ~~frontend Sentry~~ **done** (gated on `VITE_SENTRY_DSN`); **email verification on signup (S3/F7)** still open — two-schema + migration + signup gating.
- **Search currency is best-effort** — derived from the symbol suffix / exchange code (`SUFFIX_CCY` + `EXCHANGE_CCY` in `backend/src/lib/yahooFinance.ts`), since Yahoo's search endpoint returns no currency. Ambiguous venues (Cboe Europe `CXE`, London `IOB` GDRs) deliberately return `null` → a "—" badge rather than a wrong guess. Extend the maps as gaps surface.
- ~~**Initial `index` chunk is ~591 KB**~~ — **fixed (2026-06-20):** `manualChunks` in `vite.config.ts` splits vendors (charts/react/i18n/react-query/router/vendor); the app `index` chunk is now ~282 KB and there's no >500 KB warning.
- ~~**Yahoo failover (F8)**~~ — **done** (`38aa136`): stale last-good cache in `getYahooChart` falls back when Yahoo breaks.
- ~~Asset flows history view~~ (done 2026-06-20 — `FlowsModal`); ~~loan milestone table~~ (done `19feaf2`); email-change flow; ~~drag-to-reorder watchlist~~ (done 2026-06-20); ~~non-monthly cadences~~ (done `bb6058c`).

## Known traps (the ones that bite)

- **Two Prisma schema files** — `schema.prisma` (SQLite dev) + `schema.prod.prisma` (Postgres prod) must stay in sync on EVERY model change. Also update `backend/src/routes/export.ts` + `import.ts`. No automated guard.
- **Prisma migrations ARE tracked now** (`backend/prisma/migrations/` was previously gitignored, which hid drift and caused fresh-clone 500s). Keep committing migrations; don't re-ignore them.
- **Pushing to `main` deploys to prod** and runs `db:push:prod` — destructive on a column rename. Take a Neon snapshot before any rename/drop. All recent schema changes are **additive**: `User.pinHash` + `WebAuthnCredential` (`add_pin_and_webauthn`), `User.isDemo`, `Expense.loanId`, `Expense.matchHint`, `PortfolioSettings.language`, **`Income.matchHint`** (`add_income_match_hint`, `9dce101`), and **`PortfolioAsset.isin`** (`add_portfolio_asset_isin`, `fad58ed`), and **`BrokerConnection`** (`add_broker_connection`, `9542e29` — new table, encrypted broker creds), and **`Income.frequency`/`Expense.frequency`** (`add_budget_frequency`, `bb6058c` — default "monthly"). All additive → `db:push:prod` adds them on deploy, no snapshot needed.
- **Statement imports are NOT UTF-8** — most PT bank CSV/OFX exports are Windows-1252/Latin-1. `ImportStatementModal` reads as ArrayBuffer, tries UTF-8, falls back to windows-1252 when it sees `�`. Don't revert to `readAsText(file, 'utf-8')` (that's what produced "SOLU��O").
- **`gFY` is "anos sem aumento"** (an int, contribution-growth delay), NOT a return %. Don't use it as the investment return — the wedge default uses the avg per-asset `expectedReturn` (`frontend/src/lib/compareDefaults.ts`).
- **Plan vs actual is derived from `source`** (`!!source` ⇒ imported actual; `null` ⇒ recurring plan). Changing where `source` is set moves rows between lanes. **But note the deliberate split across views:** the headline KPIs (Início + top of Saldo) and Análise are plan-based / planeado-vs-real, while **"Movimentos do mês" (`VariableMonths`) intentionally shows the month's *real* movements** (actuals + manual) with a real summary. Don't "unify" them by making Movimentos plan-only — that's the regression we fixed earlier.
- **`flatGross(annual)` in `simulate.ts` takes a FRACTION, not a percent.** The break-even search feeds it `0..2`; the ±1σ risk band must pass `(effectiveReturn ± riskVol) / 100` (those are percent). Forgetting the `/100` makes `rr = 24.8/12 ≈ 2.07` compound to ~1e119 — the "Ano bom (+1σ)" overflow fixed in `dde91a9`.
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

- `bb6058c` budget — **non-monthly cadences**: `Income.frequency`/`Expense.frequency` (`add_budget_frequency`) so fixed items can be weekly/biweekly/quarterly/annual. `amount` stays the **monthly-equivalent** (zero budget-math changes); frequency is entry/display metadata (modal converts via `lib/budgetFrequency.ts`, Fixas list shows a cadence sub-text, CSV gained a Frequency column). Backward-compatible. **(on `main`, deployed)** See [`docs/decisions/budget.md`](docs/decisions/budget.md).
- (budget/portfolio/loan) **CSV export** (holdings + budget lines, formula-injection-guarded `lib/csvExport.ts`), **loan milestone table** (outstanding/interest/paid at year marks, in the Tabela tab), **actual-vs-budget overlay** (dashed planned-net line on the timeline when actuals exist). Frontend-only, no schema. **(on `main`, deployed)**
- (infra/security) **Redis shared store** — rate-limit + brute-force lockout (change-password + PIN) now use a shared counter store (`backend/src/lib/kvStore.ts`): Upstash when `UPSTASH_REDIS_REST_URL`/`_TOKEN` are set, in-memory fallback otherwise (matters on serverless — per-instance memory barely throttles). Lockout verified end-to-end on the fallback path (fires at 5, clears on success). **(on `main`, deployed — uses in-memory until Upstash env set)**
- (infra/security) frontend **Sentry** (lazy + gated on `VITE_SENTRY_DSN` — tree-shaken to zero when unset; set it in the Vercel build env to enable), **CI gate** (`.github/workflows/ci.yml`: build + prod `npm audit` fail-on-high + gitleaks), **nodemailer 8→9** (cleared a high-sev advisory). **(on `main`, deployed)**
- `9542e29` portfolio — **Trading 212 API live-sync (v2)** + bank-style import hub (API connect modal + CSV platform menu). Encrypted key (`lib/crypto.ts`), `BrokerConnection`, `routes/broker.ts`, gated on `BROKER_ENC_KEY`. **(on `main`, deployed — gated off until env set)**
- `9504f85` portfolio — **fix:** imported assets now show real gain/loss on "Atualizar valores" (was `0 €` — refresh is delta-based; imported assets with a broker-reliable qty now use `value = qty × price`, gated on `isin`). **(on `main`, deployed)**
- `fad58ed` portfolio — **Trading212 CSV import (v1)**: parse the transactions export → average-cost net positions + flows, ISIN→Yahoo resolution, review table, `POST /api/portfolio/import`; additive `PortfolioAsset.isin`. Direct API live-sync = v2 (deferred). **(on `main`, deployed)**
- `5848d4e` auth — lock screen **fingerprint keypad key** (replaces the "Use biometrics" text button, fills the empty bottom-left cell) + **auto-prompt biometrics on launch** when a passkey exists (silent PIN fallback). **(on `main`, deployed)**
- `9dce101` budget — **`Income.matchHint`** (symmetric with Expense): a hand-renamed fixed income plan row matches its differently-described bank line on import → closes the long-deferred plan↔actual gap (next-step #7). Additive schema. **(on `main`, deployed)**
- `dde91a9` compare — fixed the "Risco do investimento" **+1σ overflow** (`flatGross` got percent instead of a fraction → ~1e29 on prod); ÷100. Plus a Settings → Segurança hint so biometric setup is discoverable when no PIN is set yet. **(on `main`, deployed)** Also refreshed the War Room hub (`wallet360-hub/TODO.md`).
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
