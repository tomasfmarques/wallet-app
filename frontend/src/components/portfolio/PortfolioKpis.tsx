import { useTranslation } from 'react-i18next'
import { eur, eurCompact, eurSigned, pctSigned } from '@/lib/format'
import type { PortfolioKpisData } from '@/hooks/usePortfolio'

interface Props {
  kpis: PortfolioKpisData
  horizonYears: number
}

// 5-card KPI grid mirroring the design's "Investimentos" section:
// VALOR ATUAL · JÁ INVESTIDO · GANHO/PERDA · REFORÇO MENSAL · PROJEÇÃO A N ANOS
export function PortfolioKpis({ kpis, horizonYears }: Props) {
  const { t } = useTranslation('portfolio')
  const positive = kpis.ganhoPerda >= 0
  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">{t('kpis.valueLabel')}</div>
        <div className="kpi-value">{eur(kpis.valorAtual)}</div>
        <div className="kpi-meta">{t('kpis.valueMeta', { count: kpis.numAtivos })}</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">{t('kpis.investedLabel')}</div>
        <div className="kpi-value">{eur(kpis.jaInvestido)}</div>
        <div className="kpi-meta">{t('kpis.investedMeta')}</div>
      </div>

      <div className={`kpi ${positive ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
        <div className="kpi-label">{t('kpis.gainLabel')}</div>
        <div className="kpi-value">{eurSigned(kpis.ganhoPerda)}</div>
        <div className="kpi-meta">{t('kpis.gainMeta', { pct: pctSigned(kpis.ganhoPerdaPct) })}</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">{t('kpis.contribLabel')}</div>
        <div className="kpi-value">{eur(kpis.reforcoMensalTotal)}</div>
        <div className="kpi-meta">{t('kpis.contribMeta')}</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">{t('kpis.projectionLabel', { years: horizonYears })}</div>
        <div className="kpi-value">{eurCompact(kpis.projecaoFinal)}</div>
        <div className="kpi-meta">{t('kpis.projectionMeta')}</div>
      </div>
    </div>
  )
}

export default PortfolioKpis
