import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '../lib/prisma'
import { normalizeEmail } from '../lib/normalizeEmail'
import { findUserByEmail } from '../lib/userLookup'
import { isEmailVerified } from '../lib/emailVerification'

const router = Router()

// One client per process — handles caching of Google's public keys internally
const clientId = process.env.GOOGLE_CLIENT_ID
const oauth = clientId ? new OAuth2Client(clientId) : null

// Mirrors routes/auth.ts serializeUser — the response is written straight into
// the frontend's `me` cache, so emailVerified has to travel with it.
function serializeUser(user: {
  id: string; email: string; name: string; createdAt: Date; emailVerifiedAt: Date | null
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    emailVerified: isEmailVerified(user),
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
    const email = normalizeEmail(payload.email)
    const emailVerified = payload.email_verified === true
    const name = payload.name?.trim() || email.split('@')[0]

    // ── Match in order of preference ──────────────────────
    // 1. Existing user with this Google ID  → straight sign-in
    // 2. Existing user with this email AND verified  → auto-link
    // 3. New user                                    → create
    let user = await prisma.user.findUnique({ where: { googleId } })

    if (!user && emailVerified) {
      // findUserByEmail carries the legacy mixed-case fallback — without it, a
      // pre-normalization account stored as "Foo@x.com" would be missed here
      // and a DUPLICATE Google-only user created for the same person.
      const byEmail = await findUserByEmail(payload.email)
      if (byEmail) {
        // Only merge a Google identity into an account that has already PROVEN
        // it owns this address (S3/F7). Google's token proves the person
        // signing in owns the mailbox — it says nothing about who created the
        // account sitting on that address. Without this check, squatting
        // victim@gmail.com with a password signup means inheriting the
        // victim's data the moment they use Google, with the squatter's
        // password still on the account. Accounts predating verification are
        // grandfathered (see lib/emailVerification).
        if (!isEmailVerified(byEmail)) {
          res.status(409).json({
            error: 'Já existe uma conta com este email por confirmar. Abre o link de confirmação que enviámos para a tua caixa de correio e tenta novamente.',
          })
          return
        }
        try {
          user = await prisma.user.update({
            where: { id: byEmail.id },
            data: { googleId },
          })
        } catch {
          // Concurrent request already linked this googleId — re-read the final state
          user = await prisma.user.findUnique({ where: { googleId } })
               ?? await findUserByEmail(payload.email)
        }
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
          // Google asserting email_verified IS the ownership proof — there's
          // nothing for our own verification mail to add.
          emailVerifiedAt: emailVerified ? new Date() : null,
          // passwordHash stays null — they can sign in with Google only
        },
      })
    }

    // Heal accounts that predate verification (or were created from an
    // unverified Google email that has since been confirmed): once Google
    // asserts the address, record the proof instead of leaning on the
    // grandfather cutoff forever.
    if (emailVerified && user.emailVerifiedAt === null) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      })
    }

    req.session.regenerate((regenErr) => {
      if (regenErr) { res.status(500).json({ error: 'Erro de sessão' }); return }
      req.session.userId = user!.id
      res.json({ user: serializeUser(user!) })
    })
  } catch (err) {
    console.error('Google sign-in failed:', err instanceof Error ? err.message : err)
    res.status(401).json({ error: 'Não foi possível validar a sessão Google' })
  }
})

export default router
