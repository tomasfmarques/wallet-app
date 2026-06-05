import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useResetData, useDeleteAccount, fieldErrorsFrom, type FieldErrors } from '@/hooks/useAuth'
import { Modal } from '@/components/ui/Modal'

export function DangerZoneSection() {
  const [resetOpen, setResetOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <div className="card card-pad-lg danger-card">
      <h3 className="settings-subhead">⚠️ Zona perigosa</h3>
      <p className="muted modal-intro">
        Estas ações são irreversíveis. Para evitar perdas acidentais, recomenda-se
        descarregar primeiro um backup em <strong>Configurações → Backup</strong>.
      </p>

      <div className="danger-row">
        <div>
          <strong>Repor dados</strong>
          <p className="muted">
            Apaga empréstimo, pagamentos, amortizações, carteira e configurações.
            A conta (email, password) é mantida.
          </p>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => setResetOpen(true)}>
          Repor…
        </button>
      </div>

      <hr className="divider" />

      <div className="danger-row">
        <div>
          <strong>Apagar conta</strong>
          <p className="muted">
            Apaga permanentemente a tua conta e todos os dados. Esta ação não
            pode ser revertida.
          </p>
        </div>
        <button type="button" className="btn btn-danger" onClick={() => setDeleteOpen(true)}>
          Apagar conta…
        </button>
      </div>

      <ResetModal open={resetOpen} onClose={() => setResetOpen(false)} />
      <DeleteModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  )
}

interface ModalProps { open: boolean; onClose: () => void }

function ResetModal({ open, onClose }: ModalProps) {
  const reset = useResetData()
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    if (!password) { setErrors({ currentPassword: 'Obrigatória' }); return }
    try {
      await reset.mutateAsync({ currentPassword: password })
      setPassword('')
      onClose()
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Repor todos os dados" maxWidth={420}>
      <p className="muted modal-intro">
        Vai apagar empréstimo + carteira + configurações. A conta mantém-se.
        Introduz a tua password atual para confirmar.
      </p>
      <form onSubmit={submit} noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field">
          <label htmlFor="reset-pw">Password atual</label>
          <input
            id="reset-pw" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.currentPassword}
          />
          {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-danger" disabled={reset.isLoading}>
            {reset.isLoading ? 'A apagar…' : 'Repor dados'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteModal({ open, onClose }: ModalProps) {
  const del = useDeleteAccount()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    const errs: FieldErrors = {}
    if (!password) errs.currentPassword = 'Obrigatória'
    if (phrase !== 'APAGAR') errs.phrase = 'Escreve APAGAR para confirmar'
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    try {
      await del.mutateAsync({ currentPassword: password })
      navigate('/signin', { replace: true })
    } catch (err) {
      setErrors(fieldErrorsFrom(err))
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Apagar conta permanentemente" maxWidth={420}>
      <p className="muted modal-intro">
        Esta ação é <strong>irreversível</strong>. A tua conta, empréstimo,
        carteira e todos os dados associados serão apagados.
      </p>
      <form onSubmit={submit} noValidate>
        {errors._form && <div className="form-error">{errors._form}</div>}
        <div className="field">
          <label htmlFor="del-pw">Password atual</label>
          <input
            id="del-pw" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errors.currentPassword}
          />
          {errors.currentPassword && <span className="field-error">{errors.currentPassword}</span>}
        </div>
        <div className="field">
          <label htmlFor="del-phrase">Escreve <strong>APAGAR</strong> para confirmar</label>
          <input
            id="del-phrase" type="text"
            value={phrase} onChange={(e) => setPhrase(e.target.value)}
            aria-invalid={!!errors.phrase}
          />
          {errors.phrase && <span className="field-error">{errors.phrase}</span>}
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-danger" disabled={del.isLoading}>
            {del.isLoading ? 'A apagar…' : 'Apagar conta'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default DangerZoneSection
