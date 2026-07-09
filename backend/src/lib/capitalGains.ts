// ── IRS capital gains: FIFO realized-gains engine (WS6) ──────────
// Portuguese law mandates FIFO for securities disposals (CIRS art. 43.º/6-d:
// "os valores mobiliários alienados são os adquiridos há mais tempo"). One
// sale can consume multiple acquisition lots and therefore produce MULTIPLE
// rows — which is exactly the shape Anexo J (quadro 9.2A) wants: one row per
// acquisition-date/realization-date pair with EUR values. Anexo J is
// year+month granular, so `ym` precision is sufficient; `txnTime` orders
// transactions within a month.
//
// Pure module — no Prisma imports — so it is trivially unit-testable.

export interface GainTxn {
  side: string | null       // "buy" | "sell" (null = legacy dedup-only row)
  isin: string | null
  ticker: string | null
  qty: number | null
  totalEur: number | null
  ym: string | null         // "AAAA-MM"
  txnTime: string | null    // sortable broker timestamp
}

export interface RealizedGain {
  instrument: string        // isin ?? ticker (display resolves a name later)
  isin: string | null
  ticker: string | null
  acquiredYm: string | null // null on incomplete rows
  soldYm: string
  qty: number
  costEur: number
  proceedsEur: number
  gainEur: number
  // True when the sale (partially) had no matching buy in the data — the
  // position predates the imported history; the user must complete the
  // acquisition values by hand. costEur is 0 for the uncovered part.
  incomplete: boolean
}

interface Lot { ym: string | null; qty: number; unitCostEur: number }

const EPS = 1e-9

// Compute every realized gain, per instrument, in FIFO order. Callers filter
// by year afterwards (gains belong to the SALE's calendar year).
export function computeRealizedGains(txns: GainTxn[]): RealizedGain[] {
  // Usable rows only; group per instrument (isin preferred, ticker fallback).
  const groups = new Map<string, GainTxn[]>()
  for (const t of txns) {
    if (t.side !== 'buy' && t.side !== 'sell') continue
    // totalEur === 0 is intentionally NOT filtered: free-share promo buys
    // (T212 gives these) become zero-cost lots — their full proceeds are gain
    // on disposal. "Fixing" this to <= 0 would drop the lot and misclassify
    // the later sell as incomplete.
    if (!t.qty || t.qty <= 0 || t.totalEur === null || t.totalEur < 0) continue
    const key = (t.isin ?? t.ticker ?? '').toUpperCase()
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }

  const out: RealizedGain[] = []

  for (const [key, list] of groups) {
    // Chronological order: txnTime when present, else ym; stable for ties.
    list.sort((a, b) => (a.txnTime ?? a.ym ?? '').localeCompare(b.txnTime ?? b.ym ?? ''))

    const lots: Lot[] = []
    for (const t of list) {
      if (t.side === 'buy') {
        lots.push({ ym: t.ym, qty: t.qty!, unitCostEur: t.totalEur! / t.qty! })
        continue
      }
      // sell — consume lots FIFO; each consumed lot emits its own row.
      let remaining = t.qty!
      const unitProceeds = t.totalEur! / t.qty!
      const soldYm = t.ym ?? 'desconhecido'
      while (remaining > EPS && lots.length > 0) {
        const lot = lots[0]
        const take = Math.min(remaining, lot.qty)
        out.push({
          instrument: key,
          isin: t.isin,
          ticker: t.ticker,
          acquiredYm: lot.ym,
          soldYm,
          qty: take,
          costEur: take * lot.unitCostEur,
          proceedsEur: take * unitProceeds,
          gainEur: take * (unitProceeds - lot.unitCostEur),
          incomplete: false,
        })
        lot.qty -= take
        remaining -= take
        if (lot.qty <= EPS) lots.shift()
      }
      // Sold more than the imported buys cover → the position predates the
      // data. Emit an INCOMPLETE row with zero cost so the user sees it.
      if (remaining > EPS) {
        out.push({
          instrument: key,
          isin: t.isin,
          ticker: t.ticker,
          acquiredYm: null,
          soldYm,
          qty: remaining,
          costEur: 0,
          proceedsEur: remaining * unitProceeds,
          gainEur: remaining * unitProceeds,
          incomplete: true,
        })
      }
    }
  }

  return out
}

export interface GainsReport {
  year: number
  rows: RealizedGain[]
  totals: { proceeds: number; cost: number; gain: number }
  // 28 % autonomous rate on a positive net gain (Portugal; englobamento is the
  // user's optional alternative — surfaced in the UI disclaimer, not computed).
  estimatedTax: number
  incompleteCount: number
  // Every year that has at least one sale — drives the UI's year selector.
  availableYears: number[]
}

export function buildGainsReport(txns: GainTxn[], year: number): GainsReport {
  const all = computeRealizedGains(txns)
  const availableYears = [...new Set(all.map((r) => Number(r.soldYm.slice(0, 4))).filter((y) => Number.isFinite(y)))]
    .sort((a, b) => b - a)
  const rows = all.filter((r) => r.soldYm.startsWith(`${year}-`))
  const totals = rows.reduce(
    (acc, r) => ({ proceeds: acc.proceeds + r.proceedsEur, cost: acc.cost + r.costEur, gain: acc.gain + r.gainEur }),
    { proceeds: 0, cost: 0, gain: 0 },
  )
  return {
    year,
    rows,
    totals,
    estimatedTax: totals.gain > 0 ? totals.gain * 0.28 : 0,
    incompleteCount: rows.filter((r) => r.incomplete).length,
    availableYears,
  }
}
