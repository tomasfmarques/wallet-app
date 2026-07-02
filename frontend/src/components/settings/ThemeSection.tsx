import { useTranslation } from 'react-i18next'
import { useTheme, type ThemePref } from '@/hooks/useTheme'

const OPTIONS: ThemePref[] = ['light', 'dark', 'system']

export function ThemeSection() {
  const { t } = useTranslation('settings')
  const { theme, setTheme } = useTheme()

  return (
    <div className="card card-pad-lg">
      <p className="muted modal-intro">{t('theme.intro')}</p>
      <div className="theme-seg" role="group" aria-label={t('theme.label')}>
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`theme-seg-btn ${theme === opt ? 'is-active' : ''}`}
            aria-pressed={theme === opt}
            onClick={() => setTheme(opt)}
          >
            {t(`theme.${opt}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

export default ThemeSection
