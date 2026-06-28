import { ReactNode, useEffect } from 'react'
import { Link } from 'react-router-dom'
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
 * breaking out to a static file). Content is pt-PT for now; EN is a follow-up.
 */
export function LegalPage({ title, meta, children }: LegalPageProps) {
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
        <Link to="/" className="legal-back">← Voltar à aplicação</Link>
      </header>

      <main className="legal-content">
        <h1>{title}</h1>
        <p className="legal-meta">{meta}</p>
        {children}

        <footer className="legal-footer">
          <Link to="/privacidade">Política de privacidade</Link>
          <span aria-hidden> · </span>
          <Link to="/eliminar-conta">Eliminar conta</Link>
        </footer>
      </main>
    </div>
  )
}

export default LegalPage
