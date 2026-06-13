import { useMemo } from 'react'
import { CategoryDonut } from './CategoryDonut'
import { eur, eurSigned, ymToLong, currentYm, ymAddMonths } from '@/lib/format'
import type { Income, Expense } from '@/types'

interface Props {
  incomes: Income[]          // recurring PLAN (source = null)
  expenses: Expense[]
  actualIncomes: Income[]    // imported one-off realised lines (source set)
  actualExpenses: Expense[]
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

// An imported actual is month-scoped (startYm === endYm); it belongs to the
// month its startYm names.
function isActualInMonth(item: { startYm: string | null }, ym: string): boolean {
  return item.startYm === ym
}

interface Lane {
  incomeItems: Income[]
  fixedItems: Expense[]
  variableItems: Expense[]
  incomeTotal: number
  fixedTotal: number
  variableTotal: number
  net: number
}

const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + r.amount, 0)

function laneFrom(incomeItems: Income[], fixedItems: Expense[], variableItems: Expense[]): Lane {
  const incomeTotal = sum(incomeItems)
  const fixedTotal = sum(fixedItems)
  const variableTotal = sum(variableItems)
  return { incomeItems, fixedItems, variableItems, incomeTotal, fixedTotal, variableTotal, net: incomeTotal - fixedTotal - variableTotal }
}

// Month-by-month drill-down for the Análise tab. Shows the recurring PLAN vs the
// imported REAL (actuals) for the chosen month side by side — never their sum
// (FX1). When the month has no imported actuals we fall back to the plan only.
export function MonthAnalysis({ incomes, expenses, actualIncomes, actualExpenses, ym, onChangeYm }: Props) {
  const today = currentYm()

  const planned = useMemo<Lane>(() => laneFrom(
    incomes.filter((i) => isActiveInMonth(i, ym)),
    expenses.filter((e) => e.type === 'fixed' && isActiveInMonth(e, ym)),
    expenses.filter((e) => e.type === 'variable' && isActiveInMonth(e, ym)),
  ), [incomes, expenses, ym])

  const real = useMemo<Lane>(() => laneFrom(
    actualIncomes.filter((i) => isActualInMonth(i, ym)),
    actualExpenses.filter((e) => e.type === 'fixed' && isActualInMonth(e, ym)),
    actualExpenses.filter((e) => e.type === 'variable' && isActualInMonth(e, ym)),
  ), [actualIncomes, actualExpenses, ym])

  const hasReal = real.incomeItems.length + real.fixedItems.length + real.variableItems.length > 0

  // Category breakdowns + "maiores despesas" reflect what actually happened when
  // the month has actuals, else the plan.
  const shown = hasReal ? real : planned
  const expenseTotal = shown.fixedTotal + shown.variableTotal
  const topExpenses = useMemo(
    () => [...shown.fixedItems, ...shown.variableItems].sort((a, b) => b.amount - a.amount).slice(0, 6),
    [shown.fixedItems, shown.variableItems],
  )

  const isEmpty = !hasReal
    && planned.incomeItems.length === 0 && planned.fixedItems.length === 0 && planned.variableItems.length === 0

  return (
    <>
      <div className="month-analysis-head">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChangeYm(ymAddMonths(ym, -1))} aria-label="Mês anterior">‹</button>
        <div className="month-analysis-title">
          <strong>{ymToLong(ym)}</strong>
          {ym === today && <span className="month-now-pill">atual</span>}
          {ym > today && <span className="month-now-pill is-future">planeado</span>}
          {hasReal && <span className="month-now-pill is-real">real</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChangeYm(ymAddMonths(ym, 1))} aria-label="Mês seguinte">›</button>
        {ym !== today && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChangeYm(today)}>Hoje</button>
        )}
      </div>

      {isEmpty ? (
        <div className="card card-pad-lg muted">Sem movimentos registados em {ymToLong(ym)}.</div>
      ) : (
        <>
          <div className="kpi-grid">
            <PvaKpi label="RECEITAS" planned={planned.incomeTotal} real={real.incomeTotal} hasReal={hasReal} goodWhenRealHigher />
            <PvaKpi label="DESPESAS FIXAS" planned={planned.fixedTotal} real={real.fixedTotal} hasReal={hasReal} goodWhenRealHigher={false} />
            <PvaKpi label="DESPESAS VARIÁVEIS" planned={planned.variableTotal} real={real.variableTotal} hasReal={hasReal} goodWhenRealHigher={false} />
            <div className={`kpi ${(hasReal ? real.net : planned.net) >= 0 ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
              <div className="kpi-label">SALDO DO MÊS{hasReal ? ' (REAL)' : ''}</div>
              <div className="kpi-value">{eurSigned(hasReal ? real.net : planned.net)}</div>
              {hasReal
                ? <VarianceMeta planned={planned.net} real={real.net} goodWhenRealHigher />
                : <div className="kpi-meta">planeado</div>}
            </div>
          </div>

          <section>
            <h2 className="section-label">
              CATEGORIAS DE {ymToLong(ym).toUpperCase()}{hasReal ? ' · REAL' : ' · PLANEADO'}
            </h2>
            <div className="donut-grid">
              <CategoryDonut items={shown.fixedItems} title="Despesas fixas" totalSuffix="" emptyText="Sem despesas fixas neste mês." />
              <CategoryDonut items={shown.variableItems} title="Despesas variáveis" totalSuffix="" emptyText="Sem despesas variáveis neste mês." />
              <CategoryDonut items={shown.incomeItems} title="Receitas" totalSuffix="" emptyText="Sem receitas neste mês." />
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

// Planned-vs-actual KPI: shows the real figure when the month has actuals (with
// the planned figure + variance underneath), otherwise just the plan.
function PvaKpi({ label, planned, real, hasReal, goodWhenRealHigher }: {
  label: string
  planned: number
  real: number
  hasReal: boolean
  goodWhenRealHigher: boolean
}) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}{hasReal ? ' (REAL)' : ''}</div>
      <div className="kpi-value">{eur(hasReal ? real : planned)}</div>
      {hasReal
        ? <VarianceMeta planned={planned} real={real} goodWhenRealHigher={goodWhenRealHigher} />
        : <div className="kpi-meta">planeado</div>}
    </div>
  )
}

// "vs planeado X" with a colour cue on the difference.
function VarianceMeta({ planned, real, goodWhenRealHigher }: { planned: number; real: number; goodWhenRealHigher: boolean }) {
  const delta = real - planned
  if (Math.abs(delta) < 0.005) {
    return <div className="kpi-meta">igual ao planeado ({eur(planned)})</div>
  }
  const isGood = goodWhenRealHigher ? delta > 0 : delta < 0
  return (
    <div className="kpi-meta">
      <span className={isGood ? 'gain-positive' : 'gain-negative'}>{eurSigned(delta)}</span>
      {' '}vs planeado ({eur(planned)})
    </div>
  )
}

export default MonthAnalysis
