import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { useLock } from '@/hooks/useLock'
import { usePinVerify, useWebAuthnAuth } from '@/hooks/useSecurity'
import { ApiError } from '@/lib/api'

const PIN_LEN = 6

// Fingerprint glyph for the biometric keypad key (mirrors the ⌫ key).
function FingerprintIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12C2 6.5 6.5 2 12 2a10 10 0 0 1 8 4" />
      <path d="M5 19.5C5.5 18 6 15 6 12c0-.7.12-1.37.34-2" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
    </svg>
  )
}

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

  const tryBiometric = async (auto = false) => {
    setBioError(false)
    try {
      await bio.mutateAsync()
      unlock()
    } catch {
      // user cancelled / no credential here / (auto) the browser needs a gesture
      // → fall back to PIN. Don't surface an error for the silent auto attempt.
      if (!auto) setBioError(true)
    }
  }

  // On launch, if the account has a passkey, prompt biometrics automatically
  // (once) so the user doesn't have to tap. If the browser blocks it without a
  // gesture, the fingerprint key / PIN are still there.
  const autoTriedRef = useRef(false)
  useEffect(() => {
    if (autoTriedRef.current || !user?.hasBiometrics) return
    autoTriedRef.current = true
    void tryBiometric(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.hasBiometrics])

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
          {user?.hasBiometrics ? (
            <button
              type="button"
              className="lock-key lock-key-action lock-key-bio"
              onClick={() => tryBiometric()}
              disabled={busy || bio.isLoading}
              aria-label={t('lock.useBiometric')}
              title={t('lock.useBiometric')}
            >
              <FingerprintIcon />
            </button>
          ) : (
            <span className="lock-key is-empty" aria-hidden />
          )}
          <button type="button" className="lock-key" onClick={() => press('0')} disabled={busy}>0</button>
          <button type="button" className="lock-key lock-key-action" onClick={back} disabled={busy} aria-label={t('lock.delete')}>⌫</button>
        </div>

        {bioError && <div className="lock-bio-hint muted">{t('lock.biometricFailed')}</div>}

        <button type="button" className="btn btn-ghost btn-sm lock-signout" onClick={() => logout.mutate()}>
          {t('lock.signOut')}
        </button>
      </div>
    </div>
  )
}

export default LockScreen
