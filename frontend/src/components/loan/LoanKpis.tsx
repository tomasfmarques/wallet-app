import { useTranslation } from 'react-i18next'
import { eur, eur2, pct, ymToLong, ymYearsDiff, currentYm, ymAddMonths } from '@/lib/format'
import type { LoanKpis as LoanKpisData, LoanScheduleRow } from '@/hooks/useLoan'
import type { LoanPayment } from '@/types'

interface Props {
  kpis: LoanKpisData
  capitalInicial: number
  dataInicio: string
  tanFixa: number
  spread: number
  euribor: number
  taeg?: number | null
  bonificacaoMensal?: number | null
  bonificacaoMeses?: number | null
  scheduleRows: LoanScheduleRow[]
  payments: LoanPayment[]
}

export function LoanKpis({
  kpis, capitalInicial, dataInicio,
  tanFixa, spread, euribor, taeg,
  bonificacaoMensal, bonificacaoMeses,
  scheduleRows, payments,
}: Props) {
  const { t } = useTranslation('loan')
  const today = currentYm()
  const anosRestantes = ymYearsDiff(today, kpis.conclusaoYm)
  const [anoConclusao] = kpis.conclusaoYm.split('-')

  const bonAtiva = bonificacaoMensal != null && bonificacaoMensal > 0
    && bonificacaoMeses != null && bonificacaoMeses > 0
    && today < ymAddMonths(dataInicio, bonificacaoMeses)
  const netPrestacao = bonAtiva ? kpis.proximaPrestacao - bonificacaoMensal! : null

  const isFixedOnly = spread === 0 && euribor === 0

  // Expected vs actual tracking
  const pastRows = scheduleRows.filter((r) => r.ym <= today)
  const countExpected = pastRows.length
  const expectedPaid = pastRows.reduce((s, r) => s + r.prestacao, 0)
  const paymentMap = new Map(payments.map((p) => [p.ym, p]))
  const paidRows = pastRows.filter((r) => paymentMap.get(r.ym)?.paid)
  const countPaid = paidRows.length
  const actualPaid = paidRows.reduce((s, r) => {
    const p = paymentMap.get(r.ym)
    return s + (p?.real != null ? p.real : r.prestacao)
  }, 0)
  const delta = actualPaid - expectedPaid

  return (
    <div className="kpi-grid">
      <div className="kpi">
        <div className="kpi-label">{t('kpis.debtLabel')}</div>
        <div className="kpi-value">{eur(kpis.capitalAtual)}</div>
        <div className="kpi-progress" aria-label={t('kpis.paidAria', { pct: (kpis.pctPago * 100).toFixed(1) })}>
          <div
            className="kpi-progress-fill"
            style={{ width: `${Math.min(100, kpis.pctPago * 100)}%` }}
          />
        </div>
        <div className="kpi-meta">{t('kpis.amortizedMeta', { pct: pct(kpis.pctPago), capital: eur(capitalInicial) })}</div>
      </div>

      <div className="kpi">
        <div className="kpi-label">{t('kpis.nextPaymentLabel')}</div>
        <div className="kpi-value">{eur2(kpis.proximaPrestacao)}</div>
        {netPrestacao != null
          ? <div className="kpi-meta kpi-meta-bon">{t('kpis.netBon', { value: eur2(netPrestacao) })}</div>
          : <div className="kpi-meta">{ymToLong(kpis.proximaYm)}</div>
        }
      </div>

      <div className="kpi">
        <div className="kpi-label">{t('kpis.completionLabel')}</div>
        <div className="kpi-value">{t('kpis.completionValue', { year: anoConclusao })}</div>
        <div className="kpi-meta">{t('kpis.yearsLeft', { years: anosRestantes })}</div>
      </div>

      <div className={`kpi ${kpis.poupancaJuros > 0 ? 'kpi-accent-green' : ''}`}>
        <div className="kpi-label">{t('kpis.interestSavedLabel')}</div>
        <div className="kpi-value">
          {kpis.poupancaJuros > 0 ? eur(kpis.poupancaJuros) : '—'}
        </div>
        <div className="kpi-meta">
          {kpis.poupancaJuros > 0 ? t('kpis.interestSavedMeta') : t('kpis.interestSavedMetaEmpty')}
        </div>
      </div>

      {/* Rate info card — shows TAEG if set, otherwise effective rate */}
      <div className="kpi">
        <div className="kpi-label">{t('kpis.effectiveRateLabel')}</div>
        {taeg != null ? (
          <>
            <div className="kpi-value">{(taeg * 100).toFixed(2)} %</div>
            <div className="kpi-meta">{t('kpis.taegMeta', { tan: (tanFixa * 100).toFixed(2) })}</div>
          </>
        ) : isFixedOnly ? (
          <>
            <div className="kpi-value">{(tanFixa * 100).toFixed(2)} %</div>
            <div className="kpi-meta">{t('kpis.tanFixed')}</div>
          </>
        ) : (
          <>
            <div className="kpi-value">{((euribor + spread) * 100).toFixed(2)} %</div>
            <div className="kpi-meta">
              {t('kpis.euriborSpread', { euribor: (euribor * 100).toFixed(2), spread: (spread * 100).toFixed(2) })}
            </div>
          </>
        )}
      </div>

      <div className="kpi">
        <div className="kpi-label">{t('kpis.expectedLabel')}</div>
        <div className="kpi-value">{eur(expectedPaid)}</div>
        <div className="kpi-meta">{t('kpis.expectedMeta', { count: countExpected })}</div>
      </div>

      <div className={`kpi ${countPaid === countExpected && countExpected > 0 ? 'kpi-accent-green' : countPaid < countExpected ? 'kpi-accent-yellow' : ''}`}>
        <div className="kpi-label">{t('kpis.realPaidLabel')}</div>
        <div className="kpi-value">{countPaid > 0 ? eur(actualPaid) : '—'}</div>
        <div className="kpi-meta">
          {t('kpis.realPaidMeta', { paid: countPaid, expected: countExpected })}
          {countPaid > 0 && delta !== 0 && (
            <span className={delta > 0 ? 'tracking-delta-pos' : 'tracking-delta-neg'}>
              {' '}· {delta > 0 ? '+' : ''}{eur2(delta)}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default LoanKpis
