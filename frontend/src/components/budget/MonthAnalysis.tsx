import { useMemo } from 'react'
import { CategoryDonut } from './CategoryDonut'
import { eur, eurSigned, ymToLong, currentYm, ymAddMonths } from '@/lib/format'
import type { Income, Expense } from '@/types'

interface Props {
  incomes: Income[]
  expenses: Expense[]
  ym: string
  onChangeYm: (ym: string) => void
}

interface TimedItem {
  amount: number
  active: boolean
  startYm: string | null
  endYm: string | null
}

function isActiveInMonth(item: TimedItem, ym: string): boolean {
  if (!item.active) return false
  if (item.startYm && ym < item.startYm) return false
  if (item.endYm && ym > item.endYm) return false
  return true
}

interface MonthTotals {
  incomeItems: Income[]
  fixedItems: Expense[]
  variableItems: Expense[]
  incomeTotal: number
  fixedTotal: number
  variableTotal: number
  net: number
}

function totalsFor(incomes: Income[], expenses: Expense[], ym: string): MonthTotals {
  const incomeItems = incomes.filter((i) => isActiveInMonth(i, ym))
  const fixedItems = expenses.filter((e) => e.type === 'fixed' && isActiveInMonth(e, ym))
  const variableItems = expenses.filter((e) => e.type === 'variable' && isActiveInMonth(e, ym))
  const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + r.amount, 0)
  const incomeTotal = sum(incomeItems)
  const fixedTotal = sum(fixedItems)
  const variableTotal = sum(variableItems)
  return {
    incomeItems, fixedItems, variableItems,
    incomeTotal, fixedTotal, variableTotal,
    net: incomeTotal - fixedTotal - variableTotal,
  }
}

// Month-by-month drill-down for the Análise tab: KPIs with deltas vs the
// previous month, category donuts scoped to the chosen month, and the
// biggest expenses ranked.
export function MonthAnalysis({ incomes, expenses, ym, onChangeYm }: Props) {
  const today = currentYm()

  const cur = useMemo(() => totalsFor(incomes, expenses, ym), [incomes, expenses, ym])
  const prev = useMemo(
    () => totalsFor(incomes, expenses, ymAddMonths(ym, -1)),
    [incomes, expenses, ym],
  )

  const expenseTotal = cur.fixedTotal + cur.variableTotal
  const topExpenses = useMemo(
    () => [...cur.fixedItems, ...cur.variableItems]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6),
    [cur.fixedItems, cur.variableItems],
  )

  const isEmpty = cur.incomeItems.length === 0
    && cur.fixedItems.length === 0 && cur.variableItems.length === 0

  return (
    <>
      <div className="month-analysis-head">
        <button
          type="button" className="btn btn-ghost btn-sm"
          onClick={() => onChangeYm(ymAddMonths(ym, -1))}
          aria-label="Mês anterior"
        >‹</button>
        <div className="month-analysis-title">
          <strong>{ymToLong(ym)}</strong>
          {ym === today && <span className="month-now-pill">atual</span>}
          {ym > today && <span className="month-now-pill is-future">planeado</span>}
        </div>
        <button
          type="button" className="btn btn-ghost btn-sm"
          onClick={() => onChangeYm(ymAddMonths(ym, 1))}
          aria-label="Mês seguinte"
        >›</button>
        {ym !== today && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChangeYm(today)}>
            Hoje
          </button>
        )}
      </div>

      {isEmpty ? (
        <div className="card card-pad-lg muted">
          Sem movimentos registados em {ymToLong(ym)}.
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <MonthKpi
              label="RECEITAS" value={cur.incomeTotal}
              delta={cur.incomeTotal - prev.incomeTotal} deltaGoodWhenPositive
            />
            <MonthKpi
              label="DESPESAS FIXAS" value={cur.fixedTotal}
              delta={cur.fixedTotal - prev.fixedTotal} deltaGoodWhenPositive={false}
            />
            <MonthKpi
              label="DESPESAS VARIÁVEIS" value={cur.variableTotal}
              delta={cur.variableTotal - prev.variableTotal} deltaGoodWhenPositive={false}
            />
            <div className={`kpi ${cur.net >= 0 ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
              <div className="kpi-label">SALDO DO MÊS</div>
              <div className="kpi-value">{eurSigned(cur.net)}</div>
              <DeltaMeta delta={cur.net - prev.net} goodWhenPositive />
            </div>
          </div>

          <section>
            <h2 className="section-label">CATEGORIAS DE {ymToLong(ym).toUpperCase()}</h2>
            <div className="donut-grid">
              <CategoryDonut
                items={cur.fixedItems}
                title="Despesas fixas"
                totalSuffix=""
                emptyText="Sem despesas fixas neste mês."
              />
              <CategoryDonut
                items={cur.variableItems}
                title="Despesas variáveis"
                totalSuffix=""
                emptyText="Sem despesas variáveis neste mês."
              />
              <CategoryDonut
                items={cur.incomeItems}
                title="Receitas"
                totalSuffix=""
                emptyText="Sem receitas neste mês."
              />
            </div>
          </section>

          {topExpenses.length > 0 && (
            <section>
              <h2 className="section-label">MAIORES DESPESAS DO MÊS</h2>
              <div className="card top-expenses">
                {topExpenses.map((e) => {
                  const share = expenseTotal > 0 ? e.amount / expenseTotal : 0
                  return (
                    <div key={e.id} className="top-exp-row">
                      <div className="top-exp-main">
                        <span className="top-exp-name">{e.name}</span>
                        <span className="top-exp-meta muted">
                          {(e.category && e.category.trim()) || 'Por classificar'}
                          {' · '}{e.type === 'fixed' ? 'fixa' : 'variável'}
                        </span>
                        <div className="top-exp-bar">
                          <div className="top-exp-bar-fill" style={{ width: `${Math.min(100, share * 100)}%` }} />
                        </div>
                      </div>
                      <div className="top-exp-amount">
                        {eur(e.amount)}
                        <span className="muted top-exp-share">{(share * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

function MonthKpi({ label, value, delta, deltaGoodWhenPositive }: {
  label: string
  value: number
  delta: number
  deltaGoodWhenPositive: boolean
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{eur(value)}</div>
      <DeltaMeta delta={delta} goodWhenPositive={deltaGoodWhenPositive} />
    </div>
  )
}

function DeltaMeta({ delta, goodWhenPositive }: { delta: number; goodWhenPositive: boolean }) {
  if (Math.abs(delta) < 0.005) {
    return <div className="kpi-meta">igual ao mês anterior</div>
  }
  const isGood = goodWhenPositive ? delta > 0 : delta < 0
  return (
    <div className="kpi-meta">
      <span className={isGood ? 'gain-positive' : 'gain-negative'}>{eurSigned(delta)}</span>
      {' '}vs mês anterior
    </div>
  )
}

export default MonthAnalysis
