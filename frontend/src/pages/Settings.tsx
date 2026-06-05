import { useState } from 'react'
import { AccountSection } from '@/components/settings/AccountSection'
import { EuriborSection } from '@/components/settings/EuriborSection'
import { ExportSection } from '@/components/settings/ExportSection'
import { ImportSection } from '@/components/settings/ImportSection'
import { WatchlistSection } from '@/components/settings/WatchlistSection'
import { DangerZoneSection } from '@/components/settings/DangerZoneSection'

type Tab = 'account' | 'euribor' | 'backup' | 'watchlist' | 'danger'

export function Settings() {
  const [tab, setTab] = useState<Tab>('account')

  return (
    <div className="settings-page">
      <header className="page-header">
        <div>
          <h1>Configurações</h1>
          <p className="muted">Conta, dados do empréstimo, backup e personalizações.</p>
        </div>
      </header>

      <div className="subtabs" role="tablist">
        <TabBtn id="account"   label="Conta"     tab={tab} set={setTab} />
        <TabBtn id="euribor"   label="Euribor"   tab={tab} set={setTab} />
        <TabBtn id="backup"    label="Backup"    tab={tab} set={setTab} />
        <TabBtn id="watchlist" label="Watchlist" tab={tab} set={setTab} />
        <TabBtn id="danger"    label="Perigo"    tab={tab} set={setTab} />
      </div>

      {tab === 'account'   && <AccountSection />}
      {tab === 'euribor'   && <EuriborSection />}
      {tab === 'backup'    && (
        <div className="settings-backup-stack">
          <h2 className="section-label">EXPORTAR</h2>
          <ExportSection />
          <h2 className="section-label" style={{ marginTop: 28 }}>IMPORTAR</h2>
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
