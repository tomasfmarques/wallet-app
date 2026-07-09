// ── Merchant normalization key (backend) ─────────────────────────
// MUST stay in sync with frontend/src/lib/merchant.ts (learned classification
// rules break otherwise — see CLAUDE.md rule #3). Moved verbatim out of
// routes/budget.ts so lib code (digest) can reuse it without importing a
// router module. "CONTINENTE BELAS - Cartao 2824" → "continente belas".
export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')             // strip accents
    .replace(/-\s*(cartao|terminal|cart)\b.*$/i, '')     // drop "- Cartao 2824 …"
    .replace(/\b\d[\d.,/-]*\b/g, ' ')                    // drop numbers (card/ref)
    .replace(/[^a-z\s]/g, ' ')                           // drop punctuation
    .replace(/\s+/g, ' ')
    .trim()
}
