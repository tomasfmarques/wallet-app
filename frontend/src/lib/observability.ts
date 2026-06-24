// ── Frontend error monitoring (gated + lazy) ─────────────────────
// Mirrors backend lib/observability.ts: does nothing unless VITE_SENTRY_DSN is
// set. Crucially, @sentry/react is **dynamically imported** only when a DSN
// exists, so the default build never bundles it into the initial chunk — that's
// why frontend Sentry was originally deferred (bundle weight). When a DSN is
// present, Vite serves it as a separate on-demand chunk fetched at startup.
export async function initObservability(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      // Error capture only — no performance tracing or session replay (cost/PII).
      tracesSampleRate: 0,
    })
  } catch {
    // Never let monitoring setup break app boot.
  }
}
