import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LoanItem } from '@/hooks/useLoan'
import type { PortfolioResponse } from '@/hooks/usePortfolio'
import { useCompare, type CompareResult } from '@/hooks/useCompare'
import { compareDefaults } from '@/lib/compareDefaults'
import { eur } from '@/lib/format'

interface Props {
  loans: LoanItem[]
  portfolio: PortfolioResponse | undefined
}

function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}
function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12).toString().padStart(4, '0')}-${((total % 12) + 1).toString().padStart(2, '0')}`
}

// Proactive "amortizar vs investir" insight on the dashboard — the wedge made
// active instead of buried behind a nav click (MARKET-FEEDBACK #1/#4). Runs the
// existing simulate/compare engine for the user's most significant loan and shows
// the verdict, deep-linking into the full simulator. Fail-silent: never blocks the
// dashboard if the call is slow or errors.
export function WedgeInsight({ loans, portfolio }: Props) {
  const { t } = useTranslation('overview')
  const compare = useCompare()
  const [result, setResult] = useState<CompareResult | null>(null)

  // Most impactful loan = largest remaining capital.
  const primaryLoan = useMemo<LoanItem | null>(() => {
    if (loans.length === 0) return null
    return [...loans].sort((a, b) => b.kpis.capitalAtual - a.kpis.capitalAtual)[0]
  }, [loans])

  const hasInvestments = (portfolio?.assets?.length ?? 0) > 0
  const eligible = !!primaryLoan && hasInvestments

  const defaults = useMemo(
    () => compareDefaults(primaryLoan, portfolio),
    [primaryLoan?.loan.id, portfolio],   // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    if (!eligible || !primaryLoan) return
    compare.mutate(
      {
        loanId: primaryLoan.loan.id,
        valor: defaults.valor,
        modo: defaults.modo,
        ymAmortizacao: addMonths(currentYm(), 1),
        investReturn: defaults.investReturn,
        taxRate: defaults.taxRate,
      },
      { onSuccess: (r) => setResult(r), onError: () => setResult(null) },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, primaryLoan?.loan.id, defaults.valor, defaults.investReturn, defaults.taxRate, defaults.modo])

  if (!eligible || !primaryLoan) return null

  if (!result) {
    // Slim placeholder only during the first load; otherwise render nothing.
    return compare.isLoading
      ? <div className="wedge-insight wedge-insight-skeleton" aria-hidden />
      : null
  }

  const rec = result.recommendation
  const name = primaryLoan.loan.name
  const saved = eur(result.amortizar.interestSaved)
  const gain = eur(result.investir.netGainAfterTax)

  const verdict =
    rec === 'amortizar'
      ? t('wedge.verdictAmortizar', { name, saved, gain })
      : rec === 'investir'
        ? t('wedge.verdictInvestir', { name, saved, gain })
        : t('wedge.verdictEqual', { name })

  return (
    <Link to={`/comparar?loan=${primaryLoan.loan.id}`} className={`wedge-insight wedge-insight-${rec}`}>
      <div className="wedge-insight-head">
        <span className="wedge-insight-icon" aria-hidden>💡</span>
        <span className="wedge-insight-kicker">{t('wedge.kicker')}</span>
        <span className="wedge-insight-cta">{t('wedge.cta')}</span>
      </div>
      <p className="wedge-insight-verdict">{verdict}</p>
      <div className="wedge-insight-figures">
        <span className="wedge-insight-fig">
          <span aria-hidden>🏠</span> {t('wedge.interestSaved')} <strong>{saved}</strong>
        </span>
        <span className="wedge-insight-fig">
          <span aria-hidden>📈</span> {t('wedge.netGain')} <strong>{gain}</strong>
        </span>
      </div>
    </Link>
  )
}

export default WedgeInsight
