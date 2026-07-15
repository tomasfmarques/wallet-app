import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import { useLoan } from '@/hooks/useLoan'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useBudget } from '@/hooks/useBudget'
import { UncategorizedBanner } from '@/components/budget/UncategorizedBanner'
import { HeroKpis } from '@/components/overview/HeroKpis'
import { OnboardingChecklist } from '@/components/overview/OnboardingChecklist'
import { WedgeInsight } from '@/components/overview/WedgeInsight'
import { CashflowChart } from '@/components/overview/CashflowChart'
import { ModuleSummary } from '@/components/overview/ModuleSummary'
import { ymToShort } from '@/lib/format'

// Unified Overview page: hero KPI strip → cashflow chart (month/year toggle)
// → module summary cards. No section labels — everything flows as a single
// modern dashboard. Click a module card to drill into its page.
export function Overview() {
  const { t } = useTranslation('overview')
  const { user } = useAuth()
  const loan = useLoan()
  const portfolio = usePortfolio()
  const budget = useBudget()

  const loading = loan.isLoading || portfolio.isLoading || budget.isLoading

  // Hero income/saldo normally reflect the recurring PLAN (FX1). But an
  // import-only user (no manual plan, all data from statements) would otherwise
  // see 0s once everything is classified — so when the plan is empty, nothing is
  // pending, and actuals exist, fall back to the latest imported month's REAL
  // figures so the dashboard shows their actual money.
  const b = budget.data
  const pendingCount = (b?.pendingIncomes.length ?? 0) + (b?.pendingExpenses.length ?? 0)
  const planEmpty = !!b && b.kpis.incomeTotal === 0 && b.kpis.expensesTotal === 0
  const actualRows = b ? [...b.actualIncomes, ...b.actualExpenses] : []
  const useReal = planEmpty && pendingCount === 0 && actualRows.length > 0
  let heroIncome = b?.kpis.incomeTotal ?? null
  let heroNet = b?.kpis.netMonthly ?? null
  let heroRealYm: string | undefined
  if (useReal && b) {
    const latestYm = actualRows.reduce((m, r) => (r.startYm && r.startYm > m ? r.startYm : m), '')
    const inc = b.actualIncomes.filter((i) => i.startYm === latestYm).reduce((s, i) => s + i.amount, 0)
    const exp = b.actualExpenses.filter((e) => e.startYm === latestYm).reduce((s, e) => s + e.amount, 0)
    heroIncome = inc
    heroNet = inc - exp
    heroRealYm = latestYm ? ymToShort(latestYm) : undefined
  }

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

  // Onboarding step completion (FX2).
  const hasLoan = loanItems.length > 0
  const hasInvestment = (portfolio.data?.assets.length ?? 0) > 0
  const hasBudget = !!b && (
    b.incomes.length + b.expenses.length + b.actualIncomes.length +
    b.actualExpenses.length + b.pendingIncomes.length + b.pendingExpenses.length
  ) > 0

  return (
    <div className="overview-page overview-modern">
      <header className="page-header overview-header">
        <div>
          <h1>{t('greeting', { name: user?.name?.split(' ')[0] ?? user?.name ?? '' })}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
      </header>

      {budget.data && (
        <UncategorizedBanner
          incomes={budget.data.incomes}
          expenses={budget.data.expenses}
        />
      )}

      {loading ? (
        <div className="card card-pad-lg muted">{t('states.loading', { ns: 'common' })}</div>
      ) : (
        <>
          <OnboardingChecklist hasLoan={hasLoan} hasInvestment={hasInvestment} hasBudget={hasBudget} />

          <HeroKpis
            portfolioValue={portfolio.data?.kpis.valorAtual ?? null}
            loanRemaining={loanItems.length > 0 ? loanCapitalAtual : null}
            monthlyNet={heroNet}
            monthlyIncome={heroIncome}
            pendingCount={pendingCount}
            realYm={heroRealYm}
          />

          <WedgeInsight loans={loanItems} portfolio={portfolio.data} />

          <CashflowChart
            incomes={budget.data?.incomes ?? []}
            expenses={budget.data?.expenses ?? []}
            actualIncomes={budget.data?.actualIncomes ?? []}
            actualExpenses={budget.data?.actualExpenses ?? []}
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
