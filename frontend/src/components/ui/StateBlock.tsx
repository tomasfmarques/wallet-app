import { Icon, type IconName } from '@/components/ui/Icon'

interface Props {
  variant: 'empty' | 'error'
  message: string
  title?: string
  icon?: IconName
  onRetry?: () => void
}

// Reusable empty/error placeholder so failures read "tenta novamente" and empty
// data reads as a friendly prompt — never a blank panel (FX3).
export function StateBlock({ variant, message, title, icon, onRetry }: Props) {
  const defaultIcon: IconName = variant === 'error' ? 'alert' : 'inbox'
  const defaultTitle = variant === 'error' ? 'Algo correu mal' : undefined
  return (
    <div className={`state-block state-block-${variant}`} role={variant === 'error' ? 'alert' : undefined}>
      <span className="state-block-icon"><Icon name={icon ?? defaultIcon} size={26} /></span>
      {(title ?? defaultTitle) && <div className="state-block-title">{title ?? defaultTitle}</div>}
      <p className="state-block-msg">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}

export default StateBlock
