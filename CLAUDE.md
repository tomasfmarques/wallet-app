# Wallet360 — Claude project guide

Portuguese personal-finance web app (mortgages/credits, investments, budget).
Built for personal use, with a potential product wedge. **User-facing strings are
Portuguese (Portugal); code and comments are English.**

This file loads automatically every session — so you never paste a handoff again.

## Start here

- **What's the current state / what's next?** → read [`docs/STATE.md`](docs/STATE.md) (or run `/catchup`).
- **Why was X built this way?** → read the relevant file in [`docs/decisions/`](docs/decisions/) — load ONLY the module you're touching, never all of them.
- **Market/product strategy** → [`MARKET-FEEDBACK.md`](MARKET-FEEDBACK.md).

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React + Vite + TypeScript, react-router-dom v6, react-query v3, Chart.js v4, Outfit font |
| Backend | Node + Express (**CommonJS**, ts-node-dev), Prisma ORM |
| DB | SQLite dev (`backend/prisma/dev.db`) · Neon Postgres prod |
| Auth | email/password (bcryptjs + express-session) + Google Sign In (wired, inactive) |
| Deploy | Render (live) · Vercel (config committed, not deployed) · CI: GitHub Actions → Render hook |

## Commands

```bash
npm install
npm run dev          # backend :3001 + frontend :5173 (concurrently)
npm run build        # build both workspaces
npm run db:migrate -w backend -- --name <name>   # dev migration (SQLite)
npm run db:studio    # Prisma Studio
```

## Code map

- `frontend/src/pages/` — Overview, Loan, Portfolio, Budget, Settings (one per module).
- `frontend/src/components/<module>/` — UI per module. `lib/` — parsers, format, merchant, dictionary.
- `backend/src/routes/` — one router per module. `backend/src/lib/` — engines (loan, portfolio, fx, yahoo).
- `backend/prisma/` — `schema.prisma` (dev) **and** `schema.prod.prisma` (prod).

## Non-negotiable rules (these break things)

1. **Two Prisma schemas.** Any model change must touch BOTH `schema.prisma` and `schema.prod.prisma`, plus `backend/src/routes/export.ts` and `import.ts`. There is no automated guard.
2. **Prod uses `db push`, not migrate** — destructive on column rename. Take a Neon snapshot first.
3. **`merchant.ts` parity.** `frontend/src/lib/merchant.ts` normalization must match the backend normalizer, or learned classification rules break.
4. **Backend is CommonJS**, not ESM.
5. **Portuguese (pt-PT) for all UI strings**; English for code/comments.
6. Before committing, update [`docs/STATE.md`](docs/STATE.md) (run `/handoff`) and log any non-obvious decision (run `/caveat`).

## How this workspace is set up (so you stay lean & avoid hand-offs)

- **Memory** lives in the repo, not in a chat tab. `CLAUDE.md` (this file) + `docs/STATE.md` + `docs/decisions/` give any fresh session full context. No tab is "the special one."
- **Subagents** in `.claude/agents/` do focused work in their OWN context window — delegate to them instead of bloating the main chat:
  - `code-reviewer` — review a diff before commit.
  - `db-prisma` — schema/migration changes (handles the two-schema trap).
  - `frontend` — React/Vite/TS UI work in pt-PT.
- **Slash commands** in `.claude/commands/`:
  - `/catchup` — load current state at the start of a session.
  - `/handoff` — update `docs/STATE.md` before ending a session.
  - `/caveat` — log a decision into the right `docs/decisions/` file.
  - `/ship` — pre-deploy checklist (build, schema-sync check, commit, push).
- **Working style:** keep ONE main chat as orchestrator. Delegate specialized or
  large-context work to subagents so the main thread stays small. Read only the
  decision file for the module you're in — not the whole `docs/decisions/` set.
