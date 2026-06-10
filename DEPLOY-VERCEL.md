# Deploying Wallet360 to Vercel

The repo is configured to run on Vercel: the Vite SPA is served from the CDN
and the whole Express API runs as one serverless function (`api/index.ts` →
`backend/dist/index.js`). This kills Render's ~50s cold start while staying on
the free **Hobby** plan. (Hobby is non-commercial use only — fine for personal use.)

It runs in parallel with Render — nothing here disturbs the live Render
deploy until you point the domain at Vercel.

## How it's wired (already in the repo)

- **`vercel.json`** — builds with `npm run vercel-build`, serves `frontend/dist`
  statically, rewrites `/api/*` to the serverless function, and falls back to
  `index.html` for client-side routes. The function bundles the Prisma client
  (`includeFiles`) and has a 30s max duration.
- **`api/index.ts`** — exports the Express app as the handler.
- **`backend/src/index.ts`** — detects `process.env.VERCEL` and skips
  `app.listen()` + static serving (Vercel handles both).
- **`schema.prod.prisma`** — `binaryTargets` include `rhel-openssl-3.0.x`
  (Vercel's AWS Lambda runtime) alongside `native`.
- Sessions already use `connect-pg-simple` (Postgres) → works serverless.

## One-time setup

1. **vercel.com → Add New → Project → import `tomasfmarques/wallet-app`.**
2. **Framework Preset: Other.** Root Directory: leave as the repo root.
   (Build command / output are taken from `vercel.json` — don't override.)
3. **Environment Variables** (Production + Preview):
   - `DATABASE_URL` — your Neon **pooler** connection string (the
     `...-pooler...` host, with `?sslmode=require`).
   - `SESSION_SECRET` — a long random string.
   - `GOOGLE_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID` — same value.
   - `FINNHUB_API_KEY` — your Finnhub key.
   - `ALLOWED_ORIGINS` — leave **empty** (frontend + API share one origin).
   - *(later)* `GOCARDLESS_SECRET_ID` + `GOCARDLESS_SECRET_KEY`.
   - You do **not** set `NODE_ENV` or `VERCEL` — Vercel sets them.
4. **Deploy.** You'll get a `*.vercel.app` URL. Smoke-test
   `https://<app>.vercel.app/api/health` and the SPA.

## After it's verified

- **Domain:** Vercel → Project → Domains → add `wallet360.pt` and follow the
  DNS records it shows (replaces the Render A/CNAME on dominios.pt).
- **Google OAuth:** add the new origins (`https://<app>.vercel.app` and
  `https://wallet360.pt`) to Authorized JavaScript origins.

## Notes / gotchas

- **Schema migrations:** `vercel-build` only *generates* the Prisma client (no
  `db push`). Run schema changes with `npm run db:push:prod` locally (or let the
  Render pipeline do it) against the same Neon DB.
- **In-memory caches** (quotes, FX, GoCardless token) reset per cold
  invocation — harmless, just occasional extra upstream calls.
- **Neon** still resumes from idle in ~1–5s on the first query after a pause —
  far shorter than Render's 50s, but not zero.
- If the function errors on Prisma at runtime, confirm the build logs show the
  client generated and that `node_modules/.prisma/client` is included.
