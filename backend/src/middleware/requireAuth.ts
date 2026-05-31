import { Request, Response, NextFunction } from 'express'

// Extend express-session with our custom fields
declare module 'express-session' {
  interface SessionData {
    userId?: string
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Unauthorized — please sign in' })
    return
  }
  next()
}
