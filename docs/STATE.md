# Wallet360 — Living State

_The single source of truth for "where things stand." Replaces manual hand-offs.
Read at the start of a session with `/catchup`; update at the end with `/handoff`._

**Last updated:** 2026-06-15

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
- **i18n EN+PT — COMPLETE (branch `feat/i18n-en-pt`, NOT yet merged/deployed):** full English support alongside Portuguese via `react-i18next`. **All modules converted** — nav, auth, Settings, Overview, Portfolio, Budget, Loan, Compare (9 namespaces, **796 keys, pt/en parity, zero gaps**). Language **picker** in Settings → Idioma; **auto-detect** browser lang (fallback pt); **localStorage + DB** persistence (`PortfolioSettings.language`); **locale-aware** formatting (en-IE `€1,234.56` vs pt-PT `1.234,56 €`, EUR always); `categoryLabel()` translates category display while the stored value stays canonical-pt. Build+types+key-parity green; verified live (sign-in flips en↔pt). **Owner TODO before merge:** prod `db push` for the nullable `language` column (Neon snapshot first). Decisions: [`docs/decisions/i18n.md`](docs/decisions/i18n.md).
- **Schema sync:** `vercel-build` runs `db:push:prod` on every deploy. **Prisma migrations are now tracked in git** (were gitignored — fixed in Phase 0 so a fresh clone can build the DB; this also resolved the old "Crédito 500").
- **Branch:** working on **`feat/i18n-en-pt`** (i18n Phase 1, not yet merged/deployed). `main` holds everything through `8c62cef`. **Pushing to `main` = prod deploy** (Vercel). `gh` CLI is installed locally but **not authenticated** (interactive login needed); deploys work via plain `git push` either way.
- **War room dashboard:** `npm run hub` → open `wallet360-hub/hub.html` (self-contained HTML rendering every project `.md` + phase progress; gitignored artifact).
- **Auth:** email/password + Google Sign In **both active**.
- **Env vars set in Vercel:** `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`. Empty/optional: `FINNHUB_API_KEY`, `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY`, `ALLOWED_ORIGINS`. **Not set yet:** `SENTRY_DSN` (monitoring stays inert until added).

## Next steps (priority order)

