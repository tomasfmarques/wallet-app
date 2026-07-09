import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePortfolio, useUpdateSettings } from '@/hooks/usePortfolio'
import { PortfolioKpis } from '@/components/portfolio/PortfolioKpis'
import { AssetTable } from '@/components/portfolio/AssetTable'
import { MonthlyContribTable } from '@/components/portfolio/MonthlyContribTable'
import { ProjectionPanel } from '@/components/portfolio/ProjectionPanel'
import { AssetModal, type AssetPreset } from '@/components/portfolio/AssetModal'
import { FileImportModal } from '@/components/portfolio/FileImportModal'
import { BrokerConnectModal } from '@/components/portfolio/BrokerConnectModal'
import { Watchlist } from '@/components/portfolio/Watchlist'
import { RiskCard } from '@/components/portfolio/RiskCard'
import { CapitalGainsCard } from '@/components/portfolio/CapitalGainsCard'
import { StateBlock } from '@/components/ui/StateBlock'
import { resolveWatchlist } from '@/hooks/useQuotes'

export function Portfolio() {
  const { t } = useTranslation('portfolio')
  const { data, isLoading, error, refetch } = usePortfolio()
  const updateSettings = useUpdateSettings()
  const [addOpen, setAddOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState(false)
  const [brokerOpen, setBrokerOpen] = useState(false)
  const [preset, setPreset] = useState<AssetPreset | undefined>(undefined)
  // "EM ALTA" watchlist is collapsed by default to keep the page compact; the
  // user's open/closed preference persists across visits.
  const [trendingOpen, setTrendingOpen] = useState<boolean>(() => {
    try { return localStorage.getItem('w360:trendingOpen') === '1' } catch { return false }
  })
  const toggleTrending = () => {
    setTrendingOpen((open) => {
      const next = !open
      try { localStorage.setItem('w360:trendingOpen', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const openAdd = (p?: AssetPreset) => {
    setPreset(p)
    setAddOpen(true)
  }
  const closeAdd = () => {
    setAddOpen(false)
    // Clear the preset on close so reopening from the header doesn't re-seed it
    setTimeout(() => setPreset(undefined), 200)
  }

  if (isLoading) {
    return <div className="auth-loading"><div className="spinner" /></div>
  }
  if (error) {
    return (
      <div className="page-stub">
        <h1>{t('title')}</h1>
        <StateBlock variant="error" message={t('loadError')} onRetry={() => refetch()} />
      </div>
    )
  }
  if (!data) return null

  const { assets, settings, projection, kpis } = data
  const hasAssets = assets.length > 0
  const watchItems = resolveWatchlist((settings as { watchlistSymbols?: string | null }).watchlistSymbols ?? null)

  return (
    <div className="portfolio-page">
      <header className="page-header">
        <h1>{t('title')}</h1>
      </header>

      <section>
        <button
          type="button"
          className={`watchlist-toggle${trendingOpen ? ' is-open' : ''}`}
          onClick={toggleTrending}
          aria-expanded={trendingOpen}
        >
          <span className="watchlist-toggle-icon" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </span>
          <span className="watchlist-toggle-text">
            <span className="watchlist-toggle-title">{t('trendingLabel')}</span>
            <span className="watchlist-toggle-sub">{t('trendingWatch', { count: watchItems.length })}</span>
          </span>
          <span className="watchlist-toggle-cta">
            {trendingOpen ? t('trendingHide') : t('trendingShow')}
            <span className="watchlist-toggle-chevron" aria-hidden>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
          </span>
        </button>
        {trendingOpen && (
          <Watchlist
            items={watchItems}
            onAdd={openAdd}
            onReorder={(symbols) => updateSettings.mutate({ watchlistSymbols: symbols.join(',') })}
          />
        )}
      </section>

      {hasAssets && <PortfolioKpis kpis={kpis} />}

      {hasAssets && (
        <section>
          <h2 className="section-label">{t('risk.section')}</h2>
          <RiskCard />
        </section>
      )}

      {hasAssets && (
        <section>
          <h2 className="section-label">{t('irs.section')}</h2>
          <CapitalGainsCard />
        </section>
      )}

      <section>
        <div className="budget-section-head portfolio-head">
          <h2 className="section-label" style={{ margin: 0 }}>{t('myPortfolioLabel')}</h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openAdd()}>
            + {t('asset.addTitle')}
          </button>
        </div>
        <div className="portfolio-import-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBrokerOpen(true)}>
            {t('broker.button')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFileOpen(true)}>
            {t('fileImport.button')}
          </button>
        </div>
        <AssetTable assets={assets} />
      </section>

      {hasAssets && (
        <section>
          <h2 className="section-label">{t('monthlyContribLabel')}</h2>
          <MonthlyContribTable assets={assets} />
        </section>
      )}

      {hasAssets && (
        <section>
          <h2 className="section-label">{t('projectionSection')}</h2>
          <ProjectionPanel projection={projection} settings={settings} />
        </section>
      )}

      <AssetModal open={addOpen} onClose={closeAdd} preset={preset} />
      <FileImportModal open={fileOpen} onClose={() => setFileOpen(false)} />
      <BrokerConnectModal open={brokerOpen} onClose={() => setBrokerOpen(false)} />
    </div>
  )
}

export default Portfolio
