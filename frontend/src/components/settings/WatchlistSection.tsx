import { FormEvent, useEffect, useState } from 'react'
import {
  usePortfolio, useUpdateSettings,
} from '@/hooks/usePortfolio'
import {
  DEFAULT_WATCHLIST_SYMBOLS, nameForSymbol,
} from '@/hooks/useQuotes'

export function WatchlistSection() {
  const { data, isLoading } = usePortfolio()
  const update = useUpdateSettings()

  const stored = data?.settings.watchlistSymbols ?? null
  const [symbols, setSymbols] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [savedFlag, setSavedFlag] = useState(false)

  // Sync local state when server data arrives
  useEffect(() => {
    if (!data) return
    const list = (stored ?? '')
      .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    setSymbols(list.length > 0 ? list : Array.from(DEFAULT_WATCHLIST_SYMBOLS))
  }, [stored, data])

  if (isLoading) return <div className="card card-pad-lg muted">A carregar…</div>

  const isUsingDefault = !stored || stored === ''
  const isDirty = (() => {
    const current = (stored ?? '').split(',').filter(Boolean).join(',')
    const next = symbols.join(',')
    if (isUsingDefault && next === Array.from(DEFAULT_WATCHLIST_SYMBOLS).join(',')) return false
    return current !== next
  })()

  const add = (e: FormEvent) => {
    e.preventDefault()
    const sym = draft.trim().toUpperCase()
    if (!sym) return
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(sym)) return
    if (symbols.includes(sym)) { setDraft(''); return }
    if (symbols.length >= 16) return
    setSymbols([...symbols, sym])
    setDraft('')
  }

  const remove = (sym: string) => {
    setSymbols(symbols.filter((s) => s !== sym))
  }

  const save = async () => {
    await update.mutateAsync({ watchlistSymbols: symbols.join(',') } as Record<string, unknown>)
    setSavedFlag(true)
    setTimeout(() => setSavedFlag(false), 2500)
  }

  const resetToDefault = async () => {
    await update.mutateAsync({ watchlistSymbols: '' } as Record<string, unknown>)
    setSavedFlag(true)
    setTimeout(() => setSavedFlag(false), 2500)
  }

  return (
    <div className="card card-pad-lg">
      <p className="muted modal-intro">
        Personaliza os tickers mostrados em <strong>Investimentos → Em alta · Nasdaq</strong>.
        Máximo 16. Aceita tickers Nasdaq/NYSE (apenas A-Z, 0-9, ponto, hífen).
        Lista vazia = usa a default ({DEFAULT_WATCHLIST_SYMBOLS.length} tickers).
      </p>

      <form onSubmit={add} className="watchlist-add">
        <input
          type="text" placeholder="Ex: TSLA"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          maxLength={10}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim() || symbols.length >= 16}>
          + Adicionar
        </button>
      </form>

      <h3 className="settings-subhead">
        Tickers ({symbols.length}/16)
        {isUsingDefault && <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>(default)</span>}
      </h3>
      {symbols.length === 0 ? (
        <p className="muted">Lista vazia.</p>
      ) : (
        <ul className="watchlist-chips">
          {symbols.map((sym) => (
            <li key={sym} className="watchlist-chip">
              <span className="watchlist-chip-sym">{sym}</span>
              <span className="watchlist-chip-name muted">{nameForSymbol(sym) !== sym ? nameForSymbol(sym) : ''}</span>
              <button type="button" onClick={() => remove(sym)} aria-label={`Remover ${sym}`}>×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="account-actions">
        {savedFlag && <span className="save-confirm">✓ Guardado</span>}
        {!isUsingDefault && (
          <button type="button" className="btn btn-ghost" onClick={resetToDefault} disabled={update.isLoading}>
            Repor default
          </button>
        )}
        <button
          type="button" className="btn btn-primary"
          onClick={save}
          disabled={!isDirty || update.isLoading}
        >
          {update.isLoading ? 'A guardar…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

export default WatchlistSection
