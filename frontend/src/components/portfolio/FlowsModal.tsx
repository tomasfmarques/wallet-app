import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { eur, eur2, eurSigned, ymToLong } from '@/lib/format'
import type { AssetWithFlows } from '@/hooks/usePortfolio'

// Reforço history for one asset — the `portfolio_flows` rows (already in the
// portfolio response) listed newest-first with a running total. Read-only.
export function FlowsModal({
  open, onClose, asset,
}: {
  open: boolean
  onClose: () => void
  asset: AssetWithFlows | null
}) {
  const { t } = useTranslation('portfolio')
  const flows = [...(asset?.flows ?? [])].sort((a, b) => b.ym.localeCompare(a.ym))
  const total = flows.reduce((s, f) => s + f.amount, 0)

  return (
    <Modal open={open} onClose={onClose} title={t('flows.title', { name: asset?.name ?? '' })}>
      {flows.length === 0 ? (
        <div className="muted">{t('flows.empty')}</div>
      ) : (
        <>
          <ul className="flows-list">
            {flows.map((f) => (
              <li key={f.id} className="flows-row">
                <span className="flows-ym">{ymToLong(f.ym)}</span>
                <span className={`flows-amount ${f.amount >= 0 ? 'gain-positive' : 'gain-negative'}`}>
                  {f.amount >= 0 ? `+${eur2(f.amount)}` : eurSigned(f.amount)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flows-total">
            <span>{t('flows.total', { count: flows.length })}</span>
            <strong>{eur(total)}</strong>
          </div>
        </>
      )}
    </Modal>
  )
}

export default FlowsModal
