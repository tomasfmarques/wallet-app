import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { eur, eurCompact, pctSigned, ymToShort } from '@/lib/format'
import { Icon } from '@/components/ui/Icon'
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
  const { t } = useTranslation('overview')
  return (
    <div className="module-grid">
      {/* ── Empréstimo ──────────────────────────────────────── */}
      <Link to="/loan" className="module-card">
        <div className="module-card-head">
          <span className="module-card-icon"><Icon name="home" size={19} /></span>
          <span className="module-card-title">{t('module.loanTitle')}</span>
          <span className="module-card-arrow" aria-hidden>→</span>
        </div>
        {loanKpis && loanCapitalInicial ? (
          <>
            <div className="module-card-hero">{eur(loanKpis.capitalAtual)}</div>
            <div className="module-card-meta">
              {t('module.loanPctPaid', { pct: (loanKpis.pctPago * 100).toFixed(1), total: eur(loanCapitalInicial) })}
            </div>
            <div className="module-card-progress" aria-hidden>
              <div className="module-card-progress-fill" style={{ width: `${Math.min(100, loanKpis.pctPago * 100)}%` }} />
            </div>
            <div className="module-card-stats">
              <div>
                <div className="module-card-stat-label">{t('module.nextPayment')}</div>
                <div className="module-card-stat-value">{eur(loanKpis.proximaPrestacao)}</div>
              </div>
              <div>
                <div className="module-card-stat-label">{t('module.completion')}</div>
                <div className="module-card-stat-value">{ymToShort(loanKpis.conclusaoYm).split(' ').pop()}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="module-card-empty">{t('module.loanEmpty')}</div>
        )}
      </Link>

      {/* ── Investimentos ───────────────────────────────────── */}
      <Link to="/investments" className="module-card">
        <div className="module-card-head">
          <span className="module-card-icon"><Icon name="trendingUp" size={19} /></span>
          <span className="module-card-title">{t('module.investTitle')}</span>
          <span className="module-card-arrow" aria-hidden>→</span>
        </div>
        {portfolioKpis && portfolioKpis.numAtivos > 0 ? (
          <>
            <div className="module-card-hero">{eur(portfolioKpis.valorAtual)}</div>
            <div className={`module-card-meta ${portfolioKpis.ganhoPerda >= 0 ? 'gain-positive' : 'gain-negative'}`}>
              {t('module.investMeta', { pct: pctSigned(portfolioKpis.ganhoPerdaPct), count: portfolioKpis.numAtivos })}
            </div>
            <div className="module-card-stats">
              <div>
                <div className="module-card-stat-label">{t('module.contribMonth')}</div>
                <div className="module-card-stat-value">{eur(portfolioKpis.reforcoMensalTotal)}</div>
              </div>
              <div>
                <div className="module-card-stat-label">{t('module.projection', { years: portfolioHorizon })}</div>
                <div className="module-card-stat-value">{eurCompact(portfolioKpis.projecaoFinal)}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="module-card-empty">{t('module.investEmpty')}</div>
        )}
      </Link>

      {/* ── Saldo ───────────────────────────────────────────── */}
      <Link to="/budget" className="module-card">
        <div className="module-card-head">
          <span className="module-card-icon"><Icon name="wallet" size={19} /></span>
          <span className="module-card-title">{t('module.balanceTitle')}</span>
          <span className="module-card-arrow" aria-hidden>→</span>
        </div>
        {budgetKpis && (budgetKpis.incomeTotal > 0 || budgetKpis.expensesTotal > 0) ? (
          <>
            <div className={`module-card-hero ${budgetKpis.netMonthly >= 0 ? 'gain-positive' : 'gain-negative'}`}>
              {eur(budgetKpis.netMonthly)}
            </div>
            <div className="module-card-meta">
              {t('module.balanceMeta', { annual: eur(budgetKpis.netAnnual) })}
            </div>
            <div className="module-card-stats">
              <div>
                <div className="module-card-stat-label">{t('module.incomes')}</div>
                <div className="module-card-stat-value">{eur(budgetKpis.incomeTotal)}</div>
              </div>
              <div>
                <div className="module-card-stat-label">{t('module.expenses')}</div>
                <div className="module-card-stat-value">{eur(budgetKpis.expensesTotal)}</div>
              </div>
            </div>
          </>
        ) : (
          <div className="module-card-empty">{t('module.balanceEmpty')}</div>
        )}
      </Link>
      {/* ── Amortizar vs Investir CTA ───────────────────────── */}
      <Link to="/comparar" className="module-card module-card-compare">
        <div className="module-card-head">
          <span className="module-card-icon"><Icon name="scale" size={19} /></span>
          <span className="module-card-title">{t('module.compareTitle')}</span>
          <span className="module-card-arrow" aria-hidden>→</span>
        </div>
        <div className="module-card-compare-body">
          <div className="module-card-compare-headline">
            {t('module.compareHeadline')}
          </div>
          <div className="module-card-compare-hint">
            {t('module.compareHint')}
          </div>
        </div>
      </Link>
    </div>
  )
}

export default ModuleSummary
