import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, LANGUAGE_LABELS, asAppLanguage, type AppLanguage } from '@/i18n'
import { useChangeLanguage } from '@/hooks/useLanguage'

export function LanguageSection() {
  const { t, i18n } = useTranslation('settings')
  const changeLanguage = useChangeLanguage()
  const [saved, setSaved] = useState(false)
  const current = asAppLanguage(i18n.language)

  const onChange = async (lng: AppLanguage) => {
    if (lng === current) return
    await changeLanguage(lng)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="card card-pad-lg">
      <p className="muted modal-intro">{t('language.intro')}</p>
      <div className="field" style={{ maxWidth: 280 }}>
        <label htmlFor="lang-select">{t('language.label')}</label>
        <select
          id="lang-select"
          value={current}
          onChange={(e) => onChange(e.target.value as AppLanguage)}
        >
          {SUPPORTED_LANGUAGES.map((lng) => (
            <option key={lng} value={lng}>{LANGUAGE_LABELS[lng]}</option>
          ))}
        </select>
      </div>
      {saved && (
        <div className="account-actions">
          <span className="save-confirm">{t('language.saved')}</span>
        </div>
      )}
    </div>
  )
}

export default LanguageSection
