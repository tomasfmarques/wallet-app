import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import { useResetData, useDeleteAccount, fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'

export function DangerZoneSection() {
  const { t } = useTranslation('settings')
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <div className="card card-pad-lg danger-card">
      <h3 className="settings-subhead">{t('danger.head')}</h3>
      <p className="muted modal-intro">
        <Trans i18nKey="danger.intro" ns="settings" components={{ 1: <strong /> }} />
      </p>

      <div className="danger-row">
        <div>
          <strong>{t('danger.resetTitle')}</strong>
          <p className="muted">
            {t('danger.resetDesc')}
          </p>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => setResetOpen(true)}>
          {t('danger.resetBtn')}
        </button>
      </div>

      <hr className="divider" />

      <div className="danger-row">
        <div>
          <strong>{t('danger.deleteTitle')}</strong>
          <p className="muted">
            {t('danger.deleteDesc')}{' '}
            <a href="/eliminar-conta.html" target="_blank" rel="noopener">{t('danger.deletePolicy')}</a>
          </p>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
          {t('danger.deleteBtn')}
        </button>
      </div>

      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} />
      <DeleteModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  )
}

interface ModalProps { open: boolean; onClose: () => void }

function ResetModal({ open, onClose }: ModalProps) {
  const { t } = useTranslation('settings')
  const reset = useResetData()
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    if (!password) { setErrors({ currentPassword: t('danger.errRequired') }); return }
    try {
      await reset.mutateAsync({ currentPassword: password })
      setPassword('')
      onClose()
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('danger.resetModalTitle')} maxWidth={420}>
      <p className="muted modal-intro">
        {t('danger.resetModalIntro')}
      </p>
      <form onSubmit={submit} noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field">
          <label htmlFor="reset-pw">{t('danger.currentPassword')}</label>
          <input
            id="reset-pw" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.currentPassword}
          />
          {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('actions.cancel', { ns: 'common' })}</button>
          <button type="submit" className="btn btn-danger" disabled={reset.isLoading}>
            {reset.isLoading ? t('danger.deleting') : t('danger.resetSubmit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteModal({ open, onClose }: ModalProps) {
  const { t } = useTranslation('settings')
  const del = useDeleteAccount()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const errs: FieldErrors = {}
    if (!password) errs.currentPassword = t('danger.errRequired')
    if (phrase !== t('danger.deleteConfirmWord')) errs.phrase = t('danger.errPhrase')
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    try {
      await del.mutateAsync({ currentPassword: password })
      navigate('/signin', { replace: true })
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('danger.deleteModalTitle')} maxWidth={420}>
      <p className="muted modal-intro">
        <Trans i18nKey="danger.deleteModalIntro" ns="settings" components={{ 1: <strong /> }} />
      </p>
      <form onSubmit={submit} noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field">
          <label htmlFor="del-pw">{t('danger.currentPassword')}</label>
          <input
            id="del-pw" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.currentPassword}
          />
          {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}
        </div>
        <div className="field">
          <label htmlFor="del-phrase"><Trans i18nKey="danger.deletePhraseLabel" ns="settings" components={{ 1: <strong /> }} /></label>
          <input
            id="del-phrase" type="text"
            value={phrase} onChange={(e) => setPhrase(e.target.value)}
            aria-invalid={!!errors.phrase}
          />
          {errors.phrase && <span className="field-error">{errors.phrase}</span>}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('actions.cancel', { ns: 'common' })}</button>
          <button type="submit" className="btn btn-danger" disabled={del.isLoading}>
            {del.isLoading ? t('danger.deleting') : t('danger.deleteSubmit')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default DangerZoneSection
