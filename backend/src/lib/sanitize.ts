// ── Text sanitisation ────────────────────────────────────────────
// Free-text names (merchants, loan/asset labels) are user-supplied and may end
// up in an exported CSV/XLSX one day. A cell whose value begins with = + - @ (or
// a leading tab/CR that shifts the first cell) is a classic spreadsheet
// formula-injection payload: opening the export in Excel/Sheets executes it.
// React escapes these on render (so there's no DOM XSS today), but we neutralise
// at the write boundary so the stored data is safe regardless of where it's later
// surfaced. See PUBLIC-LAUNCH-PLAN.md finding F5.

const FORMULA_PREFIX = /^[=+\-@\t\r]+/

/**
 * Strip leading formula-trigger characters and surrounding whitespace.
 * Idempotent and safe on normal merchant names (which don't start with these).
 * Returns a trimmed string; callers still enforce their own length limits.
 */
export function stripFormulaPrefix(s: string): string {
  return s.replace(FORMULA_PREFIX, '').trim()
}

// Control characters (C0 range 0x00-0x1F incl. the NUL byte, plus DEL + C1
// 0x7F-0x9F) that a Postgres `text` column rejects outright — a malformed or
// binary import (e.g. an .xlsx accidentally read as text) could otherwise carry
// raw bytes into a name and crash the whole insert. Built via `new RegExp` from
// a plain string so no literal control byte ever lives in this source file.
// Defence in depth at the write boundary; normal input is unaffected.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g')

export function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS, '')
}
