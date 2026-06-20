import { FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import {
  useAddExpense, useUpdateExpense, type ExpenseInput,
} from '@/hooks/useBudget'
import { useLoan } from '@/hooks/useLoan'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { inferCategory, categoryLabel, EXPENSE_CATEGORIES } from '@/lib/categoryDictionary'
import { eur2 } from '@/lib/format'
import type { Expense, ExpenseType } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  type: ExpenseType   // 'fixed' or 'variable' — locked when adding
  expense?: Expense
  defaultStartYm?: string  // prefill month when adding a variable from a month tab
}

export function ExpenseModal({ open, onClose, type, expense, defaultStartYm }: Props) {
  const { t } = useTranslation('budget')
  const add = useAddExpense()
  const upd = useUpdateExpense()
  const { data: loanData } = useLoan()
  const loans = loanData?.loans ?? []
  const isEdit = !!expense

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [autoSuggested, setAutoSuggested] = useState(false)
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [startYm, setStartYm] = useState('')
  const [endYm, setEndYm] = useState('')
  const [notes, setNotes] = useState('')
  const [active, setActive] = useState(true)
  const [loanId, setLoanId] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const userPickedCategory = useRef(false)

  useEffect(() => {
    if (!open) return
    setName(expense?.name ?? '')
    setAmount(expense ? String(expense.amount) : '')
    setCategory(expense?.category ?? '')
    setAutoSuggested(false)
    setDayOfMonth(expense?.dayOfMonth != null ? String(expense.dayOfMonth) : '')
    setStartYm(expense?.startYm ?? defaultStartYm ?? '')
    setEndYm(expense?.endYm ?? '')
    setNotes(expense?.notes ?? '')
    setActive(expense?.active ?? true)
    setLoanId(expense?.loanId ?? '')
    setErrors({})
    userPickedCategory.current = !!expense?.category
  }, [open, expense, defaultStartYm])

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

  const effectiveType: ExpenseType = expense?.type ?? type
  // Loan link is only offered for fixed expenses. When linked, the amount is
  // taken LIVE from the loan's prestação (the backend syncs it on read too).
  const linkedLoan = loans.find((l) => l.loan.id === loanId) ?? null
  const linkedPrestacao = linkedLoan?.kpis.proximaPrestacao ?? null
  const linked = effectiveType === 'fixed' && !!loanId && linkedPrestacao != null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: FieldErrors = {}
    if (!name.trim()) errs.name = t('expense.errRequired')
    // When linked to a loan, use its prestação; otherwise require a positive amount.
    const n = linked ? linkedPrestacao! : Number(amount)
    if (!linked && (!Number.isFinite(n) || n <= 0)) errs.amount = t('expense.errGt0')
    let dayNum: number | null = null
    if (dayOfMonth.trim()) {
      const d = Number(dayOfMonth)
      if (!Number.isInteger(d) || d < 1 || d > 31) errs.dayOfMonth = t('expense.errDay')
      else dayNum = d
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    const body: ExpenseInput = {
      name: name.trim(), amount: n, type: effectiveType,
      category: category.trim() || null,
      dayOfMonth: dayNum,
      startYm: startYm.trim() || null,
      // Variable = one-off → scope it to a single month (endYm = startYm).
      endYm: effectiveType === 'variable' ? (startYm.trim() || null) : (endYm.trim() || null),
      notes: notes.trim() || null,
      active,
      loanId: effectiveType === 'fixed' ? (loanId || null) : null,
    }
    try {
      if (isEdit && expense) await upd.mutateAsync({ id: expense.id, patch: body })
      else await add.mutateAsync(body)
      onClose()
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  const busy = add.isLoading || upd.isLoading
  const title = t('expense.title', {
    action: isEdit ? t('kind.edit') : t('kind.new'),
    kind: effectiveType === 'fixed' ? t('kind.fixedF') : t('kind.variableF'),
  })

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={560}>
      <form onSubmit={submit} className="amort-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="ex-name">{t('expense.nameLabel')}</label>
            <input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder={effectiveType === 'fixed' ? t('expense.namePlaceholderFixed') : t('expense.namePlaceholderVariable')} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="ex-amount">{t('expense.amountLabel')}</label>
            <input
              id="ex-amount" type="number" inputMode="decimal" step="any" min="0"
              value={linked ? String(linkedPrestacao) : amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={linked}
            />
            {linked
              ? <span className="muted" style={{ fontSize: 12 }}>{t('expense.loanSynced')}</span>
              : errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>
          <div className="field">
            <label htmlFor="ex-category">
              {t('expense.categoryLabel')}
              {autoSuggested && <span className="auto-pill" title={t('income.autoSuggestedTitle')}>{t('income.autoSuggestedPill')}</span>}
            </label>
            <select id="ex-category" value={category} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">{t('income.uncategorizedOption')}</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
            </select>
          </div>
          {effectiveType === 'fixed' && (
            <div className="field">
              <label htmlFor="ex-day">{t('expense.dayLabel')}</label>
              <input
                id="ex-day" type="number" inputMode="numeric" min="1" max="31"
                value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder={t('expense.dayPlaceholder')}
              />
              {errors.dayOfMonth && <span className="field-error">{errors.dayOfMonth}</span>}
            </div>
          )}
          {effectiveType === 'fixed' && loans.length > 0 && (
            <div className="field">
              <label htmlFor="ex-loan">{t('expense.loanLabel')}</label>
              <select id="ex-loan" value={loanId} onChange={(e) => setLoanId(e.target.value)}>
                <option value="">{t('expense.loanNone')}</option>
                {loans.map((l) => <option key={l.loan.id} value={l.loan.id}>{l.loan.name}</option>)}
              </select>
              {linked && (
                <span className="muted" style={{ fontSize: 12 }}>
                  🔗 {t('expense.loanLinkedHint', { value: eur2(linkedPrestacao!) })}
                </span>
              )}
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

export default ExpenseModal
