// ── Enable Banking (AIS) client ──────────────────────────────────
// Replaces the retired GoCardless Bank Account Data integration. Enable Banking
// is a FIN-FSA-regulated AISP; the free "restricted production" tier returns
// real transaction data for the bank accounts the app owner links in the
// Control Panel (see docs/bank-sync-spec.md).
//
// Auth: every request carries a short-lived RS256 JWT that WE sign with the
// application's private key — there's no long-lived bearer secret. The private
// key lives ONLY in an env var (base64-encoded PEM), never in the repo, never
// sent to the client. Signing uses Node's built-in `crypto` — no new dep.
//
// Gated on ENABLE_BANKING_APP_ID + ENABLE_BANKING_PRIVATE_KEY_B64. Until both
// are set, `isConfigured()` is false and routes/bank.ts reports the feature off.

import { createSign } from 'crypto'

const EB_BASE = 'https://api.enablebanking.com'

interface EbConfig { appId: string; privateKey: string }

function config(): EbConfig | null {
  const appId = process.env.ENABLE_BANKING_APP_ID
  const b64 = process.env.ENABLE_BANKING_PRIVATE_KEY_B64
  if (!appId || !b64) return null
  let privateKey: string
  try { privateKey = Buffer.from(b64, 'base64').toString('utf8') } catch { return null }
  // A PEM private key is required; reject a mis-set var early (don't log it).
  if (!privateKey.includes('PRIVATE KEY')) { console.error('ENABLE_BANKING_PRIVATE_KEY_B64 is not a PEM private key'); return null }
  return { appId, privateKey }
}

export function isConfigured(): boolean {
  return config() !== null
}

// ── RS256 JWT (self-signed, 1 h, cached ~2 min early) ────────────
let jwtCache: { token: string; expiry: number } | null = null

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function getJwt(cfg: EbConfig): string {
  if (jwtCache && jwtCache.expiry > Date.now()) return jwtCache.token
  const now = Math.floor(Date.now() / 1000)
  const header = { typ: 'JWT', alg: 'RS256', kid: cfg.appId }
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now, exp: now + 3600 }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const signature = createSign('RSA-SHA256').update(signingInput).sign(cfg.privateKey)
  const token = `${signingInput}.${b64url(signature)}`
  jwtCache = { token, expiry: (payload.exp - 120) * 1000 }
  return token
}

async function eb<T>(path: string, init?: RequestInit): Promise<T | null> {
  const cfg = config()
  if (!cfg) return null
  try {
    const res = await fetch(`${EB_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getJwt(cfg)}`, ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      console.error(`Enable Banking ${init?.method ?? 'GET'} ${path} → ${res.status}`)
      return null
    }
    if (res.status === 204) return {} as T
    return await res.json() as T
  } catch (err) {
    console.error(`Enable Banking ${path} failed:`, err)
    return null
  }
}

// ── Types (only the fields we use) ───────────────────────────────
export interface EbAspsp { name: string; country: string; logo?: string | null }
export interface EbAccount { uid?: string; account_id?: { iban?: string }; name?: string; currency?: string }
export interface EbSession {
  session_id?: string
  status?: string                       // "AUTHORIZED" | "EXPIRED" | …
  accounts?: Array<string | EbAccount>  // POST returns objects; GET returns uid strings
  accounts_data?: Array<{ uid?: string }>
}
export interface EbTransaction {
  transaction_amount?: { amount?: string; currency?: string }
  credit_debit_indicator?: string       // "CRDT" | "DBIT"
  booking_date?: string                 // "YYYY-MM-DD"
  creditor?: { name?: string }
  debtor?: { name?: string }
  remittance_information?: string[]
  status?: string
  transaction_status?: string           // some ASPSPs use "BOOK" | "PDNG"
}

// ── ASPSP list (Portugal), cached 24 h ───────────────────────────
let aspspCache: { data: EbAspsp[]; expiry: number } | null = null
export async function getAspsps(country = 'PT'): Promise<EbAspsp[]> {
  if (aspspCache && aspspCache.expiry > Date.now()) return aspspCache.data
  const r = await eb<{ aspsps?: EbAspsp[] } | EbAspsp[]>(`/aspsps?country=${country}`)
  const list = Array.isArray(r) ? r : (r?.aspsps ?? [])
  if (list.length > 0) aspspCache = { data: list, expiry: Date.now() + 24 * 60 * 60 * 1000 }
  return list
}

// ── Consent / session lifecycle ──────────────────────────────────
// Start authorization → returns the bank's consent URL to send the user to.
export async function startAuth(params: {
  name: string; country: string; redirectUrl: string; state: string; validUntil: string
}): Promise<string | null> {
  const r = await eb<{ url?: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: params.validUntil },
      aspsp: { name: params.name, country: params.country },
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: 'personal',
    }),
  })
  return r?.url ?? null
}

// Exchange the ?code from the redirect for a session (+ its authorized accounts).
export async function createSession(code: string): Promise<EbSession | null> {
  return eb<EbSession>('/sessions', { method: 'POST', body: JSON.stringify({ code }) })
}

export async function getSession(sessionId: string): Promise<EbSession | null> {
  return eb<EbSession>(`/sessions/${encodeURIComponent(sessionId)}`)
}

export async function deleteSession(sessionId: string): Promise<void> {
  await eb(`/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}

// Normalize the two shapes the API uses for a session's account list into uids.
export function accountUids(session: EbSession): string[] {
  const out: string[] = []
  for (const a of session.accounts ?? []) {
    if (typeof a === 'string') out.push(a)
    else if (a?.uid) out.push(a.uid)
  }
  if (out.length === 0) {
    for (const a of session.accounts_data ?? []) if (a?.uid) out.push(a.uid)
  }
  return out
}

// All transactions for an account since `dateFrom` (YYYY-MM-DD), following the
// continuation_key pagination (guarded against runaway loops).
export async function getTransactions(accountUid: string, dateFrom: string): Promise<EbTransaction[]> {
  const all: EbTransaction[] = []
  let continuation: string | undefined
  let guard = 0
  do {
    const qs = new URLSearchParams({ date_from: dateFrom })
    if (continuation) qs.set('continuation_key', continuation)
    const r = await eb<{ transactions?: EbTransaction[]; continuation_key?: string }>(
      `/accounts/${encodeURIComponent(accountUid)}/transactions?${qs.toString()}`,
    )
    if (!r) break
    all.push(...(r.transactions ?? []))
    continuation = r.continuation_key || undefined
  } while (continuation && ++guard < 20)
  return all
}
