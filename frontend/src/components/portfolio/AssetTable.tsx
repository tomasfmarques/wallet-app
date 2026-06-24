import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { eur, eurSigned, pctSigned, num } from '@/lib/format'
import { apiErrorMessage } from '@/lib/apiError'
import { exportCsv } from '@/lib/csvExport'
import {
  useDeleteAsset, useRefreshAssetValue, useRefreshAllValues,
  type AssetWithFlows,
} from '@/hooks/usePortfolio'
import { AssetModal } from './AssetModal'
import { ReforcarModal } from './ReforcarModal'
import { StockChartModal } from './StockChartModal'
import { FlowsModal } from './FlowsModal'
import type { PortfolioAsset } from '@/types'

interface Props {
  assets: AssetWithFlows[]
}

// "A minha carteira" — line-per-asset list with totals row at the top,
// allocation bar, and per-row Reforçar / editar / remover actions.
export function AssetTable({ assets }: Props) {
  const { t } = useTranslation('portfolio')
  const del = useDeleteAsset()
  const refreshAll = useRefreshAllValues()
  const [editing, setEditing] = useState<PortfolioAsset | null>(null)
  const [reforcando, setReforcando] = useState<PortfolioAsset | null>(null)
  const [charting, setCharting] = useState<PortfolioAsset | null>(null)
  const [flowing, setFlowing] = useState<AssetWithFlows | null>(null)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  const handleRefreshAll = async () => {
    setRefreshMsg(null)
    try {
      const r = await refreshAll.mutateAsync()
      const failed = r.results.filter((x) => !x.ok).map((x) => x.ticker)
      setRefreshMsg(
        failed.length === 0
          ? t('table.updated', { count: r.summary.updated })
          : t('table.updatedPartial', { updated: r.summary.updated, failedCount: failed.length, failed: failed.join(', ') }),
      )
      setTimeout(() => setRefreshMsg(null), 6000)
    } catch (e) {
      setRefreshMsg(t('table.updateError'))
      setTimeout(() => setRefreshMsg(null), 4000)
    }
  }

  // Export holdings as CSV (raw amounts; formula-injection-guarded in csvExport).
  const handleExportCsv = () => {
    if (assets.length === 0) return
    const rows = assets.map((a) => [a.name, a.ticker, a.isin ?? '', a.qty, a.invested, a.value, a.value - a.invested])
    exportCsv(
      'wallet360-carteira',
      [t('csv.name'), t('csv.ticker'), t('csv.isin'), t('csv.qty'), t('csv.invested'), t('csv.value'), t('csv.gain')],
      rows,
    )
  }

  if (assets.length === 0) {
    return (
      <div className="card card-pad-lg muted">
        <Trans i18nKey="table.empty" ns="portfolio" components={{ 1: <strong /> }} />
      </div>
    )
  }

  const totalValue = assets.reduce((s, a) => s + a.value, 0)
  const totalInvested = assets.reduce((s, a) => s + a.invested, 0)
  const totalDelta = totalValue - totalInvested
  const totalDeltaPct = totalInvested > 0 ? totalDelta / totalInvested : 0

  return (
    <>
      <div className="card asset-table">
        <div className="asset-totals">
          <div>
            <div className="kpi-label">{t('table.valueLabel')}</div>
            <div className="asset-totals-value">{eur(totalValue)}</div>
          </div>
          <div className={totalDelta >= 0 ? 'gain-positive' : 'gain-negative'}>
            <div className="kpi-label">{t('table.gainLabel')}</div>
            <div className="asset-totals-value">{eurSigned(totalDelta)}</div>
            <div className="kpi-meta">{pctSigned(totalDeltaPct)}</div>
          </div>
          <div className="asset-totals-spacer" />
          <div className="asset-totals-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleExportCsv}>
              {t('csv.button')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRefreshAll}
              disabled={refreshAll.isLoading}
              title={t('table.refreshAllTitle')}
            >
              {refreshAll.isLoading ? t('table.refreshing') : t('table.refreshAll')}
            </button>
            {refreshMsg && (
              <span className="refresh-toast">{refreshMsg}</span>
            )}
          </div>
        </div>

        {/* Allocation bar */}
        <div className="alloc-bar" aria-label={t('table.allocAria')}>
          {assets.map((a, i) => {
            const pct = totalValue > 0 ? (a.value / totalValue) * 100 : 0
            return (
              <div
                key={a.id}
                className="alloc-segment"
                style={{
                  width: `${pct}%`,
                  background: ALLOC_COLOURS[i % ALLOC_COLOURS.length],
                }}
                title={`${a.ticker} — ${pct.toFixed(1)}%`}
              />
            )
          })}
        </div>

        <ul className="hold-list">
          {assets.map((a, i) => (
            <HoldRow
              key={a.id}
              asset={a}
              colour={ALLOC_COLOURS[i % ALLOC_COLOURS.length]}
              onOpenChart={() => setCharting(a)}
              onHistory={() => setFlowing(a)}
              onEdit={() => setEditing(a)}
              onReforcar={() => setReforcando(a)}
              onDelete={() => {
                if (confirm(t('table.removeConfirm', { name: a.name }))) del.mutate(a.id)
              }}
            />
          ))}
        </ul>
        <p className="muted asset-table-footer">
          <Trans i18nKey="table.footer" ns="portfolio" components={{ 1: <strong />, 2: <strong /> }} />
        </p>
      </div>

      <AssetModal
        open={!!editing}
        onClose={() => setEditing(null)}
        asset={editing ?? undefined}
      />
      <ReforcarModal
        open={!!reforcando}
        onClose={() => setReforcando(null)}
        asset={reforcando}
      />
      <StockChartModal
        open={!!charting}
        onClose={() => setCharting(null)}
        symbol={charting?.ticker ?? ''}
        name={charting?.name ?? ''}
      />
      <FlowsModal
        open={!!flowing}
        onClose={() => setFlowing(null)}
        asset={flowing}
      />
    </>
  )
}

