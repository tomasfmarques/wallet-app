import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useUpdateIncome, useUpdateExpense } from '@/hooks/useBudget'
import {
  inferCategory, INCOME_CATEGORIES, EXPENSE_CATEGORIES,
} from '@/lib/categoryDictionary'
import { eur } from '@/lib/format'
import type { Income, Expense } from '@/types'

interface Props {
  incomes: Income[]
  expenses: Expense[]
}

// e-Fatura-inspired banner. Lists active items with no category and lets
// the user triage them all in one modal — like Portugal's tax invoice
// system asks you to classify receipts that couldn't be auto-categorized.
export function UncategorizedBanner({ incomes, expenses }: Props) {
  const uncatIncomes = useMemo(
    () => incomes.filter((i) => i.active && (!i.category || i.category.trim() === '')),
    [incomes],
  )
  const uncatExpenses = useMemo(
    () => expenses.filter((e) => e.active && (!e.category || e.category.trim() === '')),
    [expenses],
  )
  const total = uncatIncomes.length + uncatExpenses.length

  const [open, setOpen] = useState(false)
  if (total === 0) return null

  return (
    <>
      <div className="uncat-banner" role="status">
        <span className="uncat-banner-icon" aria-hidden>📌</span>
        <div className="uncat-banner-text">
          <strong>{total} {total === 1 ? 'item por classificar' : 'itens por classificar'}</strong>
          <span className="muted"> · ajuda a obter um melhor breakdown da tua despesa.</span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Classificar agora →
        </button>
      </div>
      <ClassifyModal
        open={open}
        onClose={() => setOpen(false)}
        incomes={uncatIncomes}
        expenses={uncatExpenses}
      />
    </>
  )
}

// ── Triage modal ────────────────────────────────────────────────
interface ClassifyProps {
  open: boolean
  onClose: () => void
  incomes: Income[]
  expenses: Expense[]
}

function ClassifyModal({ open, onClose, incomes, expenses }: ClassifyProps) {
  const updIncome = useUpdateIncome()
  const updExpense = useUpdateExpense()
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Pre-fill picks with auto-suggestions whenever the modal opens
  useEffect(() => {
    if (!open) return
    const initial: Record<string, string> = {}
    for (const i of incomes) initial[i.id] = inferCategory(i.name) ?? ''
    for (const e of expenses) initial[e.id] = inferCategory(e.name) ?? ''
    setPicks(initial)
    setErr(null)
  }, [open, incomes, expenses])

  const setPick = (id: string, value: string) => {
    setPicks((p) => ({ ...p, [id]: value }))
  }

  const saveAll = async () => {
    setErr(null); setSaving(true)
    try {
      const promises: Promise<unknown>[] = []
      for (const i of incomes) {
        const cat = picks[i.id]?.trim()
        if (cat) promises.push(updIncome.mutateAsync({ id: i.id, patch: { category: cat } }))
      }
      for (const e of expenses) {
        const cat = picks[e.id]?.trim()
        if (cat) promises.push(updExpense.mutateAsync({ id: e.id, patch: { category: cat } }))
      }
      await Promise.all(promises)
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  const classifiedCount = Object.values(picks).filter((v) => v && v.trim().length > 0).length
  const totalCount = incomes.length + expenses.length

  return (
    <Modal open={open} onClose={onClose} title="Classificar itens" maxWidth={620}>
      <p className="muted modal-intro">
        Escolhe a categoria para cada item. Os valores sugeridos
        (<strong>✨</strong>) vêm do dicionário automático — podes alterá-los.
        Deixa em branco para deixar por classificar.
      </p>

      {err && <div className="form-error">{err}</div>}

      <div className="classify-list">
        {incomes.length > 0 && (
          <>
            <div className="classify-section-label">Receitas</div>
            {incomes.map((i) => (
              <ClassifyRow
                key={i.id}
                label={i.name}
                meta={`${eur(i.amount)}/mês`}
                value={picks[i.id] ?? ''}
                wasInferred={inferCategory(i.name) === picks[i.id] && !!picks[i.id]}
                options={INCOME_CATEGORIES as unknown as string[]}
                onChange={(v) => setPick(i.id, v)}
              />
            ))}
          </>
        )}
        {expenses.length > 0 && (
          <>
            <div className="classify-section-label">Despesas</div>
            {expenses.map((e) => (
              <ClassifyRow
                key={e.id}
                label={e.name}
                meta={`${eur(e.amount)}/mês · ${e.type === 'fixed' ? 'fixa' : 'variável'}`}
                value={picks[e.id] ?? ''}
                wasInferred={inferCategory(e.name) === picks[e.id] && !!picks[e.id]}
                options={EXPENSE_CATEGORIES as unknown as string[]}
                onChange={(v) => setPick(e.id, v)}
              />
            ))}
          </>
        )}
      </div>

      <div className="form-actions" style={{ marginTop: 12 }}>
        <span className="muted" style={{ marginRight: 'auto', fontSize: 12.5 }}>
          {classifiedCount}/{totalCount} classificados
        </span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={saveAll} disabled={saving}>
          {saving ? 'A guardar…' : 'Guardar tudo'}
        </button>
      </div>
    </Modal>
  )
}

interface RowProps {
  label: string
  meta: string
  value: string
  wasInferred: boolean
  options: string[]
  onChange: (v: string) => void
}
function ClassifyRow({ label, meta, value, wasInferred, options, onChange }: RowProps) {
  return (
    <div className="classify-row">
      <div className="classify-row-main">
        <div className="classify-row-name">
          {label}
          {wasInferred && <span className="auto-pill" title="Sugerida automaticamente">✨</span>}
        </div>
        <div className="classify-row-meta muted">{meta}</div>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— por classificar —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

export default UncategorizedBanner
