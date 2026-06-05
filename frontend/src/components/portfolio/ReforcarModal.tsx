import { FormEvent, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useReforcar, type ReforcarInputBody } from '@/hooks/usePortfolio'
import { useAssetMetric } from '@/hooks/useQuotes'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { currentYm, eur2 } from '@/lib/format'
import type { PortfolioAsset } from '@/types'

interface Props {
  open: boolean
  onClose: () => void
  asset: PortfolioAsset | null
}

// Reforçar = top-up an existing holding. Three modes:
//   1. Market price (default) — backend fetches Yahoo + FX, qty grows
//      proportionally, value re-derived. Cost basis = amount put in.
//   2. Manual price — user types EUR price per share. Same math, no API call.
//   3. No price — just bump invested + value by the amount, qty stays.
export function ReforcarModal({ open, onClose, asset }: Props) {
  const reforcar = useReforcar()
  const [amount, setAmount] = useState('')
  const [ym, setYm] = useState(currentYm())
  const [mode, setMode] = useState<'market' | 'manual' | 'none'>('market')
  const [manualPrice, setManualPrice] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  // Live current price (EUR-converted via the CAGR endpoint's data — note that
  // currentPrice there is native-currency. We compute EUR locally for the
  // preview hint.) Fetched only when this asset is open.
  const { data: metric } = useAssetMetric(open && asset ? asset.ticker : undefined)
  const showPriceHint = mode === 'market' && metric?.currentPrice

  if (!asset) return null

  const reset = () => {
    setAmount(''); setManualPrice(''); setYm(currentYm()); setMode('market'); setErrors({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const clientErrors: FieldErrors = {}
    const a = Number(amount)
    if (!Number.isFinite(a) || a <= 0) clientErrors.amount = 'Valor > 0'
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) clientErrors.ym = 'Formato AAAA-MM'
    let manualPriceNum: number | undefined
    if (mode === 'manual') {
      const p = Number(manualPrice)
      if (!Number.isFinite(p) || p <= 0) clientErrors.price = 'Preço > 0'
      else manualPriceNum = p
    }
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors); return
    }

    try {
      const body: ReforcarInputBody = { amount: a, ym }
      if (mode === 'market') body.useMarketPrice = true
      else if (mode === 'manual') body.price = manualPriceNum
      // mode 'none' → omit price entirely
      await reforcar.mutateAsync({ id: asset.id, body })
      reset()
      onClose()
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  // Quick math preview: how many shares this purchase implies
  const previewShares = (() => {
    const a = Number(amount)
    if (!Number.isFinite(a) || a <= 0) return null
    if (mode === 'market' && metric?.currentPrice && metric?.currency) {
      // Rough EUR estimate: divide by USD price ÷ 1 (no FX in modal). Backend
      // does the precise FX-adjusted math at submit time. For the preview we
      // just show "≈ X un." using the native price as the assumed unit (good
      // enough for a sanity check).
      const p = metric.currentPrice
      return p > 0 ? a / p : null
    }
    if (mode === 'manual') {
      const p = Number(manualPrice)
      return Number.isFinite(p) && p > 0 ? a / p : null
    }
    return null
  })()

  return (
    <Modal open={open} onClose={onClose} title={`Reforçar ${asset.name}`} maxWidth={480}>
      <p className="muted modal-intro">
        Regista quanto puseste neste ativo. O custo de aquisição
        (<strong>invested</strong>) cresce sempre exatamente pelo montante.
      </p>

      <form onSubmit={submit} className="amort-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}

        <div className="field-grid">
          <div className="field">
            <label htmlFor="r-amount">Montante (€)</label>
            <input
              id="r-amount" type="number" inputMode="decimal" step="any" min="0"
              value={amount} onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!errors.amount} autoFocus
            />
            {errors.amount && <span className="field-error">{errors.amount}</span>}
          </div>
          <div className="field">
            <label htmlFor="r-ym">Mês</label>
            <input
              id="r-ym" type="text" placeholder="AAAA-MM"
              value={ym} onChange={(e) => setYm(e.target.value)}
              aria-invalid={!!errors.ym}
            />
            {errors.ym && <span className="field-error">{errors.ym}</span>}
          </div>
        </div>

        <fieldset className="reforcar-modes">
          <legend className="muted" style={{ fontSize: 12 }}>Como calcular a quantidade comprada?</legend>
          <label className={`mode-option ${mode === 'market' ? 'is-active' : ''}`}>
            <input type="radio" name="mode" checked={mode === 'market'} onChange={() => setMode('market')} />
            <span>
              <strong>Cotação atual de mercado</strong>
              <span className="muted">— Yahoo + câmbio automático (recomendado)</span>
            </span>
          </label>
          <label className={`mode-option ${mode === 'manual' ? 'is-active' : ''}`}>
            <input type="radio" name="mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />
            <span>
              <strong>Preço manual</strong>
              <span className="muted">— se o teu broker mostra preço diferente</span>
            </span>
          </label>
          <label className={`mode-option ${mode === 'none' ? 'is-active' : ''}`}>
            <input type="radio" name="mode" checked={mode === 'none'} onChange={() => setMode('none')} />
            <span>
              <strong>Só cash</strong>
              <span className="muted">— acrescenta ao valor sem alterar quantidade</span>
            </span>
          </label>
        </fieldset>

        {mode === 'market' && (
          <div className="reforcar-preview">
            {showPriceHint ? (
              <>
                <div>
                  Cotação atual: <strong>{metric!.currentPrice!.toFixed(2)} {metric!.currency}</strong>
                  {metric!.resolvedSymbol && metric!.resolvedSymbol !== asset.ticker && (
                    <span className="muted"> ({metric!.resolvedSymbol})</span>
                  )}
                </div>
                {previewShares != null && (
                  <div className="muted">
                    ≈ {previewShares.toFixed(4)} un. à cotação nativa
                    (câmbio para EUR aplicado no servidor)
                  </div>
                )}
              </>
            ) : (
              <span className="muted">A obter cotação…</span>
            )}
          </div>
        )}

        {mode === 'manual' && (
          <div className="field">
            <label htmlFor="r-price">Preço por unidade (€)</label>
            <input
              id="r-price" type="number" inputMode="decimal" step="any" min="0"
              value={manualPrice} onChange={(e) => setManualPrice(e.target.value)}
              aria-invalid={!!errors.price}
            />
            {errors.price && <span className="field-error">{errors.price}</span>}
            {previewShares != null && (
              <span className="field-hint">≈ {previewShares.toFixed(4)} un.</span>
            )}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={reforcar.isLoading}>
            {reforcar.isLoading ? 'A registar…' : `Reforçar${amount ? ' ' + eur2(Number(amount) || 0) : ''}`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default ReforcarModal
