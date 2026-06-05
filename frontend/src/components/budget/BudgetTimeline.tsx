import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import type { ChartData, ChartOptions } from 'chart.js'
import { eur, ymToShort, currentYm } from '@/lib/format'
import type { Income, Expense } from '@/types'

interface Props {
  incomes: Income[]
  expenses: Expense[]
  months?: number   // default 12 (rolling year)
  endAt?: string    // default current YM (rolling window ends here)
  futureMonths?: number  // optional months in the future to show planned
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
  incomes, expenses, months = 12, endAt, futureMonths = 0,
}: Props) {
  const today = endAt ?? currentYm()
  const totalMonths = months + futureMonths

  const { chartData, chartOptions, avgNet } = useMemo(() => {
    const start = ymAddMonths(today, -(months - 1))
    const labels: string[] = []
    const incomeSeries: number[] = []
    const fixedSeries: number[] = []
    const variableSeries: number[] = []
    const netSeries: number[] = []

    for (let i = 0; i < totalMonths; i++) {
      const ym = ymAddMonths(start, i)
      labels.push(ymToShort(ym))
      const inc = incomes
        .filter((x) => isActiveInMonth(x, ym))
        .reduce((s, x) => s + x.amount, 0)
      const fixed = expenses
        .filter((x) => x.type === 'fixed' && isActiveInMonth(x, ym))
        .reduce((s, x) => s + x.amount, 0)
      const variable = expenses
        .filter((x) => x.type === 'variable' && isActiveInMonth(x, ym))
        .reduce((s, x) => s + x.amount, 0)
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
          label: 'Receitas',
          data: incomeSeries,
          backgroundColor: '#059669CC',
          borderRadius: 4,
          stack: 'income',
          order: 2,
        },
        {
          type: 'bar',
          label: 'Despesas fixas',
          data: fixedSeries.map((v) => -v),
          backgroundColor: '#DC2626CC',
          borderRadius: 4,
          stack: 'expense',
          order: 2,
        },
        {
          type: 'bar',
          label: 'Despesas variáveis',
          data: variableSeries.map((v) => -v),
          backgroundColor: '#F97316CC',
          borderRadius: 4,
          stack: 'expense',
          order: 2,
        },
        // Net line — drawn on top
        {
          type: 'line' as unknown as 'bar',
          label: 'Saldo',
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
  }, [incomes, expenses, today, months, totalMonths])

  return (
    <div className="card card-pad-lg">
      <div className="timeline-head">
        <div>
          <h3 className="settings-subhead" style={{ marginBottom: 2 }}>Histórico {months} meses</h3>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Saldo médio: <strong className={avgNet >= 0 ? 'gain-positive' : 'gain-negative'}>{eur(avgNet)}/mês</strong>
          </div>
        </div>
      </div>
      <div className="chart-wrap" style={{ height: 280 }}>
        <Bar data={chartData} options={chartOptions} />
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
        Despesas mostradas como barras negativas. Linha azul = saldo final (receitas − despesas) por mês,
        respeitando os campos <em>início</em> e <em>fim</em> de cada registo.
      </p>
    </div>
  )
}

export default BudgetTimeline
