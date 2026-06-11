import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma'

const router = Router()

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

  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
    if (!user) {
      res.status(401).json({ error: 'Sessão inválida' })
      return
    }
    if (!user.passwordHash) {
      // Google-only account — no current password to verify against
      res.status(400).json({
        error: 'A conta usa Sign in with Google. Não existe password local para mudar.',
      })
      return
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!ok) {
      res.status(401).json({ errors: { currentPassword: 'Password atual incorreta' } })
      return
    }

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

export default router
