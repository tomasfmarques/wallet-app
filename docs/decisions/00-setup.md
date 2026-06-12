# Decisions — Project setup & stack

_Source: split from CAVEATS-full.md. Read this file only when touching build/tooling/stack._

## Phase 0 — Project setup

### Decisions

- **Workspaces layout, not monorepo tooling**
  - **What**: root `package.json` declares `frontend` + `backend` as npm
    workspaces; root scripts use `concurrently` to run both.
  - **Why**: lightest possible setup, no Turborepo/Nx config to maintain.
  - **How to change**: if you want shared types / caching / parallel builds at
    scale, layer in Turborepo. The current scripts won't conflict.

### Stack

- **Node 24 (not LTS 22)**
  - **What**: `winget install OpenJS.NodeJS.LTS` actually installed v24.16.0.
  - **Why**: that's what winget served when run.
  - **How to change**: `winget uninstall OpenJS.NodeJS.LTS` then install LTS
    via fnm or the official v22 MSI. No code change needed; all deps work on
    22 and 24.

- **SQLite for dev, Postgres-shaped schema**
  - **What**: Prisma datasource is `sqlite` in dev; the file lives at
    `backend/prisma/dev.db`. The schema is portable.
  - **Why**: zero setup, no service to manage, no admin install.
  - **How to change**: in `backend/prisma/schema.prisma` swap `provider =
    "sqlite"` for `"postgresql"`, change `DATABASE_URL` in `backend/.env`, run
    `npm run db:migrate -w backend -- --name init`. The `LoanAmortization.modo`
    field will stay a `String` — converting it back to a real Prisma enum is
    optional (see next entry).

- **`LoanAmortizationMode` enum → `String` column**
  - **What**: the design uses an enum `prazo | prestacao`. SQLite + Prisma 5
    doesn't support enums, so I stored it as `String` and validate at the app
    layer.
  - **Why**: needed to make migrations run on SQLite.
  - **How to change**: when (if) you switch to Postgres, you can re-introduce
    `enum LoanAmortizationMode { prazo prestacao }` in the schema and change
    the field type back. The frontend type `'prazo' | 'prestacao'` already
    matches both representations.

---