const ALLOC_COLOURS = ['#2563EB', '#0EA5A4', '#7C3AED', '#E8590C', '#D97706', '#059669', '#DC2626']

interface RowProps {
  asset: AssetWithFlows
  colour: string
  onOpenChart: () => void
  onHistory: () => void
  onEdit: () => void
  onReforcar: () => void
  onDelete: () => void
}

function HoldRow({ asset, colour, onOpenChart, onHistory, onEdit, onReforcar, onDelete }: RowProps) {
  const { t } = useTranslation('portfolio')
  const refresh = useRefreshAssetValue()
  const [refreshErr, setRefreshErr] = useState<string | null>(null)
  const delta = asset.value - asset.invested
  const deltaPct = asset.invested > 0 ? delta / asset.invested : 0

  const handleRefresh = async () => {
    setRefreshErr(null)
    try {
      await refresh.mutateAsync(asset.id)
    } catch (e) {
      const msg = apiErrorMessage(e, t('table.noQuote'))
      setRefreshErr(msg)
      setTimeout(() => setRefreshErr(null), 4000)
    }
  }

  return (
    <li
      className="hold-row is-clickable"
      onClick={onOpenChart}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenChart() } }}
      title={t('table.viewChart')}
    >
      <div className="hold-badge" style={{ background: colour }} aria-hidden>
        {asset.ticker.slice(0, 2)}
      </div>
      <div className="hold-main">
        <div className="hold-name">{asset.name}<span className="hold-chart-hint" aria-hidden>📈</span></div>
        <div className="hold-sub">
          {asset.ticker} · {t('table.units', { qty: num(asset.qty, 4) })}
          {refreshErr && <span className="gain-negative"> · {refreshErr}</span>}
        </div>
      </div>
      <div className="hold-value">
        <div className="hold-value-main">{eur(asset.value)}</div>
        <div className={`hold-value-sub ${delta >= 0 ? 'gain-positive' : 'gain-negative'}`}>
          {eurSigned(delta)} ({pctSigned(deltaPct)})
        </div>
      </div>
      <div className="hold-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn btn-ghost btn-sm hold-refresh"
          onClick={handleRefresh}
          disabled={refresh.isLoading}
          title={t('table.rowRefreshTitle')}
          aria-label={t('table.refreshAria')}
        >
          {refresh.isLoading ? '…' : '↻'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onReforcar}>
          {t('table.reforcar')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onHistory}
          disabled={asset.flows.length === 0}
          title={t('table.historyTitle')}
          aria-label={t('table.historyAria', { name: asset.name })}
        >
          {t('table.history')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
          {t('actions.edit', { ns: 'common' })}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete}>
          {t('actions.remove', { ns: 'common' })}
        </button>
      </div>
    </li>
  )
}

export default AssetTable
