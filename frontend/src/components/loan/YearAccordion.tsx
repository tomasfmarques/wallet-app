import { useMemo, useState } from 'react'
import { eur2, ymToShort, currentYm } from '@/lib/format'
import { useUpdatePayment, type LoanScheduleRow } from '@/hooks/useLoan'
import type { LoanPayment } from '@/types'

interface Props {
  rows: LoanScheduleRow[]
  payments: LoanPayment[]
  loanId: string
}

// Year-grouped accordion replacing the flat tracking list. Current year is
// open by default; clicking the header collapses/expands.
export function YearAccordion({ rows, payments, loanId }: Props) {
  const today = currentYm()
  const todayYear = today.slice(0, 4)

  const paymentsByYm = useMemo(() => {
    const m = new Map<string, LoanPayment>()
    for (const p of payments) m.set(p.ym, p)
    return m
  }, [payments])

  const byYear = useMemo(() => {
    const m = new Map<string, LoanScheduleRow[]>()
    for (const r of rows) {
      const y = r.ym.slice(0, 4)
      const list = m.get(y) ?? []
      list.push(r)
      m.set(y, list)
    }
    return Array.from(m.entries()).map(([year, yearRows]) => ({
      year,
      rows: yearRows,
      totalPrestacao: yearRows.reduce((s, r) => s + r.prestacao, 0),
      monthsPaid: yearRows.filter((r) => paymentsByYm.get(r.ym)?.paid).length,
    }))
  }, [rows, paymentsByYm])

  const [openYears, setOpenYears] = useState<Set<string>>(new Set([todayYear]))

  const toggle = (year: string) => {
    setOpenYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year); else next.add(year)
      return next
    })
  }

  return (
    <div className="year-accordion">
      {byYear.map(({ year, rows: yearRows, totalPrestacao, monthsPaid }) => {
        const isOpen = openYears.has(year)
        return (
          <div key={year} className={`year-block ${isOpen ? 'is-open' : ''}`}>
            <button
              type="button"
              className="year-header"
              onClick={() => toggle(year)}
              aria-expanded={isOpen}
            >
              <span className="year-chevron" aria-hidden>{isOpen ? '▾' : '▸'}</span>
              <span className="year-label">{year}</span>
              <span className="year-meta">
                {monthsPaid}/{yearRows.length} pagos · {eur2(totalPrestacao)}
              </span>
            </button>
            {isOpen && (
              <div className="year-body">
                {yearRows.map((r) => (
                  <TrackingRow
                    key={r.ym}
                    row={r}
                    payment={paymentsByYm.get(r.ym)}
                    isCurrent={r.ym === today}
                    loanId={loanId}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

interface RowProps {
  row: LoanScheduleRow
  payment?: LoanPayment
  isCurrent: boolean
  loanId: string
}

function TrackingRow({ row, payment, isCurrent, loanId }: RowProps) {
  const mutation = useUpdatePayment()
  const [realInput, setRealInput] = useState<string>(
    payment?.real != null ? String(payment.real) : '',
  )

  const onTogglePaid = () => {
    mutation.mutate({ loanId, ym: row.ym, paid: !payment?.paid })
  }
  const onRealBlur = () => {
    const trimmed = realInput.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && !Number.isFinite(value)) return
    if ((payment?.real ?? null) === value) return
    mutation.mutate({ loanId, ym: row.ym, real: value })
  }

  return (
    <div className={`tracking-row ${isCurrent ? 'is-current' : ''} ${payment?.paid ? 'is-paid' : ''}`}>
      <div className="tracking-ym">{ymToShort(row.ym)}</div>
      <div className="tracking-prestacao">{eur2(row.prestacao)}</div>
      <div className="tracking-paid">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!payment?.paid}
            onChange={onTogglePaid}
            disabled={mutation.isLoading}
          />
          <span>Pago</span>
        </label>
      </div>
      <div className="tracking-real">
        <input
          type="number" inputMode="decimal" step="any" min="0"
          placeholder="valor real"
          value={realInput}
          onChange={(e) => setRealInput(e.target.value)}
          onBlur={onRealBlur}
          disabled={mutation.isLoading}
        />
      </div>
    </div>
  )
}

export default YearAccordion
