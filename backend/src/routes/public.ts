import { Router } from 'express'
import { latestEuribor } from '../lib/euribor'
import { sendContactEmail } from '../lib/email'
import { hit } from '../lib/kvStore'

// ── Public, session-free endpoints for the marketing/tools pages ──
// (docs/landing-spec.md WS-L4). Deliberately tiny: the simulators run fully
// client-side; the ONLY things the anonymous pages may ask the server are
// (a) current Euribor rates — public market data — and (b) the contact form.
// NOTHING here persists anonymous-visitor data; that is the privacy promise
// the landing makes ("os teus ficheiros são lidos no teu browser").

const router = Router()

// ── GET /api/public/euribor ──────────────────────────────────────
// Latest cron-fed Euribor per tenor. Cacheable: rates change monthly-ish and
// the daily cron refreshes at 06:00 UTC, so 1h public caching is safe.
router.get('/euribor', async (_req, res) => {
  try {
    const [r3, r6, r12] = await Promise.all([
      latestEuribor('3m'), latestEuribor('6m'), latestEuribor('12m'),
    ])
    res.set('Cache-Control', 'public, max-age=3600')
    res.json({
      rate3m: r3?.value ?? null,
      rate6m: r6?.value ?? null,
      rate12m: r12?.value ?? null,
      asOf: r12?.month ?? r6?.month ?? r3?.month ?? null,
    })
  } catch (err) {
    console.error('GET /api/public/euribor failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/public/contact ─────────────────────────────────────
// Landing/tool-page contact form. Honeypot field silently accepted-and-dropped
// (bots fill it; humans never see it). Rate-limited per IP via kvStore — real
// cross-instance limiting once Upstash is configured, per-instance until then
// (acceptable for a contact form; see landing-spec WS-L4 note).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CONTACT_LIMIT = 3
const CONTACT_WINDOW_MS = 60 * 60 * 1000 // 1h

router.post('/contact', async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : ''
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().slice(0, 120) : ''
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : ''
    const honeypot = typeof req.body?.website === 'string' ? req.body.website : ''

    // Bot filled the invisible field → pretend success, send nothing.
    if (honeypot) { res.json({ ok: true }); return }

    if (!name || !message || !EMAIL_RE.test(email)) {
      res.status(400).json({ error: 'Preenche nome, email válido e mensagem.' }); return
    }

    const { count, resetAt } = await hit(`contact:${req.ip}`, CONTACT_WINDOW_MS)
    if (count > CONTACT_LIMIT) {
      res.set('Retry-After', Math.ceil((resetAt - Date.now()) / 1000).toString())
      res.status(429).json({ error: 'Demasiadas mensagens — tenta novamente mais tarde.' }); return
    }

    await sendContactEmail(name, email, message)
    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/public/contact failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
