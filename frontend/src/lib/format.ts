// ── Number / date formatters ─────────────────────────────────────

const eurFmt = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const eur2Fmt = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const pctFmt = new Intl.NumberFormat('pt-PT', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const monthShort = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

/** "1 234 €"  (no decimals) */
export const eur = (n: number) => eurFmt.format(n)

/** "1 234,56 €" */
export const eur2 = (n: number) => eur2Fmt.format(n)

/** "3,7 %" */
export const pct = (n: number) => pctFmt.format(n)

/** "+3,7 %" / "−3,7 %" — includes sign */
export function pctSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const abs = pctFmt.format(Math.abs(n))
  return sign + abs
}

/** "+1 234 €" / "−1 234 €" */
export function eurSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return sign + eurFmt.format(Math.abs(n))
}

/** Compact: "4,0M €" / "850k €" / "120 €" */
export function eurCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace('.', ',')}M €`
  if (abs >= 1_000)     return `${sign}${(abs / 1_000).toFixed(0)}k €`
  return `${sign}${abs.toFixed(0)} €`
}

/** "AAAA-MM" → "Maio 2026" */
export function ymToLong(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${monthNames[m - 1]} ${y}`
}

/** "AAAA-MM" → "Mai 2026" */
export function ymToShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${monthShort[m - 1]} ${y}`
}

/** Current YM in UTC */
export function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}

/** Difference in whole years between two YMs */
export function ymYearsDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return Math.round(((by - ay) * 12 + (bm - am)) / 12)
}
