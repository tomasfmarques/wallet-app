import { Router } from 'express'
import { randomBytes, createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'
import { sendPasswordResetEmail } from '../lib/email'
import { seedDemoAccount } from '../lib/demoSeed'
import { hit, peek, clear } from '../lib/kvStore'

const router = Router()

// ── Session lifetime ─────────────────────────────────────────────
// "Lembrar-me" picks the cookie maxAge per-login: 30 days when remembered (the
// default), 1 day for shared/public devices. Combined with rolling:true in
// index.ts, a remembered + active user effectively never re-logs.
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30
const ONE_DAY = 1000 * 60 * 60 * 24
function sessionMaxAge(remember: unknown): number {
  return remember === false ? ONE_DAY : THIRTY_DAYS
}

// ── Per-account lockout for change-password / PIN verify ─────────
// Backed by the shared counter store (kvStore): Upstash Redis when configured,
// in-memory otherwise. The shared store matters on serverless, where per-instance
// memory wouldn't throttle a brute-force spread across invocations.
const CP_MAX = 5
const CP_WINDOW_MS = 15 * 60 * 1000

async function cpIsLocked(key: string): Promise<boolean> {
  return (await peek(`lock:${key}`)) >= CP_MAX
}
async function cpRecordFail(key: string): Promise<void> {
  await hit(`lock:${key}`, CP_WINDOW_MS)
}
async function cpClear(key: string): Promise<void> {
  await clear(`lock:${key}`)
}

// ── Validation helpers ───────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email: unknown): string | null {
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return 'Email inválido'
  }
  return null
}

function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'A password deve ter pelo menos 8 caracteres'
  }
  return null
}

function validateName(name: unknown): string | null {
  if (typeof name !== 'string' || name.trim().length < 2) {
    return 'O nome deve ter pelo menos 2 caracteres'
  }
  return null
}

// ── Helpers ──────────────────────────────────────────────────────
function serializeUser(user: { id: string; email: string; name: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  }
}

