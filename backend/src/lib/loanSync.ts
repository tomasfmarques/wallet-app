import { prisma } from './prisma'
import { computeKpis } from './loanEngine'

// ── Loan-linked expense amounts (shared by budget + notifications) ──
// A budget fixed expense linked to a loan (`Expense.loanId`) must always show
// the loan's LIVE prestação, not the stale stored amount — the mortgage isn't
// tracked in two places (budget decision #9). Hoisted out of routes/budget.ts
// so the push notifications quote the same live figure the Budget page shows.

const round2 = (n: number) => Math.round(n * 100) / 100

// Map of loanId → current monthly prestação.
export async function loanPrestacoes(userId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const loans = await prisma.loan.findMany({
    where: { userId },
    include: { amortizations: { orderBy: { ym: 'asc' } } },
  })
  for (const loan of loans) {
    try {
      const kpis = computeKpis({
        capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
        mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
        dataInicio: loan.dataInicio,
        amortizacoes: loan.amortizations.map((a) => ({ ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao' })),
      })
      if (kpis.proximaPrestacao > 0) map.set(loan.id, round2(kpis.proximaPrestacao))
    } catch { /* skip a loan that can't be computed */ }
  }
  return map
}

// A linked expense's effective amount = its loan's current prestação (if the
// loan still resolves), else the stored amount (graceful when loan deleted).
export const syncedAmount = (e: { loanId: string | null; amount: number }, prest: Map<string, number>): number =>
  e.loanId && prest.has(e.loanId) ? prest.get(e.loanId)! : e.amount
