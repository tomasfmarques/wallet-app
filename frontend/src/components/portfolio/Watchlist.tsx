import { useState } from 'react'
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
  const symbols = items.map((w) => w.symbol)
  const { data, isLoading, error } = useQuotes(symbols)
  const [charting, setCharting] = useState<{ symbol: string; name: string } | null>(null)

  if (items.length === 0) {
    return (
      <div className="card card-pad-lg muted">
        Watchlist vazia. Adiciona tickers em <strong>Configurações → Watchlist</strong>.
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
          ? 'Para mostrar cotações ao vivo, define FINNHUB_API_KEY no backend (.env).'
          : `Erro a obter cotações: ${error.message}`}
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
      title="Ver evolução do preço"
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
        {unavailable ? <span className="muted">sem dados</span> : eur2(quote!.current)}
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm trend-add"
        onClick={(e) => { e.stopPropagation(); onAdd() }}
        disabled={unavailable}
        aria-label={`Adicionar ${symbol} à carteira`}
      >
        + Adicionar
      </button>
    </div>
  )
}

function TrendCardSkeleton({ symbol, name }: { symbol: string; name: string }) {
  return (
    <div className="trend-card is-loading">
      <div className="trend-header">
        <div>
          <div className="trend-symbol">{symbol}</div>
          <div className="trend-name">{name}</div>
        </div>
      </div>
      <div className="trend-price muted">…</div>
      <button type="button" className="btn btn-ghost btn-sm trend-add" disabled>+ Adicionar</button>
    </div>
  )
}

export default Watchlist
