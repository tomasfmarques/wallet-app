import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { createHash } from 'crypto'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { isEmailVerified } from '../lib/emailVerification'

const router = Router()

// GET /api/me — return the currently authenticated user
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    })

    if (!user) {
      // Session points to a user that no longer exists — clear it
      req.session.destroy(() => {
        res.status(401).json({ error: 'Sessão inválida' })
      })
      return
    }

    const biometricCount = user.pinHash
      ? await prisma.webAuthnCredential.count({ where: { userId: user.id } })
      : 0

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        hasPassword: !!user.passwordHash,
        hasPin: !!user.pinHash,
        hasBiometrics: biometricCount > 0,
        emailVerified: isEmailVerified(user),
        isDemo: user.isDemo,
      },
    })
  } catch (err) {
    console.error('GET /me failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// PUT /api/me — update the current user's profile (name only for now;
// email changes need a separate flow with verification).
router.put('/', requireAuth, async (req, res) => {
  const { name } = req.body ?? {}
  if (typeof name !== 'string' || name.trim().length < 2) {
    res.status(400).json({ errors: { name: 'Nome deve ter pelo menos 2 caracteres' } })
    return
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.session.userId! },
      data: { name: name.trim() },
    })
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
    })
  } catch (err) {
    console.error('PUT /me failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// Verify identity before a destructive operation. Google-only users skip the
// password check (they have no local password); having a valid session is
// already proof of identity because the session was minted via Google.
async function verifyIdentity(userId: string, currentPassword: unknown): Promise<
  | { ok: true; email: string }
  | { ok: false; status: number; body: object }
> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { ok: false, status: 401, body: { error: 'Sessão inválida' } }
  if (!user.passwordHash) return { ok: true, email: user.email } // Google-only — session suffices
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return { ok: false, status: 400, body: { errors: { currentPassword: 'Password atual obrigatória' } } }
  }
  const ok = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!ok) {
    return { ok: false, status: 401, body: { errors: { currentPassword: 'Password atual incorreta' } } }
  }
  return { ok: true, email: user.email }
}

// POST /api/me/reset — wipe loan + portfolio for the current user, keep account.
// Requires the current password (email/pw users) OR an active Google session.
router.post('/reset', requireAuth, async (req, res) => {
  const { currentPassword } = req.body ?? {}
  try {
    const userId = req.session.userId!
    const check = await verifyIdentity(userId, currentPassword)
    if (!check.ok) { res.status(check.status).json(check.body); return }
    await prisma.$transaction([
      prisma.loan.deleteMany({ where: { userId } }),
      prisma.portfolioAsset.deleteMany({ where: { userId } }),
      prisma.portfolioSettings.deleteMany({ where: { userId } }),
    ])
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/me/reset failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// DELETE /api/me — delete account + all data + destroy the session.
// Requires the current password (email/pw users) OR an active Google session.
router.delete('/', requireAuth, async (req, res) => {
  const { currentPassword } = req.body ?? {}
  try {
    const userId = req.session.userId!
    const check = await verifyIdentity(userId, currentPassword)
    if (!check.ok) { res.status(check.status).json(check.body); return }
    // Email captured from the same fetch that verified identity (no extra round-trip).
    const emailHash = createHash('sha256').update(check.email.trim().toLowerCase()).digest('hex')
    // Cascade deletes everything via schema FKs
    await prisma.user.delete({ where: { id: userId } })
    // Append-only deletion log — pseudonymous (sha256 of email), no PII retained.
    // Best-effort: never fail the user's deletion if this write errors.
    try {
      await prisma.deletionLog.create({ data: { emailHash, method: 'self-service' } })
    } catch (logErr) {
      console.error('DeletionLog write failed (account deletion still succeeded):', logErr)
    }
    req.session.destroy(() => {
      res.clearCookie('wid', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' })
      res.json({ ok: true })
    })
  } catch (err) {
    console.error('DELETE /api/me failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
