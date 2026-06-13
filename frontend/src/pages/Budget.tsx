import { useState } from 'react'
import { useBudget, useDeleteIncome, useDeleteExpense } from '@/hooks/useBudget'
import { BudgetKpis } from '@/components/budget/BudgetKpis'
import { IncomeModal } from '@/components/budget/IncomeModal'
import { ExpenseModal } from '@/components/budget/ExpenseModal'
import { CategoryDonut } from '@/components/budget/CategoryDonut'
import { BudgetTimeline } from '@/components/budget/BudgetTimeline'
import { UncategorizedBanner } from '@/components/budget/UncategorizedBanner'
import { PendingClassifier } from '@/components/budget/PendingClassifier'
import { VariableMonths } from '@/components/budget/VariableMonths'
import { ImportStatementModal } from '@/components/budget/ImportStatementModal'
import { BankConnectModal } from '@/components/budget/BankConnectModal'
import { MonthAnalysis } from '@/components/budget/MonthAnalysis'
import { StateBlock } from '@/components/ui/StateBlock'
import { eur, currentYm } from '@/lib/format'
import type { Income, Expense, ExpenseType } from '@/types'

type Tab = 'tables' | 'analysis'
type AnalysisScope = 'overview' | 'month'

export function Budget() {
  const { data, isLoading, error, refetch } = useBudget()
  const delIncome = useDeleteIncome()
  const delExpense = useDeleteExpense()

  const [tab, setTab] = useState<Tab>('tables')
  const [analysisScope, setAnalysisScope] = useState<AnalysisScope>('overview')
  const [analysisYm, setAnalysisYm] = useState(currentYm())
  const [incomeModal, setIncomeModal] = useState<{ open: boolean; type: ExpenseType; income?: Income; defaultStartYm?: string }>({ open: false, type: 'fixed' })
  const [expenseModal, setExpenseModal] = useState<{ open: boolean; type: ExpenseType; expense?: Expense; defaultStartYm?: string }>({ open: false, type: 'fixed' })
  const [importOpen, setImportOpen] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)

  if (isLoading) return <div className="auth-loading"><div className="spinner" /></div>
  if (error) return (
    <div className="page-stub">
      <h1>Saldo</h1>
      <StateBlock variant="error" message="Não foi possível carregar o teu orçamento." onRetry={() => refetch()} />
    </div>
  )
  if (!data) return null

  const { incomes, expenses, actualIncomes, actualExpenses, pendingIncomes, pendingExpenses, kpis } = data
  const fixedIncomes = incomes.filter((i) => i.type === 'fixed')
  const variableIncomes = incomes.filter((i) => i.type === 'variable')
  const fixedExpenses = expenses.filter((e) => e.type === 'fixed')
  const variableExpenses = expenses.filter((e) => e.type === 'variable')
  const sumActive = <T extends { active: boolean; amount: number }>(rows: T[]) =>
    rows.filter((r) => r.active).reduce((s, r) => s + r.amount, 0)

  return (
    <div className="budget-page">
      <header className="page-header">
        <div>
          <h1>Saldo</h1>
          <p className="muted">As tuas receitas e despesas planeadas, mês a mês.</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setBankOpen(true)}>
            🏦 Ligar banco
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
            Importar extrato
          </button>
        </div>
      </header>

      <PendingClassifier pendingIncomes={pendingIncomes} pendingExpenses={pendingExpenses} />

      <UncategorizedBanner incomes={incomes} expenses={expenses} />

      <BudgetKpis kpis={kpis} />

      <div className="subtabs" role="tablist">
        <button
          type="button" role="tab" aria-selected={tab === 'tables'}
          className={`subtab ${tab === 'tables' ? 'is-active' : ''}`}
          onClick={() => setTab('tables')}
        >Tabelas</button>
        <button
          type="button" role="tab" aria-selected={tab === 'analysis'}
          className={`subtab ${tab === 'analysis' ? 'is-active' : ''}`}
          onClick={() => setTab('analysis')}
        >Análise</button>
      </div>

      {tab === 'tables' && (
        <>
          <section>
            <div className="budget-section-head">
              <h2 className="section-label" style={{ margin: 0 }}>RECEITAS FIXAS</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setIncomeModal({ open: true, type: 'fixed' })}>
                + Adicionar fixa
              </button>
            </div>
            <BudgetList
              rows={fixedIncomes.map((i) => ({
                id: i.id, name: i.name, amount: i.amount, category: i.category, active: i.active,
                meta: i.startYm ? `desde ${i.startYm}` : undefined,
                onEdit: () => setIncomeModal({ open: true, type: 'fixed', income: i }),
                onDelete: () => { if (confirm(`Remover "${i.name}"?`)) delIncome.mutate(i.id) },
              }))}
              totalLabel="Total receitas fixas"
              total={sumActive(fixedIncomes)}
              emptyText="Sem receitas fixas. Adiciona o salário ou outras entradas recorrentes."
            />
          </section>

          <section>
            <div className="budget-section-head">
              <h2 className="section-label" style={{ margin: 0 }}>DESPESAS FIXAS</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setExpenseModal({ open: true, type: 'fixed' })}>
                + Adicionar fixa
              </button>
            </div>
            <BudgetList
              rows={fixedExpenses.map((e) => ({
                id: e.id, name: e.name, amount: e.amount, category: e.category, active: e.active,
                meta: e.dayOfMonth ? `dia ${e.dayOfMonth}` : undefined,
                onEdit: () => setExpenseModal({ open: true, type: 'fixed', expense: e }),
                onDelete: () => { if (confirm(`Remover "${e.name}"?`)) delExpense.mutate(e.id) },
              }))}
              totalLabel="Total fixas"
              total={kpis.fixedTotal}
              emptyText="Sem despesas fixas. Adiciona renda, subscrições, seguros, etc."
            />
          </section>

          <VariableMonths
            variableIncomes={variableIncomes}
            variableExpenses={variableExpenses}
            fixedIncomeTotal={sumActive(fixedIncomes)}
            fixedExpenseTotal={kpis.fixedTotal}
            onEditIncome={(i) => setIncomeModal({ open: true, type: 'variable', income: i })}
            onEditExpense={(e) => setExpenseModal({ open: true, type: 'variable', expense: e })}
            onAddIncome={(ym) => setIncomeModal({ open: true, type: 'variable', defaultStartYm: ym })}
            onAddExpense={(ym) => setExpenseModal({ open: true, type: 'variable', defaultStartYm: ym })}
          />
        </>
      )}

      {tab === 'analysis' && (
        <>
          <div className="toggle-group analysis-scope-toggle">
            <button
              type="button"
              className={`toggle-btn ${analysisScope === 'overview' ? 'toggle-btn-active' : ''}`}
              onClick={() => setAnalysisScope('overview')}
            >
              Visão geral
            </button>
            <button
              type="button"
              className={`toggle-btn ${analysisScope === 'month' ? 'toggle-btn-active' : ''}`}
              onClick={() => setAnalysisScope('month')}
            >
              Mês a mês
            </button>
          </div>

          {analysisScope === 'overview' ? (
            <>
              <section>
                <h2 className="section-label">HISTÓRICO</h2>
                <BudgetTimeline
                  incomes={incomes}
                  expenses={expenses}
                  actualIncomes={actualIncomes}
                  actualExpenses={actualExpenses}
                  months={12}
                  onMonthClick={(ym) => { setAnalysisYm(ym); setAnalysisScope('month') }}
                />
              </section>

              <section>
                <h2 className="section-label">DISTRIBUIÇÃO POR CATEGORIA</h2>
                <div className="donut-grid">
                  <CategoryDonut
                    items={fixedExpenses}
                    title="Despesas fixas"
                    emptyText="Adiciona despesas fixas para ver a distribuição."
                  />
                  <CategoryDonut
                    items={variableExpenses}
                    title="Despesas variáveis"
                    emptyText="Adiciona despesas variáveis para ver a distribuição."
                  />
                  <CategoryDonut
                    items={incomes}
                    title="Receitas"
                    emptyText="Adiciona receitas para ver a distribuição."
                  />
                </div>
              </section>
            </>
          ) : (
            <MonthAnalysis
              incomes={incomes}
              expenses={expenses}
              actualIncomes={actualIncomes}
              actualExpenses={actualExpenses}
              ym={analysisYm}
              onChangeYm={setAnalysisYm}
            />
          )}
        </>
      )}

      <IncomeModal
        open={incomeModal.open}
        onClose={() => setIncomeModal({ open: false, type: 'fixed' })}
        type={incomeModal.type}
        income={incomeModal.income}
        defaultStartYm={incomeModal.defaultStartYm}
      />
      <ExpenseModal
        open={expenseModal.open}
        onClose={() => setExpenseModal({ open: false, type: 'fixed' })}
        type={expenseModal.type}
        expense={expenseModal.expense}
        defaultStartYm={expenseModal.defaultStartYm}
      />
      <ImportStatementModal open={importOpen} onClose={() => setImportOpen(false)} />
      <BankConnectModal open={bankOpen} onClose={() => setBankOpen(false)} />
    </div>
  )
}

