import { useMemo, useState } from 'react'
import { eur2, ymToLong, currentYm } from '@/lib/format'
import { useUpdatePayment, type LoanScheduleRow } from '@/hooks/useLoan'
import type { LoanPayment } from '@/types'

interface Props {
  rows: LoanScheduleRow[]
  payments: LoanPayment[]
  monthsAhead?: number   // how many future months to show; default 12
  monthsBehind?: number  // how many past months to show; default 12
}

// Simple month-by-month tracking list. Shows past + near-future months. Each
// row has the scheduled installment + a "pago" checkbox + a real-value input.
// Phase 2B will turn this into the per-year accordion from the design.
export function MonthlyTracking({
  rows,
  payments,
  monthsAhead = 12,
  monthsBehind = 12,
}: Props) {
  const today = currentYm()

  // Build a map ym → payment for O(1) lookup
  const paymentsByYm = useMemo(() => {
    const m = new Map<string, LoanPayment>()
    for (const p of payments) m.set(p.ym, p)
    return m
  }, [payments])

  // Window the schedule to past N + future N around today
  const visible = useMemo(() => {
    const idxToday = rows.findIndex((r) => r.ym >= today)
    const anchor = idxToday === -1 ? rows.length - 1 : idxToday
    const start = Math.max(0, anchor - monthsBehind)
    const end = Math.min(rows.length, anchor + monthsAhead)
    return rows.slice(start, end)
  }, [rows, today, monthsBehind, monthsAhead])

  return (
    <div className="tracking-list">
      {visible.map((row) => (
        <TrackingRow
          key={row.ym}
          row={row}
          payment={paymentsByYm.get(row.ym)}
          isCurrent={row.ym === today}
        />
      ))}
    </div>
  )
}

interface RowProps {
  row: LoanScheduleRow
  payment?: LoanPayment
  isCurrent: boolean
}

function TrackingRow({ row, payment, isCurrent }: RowProps) {
  const mutation = useUpdatePayment()
  const [realInput, setRealInput] = useState<string>(
    payment?.real != null ? String(payment.real) : '',
  )

  const onTogglePaid = () => {
    mutation.mutate({ ym: row.ym, paid: !payment?.paid })
  }

  const onRealBlur = () => {
    const trimmed = realInput.trim()
    const value = trimmed === '' ? null : Number(trimmed)
    if (trimmed !== '' && !Number.isFinite(value)) return // ignore garbage
    if ((payment?.real ?? null) === value) return // no change
    mutation.mutate({ ym: row.ym, real: value })
  }

  return (
    <div className={`tracking-row ${isCurrent ? 'is-current' : ''} ${payment?.paid ? 'is-paid' : ''}`}>
      <div className="tracking-ym">{ymToLong(row.ym)}</div>
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

export default MonthlyTracking
