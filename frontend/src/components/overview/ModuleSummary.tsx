import { Link } from 'react-router-dom'
import { eur, eurCompact, pctSigned, ymToShort } from '@/lib/format'
import type { LoanKpis as LoanKpisT } from '@/hooks/useLoan'
import type { PortfolioKpisData } from '@/hooks/usePortfolio'
import type { BudgetKpis as BudgetKpisT } from '@/hooks/useBudget'

interface Props {
  loanKpis: LoanKpisT | null
  loanCapitalInicial: number | null
  portfolioKpis: PortfolioKpisData | null
  portfolioHorizon: number | null
  budgetKpis: BudgetKpisT | null
}

// Three side-by-side "module summary" cards with a hero stat and 2 secondary
// stats each. Click → drill into the module's page.
export function ModuleSummary({
  loanKpis, loanCapitalInicial,
  portfolioKpis, portfolioHorizon,
  budgetKpis,
}: Props) {
  return (
    <div className="module-grid">
      {/* ── Empréstimo ──────────────────────────────────────── */}
      <Link to="/loan" className="module-card">
        <div className="module-card-head">
          <span className="module-card-icon" aria-hidden>🏠</span>
          <span className="module-card-title">Empréstimo</span>
          <span className="module-card-arrow" aria-hidden>→</span>
        </div>
        {loanKpis && loanCapitalInicial ? (
          <>
            <div className="module-card-hero">{eur(loanKpis.capitalAtual)}</div>
            <div className="module-card-meta">
              {(loanKpis.pctPago * 100).toFixed(1)} % pago · de {eur(loanCapitalInicial)}
            </div>
            <div className="module-card-progress" aria-hidden>
              <div className="module-card-progress-fill" style={{ width: `${Math.min(100, loanKpis.pctPago * 100)}%` }} />
            </div>
            <div className="module-card-stats">
              <div>
                <div className="module-card-stat-label">PRÓX. PRESTAÇÃO</div>
                <div className="module-card-stat-value">{eur(loanKpis.proximaPrestacao)}</div>
              </div>
              <div>
                <div className="module-card-stat-label">CONCLUSÃO</div>
                <div className="module-card-stat-value">{ymToShort(loanKpis.conclusaoYm).split(' ').pop()}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="module-card-empty">Configura o teu empréstimo</div>
        )}
      </Link>

      {/* ── Investimentos ───────────────────────────────────── */}
      <Link to="/investments" className="module-card">
        <div className="module-card-head">
          <span className="module-card-icon" aria-hidden>📈</span>
          <span className="module-card-title">Investimentos</span>
          <span className="module-card-arrow" aria-hidden>→</span>
        </div>
        {portfolioKpis && portfolioKpis.numAtivos > 0 ? (
          <>
            <div className="module-card-hero">{eur(portfolioKpis.valorAtual)}</div>
            <div className={`module-card-meta ${portfolioKpis.ganhoPerda >= 0 ? 'gain-positive' : 'gain-negative'}`}>
              {pctSigned(portfolioKpis.ganhoPerdaPct)} · {portfolioKpis.numAtivos} ativos
            </div>
            <div className="module-card-stats">
              <div>
                <div className="module-card-stat-label">REFORÇO/MÊS</div>
                <div className="module-card-stat-value">{eur(portfolioKpis.reforcoMensalTotal)}</div>
              </div>
              <div>
                <div className="module-card-stat-label">PROJEÇÃO {portfolioHorizon}A</div>
                <div className="module-card-stat-value">{eurCompact(portfolioKpis.projecaoFinal)}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="module-card-empty">Adiciona o primeiro ativo</div>
        )}
      </Link>

      {/* ── Orçamento ───────────────────────────────────────── */}
      <Link to="/budget" className="module-card">
        <div className="module-card-head">
          <span className="module-card-icon" aria-hidden>💰</span>
          <span className="module-card-title">Orçamento</span>
          <span className="module-card-arrow" aria-hidden>→</span>
        </div>
        {budgetKpis && (budgetKpis.incomeTotal > 0 || budgetKpis.expensesTotal > 0) ? (
          <>
            <div className={`module-card-hero ${budgetKpis.netMonthly >= 0 ? 'gain-positive' : 'gain-negative'}`}>
              {eur(budgetKpis.netMonthly)}
            </div>
            <div className="module-card-meta">
              Saldo mensal · {eur(budgetKpis.netAnnual)}/ano
            </div>
            <div className="module-card-stats">
              <div>
                <div className="module-card-stat-label">RECEITAS</div>
                <div className="module-card-stat-value">{eur(budgetKpis.incomeTotal)}</div>
              </div>
              <div>
                <div className="module-card-stat-label">DESPESAS</div>
                <div className="module-card-stat-value">{eur(budgetKpis.expensesTotal)}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="module-card-empty">Regista receitas e despesas</div>
        )}
      </Link>
    </div>
  )
}

export default ModuleSummary
