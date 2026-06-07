import { useEffect, useMemo, useState } from 'react'
import { useBulkDeleteBudget } from '@/hooks/useBudget'
import { eur2, eurSigned, ymToShort, currentYm } from '@/lib/format'
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

  const [selInc, setSelInc] = useState<Set<string>>(new Set())
  const [selExp, setSelExp] = useState<Set<string>>(new Set())
  useEffect(() => { setSelInc(new Set()); setSelExp(new Set()) }, [selected])

  const incs = variableIncomes.filter((i) => monthOf(i) === selected)
  const exps = variableExpenses.filter((e) => monthOf(e) === selected)

  const incTotal = sumActive(incs)
  const expTotal = sumActive(exps)
  // Real monthly balance: recurring baseline + this month's variable movements.
  const saldo = fixedIncomeTotal - fixedExpenseTotal + incTotal - expTotal

  const selectedCount = selInc.size + selExp.size
  const removeSelected = async () => {
    if (selectedCount === 0) return
    if (!confirm(`Remover ${selectedCount} transação(ões)? Podes voltar a importá-las depois.`)) return
    await del.mutateAsync({ incomeIds: [...selInc], expenseIds: [...selExp] })
    setSelInc(new Set()); setSelExp(new Set())
  }

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setter(next)
  }

  return (
    <section className="var-block">
      <div className="budget-section-head">
        <h2 className="section-label" style={{ margin: 0 }}>VARIÁVEIS (POR MÊS)</h2>
        {selectedCount > 0 && (
          <button type="button" className="btn btn-danger btn-sm" disabled={del.isLoading} onClick={removeSelected}>
            Remover selecionados ({selectedCount})
          </button>
        )}
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

      <div className="var-cols">
        <VarList
          title="Receitas" rows={incs} selected={selInc}
          onToggle={(id) => toggle(selInc, setSelInc, id)}
          onEdit={(id) => onEditIncome(incs.find((x) => x.id === id)!)}
          onAdd={() => onAddIncome(selected)}
          emptyText="Sem receitas variáveis neste mês."
        />
        <VarList
          title="Despesas" rows={exps} selected={selExp}
          onToggle={(id) => toggle(selExp, setSelExp, id)}
          onEdit={(id) => onEditExpense(exps.find((x) => x.id === id)!)}
          onAdd={() => onAddExpense(selected)}
          emptyText="Sem despesas variáveis neste mês."
        />
      </div>
    </section>
  )
}

interface VarRow { id: string; name: string; amount: number; category: string | null; active: boolean; dayOfMonth?: number | null }
function VarList({
  title, rows, selected, onToggle, onEdit, onAdd, emptyText,
}: {
  title: string
  rows: VarRow[]
  selected: Set<string>
  onToggle: (id: string) => void
  onEdit: (id: string) => void
  onAdd: () => void
  emptyText: string
}) {
  return (
    <div className="var-col">
      <div className="budget-section-head" style={{ marginBottom: 8 }}>
        <h3 className="settings-subhead" style={{ margin: 0 }}>{title}</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onAdd}>+ Adicionar</button>
      </div>
      {rows.length === 0 ? (
        <div className="card card-pad-lg muted">{emptyText}</div>
      ) : (
        <div className="card budget-list">
          <ul>
            {rows.map((r) => (
              <li key={r.id} className={`budget-row var-row ${r.active ? '' : 'is-inactive'} ${selected.has(r.id) ? 'is-selected' : ''}`}>
                <input
                  type="checkbox" className="var-check" checked={selected.has(r.id)}
                  onChange={() => onToggle(r.id)} aria-label={`Selecionar ${r.name}`}
                />
                <div className="budget-row-main">
                  <div className="budget-row-name">{r.name}</div>
                  {(r.category || r.dayOfMonth) && (
                    <div className="budget-row-sub">
                      {r.category
                        ? <span className="budget-row-category">{r.category}</span>
                        : <span className="budget-pill-uncat">por classificar</span>}
                      {r.dayOfMonth && <span className="muted">dia {r.dayOfMonth}</span>}
                    </div>
                  )}
                </div>
                <div className="budget-row-amount">{eur2(r.amount)}</div>
                <div className="budget-row-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onEdit(r.id)}>Editar</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default VariableMonths
