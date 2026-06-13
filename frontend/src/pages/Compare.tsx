import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLoan } from '@/hooks/useLoan'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useCompare, type CompareResult } from '@/hooks/useCompare'
import { compareDefaults, type Modo } from '@/lib/compareDefaults'
import { eur, eur2, ymToShort } from '@/lib/format'
import { Line } from 'react-chartjs-2'
import type { ChartData, ChartOptions } from 'chart.js'

function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12).toString().padStart(4, '0')}-${((total % 12) + 1).toString().padStart(2, '0')}`
}

export function Compare() {
  const { data: loanData, isLoading: loanLoading } = useLoan()
  const { data: portData } = usePortfolio()
  const compare = useCompare()

  const loans = loanData?.loans ?? []
  // Deep link from the dashboard wedge insight: /comparar?loan=<id> preselects it.
  const [searchParams] = useSearchParams()
  const loanParam = searchParams.get('loan')
  const [selectedId, setSelectedId] = useState<string | null>(loanParam)
  const selectedLoan =
    loans.find((l) => l.loan.id === (selectedId ?? loanParam)) ?? loans[0] ?? null

  // ── Smart defaults derived from actual user data (shared with the
  // dashboard insight card so both surfaces show identical numbers). ──
  const smartDefaults = useMemo(
    () => compareDefaults(selectedLoan, portData),
    [selectedLoan?.loan.id, portData],   // eslint-disable-line react-hooks/exhaustive-deps
  )

  // Average of the user's per-asset expected returns (for the slider hint).
  const avgAssetReturnPct = portData?.assets?.length
    ? (portData.assets.reduce((s, a) => s + a.expectedReturn, 0) / portData.assets.length) * 100
    : null

  const [valor, setValor] = useState(smartDefaults.valor)
  const [valorInput, setValorInput] = useState(String(smartDefaults.valor))
  const [modo, setModo] = useState<Modo>(smartDefaults.modo)
  const [investReturn, setInvestReturn] = useState(smartDefaults.investReturn)
  const [taxRate, setTaxRate] = useState(smartDefaults.taxRate)
  const [result, setResult] = useState<CompareResult | null>(null)

  // When the selected loan changes, reset to smart defaults for that loan
  const resetToDefaults = () => {
    setValor(smartDefaults.valor)
    setValorInput(String(smartDefaults.valor))
    setModo(smartDefaults.modo)
    setInvestReturn(smartDefaults.investReturn)
    setTaxRate(smartDefaults.taxRate)
  }

  // Re-seed when loan selection changes
  useEffect(() => { resetToDefaults() }, [selectedLoan?.loan.id])  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-run simulation when inputs change
  useEffect(() => {
    if (!selectedLoan) return
    if (!Number.isFinite(valor) || valor <= 0) return
    const t = setTimeout(() => {
      compare.mutate(
        {
          loanId: selectedLoan.loan.id,
          valor,
          modo,
          ymAmortizacao: addMonths(currentYm(), 1),
          investReturn,
          taxRate,
        },
        { onSuccess: (r) => setResult(r) },
      )
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLoan?.loan.id, valor, modo, investReturn, taxRate])

  if (loanLoading) {
    return <div className="auth-loading"><div className="spinner" /></div>
  }

  if (loans.length === 0) {
    return (
      <div className="compare-page">
        <header className="page-header">
          <h1>Amortizar ou Investir?</h1>
          <p className="muted">Adiciona um crédito primeiro para usar este simulador.</p>
        </header>
      </div>
    )
  }

  const handleValorChange = (raw: string) => {
    setValorInput(raw)
    const n = parseFloat(raw.replace(',', '.'))
    if (Number.isFinite(n) && n > 0) setValor(n)
  }

  const loan = selectedLoan?.loan
  const kpis = selectedLoan?.kpis

  // Effective rate label for the context card
  const effectiveRateLabel = loan
    ? loan.taeg != null
      ? `TAEG ${(loan.taeg * 100).toFixed(2)} %`
      : loan.spread === 0 && loan.euribor === 0
        ? `TAN ${(loan.tanFixa * 100).toFixed(2)} %`
        : `${((loan.euribor + loan.spread) * 100).toFixed(2)} % (Euribor + spread)`
    : '—'

  const rec = result?.recommendation

  return (
    <div className="compare-page">
      <header className="page-header">
        <h1>Amortizar ou Investir?</h1>
        <p className="muted">
          Compara o impacto de amortizar o crédito vs investir o mesmo montante.
        </p>
      </header>

      {/* Loan selector */}
      {loans.length > 1 && (
        <div className="chip-row" style={{ marginBottom: 0 }}>
          {loans.map(({ loan: l }) => (
            <button
              key={l.id} type="button"
              className={`chip ${(selectedLoan?.loan.id === l.id) ? 'chip-active' : ''}`}
              onClick={() => setSelectedId(l.id)}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Loan context strip */}
      {loan && kpis && (
        <div className="compare-context-strip">
          <div className="compare-context-item">
            <span className="compare-context-label">Crédito</span>
            <span className="compare-context-value">{loan.name}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">Taxa</span>
            <span className="compare-context-value">{effectiveRateLabel}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">Capital em dívida</span>
            <span className="compare-context-value">{eur(kpis.capitalAtual)}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">Prestação mensal</span>
            <span className="compare-context-value">{eur2(kpis.proximaPrestacao)}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">Conclusão prevista</span>
            <span className="compare-context-value">{kpis.conclusaoYm.slice(0, 4)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="card card-pad-lg compare-controls">
        <div className="compare-controls-header">
          <h3 className="section-label" style={{ margin: 0 }}>PARÂMETROS</h3>
          <button
            type="button" className="btn btn-ghost btn-sm"
            onClick={resetToDefaults}
            title="Repor valores predefinidos do teu crédito e portfolio"
          >
            ↺ Repor valores
          </button>
        </div>

        <div className="compare-controls-grid">
          {/* Montante */}
          <div className="form-group">
            <label className="form-label">Montante a alocar (€)</label>
            <input
              className="form-input"
              type="number" min={100} step={100}
              value={valorInput}
              onChange={(e) => handleValorChange(e.target.value)}
            />
            {kpis && (
              <span className="form-hint">
                Prestação mensal: {eur2(kpis.proximaPrestacao)}
              </span>
            )}
          </div>

          {/* Modo */}
          <div className="form-group">
            <label className="form-label">Modo de amortização</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn ${modo === 'prazo' ? 'toggle-btn-active' : ''}`}
                onClick={() => setModo('prazo')}
              >
                Reduzir prazo
              </button>
              <button
                type="button"
                className={`toggle-btn ${modo === 'prestacao' ? 'toggle-btn-active' : ''}`}
                onClick={() => setModo('prestacao')}
              >
                Reduzir prestação
              </button>
            </div>
            <span className="form-hint">
              {modo === 'prazo'
                ? 'A prestação mantém-se, pagas mais cedo.'
                : 'O prazo mantém-se, a prestação baixa.'}
            </span>
          </div>

          {/* Rentabilidade */}
          <div className="form-group">
            <label className="form-label">
              Rentabilidade esperada do investimento
              <strong style={{ marginLeft: 8 }}>{investReturn.toFixed(1)} %</strong>
            </label>
            <input
              type="range" min={0} max={20} step={0.5}
              value={investReturn}
              onChange={(e) => setInvestReturn(Number(e.target.value))}
              style={{ accentColor: 'var(--green)' }}
            />
            <span className="slider-bounds"><span>0 %</span><span>20 %</span></span>
            {avgAssetReturnPct != null && (
              <span className="form-hint">
                Média de rentabilidade dos teus ativos: {avgAssetReturnPct.toFixed(1)} %.
              </span>
            )}
          </div>

          {/* Taxa de imposto */}
          <div className="form-group">
            <label className="form-label">
              Imposto sobre ganhos (mais-valias)
              <strong style={{ marginLeft: 8 }}>{taxRate} %</strong>
            </label>
            <input
              type="range" min={0} max={50} step={1}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="slider-bounds"><span>0 %</span><span>50 %</span></span>
            <span className="form-hint">Portugal: 28 % sobre mais-valias de capitais.</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {compare.isLoading && !result && (
        <div className="card card-pad-lg muted">A calcular…</div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Recommendation banner */}
          <div className={`compare-rec compare-rec-${rec}`} role="status">
            <span className="compare-rec-icon" aria-hidden>
              {rec === 'amortizar' ? '🏠' : rec === 'investir' ? '📈' : '⚖️'}
            </span>
            <div>
              <div className="compare-rec-title">
                {rec === 'amortizar' && 'Amortizar é a melhor opção'}
                {rec === 'investir' && 'Investir é a melhor opção'}
                {rec === 'equivalente' && 'As opções são equivalentes'}
              </div>
              <div className="compare-rec-sub">
                {rec === 'amortizar' &&
                  `Poupas ${eur(result.amortizar.interestSaved)} em juros vs ${eur(result.investir.netGainAfterTax)} de ganho líquido ao investir.`}
                {rec === 'investir' &&
                  `Ganhas ${eur(result.investir.netGainAfterTax)} líquidos ao investir vs ${eur(result.amortizar.interestSaved)} poupados em juros.`}
                {rec === 'equivalente' &&
                  `A diferença entre as duas opções é inferior a 100 €.`}
              </div>
            </div>
          </div>

          {/* KPI comparison grid */}
          <div className="compare-columns">
            <div className="card card-pad-lg compare-col compare-col-amortizar">
              <div className="compare-col-header">
                <span className="compare-col-icon" aria-hidden>🏠</span>
                <h3>Amortizar</h3>
              </div>
              <div className="kpi-grid compare-kpis">
                <div className={`kpi ${rec === 'amortizar' ? 'kpi-accent-green' : ''}`}>
                  <div className="kpi-label">JUROS POUPADOS</div>
                  <div className="kpi-value">{eur(result.amortizar.interestSaved)}</div>
                  <div className="kpi-meta">ao longo do crédito</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">TEMPO POUPADO</div>
                  <div className="kpi-value">{result.amortizar.monthsSaved} meses</div>
                  <div className="kpi-meta">nova conclusão: {ymToShort(result.amortizar.payoffYm)}</div>
                </div>
                {modo === 'prestacao' && result.amortizar.monthlyFreed != null && (
                  <div className="kpi">
                    <div className="kpi-label">POUPANÇA MENSAL</div>
                    <div className="kpi-value" style={{ color: 'var(--green-d)' }}>
                      {eur(result.amortizar.monthlyFreed)}
                    </div>
                    <div className="kpi-meta">
                      nova prestação: {result.amortizar.newPrestacao != null ? eur(result.amortizar.newPrestacao) : '—'}
                    </div>
                  </div>
                )}
                <div className="kpi">
                  <div className="kpi-label">RETORNO EQUIV.</div>
                  <div className="kpi-value">
                    {result.breakEvenReturn < 0.05 ? '≈ 0 %' : `${result.breakEvenReturn.toFixed(2)} %`}
                  </div>
                  <div className="kpi-meta">rentabilidade anual equivalente</div>
                </div>
              </div>
            </div>

            <div className="card card-pad-lg compare-col compare-col-investir">
              <div className="compare-col-header">
                <span className="compare-col-icon" aria-hidden>📈</span>
                <h3>Investir</h3>
              </div>
              <div className="kpi-grid compare-kpis">
                <div className={`kpi ${rec === 'investir' ? 'kpi-accent-green' : ''}`}>
                  <div className="kpi-label">GANHO LÍQUIDO</div>
                  <div className="kpi-value">{eur(result.investir.netGainAfterTax)}</div>
                  <div className="kpi-meta">após {taxRate} % de imposto</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">VALOR FUTURO</div>
                  <div className="kpi-value">{eur(result.investir.futureValue)}</div>
                  <div className="kpi-meta">ao fim de {Math.round(result.horizonMonths / 12)} anos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">GANHO BRUTO</div>
                  <div className="kpi-value">{eur(result.investir.grossGain)}</div>
                  <div className="kpi-meta">antes de impostos</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">RETORNO ANUAL</div>
                  <div className="kpi-value">{investReturn.toFixed(1)} %</div>
                  <div className="kpi-meta">
                    {(investReturn * (1 - taxRate / 100)).toFixed(2)} % após imposto
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Break-even callout */}
          <div className="compare-breakeven card">
            <span className="compare-breakeven-label">⚖️ Ponto de equilíbrio</span>
            <span className="compare-breakeven-value">
              {result.breakEvenReturn < 0.05
                ? 'Qualquer rentabilidade positiva favorece investir'
                : `${result.breakEvenReturn.toFixed(2)} % ao ano`}
            </span>
            <span className="compare-breakeven-hint">
              {result.breakEvenReturn >= 0.05 && (
                investReturn >= result.breakEvenReturn
                  ? `Com ${investReturn.toFixed(1)} % superas o ponto de equilíbrio — investir vence.`
                  : `Com ${investReturn.toFixed(1)} % ficas abaixo do ponto de equilíbrio — amortizar vence.`
              )}
            </span>
          </div>

          {/* Comparison chart */}
          <div className="card card-pad-lg">
            <h3 className="section-label" style={{ marginTop: 0 }}>EVOLUÇÃO DO GANHO AO LONGO DO TEMPO</h3>
            <CompareChart curve={result.curve} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Chart ─────────────────────────────────────────────────────────

function CompareChart({ curve }: { curve: Array<{ ym: string; amortizar: number; investir: number }> }) {
  const labels = curve.map((p) => ymToShort(p.ym))
  const data: ChartData<'line'> = {
    labels,
    datasets: [
      {
        label: 'Juros poupados (amortizar)',
        data: curve.map((p) => p.amortizar),
        borderColor: '#2563EB',
        backgroundColor: '#2563EB22',
        fill: true,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
      {
        label: 'Ganho líquido após imposto (investir)',
        data: curve.map((p) => p.investir),
        borderColor: '#059669',
        backgroundColor: '#05966922',
        fill: false,
        tension: 0.2,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      },
    ],
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: true, position: 'top', align: 'end', labels: { boxWidth: 12, boxHeight: 12, padding: 12 } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y != null ? eur(ctx.parsed.y) : '—'}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, autoSkip: true } },
      y: { grid: { color: '#F1F5F9' }, ticks: { callback: (v) => eur(Number(v)) }, beginAtZero: true },
    },
  }

  return (
    <div className="chart-wrap" style={{ height: 300 }}>
      <Line data={data} options={options} />
    </div>
  )
}

export default Compare
