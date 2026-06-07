import { useState } from 'react'
import { useUpdateIncome, useUpdateExpense } from '@/hooks/useBudget'
import { eur } from '@/lib/format'
import type { Income, Expense, ExpenseType } from '@/types'

interface Props {
  pendingIncomes: Income[]
  pendingExpenses: Expense[]
}

// e-Fatura-style holding area. Imported statement lines land here (kind known
// from the +/− sign, but fixed/variable not yet decided). The user taps
// "Fixa" or "Variável" and the line moves into the matching table — backed by
// a single PATCH that sets `type` and clears `pending`.
export function PendingClassifier({ pendingIncomes, pendingExpenses }: Props) {
  const total = pendingIncomes.length + pendingExpenses.length
  if (total === 0) return null

  const rows = [
    ...pendingIncomes.map((i) => ({ kind: 'income' as const, item: i })),
    ...pendingExpenses.map((e) => ({ kind: 'expense' as const, item: e })),
  ]

  return (
    <section className="pending-box">
      <div className="pending-head">
        <span className="pending-icon" aria-hidden>📥</span>
        <div className="pending-head-text">
          <strong>{total} {total === 1 ? 'linha por classificar' : 'linhas por classificar'}</strong>
          <span className="muted"> · escolhe <b>Fixa</b> ou <b>Variável</b> e a linha move-se para a tabela certa.</span>
        </div>
      </div>
      <ul className="pending-list">
        {rows.map(({ kind, item }) => (
          <PendingRow key={`${kind}-${item.id}`} kind={kind} item={item} />
        ))}
      </ul>
    </section>
  )
}

function PendingRow({ kind, item }: { kind: 'income' | 'expense'; item: Income | Expense }) {
  const updIncome = useUpdateIncome()
  const updExpense = useUpdateExpense()
  const [busy, setBusy] = useState<ExpenseType | null>(null)

  const classify = async (type: ExpenseType) => {
    setBusy(type)
    try {
      if (kind === 'income') await updIncome.mutateAsync({ id: item.id, patch: { type, pending: false } })
      else await updExpense.mutateAsync({ id: item.id, patch: { type, pending: false } })
      // On success the budget query invalidates and the row disappears here.
    } catch {
      setBusy(null)
    }
  }

  return (
    <li className="pending-row">
      <div className="pending-row-main">
        <span className={`pending-pill ${kind === 'income' ? 'is-income' : 'is-expense'}`}>
          {kind === 'income' ? 'Receita' : 'Despesa'}
        </span>
        <span className="pending-row-name">{item.name}</span>
        {item.category && <span className="pending-row-cat muted">{item.category}</span>}
      </div>
      <div className="pending-row-amount">{eur(item.amount)}</div>
      <div className="pending-row-actions">
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => classify('fixed')}>
          {busy === 'fixed' ? '…' : 'Fixa'}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => classify('variable')}>
          {busy === 'variable' ? '…' : 'Variável'}
        </button>
      </div>
    </li>
  )
}

export default PendingClassifier
