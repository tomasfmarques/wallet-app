import { eur, eurSigned } from '@/lib/format'

interface Props {
  portfolioValue: number | null
  loanRemaining: number | null
  monthlyNet: number | null
  monthlyIncome: number | null
}

// Top-of-page summary: 4 large stat cards. Numbers null = module not
// configured yet — render "—" instead of crashing.
export function HeroKpis({ portfolioValue, loanRemaining, monthlyNet, monthlyIncome }: Props) {
  const netPositive = monthlyNet != null && monthlyNet >= 0
  return (
    <div className="hero-grid">
      <div className="hero-card hero-card-primary">
        <div className="hero-label">VALOR DA CARTEIRA</div>
        <div className="hero-value">{portfolioValue != null ? eur(portfolioValue) : '—'}</div>
        <div className="hero-meta">Investimentos</div>
      </div>

      <div className={`hero-card ${netPositive ? 'hero-card-good' : monthlyNet != null ? 'hero-card-bad' : ''}`}>
        <div className="hero-label">SALDO MENSAL</div>
        <div className="hero-value">
          {monthlyNet != null ? eurSigned(monthlyNet) : '—'}
        </div>
        <div className="hero-meta">
          {monthlyNet != null
            ? (netPositive ? 'Estás a poupar' : 'A gastar mais do que ganhas')
            : 'Configura orçamento'}
        </div>
      </div>

      <div className="hero-card">
        <div className="hero-label">RECEITAS MENSAIS</div>
        <div className="hero-value">{monthlyIncome != null ? eur(monthlyIncome) : '—'}</div>
        <div className="hero-meta">Receitas ativas</div>
      </div>

      <div className="hero-card">
        <div className="hero-label">CAPITAL EM DÍVIDA</div>
        <div className="hero-value">{loanRemaining != null ? eur(loanRemaining) : '—'}</div>
        <div className="hero-meta">Empréstimo casa</div>
      </div>
    </div>
  )
}

export default HeroKpis
