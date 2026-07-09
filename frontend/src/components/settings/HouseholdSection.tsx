import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useHousehold, useCreateHousehold, useCreateInvite, useLeaveHousehold } from '@/hooks/useHousehold'
import { apiErrorMessage } from '@/lib/apiError'

// ── Modo Casal (Settings → Conta) ────────────────────────────────
// Create the household, mint/copy the single-use invite link, see the
// partner, leave. Aggregate-only sharing — the intro copy says exactly what
// the partner will and won't see.

export function HouseholdSection() {
  const { t } = useTranslation('household')
  const { data, isLoading } = useHousehold()
  const create = useCreateHousehold()
  const invite = useCreateInvite()
  const leave = useLeaveHousehold()
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return null
  const household = data?.household ?? null
  const partner = household?.members.find((m) => !m.isMe) ?? null

  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try { await fn() } catch (err) { setError(apiErrorMessage(err)) }
  }

  const mintInvite = () => run(async () => {
    const { link } = await invite.mutateAsync()
    setLink(link)
    setCopied(false)
  })

  const copyLink = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch { /* clipboard blocked — the link is selectable below */ }
  }

  const onLeave = () => {
    if (!confirm(t('settings.leaveConfirm'))) return
    setLink(null)
    void run(() => leave.mutateAsync())
  }

  return (
    <div className="card card-pad-lg">
      <p className="muted modal-intro">{t('settings.intro')}</p>
      {error && <div className="form-error" role="alert">{error}</div>}

      {!household ? (
        <button type="button" className="btn btn-primary" disabled={create.isLoading} onClick={() => run(() => create.mutateAsync())}>
          {t('settings.create')}
        </button>
      ) : (
        <>
          {partner ? (
            <p style={{ margin: '0 0 12px', fontWeight: 600 }}>{t('settings.partner', { name: partner.name })}</p>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 12px' }}>{t('settings.waiting')}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={invite.isLoading} onClick={mintInvite}>
                  {t('settings.invite')}
                </button>
                {link && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}>
                    {copied ? t('settings.copied') : t('settings.copy')}
                  </button>
                )}
              </div>
              {link && (
                <>
                  {/* readOnly input: one-tap select-all beats manual selection
                      of a long URL, especially on mobile. */}
                  <input
                    readOnly value={link}
                    onFocus={(e) => e.target.select()}
                    style={{ width: '100%', fontSize: 12, marginBottom: 6 }}
                    aria-label={t('settings.invite')}
                  />
                  <p className="field-hint" style={{ margin: 0 }}>{t('settings.inviteHint')}</p>
                </>
              )}
            </>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {partner && (
              <Link to="/casal" className="btn btn-primary btn-sm">{t('settings.open')}</Link>
            )}
            <button type="button" className="btn btn-ghost btn-sm" disabled={leave.isLoading} onClick={onLeave}>
              {t('settings.leave')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default HouseholdSection
