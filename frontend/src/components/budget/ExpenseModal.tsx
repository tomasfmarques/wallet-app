import { FormEvent, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  useAddExpense, useUpdateExpense, type ExpenseInput,
} from '@/hooks/useBudget'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { inferCategory, EXPENSE_CATEGORIES } from '@/lib/categoryDictionary'
import type { Expense, ExpenseType } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  type: ExpenseType   // 'fixed' or 'variable' — locked when adding
  expense?: Expense
  defaultStartYm?: string  // prefill month when adding a variable from a month tab
}

export function ExpenseModal({ open, onClose, type, expense, defaultStartYm }: Props) {
  const add = useAddExpense()
  const upd = useUpdateExpense()
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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: FieldErrors = {}
    if (!name.trim()) errs.name = 'Obrigatório'
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) errs.amount = '> 0'
    let dayNum: number | null = null
    if (dayOfMonth.trim()) {
      const d = Number(dayOfMonth)
      if (!Number.isInteger(d) || d < 1 || d > 31) errs.dayOfMonth = '1-31'
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
  const title = isEdit
    ? `Editar despesa ${effectiveType === 'fixed' ? 'fixa' : 'variável'}`
    : `Nova despesa ${effectiveType === 'fixed' ? 'fixa' : 'variável'}`

  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={560}>
      <form onSubmit={submit} className="amort-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="ex-name">Nome</label>
            <input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder={effectiveType === 'fixed' ? 'Renda, Netflix, Água…' : 'Comida, Restaurante, Uber…'} />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="ex-amount">Valor mensal (€)</label>
            <input
              id="ex-amount" type="number" inputMode="decimal" step="any" min="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>
          <div className="field">
            <label htmlFor="ex-category">
              Categoria
              {autoSuggested && <span className="auto-pill" title="Sugerida automaticamente">✨ sugerida</span>}
            </label>
            <select id="ex-category" value={category} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">— por classificar —</option>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {effectiveType === 'fixed' && (
            <div className="field">
              <label htmlFor="ex-day">Dia do mês (opcional)</label>
              <input
                id="ex-day" type="number" inputMode="numeric" min="1" max="31"
                value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)}
                placeholder="1-31"
              />
              {errors.dayOfMonth && <span className="field-error">{errors.dayOfMonth}</span>}
            </div>
          )}
        </div>
        <label className="checkbox" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Ativa (conta para os totais)</span>
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'A guardar…' : (isEdit ? 'Guardar' : 'Adicionar')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ExpenseModal
