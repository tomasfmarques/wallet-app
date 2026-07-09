import { Router } from 'express'
import { prisma } from '../lib/prisma'
import { verifyDigestUnsubscribeSig } from '../lib/email'

// ── Email unsubscribe (NO auth — clicked from an email client) ───
// Authenticated by the HMAC sig instead of a session (see lib/email.ts).
// Responds with a tiny standalone HTML page, not JSON — the visitor is a
// person in a browser tab, possibly logged out.

const router = Router()

router.get('/unsubscribe', async (req, res) => {
  const { u, sig } = req.query
  if (typeof u !== 'string' || typeof sig !== 'string' || !u || !sig
      || !verifyDigestUnsubscribeSig(u, sig)) {
    res.status(400).send(page('Link inválido', 'O link de cancelamento é inválido ou expirou.'))
    return
  }
  try {
    // Upsert so unsubscribing works even before any prefs row exists.
    // If the user was deleted meanwhile, the FK create fails → treat as done
    // (there is nobody left to email).
    await prisma.notificationPreference.upsert({
      where: { userId: u },
      create: { userId: u, emailMonthlyDigest: false },
      update: { emailMonthlyDigest: false },
    }).catch(() => {})
    res.send(page('Resumo mensal cancelado', 'Deixas de receber o resumo mensal por email. Podes reativá-lo em Definições → Preferências → Notificações.'))
  } catch (err) {
    console.error('GET /api/email/unsubscribe failed:', err)
    res.status(500).send(page('Erro', 'Não foi possível processar o pedido. Tenta novamente.'))
  }
})

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wallet360 — ${title}</title></head>
<body style="font-family:system-ui,sans-serif;background:#FAF9F7;margin:0;padding:48px 16px">
  <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <h1 style="font-size:18px;color:#0D2740;margin:0 0 8px">${title}</h1>
    <p style="color:#475569;font-size:14px;margin:0">${body}</p>
  </div>
</body></html>`
}

export default router
