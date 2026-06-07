import { ChangeEvent, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useBudget, useImportBudget, type ImportItem } from '@/hooks/useBudget'
import { parseStatement, dupSignature, type ParsedTransaction } from '@/lib/statementParser'
import {
  inferCategory, INCOME_CATEGORIES, EXPENSE_CATEGORIES,
} from '@/lib/categoryDictionary'
import { eur2 } from '@/lib/format'

interface Props {
  open: boolean
  onClose: () => void
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

export function ImportStatementModal({ open, onClose }: Props) {
  const importMut = useImportBudget()
  const { data: budget } = useBudget()
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [filename, setFilename] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [done, setDone] = useState<{ incomes: number; expenses: number; skipped: number; duplicates: number; autoClassified: number } | null>(null)

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
      setParseError('Não foi possível ler transações deste ficheiro. Aceita extratos PDF, CSV ou OFX.')
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

    const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
    if (isPdf) {
      // pdf.js is heavy — load it only when a PDF is actually chosen.
      setParsing(true)
      try {
        const { parsePdfStatement } = await import('@/lib/pdfStatementParser')
        finish(await parsePdfStatement(file), file.name)
      } catch {
        setParseError('Erro ao ler o PDF. Tenta exportar o extrato em CSV/OFX, se possível.')
      } finally {
        setParsing(false)
      }
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      try {
        finish(parseStatement(String(reader.result ?? ''), file.name), file.name)
      } catch {
        setParseError('Erro ao processar o ficheiro.')
      }
    }
    reader.onerror = () => setParseError('Não foi possível ler o ficheiro.')
    reader.readAsText(file, 'utf-8')
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
    } catch {
      setParseError('Falha ao importar. Tenta novamente.')
    }
  }

  return (
    <Modal open={open} onClose={close} title="Importar extrato bancário" maxWidth={760}>
      {done ? (
        <div className="import-done">
          <p>
            Importado com sucesso: <strong>{done.incomes}</strong> receita(s) e{' '}
            <strong>{done.expenses}</strong> despesa(s).
            {done.duplicates > 0 && <> {done.duplicates} duplicada(s) ignorada(s).</>}
            {done.skipped > 0 && <> {done.skipped} linha(s) inválida(s) ignorada(s).</>}
          </p>
          {done.autoClassified > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              ✨ {done.autoClassified} classificada(s) automaticamente por regras aprendidas.
            </p>
          )}
          {(done.incomes > 0 || done.expenses > 0) && (
            <p className="muted" style={{ fontSize: 13 }}>
              As restantes ficam em <strong>Por classificar</strong> — escolhe <b>Fixa</b> ou
              <b> Variável</b> e a app aprende para as próximas.
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={close}>Concluir</button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="import-intro">
          <p className="muted" style={{ marginTop: 0 }}>
            Seleciona o extrato do teu banco em <strong>PDF</strong>, <strong>CSV</strong> ou
            <strong> OFX</strong>. Cada linha é lida e classificada como receita (entrada) ou
            despesa (saída) — usamos o valor da <strong>transação</strong> (não o saldo) e
            podes rever tudo antes de importar.
          </p>
          <label
            className="btn btn-primary"
            style={{ cursor: parsing ? 'default' : 'pointer', display: 'inline-block', opacity: parsing ? 0.6 : 1 }}
          >
            {parsing ? 'A ler…' : 'Escolher ficheiro…'}
            <input
              type="file" accept=".pdf,.csv,.ofx,.txt,application/pdf,text/csv"
              onChange={onFile} disabled={parsing} style={{ display: 'none' }}
            />
          </label>
          {parseError && <div className="form-error" style={{ marginTop: 12 }}>{parseError}</div>}
          <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
            Os ficheiros são processados no teu navegador — nada é enviado até confirmares.
          </p>
        </div>
      ) : (
        <div className="import-review">
          <div className="import-review-head">
            <span className="muted">{filename} · {rows.length} transações</span>
            <span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAllIncluded(true)}>Tudo</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAllIncluded(false)}>Nada</button>
            </span>
          </div>

          {dupCount > 0 && (
            <div className="import-dup-hint">
              📌 {dupCount} transação(ões) já tinham sido importadas — desmarcadas automaticamente.
            </div>
          )}

          {parseError && <div className="form-error" style={{ marginBottom: 8 }}>{parseError}</div>}

          <div className="import-table-wrap">
            <table className="import-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
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
                          {r.duplicate && <span className="import-dup-pill">duplicado</span>}
                        </span>
                      </td>
                      <td>
                        <select
                          value={r.kind}
                          onChange={(e) => patch(r.id, { kind: e.target.value as 'income' | 'expense', category: '' })}
                        >
                          <option value="income">Receita</option>
                          <option value="expense">Despesa</option>
                        </select>
                      </td>
                      <td>
                        <select value={r.category} onChange={(e) => patch(r.id, { category: e.target.value })}>
                          <option value="">— por classificar —</option>
                          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
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
              {selected.length} selecionadas · {incomeCount} receitas · {expenseCount} despesas
            </span>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={reset}>Outro ficheiro</button>
            <button
              type="button" className="btn btn-primary"
              disabled={importMut.isLoading || selected.length === 0}
              onClick={submit}
            >
              {importMut.isLoading ? 'A importar…' : `Importar ${selected.length}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default ImportStatementModal
