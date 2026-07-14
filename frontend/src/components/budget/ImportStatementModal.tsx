import { ChangeEvent, useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { useBudget, useImportBudget, type ImportItem } from '@/hooks/useBudget'
import { parseStatement, parseStatementRows, dupSignature, type ParsedTransaction } from '@/lib/statementParser'
import {
  inferCategory, categoryLabel, INCOME_CATEGORIES, EXPENSE_CATEGORIES,
} from '@/lib/categoryDictionary'
import { eur2 } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
  // Fired once a statement import lands — Budget uses it to open the
  // "Fecho do mês" review (after the budget query refetches).
  onImported?: () => void
}

interface ReviewRow {
  id: number
  include: boolean
  kind: 'income' | 'expense'
  name: string
  category: string
  amount: number      // absolute value, always positive
  ym: string | null   // YYYY-MM the transaction belongs to
  day: number | null  // day of month (1-31) — disambiguates same-amount lines
  duplicate: boolean  // already exists in the budget (same month + day + amount + name)
}

// Map parsed transactions → review rows. `existing` is the set of signatures
// the user already has (from a prior import) — matching rows are flagged as
// duplicates and unticked by default so a re-import is a safe no-op.
function rowsFromTxns(txns: ParsedTransaction[], existing: Set<string>): ReviewRow[] {
  return txns.map((t, i) => {
    const kind = t.amount >= 0 ? 'income' : 'expense'
    const name = t.description.slice(0, 80)
    const amount = Math.abs(t.amount)
    const duplicate = !!t.ym && existing.has(dupSignature(kind, name, amount, t.ym, t.day))
    return {
      id: i,
      include: !duplicate,
      kind,
      name,
      category: inferCategory(t.description) ?? '',
      amount,
      ym: t.ym,
      day: t.day,
      duplicate,
    }
  })
}

// Best-effort source label from the statement's file name, so grouped views
// can show which bank a transaction came from.
function sourceFromFilename(filename: string): string {
  if (/ctt/i.test(filename)) return 'Banco CTT'
  if (/bcp|millennium/i.test(filename)) return 'Millennium BCP'
  if (/montepio/i.test(filename)) return 'Montepio'
  return 'Extrato'
}

