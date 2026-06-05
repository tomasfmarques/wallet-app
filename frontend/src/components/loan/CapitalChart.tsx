import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import type { ChartData, ChartOptions } from 'chart.js'
import { eur, ymToShort } from '@/lib/format'

interface Series {
  label: string
  rows: Array<{ ym: string; capital: number }>
  colour: string
  fill?: boolean
}

interface Props {
  series: Series[]
  height?: number
  /** Sample every N months — huge schedules choke Chart.js otherwise. */
  sampleEvery?: number
}

// Line chart of remaining capital over time. Accepts 1+ series so the same
// component renders both the "tracking mensal" single curve and the simulator
// comparison.
export function CapitalChart({ series, height = 280, sampleEvery = 6 }: Props) {
  const { data, options } = useMemo(() => {
    // Build labels from the longest series so X-axis covers everything
    const longest = series.reduce(
      (best, s) => (s.rows.length > best.rows.length ? s : best),
      series[0] ?? { rows: [] as Array<{ ym: string; capital: number }> },
    )
    const sampledIdx: number[] = []
    for (let i = 0; i < longest.rows.length; i += sampleEvery) sampledIdx.push(i)
    // Always include the last point
    if (sampledIdx[sampledIdx.length - 1] !== longest.rows.length - 1) {
      sampledIdx.push(longest.rows.length - 1)
    }
    const labels = sampledIdx.map((i) => ymToShort(longest.rows[i].ym))

    const datasets = series.map((s) => {
      // Build a YM → capital map for alignment
      const m = new Map(s.rows.map((r) => [r.ym, r.capital]))
      const points = sampledIdx.map((i) => {
        const ym = longest.rows[i].ym
        return m.get(ym) ?? null
      })
      return {
        label: s.label,
        data: points,
        borderColor: s.colour,
        backgroundColor: s.colour + '22',
        fill: !!s.fill,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
        spanGaps: true,
      }
    })

    const chartData: ChartData<'line'> = { labels, datasets }

    const opts: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: series.length > 1,
          position: 'top',
          align: 'end',
          labels: { boxWidth: 12, boxHeight: 12, padding: 12 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${ctx.parsed.y != null ? eur(ctx.parsed.y) : '—'}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 8, autoSkip: true },
        },
        y: {
          grid: { color: '#F1F5F9' },
          ticks: { callback: (v) => eur(Number(v)) },
          beginAtZero: true,
        },
      },
    }

    return { data: chartData, options: opts }
  }, [series, sampleEvery])

  return (
    <div className="chart-wrap" style={{ height }}>
      <Line data={data} options={options} />
    </div>
  )
}

export default CapitalChart
