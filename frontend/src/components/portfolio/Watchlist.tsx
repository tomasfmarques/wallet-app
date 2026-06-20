import { useEffect, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { useQuotes, type Quote } from '@/hooks/useQuotes'
import { eur2, pctSigned } from '@/lib/format'
import { apiErrorMessage } from '@/lib/apiError'
import { StockChartModal } from './StockChartModal'

interface WatchItem { symbol: string; name: string }

interface Props {
  /** Resolved watchlist (symbols + names). The Portfolio page resolves the
   *  user's stored list (or default) and passes it in. */
  items: WatchItem[]
  onAdd: (preset: { ticker: string; name: string; currentPrice: number }) => void
  /** Persist a new order (called with the reordered symbols). Drag-to-reorder
   *  is enabled only when provided. */
  onReorder?: (symbols: string[]) => void
}

// "Em alta · Nasdaq" — grid of trend cards with live prices and a quick-add
// button. When `onReorder` is set, each card has a drag handle to reorder the
// list; the new order is persisted to the user's watchlist.
export function Watchlist({ items, onAdd, onReorder }: Props) {
  const { t } = useTranslation('portfolio')
  // Local order for optimistic drag-reorder; resynced whenever the underlying
  // set of symbols changes (add/remove from elsewhere).
  const [order, setOrder] = useState<WatchItem[]>(items)
  const symbolsKey = items.map((i) => i.symbol).join(',')
  useEffect(() => { setOrder(items) }, [symbolsKey])  // eslint-disable-line react-hooks/exhaustive-deps

  const symbols = order.map((w) => w.symbol)
  const { data, isLoading, error } = useQuotes(symbols)
  const [charting, setCharting] = useState<WatchItem | null>(null)
  const dragIndex = useRef<number | null>(null)

  const handleDrop = (toIdx: number) => {
    const from = dragIndex.current
    dragIndex.current = null
    if (from == null || from === toIdx) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(toIdx, 0, moved)
    setOrder(next)
    onReorder?.(next.map((w) => w.symbol))
  }

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
          : t('watchlist.error', { message: apiErrorMessage(error) })}
      </div>
    )
  }

  const quotesBySymbol = new Map<string, Quote>()
  for (const q of data?.quotes ?? []) quotesBySymbol.set(q.symbol, q)
  const reorderable = !!onReorder && order.length > 1

  return (
    <>
      <div className="trend-grid">
        {order.map((w, i) => {
          const q = quotesBySymbol.get(w.symbol)
          return (
            <TrendCard
              key={w.symbol}
              symbol={w.symbol}
              name={w.name}
              quote={q}
              reorderable={reorderable}
              onDragStart={() => { dragIndex.current = i }}
              onDropCard={() => handleDrop(i)}
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
  reorderable: boolean
  onDragStart: () => void
  onDropCard: () => void
  onOpenChart: () => void
  onAdd: () => void
}

function TrendCard({ symbol, name, quote, reorderable, onDragStart, onDropCard, onOpenChart, onAdd }: CardProps) {
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
      onDragOver={reorderable ? (e) => e.preventDefault() : undefined}
      onDrop={reorderable ? (e) => { e.preventDefault(); onDropCard() } : undefined}
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
      <div className="trend-footer">
        <button
          type="button"
          className="btn btn-ghost btn-sm trend-add"
          onClick={(e) => { e.stopPropagation(); onAdd() }}
          disabled={unavailable}
          aria-label={t('watchlist.addAria', { symbol })}
        >
          + {t('actions.add', { ns: 'common' })}
        </button>
        {reorderable && (
          <span
            className="trend-drag-handle"
            draggable
            onDragStart={onDragStart}
            onClick={(e) => e.stopPropagation()}
            role="button"
            aria-label={t('watchlist.reorderAria', { symbol })}
            title={t('watchlist.reorderTitle')}
          >
            ⠿
          </span>
        )}
      </div>
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
