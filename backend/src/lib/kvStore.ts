import { Redis } from '@upstash/redis'

// ── Shared counter store (rate-limit + brute-force lockout) ──────
// On Vercel each serverless invocation has its OWN memory, so in-memory counters
// barely throttle anything. When Upstash is configured (UPSTASH_REDIS_REST_URL +
// UPSTASH_REDIS_REST_TOKEN) we use it as a shared, TTL-expiring counter store;
// otherwise we fall back to an in-memory Map — identical to the previous
// behaviour, fine for single-instance/local dev. Gated like the other optional
// integrations (Sentry, GoCardless, broker key).

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN
const redis = url && token ? new Redis({ url, token }) : null

export function kvConfigured(): boolean {
  return redis !== null
}

// Per-instance fallback used only when Upstash isn't configured.
const mem = new Map<string, { count: number; resetAt: number }>()

// Increment a key inside a fixed TTL window; returns the new count + window end.
// Redis path is ~1 round-trip (a 2nd only on the first hit, to set the TTL).
export async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
  if (redis) {
    const count = await redis.incr(key)
    if (count === 1) await redis.pexpire(key, windowMs) // start the window on the first hit
    return { count, resetAt: Date.now() + windowMs }
  }
  const now = Date.now()
  const e = mem.get(key)
  if (!e || now > e.resetAt) { const v = { count: 1, resetAt: now + windowMs }; mem.set(key, v); return v }
  e.count++
  return { count: e.count, resetAt: e.resetAt }
}

// Current count without incrementing (expired/absent → 0).
export async function peek(key: string): Promise<number> {
  if (redis) return (await redis.get<number>(key)) ?? 0
  const e = mem.get(key)
  if (!e || Date.now() > e.resetAt) return 0
  return e.count
}

export async function clear(key: string): Promise<void> {
  if (redis) { await redis.del(key); return }
  mem.delete(key)
}
