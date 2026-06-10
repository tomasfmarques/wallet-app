import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  useBankStatus, useBankInstitutions, useBankConnect, useBankSync, useBankDisconnect,
  type BankInstitution,
} from '@/hooks/useBank'

interface Props {
  open: boolean
  onClose: () => void
}

// Featured PT banks shown first (and as a static preview while the
// GoCardless credentials aren't configured yet). Logos via Clearbit's public
// logo CDN; when the API is configured we use GoCardless's own logo URLs.
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
      setErr(e instanceof Error ? e.message : 'Falha a iniciar a ligação')
    }
  }

  const runSync = async () => {
    setErr(null); setSyncMsg(null)
    try {
      const r = await sync.mutateAsync()
      const total = r.summary.incomes + r.summary.expenses
      setSyncMsg(
        `✓ ${total} novas transações` +
        (r.summary.autoClassified > 0 ? ` (${r.summary.autoClassified} auto-classificadas)` : '') +
        (r.summary.duplicates > 0 ? ` · ${r.summary.duplicates} já existiam` : ''),
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falha na sincronização')
    }
  }

  const connections = status?.connections ?? []

  return (
    <Modal open={open} onClose={onClose} title="Ligar banco" maxWidth={620}>
      {/* Security disclaimer */}
      <div className="bank-secure">
        <span className="bank-secure-icon" aria-hidden>🔒</span>
        <div>
          <strong>Ligação segura e regulada.</strong>
          <ul className="bank-secure-list">
            <li>Usa <strong>Open Banking (PSD2)</strong>, a norma europeia de acesso bancário, via GoCardless — uma entidade autorizada e supervisionada.</li>
            <li>Autenticas-te <strong>no site oficial do teu banco</strong> — o Wallet360 nunca vê nem guarda as tuas credenciais.</li>
            <li>O acesso é <strong>apenas de leitura</strong>: ninguém consegue mover dinheiro.</li>
            <li>O consentimento dura <strong>90 dias</strong> e podes revogá-lo a qualquer momento.</li>
          </ul>
        </div>
      </div>

      {err && <div className="form-error" style={{ marginBottom: 10 }}>{err}</div>}
      {syncMsg && <div className="bank-sync-ok">{syncMsg}</div>}

      {/* Existing connections */}
      {connections.length > 0 && (
        <>
          <h3 className="settings-subhead">Bancos ligados</h3>
          <ul className="bank-conn-list">
            {connections.map((c) => (
              <li key={c.id} className="bank-conn-row">
                <BankLogo src={c.logo} name={c.institutionName} />
                <div className="bank-conn-main">
                  <span className="bank-conn-name">{c.institutionName}</span>
                  <span className={`bank-conn-status is-${c.status}`}>
                    {c.status === 'linked' ? '● ligado' : c.status === 'expired' ? '● consentimento expirado' : '● aguarda autorização no banco'}
                  </span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => disconnect.mutate(c.id)}>
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <div className="form-actions" style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={runSync} disabled={sync.isLoading}>
              {sync.isLoading ? 'A sincronizar…' : '⟳ Sincronizar transações'}
            </button>
          </div>
          <hr className="divider" />
        </>
      )}

      {/* Bank picker */}
      <h3 className="settings-subhead">Escolhe o teu banco</h3>
      {!configured ? (
        <>
          <div className="bank-grid">
            {FEATURED.map((f) => (
              <div key={f.name} className="bank-card is-disabled">
                <BankLogo src={f.logo} name={f.name} />
                <span className="bank-card-name">{f.name}</span>
                <span className="bank-card-soon">brevemente</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5 }}>
            A ligação direta está quase pronta — falta ativar as credenciais (gratuitas) do
            fornecedor Open Banking no servidor. Entretanto podes continuar a usar
            <strong> Importar extrato</strong>.
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
            className="bank-search" type="search" placeholder="Procurar outro banco…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          {instLoading && <div className="muted" style={{ padding: 8 }}>A carregar bancos…</div>}
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
              {others.length === 0 && <li className="muted" style={{ padding: 8 }}>Sem resultados.</li>}
            </ul>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Depois de autorizares no site do banco, volta aqui e carrega em
            <strong> ⟳ Sincronizar transações</strong>. As novas entradas caem em
            <strong> Por classificar</strong>, com as regras aprendidas aplicadas automaticamente.
          </p>
        </>
      )}
    </Modal>
  )
}

export default BankConnectModal
