import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/hooks/useAuth'
import {
  usePinSet, usePinDisable,
  useWebAuthnRegister, useWebAuthnCredentials, useWebAuthnDelete,
} from '@/hooks/useSecurity'
import { apiErrorMessage } from '@/lib/apiError'

export function SecuritySection() {
  const { t } = useTranslation('settings')
  const { user } = useAuth()
  const hasPin = !!user?.hasPin
  const hasPassword = !!user?.hasPassword
  const biometricsSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential

  const pinSet = usePinSet()
  const pinDisable = usePinDisable()
  const bioRegister = useWebAuthnRegister()
  const bioDelete = useWebAuthnDelete()
  const { data: credsData } = useWebAuthnCredentials(hasPin)
  const credentials = credsData?.credentials ?? []

  // ── PIN set / change ─────────────────────────────
  const [showPinForm, setShowPinForm] = useState(false)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [curPw, setCurPw] = useState('')
  const [pinErr, setPinErr] = useState<string | null>(null)
  const [pinSaved, setPinSaved] = useState(false)

  const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 6)

  const savePin = async (e: FormEvent) => {
    e.preventDefault()
    setPinErr(null); setPinSaved(false)
    if (!/^\d{6}$/.test(pin)) { setPinErr(t('security.errPinDigits')); return }
    if (pin !== confirm) { setPinErr(t('security.errPinMismatch')); return }
    if (hasPassword && !curPw) { setPinErr(t('security.errPasswordRequired')); return }
    try {
      await pinSet.mutateAsync({ pin, currentPassword: hasPassword ? curPw : undefined })
      setPin(''); setConfirm(''); setCurPw(''); setShowPinForm(false)
      setPinSaved(true); setTimeout(() => setPinSaved(false), 2500)
    } catch (err) { setPinErr(apiErrorMessage(err)) }
  }

  // ── Disable PIN ──────────────────────────────────
  const [showDisable, setShowDisable] = useState(false)
  const [disSecret, setDisSecret] = useState('')
  const [disErr, setDisErr] = useState<string | null>(null)
  const disablePin = async (e: FormEvent) => {
    e.preventDefault()
    setDisErr(null)
    try {
      await pinDisable.mutateAsync(hasPassword ? { currentPassword: disSecret } : { pin: disSecret })
      setDisSecret(''); setShowDisable(false)
    } catch (err) { setDisErr(apiErrorMessage(err)) }
  }

  // ── Biometrics ───────────────────────────────────
  const [bioName, setBioName] = useState('')
  const [bioErr, setBioErr] = useState<string | null>(null)
  const addBiometric = async () => {
    setBioErr(null)
    try {
      await bioRegister.mutateAsync({ deviceName: bioName.trim() || undefined })
      setBioName('')
    } catch { setBioErr(t('security.bioFailed')) }
  }

  return (
    <div className="card card-pad-lg account-card">
      {/* PIN */}
      <h3 className="settings-subhead" style={{ marginTop: 0 }}>{t('security.pinHead')}</h3>
      <p className="muted">{hasPin ? t('security.pinOn') : t('security.pinOff')}</p>

      {!showPinForm && (
        <div className="account-actions">
          {pinSaved && <span className="save-confirm">{t('security.pinSaved')}</span>}
          <button type="button" className="btn btn-primary" onClick={() => { setShowPinForm(true); setPinErr(null) }}>
            {hasPin ? t('security.changePin') : t('security.enablePin')}
          </button>
          {hasPin && (
            <button type="button" className="btn btn-ghost" onClick={() => { setShowDisable((v) => !v); setDisErr(null) }}>
              {t('security.disablePin')}
            </button>
          )}
        </div>
      )}

      {showPinForm && (
        <form onSubmit={savePin} className="account-form" noValidate>
          {pinErr && <div className="form-error">{pinErr}</div>}
          <div className="field-grid">
            <div className="field">
              <label htmlFor="pin-new">{t('security.pinLabel')}</label>
              <input id="pin-new" type="password" inputMode="numeric" autoComplete="off"
                value={pin} onChange={(e) => setPin(onlyDigits(e.target.value))} placeholder="••••••" />
            </div>
            <div className="field">
              <label htmlFor="pin-confirm">{t('security.pinConfirmLabel')}</label>
              <input id="pin-confirm" type="password" inputMode="numeric" autoComplete="off"
                value={confirm} onChange={(e) => setConfirm(onlyDigits(e.target.value))} placeholder="••••••" />
            </div>
            {hasPassword && (
              <div className="field">
                <label htmlFor="pin-pw">{t('security.confirmPassword')}</label>
                <input id="pin-pw" type="password" autoComplete="current-password"
                  value={curPw} onChange={(e) => setCurPw(e.target.value)} />
              </div>
            )}
          </div>
          <div className="account-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowPinForm(false); setPin(''); setConfirm(''); setCurPw(''); setPinErr(null) }}>
              {t('security.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={pinSet.isLoading}>
              {pinSet.isLoading ? t('security.saving') : t('security.savePin')}
            </button>
          </div>
        </form>
      )}

      {showDisable && (
        <form onSubmit={disablePin} className="account-form" noValidate style={{ marginTop: 12 }}>
          {disErr && <div className="form-error">{disErr}</div>}
          <div className="field">
            <label htmlFor="dis-secret">{hasPassword ? t('security.confirmPassword') : t('security.confirmPin')}</label>
            <input id="dis-secret" type="password" inputMode={hasPassword ? undefined : 'numeric'} autoComplete="off"
              value={disSecret} onChange={(e) => setDisSecret(hasPassword ? e.target.value : onlyDigits(e.target.value))} />
          </div>
          <div className="account-actions">
            <button type="submit" className="btn btn-danger" disabled={pinDisable.isLoading}>
              {pinDisable.isLoading ? t('security.saving') : t('security.disablePin')}
            </button>
          </div>
        </form>
      )}

      {/* Discoverability: biometric unlock is hidden until a PIN exists (the
          PIN is its fallback). Tell the user that instead of showing nothing. */}
      {biometricsSupported && !hasPin && !showPinForm && (
        <p className="muted" style={{ marginTop: 12 }}>{t('security.bioNeedsPin')}</p>
      )}

      {/* Biometrics — only when a PIN exists (PIN is the fallback) */}
      {hasPin && (
        <>
          <hr className="divider" />
          <h3 className="settings-subhead">{t('security.bioHead')}</h3>
          <p className="muted">{t('security.bioDesc')}</p>

          {!biometricsSupported && <p className="muted">{t('security.bioUnsupported')}</p>}

          {credentials.length > 0 && (
            <ul className="bio-list">
              {credentials.map((c) => (
                <li key={c.id} className="bio-row">
                  <span>👤 {c.deviceName || t('security.bioDevice')}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => bioDelete.mutate(c.id)} disabled={bioDelete.isLoading}>
                    {t('security.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {biometricsSupported && (
            <div className="field-grid" style={{ marginTop: 8 }}>
              <div className="field">
                <label htmlFor="bio-name">{t('security.bioNameLabel')}</label>
                <input id="bio-name" type="text" value={bioName} onChange={(e) => setBioName(e.target.value)} placeholder={t('security.bioNamePlaceholder')} />
              </div>
            </div>
          )}
          {bioErr && <div className="form-error" style={{ marginTop: 8 }}>{bioErr}</div>}
          {biometricsSupported && (
            <div className="account-actions">
              <button type="button" className="btn btn-primary" onClick={addBiometric} disabled={bioRegister.isLoading}>
                {bioRegister.isLoading ? t('security.bioAdding') : t('security.bioAdd')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default SecuritySection
