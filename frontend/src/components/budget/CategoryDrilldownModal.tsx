import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { useBulkUpdateBudget } from '@/hooks/useBudget'
import { categoryLabel, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/categoryDictionary'
import { eur2 } from '@/lib/format'
import type { Income, Expense } from '@/types'

export type DrilldownList = 'fixed' | 'variable' | 'income'

interface Props {
  list: DrilldownList
  /** Canonical category of the clicked slice; null = the uncategorized bucket. */
  category: string | null
  /** The SAME source array the clicked donut rendered from. */
  items: Array<Income | Expense>
  onClose: () => void
}

// Category drill-down opened by clicking a donut slice (Análise — both the
// overview scope and the month view share this; it used to be duplicated in
// Budget.tsx and MonthAnalysis.tsx). Lists the slice's rows with an INLINE
// category select per row — the "post-categorize" path: fixing a category no
// longer means hunting each row's edit modal. A change saves immediately via
// /bulk-update; the budget query invalidates and the row leaves the list if it
// no longer belongs to this slice.
export function CategoryDrilldownModal({ list, category, items, onClose }: Props) {
  const { t } = useTranslation('budget')
  const bulkUpdate = useBulkUpdateBudget()
  const kind: 'income' | 'expense' = list === 'income' ? 'income' : 'expense'
  const options = (kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES) as unknown as string[]

  // Same inclusion rule as the donut itself (active, amount > 0), same
  // bucketing (empty/whitespace category = the uncategorized bucket).
  const rows = items
    .filter((r) => r.active && r.amount > 0 && ((r.category?.trim() || null) === category))
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const donutTitle = t(`donutTitles.${list === 'fixed' ? 'fixedExpenses' : list === 'variable' ? 'variableExpenses' : 'incomes'}`)

  const recategorize = (id: string, value: string) => {
    void bulkUpdate.mutateAsync({
      ...(kind === 'income' ? { incomeIds: [id] } : { expenseIds: [id] }),
      patch: { category: value || null },
    }).catch(() => { /* the row keeps its old category on failure; nothing stale to undo */ })
  }

  return (
    <Modal
      open onClose={onClose}
      title={category ? categoryLabel(category) : t('donut.uncategorized')}
      maxWidth={520}
    >
      <p className="muted" style={{ marginTop: 0 }}>
        {t('donut.filterSubtitle', { title: donutTitle, count: rows.length })}
      </p>
      <ul className="donut-filter-list">
        {rows.map((r) => (
          <li key={r.id}>
            <span className="donut-filter-name">
              {r.name}
              {r.startYm && <span className="muted"> · {r.startYm}</span>}
            </span>
            <select
              className="donut-filter-cat"
              value={r.category?.trim() || ''}
              disabled={bulkUpdate.isLoading}
              onChange={(e) => recategorize(r.id, e.target.value)}
              aria-label={t('uncat.modalTitle')}
            >
              <option value="">{t('uncat.uncategorizedOption')}</option>
              {options.map((o) => <option key={o} value={o}>{categoryLabel(o)}</option>)}
            </select>
            <span className="donut-filter-amount">{eur2(r.amount)}</span>
          </li>
        ))}
      </ul>
      <div className="donut-filter-total">
        <span>{t('donut.totalPrefix')}</span>
        <strong>{eur2(total)}</strong>
      </div>
    </Modal>
  )
}

export default CategoryDrilldownModal
