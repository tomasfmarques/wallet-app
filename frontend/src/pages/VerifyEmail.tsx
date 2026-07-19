import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from 'react-query'
import { BrandMark } from '@/components/ui/BrandMark'
import { api } from '@/lib/api'
import { apiErrorMessage } from '@/lib/apiError'

// Landing page for the signup confirmation link (S3/F7). Deliberately works
// signed-out: the link is usually opened in whatever browser the mail app hands
// it to, not the one that signed up. The token is the proof, not the session.
export function VerifyEmail() {
  const { t } = useTranslation('auth')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const queryClient = useQueryClient()

  const [state, setState] = useState<'verifying' | 'done' | 'error'>('verifying')
  const [error, setError] = useState('')
  // StrictMode double-invokes effects in dev; the token is single-use, so a
  // second POST would report "invalid link" over an already-successful one.
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true

    api.post('/api/auth/verify-email', { token })
      .then(() => {
        setState('done')
        // If this IS the browser that's signed in, drop the stale
        // emailVerified:false so the banner goes away without a reload.
        queryClient.invalidateQueries(['auth', 'me'])
      })
      .catch((err) => {
        setError(apiErrorMessage(err))
        setState('error')
      })
  }, [token, queryClient])

  const body = () => {
    if (!token) {
      return (
        <>
          <h1 className="auth-title">{t('verify.invalidTitle')}</h1>
          <p className="auth-subtitle">{t('verify.invalidSubtitle')}</p>
        </>
      )
    }
    if (state === 'verifying') {
      return (
        <>
          <h1 className="auth-title">{t('verify.title')}</h1>
          <p className="auth-subtitle" role="status">{t('verify.checking')}</p>
        </>
      )
    }
    if (state === 'done') {
      return (
        <>
          <h1 className="auth-title">{t('verify.doneTitle')}</h1>
          <div className="form-success" role="status">{t('verify.doneMessage')}</div>
        </>
      )
    }
    return (
      <>
        <h1 className="auth-title">{t('verify.errorTitle')}</h1>
        <div className="form-error" role="alert">{error}</div>
        <p className="auth-subtitle">{t('verify.errorHint')}</p>
      </>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand brand-lg">
          <BrandMark size={44} />
          <span className="brand-text">wallet<span className="brand-360">360</span></span>
        </div>
        {body()}
        <p className="auth-footer"><Link to="/overview">{t('verify.openApp')}</Link></p>
      </div>
    </div>
  )
}

export default VerifyEmail
