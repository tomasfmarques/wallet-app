import { prisma } from './prisma'
import { computeSchedule, type LoanInput } from './loanEngine'

// ── Auto-Euribor ─────────────────────────────────────────────────
// Source: the ECB Data Portal's Euribor MONTHLY AVERAGES (dataset FM, keys
// EURIBOR{3M,6M}D_/EURIBOR1YD_, data type HSTA = "average of observations
// through period"). Chosen over daily EMMI fixings because (a) it's official
// and free with no API key, and (b) PT mortgage revisions are contractually
// indexed to the PREVIOUS MONTH'S MONTHLY AVERAGE — this series IS the number
// the bank will use. Values are stored in PERCENT (e.g. 2.5955); divide by 100
// before feeding the loan engine (fraction convention).

export type EuriborTenor = '3m' | '6m' | '12m'

const ECB_SERIES: Record<EuriborTenor, string> = {
  '3m': 'M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA',
  '6m': 'M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA',
  '12m': 'M.U2.EUR.RT.MM.EURIBOR1YD_.HSTA',
}

const YM_RE = /^\d{4}-\d{2}$/

export function isEuriborTenor(v: unknown): v is EuriborTenor {
  return v === '3m' || v === '6m' || v === '12m'
}

function tenorMonths(tenor: EuriborTenor): number {
  return tenor === '3m' ? 3 : tenor === '6m' ? 6 : 12
}

// Parse the ECB SDMX-JSON shape: one series whose observations index into
// structure.dimensions.observation[0].values (the time periods).
function parseEcbJson(json: unknown): Array<{ month: string; value: number }> {
  const j = json as {
    dataSets?: Array<{ series?: Record<string, { observations?: Record<string, unknown[]> }> }>
    structure?: { dimensions?: { observation?: Array<{ values?: Array<{ id?: string }> }> } }
  }
  const series = j?.dataSets?.[0]?.series
  const seriesKey = series ? Object.keys(series)[0] : undefined
  const observations = seriesKey ? series![seriesKey]?.observations : undefined
  const periods = j?.structure?.dimensions?.observation?.[0]?.values
  if (!observations || !periods) return []

  const out: Array<{ month: string; value: number }> = []
  for (const [idx, obs] of Object.entries(observations)) {
    const month = periods[Number(idx)]?.id
    const value = Array.isArray(obs) ? obs[0] : undefined
    if (typeof month === 'string' && YM_RE.test(month) && typeof value === 'number' && isFinite(value)) {
      out.push({ month, value })
    }
  }
  return out
}

