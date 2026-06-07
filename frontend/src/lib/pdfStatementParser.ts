// ── PDF bank-statement parser ────────────────────────────────────
// Portuguese banks (BCP/Millennium, Banco CTT, etc.) export statements as PDF
// with a tabular layout. The hard part is telling the *transaction amount*
// (Montante / Débito-Crédito) apart from the *running balance* (Saldo) — they
// look identical as numbers. We solve it positionally: pdf.js gives every text
// fragment an (x, y), so we detect the column headers and read the amount from
// the column under "Montante" (or "Débito"/"Crédito"), explicitly ignoring the
// "Saldo" column.
//
// pdf.js is heavy (~300 KB), so this module is only ever reached via a dynamic
// import() from the import modal when the user actually picks a PDF.

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseAmount, parseDate, type ParsedTransaction } from './statementParser'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

interface Tok { s: string; x: number; y: number }
interface Row { y: number; items: Tok[] }

const DATE = /^\d{1,2}[-./]\d{1,2}([-./]\d{2,4})?$/
const MONEY = /^[-+(]?\s*\d[\d.,\s]*\d\s*\)?$|^[-+]?\d$/
// A reference id / hash cell (e.g. CTT's "48bc52aabOGy3003") — never part of
// a human-readable description.
const IDLIKE = /^[0-9a-f]{6}[A-Za-z0-9]{4,}$/i
// Personal transactions are never in the millions — used to reject account
// numbers and other stray giant figures that slip past column detection.
const MAX_AMOUNT = 1_000_000

function pad(n: number) { return String(n).padStart(2, '0') }

// Cluster a page's text fragments into rows by y (small tolerance merges
// fragments whose baselines differ by a pixel or two), each sorted by x.
function clusterRows(items: Tok[]): Row[] {
  items.sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Row[] = []
  let cur: Row | null = null
  for (const it of items) {
    if (cur && Math.abs(cur.y - it.y) <= 4) cur.items.push(it)
    else { cur = { y: it.y, items: [it] }; rows.push(cur) }
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x)
  return rows
}

type Cols =
  | { kind: 'montante'; headerY: number; montX: number; saldoX: number }
  | { kind: 'debcred'; headerY: number; debX: number; credX: number; saldoX: number }

// Locate the transaction-table header on a page and the x of each money column.
function detectCols(rows: Row[]): Cols | null {
  for (const r of rows) {
    const txt = r.items.map((i) => i.s).join(' ').toLowerCase()
    if (/\bdebito\b/.test(txt) && /\bcredito\b/.test(txt)) {
      const d = r.items.find((i) => /debito/i.test(i.s))!
      const c = r.items.find((i) => /credito/i.test(i.s))!
      const sa = r.items.find((i) => /saldo/i.test(i.s))
      return { kind: 'debcred', headerY: r.y, debX: d.x, credX: c.x, saldoX: sa ? sa.x : c.x + 100 }
    }
    if (/\bmontante\b/.test(txt)) {
      const m = r.items.find((i) => /montante/i.test(i.s))!
      // The transaction "Saldo" sits to the right of Montante (the summary
      // box near the top also has a "Saldo" — ignore that one).
      let saldoX = m.x + 85
      for (const rr of rows) {
        const si = rr.items.find((i) => /^saldo$/i.test(i.s) && i.x > m.x)
        if (si) { saldoX = si.x; break }
      }
      return { kind: 'montante', headerY: r.y, montX: m.x, saldoX }
    }
  }
  return null
}

// A footer line that ends the transaction list (we stop reading at it).
const FOOTER = /saldo\s+(final|dispon|contabil|autoriz)/i

