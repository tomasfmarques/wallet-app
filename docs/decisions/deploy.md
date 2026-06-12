# Decisions — Deploy, hosting & production

_Source: split from CAVEATS-full.md._

## Phase 8 — Production deployment readiness

### What's done in code (no more pending items from the original checklist)

- **`backend/src/index.ts` rewritten** to handle prod-vs-dev cleanly:
  - `app.set('trust proxy', 1)` when `NODE_ENV=production` so secure cookies
    work behind Render's reverse proxy.
  - `cors()` reads `ALLOWED_ORIGINS` (comma-separated). If unset in prod we
    return `origin: false` (recommended for same-origin Render deployment).
    Dev still hard-codes `localhost:5173`.
  - `connect-pg-simple` is wired as the session store **only** when
    `NODE_ENV=production` AND `DATABASE_URL` starts with `postgres`. The
    `session` table is auto-created. SSL is enabled with
    `rejectUnauthorized: false` since Neon/Render PG present a managed cert.
  - `express-rate-limit` applied to `/api/auth/login`, `/signup`,
    `/google`, `/change-password`. 10 attempts per IP per 15 minutes in
    prod; 100 in dev (so we don't trip ourselves up).
  - Static-serves `frontend/dist` and SPA-catches non-`/api/*` paths when
    `NODE_ENV=production`. Single-origin deploy means no CORS dance.
  - Health check at `/api/health` now reports `env` so the host can verify
    it really booted in production mode.

- **`backend/prisma/schema.prod.prisma`** — Postgres mirror of the dev
  SQLite schema. Provider is `"postgresql"`; everything else is identical
  (models, fields, indexes, relations). The two files must be kept in sync
  manually — they're effectively the same except for one line.

- **`backend/package.json` scripts**:
  - `db:generate:prod` → `prisma generate --schema=prisma/schema.prod.prisma`
  - `db:push:prod` → `prisma db push --schema=...prod.prisma --accept-data-loss`
  - `deploy:prep` → runs both, in order

- **Root `package.json` scripts**:
  - `prod:build` → `npm install && npm run deploy:prep && npm run build`
  - `prod:start` → `npm run start --workspace=backend`

- **`render.yaml`** — declarative Blueprint config so the user can deploy
  by clicking "New → Blueprint → connect repo". Includes free-tier plan,
  Frankfurt region default, health-check path, build + start commands, env
  var declarations (some `sync: false` so they're set in the dashboard,
  `SESSION_SECRET` uses `generateValue: true` so Render rolls a strong one).

- **`DEPLOY.md`** — step-by-step deploy guide: push to GitHub → create
  Neon DB → connect Render Blueprint → paste env vars → smoke test.

### Decisions made for production readiness

- **Render + Neon** chosen over Vercel + Supabase / Fly + Cockroach.
  Reasoning: Render's free Web Service supports long-running Node servers
  with sessions (Vercel serverless would require auth refactor). Neon's
  free tier is the most generous for Postgres (0.5 GB + 191h compute/mo)
  and supports SQL extensions. Both signup with GitHub, no credit card.

- **Single-origin deploy** (backend serves the built frontend) chosen over
  separate frontend host. Removes the CORS layer entirely, keeps session
  cookies same-origin (no SameSite=None complications), one URL for the
  user to remember.

- **`prisma db push --accept-data-loss` over `prisma migrate`** for the
  prod schema. Reason: my SQLite migrations folder isn't portable to
  Postgres anyway, and `db push` is idempotent so re-running on each
  deploy is safe. **`--accept-data-loss` is dangerous if you ever rename
  a field** — it'll drop the old column. Mitigation: take a Neon snapshot
  before any rename/breaking schema change.

- **Rate limit is 10/15-min per IP for auth endpoints**. Tight enough to
  block brute force, loose enough that a fat-fingered user doesn't get
  locked out. Behind Render's proxy the IP is the real client IP because
  of `trust proxy: 1`.

- **`ALLOWED_ORIGINS` unset in prod = same-origin**. Saves the user from
  having to set this if they don't have a custom domain yet. The Render
  URL just serves both API and SPA from itself.

- **Backend still uses CommonJS, not ESM**. Render supports both fine and
  changing module systems mid-flight would break too many imports. The
  built `dist/index.js` runs straight via `node dist/index.js`.

### Behavioural caveats

- **First cold start ~30-45 seconds** combined Render (15-min idle spin
  down) + Neon (5-min idle suspend). After that, requests are sub-second.
  Mitigation: keep the service warm with a cron pinging `/api/health` every
  10 minutes — but that uses up the 750 free hours faster. For personal
  use the cold start is acceptable.

- **`db:push` doesn't preserve history**. If you ever want proper
  Prisma migrations on prod, regenerate them against Neon: edit
  `schema.prod.prisma`, run `prisma migrate dev` pointed at Neon dev
  branch, commit the new migration directory, switch the script to
  `prisma migrate deploy`.

- **Two prisma schemas to keep in sync** is fragile. A pre-commit hook
  could diff them and refuse to commit if they diverge. Not done; flagged
  as future work.

- **`express-rate-limit` uses in-memory state**. With multiple Render
  instances (only on paid plans), each instance has its own count — an
  attacker can fan out across them. For a free-tier single instance this
  is fine.

- **Frontend bundle is 499 KB / 156 KB gzipped**. Most of that is
  Chart.js. Could be reduced by code-splitting the loan/portfolio/budget
  charts into separate routes, but TTFB is already fine over HTTPS so
  it's premature optimization.

### What the user still has to do (no way to automate)

1. Push the repo to GitHub
2. Sign up for Neon → create a project → copy the connection string
3. Sign up for Render → New Blueprint → connect repo
4. Paste env vars: `DATABASE_URL`, `FINNHUB_API_KEY`. Leave
   `SESSION_SECRET` (Render generates) and `ALLOWED_ORIGINS` (empty)
5. Wait ~5 min for first deploy
6. Visit `https://wallet-app-xxxx.onrender.com`
7. (When ready) Add the Render URL to Google OAuth authorized origins

All of these are in `DEPLOY.md`.

---

## Deploys — how they actually trigger

- **Render's "Auto-Deploy: On Commit" is set but does NOT fire.** The service
  is linked to GitHub by **Git URL + credentials**, not Render's **GitHub App**,
  so Render receives no push webhook. Every deploy in the history is "Manual"
  for this reason. Confirmed empirically (pushes never produced a build).
- **Two ways to get real push-to-deploy:**
  1. **GitHub Actions → Deploy Hook** (set up): `.github/workflows/deploy.yml`
     POSTs the Render Deploy Hook on every push to `main`. Needs a one-time repo
     secret `RENDER_DEPLOY_HOOK` (value = Settings → Deploy → Deploy Hook URL).
     Skips harmlessly until the secret exists.
  2. **Reconnect via Render's GitHub App** (Settings → Build → Source) — native
     webhook, makes "On Commit" work, and the Actions workflow becomes redundant.
- **Active since 2026-06-07: option 1.** The `RENDER_DEPLOY_HOOK` secret is set,
  so pushes to `main` auto-deploy (confirmed: deploys now show trigger "Deploy
  Hook"). No manual step needed.
- **Neon cold-start gotcha:** every deploy runs `prisma db push`, and Neon free
  tier auto-suspends — a sleeping DB returns `P1001` and fails the build (it bit
  one auto-deploy). `db:push:prod` now retries once after a 12s wait so the
  first (failed) connection wakes Neon and the retry succeeds.

## Production hosting checklist

Things that are fine for local dev but need attention before exposing the app
to the public internet. Roughly ordered from "do this first" to "nice to
have."

### Must-fix before going public

- **Switch DB from SQLite to Postgres.** SQLite locks the whole file on
  writes and doesn't replicate. Use Supabase / Neon / Railway / Fly Postgres
  (all have free tiers). See "How to change" under Phase 0 SQLite caveat.

- **Wire `connect-pg-simple` as the session store.** The default
  `MemoryStore` resets sessions every time the backend restarts and can't
  span multiple Node processes. The package is already in deps — pass
  `store: new PgSimpleStore({ conObject: { connectionString:
  process.env.DATABASE_URL } })` to `session()` in
  `backend/src/index.ts`.

- **Generate a strong `SESSION_SECRET`.** Replace the placeholder in
  `backend/.env` with the output of `openssl rand -hex 32` (or PowerShell:
  `[Convert]::ToHexString((1..32 | %{ Get-Random -Maximum 256 }))`). Never
  commit it.

- **Open up CORS to your real frontend URL.** In `backend/src/index.ts`
  the prod branch is currently `origin: false` (blocks everything). Change
  to your real frontend URL, e.g. `origin: 'https://wallet.example.com'`.
  If front + back share an origin, drop CORS entirely.

- **Serve over HTTPS.** The session cookie has `secure: true` when
  `NODE_ENV=production`, which means it's dropped on plain HTTP. Use
  Cloudflare/Caddy/Vercel/Render — any of those terminate TLS for free.

- **Rate-limit `/api/auth/login` and `/api/auth/signup`.** Add
  `express-rate-limit` (not yet in deps) — e.g. 5 attempts per IP per 15
  minutes on login, 3 signups per IP per hour. Without this, the app is
  brute-forceable.

### Finnhub-specific (only if you ship the watchlist)

- **Free tier is "personal use" only.** Finnhub's ToS effectively requires
  a paid plan ($25/mo+) for public/commercial apps. Read their terms before
  going live with multiple users.

- **60 calls/min is shared across ALL users.** With a few users actively
  viewing the watchlist, you'll hit the limit fast. Either:
  - Cache quotes server-side (e.g. 60-second TTL in memory or Redis) so
    repeated requests for the same tickers don't burn the budget.
  - Switch to "bring your own key" — let each user paste their own Finnhub
    key into Configurações, store it on the `User` row, use it for that
    user's requests only.

- **Never log the key.** Currently `backend/src/routes/quotes.ts` doesn't
  log it, but be careful with any future error handlers — `console.error(err)`
  on a request error can dump the URL with the key in query params.

### Nice to have

- **Backups.** Postgres providers usually do this automatically. If you stay
  on SQLite for any reason, schedule snapshots (e.g.
  `Copy-Item dev.db dev.db.$(Get-Date -Format yyyyMMdd-HHmm).bak` via Task
  Scheduler).

- **Per-user audit log.** No record of who did what when. For a money app
  that touches your real numbers, even a simple
  `audit_log(user_id, action, payload_json, created_at)` table is useful for
  debugging "why did this value change?".

- **Email verification on signup.** Currently any email string works. Add a
  one-time token sent via SES/Postmark/Resend if you care about email
  ownership.

- **2FA.** Out of scope for now but worth flagging if the app ever holds
  serious money decisions.

## How this file is maintained

When I introduce a new caveat in a future phase, I append it to this file in
the same shape (What / Why / How to change). When a caveat is resolved (e.g.
you migrate to Postgres and re-introduce the enum), strike it through or
delete it.

If you ever want a "still-relevant only" view, ask me to prune resolved entries.
