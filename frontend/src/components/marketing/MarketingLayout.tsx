import { type ReactNode, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/components/ui/BrandMark'
import { InstallCta } from './InstallCta'
import { ContactForm } from './ContactForm'
import { asAppLanguage, type AppLanguage } from '@/i18n'
import './marketing.css'

const BANNER_DISMISSED_KEY = 'wallet360.landingBannerDismissed'

function readBannerDismissed(): boolean {
  try {
    return localStorage.getItem(BANNER_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

interface Props {
  children: ReactNode
}

/**
 * Shared chrome for every public marketing/tool page (docs/landing-spec.md
 * WS-L1): sticky dismissible top banner, brand header, and a footer with the
 * contact form + legal/auth links + language toggle. Never used inside the
 * authenticated app (Layout.tsx is untouched).
 */
export function MarketingLayout({ children }: Props) {
  const { t, i18n } = useTranslation('landing')
  const [bannerDismissed, setBannerDismissed] = useState(readBannerDismissed)

  const dismissBanner = () => {
    setBannerDismissed(true)
    try { localStorage.setItem(BANNER_DISMISSED_KEY, '1') } catch { /* best-effort only */ }
  }

  const lang = asAppLanguage(i18n.resolvedLanguage)
  const toggleLanguage = () => {
    const next: AppLanguage = lang === 'pt' ? 'en' : 'pt'
    void i18n.changeLanguage(next)
  }

  return (
    <div className="mkt-shell">
      {!bannerDismissed && (
        <div className="mkt-banner" role="banner">
          <div className="mkt-banner-inner">
            <span className="mkt-banner-text">{t('banner.message')}</span>
            <div className="mkt-banner-actions">
              <InstallCta className="btn-sm" />
              <Link to="/signin" className="mkt-banner-signin">{t('banner.signin')}</Link>
              <button
                type="button" className="mkt-banner-dismiss"
                onClick={dismissBanner} aria-label={t('banner.dismiss')}
              >×</button>
            </div>
          </div>
        </div>
      )}

      <header className="mkt-header">
        <div className="mkt-header-inner">
          <Link to="/" className="brand mkt-brand">
            <BrandMark size={28} />
            <span className="brand-text">wallet<span className="brand-360">360</span></span>
          </Link>
          <nav className="mkt-header-nav" aria-label={t('nav.mainAria')}>
            <Link to="/simuladores" className="mkt-header-link">{t('nav.tools')}</Link>
            <Link to="/signin" className="mkt-header-link">{t('nav.signin')}</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">{t('nav.signup')}</Link>
          </nav>
        </div>
      </header>

      <main className="mkt-main">{children}</main>

      <footer className="mkt-footer">
        <div className="mkt-footer-inner">
          <div className="mkt-footer-brand">
            <span className="brand">
              <BrandMark size={22} />
              <span className="brand-text">wallet<span className="brand-360">360</span></span>
            </span>
            <p className="muted mkt-footer-tagline">{t('footer.tagline')}</p>
          </div>

          <nav className="mkt-footer-links" aria-label={t('footer.linksAria')}>
            <Link to="/privacidade">{t('footer.privacy')}</Link>
            <Link to="/eliminar-conta">{t('footer.deletion')}</Link>
            <Link to="/signin">{t('footer.signin')}</Link>
            <Link to="/signup">{t('footer.signup')}</Link>
            <button type="button" className="mkt-lang-toggle" onClick={toggleLanguage}>
              {lang === 'pt' ? 'English' : 'Português'}
            </button>
          </nav>

          <ContactForm />

          <p className="mkt-footer-rights muted">{t('footer.rights', { year: new Date().getFullYear() })}</p>
        </div>
      </footer>
    </div>
  )
}

export default MarketingLayout
