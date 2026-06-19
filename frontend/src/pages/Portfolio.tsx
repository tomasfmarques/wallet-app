import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePortfolio } from '@/hooks/usePortfolio'
import { PortfolioKpis } from '@/components/portfolio/PortfolioKpis'
import { AssetTable } from '@/components/portfolio/AssetTable'
import { MonthlyContribTable } from '@/components/portfolio/MonthlyContribTable'
import { ProjectionPanel } from '@/components/portfolio/ProjectionPanel'
import { AssetModal, type AssetPreset } from '@/components/portfolio/AssetModal'
import { Watchlist } from '@/components/portfolio/Watchlist'
import { RiskCard } from '@/components/portfolio/RiskCard'
import { StateBlock } from '@/components/ui/StateBlock'
import { resolveWatchlist } from '@/hooks/useQuotes'

export function Portfolio() {
  const { t } = useTranslation('portfolio')
  const { data, isLoading, error, refetch } = usePortfolio()
  const [addOpen, setAddOpen] = useState(false)
  const [preset, setPreset] = useState<AssetPreset | undefined>(undefined)

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

  return (
    <div className="portfolio-page">
      <header className="page-header">
        <h1>{t('title')}</h1>
      </header>

      <section>
        <h2 className="section-label">{t('trendingLabel')}</h2>
        <Watchlist
          items={resolveWatchlist((settings as { watchlistSymbols?: string | null }).watchlistSymbols ?? null)}
          onAdd={openAdd}
        />
      </section>

      {hasAssets && <PortfolioKpis kpis={kpis} horizonYears={settings.gH} />}

      {hasAssets && (
        <section>
          <h2 className="section-label">{t('risk.section')}</h2>
          <RiskCard />
        </section>
      )}

      <section>
        <div className="budget-section-head">
          <h2 className="section-label" style={{ margin: 0 }}>{t('myPortfolioLabel')}</h2>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openAdd()}>
            + {t('asset.addTitle')}
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
    </div>
  )
}

export default Portfolio
