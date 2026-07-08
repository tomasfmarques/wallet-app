// ── Notification copy (backend-side i18n) ────────────────────────
// The backend has no i18next; notifications and emails pick strings from this
// dictionary using the user's stored language (PortfolioSettings.language,
// fallback pt — same convention as the app). Interpolation: {{var}}.

export type Lang = 'pt' | 'en'

export function asLang(v: unknown): Lang {
  return v === 'en' ? 'en' : 'pt'
}

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}

export const NOTIFY_COPY: Record<Lang, Record<string, string>> = {
  pt: {
    paymentTitle: 'Pagamento amanhã',
    paymentBody: 'Amanhã: {{name}} — {{amount}}.',
    euriborTitle: 'Revisão da prestação este mês',
    euriborBody: '{{name}}: a prestação deve passar de {{current}} para {{projected}} ({{delta}}/mês).',
    importTitle: 'Extrato de {{month}}',
    importBody: 'Ainda não importaste o extrato deste mês. Importa para manteres o Saldo em dia.',
  },
  en: {
    paymentTitle: 'Payment tomorrow',
    paymentBody: 'Tomorrow: {{name}} — {{amount}}.',
    euriborTitle: 'Payment revision this month',
    euriborBody: '{{name}}: your payment should go from {{current}} to {{projected}} ({{delta}}/month).',
    importTitle: '{{month}} statement',
    importBody: "You haven't imported this month's statement yet. Import it to keep your balance up to date.",
  },
}

export function notifyText(lang: Lang, key: string, vars: Record<string, string> = {}): string {
  const template = NOTIFY_COPY[lang][key] ?? NOTIFY_COPY.pt[key] ?? key
  return interpolate(template, vars)
}
