import i18n from '@/i18n'

// ── Locale-aware formatting ──────────────────────────────────────
// Numbers/dates follow the active app language: English → en-IE
// ("€1,234.56"), Portuguese → pt-PT ("1.234,56 €"). Currency is EUR always.
// Formatters are memoized per locale so we don't rebuild them on every call.

function getLang(): 'pt' | 'en' {
  return (i18n.language || 'pt').startsWith('en') ? 'en' : 'pt'
}
function getLocale(): string {
  return getLang() === 'en' ? 'en-IE' : 'pt-PT'
}

function memo<T>(make: (locale: string) => T): () => T {
  const cache = new Map<string, T>()
  return () => {
    const loc = getLocale()
    let hit = cache.get(loc)
    if (!hit) { hit = make(loc); cache.set(loc, hit) }
    return hit
  }
}

const eurFmt = memo((locale) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}))
const eur2Fmt = memo((locale) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2,
}))
const pctFmt = memo((locale) => new Intl.NumberFormat(locale, {
  style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
}))

// Plain decimal formatter for the compact (k/M) helper, keyed by fraction digits.
const decFmtCache = new Map<string, Intl.NumberFormat>()
function decFmt(fractionDigits: number): Intl.NumberFormat {
  const key = `${getLocale()}:${fractionDigits}`
  let hit = decFmtCache.get(key)
  if (!hit) {
    hit = new Intl.NumberFormat(getLocale(), {
      minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
    })
    decFmtCache.set(key, hit)
  }
  return hit
}

const MONTHS_LONG: Record<'pt' | 'en', string[]> = {
  pt: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  en: ['January', 'February', 'March', 'April', 'May', 'June',
       'July', 'August', 'September', 'October', 'November', 'December'],
}
const MONTHS_SHORT: Record<'pt' | 'en', string[]> = {
  pt: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

export const eur = (n: number) => eurFmt().format(n)
export const eur2 = (n: number) => eur2Fmt().format(n)
export const pct = (n: number) => pctFmt().format(n)

/** The active Intl locale tag ('en-IE' | 'pt-PT') — for ad-hoc Intl callers. */
export const localeTag = (): string => getLocale()

/** Locale-aware plain number (e.g. share quantities). */
export function num(n: number, maxFractionDigits = 4): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: maxFractionDigits }).format(n)
}

export function pctSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  const abs = pctFmt().format(Math.abs(n))
  return sign + abs
}

export function eurSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return sign + eurFmt().format(Math.abs(n))
}

export function eurCompact(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}${decFmt(1).format(abs / 1_000_000)}M €`
  if (abs >= 1_000)     return `${sign}${decFmt(0).format(abs / 1_000)}k €`
  return `${sign}${decFmt(0).format(abs)} €`
}

export function ymToLong(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_LONG[getLang()][m - 1]} ${y}`
}

export function ymToShort(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_SHORT[getLang()][m - 1]} ${y}`
}

export function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}

export function ymYearsDiff(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number)
  const [by, bm] = b.split('-').map(Number)
  return Math.round(((by - ay) * 12 + (bm - am)) / 12)
}

export function ymAddMonths(ym: string, months: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = (y * 12 + (m - 1)) + months
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${nm.toString().padStart(2, '0')}`
}
