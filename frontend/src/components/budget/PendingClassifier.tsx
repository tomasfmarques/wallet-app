import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useTranslation, Trans } from 'react-i18next'
import { useClassifyPending, useBulkUpdateBudget } from '@/hooks/useBudget'
import { eur2 } from '@/lib/format'
import { categoryLabel } from '@/lib/categoryDictionary'
import type { Income, Expense, ExpenseType } from '@/types'

interface Props {
  pendingIncomes: Income[]
  pendingExpenses: Expense[]
}

// e-Fatura-style holding area. Imported statement lines land here (kind known
// from the +/− sign, but fixed/variable not yet decided). Two ways out:
//  • per-row "Fixa"/"Variável" buttons (single PATCH via /classify, which also
//    learns a merchant rule and applies it to same-merchant siblings), or
//  • CHECKBOXES + a bulk bar — select many (or all) lines and classify them in
//    one /bulk-update call (which also clears `pending` + learns rules), so a
//    70-line import doesn't need 70 taps.
export function PendingClassifier({ pendingIncomes, pendingExpenses }: Props) {
  const { t } = useTranslation('budget')
  const bulkMut = useBulkUpdateBudget()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState<ExpenseType | null>(null)

  const total = pendingIncomes.length + pendingExpenses.length
  if (total === 0) return null

  const rows = [
    ...pendingIncomes.map((i) => ({ kind: 'income' as const, item: i })),
    ...pendingExpenses.map((e) => ({ kind: 'expense' as const, item: e })),
  ]
  const keyOf = (kind: string, id: string) => `${kind}:${id}`
  const allKeys = rows.map(({ kind, item }) => keyOf(kind, item.id))
  // Selection can hold keys of rows that have since been classified away — count
  // only the ones still visible.
  const selectedCount = allKeys.filter((k) => selected.has(k)).length
  const allSelected = selectedCount === rows.length

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allKeys))

  const applyBulk = async (type: ExpenseType) => {
    const incomeIds = pendingIncomes.filter((i) => selected.has(keyOf('income', i.id))).map((i) => i.id)
    const expenseIds = pendingExpenses.filter((e) => selected.has(keyOf('expense', e.id))).map((e) => e.id)
    if (incomeIds.length + expenseIds.length === 0) return
    setBulkBusy(type)
    try {
      await bulkMut.mutateAsync({ incomeIds, expenseIds, patch: { type } })
      setSelected(new Set())
    } catch {
      // keep the selection so the user can retry
    } finally {
      setBulkBusy(null)
    }
  }

  return (
    <section className="pending-box">
      <div className="pending-head">
        <span className="pending-icon"><Icon name="inbox" size={18} /></span>
        <div className="pending-head-text">
          <strong>{total === 1 ? t('pending.headOne', { count: total }) : t('pending.headMany', { count: total })}</strong>
          <span className="muted"><Trans i18nKey="pending.headHint" ns="budget" components={{ 1: <b />, 2: <b /> }} /></span>
        </div>
      </div>

      <div className="pending-bulkbar">
        <label className="pending-bulk-all">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && !allSelected }}
            onChange={toggleAll}
            aria-label={t('pending.selectAll')}
          />
          <span className="muted">
            {selectedCount > 0
              ? t('pending.selectedCount', { count: selectedCount })
              : t('pending.selectAll')}
          </span>
        </label>
        {selectedCount > 0 && (
          <span className="pending-bulk-actions">
            <span className="muted">{t('pending.bulkMarkAs')}</span>
            <button
              type="button" className="btn btn-primary btn-sm"
              disabled={!!bulkBusy} onClick={() => applyBulk('fixed')}
            >
              {bulkBusy === 'fixed' ? '…' : t('pending.fixed')}
            </button>
            <button
              type="button" className="btn btn-primary btn-sm"
              disabled={!!bulkBusy} onClick={() => applyBulk('variable')}
            >
              {bulkBusy === 'variable' ? '…' : t('pending.variable')}
            </button>
          </span>
        )}
      </div>

      <ul className="pending-list">
        {rows.map(({ kind, item }) => (
          <PendingRow
            key={keyOf(kind, item.id)}
            kind={kind}
            item={item}
            checked={selected.has(keyOf(kind, item.id))}
            onToggle={() => toggle(keyOf(kind, item.id))}
          />
        ))}
      </ul>
    </section>
  )
}

function PendingRow({ kind, item, checked, onToggle }: {
  kind: 'income' | 'expense'
  item: Income | Expense
  checked: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation('budget')
  const classifyMut = useClassifyPending()
  const [busy, setBusy] = useState<ExpenseType | null>(null)

  const classify = async (type: ExpenseType) => {
    setBusy(type)
    try {
      // Learns a merchant rule + applies to same-merchant siblings.
      await classifyMut.mutateAsync({ id: item.id, kind, type })
      // On success the budget query invalidates and the row disappears here.
    } catch {
      setBusy(null)
    }
  }

  return (
    <li className="pending-row">
      <input
        type="checkbox" className="pending-row-check"
        checked={checked} onChange={onToggle}
        aria-label={t('pending.selectRow', { name: item.name })}
      />
      <div className="pending-row-main">
        <span className={`pending-pill ${kind === 'income' ? 'is-income' : 'is-expense'}`}>
          {kind === 'income' ? t('pending.income') : t('pending.expense')}
        </span>
        <span className="pending-row-name">{item.name}</span>
        {item.category && <span className="pending-row-cat muted">{categoryLabel(item.category)}</span>}
      </div>
      {/* Real transaction amounts keep cents — eur() (0 decimals) is for KPIs. */}
      <div className="pending-row-amount">{eur2(item.amount)}</div>
      <div className="pending-row-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => classify('fixed')}>
          {busy === 'fixed' ? '…' : t('pending.fixed')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => classify('variable')}>
          {busy === 'variable' ? '…' : t('pending.variable')}
        </button>
      </div>
    </li>
  )
}

export default PendingClassifier
