import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth'
// import { prisma } from '../lib/prisma'

const router = Router()

router.use(requireAuth)

// GET /api/portfolio — assets + settings
router.get('/', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// POST /api/portfolio/assets
router.post('/assets', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// PUT /api/portfolio/assets/:id
router.put('/assets/:id', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// DELETE /api/portfolio/assets/:id
router.delete('/assets/:id', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// POST /api/portfolio/assets/:id/reforcar
router.post('/assets/:id/reforcar', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

// PUT /api/portfolio/settings
router.put('/settings', async (_req, res) => {
  res.status(501).json({ error: 'Not implemented yet' })
})

export default router
