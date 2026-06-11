import 'dotenv/config'
import path from 'path'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import rateLimit from 'express-rate-limit'
import pgSession from 'connect-pg-simple'
import helmet from 'helmet'

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

// ── Startup guard ──────────────────────────────────────────────────
// Refuse to boot in production without a real session secret so we can
// never accidentally deploy with the hardcoded fallback.
const SESSION_SECRET = process.env.SESSION_SECRET
if (IS_PROD && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  console.error('FATAL: SESSION_SECRET env var must be set in production and be ≥ 32 characters.')
  process.exit(1)
}

// ── Trust proxy ────────────────────────────────────────────────────
if (IS_PROD) app.set('trust proxy', 1)

// ── Security headers ───────────────────────────────────────────────
app.use(helmet())

// ── CORS ───────────────────────────────────────────────────────────
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
let sessionStore: session.Store | undefined
if (IS_PROD && process.env.DATABASE_URL?.startsWith('postgres')) {
  const PgStore = pgSession(session)
  sessionStore = new PgStore({
    conObject: {
      connectionString: process.env.DATABASE_URL,
      ssl: true,  // verify TLS cert (Neon/Render/Supabase all use properly-signed certs)
    },
    createTableIfMissing: true,
    tableName: 'session',
  })
}

app.use(session({
  store: sessionStore,
  name: 'wid',  // custom name; hides Express/connect fingerprint
  secret: SESSION_SECRET ?? 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'strict',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}))

// ── Rate limiting ──────────────────────────────────────────────────
// Strict limiter for auth/sensitive endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas tentativas. Tenta novamente em 15 minutos.' },
})
app.use([
  '/api/auth/login', '/api/auth/signup', '/api/auth/google',
  '/api/auth/change-password', '/api/auth/forgot-password', '/api/auth/reset-password',
], authLimiter)

// General rate limiter applied to all API routes to prevent DoS / API abuse.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: IS_PROD ? 300 : 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos. Tenta novamente em 15 minutos.' },
})
app.use('/api/', apiLimiter)

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
  res.json({ status: 'ok' })
})

// ── Static frontend (production only) ──────────────────────────────
const IS_VERCEL = !!process.env.VERCEL
if (IS_PROD && !IS_VERCEL) {
  const distPath = path.resolve(process.cwd(), '../frontend/dist')
  app.use(express.static(distPath))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

// ── Start ──────────────────────────────────────────────────────────
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`💸 Wallet360 backend running on http://localhost:${PORT} (${IS_PROD ? 'production' : 'development'})`)
  })
}

export default app
