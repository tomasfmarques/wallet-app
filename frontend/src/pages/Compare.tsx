import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLoan } from '@/hooks/useLoan'
import { usePortfolio, usePortfolioRisk } from '@/hooks/usePortfolio'
import { useCompare, type CompareResult } from '@/hooks/useCompare'
import { compareDefaults, type Modo, type Frequencia, type ReturnMode } from '@/lib/compareDefaults'
import { StateBlock } from '@/components/ui/StateBlock'
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
  const { t } = useTranslation('compare')
  const { data: loanData, isLoading: loanLoading, error: loanError, refetch: refetchLoans } = useLoan()
  const { data: portData } = usePortfolio()
  const { data: riskData } = usePortfolioRisk()
  const compare = useCompare()
  const riskVol = riskData?.portfolio.volatility ?? null

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
  const hasAssets = (portData?.assets?.length ?? 0) > 0
  const avgAssetReturnPct = hasAssets
    ? (portData!.assets.reduce((s, a) => s + a.expectedReturn, 0) / portData!.assets.length) * 100
    : null

  const [valor, setValor] = useState(smartDefaults.valor)
  const [valorInput, setValorInput] = useState(String(smartDefaults.valor))
  const [modo, setModo] = useState<Modo>(smartDefaults.modo)
  const [investReturn, setInvestReturn] = useState(smartDefaults.investReturn)
  const [taxRate, setTaxRate] = useState(smartDefaults.taxRate)
  const [frequencia, setFrequencia] = useState<Frequencia>(smartDefaults.frequencia)
  const [returnMode, setReturnMode] = useState<ReturnMode>(smartDefaults.returnMode)
  const [result, setResult] = useState<CompareResult | null>(null)

  // When the selected loan changes, reset to smart defaults for that loan
  const resetToDefaults = () => {
    setValor(smartDefaults.valor)
    setValorInput(String(smartDefaults.valor))
    setModo(smartDefaults.modo)
    setInvestReturn(smartDefaults.investReturn)
    setTaxRate(smartDefaults.taxRate)
    setFrequencia(smartDefaults.frequencia)
    setReturnMode(smartDefaults.returnMode)
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
          frequencia,
          returnMode,
          ...(riskVol != null ? { riskVolatility: riskVol } : {}),
        },
        { onSuccess: (r) => setResult(r) },
      )
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLoan?.loan.id, valor, modo, investReturn, taxRate, frequencia, returnMode, riskVol])

  if (loanLoading) {
    return <div className="auth-loading"><div className="spinner" /></div>
  }

  if (loanError) {
    return (
      <div className="compare-page">
        <header className="page-header"><h1>{t('title')}</h1></header>
        <StateBlock variant="error" message={t('loadError')} onRetry={() => refetchLoans()} />
      </div>
    )
  }

  if (loans.length === 0) {
    return (
      <div className="compare-page">
        <header className="page-header">
          <h1>{t('title')}</h1>
          <p className="muted">{t('needLoan')}</p>
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
      ? t('rate.taeg', { value: (loan.taeg * 100).toFixed(2) })
      : loan.spread === 0 && loan.euribor === 0
        ? t('rate.tan', { value: (loan.tanFixa * 100).toFixed(2) })
        : t('rate.euriborSpread', { value: ((loan.euribor + loan.spread) * 100).toFixed(2) })
    : '—'

  const rec = result?.recommendation

  return (
    <div className="compare-page">
      <header className="page-header">
        <h1>{t('title')}</h1>
        <p className="muted">
          {t('subtitle')}
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
            <span className="compare-context-label">{t('context.loan')}</span>
            <span className="compare-context-value">{loan.name}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">{t('context.rate')}</span>
            <span className="compare-context-value">{effectiveRateLabel}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">{t('context.debt')}</span>
            <span className="compare-context-value">{eur(kpis.capitalAtual)}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">{t('context.monthlyPayment')}</span>
            <span className="compare-context-value">{eur2(kpis.proximaPrestacao)}</span>
          </div>
          <div className="compare-context-item">
            <span className="compare-context-label">{t('context.completion')}</span>
            <span className="compare-context-value">{kpis.conclusaoYm.slice(0, 4)}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="card card-pad-lg compare-controls">
        <div className="compare-controls-header">
          <h3 className="section-label" style={{ margin: 0 }}>{t('paramsLabel')}</h3>
          <button
            type="button" className="btn btn-ghost btn-sm"
            onClick={resetToDefaults}
            title={t('resetTitle')}
          >
            {t('reset')}
          </button>
        </div>

        <div className="compare-controls-grid">
          {/* Frequência */}
          <div className="form-group">
            <label className="form-label">{t('freqLabel')}</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn ${frequencia === 'unica' ? 'toggle-btn-active' : ''}`}
                onClick={() => setFrequencia('unica')}
              >
                {t('freqOnce')}
              </button>
              <button
                type="button"
                className={`toggle-btn ${frequencia === 'mensal' ? 'toggle-btn-active' : ''}`}
                onClick={() => setFrequencia('mensal')}
              >
                {t('freqMonthly')}
              </button>
              <button
                type="button"
                className={`toggle-btn ${frequencia === 'anual' ? 'toggle-btn-active' : ''}`}
                onClick={() => setFrequencia('anual')}
              >
                {t('freqAnnual')}
              </button>
            </div>
            <span className="form-hint">
              {frequencia === 'unica' ? t('freqOnceHint') : frequencia === 'mensal' ? t('freqMonthlyHint') : t('freqAnnualHint')}
            </span>
          </div>

          {/* Montante */}
          <div className="form-group">
            <label className="form-label">
              {frequencia === 'mensal' ? t('amountLabelMonthly') : frequencia === 'anual' ? t('amountLabelAnnual') : t('amountLabel')}
            </label>
            <input
              className="form-input"
              type="number" min={100} step={100}
              value={valorInput}
              onChange={(e) => handleValorChange(e.target.value)}
            />
            {kpis && (
              <span className="form-hint">
                {t('monthlyHint', { value: eur2(kpis.proximaPrestacao) })}
              </span>
            )}
          </div>

          {/* Modo */}
          <div className="form-group">
            <label className="form-label">{t('modeLabel')}</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn ${modo === 'prazo' ? 'toggle-btn-active' : ''}`}
                onClick={() => setModo('prazo')}
              >
                {t('modeReducePrazo')}
              </button>
              <button
                type="button"
                className={`toggle-btn ${modo === 'prestacao' ? 'toggle-btn-active' : ''}`}
                onClick={() => setModo('prestacao')}
              >
                {t('modeReducePrestacao')}
              </button>
            </div>
            <span className="form-hint">
              {modo === 'prazo' ? t('modePrazoHint') : t('modePrestacaoHint')}
            </span>
          </div>

          {/* Rentabilidade */}
          <div className="form-group">
            <label className="form-label">{t('returnSourceLabel')}</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-btn ${returnMode === 'portfolio' ? 'toggle-btn-active' : ''}`}
                disabled={!hasAssets}
                title={!hasAssets ? t('returnPortfolioEmpty') : undefined}
                onClick={() => setReturnMode('portfolio')}
              >
                {t('returnPortfolio')}
              </button>
              <button
                type="button"
                className={`toggle-btn ${returnMode === 'manual' ? 'toggle-btn-active' : ''}`}
                onClick={() => setReturnMode('manual')}
              >
                {t('returnManual')}
              </button>
            </div>
            {returnMode === 'manual' ? (
              <>
                <label className="form-label" style={{ marginTop: 10 }}>
                  {t('returnLabel')}
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
                    {t('avgReturnHint', { value: avgAssetReturnPct.toFixed(1) })}
                  </span>
                )}
              </>
            ) : (
              <span className="form-hint" style={{ marginTop: 10 }}>
                {result
                  ? t('returnPortfolioHint', { value: result.investir.effectiveReturn.toFixed(1) })
                  : t('returnPortfolioCalc')}
              </span>
            )}
          </div>

          {/* Taxa de imposto */}
          <div className="form-group">
            <label className="form-label">
              {t('taxLabel')}
              <strong style={{ marginLeft: 8 }}>{taxRate} %</strong>
            </label>
            <input
              type="range" min={0} max={50} step={1}
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="slider-bounds"><span>0 %</span><span>50 %</span></span>
            <span className="form-hint">{t('taxHint')}</span>
          </div>
        </div>
      </div>

      {/* Loading */}
      {compare.isLoading && !result && (
        <div className="card card-pad-lg muted">{t('calculating')}</div>
      )}

      {/* Results */}
      {result && (
        <>
          {/* Recommendation banner */}
          <div className={`compare-rec compare-rec-${rec}`} role="status">
            <span className="compare-rec-icon">
              <Icon name={rec === 'amortizar' ? 'home' : rec === 'investir' ? 'trendingUp' : 'scale'} size={24} />
            </span>
            <div>
              <div className="compare-rec-title">
                {rec === 'amortizar' && t('recAmortizarTitle')}
                {rec === 'investir' && t('recInvestirTitle')}
                {rec === 'equivalente' && t('recEquivTitle')}
              </div>
              <div className="compare-rec-sub">
                {rec === 'amortizar' &&
                  t('recAmortizarSub', { saved: eur(result.amortizar.interestSaved), gain: eur(result.investir.netGainAfterTax) })}
                {rec === 'investir' &&
                  t('recInvestirSub', { gain: eur(result.investir.netGainAfterTax), saved: eur(result.amortizar.interestSaved) })}
                {rec === 'equivalente' &&
                  t('recEquivSub')}
              </div>
            </div>
          </div>

          {/* KPI comparison grid */}
          <div className="compare-columns">
            <div className="card card-pad-lg compare-col compare-col-amortizar">
              <div className="compare-col-header">
                <span className="compare-col-icon"><Icon name="home" size={19} /></span>
                <h3>{t('amortizar')}</h3>
              </div>
              <div className="kpi-grid compare-kpis">
                <div className={`kpi ${rec === 'amortizar' ? 'kpi-accent-green' : ''}`}>
                  <div className="kpi-label">{t('interestSavedLabel')}</div>
                  <div className="kpi-value">{eur(result.amortizar.interestSaved)}</div>
                  <div className="kpi-meta">{t('interestSavedMeta')}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">{t('timeSavedLabel')}</div>
                  <div className="kpi-value">{t('timeSavedValue', { count: result.amortizar.monthsSaved })}</div>
                  <div className="kpi-meta">{t('newCompletion', { value: ymToShort(result.amortizar.payoffYm) })}</div>
                </div>
                {modo === 'prestacao' && result.amortizar.monthlyFreed != null && (
                  <div className="kpi">
                    <div className="kpi-label">{t('monthlySavingLabel')}</div>
                    <div className="kpi-value" style={{ color: 'var(--green-d)' }}>
                      {eur(result.amortizar.monthlyFreed)}
                    </div>
                    <div className="kpi-meta">
                      {t('newPayment', { value: result.amortizar.newPrestacao != null ? eur(result.amortizar.newPrestacao) : '—' })}
                    </div>
                  </div>
                )}
                <div className="kpi">
                  <div className="kpi-label">{t('equivReturnLabel')}</div>
                  <div className="kpi-value">
                    {result.breakEvenReturn < 0.05 ? '≈ 0 %' : `${result.breakEvenReturn.toFixed(2)} %`}
                  </div>
                  <div className="kpi-meta">{t('equivReturnMeta')}</div>
                </div>
              </div>
            </div>

            <div className="card card-pad-lg compare-col compare-col-investir">
              <div className="compare-col-header">
                <span className="compare-col-icon"><Icon name="trendingUp" size={19} /></span>
                <h3>{t('investir')}</h3>
              </div>
              <div className="kpi-grid compare-kpis">
                <div className={`kpi ${rec === 'investir' ? 'kpi-accent-green' : ''}`}>
                  <div className="kpi-label">{t('netGainLabel')}</div>
                  <div className="kpi-value">{eur(result.investir.netGainAfterTax)}</div>
                  <div className="kpi-meta">{t('afterTax', { rate: taxRate })}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">{t('futureValueLabel')}</div>
                  <div className="kpi-value">{eur(result.investir.futureValue)}</div>
                  <div className="kpi-meta">
                    {result.frequencia !== 'unica'
                      ? t('investedMeta', { value: eur(result.investir.totalContributed) })
                      : t('afterYears', { years: Math.round(result.horizonMonths / 12) })}
                  </div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">{t('grossGainLabel')}</div>
                  <div className="kpi-value">{eur(result.investir.grossGain)}</div>
                  <div className="kpi-meta">{t('beforeTax')}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">{t('annualReturnLabel')}</div>
                  <div className="kpi-value">{result.investir.effectiveReturn.toFixed(1)} %</div>
                  <div className="kpi-meta">
                    {result.investir.returnMode === 'portfolio'
                      ? t('returnModePortfolio')
                      : t('afterTaxPct', { value: (result.investir.effectiveReturn * (1 - taxRate / 100)).toFixed(2) })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Break-even callout */}
          <div className="compare-breakeven card">
            <span className="compare-breakeven-label">{t('breakEvenLabel')}</span>
            <span className="compare-breakeven-value">
              {result.breakEvenReturn < 0.05
                ? t('breakEvenAny')
                : t('breakEvenValue', { value: result.breakEvenReturn.toFixed(2) })}
            </span>
            <span className="compare-breakeven-hint">
              {result.breakEvenReturn >= 0.05 && (
                investReturn >= result.breakEvenReturn
                  ? t('breakEvenAbove', { value: investReturn.toFixed(1) })
                  : t('breakEvenBelow', { value: investReturn.toFixed(1) })
              )}
            </span>
          </div>

          {/* Risk band (±1σ) — investment uncertainty vs the guaranteed saving */}
          {result.investir.pessimisticNet != null && result.investir.optimisticNet != null && (
            <div className="card card-pad-lg compare-risk">
              <div className="compare-risk-head">
                <h3 className="section-label" style={{ margin: 0 }}>{t('risk.label')}</h3>
                {riskData?.portfolio.level && (
                  <span className={`risk-pill risk-${riskData.portfolio.level}`}>
                    {t(`risk.level.${riskData.portfolio.level}`)}
                  </span>
                )}
                {result.investir.riskVolatility != null && (
                  <span className="muted">{t('risk.vol', { value: result.investir.riskVolatility.toFixed(1) })}</span>
                )}
              </div>
              <div className="compare-risk-band">
                <span className="gain-negative">{t('risk.pessimistic', { value: eur(result.investir.pessimisticNet) })}</span>
                <span className="muted"> · </span>
                <span className="gain-positive">{t('risk.optimistic', { value: eur(result.investir.optimisticNet) })}</span>
              </div>
              <p className="compare-risk-verdict muted" style={{ margin: '6px 0 0' }}>
                {result.investir.pessimisticNet >= result.amortizar.interestSaved
                  ? t('risk.robustInvest')
                  : result.investir.netGainAfterTax >= result.amortizar.interestSaved
                    ? t('risk.fragileInvest', { saved: eur(result.amortizar.interestSaved) })
                    : t('risk.robustAmortize')}
              </p>
              {riskData && riskData.portfolio.coverage < 0.999 && (
                <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
                  {t('risk.coverage', { value: Math.round(riskData.portfolio.coverage * 100) })}
                </p>
              )}
            </div>
          )}

          {/* Comparison chart */}
          <div className="card card-pad-lg">
            <h3 className="section-label" style={{ marginTop: 0 }}>{t('chartLabel')}</h3>
            <CompareChart curve={result.curve} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Chart ─────────────────────────────────────────────────────────

function CompareChart({ curve }: { curve: Array<{ ym: string; amortizar: number; investir: number }> }) {
  const { t } = useTranslation('compare')
  const labels = curve.map((p) => ymToShort(p.ym))
  const data: ChartData<'line'> = {
    labels,
    datasets: [
      {
        label: t('chartAmortizar'),
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
        label: t('chartInvestir'),
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
