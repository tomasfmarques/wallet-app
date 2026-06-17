import { FormEvent, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { eur, ymToShort, currentYm } from '@/lib/format'
import {
  useAddAmortization,
  useDeleteAmortization,
} from '@/hooks/useLoan'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import type { LoanAmortization } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  amortizations: LoanAmortization[]
  loanId: string
}

// Modal for managing extra amortizations: lists existing ones, lets the user
// add a new one, lets them delete. The Loan page re-fetches automatically on
// success.
export function AmortizationModal({ open, onClose, amortizations, loanId }: Props) {
  const { t } = useTranslation('loan')
  const add = useAddAmortization()
  const del = useDeleteAmortization()

  const [ym, setYm] = useState(currentYm())
  const [valor, setValor] = useState('')
  const [modo, setModo] = useState<'prazo' | 'prestacao'>('prazo')
  const [errors, setErrors] = useState<FieldErrors>({})

  const reset = () => {
    setYm(currentYm())
    setValor('')
    setModo('prazo')
    setErrors({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const clientErrors: FieldErrors = {}
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) clientErrors.ym = t('amort.errYm')
    const v = Number(valor)
    if (!Number.isFinite(v) || v <= 0) clientErrors.valor = t('amort.errValue')
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }
    try {
      await add.mutateAsync({ loanId, ym, valor: v, modo })
      reset()
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  const sorted = [...amortizations].sort((a, b) => a.ym.localeCompare(b.ym))

  return (
    <Modal open={open} onClose={onClose} title={t('amort.title')} maxWidth={560}>
      <p className="muted modal-intro">
        <Trans i18nKey="amort.intro" ns="loan" components={{ 1: <strong />, 3: <strong /> }} />
      </p>

      <form onSubmit={submit} className="amort-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="amort-ym">{t('amort.monthLabel')}</label>
            <input
              id="amort-ym" type="text"
              value={ym} onChange={(e) => setYm(e.target.value)}
              aria-invalid={!!errors.ym}
            />
            {errors.ym && <span className="field-error">{errors.ym}</span>}
          </div>
          <div className="field">
            <label htmlFor="amort-valor">{t('amort.valueLabel')}</label>
            <input
              id="amort-valor" type="number" inputMode="decimal" step="any" min="0"
              value={valor} onChange={(e) => setValor(e.target.value)}
              aria-invalid={!!errors.valor}
            />
            {errors.valor && <span className="field-error">{errors.valor}</span>}
          </div>
          <div className="field">
            <label htmlFor="amort-modo">{t('amort.modeLabel')}</label>
            <select
              id="amort-modo"
              value={modo}
              onChange={(e) => setModo(e.target.value as 'prazo' | 'prestacao')}
            >
              <option value="prazo">{t('amort.modeReducePrazo')}</option>
              <option value="prestacao">{t('amort.modeReducePrestacao')}</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={add.isLoading}>
            {add.isLoading ? t('amort.submitting') : t('amort.submit')}
          </button>
        </div>
      </form>

      <h3 className="section-label">{t('amort.registeredHead', { count: sorted.length })}</h3>
      {sorted.length === 0 ? (
        <p className="muted">{t('amort.empty')}</p>
      ) : (
        <ul className="amort-list">
          {sorted.map((a) => (
            <li key={a.id} className="amort-item">
              <span className="amort-ym">{ymToShort(a.ym)}</span>
              <span className="amort-valor">{eur(a.valor)}</span>
              <span className={`amort-modo ${a.modo === 'prazo' ? 'is-prazo' : 'is-prestacao'}`}>
                {a.modo === 'prazo' ? t('amort.tagReducePrazo') : t('amort.tagReducePrestacao')}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => del.mutate(a.id)}
                disabled={del.isLoading}
                aria-label={t('amort.removeAria', { ym: a.ym })}
              >
                {t('actions.remove', { ns: 'common' })}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

export default AmortizationModal