**Owner / external (only Tomás can do these):**
1. **Rotate the Neon DB password** — shared in plaintext across old handoff files; rotate in Neon → update `DATABASE_URL` in Vercel → redeploy. More urgent now that prod holds real data.
2. **Add `SENTRY_DSN` in Vercel** (+ optional `VITE_SENTRY_DSN`) to turn on the already-wired error monitoring.
3. **Clean the existing mojibake rows** on the real account: Saldo → click the "Remover N" banner → **re-import** that statement (the encoding fix only corrects *new* imports).
4. **Play Store**: PWA is ready — generate an APK via PWABuilder (`https://wallet360.pt` → Android) or Bubblewrap (see `wallet360-hub/PLAY-STORE.md`); needs Play account (€25) + asset-links fingerprint.
5. **Pre-public legal layer** — privacy policy + Play data-safety + account-deletion URL (MARKET-FEEDBACK #6). Required before opening to others.

6. **i18n prod `db push`** — when merging `feat/i18n-en-pt`: take a Neon snapshot, then push the new nullable `PortfolioSettings.language` column to prod (additive). Dev migration `add_settings_language` already applied.

**Product / engineering (next build candidates):**
0. **Merge i18n** — `feat/i18n-en-pt` is **complete** (all 5 phases; 796 keys, parity green). Before merging to `main`: **(a)** take a Neon snapshot + prod `db push` the nullable `PortfolioSettings.language` column (additive); **(b)** merge → Vercel auto-deploys. Then English is live. (Optional follow-ups: translate backend-originated API error messages — currently still pt; pass a locale to the Google Sign-In widget.)
7. **Plan ↔ actual matching** — the salary/mortgage/utility appears as both a plan row and an imported actual with mismatched names ("Salário" vs "ORDENADO ACME"); link them via learned-merchant rules so it reads as one row (planned vs real) instead of looking like a duplicate. Highest-value polish from the duplication analysis.
8. **Activate GoCardless** — still BLOCKED externally (signups disabled at bankaccountdata.gocardless.com). When reopened: create secret `wallet360-production`, add `GOCARDLESS_SECRET_ID/KEY` to Vercel, redeploy. Code built (`backend/src/routes/bank.ts`).
9. **Deeper wedge** — use the portfolio *projection* (not a flat return) + a recurring-amount mode in the compare engine.

## Open threads / deferred

- **Subsídio de férias / one-off income** — handled implicitly (shows as a positive real-vs-plan variance for that month); no first-class concept. A "one-off / 13th-month" income type would be clearer.
- **Mortgage triple-representation** — the prestação lives in the Loan module, the budget *plan*, and the budget *actual*, unlinked. Pairs with "plan ↔ actual matching" above.
- **Deferred Phase-1 items:** Redis shared store for rate-limit + change-password lockout (S2/F6, needs Upstash); email verification on signup (S3/F7, two-schema + migration); frontend Sentry (`VITE_SENTRY_DSN`).
- **Search currency is best-effort** — derived from the symbol suffix / exchange code (`SUFFIX_CCY` + `EXCHANGE_CCY` in `backend/src/lib/yahooFinance.ts`), since Yahoo's search endpoint returns no currency. Ambiguous venues (Cboe Europe `CXE`, London `IOB` GDRs) deliberately return `null` → a "—" badge rather than a wrong guess. Extend the maps as gaps surface.
- **Initial `index` chunk is ~591 KB** (Vite >500 KB warning). NOT the PDF parser (that's already a lazy `pdfStatementParser-*.js` chunk) — it's Chart.js / react-query / app code. If initial-load size matters, split vendors via `manualChunks` or lazy-load heavy routes. (F11 was a false alarm — closed.)
- **Yahoo failover (F8)** — surface a cached/fallback valuation when Yahoo breaks; wire in the Finnhub backup.
- Asset flows history view (`portfolio_flows`, no UI); loan milestone table; email-change flow; drag-to-reorder watchlist; non-monthly cadences.

## Known traps (the ones that bite)

- **Two Prisma schema files** — `schema.prisma` (SQLite dev) + `schema.prod.prisma` (Postgres prod) must stay in sync on EVERY model change. Also update `backend/src/routes/export.ts` + `import.ts`. No automated guard.
- **Prisma migrations ARE tracked now** (`backend/prisma/migrations/` was previously gitignored, which hid drift and caused fresh-clone 500s). Keep committing migrations; don't re-ignore them.
- **Pushing to `main` deploys to prod** and runs `db:push:prod` — destructive on a column rename. Take a Neon snapshot before any rename/drop. (This session had no schema changes.)
- **Statement imports are NOT UTF-8** — most PT bank CSV/OFX exports are Windows-1252/Latin-1. `ImportStatementModal` reads as ArrayBuffer, tries UTF-8, falls back to windows-1252 when it sees `�`. Don't revert to `readAsText(file, 'utf-8')` (that's what produced "SOLU��O").
- **`gFY` is "anos sem aumento"** (an int, contribution-growth delay), NOT a return %. Don't use it as the investment return — the wedge default uses the avg per-asset `expectedReturn` (`frontend/src/lib/compareDefaults.ts`).
- **Plan vs actual is derived from `source`** (`!!source` ⇒ imported actual; `null` ⇒ recurring plan). Changing where `source` is set moves rows between lanes. **But note the deliberate split across views:** the headline KPIs (Início + top of Saldo) and Análise are plan-based / planeado-vs-real, while **"Movimentos do mês" (`VariableMonths`) intentionally shows the month's *real* movements** (actuals + manual) with a real summary. Don't "unify" them by making Movimentos plan-only — that's the regression we just fixed.
- **Dev uses in-memory sessions** — restarting the local backend logs everyone out (re-login in the browser). Prod uses the Postgres session store, so it persists across deploys.
- **Yahoo ticker search is an unofficial endpoint** (`query1.finance.yahoo.com/v1/finance/search`). Finnhub search is the backup. It returns **no currency** — currency is derived backend-side from the symbol suffix/exchange (`currencyForResult`); it's a hint, not authoritative.
- **EUR auto-fill is EUR-only.** AssetModal's `fillPrice` uses `priceEur` (or the native price *only* when it's already EUR). If the FX lookup fails for a non-EUR listing, the amount fields stay empty on purpose — **don't reintroduce a `?? nativePrice` fallback** into the "(€)" fields, or you'll fill a USD/KRW number labelled "auto-preenchido".
- **GBp (pence) vs GBP.** LSE listings show a "GBP" badge but Yahoo reports prices in `GBp` (pence). `normalizeSubunit` in `fx.ts` divides by 100 before converting, so `priceEur` is correct — don't "fix" this by treating `GBp` as pounds in the conversion.
- **Merchant normalization** in `frontend/src/lib/merchant.ts` must match the backend normalizer or learned classification rules break.
- **Backend is CommonJS**, not ESM.
- **i18n: never hardcode UI strings** — all user-facing text goes through `react-i18next`. Add keys to BOTH `frontend/src/i18n/locales/pt/<ns>.json` AND `…/en/<ns>.json` (keep them in **parity** — there's a key-diff check + dev `missingKeyHandler`). Type-safe keys mean dynamic `t(variable)` needs the variable typed as a literal union (`as const` / explicit union), not `string`.
- **i18n categories: translate the LABEL, not the stored value.** `Income.category`/`Expense.category` persist the **canonical pt** string (`Habitação`); `categoryLabel()` maps it to the display label. An expense saved in English mode must still store `Habitação`, not `Housing`. The parsing `DICTIONARY` stays pt.
- **i18n `language` column needs a prod push** before the i18n branch goes live (nullable, additive; Neon snapshot first). Two-schema rule applied (both schemas + export/import).
- Manual Neon schema push (from `backend/`): `DATABASE_URL="…" npx prisma db push --schema prisma/schema.prod.prisma`.

## Recent work (newest first)

- **(branch `feat/i18n-en-pt`)** i18n EN+PT **complete** — `react-i18next` infra (type-safe keys, detector, App remount), locale-aware `format.ts` (en-IE/pt-PT, EUR), `categoryLabel`, `PortfolioSettings.language` column + persistence; **whole app converted across 5 phases** (nav/auth/settings, Overview, Portfolio, Budget, Loan, Compare) — 9 namespaces, 796 keys, pt/en parity, build/types green. Owner: prod `db push` for `language` before merge.
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
