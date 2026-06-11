import { FormEvent, useState } from 'react'
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
  submitLabel = 'Guardar',
}: Props) {
  const upsert = useUpsertLoan()

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
    if (!name.trim()) clientErrors.name = 'Dá um nome (ex: Casa, Carro)'
    const cap = Number(capital)
    if (!Number.isFinite(cap) || cap <= 0) clientErrors.capital = 'Valor obrigatório'
    const prazo = Number(prazoMeses)
    if (!Number.isInteger(prazo) || prazo <= 0) clientErrors.prazoMeses = 'Inteiro positivo'
    const tan = Number(tanFixaPct)
    if (!Number.isFinite(tan) || tan < 0) clientErrors.tanFixa = '%'

    let mFix = prazo
    let spr = 0
    let eur = 0
    if (rateMode === 'mixed') {
      mFix = Number(mesesFixos)
      if (!Number.isInteger(mFix) || mFix <= 0) clientErrors.mesesFixos = 'Inteiro positivo'
      if (mFix > prazo) clientErrors.mesesFixos = 'Não pode exceder o prazo total'
      spr = Number(spreadPct)
      if (!Number.isFinite(spr) || spr < 0) clientErrors.spread = '%'
      eur = Number(euriborPct)
      if (!Number.isFinite(eur) || eur < 0) clientErrors.euribor = '%'
    }

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    let taeg: number | null = null
    if (taegStr.trim() !== '') {
      const t = Number(taegStr)
      if (!Number.isFinite(t) || t < 0) { clientErrors.taeg = 'Valor inválido' }
      else taeg = t > 0 ? t / 100 : null
    }

    let bonificacaoMensal: number | null = null
    if (bonMensalStr.trim() !== '') {
      const b = Number(bonMensalStr)
      if (!Number.isFinite(b) || b < 0) { clientErrors.bonificacaoMensal = 'Valor inválido' }
      else bonificacaoMensal = b > 0 ? b : null
    }
    let bonificacaoMeses: number | null = null
    if (bonMesesStr.trim() !== '') {
      const m = Number(bonMesesStr)
      if (!Number.isInteger(m) || m < 0) { clientErrors.bonificacaoMeses = 'Inteiro ≥ 0' }
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
        <label>Tipo de taxa</label>
        <div className="toggle-group" style={{ marginTop: 4 }}>
          <button
            type="button"
            className={`toggle-btn ${rateMode === 'fixed' ? 'toggle-btn-active' : ''}`}
            onClick={() => setRateMode('fixed')}
          >
            Taxa fixa
          </button>
          <button
            type="button"
            className={`toggle-btn ${rateMode === 'mixed' ? 'toggle-btn-active' : ''}`}
            onClick={() => setRateMode('mixed')}
          >
            Mista (TAN + Euribor)
          </button>
        </div>
        <span className="field-hint" style={{ marginTop: 4 }}>
          {rateMode === 'fixed'
            ? 'Crédito automóvel, pessoal ou outra taxa 100% fixa.'
            : 'Crédito habitação com período fixo seguido de Euribor + spread.'}
        </span>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="credit-name">Nome do crédito</label>
          <input
            id="credit-name" type="text" placeholder="Casa, Carro…"
            value={name} onChange={(e) => setName(e.target.value)}
            aria-invalid={!!errors.name}
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="field">
          <label htmlFor="capital">Capital (€)</label>
          <input
            id="capital" type="number" inputMode="decimal" step="any" min="0"
            value={capital} onChange={(e) => setCapital(e.target.value)}
            aria-invalid={!!errors.capital}
          />
          {errors.capital && <span className="field-error">{errors.capital}</span>}
        </div>

        <div className="field">
          <label htmlFor="dataInicio">Data de início</label>
          <input
            id="dataInicio" type="month"
            value={dataInicio} onChange={(e) => setDataInicio(e.target.value)}
            aria-invalid={!!errors.dataInicio}
          />
          {errors.dataInicio && <span className="field-error">{errors.dataInicio}</span>}
        </div>

        <div className="field">
          <label htmlFor="prazoMeses">Prazo total (meses)</label>
          <input
            id="prazoMeses" type="number" inputMode="numeric" step="1" min="1"
            value={prazoMeses} onChange={(e) => setPrazoMeses(e.target.value)}
            aria-invalid={!!errors.prazoMeses}
          />
          {errors.prazoMeses && <span className="field-error">{errors.prazoMeses}</span>}
        </div>

        <div className="field">
          <label htmlFor="tanFixaPct">TAN {rateMode === 'fixed' ? '(%)' : 'fixa (%)'}</label>
          <input
            id="tanFixaPct" type="number" inputMode="decimal" step="any" min="0"
            value={tanFixaPct} onChange={(e) => setTanFixaPct(e.target.value)}
            aria-invalid={!!errors.tanFixa}
          />
          {errors.tanFixa && <span className="field-error">{errors.tanFixa}</span>}
        </div>

        <div className="field">
          <label htmlFor="taegPct">
            TAEG (%) <span className="field-hint">opcional</span>
          </label>
          <input
            id="taegPct" type="number" inputMode="decimal" step="any" min="0"
            placeholder="ex: 5.2"
            value={taegStr} onChange={(e) => setTaegStr(e.target.value)}
            aria-invalid={!!errors.taeg}
          />
          {errors.taeg && <span className="field-error">{errors.taeg}</span>}
        </div>

        {rateMode === 'mixed' && (
          <>
            <div className="field">
              <label htmlFor="mesesFixos">Meses a taxa fixa</label>
              <input
                id="mesesFixos" type="number" inputMode="numeric" step="1" min="1"
                value={mesesFixos} onChange={(e) => setMesesFixos(e.target.value)}
                aria-invalid={!!errors.mesesFixos}
              />
              {errors.mesesFixos && <span className="field-error">{errors.mesesFixos}</span>}
            </div>

            <div className="field">
              <label htmlFor="spreadPct">Spread (%)</label>
              <input
                id="spreadPct" type="number" inputMode="decimal" step="any" min="0"
                value={spreadPct} onChange={(e) => setSpreadPct(e.target.value)}
                aria-invalid={!!errors.spread}
              />
              {errors.spread && <span className="field-error">{errors.spread}</span>}
            </div>

            <div className="field">
              <label htmlFor="euriborPct">Euribor atual (%)</label>
              <input
                id="euriborPct" type="number" inputMode="decimal" step="any" min="0"
                value={euriborPct} onChange={(e) => setEuriborPct(e.target.value)}
                aria-invalid={!!errors.euribor}
              />
              {errors.euribor && <span className="field-error">{errors.euribor}</span>}
            </div>
          </>
        )}

        <div className="field">
          <label htmlFor="bonMensal">Bonificação mensal (€) <span className="field-hint">opcional — devolução de spread</span></label>
          <input
            id="bonMensal" type="number" inputMode="decimal" step="any" min="0"
            placeholder="ex: 119.73"
            value={bonMensalStr} onChange={(e) => setBonMensalStr(e.target.value)}
            aria-invalid={!!errors.bonificacaoMensal}
          />
          {errors.bonificacaoMensal && <span className="field-error">{errors.bonificacaoMensal}</span>}
        </div>

        <div className="field">
          <label htmlFor="bonMeses">Duração bonificação (meses) <span className="field-hint">opcional</span></label>
          <input
            id="bonMeses" type="number" inputMode="numeric" step="1" min="0"
            placeholder="ex: 24"
            value={bonMesesStr} onChange={(e) => setBonMesesStr(e.target.value)}
            aria-invalid={!!errors.bonificacaoMeses}
          />
          {errors.bonificacaoMeses && <span className="field-error">{errors.bonificacaoMeses}</span>}
        </div>
      </div>

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={upsert.isLoading}>
          {upsert.isLoading ? 'A guardar…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export default LoanSetupForm