// ── Reusable row list ──────────────────────────────────────────
interface RowItem {
  id: string
  name: string
  amount: number
  category: string | null
  active: boolean
  meta?: string
  onEdit: () => void
  onDelete: () => void
}

function BudgetList({
  rows, totalLabel, total, emptyText,
}: {
  rows: RowItem[]
  totalLabel: string
  total: number
  emptyText: string
}) {
  if (rows.length === 0) {
    return <div className="card card-pad-lg muted">{emptyText}</div>
  }
  return (
    <div className="card budget-list">
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={`budget-row ${r.active ? '' : 'is-inactive'}`}>
            <div className="budget-row-main">
              <div className="budget-row-name">
                {r.name}
                {!r.active && <span className="budget-pill-paused">pausada</span>}
              </div>
              {(r.category || r.meta) && (
                <div className="budget-row-sub">
                  {r.category
                    ? <span className="budget-row-category">{r.category}</span>
                    : <span className="budget-pill-uncat">por classificar</span>}
                  {r.meta && <span className="muted">{r.meta}</span>}
                </div>
              )}
            </div>
            <div className="budget-row-amount">{eur(r.amount)}</div>
            <div className="budget-row-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={r.onEdit}>Editar</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={r.onDelete}>Remover</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="budget-row-total">
        <span>{totalLabel}</span>
        <strong>{eur(total)}</strong>
      </div>
    </div>
  )
}

export default Budget
