import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLoan } from '@/hooks/useLoan'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useBudget } from '@/hooks/useBudget'
import { LoanKpis } from '@/components/loan/LoanKpis'
import { PortfolioKpis } from '@/components/portfolio/PortfolioKpis'
import { BudgetKpis } from '@/components/budget/BudgetKpis'
import { UncategorizedBanner } from '@/components/budget/UncategorizedBanner'

export function Overview() {
  const { user } = useAuth()
  const loan = useLoan()
  const portfolio = usePortfolio()
  const budget = useBudget()

  return (
    <div className="overview-page">
      <header className="page-header">
        <div>
          <h1>Visão geral</h1>
          <p className="muted">
            Olá, {user?.name}! O teu painel financeiro num só sítio.
          </p>
        </div>
      </header>

      {budget.data && (
        <UncategorizedBanner
          incomes={budget.data.incomes}
          expenses={budget.data.expenses}
        />
      )}

      <section>
        <h2 className="section-label">EMPRÉSTIMO DA CASA</h2>
        {loan.isLoading ? (
          <div className="card card-pad-lg muted">A carregar…</div>
        ) : loan.data?.loan && loan.data.kpis ? (
          <>
            <LoanKpis kpis={loan.data.kpis} capitalInicial={loan.data.loan.capital} />
            <Link to="/loan" className="btn btn-ghost btn-link">
              Abrir tracking do empréstimo →
            </Link>
          </>
        ) : (
          <div className="card card-pad-lg">
            <p>Ainda não configuraste o teu empréstimo.</p>
            <Link to="/loan" className="btn btn-primary">Configurar agora →</Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="section-label">INVESTIMENTOS</h2>
        {portfolio.isLoading ? (
          <div className="card card-pad-lg muted">A carregar…</div>
        ) : portfolio.data && portfolio.data.assets.length > 0 ? (
          <>
            <PortfolioKpis
              kpis={portfolio.data.kpis}
              horizonYears={portfolio.data.settings.gH}
            />
            <Link to="/investments" className="btn btn-ghost btn-link">
              Abrir simulador de investimentos →
            </Link>
          </>
        ) : (
          <div className="card card-pad-lg">
            <p>Ainda não tens ativos na carteira.</p>
            <Link to="/investments" className="btn btn-primary">Adicionar ativo →</Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="section-label">ORÇAMENTO</h2>
        {budget.isLoading ? (
          <div className="card card-pad-lg muted">A carregar…</div>
        ) : budget.data && (budget.data.incomes.length > 0 || budget.data.expenses.length > 0) ? (
          <>
            <BudgetKpis kpis={budget.data.kpis} />
            <Link to="/budget" className="btn btn-ghost btn-link">
              Abrir orçamento →
            </Link>
          </>
        ) : (
          <div className="card card-pad-lg">
            <p>Ainda não tens receitas ou despesas registadas.</p>
            <Link to="/budget" className="btn btn-primary">Configurar agora →</Link>
          </div>
        )}
      </section>

      <section>
        <h2 className="section-label">EM BREVE</h2>
        <div className="upcoming-grid">
          <div className="upcoming-card">
            <div className="upcoming-title">🏠 Património</div>
            <p className="muted">Junta contas, poupanças, investimentos e imóveis numa vista.</p>
          </div>
          <div className="upcoming-card">
            <div className="upcoming-title">💳 Cartões</div>
            <p className="muted">Acompanha saldos e movimentos de cartões de crédito.</p>
          </div>
          <div className="upcoming-card">
            <div className="upcoming-title">🎯 Objetivos</div>
            <p className="muted">Define metas de poupança e acompanha o progresso.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Overview
