// ── Bank statement parser ────────────────────────────────────────
// Parses a bank statement exported as CSV or OFX into a normalized list of
// transactions. The heuristics target Portuguese banks (CGD, BCP, Novo Banco,
// BPI, Santander, Millennium, ActivoBank…) which vary in:
//   • delimiter:     ';' (most common in PT), ',' or tab
//   • number format: European "1.234,56" vs. "1234.56"
//   • amount layout: a single signed column, OR separate débito/crédito columns
//   • date format:   DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD
//
// Parsing is best-effort: anything ambiguous is surfaced in the review table
// where the user corrects it before importing. We never silently drop a row —
// unparseable amounts come through as 0 so the user can see and fix them.

export interface ParsedTransaction {
  /** ISO date (YYYY-MM-DD) if we could parse one, else null. */
  date: string | null
  /** Year-month (YYYY-MM) derived from `date`, else null. */
  ym: string | null
  /** Day of month (1-31) derived from `date`, else null. */
  day: number | null
  /** Cleaned-up description / counterparty. */
  description: string
  /** Signed amount: positive = credit (income), negative = debit (expense). */
  amount: number
}

// ── Number parsing ───────────────────────────────────────────────
// Handles "1.234,56", "1234.56", "-45,00", "(45,00)", "45,00 EUR", "1 234,56".
export function parseAmount(raw: string): number {
  if (!raw) return 0
  let s = raw.trim()
  if (!s) return 0

  // Parentheses denote a negative (accounting style)
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }

  // Strip currency symbols, letters, spaces and NBSP — keep digits/sep/sign
  s = s.replace(/[^\d.,\-+]/g, '')
  if (s.includes('-')) negative = true
  s = s.replace(/[+\-]/g, '')
  if (!s) return 0

  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')

  if (lastComma !== -1 && lastDot !== -1) {
    // Both separators present → the rightmost is the decimal separator,
    // the other is the thousands separator (remove it).
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (lastComma !== -1) {
    // Only commas. Decimal if it's followed by exactly 1-2 digits; otherwise
    // treat as a thousands separator.
    const after = s.length - lastComma - 1
    s = after <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (lastDot !== -1) {
    // Only dots. Decimal if followed by exactly 1-2 digits; if exactly 3,
    // it's almost certainly a thousands separator ("1.234").
    const after = s.length - lastDot - 1
    if (after === 3) s = s.replace(/\./g, '')
    // else leave the dot as the decimal point
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return 0
  return negative ? -n : n
}

// ── Date parsing ─────────────────────────────────────────────────
function pad(n: number): string { return String(n).padStart(2, '0') }

export function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()

  // ISO: YYYY-MM-DD (or YYYY/MM/DD)
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${pad(+mo)}-${pad(+d)}`
  }

  // DD-MM-YYYY (day first — PT convention)
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) {
    const [, d, mo, y] = m
    return `${y}-${pad(+mo)}-${pad(+d)}`
  }

  // DD-MM-YY → assume 20YY
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/)
  if (m) {
    const [, d, mo, y] = m
    return `20${y}-${pad(+mo)}-${pad(+d)}`
  }

  // OFX compact: YYYYMMDD (optionally followed by time)
  m = s.match(/^(\d{4})(\d{2})(\d{2})/)
  if (m) {
    const [, y, mo, d] = m
    return `${y}-${mo}-${d}`
  }

  return null
}

function toYm(isoDate: string | null): string | null {
  return isoDate ? isoDate.slice(0, 7) : null
}

function toDay(isoDate: string | null): number | null {
  if (!isoDate) return null
  const d = Number(isoDate.slice(8, 10))
  return Number.isInteger(d) && d >= 1 && d <= 31 ? d : null
}

// ── CSV: delimiter detection + line splitting ────────────────────
function detectDelimiter(lines: string[]): string {
  const candidates = [';', '\t', ',']
  let best = ';'
  let bestScore = -1
  for (const d of candidates) {
    // Score = how consistently each line splits into the same column count
    const counts = lines.slice(0, 10).map((l) => l.split(d).length)
    const max = Math.max(...counts)
    if (max <= 1) continue
    const consistent = counts.filter((c) => c === max).length
    const score = max * 100 + consistent
    if (score > bestScore) { bestScore = score; best = d }
  }
  return best
}

// Split one CSV line respecting double-quoted fields.
function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === delim && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim().replace(/^"|"$/g, ''))
}

// ── Column identification ────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function findHeaderRow(rows: string[][]): number {
  // The header is the first row whose cells contain known keywords.
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const joined = norm(rows[i].join(' '))
    if (/data|date/.test(joined) && /(montante|valor|amount|import|debito|credito|debit|credit|saldo)/.test(joined)) {
      return i
    }
  }
  return -1
}

interface ColMap {
  date: number
  desc: number
  amount: number
  debit: number
  credit: number
}

function mapColumns(header: string[]): ColMap {
  const map: ColMap = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1 }
  // One role per column, first match wins. Crucially, any column that looks
  // like a date is consumed as such and never reaches the amount/desc checks —
  // otherwise "Data valor" (value date) collides with the amount keyword
  // "valor", and "Data movimento" collides with the desc keyword "movimento".
  header.forEach((hRaw, i) => {
    const h = norm(hRaw)
    if (/data|date|\bdt\b/.test(h)) {
      if (map.date === -1) map.date = i
      return
    }
    if (/saldo|balance/.test(h)) return // balance column — never an amount
    if (map.debit === -1 && /(debito|debit|saida|levantamento)/.test(h)) { map.debit = i; return }
    if (map.credit === -1 && /(credito|credit|entrada|deposito)/.test(h)) { map.credit = i; return }
    if (map.amount === -1 && /(montante|valor|amount|import)/.test(h)) { map.amount = i; return }
    if (map.desc === -1 && /(descri|movimento|historic|narrativa|memo|detalhe|operac|referencia)/.test(h)) { map.desc = i }
  })
  return map
}

function parseCsv(text: string): ParsedTransaction[] {
  const rawLines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0)
  if (rawLines.length === 0) return []

  const delim = detectDelimiter(rawLines)
  const rows = rawLines.map((l) => splitCsvLine(l, delim))

  const headerIdx = findHeaderRow(rows)
  let cols: ColMap
  let dataRows: string[][]

  if (headerIdx !== -1) {
    cols = mapColumns(rows[headerIdx])
    dataRows = rows.slice(headerIdx + 1)
  } else {
    // No recognizable header — guess positionally: first col date, last
    // numeric-looking col amount, the widest text col description.
    cols = { date: 0, desc: 1, amount: rows[0].length - 1, debit: -1, credit: -1 }
    dataRows = rows
  }

  const out: ParsedTransaction[] = []
  for (const r of dataRows) {
    if (r.length === 0 || r.every((c) => !c)) continue

    const dateStr = cols.date >= 0 ? r[cols.date] ?? '' : ''
    const date = parseDate(dateStr)

    let amount = 0
    if (cols.debit >= 0 || cols.credit >= 0) {
      const debit = cols.debit >= 0 ? Math.abs(parseAmount(r[cols.debit] ?? '')) : 0
      const credit = cols.credit >= 0 ? Math.abs(parseAmount(r[cols.credit] ?? '')) : 0
      amount = credit - debit
    } else if (cols.amount >= 0) {
      amount = parseAmount(r[cols.amount] ?? '')
    }

    let description = cols.desc >= 0 ? (r[cols.desc] ?? '') : ''
    if (!description) {
      // Fall back to the longest non-date, non-amount cell
      description = r
        .filter((_, i) => i !== cols.date && i !== cols.amount && i !== cols.debit && i !== cols.credit)
        .sort((a, b) => b.length - a.length)[0] ?? ''
    }
    description = description.trim() || 'Transação'

    // Skip rows that are clearly not transactions (no date AND no amount)
    if (!date && amount === 0) continue

    out.push({ date, ym: toYm(date), day: toDay(date), description, amount })
  }
  return out
}

// ── OFX parsing ──────────────────────────────────────────────────
function ofxField(block: string, tag: string): string {
  // OFX leaf tags are often unclosed: "<TRNAMT>-12.34\n". Capture up to the
  // next '<' or newline. Also handles properly-closed "<TAG>v</TAG>".
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : ''
}

function parseOfx(text: string): ParsedTransaction[] {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi)
    ?? text.split(/<STMTTRN>/i).slice(1).map((b) => '<STMTTRN>' + b)
  if (!blocks) return []

  const out: ParsedTransaction[] = []
  for (const b of blocks) {
    const amount = parseAmount(ofxField(b, 'TRNAMT'))
    const date = parseDate(ofxField(b, 'DTPOSTED'))
    const name = ofxField(b, 'NAME')
    const memo = ofxField(b, 'MEMO')
    const description = [name, memo].filter(Boolean).join(' — ') || 'Transação'
    if (!date && amount === 0) continue
    out.push({ date, ym: toYm(date), day: toDay(date), description, amount })
  }
  return out
}

// ── Duplicate signature ──────────────────────────────────────────
// A stable fingerprint for a transaction so we can detect re-imports of the
// same statement. Must stay byte-for-byte identical to the backend copy in
// `backend/src/routes/budget.ts` (`dupSignature`). Keyed on kind + month +
// day + amount (2dp) + normalized description. Including the day means two
// same-amount transactions on different days are treated as distinct.
export function dupSignature(
  kind: 'income' | 'expense',
  name: string,
  amount: number,
  ym: string,
  day: number | null,
): string {
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  const dd = day != null ? String(day).padStart(2, '0') : '00'
  return `${kind}|${ym}|${dd}|${amount.toFixed(2)}|${n}`
}

// ── Public entry point ───────────────────────────────────────────
export function parseStatement(text: string, filename: string): ParsedTransaction[] {
  const looksOfx = /<OFX>|<STMTTRN>/i.test(text) || /\.ofx$/i.test(filename)
  const txns = looksOfx ? parseOfx(text) : parseCsv(text)
  // Drop zero-amount noise lines but keep everything the user might want
  return txns.filter((t) => t.amount !== 0 || t.date !== null)
}
