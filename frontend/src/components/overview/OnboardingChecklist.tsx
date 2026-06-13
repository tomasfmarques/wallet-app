import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  hasLoan: boolean
  hasInvestment: boolean
  hasBudget: boolean
}

interface Step {
  done: boolean
  label: string
  desc: string
  to: string
  cta: string
}

// First-run guide (MARKET-FEEDBACK #3: time-to-value < 2 min). On an account that
// isn't fully set up, show a dismissible 3-step starter that deep-links into each
// module. Auto-hides once all three are done; dismissal is remembered per user.
export function OnboardingChecklist({ hasLoan, hasInvestment, hasBudget }: Props) {
  const { user } = useAuth()
  const key = `w360:onboarding-dismissed:${user?.id ?? 'anon'}`

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === '1' } catch { return false }
  })

  const steps: Step[] = [
    { done: hasLoan, label: 'Adicionar crédito', desc: 'Casa, carro ou pessoal — simula juros e amortizações.', to: '/loan', cta: 'Adicionar' },
    { done: hasInvestment, label: 'Adicionar investimento', desc: 'Ações, ETFs ou certificados — acompanha a carteira.', to: '/investments', cta: 'Adicionar' },
    { done: hasBudget, label: 'Importar extrato', desc: 'Importa um extrato bancário e vê o teu saldo real.', to: '/budget', cta: 'Importar' },
  ]

  const doneCount = steps.filter((s) => s.done).length
  if (doneCount === steps.length || dismissed) return null

  const dismiss = () => {
    try { localStorage.setItem(key, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div className="onboarding-card">
      <div className="onboarding-head">
        <div>
          <h2 className="onboarding-title">Bem-vindo ao Wallet360 👋</h2>
          <p className="onboarding-sub">Três passos para começares — {doneCount}/{steps.length} concluídos.</p>
        </div>
        <button type="button" className="onboarding-dismiss" onClick={dismiss} aria-label="Dispensar">✕</button>
      </div>
      <ol className="onboarding-steps">
        {steps.map((s, i) => (
          <li key={s.to} className={`onboarding-step ${s.done ? 'is-done' : ''}`}>
            <span className="onboarding-step-mark" aria-hidden>{s.done ? '✓' : i + 1}</span>
            <span className="onboarding-step-text">
              <span className="onboarding-step-label">{s.label}</span>
              <span className="onboarding-step-desc">{s.desc}</span>
            </span>
            {s.done
              ? <span className="onboarding-step-tag">Feito</span>
              : <Link to={s.to} className="btn btn-primary btn-sm">{s.cta}</Link>}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default OnboardingChecklist
