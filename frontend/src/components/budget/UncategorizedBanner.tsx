import { useEffect, useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Modal } from '@/components/ui/Modal'
import { useBulkUpdateBudget } from '@/hooks/useBudget'
import {
  inferCategory, categoryLabel, INCOME_CATEGORIES, EXPENSE_CATEGORIES,
} from '@/lib/categoryDictionary'
import { eur } from '@/lib/format'
import { apiErrorMessage } from '@/lib/apiError'
import type { Income, Expense, ExpenseType } from '@/types'

interface Props {
  incomes: Income[]
  expenses: Expense[]
}

// e-Fatura-inspired banner. Lists active items with no category and lets
// the user triage them all in one modal — like Portugal's tax invoice
// system asks you to classify receipts that couldn't be auto-categorized.
export function UncategorizedBanner({ incomes, expenses }: Props) {
  const { t } = useTranslation('budget')
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
          <strong>{total === 1 ? t('uncat.bannerOne', { count: total }) : t('uncat.bannerMany', { count: total })}</strong>
          <span className="muted">{t('uncat.bannerHint')}</span>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          {t('uncat.classifyNow')}
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
  type: ExpenseType | null // 'fixed' | 'variable' | null when mixed/income
}

function groupItems(items: Array<Income | Expense>, kind: 'income' | 'expense'): Group[] {
  const map = new Map<string, Group>()
  for (const item of items) {
    const name = item.name.trim()
    const key = `${kind}:${name.toLowerCase()}`
    const g = map.get(key)
    if (g) {
      g.ids.push(item.id)
      g.total += item.amount
      if (g.type !== item.type) g.type = null
    } else {
      map.set(key, { key, kind, name, ids: [item.id], total: item.amount, type: item.type })
    }
  }
  return Array.from(map.values())
}

function ClassifyModal({ open, onClose, incomes, expenses }: ClassifyProps) {
  const { t } = useTranslation('budget')
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
      setErr(apiErrorMessage(e, t('uncat.saveError')))
    } finally {
      setSaving(false)
    }
  }

  const classifiedCount = [...incomeGroups, ...expenseGroups]
    .filter((g) => picks[g.key] && picks[g.key].trim().length > 0)
    .reduce((s, g) => s + g.ids.length, 0)
  const totalCount = incomes.length + expenses.length

  return (
    <Modal open={open} onClose={onClose} title={t('uncat.modalTitle')} maxWidth={620}>
      <p className="muted modal-intro">
        <Trans i18nKey="uncat.modalIntro" ns="budget" components={{ 1: <strong /> }} />
      </p>

      {err && <div className="form-error">{err}</div>}

      <div className="classify-list">
        {incomeGroups.length > 0 && (
          <>
            <div className="classify-section-label">{t('uncat.incomesSection')}</div>
            {incomeGroups.map((g) => (
              <ClassifyRow
                key={g.key}
                label={g.name}
                count={g.ids.length}
                meta={metaFor(g, t)}
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
            <div className="classify-section-label">{t('uncat.expensesSection')}</div>
            {expenseGroups.map((g) => (
              <ClassifyRow
                key={g.key}
                label={g.name}
                count={g.ids.length}
                meta={metaFor(g, t)}
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
          {t('uncat.classifiedCount', { done: classifiedCount, total: totalCount })}
        </span>
        <button type="button" className="btn btn-ghost" onClick={onClose}>{t('actions.cancel', { ns: 'common' })}</button>
        <button type="button" className="btn btn-primary" onClick={saveAll} disabled={saving}>
          {saving ? t('states.saving', { ns: 'common' }) : t('uncat.saveAll')}
        </button>
      </div>
    </Modal>
  )
}

function metaFor(g: Group, t: TFunction<'budget'>): string {
  const parts = [eur(g.total)]
  if (g.ids.length > 1) parts.push(t('uncat.linesMeta', { count: g.ids.length }))
  if (g.kind === 'expense' && g.type) parts.push(t(g.type === 'fixed' ? 'kind.fixedF' : 'kind.variableF'))
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
  const { t } = useTranslation('budget')
  return (
    <div className="classify-row">
      <div className="classify-row-main">
        <div className="classify-row-name">
          {label}
          {count > 1 && <span className="classify-count-badge" title={t('uncat.sameLines', { count })}>×{count}</span>}
          {wasInferred && <span className="auto-pill" title={t('uncat.autoSuggested')}>✨</span>}
        </div>
        <div className="classify-row-meta muted">{meta}</div>
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('uncat.uncategorizedOption')}</option>
        {options.map((o) => <option key={o} value={o}>{categoryLabel(o)}</option>)}
      </select>
    </div>
  )
}

export default UncategorizedBanner
