import { useState } from 'react'
import { eur, eurSigned, pctSigned } from '@/lib/format'
import {
  useDeleteAsset, useRefreshAssetValue, useRefreshAllValues,
  type AssetWithFlows,
} from '@/hooks/usePortfolio'
import { AssetModal } from './AssetModal'
import { ReforcarModal } from './ReforcarModal'
import type { PortfolioAsset } from '@/types'

interface Props {
  assets: AssetWithFlows[]
}

// "A minha carteira" — line-per-asset list with totals row at the top,
// allocation bar, and per-row Reforçar / editar / remover actions.
export function AssetTable({ assets }: Props) {
  const del = useDeleteAsset()
  const refreshAll = useRefreshAllValues()
  const [editing, setEditing] = useState<PortfolioAsset | null>(null)
  const [reforcando, setReforcando] = useState<PortfolioAsset | null>(null)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  const handleRefreshAll = async () => {
    setRefreshMsg(null)
    try {
      const r = await refreshAll.mutateAsync()
      const failed = r.results.filter((x) => !x.ok).map((x) => x.ticker)
      setRefreshMsg(
        failed.length === 0
          ? `✓ ${r.summary.updated} ativos atualizados`
          : `✓ ${r.summary.updated} atualizados · ${failed.length} sem cotação (${failed.join(', ')})`,
      )
      setTimeout(() => setRefreshMsg(null), 6000)
    } catch (e) {
      setRefreshMsg('Erro ao atualizar')
      setTimeout(() => setRefreshMsg(null), 4000)
    }
  }

  if (assets.length === 0) {
    return (
      <div className="card card-pad-lg muted">
        Sem ativos. Carrega em <strong>Adicionar ativo</strong> para começar.
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
            <div className="kpi-label">VALOR ATUAL</div>
            <div className="asset-totals-value">{eur(totalValue)}</div>
          </div>
          <div className={totalDelta >= 0 ? 'gain-positive' : 'gain-negative'}>
            <div className="kpi-label">GANHO / PERDA</div>
            <div className="asset-totals-value">{eurSigned(totalDelta)}</div>
            <div className="kpi-meta">{pctSigned(totalDeltaPct)}</div>
          </div>
          <div className="asset-totals-spacer" />
          <div className="asset-totals-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRefreshAll}
              disabled={refreshAll.isLoading}
              title="Atualizar todos os valores com a cotação atual (Yahoo Finance)"
            >
              {refreshAll.isLoading ? 'A atualizar…' : '↻ Atualizar valores'}
            </button>
            {refreshMsg && (
              <span className="refresh-toast">{refreshMsg}</span>
            )}
          </div>
        </div>

        {/* Allocation bar */}
        <div className="alloc-bar" aria-label="Distribuição da carteira">
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
              onEdit={() => setEditing(a)}
              onReforcar={() => setReforcando(a)}
              onDelete={() => {
                if (confirm(`Remover ${a.name}?`)) del.mutate(a.id)
              }}
            />
          ))}
        </ul>
        <p className="muted asset-table-footer">
          Dica: clica em <strong>↻ Atualizar valores</strong> ou no <strong>↻</strong> de cada linha para
          buscar o preço atual de mercado (Yahoo Finance).
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
    </>
  )
}

const ALLOC_COLOURS = ['#2563EB', '#0EA5A4', '#7C3AED', '#E8590C', '#D97706', '#059669', '#DC2626']

interface RowProps {
  asset: AssetWithFlows
  colour: string
  onEdit: () => void
  onReforcar: () => void
  onDelete: () => void
}

function HoldRow({ asset, colour, onEdit, onReforcar, onDelete }: RowProps) {
  const refresh = useRefreshAssetValue()
  const [refreshErr, setRefreshErr] = useState<string | null>(null)
  const delta = asset.value - asset.invested
  const deltaPct = asset.invested > 0 ? delta / asset.invested : 0

  const handleRefresh = async () => {
    setRefreshErr(null)
    try {
      await refresh.mutateAsync(asset.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sem cotação'
      setRefreshErr(msg)
      setTimeout(() => setRefreshErr(null), 4000)
    }
  }

  return (
    <li className="hold-row">
      <div className="hold-badge" style={{ background: colour }} aria-hidden>
        {asset.ticker.slice(0, 2)}
      </div>
      <div className="hold-main">
        <div className="hold-name">{asset.name}</div>
        <div className="hold-sub">
          {asset.ticker} · {asset.qty.toLocaleString('pt-PT', { maximumFractionDigits: 4 })} un.
          {refreshErr && <span className="gain-negative"> · {refreshErr}</span>}
        </div>
      </div>
      <div className="hold-value">
        <div className="hold-value-main">{eur(asset.value)}</div>
        <div className={`hold-value-sub ${delta >= 0 ? 'gain-positive' : 'gain-negative'}`}>
          {eurSigned(delta)} ({pctSigned(deltaPct)})
        </div>
      </div>
      <div className="hold-actions">
        <button
          type="button"
          className="btn btn-ghost btn-sm hold-refresh"
          onClick={handleRefresh}
          disabled={refresh.isLoading}
          title="Atualizar valor com cotação atual (Yahoo)"
          aria-label="Atualizar"
        >
          {refresh.isLoading ? '…' : '↻'}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onReforcar}>
          Reforçar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>
          Editar
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDelete}>
          Remover
        </button>
      </div>
    </li>
  )
}

export default AssetTable
