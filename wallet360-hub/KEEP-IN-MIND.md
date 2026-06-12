# Wallet360 — Keep In Mind (landmines)

> Read the relevant entry **before** you touch the area it covers. Each entry:
> what the trap is · why it bites · how to avoid it. Sources: the non-negotiable
> rules in [`../CLAUDE.md`](../CLAUDE.md), the known traps in
> [`../docs/STATE.md`](../docs/STATE.md), and the fragility audit in
> [`../docs/PUBLIC-LAUNCH-PLAN.md`](../docs/PUBLIC-LAUNCH-PLAN.md).

---

## 🧱 Schema & data

### Two Prisma schema files must stay in sync (CLAUDE.md rule #1)
- **What:** there are TWO schemas — `backend/prisma/schema.prisma` (SQLite dev) and `backend/prisma/schema.prod.prisma` (Postgres prod). Any model change must touch **both**, plus `backend/src/routes/export.ts` and `backend/src/routes/import.ts`.
- **Why it bites:** there is **no automated guard**. A model added to one schema but not the other (or not reflected in export/import) silently breaks restore and is the prime suspect for the "Crédito 500."
- **Avoid:** change all four files together. Delegate schema work to the `db-prisma` subagent, which is built for this trap.

### Migration drift → fresh checkout 500s (F1 🔴)
- **What:** columns `loans.bonificacao_mensal`, `loans.bonificacao_meses`, `loans.taeg`, `portfolio_assets.last_price_eur` live in the schema but were only ever applied via `db push`, not captured in a migration. In *this* checkout, `backend/prisma/migrations/` contains **only `migration_lock.toml`** — no migration folders at all.
- **Why it bites:** a clean `npm install && npm run dev` yields a stale client + a `dev.db` missing those columns → **every signup and loan write returns 500**. A new machine hits a wall on first run.
- **Avoid:** on a fresh checkout, from `backend/`: `npx prisma db push && npx prisma generate`, restart, retry. Permanent fix is in [`TODO.md`](TODO.md) Phase 0 (capture a migration). See [plan F1](../docs/PUBLIC-LAUNCH-PLAN.md).

### Prod uses `db push`, not migrate (CLAUDE.md rule #2)
- **What:** `vercel-build` runs `db:push:prod` automatically on every deploy, so prod schema tracks code.
- **Why it bites:** `db push` is **destructive on a column rename/drop** — it can wipe data.
- **Avoid:** take a **Neon snapshot** before any rename/drop. Manual push from `backend/`: `DATABASE_URL="…" npx prisma db push --schema prisma/schema.prod.prisma`.

---

## 🔁 Frontend ↔ backend contracts

### merchant.ts parity (CLAUDE.md rule #3)
- **What:** `frontend/src/lib/merchant.ts` merchant normalization must match the backend normalizer exactly.
- **Why it bites:** if they diverge, learned classification rules stop matching — the "app learns the merchant and auto-classifies next month" behaviour silently breaks.
- **Avoid:** change both normalizers in lockstep; test with a re-import that should auto-classify.

### Backend is CommonJS, not ESM (CLAUDE.md rule #4)
- **What:** the Express backend is CommonJS (`require`/`module.exports`), run with ts-node-dev.
- **Why it bites:** dropping ESM-only syntax or an ESM-only dependency in `backend/src/**` breaks the build/runtime.
- **Avoid:** keep `require`/`module.exports` style in backend code; verify a new dep ships a CJS build.

### Imported lines are month-scoped, budget items are recurring (F4 / FX1 🔴)
- **What:** statement imports land as `pending` with `startYm === endYm` (single month). The budget model otherwise assumes recurring monthly items.
- **Why it bites:** "active monthly income" excludes the month-scoped imports → Visão geral shows **RECEITAS MENSAIS 0 €** and a scary false deficit right after a user imports their salary. Worst first-impression bug.
- **Avoid:** don't treat imported lines as recurring. The fix is a planned-vs-actuals split (FX1) — until then, surface imported income explicitly. See [`USER-MANUAL.md`](USER-MANUAL.md) (Saldo) for the user-facing symptom.

