import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '../lib/prisma'

const router = Router()

// One client per process — handles caching of Google's public keys internally
const clientId = process.env.GOOGLE_CLIENT_ID
const oauth = clientId ? new OAuth2Client(clientId) : null

function serializeUser(user: {
  id: string; email: string; name: string; createdAt: Date
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  }
}

// ── POST /api/auth/google ─────────────────────────────────────────
// Verifies a Google ID token (JWT) sent from the frontend's GIS button.
// Matches user by googleId first, then auto-links by verified email,
// otherwise creates a new user. Sets the session cookie on success.
router.post('/', async (req, res) => {
  if (!oauth || !clientId) {
    res.status(503).json({
      error: 'Sign in with Google não está configurado. Define GOOGLE_CLIENT_ID no servidor.',
    })
    return
  }

  const { credential } = req.body ?? {}
  if (typeof credential !== 'string' || credential.length < 50) {
    res.status(400).json({ error: 'Credencial em falta ou inválida' })
    return
  }

  try {
    const ticket = await oauth.verifyIdToken({
      idToken: credential,
      audience: clientId,
    })
    const payload = ticket.getPayload()
    if (!payload || !payload.sub || !payload.email) {
      res.status(401).json({ error: 'Token Google inválido' })
      return
    }

    const googleId = payload.sub
    const email = payload.email.toLowerCase()
    const emailVerified = payload.email_verified === true
    const name = payload.name?.trim() || email.split('@')[0]

    // ── Match in order of preference ──────────────────────
    // 1. Existing user with this Google ID  → straight sign-in
    // 2. Existing user with this email AND verified  → auto-link
    // 3. New user                                    → create
    let user = await prisma.user.findUnique({ where: { googleId } })

    if (!user && emailVerified) {
      const byEmail = await prisma.user.findUnique({ where: { email } })
      if (byEmail) {
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { googleId },
        })
      }
    }

    if (!user) {
      // Last resort: brand new user. Without verified email we'd still trust
      // Google's "sub" as a unique identifier, but if the email isn't verified
      // we refuse to use it for any future linking.
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          name,
          // passwordHash stays null — they can sign in with Google only
        },
      })
    }

    req.session.userId = user.id
    res.json({ user: serializeUser(user) })
  } catch (err) {
    console.error('Google sign-in failed:', err instanceof Error ? err.message : err)
    res.status(401).json({ error: 'Não foi possível validar a sessão Google' })
  }
})

export default router
