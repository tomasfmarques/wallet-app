import { searchTickers } from './yahooFinance'
import { convertPrice } from './fx'

// ── Trading 212 Public API client ────────────────────────────────
// Read-only: validate a key, pull open positions + instrument metadata, and map
// them into Wallet360 portfolio-import items (ISIN→Yahoo symbol + EUR), reusing
// the same import pipeline as the CSV importer.
//
// Auth model is in flux (older docs: a single key in `Authorization`; current:
// a key + secret pair). We resolve it empirically: try the key, then the secret,
// against /equity/account/info and use whichever authenticates. Build the header
// behind this one adapter so it's trivial to adjust once confirmed live.
//
// Rate limits are per-account and strict, so: instruments metadata is cached 24h
// (it's a large, slow-changing list), and sync is on-demand only (never polled).

export type T212Env = 'live' | 'demo'
export interface T212Creds { key: string; secret: string | null; env: T212Env }

const BASE: Record<T212Env, string> = {
  live: 'https://live.trading212.com/api/v0',
  demo: 'https://demo.trading212.com/api/v0',
}

export class T212Error extends Error {
  constructor(public status: number, msg?: string) { super(msg ?? `Trading212 API ${status}`) }
}

interface T212Position { ticker?: string; quantity?: number; averagePrice?: number; currentPrice?: number }
interface T212Instrument { ticker?: string; isin?: string; name?: string; shortName?: string; currencyCode?: string; type?: string }

export interface BrokerImportItem {
  name: string; ticker: string; isin: string | null
  qty: number; invested: number; value: number
}

async function get<T>(base: string, path: string, auth: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: auth } })
  if (!res.ok) throw new T212Error(res.status)
  return await res.json() as T
}

// Try the key, then the secret, against account/info. Returns the working auth
// header value + the account currency. Throws T212Error on auth/other failure.
async function resolveAuth(creds: T212Creds): Promise<{ auth: string; accountCcy: string | null }> {
  const base = BASE[creds.env]
  // The auth header form isn't pinned down (raw key vs key+secret vs Bearer), so
  // try the plausible variants and use whichever authenticates. On a valid key
  // the first match returns immediately; only a wrong key pays for extra tries.
  const candidates = [
    creds.key, `Bearer ${creds.key}`,
    ...(creds.secret ? [creds.secret, `Bearer ${creds.secret}`] : []),
  ].filter((x) => x.length > 0)
  let lastStatus = 0
  for (const auth of candidates) {
    let res: Response
    try {
      res = await fetch(`${base}/equity/account/info`, { headers: { Authorization: auth } })
    } catch {
      throw new T212Error(0, 'network')
    }
    if (res.ok) {
      const j = await res.json().catch(() => ({})) as { currencyCode?: unknown }
      return { auth, accountCcy: typeof j.currencyCode === 'string' ? j.currencyCode : null }
    }
    lastStatus = res.status
    // 401/403 → wrong credential, try the next candidate. Anything else → stop.
    if (res.status !== 401 && res.status !== 403) break
  }
  throw new T212Error(lastStatus || 0)
}

// Instruments metadata is account-agnostic but DIFFERS between live and demo, so
// cache per base URL (24h) — never let a demo list map live tickers or vice-versa.
const instCache = new Map<string, { data: T212Instrument[]; expiry: number }>()
async function getInstruments(base: string, auth: string): Promise<T212Instrument[]> {
  const hit = instCache.get(base)
  if (hit && hit.expiry > Date.now()) return hit.data
  const data = await get<T212Instrument[]>(base, '/equity/metadata/instruments', auth)
  instCache.set(base, { data, expiry: Date.now() + 24 * 60 * 60 * 1000 })
  return data
}

// EUR amount, or null when FX is unavailable — the caller then SKIPS the position
// rather than storing a native-currency figure in a EUR column.
async function toEur(amount: number, ccy: string): Promise<number | null> {
  if (!Number.isFinite(amount)) return 0
  if (ccy === 'EUR') return Math.round(amount * 100) / 100
  const conv = await convertPrice(amount, ccy, 'EUR')
  return conv ? Math.round(conv.price * 100) / 100 : null
}

function cleanTicker(t212Ticker: string): string {
  return t212Ticker.split('_')[0].toUpperCase().replace(/[^A-Z0-9.\-]/g, '')
}

// Validate a key (used on connect). Returns the account currency if valid.
export async function validateT212(creds: T212Creds): Promise<{ accountCcy: string | null }> {
  const { accountCcy } = await resolveAuth(creds)
  return { accountCcy }
}

// Pull open positions and map them to portfolio-import items.
export async function fetchT212ImportItems(creds: T212Creds): Promise<BrokerImportItem[]> {
  const base = BASE[creds.env]
  const { auth } = await resolveAuth(creds)
  const positions = await get<T212Position[]>(base, '/equity/portfolio', auth)
  const instruments = await getInstruments(base, auth).catch(() => [] as T212Instrument[])
  const byTicker = new Map(instruments.filter((i) => i.ticker).map((i) => [i.ticker as string, i]))

  async function mapPosition(p: T212Position): Promise<BrokerImportItem | null> {
    const qty = Number(p.quantity)
    if (!p.ticker || !Number.isFinite(qty) || qty <= 0) return null
    const inst = byTicker.get(p.ticker)
    const isin = inst?.isin && /^[A-Z0-9]{12}$/.test(inst.isin.toUpperCase()) ? inst.isin.toUpperCase() : null
    const name = (inst?.name || inst?.shortName || cleanTicker(p.ticker)).slice(0, 80)
    const ccy = inst?.currencyCode || 'EUR'

    const invested = await toEur(qty * Number(p.averagePrice ?? 0), ccy)
    const value = await toEur(qty * Number(p.currentPrice ?? p.averagePrice ?? 0), ccy)
    if (invested === null || value === null) return null // FX unavailable → skip (no wrong EUR figure)

    // Resolve a Yahoo-usable ticker from the ISIN (same bridge as the CSV import);
    // fall back to the cleaned T212 ticker so a position is never dropped.
    let ticker = cleanTicker(p.ticker)
    if (isin) {
      try {
        const results = await searchTickers(isin)
        const hit = results.find((r) => r.type !== 'CURRENCY') ?? results[0]
        if (hit?.symbol) ticker = hit.symbol.toUpperCase()
      } catch { /* keep the fallback */ }
    }
    return { name, ticker, isin, qty: Math.round(qty * 1e8) / 1e8, invested, value }
  }

  // Map in small concurrent batches so a large portfolio doesn't serialise dozens
  // of Yahoo/FX lookups into a serverless-timeout-busting request.
  const all = (positions ?? []).slice(0, 500)
  const items: BrokerImportItem[] = []
  const CHUNK = 8
  for (let i = 0; i < all.length; i += CHUNK) {
    const mapped = await Promise.all(all.slice(i, i + CHUNK).map(mapPosition))
    for (const m of mapped) if (m) items.push(m)
  }
  return items
}