---

## ☁️ Serverless & external endpoints

### In-memory state won't survive serverless (F6 🟠)
- **What:** the change-password lockout (`cpAttempts` Map) and the default rate-limiter store are in-process.
- **Why it bites:** on Vercel each cold start / parallel instance has its own memory → lockouts and limits are **per-instance, not global**; trivially bypassed under load and reset on every cold start. The code already flags "replace with a Redis counter."
- **Avoid:** for anything that must be global (rate limits, lockouts, idempotency), use a shared store (Upstash Redis — S2). Never rely on a module-level `Map`/counter for security in serverless.

### Yahoo is an unofficial endpoint (F8 🟠)
- **What:** quotes, ticker search and `refresh-values` ride `query1.finance.yahoo.com` (unofficial, no SLA).
- **Why it bites:** single point of failure; when it breaks there's no cached fallback surfaced to the user (today valuation just fails). Finnhub is wired as backup but **not in the valuation failover path**.
- **Avoid:** add caching + Finnhub failover before relying on live valuation for anything user-facing.

### CSV / spreadsheet formula injection (F5 🟠)
- **What:** the importer stores merchant names verbatim. React escapes them on render (no DOM XSS — verified 🟢), **but** a name starting `=`, `+`, `-`, or `@` is a classic CSV formula-injection payload the moment it lands in Excel/Sheets.
- **Why it bites:** export today is JSON (safe), but a "download CSV" feature is an obvious near-term ask — and then unsanitised names become executable formulas.
- **Avoid:** sanitise at the import boundary now (strip leading `= + - @`, cap length) — S4 — so CSV export is safe by construction later.

---

## 📄 Docs & environment hygiene

### The :4000 vs :3001 doc drift (F10 🟡)
- **What:** `CLAUDE.md` and `docs/STATE.md` say the backend runs on `:3001`. It actually defaults to **:4000** (`backend/src/index.ts` line 23 + the Vite proxy target).
- **Why it bites:** it's the first thing a new session reads, and Appendix A's test recipe assumes `:4000`. Wrong port = confused first 10 minutes.
- **Avoid:** trust `:4000`. Fixing the docs is a Phase 0 task in [`TODO.md`](TODO.md).

### Secrets policy
- **What:** the repo is public-intent; secrets (DB password, `SESSION_SECRET`, API keys) live **only** in Vercel → Environment Variables.
- **Why it bites:** the Neon password was historically shared in plaintext across handoff files — rotate it (S6) and never re-commit.
- **Avoid:** never put real secret values in any repo file, including `docs/STATE.md`. Confirm `VITE_*` vars are non-sensitive (they ship in the client bundle).

### pt-PT for UI, English for code (CLAUDE.md rule #5)
- **What:** all user-facing strings are Portuguese (Portugal); code and comments are English.
- **Why it bites:** an English label leaks into the product and reads as broken/foreign to the target user.
- **Avoid:** new UI copy → pt-PT. (This is also why [`USER-MANUAL.md`](USER-MANUAL.md) is written in pt-PT.)

---

## ✅ Verified-good — don't regress these

From the audit ([plan §"Verified strengths"](../docs/PUBLIC-LAUNCH-PLAN.md)): cross-user data isolation (ownership checked before action → 404, not after), bcrypt cost 12, `session.regenerate()` on login/signup, no-enumeration login + password reset (SHA-256 hashed single-use tokens, 1 h expiry), **step-up auth on export** (re-prompts for password), import dedup + rule-learning + 2000-row cap, account deletion (`DELETE /api/me`), clean mobile layout (no horizontal scroll at 375 px). If a change touches auth, sessions, ownership checks, or export — re-verify these still hold.
