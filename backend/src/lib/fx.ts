// ── FX rates ─────────────────────────────────────────────────────
// Frankfurter (https://www.frankfurter.app/) — free, no API key, ECB-sourced.
// Used to convert market prices from the asset's native currency (e.g. USD,
// KRW) to the portfolio currency (EUR) when refreshing asset values.
//
// Supports the ECB's reference currencies: USD, GBP, JPY, KRW, CHF, etc.
// Cache TTL = 1 hour; ECB updates daily.

interface FrankfurterResponse {
  amount?: number
  base?: string
  date?: string
  rates?: Record<string, number>
}

interface CacheEntry { rate: number; expiry: number }
const cache = new Map<string, CacheEntry>()
const TTL_MS = 60 * 60 * 1000

const FRANKFURTER = 'https://api.frankfurter.app/latest'

/**
 * Normalize Yahoo's subunit currencies (GBp = pence) into the parent
 * currency, dividing the price accordingly. Returns the canonical currency
 * code and the price already converted into that currency's main unit.
 */
function normalizeSubunit(currency: string, price: number): { currency: string; price: number } {
  const c = currency.toUpperCase()
  if (c === 'GBP' && currency === 'GBp')   return { currency: 'GBP', price: price / 100 }
  if (currency === 'GBp' || currency === 'GBX') return { currency: 'GBP', price: price / 100 }
  if (currency === 'ZAc')                   return { currency: 'ZAR', price: price / 100 }
  if (currency === 'ILA')                   return { currency: 'ILS', price: price / 100 }
  return { currency, price }
}

/**
 * Get the conversion rate FROM → TO. Returns null if the FX provider can't
 * answer (e.g. unsupported currency). Returns 1 for same-currency.
 */
async function getFxRate(from: string, to: string): Promise<number | null> {
  const f = from.toUpperCase()
  const t = to.toUpperCase()
  if (f === t) return 1

  const key = `${f}_${t}`
  const hit = cache.get(key)
  if (hit && hit.expiry > Date.now()) return hit.rate

  const url = `${FRANKFURTER}?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'WalletApp/1.0' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as FrankfurterResponse
    const rate = json.rates?.[t]
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return null
    cache.set(key, { rate, expiry: Date.now() + TTL_MS })
    return rate
  } catch {
    return null
  }
}

/**
 * Convert a price+currency into a target currency. Returns null if the FX
 * lookup fails. Handles subunit normalization (e.g. GBp → GBP / 100).
 */
export async function convertPrice(
  price: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<{ price: number; rate: number; from: string; to: string } | null> {
  const norm = normalizeSubunit(fromCurrency, price)
  const rate = await getFxRate(norm.currency, toCurrency)
  if (rate === null) return null
  return {
    price: norm.price * rate,
    rate,
    from: norm.currency,
    to: toCurrency,
  }
}
