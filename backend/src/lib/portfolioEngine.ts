// ── Portfolio projection engine ──────────────────────────────────
// Compound growth with monthly contributions that grow annually.
//
// Per asset:
//   value_{m+1} = value_m * (1 + r/12) + contribution_m
// where contribution_m increases each year after `gFy` initial flat years
// by `gInc` percent.
//
// Aggregate: sum per-asset values to get the total curve.
//
// Pure functions. Safe to import anywhere.

export interface AssetInput {
  id: string
  name: string
  ticker: string
  value: number         // current market value (€)
  monthly: number       // current monthly contribution (€)
  expectedReturn: number // annual return as fraction, e.g. 0.07
}

export interface ProjectionSettings {
  gInc: number  // % annual growth of contributions
  gFy: number   // initial years without growth
  gH: number    // horizon in years
}

export interface AssetProjection {
  id: string
  name: string
  ticker: string
  rows: number[]            // value at end of each month (length = gH * 12)
  finalValue: number
  totalContributed: number  // sum of all monthly contributions over horizon
}

export interface PortfolioProjection {
  perAsset: AssetProjection[]
  totalRows: number[]      // aggregate value per month
  initialTotal: number     // sum of asset.value today
  finalTotal: number       // aggregate value at horizon
  totalContributed: number
  totalReturn: number      // finalTotal - initialTotal - totalContributed
}

function contributionForYear(base: number, yearIdx: number, gInc: number, gFy: number): number {
  // yearIdx 0..gFy-1 → no growth; from yearIdx = gFy onward, grow each year
  const exponent = Math.max(0, yearIdx - gFy + 1)
  return base * Math.pow(1 + gInc / 100, exponent)
}

function projectAsset(asset: AssetInput, settings: ProjectionSettings): AssetProjection {
  const months = settings.gH * 12
  const r = asset.expectedReturn / 12
  const rows: number[] = new Array(months)

  let value = asset.value
  let totalContributed = 0

  for (let m = 0; m < months; m++) {
    const yearIdx = Math.floor(m / 12)
    const monthly = contributionForYear(asset.monthly, yearIdx, settings.gInc, settings.gFy)
    value = value * (1 + r) + monthly
    totalContributed += monthly
    rows[m] = value
  }

  return {
    id: asset.id,
    name: asset.name,
    ticker: asset.ticker,
    rows,
    finalValue: value,
    totalContributed,
  }
}

export function projectPortfolio(
  assets: AssetInput[],
  settings: ProjectionSettings,
): PortfolioProjection {
  const months = settings.gH * 12
  const perAsset = assets.map((a) => projectAsset(a, settings))

  const totalRows = new Array<number>(months).fill(0)
  for (const ap of perAsset) {
    for (let m = 0; m < months; m++) totalRows[m] += ap.rows[m]
  }

  const initialTotal = assets.reduce((s, a) => s + a.value, 0)
  const finalTotal = totalRows[months - 1] ?? initialTotal
  const totalContributed = perAsset.reduce((s, ap) => s + ap.totalContributed, 0)

  return {
    perAsset,
    totalRows,
    initialTotal,
    finalTotal,
    totalContributed,
    totalReturn: finalTotal - initialTotal - totalContributed,
  }
}

// ── Portfolio KPIs ───────────────────────────────────────────────
export interface PortfolioKpis {
  valorAtual: number
  jaInvestido: number
  ganhoPerda: number
  ganhoPerdaPct: number      // 0..1 (can be negative)
  reforcoMensalTotal: number
  numAtivos: number
  projecaoFinal: number
}

export function computePortfolioKpis(
  assets: Array<{ value: number; invested: number; monthly: number }>,
  projecaoFinal: number,
): PortfolioKpis {
  const valorAtual = assets.reduce((s, a) => s + a.value, 0)
  const jaInvestido = assets.reduce((s, a) => s + a.invested, 0)
  const reforcoMensalTotal = assets.reduce((s, a) => s + a.monthly, 0)
  const ganhoPerda = valorAtual - jaInvestido
  return {
    valorAtual,
    jaInvestido,
    ganhoPerda,
    ganhoPerdaPct: jaInvestido > 0 ? ganhoPerda / jaInvestido : 0,
    reforcoMensalTotal,
    numAtivos: assets.length,
    projecaoFinal,
  }
}
