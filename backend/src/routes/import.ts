import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'

// NOTE: the DeletionLog model is intentionally NOT imported/exported here — it is
// a system-level audit log (not user-scoped data) and must survive deletion. See
// schema comment + DELETE /api/me. Don't add it to the per-user backup.

const router = Router()
router.use(requireAuth)

// ── Light-weight runtime guards ─────────────────────────────────
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isArr = (v: unknown): v is unknown[] => Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const FREQUENCIES = ['monthly', 'weekly', 'biweekly', 'quarterly', 'annual']

// ── Prototype format detector + transformer ─────────────────────
// The localStorage-based prototype ("investimentos.tracker.v1") stores data
// in a different shape than my v1 export. Detect it and convert before the
// rest of the import logic runs, so users can bring their data in directly.
function looksLikePrototype(p: Record<string, unknown>): boolean {
  if ('meta' in p) return false // schemaVersion=1 has meta; prototype doesn't
  // Distinctive prototype-only field names:
  if ('amortizacoes' in p || 'euriborHist' in p) return true
  // Portfolio assets use `tk` (not `ticker`) in the prototype:
  if (isObj(p.portfolio)) {
    const port = p.portfolio
    if (isArr(port.assets) && port.assets.length > 0 && isObj(port.assets[0])) {
      const a = port.assets[0]
      if ('tk' in a && !('ticker' in a)) return true
      if ('m' in a && !('monthly' in a)) return true
    }
  }
  return false
}

function transformPrototypeToV1(p: Record<string, unknown>): Record<string, unknown> {
  // ── Payments: map { "YYYY-MM": { paid, real } } → array [{ ym, paid, real }]
  let paymentsArr: unknown[] = []
  if (isObj(p.payments)) {
    paymentsArr = Object.entries(p.payments).map(([ym, v]) => ({
      ym,
      paid: isObj(v) && isBool(v.paid) ? v.paid : false,
      real: isObj(v) && isNum(v.real) ? v.real : null,
    }))
  }

  // ── Loan + nested arrays renamed to my schema's keys
  let loan: Record<string, unknown> | null = null
  if (isObj(p.loan)) {
    loan = {
      ...p.loan,
      payments: paymentsArr,
      amortizations: isArr(p.amortizacoes) ? p.amortizacoes : [],
      euriborHistory: isArr(p.euriborHist) ? p.euriborHist : [],
    }
  }

  // ── Portfolio: short field names → long, percent → fraction
  let portfolio: Record<string, unknown> | null = null
  if (isObj(p.portfolio)) {
    const proto = p.portfolio
    const assets = isArr(proto.assets)
      ? (proto.assets as unknown[])
          .filter(isObj)
          .map((a) => ({
            name: isStr(a.name) ? a.name : '',
            // Prototype field `tk`; fall back to `ticker` defensively
            ticker: isStr(a.tk) ? a.tk : (isStr(a.ticker) ? a.ticker : ''),
            qty: isNum(a.qty) ? a.qty : 0,
            invested: isNum(a.invested) ? a.invested : 0,
            value: isNum(a.value) ? a.value : 0,
            // Prototype field `m`; fall back to `monthly`
            monthly: isNum(a.m) ? a.m : (isNum(a.monthly) ? a.monthly : 0),
            // CRITICAL: prototype stores r as percent (12 = 12%); v1 = fraction (0.12)
            expectedReturn: isNum(a.r)
              ? (a.r as number) / 100
              : (isNum(a.expectedReturn) ? a.expectedReturn : 0.07),
            flows: isArr(a.flows) ? a.flows : [],
          }))
      : []
    portfolio = {
      assets,
      settings: {
        gInc: isNum(proto.gInc) ? proto.gInc : 3,
        gFY: isNum(proto.gFY)  ? proto.gFY  : 2,
        gH:  isNum(proto.gH)   ? proto.gH   : 20,
        watchlistSymbols: null, // prototype didn't have this concept
        language: null,         // prototype didn't have this concept
      },
    }
  }

  return {
    meta: { schemaVersion: 1, importedFrom: 'prototype' },
    loan,
    portfolio,
  }
}

