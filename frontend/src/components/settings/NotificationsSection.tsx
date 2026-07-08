import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

// ── Notificações (Settings → Preferências) ───────────────────────
// Web Push enable/disable for THIS device + per-topic switches (+ the monthly
// email digest toggle, WS4). The whole section hides when the server has no
// VAPID keys (503 from /vapid-key) or the browser lacks SW/Push support.

interface Prefs {
  pushPayment: boolean
  pushEuribor: boolean
  pushImportReminder: boolean
  emailMonthlyDigest: boolean
}

type Support = 'checking' | 'unsupported' | 'unconfigured' | 'ready'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(b64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export function NotificationsSection() {
  const { t } = useTranslation('settings')
  const [support, setSupport] = useState<Support>('checking')
  const [vapidKey, setVapidKey] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        if (!cancelled) setSupport('unsupported')
        return
      }
      try {
        const { key } = await api.get<{ key: string }>('/api/push/vapid-key')
        const [{ prefs, endpoints }, sub] = await Promise.all([
          api.get<{ prefs: Prefs; devices: number; endpoints: string[] }>('/api/push/prefs'),
          currentSubscription(),
        ])
        if (cancelled) return
        setVapidKey(key)
        setPrefs(prefs)
        // Shared-device guard: only count the browser's subscription as "on"
        // when it belongs to THIS account — a previous user's leftover
        // subscription shows "Ativar" instead (enabling re-claims the device).
        setSubscribed(!!sub && endpoints.includes(sub.endpoint))
        setSupport('ready')
      } catch {
        if (!cancelled) setSupport('unconfigured') // 503 → server not configured
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Hidden entirely when the feature can't work here.
  if (support === 'checking' || support === 'unsupported' || support === 'unconfigured') return null

  const enable = async () => {
    setBusy(true); setError(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setError(t('notifications.denied')); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
      })
      await api.post('/api/push/subscribe', sub.toJSON())
      setSubscribed(true)
    } catch {
      setError(t('notifications.error'))
    } finally {
      setBusy(false)
    }
  }

  const disable = async () => {
    setBusy(true); setError(null)
    try {
      const sub = await currentSubscription()
      if (sub) {
        await api.delete('/api/push/subscribe', { endpoint: sub.endpoint })
        await sub.unsubscribe()
      }
      setSubscribed(false)
    } catch {
      setError(t('notifications.error'))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (key: keyof Prefs) => {
    if (!prefs) return
    const value = !prefs[key]
    setPrefs((p) => (p ? { ...p, [key]: value } : p)) // optimistic
    try {
      await api.put('/api/push/prefs', { [key]: value })
    } catch {
      // Functional revert of ONLY this key — a concurrent toggle of another
      // switch must not be stomped by a stale closure.
      setPrefs((p) => (p ? { ...p, [key]: !value } : p))
      setError(t('notifications.error'))
    }
  }

  // iOS only delivers Web Push to INSTALLED (standalone) PWAs.
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
  const showIosHint = isIos && !isStandalone

  const topics: Array<{ key: keyof Prefs; label: string }> = [
    { key: 'pushPayment', label: t('notifications.topicPayment') },
    { key: 'pushEuribor', label: t('notifications.topicEuribor') },
    { key: 'pushImportReminder', label: t('notifications.topicImport') },
    { key: 'emailMonthlyDigest', label: t('notifications.topicDigest') },
  ]

  return (
    <>
    {/* Heading lives here (not in Settings.tsx) so it hides with the section
        when the server has no VAPID keys or the browser lacks push support. */}
    <h2 className="section-label" style={{ marginTop: 28 }}>{t('notifications.label')}</h2>
    <div className="card card-pad-lg">
      <p className="muted modal-intro">{t('notifications.intro')}</p>

      {error && <div className="form-error" role="alert">{error}</div>}
      {showIosHint && <p className="field-hint">{t('notifications.iosHint')}</p>}

      {!subscribed ? (
        <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>
          {busy ? t('states.saving', { ns: 'common' }) : t('notifications.enable')}
        </button>
      ) : (
        <>
          <div className="settings-backup-stack" role="group" aria-label={t('notifications.topicsLabel')}>
            {topics.map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={prefs?.[key] ?? true}
                  onChange={() => toggle(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <button
            type="button" className="btn btn-ghost" style={{ marginTop: 14 }}
            onClick={disable} disabled={busy}
          >
            {t('notifications.disableDevice')}
          </button>
        </>
      )}
    </div>
    </>
  )
}

export default NotificationsSection
