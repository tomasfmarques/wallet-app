import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/lib/api'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Introduz o teu email'); return }
    setLoading(true)
    setError(null)
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erro inesperado')
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

        <h1 className="auth-title">Recuperar password</h1>

        {sent ? (
          <>
            <div className="form-success" role="status">
              Email enviado! Se esse endereço estiver associado a uma conta, receberás um link de recuperação em breve. Verifica também a pasta de spam.
            </div>
            <p className="auth-footer">
              <Link to="/signin">← Voltar ao login</Link>
            </p>
          </>
        ) : (
          <>
            <p className="auth-subtitle">
              Introduz o teu email e enviaremos um link para definires uma nova password.
            </p>
            {error && <div className="form-error" role="alert">{error}</div>}
            <form onSubmit={handleSubmit} noValidate>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="o.teu@email.com"
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
                {loading ? 'A enviar…' : 'Enviar link de recuperação'}
              </button>
            </form>
            <p className="auth-footer">
              Lembras-te da password? <Link to="/signin">Entrar</Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default ForgotPassword
