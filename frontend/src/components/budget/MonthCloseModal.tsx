import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { usePortfolio } from '@/hooks/usePortfolio'
import { useLoan } from '@/hooks/useLoan'
import { realMonth } from '@/lib/budgetReal'
import { eur, eur2, ymToLong, ymAddMonths, currentYm } from '@/lib/format'
import { categoryLabel } from '@/lib/categoryDictionary'
import type { Income, Expense } from '@/types'

// ── "Fecho do mês" — month-in-review ritual (WS5) ────────────────
// A stepped card review of the latest month with imported actuals: saldo,
// top categorias, variação vs mês anterior, património, streak. Opens
// automatically once per month after a statement import (localStorage
// `w360:monthClose:<ym>`), or manually from the Análise tab. Frontend-only:
// every number comes from data the Budget/Portfolio/Loan pages already load.

interface Props {
  open: boolean
  onClose: () => void
  incomes: Income[]
  expenses: Expense[]
  actualIncomes: Income[]
  actualExpenses: Expense[]
  ym: string
}

const SEEN_PREFIX = 'w360:monthClose:'

export function monthCloseSeen(ym: string): boolean {
  try { return localStorage.getItem(SEEN_PREFIX + ym) === 'seen' } catch { return true }
}

export function markMonthCloseSeen(ym: string): void {
  try { localStorage.setItem(SEEN_PREFIX + ym, 'seen') } catch { /* private mode */ }
}

// Latest month (≤ current) that has imported actuals — the month to "close".
export function latestActualsYm(actualIncomes: Income[], actualExpenses: Expense[]): string | null {
  const now = currentYm()
  const yms = [...actualIncomes, ...actualExpenses]
    .map((r) => r.startYm)
    .filter((ym): ym is string => !!ym && ym <= now)
  if (yms.length === 0) return null
  yms.sort() // "AAAA-MM" sorts lexicographically == chronologically
  return yms[yms.length - 1] ?? null
}

// Single source of ym month-math (lib/format) — don't reimplement locally.
const prevYmOf = (ym: string): string => ymAddMonths(ym, -1)

function activeInMonth(item: { active: boolean; startYm: string | null; endYm: string | null }, ym: string): boolean {
  if (!item.active) return false
  if (item.startYm && ym < item.startYm) return false
  if (item.endYm && ym > item.endYm) return false
  return true
}

const sum = (rows: Array<{ amount: number }>) => rows.reduce((s, r) => s + r.amount, 0)

