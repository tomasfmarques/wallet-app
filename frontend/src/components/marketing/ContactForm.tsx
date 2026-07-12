import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '@/lib/api'

type Status = 'idle' | 'sending' | 'success' | 'error'

/**
 * Footer contact form (WS-L7) — nome, email, mensagem + an invisible honeypot.
 * Posts to POST /api/public/contact (rate-limited server-side). Works
 * signed-out; no toast lib, inline success/error strings only.
 */
export function ContactForm() {
  const { t } = useTranslation('landing')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // honeypot — humans never see/fill this
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const sending = status === 'sending'

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (sending) return
    setStatus('sending')
    setErrorMsg(null)
    try {
      await api.post('/api/public/contact', { name, email, message, website })
      setStatus('success')
      setName('')
      setEmail('')
      setMessage('')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof ApiError ? err.message : t('footer.contact.error'))
    }
  }

  return (
    <form className="mkt-contact-form" onSubmit={handleSubmit} noValidate>
      <h3 className="mkt-contact-title">{t('footer.contact.title')}</h3>
      <p className="muted mkt-contact-intro">{t('footer.contact.intro')}</p>

      {status === 'success' && <div className="form-success">{t('footer.contact.success')}</div>}
      {status === 'error' && <div className="form-error">{errorMsg ?? t('footer.contact.error')}</div>}

      {/* Honeypot: CSS-hidden, unreachable by tab order, autocomplete off.
          Bots that blanket-fill every input trip this; the backend silently
          drops the submission (fake success) without erroring visibly. */}
      <div className="mkt-honeypot" aria-hidden="true">
        <label htmlFor="mkt-contact-website">Website</label>
        <input
          id="mkt-contact-website" name="website" type="text"
          tabIndex={-1} autoComplete="off"
          value={website} onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="mkt-contact-name">{t('footer.contact.name')}</label>
        <input
          id="mkt-contact-name" type="text" required disabled={sending}
          value={name} onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="mkt-contact-email">{t('footer.contact.email')}</label>
        <input
          id="mkt-contact-email" type="email" required disabled={sending}
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="mkt-contact-message">{t('footer.contact.message')}</label>
        <textarea
          id="mkt-contact-message" required rows={4} disabled={sending}
          value={message} onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={sending}>
        {sending ? t('footer.contact.sending') : t('footer.contact.send')}
      </button>
    </form>
  )
}

export default ContactForm
