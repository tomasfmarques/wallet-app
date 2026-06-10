import { useEffect, useMemo, useState } from 'react'
import { useBulkDeleteBudget } from '@/hooks/useBudget'
import { eur2, eurSigned, ymToShort, currentYm } from '@/lib/format'
import { merchantKey, merchantDisplayName } from '@/lib/merchant'
import type { Income, Expense } from '@/types'

interface Props {
  variableIncomes: Income[]   // type 'variable', non-pending
  variableExpenses: Expense[]
  fixedIncomeTotal: number    // active recurring receitas (counts every month)
  fixedExpenseTotal: number   // active recurring despesas
  onEditIncome: (i: Income) => void
  onEditExpense: (e: Expense) => void
  onAddIncome: (ym: string) => void
  onAddExpense: (ym: string) => void
}

// A variable line belongs to its transaction month; undated ones fall in the
// current month.
const monthOf = (it: { startYm: string | null }) => it.startYm || currentYm()
const sumActive = (rows: Array<{ active: boolean; amount: number }>) =>
  rows.filter((r) => r.active).reduce((s, r) => s + r.amount, 0)

interface Txn {
  kind: 'income' | 'expense'
  item: Income | Expense
}

interface MerchantGroup {
  key: string
  name: string
  txns: Txn[]
  total: number      // signed: incomes − expenses
  totalAbs: number   // for sorting (movement size)
}

export function VariableMonths({
  variableIncomes, variableExpenses, fixedIncomeTotal, fixedExpenseTotal,
  onEditIncome, onEditExpense, onAddIncome, onAddExpense,
}: Props) {
  const cur = currentYm()
  const del = useBulkDeleteBudget()

  const months = useMemo(() => {
    const set = new Set<string>([cur])
    for (const i of variableIncomes) set.add(monthOf(i))
    for (const e of variableExpenses) set.add(monthOf(e))
    return [...set].sort((a, b) => b.localeCompare(a)) // newest first
  }, [variableIncomes, variableExpenses, cur])

  const [selected, setSelected] = useState(cur)
  useEffect(() => {
    if (!months.includes(selected)) setSelected(months[0] ?? cur)
  }, [months, selected, cur])

  const [checked, setChecked] = useState<Set<string>>(new Set())     // "kind:id"
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  useEffect(() => { setChecked(new Set()); setOpenGroups(new Set()) }, [selected])

  const incs = variableIncomes.filter((i) => monthOf(i) === selected)
  const exps = variableExpenses.filter((e) => monthOf(e) === selected)

  // ── Group by merchant (Excel-pivot style) ──
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
          key,
          name: merchantDisplayName(txns.map((t) => t.item.name)),
          txns: txns.sort((a, b) => (b.item.dayOfMonth ?? 0) - (a.item.dayOfMonth ?? 0)),
          total,
          totalAbs: txns.reduce((s, t) => s + t.item.amount, 0),
        }
      })
      .sort((a, b) => b.totalAbs - a.totalAbs)
  }, [incs, exps])

  const incTotal = sumActive(incs)
  const expTotal = sumActive(exps)
  // Real monthly balance: recurring baseline + this month's variable movements.
  const saldo = fixedIncomeTotal - fixedExpenseTotal + incTotal - expTotal

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
    if (!confirm(`Remover ${checked.size} transação(ões)? Podes voltar a importá-las depois.`)) return
    const incomeIds = [...checked].filter((c) => c.startsWith('income:')).map((c) => c.slice(7))
    const expenseIds = [...checked].filter((c) => c.startsWith('expense:')).map((c) => c.slice(8))
    await del.mutateAsync({ incomeIds, expenseIds })
    setChecked(new Set())
  }

  return (
    <section className="var-block">
      <div className="budget-section-head">
        <h2 className="section-label" style={{ margin: 0 }}>MOVIMENTOS DO MÊS</h2>
        <div className="var-head-actions">
          {checked.size > 0 && (
            <button type="button" className="btn btn-danger btn-sm" disabled={del.isLoading} onClick={removeSelected}>
              Remover ({checked.size})
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddIncome(selected)}>+ Receita</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddExpense(selected)}>+ Despesa</button>
        </div>
      </div>

      {/* Month tabs */}
      <div className="month-tabs" role="tablist">
        {months.map((ym) => (
          <button
            key={ym}
            type="button"
            role="tab"
            aria-selected={ym === selected}
            className={`month-tab ${ym === selected ? 'is-active' : ''} ${ym === cur ? 'is-current' : ''}`}
            onClick={() => setSelected(ym)}
          >
            {ymToShort(ym)}{ym === cur && <span className="month-tab-now"> · atual</span>}
          </button>
        ))}
      </div>

      {/* Saldo do mês */}
      <div className="month-summary">
        <div className="month-summary-cell">
          <span className="kpi-label">RECEITAS VAR.</span>
          <strong className="gain-positive">{eur2(incTotal)}</strong>
        </div>
        <div className="month-summary-cell">
          <span className="kpi-label">DESPESAS VAR.</span>
          <strong className="gain-negative">{eur2(expTotal)}</strong>
        </div>
        <div className="month-summary-cell month-summary-net">
          <span className="kpi-label">SALDO DO MÊS</span>
          <strong className={saldo >= 0 ? 'gain-positive' : 'gain-negative'}>{eurSigned(saldo)}</strong>
          <span className="muted" style={{ fontSize: 11 }}>inclui fixas recorrentes</span>
        </div>
      </div>

      {/* Merchant-grouped list */}
      {groups.length === 0 ? (
        <div className="card card-pad-lg muted">Sem movimentos variáveis neste mês. Importa um extrato ou adiciona manualmente.</div>
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
                    aria-label={`Selecionar ${g.name}`}
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
                    {g.txns.map((t) => {
                      const it = t.item
                      return (
                        <li key={idOf(t)} className={`merchant-txn ${checked.has(idOf(t)) ? 'is-selected' : ''}`}>
                          <input
                            type="checkbox" className="var-check"
                            checked={checked.has(idOf(t))}
                            onChange={() => toggleTxn(t)}
                            aria-label={`Selecionar ${it.name}`}
                          />
                          <div className="merchant-txn-main">
                            <span className="merchant-txn-date">
                              {it.dayOfMonth ? `dia ${it.dayOfMonth}` : ymToShort(monthOf(it))}
                            </span>
                            <span className="merchant-txn-source">{it.source ?? 'Manual'}</span>
                            {it.category && <span className="merchant-txn-cat">{it.category}</span>}
                          </div>
                          <span className={`merchant-txn-value ${t.kind === 'income' ? 'gain-positive' : 'gain-negative'}`}>
                            {t.kind === 'income' ? '+' : '−'}{eur2(it.amount)}
                          </span>
                          <button
                            type="button" className="btn btn-ghost btn-sm"
                            onClick={() => (t.kind === 'income' ? onEditIncome(it as Income) : onEditExpense(it as Expense))}
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
