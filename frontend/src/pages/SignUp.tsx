import { FormEvent, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth, useSignup, fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'

export function SignUp() {
  const { t } = useTranslation('auth')
  const { isAuthenticated, isLoading } = useAuth()
  const signup = useSignup()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  if (!isLoading && isAuthenticated) {
    return <Navigate to="/overview" replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})

    const clientErrors: FieldErrors = {}
    if (name.trim().length < 2) clientErrors.name = t('signUp.errNameShort')
    if (!email.trim()) clientErrors.email = t('signUp.errEmailRequired')
    if (password.length < 8) clientErrors.password = t('signUp.errPasswordShort')
    if (password !== confirm) clientErrors.confirm = t('signUp.errPasswordMismatch')
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    try {
      await signup.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        password,
      })
      navigate('/overview', { replace: true })
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand brand-lg">
          <span className="brand-emoji" aria-hidden>💸</span>
          <span className="brand-text">Wallet<span className="brand-360">360</span></span>
        </div>

        <h1 className="auth-title">{t('signUp.title')}</h1>
        <p className="auth-subtitle">{t('signUp.subtitle')}</p>

        {errors._form && (
          <div className="form-error" role="alert">{errors._form}</div>
        )}

        <GoogleSignInButton text="signup_with" redirectTo="/overview" />
        <AuthDivider />

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="name">{t('signUp.nameLabel')}</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <span id="name-error" className="field-error">{errors.name}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="email">{t('signUp.emailLabel')}</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <span id="email-error" className="field-error">{errors.email}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="password">{t('signUp.passwordLabel')}</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : 'password-hint'}
            />
            {errors.password ? (
              <span id="password-error" className="field-error">{errors.password}</span>
            ) : (
              <span id="password-hint" className="field-hint">{t('signUp.passwordHint')}</span>
            )}
          </div>

          <div className="field">
            <label htmlFor="confirm">{t('signUp.confirmLabel')}</label>
            <input
              id="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={!!errors.confirm}
              aria-describedby={errors.confirm ? 'confirm-error' : undefined}
            />
            {errors.confirm && (
              <span id="confirm-error" className="field-error">{errors.confirm}</span>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={signup.isLoading}
          >
            {signup.isLoading ? t('signUp.submitting') : t('signUp.submit')}
          </button>
        </form>

        <p className="auth-footer">
          {t('signUp.haveAccount')} <Link to="/signin">{t('signUp.signInLink')}</Link>
        </p>
      </div>
    </div>
  )
}

function AuthDivider() {
  const { t } = useTranslation('auth')
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) return null
  return (
    <div className="auth-divider" aria-hidden>
      <span>{t('divider')}</span>
    </div>
  )
}

export default SignUp
