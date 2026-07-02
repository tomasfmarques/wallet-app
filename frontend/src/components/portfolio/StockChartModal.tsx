import { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { useTranslation, Trans } from 'react-i18next'
import type { ChartData, ChartOptions } from 'chart.js'
import { Modal } from '@/components/ui/Modal'
import { useStockHistory, type HistoryRange } from '@/hooks/useQuotes'
import { pctSigned, localeTag } from '@/lib/format'
import { useChartColors } from '@/lib/chartTheme'

interface Props {
  open: boolean
  onClose: () => void
  symbol: string
  name: string
}

const RANGE_KEYS = [
  { key: '1mo', labelKey: 'chart.range1m' },
  { key: '6mo', labelKey: 'chart.range6m' },
  { key: '1y', labelKey: 'chart.range1y' },
  { key: '5y', labelKey: 'chart.range5y' },
  { key: 'max', labelKey: 'chart.rangeMax' },
] as const

const GREEN = '#059669'
const RED = '#DC2626'

function money(v: number, currency: string | null): string {
  const cur = currency || 'EUR'
  try {
    return new Intl.NumberFormat(localeTag(), { style: 'currency', currency: cur }).format(v)
  } catch {
    // Yahoo sometimes returns subunit codes (GBp, ZAc) Intl rejects
    return `${v.toLocaleString(localeTag(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`
  }
}

function labelFor(ts: number, range: HistoryRange): string {
  const d = new Date(ts * 1000)
  if (range === '1mo' || range === '6mo') return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short' })
  if (range === '1y') return d.toLocaleDateString(localeTag(), { month: 'short', year: '2-digit' })
  return d.toLocaleDateString(localeTag(), { month: 'short', year: 'numeric' })
}

export function StockChartModal({ open, onClose, symbol, name }: Props) {
  const { t } = useTranslation('portfolio')
  const cc = useChartColors()
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
          ticks: { maxTicksLimit: 6, autoSkip: true, maxRotation: 0, color: cc.text },
        },
        y: {
          position: 'right',
          grid: { color: cc.grid },
          ticks: { maxTicksLimit: 5, color: cc.text, callback: (v) => money(Number(v), cur) },
        },
      },
    }
    return { chartData: cData, chartOptions: cOpts }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, range, colour, up, data?.currency, cc.grid, cc.text])

  return (
    <Modal open={open} onClose={onClose} title={`${name} · ${symbol.toUpperCase()}`} maxWidth={680}>
      <div className="stock-chart">
        {hasData && (
          <div className="stock-chart-head">
            <div className="stock-chart-price">{money(data!.currentPrice ?? last, data!.currency)}</div>
            <div className={`stock-chart-change ${up ? 'gain-positive' : 'gain-negative'}`}>
              {up ? '▲' : '▼'} {money(Math.abs(change), data!.currency)} ({pctSigned(changePct)})
              <span className="muted"> · {t(RANGE_KEYS.find((r) => r.key === range)?.labelKey ?? 'chart.range1y')}</span>
            </div>
          </div>
        )}

        <div className="stock-chart-canvas">
          {isLoading && <div className="stock-chart-state"><div className="spinner" /></div>}
          {!isLoading && (isError || !hasData) && (
            <div className="stock-chart-state muted">
              <Trans i18nKey="chart.noData" ns="portfolio" values={{ symbol: symbol.toUpperCase() }} components={{ 1: <strong /> }} />
              {data?.resolvedSymbol === null && t('chart.symbolMaybeMissing')}
            </div>
          )}
          {!isLoading && hasData && <Line data={chartData} options={chartOptions} />}
        </div>

        <div className="stock-chart-ranges" role="tablist">
          {RANGE_KEYS.map((r) => (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={range === r.key}
              className={`stock-range-btn ${range === r.key ? 'is-active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>

        {data?.resolvedSymbol && data.resolvedSymbol !== symbol.toUpperCase() && (
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            {t('chart.source', { symbol: data.resolvedSymbol })}
          </p>
        )}
      </div>
    </Modal>
  )
}

export default StockChartModal
