import nodemailer from 'nodemailer'

// Sends a password-reset email.
// Requires SMTP_HOST + SMTP_USER + SMTP_PASS env vars.
// If they are not set, the link is printed to the server console instead
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
