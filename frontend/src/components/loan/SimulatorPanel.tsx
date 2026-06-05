import { useEffect, useState } from 'react'
import { eur, ymToShort, currentYm } from '@/lib/format'
import { useSimulation, type SimulationResult } from '@/hooks/useLoan'
import { CapitalChart } from './CapitalChart'

interface Props {
  loanEuribor: number
  loanDataInicio: string
  loanPrazoMeses: number
}

// "E se" simulator. Three sliders:
//   • Annual extra amortization amount (€)
//   • Start year for the recurring amortization
//   • Future Euribor override (%)
// Re-runs the backend simulation on each change (debounced).
export function SimulatorPanel({ loanEuribor, loanDataInicio, loanPrazoMeses }: Props) {
  const today = currentYm()
  const todayYear = Number(today.slice(0, 4))
  const startYearBase = Number(loanDataInicio.slice(0, 4))
  const endYear = startYearBase + Math.ceil(loanPrazoMeses / 12)

  const [annualAmount, setAnnualAmount] = useState(2000)
  const [startYear, setStartYear] = useState(todayYear)
  const [futureEuriborPct, setFutureEuriborPct] = useState(loanEuribor * 100)

  const simulate = useSimulation()
  const [result, setResult] = useState<SimulationResult | null>(null)

  // Debounce simulation requests by 250 ms while the user drags sliders
  useEffect(() => {
    const t = setTimeout(() => {
      simulate.mutate(
        {
          annualAmount,
          startYear,
          futureEuribor: futureEuriborPct / 100,
        },
        { onSuccess: (r) => setResult(r) },
      )
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annualAmount, startYear, futureEuriborPct])

  return (
    <div className="sim-panel">
      <div className="card card-pad-lg sim-controls">
        <h3 className="section-label" style={{ marginTop: 0 }}>PARÂMETROS</h3>

        <div className="slider-row">
          <label>
            <span>Amortização anual</span>
            <strong>{eur(annualAmount)}</strong>
          </label>
          <input
            type="range" min={0} max={20000} step={500}
            value={annualAmount}
            onChange={(e) => setAnnualAmount(Number(e.target.value))}
          />
          <span className="slider-bounds">
            <span>0 €</span><span>20 000 €</span>
          </span>
        </div>

        <div className="slider-row">
          <label>
            <span>Ano de início</span>
            <strong>{startYear}</strong>
          </label>
          <input
            type="range" min={todayYear} max={Math.min(endYear, todayYear + 20)} step={1}
            value={startYear}
            onChange={(e) => setStartYear(Number(e.target.value))}
          />
          <span className="slider-bounds">
            <span>{todayYear}</span>
            <span>{Math.min(endYear, todayYear + 20)}</span>
          </span>
        </div>

        <div className="slider-row">
          <label>
            <span>Euribor futura</span>
            <strong>{futureEuriborPct.toFixed(2)} %</strong>
          </label>
          <input
            type="range" min={0} max={6} step={0.05}
            value={futureEuriborPct}
            onChange={(e) => setFutureEuriborPct(Number(e.target.value))}
          />
          <span className="slider-bounds">
            <span>0 %</span><span>6 %</span>
          </span>
        </div>
      </div>

      {result && (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">JUROS POUPADOS</div>
              <div className="kpi-value" style={{ color: 'var(--green-d)' }}>
                {eur(Math.max(0, result.delta.interestSaved))}
              </div>
              <div className="kpi-meta">vs. cenário sem amortizações</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">TEMPO POUPADO</div>
              <div className="kpi-value">
                {Math.max(0, result.delta.monthsSaved)} meses
              </div>
              <div className="kpi-meta">
                ≈ {Math.round(Math.max(0, result.delta.monthsSaved) / 12)} anos
              </div>
            </div>
            <div className="kpi">
              <div className="kpi-label">NOVA CONCLUSÃO</div>
              <div className="kpi-value">{ymToShort(result.simulated.payoffYm)}</div>
              <div className="kpi-meta">era {ymToShort(result.base.payoffYm)}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">JUROS TOTAIS</div>
              <div className="kpi-value">{eur(result.simulated.totalInterest)}</div>
              <div className="kpi-meta">era {eur(result.base.totalInterest)}</div>
            </div>
          </div>

          <div className="card card-pad-lg">
            <h3 className="section-label" style={{ marginTop: 0 }}>EVOLUÇÃO DO CAPITAL</h3>
            <CapitalChart
              series={[
                { label: 'Sem amortizações', rows: result.base.rows, colour: '#94A3B8' },
                { label: 'Com amortizações', rows: result.simulated.rows, colour: '#2563EB', fill: true },
              ]}
              height={300}
            />
          </div>
        </>
      )}

      {!result && simulate.isLoading && (
        <div className="card card-pad-lg muted">A calcular cenário…</div>
      )}
    </div>
  )
}

export default SimulatorPanel
