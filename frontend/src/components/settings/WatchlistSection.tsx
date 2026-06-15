import { FormEvent, useEffect, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import {
  usePortfolio, useUpdateSettings,
} from '@/hooks/usePortfolio'
import {
  DEFAULT_WATCHLIST_SYMBOLS, nameForSymbol,
} from '@/hooks/useQuotes'

export function WatchlistSection() {
  const { t } = useTranslation('settings')
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

  if (isLoading) return <div className="card card-pad-lg muted">{t('states.loading', { ns: 'common' })}</div>

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
        <Trans
          i18nKey="watchlist.intro"
          ns="settings"
          values={{ count: DEFAULT_WATCHLIST_SYMBOLS.length }}
          components={{ 1: <strong /> }}
        />
      </p>

      <form onSubmit={add} className="watchlist-add">
        <input
          type="text" placeholder={t('watchlist.addPlaceholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          maxLength={10}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim() || symbols.length >= 16}>
          + {t('actions.add', { ns: 'common' })}
        </button>
      </form>

      <h3 className="settings-subhead">
        {t('watchlist.tickersHead', { count: symbols.length })}
        {isUsingDefault && <span className="muted" style={{ fontWeight: 400, fontSize: 12, marginLeft: 8 }}>{t('watchlist.default')}</span>}
      </h3>
      {symbols.length === 0 ? (
        <p className="muted">{t('watchlist.emptyList')}</p>
      ) : (
        <ul className="watchlist-chips">
          {symbols.map((sym) => (
            <li key={sym} className="watchlist-chip">
              <span className="watchlist-chip-sym">{sym}</span>
              <span className="watchlist-chip-name muted">{nameForSymbol(sym) !== sym ? nameForSymbol(sym) : ''}</span>
              <button type="button" onClick={() => remove(sym)} aria-label={t('watchlist.removeAria', { symbol: sym })}>×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="account-actions">
        {savedFlag && <span className="save-confirm">{t('watchlist.saved')}</span>}
        {!isUsingDefault && (
          <button type="button" className="btn btn-ghost" onClick={resetToDefault} disabled={update.isLoading}>
            {t('watchlist.resetDefault')}
          </button>
        )}
        <button
          type="button" className="btn btn-primary"
          onClick={save}
          disabled={!isDirty || update.isLoading}
        >
          {update.isLoading ? t('states.saving', { ns: 'common' }) : t('actions.save', { ns: 'common' })}
        </button>
      </div>
    </div>
  )
}

export default WatchlistSection
