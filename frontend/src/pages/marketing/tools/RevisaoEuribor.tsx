import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from 'react-query'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { InstallCta } from '@/components/marketing/InstallCta'
import { AdSlot } from '@/components/marketing/AdSlot'
import { Accordion } from '@/components/marketing/Accordion'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useJsonLd } from '@/hooks/useJsonLd'
import { asAppLanguage } from '@/i18n'
import { api, ApiError } from '@/lib/api'
import { eur2, eurSigned, currentYm } from '@/lib/format'
// ⚠️ Public simulator: reuses the backend's zero-import loan engine straight
// from source via the @engines alias (docs/landing-spec.md A2). Only imported
// from this lazy-loaded tool-page chunk — never the app's main chunk.
import { computeSchedule } from '@engines/loanEngine'

interface EuriborResponse {
  rate3m: number | null
  rate6m: number | null
  rate12m: number | null
  asOf: string | null
}

function usePublicEuribor() {
  return useQuery<EuriborResponse, ApiError>(
    ['public', 'euribor'],
    () => api.get<EuriborResponse>('/api/public/euribor'),
    { enabled: false, staleTime: 1000 * 60 * 60, retry: 1 },
  )
}

type Tenor = '3m' | '6m' | '12m'

export function RevisaoEuribor() {
  const { t, i18n } = useTranslation('landing')
  usePageMeta(t('tool.euribor.metaTitle'), t('tool.euribor.metaDescription'), '/simuladores/revisao-euribor')
  useJsonLd('jsonld-euribor', {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('tools.euribor.name'),
    description: t('tool.euribor.metaDescription'),
    applicationCategory: 'FinanceApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    url: 'https://wallet360.pt/simuladores/revisao-euribor',
  })

  const [debt, setDebt] = useState('150000')
  const [remainingMonths, setRemainingMonths] = useState('240')
  const [spread, setSpread] = useState('1.1')
  const [tenor, setTenor] = useState<Tenor>('12m')
  const [currentPayment, setCurrentPayment] = useState('')

  const euribor = usePublicEuribor()

  const parsedDebt = parseFloat(debt.replace(',', '.'))
  const parsedMonths = parseInt(remainingMonths, 10)
  const parsedSpread = parseFloat(spread.replace(',', '.'))
  const parsedCurrent = currentPayment ? parseFloat(currentPayment.replace(',', '.')) : null

  const isValid =
    Number.isFinite(parsedDebt) && parsedDebt > 0 &&
    Number.isFinite(parsedMonths) && parsedMonths > 0 && parsedMonths <= 600 &&
    Number.isFinite(parsedSpread) && parsedSpread >= 0

  const rateData = euribor.data
  const tenorRate = rateData ? (tenor === '3m' ? rateData.rate3m : tenor === '6m' ? rateData.rate6m : rateData.rate12m) : null

  const result = useMemo(() => {
    if (!isValid || tenorRate == null) return null
    try {
      const schedule = computeSchedule({
        capital: parsedDebt,
        prazoMeses: parsedMonths,
        tanFixa: (tenorRate + parsedSpread) / 100,
        mesesFixos: parsedMonths,
        spread: 0,
        euribor: 0,
        dataInicio: currentYm(),
      })
      return schedule.rows[0]?.prestacao ?? null
    } catch {
      return null
    }
  }, [isValid, tenorRate, parsedDebt, parsedMonths, parsedSpread])

  const delta = result != null && parsedCurrent != null ? result - parsedCurrent : null

  const lang = asAppLanguage(i18n.resolvedLanguage)

  return (
    <MarketingLayout>
      <div className="mkt-container">
        <header className="mkt-tool-header">
          <Link to="/simuladores" className="mkt-tool-back">{t('common.backToTools')}</Link>
          <h1>{t('tool.euribor.h1')}</h1>
          <p className="mkt-tool-intro">
            {lang === 'en' ? <EuriborIntroEn /> : <EuriborIntroPt />}
          </p>
        </header>

        <section className="mkt-tool-panel card card-pad-lg">
          <div className="field-grid">
            <div className="field">
              <label htmlFor="re-debt">{t('tool.euribor.debtLabel')}</label>
              <input id="re-debt" type="number" min={1} step={1000} value={debt} onChange={(e) => setDebt(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-months">{t('tool.euribor.remainingTermLabel')}</label>
              <input id="re-months" type="number" min={1} max={600} value={remainingMonths} onChange={(e) => setRemainingMonths(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-spread">{t('tool.euribor.spreadLabel')}</label>
              <input id="re-spread" type="number" min={0} step={0.05} value={spread} onChange={(e) => setSpread(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-tenor">{t('tool.euribor.indexLabel')}</label>
              <select id="re-tenor" value={tenor} onChange={(e) => setTenor(e.target.value as Tenor)}>
                <option value="3m">{t('tool.euribor.index3m')}</option>
                <option value="6m">{t('tool.euribor.index6m')}</option>
                <option value="12m">{t('tool.euribor.index12m')}</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="re-current">{t('tool.euribor.currentPaymentLabel')}</label>
              <input id="re-current" type="number" min={0} step={1} value={currentPayment} onChange={(e) => setCurrentPayment(e.target.value)} />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button" className="btn btn-primary"
              disabled={!isValid || euribor.isFetching}
              onClick={() => void euribor.refetch()}
            >
              {euribor.isFetching ? t('tool.euribor.calculating') : t('tool.euribor.calculate')}
            </button>
          </div>

          {euribor.isError && <p className="field-error">{t('tool.euribor.errFetch')}</p>}

          {rateData && (
            <div className="kpi-grid" style={{ marginTop: 16 }}>
              <div className="kpi">
                <div className="kpi-label">{t('tool.euribor.currentEuriborLabel')}</div>
                <div className="kpi-value">{tenorRate != null ? `${tenorRate.toFixed(3)} %` : '—'}</div>
                {rateData.asOf && <div className="kpi-meta">{t('tool.euribor.asOf', { month: rateData.asOf })}</div>}
              </div>
              {result != null && (
                <div className="kpi">
                  <div className="kpi-label">{t('tool.euribor.newPaymentLabel')}</div>
                  <div className="kpi-value">{eur2(result)}</div>
                </div>
              )}
              {delta != null && (
                <div className={`kpi ${delta > 0.5 ? 'kpi-accent-yellow' : delta < -0.5 ? 'kpi-accent-green' : ''}`}>
                  <div className="kpi-label">{t('tool.euribor.deltaLabel')}</div>
                  <div className="kpi-value">
                    {delta > 0.5
                      ? t('tool.euribor.deltaUp', { value: eurSigned(delta) })
                      : delta < -0.5
                        ? t('tool.euribor.deltaDown', { value: eurSigned(delta) })
                        : t('tool.euribor.deltaFlat')}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <AdSlot />

        <section className="mkt-tool-explainer">
          {lang === 'en' ? <EuriborExplainerEn /> : <EuriborExplainerPt />}
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

function EuriborIntroPt() {
  return (
    <>
      A maioria dos créditos habitação em Portugal está indexada à Euribor,
      revista periodicamente (a cada 3, 6 ou 12 meses, consoante o contrato).
      Este simulador calcula a tua nova prestação estimada a partir do capital em
      dívida, do prazo restante e do spread do teu banco, usando a Euribor mais
      recente publicada. Se souberes a prestação atual, o simulador mostra também
      quanto vai subir ou descer por mês. É gratuito e não guarda nenhum dado teu.
    </>
  )
}
function EuriborIntroEn() {
  return (
    <>
      Most Portuguese mortgages are indexed to Euribor, revised periodically
      (every 3, 6 or 12 months, depending on the contract). This simulator
      calculates your estimated new payment from the outstanding capital,
      remaining term and your bank's spread, using the latest published Euribor.
      If you know your current payment, it also shows how much it will rise or
      fall per month. It's free and stores none of your data.
    </>
  )
}

function EuriborExplainerPt() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>Como funciona a revisão da Euribor</h2>
      <p className="mkt-tool-explainer-intro">
        A prestação de um crédito indexado à Euribor não muda todos os meses —
        muda apenas na data de revisão do contrato, que depende do indexante
        escolhido (Euribor a 3, 6 ou 12 meses). Na revisão, o banco recalcula a
        prestação usando a <strong>média da Euribor do mês anterior</strong> à
        revisão, mais o spread contratado, para o capital e prazo que ainda
        faltam pagar.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'quando-revisao',
            question: 'Quando acontece a próxima revisão?',
            answer: (
              <p>
                Depende do indexante do teu contrato: Euribor a 3 meses revê
                trimestralmente, a 6 meses semestralmente, a 12 meses uma vez por
                ano. A data exata está no teu contrato de crédito — normalmente o
                mês de início do crédito marca o ciclo.
              </p>
            ),
          },
          {
            id: 'euribor-negativa',
            question: 'A Euribor pode ser negativa?',
            answer: (
              <p>
                Sim, já foi negativa durante vários anos (até 2022). Quando isso
                acontece, alguns contratos aplicam um "floor" (limite mínimo,
                normalmente 0%) que impede a taxa final de descer abaixo do
                spread. Confirma se o teu contrato tem essa cláusula.
              </p>
            ),
          },
          {
            id: 'fonte-dados',
            question: 'De onde vêm os valores da Euribor?',
            answer: (
              <p>
                Do Banco Central Europeu (séries oficiais de médias mensais),
                atualizadas diariamente pela Wallet360. É a mesma série que os
                bancos portugueses usam contratualmente para rever prestações.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}
function EuriborExplainerEn() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>How the Euribor revision works</h2>
      <p className="mkt-tool-explainer-intro">
        The payment on a Euribor-indexed mortgage doesn't change every month —
        only on the contract's revision date, which depends on the chosen index
        (3, 6 or 12-month Euribor). At revision, the bank recalculates the
        payment using the <strong>previous month's average Euribor</strong> plus
        the contracted spread, for the capital and term still remaining.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'quando-revisao',
            question: 'When is the next revision?',
            answer: (
              <p>
                It depends on your contract's index: 3-month Euribor revises
                quarterly, 6-month semi-annually, 12-month once a year. The exact
                date is in your loan contract — usually the loan's start month
                anchors the cycle.
              </p>
            ),
          },
          {
            id: 'euribor-negativa',
            question: 'Can Euribor be negative?',
            answer: (
              <p>
                Yes, it was negative for several years (until 2022). When that
                happens, some contracts apply a "floor" (a minimum, usually 0%)
                that stops the final rate from going below the spread. Check
                whether your contract has that clause.
              </p>
            ),
          },
          {
            id: 'fonte-dados',
            question: 'Where does the Euribor data come from?',
            answer: (
              <p>
                From the European Central Bank (official monthly-average
                series), refreshed daily by Wallet360. It's the same series
                Portuguese banks contractually use to revise payments.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}

export default RevisaoEuribor
