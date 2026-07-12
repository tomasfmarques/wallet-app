import { Line } from 'react-chartjs-2'
import type { ChartData, ChartOptions } from 'chart.js'
import { useChartColors } from '@/lib/chartTheme'
import { ymToShort } from '@/lib/format'

// Lazy-loaded chart for the public credit/compare simulators (loaded via
// React.lazy from the tool pages so Chart.js's rendering code stays out of
// those pages' initial chunk — see docs/landing-spec.md A3 "no Chart.js on
// first paint"). Chart.js itself is registered once in main.tsx (chartSetup),
// shared app-wide, same as every other chart in the product.

export interface CapitalPoint { ym: string; capital: number }

interface Props {
  series: { label: string; points: CapitalPoint[]; color: string }[]
}

export function AmortizationChart({ series }: Props) {
  const cc = useChartColors()
  const labels = series[0]?.points.map((p) => ymToShort(p.ym)) ?? []

  const data: ChartData<'line'> = {
    labels,
    datasets: series.map((s) => ({
      label: s.label,
      data: s.points.map((p) => p.capital),
      borderColor: s.color,
      backgroundColor: `${s.color}22`,
      fill: series.length === 1,
      tension: 0.2,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 2,
    })),
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: series.length > 1, position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12, padding: 10, color: cc.text } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 6, autoSkip: true, color: cc.text } },
      y: { grid: { color: cc.grid }, ticks: { color: cc.text }, beginAtZero: true },
    },
  }

  return (
    <div className="chart-wrap" style={{ height: 260 }}>
      <Line data={data} options={options} />
    </div>
  )
}

export default AmortizationChart
