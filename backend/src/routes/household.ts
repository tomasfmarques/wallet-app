import { Router } from 'express'
import { randomBytes, createHash } from 'crypto'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'
import { computeKpis } from '../lib/loanEngine'
import { loanPrestacoes, syncedAmount } from '../lib/loanSync'
import { stripFormulaPrefix } from '../lib/sanitize'

// ── Modo Casal (household v1) ────────────────────────────────────
// Two members max, one household per user, AGGREGATE-level sharing only.
// GET /overview is the ONLY place data crosses users in the whole app — it
// returns first names + module totals, NEVER emails, ids or line items.
// Every other route stays strictly session-user-scoped.

const router = Router()
router.use(requireAuth)

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const MAX_MEMBERS = 2
const MAX_UNUSED_INVITES = 3

// The privacy policy (§3-A) promises the partner sees only the FIRST name —
// enforce it here rather than trusting how the user filled the signup field.
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

async function ownMembership(userId: string) {
  return prisma.householdMember.findUnique({
    where: { userId },
    include: { household: { include: { members: { include: { user: { select: { name: true } } } } } } },
  })
}

function serializeHousehold(m: NonNullable<Awaited<ReturnType<typeof ownMembership>>>) {
  return {
    id: m.household.id,
    name: m.household.name,
    // FIRST names only — never full names, emails or ids of the partner.
    members: m.household.members.map((mm) => ({ name: firstName(mm.user.name), isMe: mm.userId === m.userId })),
  }
}

