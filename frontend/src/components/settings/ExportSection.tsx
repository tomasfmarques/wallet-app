import { useState } from 'react'

export function ExportSection() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const download = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/export', { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Stream the response into a blob and trigger a save dialog
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)

      // Try to honour the server's filename; fall back to a sane default
      const cd = res.headers.get('content-disposition') ?? ''
      const match = /filename="?([^"]+)"?/.exec(cd)
      const filename = match?.[1] ?? `wallet-export-${new Date().toISOString().slice(0,10)}.json`

      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
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
      {err && <div className="form-error">{err}</div>}
      <div className="account-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={download}
          disabled={busy}
        >
          {busy ? 'A preparar…' : 'Descarregar backup (JSON)'}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        O ficheiro <strong>não</strong> contém a tua password. Mantém-no em segurança
        — inclui detalhes financeiros pessoais.
      </p>
    </div>
  )
}

export default ExportSection
