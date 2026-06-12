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

  // Aggregate across all credits for the Overview's single "Crédito" summary.
  const loanItems = loan.data?.loans ?? []
  const loanCapitalAtual = loanItems.reduce((s, l) => s + l.kpis.capitalAtual, 0)
  const loanCapitalInicial = loanItems.reduce((s, l) => s + l.loan.capital, 0)
  const aggLoanKpis = loanItems.length > 0
    ? {
        ...loanItems[0].kpis,
        capitalAtual: loanCapitalAtual,
        pctPago: loanCapitalInicial > 0 ? 1 - loanCapitalAtual / loanCapitalInicial : 0,
        proximaPrestacao: loanItems.reduce((s, l) => s + l.kpis.proximaPrestacao, 0),
        conclusaoYm: loanItems.reduce((m, l) => (l.kpis.conclusaoYm > m ? l.kpis.conclusaoYm : m), loanItems[0].kpis.conclusaoYm),
      }
    : null

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
            loanRemaining={loanItems.length > 0 ? loanCapitalAtual : null}
            monthlyNet={budget.data?.kpis.netMonthly ?? null}
            monthlyIncome={budget.data?.kpis.incomeTotal ?? null}
            pendingCount={(budget.data?.pendingIncomes.length ?? 0) + (budget.data?.pendingExpenses.length ?? 0)}
          />

          <CashflowChart
            incomes={budget.data?.incomes ?? []}
            expenses={budget.data?.expenses ?? []}
          />

          <ModuleSummary
            loanKpis={aggLoanKpis}
            loanCapitalInicial={loanItems.length > 0 ? loanCapitalInicial : null}
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
