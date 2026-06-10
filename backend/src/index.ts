import 'dotenv/config'
import path from 'path'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import rateLimit from 'express-rate-limit'
import pgSession from 'connect-pg-simple'

import authRouter from './routes/auth'
import authGoogleRouter from './routes/authGoogle'
import meRouter from './routes/me'
import loanRouter from './routes/loan'
import portfolioRouter from './routes/portfolio'
import quotesRouter from './routes/quotes'
import exportRouter from './routes/export'
import importRouter from './routes/import'
import budgetRouter from './routes/budget'
import bankRouter from './routes/bank'
import simulateRouter from './routes/simulate'

const app = express()
const PORT = process.env.PORT ?? 4000
const IS_PROD = process.env.NODE_ENV === 'production'

// ── Trust proxy ────────────────────────────────────────────────────
// Render, Vercel, Fly, Cloudflare etc. sit one hop in front of us. We
// need this so secure cookies get set under HTTPS and req.ip reflects
// the real client.
if (IS_PROD) app.set('trust proxy', 1)

// ── CORS ───────────────────────────────────────────────────────────
// In production, set ALLOWED_ORIGINS to a comma-separated list of the
// real frontend URLs. If unset, we assume same-origin (frontend served
// from this server) and disable CORS entirely.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)

app.use(cors({
  origin: IS_PROD
    ? (allowedOrigins.length > 0 ? allowedOrigins : false)
    : 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json({ limit: '10mb' }))

// ── Session store ──────────────────────────────────────────────────
// In production with a Postgres DATABASE_URL, sessions persist across
// restarts and scale across instances. In dev we use the default
// MemoryStore so there's nothing extra to install.
let sessionStore: session.Store | undefined
if (IS_PROD && process.env.DATABASE_URL?.startsWith('postgres')) {
  const PgStore = pgSession(session)
  sessionStore = new PgStore({
    conObject: {
      connectionString: process.env.DATABASE_URL,
      // Neon, Render and most managed PG providers require SSL
      ssl: { rejectUnauthorized: false },
    },
    createTableIfMissing: true,
    tableName: 'session',
  })
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}))

// ── Rate limit auth endpoints ──────────────────────────────────────
// 10 attempts per IP per 15 minutes in prod (100 in dev so we don't
// trip ourselves up). Login, signup, Google, change-password all share
// the same limiter window.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas. Tenta novamente em 15 minutos.' },
})
app.use(['/api/auth/login', '/api/auth/signup', '/api/auth/google', '/api/auth/change-password'], authLimiter)

// ── API routes ─────────────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/auth/google', authGoogleRouter)
app.use('/api/me', meRouter)
app.use('/api/loan', loanRouter)
app.use('/api/portfolio', portfolioRouter)
app.use('/api/quotes', quotesRouter)
app.use('/api/export', exportRouter)
app.use('/api/import', importRouter)
app.use('/api/budget', budgetRouter)
app.use('/api/bank', bankRouter)
app.use('/api/simulate', simulateRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', env: IS_PROD ? 'production' : 'development', timestamp: new Date().toISOString() })
})

// ── Static frontend (production only) ──────────────────────────────
// In dev, Vite serves the frontend on :5173 and we don't want to serve
// stale built files. On Render we serve frontend/dist from the same Node
// instance (single-origin). On Vercel the SPA is served by the CDN and only
// /api/* reaches this function, so we skip static there.
const IS_VERCEL = !!process.env.VERCEL
if (IS_PROD && !IS_VERCEL) {
  // Resolve dist relative to the project root (process.cwd() at start time)
  const distPath = path.resolve(process.cwd(), '../frontend/dist')
  app.use(express.static(distPath))
  // SPA catch-all: anything that isn't /api/* serves index.html so client
  // routing works on direct URLs and refreshes.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ── Start ──────────────────────────────────────────────────────────
// On Vercel the app is invoked as a serverless function (no listen).
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`💸 Wallet360 backend running on http://localhost:${PORT} (${IS_PROD ? 'production' : 'development'})`)
  })
}

export default app
