// ── Budget entry cadences ────────────────────────────────────────
// Incomes/expenses are stored with `amount` as the MONTHLY-equivalent (the
// budget is a monthly model). `frequency` only records the cadence the user
// entered at, so the UI can show/convert it (e.g. a €2400/yr bonus is stored
// amount=200, frequency=annual). Everything downstream keeps using `amount`.

export type Frequency = 'monthly' | 'weekly' | 'biweekly' | 'quarterly' | 'annual'
export const FREQUENCIES: Frequency[] = ['monthly', 'weekly', 'biweekly', 'quarterly', 'annual']

// per-period amount → monthly-equivalent multiplier
const FACTOR: Record<Frequency, number> = {
  monthly: 1,
  weekly: 52 / 12,
  biweekly: 26 / 12,
  quarterly: 1 / 3,
  annual: 1 / 12,
}

export function asFrequency(v: unknown): Frequency {
  return typeof v === 'string' && (FREQUENCIES as string[]).includes(v) ? (v as Frequency) : 'monthly'
}

/** Per-period amount → the monthly-equivalent we persist as `amount`. */
export function toMonthly(periodAmount: number, freq: Frequency): number {
  return periodAmount * FACTOR[freq]
}

/** Stored monthly-equivalent `amount` → the per-period amount for display/editing. */
export function fromMonthly(monthlyAmount: number, freq: Frequency): number {
  return monthlyAmount / FACTOR[freq]
}
