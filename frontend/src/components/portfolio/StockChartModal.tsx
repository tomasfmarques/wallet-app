import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import type { ChartData, ChartOptions } from 'chart.js'
import { Modal } from '@/components/ui/Modal'
import { useStockHistory, type HistoryRange } from '@/hooks/useQuotes'
import { pctSigned } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
  symbol: string
  name: string
}

const RANGES: { key: HistoryRange; label: string }[] = [
  { key: '1mo', label: '1M' },
  { key: '6mo', label: '6M' },
  { key: '1y', label: '1A' },
  { key: '5y', label: '5A' },
  { key: 'max', label: 'Máx' },
]

const GREEN = '#059669'
const RED = '#DC2626'

function money(v: number, currency: string | null): string {
  const cur = currency || 'EUR'
  try {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur }).format(v)
  } catch {
    // Yahoo sometimes returns subunit codes (GBp, ZAc) Intl rejects
    return `${v.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
  }
}

function labelFor(t: number, range: HistoryRange): string {
  const d = new Date(t * 1000)
  if (range === '1mo' || range === '6mo') return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
  if (range === '1y') return d.toLocaleDateString('pt-PT', { month: 'short', year: '2-digit' })
  return d.toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })
}

export function StockChartModal({ open, onClose, symbol, name }: Props) {
  const [range, setRange] = useState<HistoryRange>('1y')
  const { data, isLoading, isError } = useStockHistory(open ? symbol : undefined, range)

  const points = data?.points ?? []
  const hasData = points.length >= 2
  const first = hasData ? points[0].price : 0
  const last = hasData ? points[points.length - 1].price : 0
  const change = last - first
  const changePct = first > 0 ? change / first : 0
  const up = change >= 0
  const colour = up ? GREEN : RED

  const { chartData, chartOptions } = useMemo(() => {
    const labels = points.map((p) => labelFor(p.t, range))
    const series = points.map((p) => p.price)
    const cData: ChartData<'line'> = {
      labels,
      datasets: [
        {
          data: series,
          borderColor: colour,
          borderWidth: 2,
          fill: true,
          backgroundColor: (ctx) => {
            const { ctx: c, chartArea } = ctx.chart
            if (!chartArea) return 'transparent'
            const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
            g.addColorStop(0, up ? 'rgba(5,150,105,0.18)' : 'rgba(220,38,38,0.18)')
            g.addColorStop(1, 'rgba(255,255,255,0)')
            return g
          },
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: colour,
          tension: 0.15,
        },
      ],
    }
    const cur = data?.currency ?? null
    const cOpts: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => items[0]?.label ?? '',
            label: (ctx) => money(Number(ctx.parsed.y), cur),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 6, autoSkip: true, maxRotation: 0 },
        },
        y: {
          position: 'right',
          grid: { color: '#F1F5F9' },
          ticks: { maxTicksLimit: 5, callback: (v) => money(Number(v), cur) },
        },
      },
    }
    return { chartData: cData, chartOptions: cOpts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, range, colour, up, data?.currency])

  return (
    <Modal open={open} onClose={onClose} title={`${name} · ${symbol.toUpperCase()}`} maxWidth={680}>
      <div className="stock-chart">
        {hasData && (
          <div className="stock-chart-head">
            <div className="stock-chart-price">{money(data!.currentPrice ?? last, data!.currency)}</div>
            <div className={`stock-chart-change ${up ? 'gain-positive' : 'gain-negative'}`}>
              {up ? '▲' : '▼'} {money(Math.abs(change), data!.currency)} ({pctSigned(changePct)})
              <span className="muted"> · {RANGES.find((r) => r.key === range)?.label}</span>
            </div>
          </div>
        )}

        <div className="stock-chart-canvas">
          {isLoading && <div className="stock-chart-state"><div className="spinner" /></div>}
          {!isLoading && (isError || !hasData) && (
            <div className="stock-chart-state muted">
              Sem dados de cotação para <strong>{symbol.toUpperCase()}</strong>.
              {data?.resolvedSymbol === null && ' O símbolo pode não existir na Yahoo Finance.'}
            </div>
          )}
          {!isLoading && hasData && <Line data={chartData} options={chartOptions} />}
        </div>

        <div className="stock-chart-ranges" role="tablist">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={`stock-range-btn ${range === r.key ? 'is-active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>

        {data?.resolvedSymbol && data.resolvedSymbol !== symbol.toUpperCase() && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Fonte: Yahoo Finance · {data.resolvedSymbol}
          </p>
        )}
      </div>
    </Modal>
  )
}

export default StockChartModal