export function ImportStatementModal({ open, onClose, onImported }: Props) {
  const { t } = useTranslation('budget')
  const importMut = useImportBudget()
  const { data: budget } = useBudget()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [filename, setFilename] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [done, setDone] = useState<{ incomes: number; expenses: number; skipped: number; duplicates: number; autoClassified: number; matchedToPlan: number } | null>(null)

  // Signatures of month-scoped rows the user already has, so re-importing the
  // same statement flags the existing lines instead of duplicating them.
  const existingSigs = useMemo(() => {
    const set = new Set<string>()
    if (!budget) return set
    // Include both classified and still-pending items, so re-importing the same
    // statement before classifying is flagged client-side too (the backend
    // dedupes against both regardless).
    for (const i of [...budget.incomes, ...budget.pendingIncomes]) {
      if (i.startYm && i.startYm === i.endYm) set.add(dupSignature('income', i.name, i.amount, i.startYm, i.dayOfMonth))
    }
    for (const e of [...budget.expenses, ...budget.pendingExpenses]) {
      if (e.startYm && e.startYm === e.endYm) set.add(dupSignature('expense', e.name, e.amount, e.startYm, e.dayOfMonth))
    }
    return set
  }, [budget])

  const reset = () => {
    setRows([]); setFilename(''); setParseError(null); setDone(null)
  }

  const close = () => { reset(); onClose() }

  const finish = (txns: ParsedTransaction[], name: string) => {
    if (txns.length === 0) {
      setParseError(t('import.noTransactions'))
      setRows([])
    } else {
      setRows(rowsFromTxns(txns, existingSigs))
      setFilename(name)
    }
  }

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file later
    if (!file) return
    setParseError(null); setDone(null)

    const lower = file.name.toLowerCase()

    const isPdf = /\.pdf$/i.test(lower) || file.type === 'application/pdf'
    if (isPdf) {
      // pdf.js is heavy — load it only when a PDF is actually chosen.
      setParsing(true)
      try {
        const { parsePdfStatement } = await import('@/lib/pdfStatementParser')
        finish(await parsePdfStatement(file), file.name)
      } catch {
        setParseError(t('import.pdfError'))
      } finally {
        setParsing(false)
      }
      return
    }

    // Legacy binary .xls (BIFF/OLE) isn't a ZIP — we can't read it. Guide the
    // user to a supported export rather than mojibake it through the CSV path.
    if (/\.xls$/i.test(lower)) {
      setParseError(t('import.xlsUnsupported'))
      return
    }

    // .xlsx / .xlsm are ZIP-of-XML — decode real cells (fflate is lazy-loaded),
    // then run the same column-mapping as CSV. Reading them as text = mojibake.
    if (/\.xlsx$/i.test(lower) || /\.xlsm$/i.test(lower)) {
      setParsing(true)
      try {
        const { parseXlsxStatement } = await import('@/lib/xlsxStatementParser')
        const buf = await file.arrayBuffer()
        finish(parseStatementRows(parseXlsxStatement(buf)), file.name)
      } catch {
        setParseError(t('import.xlsxError'))
      } finally {
        setParsing(false)
      }
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        // Decode as UTF-8 first; if that produces replacement chars (�), the
        // file is almost certainly Windows-1252/Latin-1 — the default for most
        // Portuguese bank CSV/OFX exports — so re-decode with that charset so
        // accents (ç, ã, õ…) survive.
        const buf = reader.result as ArrayBuffer
        let text = new TextDecoder('utf-8').decode(buf)
        if (text.includes('�')) {
          text = new TextDecoder('windows-1252').decode(buf)
        }
        finish(parseStatement(text, file.name), file.name)
      } catch {
        setParseError(t('import.fileError'))
      }
    }
    reader.onerror = () => setParseError(t('import.readError'))
    reader.readAsArrayBuffer(file)
  }

  const patch = (id: number, p: Partial<ReviewRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const setAllIncluded = (v: boolean) =>
    setRows((rs) => rs.map((r) => ({ ...r, include: v })))

  const selected = useMemo(() => rows.filter((r) => r.include), [rows])
  const incomeCount = selected.filter((r) => r.kind === 'income').length
  const expenseCount = selected.filter((r) => r.kind === 'expense').length
  const dupCount = useMemo(() => rows.filter((r) => r.duplicate).length, [rows])

  const submit = async () => {
    const items: ImportItem[] = selected
      .filter((r) => r.name.trim() && r.amount > 0)
      .map((r) => ({
        kind: r.kind,
        name: r.name.trim().slice(0, 80),
        amount: r.amount,
        category: r.category || null,
        dayOfMonth: r.day,
        source: sourceFromFilename(filename),
        ...(r.kind === 'expense' ? { type: 'variable' as const } : {}),
        // Scope each one-off line to its own month so the timeline doesn't
        // treat it as a recurring entry.
        startYm: r.ym,
        endYm: r.ym,
      }))
    if (items.length === 0) return
    try {
      const res = await importMut.mutateAsync(items)
      setDone(res.summary)
      setRows([])
      onImported?.()
    } catch {
      setParseError(t('import.importError'))
    }
  }

  return (
    <Modal open={open} onClose={close} title={t('import.title')} maxWidth={760}>
      {done ? (
        <div className="import-done">
          <p>
            <Trans i18nKey="import.doneIncomesExpenses" ns="budget" values={{ incomes: done.incomes, expenses: done.expenses }} components={{ 1: <strong />, 3: <strong /> }} />
            {done.duplicates > 0 && t('import.doneDuplicates', { count: done.duplicates })}
            {done.matchedToPlan > 0 && t('import.doneMatchedToPlan', { count: done.matchedToPlan })}
            {done.skipped > 0 && t('import.doneSkipped', { count: done.skipped })}
          </p>
          {done.autoClassified > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {t('import.doneAutoClassified', { count: done.autoClassified })}
            </p>
          )}
          {(done.incomes > 0 || done.expenses > 0) && (
            <p className="muted" style={{ fontSize: 13 }}>
              <Trans i18nKey="import.doneRemaining" ns="budget" components={{ 1: <strong />, 3: <b />, 5: <b /> }} />
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={close}>{t('import.finish')}</button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="import-intro">
          <p className="muted" style={{ marginTop: 0 }}>
            <Trans i18nKey="import.intro" ns="budget" components={{ 1: <strong />, 3: <strong />, 5: <strong />, 7: <strong /> }} />
          </p>
          <label
            className="btn btn-primary"
            style={{ cursor: parsing ? 'default' : 'pointer', display: 'inline-block', opacity: parsing ? 0.6 : 1 }}
          >
            {parsing ? t('import.parsing') : t('import.chooseFile')}
            <input
              type="file"
              accept=".pdf,.csv,.ofx,.txt,.xlsx,.xlsm,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile} disabled={parsing} style={{ display: 'none' }}
            />
          </label>
          {parseError && <div className="form-error" style={{ marginTop: 12 }}>{parseError}</div>}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            {t('import.privacy')}
          </p>
        </div>
      ) : (
        <div className="import-review">
          <div className="import-review-head">
            <span className="muted">{t('import.reviewCount', { filename, count: rows.length })}</span>
            <span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAllIncluded(true)}>{t('import.all')}</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAllIncluded(false)}>{t('import.none')}</button>
            </span>
          </div>

          {dupCount > 0 && (
            <div className="import-dup-hint">
              {t('import.dupHint', { count: dupCount })}
            </div>
          )}

          {parseError && <div className="form-error" style={{ marginBottom: 8 }}>{parseError}</div>}

          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th></th>
                  <th>{t('import.colDescription')}</th>
                  <th>{t('import.colType')}</th>
                  <th>{t('import.colCategory')}</th>
                  <th style={{ textAlign: 'right' }}>{t('import.colAmount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cats = r.kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
                  return (
                    <tr key={r.id} className={r.include ? '' : 'is-excluded'}>
                      <td>
                        <input
                          type="checkbox" checked={r.include}
                          onChange={(e) => patch(r.id, { include: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          className="import-name" value={r.name}
                          onChange={(e) => patch(r.id, { name: e.target.value })}
                        />
                        <span className="import-ym">
                          {r.ym && <span className="muted">{r.ym}</span>}
                          {r.duplicate && <span className="import-dup-pill">{t('import.dupPill')}</span>}
                        </span>
                      </td>
                      <td>
                        <select
                          value={r.kind}
                          onChange={(e) => patch(r.id, { kind: e.target.value as 'income' | 'expense', category: '' })}
                        >
                          <option value="income">{t('import.income')}</option>
                          <option value="expense">{t('import.expense')}</option>
                        </select>
                      </td>
                      <td>
                        <select value={r.category} onChange={(e) => patch(r.id, { category: e.target.value })}>
                          <option value="">{t('import.uncategorizedOption')}</option>
                          {cats.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }} className={r.kind === 'income' ? 'gain-positive' : 'gain-negative'}>
                        {r.kind === 'income' ? '+' : '−'}{eur2(r.amount)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="import-summary">
            <span className="muted">
              {t('import.summary', { selected: selected.length, incomes: incomeCount, expenses: expenseCount })}
            </span>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={reset}>{t('import.otherFile')}</button>
            <button
              type="button" className="btn btn-primary"
              disabled={importMut.isLoading || selected.length === 0}
              onClick={submit}
            >
              {importMut.isLoading ? t('import.importing') : t('import.importN', { count: selected.length })}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default ImportStatementModal
