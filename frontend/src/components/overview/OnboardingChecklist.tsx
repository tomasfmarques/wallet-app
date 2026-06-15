import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('overview')
  const { user } = useAuth()
  const key = `w360:onboarding-dismissed:${user?.id ?? 'anon'}`

  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(key) === '1' } catch { return false }
  })

  const steps: Step[] = [
    { done: hasLoan, label: t('onboarding.loanLabel'), desc: t('onboarding.loanDesc'), to: '/loan', cta: t('onboarding.loanCta') },
    { done: hasInvestment, label: t('onboarding.investLabel'), desc: t('onboarding.investDesc'), to: '/investments', cta: t('onboarding.investCta') },
    { done: hasBudget, label: t('onboarding.budgetLabel'), desc: t('onboarding.budgetDesc'), to: '/budget', cta: t('onboarding.budgetCta') },
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
          <h2 className="onboarding-title">{t('onboarding.title')}</h2>
          <p className="onboarding-sub">{t('onboarding.sub', { done: doneCount, total: steps.length })}</p>
        </div>
        <button type="button" className="onboarding-dismiss" onClick={dismiss} aria-label={t('onboarding.dismiss')}>✕</button>
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
              ? <span className="onboarding-step-tag">{t('onboarding.done')}</span>
              : <Link to={s.to} className="btn btn-primary btn-sm">{s.cta}</Link>}
          </li>
        ))}
      </ol>
    </div>
  )
}

export default OnboardingChecklist
