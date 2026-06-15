import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { useAddAsset, useUpdateAsset, type AssetInputBody } from '@/hooks/usePortfolio'
import { fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { useAssetMetric, availableCAGRs } from '@/hooks/useQuotes'
import { pctSigned } from '@/lib/format'
import { TickerSearch } from './TickerSearch'
import type { PortfolioAsset } from '@/types'

const round2 = (n: number) => Math.round(n * 100) / 100

export interface AssetPreset {
  ticker: string
  name: string
  currentPrice?: number
}

interface Props {
  open: boolean
  onClose: () => void
  asset?: PortfolioAsset
  preset?: AssetPreset
}

export function AssetModal({ open, onClose, asset, preset }: Props) {
  const { t } = useTranslation('portfolio')
  const add = useAddAsset()
  const update = useUpdateAsset()
  const isEdit = !!asset

  const [name,           setName]           = useState('')
  const [ticker,         setTicker]         = useState('')
  const [qty,            setQty]            = useState('')
  const [invested,       setInvested]       = useState('')
  const [value,          setValue]          = useState('')
  const [monthly,        setMonthly]        = useState('0')
  const [expectedReturn, setExpectedReturn] = useState('7')
  const [errors,         setErrors]         = useState<FieldErrors>({})

  const { data: metric } = useAssetMetric(open && ticker ? ticker : undefined)
  const cagrs = availableCAGRs(metric)
  const nativePrice = metric?.currentPrice ?? preset?.currentPrice ?? null
  const nativeCurrency = metric?.currency ?? null
  const priceEur = metric?.priceEur ?? null
  // Price used to auto-fill the EUR amount fields — must be EUR-denominated.
  // Use the FX-converted price, or the native price only when it's already EUR.
  // If we don't have a true EUR figure (e.g. FX lookup failed for a USD/KRW
  // listing), leave the field empty rather than fill a wrong "€" amount.
  const fillPrice =
    priceEur ?? (nativeCurrency?.toUpperCase() === 'EUR' ? nativePrice : null)

  useEffect(() => {
    if (!open) return
    if (asset) {
      setName(asset.name); setTicker(asset.ticker)
      setQty(String(asset.qty)); setInvested(String(round2(asset.invested)))
      setValue(String(round2(asset.value))); setMonthly(String(asset.monthly))
      setExpectedReturn(String(asset.expectedReturn * 100))
    } else if (preset) {
      setName(preset.name); setTicker(preset.ticker)
      setQty(''); setInvested(''); setValue('')
      setMonthly('0'); setExpectedReturn('7')
    } else {
      setName(''); setTicker(''); setQty(''); setInvested(''); setValue('')
      setMonthly('0'); setExpectedReturn('7')
    }
    setErrors({})
  }, [open, asset, preset])

  useEffect(() => {
    if (isEdit || !fillPrice) return
    const q = Number(qty)
    if (!Number.isFinite(q) || q <= 0) return
    const calc = (q * fillPrice).toFixed(2)
    setInvested((prev) => (prev === '' ? calc : prev))
    setValue((prev) => (prev === '' ? calc : prev))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qty, fillPrice])

  const handleSearchSelect = (result: { symbol: string; name: string }) => {
    setTicker(result.symbol)
    setName(result.name)
    setInvested('')
    setValue('')
    setErrors({})
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const clientErrors: FieldErrors = {}
    if (!name.trim())   clientErrors.name   = t('asset.errRequired')
    if (!ticker.trim()) clientErrors.ticker = t('asset.errRequired')
    const q = Number(qty)
    if (!Number.isFinite(q) || q <= 0) clientErrors.qty = t('asset.errGt0')
    const iv = Number(invested)
    if (!Number.isFinite(iv) || iv < 0) clientErrors.invested = t('asset.errGte0')
    const v = Number(value)
    if (!Number.isFinite(v) || v < 0) clientErrors.value = t('asset.errGte0')
    const m = Number(monthly)
    if (!Number.isFinite(m) || m < 0) clientErrors.monthly = t('asset.errGte0')
    const r = Number(expectedReturn)
    if (!Number.isFinite(r) || r < 0) clientErrors.expectedReturn = t('asset.errPct')
    if (Object.keys(clientErrors).length > 0) { setErrors(clientErrors); return }

    const body: AssetInputBody = {
      name: name.trim(), ticker: ticker.trim().toUpperCase(),
      qty: q, invested: iv, value: v, monthly: m, expectedReturn: r / 100,
    }
    try {
      if (isEdit && asset) { await update.mutateAsync({ id: asset.id, patch: body }) }
      else { await add.mutateAsync(body) }
      onClose()
    } catch (err) { setErrors(fieldErrorsFrom(err)) }
  }

  const busy = add.isLoading || update.isLoading

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t('asset.editTitle') : t('asset.addTitle')} maxWidth={560}>
      <form onSubmit={submit} className="asset-form" noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}

        {!isEdit && (
          <div className="field" style={{ marginBottom: 12 }}>
            {!ticker ? (
              <>
                <label>{t('asset.searchLabel')}</label>
                <TickerSearch onSelect={handleSearchSelect} />
                <span className="field-hint">{t('asset.searchHint')}</span>
              </>
            ) : (
              <div className="ticker-selected">
                <div className="ticker-selected-main">
                  <span className="ticker-selected-symbol">{ticker}</span>
                  <span className="ticker-selected-name">{name}</span>
                  {nativePrice != null && (
                    <span className="ticker-selected-price muted">
                      {t('asset.quote', { price: nativePrice.toFixed(2), currency: nativeCurrency ?? '' })}
                      {priceEur != null && nativeCurrency && nativeCurrency.toUpperCase() !== 'EUR' && (
                        <>{t('asset.quoteEur', { eur: priceEur.toFixed(2) })}</>
                      )}
                    </span>
                  )}
                </div>
                <button
                  type="button" className="btn btn-ghost btn-sm"
                  onClick={() => { setTicker(''); setName(''); setInvested(''); setValue('') }}
                >
                  {t('asset.change')}
                </button>
              </div>
            )}
          </div>
        )}

        {isEdit && (
          <div className="field-grid" style={{ marginBottom: 0 }}>
            <div className="field">
              <label htmlFor="a-name">{t('asset.nameLabel')}</label>
              <input id="a-name" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <span className="field-error">{errors.name}</span>}
            </div>
            <div className="field">
              <label htmlFor="a-ticker">{t('asset.tickerLabel')}</label>
              <input id="a-ticker" value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
              {errors.ticker && <span className="field-error">{errors.ticker}</span>}
            </div>
          </div>
        )}

        {(isEdit || !!ticker) && (
          <div className="field-grid">
            <div className="field">
              <label htmlFor="a-qty">{t('asset.qtyLabel')}</label>
              <input
                id="a-qty" type="number" inputMode="decimal" step="any" min="0"
                value={qty} onChange={(e) => setQty(e.target.value)} autoFocus={!isEdit}
              />
              {errors.qty && <span className="field-error">{errors.qty}</span>}
            </div>
            <div className="field">
              <label htmlFor="a-invested">
                {t('asset.investedLabel')}
                {!isEdit && fillPrice != null && qty && (
                  <span className="field-hint" style={{ float: 'right' }}>{t('asset.autoFilled')}</span>
                )}
              </label>
              <input
                id="a-invested" type="number" inputMode="decimal" step="any" min="0"
                value={invested} onChange={(e) => setInvested(e.target.value)}
              />
              {errors.invested && <span className="field-error">{errors.invested}</span>}
            </div>
            <div className="field">
              <label htmlFor="a-value">
                {t('asset.valueLabel')}
                {!isEdit && fillPrice != null && qty && (
                  <span className="field-hint" style={{ float: 'right' }}>{t('asset.autoFilled')}</span>
                )}
              </label>
              <input
                id="a-value" type="number" inputMode="decimal" step="any" min="0"
                value={value} onChange={(e) => setValue(e.target.value)}
              />
              {errors.value && <span className="field-error">{errors.value}</span>}
            </div>
            <div className="field">
              <label htmlFor="a-monthly">{t('asset.monthlyLabel')}</label>
              <input
                id="a-monthly" type="number" inputMode="decimal" step="any" min="0"
                value={monthly} onChange={(e) => setMonthly(e.target.value)}
              />
              {errors.monthly && <span className="field-error">{errors.monthly}</span>}
            </div>
            <div className="field">
              <label htmlFor="a-ret">{t('asset.returnLabel')}</label>
              <input
                id="a-ret" type="number" inputMode="decimal" step="any" min="0"
                value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)}
              />
              {errors.expectedReturn ? (
                <span className="field-error">{errors.expectedReturn}</span>
              ) : cagrs.length > 0 ? (
                <div className="cagr-hints">
                  <span className="cagr-hints-label">{t('asset.cagrLabel')}</span>
                  <div className="cagr-pill-row">
                    {cagrs.map((c) => {
                      const period = c.years === 1
                        ? t('asset.cagrLongOne', { years: c.years })
                        : t('asset.cagrLongMany', { years: c.years })
                      return (
                        <button
                          key={c.years} type="button"
                          className={`cagr-pill ${c.value >= 0 ? 'is-positive' : 'is-negative'}`}
                          onClick={() => setExpectedReturn(c.value.toFixed(1))}
                          title={t('asset.cagrTitle', { period })}
                        >
                          <span className="cagr-pill-window">{t('asset.cagrShort', { years: c.years })}</span>
                          <strong>{pctSigned(c.value / 100)}</strong>
                        </button>
                      )
                    })}
                  </div>
                  {metric?.resolvedSymbol && metric.resolvedSymbol !== metric.symbol && (
                    <span className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                      {t('asset.source', { symbol: metric.resolvedSymbol })}
                    </span>
                  )}
                </div>
              ) : (
                <span className="field-hint">{t('asset.returnHint')}</span>
              )}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('actions.cancel', { ns: 'common' })}</button>
          {(isEdit || !!ticker) && (
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('states.saving', { ns: 'common' }) : (isEdit ? t('actions.save', { ns: 'common' }) : t('asset.addTitle'))}
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}

export default AssetModal
