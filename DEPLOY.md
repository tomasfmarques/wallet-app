# Deploying WALLET — free tier, asap

Target stack: **Render** (web service) + **Neon** (Postgres). Both have
generous always-free tiers, no credit card required to start.

The whole flow is ~15 minutes once you have GitHub + Render + Neon
accounts. Everything code-side is already wired — you just push, click,
and paste env vars.

---

## 1. Push the code to GitHub

```powershell
cd C:\Users\tomas\Desktop\wallet-app
git add .
git commit -m "Production-ready: PG sessions, rate limit, static serve, Render blueprint"
# If you haven't created the repo yet:
gh repo create wallet-app --private --source=. --push
# Or use the GitHub web UI to create it, then:
git remote add origin https://github.com/<your-username>/wallet-app.git
git push -u origin main
```

> **Why private**: your `.env` is gitignored so secrets won't ship, but the
> repo also contains your real budget data via the SQLite file if you ever
> committed it accidentally. `.gitignore` already excludes `*.db` — but
> private is safer while you're moving fast.

---

## 2. Create a Neon Postgres database (free)

1. Go to **https://neon.tech** → Sign up with GitHub.
2. Create a new project. Defaults are fine.
3. Copy the **connection string** from the dashboard (it looks like
   `postgresql://user:pass@ep-something.eu-central-1.aws.neon.tech/neondb?sslmode=require`).
4. Keep this tab open — you'll paste this into Render in a minute.

Free tier quotas: 0.5 GB storage + 191 compute hours/month — way more than
this app will use.

---

## 3. Deploy on Render

### Option A — Blueprint (one-click, recommended)

1. Go to **https://render.com** → Sign up with GitHub.
2. **New → Blueprint**.
3. Connect your `wallet-app` repo.
4. Render reads `render.yaml` and prepares a Web Service called `wallet-app`.
5. Fill the env vars when prompted:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 2 |
   | `SESSION_SECRET` | leave blank — Render generates a strong one |
   | `FINNHUB_API_KEY` | the same key you have in your local `.env` |
   | `GOOGLE_CLIENT_ID` | leave empty for now; set when you finish the Google setup |
   | `ALLOWED_ORIGINS` | leave **empty** (same-origin = no CORS needed) |

6. Click **Apply**. First deploy takes ~5 minutes (install + Prisma push +
   build + boot).

### Option B — Manual Web Service

If the blueprint flow misbehaves: **New → Web Service → connect repo**, then:

- **Build Command**: `npm run prod:build`
- **Start Command**: `npm run prod:start`
- **Health Check Path**: `/api/health`
- **Plan**: Free
- **Env Vars**: add NODE_ENV=production + the 5 above

---

## 4. Smoke-test the deployed app

After the first deploy succeeds, Render assigns you a URL like
**`https://wallet-app-xxxx.onrender.com`**. Open it and:

- `GET /api/health` should return `{ "status": "ok", "env": "production" }`
- `/signin` shows the auth form
- Sign up with a fresh account, add a Loan, an Asset, a Budget item
- Hard-refresh and confirm everything persists (proves Postgres is wired)

---

## 5. Known free-tier limits

- **Render free** spins your service down after **15 min idle**. First
  request after that takes ~30 seconds to wake (cold start). For
  always-on, upgrade to Starter ($7/mo) — but for personal use the
  cold-start is fine.
- **Neon free** suspends the DB after 5 min idle. Auto-resumes on next
  query, adds ~1 second to the first response. Combined with Render's
  cold start, **the very first request after a long idle period can take
  ~30-45 seconds**. Subsequent requests are fast.
- **Finnhub free** is 60 calls/min per API key — fine for one user, gets
  tight if you make this multi-user.

---

## 6. Once you have the public URL

- **Update Google OAuth**: in Google Cloud Console, add your Render URL
  (`https://wallet-app-xxxx.onrender.com`) to "Authorized JavaScript
  origins" on your OAuth client. Otherwise the button errors out with
  origin-mismatch.
- **Custom domain (optional, free)**: Render lets you point a domain you
  own at the service. Cloudflare is free for the DNS proxy + SSL.

---

## 7. What's in the code that makes this work

- `render.yaml` — Render Blueprint, declarative deploy config
- `backend/prisma/schema.prod.prisma` — Postgres mirror of dev SQLite schema
- `backend/src/index.ts`:
  - `app.set('trust proxy', 1)` so secure cookies work behind Render's proxy
  - `connect-pg-simple` session store when `NODE_ENV=production` + PG URL
  - `express-rate-limit` (10/15 min) on `/api/auth/*`
  - CORS from `ALLOWED_ORIGINS` env var (or same-origin if unset)
  - Static-serves `frontend/dist` + SPA catch-all for non-`/api/*` paths
- `package.json`:
  - `prod:build` — install + Prisma generate/push prod schema + build frontend + build backend
  - `prod:start` — boot the compiled backend (which also serves the SPA)

---

## 8. Pushing updates

After the initial deploy, every `git push` to the `main` branch triggers
a fresh build. Render shows logs in real-time. If something breaks, the
old deployment stays live until the new one is healthy.

---

If anything goes sideways during deploy, paste the Render build logs in
chat and I'll diagnose.
