import { FormEvent, useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  useAddIncome, useUpdateIncome, type IncomeInput,
} from '@/hooks/useBudget'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { inferCategory, INCOME_CATEGORIES } from '@/lib/categoryDictionary'
import type { Income, ExpenseType } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  type: ExpenseType   // 'fixed' or 'variable' — locked when adding
  income?: Income
  defaultStartYm?: string  // prefill month when adding a variable from a month tab
}

export function IncomeModal({ open, onClose, type, income, defaultStartYm }: Props) {
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
  const [errors, setErrors] = useState<FieldErrors>({})
  const userPickedCategory = useRef(false)

  useEffect(() => {
    if (!open) return
    setName(income?.name ?? '')
    setAmount(income ? String(income.amount) : '')
    setCategory(income?.category ?? '')
    setAutoSuggested(false)
    setStartYm(income?.startYm ?? defaultStartYm ?? '')
    setEndYm(income?.endYm ?? '')
    setNotes(income?.notes ?? '')
    setActive(income?.active ?? true)
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
    if (!name.trim()) errs.name = 'Obrigatório'
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) errs.amount = '> 0'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    const body: IncomeInput = {
      name: name.trim(), amount: n, type: effectiveType,
      category: category.trim() || null,
      startYm: startYm.trim() || null,
      // Variable = one-off → scope it to a single month (endYm = startYm).
      endYm: effectiveType === 'variable' ? (startYm.trim() || null) : (endYm.trim() || null),
      notes: notes.trim() || null,
      active,
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
    <Modal open={open} onClose={onClose} title={`${isEdit ? 'Editar' : 'Nova'} receita ${effectiveType === 'fixed' ? 'fixa' : 'variável'}`} maxWidth={520}>
      <form onSubmit={submit} className="amort-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="in-name">Nome</label>
            <input id="in-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder="Salário, Freelance…" />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="in-amount">Valor mensal (€)</label>
            <input
              id="in-amount" type="number" inputMode="decimal" step="any" min="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>
          <div className="field">
            <label htmlFor="in-category">
              Categoria
              {autoSuggested && <span className="auto-pill" title="Sugerida automaticamente">✨ sugerida</span>}
            </label>
            <select id="in-category" value={category} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">— por classificar —</option>
              {INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="in-start">Início (opcional)</label>
            <input id="in-start" type="text" placeholder="AAAA-MM" value={startYm} onChange={(e) => setStartYm(e.target.value)} />
            {errors.startYm && <span className="field-error">{errors.startYm}</span>}
          </div>
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

export default IncomeModal
