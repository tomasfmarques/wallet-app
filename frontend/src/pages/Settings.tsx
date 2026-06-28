import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AccountSection } from '@/components/settings/AccountSection'
import { SecuritySection } from '@/components/settings/SecuritySection'
import { DemoSection } from '@/components/settings/DemoSection'
import { EuriborSection } from '@/components/settings/EuriborSection'
import { ExportSection } from '@/components/settings/ExportSection'
import { ImportSection } from '@/components/settings/ImportSection'
import { WatchlistSection } from '@/components/settings/WatchlistSection'
import { LanguageSection } from '@/components/settings/LanguageSection'
import { DangerZoneSection } from '@/components/settings/DangerZoneSection'

// Four grouped tabs (was seven flat ones):
//  • account     — identity & account lifecycle (profile, demo, danger zone)
//  • security    — password, PIN, biometrics
//  • preferences — app behaviour/display (language, Euribor, watchlist)
//  • data        — backup (export/import) + legal links
type Tab = 'account' | 'security' | 'preferences' | 'data'

export function Settings() {
  const { t } = useTranslation('settings')
  const [tab, setTab] = useState<Tab>('account')

  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1>{t('title')}</h1>
          <p className="muted">{t('subtitle')}</p>
        </div>
      </header>

      <div className="subtabs" role="tablist">
        <TabBtn id="account"     label={t('tabs.account')}     tab={tab} set={setTab} />
        <TabBtn id="security"    label={t('tabs.security')}    tab={tab} set={setTab} />
        <TabBtn id="preferences" label={t('tabs.preferences')} tab={tab} set={setTab} />
        <TabBtn id="data"        label={t('tabs.data')}        tab={tab} set={setTab} />
      </div>

      {tab === 'account' && (
        <div className="settings-backup-stack">
          <AccountSection />
          <DemoSection />
          <DangerZoneSection />
        </div>
      )}

      {tab === 'security' && <SecuritySection />}

      {tab === 'preferences' && (
        <div className="settings-backup-stack">
          <h2 className="section-label">{t('tabs.language')}</h2>
          <LanguageSection />
          <h2 className="section-label" style={{ marginTop: 28 }}>{t('tabs.euribor')}</h2>
          <EuriborSection />
          <h2 className="section-label" style={{ marginTop: 28 }}>{t('tabs.watchlist')}</h2>
          <WatchlistSection />
        </div>
      )}

      {tab === 'data' && (
        <div className="settings-backup-stack">
          <h2 className="section-label">{t('backup.exportLabel')}</h2>
          <ExportSection />
          <h2 className="section-label" style={{ marginTop: 28 }}>{t('backup.importLabel')}</h2>
          <ImportSection />
          <footer className="settings-legal">
            <Link to="/privacidade">{t('legal.privacy', { ns: 'auth' })}</Link>
            <span aria-hidden> · </span>
            <Link to="/eliminar-conta">{t('legal.deletion', { ns: 'auth' })}</Link>
          </footer>
        </div>
      )}
    </div>
  )
}

function TabBtn({ id, label, tab, set }: { id: Tab; label: string; tab: Tab; set: (t: Tab) => void }) {
  return (
    <button
      type="button" role="tab" aria-selected={tab === id}
      className={`subtab ${tab === id ? 'is-active' : ''}`}
      onClick={() => set(id)}
    >{label}</button>
  )
}

export default Settings
