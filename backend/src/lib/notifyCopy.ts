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
    digestWedgeTitle: 'Amortizar ou investir?',
    digestWedgeInvestir: 'Com {{amount}} no crédito {{name}}, investir rende {{gain}} líquidos — mais do que os {{saved}} de juros que poupavas a amortizar.',
    digestWedgeAmortizar: 'Com {{amount}} no crédito {{name}}, amortizar poupa {{saved}} de juros — mais do que os {{gain}} líquidos que rendia investido.',
    digestWedgeEquivalente: 'Com {{amount}} no crédito {{name}}, amortizar ({{saved}}) e investir ({{gain}}) dão praticamente o mesmo.',
    digestLoansTitle: 'Créditos',
    digestLoanLine: '{{name}}: {{outstanding}} em dívida ({{pct}} pago) · prestação {{payment}}',
    digestRevisionLine: 'Revisão em {{ym}}: prestação projetada {{projected}} ({{delta}}/mês)',
    digestFooter: 'Recebes este resumo mensal porque tens conta na Wallet360.',
    digestUnsubscribe: 'Deixar de receber',
    digestOpenApp: 'Abrir a Wallet360',
    // Signup email verification (S3/F7)
    verifySubject: 'Wallet360 — confirma o teu email',
    verifyTitle: 'Confirma o teu email',
    verifyIntro: 'Falta um passo para a tua conta Wallet360 ficar completa. Clica no botão abaixo para confirmares que este endereço é teu. O link expira em 24 horas.',
    verifyCta: 'Confirmar email',
    verifyIgnore: 'Se não criaste esta conta, ignora este email — sem a confirmação, o endereço não é usado.',
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
    digestWedgeTitle: 'Pay off or invest?',
    digestWedgeInvestir: 'Putting {{amount}} into the {{name}} loan: investing earns {{gain}} net — more than the {{saved}} of interest you would save by paying it down.',
    digestWedgeAmortizar: 'Putting {{amount}} into the {{name}} loan: paying it down saves {{saved}} of interest — more than the {{gain}} net it would earn invested.',
    digestWedgeEquivalente: 'Putting {{amount}} into the {{name}} loan: paying down ({{saved}}) and investing ({{gain}}) come out about the same.',
    digestLoansTitle: 'Credits',
    digestLoanLine: '{{name}}: {{outstanding}} outstanding ({{pct}} paid) · payment {{payment}}',
    digestRevisionLine: 'Revision in {{ym}}: projected payment {{projected}} ({{delta}}/month)',
    digestFooter: 'You get this monthly summary because you have a Wallet360 account.',
    digestUnsubscribe: 'Unsubscribe',
    digestOpenApp: 'Open Wallet360',
    // Signup email verification (S3/F7)
    verifySubject: 'Wallet360 — confirm your email',
    verifyTitle: 'Confirm your email',
    verifyIntro: 'One step left to finish setting up your Wallet360 account. Click the button below to confirm this address is yours. The link expires in 24 hours.',
    verifyCta: 'Confirm email',
    verifyIgnore: "If you didn't create this account, ignore this email — without the confirmation the address goes unused.",
  },
}

export function notifyText(lang: Lang, key: string, vars: Record<string, string> = {}): string {
  const template = NOTIFY_COPY[lang][key] ?? NOTIFY_COPY.pt[key] ?? key
  return interpolate(template, vars)
}
