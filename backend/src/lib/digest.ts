import { prisma } from './prisma'
import { computeKpis } from './loanEngine'
import { loanPrestacoes, syncedAmount } from './loanSync'
import { merchantKey } from './merchantKey'
import { projectRevision } from './euribor'
import { asLang, type Lang } from './notifyCopy'
import { sendMonthlyDigestEmail } from './email'
import { isEmailVerified } from './emailVerification'
import { runCompare, defaultCompareParams } from './compareEngine'

// ── Monthly email digest (WS4) ───────────────────────────────────
// Zero user config: every non-demo user with data gets last month's summary
// (opt-OUT via NotificationPreference.emailMonthlyDigest or the unsubscribe
// link). Runs from /api/cron/daily on day 1. Content mirrors the app's own
// semantics: the REAL month lane follows frontend budgetReal.ts (actuals +
// folded recurring fixed plan rows, variable = actuals only), loan-linked
// amounts use the live prestação (lib/loanSync), and the wedge line runs the
// same lib/compareEngine as the /comparar page and the dashboard card (the
// engine was extracted out of routes/simulate.ts for exactly this).

export interface DigestData {
  monthLabel: string          // localized "junho de 2026"
  budget: {
    hasActuals: boolean
    incomeReal: number
    expensesReal: number
    balance: number
    planNet: number           // plan-only net for the same month (comparison)
    topCategories: Array<{ name: string; total: number }>
  } | null
  portfolio: { value: number; invested: number; gain: number } | null
  loans: Array<{
    name: string; outstanding: number; pctPaid: number; nextPayment: number
    revision: { ym: string; projectedPayment: number; deltaMonthly: number } | null
  }>
  // The "amortizar vs investir" nudge — mirrors the dashboard's WedgeInsight
  // card: same primary loan, same defaults, same engine. Null unless the user
  // has BOTH a live loan and investments (otherwise there's no trade-off).
  wedge: {
    loanName: string
    amount: number
    interestSaved: number
    netGainAfterTax: number
    verdict: 'amortizar' | 'investir' | 'equivalente'
  } | null
}

