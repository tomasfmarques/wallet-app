import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MarketingLayout } from '@/components/marketing/MarketingLayout'
import { InstallCta } from '@/components/marketing/InstallCta'
import { AdSlot } from '@/components/marketing/AdSlot'
import { Accordion } from '@/components/marketing/Accordion'
import { Icon } from '@/components/ui/Icon'
import { usePageMeta } from '@/hooks/usePageMeta'
import { useJsonLd } from '@/hooks/useJsonLd'
import { asAppLanguage } from '@/i18n'
import { eur2 } from '@/lib/format'
import { parseT212Transactions, type T212Transaction } from '@/lib/trading212Parser'
// ⚠️ Public simulator: reuses the backend's zero-import capital-gains (FIFO)
// engine straight from source via the @engines alias (docs/landing-spec.md
// A2). Only imported from this lazy-loaded tool-page chunk.
import { buildGainsReport, type GainTxn } from '@engines/capitalGains'

const FREE_ROW_LIMIT = 5
const MAX_BLURRED_PREVIEW = 3

function toGainTxns(rows: T212Transaction[]): GainTxn[] {
  return rows.map((t) => ({
    side: t.side,
    isin: t.isin,
    ticker: t.ticker,
    qty: t.shares,
    totalEur: t.total,
    ym: t.ym,
    txnTime: t.time,
  }))
}

