import { ChangeEvent, useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { api } from '@/lib/api'
import { useApplyPortfolioTransactions, type PortfolioTxnItem } from '@/hooks/usePortfolio'
import {
  parseT212Transactions, aggregateDeltas,
  type T212Transaction, type T212Delta,
} from '@/lib/trading212Parser'
import { eur2 } from '@/lib/format'

interface Props { open: boolean; onClose: () => void }

// Broker CSV import — bank-style platform menu. Trading 212 is implemented;
// other brokers show as "brevemente" (each needs its own CSV parser). Selecting
// Trading 212 → export steps + upload → review (delta vs your holdings) → apply.
// Unlike the old snapshot import, this applies buys AND sells as a delta on top
// of existing holdings, so a sell reduces/closes the position instead of being
// dropped. Re-import is idempotent (orders deduped server-side by order id).
const PLATFORMS: { id: string; name: string; active: boolean }[] = [
  { id: 'trading212', name: 'Trading 212', active: true },
  { id: 'revolut', name: 'Revolut', active: false },
  { id: 'degiro', name: 'DEGIRO', active: false },
  { id: 'xtb', name: 'XTB', active: false },
  { id: 'ibkr', name: 'Interactive Brokers', active: false },
]

interface ReviewRow {
  id: number; include: boolean; name: string; ticker: string; isin: string | null
  netQty: number; buyQty: number; buyCost: number; sellQty: number
  txns: T212Transaction[]; resolved: boolean
}
interface SearchResp { results: Array<{ symbol: string; type?: string }> }

async function resolveOne(d: T212Delta, id: number): Promise<ReviewRow> {
  let ticker = d.guessTicker
  let resolved = false
  if (d.isin) {
    try {
      const { results } = await api.get<SearchResp>(`/api/quotes/search?q=${encodeURIComponent(d.isin)}`)
      const hit = results.find((r) => r.type !== 'CURRENCY') ?? results[0]
      if (hit?.symbol) { ticker = hit.symbol.toUpperCase(); resolved = true }
    } catch { /* keep guess */ }
  }
  return {
    id, include: true, name: d.name, ticker, isin: d.isin,
    netQty: d.netQty, buyQty: d.buyQty, buyCost: d.buyCost, sellQty: d.sellQty,
    txns: d.txns, resolved,
  }
}
async function resolveDeltas(deltas: T212Delta[]): Promise<ReviewRow[]> {
  const rows: ReviewRow[] = []
  const CHUNK = 8
  for (let i = 0; i < deltas.length; i += CHUNK) {
    rows.push(...await Promise.all(deltas.slice(i, i + CHUNK).map((d, j) => resolveOne(d, i + j))))
  }
  return rows
}

export function FileImportModal({ open, onClose }: Props) {
  const { t } = useTranslation('portfolio')
  const applyMut = useApplyPortfolioTransactions()
  const [platform, setPlatform] = useState<string | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [fileCount, setFileCount] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [done, setDone] = useState<{ created: number; updated: number; closed: number; skipped: number } | null>(null)

  const reset = () => { setRows([]); setFileCount(0); setParseError(null); setDone(null) }
  const close = () => { reset(); setPlatform(null); onClose() }
  const backToPlatforms = () => { reset(); setPlatform(null) }

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setParseError(null); setDone(null); setParsing(true)
    try {
      const texts = await Promise.all(files.map((f) => f.text()))
      const txns: T212Transaction[] = texts.flatMap((txt) => parseT212Transactions(txt))
      if (txns.length === 0) { setParseError(t('import212.noPositions')); setRows([]); return }
      const deltas = aggregateDeltas(txns)
      if (deltas.length === 0) { setParseError(t('import212.noPositions')); setRows([]); return }
      setRows(await resolveDeltas(deltas))
      setFileCount(files.length)
    } catch { setParseError(t('import212.fileError')) } finally { setParsing(false) }
  }

  const patch = (id: number, p: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))
  const setAll = (v: boolean) => setRows((rs) => rs.map((r) => ({ ...r, include: v })))

  const selected = useMemo(() => rows.filter((r) => r.include), [rows])
  const netInvested = useMemo(() => selected.reduce((s, r) => s + r.buyCost, 0), [selected])
  const unresolved = useMemo(() => rows.filter((r) => !r.resolved).length, [rows])

  const submit = async () => {
    const items: PortfolioTxnItem[] = selected
      .filter((r) => r.name.trim() && r.ticker.trim() && r.txns.length > 0)
      .map((r) => ({
        name: r.name.trim().slice(0, 80), ticker: r.ticker.trim().toUpperCase(), isin: r.isin,
        txns: r.txns.map((tx) => ({
          side: tx.side, shares: tx.shares, total: tx.total, ym: tx.ym, orderId: tx.orderId, time: tx.time,
        })),
      }))
    if (items.length === 0) return
    try {
      const res = await applyMut.mutateAsync(items)
      setDone(res.summary); setRows([])
    } catch { setParseError(t('import212.importError')) }
  }

  return (
    <Modal open={open} onClose={close} title={t('fileImport.title')} maxWidth={820}>
      {done ? (
        <div className="import-done">
          <p><strong>{t('import212.txnDoneTitle')}</strong></p>
          <ul className="import-done-list">
            {done.created > 0 && <li>{t('import212.txnCreated', { count: done.created })}</li>}
            {done.updated > 0 && <li>{t('import212.txnUpdated', { count: done.updated })}</li>}
            {done.closed > 0 && <li>{t('import212.txnClosed', { count: done.closed })}</li>}
            {done.skipped > 0 && <li className="muted">{t('import212.txnSkipped', { count: done.skipped })}</li>}
            {done.created === 0 && done.updated === 0 && done.closed === 0 && (
              <li className="muted">{t('import212.txnNoChange')}</li>
            )}
          </ul>
          <p className="muted" style={{ fontSize: 13 }}>{t('import212.doneRefreshHint')}</p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={close}>{t('import212.finish')}</button>
          </div>
        </div>
      ) : !platform ? (
        // ── Platform menu (bank-style cards) ──
        <div className="import-intro">
          <h3 className="settings-subhead" style={{ marginTop: 0 }}>{t('fileImport.choosePlatform')}</h3>
          <div className="bank-grid">
            {PLATFORMS.map((p) => p.active ? (
              <button key={p.id} type="button" className="bank-card" onClick={() => setPlatform(p.id)}>
                <span className="bank-logo bank-logo-fallback" aria-hidden>{p.name.slice(0, 1)}</span>
                <span className="bank-card-name">{p.name}</span>
              </button>
            ) : (
              <div key={p.id} className="bank-card is-disabled">
                <span className="bank-logo bank-logo-fallback" aria-hidden>{p.name.slice(0, 1)}</span>
                <span className="bank-card-name">{p.name}</span>
                <span className="bank-card-soon">{t('fileImport.soon')}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>{t('fileImport.moreSoon')}</p>
        </div>
      ) : rows.length === 0 ? (
        // ── Trading 212: export steps + upload ──
        <div className="import-intro">
          <button type="button" className="btn btn-ghost btn-sm" onClick={backToPlatforms} style={{ marginBottom: 10 }}>
            {t('fileImport.back')}
          </button>
          <h3 className="settings-subhead" style={{ marginTop: 0 }}>{t('fileImport.t212How')}</h3>
          <ol className="broker-steps">
            <li><Trans i18nKey="fileImport.t212Step1" ns="portfolio" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="fileImport.t212Step2" ns="portfolio" components={{ 1: <strong /> }} /></li>
            <li>{t('fileImport.t212Step3')}</li>
          </ol>
          <label className="btn btn-primary" style={{ cursor: parsing ? 'default' : 'pointer', display: 'inline-block', opacity: parsing ? 0.6 : 1 }}>
            {parsing ? t('import212.parsing') : t('import212.chooseFile')}
            <input type="file" accept=".csv,text/csv" multiple onChange={onFiles} disabled={parsing} style={{ display: 'none' }} />
          </label>
          {parseError && <div className="form-error" style={{ marginTop: 12 }}>{parseError}</div>}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>{t('import212.privacy')}</p>
        </div>
      ) : (
        // ── Review (delta vs your holdings) ──
        <div className="import-review">
          <div className="import-review-head">
            <span className="muted">{t('import212.reviewCount', { count: rows.length, files: fileCount })}</span>
            <span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>{t('import212.all')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>{t('import212.none')}</button>
            </span>
          </div>
          <div className="import-dup-hint">{t('import212.reviewDeltaHint')}</div>
          {unresolved > 0 && <div className="import-dup-hint">{t('import212.unresolvedHint', { count: unresolved })}</div>}
          {parseError && <div className="form-error" style={{ marginBottom: 8 }}>{parseError}</div>}
          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th></th><th>{t('import212.colName')}</th><th>{t('import212.colTicker')}</th>
                  <th style={{ textAlign: 'right' }}>{t('import212.colDelta')}</th>
                  <th style={{ textAlign: 'right' }}>{t('import212.colEffect')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.include ? '' : 'is-excluded'}>
                    <td><input type="checkbox" checked={r.include} onChange={(e) => patch(r.id, { include: e.target.checked })} /></td>
                    <td>
                      <input className="import-name" value={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} />
                      {r.isin && <span className="import-ym muted">{r.isin}</span>}
                    </td>
                    <td>
                      <input className="import-name" style={{ maxWidth: 110 }} value={r.ticker}
                        onChange={(e) => patch(r.id, { ticker: e.target.value.toUpperCase(), resolved: true })} />
                      {!r.resolved && <span className="import-dup-pill">{t('import212.guessPill')}</span>}
                    </td>
                    <td style={{ textAlign: 'right' }} className={r.netQty < 0 ? 'gain-negative' : ''}>
                      {r.netQty > 0 ? '+' : ''}{r.netQty}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {r.buyCost > 0 && <span className="gain-positive">+{eur2(r.buyCost)}</span>}
                      {r.sellQty > 0 && <span className="import-dup-pill" style={{ marginLeft: r.buyCost > 0 ? 6 : 0 }}>{t('import212.sellTag')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="import-summary">
            <span className="muted">{t('import212.summary', { count: selected.length, total: eur2(netInvested) })}</span>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={reset}>{t('import212.otherFile')}</button>
            <button type="button" className="btn btn-primary" disabled={applyMut.isLoading || selected.length === 0} onClick={submit}>
              {applyMut.isLoading ? t('import212.importing') : t('import212.importN', { count: selected.length })}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default FileImportModal
