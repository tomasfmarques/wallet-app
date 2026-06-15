import { FormEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useAuth, useUpdateProfile, useChangePassword, useLogout,
  fieldErrorsFrom, type FieldErrors,
} from '@/hooks/useAuth'
import { useNavigate } from 'react-router-dom'

export function AccountSection() {
  const { t } = useTranslation('settings')
  const { user } = useAuth()
  const updateProfile = useUpdateProfile()
  const changePassword = useChangePassword()
  const logout = useLogout()
  const navigate = useNavigate()

  // ── Profile (name) ───────────────────────────────
  const [name, setName] = useState(user?.name ?? '')
  const [nameErrors, setNameErrors] = useState<FieldErrors>({})
  const [nameSaved, setNameSaved] = useState(false)

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setNameErrors({})
    setNameSaved(false)
    if (name.trim().length < 2) {
      setNameErrors({ name: t('account.errNameShort') })
      return
    }
    try {
      await updateProfile.mutateAsync({ name: name.trim() })
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2500)
    } catch (err) {
      setNameErrors(fieldErrorsFrom(err))
    }
  }

  // ── Change password ──────────────────────────────
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwErrors, setPwErrors] = useState<FieldErrors>({})
  const [pwSaved, setPwSaved] = useState(false)

  const savePassword = async (e: FormEvent) => {
    e.preventDefault()
    setPwErrors({})
    setPwSaved(false)
    const errs: FieldErrors = {}
    if (!currentPassword) errs.currentPassword = t('account.errRequired')
    if (newPassword.length < 8) errs.newPassword = t('account.errPasswordShort')
    if (newPassword !== confirmPassword) errs.confirmPassword = t('account.errMismatch')
    if (Object.keys(errs).length > 0) { setPwErrors(errs); return }
    try {
      await changePassword.mutateAsync({ currentPassword, newPassword })
      setPwSaved(true)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setTimeout(() => setPwSaved(false), 2500)
    } catch (err) {
      setPwErrors(fieldErrorsFrom(err))
    }
  }

  // ── Sign out ─────────────────────────────────────
  const handleSignOut = async () => {
    try {
      await logout.mutateAsync()
    } finally {
      navigate('/signin', { replace: true })
    }
  }

  return (
    <div className="card card-pad-lg account-card">
      <form onSubmit={saveProfile} className="account-form">
        <div className="field-grid">
          <div className="field">
            <label htmlFor="acc-name">{t('account.nameLabel')}</label>
            <input
              id="acc-name" type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={!!nameErrors.name}
            />
            {nameErrors.name && <span className="field-error">{nameErrors.name}</span>}
          </div>
          <div className="field">
            <label htmlFor="acc-email">{t('account.emailLabel')}</label>
            <input
              id="acc-email" type="email" readOnly disabled
              value={user?.email ?? ''}
            />
            <span className="field-hint">{t('account.emailHint')}</span>
          </div>
        </div>
        <div className="account-actions">
          {nameSaved && <span className="save-confirm">{t('account.saved')}</span>}
          <button type="submit" className="btn btn-primary" disabled={updateProfile.isLoading}>
            {updateProfile.isLoading ? t('account.saving') : t('account.saveName')}
          </button>
        </div>
      </form>

      <hr className="divider" />

      <form onSubmit={savePassword} className="account-form" noValidate>
        <h3 className="settings-subhead">{t('account.changePassword')}</h3>
        {pwErrors._form && <div className="form-error">{pwErrors._form}</div>}
        <div className="field-grid">
          <div className="field">
            <label htmlFor="pw-current">{t('account.currentPassword')}</label>
            <input
              id="pw-current" type="password" autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              aria-invalid={!!pwErrors.currentPassword}
            />
            {pwErrors.currentPassword && <span className="field-error">{pwErrors.currentPassword}</span>}
          </div>
          <div className="field">
            <label htmlFor="pw-new">{t('account.newPassword')}</label>
            <input
              id="pw-new" type="password" autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={!!pwErrors.newPassword}
            />
            {pwErrors.newPassword ? (
              <span className="field-error">{pwErrors.newPassword}</span>
            ) : (
              <span className="field-hint">{t('account.passwordHint')}</span>
            )}
          </div>
          <div className="field">
            <label htmlFor="pw-confirm">{t('account.confirmNewPassword')}</label>
            <input
              id="pw-confirm" type="password" autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={!!pwErrors.confirmPassword}
            />
            {pwErrors.confirmPassword && <span className="field-error">{pwErrors.confirmPassword}</span>}
          </div>
        </div>
        <div className="account-actions">
          {pwSaved && <span className="save-confirm">{t('account.passwordSaved')}</span>}
          <button type="submit" className="btn btn-primary" disabled={changePassword.isLoading}>
            {changePassword.isLoading ? t('account.updating') : t('account.changePassword')}
          </button>
        </div>
      </form>

      <hr className="divider" />

      <div className="signout-row">
        <div>
          <h3 className="settings-subhead" style={{ margin: 0 }}>{t('account.signOutHead')}</h3>
          <p className="muted">{t('account.signOutDesc')}</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={handleSignOut}
          disabled={logout.isLoading}
        >
          {logout.isLoading ? t('account.signingOut') : t('account.signOutHead')}
        </button>
      </div>
    </div>
  )
}

export default AccountSection
