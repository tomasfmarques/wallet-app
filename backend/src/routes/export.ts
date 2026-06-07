import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'

const router = Router()
router.use(requireAuth)

// ── GET /api/export ──────────────────────────────────────────────
// Dumps everything for the current user as a single JSON document.
// Use it for backup or to seed a fresh install. Password hash and session
// data are NEVER included.
router.get('/', async (req, res) => {
  try {
    const userId = req.session.userId!

    const [user, loan, assets, settings, incomes, expenses, classificationRules] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, createdAt: true },
      }),
      prisma.loan.findFirst({
        where: { userId },
        include: {
          payments: { orderBy: { ym: 'asc' } },
          amortizations: { orderBy: { ym: 'asc' } },
          euriborHistory: { orderBy: { ym: 'asc' } },
        },
      }),
      prisma.portfolioAsset.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
        include: { flows: { orderBy: { ym: 'asc' } } },
      }),
      prisma.portfolioSettings.findUnique({ where: { userId } }),
      prisma.income.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
      prisma.expense.findMany({ where: { userId }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      prisma.classificationRule.findMany({ where: { userId }, orderBy: { matchKey: 'asc' } }),
    ])

    const payload = {
      meta: {
        appVersion: '0.1.0',
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
      },
      user,
      loan,
      portfolio: {
        assets,
        settings,
      },
      budget: {
        incomes,
        expenses,
      },
      classificationRules,
    }

    const stamp = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="wallet-export-${stamp}.json"`,
    )
    res.send(JSON.stringify(payload, null, 2))
  } catch (err) {
    console.error('GET /api/export failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