export function IrsMaisValias() {
  const { t, i18n } = useTranslation('landing')
  usePageMeta(t('tool.irs.metaTitle'), t('tool.irs.metaDescription'), '/simuladores/irs-mais-valias')
  useJsonLd('jsonld-irs', {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: t('tools.irs.name'),
    description: t('tool.irs.metaDescription'),
    applicationCategory: 'FinanceApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    url: 'https://wallet360.pt/simuladores/irs-mais-valias',
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [fileNames, setFileNames] = useState<string[]>([])
  const [rawTxns, setRawTxns] = useState<T212Transaction[]>([])
  const [year, setYear] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Every calculation below runs on data that stays in this tab's memory —
  // nothing about the uploaded file is ever sent over the network.
  const gainTxns = useMemo(() => toGainTxns(rawTxns), [rawTxns])
  const availableYears = useMemo(
    () => (gainTxns.length ? buildGainsReport(gainTxns, new Date().getFullYear()).availableYears : []),
    [gainTxns],
  )
  const report = useMemo(
    () => (year != null && gainTxns.length ? buildGainsReport(gainTxns, year) : null),
    [gainTxns, year],
  )

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    const fileArr = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.csv'))
    if (fileArr.length === 0) {
      setError(t('tool.irs.errNotT212'))
      return
    }
    try {
      const parsed: T212Transaction[] = []
      for (const f of fileArr) {
        const text = await f.text()
        parsed.push(...parseT212Transactions(text))
      }
      if (parsed.length === 0) {
        setError(t('tool.irs.errNotT212'))
        return
      }
      // MERGE with anything already loaded (the FAQ promises "carrega todos
      // aqui — o simulador junta-os"), deduping by the CSV order ID so
      // re-dropping the same file is a no-op. Orders without an ID fall back
      // to a composite key.
      const keyOf = (x: T212Transaction) =>
        x.orderId ?? `${x.side}|${x.isin ?? x.ticker}|${x.shares}|${x.total}|${x.time}`
      const seen = new Set(rawTxns.map(keyOf))
      const merged = [...rawTxns]
      for (const x of parsed) {
        const k = keyOf(x)
        if (!seen.has(k)) { seen.add(k); merged.push(x) }
      }
      setRawTxns(merged)
      setFileNames((prev) => [...new Set([...prev, ...fileArr.map((f) => f.name)])])
      const years = buildGainsReport(toGainTxns(merged), new Date().getFullYear()).availableYears
      if (years.length === 0) {
        setError(t('tool.irs.errNoSales'))
        setYear(null)
      } else {
        // Keep the visitor's selected year across merges when still valid.
        setYear((prev) => (prev != null && years.includes(prev) ? prev : years[0]))
      }
    } catch {
      setError(t('tool.irs.errNotT212'))
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files)
  }

  const visibleRows = report?.rows.slice(0, FREE_ROW_LIMIT) ?? []
  const hiddenRows = report?.rows.slice(FREE_ROW_LIMIT) ?? []
  const isGated = hiddenRows.length > 0
  const previewRows = hiddenRows.slice(0, MAX_BLURRED_PREVIEW)
  const visibleIncompleteCount = visibleRows.filter((r) => r.incomplete).length

  const lang = asAppLanguage(i18n.resolvedLanguage)

  return (
    <MarketingLayout>
      <div className="mkt-container">
        <header className="mkt-tool-header">
          <Link to="/simuladores" className="mkt-tool-back">{t('common.backToTools')}</Link>
          <h1>{t('tool.irs.h1')}</h1>
          <p className="mkt-tool-intro">
            {lang === 'en' ? <IrsIntroEn /> : <IrsIntroPt />}
          </p>
        </header>

        <section className="mkt-tool-panel card card-pad-lg">
          <div
            className={`mkt-dropzone ${isDragOver ? 'is-dragover' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          >
            <div className="mkt-dropzone-title">{t('tool.irs.uploadTitle')}</div>
            <div className="mkt-dropzone-hint">{t('tool.irs.uploadHint')}</div>
            <div className="mkt-dropzone-hint" style={{ marginTop: 8 }}>{t('tool.irs.dropCta')}</div>
            <input
              ref={fileInputRef} type="file" accept=".csv" multiple
              onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files) }}
            />
          </div>
          <p className="mkt-privacy-note">
            <Icon name="lock" size={14} /> {t('tool.irs.privacyNote')}
          </p>

          {fileNames.length > 0 && !error && (
            <p className="field-hint" style={{ marginTop: 10 }}>{fileNames.join(', ')}</p>
          )}
          {error && <p className="field-error" style={{ marginTop: 10 }}>{error}</p>}

          {availableYears.length > 1 && (
            <div className="field" style={{ maxWidth: 200, marginTop: 14 }}>
              <label htmlFor="irs-year">{t('tool.irs.yearLabel')}</label>
              <select id="irs-year" value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))}>
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {report && report.rows.length > 0 && (
            <>
              {!isGated && (
                <div className="kpi-grid" style={{ marginTop: 16 }}>
                  <div className="kpi">
                    <div className="kpi-label">{t('tool.irs.totalGain')}</div>
                    <div className={`kpi-value ${report.totals.gain >= 0 ? 'gain-positive' : 'gain-negative'}`}>
                      {report.totals.gain >= 0 ? '+' : '−'}{eur2(Math.abs(report.totals.gain))}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-label">{t('tool.irs.estimatedTax')}</div>
                    <div className="kpi-value">{eur2(report.estimatedTax)}</div>
                    <div className="kpi-meta">{t('tool.irs.taxMeta')}</div>
                  </div>
                </div>
              )}

              {visibleIncompleteCount > 0 && (
                <p className="field-hint" style={{ margin: '12px 0 0' }}>
                  {t('tool.irs.incompleteWarning', { count: visibleIncompleteCount })}
                </p>
              )}

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table className="annual-table capital-gains-table">
                  <thead>
                    <tr>
                      <th>{t('tool.irs.colAsset')}</th>
                      <th>{t('tool.irs.colAcquired')}</th>
                      <th>{t('tool.irs.colSold')}</th>
                      <th>{t('tool.irs.colQty')}</th>
                      <th>{t('tool.irs.colCost')}</th>
                      <th>{t('tool.irs.colProceeds')}</th>
                      <th>{t('tool.irs.colGain')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((r, i) => (
                      <tr key={i} className={r.incomplete ? 'is-incomplete' : undefined}>
                        <td>{r.instrument}</td>
                        <td>{r.acquiredYm ?? t('tool.irs.unknown')}</td>
                        <td>{r.soldYm}</td>
                        <td>{r.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                        <td>{eur2(r.costEur)}</td>
                        <td>{eur2(r.proceedsEur)}</td>
                        <td className={r.gainEur >= 0 ? 'gain-positive' : 'gain-negative'}>
                          {r.gainEur >= 0 ? '+' : '−'}{eur2(Math.abs(r.gainEur))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isGated && (
                <div className="mkt-gate-wrap" style={{ marginTop: 4 }}>
                  <table className="annual-table capital-gains-table mkt-gate-blurred">
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i}>
                          <td>{r.instrument}</td>
                          <td>{r.acquiredYm ?? t('tool.irs.unknown')}</td>
                          <td>{r.soldYm}</td>
                          <td>{r.qty.toLocaleString(undefined, { maximumFractionDigits: 8 })}</td>
                          <td>{eur2(r.costEur)}</td>
                          <td>{eur2(r.proceedsEur)}</td>
                          <td>{eur2(r.gainEur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mkt-gate-card">
                    <span className="mkt-gate-title">{t('tool.irs.gateTitle')}</span>
                    <Link to="/signup" className="btn btn-primary">{t('tool.irs.gateCta')}</Link>
                  </div>
                </div>
              )}

              <p className="muted" style={{ fontSize: 12, marginTop: 16, marginBottom: 0 }}>
                {t('tool.irs.disclaimer')}
              </p>
            </>
          )}
        </section>

        <AdSlot />

        <section className="mkt-tool-explainer">
          {lang === 'en' ? <IrsExplainerEn /> : <IrsExplainerPt />}
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

function IrsIntroPt() {
  return (
    <>
      Vendeste ações ou ETFs na Trading 212 e precisas de preencher o Anexo J do
      IRS? Este simulador importa o teu extrato de transações (exportado da
      própria Trading 212) e calcula as mais-valias realizadas pelo método{' '}
      <strong>FIFO</strong> ("primeiro a entrar, primeiro a sair"), o método
      exigido por lei em Portugal. Vês as primeiras 5 linhas do relatório
      gratuitamente; para o relatório completo, com todas as linhas e exportação
      pronta a usar, cria uma conta gratuita ou instala a app. O ficheiro é lido
      inteiramente no teu browser — nunca é enviado para nenhum servidor.
    </>
  )
}
function IrsIntroEn() {
  return (
    <>
      Sold stocks or ETFs on Trading 212 and need to fill in your Anexo J tax
      form? This simulator imports your transaction statement (exported from
      Trading 212 itself) and calculates realized capital gains using the{' '}
      <strong>FIFO</strong> method ("first in, first out"), the method required by
      Portuguese law. You see the first 5 rows of the report for free; for the
      full report, with every row and a ready-to-use export, create a free
      account or install the app. The file is read entirely in your browser — it
      is never sent to any server.
    </>
  )
}

function IrsExplainerPt() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>Como funciona o cálculo das mais-valias</h2>
      <p className="mkt-tool-explainer-intro">
        A lei portuguesa (art. 43.º/6-d do CIRS) obriga a que, quando vendes
        parte de uma posição comprada em datas diferentes, se considerem
        vendidos primeiro os títulos <strong>adquiridos há mais tempo</strong> —
        o método FIFO. Uma venda pode por isso "consumir" várias compras
        anteriores, gerando várias linhas no relatório, cada uma com a sua data
        de aquisição, custo e mais-valia.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'exportar-t212',
            question: 'Como exporto o extrato da Trading 212?',
            answer: (
              <p>
                Na app ou site da Trading 212: <strong>Definições → Histórico →
                Exportar</strong>, escolhe o período (a exportação é limitada a um
                ano de cada vez) e o formato <strong>CSV</strong>. Se tens posições
                de vários anos, exporta um ficheiro por ano e carrega todos aqui —
                o simulador junta-os automaticamente.
              </p>
            ),
          },
          {
            id: 'linha-incompleta',
            question: 'O que significa uma linha "incompleta"?',
            answer: (
              <p>
                Significa que vendeste mais unidades de um ativo do que as
                compras presentes no(s) ficheiro(s) carregado(s) cobrem — a
                posição foi provavelmente comprada antes do período exportado.
                Nesses casos o custo de aquisição fica a zero e precisas de o
                completar manualmente (a app Wallet360 permite editar este valor).
              </p>
            ),
          },
          {
            id: 'porque-so-5',
            question: 'Porque só vejo 5 linhas?',
            answer: (
              <p>
                É o limite gratuito deste simulador público. Para veres o
                relatório completo — todas as linhas, totais e exportação pronta
                para o Anexo J — cria uma conta gratuita ou instala a app. É a
                única barreira em todo este simulador.
              </p>
            ),
          },
          {
            id: 'outras-corretoras',
            question: 'Funciona com outras corretoras?',
            answer: (
              <p>
                Este simulador reconhece especificamente o formato de exportação
                da Trading 212. Extratos de outras corretoras não serão
                reconhecidos corretamente.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}
function IrsExplainerEn() {
  const { t } = useTranslation('landing')
  return (
    <>
      <h2>How the capital-gains calculation works</h2>
      <p className="mkt-tool-explainer-intro">
        Portuguese law (CIRS art. 43(6)(d)) requires that, when you sell part of a
        position bought on different dates, the shares considered sold first are
        the ones <strong>acquired longest ago</strong> — the FIFO method. A single
        sale can therefore "consume" several earlier buys, producing several rows
        in the report, each with its own acquisition date, cost and gain.
      </p>
      <AdSlot />
      <h3 className="section-label">{t('common.faqTitle')}</h3>
      <Accordion
        items={[
          {
            id: 'exportar-t212',
            question: 'How do I export my Trading 212 statement?',
            answer: (
              <p>
                In the Trading 212 app or website: <strong>Settings → History →
                Export</strong>, choose the period (export is limited to one year
                at a time) and the <strong>CSV</strong> format. If you have
                positions spanning several years, export one file per year and
                upload them all here — the simulator merges them automatically.
              </p>
            ),
          },
          {
            id: 'linha-incompleta',
            question: 'What does an "incomplete" row mean?',
            answer: (
              <p>
                It means you sold more units of an asset than the buys present in
                the uploaded file(s) cover — the position was likely bought before
                the exported period. In those cases the acquisition cost is set to
                zero and you need to fill it in manually (the Wallet360 app lets
                you edit this value).
              </p>
            ),
          },
          {
            id: 'porque-so-5',
            question: 'Why do I only see 5 rows?',
            answer: (
              <p>
                That's this public simulator's free limit. To see the full report
                — every row, totals and a ready-to-use Anexo J export — create a
                free account or install the app. It's the only gate in this whole
                simulator.
              </p>
            ),
          },
          {
            id: 'outras-corretoras',
            question: 'Does it work with other brokers?',
            answer: (
              <p>
                This simulator specifically recognises the Trading 212 export
                format. Statements from other brokers won't be recognised
                correctly.
              </p>
            ),
          },
        ]}
      />
    </>
  )
}

export default IrsMaisValias
