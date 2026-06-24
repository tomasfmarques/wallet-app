import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { eur, ymToShort } from '@/lib/format'
import type { LoanScheduleRow } from '@/hooks/useLoan'

interface Props {
  rows: LoanScheduleRow[]
  capitalInicial: number
}

interface Milestone {
  year: number
  ym: string
  capital: number      // outstanding balance at this point
  cumJuros: number     // cumulative interest paid up to here
  cumPago: number      // cumulative total paid up to here
  pctPaid: number      // fraction of the principal amortised
  isLast: boolean
}

// Compact "where will I be" summary at year milestones (1, 5, 10, …) plus the
// final payoff, derived from the amortization schedule. Complements the full
// per-month AnnualTable.
export function MilestoneTable({ rows, capitalInicial }: Props) {
  const { t } = useTranslation('loan')

  const milestones = useMemo<Milestone[]>(() => {
    if (rows.length === 0) return []
    const marks = [1, 5, 10, 15, 20, 25, 30, 35].filter((y) => y * 12 <= rows.length)
    const idx = new Set(marks.map((y) => y * 12 - 1)) // end-of-year row indices
    idx.add(rows.length - 1) // payoff
    let cumJuros = 0
    let cumPago = 0
    const out: Milestone[] = []
    for (let i = 0; i < rows.length; i++) {
      cumJuros += rows[i].juros
      cumPago += rows[i].prestacao + rows[i].amortExtra
      if (idx.has(i)) {
        out.push({
          year: Math.round((i + 1) / 12),
          ym: rows[i].ym,
          capital: rows[i].capital,
          cumJuros,
          cumPago,
          pctPaid: capitalInicial > 0 ? (capitalInicial - rows[i].capital) / capitalInicial : 0,
          isLast: i === rows.length - 1,
        })
      }
    }
    return out
  }, [rows, capitalInicial])

  if (milestones.length === 0) return null

  return (
    <div className="card card-pad-lg" style={{ marginBottom: 16 }}>
      <h3 className="settings-subhead" style={{ marginTop: 0 }}>{t('milestones.title')}</h3>
      <div className="milestone-table-wrap">
        <table className="milestone-table">
          <thead>
            <tr>
              <th>{t('milestones.marker')}</th>
              <th style={{ textAlign: 'right' }}>{t('milestones.outstanding')}</th>
              <th style={{ textAlign: 'right' }}>{t('milestones.paidOff')}</th>
              <th style={{ textAlign: 'right' }}>{t('milestones.interest')}</th>
              <th style={{ textAlign: 'right' }}>{t('milestones.totalPaid')}</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((m) => (
              <tr key={m.ym} className={m.isLast ? 'is-payoff' : ''}>
                <td>
                  {m.isLast ? t('milestones.payoff') : t('milestones.yearN', { year: m.year })}
                  <span className="milestone-ym muted"> · {ymToShort(m.ym)}</span>
                </td>
                <td style={{ textAlign: 'right' }}>{eur(m.capital)}</td>
                <td style={{ textAlign: 'right' }}>{Math.round(m.pctPaid * 100)}%</td>
                <td style={{ textAlign: 'right' }}>{eur(m.cumJuros)}</td>
                <td style={{ textAlign: 'right' }}>{eur(m.cumPago)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default MilestoneTable
