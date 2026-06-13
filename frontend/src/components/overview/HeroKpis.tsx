import { Link } from 'react-router-dom'
import { eur, eurSigned } from '@/lib/format'

interface Props {
  portfolioValue: number | null
  loanRemaining: number | null
  monthlyNet: number | null
  monthlyIncome: number | null
  // Imported-but-unclassified lines (pending fixed/variable triage). They don't
  // count toward the KPI totals yet, so when income is still 0 we must NOT render
  // a red "deficit" — that reads as a broken app right after a statement import.
  pendingCount?: number
  // When set, the income/saldo figures are the latest imported REAL month (not
  // the recurring plan) — shown for import-only users with no manual plan.
  realYm?: string
}

// Top-of-page summary: 4 stat cards with icon chips. Each card links into its
// module (like the module cards below). Numbers null = module not configured
// yet — render "—" instead of crashing.
export function HeroKpis({ portfolioValue, loanRemaining, monthlyNet, monthlyIncome, pendingCount = 0, realYm }: Props) {
  const netPositive = monthlyNet != null && monthlyNet >= 0
  // Guard: nothing classified yet but there ARE imported lines waiting. Show a
  // neutral "por classificar" prompt instead of a misleading 0 €/−€ deficit.
  const awaitingClassification = pendingCount > 0 && (monthlyIncome == null || monthlyIncome === 0)
  return (
    <div className="hero-grid">
      <Link to="/investments" className="hero-card hero-card-primary">
        <div className="hero-card-top">
          <div className="hero-label">VALOR DA CARTEIRA</div>
          <span className="hero-icon" aria-hidden>📈</span>
        </div>
        <div className="hero-value">{portfolioValue != null ? eur(portfolioValue) : '—'}</div>
        <div className="hero-meta">Investimentos</div>
      </Link>

      <Link to="/budget" className={`hero-card ${awaitingClassification ? '' : netPositive ? 'hero-card-good' : monthlyNet != null ? 'hero-card-bad' : ''}`}>
        <div className="hero-card-top">
          <div className="hero-label">SALDO MENSAL</div>
          <span className="hero-icon" aria-hidden>{awaitingClassification ? '⚖️' : netPositive ? '🟢' : monthlyNet != null ? '🔴' : '⚖️'}</span>
        </div>
        <div className="hero-value">
          {awaitingClassification ? '—' : monthlyNet != null ? eurSigned(monthlyNet) : '—'}
        </div>
        <div className="hero-meta">
          {awaitingClassification
            ? `Classifica ${pendingCount} ${pendingCount === 1 ? 'importação' : 'importações'}`
            : monthlyNet != null
            ? (realYm ? `Real · ${realYm}` : netPositive ? 'Estás a poupar' : 'A gastar mais do que ganhas')
            : 'Configura orçamento'}
        </div>
      </Link>

      <Link to="/budget" className="hero-card">
        <div className="hero-card-top">
          <div className="hero-label">RECEITAS MENSAIS</div>
          <span className="hero-icon" aria-hidden>💸</span>
        </div>
        <div className="hero-value">{awaitingClassification ? '—' : monthlyIncome != null ? eur(monthlyIncome) : '—'}</div>
        <div className="hero-meta">
          {awaitingClassification ? `${pendingCount} por classificar` : realYm ? `Real · ${realYm}` : 'Receitas ativas'}
        </div>
      </Link>

      <Link to="/loan" className="hero-card">
        <div className="hero-card-top">
          <div className="hero-label">CAPITAL EM DÍVIDA</div>
          <span className="hero-icon" aria-hidden>🏠</span>
        </div>
        <div className="hero-value">{loanRemaining != null ? eur(loanRemaining) : '—'}</div>
        <div className="hero-meta">Crédito</div>
      </Link>
    </div>
  )
}

export default HeroKpis
