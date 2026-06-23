// ── Trading212 CSV parser ────────────────────────────────────────
// Parses a Trading212 "transactions" CSV export (Settings → History → Export)
// and aggregates the order ledger into current net positions, so a portfolio
// snapshot can be imported into Wallet360.
//
// Trading212 has no "holdings" export — only a transaction history — and each
// export is capped at one calendar year. So we parse the ledger, keep buy/sell
// orders, and aggregate per ISIN with the **average-cost** method:
//   • buy : qty += shares; costBasis += total(€)
//   • sell: costBasis -= avgCost × sharesSold; qty -= sharesSold
// `invested` is the cost basis of the *remaining* shares. Dividends, deposits,
// interest, currency conversions, etc. are ignored (not positions).
//
// Multiple files (several years) merge correctly: parse each into transactions,
// concatenate, then aggregate once.
//
// Known limitations (surfaced in the review table, where everything is editable):
//   • `total` is taken in the account currency (EUR for EU accounts). A non-EUR
//     account would need FX we don't apply here.
//   • Stock splits aren't represented in the export — a split position's qty may
//     need a manual fix.

import { parseAmount, parseDate } from './statementParser'

export interface T212Transaction {
  side: 'buy' | 'sell'
  isin: string | null
  ticker: string       // the CSV "Ticker" column (usually the plain exchange ticker)
  name: string
  shares: number
  total: number        // absolute account-currency total (cost for buy, proceeds for sell)
  ym: string | null    // YYYY-MM of the transaction
  time: string         // raw "Time" cell — sortable so average-cost stays chronological
}

export interface T212Position {
  isin: string | null
  t212Ticker: string         // raw ticker from the export
  guessTicker: string        // best-effort Yahoo ticker before ISIN resolution
  name: string
  qty: number                // net remaining shares
  invested: number           // EUR cost basis of the remaining shares
  flows: { ym: string; amount: number }[]  // monthly buy contributions
}

// ── CSV helpers ──────────────────────────────────────────────────
// Quote-aware split of one comma-delimited line (T212 uses ',' with quoted
// fields, since security names contain commas).
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim().replace(/^"|"$/g, ''))
}

const norm = (s: string) => s.trim().toLowerCase()
const ISIN_RE = /^[A-Z0-9]{12}$/

// ── Naive Yahoo-ticker guess (refined later via ISIN search) ─────
function guessYahooTicker(ticker: string): string {
  // The CSV "Ticker" is usually the plain exchange ticker (AAPL, TSLA, VUAA).
  // Strip any Trading212-style suffix (AAPL_US_EQ → AAPL) and tidy to A-Z0-9.-.
  const base = ticker.split('_')[0].toUpperCase().replace(/[^A-Z0-9.\-]/g, '')
  return base
}

// ── Parse one export's text → buy/sell transactions ──────────────
export function parseT212Transactions(text: string): T212Transaction[] {
  const lines = text.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const header = splitCsvLine(lines[0]).map(norm)
  const find = (pred: (h: string) => boolean) => header.findIndex(pred)
  const col = {
    action: find((h) => h === 'action'),
    isin:   find((h) => h === 'isin'),
    ticker: find((h) => h === 'ticker'),
    name:   find((h) => h === 'name'),
    shares: find((h) => h.includes('shares') || h.includes('quantity')),
    price:  find((h) => h.includes('price') && h.includes('share')),
    total:  find((h) => h === 'total'),
    time:   find((h) => h === 'time'),
  }
  // Not a Trading212 export if the key columns are missing.
  if (col.action === -1 || col.shares === -1) return []

  const at = (row: string[], i: number) => (i >= 0 && i < row.length ? row[i] : '')

  const txns: T212Transaction[] = []
  for (let r = 1; r < lines.length; r++) {
    const row = splitCsvLine(lines[r])
    const action = norm(at(row, col.action))
    const side: 'buy' | 'sell' | null =
      action.includes('buy') ? 'buy' : action.includes('sell') ? 'sell' : null
    if (!side) continue // dividends, deposits, interest, conversions, etc.

    const shares = Math.abs(parseAmount(at(row, col.shares)))
    if (!shares) continue

    // Prefer the account-currency Total; fall back to shares × price/share.
    let total = Math.abs(parseAmount(at(row, col.total)))
    if (!total && col.price >= 0) total = shares * Math.abs(parseAmount(at(row, col.price)))
    if (!total) continue // can't determine cost/proceeds → skip (don't corrupt the avg cost)

    const time = at(row, col.time)
    const date = parseDate(time)
    const isinRaw = at(row, col.isin).toUpperCase()
    txns.push({
      side,
      isin: ISIN_RE.test(isinRaw) ? isinRaw : null,
      ticker: at(row, col.ticker),
      name: at(row, col.name) || at(row, col.ticker) || 'Ativo',
      shares,
      total,
      ym: date ? date.slice(0, 7) : null,
      time,
    })
  }
  return txns
}

// ── Aggregate transactions → net positions (average cost) ────────
export function aggregatePositions(txns: T212Transaction[]): T212Position[] {
  interface Acc {
    isin: string | null; ticker: string; name: string
    qty: number; cost: number; flows: Map<string, number>
  }
  const accs = new Map<string, Acc>()
  const keyOf = (t: T212Transaction) => t.isin ?? `TK:${t.ticker.toUpperCase()}`

  // Average cost requires chronological order; merging several yearly exports
  // (parsed concurrently) can arrive unsorted, so sort before accumulating.
  const ordered = [...txns].sort((a, b) => (a.time || '9999').localeCompare(b.time || '9999'))
  for (const t of ordered) {
    const key = keyOf(t)
    let a = accs.get(key)
    if (!a) {
      a = { isin: t.isin, ticker: t.ticker, name: t.name, qty: 0, cost: 0, flows: new Map() }
      accs.set(key, a)
    }
    // Keep the most descriptive name/ticker seen.
    if (t.name && t.name.length > a.name.length) a.name = t.name
    if (t.ticker) a.ticker = t.ticker

    if (t.side === 'buy') {
      a.qty += t.shares
      a.cost += t.total
      if (t.ym) a.flows.set(t.ym, (a.flows.get(t.ym) ?? 0) + t.total)
    } else {
      // Sell reduces the cost basis at the running average cost.
      if (a.qty > 0) {
        const avg = a.cost / a.qty
        const sold = Math.min(t.shares, a.qty)
        a.cost -= avg * sold
        a.qty -= sold
      }
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  const positions: T212Position[] = []
  for (const a of accs.values()) {
    if (a.qty <= 1e-6) continue // fully closed
    positions.push({
      isin: a.isin,
      t212Ticker: a.ticker,
      guessTicker: guessYahooTicker(a.ticker),
      name: a.name.slice(0, 80),
      qty: round2(a.qty),
      invested: Math.max(0, round2(a.cost)),
      flows: [...a.flows.entries()]
        .map(([ym, amount]) => ({ ym, amount: round2(amount) }))
        .sort((x, y) => x.ym.localeCompare(y.ym)),
    })
  }
  // Largest holdings first.
  return positions.sort((x, y) => y.invested - x.invested)
}