// ── POST /api/auth/signup ─────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body ?? {}

  const errors: Record<string, string> = {}
  const emailErr = validateEmail(email)
  if (emailErr) errors.email = emailErr
  const passwordErr = validatePassword(password)
  if (passwordErr) errors.password = passwordErr
  const nameErr = validateName(name)
  if (nameErr) errors.name = nameErr

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors })
    return
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      res.status(409).json({ errors: { email: 'Já existe uma conta com este email' } })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, name: name.trim() },
    })

    req.session.regenerate((err) => {
      if (err) { res.status(500).json({ error: 'Erro de sessão' }); return }
      req.session.userId = user.id
      req.session.cookie.maxAge = sessionMaxAge(req.body?.remember)
      res.status(201).json({ user: serializeUser(user) })
    })
  } catch (err) {
    console.error('Signup failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/auth/login ──────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {}

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email e password são obrigatórios' })
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      // Same error message as wrong-password — don't leak whether email exists
      res.status(401).json({ error: 'Email ou password incorretos' })
      return
    }

    // Google-only users (no local password) get a clear hint instead of a
    // generic 401, since "wrong password" would confuse them.
    if (!user.passwordHash) {
      res.status(401).json({
        error: 'Esta conta usa Sign in with Google. Usa o botão Google para entrar.',
      })
      return
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      res.status(401).json({ error: 'Email ou password incorretos' })
      return
    }

    req.session.regenerate((err) => {
      if (err) { res.status(500).json({ error: 'Erro de sessão' }); return }
      req.session.userId = user.id
      req.session.cookie.maxAge = sessionMaxAge(req.body?.remember)
      res.json({ user: serializeUser(user) })
    })
  } catch (err) {
    console.error('Login failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/auth/change-password ────────────────────────────────
// Requires a valid session. The caller must prove they know the current
// password before we'll set a new one (defence against an attacker who's
// hijacked an unattended browser session).
router.post('/change-password', async (req, res) => {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }

  const { currentPassword, newPassword } = req.body ?? {}

  const errors: Record<string, string> = {}
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    errors.currentPassword = 'Password atual obrigatória'
  }
  const newErr = validatePassword(newPassword)
  if (newErr) errors.newPassword = newErr

  if (Object.keys(errors).length > 0) {
    res.status(400).json({ errors })
    return
  }

  const userId = req.session.userId!
  if (await cpIsLocked(userId)) {
    res.status(429).json({ error: 'Demasiadas tentativas falhadas. Tenta novamente em 15 minutos.' })
    return
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      res.status(401).json({ error: 'Sessão inválida' })
      return
    }
    if (!user.passwordHash) {
      res.status(400).json({
        error: 'A conta usa Sign in with Google. Não existe password local para mudar.',
      })
      return
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) {
      await cpRecordFail(userId)
      res.status(401).json({ errors: { currentPassword: 'Password atual incorreta' } })
      return
    }

    await cpClear(userId)
    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('Change password failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── App-lock PIN (6 digits) ──────────────────────────────────────
// A privacy app-lock layered on top of the session (like banking apps). The PIN
// is hashed server-side (bcrypt) and verified via /pin/verify, which is rate-
// limited (reusing the change-password lockout, namespaced "pin:<userId>").
const PIN_RE = /^\d{6}$/

// Re-auth for setting/disabling the PIN: password users prove with the current
// password; Google-only users (no passwordHash) are proven by the active session
// (same rule as me.ts verifyIdentity).
async function reauth(user: { passwordHash: string | null }, currentPassword: unknown): Promise<boolean> {
  if (!user.passwordHash) return true
  if (typeof currentPassword !== 'string' || currentPassword.length === 0) return false
  return bcrypt.compare(currentPassword, user.passwordHash)
}

router.post('/pin/set', async (req, res) => {
  if (!req.session?.userId) { res.status(401).json({ error: 'Não autenticado' }); return }
  const { pin, currentPassword } = req.body ?? {}
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) {
    res.status(400).json({ errors: { pin: 'O PIN deve ter 6 dígitos' } }); return
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
    if (!user) { res.status(401).json({ error: 'Sessão inválida' }); return }
    if (!(await reauth(user, currentPassword))) {
      res.status(401).json({ errors: { currentPassword: 'Password atual incorreta' } }); return
    }
    await prisma.user.update({ where: { id: user.id }, data: { pinHash: await bcrypt.hash(pin, 12) } })
    res.json({ ok: true })
  } catch (err) {
    console.error('PIN set failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/pin/verify', async (req, res) => {
  if (!req.session?.userId) { res.status(401).json({ error: 'Não autenticado' }); return }
  const userId = req.session.userId
  const key = `pin:${userId}`
  if (await cpIsLocked(key)) {
    res.status(429).json({ error: 'Demasiadas tentativas falhadas.', lockedOut: true }); return
  }
  const { pin } = req.body ?? {}
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) {
    res.status(400).json({ error: 'PIN inválido' }); return
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.pinHash) { res.status(400).json({ error: 'PIN não configurado' }); return }
    if (!(await bcrypt.compare(pin, user.pinHash))) {
      await cpRecordFail(key)
      res.status(401).json({ error: 'PIN incorreto', lockedOut: await cpIsLocked(key) }); return
    }
    await cpClear(key)
    res.json({ ok: true })
  } catch (err) {
    console.error('PIN verify failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/pin/disable', async (req, res) => {
  if (!req.session?.userId) { res.status(401).json({ error: 'Não autenticado' }); return }
  const { pin, currentPassword } = req.body ?? {}
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
    if (!user) { res.status(401).json({ error: 'Sessão inválida' }); return }
    // Re-auth via password (password users) OR the current PIN.
    let allowed = await reauth(user, currentPassword)
    if (!allowed && user.pinHash && typeof pin === 'string') {
      allowed = await bcrypt.compare(pin, user.pinHash)
    }
    if (!allowed) { res.status(401).json({ error: 'Confirmação inválida' }); return }
    await prisma.$transaction([
      prisma.webAuthnCredential.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({ where: { id: user.id }, data: { pinHash: null } }),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error('PIN disable failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── Demo mode ────────────────────────────────────────────────────
// A throwaway, seeded sandbox account so visitors can try the app and devs can
// demo/test without touching real data. Each call mints a fresh ephemeral user,
// seeds it, and logs in. No password → unreachable by normal login. Old demo
// accounts are lazily garbage-collected here (the app has no cron); cascade
// delete wipes all their data.
const DEMO_TTL_MS = 1000 * 60 * 60 * 24 // ~24h

router.post('/demo', async (req, res) => {
  try {
    await prisma.user.deleteMany({ where: { isDemo: true, createdAt: { lt: new Date(Date.now() - DEMO_TTL_MS) } } })

    const email = `demo+${randomBytes(9).toString('hex')}@demo.wallet360.pt`
    const user = await prisma.user.create({ data: { email, name: 'Convidado', isDemo: true } })
    await seedDemoAccount(user.id)

    req.session.regenerate((err) => {
      if (err) { res.status(500).json({ error: 'Erro de sessão' }); return }
      req.session.userId = user.id
      req.session.cookie.maxAge = ONE_DAY
      res.status(201).json({
        user: {
          id: user.id, email: user.email, name: user.name,
          createdAt: user.createdAt.toISOString(),
          hasPassword: false, hasPin: false, hasBiometrics: false, isDemo: true,
        },
      })
    })
  } catch (err) {
    console.error('Demo create failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/demo/reset', async (req, res) => {
  if (!req.session?.userId) { res.status(401).json({ error: 'Não autenticado' }); return }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
    if (!user || !user.isDemo) { res.status(403).json({ error: 'Apenas contas demo' }); return }
    await seedDemoAccount(user.id, { clearFirst: true })
    res.json({ ok: true })
  } catch (err) {
    console.error('Demo reset failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/auth/logout ─────────────────────────────────────────
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout failed:', err)
      res.status(500).json({ error: 'Erro ao terminar sessão' })
      return
    }
    res.clearCookie('wid', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' })
    res.json({ ok: true })
  })
})

// ── POST /api/auth/forgot-password ───────────────────────────────
// Accepts an email address and sends a one-time reset link.
// Always returns 200 so we don't reveal whether the address is registered.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body ?? {}
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Email inválido' }); return
  }

  res.json({ ok: true }) // respond immediately to not leak existence

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    // Only send for accounts that have a local password; Google-only users have no password to reset.
    if (!user || !user.passwordHash) return

    // Invalidate previous unused tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    })

    const plain = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(plain).digest('hex')
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    })

    const origin = process.env.APP_ORIGIN
      ?? (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0]
      ?? 'http://localhost:5173'

    await sendPasswordResetEmail(user.email, `${origin}/reset-password?token=${plain}`)
  } catch (err) {
    console.error('POST /api/auth/forgot-password failed:', err)
    // Don't surface the error — response was already sent
  }
})

// ── POST /api/auth/reset-password ────────────────────────────────
// Validates the token from the email link and sets the new password.
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body ?? {}
  if (typeof token !== 'string' || token.length < 32) {
    res.status(400).json({ error: 'Token inválido' }); return
  }
  const passwordErr = validatePassword(newPassword)
  if (passwordErr) { res.status(400).json({ errors: { newPassword: passwordErr } }); return }

  try {
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } })

    if (!record || record.used || record.expiresAt < new Date()) {
      res.status(400).json({ error: 'O link de recuperação é inválido ou expirou.' }); return
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { used: true } }),
    ])

    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/auth/reset-password failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
