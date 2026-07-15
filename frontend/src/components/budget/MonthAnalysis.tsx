import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryDonut } from './CategoryDonut'
import { Modal } from '@/components/ui/Modal'
import { eur, eurSigned, ymToLong, currentYm, ymAddMonths } from '@/lib/format'
import { categoryLabel } from '@/lib/categoryDictionary'
import { realMonth } from '@/lib/budgetReal'
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
  const { t } = useTranslation('budget')
  const today = currentYm()
  // Category drill-down from a donut slice (null category = uncategorized).
  const [donutFilter, setDonutFilter] = useState<{ list: 'fixed' | 'variable' | 'income'; category: string | null } | null>(null)

  const planned = useMemo<Lane>(() => laneFrom(
    incomes.filter((i) => isActiveInMonth(i, ym)),
    expenses.filter((e) => e.type === 'fixed' && isActiveInMonth(e, ym)),
    expenses.filter((e) => e.type === 'variable' && isActiveInMonth(e, ym)),
  ), [incomes, expenses, ym])

  // "Real" = imported actuals for the month + recurring fixed plan rows folded
  // in (they're auto-matched to the plan on import, not duplicated as actuals).
  const rm = useMemo(
    () => realMonth(incomes, expenses, actualIncomes, actualExpenses, ym),
    [incomes, expenses, actualIncomes, actualExpenses, ym],
  )
  const real = useMemo<Lane>(
    () => laneFrom(rm.incomes, rm.fixedExpenses, rm.variableExpenses),
    [rm],
  )

  const hasReal = rm.hasActuals

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
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChangeYm(ymAddMonths(ym, -1))} aria-label={t('monthAnalysis.prevMonth')}>‹</button>
        <div className="month-analysis-title">
          <strong>{ymToLong(ym)}</strong>
          {ym === today && <span className="month-now-pill">{t('monthAnalysis.current')}</span>}
          {ym > today && <span className="month-now-pill is-future">{t('monthAnalysis.planned')}</span>}
          {hasReal && <span className="month-now-pill is-real">{t('monthAnalysis.real')}</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChangeYm(ymAddMonths(ym, 1))} aria-label={t('monthAnalysis.nextMonth')}>›</button>
        {ym !== today && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChangeYm(today)}>{t('monthAnalysis.today')}</button>
        )}
      </div>

      {isEmpty ? (
        <div className="card card-pad-lg muted">{t('monthAnalysis.empty', { month: ymToLong(ym) })}</div>
      ) : (
        <>
          <div className="kpi-grid">
            <PvaKpi label={t('monthAnalysis.incomes')} planned={planned.incomeTotal} real={real.incomeTotal} hasReal={hasReal} goodWhenRealHigher />
            <PvaKpi label={t('monthAnalysis.fixedExpenses')} planned={planned.fixedTotal} real={real.fixedTotal} hasReal={hasReal} goodWhenRealHigher={false} />
            <PvaKpi label={t('monthAnalysis.variableExpenses')} planned={planned.variableTotal} real={real.variableTotal} hasReal={hasReal} goodWhenRealHigher={false} />
            <div className={`kpi ${(hasReal ? real.net : planned.net) >= 0 ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
              <div className="kpi-label">{t('monthAnalysis.monthBalance')}{hasReal ? t('monthAnalysis.realSuffix') : ''}</div>
              <div className="kpi-value">{eurSigned(hasReal ? real.net : planned.net)}</div>
              {hasReal
                ? <VarianceMeta planned={planned.net} real={real.net} goodWhenRealHigher />
                : <div className="kpi-meta">{t('monthAnalysis.plannedMeta')}</div>}
            </div>
          </div>

          <section>
            <h2 className="section-label">
              {t('monthAnalysis.categoriesOf', { month: ymToLong(ym).toUpperCase() })}{hasReal ? t('monthAnalysis.realTag') : t('monthAnalysis.plannedTag')}
            </h2>
            <div className="donut-grid">
              <CategoryDonut items={shown.fixedItems} title={t('donutTitles.fixedExpenses')} totalSuffix="" emptyText={t('monthAnalysis.emptyFixed')} onSliceClick={(category) => setDonutFilter({ list: 'fixed', category })} />
              <CategoryDonut items={shown.variableItems} title={t('donutTitles.variableExpenses')} totalSuffix="" emptyText={t('monthAnalysis.emptyVariable')} onSliceClick={(category) => setDonutFilter({ list: 'variable', category })} />
              <CategoryDonut items={shown.incomeItems} title={t('donutTitles.incomes')} totalSuffix="" emptyText={t('monthAnalysis.emptyIncome')} onSliceClick={(category) => setDonutFilter({ list: 'income', category })} />
            </div>
          </section>

          {topExpenses.length > 0 && (
            <section>
              <h2 className="section-label">{t('monthAnalysis.topExpenses')}</h2>
              <div className="card top-expenses">
                {topExpenses.map((e) => {
                  const share = expenseTotal > 0 ? e.amount / expenseTotal : 0
                  return (
                    <div key={e.id} className="top-exp-row">
                      <div className="top-exp-main">
                        <span className="top-exp-name">{e.name}</span>
                        <span className="top-exp-meta muted">
                          {(e.category && e.category.trim()) ? categoryLabel(e.category) : t('monthAnalysis.uncategorized')}
                          {' · '}{e.type === 'fixed' ? t('kind.fixedF') : t('kind.variableF')}
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

      {donutFilter && (() => {
        // Same lane + bucketing as the clicked donut (active, amount > 0,
        // empty/whitespace category → the uncategorized bucket).
        const source: Array<Income | Expense> =
          donutFilter.list === 'fixed' ? shown.fixedItems
          : donutFilter.list === 'variable' ? shown.variableItems
          : shown.incomeItems
        const filterRows = source
          .filter((r) => r.active && r.amount > 0 && ((r.category?.trim() || null) === donutFilter.category))
          .sort((a, b) => b.amount - a.amount)
        const filterTotal = filterRows.reduce((s, r) => s + r.amount, 0)
        const donutTitle = t(`donutTitles.${donutFilter.list === 'fixed' ? 'fixedExpenses' : donutFilter.list === 'variable' ? 'variableExpenses' : 'incomes'}`)
        return (
          <Modal
            open onClose={() => setDonutFilter(null)}
            title={donutFilter.category ? categoryLabel(donutFilter.category) : t('donut.uncategorized')}
            maxWidth={480}
          >
            <p className="muted" style={{ marginTop: 0 }}>
              {t('donut.filterSubtitle', { title: donutTitle, count: filterRows.length })}
            </p>
            <ul className="donut-filter-list">
              {filterRows.map((r) => (
                <li key={r.id}>
                  <span className="donut-filter-name">
                    {r.name}
                    {r.startYm && <span className="muted"> · {r.startYm}</span>}
                  </span>
                  <span className="donut-filter-amount">{eur(r.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="donut-filter-total">
              <span>{t('donut.totalPrefix')}</span>
              <strong>{eur(filterTotal)}</strong>
            </div>
          </Modal>
        )
      })()}
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
  const { t } = useTranslation('budget')
  return (
    <div className="kpi">
      <div className="kpi-label">{label}{hasReal ? t('monthAnalysis.realSuffix') : ''}</div>
      <div className="kpi-value">{eur(hasReal ? real : planned)}</div>
      {hasReal
        ? <VarianceMeta planned={planned} real={real} goodWhenRealHigher={goodWhenRealHigher} />
        : <div className="kpi-meta">{t('monthAnalysis.plannedMeta')}</div>}
    </div>
  )
}

// "vs planeado X" with a colour cue on the difference.
function VarianceMeta({ planned, real, goodWhenRealHigher }: { planned: number; real: number; goodWhenRealHigher: boolean }) {
  const { t } = useTranslation('budget')
  const delta = real - planned
  if (Math.abs(delta) < 0.005) {
    return <div className="kpi-meta">{t('monthAnalysis.equalToPlanned', { planned: eur(planned) })}</div>
  }
  const isGood = goodWhenRealHigher ? delta > 0 : delta < 0
  return (
    <div className="kpi-meta">
      <span className={isGood ? 'gain-positive' : 'gain-negative'}>{eurSigned(delta)}</span>
      {' '}{t('monthAnalysis.vsPlanned', { planned: eur(planned) })}
    </div>
  )
}

export default MonthAnalysis
