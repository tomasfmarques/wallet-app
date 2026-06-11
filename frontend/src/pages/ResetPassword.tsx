import { FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'

export function ResetPassword() {
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
          <h1 className="auth-title">Link inválido</h1>
          <p className="auth-subtitle">Este link de recuperação é inválido ou expirou.</p>
          <p className="auth-footer"><Link to="/forgot-password">Pedir novo link</Link></p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const clientErrors: FieldErrors = {}
    if (newPassword.length < 8) clientErrors.newPassword = 'A password deve ter pelo menos 8 caracteres'
    if (newPassword !== confirm) clientErrors.confirm = 'As passwords não coincidem'
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
            <span className="brand-emoji" aria-hidden>💸</span>
            <span className="brand-text">Wallet<span className="brand-360">360</span></span>
          </div>
          <h1 className="auth-title">Password atualizada!</h1>
          <div className="form-success" role="status">
            A tua password foi alterada com sucesso. Vais ser redirecionado para o login em instantes…
          </div>
          <p className="auth-footer"><Link to="/signin">Entrar agora</Link></p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand brand-lg">
          <span className="brand-emoji" aria-hidden>💸</span>
          <span className="brand-text">Wallet<span className="brand-360">360</span></span>
        </div>

        <h1 className="auth-title">Nova password</h1>
        <p className="auth-subtitle">Escolhe uma nova password para a tua conta.</p>

        {errors._form && <div className="form-error" role="alert">{errors._form}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="new-password">Nova password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={!!errors.newPassword}
            />
            {errors.newPassword && <span className="field-error">{errors.newPassword}</span>}
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirmar password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="Repete a password"
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
            {loading ? 'A guardar…' : 'Definir nova password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ResetPassword
