import { useState } from 'react'
import { eur } from '@/lib/format'
import { useUpdateAsset, type AssetWithFlows } from '@/hooks/usePortfolio'

interface Props {
  assets: AssetWithFlows[]
}

// "Reforço mensal por ativo" — editable list. Each row shows the asset and a
// €/month input. Updates persist on blur.
export function MonthlyContribTable({ assets }: Props) {
  if (assets.length === 0) {
    return <div className="card card-pad-lg muted">Adiciona ativos para configurar reforços.</div>
  }
  const total = assets.reduce((s, a) => s + a.monthly, 0)

  return (
    <div className="card asset-monthly">
      <ul className="mp-list">
        {assets.map((a) => (
          <MonthlyRow key={a.id} asset={a} />
        ))}
      </ul>
      <div className="mp-total">
        <span>Total mensal</span>
        <strong>{eur(total)}</strong>
      </div>
    </div>
  )
}

function MonthlyRow({ asset }: { asset: AssetWithFlows }) {
  const update = useUpdateAsset()
  const [val, setVal] = useState(asset.monthly.toString())

  const onBlur = () => {
    const n = Number(val)
    if (!Number.isFinite(n) || n < 0) {
      setVal(asset.monthly.toString())
      return
    }
    if (n === asset.monthly) return
    update.mutate({ id: asset.id, patch: { monthly: n } })
  }

  return (
    <li className="mp-row">
      <div className="mp-name">
        <span className="mp-ticker">{asset.ticker}</span>
        <span className="mp-asset-name">{asset.name}</span>
      </div>
      <div className="mp-input-wrap">
        <input
          type="number" inputMode="decimal" step="any" min="0"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={onBlur}
          disabled={update.isLoading}
        />
        <span className="mp-suffix">€/mês</span>
      </div>
    </li>
  )
}

export default MonthlyContribTable
