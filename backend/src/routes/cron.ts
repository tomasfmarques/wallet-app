import { Router, type Request, type Response } from 'express'
import { timingSafeEqual } from 'crypto'
import { fetchAndStoreEuribor } from '../lib/euribor'

// ── Daily cron dispatcher ────────────────────────────────────────
// Vercel Cron (see vercel.json "crons") GETs /api/cron/daily once a day; the
// same handler accepts POST for manual triggering via curl. Gated on
// CRON_SECRET (Bearer): unset → 503 and nothing runs (env-gate pattern).
// Each task runs in its own try/catch — one failure must not starve the rest.
// New scheduled work (push notifications, monthly digest) plugs in here.

const router = Router()

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const got = Buffer.from(req.headers.authorization ?? '')
  return got.length === expected.length && timingSafeEqual(got, expected)
}

async function runDaily(req: Request, res: Response): Promise<void> {
  if (!process.env.CRON_SECRET) {
    res.status(503).json({ error: 'CRON_SECRET não configurado' })
    return
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'Não autorizado' })
    return
  }

  const tasks: Record<string, string> = {}

  try {
    const { upserted } = await fetchAndStoreEuribor()
    tasks.euribor = `ok (${upserted} rows)`
  } catch (err) {
    console.error('[cron] euribor task failed:', err)
    tasks.euribor = `error: ${err instanceof Error ? err.message : 'unknown'}`
  }

  // WS3 (push notifications) and WS4 (monthly digest, day-1 only) plug in
  // here as further try/catch blocks.

  res.json({ ok: true, tasks })
}

router.get('/daily', runDaily)
router.post('/daily', runDaily)

export default router
