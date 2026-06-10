import { FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { api, ApiError } from '@/lib/api'
import { useLoan, LOAN_KEY } from '@/hooks/useLoan'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { currentYm, pct, ymToShort } from '@/lib/format'
import type { EuriborHistory } from '@/types'

// Locally-defined mutation since the existing useLoan hook didn't expose this one.
// Backend endpoint already exists (POST /api/loan/euribor) since Phase 2A.
interface EuriborInput { loanId: string; valor: number; ym?: string }
function usePostEuribor() {
  const qc = useQueryClient()
  return useMutation<{ entry: EuriborHistory }, ApiError, EuriborInput>(
    ({ loanId, ...input }) => api.post<{ entry: EuriborHistory }>(`/api/loan/${loanId}/euribor`, input),
    { onSuccess: () => { qc.invalidateQueries(LOAN_KEY) } },
  )
}

export function EuriborSection() {
  const { data, isLoading } = useLoan()
  const post = usePostEuribor()

  const [ym, setYm] = useState(currentYm())
  const [valorPct, setValorPct] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)

  if (isLoading) {
    return <div className="card card-pad-lg muted">A carregar…</div>
  }
  const loans = data?.loans ?? []
  if (loans.length === 0) {
    return (
      <div className="card card-pad-lg muted">
        Configura primeiro um crédito (separador <strong>Crédito</strong>)
        para poderes editar o histórico da Euribor.
      </div>
    )
  }

  const selected = loans.find((l) => l.loan.id === selectedLoanId) ?? loans[0]
  const loan = selected.loan
  const history = [...loan.euriborHistory].sort((a, b) => b.ym.localeCompare(a.ym))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const errs: FieldErrors = {}
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) errs.ym = 'Formato AAAA-MM'
    const v = Number(valorPct)
    if (!Number.isFinite(v) || v < 0) errs.valor = '≥ 0'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }

    try {
      await post.mutateAsync({ loanId: loan.id, valor: v / 100, ym })
      setValorPct('')
      setYm(currentYm())
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <div className="card card-pad-lg">
      {loans.length > 1 && (
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="eur-loan">Crédito</label>
          <select id="eur-loan" value={loan.id} onChange={(e) => setSelectedLoanId(e.target.value)}>
            {loans.map((l) => <option key={l.loan.id} value={l.loan.id}>{l.loan.name}</option>)}
          </select>
        </div>
      )}
      <p className="muted modal-intro">
        A Euribor atual de <strong>{loan.name}</strong> é <strong>{pct(loan.euribor)}</strong>.
        Adicionar uma nova entrada também atualiza este valor.
      </p>

      <form onSubmit={submit} className="account-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="eur-ym">Mês</label>
            <input
              id="eur-ym" type="text" placeholder="AAAA-MM"
              value={ym} onChange={(e) => setYm(e.target.value)}
              aria-invalid={!!errors.ym}
            />
            {errors.ym && <span className="field-error">{errors.ym}</span>}
          </div>
          <div className="field">
            <label htmlFor="eur-valor">Valor (%)</label>
            <input
              id="eur-valor" type="number" inputMode="decimal" step="any" min="0"
              value={valorPct} onChange={(e) => setValorPct(e.target.value)}
              aria-invalid={!!errors.valor}
            />
            {errors.valor && <span className="field-error">{errors.valor}</span>}
          </div>
        </div>
        <div className="account-actions">
          <button type="submit" className="btn btn-primary" disabled={post.isLoading}>
            {post.isLoading ? 'A guardar…' : 'Adicionar entrada'}
          </button>
        </div>
      </form>

      <hr className="divider" />

      <h3 className="settings-subhead">Histórico ({history.length})</h3>
      {history.length === 0 ? (
        <p className="muted">Ainda sem entradas.</p>
      ) : (
        <ul className="euribor-list">
          {history.map((h) => (
            <li key={h.id} className="euribor-row">
              <span className="euribor-ym">{ymToShort(h.ym)}</span>
              <span className="euribor-valor">{pct(h.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default EuriborSection
