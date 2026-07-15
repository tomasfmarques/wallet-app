import { useTranslation } from 'react-i18next'
import { eur, eurSigned } from '@/lib/format'
import type { BudgetKpis as Kpis } from '@/hooks/useBudget'

interface Props { kpis: Kpis }

// 4-card KPI strip: income, fixed, saldo livre, saldo final. (The "variable
// planned" card was dropped 2026-07 — planned variable is a soft budget, not a
// commitment, and it read as double-counting next to Saldo final; the donuts
// and month analysis still break variable spend down.)
export function BudgetKpis({ kpis }: Props) {
  const { t } = useTranslation('budget')
  const netPositive = kpis.netMonthly >= 0
  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">{t('kpis.incomeLabel')}</div>
        <div className="kpi-value">{eur(kpis.incomeTotal)}</div>
        <div className="kpi-meta">{t('kpis.incomeMeta')}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">{t('kpis.fixedLabel')}</div>
        <div className="kpi-value">{eur(kpis.fixedTotal)}</div>
        <div className="kpi-meta">{t('kpis.fixedMeta')}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">{t('kpis.discretionaryLabel')}</div>
        <div className="kpi-value">{eur(kpis.discretionary)}</div>
        <div className="kpi-meta">{t('kpis.discretionaryMeta')}</div>
      </div>
      <div className={`kpi ${netPositive ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
        <div className="kpi-label">{t('kpis.netLabel')}</div>
        <div className="kpi-value">{eurSigned(kpis.netMonthly)}</div>
        <div className="kpi-meta">{t('kpis.netMeta', { annual: eurSigned(kpis.netAnnual) })}</div>
      </div>
    </div>
  )
}

export default BudgetKpis
