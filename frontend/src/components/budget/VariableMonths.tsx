import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBulkDeleteBudget, useBulkUpdateBudget } from '@/hooks/useBudget'
import { eur2, eurSigned, ymToShort, currentYm } from '@/lib/format'
import { merchantKey, merchantDisplayName } from '@/lib/merchant'
import { categoryLabel, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/categoryDictionary'
import type { Income, Expense, ExpenseType } from '@/types'

interface Props {
  // Manual variable budget lines (recurring plan), source = null.
  variableIncomes: Income[]
  variableExpenses: Expense[]
  // Imported actuals (source set). "Movimentos do mês" shows the real
  // transactions for the month, so these are merged into the list.
  actualIncomes?: Income[]
  actualExpenses?: Expense[]
  onEditIncome: (i: Income) => void
  onEditExpense: (e: Expense) => void
  onAddIncome: (ym: string) => void
  onAddExpense: (ym: string) => void
}

const monthOf = (it: { startYm: string | null }) => it.startYm || currentYm()
const sumActive = (rows: Array<{ active: boolean; amount: number }>) =>
  rows.filter((r) => r.active).reduce((s, r) => s + r.amount, 0)

interface Txn { kind: 'income' | 'expense'; item: Income | Expense }

interface MerchantGroup {
  key: string; name: string; txns: Txn[]
  total: number; totalAbs: number
}

export function VariableMonths({
  variableIncomes, variableExpenses, actualIncomes = [], actualExpenses = [],
  onEditIncome, onEditExpense, onAddIncome, onAddExpense,
}: Props) {
  const { t } = useTranslation('budget')
  const cur = currentYm()
  const del = useBulkDeleteBudget()
  const bulkEdit = useBulkUpdateBudget()

  // Every real movement = manual variable lines + imported actuals.
  const allIncomes = useMemo(() => [...variableIncomes, ...actualIncomes], [variableIncomes, actualIncomes])
  const allExpenses = useMemo(() => [...variableExpenses, ...actualExpenses], [variableExpenses, actualExpenses])

  const months = useMemo(() => {
    const set = new Set<string>([cur])
    for (const i of allIncomes) set.add(monthOf(i))
    for (const e of allExpenses) set.add(monthOf(e))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [allIncomes, allExpenses, cur])

  const [selected, setSelected] = useState(cur)
  useEffect(() => {
    if (!months.includes(selected)) setSelected(months[0] ?? cur)
  }, [months, selected, cur])

  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  useEffect(() => { setChecked(new Set()); setOpenGroups(new Set()) }, [selected])

  // Edit panel state
  const [showEdit, setShowEdit] = useState(false)
  const [editCategory, setEditCategory] = useState('')   // '' = don't change
  const [editType, setEditType] = useState<ExpenseType | ''>('')

  useEffect(() => { if (checked.size === 0) setShowEdit(false) }, [checked.size])

  const incs = allIncomes.filter((i) => monthOf(i) === selected)
  const exps = allExpenses.filter((e) => monthOf(e) === selected)

  const groups = useMemo<MerchantGroup[]>(() => {
    const map = new Map<string, Txn[]>()
    const push = (t: Txn) => {
      const k = merchantKey(t.item.name) || t.item.name.toLowerCase()
      const list = map.get(k) ?? []
      list.push(t)
      map.set(k, list)
    }
    for (const i of incs) push({ kind: 'income', item: i })
    for (const e of exps) push({ kind: 'expense', item: e })
    return [...map.entries()]
      .map(([key, txns]) => {
        const total = txns.reduce((s, t) => s + (t.kind === 'income' ? t.item.amount : -t.item.amount), 0)
        return {
          key, name: merchantDisplayName(txns.map((t) => t.item.name)),
          txns: txns.sort((a, b) => (b.item.dayOfMonth ?? 0) - (a.item.dayOfMonth ?? 0)),
          total, totalAbs: txns.reduce((s, t) => s + t.item.amount, 0),
        }
      })
      .sort((a, b) => b.totalAbs - a.totalAbs)
  }, [incs, exps])

  const incTotal = sumActive(incs)
  const expTotal = sumActive(exps)
  const saldo = incTotal - expTotal   // real movements this month

  const idOf = (t: Txn) => `${t.kind}:${t.item.id}`
  const toggleTxn = (t: Txn) => {
    setChecked((prev) => {
      const next = new Set(prev)
      const id = idOf(t)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleGroup = (g: MerchantGroup) => {
    setChecked((prev) => {
      const next = new Set(prev)
      const allIn = g.txns.every((t) => next.has(idOf(t)))
      for (const t of g.txns) {
        if (allIn) next.delete(idOf(t)); else next.add(idOf(t))
      }
      return next
    })
  }
  const toggleOpen = (key: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const removeSelected = async () => {
    if (checked.size === 0) return
    if (!confirm(t('variableMonths.removeConfirm', { count: checked.size }))) return
    const incomeIds = [...checked].filter((c) => c.startsWith('income:')).map((c) => c.slice(7))
    const expenseIds = [...checked].filter((c) => c.startsWith('expense:')).map((c) => c.slice(8))
    await del.mutateAsync({ incomeIds, expenseIds })
    setChecked(new Set())
  }

  const applyEdit = async () => {
    if (editCategory === '' && editType === '') return
    const incomeIds = [...checked].filter((c) => c.startsWith('income:')).map((c) => c.slice(7))
    const expenseIds = [...checked].filter((c) => c.startsWith('expense:')).map((c) => c.slice(8))
    const patch: { category?: string | null; type?: ExpenseType } = {}
    if (editCategory !== '') patch.category = editCategory === '__clear__' ? null : editCategory
    if (editType !== '') patch.type = editType
    await bulkEdit.mutateAsync({ incomeIds, expenseIds, patch })
    setShowEdit(false)
    setEditCategory('')
    setEditType('')
    setChecked(new Set())   // clear the selection so the count resets after applying
  }

  // Category list appropriate for the current selection mix
  const checkedArr = [...checked]
  const hasInc = checkedArr.some((c) => c.startsWith('income:'))
  const hasExp = checkedArr.some((c) => c.startsWith('expense:'))
  const categoryOptions: string[] = hasInc && hasExp
    ? [...new Set([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES])]
    : hasInc ? [...INCOME_CATEGORIES] : [...EXPENSE_CATEGORIES]

  return (
    <section className="var-block">
      <div className="budget-section-head">
        <h2 className="section-label" style={{ margin: 0 }}>{t('variableMonths.label')}</h2>
      </div>

      {/* Month tabs */}
      <div className="month-tabs" role="tablist">
        {months.map((ym) => (
          <button
            key={ym} type="button" role="tab"
            aria-selected={ym === selected}
            className={`month-tab ${ym === selected ? 'is-active' : ''} ${ym === cur ? 'is-current' : ''}`}
            onClick={() => setSelected(ym)}
          >
            {ymToShort(ym)}{ym === cur && <span className="month-tab-now">{t('variableMonths.current')}</span>}
          </button>
        ))}
      </div>

      {/* Saldo do mês (movimentos reais) */}
      <div className="month-summary">
        <div className="month-summary-cell">
          <span className="kpi-label">{t('variableMonths.incomes')}</span>
          <strong className="gain-positive">{eur2(incTotal)}</strong>
        </div>
        <div className="month-summary-cell">
          <span className="kpi-label">{t('variableMonths.expenses')}</span>
          <strong className="gain-negative">{eur2(expTotal)}</strong>
        </div>
        <div className="month-summary-cell month-summary-net">
          <span className="kpi-label">{t('variableMonths.monthBalance')}</span>
          <strong className={saldo >= 0 ? 'gain-positive' : 'gain-negative'}>{eurSigned(saldo)}</strong>
          <span className="muted" style={{ fontSize: 11 }}>{t('variableMonths.monthBalanceHint')}</span>
        </div>
      </div>

      {/* Action toolbar — lives just above the transaction list */}
      <div className="var-list-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddIncome(selected)}>{t('variableMonths.addIncome')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddExpense(selected)}>{t('variableMonths.addExpense')}</button>
        {checked.size > 0 && (
          <>
            <button
              type="button" className="btn btn-ghost btn-sm"
              onClick={() => { setShowEdit((v) => !v); setEditCategory(''); setEditType('') }}
            >
              {t('variableMonths.edit', { count: checked.size })}
            </button>
            <button
              type="button" className="btn btn-danger btn-sm"
              disabled={del.isLoading} onClick={removeSelected}
            >
              {t('variableMonths.remove', { count: checked.size })}
            </button>
          </>
        )}
      </div>

      {/* Inline bulk-edit panel */}
      {showEdit && checked.size > 0 && (
        <div className="var-edit-panel">
          <div className="var-edit-row">
            <label className="var-edit-label">{t('variableMonths.categoryLabel')}</label>
            <select
              className="var-edit-select"
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
            >
              <option value="">{t('variableMonths.noChange')}</option>
              <option value="__clear__">{t('variableMonths.clearCategory')}</option>
              {categoryOptions.map((c) => (
                <option key={c} value={c}>{categoryLabel(c)}</option>
              ))}
            </select>
          </div>
          <div className="var-edit-row">
            <label className="var-edit-label">{t('variableMonths.typeLabel')}</label>
            <div className="var-edit-type">
              {(['', 'fixed', 'variable'] as const).map((v) => (
                <button
                  key={v} type="button"
                  className={`var-type-btn ${editType === v ? 'is-active' : ''}`}
                  onClick={() => setEditType(v)}
                >
                  {v === '' ? t('variableMonths.noChange') : v === 'fixed' ? t('kind.fixed') : t('kind.variable')}
                </button>
              ))}
            </div>
          </div>
          <div className="var-edit-actions">
            <button
              type="button" className="btn btn-primary btn-sm"
              disabled={bulkEdit.isLoading || (editCategory === '' && editType === '')}
              onClick={applyEdit}
            >
              {bulkEdit.isLoading ? t('states.saving', { ns: 'common' }) : t('variableMonths.apply')}
            </button>
            <button
              type="button" className="btn btn-ghost btn-sm"
              onClick={() => setShowEdit(false)}
            >
              {t('actions.cancel', { ns: 'common' })}
            </button>
          </div>
        </div>
      )}

      {/* Merchant-grouped list */}
      {groups.length === 0 ? (
        <div className="card card-pad-lg muted">{t('variableMonths.empty')}</div>
      ) : (
        <div className="card merchant-list">
          {groups.map((g) => {
            const isOpen = openGroups.has(g.key)
            const allChecked = g.txns.every((t) => checked.has(idOf(t)))
            const someChecked = !allChecked && g.txns.some((t) => checked.has(idOf(t)))
            return (
              <div key={g.key} className={`merchant-group ${isOpen ? 'is-open' : ''}`}>
                <div className="merchant-head">
                  <input
                    type="checkbox" className="var-check"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked }}
                    onChange={() => toggleGroup(g)}
                    aria-label={t('variableMonths.selectAria', { name: g.name })}
                  />
                  <button type="button" className="merchant-toggle" onClick={() => toggleOpen(g.key)} aria-expanded={isOpen}>
                    <span className="merchant-chevron" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                    <span className="merchant-name">{g.name}</span>
                    {g.txns.length > 1 && <span className="merchant-count">{g.txns.length}×</span>}
                    <span className={`merchant-total ${g.total >= 0 ? 'gain-positive' : 'gain-negative'}`}>
                      {eurSigned(g.total)}
                    </span>
                  </button>
                </div>
                {isOpen && (
                  <ul className="merchant-txns">
                    {g.txns.map((txn) => {
                      const it = txn.item
                      return (
                        <li key={idOf(txn)} className={`merchant-txn ${checked.has(idOf(txn)) ? 'is-selected' : ''}`}>
                          <input
                            type="checkbox" className="var-check"
                            checked={checked.has(idOf(txn))}
                            onChange={() => toggleTxn(txn)}
                            aria-label={t('variableMonths.selectAria', { name: it.name })}
                          />
                          <div className="merchant-txn-main">
                            <span className="merchant-txn-date">
                              {it.dayOfMonth ? t('variableMonths.dayMeta', { day: it.dayOfMonth }) : ymToShort(monthOf(it))}
                            </span>
                            <span className="merchant-txn-source">{it.source ?? t('variableMonths.manual')}</span>
                            {it.category && <span className="merchant-txn-cat">{categoryLabel(it.category)}</span>}
                          </div>
                          <span className={`merchant-txn-value ${txn.kind === 'income' ? 'gain-positive' : 'gain-negative'}`}>
                            {txn.kind === 'income' ? '+' : '−'}{eur2(it.amount)}
                          </span>
                          <button
                            type="button" className="btn btn-ghost btn-sm"
                            onClick={() => (txn.kind === 'income' ? onEditIncome(it as Income) : onEditExpense(it as Expense))}
                          >
                            ✎
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default VariableMonths
