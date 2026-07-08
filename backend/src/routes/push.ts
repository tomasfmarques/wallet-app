import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { pushConfigured, vapidPublicKey } from '../lib/notifications'

// ── Web Push subscriptions + notification preferences ────────────
// Gated on the VAPID env vars (see lib/notifications.ts): /vapid-key returns
// 503 when unconfigured and the Settings UI hides the whole section.

const router = Router()
router.use(requireAuth)

// GET /api/push/vapid-key — the public key the browser needs to subscribe.
// Served from the API (not a build-time env) so no frontend rebuild is needed.
router.get('/vapid-key', (_req, res) => {
  if (!pushConfigured()) {
    res.status(503).json({ error: 'Notificações não configuradas no servidor' })
    return
  }
  res.json({ key: vapidPublicKey() })
})

// POST /api/push/subscribe — store/refresh this device's push subscription.
router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body ?? {}
  const p256dh = keys?.p256dh
  const auth = keys?.auth
  if (
    typeof endpoint !== 'string' || endpoint.length < 10 || endpoint.length > 2000 ||
    !endpoint.startsWith('https://') ||
    typeof p256dh !== 'string' || p256dh.length > 300 ||
    typeof auth !== 'string' || auth.length > 100
  ) {
    res.status(400).json({ error: 'Subscrição inválida' })
    return
  }
  try {
    const userId = req.session.userId!
    // Upsert by endpoint: a re-subscribe on the same browser refreshes keys;
    // an endpoint that changed hands (browser profile reset) moves owner.
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { userId, endpoint, p256dh, auth },
      update: { userId, p256dh, auth },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/push/subscribe failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// DELETE /api/push/subscribe — remove this device's subscription.
router.delete('/subscribe', async (req, res) => {
  const { endpoint } = req.body ?? {}
  if (typeof endpoint !== 'string' || !endpoint) {
    res.status(400).json({ error: 'Endpoint em falta' })
    return
  }
  try {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: req.session.userId! },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/push/subscribe failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// GET /api/push/prefs — read (creating defaults on first touch).
router.get('/prefs', async (req, res) => {
  try {
    const userId = req.session.userId!
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    })
    // Endpoints are returned so the client can check whether the BROWSER's
    // local subscription belongs to THIS account — on a shared device, a
    // previous user's subscription must not read as "already subscribed".
    const subs = await prisma.pushSubscription.findMany({
      where: { userId }, select: { endpoint: true },
    })
    res.json({
      prefs: {
        pushPayment: prefs.pushPayment,
        pushEuribor: prefs.pushEuribor,
        pushImportReminder: prefs.pushImportReminder,
        emailMonthlyDigest: prefs.emailMonthlyDigest,
      },
      devices: subs.length,
      endpoints: subs.map((s) => s.endpoint),
    })
  } catch (err) {
    console.error('GET /api/push/prefs failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// PUT /api/push/prefs — update any subset of the switches.
router.put('/prefs', async (req, res) => {
  const body = req.body ?? {}
  const patch: Record<string, boolean> = {}
  for (const k of ['pushPayment', 'pushEuribor', 'pushImportReminder', 'emailMonthlyDigest'] as const) {
    if (typeof body[k] === 'boolean') patch[k] = body[k]
  }
  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: 'Nada para atualizar' })
    return
  }
  try {
    const userId = req.session.userId!
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...patch },
      update: patch,
    })
    res.json({
      prefs: {
        pushPayment: prefs.pushPayment,
        pushEuribor: prefs.pushEuribor,
        pushImportReminder: prefs.pushImportReminder,
        emailMonthlyDigest: prefs.emailMonthlyDigest,
      },
    })
  } catch (err) {
    console.error('PUT /api/push/prefs failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
