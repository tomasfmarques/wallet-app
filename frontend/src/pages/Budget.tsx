import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Icon } from '@/components/ui/Icon'
import { useTranslation, Trans } from 'react-i18next'
import { useBudget, useDeleteIncome, useDeleteExpense, useCleanupEncoding } from '@/hooks/useBudget'
import { MonthCloseModal, latestActualsYm, monthCloseSeen, markMonthCloseSeen } from '@/components/budget/MonthCloseModal'
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
import { useBankCallback } from '@/hooks/useBank'
import { MonthAnalysis } from '@/components/budget/MonthAnalysis'
import { CategoryDrilldownModal } from '@/components/budget/CategoryDrilldownModal'
import { StateBlock } from '@/components/ui/StateBlock'
import { eur, eur2, currentYm } from '@/lib/format'
import { categoryLabel } from '@/lib/categoryDictionary'
import { asFrequency, fromMonthly } from '@/lib/budgetFrequency'
import { exportCsv } from '@/lib/csvExport'
import type { Income, Expense, ExpenseType } from '@/types'

type Tab = 'tables' | 'analysis'
type AnalysisScope = 'overview' | 'month'

// Feature flag (2026-07-16): the fixed/variable triage box is hidden — imports
// now land pre-classified as variable actuals (backend IMPORTS_AUTO_CLASSIFY)
// and the user promotes lines to Fixa through the lists when needed. Flip to
// true (with the backend flag off) to restore the triage flow; the component
// is kept, not removed.
const SHOW_PENDING_CLASSIFIER = false

