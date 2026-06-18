import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'
import type { ChartData, ChartOptions } from 'chart.js'
import { eur, ymToShort, currentYm } from '@/lib/format'
import { realMonth } from '@/lib/budgetReal'
import type { Income, Expense } from '@/types'

interface Props {
  incomes: Income[]              // recurring PLAN
  expenses: Expense[]
  actualIncomes?: Income[]       // imported actuals — used where a month has them
  actualExpenses?: Expense[]
  months?: number   // default 12 (rolling year)
  endAt?: string    // default current YM (rolling window ends here)
  futureMonths?: number  // optional months in the future to show planned
  onMonthClick?: (ym: string) => void  // bar click → drill into that month
}

interface TimedItem {
  amount: number
  active: boolean
  startYm: string | null
  endYm: string | null
}

function ymAddMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny.toString().padStart(4, '0')}-${nm.toString().padStart(2, '0')}`
}

function isActiveInMonth(item: TimedItem, ym: string): boolean {
  if (!item.active) return false
  if (item.startYm && ym < item.startYm) return false
  if (item.endYm && ym > item.endYm) return false
  return true
}

// Bar chart showing the last N months of income / fixed / variable, with a
// net-line overlay. Honours each row's startYm/endYm so historical months
// reflect what was actually active back then (e.g. salary started in March).
export function BudgetTimeline({
  incomes, expenses, actualIncomes = [], actualExpenses = [],
  months = 12, endAt, futureMonths = 0, onMonthClick,
}: Props) {
  const { t } = useTranslation('budget')
  const today = endAt ?? currentYm()
  const totalMonths = months + futureMonths

  const { chartData, chartOptions, avgNet } = useMemo(() => {
    const start = ymAddMonths(today, -(months - 1))
    const labels: string[] = []
    const yms: string[] = []
    const incomeSeries: number[] = []
    const fixedSeries: number[] = []
    const variableSeries: number[] = []
    const netSeries: number[] = []

    for (let i = 0; i < totalMonths; i++) {
      const ym = ymAddMonths(start, i)
      yms.push(ym)
      labels.push(ymToShort(ym))
      // Prefer the REAL (imported) figures for any month that has actuals;
      // fall back to the recurring PLAN for months without imports (FX1). Real
      // months fold recurring fixed plan rows back in (they're auto-matched to
      // the plan on import, not duplicated as actuals) — see lib/budgetReal.ts.
      const sumAmt = (rows: Array<{ amount: number }>) => rows.reduce((s, x) => s + x.amount, 0)
      const rm = realMonth(incomes, expenses, actualIncomes, actualExpenses, ym)
      const inc = rm.hasActuals ? sumAmt(rm.incomes) : sumAmt(incomes.filter((x) => isActiveInMonth(x, ym)))
      const fixed = rm.hasActuals ? sumAmt(rm.fixedExpenses) : sumAmt(expenses.filter((x) => x.type === 'fixed' && isActiveInMonth(x, ym)))
      const variable = rm.hasActuals ? sumAmt(rm.variableExpenses) : sumAmt(expenses.filter((x) => x.type === 'variable' && isActiveInMonth(x, ym)))
      incomeSeries.push(inc)
      fixedSeries.push(fixed)
      variableSeries.push(variable)
      netSeries.push(inc - fixed - variable)
    }

    const data: ChartData<'bar'> = {
      labels,
      datasets: [
        {
          type: 'bar',
          label: t('timeline.incomes'),
          data: incomeSeries,
          backgroundColor: '#059669CC',
          borderRadius: 4,
          stack: 'income',
          order: 2,
        },
        {
          type: 'bar',
          label: t('timeline.fixedExpenses'),
          data: fixedSeries.map((v) => -v),
          backgroundColor: '#DC2626CC',
          borderRadius: 4,
          stack: 'expense',
          order: 2,
        },
        {
          type: 'bar',
          label: t('timeline.variableExpenses'),
          data: variableSeries.map((v) => -v),
          backgroundColor: '#F97316CC',
          borderRadius: 4,
          stack: 'expense',
          order: 2,
        },
        // Net line — drawn on top
        {
          type: 'line' as unknown as 'bar',
          label: t('timeline.balance'),
          data: netSeries,
          borderColor: '#2563EB',
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: '#2563EB',
          order: 1,
        } as unknown as ChartData<'bar'>['datasets'][number],
      ],
    }

    const opts: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      onClick: (_evt, elements) => {
        if (!onMonthClick || elements.length === 0) return
        const ym = yms[elements[0].index]
        if (ym) onMonthClick(ym)
      },
      onHover: (evt, elements) => {
        const target = evt.native?.target as HTMLElement | undefined
        if (target && onMonthClick) target.style.cursor = elements.length > 0 ? 'pointer' : 'default'
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: { boxWidth: 12, boxHeight: 12, padding: 10 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${eur(Math.abs(Number(ctx.parsed.y)))}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
        },
        y: {
          stacked: true,
          grid: { color: '#F1F5F9' },
          ticks: { callback: (v) => eur(Number(v)) },
        },
      },
    }

    const past = netSeries.slice(0, months)
    const avg = past.length > 0 ? past.reduce((s, v) => s + v, 0) / past.length : 0

    return { chartData: data, chartOptions: opts, avgNet: avg }
  }, [incomes, expenses, actualIncomes, actualExpenses, today, months, totalMonths, onMonthClick, t])

  return (
    <div className="card card-pad-lg">
      <div className="timeline-head">
        <div>
          <h3 className="settings-subhead" style={{ marginBottom: 2 }}>{t('timeline.head', { months })}</h3>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {t('timeline.avg')} <strong className={avgNet >= 0 ? 'gain-positive' : 'gain-negative'}>{t('timeline.avgValue', { value: eur(avgNet) })}</strong>
          </div>
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 280 }}>
        <Bar data={chartData} options={chartOptions} />
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        {t('timeline.footer')}
        {onMonthClick && t('timeline.footerClick')}
      </p>
    </div>
  )
}

export default BudgetTimeline
