import { useMemo } from 'react'
import { eur } from '@/lib/format'
import type { LoanScheduleRow } from '@/hooks/useLoan'

interface Props {
  rows: LoanScheduleRow[]
}

interface YearAgg {
  year: string
  meses: number
  totalPrestacao: number
  totalJuros: number
  totalAmortizacao: number
  totalAmortExtra: number
  capitalFinal: number
}

// Compact year-by-year table: months in that year, totals paid/interest/principal,
// extra amortizations applied, and remaining capital at year end.
export function AnnualTable({ rows }: Props) {
  const years: YearAgg[] = useMemo(() => {
    const m = new Map<string, YearAgg>()
    for (const r of rows) {
      const y = r.ym.slice(0, 4)
      let agg = m.get(y)
      if (!agg) {
        agg = {
          year: y, meses: 0,
          totalPrestacao: 0, totalJuros: 0,
          totalAmortizacao: 0, totalAmortExtra: 0,
          capitalFinal: r.capital,
        }
        m.set(y, agg)
      }
      agg.meses += 1
      agg.totalPrestacao += r.prestacao
      agg.totalJuros += r.juros
      agg.totalAmortizacao += r.amortizacao
      agg.totalAmortExtra += r.amortExtra
      agg.capitalFinal = r.capital // last row of year overwrites
    }
    return Array.from(m.values())
  }, [rows])

  return (
    <div className="annual-table-wrap">
      <table className="annual-table">
        <thead>
          <tr>
            <th>Ano</th>
            <th>Meses</th>
            <th>Pago</th>
            <th>Juros</th>
            <th>Capital</th>
            <th>Amort. extra</th>
            <th>Capital em dívida</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.year}>
              <td className="annual-year">{y.year}</td>
              <td>{y.meses}</td>
              <td>{eur(y.totalPrestacao)}</td>
              <td className="annual-juros">{eur(y.totalJuros)}</td>
              <td>{eur(y.totalAmortizacao)}</td>
              <td className={y.totalAmortExtra > 0 ? 'annual-extra' : 'muted'}>
                {y.totalAmortExtra > 0 ? eur(y.totalAmortExtra) : '—'}
              </td>
              <td className="annual-capital">{eur(y.capitalFinal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default AnnualTable
