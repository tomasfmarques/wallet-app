import { randomBytes, createHash } from 'crypto'
import { prisma } from './prisma'

// ── Signup email verification (S3/F7) ────────────────────────────
// A SOFT gate: an unverified account can still use the app on its own data,
// but it can't do the things an unowned address makes dangerous —
//   1. receive outbound mail          (lib/digest.ts — sender reputation)
//   2. be auto-linked by Google       (routes/authGoogle.ts — the real F7
//      impersonation vector: squat victim@gmail.com with a password, wait for
//      the victim to sign in with Google, land in an account you control)
//   3. pull another person into a shared household (routes/household.ts)
// Locking a real user out of their own data over an email that never arrived
// would cost more than it buys, so login itself is deliberately not gated.

// Accounts that predate this feature were never asked to prove their address,
// so they are grandfathered instead of retroactively nagged and cut off from
// their digest. This is a CODE cutoff rather than a data backfill because prod
// deploys with `db push` and has no migration runner to carry a data fix
// (CLAUDE.md rule 2) — a backfill would have to be a manual Neon step, and if
// it were ever missed every legacy user would silently lose their digest.
//
// This date MUST NOT be in the future: "created before the cutoff" is what
// grandfathers an account, so a future date silently hands every NEW signup a
// free pass until it elapses. Set to the ship date at 00:00 UTC — every real
// account predates it by months, and every signup from the deploy onward is
// after it.
//
// Known, deliberate gap: an account created earlier on the ship date itself
// (00:00 UTC → deploy) is NOT grandfathered. That is the SAFE side of the
// trade, so don't "fix" it by moving the date forward. Being wrongly unverified
// costs a legacy user a banner and one click of Reenviar email — self-service
// and recoverable. Being wrongly verified is the F7 hole itself, silent and
// unrecoverable. When the two errors aren't symmetric, take the recoverable one.
export const VERIFICATION_LAUNCH = new Date('2026-07-16T00:00:00Z')

// A verification mail routinely gets opened the next morning, so this window is
// much wider than the 1h password-reset one. The token proves ownership, not a
// live session, so a longer life is cheap.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export interface VerifiableUser {
  emailVerifiedAt: Date | null
  createdAt: Date
}

export function isEmailVerified(user: VerifiableUser): boolean {
  return user.emailVerifiedAt !== null || user.createdAt < VERIFICATION_LAUNCH
}

export function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex')
}

// Single-use. Issuing invalidates any previous unused token so a resend doesn't
// leave several live links sitting in different copies of the mail.
export async function issueVerificationToken(userId: string): Promise<string> {
  await prisma.emailVerificationToken.updateMany({
    where: { userId, used: false },
    data: { used: true },
  })
  const plain = randomBytes(32).toString('hex')
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(plain),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  })
  return plain
}

export function verificationLink(origin: string, token: string): string {
  return `${origin}/verificar-email?token=${token}`
}
