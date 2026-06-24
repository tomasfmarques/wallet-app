import { FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import {
  useAddIncome, useUpdateIncome, type IncomeInput,
} from '@/hooks/useBudget'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { inferCategory, categoryLabel, INCOME_CATEGORIES } from '@/lib/categoryDictionary'
import { eur2 } from '@/lib/format'
import { FREQUENCIES, asFrequency, toMonthly, fromMonthly, type Frequency } from '@/lib/budgetFrequency'
import type { Income, ExpenseType } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  type: ExpenseType   // 'fixed' or 'variable' — locked when adding
  income?: Income
  defaultStartYm?: string  // prefill month when adding a variable from a month tab
}

export function IncomeModal({ open, onClose, type, income, defaultStartYm }: Props) {
  const { t } = useTranslation('budget')
  const add = useAddIncome()
  const upd = useUpdateIncome()
  const isEdit = !!income

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [autoSuggested, setAutoSuggested] = useState(false)
  const [startYm, setStartYm] = useState('')
  const [endYm, setEndYm] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [matchHint, setMatchHint] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [errors, setErrors] = useState<FieldErrors>({})
  const userPickedCategory = useRef(false)

  useEffect(() => {
    if (!open) return
    setName(income?.name ?? '')
    const freq = asFrequency(income?.frequency)
    setFrequency(freq)
    // The field holds the per-PERIOD amount; `amount` is stored as monthly-equiv.
    setAmount(income ? String(Math.round(fromMonthly(income.amount, freq) * 100) / 100) : '')
    setCategory(income?.category ?? '')
    setAutoSuggested(false)
    setStartYm(income?.startYm ?? defaultStartYm ?? '')
    setEndYm(income?.endYm ?? '')
    setNotes(income?.notes ?? '')
    setActive(income?.active ?? true)
    setMatchHint(income?.matchHint ?? '')
    setErrors({})
    userPickedCategory.current = !!income?.category  // don't overwrite an existing category
  }, [open, income, defaultStartYm])

  // Auto-suggest category as the user types the name (only while the user
  // hasn't manually picked a category for this entry).
  useEffect(() => {
    if (userPickedCategory.current) return
    const inferred = inferCategory(name)
    if (inferred) {
      setCategory(inferred)
      setAutoSuggested(true)
    } else {
      setCategory('')
      setAutoSuggested(false)
    }
  }, [name])

  const onCategoryChange = (v: string) => {
    userPickedCategory.current = true
    setCategory(v)
    setAutoSuggested(false)
  }

  const effectiveType: ExpenseType = income?.type ?? type

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: FieldErrors = {}
    if (!name.trim()) errs.name = t('income.errRequired')
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) errs.amount = t('income.errGt0')
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    const freq: Frequency = effectiveType === 'fixed' ? frequency : 'monthly'
    const body: IncomeInput = {
      name: name.trim(), amount: toMonthly(n, freq), frequency: freq, type: effectiveType,
      category: category.trim() || null,
      startYm: startYm.trim() || null,
      // Variable = one-off → scope it to a single month (endYm = startYm).
      endYm: effectiveType === 'variable' ? (startYm.trim() || null) : (endYm.trim() || null),
      notes: notes.trim() || null,
      active,
      matchHint: effectiveType === 'fixed' ? (matchHint.trim() || null) : null,
    }
    try {
      if (isEdit && income) await upd.mutateAsync({ id: income.id, patch: body })
      else await add.mutateAsync(body)
      onClose()
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  const busy = add.isLoading || upd.isLoading

  return (
    <Modal open={open} onClose={onClose} title={t('income.title', { action: isEdit ? t('kind.edit') : t('kind.new'), kind: effectiveType === 'fixed' ? t('kind.fixedF') : t('kind.variableF') })} maxWidth={520}>
      <form onSubmit={submit} className="amort-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="in-name">{t('income.nameLabel')}</label>
            <input id="in-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder={t('income.namePlaceholder')} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="in-amount">{effectiveType === 'fixed' ? t('freq.amountLabel', { unit: t(`freq.unit.${frequency}`) }) : t('income.amountLabel')}</label>
            <input
              id="in-amount" type="number" inputMode="decimal" step="any" min="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
            {errors.amount && <span className="field-error">{errors.amount}</span>}
            {effectiveType === 'fixed' && frequency !== 'monthly' && Number(amount) > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>{t('freq.monthlyEquiv', { value: eur2(toMonthly(Number(amount), frequency)) })}</span>
            )}
          </div>
          {effectiveType === 'fixed' && (
            <div className="field">
              <label htmlFor="in-freq">{t('freq.label')}</label>
              <select id="in-freq" value={frequency} onChange={(e) => setFrequency(asFrequency(e.target.value))}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{t(`freq.${f}`)}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="in-category">
              {t('income.categoryLabel')}
              {autoSuggested && <span className="auto-pill" title={t('income.autoSuggestedTitle')}>{t('income.autoSuggestedPill')}</span>}
            </label>
            <select id="in-category" value={category} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">{t('income.uncategorizedOption')}</option>
              {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="in-start">{t('income.startLabel')}</label>
            <input id="in-start" type="text" placeholder={t('income.monthPlaceholder')} value={startYm} onChange={(e) => setStartYm(e.target.value)} />
            {errors.startYm && <span className="field-error">{errors.startYm}</span>}
          </div>
          {effectiveType === 'fixed' && (
            <div className="field">
              <label htmlFor="in-hint">{t('income.matchHintLabel')}</label>
              <input
                id="in-hint" value={matchHint} onChange={(e) => setMatchHint(e.target.value)}
                placeholder={t('income.matchHintPlaceholder')} maxLength={80}
              />
              <span className="muted" style={{ fontSize: 12 }}>{t('income.matchHintHelp')}</span>
            </div>
          )}
        </div>
        <label className="checkbox" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>{t('income.activeLabel')}</span>
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('actions.cancel', { ns: 'common' })}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? t('states.saving', { ns: 'common' }) : (isEdit ? t('actions.save', { ns: 'common' }) : t('actions.add', { ns: 'common' }))}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default IncomeModal
