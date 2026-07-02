import { useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'
import type { ChartData, ChartOptions } from 'chart.js'
import { eur, ymToShort, currentYm } from '@/lib/format'
import { useChartColors } from '@/lib/chartTheme'
import { StateBlock } from '@/components/ui/StateBlock'
import type { Income, Expense } from '@/types'

interface Props {
  incomes: Income[]
  expenses: Expense[]
}

type Mode = 'month' | 'year'

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

// Cashflow visualization for the Overview page. A segmented toggle switches
// between monthly (last 12 months) and yearly (last 5 years) aggregation.
// Bars show income up (green) and expenses down (red + amber); a blue line
// tracks the resulting net saldo.
export function CashflowChart({ incomes, expenses }: Props) {
  const { t } = useTranslation('overview')
  const [mode, setMode] = useState<Mode>('month')
  const cc = useChartColors()
  const isEmpty = incomes.length === 0 && expenses.length === 0

  const { data, options, summary } = useMemo(() => {
    const today = currentYm()
    const labels: string[] = []
    const incSer: number[] = []
    const fixSer: number[] = []
    const varSer: number[] = []
    const netSer: number[] = []

    if (mode === 'month') {
      const start = ymAddMonths(today, -11)
      for (let i = 0; i < 12; i++) {
        const ym = ymAddMonths(start, i)
        labels.push(ymToShort(ym))
        const inc = incomes.filter((x) => isActiveInMonth(x, ym)).reduce((s, x) => s + x.amount, 0)
        const fixed = expenses.filter((x) => x.type === 'fixed' && isActiveInMonth(x, ym)).reduce((s, x) => s + x.amount, 0)
        const variable = expenses.filter((x) => x.type === 'variable' && isActiveInMonth(x, ym)).reduce((s, x) => s + x.amount, 0)
        incSer.push(inc); fixSer.push(fixed); varSer.push(variable); netSer.push(inc - fixed - variable)
      }
    } else {
      // Yearly: sum monthly contributions across 12 months of each year.
      const currentYear = Number(today.slice(0, 4))
      for (let y = currentYear - 4; y <= currentYear; y++) {
        let inc = 0, fix = 0, vari = 0
        for (let m = 1; m <= 12; m++) {
          const ym = `${y}-${m.toString().padStart(2, '0')}`
          inc += incomes.filter((x) => isActiveInMonth(x, ym)).reduce((s, x) => s + x.amount, 0)
          fix += expenses.filter((x) => x.type === 'fixed' && isActiveInMonth(x, ym)).reduce((s, x) => s + x.amount, 0)
          vari += expenses.filter((x) => x.type === 'variable' && isActiveInMonth(x, ym)).reduce((s, x) => s + x.amount, 0)
        }
        labels.push(String(y))
        incSer.push(inc); fixSer.push(fix); varSer.push(vari); netSer.push(inc - fix - vari)
      }
    }

    const chartData: ChartData<'bar'> = {
      labels,
      datasets: [
        {
          type: 'bar', label: t('cashflow.incomes'), data: incSer,
          backgroundColor: '#059669CC', borderRadius: 6, stack: 'inc', order: 2,
        },
        {
          type: 'bar', label: t('cashflow.fixedExpenses'), data: fixSer.map((v) => -v),
          backgroundColor: '#DC2626CC', borderRadius: 6, stack: 'exp', order: 2,
        },
        {
          type: 'bar', label: t('cashflow.variableExpenses'), data: varSer.map((v) => -v),
          backgroundColor: '#F97316CC', borderRadius: 6, stack: 'exp', order: 2,
        },
        {
          type: 'line' as unknown as 'bar',
          label: t('cashflow.balance'),
          data: netSer,
          borderColor: '#2563EB',
          backgroundColor: '#2563EB',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#2563EB',
          order: 1,
        } as unknown as ChartData<'bar'>['datasets'][number],
      ],
    }

    const opts: ChartOptions<'bar'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top', align: 'end',
          labels: { boxWidth: 12, boxHeight: 12, padding: 12, font: { size: 12 }, color: cc.text },
        },
        tooltip: {
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${eur(Math.abs(Number(ctx.parsed.y)))}` },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: cc.text } },
        y: { stacked: true, grid: { color: cc.grid }, ticks: { color: cc.text, callback: (v) => eur(Number(v)) } },
      },
    }

    const totals = {
      income: incSer.reduce((s, v) => s + v, 0),
      expenses: fixSer.reduce((s, v) => s + v, 0) + varSer.reduce((s, v) => s + v, 0),
      net: netSer.reduce((s, v) => s + v, 0),
    }
    return { data: chartData, options: opts, summary: totals }
  }, [incomes, expenses, mode, t, cc.grid, cc.text])

  // No budget data yet → a friendly prompt instead of an empty axes-only chart.
  if (isEmpty) {
    return (
      <StateBlock
        variant="empty"
        icon="barChart"
        message={t('cashflow.empty')}
      />
    )
  }

  return (
    <div className="card card-pad-lg cashflow-card">
      <div className="cashflow-head">
        <div>
          <h2 className="cashflow-title">{t('cashflow.title')}</h2>
          <div className="muted cashflow-sub">
            {mode === 'month' ? t('cashflow.totalMonth') : t('cashflow.totalYear')}{' '}
            <strong className={summary.net >= 0 ? 'gain-positive' : 'gain-negative'}>{eur(summary.net)}</strong>
          </div>
        </div>
        <div className="cashflow-toggle" role="tablist">
          <button
            type="button" role="tab" aria-selected={mode === 'month'}
            className={`cashflow-toggle-btn ${mode === 'month' ? 'is-active' : ''}`}
            onClick={() => setMode('month')}
          >{t('cashflow.month')}</button>
          <button
            type="button" role="tab" aria-selected={mode === 'year'}
            className={`cashflow-toggle-btn ${mode === 'year' ? 'is-active' : ''}`}
            onClick={() => setMode('year')}
          >{t('cashflow.year')}</button>
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 300 }}>
        <Bar data={data} options={options} />
      </div>
    </div>
  )
}

export default CashflowChart
