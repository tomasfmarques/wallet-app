import { FormEvent, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { BrandMark } from '@/components/ui/BrandMark'
import { useAuth, useSignup, fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'

interface LocationState {
  from?: string
}

export function SignUp() {
  const { t } = useTranslation('auth')
  const { isAuthenticated, isLoading } = useAuth()
  const signup = useSignup()
  const navigate = useNavigate()
  const location = useLocation()
  // Same contract as SignIn: an intended destination (e.g. a household invite
  // link /casal/aceitar?token=…) survives the sign-UP round-trip too — the
  // realistic invite case is a partner with no account yet.
  const redirectTo = (location.state as LocationState | null)?.from ?? '/overview'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  if (!isLoading && isAuthenticated) {
    return <Navigate to={redirectTo} replace />
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

        <h1 className="auth-title">{t('signUp.title')}</h1>
        <p className="auth-subtitle">{t('signUp.subtitle')}</p>

        {errors._form && (
          <div className="form-error" role="alert">{errors._form}</div>
        )}

        <GoogleSignInButton text="signup_with" redirectTo={redirectTo} />
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
          <Trans i18nKey="legal.consent" ns="auth" components={{ 1: <Link to="/privacidade" /> }} />
        </p>

        <p className="auth-footer">
          {t('signUp.haveAccount')} <Link to="/signin" state={location.state}>{t('signUp.signInLink')}</Link>
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
