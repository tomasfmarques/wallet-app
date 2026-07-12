import nodemailer from 'nodemailer'
import { createHmac, timingSafeEqual } from 'crypto'
import { notifyText, type Lang } from './notifyCopy'
import type { DigestData } from './digest'

// Outbound email (password reset + the monthly digest).
// Requires SMTP_HOST + SMTP_USER + SMTP_PASS env vars.
// If they are not set, content is printed to the server console instead
// (useful for local dev without an SMTP server).

function buildTransporter() {
  const host = process.env.SMTP_HOST
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!host || !user || !pass) return null
  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  })
}

function appOrigin(): string {
  return process.env.APP_ORIGIN
    ?? (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0]
    ?? 'http://localhost:5173'
}

// ── Digest unsubscribe signature ─────────────────────────────────
// The unsubscribe link works WITHOUT a session (email clients), so it is
// authenticated by an HMAC of the userId under SESSION_SECRET. Constant-time
// verification; forging a sig for another user requires the server secret.
export function digestUnsubscribeSig(userId: string): string {
  return createHmac('sha256', process.env.SESSION_SECRET ?? 'dev-secret-change-me')
    .update(`digest-unsub:${userId}`)
    .digest('hex')
}

export function verifyDigestUnsubscribeSig(userId: string, sig: string): boolean {
  const expected = Buffer.from(digestUnsubscribeSig(userId))
  const got = Buffer.from(sig)
  return got.length === expected.length && timingSafeEqual(got, expected)
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
): Promise<void> {
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@wallet360.pt'
  const transporter = buildTransporter()

  const subject = 'Wallet360 — Recuperação de password'
  const text = `Olá,\n\nRecebemos um pedido para repor a tua password.\n\nCopia o link abaixo para o teu browser:\n${resetLink}\n\nO link expira em 1 hora. Se não pediste a reposição, ignora este email.\n\nWallet360`
  const html = `
<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <p style="font-size:28px;margin:0 0 4px">💸</p>
    <h1 style="font-size:20px;color:#1e293b;margin:0 0 8px">Recuperação de password</h1>
    <p style="color:#475569;margin:0 0 24px">Clica no botão abaixo para definires uma nova password. O link expira em <strong>1 hora</strong>.</p>
    <a href="${resetLink}"
       style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px">
      Repor password
    </a>
    <p style="color:#94a3b8;font-size:12px;margin:24px 0 0">Se não pediste a reposição, ignora este email. O link expira automaticamente.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
    <p style="color:#94a3b8;font-size:11px;margin:0">Wallet360</p>
  </div>
</body>
</html>`

  if (!transporter) {
    // Dev fallback — print to console so the developer can test without SMTP
    console.log('\n── Password reset link (no SMTP configured) ──')
    console.log(resetLink)
    console.log('─────────────────────────────────────────────\n')
    return
  }

  await transporter.sendMail({ from, to, subject, text, html })
}

