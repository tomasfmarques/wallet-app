import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { API_URL } from '@/lib/api'

export function ExportSection() {
  const { user } = useAuth()
  const hasPassword = user?.hasPassword ?? true

  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [fieldErr, setFieldErr] = useState<string | null>(null)

  const download = async (e: React.FormEvent) => {
    e.preventDefault()
    if (hasPassword && !password) { setFieldErr('Introduz a tua password para exportar'); return }
    setBusy(true)
    setErr(null)
    setFieldErr(null)
    try {
      const res = await fetch(`${API_URL}/api/export`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasPassword ? { currentPassword: password } : {}),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const msg = data?.errors?.currentPassword ?? data?.error ?? `Erro ${res.status}`
        if (data?.errors?.currentPassword) { setFieldErr(msg) } else { setErr(msg) }
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const cd = res.headers.get('content-disposition') ?? ''
      const match = /filename="?([^"]+)"?/.exec(cd)
      const filename = match?.[1] ?? `wallet-export-${new Date().toISOString().slice(0, 10)}.json`

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setPassword('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha no download')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card card-pad-lg">
      <p className="muted modal-intro">
        Exporta tudo o que está guardado para um ficheiro JSON: dados do empréstimo,
        pagamentos, amortizações, carteira, reforços e definições. Útil como backup
        ou para inspecionares os teus dados.
      </p>
      <form onSubmit={download} noValidate>
        {hasPassword && (
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="export-pw">Confirma a tua password</label>
            <input
              id="export-pw"
              type="password"
              autoComplete="current-password"
              placeholder="Password atual"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErr}
            />
            {fieldErr && <span className="field-error">{fieldErr}</span>}
          </div>
        )}
        {err && <div className="form-error">{err}</div>}
        <div className="account-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'A preparar…' : 'Descarregar backup (JSON)'}
          </button>
        </div>
      </form>
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        O ficheiro <strong>não</strong> contém a tua password. Mantém-no em segurança
        — inclui detalhes financeiros pessoais.
      </p>
    </div>
  )
}

export default ExportSection
