import { Link } from 'react-router-dom'
import { eur, eurSigned } from '@/lib/format'

interface Props {
  portfolioValue: number | null
  loanRemaining: number | null
  monthlyNet: number | null
  monthlyIncome: number | null
}

// Top-of-page summary: 4 stat cards with icon chips. Each card links into its
// module (like the module cards below). Numbers null = module not configured
// yet — render "—" instead of crashing.
export function HeroKpis({ portfolioValue, loanRemaining, monthlyNet, monthlyIncome }: Props) {
  const netPositive = monthlyNet != null && monthlyNet >= 0
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

      <Link to="/budget" className={`hero-card ${netPositive ? 'hero-card-good' : monthlyNet != null ? 'hero-card-bad' : ''}`}>
        <div className="hero-card-top">
          <div className="hero-label">SALDO MENSAL</div>
          <span className="hero-icon" aria-hidden>{netPositive ? '🟢' : monthlyNet != null ? '🔴' : '⚖️'}</span>
        </div>
        <div className="hero-value">
          {monthlyNet != null ? eurSigned(monthlyNet) : '—'}
        </div>
        <div className="hero-meta">
          {monthlyNet != null
            ? (netPositive ? 'Estás a poupar' : 'A gastar mais do que ganhas')
            : 'Configura orçamento'}
        </div>
      </Link>

      <Link to="/budget" className="hero-card">
        <div className="hero-card-top">
          <div className="hero-label">RECEITAS MENSAIS</div>
          <span className="hero-icon" aria-hidden>💸</span>
        </div>
        <div className="hero-value">{monthlyIncome != null ? eur(monthlyIncome) : '—'}</div>
        <div className="hero-meta">Receitas ativas</div>
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
