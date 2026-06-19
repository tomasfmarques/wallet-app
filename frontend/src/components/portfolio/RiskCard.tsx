import { useTranslation } from 'react-i18next'
import { usePortfolioRisk } from '@/hooks/usePortfolio'

// Portfolio risk = annualized volatility (stddev of monthly returns × √12),
// value-weighted across holdings. Loaded lazily from /api/portfolio/risk so the
// main portfolio render never waits on Yahoo.
export function RiskCard() {
  const { t } = useTranslation('portfolio')
  const { data, isLoading } = usePortfolioRisk()

  if (isLoading) {
    return <div className="card card-pad-lg muted">{t('risk.loading')}</div>
  }
  if (!data || data.portfolio.volatility == null) {
    return <div className="card card-pad-lg muted">{t('risk.none')}</div>
  }

  const { portfolio, assets } = data
  const rated = assets.filter((a) => a.volatility != null && a.level != null)

  return (
    <div className="card card-pad-lg risk-card">
      <div className="risk-card-head">
        <div>
          <div className="kpi-label">{t('risk.volLabel')}</div>
          <div className="risk-card-vol">
            {portfolio.volatility!.toFixed(1)} %<span className="muted"> / {t('risk.perYear')}</span>
          </div>
        </div>
        {portfolio.level && (
          <span className={`risk-pill risk-${portfolio.level}`}>{t(`risk.level.${portfolio.level}`)}</span>
        )}
      </div>

      <p className="muted risk-card-explain">{t('risk.explain')}</p>

      {rated.length > 0 && (
        <ul className="risk-asset-list">
          {rated.map((a) => (
            <li key={a.id} className="risk-asset-row">
              <span className="risk-asset-name">{a.name}</span>
              <span className={`risk-pill risk-pill-sm risk-${a.level}`}>{t(`risk.level.${a.level!}`)}</span>
              <span className="muted risk-asset-vol">{a.volatility!.toFixed(1)} %</span>
            </li>
          ))}
        </ul>
      )}

      {portfolio.coverage < 0.999 && (
        <p className="muted" style={{ fontSize: 11, marginBottom: 0 }}>
          {t('risk.coverage', { value: Math.round(portfolio.coverage * 100) })}
        </p>
      )}
    </div>
  )
}

export default RiskCard