// ── GET /api/household — own membership (or null) ────────────────
router.get('/', async (req, res) => {
  try {
    const m = await ownMembership(req.session.userId!)
    res.json({ household: m ? serializeHousehold(m) : null })
  } catch (err) {
    console.error('GET /api/household failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/household — create (400 if already a member) ───────
router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId!
    const existing = await prisma.householdMember.findUnique({ where: { userId } })
    if (existing) { res.status(400).json({ error: 'Já pertences a um agregado' }); return }
    const nameRaw = typeof req.body?.name === 'string' ? stripFormulaPrefix(req.body.name).slice(0, 40) : ''
    const household = await prisma.household.create({
      data: {
        ...(nameRaw ? { name: nameRaw } : {}),
        members: { create: { userId } },
      },
    })
    const m = await ownMembership(userId)
    res.status(201).json({ household: m ? serializeHousehold(m) : { id: household.id, name: household.name, members: [] } })
  } catch (err) {
    console.error('POST /api/household failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/household/invites — mint a single-use invite link ──
router.post('/invites', async (req, res) => {
  try {
    const userId = req.session.userId!
    const m = await ownMembership(userId)
    if (!m) { res.status(400).json({ error: 'Cria primeiro o agregado' }); return }
    if (m.household.members.length >= MAX_MEMBERS) {
      res.status(409).json({ error: 'O agregado já está completo' }); return
    }
    const unused = await prisma.householdInvite.count({
      where: { householdId: m.householdId, used: false, expiresAt: { gt: new Date() } },
    })
    if (unused >= MAX_UNUSED_INVITES) {
      res.status(429).json({ error: 'Demasiados convites por usar. Aguarda que expirem.' }); return
    }
    const plain = randomBytes(32).toString('hex')
    await prisma.householdInvite.create({
      data: {
        householdId: m.householdId,
        tokenHash: createHash('sha256').update(plain).digest('hex'),
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    })
    const origin = process.env.APP_ORIGIN
      ?? (process.env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)[0]
      ?? 'http://localhost:5173'
    res.status(201).json({ link: `${origin}/casal/aceitar?token=${plain}`, expiresInDays: 7 })
  } catch (err) {
    console.error('POST /api/household/invites failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── POST /api/household/join { token } ───────────────────────────
router.post('/join', async (req, res) => {
  const { token } = req.body ?? {}
  if (typeof token !== 'string' || token.length < 32) {
    res.status(400).json({ error: 'Convite inválido' }); return
  }
  try {
    const userId = req.session.userId!
    if (await prisma.householdMember.findUnique({ where: { userId } })) {
      res.status(409).json({ error: 'Já pertences a um agregado' }); return
    }
    const tokenHash = createHash('sha256').update(token).digest('hex')
    const invite = await prisma.householdInvite.findUnique({
      where: { tokenHash },
      include: { household: { include: { members: true } } },
    })
    if (!invite || invite.used || invite.expiresAt < new Date()) {
      res.status(400).json({ error: 'O convite é inválido ou expirou' }); return
    }
    if (invite.household.members.length >= MAX_MEMBERS) {
      res.status(409).json({ error: 'O agregado já está completo' }); return
    }
    // Interactive transaction with a RECOUNT inside: two users redeeming two
    // valid invites concurrently must not both land in the last slot. (A
    // READ COMMITTED race between two recounts remains theoretically possible
    // on Postgres — accepted at this app's scale; the recount closes the
    // realistic window.)
    try {
      await prisma.$transaction(async (tx) => {
        const count = await tx.householdMember.count({ where: { householdId: invite.householdId } })
        if (count >= MAX_MEMBERS) throw new Error('HOUSEHOLD_FULL')
        await tx.householdMember.create({ data: { householdId: invite.householdId, userId } })
        await tx.householdInvite.update({ where: { id: invite.id }, data: { used: true } })
      })
    } catch (err) {
      if (err instanceof Error && err.message === 'HOUSEHOLD_FULL') {
        res.status(409).json({ error: 'O agregado já está completo' }); return
      }
      throw err
    }
    const m = await ownMembership(userId)
    res.status(201).json({ household: m ? serializeHousehold(m) : null })
  } catch (err) {
    console.error('POST /api/household/join failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── DELETE /api/household/membership — leave (empty → delete) ────
router.delete('/membership', async (req, res) => {
  try {
    const userId = req.session.userId!
    const m = await prisma.householdMember.findUnique({ where: { userId } })
    if (!m) { res.status(404).json({ error: 'Não pertences a um agregado' }); return }
    await prisma.householdMember.delete({ where: { id: m.id } })
    const remaining = await prisma.householdMember.count({ where: { householdId: m.householdId } })
    if (remaining === 0) {
      await prisma.household.delete({ where: { id: m.householdId } })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/household/membership failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

// ── GET /api/household/overview — the aggregate view ─────────────
// Membership-checked; computes each member's module totals with the SAME
// engines the individual pages use, then sums. Names + numbers only.
router.get('/overview', async (req, res) => {
  try {
    const me = await ownMembership(req.session.userId!)
    if (!me) { res.status(404).json({ error: 'Não pertences a um agregado' }); return }

    const memberRows = me.household.members
    const perMember = await Promise.all(memberRows.map(async (mm) => {
      const uid = mm.userId
      const [assets, loans, incomes, expenses, prest] = await Promise.all([
        prisma.portfolioAsset.findMany({ where: { userId: uid }, select: { value: true, invested: true } }),
        prisma.loan.findMany({ where: { userId: uid }, include: { amortizations: { orderBy: { ym: 'asc' } } } }),
        prisma.income.findMany({ where: { userId: uid, active: true, pending: false, source: null }, select: { amount: true } }),
        prisma.expense.findMany({ where: { userId: uid, active: true, pending: false, source: null }, select: { amount: true, loanId: true, type: true } }),
        loanPrestacoes(uid),
      ])
      const portfolioValue = assets.reduce((s, a) => s + a.value, 0)
      const invested = assets.reduce((s, a) => s + a.invested, 0)
      let loanOutstanding = 0
      let loanNextPaymentTotal = 0
      for (const loan of loans) {
        try {
          const k = computeKpis({
            capital: loan.capital, prazoMeses: loan.prazoMeses, tanFixa: loan.tanFixa,
            mesesFixos: loan.mesesFixos, spread: loan.spread, euribor: loan.euribor,
            dataInicio: loan.dataInicio,
            amortizacoes: loan.amortizations.map((a) => ({ ym: a.ym, valor: a.valor, modo: a.modo as 'prazo' | 'prestacao' })),
          })
          loanOutstanding += k.capitalAtual
          loanNextPaymentTotal += k.proximaPrestacao
        } catch { /* skip uncomputable loan */ }
      }
      const monthlyIncome = incomes.reduce((s, i) => s + i.amount, 0)
      const monthlyExpenses = expenses.reduce((s, e) => s + (e.type === 'fixed' ? syncedAmount(e, prest) : e.amount), 0)
      return {
        name: firstName(mm.user.name),
        isMe: mm.userId === me.userId,
        portfolioValue,
        invested,
        loanOutstanding,
        loanNextPaymentTotal,
        monthlyIncome,
        monthlyExpenses,
        monthlyBalance: monthlyIncome - monthlyExpenses,
      }
    }))

    const combined = perMember.reduce((acc, m) => ({
      portfolioValue: acc.portfolioValue + m.portfolioValue,
      invested: acc.invested + m.invested,
      gainLoss: acc.gainLoss + (m.portfolioValue - m.invested),
      loanOutstanding: acc.loanOutstanding + m.loanOutstanding,
      loanNextPaymentTotal: acc.loanNextPaymentTotal + m.loanNextPaymentTotal,
      monthlyIncome: acc.monthlyIncome + m.monthlyIncome,
      monthlyExpenses: acc.monthlyExpenses + m.monthlyExpenses,
      monthlyBalance: acc.monthlyBalance + m.monthlyBalance,
    }), { portfolioValue: 0, invested: 0, gainLoss: 0, loanOutstanding: 0, loanNextPaymentTotal: 0, monthlyIncome: 0, monthlyExpenses: 0, monthlyBalance: 0 })

    res.json({ householdName: me.household.name, members: perMember, combined })
  } catch (err) {
    console.error('GET /api/household/overview failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
