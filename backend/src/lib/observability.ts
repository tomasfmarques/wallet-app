// ── Observability ────────────────────────────────────────────────
// Thin wrapper around Sentry. It only does anything when SENTRY_DSN is set
// (mirrors the SMTP-optional pattern in lib/email.ts): no DSN → fully inert, so
// local dev and any deploy without the env var behave exactly as before.
//
// We use manual capture (captureException) rather than Sentry's auto-instrumenting
// Express integration, so initialisation order doesn't matter and there's nothing
// to import before the rest of the app. Errors are funnelled here from the single
// error-handling middleware in index.ts.

import * as Sentry from '@sentry/node'

let enabled = false

export function initObservability(): void {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // No performance tracing for now — error capture only (cheap, no sampling cost).
    tracesSampleRate: 0,
  })
  enabled = true
  console.log('🛰️  Sentry error monitoring enabled')
}

export function observabilityEnabled(): boolean {
  return enabled
}

/**
 * Capture an error with optional context (e.g. requestId, route, userId).
 * No-op when Sentry isn't configured.
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
