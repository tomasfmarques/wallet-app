import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from 'react-query'
import { api, ApiError } from '@/lib/api'
import { eur2 } from '@/lib/format'
import { exportCsv } from '@/lib/csvExport'

// ── IRS — mais-valias (WS6) ──────────────────────────────────────
// Collapsible Anexo J helper: FIFO realized gains per sale/lot pair for a
// selected year, estimated 28 % tax, CSV export and window.print(). Data from
// GET /api/portfolio/capital-gains (imported broker transactions). Not tax
// advice — the mandatory disclaimer is part of the card.

interface GainRow {
  name: string
  isin: string | null
  ticker: string | null
  acquiredYm: string | null
  soldYm: string
  qty: number
  costEur: number
  proceedsEur: number
  gainEur: number
  incomplete: boolean
}

interface GainsResponse {
  year: number
  rows: GainRow[]
  totals: { proceeds: number; cost: number; gain: number }
  estimatedTax: number
  incompleteCount: number
  availableYears: number[]
}

function useCapitalGains(year: number | null) {
  return useQuery<GainsResponse, ApiError>(
    ['portfolio', 'capital-gains', year],
    () => api.get<GainsResponse>(`/api/portfolio/capital-gains${year ? `?year=${year}` : ''}`),
    { staleTime: 1000 * 60 * 10 },
  )
}

export function CapitalGainsCard() {
  const { t } = useTranslation('portfolio')
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState<number | null>(null) // null = server default (current year)
  const { data, isLoading } = useCapitalGains(open ? year : null)

  const handleCsv = () => {
    if (!data || data.rows.length === 0) return
    exportCsv(
      `wallet360-mais-valias-${data.year}`,
      [t('irs.csvName'), 'ISIN', t('irs.csvAcquired'), t('irs.csvSold'), t('irs.csvQty'), t('irs.csvCost'), t('irs.csvProceeds'), t('irs.csvGain'), t('irs.csvIncomplete')],
      data.rows.map((r) => [
        r.name, r.isin ?? '', r.acquiredYm ?? '', r.soldYm, r.qty, r.costEur, r.proceedsEur, r.gainEur,
        r.incomplete ? t('irs.incompleteFlag') : '',
      ]),
    )
  }

  return (
    <section className="capital-gains-section">
      <button
        type="button"
        className="card card-pad-lg trending-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }}
      >
        <span className="kpi-label">{t('irs.title')}</span>
        <span className="kpi-meta" style={{ marginLeft: 8 }}>{t('irs.subtitle')}</span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>
          {open ? t('irs.hide') : t('irs.show')}
        </span>
      </button>

      {open && (
        <div className="card card-pad-lg capital-gains-card" style={{ marginTop: 8 }}>
          {isLoading || !data ? (
            <div className="spinner" />
          ) : data.availableYears.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t('irs.empty')}</p>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <label htmlFor="irs-year" className="kpi-label">{t('irs.yearLabel')}</label>
                <select
                  id="irs-year"
                  value={data.year}
                  onChange={(e) => setYear(Number(e.target.value))}
                >
                  {data.availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <div className="page-header-actions" style={{ marginLeft: 'auto' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleCsv} disabled={data.rows.length === 0}>
                    {t('irs.exportCsv')}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()} disabled={data.rows.length === 0}>
                    {t('irs.print')}
                  </button>
                </div>
              </div>

              {data.rows.length === 0 ? (
                <p className="muted" style={{ margin: '16px 0 0' }}>{t('irs.emptyYear', { year: data.year })}</p>
              ) : (
                <>
                  <div className="capital-gains-totals" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '16px 0' }}>
                    <div>
                      <div className="kpi-label">{t('irs.totalGain')}</div>
                      <div className={`kpi-value ${data.totals.gain >= 0 ? 'gain-positive' : 'gain-negative'}`} style={{ fontSize: 22 }}>
                        {data.totals.gain >= 0 ? '+' : '−'}{eur2(Math.abs(data.totals.gain))}
                      </div>
                    </div>
                    <div>
                      <div className="kpi-label">{t('irs.estimatedTax')}</div>
                      <div className="kpi-value" style={{ fontSize: 22 }}>{eur2(data.estimatedTax)}</div>
                      <div className="kpi-meta">{t('irs.taxMeta')}</div>
                    </div>
                  </div>

                  {data.incompleteCount > 0 && (
                    <p className="field-hint" style={{ margin: '0 0 12px' }}>
                      {t('irs.incompleteWarning', { count: data.incompleteCount })}
                    </p>
                  )}

                  <div style={{ overflowX: 'auto' }}>
                    <table className="annual-table capital-gains-table">
                      <thead>
                        <tr>
                          <th>{t('irs.colAsset')}</th>
                          <th>{t('irs.colAcquired')}</th>
                          <th>{t('irs.colSold')}</th>
                          <th>{t('irs.colQty')}</th>
                          <th>{t('irs.colCost')}</th>
                          <th>{t('irs.colProceeds')}</th>
                          <th>{t('irs.colGain')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((r, i) => (
                          <tr key={i} className={r.incomplete ? 'is-incomplete' : undefined}>
                            <td>{r.name}{r.isin ? <span className="muted" style={{ display: 'block', fontSize: 11 }}>{r.isin}</span> : null}</td>
                            <td>{r.acquiredYm ?? t('irs.unknown')}</td>
                            <td>{r.soldYm}</td>
                            <td>{r.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                            <td>{eur2(r.costEur)}</td>
                            <td>{eur2(r.proceedsEur)}</td>
                            <td className={r.gainEur >= 0 ? 'gain-positive' : 'gain-negative'}>
                              {r.gainEur >= 0 ? '+' : '−'}{eur2(Math.abs(r.gainEur))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
                {t('irs.disclaimer')}
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}

export default CapitalGainsCard
