import { ChangeEvent, useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { useImportPortfolio, type PortfolioImportItem } from '@/hooks/usePortfolio'
import {
  parseT212Transactions, aggregatePositions,
  type T212Transaction, type T212Position,
} from '@/lib/trading212Parser'
import { eur2 } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
}

interface ReviewRow {
  id: number
  include: boolean
  name: string
  ticker: string                 // Yahoo-usable ticker (resolved from ISIN or editable)
  isin: string | null
  qty: number
  invested: number
  value: number
  flows: { ym: string; amount: number }[]
  resolved: boolean              // ISIN → Yahoo symbol succeeded (false = best-effort guess)
}

interface SearchResp { results: Array<{ symbol: string; type?: string }> }

// Resolve each position's ISIN to a Yahoo-usable symbol via the existing search
// proxy (Yahoo's search accepts an ISIN). Falls back to the export's own ticker
// guess when nothing resolves — the user can fix it in the review table.
async function resolveOne(p: T212Position, id: number): Promise<ReviewRow> {
  let ticker = p.guessTicker
  let resolved = false
  if (p.isin) {
    try {
      const { results } = await api.get<SearchResp>(`/api/quotes/search?q=${encodeURIComponent(p.isin)}`)
      const hit = results.find((r) => r.type !== 'CURRENCY') ?? results[0]
      if (hit?.symbol) { ticker = hit.symbol.toUpperCase(); resolved = true }
    } catch { /* keep the guess */ }
  }
  return {
    id, include: true, name: p.name, ticker, isin: p.isin,
    qty: p.qty, invested: p.invested,
    value: p.invested, // cost basis as the starting value; refresh for live prices
    flows: p.flows, resolved,
  }
}

// Resolve in small concurrent batches so a large import doesn't fire dozens of
// search calls at once (the API rate-limiter is per-account).
async function resolvePositions(positions: T212Position[]): Promise<ReviewRow[]> {
  const rows: ReviewRow[] = []
  const CHUNK = 8
  for (let i = 0; i < positions.length; i += CHUNK) {
    rows.push(...await Promise.all(positions.slice(i, i + CHUNK).map((p, j) => resolveOne(p, i + j))))
  }
  return rows
}

export function Trading212ImportModal({ open, onClose }: Props) {
  const { t } = useTranslation('portfolio')
  const importMut = useImportPortfolio()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [fileCount, setFileCount] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; skipped: number } | null>(null)

  const reset = () => { setRows([]); setFileCount(0); setParseError(null); setDone(null) }
  const close = () => { reset(); onClose() }

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file
    if (files.length === 0) return
    setParseError(null); setDone(null); setParsing(true)
    try {
      // T212 exports are UTF-8. Merge several years' files into one ledger.
      const texts = await Promise.all(files.map((f) => f.text()))
      const txns: T212Transaction[] = texts.flatMap((txt) => parseT212Transactions(txt))
      if (txns.length === 0) { setParseError(t('import212.noPositions')); setRows([]); return }
      const positions = aggregatePositions(txns)
      if (positions.length === 0) { setParseError(t('import212.noPositions')); setRows([]); return }
      setRows(await resolvePositions(positions))
      setFileCount(files.length)
    } catch {
      setParseError(t('import212.fileError'))
    } finally {
      setParsing(false)
    }
  }

  const patch = (id: number, p: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const setAll = (v: boolean) => setRows((rs) => rs.map((r) => ({ ...r, include: v })))

  const selected = useMemo(() => rows.filter((r) => r.include), [rows])
  const totalInvested = useMemo(() => selected.reduce((s, r) => s + r.invested, 0), [selected])
  const unresolved = useMemo(() => rows.filter((r) => !r.resolved).length, [rows])

  const submit = async () => {
    const items: PortfolioImportItem[] = selected
      .filter((r) => r.name.trim() && r.ticker.trim() && r.qty > 0)
      .map((r) => ({
        name: r.name.trim().slice(0, 80),
        ticker: r.ticker.trim().toUpperCase(),
        isin: r.isin,
        qty: r.qty,
        invested: r.invested,
        value: r.value,
        flows: r.flows,
      }))
    if (items.length === 0) return
    try {
      const res = await importMut.mutateAsync(items)
      setDone(res.summary)
      setRows([])
    } catch {
      setParseError(t('import212.importError'))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('import212.title')} maxWidth={820}>
      {done ? (
        <div className="import-done">
          <p>
            <Trans i18nKey="import212.doneCreated" ns="portfolio" values={{ count: done.created }} components={{ 1: <strong /> }} />
            {done.skipped > 0 && ' ' + t('import212.doneSkipped', { count: done.skipped })}
          </p>
          <p className="muted" style={{ fontSize: 13 }}>{t('import212.doneRefreshHint')}</p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={close}>{t('import212.finish')}</button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="import-intro">
          <p className="muted" style={{ marginTop: 0 }}>
            <Trans i18nKey="import212.intro" ns="portfolio" components={{ 1: <strong />, 3: <strong /> }} />
          </p>
          <label
            className="btn btn-primary"
            style={{ cursor: parsing ? 'default' : 'pointer', display: 'inline-block', opacity: parsing ? 0.6 : 1 }}
          >
            {parsing ? t('import212.parsing') : t('import212.chooseFile')}
            <input
              type="file" accept=".csv,text/csv" multiple
              onChange={onFiles} disabled={parsing} style={{ display: 'none' }}
            />
          </label>
          {parseError && <div className="form-error" style={{ marginTop: 12 }}>{parseError}</div>}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>{t('import212.privacy')}</p>
        </div>
      ) : (
        <div className="import-review">
          <div className="import-review-head">
            <span className="muted">{t('import212.reviewCount', { count: rows.length, files: fileCount })}</span>
            <span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>{t('import212.all')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>{t('import212.none')}</button>
            </span>
          </div>

          {unresolved > 0 && (
            <div className="import-dup-hint">{t('import212.unresolvedHint', { count: unresolved })}</div>
          )}
          {parseError && <div className="form-error" style={{ marginBottom: 8 }}>{parseError}</div>}

          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th></th>
                  <th>{t('import212.colName')}</th>
                  <th>{t('import212.colTicker')}</th>
                  <th style={{ textAlign: 'right' }}>{t('import212.colQty')}</th>
                  <th style={{ textAlign: 'right' }}>{t('import212.colInvested')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.include ? '' : 'is-excluded'}>
                    <td>
                      <input type="checkbox" checked={r.include}
                        onChange={(e) => patch(r.id, { include: e.target.checked })} />
                    </td>
                    <td>
                      <input className="import-name" value={r.name}
                        onChange={(e) => patch(r.id, { name: e.target.value })} />
                      {r.isin && <span className="import-ym muted">{r.isin}</span>}
                    </td>
                    <td>
                      <input className="import-name" style={{ maxWidth: 110 }} value={r.ticker}
                        onChange={(e) => patch(r.id, { ticker: e.target.value.toUpperCase(), resolved: true })} />
                      {!r.resolved && <span className="import-dup-pill">{t('import212.guessPill')}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.qty}</td>
                    <td style={{ textAlign: 'right' }}>{eur2(r.invested)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="import-summary">
            <span className="muted">{t('import212.summary', { count: selected.length, total: eur2(totalInvested) })}</span>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={reset}>{t('import212.otherFile')}</button>
            <button type="button" className="btn btn-primary"
              disabled={importMut.isLoading || selected.length === 0} onClick={submit}>
              {importMut.isLoading ? t('import212.importing') : t('import212.importN', { count: selected.length })}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default Trading212ImportModal
