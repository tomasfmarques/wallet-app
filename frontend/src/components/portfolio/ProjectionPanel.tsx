import { useEffect, useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { useTranslation } from 'react-i18next'
import type { ChartData, ChartOptions } from 'chart.js'
import { eur, eurCompact } from '@/lib/format'
import { useUpdateSettings, type PortfolioProjectionData } from '@/hooks/usePortfolio'
import type { PortfolioSettings } from '@/types'

interface Props {
  projection: PortfolioProjectionData
  settings: PortfolioSettings
}

// "Parâmetros da projeção" — three sliders that update the persisted settings
// (debounced) and a chart showing the aggregate compound-growth curve.
export function ProjectionPanel({ projection, settings }: Props) {
  const { t } = useTranslation('portfolio')
  const update = useUpdateSettings()
  const [gInc, setGInc] = useState(settings.gInc)
  const [gFY, setGFY]   = useState(settings.gFY)
  const [gH, setGH]     = useState(settings.gH)

  // Sync from server (e.g. after invalidate)
  useEffect(() => { setGInc(settings.gInc) }, [settings.gInc])
  useEffect(() => { setGFY(settings.gFY)   }, [settings.gFY])
  useEffect(() => { setGH(settings.gH)     }, [settings.gH])

  // Debounce writes so dragging a slider doesn't spam the API
  useEffect(() => {
    if (gInc === settings.gInc && gFY === settings.gFY && gH === settings.gH) return
    const t = setTimeout(() => {
      update.mutate({ gInc, gFY, gH })
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gInc, gFY, gH])

  const { chartData, chartOptions } = useMemo(() => {
    // Yearly samples for the chart
    const yearly = []
    for (let y = 0; y < settings.gH; y++) {
      const idx = (y + 1) * 12 - 1
      if (idx < projection.totalRows.length) {
        yearly.push({ year: y + 1, value: projection.totalRows[idx] })
      }
    }
    const data: ChartData<'line'> = {
      labels: yearly.map((p) => t('projection.yearAxis', { year: p.year })),
      datasets: [
        {
          label: t('projection.chartLabel'),
          data: yearly.map((p) => p.value),
          borderColor: '#2563EB',
          backgroundColor: '#2563EB22',
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
      ],
    }
    const opts: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => eur(Number(ctx.parsed.y)) },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#F1F5F9' },
          ticks: { callback: (v) => eurCompact(Number(v)) },
          beginAtZero: true,
        },
      },
    }
    return { chartData: data, chartOptions: opts }
  }, [projection, settings.gH, t])

  return (
    <div className="proj-panel">
      <div className="card card-pad-lg sim-controls">
        <h3 className="section-label" style={{ marginTop: 0 }}>{t('projection.paramsLabel')}</h3>

        <div className="slider-row">
          <label>
            <span>{t('projection.increaseLabel')}</span>
            <strong>{gInc} %</strong>
          </label>
          <input type="range" min={0} max={15} step={1} value={gInc}
            onChange={(e) => setGInc(Number(e.target.value))} />
          <span className="slider-bounds"><span>0 %</span><span>15 %</span></span>
        </div>

        <div className="slider-row">
          <label>
            <span>{t('projection.yearsNoIncrease')}</span>
            <strong>{gFY}</strong>
          </label>
          <input type="range" min={0} max={10} step={1} value={gFY}
            onChange={(e) => setGFY(Number(e.target.value))} />
          <span className="slider-bounds"><span>0</span><span>10</span></span>
        </div>

        <div className="slider-row">
          <label>
            <span>{t('projection.horizon')}</span>
            <strong>{t('projection.horizonValue', { years: gH })}</strong>
          </label>
          <input type="range" min={5} max={40} step={1} value={gH}
            onChange={(e) => setGH(Number(e.target.value))} />
          <span className="slider-bounds"><span>5</span><span>40</span></span>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">{t('projection.finalLabel')}</div>
          <div className="kpi-value">{eurCompact(projection.finalTotal)}</div>
          <div className="kpi-meta">{t('projection.finalMeta', { years: settings.gH })}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">{t('projection.contributedLabel')}</div>
          <div className="kpi-value">{eurCompact(projection.totalContributed)}</div>
          <div className="kpi-meta">{t('projection.contributedMeta')}</div>
        </div>
        <div className="kpi kpi-accent-green">
          <div className="kpi-label">{t('projection.returnLabel')}</div>
          <div className="kpi-value">{eurCompact(projection.totalReturn)}</div>
          <div className="kpi-meta">{t('projection.returnMeta')}</div>
        </div>
      </div>

      <div className="card card-pad-lg">
        <h3 className="section-label" style={{ marginTop: 0 }}>{t('projection.evolutionLabel')}</h3>
        <div className="chart-wrap" style={{ height: 280 }}>
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    </div>
  )
}

export default ProjectionPanel
