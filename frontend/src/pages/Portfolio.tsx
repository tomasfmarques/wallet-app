import { useState } from 'react'
import { usePortfolio } from '@/hooks/usePortfolio'
import { PortfolioKpis } from '@/components/portfolio/PortfolioKpis'
import { AssetTable } from '@/components/portfolio/AssetTable'
import { MonthlyContribTable } from '@/components/portfolio/MonthlyContribTable'
import { ProjectionPanel } from '@/components/portfolio/ProjectionPanel'
import { AssetModal, type AssetPreset } from '@/components/portfolio/AssetModal'
import { Watchlist } from '@/components/portfolio/Watchlist'
import { resolveWatchlist } from '@/hooks/useQuotes'

export function Portfolio() {
  const { data, isLoading, error } = usePortfolio()
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
        <h1>Investimentos</h1>
        <div className="form-error">Não foi possível carregar: {error.message}</div>
      </div>
    )
  }
  if (!data) return null

  const { assets, settings, projection, kpis } = data
  const hasAssets = assets.length > 0

  return (
    <div className="portfolio-page">
      <header className="page-header">
        <h1>Investimentos</h1>
        <div className="page-header-actions">
          <button type="button" className="btn btn-primary" onClick={() => openAdd()}>
            + Adicionar ativo
          </button>
        </div>
      </header>

      <section>
        <h2 className="section-label">EM ALTA · NASDAQ</h2>
        <Watchlist
          items={resolveWatchlist((settings as { watchlistSymbols?: string | null }).watchlistSymbols ?? null)}
          onAdd={openAdd}
        />
      </section>

      {hasAssets && <PortfolioKpis kpis={kpis} horizonYears={settings.gH} />}

      <section>
        <h2 className="section-label">A MINHA CARTEIRA</h2>
        <AssetTable assets={assets} />
      </section>

      {hasAssets && (
        <section>
          <h2 className="section-label">REFORÇO MENSAL POR ATIVO</h2>
          <MonthlyContribTable assets={assets} />
        </section>
      )}

      {hasAssets && (
        <section>
          <h2 className="section-label">PROJEÇÃO</h2>
          <ProjectionPanel projection={projection} settings={settings} />
        </section>
      )}

      <AssetModal open={addOpen} onClose={closeAdd} preset={preset} />
    </div>
  )
}

export default Portfolio
