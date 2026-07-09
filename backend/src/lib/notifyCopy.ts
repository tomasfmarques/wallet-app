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
    // Monthly digest email (WS4)
    digestSubject: 'Wallet360 — o teu resumo de {{month}}',
    digestTitle: 'O teu resumo de {{month}}',
    digestBudgetTitle: 'Saldo do mês',
    digestIncome: 'Receitas',
    digestExpenses: 'Despesas',
    digestBalance: 'Saldo',
    digestVsPlan: 'Plano mensal: {{value}}',
    digestPlanOnly: 'Sem extrato importado neste mês — valores do plano.',
    digestTopCats: 'Maiores categorias de despesa',
    digestPortfolioTitle: 'Investimentos',
    digestPortfolioValue: 'Valor da carteira',
    digestPortfolioGain: 'Ganho / perda',
    digestLoansTitle: 'Créditos',
    digestLoanLine: '{{name}}: {{outstanding}} em dívida ({{pct}} pago) · prestação {{payment}}',
    digestRevisionLine: 'Revisão em {{ym}}: prestação projetada {{projected}} ({{delta}}/mês)',
    digestFooter: 'Recebes este resumo mensal porque tens conta na Wallet360.',
    digestUnsubscribe: 'Deixar de receber',
    digestOpenApp: 'Abrir a Wallet360',
  },
  en: {
    paymentTitle: 'Payment tomorrow',
    paymentBody: 'Tomorrow: {{name}} — {{amount}}.',
    euriborTitle: 'Payment revision this month',
    euriborBody: '{{name}}: your payment should go from {{current}} to {{projected}} ({{delta}}/month).',
    importTitle: '{{month}} statement',
    importBody: "You haven't imported this month's statement yet. Import it to keep your balance up to date.",
    // Monthly digest email (WS4)
    digestSubject: 'Wallet360 — your {{month}} summary',
    digestTitle: 'Your {{month}} summary',
    digestBudgetTitle: 'Month balance',
    digestIncome: 'Income',
    digestExpenses: 'Expenses',
    digestBalance: 'Balance',
    digestVsPlan: 'Monthly plan: {{value}}',
    digestPlanOnly: 'No statement imported this month — plan values shown.',
    digestTopCats: 'Top expense categories',
    digestPortfolioTitle: 'Investments',
    digestPortfolioValue: 'Portfolio value',
    digestPortfolioGain: 'Gain / loss',
    digestLoansTitle: 'Credits',
    digestLoanLine: '{{name}}: {{outstanding}} outstanding ({{pct}} paid) · payment {{payment}}',
    digestRevisionLine: 'Revision in {{ym}}: projected payment {{projected}} ({{delta}}/month)',
    digestFooter: 'You get this monthly summary because you have a Wallet360 account.',
    digestUnsubscribe: 'Unsubscribe',
    digestOpenApp: 'Open Wallet360',
  },
}

export function notifyText(lang: Lang, key: string, vars: Record<string, string> = {}): string {
  const template = NOTIFY_COPY[lang][key] ?? NOTIFY_COPY.pt[key] ?? key
  return interpolate(template, vars)
}
