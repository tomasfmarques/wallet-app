// ── Shared TypeScript types (mirror the DB schema) ───────────────

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
}

export interface Loan {
  id: string
  userId: string
  capital: number
  prazoMeses: number
  tanFixa: number
  mesesFixos: number
  spread: number
  euribor: number
  dataInicio: string // "AAAA-MM"
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
}
