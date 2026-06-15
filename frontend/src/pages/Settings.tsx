import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountSection } from '@/components/settings/AccountSection'
import { EuriborSection } from '@/components/settings/EuriborSection'
import { ExportSection } from '@/components/settings/ExportSection'
import { ImportSection } from '@/components/settings/ImportSection'
import { WatchlistSection } from '@/components/settings/WatchlistSection'
import { LanguageSection } from '@/components/settings/LanguageSection'
import { DangerZoneSection } from '@/components/settings/DangerZoneSection'

type Tab = 'account' | 'language' | 'euribor' | 'backup' | 'watchlist' | 'danger'

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
        <TabBtn id="account"   label={t('tabs.account')}   tab={tab} set={setTab} />
        <TabBtn id="language"  label={t('tabs.language')}  tab={tab} set={setTab} />
        <TabBtn id="euribor"   label={t('tabs.euribor')}   tab={tab} set={setTab} />
        <TabBtn id="backup"    label={t('tabs.backup')}    tab={tab} set={setTab} />
        <TabBtn id="watchlist" label={t('tabs.watchlist')} tab={tab} set={setTab} />
        <TabBtn id="danger"    label={t('tabs.danger')}    tab={tab} set={setTab} />
      </div>

      {tab === 'account'   && <AccountSection />}
      {tab === 'language'  && <LanguageSection />}
      {tab === 'euribor'   && <EuriborSection />}
      {tab === 'backup'    && (
        <div className="settings-backup-stack">
          <h2 className="section-label">{t('backup.exportLabel')}</h2>
          <ExportSection />
          <h2 className="section-label" style={{ marginTop: 28 }}>{t('backup.importLabel')}</h2>
          <ImportSection />
        </div>
      )}
      {tab === 'watchlist' && <WatchlistSection />}
      {tab === 'danger'    && <DangerZoneSection />}
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
