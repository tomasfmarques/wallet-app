import { prisma } from './prisma'

// ── Demo dataset ─────────────────────────────────────────────────
// Realistic, representative data so a demo account feels alive across every
// module (Loan, Portfolio, Budget, Compare). Months are computed relative to
// "now" so the demo always looks current.

function ymAddMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}
function currentYm(): string {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

// Seed a freshly-created demo user with sample data. `clearFirst` re-seeds an
// existing demo account (the "reset demo data" action).
export async function seedDemoAccount(userId: string, opts: { clearFirst?: boolean } = {}): Promise<void> {
  const cur = currentYm()
  const prev = ymAddMonths(cur, -1)

  // 12 months of contributions for an asset.
  const flows = (amount: number) => Array.from({ length: 12 }, (_, i) => ({ ym: ymAddMonths(cur, -(11 - i)), amount }))

  await prisma.$transaction(async (tx) => {
    if (opts.clearFirst) {
      await tx.loan.deleteMany({ where: { userId } })
      await tx.portfolioAsset.deleteMany({ where: { userId } })
      await tx.portfolioSettings.deleteMany({ where: { userId } })
      await tx.income.deleteMany({ where: { userId } })
      await tx.expense.deleteMany({ where: { userId } })
      await tx.classificationRule.deleteMany({ where: { userId } })
    }

    // ── Loan: a mortgage with one past amortization ──
    await tx.loan.create({
      data: {
        userId, name: 'Casa', capital: 250000, prazoMeses: 360,
        tanFixa: 0.032, mesesFixos: 24, spread: 0.01, euribor: 0.025,
        dataInicio: '2022-03',
        amortizations: { create: [{ ym: ymAddMonths(cur, -12), valor: 10000, modo: 'prazo' }] },
      },
    })

    // ── Portfolio: 3 assets with monthly flows ──
    await tx.portfolioAsset.create({
      data: {
        userId, name: 'iShares MSCI World', ticker: 'IWDA', qty: 120, invested: 9000,
        value: 11250, monthly: 300, expectedReturn: 0.07, lastPriceEur: 93.7,
        flows: { create: flows(300) },
      },
    })
    await tx.portfolioAsset.create({
      data: {
        userId, name: 'Apple', ticker: 'AAPL', qty: 20, invested: 3000,
        value: 4180, monthly: 100, expectedReturn: 0.09, lastPriceEur: 209,
        flows: { create: flows(100) },
      },
    })
    await tx.portfolioAsset.create({
      data: {
        userId, name: 'Bitcoin', ticker: 'BTC-USD', qty: 0.05, invested: 2000,
        value: 3100, monthly: 50, expectedReturn: 0.15, lastPriceEur: 62000,
        flows: { create: flows(50) },
      },
    })

    await tx.portfolioSettings.upsert({
      where: { userId },
      create: { userId, gInc: 3, gFY: 2, gH: 20, watchlistSymbols: 'NVDA,AAPL,MSFT,IWDA', language: null },
      update: { gInc: 3, gFY: 2, gH: 20, watchlistSymbols: 'NVDA,AAPL,MSFT,IWDA' },
    })

    // ── Budget: recurring plan (source null) ──
    await tx.income.createMany({
      data: [
        { userId, name: 'Salário', amount: 2200, type: 'fixed', category: 'Salário', dayOfMonth: 25, active: true, pending: false },
        { userId, name: 'Freelance', amount: 350, type: 'variable', category: 'Freelance', active: true, pending: false },
      ],
    })
    await tx.expense.createMany({
      data: [
        // Recurring fixed plan
        { userId, name: 'Renda', amount: 800, type: 'fixed', category: 'Habitação', dayOfMonth: 8, active: true, pending: false },
        { userId, name: 'Netflix', amount: 13, type: 'fixed', category: 'Subscrições', dayOfMonth: 4, active: true, pending: false },
        { userId, name: 'Ginásio', amount: 30, type: 'fixed', category: 'Saúde', dayOfMonth: 1, active: true, pending: false },
        // Imported-style variable actuals (month-scoped) so Movimentos/Análise have content
        { userId, name: 'CONTINENTE BELAS', amount: 78.4, type: 'variable', category: 'Alimentação', source: 'Extrato', startYm: cur, endYm: cur, dayOfMonth: 12, active: true, pending: false },
        { userId, name: 'GALP ENERGIA', amount: 55, type: 'variable', category: 'Transportes', source: 'Extrato', startYm: cur, endYm: cur, dayOfMonth: 6, active: true, pending: false },
        { userId, name: 'UBER EATS', amount: 21.9, type: 'variable', category: 'Restauração', source: 'Extrato', startYm: cur, endYm: cur, dayOfMonth: 18, active: true, pending: false },
        { userId, name: 'CONTINENTE BELAS', amount: 64.2, type: 'variable', category: 'Alimentação', source: 'Extrato', startYm: prev, endYm: prev, dayOfMonth: 11, active: true, pending: false },
        { userId, name: 'FNAC', amount: 39.99, type: 'variable', category: 'Compras', source: 'Extrato', startYm: prev, endYm: prev, dayOfMonth: 22, active: true, pending: false },
      ],
    })

    await tx.classificationRule.createMany({
      data: [
        { userId, matchKey: 'continente belas', kind: 'expense', type: 'variable', category: 'Alimentação' },
        { userId, matchKey: 'galp energia', kind: 'expense', type: 'variable', category: 'Transportes' },
      ],
    })
  }, { timeout: 30_000 })
}
