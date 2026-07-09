import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useHousehold, useHouseholdOverview } from '@/hooks/useHousehold'
import { StateBlock } from '@/components/ui/StateBlock'
import { eur, eur2 } from '@/lib/format'

// ── /casal — the combined household view (aggregate-only) ────────

export function Household() {
  const { t } = useTranslation('household')
  const membership = useHousehold()
  const hasHousehold = !!membership.data?.household
  const { data, isLoading, error, refetch } = useHouseholdOverview(hasHousehold)

  if (membership.isLoading || (hasHousehold && isLoading)) {
    return <div className="auth-loading"><div className="spinner" /></div>
  }
  if (!hasHousehold) {
    return (
      <div className="page-stub">
        <h1>{t('title')}</h1>
        <div className="card card-pad-lg">
          <p className="muted" style={{ margin: 0 }}>
            {t('notMember')}{' '}<Link to="/settings">→</Link>
          </p>
        </div>
      </div>
    )
  }
  if (error || !data) {
    return (
      <div className="page-stub">
        <h1>{t('title')}</h1>
        <StateBlock variant="error" message={t('loadError')} onRetry={() => refetch()} />
      </div>
    )
  }

  const c = data.combined
  const sign = (n: number) => `${n >= 0 ? '+' : '−'}${eur(Math.abs(n))}`

  const combinedCards: Array<{ label: string; value: string; meta?: string; tone?: 'pos' | 'neg' }> = [
    { label: t('portfolio'), value: eur(c.portfolioValue), meta: `${t('gainLoss')}: ${sign(c.gainLoss)}`, tone: c.gainLoss >= 0 ? 'pos' : 'neg' },
    { label: t('debt'), value: eur(c.loanOutstanding), meta: `${t('nextPayments')}: ${eur2(c.loanNextPaymentTotal)}` },
    { label: t('balance'), value: sign(c.monthlyBalance), meta: `${t('income')} ${eur(c.monthlyIncome)} · ${t('expenses')} ${eur(c.monthlyExpenses)}`, tone: c.monthlyBalance >= 0 ? 'pos' : 'neg' },
  ]

  return (
    <div className="page-stub household-page">
      <header className="page-header">
        <div>
          <h1>{t('overviewTitle', { name: data.householdName })}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
      </header>

      <h2 className="section-label">{t('combined')}</h2>
      <div className="kpi-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {combinedCards.map((card) => (
          <div key={card.label} className="kpi card card-pad-lg">
            <div className="kpi-label">{card.label}</div>
            <div className={`kpi-value ${card.tone === 'pos' ? 'gain-positive' : card.tone === 'neg' ? 'gain-negative' : ''}`}>
              {card.value}
            </div>
            {card.meta && <div className="kpi-meta">{card.meta}</div>}
          </div>
        ))}
      </div>

      <h2 className="section-label" style={{ marginTop: 24 }}>{t('perMember')}</h2>
      <div className="card">
        <div style={{ overflowX: 'auto' }}>
          <table className="annual-table">
            <thead>
              <tr>
                <th />
                <th>{t('portfolio')}</th>
                <th>{t('debt')}</th>
                <th>{t('income')}</th>
                <th>{t('expenses')}</th>
                <th>{t('balance')}</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{m.name}{m.isMe ? ` ${t('me')}` : ''}</td>
                  <td>{eur(m.portfolioValue)}</td>
                  <td>{eur(m.loanOutstanding)}</td>
                  <td>{eur(m.monthlyIncome)}</td>
                  <td>{eur(m.monthlyExpenses)}</td>
                  <td className={m.monthlyBalance >= 0 ? 'gain-positive' : 'gain-negative'}>{sign(m.monthlyBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default Household
