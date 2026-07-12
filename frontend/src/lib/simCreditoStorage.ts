// ── Shared sessionStorage bridge between the public credit + compare tools ──
// docs/landing-spec.md WS-L3.3: "Amortizar ou investir" can prefill its loan
// fields from the "Crédito habitação" simulator via sessionStorage — purely
// client-side, NEVER sent to any server (no network write, ever).

export interface SimCreditoState {
  montante: string
  prazoAnos: string
  rateType: 'fixed' | 'mixed'
  tan: string
  tanFixed: string
  fixedYears: string
  spread: string
  euriborPct: string
}

export const SIM_CREDITO_KEY = 'wallet360.simCredito'

export const SIM_CREDITO_DEFAULTS: SimCreditoState = {
  montante: '200000',
  prazoAnos: '30',
  rateType: 'mixed',
  tan: '4.5',
  tanFixed: '3.2',
  fixedYears: '3',
  spread: '1.1',
  euriborPct: '2.5',
}

export function readSimCredito(): SimCreditoState {
  try {
    const raw = sessionStorage.getItem(SIM_CREDITO_KEY)
    if (raw) return { ...SIM_CREDITO_DEFAULTS, ...JSON.parse(raw) }
  } catch { /* ignore — fall back to defaults */ }
  return SIM_CREDITO_DEFAULTS
}

export function writeSimCredito(state: SimCreditoState): void {
  try { sessionStorage.setItem(SIM_CREDITO_KEY, JSON.stringify(state)) } catch { /* best-effort only */ }
}

/** True when a real (non-default) value was found in sessionStorage. */
export function hasSavedSimCredito(): boolean {
  try { return sessionStorage.getItem(SIM_CREDITO_KEY) != null } catch { return false }
}