function prevYm(): string {
  const d = new Date()
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() - 1 // previous month
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

function activeInMonth(item: { active: boolean; startYm: string | null; endYm: string | null }, ym: string): boolean {
  if (!item.active) return false
  if (item.startYm && ym < item.startYm) return false
  if (item.endYm && ym > item.endYm) return false
  return true
}

export async function buildDigestData(userId: string, ym: string, lang: Lang): Promise<DigestData | null> {
  const [incomes, expenses, assets, loans, prest] = await Promise.all([
    prisma.income.findMany({ where: { userId, pending: false } }),
    prisma.expense.findMany({ where: { userId, pending: false } }),
    prisma.portfolioAsset.findMany({ where: { userId } }),
    prisma.loan.findMany({ where: { userId }, include: { amortizations: { orderBy: { ym: 'asc' } } } }),
    loanPrestacoes(userId),
  ])

  // No data at all → no email (fresh signups).
  if (incomes.length + expenses.length + assets.length + loans.length === 0) return null

  // ── Budget: the "real" month lane (mirrors frontend budgetReal.ts) ──
  const planInc = incomes.filter((i) => !i.source)
  const planExp = expenses.filter((e) => !e.source)
  const actInc = incomes.filter((i) => !!i.source && i.startYm === ym)
  const actFixed = expenses.filter((e) => !!e.source && e.type === 'fixed' && e.startYm === ym)
  const actVar = expenses.filter((e) => !!e.source && e.type === 'variable' && e.startYm === ym)
  const hasActuals = actInc.length + actFixed.length + actVar.length > 0

  const incKeys = new Set(actInc.map((i) => merchantKey(i.name)))
  const fixedKeys = new Set(actFixed.map((e) => merchantKey(e.name)))
  const foldInc = planInc.filter((i) => i.type === 'fixed' && activeInMonth(i, ym) && !incKeys.has(merchantKey(i.name)))
  const foldFixed = planExp.filter((e) => e.type === 'fixed' && activeInMonth(e, ym) && !fixedKeys.has(merchantKey(e.name)))

  // Real month = actuals + folded fixed plan; plan-only when nothing imported.
  const realIncRows = hasActuals ? [...actInc, ...foldInc] : planInc.filter((i) => i.type === 'fixed' && activeInMonth(i, ym))
  const realFixedRows = hasActuals ? [...actFixed, ...foldFixed] : planExp.filter((e) => e.type === 'fixed' && activeInMonth(e, ym))
  const realVarRows = actVar

  const incomeReal = realIncRows.reduce((s, i) => s + i.amount, 0)
  const expensesReal =
    realFixedRows.reduce((s, e) => s + syncedAmount(e, prest), 0) +
    realVarRows.reduce((s, e) => s + e.amount, 0)

  // Plan-only net for the same month (the app's headline KPI semantics).
  const planNet =
    planInc.filter((i) => activeInMonth(i, ym)).reduce((s, i) => s + i.amount, 0) -
    planExp.filter((e) => activeInMonth(e, ym)).reduce((s, e) => s + syncedAmount(e, prest), 0)

  // Top 3 expense categories of the real month.
  const catTotals = new Map<string, number>()
  for (const e of [...realFixedRows, ...realVarRows]) {
    const key = e.category ?? e.name
    catTotals.set(key, (catTotals.get(key) ?? 0) + (e.type === 'fixed' ? syncedAmount(e, prest) : e.amount))
  }
  const topCategories = [...catTotals.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([name, total]) => ({ name, total }))

  // Gate on rows actually IN this month — a user whose plan rows only start in
  // a future month must not get an all-zero "Saldo do mês" section.
  const budget = (realIncRows.length + realFixedRows.length + realVarRows.length) > 0
    ? { hasActuals, incomeReal, expensesReal, balance: incomeReal - expensesReal, planNet, topCategories }
    : null

  // ── Portfolio ──
  const value = assets.reduce((s, a) => s + a.value, 0)
  const invested = assets.reduce((s, a) => s + a.invested, 0)
  const portfolio = assets.length > 0 ? { value, invested, gain: value - invested } : null

  // ── Loans (+ upcoming revision when within 2 months) ──
  const loanBlocks: DigestData['loans'] = []
  // Tracked by object identity while we already have each loan in hand. Loan
  // names are NOT unique per user (two "Casa" rows are perfectly legal), so
  // re-finding the primary loan by name afterwards could pick the wrong one and
  // quote the wedge for a different mortgage.
  let primary: { loan: (typeof loans)[number]; nextPayment: number; loanKpiCapital: number } | null = null
  for (const loan of loans) {
    try {
      const kpis = computeKpis({
        capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
        mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
        dataInicio: loan.dataInicio,
        amortizacoes: loan.amortizations.map((a) => ({ ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao' })),
      })
      let revision: DigestData['loans'][number]['revision'] = null
      if (loan.euriborTenor) {
        const rev = await projectRevision(loan)
        if (rev) {
          const [ry, rm] = rev.nextRevisionYm.split('-').map(Number)
          const now = new Date()
          const monthsAway = (ry * 12 + rm) - (now.getUTCFullYear() * 12 + now.getUTCMonth() + 1)
          if (monthsAway <= 2) {
            revision = { ym: rev.nextRevisionYm, projectedPayment: rev.projectedPayment, deltaMonthly: rev.deltaMonthly }
          }
        }
      }
      loanBlocks.push({
        name: loan.name,
        outstanding: kpis.capitalAtual,
        pctPaid: kpis.pctPago,
        nextPayment: kpis.proximaPrestacao,
        revision,
      })
      // Most significant loan = largest remaining capital (same rule as the
      // dashboard's WedgeInsight card).
      if (!primary || kpis.capitalAtual > primary.loanKpiCapital) {
        primary = { loan, nextPayment: kpis.proximaPrestacao, loanKpiCapital: kpis.capitalAtual }
      }
    } catch { /* skip uncomputable loan */ }
  }

  // ── Wedge: amortizar vs investir (WS4 follow-up) ──
  // Same shape as the dashboard card: the most significant loan (largest
  // remaining capital), simulated with the shared defaults. Fail-silent — a
  // wedge that can't be computed must never cost the user their whole digest.
  let wedge: DigestData['wedge'] = null
  if (primary && assets.length > 0) {
    try {
      const { loan } = primary
      const compareAssets = assets.map((a) => ({ value: a.value, expectedReturn: a.expectedReturn }))
      const params = defaultCompareParams(primary.nextPayment, compareAssets)
      const result = runCompare({
        capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
        mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
        dataInicio: loan.dataInicio,
        amortizacoes: loan.amortizations.map((a) => ({ ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao' })),
      }, params, compareAssets)
      if (result) {
        wedge = {
          loanName: loan.name,
          amount: params.valor,
          interestSaved: result.amortizar.interestSaved,
          netGainAfterTax: result.investir.netGainAfterTax,
          verdict: result.recommendation,
        }
      }
    } catch (err) {
      console.error('[digest] wedge failed:', err instanceof Error ? err.message : err)
    }
  }

  const [y, m] = ym.split('-').map(Number)
  const monthLabel = new Intl.DateTimeFormat(lang === 'en' ? 'en-IE' : 'pt-PT', { month: 'long', year: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, 1)))

  return { monthLabel, budget, portfolio, loans: loanBlocks, wedge }
}

// ── The day-1 send loop (called from /api/cron/daily) ────────────
export async function sendMonthlyDigests(): Promise<{ sent: number; skipped: number }> {
  const ym = prevYm()
  let sent = 0
  let skipped = 0

  // Paged loop keeps each batch well inside the serverless budget.
  const PAGE = 50
  for (let skip = 0; ; skip += PAGE) {
    const users = await prisma.user.findMany({
      where: { isDemo: false },
      select: { id: true, email: true, emailVerifiedAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: PAGE, skip,
    })
    if (users.length === 0) break

    for (const user of users) {
      try {
        // Never mail an address nobody has proven they own — that's how a
        // sender reputation dies (S3/F7). Accounts predating verification are
        // grandfathered, so this can't silently mute existing users.
        if (!isEmailVerified(user)) { skipped++; continue }
        const [prefsRow, settings] = await Promise.all([
          prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
          prisma.portfolioSettings.findUnique({ where: { userId: user.id } }),
        ])
        // Absent row = default ON (opt-out model).
        if (prefsRow && !prefsRow.emailMonthlyDigest) { skipped++; continue }
        const lang = asLang(settings?.language)
        const data = await buildDigestData(user.id, ym, lang)
        if (!data) { skipped++; continue }
        await sendMonthlyDigestEmail(user.email, user.id, lang, data)
        sent++
      } catch (err) {
        console.error(`[digest] failed for user ${user.id}:`, err instanceof Error ? err.message : err)
      }
    }
    if (users.length < PAGE) break
  }

  return { sent, skipped }
}
