import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useQuotes, type Quote } from '@/hooks/useQuotes'
import { eur2, pctSigned } from '@/lib/format'
import { StockChartModal } from './StockChartModal'

interface Props {
  /** Resolved watchlist (symbols + names). The Portfolio page resolves the
   *  user's stored list (or default) and passes it in. */
  items: Array<{ symbol: string; name: string }>
  onAdd: (preset: { ticker: string; name: string; currentPrice: number }) => void
}

// "Em alta · Nasdaq" — grid of trend cards with live prices and a quick-add
// button that opens the AssetModal with the ticker / name / price prefilled.
export function Watchlist({ items, onAdd }: Props) {
  const { t } = useTranslation('portfolio')
  const symbols = items.map((w) => w.symbol)
  const { data, isLoading, error } = useQuotes(symbols)
  const [charting, setCharting] = useState<{ symbol: string; name: string } | null>(null)

  if (items.length === 0) {
    return (
      <div className="card card-pad-lg muted">
        <Trans i18nKey="watchlist.empty" ns="portfolio" components={{ 1: <strong /> }} />
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="trend-grid">
        {items.map((w) => <TrendCardSkeleton key={w.symbol} symbol={w.symbol} name={w.name} />)}
      </div>
    )
  }

  if (error) {
    const isUnconfigured = error.status === 503
    return (
      <div className="card card-pad-lg muted">
        {isUnconfigured
          ? t('watchlist.unconfigured')
          : t('watchlist.error', { message: error.message })}
      </div>
    )
  }

  const quotesBySymbol = new Map<string, Quote>()
  for (const q of data?.quotes ?? []) quotesBySymbol.set(q.symbol, q)

  return (
    <>
      <div className="trend-grid">
        {items.map((w) => {
          const q = quotesBySymbol.get(w.symbol)
          return (
            <TrendCard
              key={w.symbol}
              symbol={w.symbol}
              name={w.name}
              quote={q}
              onOpenChart={() => setCharting({ symbol: w.symbol, name: w.name })}
              onAdd={() => q && onAdd({ ticker: w.symbol, name: w.name, currentPrice: q.current })}
            />
          )
        })}
      </div>
      <StockChartModal
        open={!!charting}
        onClose={() => setCharting(null)}
        symbol={charting?.symbol ?? ''}
        name={charting?.name ?? ''}
      />
    </>
  )
}

interface CardProps {
  symbol: string
  name: string
  quote?: Quote
  onOpenChart: () => void
  onAdd: () => void
}

function TrendCard({ symbol, name, quote, onOpenChart, onAdd }: CardProps) {
  const { t } = useTranslation('portfolio')
  const positive = (quote?.percentChange ?? 0) >= 0
  // Coerce to boolean — quote.error is a string when present
  const unavailable = !quote || !!quote.error || !quote.current
  return (
    <div
      className="trend-card is-clickable"
      onClick={onOpenChart}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenChart() } }}
      title={t('watchlist.viewChart')}
    >
      <div className="trend-header">
        <div>
          <div className="trend-symbol">{symbol}</div>
          <div className="trend-name">{name}</div>
        </div>
        {!unavailable && (
          <div className={`trend-change ${positive ? 'gain-positive' : 'gain-negative'}`}>
            <span className="trend-arrow" aria-hidden>{positive ? '▲' : '▼'}</span>
            {pctSigned((quote!.percentChange) / 100)}
          </div>
        )}
      </div>
      <div className="trend-price">
        {unavailable ? <span className="muted">{t('watchlist.noData')}</span> : eur2(quote!.current)}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm trend-add"
        onClick={(e) => { e.stopPropagation(); onAdd() }}
        disabled={unavailable}
        aria-label={t('watchlist.addAria', { symbol })}
      >
        + {t('actions.add', { ns: 'common' })}
      </button>
    </div>
  )
}

function TrendCardSkeleton({ symbol, name }: { symbol: string; name: string }) {
  const { t } = useTranslation('common')
  return (
    <div className="trend-card is-loading">
      <div className="trend-header">
        <div>
          <div className="trend-symbol">{symbol}</div>
          <div className="trend-name">{name}</div>
        </div>
      </div>
      <div className="trend-price muted">…</div>
      <button type="button" className="btn btn-ghost btn-sm trend-add" disabled>+ {t('actions.add')}</button>
    </div>
  )
}

export default Watchlist
