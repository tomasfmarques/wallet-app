import { Router } from 'express'
// import bcrypt from 'bcryptjs'
// import { prisma } from '../lib/prisma'

const router = Router()

// POST /api/auth/signup
router.post('/signup', async (_req, res) => {
  // TODO: validate body (email, password, name)
  // TODO: hash password with bcrypt
  // TODO: create user in DB
  // TODO: set req.session.userId
  res.status(501).json({ error: 'Not implemented yet' })
})

// POST /api/auth/login
router.post('/login', async (_req, res) => {
  // TODO: find user by email
  // TODO: compare password hash
  // TODO: set req.session.userId
  res.status(501).json({ error: 'Not implemented yet' })
})

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true })
  })
})

export default router