function extractPage(rows: Row[], cols: Cols, year: number, fallbackMonth: number): ParsedTransaction[] {
  const out: ParsedTransaction[] = []
  for (const r of rows) {
    if (r.y >= cols.headerY) continue // header and everything above it
    const joined = r.items.map((i) => i.s).join(' ')
    if (FOOTER.test(joined)) break
    const first = r.items[0]
    if (!first || !DATE.test(first.s)) continue // transaction rows start with a date

    // ── amount: money tokens classified by nearest money-column header ──
    let amount = 0
    let got = false
    for (const it of r.items) {
      if (it === first) continue
      if (!MONEY.test(it.s.trim())) continue
      const v = parseAmount(it.s)
      if (v === 0 || Math.abs(v) > MAX_AMOUNT) continue
      if (cols.kind === 'montante') {
        const dM = Math.abs(it.x - cols.montX)
        const dS = Math.abs(it.x - cols.saldoX)
        if (dM < dS && dM < 55) { amount = v; got = true }
      } else {
        const dD = Math.abs(it.x - cols.debX)
        const dC = Math.abs(it.x - cols.credX)
        const dS = Math.abs(it.x - cols.saldoX)
        const m = Math.min(dD, dC, dS)
        if (m > 55 || m === dS) continue // too far, or it's the balance column
        if (m === dD) { amount -= Math.abs(v); got = true }
        else { amount += Math.abs(v); got = true }
      }
    }
    if (!got || amount === 0) continue

    // ── description: text left of the amount column, minus dates and ids ──
    const amtX = cols.kind === 'montante' ? cols.montX : cols.debX
    let desc = r.items
      .filter((it) => it !== first && it.x < amtX - 5 && !MONEY.test(it.s.trim()) && !IDLIKE.test(it.s.trim()))
      .map((it) => it.s)
      .join(' ')
      .replace(/^\d{1,2}[-./]\d{1,2}([-./]\d{2,4})?\s+/, '') // strip a leading value-date
      .replace(/\s+[0-9a-f]{6,}[A-Za-z0-9]*$/i, '')          // strip a trailing ref hash
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!desc) desc = 'Transação'

    // ── date ──
    const iso = resolveDate(first.s, year, fallbackMonth)
    out.push({
      date: iso,
      ym: iso ? iso.slice(0, 7) : null,
      day: iso ? Number(iso.slice(8, 10)) : null,
      description: desc.slice(0, 80),
      amount,
    })
  }
  return out
}

// Full "DD-MM-YYYY" dates (CTT) parse directly. Short "M.DD"/"DD.MM" tokens
// (BCP) lack a year and are month/day-ambiguous, so we resolve them against the
// statement's year + month taken from its period header.
function resolveDate(token: string, year: number, fallbackMonth: number): string | null {
  if (/\d{1,2}[-./]\d{1,2}[-./]\d{2,4}/.test(token)) return parseDate(token)
  const m = token.match(/^(\d{1,2})[-./](\d{1,2})$/)
  if (!m) return parseDate(token)
  const a = Number(m[1])
  const b = Number(m[2])
  // Pick whichever part matches the statement month; the other is the day.
  let month = fallbackMonth
  let day = b
  if (a === fallbackMonth) { month = a; day = b }
  else if (b === fallbackMonth) { month = b; day = a }
  else if (a >= 1 && a <= 12) { month = a; day = b }
  if (day < 1 || day > 31) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

// Pull the statement's year and (first) month from a period header like
// "período entre 01-04-2026 e 30-04-2026" or "EXTRATO DE 2026/05/04 A ...".
function detectPeriod(allText: string): { year: number; month: number } {
  const now = new Date()
  let m = allText.match(/(\d{4})[-/.](\d{2})[-/.]\d{2}/)        // 2026/05/04
  if (m) return { year: Number(m[1]), month: Number(m[2]) }
  m = allText.match(/\d{2}[-/.](\d{2})[-/.](\d{4})/)            // 01-04-2026
  if (m) return { year: Number(m[2]), month: Number(m[1]) }
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export async function parsePdfStatement(file: File): Promise<ParsedTransaction[]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data: buf }).promise

  // First pass: gather all text to find the statement period.
  const pageRows: Row[][] = []
  let allText = ''
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent()
    const items: Tok[] = (tc.items as Array<{ str?: string; transform?: number[] }>)
      .filter((i): i is { str: string; transform: number[] } =>
        typeof i.str === 'string' && i.str.trim().length > 0 && Array.isArray(i.transform))
      .map((i) => ({ s: i.str.trim(), x: Math.round(i.transform[4]), y: Math.round(i.transform[5]) }))
    allText += ' ' + items.map((i) => i.s).join(' ')
    pageRows.push(clusterRows(items))
  }
  const { year, month } = detectPeriod(allText)

  const out: ParsedTransaction[] = []
  for (const rows of pageRows) {
    const cols = detectCols(rows)
    if (!cols) continue
    out.push(...extractPage(rows, cols, year, month))
  }
  return out
}
