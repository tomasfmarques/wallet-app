# Wallet360 — Living State

_The single source of truth for "where things stand." Replaces manual hand-offs.
Read at the start of a session with `/catchup`; update at the end with `/handoff`._

**Last updated:** 2026-06-12

> **Secrets policy:** never put real values (DB password, `SESSION_SECRET`, API keys)
> in this file or anywhere in the repo — it's public. Secrets live ONLY in Vercel →
> Settings → Environment Variables.

---

## Current status

- **Live:** https://wallet360.pt — deployed on **Vercel** (serverless API + static SPA). TLS auto-provisioned, domain resolves and serves. ✅
- **Production alias:** https://wallet-app-delta-henna.vercel.app · Dashboard: vercel.com/fmarquestomas-6171s-projects/wallet-app
- **DB:** Neon Postgres `wallet360`, Frankfurt (`eu-central-1`), project `polished-bird-49052165`, db `neondb`. **Currently empty** (wiped 2026-06-12 after a failed SQLite→Neon migration; chose to start fresh on prod).
- **Schema sync:** `vercel-build` now runs `db:push:prod` automatically, so prod schema tracks code on every deploy (commit 9e0c25f).
- **Branch:** `main` — all work committed/pushed. Deploys trigger from Vercel on push to `main`.
- **Health:** `https://wallet360.pt/api/health` → `{"status":"ok"}` ✅. SPA loads, redirects to `/signin`. ✅
- **Auth:** email/password + Google Sign In **both active** (GIS popup flow; origins authorized for wallet360.pt + the vercel.app alias).
- **Env vars set in Vercel:** `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `VITE_GOOGLE_CLIENT_ID`. Empty/optional: `FINNHUB_API_KEY`, `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY`, `ALLOWED_ORIGINS` (empty = same-origin).

## Next steps (priority order)

1. **Fix Crédito 500** — `/api/loan` returns `{"error":"Erro interno do servidor"}`. Likely the empty DB; if it persists after adding a loan, inspect the loan handler in `api/index.ts` — suspect the `euribor_history` join or a dev/prod schema mismatch. _(see Known traps)_
2. **Run the post-deploy smoke test** — register email account, Google sign-in, load Budget/Portfolio/Crédito, confirm "Ligar banco" shows "brevemente" fallback, `/api/health` ok.
3. **Activate GoCardless** — BLOCKED externally: signups disabled at bankaccountdata.gocardless.com. When reopened: create secret `wallet360-production`, add `GOCARDLESS_SECRET_ID` + `GOCARDLESS_SECRET_KEY` to Vercel, redeploy. Code already built (`backend/src/routes/bank.ts`).
4. **"Amortizar vs investir" fusion feature** — THE product wedge. Fuse the Crédito simulator with the Investments projection engine into one recommendation screen. See `MARKET-FEEDBACK.md`.
5. **Rotate the Neon DB password** — it's been shared in plaintext across handoff files; rotate and update `DATABASE_URL` in Vercel.

## Open threads / deferred

- **Lazy-load the PDF parser** — `pdfStatementParser` (~367 KB) ships in the initial bundle; Vite warns on chunks >500 KB. `lazy(() => import('./pdfStatementParser'))` cuts initial bundle ~30%.
- **FX conversion for ticker prices** — ticker-search auto-fill uses Yahoo's raw native-currency price without converting to EUR. `convertPrice()` exists in `backend/src/lib/fx.ts`, just needs wiring into the quotes/search response.
- **Delete stale local `backend/prisma/dev.db`** — old dev SQLite, no effect on prod.
- Asset flows history view (data in `portfolio_flows`, no UI). Loan milestone table. Email-change flow. Drag-to-reorder watchlist. Actual-vs-budget overlay. Non-monthly cadences. **PWA** (high priority per market feedback). Proactive insights.

## Known traps (the ones that bite)

- **Two Prisma schema files** — `schema.prisma` (SQLite dev) + `schema.prod.prisma` (Postgres prod) must stay in sync on EVERY model change. Also update `backend/src/routes/export.ts` + `import.ts`. A schema mismatch here is the prime suspect for the Crédito 500.
- **Prod `db push`** runs automatically on Vercel build — destructive on column rename. Take a Neon snapshot before any rename/drop.
- **Yahoo ticker search is an unofficial endpoint** (`query1.finance.yahoo.com/v1/finance/search`). Works well; Finnhub search is the backup if it breaks.
- **Merchant normalization** in `frontend/src/lib/merchant.ts` must match the backend normalizer or learned classification rules break.
- **Backend is CommonJS**, not ESM.
- Manual Neon schema push (from `backend/`): `DATABASE_URL="…" npx prisma db push --schema prisma/schema.prod.prisma`.

## Recent work (newest first)

- `ab7b4f4` remove dead code / unused deps (knip pass; bank integration kept intact).
- `90cae4e` ticker search in add-asset modal (Yahoo-backed, `TickerSearch.tsx`, `GET /api/quotes/search`).
- `bb87d56` scope-toggle width + donut legend overflow (donuts capped at 7 slices, "Outras (N)").
- `3ac0e3b` month-by-month drill-down on Análise tab (`MonthAnalysis.tsx`).
- `9e0c25f` vercel-build runs db:push:prod; classify modal groups duplicate merchants.
- `12d3e4d` expected-vs-actual payment tracking KPIs on loan page.

---

_To update this file, prefer the `/handoff` command — it regenerates the sections
above from the current repo state and your recent changes._
