import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// ── At-rest encryption for broker API credentials ────────────────
// A connected broker (e.g. Trading 212) API key is a real credential, so it's
// encrypted before it touches the DB (unlike GoCardless's opaque requisitionId).
// AES-256-GCM with a 32-byte key from BROKER_ENC_KEY (base64). Without that env
// var the broker integration is gated OFF (see brokerEncConfigured) — same
// pattern as the GoCardless credentials() gate in routes/bank.ts.
//
// Generate a key:  openssl rand -base64 32   → set as BROKER_ENC_KEY in Vercel.

function key(): Buffer | null {
  const raw = process.env.BROKER_ENC_KEY
  if (!raw) return null
  try {
    const b = Buffer.from(raw, 'base64')
    return b.length === 32 ? b : null
  } catch {
    return null
  }
}

export function brokerEncConfigured(): boolean {
  return key() !== null
}

// Returns "iv:tag:ciphertext" (each base64). Throws if not configured.
export function encryptSecret(plain: string): string {
  const k = key()
  if (!k) throw new Error('BROKER_ENC_KEY not configured')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':')
}

export function decryptSecret(enc: string): string {
  const k = key()
  if (!k) throw new Error('BROKER_ENC_KEY not configured')
  const [ivB, tagB, ctB] = enc.split(':')
  if (!ivB || !tagB || !ctB) throw new Error('Malformed ciphertext')
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(ivB, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8')
}
