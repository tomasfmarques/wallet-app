import { ReactNode, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BrandMark } from '@/components/ui/BrandMark'

interface LegalPageProps {
  title: string
  /** Pre-formatted "last updated" line (e.g. "Última atualização: 27 de junho de 2026"). */
  meta: string
  children: ReactNode
}

/**
 * Shared chrome for the public legal pages (privacy policy, account deletion).
 * Public routes — rendered outside the AuthGuard, so they work whether or not
 * the visitor is signed in (and stay inside the SPA/PWA on mobile rather than
 * breaking out to a static file). Chrome strings are i18n'd; the page BODIES
 * are per-language JSX blocks in pages/legal/* (see the note there).
 */
export function LegalPage({ title, meta, children }: LegalPageProps) {
  const { t } = useTranslation('auth')
  useEffect(() => {
    const prev = document.title
    document.title = `${title} — Wallet360`
    return () => { document.title = prev }
  }, [title])

  return (
    <div className="legal-screen">
      <header className="legal-topbar">
        <Link to="/" className="brand">
          <BrandMark size={30} />
          <span className="brand-text">wallet<span className="brand-360">360</span></span>
        </Link>
        <Link to="/" className="legal-back">← {t('legal.back')}</Link>
      </header>

      <main className="legal-content">
        <h1>{title}</h1>
        <p className="legal-meta">{meta}</p>
        {children}

        <footer className="legal-footer">
          <Link to="/privacidade">{t('legal.privacy')}</Link>
          <span aria-hidden> · </span>
          <Link to="/eliminar-conta">{t('legal.deletion')}</Link>
        </footer>
      </main>
    </div>
  )
}

export default LegalPage
