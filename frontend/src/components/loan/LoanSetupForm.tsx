import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useUpsertLoan, type LoanInputBody } from '@/hooks/useLoan'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'

interface Props {
  initial?: Partial<LoanInputBody>
  loanId?: string
  onSaved?: () => void
  onCancel?: () => void
  submitLabel?: string
}

// Detect whether an existing loan was set up as fully fixed-rate
function detectRateMode(initial?: Partial<LoanInputBody>): 'fixed' | 'mixed' {
  if (!initial) return 'mixed'
  const noSpread = (initial.spread ?? 0) === 0
  const noEuribor = (initial.euribor ?? 0) === 0
  return noSpread && noEuribor ? 'fixed' : 'mixed'
}

export function LoanSetupForm({
  initial,
  loanId,
  onSaved,
  onCancel,
  submitLabel,
}: Props) {
  const { t } = useTranslation('loan')
  const upsert = useUpsertLoan()
  const saveLabel = submitLabel ?? t('actions.save', { ns: 'common' })

  const [rateMode, setRateMode] = useState<'fixed' | 'mixed'>(detectRateMode(initial))

  const [name,       setName]       = useState(initial?.name ?? '')
  const [capital,    setCapital]    = useState(initial?.capital?.toString()    ?? '')
  const [prazoMeses, setPrazoMeses] = useState(initial?.prazoMeses?.toString() ?? '480')
  const [tanFixaPct, setTanFixaPct] = useState(
    initial?.tanFixa !== undefined ? (initial.tanFixa * 100).toString() : '2.2',
  )
  // Variable-rate fields – only submitted when rateMode === 'mixed'
  const [mesesFixos, setMesesFixos] = useState(initial?.mesesFixos?.toString() ?? '24')
  const [spreadPct,  setSpreadPct]  = useState(
    initial?.spread !== undefined ? (initial.spread * 100).toString() : '0.6',
  )
  const [euriborPct, setEuriborPct] = useState(
    initial?.euribor !== undefined ? (initial.euribor * 100).toString() : '2.1',
  )
  const [dataInicio, setDataInicio] = useState(initial?.dataInicio ?? '2024-01')
  const [euriborTenor, setEuriborTenor] = useState<'' | '3m' | '6m' | '12m'>(initial?.euriborTenor ?? '')
  const [taegStr, setTaegStr] = useState(
    initial?.taeg != null ? (initial.taeg * 100).toString() : '',
  )
  const [bonMensalStr, setBonMensalStr] = useState(
    initial?.bonificacaoMensal != null ? String(initial.bonificacaoMensal) : '',
  )
  const [bonMesesStr, setBonMesesStr] = useState(
    initial?.bonificacaoMeses != null ? String(initial.bonificacaoMeses) : '',
  )
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})

    const clientErrors: FieldErrors = {}
    if (!name.trim()) clientErrors.name = t('setup.errName')
    const cap = Number(capital)
    if (!Number.isFinite(cap) || cap <= 0) clientErrors.capital = t('setup.errCapital')
    const prazo = Number(prazoMeses)
    if (!Number.isInteger(prazo) || prazo <= 0) clientErrors.prazoMeses = t('setup.errInteger')
    const tan = Number(tanFixaPct)
    if (!Number.isFinite(tan) || tan < 0) clientErrors.tanFixa = t('setup.errPct')

    let mFix = prazo
    let spr = 0
    let eur = 0
    if (rateMode === 'mixed') {
      mFix = Number(mesesFixos)
      if (!Number.isInteger(mFix) || mFix <= 0) clientErrors.mesesFixos = t('setup.errInteger')
      if (mFix > prazo) clientErrors.mesesFixos = t('setup.errFixedExceeds')
      spr = Number(spreadPct)
      if (!Number.isFinite(spr) || spr < 0) clientErrors.spread = t('setup.errPct')
      eur = Number(euriborPct)
      if (!Number.isFinite(eur) || eur < 0) clientErrors.euribor = t('setup.errPct')
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    let taeg: number | null = null
    if (taegStr.trim() !== '') {
      const tg = Number(taegStr)
      if (!Number.isFinite(tg) || tg < 0) { clientErrors.taeg = t('setup.errInvalid') }
      else taeg = tg > 0 ? tg / 100 : null
    }

    let bonificacaoMensal: number | null = null
    if (bonMensalStr.trim() !== '') {
      const b = Number(bonMensalStr)
      if (!Number.isFinite(b) || b < 0) { clientErrors.bonificacaoMensal = t('setup.errInvalid') }
      else bonificacaoMensal = b > 0 ? b : null
    }
    let bonificacaoMeses: number | null = null
    if (bonMesesStr.trim() !== '') {
      const m = Number(bonMesesStr)
      if (!Number.isInteger(m) || m < 0) { clientErrors.bonificacaoMeses = t('setup.errIntegerGte0') }
      else bonificacaoMeses = m > 0 ? m : null
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    const body: LoanInputBody = {
      ...(loanId ? { id: loanId } : {}),
      name: name.trim(),
      capital: cap,
      prazoMeses: prazo,
      tanFixa: tan / 100,
      mesesFixos: mFix,
      spread: spr / 100,
      euribor: eur / 100,
      dataInicio,
      bonificacaoMensal,
      bonificacaoMeses,
      taeg,
      euriborTenor: rateMode === 'mixed' && euriborTenor !== '' ? euriborTenor : null,
    }

    try {
      await upsert.mutateAsync(body)
      onSaved?.()
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <form onSubmit={submit} noValidate className="loan-form">
      {errors._form && <div className="form-error" role="alert">{errors._form}</div>}

      {/* Rate mode selector */}
      <div className="field" style={{ marginBottom: 6 }}>
        <label>{t('setup.rateType')}</label>
        <div className="toggle-group" style={{ marginTop: 4 }}>
          <button
            type="button"
            className={`toggle-btn ${rateMode === 'fixed' ? 'toggle-btn-active' : ''}`}
            onClick={() => setRateMode('fixed')}
          >
            {t('setup.fixed')}
          </button>
          <button
            type="button"
            className={`toggle-btn ${rateMode === 'mixed' ? 'toggle-btn-active' : ''}`}
            onClick={() => setRateMode('mixed')}
          >
            {t('setup.mixed')}
          </button>
        </div>
        <span className="field-hint" style={{ marginTop: 4 }}>
          {rateMode === 'fixed' ? t('setup.fixedHint') : t('setup.mixedHint')}
        </span>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="credit-name">{t('setup.nameLabel')}</label>
          <input
            id="credit-name" type="text" placeholder={t('setup.namePlaceholder')}
            value={name} onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="field">
          <label htmlFor="capital">{t('setup.capitalLabel')}</label>
          <input
            id="capital" type="number" inputMode="decimal" step="any" min="0"
            value={capital} onChange={(e) => setCapital(e.target.value)}
            aria-invalid={!!errors.capital}
          />
          {errors.capital && <span className="field-error">{errors.capital}</span>}
        </div>

        <div className="field">
          <label htmlFor="dataInicio">{t('setup.startLabel')}</label>
          <input
            id="dataInicio" type="month"
            value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
            aria-invalid={!!errors.dataInicio}
          />
          {errors.dataInicio && <span className="field-error">{errors.dataInicio}</span>}
        </div>

        <div className="field">
          <label htmlFor="prazoMeses">{t('setup.termLabel')}</label>
          <input
            id="prazoMeses" type="number" inputMode="numeric" step="1" min="1"
            value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value)}
            aria-invalid={!!errors.prazoMeses}
          />
          {errors.prazoMeses && <span className="field-error">{errors.prazoMeses}</span>}
        </div>

        <div className="field">
          <label htmlFor="tanFixaPct">{rateMode === 'fixed' ? t('setup.tanLabelFixed') : t('setup.tanLabelMixed')}</label>
          <input
            id="tanFixaPct" type="number" inputMode="decimal" step="any" min="0"
            value={tanFixaPct} onChange={(e) => setTanFixaPct(e.target.value)}
            aria-invalid={!!errors.tanFixa}
          />
          {errors.tanFixa && <span className="field-error">{errors.tanFixa}</span>}
        </div>

        <div className="field">
          <label htmlFor="taegPct">
            {t('setup.taegLabel')} <span className="field-hint">{t('setup.optional')}</span>
          </label>
          <input
            id="taegPct" type="number" inputMode="decimal" step="any" min="0"
            placeholder={t('setup.taegPlaceholder')}
            value={taegStr} onChange={(e) => setTaegStr(e.target.value)}
            aria-invalid={!!errors.taeg}
          />
          {errors.taeg && <span className="field-error">{errors.taeg}</span>}
        </div>

        {rateMode === 'mixed' && (
          <>
            <div className="field">
              <label htmlFor="mesesFixos">{t('setup.fixedMonthsLabel')}</label>
              <input
                id="mesesFixos" type="number" inputMode="numeric" step="1" min="1"
                value={mesesFixos} onChange={(e) => setMesesFixos(e.target.value)}
                aria-invalid={!!errors.mesesFixos}
              />
              {errors.mesesFixos && <span className="field-error">{errors.mesesFixos}</span>}
            </div>

            <div className="field">
              <label htmlFor="spreadPct">{t('setup.spreadLabel')}</label>
              <input
                id="spreadPct" type="number" inputMode="decimal" step="any" min="0"
                value={spreadPct} onChange={(e) => setSpreadPct(e.target.value)}
                aria-invalid={!!errors.spread}
              />
              {errors.spread && <span className="field-error">{errors.spread}</span>}
            </div>

            <div className="field">
              <label htmlFor="euriborPct">{t('setup.euriborLabel')}</label>
              <input
                id="euriborPct" type="number" inputMode="decimal" step="any" min="0"
                value={euriborPct} onChange={(e) => setEuriborPct(e.target.value)}
                aria-invalid={!!errors.euribor}
              />
              {errors.euribor && <span className="field-error">{errors.euribor}</span>}
            </div>

            <div className="field">
              <label htmlFor="euriborTenor">
                {t('setup.tenorLabel')} <span className="field-hint">{t('setup.optional')}</span>
              </label>
              <select
                id="euriborTenor"
                value={euriborTenor}
                onChange={(e) => setEuriborTenor(e.target.value as '' | '3m' | '6m' | '12m')}
              >
                <option value="">{t('setup.tenorManual')}</option>
                <option value="3m">{t('setup.tenor3m')}</option>
                <option value="6m">{t('setup.tenor6m')}</option>
                <option value="12m">{t('setup.tenor12m')}</option>
              </select>
              <span className="field-hint" style={{ marginTop: 4 }}>{t('setup.tenorHint')}</span>
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="bonMensal">{t('setup.bonMonthlyLabel')} <span className="field-hint">{t('setup.bonMonthlyHint')}</span></label>
          <input
            id="bonMensal" type="number" inputMode="decimal" step="any" min="0"
            placeholder={t('setup.bonMonthlyPlaceholder')}
            value={bonMensalStr} onChange={(e) => setBonMensalStr(e.target.value)}
            aria-invalid={!!errors.bonificacaoMensal}
          />
          {errors.bonificacaoMensal && <span className="field-error">{errors.bonificacaoMensal}</span>}
        </div>

        <div className="field">
          <label htmlFor="bonMeses">{t('setup.bonDurationLabel')} <span className="field-hint">{t('setup.optional')}</span></label>
          <input
            id="bonMeses" type="number" inputMode="numeric" step="1" min="0"
            placeholder={t('setup.bonDurationPlaceholder')}
            value={bonMesesStr} onChange={(e) => setBonMesesStr(e.target.value)}
            aria-invalid={!!errors.bonificacaoMeses}
          />
          {errors.bonificacaoMeses && <span className="field-error">{errors.bonificacaoMeses}</span>}
        </div>
      </div>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('actions.cancel', { ns: 'common' })}
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={upsert.isLoading}>
          {upsert.isLoading ? t('states.saving', { ns: 'common' }) : saveLabel}
        </button>
      </div>
    </form>
  )
}

export default LoanSetupForm
