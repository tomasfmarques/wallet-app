import { prisma } from './prisma'
import { normalizeEmail } from './normalizeEmail'

// Single place for the email→user lookup with the legacy-casing fallback:
// looks up by the normalized form first; if that misses and the raw input has
// different casing, retries with the raw input (accounts created before the
// 2026-07 normalization may be stored mixed-case). Both queries are exact
// findUnique matches on the email column — two casings of the SAME input, so
// this can never cross into a different account.
export async function findUserByEmail(rawEmail: string) {
  const norm = normalizeEmail(rawEmail)
  return (
    (await prisma.user.findUnique({ where: { email: norm } })) ??
    (rawEmail !== norm ? await prisma.user.findUnique({ where: { email: rawEmail } }) : null)
  )
}
