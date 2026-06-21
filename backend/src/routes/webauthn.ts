import { Router } from 'express'
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'

// WebAuthn (passkey/biometric) for the PIN lock's biometric unlock. Credentials
// are per-device; biometrics requires a PIN to be set first (PIN is the fallback).
const router = Router()
router.use(requireAuth)

// Relying-Party config from the app origin. rpID is the bare host (no scheme/port).
const ORIGIN = process.env.APP_ORIGIN ?? 'http://localhost:5173'
const RP_ID = new URL(ORIGIN).hostname
const RP_NAME = 'Wallet360'

const csvToTransports = (s: string | null): AuthenticatorTransportFuture[] | undefined =>
  s ? (s.split(',') as AuthenticatorTransportFuture[]) : undefined

// ── Registration ────────────────────────────────────────────────
router.post('/register/options', async (req, res) => {
  try {
    const userId = req.session.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) { res.status(401).json({ error: 'Sessão inválida' }); return }
    if (!user.pinHash) { res.status(400).json({ error: 'Define um PIN antes de ativar a biometria.' }); return }

    const creds = await prisma.webAuthnCredential.findMany({ where: { userId } })
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.email,
      userID: new TextEncoder().encode(user.id),
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: creds.map((c) => ({ id: c.credentialId, transports: csvToTransports(c.transports) })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    })
    req.session.webauthnChallenge = options.challenge
    res.json(options)
  } catch (err) {
    console.error('WebAuthn register options failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/register/verify', async (req, res) => {
  const expectedChallenge = req.session.webauthnChallenge
  if (!expectedChallenge) { res.status(400).json({ error: 'Sessão de registo expirada' }); return }
  const { response, deviceName } = req.body ?? {}
  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    })
    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ error: 'Não foi possível verificar a biometria' }); return
    }
    const { credential } = verification.registrationInfo
    await prisma.webAuthnCredential.create({
      data: {
        userId: req.session.userId!,
        credentialId: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ? credential.transports.join(',') : null,
        deviceName: typeof deviceName === 'string' && deviceName.trim()
          ? deviceName.trim().slice(0, 60)
          : null,
      },
    })
    req.session.webauthnChallenge = undefined
    res.json({ ok: true })
  } catch (err) {
    console.error('WebAuthn register verify failed:', err)
    res.status(400).json({ error: 'Falha no registo da biometria' })
  }
})

// ── Authentication (unlock) ──────────────────────────────────────
router.post('/auth/options', async (req, res) => {
  try {
    const creds = await prisma.webAuthnCredential.findMany({ where: { userId: req.session.userId! } })
    if (creds.length === 0) { res.status(400).json({ error: 'Sem biometria registada' }); return }
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: creds.map((c) => ({ id: c.credentialId, transports: csvToTransports(c.transports) })),
      userVerification: 'preferred',
    })
    req.session.webauthnChallenge = options.challenge
    res.json(options)
  } catch (err) {
    console.error('WebAuthn auth options failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

router.post('/auth/verify', async (req, res) => {
  const expectedChallenge = req.session.webauthnChallenge
  if (!expectedChallenge) { res.status(400).json({ error: 'Sessão expirada' }); return }
  const { response } = req.body ?? {}
  try {
    const cred = await prisma.webAuthnCredential.findFirst({
      where: { userId: req.session.userId!, credentialId: response?.id },
    })
    if (!cred) { res.status(400).json({ error: 'Credencial desconhecida' }); return }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: false,
      credential: {
        id: cred.credentialId,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: csvToTransports(cred.transports),
      },
    })
    if (!verification.verified) { res.status(401).json({ error: 'Biometria não verificada' }); return }

    await prisma.webAuthnCredential.update({
      where: { id: cred.id },
      data: { counter: verification.authenticationInfo.newCounter },
    })
    req.session.webauthnChallenge = undefined
    res.json({ ok: true })
  } catch (err) {
    console.error('WebAuthn auth verify failed:', err)
    res.status(401).json({ error: 'Falha na autenticação biométrica' })
  }
})

// ── Manage devices ───────────────────────────────────────────────
router.get('/', async (req, res) => {
  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: req.session.userId! },
    select: { id: true, deviceName: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  res.json({ credentials })
})

router.delete('/:id', async (req, res) => {
  await prisma.webAuthnCredential.deleteMany({ where: { id: req.params.id, userId: req.session.userId! } })
  res.json({ ok: true })
})

export default router
