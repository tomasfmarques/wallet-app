import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '@/components/ui/Icon'

interface Props {
  to: string
  icon: IconName
  name: string
  oneLiner: string
}

/** One of the 4 free-tool cards — reused on the landing page and /simuladores. */
export function ToolCard({ to, icon, name, oneLiner }: Props) {
  const { t } = useTranslation('landing')
  return (
    <Link to={to} className="mkt-tool-card">
      <span className="mkt-tool-icon"><Icon name={icon} size={22} /></span>
      <span className="mkt-tool-name">{name}</span>
      <span className="mkt-tool-oneliner">{oneLiner}</span>
      <span className="mkt-tool-badge">{t('tools.freeBadge')}</span>
    </Link>
  )
}

export default ToolCard
