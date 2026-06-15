import { FormEvent, useState } from 'react'
import { useMutation, useQueryClient } from 'react-query'
import { useTranslation, Trans } from 'react-i18next'
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
  const { t } = useTranslation('settings')
  const { data, isLoading } = useLoan()
  const post = usePostEuribor()

  const [ym, setYm] = useState(currentYm())
  const [valorPct, setValorPct] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)

  if (isLoading) {
    return <div className="card card-pad-lg muted">{t('states.loading', { ns: 'common' })}</div>
  }
  const loans = data?.loans ?? []
  if (loans.length === 0) {
    return (
      <div className="card card-pad-lg muted">
        <Trans i18nKey="euribor.noLoan" ns="settings" components={{ 1: <strong /> }} />
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
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) errs.ym = t('euribor.errYm')
    const v = Number(valorPct)
    if (!Number.isFinite(v) || v < 0) errs.valor = t('euribor.errValue')
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
          <label htmlFor="eur-loan">{t('euribor.loanLabel')}</label>
          <select id="eur-loan" value={loan.id} onChange={(e) => setSelectedLoanId(e.target.value)}>
            {loans.map((l) => <option key={l.loan.id} value={l.loan.id}>{l.loan.name}</option>)}
          </select>
        </div>
      )}
      <p className="muted modal-intro">
        <Trans
          i18nKey="euribor.intro"
          ns="settings"
          values={{ name: loan.name, value: pct(loan.euribor) }}
          components={{ 1: <strong />, 2: <strong /> }}
        />
      </p>

      <form onSubmit={submit} className="account-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="eur-ym">{t('euribor.monthLabel')}</label>
            <input
              id="eur-ym" type="text" placeholder={t('euribor.monthPlaceholder')}
              value={ym} onChange={(e) => setYm(e.target.value)}
              aria-invalid={!!errors.ym}
            />
            {errors.ym && <span className="field-error">{errors.ym}</span>}
          </div>
          <div className="field">
            <label htmlFor="eur-valor">{t('euribor.valueLabel')}</label>
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
            {post.isLoading ? t('states.saving', { ns: 'common' }) : t('euribor.addEntry')}
          </button>
        </div>
      </form>

      <hr className="divider" />

      <h3 className="settings-subhead">{t('euribor.historyHead', { count: history.length })}</h3>
      {history.length === 0 ? (
        <p className="muted">{t('euribor.noEntries')}</p>
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
