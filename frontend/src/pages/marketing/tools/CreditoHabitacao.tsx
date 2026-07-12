import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { InstallCta } from '@/components/marketing/InstallCta'
import { AdSlot } from '@/components/marketing/AdSlot'
import { Accordion } from '@/components/marketing/Accordion'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useJsonLd } from '@/hooks/useJsonLd'
import { asAppLanguage } from '@/i18n'
import { eur, eur2, currentYm } from '@/lib/format'
import { readSimCredito, writeSimCredito, type SimCreditoState } from '@/lib/simCreditoStorage'
// ⚠️ Public simulator: reuses the backend's zero-import loan engine straight
// from source via the @engines alias (docs/landing-spec.md A2). Only imported
// from this lazy-loaded tool-page chunk — never the app's main chunk.
import { computeSchedule, type LoanInput } from '@engines/loanEngine'

const AmortizationChart = lazy(() => import('./AmortizationChart'))

export function CreditoHabitacao() {
  const { t, i18n } = useTranslation('landing')
  usePageMeta(t('tool.credito.metaTitle'), t('tool.credito.metaDescription'), '/simuladores/credito-habitacao')
  useJsonLd('jsonld-credito', {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('tools.credito.name'),
    description: t('tool.credito.metaDescription'),
    applicationCategory: 'FinanceApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    url: 'https://wallet360.pt/simuladores/credito-habitacao',
  })

  const [state, setState] = useState<SimCreditoState>(readSimCredito)
  const set = <K extends keyof SimCreditoState>(k: K, v: SimCreditoState[K]) => setState((s) => ({ ...s, [k]: v }))

  // Persist for the "Amortizar ou investir" tool — sessionStorage only, never
  // sent to a server (the privacy pitch this whole funnel makes).
  useEffect(() => {
    writeSimCredito(state)
  }, [state])

  const parsed = {
    montante: parseFloat(state.montante.replace(',', '.')),
    prazoAnos: parseInt(state.prazoAnos, 10),
    tan: parseFloat(state.tan.replace(',', '.')),
    tanFixed: parseFloat(state.tanFixed.replace(',', '.')),
    fixedYears: parseInt(state.fixedYears, 10),
    spread: parseFloat(state.spread.replace(',', '.')),
    euriborPct: parseFloat(state.euriborPct.replace(',', '.')),
  }

  const isValid =
    Number.isFinite(parsed.montante) && parsed.montante > 0 &&
    Number.isFinite(parsed.prazoAnos) && parsed.prazoAnos > 0 && parsed.prazoAnos <= 50 &&
    (state.rateType === 'fixed'
      ? Number.isFinite(parsed.tan) && parsed.tan >= 0
      : Number.isFinite(parsed.tanFixed) && parsed.tanFixed >= 0 &&
        Number.isFinite(parsed.fixedYears) && parsed.fixedYears >= 0 && parsed.fixedYears <= parsed.prazoAnos &&
        Number.isFinite(parsed.spread) && parsed.spread >= 0 &&
        Number.isFinite(parsed.euriborPct))

  const schedule = useMemo(() => {
    if (!isValid) return null
    const prazoMeses = parsed.prazoAnos * 12
    const input: LoanInput =
      state.rateType === 'fixed'
        ? { capital: parsed.montante, prazoMeses, tanFixa: parsed.tan / 100, mesesFixos: prazoMeses, spread: 0, euribor: 0, dataInicio: currentYm() }
        : {
            capital: parsed.montante, prazoMeses,
            tanFixa: parsed.tanFixed / 100, mesesFixos: parsed.fixedYears * 12,
            spread: parsed.spread / 100, euribor: parsed.euriborPct / 100,
            dataInicio: currentYm(),
          }
    try {
      return computeSchedule(input)
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, state.rateType, parsed.montante, parsed.prazoAnos, parsed.tan, parsed.tanFixed, parsed.fixedYears, parsed.spread, parsed.euriborPct])

  const lang = asAppLanguage(i18n.resolvedLanguage)

  return (
    <MarketingLayout>
      <div className="mkt-container">
        <header className="mkt-tool-header">
          <Link to="/simuladores" className="mkt-tool-back">{t('common.backToTools')}</Link>
          <h1>{t('tool.credito.h1')}</h1>
          <p className="mkt-tool-intro">
            {lang === 'en' ? <CreditoIntroEn /> : <CreditoIntroPt />}
          </p>
        </header>

        <section className="mkt-tool-panel card card-pad-lg">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="mc-montante">{t('tool.credito.amountLabel')}</label>
              <input id="mc-montante" type="number" min={1000} step={1000} value={state.montante} onChange={(e) => set('montante', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="mc-prazo">{t('tool.credito.termLabel')}</label>
              <input id="mc-prazo" type="number" min={1} max={50} value={state.prazoAnos} onChange={(e) => set('prazoAnos', e.target.value)} />
            </div>
          </div>

          <div className="toggle-group" role="group" aria-label={t('tool.credito.rateTypeLabel')} style={{ marginBottom: 18 }}>
            <button type="button" className={`toggle-btn ${state.rateType === 'fixed' ? 'toggle-btn-active' : ''}`} onClick={() => set('rateType', 'fixed')}>
              {t('tool.credito.fixedLabel')}
            </button>
            <button type="button" className={`toggle-btn ${state.rateType === 'mixed' ? 'toggle-btn-active' : ''}`} onClick={() => set('rateType', 'mixed')}>
              {t('tool.credito.mixedLabel')}
            </button>
          </div>

          {state.rateType === 'fixed' ? (
            <div className="field-grid">
              <div className="field">
                <label htmlFor="mc-tan">{t('tool.credito.tanLabel')}</label>
                <input id="mc-tan" type="number" min={0} step={0.1} value={state.tan} onChange={(e) => set('tan', e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="field-grid">
              <div className="field">
                <label htmlFor="mc-tan-fixed">{t('tool.credito.tanFixedLabel')}</label>
                <input id="mc-tan-fixed" type="number" min={0} step={0.1} value={state.tanFixed} onChange={(e) => set('tanFixed', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="mc-fixed-years">{t('tool.credito.fixedYearsLabel')}</label>
                <input id="mc-fixed-years" type="number" min={0} max={parsed.prazoAnos || 50} value={state.fixedYears} onChange={(e) => set('fixedYears', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="mc-spread">{t('tool.credito.spreadLabel')}</label>
                <input id="mc-spread" type="number" min={0} step={0.05} value={state.spread} onChange={(e) => set('spread', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="mc-euribor">{t('tool.credito.euriborLabel')}</label>
                <input id="mc-euribor" type="number" step={0.05} value={state.euriborPct} onChange={(e) => set('euriborPct', e.target.value)} />
              </div>
            </div>
          )}

          {!isValid && <p className="field-error">{t('tool.credito.errInvalid')}</p>}

          {schedule && (
            <>
              <div className="kpi-grid" style={{ marginTop: 8 }}>
                <div className="kpi">
                  <div className="kpi-label">{t('tool.credito.installmentLabel')}</div>
                  <div className="kpi-value">{eur2(schedule.rows[0]?.prestacao ?? 0)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">{t('tool.credito.totalPaidLabel')}</div>
                  <div className="kpi-value">{eur(schedule.totalPaid)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">{t('tool.credito.totalInterestLabel')}</div>
                  <div className="kpi-value">{eur(schedule.totalInterest)}</div>
                </div>
                <div className="kpi">
                  <div className="kpi-label">{t('tool.credito.termEndLabel')}</div>
                  <div className="kpi-value">{schedule.payoffYm}</div>
                </div>
              </div>

              <h3 className="section-label" style={{ marginTop: 20 }}>{t('tool.credito.chartTitle')}</h3>
              <Suspense fallback={<div className="chart-wrap" style={{ height: 260 }} />}>
                <AmortizationChart series={[{ label: t('tool.credito.chartTitle'), points: schedule.rows.map((r) => ({ ym: r.ym, capital: r.capital })), color: '#2563EB' }]} />
              </Suspense>

              <p className="mkt-privacy-note" style={{ marginTop: 16 }}>{t('tool.credito.prefillSaved')}</p>

              <div className="form-actions">
                <Link to="/signup" className="btn btn-primary">{t('tool.credito.ctaSave')}</Link>
              </div>
            </>
          )}
        </section>

        <AdSlot />

        <section className="mkt-tool-explainer">
          {lang === 'en' ? <CreditoExplainerEn /> : <CreditoExplainerPt />}
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

// ── Intro (SEO copy, ~150 words) ─────────────────────────────────
function CreditoIntroPt() {
  return (
    <>
      Simula em segundos a prestação mensal, o total pago e os juros de um crédito
      habitação em Portugal. Introduz o montante, o prazo e a taxa — fixa ou mista
      (um período inicial a TAN fixa seguido de Euribor + spread, o formato mais
      comum nos créditos habitação portugueses) — e o simulador calcula a prestação
      pelo método de amortização francesa (prestação constante), o mesmo usado pelos
      bancos. Vês também a evolução do capital em dívida ao longo do prazo. É
      gratuito, sem limite de simulações e sem necessidade de criar conta — os
      cálculos correm no teu browser.
    </>
  )
}
function CreditoIntroEn() {
  return (
    <>
      Simulate your monthly mortgage payment, total cost and interest in seconds.
      Enter the loan amount, term and rate — fixed, or mixed (an initial fixed-rate
      period followed by Euribor + spread, the most common Portuguese mortgage
      structure) — and the simulator computes the payment using the French
      amortization method (constant instalment), the same one banks use. You also
      see how the outstanding balance evolves over the term. It's free, unlimited
      and doesn't require an account — all calculations run in your browser.
    </>
  )
}

// ── Explainer + FAQ (~350-450 words, per-language JSX per docs/decisions/auth.md) ──
function CreditoExplainerPt() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>Como funciona o simulador de crédito habitação</h2>
      <p className="mkt-tool-explainer-intro">
        O crédito habitação em Portugal usa quase sempre o regime de{' '}
        <strong>amortização francesa</strong>: a prestação mensal mantém-se
        constante enquanto a taxa não muda, mas a proporção entre juros e capital
        varia — no início pagas mais juros, no fim pagas mais capital. Quando a
        taxa muda (por exemplo, numa revisão da Euribor), a prestação é recalculada
        para o capital e prazo restantes.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'tan-vs-taeg',
            question: 'Qual a diferença entre TAN e TAEG?',
            answer: (
              <p>
                A <strong>TAN</strong> (Taxa Anual Nominal) é a taxa de juro pura
                usada para calcular a prestação. A <strong>TAEG</strong> (Taxa Anual
                Efetiva Global) inclui também comissões, seguros e outros encargos
                obrigatórios — por isso é sempre igual ou superior à TAN, e é a taxa
                que a lei obriga os bancos a destacar nas propostas. Este simulador
                trabalha só com a TAN (o custo do crédito em si); usa a TAEG do teu
                banco para comparar propostas completas.
              </p>
            ),
          },
          {
            id: 'taxa-mista',
            question: 'O que é uma taxa mista?',
            answer: (
              <p>
                É a estrutura mais comum em créditos habitação recentes: um período
                inicial (normalmente 1 a 5 anos) a <strong>taxa fixa</strong>, seguido
                do resto do prazo a <strong>Euribor + spread</strong>. Dá previsibilidade
                no arranque do crédito e depois acompanha o mercado.
              </p>
            ),
          },
          {
            id: 'prazo-vs-prestacao',
            question: 'Uma amortização antecipada reduz o prazo ou a prestação?',
            answer: (
              <p>
                Podes escolher: reduzir o <strong>prazo</strong> (mantém a prestação,
                acaba o crédito mais cedo — poupa mais juros ao longo do tempo) ou
                reduzir a <strong>prestação</strong> (mantém o prazo, alivia a
                mensalidade). A app Wallet360 simula os dois modos e mostra a
                poupança em juros de cada um — este simulador público mostra a
                simulação sem amortizações; experimenta o{' '}
                <Link to="/simuladores/amortizar-ou-investir">simulador de amortizar ou investir</Link>{' '}
                para comparar amortizar com investir o dinheiro.
              </p>
            ),
          },
          {
            id: 'estimativa',
            question: 'Este valor é a prestação exata que o banco vai cobrar?',
            answer: (
              <p>
                É uma <strong>estimativa</strong> baseada nos valores que introduzes.
                A prestação real do teu banco pode incluir seguros associados (vida,
                multirriscos), comissões de manutenção de conta e pequenos
                arredondamentos. Usa a TAEG da tua proposta para uma comparação mais
                completa entre bancos.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}
function CreditoExplainerEn() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>How the mortgage simulator works</h2>
      <p className="mkt-tool-explainer-intro">
        Portuguese mortgages almost always use the <strong>French amortization</strong>{' '}
        method: the monthly payment stays constant while the rate doesn't change, but
        the split between interest and principal shifts over time — more interest
        early on, more principal later. When the rate changes (e.g. at a Euribor
        revision), the payment is recalculated for the remaining balance and term.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'tan-vs-taeg',
            question: 'What is the difference between TAN and TAEG?',
            answer: (
              <p>
                <strong>TAN</strong> (Nominal Annual Rate) is the pure interest rate
                used to compute the payment. <strong>TAEG</strong> (Annual Percentage
                Rate, APR) also includes fees, insurance and other mandatory charges —
                so it's always equal to or higher than the TAN, and Portuguese law
                requires banks to disclose it in proposals. This simulator works with
                the TAN only (the cost of the loan itself); use your bank's TAEG to
                compare full proposals.
              </p>
            ),
          },
          {
            id: 'taxa-mista',
            question: 'What is a mixed rate?',
            answer: (
              <p>
                It's the most common structure in recent mortgages: an initial period
                (usually 1 to 5 years) at a <strong>fixed rate</strong>, followed by the
                rest of the term at <strong>Euribor + spread</strong>. It gives
                predictability at the start and then tracks the market.
              </p>
            ),
          },
          {
            id: 'prazo-vs-prestacao',
            question: 'Does an early repayment shorten the term or lower the payment?',
            answer: (
              <p>
                You can choose either: shorten the <strong>term</strong> (keep the
                payment, finish the loan earlier — saves more interest over time) or
                lower the <strong>payment</strong> (keep the term, ease the monthly
                cost). The Wallet360 app simulates both modes and shows the interest
                saved by each — this public simulator shows the schedule without extra
                repayments; try the{' '}
                <Link to="/simuladores/amortizar-ou-investir">pay-down-or-invest simulator</Link>{' '}
                to compare paying down the loan with investing the money.
              </p>
            ),
          },
          {
            id: 'estimativa',
            question: "Is this the exact payment my bank will charge?",
            answer: (
              <p>
                It's an <strong>estimate</strong> based on the values you enter. Your
                actual bank payment may include bundled insurance (life, home), account
                maintenance fees and small roundings. Use your proposal's TAEG for a
                fuller comparison between banks.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}

export default CreditoHabitacao