// Fetch the latest monthly averages for every tenor and upsert them.
// Idempotent (unique [tenor, month]); pulls the last 2 observations so a
// late-published previous month is still picked up. Each tenor is fetched
// with a timeout and isolated in its own try/catch — one bad series must not
// starve the other two (or the rest of the cron's 30s budget). A 200 with
// zero parseable rows counts as a failure: lastNObservations=2 should always
// yield rows, so an empty parse means the SDMX shape changed.
export async function fetchAndStoreEuribor(): Promise<{ upserted: number }> {
  let upserted = 0
  const failures: string[] = []
  for (const [tenor, key] of Object.entries(ECB_SERIES)) {
    try {
      const url = `https://data-api.ecb.europa.eu/service/data/FM/${key}?format=jsondata&lastNObservations=2`
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const rows = parseEcbJson(await res.json())
      if (rows.length === 0) throw new Error('0 parseable rows (SDMX shape changed?)')
      for (const { month, value } of rows) {
        await prisma.euriborRate.upsert({
          where: { tenor_month: { tenor, month } },
          create: { tenor, month, value },
          update: { value },
        })
        upserted++
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown'
      console.error(`[euribor] fetch failed for ${tenor}:`, msg)
      failures.push(`${tenor}: ${msg}`)
    }
  }
  // All three failed → surface as a task error; partial success stays ok.
  if (failures.length === Object.keys(ECB_SERIES).length) {
    throw new Error(failures.join('; '))
  }
  return { upserted }
}

export async function latestEuribor(tenor: EuriborTenor): Promise<{ month: string; value: number } | null> {
  const row = await prisma.euriborRate.findFirst({
    where: { tenor },
    orderBy: { month: 'desc' },
  })
  return row ? { month: row.month, value: row.value } : null
}

// ── Revision projection ──────────────────────────────────────────
// Contract model: months 1..mesesFixos run at tanFixa; the variable phase
// starts at addMonths(dataInicio, mesesFixos) and the rate revises every
// `tenor` months from that anchor. The projection re-prices the schedule with
// the LATEST stored monthly average — i.e. "if your revision happened with
// today's rates" — which is the honest best estimate until the actual
// reference month (the month before the revision) closes.

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12).toString().padStart(4, '0')}-${((total % 12) + 1).toString().padStart(2, '0')}`
}

function monthsBetween(fromYm: string, toYm: string): number {
  const [fy, fm] = fromYm.split('-').map(Number)
  const [ty, tm] = toYm.split('-').map(Number)
  return (ty * 12 + tm) - (fy * 12 + fm)
}

export interface RevisionProjection {
  tenor: EuriborTenor
  nextRevisionYm: string
  latestEuribor: number       // percent
  latestEuriborMonth: string  // "AAAA-MM" the average covers
  currentRate: number         // percent — annual rate applied today
  projectedRate: number       // percent — spread + latest Euribor
  currentPayment: number      // € — prestação today
  projectedPayment: number    // € — prestação at the revision, re-priced
  deltaMonthly: number        // € — projected − current
}

export async function projectRevision(loan: {
  capital: number; prazoMeses: number; tanFixa: number; mesesFixos: number
  spread: number; euribor: number; dataInicio: string; euriborTenor: string | null
  amortizations?: Array<{ ym: string; valor: number; modo: string }>
}): Promise<RevisionProjection | null> {
  if (!isEuriborTenor(loan.euriborTenor)) return null
  const latest = await latestEuribor(loan.euriborTenor)
  if (!latest) return null

  const nowYm = new Date().toISOString().slice(0, 7)
  const elapsed = monthsBetween(loan.dataInicio, nowYm)
  const T = tenorMonths(loan.euriborTenor)

  // First revision = start of the variable phase; then every T months.
  // ceil (not floor+1) so a revision falling in the CURRENT month resolves to
  // this month — the moment the card matters most — instead of skipping a
  // whole tenor ahead; it rolls to the next boundary once the month passes.
  let revisionIdx = loan.mesesFixos
  if (elapsed >= loan.mesesFixos) {
    revisionIdx = loan.mesesFixos + Math.ceil((elapsed - loan.mesesFixos) / T) * T
  }
  const nextRevisionYm = addMonths(loan.dataInicio, revisionIdx)

  const baseInput: LoanInput = {
    capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
    mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
    dataInicio: loan.dataInicio,
    amortizacoes: (loan.amortizations ?? []).map((a) => ({
      ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao',
    })),
  }

  const currentSchedule = computeSchedule(baseInput)
  // Loan pays off before the next revision → nothing to project.
  if (monthsBetween(currentSchedule.payoffYm, nextRevisionYm) > 0) return null

  const projectedSchedule = computeSchedule({ ...baseInput, euribor: latest.value / 100 })

  // Deliberate clamp-to-schedule-end fallback (not an oversight): a ym past
  // payoff (e.g. dataInicio in the future, or re-priced schedule ends earlier)
  // falls back to the final row rather than crashing.
  const rowAt = (rows: typeof currentSchedule.rows, ym: string) =>
    rows.find((r) => r.ym === ym) ?? rows[rows.length - 1]

  const currentRow = rowAt(currentSchedule.rows, nowYm)
  const projectedRow = rowAt(projectedSchedule.rows, nextRevisionYm)

  const inFixedPhase = elapsed < loan.mesesFixos
  const currentRate = (inFixedPhase ? loan.tanFixa : loan.spread + loan.euribor) * 100
  const projectedRate = loan.spread * 100 + latest.value

  return {
    tenor: loan.euriborTenor,
    nextRevisionYm,
    latestEuribor: latest.value,
    latestEuriborMonth: latest.month,
    currentRate,
    projectedRate,
    currentPayment: currentRow.prestacao,
    projectedPayment: projectedRow.prestacao,
    deltaMonthly: projectedRow.prestacao - currentRow.prestacao,
  }
}
