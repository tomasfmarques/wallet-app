import { useState } from 'react'
import { useLoan, useDeleteLoan } from '@/hooks/useLoan'
import { LoanKpis } from '@/components/loan/LoanKpis'
import { LoanSetupForm } from '@/components/loan/LoanSetupForm'
import { YearAccordion } from '@/components/loan/YearAccordion'
import { CapitalChart } from '@/components/loan/CapitalChart'
import { AnnualTable } from '@/components/loan/AnnualTable'
import { SimulatorPanel } from '@/components/loan/SimulatorPanel'
import { AmortizationModal } from '@/components/loan/AmortizationModal'

type Tab = 'tracking' | 'simulacao' | 'tabela'

export function Loan() {
  const { data, isLoading, error } = useLoan()
  const del = useDeleteLoan()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'create'>('view')
  const [tab, setTab] = useState<Tab>('tracking')
  const [amortOpen, setAmortOpen] = useState(false)

  if (isLoading) {
    return <div className="auth-loading"><div className="spinner" /></div>
  }
  if (error) {
    return (
      <div className="page-stub">
        <h1>Crédito</h1>
        <div className="form-error">Não foi possível carregar os dados: {error.message}</div>
      </div>
    )
  }

  const loans = data?.loans ?? []

  // ── Empty state (no credits yet) ──
  if (loans.length === 0) {
    return (
      <div className="loan-empty">
        <h1>Crédito</h1>
        <p className="muted">
          Ainda não tens créditos. Adiciona o primeiro (casa, carro…) para começar
          o tracking mensal e ver projeções.
        </p>
        <div className="card">
          <LoanSetupForm submitLabel="Criar crédito" />
        </div>
      </div>
    )
  }

  // ── Create a new credit ──
  if (mode === 'create') {
    return (
      <div className="loan-page">
        <header className="page-header"><h1>Novo crédito</h1></header>
        <div className="card">
          <LoanSetupForm
            submitLabel="Criar crédito"
            onSaved={() => setMode('view')}
            onCancel={() => setMode('view')}
          />
        </div>
      </div>
    )
  }

  // Resolve the selected credit (fall back to the first).
  const selected = loans.find((l) => l.loan.id === selectedId) ?? loans[0]
  const { loan, schedule, kpis } = selected

  // ── Editing the selected credit ──
  if (mode === 'edit') {
    return (
      <div className="loan-page">
        <header className="page-header"><h1>Editar {loan.name}</h1></header>
        <div className="card">
          <LoanSetupForm
            loanId={loan.id}
            initial={{
              name: loan.name, capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
              mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor, dataInicio: loan.dataInicio,
            }}
            onSaved={() => setMode('view')}
            onCancel={() => setMode('view')}
          />
        </div>
      </div>
    )
  }

  const removeCredit = () => {
    if (!confirm(`Remover o crédito "${loan.name}"? Esta ação é permanente.`)) return
    del.mutate(loan.id, { onSuccess: () => setSelectedId(null) })
  }

  // ── Normal view ──
  return (
    <div className="loan-page">
      <header className="page-header">
        <h1>Crédito</h1>
        <div className="page-header-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setAmortOpen(true)}>
            Amortizações ({loan.amortizations.length})
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setMode('edit')}>
            Editar dados
          </button>
          <button type="button" className="btn btn-ghost" onClick={removeCredit} disabled={del.isLoading}>
            Remover
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setMode('create')}>
            + Adicionar crédito
          </button>
        </div>
      </header>

      {/* Credit selector (one chip per credit) */}
      {loans.length > 1 && (
        <div className="month-tabs" role="tablist" style={{ marginBottom: 14 }}>
          {loans.map((l) => (
            <button
              key={l.loan.id}
              type="button"
              role="tab"
              aria-selected={l.loan.id === loan.id}
              className={`month-tab ${l.loan.id === loan.id ? 'is-active' : ''}`}
              onClick={() => setSelectedId(l.loan.id)}
            >
              {l.loan.name}
            </button>
          ))}
        </div>
      )}

      <LoanKpis kpis={kpis} capitalInicial={loan.capital} />

      <div className="subtabs" role="tablist">
        <button
          type="button" role="tab" aria-selected={tab === 'tracking'}
          className={`subtab ${tab === 'tracking' ? 'is-active' : ''}`}
          onClick={() => setTab('tracking')}
        >Tracking mensal</button>
        <button
          type="button" role="tab" aria-selected={tab === 'simulacao'}
          className={`subtab ${tab === 'simulacao' ? 'is-active' : ''}`}
          onClick={() => setTab('simulacao')}
        >Simulação</button>
        <button
          type="button" role="tab" aria-selected={tab === 'tabela'}
          className={`subtab ${tab === 'tabela' ? 'is-active' : ''}`}
          onClick={() => setTab('tabela')}
        >Tabela anual</button>
      </div>

      {tab === 'tracking' && (
        <>
          <section>
            <h2 className="section-label">EVOLUÇÃO DO CAPITAL</h2>
            <div className="card card-pad-lg">
              <CapitalChart
                series={[{ label: 'Capital em dívida', rows: schedule.rows, colour: '#2563EB', fill: true }]}
                height={260}
              />
            </div>
          </section>
          <section>
            <h2 className="section-label">PAGAMENTOS</h2>
            <YearAccordion rows={schedule.rows} payments={loan.payments} loanId={loan.id} />
          </section>
        </>
      )}

      {tab === 'simulacao' && (
        <SimulatorPanel
          key={loan.id}
          loanId={loan.id}
          loanEuribor={loan.euribor}
          loanDataInicio={loan.dataInicio}
          loanPrazoMeses={loan.prazoMeses}
        />
      )}

      {tab === 'tabela' && (
        <section>
          <AnnualTable rows={schedule.rows} />
        </section>
      )}

      <AmortizationModal
        open={amortOpen}
        onClose={() => setAmortOpen(false)}
        amortizations={loan.amortizations}
        loanId={loan.id}
      />
    </div>
  )
}

export default Loan
