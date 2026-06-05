import { eur, eurSigned } from '@/lib/format'
import type { BudgetKpis as Kpis } from '@/hooks/useBudget'

interface Props { kpis: Kpis }

// 5-card KPI strip: income, fixed, variable, saldo livre, saldo final.
export function BudgetKpis({ kpis }: Props) {
  const netPositive = kpis.netMonthly >= 0
  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">RECEITAS MENSAIS</div>
        <div className="kpi-value">{eur(kpis.incomeTotal)}</div>
        <div className="kpi-meta">total ativo</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">DESPESAS FIXAS</div>
        <div className="kpi-value">{eur(kpis.fixedTotal)}</div>
        <div className="kpi-meta">recorrentes</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">DESPESAS VARIÁVEIS</div>
        <div className="kpi-value">{eur(kpis.variableTotal)}</div>
        <div className="kpi-meta">planeadas</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">SALDO LIVRE</div>
        <div className="kpi-value">{eur(kpis.discretionary)}</div>
        <div className="kpi-meta">depois das fixas</div>
      </div>
      <div className={`kpi ${netPositive ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
        <div className="kpi-label">SALDO FINAL</div>
        <div className="kpi-value">{eurSigned(kpis.netMonthly)}</div>
        <div className="kpi-meta">{eurSigned(kpis.netAnnual)} / ano</div>
      </div>
    </div>
  )
}

export default BudgetKpis
