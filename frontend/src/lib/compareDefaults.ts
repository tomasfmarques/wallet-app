import type { LoanItem } from '@/hooks/useLoan'
import type { PortfolioResponse } from '@/hooks/usePortfolio'

export type Modo = 'prazo' | 'prestacao'

export interface CompareDefaults {
  valor: number
  investReturn: number  // % e.g. 7.0
  taxRate: number       // % — Portugal mais-valias = 28
  modo: Modo
}

// Smart defaults for the "amortizar vs investir" simulation, derived from the
// user's actual data. Single source of truth shared by the full /comparar page
// and the proactive dashboard insight card, so both always show the same numbers.
//
// NOTE: investReturn reads portfolio.settings.gFY first (the value the portfolio
// UI labels "rentabilidade futura"), falling back to the average per-asset
// expectedReturn, then 7%. This mirrors the original Compare-page behaviour
// verbatim — see the gFY-semantics follow-up before changing it.
export function compareDefaults(
  loan: LoanItem | null | undefined,
  portfolio: PortfolioResponse | null | undefined,
): CompareDefaults {
  const gFY = portfolio?.settings?.gFY
  const assets = portfolio?.assets
  const avgAssetReturn = assets && assets.length
    ? (assets.reduce((s, a) => s + a.expectedReturn, 0) / assets.length) * 100
    : null
  const investReturn = gFY ?? avgAssetReturn ?? 7

  // Amount: the selected loan's next installment, rounded to the nearest 100.
  const nextPrestacao = loan?.kpis?.proximaPrestacao ?? 5000
  const valor = Math.max(100, Math.round(nextPrestacao / 100) * 100)

  return {
    valor,
    investReturn: Math.round(investReturn * 10) / 10,
    taxRate: 28,
    modo: 'prazo',
  }
}
