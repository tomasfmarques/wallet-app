import { useMemo, useState } from 'react'
import { eur2, ymToShort, currentYm, ymAddMonths } from '@/lib/format'
import { useUpdatePayment, useBulkUpdatePayments, type LoanScheduleRow } from '@/hooks/useLoan'
import type { LoanPayment } from '@/types'

interface Props {
  rows: LoanScheduleRow[]
  payments: LoanPayment[]
  loanId: string
  dataInicio: string
  bonificacaoMensal?: number | null
  bonificacaoMeses?: number | null
}

export function YearAccordion({ rows, payments, loanId, dataInicio, bonificacaoMensal, bonificacaoMeses }: Props) {
  const today = currentYm()
  const todayYear = today.slice(0, 4)

  const bonEndYm = useMemo(() => {
    if (bonificacaoMensal && bonificacaoMensal > 0 && bonificacaoMeses && bonificacaoMeses > 0) {
      return ymAddMonths(dataInicio, bonificacaoMeses)
    }
    return null
  }, [dataInicio, bonificacaoMensal, bonificacaoMeses])

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
    return Array.from(m.entries()).map(([year, yearRows]) => {
      const monthsPaid = yearRows.filter((r) => paymentsByYm.get(r.ym)?.paid).length
      const totalPrestacao = yearRows.reduce((s, r) => {
        const p = paymentsByYm.get(r.ym)
        return s + (p?.paid && p.real != null ? p.real : r.prestacao)
      }, 0)
      return { year, rows: yearRows, totalPrestacao, monthsPaid }
    })
  }, [rows, paymentsByYm])

  const [openYears, setOpenYears] = useState<Set<string>>(new Set([todayYear]))
  const [fillingYear, setFillingYear] = useState<string | null>(null)
  const [fillAmount, setFillAmount] = useState('')
  const bulkUpdate = useBulkUpdatePayments()

  const toggle = (year: string) => {
    const isCurrentlyOpen = openYears.has(year)
    setOpenYears((prev) => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year); else next.add(year)
      return next
    })
    if (isCurrentlyOpen && fillingYear === year) cancelFill()
  }

  const startFill = (e: React.MouseEvent, year: string) => {
    e.stopPropagation()
    setFillingYear(year)
    setFillAmount('')
    setOpenYears((prev) => { const n = new Set(prev); n.add(year); return n })
  }

  const cancelFill = () => { setFillingYear(null); setFillAmount('') }

  const confirmFill = async (yearRows: LoanScheduleRow[]) => {
    const val = Number(fillAmount)
    if (!Number.isFinite(val) || val < 0) return
    const months = yearRows.map((r) => ({ ym: r.ym, paid: true, real: val }))
    try {
      await bulkUpdate.mutateAsync({ loanId, months })
      setFillingYear(null)
      setFillAmount('')
    } catch {
      // error stays visible via bulkUpdate.error if needed
    }
  }

  return (
    <div className="year-accordion">
      {byYear.map(({ year, rows: yearRows, totalPrestacao, monthsPaid }) => {
        const isOpen = openYears.has(year)
        const isFilling = fillingYear === year
        return (
          <div key={year} className={`year-block ${isOpen ? 'is-open' : ''}`}>
            <div className="year-header">
              <button
                type="button"
                className="year-toggle"
                onClick={() => toggle(year)}
                aria-expanded={isOpen}
              >
                <span className="year-chevron" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                <span className="year-label">{year}</span>
                <span className="year-meta">
                  {monthsPaid}/{yearRows.length} pagos · {eur2(totalPrestacao)}
                </span>
              </button>
              <button
                type="button"
                className="btn-pay-year"
                onClick={(e) => startFill(e, year)}
                title="Preencher todos os meses com o mesmo valor"
              >
                Pagar ano
              </button>
            </div>
            {isOpen && (
              <div className="year-body">
                {isFilling && (
                  <div className="year-fill-bar">
                    <span className="year-fill-label">Valor pago por mês (€)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      className="year-fill-input"
                      placeholder="ex: 831.73"
                      value={fillAmount}
                      onChange={(e) => setFillAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') confirmFill(yearRows)
                        if (e.key === 'Escape') cancelFill()
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => confirmFill(yearRows)}
                      disabled={bulkUpdate.isLoading || fillAmount.trim() === ''}
                    >
                      {bulkUpdate.isLoading ? '…' : 'Confirmar'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={cancelFill}
                      disabled={bulkUpdate.isLoading}
                    >
                      Cancelar
                    </button>
                  </div>
                )}
                {yearRows.map((r) => (
                  <TrackingRow
                    key={r.ym}
                    row={r}
                    payment={paymentsByYm.get(r.ym)}
                    isCurrent={r.ym === today}
                    loanId={loanId}
                    bonificacaoMensal={bonEndYm && r.ym < bonEndYm ? bonificacaoMensal : null}
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
  bonificacaoMensal?: number | null
}

function TrackingRow({ row, payment, isCurrent, loanId, bonificacaoMensal }: RowProps) {
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

  const displayPrestacao = payment?.paid && payment.real != null ? payment.real : row.prestacao
  const netPrestacao = bonificacaoMensal != null && bonificacaoMensal > 0
    ? displayPrestacao - bonificacaoMensal
    : null

  return (
    <div className={`tracking-row ${isCurrent ? 'is-current' : ''} ${payment?.paid ? 'is-paid' : ''}`}>
      <div className="tracking-ym">{ymToShort(row.ym)}</div>
      <div className="tracking-prestacao">
        {netPrestacao != null
          ? <span title={`Bruto: ${eur2(displayPrestacao)}`}>{eur2(netPrestacao)} <span className="bon-tag">líq.</span></span>
          : eur2(displayPrestacao)
        }
      </div>
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
