// ── Email normalization ──────────────────────────────────────────
// Emails are compared and stored lowercase+trimmed everywhere (signup, login,
// forgot-password, Google sign-in). Before 2026-07 signup/login used the raw
// string, so a pre-existing account MAY be stored with its original casing —
// read paths keep a raw-input fallback lookup for those legacy rows; write
// paths always store the normalized form.

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
