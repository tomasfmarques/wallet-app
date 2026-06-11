import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useBulkUpdateBudget } from '@/hooks/useBudget'
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
// Items with the same merchant name are collapsed into one row, so one
// pick classifies every duplicate. Saving batches by category through
// /api/budget/bulk-update — a handful of requests instead of one per item.
interface ClassifyProps {
  open: boolean
  onClose: () => void
  incomes: Income[]
  expenses: Expense[]
}

interface Group {
  key: string              // "income:<name>" | "expense:<name>"
  kind: 'income' | 'expense'
  name: string
  ids: string[]
  total: number
  typeLabel: string | null // 'fixa' | 'variável' | null when mixed/income
}

function groupItems(items: Array<Income | Expense>, kind: 'income' | 'expense'): Group[] {
  const map = new Map<string, Group>()
  for (const item of items) {
    const name = item.name.trim()
    const key = `${kind}:${name.toLowerCase()}`
    const g = map.get(key)
    const typeLabel = item.type === 'fixed' ? 'fixa' : 'variável'
    if (g) {
      g.ids.push(item.id)
      g.total += item.amount
      if (g.typeLabel !== typeLabel) g.typeLabel = null
    } else {
      map.set(key, { key, kind, name, ids: [item.id], total: item.amount, typeLabel })
    }
  }
  return Array.from(map.values())
}

function ClassifyModal({ open, onClose, incomes, expenses }: ClassifyProps) {
  const bulkUpdate = useBulkUpdateBudget()
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const incomeGroups = useMemo(() => groupItems(incomes, 'income'), [incomes])
  const expenseGroups = useMemo(() => groupItems(expenses, 'expense'), [expenses])

  // Pre-fill picks with auto-suggestions whenever the modal opens
  useEffect(() => {
    if (!open) return
    const initial: Record<string, string> = {}
    for (const g of [...incomeGroups, ...expenseGroups]) {
      initial[g.key] = inferCategory(g.name) ?? ''
    }
    setPicks(initial)
    setErr(null)
  }, [open, incomeGroups, expenseGroups])

  const setPick = (key: string, value: string) => {
    setPicks((p) => ({ ...p, [key]: value }))
  }

  const saveAll = async () => {
    setErr(null); setSaving(true)
    try {
      // One bulk request per distinct category, covering every id in
      // every group the user assigned to it.
      const byCategory = new Map<string, { incomeIds: string[]; expenseIds: string[] }>()
      for (const g of [...incomeGroups, ...expenseGroups]) {
        const cat = picks[g.key]?.trim()
        if (!cat) continue
        const bucket = byCategory.get(cat) ?? { incomeIds: [], expenseIds: [] }
        if (g.kind === 'income') bucket.incomeIds.push(...g.ids)
        else bucket.expenseIds.push(...g.ids)
        byCategory.set(cat, bucket)
      }
      await Promise.all(
        Array.from(byCategory.entries()).map(([category, ids]) =>
          bulkUpdate.mutateAsync({ ...ids, patch: { category } }),
        ),
      )
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  const classifiedCount = [...incomeGroups, ...expenseGroups]
    .filter((g) => picks[g.key] && picks[g.key].trim().length > 0)
    .reduce((s, g) => s + g.ids.length, 0)
  const totalCount = incomes.length + expenses.length

  return (
    <Modal open={open} onClose={onClose} title="Classificar itens" maxWidth={620}>
      <p className="muted modal-intro">
        Escolhe a categoria para cada comércio — aplica-se a todas as linhas
        iguais de uma vez. Sugestões (<strong>✨</strong>) vêm do dicionário
        automático. Deixa em branco para classificar depois.
      </p>

      {err && <div className="form-error">{err}</div>}

      <div className="classify-list">
        {incomeGroups.length > 0 && (
          <>
            <div className="classify-section-label">Receitas</div>
            {incomeGroups.map((g) => (
              <ClassifyRow
                key={g.key}
                label={g.name}
                count={g.ids.length}
                meta={metaFor(g)}
                value={picks[g.key] ?? ''}
                wasInferred={inferCategory(g.name) === picks[g.key] && !!picks[g.key]}
                options={INCOME_CATEGORIES as unknown as string[]}
                onChange={(v) => setPick(g.key, v)}
              />
            ))}
          </>
        )}
        {expenseGroups.length > 0 && (
          <>
            <div className="classify-section-label">Despesas</div>
            {expenseGroups.map((g) => (
              <ClassifyRow
                key={g.key}
                label={g.name}
                count={g.ids.length}
                meta={metaFor(g)}
                value={picks[g.key] ?? ''}
                wasInferred={inferCategory(g.name) === picks[g.key] && !!picks[g.key]}
                options={EXPENSE_CATEGORIES as unknown as string[]}
                onChange={(v) => setPick(g.key, v)}
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

function metaFor(g: Group): string {
  const parts = [eur(g.total)]
  if (g.ids.length > 1) parts.push(`${g.ids.length} linhas`)
  if (g.kind === 'expense' && g.typeLabel) parts.push(g.typeLabel)
  return parts.join(' · ')
}

interface RowProps {
  label: string
  count: number
  meta: string
  value: string
  wasInferred: boolean
  options: string[]
  onChange: (v: string) => void
}
function ClassifyRow({ label, count, meta, value, wasInferred, options, onChange }: RowProps) {
  return (
    <div className="classify-row">
      <div className="classify-row-main">
        <div className="classify-row-name">
          {label}
          {count > 1 && <span className="classify-count-badge" title={`${count} linhas iguais`}>×{count}</span>}
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
