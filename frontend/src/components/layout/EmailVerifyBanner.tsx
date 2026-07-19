import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/apiError'
import { Icon } from '@/components/ui/Icon'

// Signup email verification nudge (S3/F7). The gate is soft — nothing here
// blocks the app — so this is the only thing telling a user why their digest
// never arrives or why Modo Casal refuses them.
//
// Dismissal is sessionStorage, not localStorage: an unverified address is a
// standing problem, so it should come back next launch rather than be silenced
// for good with one click.
const DISMISS_KEY = 'w360:verifyBannerDismissed'

export function EmailVerifyBanner() {
  const { t, i18n } = useTranslation('nav')
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState('')

  // Demo sandboxes have an unreachable address — nothing to confirm.
  if (!user || user.isDemo || user.emailVerified || dismissed) return null

  const handleResend = async () => {
    setState('sending')
    try {
      await api.post('/api/auth/resend-verification', {
        lang: i18n.resolvedLanguage === 'en' ? 'en' : 'pt',
      })
      setState('sent')
    } catch (err) {
      setError(apiErrorMessage(err))
      setState('error')
    }
  }

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="verify-banner" role="status">
      <span className="demo-banner-text">
        <Icon name="inbox" size={14} />
        {state === 'sent' ? t('verifyBannerSent') : t('verifyBanner')}
        {state === 'error' && ` — ${error}`}
      </span>
      <span className="demo-banner-actions">
        {state !== 'sent' && (
          <button
            type="button"
            className="demo-banner-exit"
            onClick={handleResend}
            disabled={state === 'sending'}
          >
            {state === 'sending' ? t('verifyBannerSending') : t('verifyBannerResend')}
          </button>
        )}
        <button type="button" className="demo-banner-exit" onClick={handleDismiss}>
          {t('verifyBannerDismiss')}
        </button>
      </span>
    </div>
  )
}
