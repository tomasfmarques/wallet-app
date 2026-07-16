import { Router, type Request, type Response } from 'express'
import { timingSafeEqual } from 'crypto'
import { fetchAndStoreEuribor } from '../lib/euribor'
import { evaluatePushNotifications } from '../lib/notifications'
import { sendMonthlyDigests } from '../lib/digest'
import { syncAllBankConnections } from './bank'

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

  try {
    const result = await evaluatePushNotifications()
    tasks.push = 'skipped' in result ? `skipped (${result.skipped})` : `ok (${result.sent} sent)`
  } catch (err) {
    console.error('[cron] push task failed:', err)
    tasks.push = `error: ${err instanceof Error ? err.message : 'unknown'}`
  }

  // Bank auto-sync: every linked Enable Banking connection, once a day — the
  // "seamless" path (no manual Sincronizar needed). Dedup in the import
  // pipeline makes it idempotent; one unattended pull/day sits comfortably
  // inside the PSD2 unattended-access allowance. No-op while unconfigured.
  try {
    const { users, imported, skippedUsers } = await syncAllBankConnections()
    tasks.bank = `ok (${users} users, ${imported} imported${skippedUsers ? `, ${skippedUsers} failed` : ''})`
  } catch (err) {
    console.error('[cron] bank sync task failed:', err)
    tasks.bank = `error: ${err instanceof Error ? err.message : 'unknown'}`
  }

  // Monthly digest: day 1 only. `?force=digest` (still Bearer-gated) runs it
  // on any day — for owner testing and for recovering a missed day-1 run.
  if (new Date().getUTCDate() === 1 || req.query.force === 'digest') {
    try {
      const { sent, skipped } = await sendMonthlyDigests()
      tasks.digest = `ok (${sent} sent, ${skipped} skipped)`
    } catch (err) {
      console.error('[cron] digest task failed:', err)
      tasks.digest = `error: ${err instanceof Error ? err.message : 'unknown'}`
    }
  }

  res.json({ ok: true, tasks })
}

router.get('/daily', runDaily)
router.post('/daily', runDaily)

export default router