// ── POST /api/import ────────────────────────────────────────────
// Replaces ALL of the user's data with the contents of a previously-exported
// JSON document. Account (id, email, password, createdAt) is preserved.
// Wrapped in a single Prisma transaction so partial failures roll back.
router.post('/', async (req, res) => {
  const rawPayload = req.body
  if (!isObj(rawPayload)) {
    res.status(400).json({ error: 'Body must be a JSON object' })
    return
  }

  // Auto-detect the prototype's localStorage shape and convert it.
  // After this point the rest of the route only deals with my v1 shape.
  const wasPrototype = looksLikePrototype(rawPayload)
  const payload: Record<string, unknown> = wasPrototype
    ? transformPrototypeToV1(rawPayload)
    : rawPayload

  // Schema version check (post-transform)
  const meta = isObj(payload.meta) ? payload.meta : {}
  const version = isNum(meta.schemaVersion) ? meta.schemaVersion : null
  if (version !== 1) {
    res.status(400).json({
      error: `Unsupported schema version: ${version ?? 'missing'} (expected 1)`,
    })
    return
  }

  const userId = req.session.userId!

  try {
    await prisma.$transaction(async (tx) => {
      // ── Wipe existing user-owned data ──────────────────────────
      // Cascades from the schema take care of nested rows.
      await tx.loan.deleteMany({ where: { userId } })
      await tx.portfolioAsset.deleteMany({ where: { userId } })
      await tx.portfolioSettings.deleteMany({ where: { userId } })
      await tx.income.deleteMany({ where: { userId } })
      await tx.expense.deleteMany({ where: { userId } })
      await tx.classificationRule.deleteMany({ where: { userId } })
      await tx.bankConnection.deleteMany({ where: { userId } })
      await tx.importedTxn.deleteMany({ where: { userId } })
      // NOTE: PushSubscription is NOT restored (device-bound, like passkeys);
      // NotificationPreference IS (user data — restored below).
      await tx.notificationPreference.deleteMany({ where: { userId } })

      // ── Notification preferences ───────────────────────────────
      if (isObj(payload.notificationPreference)) {
        const np = payload.notificationPreference as Record<string, unknown>
        const asBool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt)
        await tx.notificationPreference.create({
          data: {
            userId,
            pushPayment:        asBool(np.pushPayment, true),
            pushEuribor:        asBool(np.pushEuribor, true),
            pushImportReminder: asBool(np.pushImportReminder, true),
            emailMonthlyDigest: asBool(np.emailMonthlyDigest, true),
          },
        })
      }

      // ── Loans (multiple credits) ───────────────────────────────
      const loanList: Record<string, unknown>[] = isArr(payload.loans)
        ? (payload.loans as unknown[]).filter(isObj).slice(0, 50)
        : (isObj(payload.loan) ? [payload.loan as Record<string, unknown>] : [])
      for (const loan of loanList) {
        if (isNum(loan.capital) && isNum(loan.prazoMeses) && isStr(loan.dataInicio)) {
          const prazoMesesRounded = Math.round(loan.prazoMeses as number)
          if (prazoMesesRounded <= 0 || prazoMesesRounded > 600) continue
          const createdLoan = await tx.loan.create({
            data: {
              userId,
              name:       isStr(loan.name) ? (loan.name as string) : 'Crédito',
              capital:    loan.capital,
              prazoMeses: prazoMesesRounded,
              tanFixa:    isNum(loan.tanFixa)    ? loan.tanFixa    : 0,
              mesesFixos: isNum(loan.mesesFixos) ? Math.min(Math.round(loan.mesesFixos), prazoMesesRounded) : 0,
              spread:     isNum(loan.spread)     ? loan.spread     : 0,
              euribor:    isNum(loan.euribor)    ? loan.euribor    : 0,
              dataInicio: loan.dataInicio,
              // Optional fields (were silently dropped by older restores):
              bonificacaoMensal: isNum(loan.bonificacaoMensal) ? loan.bonificacaoMensal : null,
              bonificacaoMeses:  isNum(loan.bonificacaoMeses)  ? Math.round(loan.bonificacaoMeses) : null,
              taeg:              isNum(loan.taeg)              ? loan.taeg : null,
              euriborTenor:      loan.euriborTenor === '3m' || loan.euriborTenor === '6m' || loan.euriborTenor === '12m'
                ? loan.euriborTenor : null,
            },
          })

          if (isArr(loan.payments)) {
            const rows = (loan.payments as unknown[])
              .filter(isObj)
              .filter((p) => isStr(p.ym) && YM_RE.test(p.ym as string))
              .map((p) => ({
                loanId: createdLoan.id,
                ym: p.ym as string,
                paid: isBool(p.paid) ? p.paid : false,
                real: isNum(p.real) ? p.real : null,
              }))
            if (rows.length > 0) await tx.loanPayment.createMany({ data: rows })
          }

          if (isArr(loan.amortizations)) {
            const rows = (loan.amortizations as unknown[])
              .filter(isObj)
              .filter((a) => isStr(a.ym) && YM_RE.test(a.ym as string) && isNum(a.valor))
              .map((a) => ({
                loanId: createdLoan.id,
                ym: a.ym as string,
                valor: a.valor as number,
                modo: a.modo === 'prestacao' ? 'prestacao' : 'prazo',
              }))
            if (rows.length > 0) await tx.loanAmortization.createMany({ data: rows })
          }

          if (isArr(loan.euriborHistory)) {
            const rows = (loan.euriborHistory as unknown[])
              .filter(isObj)
              .filter((h) => isStr(h.ym) && YM_RE.test(h.ym as string) && isNum(h.valor))
              .map((h) => ({
                loanId: createdLoan.id,
                ym: h.ym as string,
                valor: h.valor as number,
              }))
            if (rows.length > 0) await tx.euriborHistory.createMany({ data: rows })
          }
        }
      }

      // ── Portfolio ──────────────────────────────────────────────
      if (isObj(payload.portfolio)) {
        const portfolio = payload.portfolio as Record<string, unknown>

        if (isArr(portfolio.assets)) {
          for (const raw of (portfolio.assets as unknown[]).slice(0, 200)) {
            if (!isObj(raw)) continue
            if (!isStr(raw.name) || !isStr(raw.ticker) || !isNum(raw.qty)) continue

            const created = await tx.portfolioAsset.create({
              data: {
                userId,
                name: raw.name,
                ticker: (raw.ticker as string).toUpperCase(),
                isin: isStr(raw.isin) ? (raw.isin as string).toUpperCase() : null,
                qty: raw.qty,
                invested: isNum(raw.invested) ? raw.invested : 0,
                value:    isNum(raw.value)    ? raw.value    : 0,
                monthly:  isNum(raw.monthly)  ? raw.monthly  : 0,
                expectedReturn: isNum(raw.expectedReturn) ? raw.expectedReturn : 0.07,
                lastPriceEur: isNum(raw.lastPriceEur) ? raw.lastPriceEur : null,
                source: isStr(raw.source) ? raw.source : 'manual',
              },
            })

            if (isArr(raw.flows)) {
              const flows = (raw.flows as unknown[])
                .filter(isObj)
                .filter((f) => isStr(f.ym) && YM_RE.test(f.ym as string) && isNum(f.amount))
                .map((f) => ({
                  assetId: created.id,
                  ym: f.ym as string,
                  amount: f.amount as number,
                }))
              if (flows.length > 0) await tx.portfolioFlow.createMany({ data: flows })
            }
          }
        }

        if (isObj(portfolio.settings)) {
          const s = portfolio.settings as Record<string, unknown>
          const VALID_IMPORT_LANGUAGES = ['pt', 'en']
          await tx.portfolioSettings.create({
            data: {
              userId,
              gInc: isNum(s.gInc) ? Math.round(s.gInc) : 3,
              gFY:  isNum(s.gFY)  ? Math.round(s.gFY)  : 2,
              gH:   isNum(s.gH)   ? Math.round(s.gH)   : 20,
              watchlistSymbols: isStr(s.watchlistSymbols) ? s.watchlistSymbols : null,
              language: isStr(s.language) && VALID_IMPORT_LANGUAGES.includes(s.language) ? s.language : null,
            },
          })
        }
      }

      // ── Budget (incomes + expenses) ───────────────────────────
      if (isObj(payload.budget)) {
        const budget = payload.budget as Record<string, unknown>

        const isValidYm = (v: unknown): boolean => isStr(v) && YM_RE.test(v as string)
        if (isArr(budget.incomes)) {
          const incomes = (budget.incomes as unknown[]).slice(0, 5000)
            .filter(isObj)
            .filter((i) => isStr(i.name) && isNum(i.amount))
            .map((i) => ({
              userId,
              name: i.name as string,
              amount: i.amount as number,
              type: i.type === 'variable' ? 'variable' : 'fixed',
              category: isStr(i.category) ? i.category : null,
              dayOfMonth: isNum(i.dayOfMonth) ? Math.round(i.dayOfMonth as number) : null,
              active: isBool(i.active) ? i.active : true,
              pending: isBool(i.pending) ? i.pending : false,
              source: isStr(i.source) ? i.source : null,
              matchHint: isStr(i.matchHint) && i.matchHint.length <= 80 ? i.matchHint : null,
              frequency: FREQUENCIES.includes(i.frequency as string) ? i.frequency as string : 'monthly',
              startYm: isValidYm(i.startYm) ? i.startYm as string : null,
              endYm:   isValidYm(i.endYm)   ? i.endYm as string   : null,
              notes:   isStr(i.notes)        ? i.notes             : null,
            }))
          if (incomes.length > 0) await tx.income.createMany({ data: incomes })
        }

        if (isArr(budget.expenses)) {
          const expenses = (budget.expenses as unknown[]).slice(0, 5000)
            .filter(isObj)
            .filter((e) => isStr(e.name) && isNum(e.amount))
            .map((e) => ({
              userId,
              name: e.name as string,
              amount: e.amount as number,
              type: e.type === 'variable' ? 'variable' : 'fixed',
              category: isStr(e.category) ? e.category : null,
              dayOfMonth: isNum(e.dayOfMonth) ? Math.round(e.dayOfMonth as number) : null,
              active: isBool(e.active) ? e.active : true,
              pending: isBool(e.pending) ? e.pending : false,
              source: isStr(e.source) ? e.source : null,
              loanId:  isStr(e.loanId)       ? e.loanId            : null,
              matchHint: isStr(e.matchHint) && e.matchHint.length <= 80 ? e.matchHint : null,
              frequency: FREQUENCIES.includes(e.frequency as string) ? e.frequency as string : 'monthly',
              startYm: isValidYm(e.startYm) ? e.startYm as string : null,
              endYm:   isValidYm(e.endYm)   ? e.endYm as string   : null,
              notes:   isStr(e.notes)        ? e.notes             : null,
            }))
          if (expenses.length > 0) await tx.expense.createMany({ data: expenses })
        }
      }

      // ── Bank connections (GoCardless requisitions) ────────────
      if (isArr(payload.bankConnections)) {
        const conns = (payload.bankConnections as unknown[])
          .filter(isObj)
          .filter((c) => isStr(c.requisitionId) && isStr(c.institutionId) && isStr(c.institutionName))
          .map((c) => ({
            userId,
            requisitionId: c.requisitionId as string,
            institutionId: c.institutionId as string,
            institutionName: c.institutionName as string,
            logo: isStr(c.logo) ? c.logo : null,
            status: isStr(c.status) ? c.status : 'created',
          }))
        if (conns.length > 0) await tx.bankConnection.createMany({ data: conns })
      }

      // ── Learned classification rules ──────────────────────────
      if (isArr(payload.classificationRules)) {
        const rules = (payload.classificationRules as unknown[])
          .filter(isObj)
          .filter((r) => isStr(r.matchKey) && (r.kind === 'income' || r.kind === 'expense') && (r.type === 'fixed' || r.type === 'variable'))
          .map((r) => ({
            userId,
            matchKey: r.matchKey as string,
            kind: r.kind as string,
            type: r.type as string,
            category: isStr(r.category) ? r.category : null,
          }))
        if (rules.length > 0) await tx.classificationRule.createMany({ data: rules })
      }

      // ── Applied broker order ids (CSV re-import dedup) ─────────
      if (isArr(payload.importedTxns)) {
        const seen = new Set<string>()
        const txns = (payload.importedTxns as unknown[]).slice(0, 50_000)
          .filter(isObj)
          .filter((t) => isStr(t.source) && isStr(t.externalId))
          .map((t) => ({ userId, source: t.source as string, externalId: t.externalId as string }))
          // The table was just wiped, so only intra-payload dups matter
          // (skipDuplicates isn't supported on SQLite dev).
          .filter((t) => { const k = `${t.source}|${t.externalId}`; if (seen.has(k)) return false; seen.add(k); return true })
        if (txns.length > 0) await tx.importedTxn.createMany({ data: txns })
      }
    }, { timeout: 30_000 })

    // Summary
    const [loanCount, assetCount, settings, incomeCount, expenseCount] = await Promise.all([
      prisma.loan.count({ where: { userId } }),
      prisma.portfolioAsset.count({ where: { userId } }),
      prisma.portfolioSettings.findUnique({ where: { userId } }),
      prisma.income.count({ where: { userId } }),
      prisma.expense.count({ where: { userId } }),
    ])

    res.json({
      ok: true,
      summary: {
        loan: loanCount > 0,
        assets: assetCount,
        incomes: incomeCount,
        expenses: expenseCount,
        settingsRestored: !!settings,
        importedFrom: wasPrototype ? 'prototype' : 'v1',
      },
    })
  } catch (err) {
    console.error('POST /api/import failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
