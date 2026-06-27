import { FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/components/ui/BrandMark'
import { useAuth, useLogin, useDemoLogin, fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'

interface LocationState {
  from?: string
}

export function SignIn() {
  const { t } = useTranslation('auth')
  const { isAuthenticated, isLoading } = useAuth()
  const login = useLogin()
  const demo = useDemoLogin()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = (location.state as LocationState | null)?.from ?? '/overview'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState<FieldErrors>({})

  // If we already have a session, skip the sign-in screen
  if (!isLoading && isAuthenticated) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})

    // Cheap client-side validation
    const clientErrors: FieldErrors = {}
    if (!email.trim()) clientErrors.email = t('signIn.errEmailRequired')
    if (!password) clientErrors.password = t('signIn.errPasswordRequired')
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    try {
      await login.mutateAsync({ email: email.trim(), password, remember })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand brand-lg">
          <BrandMark size={44} />
          <span className="brand-text">wallet<span className="brand-360">360</span></span>
        </div>

        <h1 className="auth-title">{t('signIn.title')}</h1>
        <p className="auth-subtitle">{t('signIn.subtitle')}</p>

        {errors._form && (
          <div className="form-error" role="alert">{errors._form}</div>
        )}

        <GoogleSignInButton text="signin_with" redirectTo={redirectTo} />
        <AuthDivider />

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">{t('signIn.emailLabel')}</label>
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
            <label htmlFor="password">{t('signIn.passwordLabel')}</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            {errors.password && (
              <span id="password-error" className="field-error">{errors.password}</span>
            )}
            <Link to="/forgot-password" className="field-forgot">{t('signIn.forgot')}</Link>
          </div>

          <label className="field-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>{t('signIn.remember')}</span>
          </label>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={login.isLoading}
          >
            {login.isLoading ? t('signIn.submitting') : t('signIn.submit')}
          </button>
        </form>

        <p className="auth-footer">
          {t('signIn.noAccount')} <Link to="/signup">{t('signIn.createAccount')}</Link>
        </p>

        <p className="auth-demo">
          {t('demo.peek')}{' '}
          <button
            type="button"
            className="linklike"
            disabled={demo.isLoading}
            onClick={async () => {
              try { await demo.mutateAsync(); navigate('/overview', { replace: true }) }
              catch { /* surfaced below */ }
            }}
          >
            {demo.isLoading ? t('demo.loading') : t('demo.try')}
          </button>
        </p>
        {demo.isError && <p className="field-error" style={{ textAlign: 'center' }}>{t('demo.error')}</p>}

        <p className="auth-footer">
          <a href="/privacidade.html">{t('legal.privacy')}</a>
          {' · '}
          <a href="/eliminar-conta.html">{t('legal.deletion')}</a>
        </p>
      </div>
    </div>
  )
}

// Rendered between the Google button and the email/password form, only when
// the Google button is actually visible (controlled via VITE_GOOGLE_CLIENT_ID).
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

export default SignIn
