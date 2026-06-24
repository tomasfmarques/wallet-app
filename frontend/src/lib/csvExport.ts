// ── Client-side CSV export ───────────────────────────────────────
// Builds a CSV from rows already in the browser (no backend round-trip) and
// triggers a download. Opens cleanly in Excel/Sheets/Numbers.
//
// Security: CSV/Excel formula injection — a cell starting with = + - @ (or a
// tab/CR) can execute when opened in a spreadsheet. We neutralise those by
// prefixing a single quote, mirroring the backend `stripFormulaPrefix` guard.

export type CsvCell = string | number | null | undefined

function sanitizeCell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  let s = String(value)
  // Formula-injection guard: prefix a leading =, +, -, @, tab or CR with a quote.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  // CSV-escape: wrap in quotes if it contains a comma, quote, or newline.
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(sanitizeCell).join(','), ...rows.map((r) => r.map(sanitizeCell).join(','))]
  // CRLF + a UTF-8 BOM so Excel detects encoding and accents survive.
  return '﻿' + lines.join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Convenience: build + download in one call. */
export function exportCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  downloadCsv(filename, toCsv(headers, rows))
}
