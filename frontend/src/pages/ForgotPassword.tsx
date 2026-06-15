import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '@/lib/api'

export function ForgotPassword() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError(t('forgot.errEmailRequired')); return }
    setLoading(true)
    setError(null)
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('forgot.errUnexpected'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand brand-lg">
          <span className="brand-emoji" aria-hidden>💸</span>
          <span className="brand-text">Wallet<span className="brand-360">360</span></span>
        </div>

        <h1 className="auth-title">{t('forgot.title')}</h1>

        {sent ? (
          <>
            <div className="form-success" role="status">
              {t('forgot.sent')}
            </div>
            <p className="auth-footer">
              <Link to="/signin">{t('forgot.backToLogin')}</Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              {t('forgot.subtitle')}
            </p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="email">{t('forgot.emailLabel')}</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('forgot.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!error}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
              >
                {loading ? t('forgot.submitting') : t('forgot.submit')}
              </button>
            </form>
            <p className="auth-footer">
              {t('forgot.remember')} <Link to="/signin">{t('forgot.signInLink')}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default ForgotPassword
