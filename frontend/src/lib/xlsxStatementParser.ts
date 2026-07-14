// ── XLSX statement reader (minimal, dependency-light) ────────────────
// An .xlsx is a ZIP of XML parts, NOT text — reading it as CSV/Latin-1 (the
// old behaviour) produced mojibake and could even 500 the import when binary
// bytes reached Postgres. This reads the real cell values and hands back a
// string[][] grid, which the existing CSV column-mapping logic in
// statementParser.ts (`parseStatementRows`) turns into transactions — so bank
// XLSX exports (e.g. Banco CTT "Movimentos de Conta à Ordem") behave exactly
// like a CSV once decoded.
//
// Lazy-loaded (dynamic import) by ImportStatementModal so `fflate` stays out of
// the app's main chunk — same pattern as the pdf.js statement parser.
//
// Scope: `.xlsx` / `.xlsm` (Open XML, a ZIP). The legacy binary `.xls` (BIFF /
// OLE compound) is NOT a ZIP and is rejected upstream with a "export as
// xlsx/csv" hint rather than mis-parsed here.

import { unzipSync, strFromU8 } from 'fflate'

// XML entity decode. `&amp;` MUST be undone last so a literal "&amp;lt;" in the
// source doesn't get double-decoded into "<".
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}
function codePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

// Concatenate every <t> run inside a fragment (shared-string <si> or inline <is>
// may be split into several runs for rich text — we only want the plain text).
function collectText(fragment: string): string {
  let text = ''
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(fragment))) text += m[1]
  return decodeXml(text)
}

// xl/sharedStrings.xml → array of strings, indexed by shared-string id. Every
// <si> yields one entry (even empty ones) so indices stay aligned.
function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1] != null ? collectText(m[1]) : '')
  return out
}

// A cell's numeric value is a DATE only if its style's number format is a date
// format. Built-in date/time format ids per the OOXML spec, plus any custom
// format (id ≥ 164) whose format code contains a day or year token.
const BUILTIN_DATE_FMT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57])

function isDateFormatCode(code: string): boolean {
  // Drop quoted literals, [colour]/[condition] blocks and escaped chars, then
  // look for a day/year token (time-only formats like "hh:mm" have neither).
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
  return /[dyDY]/.test(stripped)
}

// Returns, per cellXfs style index, whether that style renders as a date.
function parseDateStyleFlags(xml: string): boolean[] {
  const customIsDate = new Map<number, boolean>()
  const numFmtRe = /<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="([^"]*)"[^>]*\/?>/g
  let nm: RegExpExecArray | null
  while ((nm = numFmtRe.exec(xml))) {
    customIsDate.set(parseInt(nm[1], 10), isDateFormatCode(decodeXml(nm[2])))
  }
  const flags: boolean[] = []
  const block = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (block) {
    const xfRe = /<xf\b[^>]*?>/g
    let xm: RegExpExecArray | null
    while ((xm = xfRe.exec(block[1]))) {
      const idM = xm[0].match(/\bnumFmtId="(\d+)"/)
      const id = idM ? parseInt(idM[1], 10) : 0
      flags.push(BUILTIN_DATE_FMT_IDS.has(id) || customIsDate.get(id) === true)
    }
  }
  return flags
}

// "A" → 0, "B" → 1, … "AA" → 26. Column letters from a cell ref like "C14".
function colToIndex(col: string): number {
  let n = 0
  for (let i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64)
  return n - 1
}

// Excel serial date → ISO "YYYY-MM-DD". 25569 = days between the Excel epoch
// (1899-12-30, which absorbs Excel's 1900-leap-year bug for real dates) and the
// Unix epoch. Fractional part (time of day) is dropped.
function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400_000)
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return String(serial)
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

const firstGroup = (s: string, re: RegExp): string | undefined => s.match(re)?.[1]

function parseSheet(xml: string, shared: string[], dateFlags: boolean[]): string[][] {
  const rows: string[][] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml))) {
    const inner = rm[1] ?? ''
    const cells: string[] = []
    // Each cell: <c r="A1" t="s" s="3"><v>..</v></c> or self-closing <c .../>.
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(inner))) {
      const attrs = cm[1]
      const body = cm[2] ?? ''
      const ref = firstGroup(attrs, /\br="([A-Z]+)\d+"/)
      const col = ref ? colToIndex(ref) : cells.length
      const type = firstGroup(attrs, /\bt="([^"]+)"/)
      let value = ''
      if (type === 's') {
        const vi = firstGroup(body, /<v>([\s\S]*?)<\/v>/)
        value = vi != null ? (shared[parseInt(vi, 10)] ?? '') : ''
      } else if (type === 'inlineStr') {
        value = collectText(body)
      } else if (type === 'str') {
        value = decodeXml(firstGroup(body, /<v>([\s\S]*?)<\/v>/) ?? '')
      } else if (type === 'b') {
        value = firstGroup(body, /<v>([\s\S]*?)<\/v>/) === '1' ? 'TRUE' : 'FALSE'
      } else if (type === 'e') {
        value = '' // error cell (#N/A, …) — treat as blank
      } else {
        // Default: numeric. Convert to a date string only when the style says so.
        const vi = firstGroup(body, /<v>([\s\S]*?)<\/v>/)
        if (vi != null && vi !== '') {
          const styleIdx = firstGroup(attrs, /\bs="(\d+)"/)
          const num = Number(vi)
          value = styleIdx != null && dateFlags[parseInt(styleIdx, 10)] && Number.isFinite(num)
            ? excelSerialToIso(num)
            : vi
        }
      }
      while (cells.length < col) cells.push('')
      cells[col] = value
    }
    rows.push(cells)
  }
  return rows
}

/**
 * Parse an .xlsx / .xlsm ArrayBuffer into a grid of cell strings (first sheet).
 * Throws if the buffer isn't a valid ZIP (e.g. a legacy .xls) — the caller
 * surfaces that as a friendly parse error.
 */
export function parseXlsxStatement(buf: ArrayBuffer): string[][] {
  // Only inflate the parts we read (skip embedded images/themes/etc.).
  const files = unzipSync(new Uint8Array(buf), {
    filter: (f) => /^xl\/(sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml)$/i.test(f.name),
  })
  const read = (path: string): string | null => {
    const hit = Object.keys(files).find((k) => k.toLowerCase() === path)
    return hit ? strFromU8(files[hit]) : null
  }

  const sharedXml = read('xl/sharedstrings.xml')
  const shared = sharedXml ? parseSharedStrings(sharedXml) : []
  const stylesXml = read('xl/styles.xml')
  const dateFlags = stylesXml ? parseDateStyleFlags(stylesXml) : []

  // First worksheet by numeric order (sheet1, sheet2, …).
  const sheetPath = Object.keys(files)
    .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(firstGroup(a, /sheet(\d+)\.xml/i) ?? 0)
      const nb = Number(firstGroup(b, /sheet(\d+)\.xml/i) ?? 0)
      return na - nb
    })[0]
  if (!sheetPath) return []
  return parseSheet(strFromU8(files[sheetPath]), shared, dateFlags)
}

export default parseXlsxStatement
