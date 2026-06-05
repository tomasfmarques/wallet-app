import { eur, eurCompact, eurSigned, pctSigned } from '@/lib/format'
import type { PortfolioKpisData } from '@/hooks/usePortfolio'

interface Props {
  kpis: PortfolioKpisData
  horizonYears: number
}

// 5-card KPI grid mirroring the design's "Investimentos" section:
// VALOR ATUAL · JÁ INVESTIDO · GANHO/PERDA · REFORÇO MENSAL · PROJEÇÃO A N ANOS
export function PortfolioKpis({ kpis, horizonYears }: Props) {
  const positive = kpis.ganhoPerda >= 0
  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">VALOR ATUAL DA CARTEIRA</div>
        <div className="kpi-value">{eur(kpis.valorAtual)}</div>
        <div className="kpi-meta">{kpis.numAtivos} ativos</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">JÁ INVESTIDO</div>
        <div className="kpi-value">{eur(kpis.jaInvestido)}</div>
        <div className="kpi-meta">custo de aquisição</div>
      </div>

      <div className={`kpi ${positive ? 'kpi-accent-green' : 'kpi-accent-red'}`}>
        <div className="kpi-label">GANHO / PERDA ATUAL</div>
        <div className="kpi-value">{eurSigned(kpis.ganhoPerda)}</div>
        <div className="kpi-meta">{pctSigned(kpis.ganhoPerdaPct)} sobre o investido</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">REFORÇO MENSAL</div>
        <div className="kpi-value">{eur(kpis.reforcoMensalTotal)}</div>
        <div className="kpi-meta">contribuições automáticas</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">PROJEÇÃO A {horizonYears} ANOS</div>
        <div className="kpi-value">{eurCompact(kpis.projecaoFinal)}</div>
        <div className="kpi-meta">com reforços crescentes</div>
      </div>
    </div>
  )
}

export default PortfolioKpis