export function Budget() {
  const { t } = useTranslation('budget')
  const { data, isLoading, isFetching, error, refetch } = useBudget()
  const delIncome = useDeleteIncome()
  const delExpense = useDeleteExpense()
  const cleanupEncoding = useCleanupEncoding()

  // Análise first: the charts are the "how am I doing?" glance; Tabelas is for
  // editing the plan.
  const [tab, setTab] = useState<Tab>('analysis')
  const [analysisScope, setAnalysisScope] = useState<AnalysisScope>('overview')
  const [analysisYm, setAnalysisYm] = useState(currentYm())
  const [incomeModal, setIncomeModal] = useState<{ open: boolean; type: ExpenseType; income?: Income; defaultStartYm?: string }>({ open: false, type: 'fixed' })
  const [expenseModal, setExpenseModal] = useState<{ open: boolean; type: ExpenseType; expense?: Expense; defaultStartYm?: string }>({ open: false, type: 'fixed' })
  const [importOpen, setImportOpen] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  // Category drill-down from the Análise donuts: which donut + which canonical
  // category (null = the uncategorized bucket) — opens a listing modal.
  const [donutFilter, setDonutFilter] = useState<{ list: 'fixed' | 'variable' | 'income'; category: string | null } | null>(null)
  // Success notice after arriving from a loan create that auto-added a linked
  // fixed expense (nav state from Loan.tsx). Seeded once, then the history
  // state is cleared so a refresh / back-forward won't resurface it.
  const location = useLocation()
  const [showLoanLinkedNotice, setShowLoanLinkedNotice] = useState(
    !!(location.state as { loanLinkedExpense?: boolean } | null)?.loanLinkedExpense,
  )
  useEffect(() => {
    if ((location.state as { loanLinkedExpense?: boolean } | null)?.loanLinkedExpense) {
      window.history.replaceState({}, '')
    }
  }, [])

  // Bank-consent return leg: Enable Banking redirects to /budget?code=…&state=…
  // Exchange it for a linked session, strip the params, then open the bank modal
  // so "Sincronizar" is right there. Runs once (guarded on the URL having code).
  const bankCallback = useBankCallback()
  const [bankLinkError, setBankLinkError] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    if (!code || !state) return
    // Strip the sensitive params from the URL immediately (before the request
    // resolves) so they never linger in history or a shared link.
    window.history.replaceState({}, '', window.location.pathname)
    bankCallback.mutate({ code, state }, {
      // Only open the modal once the link actually succeeded — opening it on
      // failure would show an empty "no banks connected" list with no hint why.
      onSuccess: () => setBankOpen(true),
      onError: () => setBankLinkError(true),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // "Fecho do mês": auto-open once per month after an import (localStorage
  // seen-gate), or manually from the Análise tab. `awaitClose` waits for the
  // post-import refetch so the FIRST-ever import is included in the data.
  const [monthCloseYm, setMonthCloseYm] = useState<string | null>(null)
  const [awaitClose, setAwaitClose] = useState(false)

  useEffect(() => {
    if (!awaitClose || !data || isFetching) return
    setAwaitClose(false)
    const ym = latestActualsYm(data.actualIncomes, data.actualExpenses)
    if (ym && !monthCloseSeen(ym)) {
      markMonthCloseSeen(ym)
      setMonthCloseYm(ym)
    }
  }, [awaitClose, data, isFetching])

  if (isLoading) return <div className="auth-loading"><div className="spinner" /></div>
  if (error) return (
    <div className="page-stub">
      <h1>{t('title')}</h1>
      <StateBlock variant="error" message={t('loadError')} onRetry={() => refetch()} />
    </div>
  )
  if (!data) return null

  const { incomes, expenses, actualIncomes, actualExpenses, pendingIncomes, pendingExpenses, kpis } = data

  // Rows mangled by the old import-encoding bug (names containing �).
  const mojibakeCount = [
    ...incomes, ...expenses, ...actualIncomes, ...actualExpenses, ...pendingIncomes, ...pendingExpenses,
  ].filter((r) => r.name.includes('�')).length

  const handleCleanupEncoding = async () => {
    if (!confirm(t('mojibake.confirm', { count: mojibakeCount }))) return
    const { deleted } = await cleanupEncoding.mutateAsync()
    alert(t('mojibake.alert', { deleted }))
  }
  // Latest month with imported actuals — the month the manual close reviews.
  const closableYm = latestActualsYm(actualIncomes, actualExpenses)

  const fixedIncomes = incomes.filter((i) => i.type === 'fixed')
  const variableIncomes = incomes.filter((i) => i.type === 'variable')
  const fixedExpenses = expenses.filter((e) => e.type === 'fixed')
  const variableExpenses = expenses.filter((e) => e.type === 'variable')
  const sumActive = <T extends { active: boolean; amount: number }>(rows: T[]) =>
    rows.filter((r) => r.active).reduce((s, r) => s + r.amount, 0)

  // Cadence sub-text for non-monthly rows: e.g. "Anual · €2.400,00" (the period
  // amount, reconstructed from the stored monthly-equivalent).
  const freqMeta = (r: { frequency?: string; amount: number }): string | null => {
    const f = asFrequency(r.frequency)
    return f === 'monthly' ? null : t('freq.meta', { label: t(`freq.${f}`), period: eur2(fromMonthly(r.amount, f)) })
  }

  // Export every budget line (plan + imported actuals) as a CSV — raw amounts so
  // it opens cleanly in a spreadsheet; formula-injection-guarded in csvExport.
  const handleExportCsv = () => {
    const line = (kind: string) => (r: Income | Expense) => [
      kind, r.name, r.category ? categoryLabel(r.category) : '',
      r.type === 'fixed' ? t('kind.fixed') : t('kind.variable'),
      t(`freq.${asFrequency(r.frequency)}`),
      r.amount, r.startYm ?? '', r.source ?? t('csv.manual'),
    ]
    const rows = [
      ...[...incomes, ...actualIncomes].map(line(t('csv.income'))),
      ...[...expenses, ...actualExpenses].map(line(t('csv.expense'))),
    ]
    if (rows.length === 0) return
    exportCsv(
      `wallet360-saldo-${currentYm()}`,
      [t('csv.kind'), t('csv.name'), t('csv.category'), t('csv.class'), t('freq.label'), t('csv.amount'), t('csv.month'), t('csv.source')],
      rows,
    )
  }

  return (
    <div className="budget-page">
      <header className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="btn btn-ghost" onClick={handleExportCsv}>
            {t('csv.button')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setBankOpen(true)}>
            <Icon name="bank" size={15} />{t('connectBank')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
            {t('importStatement')}
          </button>
        </div>
      </header>

      {mojibakeCount > 0 && (
        <div className="encoding-banner">
          <span className="encoding-banner-text">
            <Trans i18nKey="mojibake.banner" ns="budget" values={{ count: mojibakeCount }} components={{ 1: <strong /> }} />
          </span>
          <button
            type="button" className="btn btn-primary btn-sm"
            disabled={cleanupEncoding.isLoading}
            onClick={handleCleanupEncoding}
          >
            {cleanupEncoding.isLoading ? t('mojibake.removing') : t('mojibake.remove', { count: mojibakeCount })}
          </button>
        </div>
      )}

      {bankLinkError && (
        <div className="encoding-banner">
          <span className="encoding-banner-text">{t('bank.linkError')}</span>
          <button
            type="button" className="btn btn-ghost btn-sm"
            onClick={() => setBankLinkError(false)}
          >
            {t('actions.close', { ns: 'common' })}
          </button>
        </div>
      )}

      {showLoanLinkedNotice && (
        <div className="encoding-banner">
          <span className="encoding-banner-text">
            <Trans i18nKey="loanLinked.banner" ns="budget" components={{ 1: <strong /> }} />
          </span>
          <button
            type="button" className="btn btn-ghost btn-sm"
            onClick={() => setShowLoanLinkedNotice(false)}
          >
            {t('actions.close', { ns: 'common' })}
          </button>
        </div>
      )}

      {SHOW_PENDING_CLASSIFIER && (
        <PendingClassifier pendingIncomes={pendingIncomes} pendingExpenses={pendingExpenses} />
      )}

      {/* Include the ACTUALS lanes: since FX1 split plan/actuals, imported and
          bank-synced movements live there — without them the banner went blind
          to exactly the rows that most need categorizing. */}
      <UncategorizedBanner
        incomes={[...incomes, ...actualIncomes]}
        expenses={[...expenses, ...actualExpenses]}
      />

      <BudgetKpis kpis={kpis} />

      <div className="subtabs" role="tablist">
        <button
          type="button" role="tab" aria-selected={tab === 'analysis'}
          className={`subtab ${tab === 'analysis' ? 'is-active' : ''}`}
          onClick={() => setTab('analysis')}
        >{t('tabs.analysis')}</button>
        <button
          type="button" role="tab" aria-selected={tab === 'tables'}
          className={`subtab ${tab === 'tables' ? 'is-active' : ''}`}
          onClick={() => setTab('tables')}
        >{t('tabs.tables')}</button>
      </div>

      {tab === 'tables' && (
        <>
          <section>
            <div className="budget-section-head">
              <h2 className="section-label" style={{ margin: 0 }}>{t('labels.fixedIncome')}</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setIncomeModal({ open: true, type: 'fixed' })}>
                + {t('addFixed')}
              </button>
            </div>
            <BudgetList
              rows={fixedIncomes.map((i) => ({
                id: i.id, name: i.name, amount: i.amount, category: i.category, active: i.active,
                meta: [freqMeta(i), i.startYm ? t('list.sinceMeta', { ym: i.startYm }) : null].filter(Boolean).join(' · ') || undefined,
                onEdit: () => setIncomeModal({ open: true, type: 'fixed', income: i }),
                onDelete: () => { if (confirm(t('list.removeConfirm', { name: i.name }))) delIncome.mutate(i.id) },
              }))}
              totalLabel={t('list.totalFixedIncome')}
              total={sumActive(fixedIncomes)}
              emptyText={t('list.emptyFixedIncome')}
            />
          </section>

          <section>
            <div className="budget-section-head">
              <h2 className="section-label" style={{ margin: 0 }}>{t('labels.fixedExpenses')}</h2>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setExpenseModal({ open: true, type: 'fixed' })}>
                + {t('addFixed')}
              </button>
            </div>
            <BudgetList
              rows={fixedExpenses.map((e) => ({
                id: e.id, name: e.name, amount: e.amount, category: e.category, active: e.active,
                meta: [freqMeta(e), e.loanId ? t('list.loanLinked') : null, e.dayOfMonth ? t('list.dayMeta', { day: e.dayOfMonth }) : null]
                  .filter(Boolean).join(' · ') || undefined,
                onEdit: () => setExpenseModal({ open: true, type: 'fixed', expense: e }),
                onDelete: () => { if (confirm(t('list.removeConfirm', { name: e.name }))) delExpense.mutate(e.id) },
              }))}
              totalLabel={t('list.totalFixed')}
              total={kpis.fixedTotal}
              emptyText={t('list.emptyFixedExpenses')}
            />
          </section>

          <VariableMonths
            variableIncomes={variableIncomes}
            variableExpenses={variableExpenses}
            actualIncomes={actualIncomes}
            actualExpenses={actualExpenses}
            onEditIncome={(i) => setIncomeModal({ open: true, type: 'variable', income: i })}
            onEditExpense={(e) => setExpenseModal({ open: true, type: 'variable', expense: e })}
            onAddIncome={(ym) => setIncomeModal({ open: true, type: 'variable', defaultStartYm: ym })}
            onAddExpense={(ym) => setExpenseModal({ open: true, type: 'variable', defaultStartYm: ym })}
          />
        </>
      )}

      {tab === 'analysis' && (
        <>
          <div className="budget-section-head">
            <div className="toggle-group analysis-scope-toggle">
              <button
                type="button"
                className={`toggle-btn ${analysisScope === 'overview' ? 'toggle-btn-active' : ''}`}
                onClick={() => setAnalysisScope('overview')}
              >
                {t('scope.overview')}
              </button>
              <button
                type="button"
                className={`toggle-btn ${analysisScope === 'month' ? 'toggle-btn-active' : ''}`}
                onClick={() => setAnalysisScope('month')}
              >
                {t('scope.month')}
              </button>
            </div>
            {closableYm && (
              <button
                type="button" className="btn btn-ghost btn-sm"
                onClick={() => setMonthCloseYm(closableYm)}
              >
                <Icon name="check" size={15} />{t('monthClose.button')}
              </button>
            )}
          </div>

          {analysisScope === 'overview' ? (
            <>
              <section>
                <h2 className="section-label">{t('labels.history')}</h2>
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
                <h2 className="section-label">{t('labels.categoryDistribution')}</h2>
                <div className="donut-grid">
                  <CategoryDonut
                    items={fixedExpenses}
                    title={t('donutTitles.fixedExpenses')}
                    emptyText={t('donut.emptyFixed')}
                    onSliceClick={(category) => setDonutFilter({ list: 'fixed', category })}
                  />
                  <CategoryDonut
                    items={variableExpenses}
                    title={t('donutTitles.variableExpenses')}
                    emptyText={t('donut.emptyVariable')}
                    onSliceClick={(category) => setDonutFilter({ list: 'variable', category })}
                  />
                  <CategoryDonut
                    items={incomes}
                    title={t('donutTitles.incomes')}
                    emptyText={t('donut.emptyIncome')}
                    onSliceClick={(category) => setDonutFilter({ list: 'income', category })}
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
      {donutFilter && (
        <CategoryDrilldownModal
          list={donutFilter.list}
          category={donutFilter.category}
          items={donutFilter.list === 'fixed' ? fixedExpenses
            : donutFilter.list === 'variable' ? variableExpenses
            : incomes}
          onClose={() => setDonutFilter(null)}
        />
      )}
      <ImportStatementModal open={importOpen} onClose={() => setImportOpen(false)} onImported={() => setAwaitClose(true)} />
      <BankConnectModal open={bankOpen} onClose={() => setBankOpen(false)} />
      {monthCloseYm && (
        <MonthCloseModal
          open onClose={() => setMonthCloseYm(null)}
          incomes={incomes} expenses={expenses}
          actualIncomes={actualIncomes} actualExpenses={actualExpenses}
          ym={monthCloseYm}
        />
      )}
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
  const { t } = useTranslation('budget')
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
                {!r.active && <span className="budget-pill-paused">{t('list.paused')}</span>}
              </div>
              {(r.category || r.meta) && (
                <div className="budget-row-sub">
                  {r.category
                    ? <span className="budget-row-category">{categoryLabel(r.category)}</span>
                    : <span className="budget-pill-uncat">{t('list.uncategorized')}</span>}
                  {r.meta && <span className="muted">{r.meta}</span>}
                </div>
              )}
            </div>
            <div className="budget-row-amount">{eur2(r.amount)}</div>
            <div className="budget-row-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={r.onEdit}>{t('actions.edit', { ns: 'common' })}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={r.onDelete}>{t('actions.remove', { ns: 'common' })}</button>
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