export function MonthCloseModal({ open, onClose, incomes, expenses, actualIncomes, actualExpenses, ym }: Props) {
  const { t } = useTranslation('budget')
  const [step, setStep] = useState(0)
  const portfolio = usePortfolio()
  const loans = useLoan()

  const data = useMemo(() => {
    const real = realMonth(incomes, expenses, actualIncomes, actualExpenses, ym)
    const incomeReal = sum(real.incomes)
    const expensesReal = sum(real.fixedExpenses) + sum(real.variableExpenses)
    const balance = incomeReal - expensesReal

    const planNet =
      sum(incomes.filter((i) => activeInMonth(i, ym))) -
      sum(expenses.filter((e) => activeInMonth(e, ym)))

    // Top categories + biggest single movement (real expenses of the month).
    const realExp = [...real.fixedExpenses, ...real.variableExpenses]
    const catTotals = new Map<string, number>()
    for (const e of realExp) {
      const key = e.category ?? e.name
      catTotals.set(key, (catTotals.get(key) ?? 0) + e.amount)
    }
    const topCategories = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const biggest = [...realExp].sort((a, b) => b.amount - a.amount)[0] ?? null

    // Variation vs previous month's real expenses (only when prev has actuals).
    const prevReal = realMonth(incomes, expenses, actualIncomes, actualExpenses, prevYmOf(ym))
    const prevExpenses = prevReal.hasActuals ? sum(prevReal.fixedExpenses) + sum(prevReal.variableExpenses) : null
    const variationPct = prevExpenses && prevExpenses > 0 ? ((expensesReal - prevExpenses) / prevExpenses) * 100 : null

    // Streak: consecutive months with ≥1 actual, ending at the close month.
    const monthsWithActuals = new Set(
      [...actualIncomes, ...actualExpenses].map((r) => r.startYm).filter(Boolean) as string[],
    )
    let streak = 0
    for (let cursor = ym; monthsWithActuals.has(cursor); cursor = prevYmOf(cursor)) streak++

    return { incomeReal, expensesReal, balance, planNet, topCategories, biggest, prevExpenses, variationPct, streak }
  }, [incomes, expenses, actualIncomes, actualExpenses, ym])

  const pKpis = portfolio.data?.kpis ?? null
  const loanItems = loans.data?.loans ?? []
  // Loan outstanding: schedule row at the close month vs the month before.
  // Fallback to today's live balance covers a ym outside the schedule (e.g. a
  // loan created after the review month) — produces no visible delta.
  const loanNow = loanItems.reduce((s, l) => s + (l.schedule.rows.find((r) => r.ym === ym)?.capital ?? l.kpis.capitalAtual), 0)
  const loanPrev = loanItems.reduce((s, l) => s + (l.schedule.rows.find((r) => r.ym === prevYmOf(ym))?.capital ?? l.kpis.capitalAtual), 0)
  // Freeze the card COMPOSITION at mount: the portfolio/loan queries may still
  // be loading on a cold cache, and a card list that grows mid-review would
  // swap the card under the user's current step. Data inside a rendered card
  // stays live; only whether the card EXISTS is frozen per open.
  const [hasPatrimonio] = useState(() => pKpis !== null || loanItems.length > 0)

  // Literal union (not string) so the dynamic t(`monthClose.step.${key}`)
  // stays type-safe — the i18n setup rejects untyped dynamic keys.
  type StepKey = 'saldo' | 'categorias' | 'variacao' | 'patrimonio' | 'streak'
  const steps: Array<{ key: StepKey; render: () => JSX.Element }> = [
    {
      key: 'saldo' as const,
      render: () => (
        <>
          <div className="month-close-figure">
            <span className={data.balance >= 0 ? 'gain-positive' : 'gain-negative'}>
              {data.balance >= 0 ? '+' : '−'}{eur(Math.abs(data.balance))}
            </span>
          </div>
          <p className="muted" style={{ textAlign: 'center', margin: '4px 0 16px' }}>
            {t('monthClose.balanceSub', { income: eur2(data.incomeReal), expenses: eur2(data.expensesReal) })}
          </p>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            {t('monthClose.vsPlan', { value: `${data.planNet >= 0 ? '+' : '−'}${eur(Math.abs(data.planNet))}` })}
          </p>
        </>
      ),
    },
    // Self-omits when the month has no expenses (income-only actuals).
    ...(data.topCategories.length > 0 ? [{
      key: 'categorias' as const,
      render: () => (
        <>
          <ul className="month-close-list">
            {data.topCategories.map(([name, total]) => (
              <li key={name}>
                <span>{categoryLabel(name)}</span>
                <strong>{eur2(total)}</strong>
              </li>
            ))}
          </ul>
          {data.biggest && (
            <p className="muted" style={{ textAlign: 'center', fontSize: 13, marginTop: 12 }}>
              {t('monthClose.biggest', { name: data.biggest.name, value: eur2(data.biggest.amount) })}
            </p>
          )}
        </>
      ),
    }] : []),
    ...(data.variationPct !== null ? [{
      key: 'variacao' as const,
      render: () => (
        <>
          <div className="month-close-figure">
            <span className={data.variationPct! <= 0 ? 'gain-positive' : 'gain-negative'}>
              {data.variationPct! >= 0 ? '+' : ''}{data.variationPct!.toFixed(0)}%
            </span>
          </div>
          <p className="muted" style={{ textAlign: 'center', margin: '4px 0' }}>
            {data.variationPct! <= 0 ? t('monthClose.spentLess') : t('monthClose.spentMore')}
          </p>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            {t('monthClose.variationSub', { current: eur2(data.expensesReal), previous: eur2(data.prevExpenses!) })}
          </p>
        </>
      ),
    }] : []),
    ...(hasPatrimonio ? [{
      key: 'patrimonio' as const,
      render: () => (
        <ul className="month-close-list">
          {pKpis && (
            <li>
              <span>{t('monthClose.portfolio')}</span>
              <strong>
                {eur(pKpis.valorAtual)}{' '}
                <span className={pKpis.ganhoPerda >= 0 ? 'gain-positive' : 'gain-negative'} style={{ fontSize: 13 }}>
                  ({pKpis.ganhoPerda >= 0 ? '+' : '−'}{eur(Math.abs(pKpis.ganhoPerda))})
                </span>
              </strong>
            </li>
          )}
          {loanItems.length > 0 && (
            <li>
              <span>{t('monthClose.debt')}</span>
              <strong>
                {eur(loanNow)}{' '}
                {loanPrev > loanNow && (
                  <span className="gain-positive" style={{ fontSize: 13 }}>
                    (−{eur(loanPrev - loanNow)})
                  </span>
                )}
              </strong>
            </li>
          )}
        </ul>
      ),
    }] : []),
    {
      key: 'streak' as const,
      render: () => (
        <>
          <div className="month-close-figure">
            <Icon name="check" size={44} className="gain-positive" />
          </div>
          <p style={{ textAlign: 'center', fontWeight: 600, margin: '8px 0 4px' }}>
            {t('monthClose.streak', { count: data.streak })}
          </p>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            {t('monthClose.streakSub')}
          </p>
        </>
      ),
    },
  ]

  const close = () => { setStep(0); onClose() }
  const last = step === steps.length - 1
  const current = steps[Math.min(step, steps.length - 1)]

  return (
    <Modal open={open} onClose={close} title={t('monthClose.title', { month: ymToLong(ym) })} maxWidth={440}>
      <div className="month-close-body">
        <h3 className="section-label" style={{ textAlign: 'center', marginBottom: 12 }}>
          {t(`monthClose.step.${current.key}`)}
        </h3>
        {current.render()}
      </div>

      <div className="month-close-dots" role="tablist" aria-label={t('monthClose.progress')}>
        {steps.map((s, i) => (
          <button
            key={s.key} type="button" role="tab" aria-selected={i === step}
            className={`month-close-dot ${i === step ? 'is-active' : ''}`}
            onClick={() => setStep(i)}
            aria-label={t(`monthClose.step.${s.key}`)}
          />
        ))}
      </div>

      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          {t('monthClose.back')}
        </button>
        {last ? (
          <button type="button" className="btn btn-primary" onClick={close}>{t('monthClose.done')}</button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>{t('monthClose.next')}</button>
        )}
      </div>
    </Modal>
  )
}

export default MonthCloseModal
