import { useState } from 'react'
import { useLoan } from '@/hooks/useLoan'
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
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<Tab>('tracking')
  const [amortOpen, setAmortOpen] = useState(false)

  if (isLoading) {
    return <div className="auth-loading"><div className="spinner" /></div>
  }
  if (error) {
    return (
      <div className="page-stub">
        <h1>Empréstimo</h1>
        <div className="form-error">Não foi possível carregar os dados: {error.message}</div>
      </div>
    )
  }

  // ── Empty state ──
  if (!data?.loan) {
    return (
      <div className="loan-empty">
        <h1>Empréstimo da casa</h1>
        <p className="muted">
          Ainda não configuraste o teu empréstimo. Preenche os dados para começar
          o tracking mensal e ver projeções.
        </p>
        <div className="card">
          <LoanSetupForm submitLabel="Criar empréstimo" />
        </div>
      </div>
    )
  }

  const { loan, schedule, kpis } = data

  // ── Editing existing loan ──
  if (editing) {
    return (
      <div className="loan-page">
        <header className="page-header">
          <h1>Editar empréstimo</h1>
        </header>
        <div className="card">
          <LoanSetupForm
            initial={{
              capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
              mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
              dataInicio: loan.dataInicio,
            }}
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      </div>
    )
  }

  // ── Normal view with tabs ──
  return (
    <div className="loan-page">
      <header className="page-header">
        <h1>Empréstimo da casa</h1>
        <div className="page-header-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setAmortOpen(true)}>
            Amortizações ({loan.amortizations.length})
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
            Editar dados
          </button>
        </div>
      </header>

      {kpis && <LoanKpis kpis={kpis} capitalInicial={loan.capital} />}

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

      {tab === 'tracking' && schedule && (
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
            <YearAccordion rows={schedule.rows} payments={loan.payments} />
          </section>
        </>
      )}

      {tab === 'simulacao' && (
        <SimulatorPanel
          loanEuribor={loan.euribor}
          loanDataInicio={loan.dataInicio}
          loanPrazoMeses={loan.prazoMeses}
        />
      )}

      {tab === 'tabela' && schedule && (
        <section>
          <AnnualTable rows={schedule.rows} />
        </section>
      )}

      <AmortizationModal
        open={amortOpen}
        onClose={() => setAmortOpen(false)}
        amortizations={loan.amortizations}
      />
    </div>
  )
}

export default Loan
