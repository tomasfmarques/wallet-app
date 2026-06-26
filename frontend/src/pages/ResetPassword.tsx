import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/components/ui/BrandMark'
import { api } from '@/lib/api'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'

export function ResetPassword() {
  const { t } = useTranslation('auth')
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()

  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  if (!token) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-title">{t('reset.invalidTitle')}</h1>
          <p className="auth-subtitle">{t('reset.invalidSubtitle')}</p>
          <p className="auth-footer"><Link to="/forgot-password">{t('reset.requestNew')}</Link></p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const clientErrors: FieldErrors = {}
    if (newPassword.length < 8) clientErrors.newPassword = t('reset.errPasswordShort')
    if (newPassword !== confirm) clientErrors.confirm = t('reset.errPasswordMismatch')
    if (Object.keys(clientErrors).length > 0) { setErrors(clientErrors); return }

    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', { token, newPassword })
      setDone(true)
      setTimeout(() => navigate('/signin', { replace: true }), 3000)
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand brand-lg">
            <BrandMark size={44} />
            <span className="brand-text">wallet<span className="brand-360">360</span></span>
          </div>
          <h1 className="auth-title">{t('reset.doneTitle')}</h1>
          <div className="form-success" role="status">
            {t('reset.doneMessage')}
          </div>
          <p className="auth-footer"><Link to="/signin">{t('reset.signInNow')}</Link></p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand brand-lg">
          <BrandMark size={44} />
          <span className="brand-text">wallet<span className="brand-360">360</span></span>
        </div>

        <h1 className="auth-title">{t('reset.title')}</h1>
        <p className="auth-subtitle">{t('reset.subtitle')}</p>

        {errors._form && <div className="form-error" role="alert">{errors._form}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="new-password">{t('reset.newLabel')}</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder={t('reset.newPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={!!errors.newPassword}
            />
            {errors.newPassword && <span className="field-error">{errors.newPassword}</span>}
          </div>
          <div className="field">
            <label htmlFor="confirm-password">{t('reset.confirmLabel')}</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder={t('reset.confirmPlaceholder')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm}
            />
            {errors.confirm && <span className="field-error">{errors.confirm}</span>}
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? t('reset.submitting') : t('reset.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ResetPassword
