import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { useLock } from '@/hooks/useLock'
import { usePinVerify, useWebAuthnAuth } from '@/hooks/useSecurity'
import { ApiError } from '@/lib/api'

const PIN_LEN = 6

// Full-screen app-lock. Unlock with the 6-digit PIN (server-verified) or, if a
// passkey is registered on the account, with biometrics (WebAuthn). After too
// many wrong PINs the server locks out and we sign the user out.
export function LockScreen() {
  const { t } = useTranslation('common')
  const { user } = useAuth()
  const logout = useLogout()
  const { unlock } = useLock()
  const verify = usePinVerify()
  const bio = useWebAuthnAuth()

  const [digits, setDigits] = useState('')
  const [error, setError] = useState(false)
  const [bioError, setBioError] = useState(false)
  const busy = verify.isLoading

  const submit = async (pin: string) => {
    try {
      await verify.mutateAsync({ pin })
      unlock()
    } catch (e) {
      setError(true)
      setDigits('')
      if (e instanceof ApiError && (e.data as { lockedOut?: boolean })?.lockedOut) {
        logout.mutate()
      }
      setTimeout(() => setError(false), 450)
    }
  }

  const press = (d: string) => {
    if (busy) return
    setDigits((prev) => {
      if (prev.length >= PIN_LEN) return prev
      const next = prev + d
      if (next.length === PIN_LEN) void submit(next)
      return next
    })
  }
  const back = () => setDigits((s) => s.slice(0, -1))

  // Physical keyboard support (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const tryBiometric = async () => {
    setBioError(false)
    try {
      await bio.mutateAsync()
      unlock()
    } catch {
      setBioError(true) // user cancelled or no credential on this device → use PIN
    }
  }

  return (
    <div className="lock-screen" role="dialog" aria-modal="true" aria-label={t('lock.title')}>
      <div className="lock-card">
        <div className="lock-logo" aria-hidden>🔒</div>
        <h1 className="lock-title">{t('lock.title')}</h1>
        <p className="lock-subtitle muted">{t('lock.subtitle', { name: user?.name ?? '' })}</p>

        <div className={`lock-dots ${error ? 'is-error' : ''}`} aria-hidden>
          {Array.from({ length: PIN_LEN }).map((_, i) => (
            <span key={i} className={`lock-dot ${i < digits.length ? 'is-filled' : ''}`} />
          ))}
        </div>
        <div className="lock-msg" role="status">
          {error ? <span className="gain-negative">{t('lock.wrong')}</span> : busy ? t('lock.checking') : ' '}
        </div>

        <div className="lock-keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" className="lock-key" onClick={() => press(d)} disabled={busy}>{d}</button>
          ))}
          <span className="lock-key is-empty" aria-hidden />
          <button type="button" className="lock-key" onClick={() => press('0')} disabled={busy}>0</button>
          <button type="button" className="lock-key lock-key-action" onClick={back} disabled={busy} aria-label={t('lock.delete')}>⌫</button>
        </div>

        {user?.hasBiometrics && (
          <button type="button" className="btn btn-ghost lock-bio" onClick={tryBiometric} disabled={bio.isLoading}>
            👤 {bio.isLoading ? t('lock.biometricChecking') : t('lock.useBiometric')}
          </button>
        )}
        {bioError && <div className="muted" style={{ fontSize: 12 }}>{t('lock.biometricFailed')}</div>}

        <button type="button" className="btn btn-ghost btn-sm lock-signout" onClick={() => logout.mutate()}>
          {t('lock.signOut')}
        </button>
      </div>
    </div>
  )
}

export default LockScreen
