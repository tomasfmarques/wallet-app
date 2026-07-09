import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useJoinHousehold } from '@/hooks/useHousehold'
import { Icon } from '@/components/ui/Icon'

// ── /casal/aceitar — accept a household invite ───────────────────
// Reached from the invite link. The route lives INSIDE the authed layout, so
// a logged-out partner goes through sign-in first (route guard handles it).

export function HouseholdJoin() {
  const { t } = useTranslation('household')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const join = useJoinHousehold()
  const [failed, setFailed] = useState(false)
  const token = params.get('token') ?? ''

  const accept = async () => {
    setFailed(false)
    try {
      await join.mutateAsync(token)
      navigate('/casal', { replace: true })
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="page-stub" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="card card-pad-lg" style={{ textAlign: 'center' }}>
        <Icon name="user" size={36} />
        <h1 style={{ fontSize: 20, margin: '10px 0 6px' }}>{t('join.title')}</h1>
        <p className="muted" style={{ marginBottom: 20 }}>{t('join.body')}</p>
        {(failed || !token) && (
          <div className="form-error" role="alert" style={{ marginBottom: 14 }}>{t('join.invalid')}</div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={!token || join.isLoading} onClick={accept}>
            {join.isLoading ? t('join.joining') : t('join.accept')}
          </button>
          <Link to="/overview" className="btn btn-ghost">{t('join.decline')}</Link>
        </div>
      </div>
    </div>
  )
}

export default HouseholdJoin
