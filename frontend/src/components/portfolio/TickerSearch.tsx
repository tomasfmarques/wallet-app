import { useEffect, useRef, useState } from 'react'
import { useTickerSearch, type TickerSearchResult } from '@/hooks/useQuotes'

interface Props {
  onSelect: (result: TickerSearchResult) => void
}

const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'Ação',
  ETF: 'ETF',
  INDEX: 'Índice',
  CRYPTOCURRENCY: 'Cripto',
  FUTURE: 'Futuro',
}

// Debounced ticker/name search backed by Yahoo Finance. User types, a
// dropdown appears, clicking a row calls onSelect with the chosen result.
export function TickerSearch({ onSelect }: Props) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const { data, isFetching } = useTickerSearch(query)
  const results = data?.results ?? []

  // Debounce the query so we don't fire on every keystroke
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (input.trim().length < 2) { setQuery(''); setOpen(false); return }
    timerRef.current = setTimeout(() => {
      setQuery(input.trim())
      setOpen(true)
      setActive(-1)
    }, 280)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [input])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const choose = (r: TickerSearchResult) => {
    setOpen(false)
    setInput('')
    setQuery('')
    onSelect(r)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(results[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="ticker-search" ref={boxRef}>
      <div className="ticker-search-input-wrap">
        <span className="ticker-search-icon">🔍</span>
        <input
          type="text"
          className="ticker-search-input"
          placeholder="Pesquisar por nome ou ticker… ex: NVIDIA, IWDA, EDP"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {isFetching && <span className="ticker-search-spinner" aria-hidden />}
      </div>
      {open && results.length > 0 && (
        <ul className="ticker-search-dropdown" role="listbox">
          {results.map((r, i) => (
            <li
              key={r.symbol}
              role="option"
              aria-selected={i === active}
              className={`ticker-search-row ${i === active ? 'is-active' : ''}`}
              onMouseDown={() => choose(r)}
              onMouseEnter={() => setActive(i)}
            >
              <span className="ticker-search-symbol">{r.symbol}</span>
              <span className="ticker-search-name">{r.name}</span>
              <span className="ticker-search-meta">
                {r.exchange}
                {r.type && <> · {TYPE_LABEL[r.type] ?? r.type}</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TickerSearch
