import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import session from 'express-session'

// Routes (to be implemented)
// import authRouter from './routes/auth'
// import meRouter from './routes/me'
// import loanRouter from './routes/loan'
// import portfolioRouter from './routes/portfolio'
// import quotesRouter from './routes/quotes'

const app = express()
const PORT = process.env.PORT ?? 4000

// ── Middleware ─────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false // lock down in prod
    : 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json())

app.use(session({
  secret: process.env.SESSION_SECRET ?? 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}))

// ── Routes ─────────────────────────────────────────────────────────
// app.use('/api/auth', authRouter)
// app.use('/api/me', meRouter)
// app.use('/api/loan', loanRouter)
// app.use('/api/portfolio', portfolioRouter)
// app.use('/api/quotes', quotesRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ── Start ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`💸 WALLET backend running on http://localhost:${PORT}`)
})

export default app
