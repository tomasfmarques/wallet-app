import { prisma } from './prisma'

// ── Session invalidation ─────────────────────────────────────────
// After a password change/reset, every OTHER session for the user must die —
// otherwise a stolen session survives the very action a victim takes to evict
// the thief. Prod sessions live in the Postgres "session" table (created by
// connect-pg-simple, NOT part of the Prisma schema — hence raw SQL; the row's
// `sess` JSON carries our userId). Dev uses the in-memory store, which a
// backend restart clears anyway, so this is a no-op off Postgres.

export async function destroyOtherSessions(userId: string, currentSid?: string): Promise<void> {
  if (!process.env.DATABASE_URL?.startsWith('postgres')) return
  try {
    if (currentSid) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "session" WHERE sess::jsonb->>'userId' = $1 AND sid <> $2`,
        userId,
        currentSid,
      )
    } else {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "session" WHERE sess::jsonb->>'userId' = $1`,
        userId,
      )
    }
  } catch (err) {
    // Best-effort hardening: a cleanup failure (e.g. the table not existing on
    // a fresh deploy) must never fail the password change itself.
    console.error('destroyOtherSessions failed:', err)
  }
}
