import { lazy, Suspense, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { InstallCta } from '@/components/marketing/InstallCta'
import { AdSlot } from '@/components/marketing/AdSlot'
import { Accordion } from '@/components/marketing/Accordion'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useJsonLd } from '@/hooks/useJsonLd'
import { asAppLanguage } from '@/i18n'
import { eur, currentYm, ymAddMonths } from '@/lib/format'
import { readSimCredito, hasSavedSimCredito, type SimCreditoState } from '@/lib/simCreditoStorage'
// ⚠️ Public simulator: reuses the backend's zero-import loan engine straight
// from source via the @engines alias (docs/landing-spec.md A2). Only imported
// from this lazy-loaded tool-page chunk — never the app's main chunk.
import { computeSchedule, type LoanInput } from '@engines/loanEngine'

const AmortizationChart = lazy(() => import('./AmortizationChart'))

export function AmortizarOuInvestir() {
  const { t, i18n } = useTranslation('landing')
  usePageMeta(t('tool.compare.metaTitle'), t('tool.compare.metaDescription'), '/simuladores/amortizar-ou-investir')
  useJsonLd('jsonld-compare', {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('tools.compare.name'),
    description: t('tool.compare.metaDescription'),
    applicationCategory: 'FinanceApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    url: 'https://wallet360.pt/simuladores/amortizar-ou-investir',
  })

  const prefilled = useMemo(() => hasSavedSimCredito(), [])
  const [loan, setLoan] = useState<SimCreditoState>(readSimCredito)
  const [extraAmount, setExtraAmount] = useState('5000')
  const [returnPct, setReturnPct] = useState('6')

  const setLoanField = <K extends keyof SimCreditoState>(k: K, v: SimCreditoState[K]) => setLoan((s) => ({ ...s, [k]: v }))

  const parsed = {
    montante: parseFloat(loan.montante.replace(',', '.')),
    prazoAnos: parseInt(loan.prazoAnos, 10),
    tan: parseFloat(loan.tan.replace(',', '.')),
    tanFixed: parseFloat(loan.tanFixed.replace(',', '.')),
    fixedYears: parseInt(loan.fixedYears, 10),
    spread: parseFloat(loan.spread.replace(',', '.')),
    euriborPct: parseFloat(loan.euriborPct.replace(',', '.')),
    extra: parseFloat(extraAmount.replace(',', '.')),
    returnPct: parseFloat(returnPct.replace(',', '.')),
  }

  const isValid =
    Number.isFinite(parsed.montante) && parsed.montante > 0 &&
    Number.isFinite(parsed.prazoAnos) && parsed.prazoAnos > 0 && parsed.prazoAnos <= 50 &&
    Number.isFinite(parsed.extra) && parsed.extra > 0 &&
    Number.isFinite(parsed.returnPct) &&
    (loan.rateType === 'fixed'
      ? Number.isFinite(parsed.tan) && parsed.tan >= 0
      : Number.isFinite(parsed.tanFixed) && parsed.tanFixed >= 0 &&
        Number.isFinite(parsed.fixedYears) && parsed.fixedYears >= 0 && parsed.fixedYears <= parsed.prazoAnos &&
        Number.isFinite(parsed.spread) && parsed.spread >= 0 &&
        Number.isFinite(parsed.euriborPct))

  const result = useMemo(() => {
    if (!isValid) return null
    const prazoMeses = parsed.prazoAnos * 12
    const base: LoanInput =
      loan.rateType === 'fixed'
        ? { capital: parsed.montante, prazoMeses, tanFixa: parsed.tan / 100, mesesFixos: prazoMeses, spread: 0, euribor: 0, dataInicio: currentYm() }
        : {
            capital: parsed.montante, prazoMeses,
            tanFixa: parsed.tanFixed / 100, mesesFixos: parsed.fixedYears * 12,
            spread: parsed.spread / 100, euribor: parsed.euriborPct / 100,
            dataInicio: currentYm(),
          }
    try {
      const noAmort = computeSchedule(base)
      const withAmort = computeSchedule({
        ...base,
        amortizacoes: [{ ym: ymAddMonths(currentYm(), 1), valor: parsed.extra, modo: 'prazo' }],
      })
      const interestSaved = Math.max(0, noAmort.totalInterest - withAmort.totalInterest)
      const horizonYears = noAmort.rows.length / 12
      const investFutureValue = parsed.extra * Math.pow(1 + parsed.returnPct / 100, horizonYears)
      const investGain = investFutureValue - parsed.extra
      const diff = interestSaved - investGain
      const relevantScale = Math.max(interestSaved, investGain, 1)
      const verdict: 'amortizar' | 'investir' | 'equivalente' =
        Math.abs(diff) / relevantScale < 0.03 ? 'equivalente' : diff > 0 ? 'amortizar' : 'investir'
      return { noAmort, withAmort, interestSaved, investGain, horizonYears, verdict }
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, loan.rateType, parsed.montante, parsed.prazoAnos, parsed.tan, parsed.tanFixed, parsed.fixedYears, parsed.spread, parsed.euriborPct, parsed.extra, parsed.returnPct])

  const lang = asAppLanguage(i18n.resolvedLanguage)

  return (
    <MarketingLayout>
      <div className="mkt-container">
        <header className="mkt-tool-header">
          <Link to="/simuladores" className="mkt-tool-back">{t('common.backToTools')}</Link>
          <h1>{t('tool.compare.h1')}</h1>
          <p className="mkt-tool-intro">
            {lang === 'en' ? <CompareIntroEn /> : <CompareIntroPt />}
          </p>
        </header>

        <section className="mkt-tool-panel card card-pad-lg">
          {prefilled ? (
            <p className="mkt-privacy-note" style={{ marginBottom: 12 }}>{t('tool.compare.prefilledNote')}</p>
          ) : (
            <p className="field-hint" style={{ marginBottom: 12 }}>
              {t('tool.compare.needCreditFirst')}{' '}
              <Link to="/simuladores/credito-habitacao">{t('tool.compare.useCreditSim')}</Link>
            </p>
          )}

          <div className="field-grid">
            <div className="field">
              <label htmlFor="ai-montante">{t('tool.credito.amountLabel')}</label>
              <input id="ai-montante" type="number" min={1000} step={1000} value={loan.montante} onChange={(e) => setLoanField('montante', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ai-prazo">{t('tool.credito.termLabel')}</label>
              <input id="ai-prazo" type="number" min={1} max={50} value={loan.prazoAnos} onChange={(e) => setLoanField('prazoAnos', e.target.value)} />
            </div>
          </div>

          <div className="toggle-group" role="group" aria-label={t('tool.credito.rateTypeLabel')} style={{ marginBottom: 18 }}>
            <button type="button" className={`toggle-btn ${loan.rateType === 'fixed' ? 'toggle-btn-active' : ''}`} onClick={() => setLoanField('rateType', 'fixed')}>
              {t('tool.credito.fixedLabel')}
            </button>
            <button type="button" className={`toggle-btn ${loan.rateType === 'mixed' ? 'toggle-btn-active' : ''}`} onClick={() => setLoanField('rateType', 'mixed')}>
              {t('tool.credito.mixedLabel')}
            </button>
          </div>

          {loan.rateType === 'fixed' ? (
            <div className="field-grid">
              <div className="field">
                <label htmlFor="ai-tan">{t('tool.credito.tanLabel')}</label>
                <input id="ai-tan" type="number" min={0} step={0.1} value={loan.tan} onChange={(e) => setLoanField('tan', e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="field-grid">
              <div className="field">
                <label htmlFor="ai-tan-fixed">{t('tool.credito.tanFixedLabel')}</label>
                <input id="ai-tan-fixed" type="number" min={0} step={0.1} value={loan.tanFixed} onChange={(e) => setLoanField('tanFixed', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ai-fixed-years">{t('tool.credito.fixedYearsLabel')}</label>
                <input id="ai-fixed-years" type="number" min={0} max={parsed.prazoAnos || 50} value={loan.fixedYears} onChange={(e) => setLoanField('fixedYears', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ai-spread">{t('tool.credito.spreadLabel')}</label>
                <input id="ai-spread" type="number" min={0} step={0.05} value={loan.spread} onChange={(e) => setLoanField('spread', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ai-euribor">{t('tool.credito.euriborLabel')}</label>
                <input id="ai-euribor" type="number" step={0.05} value={loan.euriborPct} onChange={(e) => setLoanField('euriborPct', e.target.value)} />
              </div>
            </div>
          )}

          <div className="field-grid">
            <div className="field">
              <label htmlFor="ai-extra">{t('tool.compare.extraAmountLabel')}</label>
              <input id="ai-extra" type="number" min={1} step={100} value={extraAmount} onChange={(e) => setExtraAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ai-return">{t('tool.compare.returnLabel')}</label>
              <input id="ai-return" type="number" step={0.5} value={returnPct} onChange={(e) => setReturnPct(e.target.value)} />
            </div>
          </div>

          {!isValid && <p className="field-error">{t('tool.credito.errInvalid')}</p>}

          {result && (
            <>
              <div className={`compare-rec compare-rec-${result.verdict}`} role="status" style={{ marginTop: 8 }}>
                <div>
                  <div className="compare-rec-title">
                    {result.verdict === 'amortizar' && t('tool.compare.verdictAmortizeTitle')}
                    {result.verdict === 'investir' && t('tool.compare.verdictInvestTitle')}
                    {result.verdict === 'equivalente' && t('tool.compare.verdictEquivalentTitle')}
                  </div>
                </div>
              </div>

              <div className="kpi-grid" style={{ marginTop: 12 }}>
                <div className={`kpi ${result.verdict === 'amortizar' ? 'kpi-accent-green' : ''}`}>
                  <div className="kpi-label">{t('tool.compare.interestSavedLabel')}</div>
                  <div className="kpi-value">{eur(result.interestSaved)}</div>
                </div>
                <div className={`kpi ${result.verdict === 'investir' ? 'kpi-accent-green' : ''}`}>
                  <div className="kpi-label">{t('tool.compare.investGainLabel')}</div>
                  <div className="kpi-value">{eur(result.investGain)}</div>
                  <div className="kpi-meta">{t('tool.compare.investGainMeta')}</div>
                </div>
              </div>

              <h3 className="section-label" style={{ marginTop: 20 }}>{t('tool.compare.chartTitle')}</h3>
              <Suspense fallback={<div className="chart-wrap" style={{ height: 260 }} />}>
                <AmortizationChart
                  series={[
                    { label: t('tool.compare.chartNoAmort'), points: result.noAmort.rows.map((r) => ({ ym: r.ym, capital: r.capital })), color: '#2563EB' },
                    { label: t('tool.compare.chartWithAmort'), points: result.withAmort.rows.map((r) => ({ ym: r.ym, capital: r.capital })), color: '#059669' },
                  ]}
                />
              </Suspense>

              <div className="form-actions">
                <Link to="/signup" className="btn btn-primary">{t('tool.compare.ctaSave')}</Link>
              </div>
            </>
          )}
        </section>

        <AdSlot />

        <section className="mkt-tool-explainer">
          {lang === 'en' ? <CompareExplainerEn /> : <CompareExplainerPt />}
        </section>

        <section className="mkt-section">
          <div className="mkt-install-section">
            <div className="mkt-install-title">{t('install.sectionTitle')}</div>
            <p className="mkt-install-sub">{t('install.sectionSubtitle')}</p>
            <InstallCta />
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}

function CompareIntroPt() {
  return (
    <>
      Tens dinheiro de parte e não sabes se compensa mais amortizar o crédito
      habitação ou investi-lo? Este simulador compara os juros que poupas ao
      amortizar (reduzindo o prazo) com o ganho estimado de investir o mesmo
      montante à taxa de retorno que indicares. Não há resposta certa universal —
      depende da tua taxa de crédito e do retorno esperado do investimento — mas
      o simulador ajuda-te a comparar os dois cenários lado a lado. Os valores
      podem vir pré-preenchidos do simulador de crédito habitação.
    </>
  )
}
function CompareIntroEn() {
  return (
    <>
      Have some money set aside and not sure whether paying down your mortgage
      or investing it pays off more? This simulator compares the interest you
      save by paying down (shortening the term) with the estimated gain from
      investing the same amount at the return rate you specify. There's no
      universal right answer — it depends on your loan rate and the expected
      investment return — but the simulator helps you compare both scenarios
      side by side. Values may come pre-filled from the mortgage simulator.
    </>
  )
}

function CompareExplainerPt() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>Amortizar ou investir — como decidir</h2>
      <p className="mkt-tool-explainer-intro">
        A regra simples: se a taxa do teu crédito for maior do que o retorno
        líquido esperado do investimento, amortizar tende a compensar mais (é uma
        poupança garantida). Se o investimento render mais do que a taxa do
        crédito, investir tende a compensar mais — mas com risco, ao contrário da
        amortização.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'garantido-vs-risco',
            question: 'Amortizar é sempre "sem risco"?',
            answer: (
              <p>
                Sim — os juros poupados ao amortizar são certos, porque resultam
                de uma fórmula matemática sobre o teu contrato. Um investimento em
                ações ou ETFs tem retorno variável: pode render mais do que
                esperas, ou menos (incluindo perdas). Este simulador usa uma taxa
                de retorno constante para simplificar, mas o mundo real tem
                volatilidade.
              </p>
            ),
          },
          {
            id: 'imposto',
            question: 'O simulador considera o imposto sobre mais-valias?',
            answer: (
              <p>
                Não, esta versão pública mostra o ganho <strong>bruto</strong> do
                investimento para manter o cálculo simples. Em Portugal, as
                mais-valias em ações/ETFs são tributadas a uma taxa autónoma de
                28%. A app Wallet360 tem uma versão completa que considera o
                imposto, a frequência das entregas e uma banda de risco baseada na
                volatilidade da tua carteira real.
              </p>
            ),
          },
          {
            id: 'horizonte',
            question: 'Que horizonte temporal é usado?',
            answer: (
              <p>
                O prazo restante do teu crédito — assim os dois cenários (juros
                poupados vs. investimento) são comparados ao longo do mesmo
                período de tempo.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}
function CompareExplainerEn() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>Pay down or invest — how to decide</h2>
      <p className="mkt-tool-explainer-intro">
        The simple rule: if your loan's rate is higher than the expected net
        investment return, paying down tends to pay off more (it's a guaranteed
        saving). If the investment returns more than the loan rate, investing
        tends to pay off more — but with risk, unlike paying down.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'garantido-vs-risco',
            question: 'Is paying down always "risk-free"?',
            answer: (
              <p>
                Yes — the interest saved by paying down is certain, since it comes
                from a mathematical formula on your contract. An investment in
                stocks or ETFs has a variable return: it may earn more than you
                expect, or less (including losses). This simulator uses a constant
                return rate to keep the calculation simple, but the real world has
                volatility.
              </p>
            ),
          },
          {
            id: 'imposto',
            question: 'Does the simulator account for capital gains tax?',
            answer: (
              <p>
                No, this public version shows the <strong>gross</strong> investment
                gain to keep the calculation simple. In Portugal, capital gains on
                stocks/ETFs are taxed at a flat 28% rate. The Wallet360 app has a
                full version that accounts for tax, contribution frequency, and a
                risk band based on your actual portfolio's volatility.
              </p>
            ),
          },
          {
            id: 'horizonte',
            question: 'What time horizon is used?',
            answer: (
              <p>
                Your loan's remaining term — so both scenarios (interest saved vs.
                investment) are compared over the same period of time.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}

export default AmortizarOuInvestir
