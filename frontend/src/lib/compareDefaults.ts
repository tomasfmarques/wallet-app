import type { LoanItem } from '@/hooks/useLoan'
import type { PortfolioResponse } from '@/hooks/usePortfolio'

export type Modo = 'prazo' | 'prestacao'
export type Frequencia = 'unica' | 'mensal' | 'anual'
export type ReturnMode = 'portfolio' | 'manual'

export interface CompareDefaults {
  valor: number
  investReturn: number  // % e.g. 7.0 (manual mode / fallback)
  taxRate: number       // % — Portugal mais-valias = 28
  modo: Modo
  frequencia: Frequencia
  returnMode: ReturnMode
}

// Smart defaults for the "amortizar vs investir" simulation, derived from the
// user's actual data. Single source of truth shared by the full /comparar page
// and the proactive dashboard insight card, so both always show the same numbers.
//
// investReturn = the average of the user's per-asset expected returns, falling
// back to 7% when they hold no assets. (The original Compare page mistakenly read
// settings.gFY here — but gFY is "anos sem aumento" in the projection engine, an
// integer, not a return rate; using it as a % skewed the recommendation.)
export function compareDefaults(
  loan: LoanItem | null | undefined,
  portfolio: PortfolioResponse | null | undefined,
): CompareDefaults {
  const assets = portfolio?.assets
  const hasAssets = !!assets && assets.length > 0
  const avgAssetReturn = hasAssets
    ? (assets!.reduce((s, a) => s + a.expectedReturn, 0) / assets!.length) * 100
    : null
  const investReturn = avgAssetReturn ?? 7

  // Amount: the selected loan's next installment, rounded to the nearest 100.
  const nextPrestacao = loan?.kpis?.proximaPrestacao ?? 5000
  const valor = Math.max(100, Math.round(nextPrestacao / 100) * 100)

  return {
    valor,
    investReturn: Math.round(investReturn * 10) / 10,
    taxRate: 28,
    modo: 'prazo',
    frequencia: 'unica',
    // Project across real assets by default; fall back to the manual slider when
    // the user holds no investments (nothing to project).
    returnMode: hasAssets ? 'portfolio' : 'manual',
  }
}