// Escape user-controlled strings before they land in email HTML — expense/
// category/loan names can originate from bank-statement imports (semi-external
// input), so a name like "<a href=evil>…</a>" must render as text, not markup.
// The plain-text alternative stays unescaped (no HTML context there).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Monthly digest (WS4) ─────────────────────────────────────────
// Email clients need inline styles and can't read CSS custom properties, so
// this is the ONE place hardcoded (light-palette) colours are allowed.
export async function sendMonthlyDigestEmail(
  to: string,
  userId: string,
  lang: Lang,
  data: DigestData,
): Promise<void> {
  const t = (key: string, vars: Record<string, string> = {}) => notifyText(lang, key, vars)
  const locale = lang === 'en' ? 'en-IE' : 'pt-PT'
  const eur = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
  const eur2 = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n)
  const pct = (n: number) => `${(n * 100).toFixed(1)} %`
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${eur(Math.abs(n))}`

  const origin = appOrigin()
  const unsubUrl = `${origin}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&sig=${digestUnsubscribeSig(userId)}`
  const subject = t('digestSubject', { month: data.monthLabel })

  const GREEN = '#2FAA6A', RED = '#D64545', INK = '#0D2740', MUTED = '#64748b'
  const row = (label: string, value: string, color = INK) =>
    `<tr><td style="padding:4px 0;color:${MUTED};font-size:14px">${label}</td><td style="padding:4px 0;text-align:right;font-weight:600;color:${color};font-size:14px">${value}</td></tr>`
  const section = (title: string, inner: string) =>
    `<div style="margin:20px 0 0"><h2 style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin:0 0 6px">${title}</h2>${inner}</div>`

  const parts: string[] = []
  const textParts: string[] = [t('digestTitle', { month: data.monthLabel })]

  if (data.budget) {
    const b = data.budget
    const balColor = b.balance >= 0 ? GREEN : RED
    parts.push(section(t('digestBudgetTitle'), `
      ${b.hasActuals ? '' : `<p style="color:${MUTED};font-size:12px;margin:0 0 6px">${t('digestPlanOnly')}</p>`}
      <table style="width:100%;border-collapse:collapse">
        ${row(t('digestIncome'), eur2(b.incomeReal))}
        ${row(t('digestExpenses'), eur2(b.expensesReal))}
        ${row(t('digestBalance'), signed(b.balance), balColor)}
      </table>
      <p style="color:${MUTED};font-size:12px;margin:6px 0 0">${t('digestVsPlan', { value: signed(b.planNet) })}</p>`))
    textParts.push(`${t('digestBudgetTitle')}: ${t('digestIncome')} ${eur2(b.incomeReal)} · ${t('digestExpenses')} ${eur2(b.expensesReal)} · ${t('digestBalance')} ${signed(b.balance)}`)

    if (b.topCategories.length > 0) {
      parts.push(section(t('digestTopCats'),
        `<table style="width:100%;border-collapse:collapse">${b.topCategories.map((c) => row(escapeHtml(c.name), eur2(c.total))).join('')}</table>`))
      textParts.push(`${t('digestTopCats')}: ${b.topCategories.map((c) => `${c.name} ${eur2(c.total)}`).join(' · ')}`)
    }
  }

  if (data.portfolio) {
    const p = data.portfolio
    parts.push(section(t('digestPortfolioTitle'), `
      <table style="width:100%;border-collapse:collapse">
        ${row(t('digestPortfolioValue'), eur2(p.value))}
        ${row(t('digestPortfolioGain'), signed(p.gain), p.gain >= 0 ? GREEN : RED)}
      </table>`))
    textParts.push(`${t('digestPortfolioTitle')}: ${eur2(p.value)} (${signed(p.gain)})`)
  }

  if (data.loans.length > 0) {
    const lines = data.loans.map((l) => {
      const main = `<p style="margin:4px 0;font-size:14px;color:${INK}">${t('digestLoanLine', {
        name: escapeHtml(l.name), outstanding: eur(l.outstanding), pct: pct(l.pctPaid), payment: eur2(l.nextPayment),
      })}</p>`
      const rev = l.revision
        ? `<p style="margin:2px 0 8px;font-size:12px;color:${l.revision.deltaMonthly > 0 ? RED : GREEN}">${t('digestRevisionLine', {
            ym: l.revision.ym, projected: eur2(l.revision.projectedPayment),
            delta: `${l.revision.deltaMonthly >= 0 ? '+' : '−'}${eur2(Math.abs(l.revision.deltaMonthly))}`,
          })}</p>`
        : ''
      return main + rev
    }).join('')
    parts.push(section(t('digestLoansTitle'), lines))
    textParts.push(...data.loans.map((l) => t('digestLoanLine', {
      name: l.name, outstanding: eur(l.outstanding), pct: pct(l.pctPaid), payment: eur2(l.nextPayment),
    })))
  }

  const html = `
<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#FAF9F7;margin:0;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)">
    <h1 style="font-size:20px;color:${INK};margin:0 0 4px">${t('digestTitle', { month: data.monthLabel })}</h1>
    ${parts.join('')}
    <a href="${origin}" style="display:inline-block;margin:24px 0 0;background:#2F74D8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;font-size:14px">${t('digestOpenApp')}</a>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px">
    <p style="color:#94a3b8;font-size:11px;margin:0">${t('digestFooter')} <a href="${unsubUrl}" style="color:#94a3b8">${t('digestUnsubscribe')}</a></p>
  </div>
</body>
</html>`
  const text = `${textParts.join('\n')}\n\n${t('digestFooter')}\n${t('digestUnsubscribe')}: ${unsubUrl}\n`

  const transporter = buildTransporter()
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@wallet360.pt'
  if (!transporter) {
    // Dev fallback — print instead of sending.
    console.log(`\n── Monthly digest for ${to} (no SMTP configured) ──`)
    console.log(text)
    console.log('────────────────────────────────────────────────\n')
    return
  }
  await transporter.sendMail({ from, to, subject, text, html })
}

// ── Public contact form (landing pages, WS-L7) ───────────────────
// Sends the message to the owner. `replyTo` is the visitor's address so a
// plain reply in the mail client answers them. Same console fallback as the
// other senders when SMTP_* is not configured. Destination overridable via
// CONTACT_TO (D4 in docs/landing-spec.md); defaults to the owner's Gmail
// until a hello@ mailbox exists.
export async function sendContactEmail(
  name: string,
  replyTo: string,
  message: string,
): Promise<void> {
  const transporter = buildTransporter()
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'noreply@wallet360.pt'
  const to = process.env.CONTACT_TO ?? 'fmarques.tomas@gmail.com'
  const subject = `[Wallet360 contacto] ${name}`.slice(0, 120)
  const text = `Nome: ${name}\nEmail: ${replyTo}\n\n${message}`

  if (!transporter) {
    console.log('\n── contact email (SMTP not configured) ─────────')
    console.log(`to: ${to}\nsubject: ${subject}\n${text}`)
    console.log('────────────────────────────────────────────────\n')
    return
  }
  await transporter.sendMail({ from, to, replyTo, subject, text })
}
