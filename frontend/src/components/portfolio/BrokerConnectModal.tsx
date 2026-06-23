import { FormEvent, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { apiErrorMessage } from '@/lib/apiError'
import {
  useBrokerStatus, useBrokerConnect, useBrokerSync, useBrokerDisconnect, type BrokerEnv,
} from '@/hooks/useBroker'

interface Props { open: boolean; onClose: () => void }

// Trading 212 live-sync — mirrors the bank-connect modal: security note, a
// read-only API key form (with how-to-generate steps), then a connected state
// with Sincronizar + disconnect. Gated: when the server has no BROKER_ENC_KEY,
// `configured` is false and we show a "brevemente" note instead of the form.
export function BrokerConnectModal({ open, onClose }: Props) {
  const { t } = useTranslation('portfolio')
  const { data: status } = useBrokerStatus(open)
  const configured = status?.configured ?? false
  const connection = status?.connection ?? null
  const connect = useBrokerConnect()
  const sync = useBrokerSync()
  const disconnect = useBrokerDisconnect()

  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [env, setEnv] = useState<BrokerEnv>('live')
  const [err, setErr] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  const doConnect = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setSyncMsg(null)
    if (!apiKey.trim()) { setErr(t('broker.errKey')); return }
    try {
      await connect.mutateAsync({ apiKey: apiKey.trim(), apiSecret: apiSecret.trim() || undefined, env })
      setApiKey(''); setApiSecret('')
    } catch (e2) { setErr(apiErrorMessage(e2, t('broker.connectError'))) }
  }

  const doSync = async () => {
    setErr(null); setSyncMsg(null)
    try {
      const r = await sync.mutateAsync()
      setSyncMsg(
        t('broker.syncOk', { count: r.summary.created }) +
        (r.summary.skipped > 0 ? ' ' + t('broker.syncSkipped', { count: r.summary.skipped }) : ''),
      )
    } catch (e2) { setErr(apiErrorMessage(e2, t('broker.syncError'))) }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('broker.title')} maxWidth={600}>
      <div className="bank-secure">
        <span className="bank-secure-icon" aria-hidden>🔒</span>
        <div>
          <strong>{t('broker.secureTitle')}</strong>
          <ul className="bank-secure-list">
            <li><Trans i18nKey="broker.secure1" ns="portfolio" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="broker.secure2" ns="portfolio" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="broker.secure3" ns="portfolio" components={{ 1: <strong /> }} /></li>
          </ul>
        </div>
      </div>

      {err && <div className="form-error" style={{ marginBottom: 10 }}>{err}</div>}
      {syncMsg && <div className="bank-sync-ok">{syncMsg}</div>}

      {!configured ? (
        <p className="muted" style={{ fontSize: 12.5 }}>
          <Trans i18nKey="broker.notConfigured" ns="portfolio" components={{ 1: <strong /> }} />
        </p>
      ) : connection ? (
        <>
          <h3 className="settings-subhead">{t('broker.connectedTitle')}</h3>
          <div className="bank-conn-row">
            <span className="bank-logo bank-logo-fallback" aria-hidden>T</span>
            <div className="bank-conn-main">
              <span className="bank-conn-name">Trading 212 · {connection.env}</span>
              <span className="bank-conn-status is-linked">
                {connection.lastSyncAt
                  ? t('broker.lastSync', { date: new Date(connection.lastSyncAt).toLocaleString() })
                  : t('broker.neverSynced')}
              </span>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => disconnect.mutate()} disabled={disconnect.isLoading}>
              {t('broker.disconnect')}
            </button>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={doSync} disabled={sync.isLoading}>
              {sync.isLoading ? t('broker.syncing') : t('broker.syncBtn')}
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 className="settings-subhead">{t('broker.howTitle')}</h3>
          <ol className="broker-steps">
            <li><Trans i18nKey="broker.step1" ns="portfolio" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="broker.step2" ns="portfolio" components={{ 1: <strong /> }} /></li>
            <li><Trans i18nKey="broker.step3" ns="portfolio" components={{ 1: <strong /> }} /></li>
          </ol>
          <form onSubmit={doConnect} className="amort-form" noValidate>
            <div className="field">
              <label htmlFor="bk-key">{t('broker.keyLabel')}</label>
              <input id="bk-key" type="password" value={apiKey} autoComplete="off"
                onChange={(e) => setApiKey(e.target.value)} placeholder={t('broker.keyPlaceholder')} />
            </div>
            <div className="field">
              <label htmlFor="bk-secret">{t('broker.secretLabel')}</label>
              <input id="bk-secret" type="password" value={apiSecret} autoComplete="off"
                onChange={(e) => setApiSecret(e.target.value)} placeholder={t('broker.secretPlaceholder')} />
            </div>
            <div className="field">
              <label htmlFor="bk-env">{t('broker.envLabel')}</label>
              <select id="bk-env" value={env} onChange={(e) => setEnv(e.target.value as BrokerEnv)}>
                <option value="live">{t('broker.envLive')}</option>
                <option value="demo">{t('broker.envDemo')}</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={connect.isLoading}>
                {connect.isLoading ? t('broker.connecting') : t('broker.connectBtn')}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  )
}

export default BrokerConnectModal
