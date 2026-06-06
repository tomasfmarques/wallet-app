import { useAuth } from '@/hooks/useAuth'
import { useLoan } from '@/hooks/useLoan'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useBudget } from '@/hooks/useBudget'
import { UncategorizedBanner } from '@/components/budget/UncategorizedBanner'
import { HeroKpis } from '@/components/overview/HeroKpis'
import { CashflowChart } from '@/components/overview/CashflowChart'
import { ModuleSummary } from '@/components/overview/ModuleSummary'

// Unified Overview page: hero KPI strip → cashflow chart (month/year toggle)
// → module summary cards. No section labels — everything flows as a single
// modern dashboard. Click a module card to drill into its page.
export function Overview() {
  const { user } = useAuth()
  const loan = useLoan()
  const portfolio = usePortfolio()
  const budget = useBudget()

  const loading = loan.isLoading || portfolio.isLoading || budget.isLoading

  return (
    <div className="overview-page overview-modern">
      <header className="page-header overview-header">
        <div>
          <h1>Olá, {user?.name?.split(' ')[0] ?? user?.name}</h1>
          <p className="muted">O teu dinheiro num só sítio.</p>
        </div>
      </header>

      {budget.data && (
        <UncategorizedBanner
          incomes={budget.data.incomes}
          expenses={budget.data.expenses}
        />
      )}

      {loading ? (
        <div className="card card-pad-lg muted">A carregar…</div>
      ) : (
        <>
          <HeroKpis
            portfolioValue={portfolio.data?.kpis.valorAtual ?? null}
            loanRemaining={loan.data?.kpis?.capitalAtual ?? null}
            monthlyNet={budget.data?.kpis.netMonthly ?? null}
            monthlyIncome={budget.data?.kpis.incomeTotal ?? null}
          />

          <CashflowChart
            incomes={budget.data?.incomes ?? []}
            expenses={budget.data?.expenses ?? []}
          />

          <ModuleSummary
            loanKpis={loan.data?.kpis ?? null}
            loanCapitalInicial={loan.data?.loan?.capital ?? null}
            portfolioKpis={portfolio.data?.kpis ?? null}
            portfolioHorizon={portfolio.data?.settings.gH ?? null}
            budgetKpis={budget.data?.kpis ?? null}
          />
        </>
      )}
    </div>
  )
}

export default Overview
