import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { requireAuth } from '../middleware/requireAuth'
import { prisma } from '../lib/prisma'

// NOTE: the DeletionLog model is intentionally NOT exported here — it is a
// system-level audit log (not user-scoped data) and must survive deletion. See
// schema comment + DELETE /api/me. Don't add it to the per-user backup.

const router = Router()
router.use(requireAuth)

// ── POST /api/export ─────────────────────────────────────────────
// Dumps everything for the current user as a single JSON document.
// Requires currentPassword for local-password accounts; Google-only
// users are allowed through with an active session (the Google token
// already proves their identity).
// Password hash, requisitionId, and session data are NEVER included.
router.post('/', async (req, res) => {
  try {
    const userId = req.session.userId!

    // Step-up authentication
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) { res.status(401).json({ error: 'Sessão inválida' }); return }

    if (user.passwordHash) {
      const { currentPassword } = req.body ?? {}
      if (typeof currentPassword !== 'string' || !currentPassword) {
        res.status(400).json({ errors: { currentPassword: 'Password atual obrigatória para exportar' } }); return
      }
      const ok = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!ok) {
        res.status(401).json({ errors: { currentPassword: 'Password incorreta' } }); return
      }
    }

    const [loans, assets, settings, incomes, expenses, classificationRules, bankConnections, importedTxns] = await Promise.all([
      prisma.loan.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
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
      prisma.bankConnection.findMany({
        where: { userId }, orderBy: { createdAt: 'asc' },
        select: { id: true, userId: true, institutionId: true, institutionName: true, logo: true, status: true, createdAt: true },
        // requisitionId excluded — it is a live bank-access handle, not backup data
      }),
      // Applied broker order ids — carried so CSV re-import dedup survives a restore.
      prisma.importedTxn.findMany({
        where: { userId }, orderBy: { createdAt: 'asc' },
        select: { source: true, externalId: true, createdAt: true },
      }),
    ])

    const payload = {
      meta: {
        appVersion: '0.1.0',
        exportedAt: new Date().toISOString(),
        schemaVersion: 1,
      },
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
      loans,
      portfolio: { assets, settings },
      budget: { incomes, expenses },
      classificationRules,
      bankConnections,
      importedTxns,
    }

    const stamp = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="wallet-export-${stamp}.json"`)
    res.send(JSON.stringify(payload, null, 2))
  } catch (err) {
    console.error('POST /api/export failed:', err)
    res.status(500).json({ error: 'Erro interno do servidor' })
  }
})

export default router
