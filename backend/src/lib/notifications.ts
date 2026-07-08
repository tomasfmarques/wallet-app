import webpush from 'web-push'
import { prisma } from './prisma'
import { projectRevision } from './euribor'
import { loanPrestacoes, syncedAmount } from './loanSync'
import { notifyText, asLang, type Lang } from './notifyCopy'

// ── Web Push: config gate + sender + daily evaluation ────────────
// Gated on VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (env-gate
// pattern): unconfigured → routes 503, cron evaluation is a no-op.
//
// DEDUP MODEL (no sent-log table): the cron runs ONCE per day and every rule
// below is a deterministic function of the calendar date, so each condition
// is true on exactly one day per cycle — a notification can't double-send
// unless the cron itself runs twice on the same day (Vercel schedules one).

let configured = false

function ensureConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return false
  if (!configured) {
    webpush.setVapidDetails(subject, pub, priv)
    configured = true
  }
  return true
}

export function pushConfigured(): boolean {
  return ensureConfigured()
}

export function vapidPublicKey(): string | null {
  return pushConfigured() ? process.env.VAPID_PUBLIC_KEY! : null
}

interface PushPayload {
  title: string
  body: string
  url: string
}

// Send to every device of a user; prune dead subscriptions (404/410).
async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  await Promise.allSettled(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
      )
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {})
      } else {
        // Terse on purpose — WebPushError carries response headers/body.
        console.error(`[push] send failed for user ${userId}:`, status ?? (err instanceof Error ? err.message : 'unknown'))
      }
    }
  }))
}

const eur0 = (n: number, lang: Lang) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const eur2 = (n: number, lang: Lang) =>
  new Intl.NumberFormat(lang === 'en' ? 'en-IE' : 'pt-PT', { style: 'currency', currency: 'EUR' }).format(n)

function lastDayOfMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate()
}

// ── Daily evaluation (runs from /api/cron/daily) ─────────────────
export async function evaluatePushNotifications(): Promise<{ sent: number } | { skipped: string }> {
  if (!pushConfigured()) return { skipped: 'VAPID not configured' }

  const now = new Date()
  const todayDate = now.getUTCDate()
  const year = now.getUTCFullYear()
  const month1 = now.getUTCMonth() + 1
  const nowYm = `${year}-${String(month1).padStart(2, '0')}`
  const monthEnd = lastDayOfMonth(year, month1)
  let sent = 0

  // Only users who actually have a registered device.
  const subRows = await prisma.pushSubscription.findMany({ select: { userId: true }, distinct: ['userId'] })
  for (const { userId } of subRows) {
    try {
      const [prefs, settings] = await Promise.all([
        prisma.notificationPreference.findUnique({ where: { userId } }),
        prisma.portfolioSettings.findUnique({ where: { userId } }),
      ])
      const lang = asLang(settings?.language)
      const p = prefs ?? { pushPayment: true, pushEuribor: true, pushImportReminder: true }

      // 1) Payment due tomorrow — fixed ACTIVE expenses with a dayOfMonth
      //    (incl. loan-linked prestações; dataInicio has no day, so the linked
      //    expense's dayOfMonth is the only day-of-month the data has).
      //    "Tomorrow" handles month ends: on the last day, tomorrow is day 1.
      if (p.pushPayment) {
        const tomorrowDay = todayDate === monthEnd ? 1 : todayDate + 1
        const dueTomorrow = await prisma.expense.findMany({
          where: { userId, type: 'fixed', active: true, dayOfMonth: tomorrowDay },
        })
        // Loan-linked expenses must quote the LIVE prestação (what the Budget
        // page shows), not the stale stored amount — see lib/loanSync.ts.
        const prest = dueTomorrow.some((e) => e.loanId) ? await loanPrestacoes(userId) : new Map<string, number>()
        for (const e of dueTomorrow) {
          await sendToUser(userId, {
            title: notifyText(lang, 'paymentTitle'),
            body: notifyText(lang, 'paymentBody', { name: e.name, amount: eur2(syncedAmount(e, prest), lang) }),
            url: '/budget',
          })
          sent++
        }
      }

      // 2) Euribor revision — day 1 of the revision month itself, when the
      //    bank's reference average (previous month) is final, so the
      //    projection is at its most accurate.
      if (p.pushEuribor && todayDate === 1) {
        const loans = await prisma.loan.findMany({
          where: { userId, euriborTenor: { not: null } },
          include: { amortizations: true },
        })
        for (const loan of loans) {
          const rev = await projectRevision(loan)
          if (rev && rev.nextRevisionYm === nowYm) {
            await sendToUser(userId, {
              title: notifyText(lang, 'euriborTitle'),
              body: notifyText(lang, 'euriborBody', {
                name: loan.name,
                current: eur2(rev.currentPayment, lang),
                projected: eur2(rev.projectedPayment, lang),
                delta: `${rev.deltaMonthly >= 0 ? '+' : '−'}${eur0(Math.abs(rev.deltaMonthly), lang)}`,
              }),
              url: '/loan',
            })
            sent++
          }
        }
      }

      // 3) Import reminder — day 5, user has imported before but not this month.
      if (p.pushImportReminder && todayDate === 5) {
        const [pastImports, thisMonth] = await Promise.all([
          prisma.expense.count({ where: { userId, source: { not: null } } }),
          prisma.expense.count({ where: { userId, source: { not: null }, startYm: nowYm } }),
        ])
        if (pastImports > 0 && thisMonth === 0) {
          const monthName = new Intl.DateTimeFormat(lang === 'en' ? 'en-IE' : 'pt-PT', { month: 'long' }).format(now)
          await sendToUser(userId, {
            title: notifyText(lang, 'importTitle', { month: monthName }),
            body: notifyText(lang, 'importBody'),
            url: '/budget',
          })
          sent++
        }
      }
    } catch (err) {
      // One user's failure must not starve the rest.
      console.error(`[push] evaluation failed for user ${userId}:`, err)
    }
  }

  return { sent }
}
