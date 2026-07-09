// Normalize a transaction description down to a stable merchant key — same
// algorithm as the backend's merchantKey (backend/src/lib/merchantKey.ts);
// keep in sync. Used to group the Saldo page's variable transactions by merchant.
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/-\s*(cartao|terminal|cart)\b.*$/i, '')
    .replace(/\b\d[\d.,/-]*\b/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Pick a friendly display name for a merchant group: the shortest raw name. */
export function merchantDisplayName(names: string[]): string {
  return names.reduce((best, n) => (n.length < best.length ? n : best), names[0] ?? '')
}
