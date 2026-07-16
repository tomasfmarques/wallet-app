import { useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { apiErrorMessage } from '@/lib/apiError'
import {
  useBankStatus, useBankInstitutions, useBankConnect, useBankSync, useBankDisconnect,
  type BankInstitution,
} from '@/hooks/useBank'

interface Props {
  open: boolean
  onClose: () => void
}

// Featured PT banks shown first (and as a static preview while the Enable
// Banking credentials aren't configured yet). Logos via Clearbit's public
// logo CDN; when the API is configured we use the ASPSP's own logo URLs.
const FEATURED = [
  { match: /ctt/i, name: 'Banco CTT', logo: 'https://logo.clearbit.com/bancoctt.pt' },
  { match: /millennium|bcp/i, name: 'Millennium BCP', logo: 'https://logo.clearbit.com/millenniumbcp.pt' },
  { match: /montepio/i, name: 'Montepio', logo: 'https://logo.clearbit.com/bancomontepio.pt' },
]

function BankLogo({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <span className="bank-logo bank-logo-fallback" aria-hidden>{name.slice(0, 1)}</span>
  }
  return <img className="bank-logo" src={src} alt="" onError={() => setFailed(true)} />
}

export function BankConnectModal({ open, onClose }: Props) {
  const { t } = useTranslation('budget')
  const { data: status } = useBankStatus(open)
  const configured = status?.configured ?? false
  const { data: instData, isLoading: instLoading } = useBankInstitutions(open && configured)
  const connect = useBankConnect()
  const sync = useBankSync()
  const disconnect = useBankDisconnect()

  const [search, setSearch] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const institutions = instData?.institutions ?? []
  const { featured, others } = useMemo(() => {
    const feat: BankInstitution[] = []
    const rest: BankInstitution[] = []
    for (const i of institutions) {
      if (FEATURED.some((f) => f.match.test(i.name))) feat.push(i)
      else rest.push(i)
    }
    const q = search.trim().toLowerCase()
    return {
      featured: feat,
      others: q ? rest.filter((i) => i.name.toLowerCase().includes(q)) : rest,
    }
  }, [institutions, search])

  const startConnect = async (inst: BankInstitution) => {
    setErr(null)
    try {
      const { link } = await connect.mutateAsync({
        institutionId: inst.id, institutionName: inst.name, logo: inst.logo,
      })
      // Hand the user to the bank's own consent page.
      window.location.href = link
    } catch (e) {
      setErr(apiErrorMessage(e, t('bank.connectError')))
    }
  }

  const runSync = async () => {
    setErr(null); setSyncMsg(null)
    try {
      const r = await sync.mutateAsync()
      const total = r.summary.incomes + r.summary.expenses
      setSyncMsg(
        t('bank.syncOk', { count: total }) +
        (r.summary.autoClassified > 0 ? t('bank.syncAuto', { count: r.summary.autoClassified }) : '') +
        (r.summary.duplicates > 0 ? t('bank.syncDup', { count: r.summary.duplicates }) : ''),
      )
    } catch (e) {
      setErr(apiErrorMessage(e, t('bank.syncError')))
    }
  }

  const connections = status?.connections ?? []

  return (
    <Modal open={open} onClose={onClose} title={t('bank.title')} maxWidth={620}>
      {/* Security disclaimer */}
      <div className="bank-secure">
        <span className="bank-secure-icon"><Icon name="lock" size={18} /></span>
        <div>
          <strong>{t('bank.secureTitle')}</strong>
          <ul className="bank-secure-list">
            <li><Trans i18nKey="bank.secure1" ns="budget" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="bank.secure2" ns="budget" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="bank.secure3" ns="budget" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="bank.secure4" ns="budget" components={{ 1: <strong /> }} /></li>
          </ul>
        </div>
      </div>

      {/* Restricted-production disclosure: Enable Banking's free tier only
          returns accounts the app owner linked in their Control Panel, so for
          anyone else the sync legitimately comes back empty. Say so up front
          rather than letting them hit a silent no-op. */}
      <div className="bank-beta-note">
        <strong>{t('bank.betaTitle')}</strong>{' '}
        <Trans i18nKey="bank.betaBody" ns="budget" components={{ 1: <strong /> }} />
      </div>

      {err && <div className="form-error" style={{ marginBottom: 10 }}>{err}</div>}
      {syncMsg && <div className="bank-sync-ok">{syncMsg}</div>}

      {/* Existing connections */}
      {connections.length > 0 && (
        <>
          <h3 className="settings-subhead">{t('bank.connectedBanks')}</h3>
          <ul className="bank-conn-list">
            {connections.map((c) => (
              <li key={c.id} className="bank-conn-row">
                <BankLogo src={c.logo} name={c.institutionName} />
                <div className="bank-conn-main">
                  <span className="bank-conn-name">{c.institutionName}</span>
                  <span className={`bank-conn-status is-${c.status}`}>
                    {c.status === 'linked' ? t('bank.statusLinked') : c.status === 'expired' ? t('bank.statusExpired') : t('bank.statusPending')}
                  </span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => disconnect.mutate(c.id)}>
                  {t('actions.remove', { ns: 'common' })}
                </button>
              </li>
            ))}
          </ul>
          <div className="form-actions" style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={runSync} disabled={sync.isLoading}>
              {sync.isLoading ? t('bank.syncing') : t('bank.syncBtn')}
            </button>
          </div>
          <hr className="divider" />
        </>
      )}

      {/* Bank picker */}
      <h3 className="settings-subhead">{t('bank.chooseBank')}</h3>
      {!configured ? (
        <>
          <div className="bank-grid">
            {FEATURED.map((f) => (
              <div key={f.name} className="bank-card is-disabled">
                <BankLogo src={f.logo} name={f.name} />
                <span className="bank-card-name">{f.name}</span>
                <span className="bank-card-soon">{t('bank.soon')}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            <Trans i18nKey="bank.notConfigured" ns="budget" components={{ 1: <strong /> }} />
          </p>
        </>
      ) : (
        <>
          {featured.length > 0 && (
            <div className="bank-grid">
              {featured.map((i) => (
                <button key={i.id} type="button" className="bank-card" disabled={connect.isLoading} onClick={() => startConnect(i)}>
                  <BankLogo src={i.logo} name={i.name} />
                  <span className="bank-card-name">{i.name}</span>
                </button>
              ))}
            </div>
          )}
          <input
            className="bank-search" type="search" placeholder={t('bank.searchPlaceholder')}
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          {instLoading && <div className="muted" style={{ padding: 8 }}>{t('bank.loadingBanks')}</div>}
          {search.trim() && (
            <ul className="bank-result-list">
              {others.slice(0, 8).map((i) => (
                <li key={i.id}>
                  <button type="button" className="bank-result" disabled={connect.isLoading} onClick={() => startConnect(i)}>
                    <BankLogo src={i.logo} name={i.name} />
                    <span>{i.name}</span>
                  </button>
                </li>
              ))}
              {others.length === 0 && <li className="muted" style={{ padding: 8 }}>{t('bank.noResults')}</li>}
            </ul>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            <Trans i18nKey="bank.afterAuth" ns="budget" components={{ 1: <strong />, 3: <strong /> }} />
          </p>
        </>
      )}
    </Modal>
  )
}

export default BankConnectModal
