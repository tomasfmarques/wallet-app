import type { Request, Response, NextFunction } from 'express'

// Gate route handlers behind a valid session.
// The SessionData augmentation lives in ../types/session.d.ts.
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) {
    res.status(401).json({ error: 'Não autenticado' })
    return
  }
  next()
}
