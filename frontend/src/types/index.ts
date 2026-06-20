// ── Shared TypeScript types (mirror the DB schema) ───────────────

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  hasPassword: boolean
}

export interface Loan {
  id: string
  userId: string
  name: string         // e.g. "Casa", "Carro"
  capital: number
  prazoMeses: number
  tanFixa: number
  mesesFixos: number
  spread: number
  euribor: number
  dataInicio: string // "AAAA-MM"
  bonificacaoMensal?: number | null
  bonificacaoMeses?: number | null
  taeg?: number | null
}

export interface LoanPayment {
  id: string
  loanId: string
  ym: string
  paid: boolean
  real: number | null
}

export interface LoanAmortization {
  id: string
  loanId: string
  ym: string
  valor: number
  modo: 'prazo' | 'prestacao'
}

export interface EuriborHistory {
  id: string
  loanId: string
  ym: string
  valor: number
}

export interface PortfolioAsset {
  id: string
  userId: string
  name: string
  ticker: string
  qty: number
  invested: number
  value: number
  monthly: number
  expectedReturn: number
  lastPriceEur?: number | null   // EUR/share at last refresh; drives value updates
}

export interface PortfolioFlow {
  id: string
  assetId: string
  ym: string
  amount: number
}

export interface PortfolioSettings {
  gInc: number  // annual increase % for contributions
  gFY: number   // years without increase
  gH: number    // horizon in years
  watchlistSymbols: string | null  // comma-separated tickers; null = use default
  language: string | null          // 'pt' | 'en'; null = follow device/browser
}

export interface Income {
  id: string
  userId: string
  name: string
  amount: number
  type: ExpenseType          // fixed | variable (shared axis with expenses)
  category: string | null
  active: boolean
  pending: boolean           // true = imported, awaiting fixed/variable classification
  dayOfMonth: number | null  // set on statement import; used for dedup
  source: string | null      // origin bank/import label; null = manual
  startYm: string | null
  endYm: string | null
  notes: string | null
  createdAt: string
}

export type ExpenseType = 'fixed' | 'variable'

export interface Expense {
  id: string
  userId: string
  name: string
  amount: number
  type: ExpenseType
  category: string | null
  dayOfMonth: number | null
  active: boolean
  pending: boolean           // true = imported, awaiting fixed/variable classification
  source: string | null     // origin bank/import label; null = manual
  loanId: string | null     // linked Loan; amount is synced from its prestação (#9)
  matchHint: string | null  // bank-statement description → matches imports to this row
  startYm: string | null
  endYm: string | null
  notes: string | null
  createdAt: string
}
