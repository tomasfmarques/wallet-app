import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'

interface ImportResult {
  ok: true
  summary: {
    loan: boolean
    assets: number
    settingsRestored: boolean
    importedFrom?: 'v1' | 'prototype'
  }
}

function useImport() {
  const qc = useQueryClient()
  return useMutation<ImportResult, ApiError, unknown>(
    (payload) => api.post<ImportResult>('/api/import', payload),
    {
      onSuccess: () => {
        qc.invalidateQueries() // reload everything
      },
    },
  )
}

type Format = 'v1' | 'prototype'

interface Preview {
  json: unknown
  name: string
  sizeKb: number
  format: Format
  summary: {
    hasLoan: boolean
    assets: number
    payments: number
    amortizations: number
  }
}

// Detect which backup format a file is in. Returns null if unrecognized.
function detectFormat(json: Record<string, unknown>): Format | null {
  const meta = json.meta as { schemaVersion?: number } | undefined
  if (meta && meta.schemaVersion === 1) return 'v1'

  // Prototype heuristics: no `meta`, but presence of any of the prototype's
  // distinctive field names or short asset field names.
  if (!meta) {
    if ('amortizacoes' in json || 'euriborHist' in json) return 'prototype'
    const port = json.portfolio as { assets?: unknown[] } | undefined
    if (port && Array.isArray(port.assets) && port.assets.length > 0) {
      const first = port.assets[0] as Record<string, unknown>
      if ('tk' in first || ('m' in first && !('monthly' in first))) {
        return 'prototype'
      }
    }
  }
  return null
}

function summarize(json: Record<string, unknown>, format: Format): Preview['summary'] {
  if (format === 'v1') {
    const loan = json.loan as { payments?: unknown[]; amortizations?: unknown[] } | null
    const portfolio = json.portfolio as { assets?: unknown[] } | undefined
    return {
      hasLoan: !!loan,
      assets: portfolio?.assets?.length ?? 0,
      payments: loan?.payments?.length ?? 0,
      amortizations: loan?.amortizations?.length ?? 0,
    }
  }
  // prototype
  const loanObj = json.loan as Record<string, unknown> | null | undefined
  const paymentsMap = (json.payments ?? {}) as Record<string, unknown>
  const amortizacoes = (json.amortizacoes ?? []) as unknown[]
  const portfolio = json.portfolio as { assets?: unknown[] } | undefined
  return {
    hasLoan: !!loanObj && Object.keys(loanObj).length > 0,
    assets: portfolio?.assets?.length ?? 0,
    payments: Object.keys(paymentsMap).length,
    amortizations: amortizacoes.length,
  }
}

export function ImportSection() {
  const fileInput = useRef<HTMLInputElement>(null)
  const importMut = useImport()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<ImportResult['summary'] | null>(null)

  const reset = () => {
    setPreview(null); setConfirmed(false); setErr(null); setDone(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErr(null); setDone(null)
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const json = JSON.parse(text) as Record<string, unknown>
      const format = detectFormat(json)
      if (!format) {
        setErr('Ficheiro inválido — não parece ser um backup WALLET nem um export do protótipo.')
        return
      }
      setPreview({
        json,
        name: file.name,
        sizeKb: Math.round(file.size / 1024),
        format,
        summary: summarize(json, format),
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro a ler o ficheiro')
    }
  }

  const runImport = async () => {
    if (!preview || !confirmed) return
    setErr(null)
    try {
      const result = await importMut.mutateAsync(preview.json)
      setDone(result.summary)
      reset()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha no import')
    }
  }

  return (
    <div className="card card-pad-lg">
      <p className="muted modal-intro">
        Restaura um backup JSON anterior. Tudo o que está atualmente guardado
        (empréstimo, carteira, configurações) <strong>vai ser substituído</strong>
        pelos dados do ficheiro. A conta (email, password) não é tocada.
        Aceita tanto exports WALLET v1 como o JSON do protótipo Claude Design.
      </p>

      {err && <div className="form-error">{err}</div>}
      {done && (
        <div className="form-success">
          ✓ Importado com sucesso ({done.importedFrom === 'prototype' ? 'protótipo' : 'WALLET v1'}):
          empréstimo {done.loan ? 'sim' : 'não'}, {done.assets} ativo(s),
          configurações {done.settingsRestored ? 'restauradas' : '—'}.
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        onChange={onFileChosen}
        style={{ marginBottom: 14 }}
      />

      {preview && (
        <div className="import-preview">
          <h3 className="settings-subhead">Pré-visualização</h3>
          <ul>
            <li>Ficheiro: <strong>{preview.name}</strong> ({preview.sizeKb} KB)</li>
            <li>Formato: <strong>{preview.format === 'prototype' ? 'Protótipo (Claude Design)' : 'WALLET v1'}</strong></li>
            <li>Empréstimo: {preview.summary.hasLoan ? 'presente' : 'ausente'}</li>
            <li>Pagamentos: {preview.summary.payments}</li>
            <li>Amortizações: {preview.summary.amortizations}</li>
            <li>Ativos: {preview.summary.assets}</li>
          </ul>
          <label className="checkbox" style={{ marginTop: 12 }}>
            <input
              type="checkbox" checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>Confirmo que quero substituir todos os meus dados atuais.</span>
          </label>
          <div className="account-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Cancelar
            </button>
            <button
              type="button" className="btn btn-primary"
              onClick={runImport}
              disabled={!confirmed || importMut.isLoading}
            >
              {importMut.isLoading ? 'A importar…' : 'Importar e substituir'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImportSection
