import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useInstallPrompt } from '@/hooks/useInstallPrompt'

interface Props {
  className?: string
}

/**
 * Device-aware install CTA — the SAME component adapts to the visitor's
 * device (docs/landing-spec.md WS-L1). Used in the sticky top banner, the
 * landing's install section and every tool page's install banner.
 */
export function InstallCta({ className }: Props) {
  const { t } = useTranslation('landing')
  const { kind, promptInstall } = useInstallPrompt()
  const [showIosSheet, setShowIosSheet] = useState(false)
  const btnClass = `btn btn-primary ${className ?? ''}`.trim()

  if (kind === 'standalone') {
    return <Link to="/" className={btnClass}>{t('install.openApp')}</Link>
  }

  if (kind === 'native-prompt') {
    return (
      <button type="button" className={btnClass} onClick={() => void promptInstall()}>
        {t('install.installApp')}
      </button>
    )
  }

  if (kind === 'ios') {
    return (
      <>
        <button type="button" className={btnClass} onClick={() => setShowIosSheet(true)}>
          {t('install.installApp')}
        </button>
        {showIosSheet && (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={() => setShowIosSheet(false)}>
            <div className="modal mkt-ios-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{t('install.iosSheetTitle')}</h2>
                <button
                  type="button" className="modal-close"
                  onClick={() => setShowIosSheet(false)}
                  aria-label={t('install.iosClose')}
                >×</button>
              </div>
              <div className="modal-body">
                <ol className="legal-steps">
                  <li>{t('install.iosStep1')}</li>
                  <li>{t('install.iosStep2')}</li>
                </ol>
                <button
                  type="button" className="btn btn-primary btn-block"
                  onClick={() => setShowIosSheet(false)}
                >
                  {t('install.iosClose')}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // fallback (Firefox etc.) — no install path available, offer signup instead.
  return <Link to="/signup" className={btnClass}>{t('install.createAccount')}</Link>
}

export default InstallCta
