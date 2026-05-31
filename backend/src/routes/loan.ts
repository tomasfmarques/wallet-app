import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
// import { prisma } from '../lib/prisma'

const router = Router()

router.use(requireAuth)

// GET /api/loan — return loan + payments + amortizations + euribor history
router.get('/', async (_req, res) => {
  // TODO: fetch loan for req.session.userId
  res.status(501).json({ error: 'Not implemented yet' })
})

// PUT /api/loan — upsert loan fields
router.put('/', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// PUT /api/loan/payments/:ym
router.put('/payments/:ym', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// POST /api/loan/amortizations
router.post('/amortizations', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// DELETE /api/loan/amortizations/:id
router.delete('/amortizations/:id', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// POST /api/loan/euribor
router.post('/euribor', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

export default router
