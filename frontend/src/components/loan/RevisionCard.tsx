import { useTranslation } from 'react-i18next'
import { useLoanRevision } from '@/hooks/useLoan'
import { eur2, ymToLong } from '@/lib/format'
import { Icon } from '@/components/ui/Icon'

interface Props {
  loanId: string
  euriborTenor: '3m' | '6m' | '12m' | null | undefined
}

// "Próxima revisão" — shows when the loan tracks a Euribor tenor and the
// daily cron has stored at least one ECB monthly average. Renders nothing
// otherwise (manual-mode loans behave exactly as before).
export function RevisionCard({ loanId, euriborTenor }: Props) {
  const { t } = useTranslation('loan')
  const { data } = useLoanRevision(loanId, !!euriborTenor)
  const rev = data?.revision
  if (!euriborTenor || !rev) return null

  const rising = rev.deltaMonthly > 0.005
  const falling = rev.deltaMonthly < -0.005
  const deltaText = rising
    ? t('revision.deltaUp', { value: eur2(Math.abs(rev.deltaMonthly)) })
    : falling
      ? t('revision.deltaDown', { value: eur2(Math.abs(rev.deltaMonthly)) })
      : t('revision.deltaFlat')

  return (
    <div className="card card-pad-lg" style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="bank" size={16} />
        <span className="kpi-label">{t('revision.label')}</span>
        <span className="kpi-meta" style={{ marginLeft: 'auto' }}>
          {t('revision.tenorMeta', { tenor: t(`revision.tenor.${rev.tenor}`) })}
        </span>
      </div>
      <p style={{ margin: '4px 0 8px' }}>
        <strong>{ymToLong(rev.nextRevisionYm)}</strong>
        {' — '}
        <span className={rising ? 'gain-negative' : falling ? 'gain-positive' : undefined}>
          {deltaText}
        </span>
      </p>
      <p className="kpi-meta" style={{ margin: 0 }}>
        {t('revision.detail', {
          current: eur2(rev.currentPayment),
          projected: eur2(rev.projectedPayment),
          euribor: rev.latestEuribor.toFixed(3),
          month: ymToLong(rev.latestEuriborMonth),
        })}
      </p>
    </div>
  )
}

export default RevisionCard
