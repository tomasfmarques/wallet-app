import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuth, useDemoLogin, useDemoReset, useLogout } from '@/hooks/useAuth'

export function DemoSection() {
  const { t } = useTranslation('settings')
  const { user } = useAuth()
  const demo = useDemoLogin()
  const reset = useDemoReset()
  const logout = useLogout()
  const navigate = useNavigate()
  const [resetDone, setResetDone] = useState(false)

  // Already in a demo account → reset / exit controls.
  if (user?.isDemo) {
    return (
      <div className="card card-pad-lg account-card">
        <h3 className="settings-subhead" style={{ marginTop: 0 }}>{t('demo.head')}</h3>
        <p className="muted">{t('demo.activeDesc')}</p>
        <div className="account-actions">
          {resetDone && <span className="save-confirm">{t('demo.resetDone')}</span>}
          <button
            type="button" className="btn btn-ghost" disabled={reset.isLoading}
            onClick={async () => {
              await reset.mutateAsync()
              setResetDone(true); setTimeout(() => setResetDone(false), 2500)
            }}
          >
            {reset.isLoading ? t('demo.resetting') : t('demo.reset')}
          </button>
          <button
            type="button" className="btn btn-primary" disabled={logout.isLoading}
            onClick={async () => { try { await logout.mutateAsync() } finally { navigate('/signin', { replace: true }) } }}
          >
            {t('demo.exit')}
          </button>
        </div>
      </div>
    )
  }

  // Normal account → open a sandbox (replaces the session).
  return (
    <div className="card card-pad-lg account-card">
      <h3 className="settings-subhead" style={{ marginTop: 0 }}>{t('demo.head')}</h3>
      <p className="muted">{t('demo.openDesc')}</p>
      <div className="account-actions">
        <button
          type="button" className="btn btn-ghost" disabled={demo.isLoading}
          onClick={async () => {
            if (!confirm(t('demo.openConfirm'))) return
            try { await demo.mutateAsync(); navigate('/overview', { replace: true }) } catch { /* ignore */ }
          }}
        >
          {demo.isLoading ? t('demo.loading') : t('demo.open')}
        </button>
      </div>
    </div>
  )
}

export default DemoSection
