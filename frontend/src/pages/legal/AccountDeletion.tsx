import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/LegalPage'
import { asAppLanguage } from '@/i18n'

/**
 * Public account-deletion page — the URL given to Google Play. pt-PT (binding) +
 * EN (courtesy translation), switched on the active i18n language.
 * Source-of-record mirror: docs/legal/account-deletion.md (pt) — keep the PT
 * block in sync with it; the EN block is a faithful translation of the PT text.
 * Bodies are per-language JSX (not JSON keys) — see the note in PrivacyPolicy.tsx.
 */
export function AccountDeletion() {
  const { i18n } = useTranslation()
  return asAppLanguage(i18n.resolvedLanguage) === 'en' ? <DeletionEn /> : <DeletionPt />
}

function DeletionPt() {
  return (
    <LegalPage
      title="Eliminar a tua conta"
      meta="Última atualização: 27 de junho de 2026 · Wallet360"
    >
      <p>Podes eliminar a tua conta Wallet360 e todos os dados associados a qualquer
        momento. A eliminação é <strong>permanente e irreversível</strong>.</p>

      <div className="legal-box accent">
        <strong>Antes de eliminar:</strong> podes exportar todos os teus dados em{' '}
        <em>Definições → Dados</em> (ficheiro JSON), para os guardares ou levares para
        outro lado.
      </div>

      <h2>Como eliminar (na aplicação)</h2>
      <ol className="legal-steps">
        <li>Entra na tua conta em <a href="https://wallet360.pt">wallet360.pt</a>.</li>
        <li>Vai a <strong>Definições → Zona de perigo</strong>.</li>
        <li>Toca em <strong>Eliminar conta</strong>, confirma a tua identidade e escreve a
          palavra de confirmação.</li>
        <li>A conta e todos os dados são apagados de imediato; a sessão é terminada.</li>
      </ol>

      <h2>Como eliminar (por email)</h2>
      <p>Se não conseguires aceder à aplicação, envia um pedido a partir do email da tua
        conta para <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a> com o
        assunto "Eliminar conta". Confirmamos e eliminamos a conta no prazo de{' '}
        <strong>30 dias</strong>.</p>

      <h2>Que dados são eliminados</h2>
      <p>Ao eliminar a conta, são removidos de forma permanente e em cascata:</p>
      <ul>
        <li>Conta e credenciais (email, <em>hash</em> da palavra-passe / ligação Google,
          PIN e chaves biométricas).</li>
        <li>Todos os dados financeiros: créditos e amortizações, ativos e movimentos de
          investimento, receitas/despesas do orçamento e transações importadas.</li>
        <li>Preferências (idioma, <em>watchlist</em>) e ligações bancárias/de corretora,
          se existirem.</li>
      </ul>
      <p>As cópias de segurança do nosso fornecedor de base de dados (Neon) são removidas
        dentro do respetivo período de retenção (habitualmente alguns dias a semanas).</p>

      <h2>Que dados são retidos</h2>
      <div className="legal-box red">
        Conservamos apenas um <strong>registo de eliminação pseudonimizado</strong>: um{' '}
        <em>hash</em> SHA-256 do email e a data da eliminação. Serve para comprovar que o
        pedido foi cumprido e <strong>não contém</strong> dados pessoais legíveis nem
        quaisquer dados financeiros. Nada mais é retido, salvo se exigido por lei.
      </div>

      <h2>Contacto</h2>
      <p>Tomás Marques — <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>.</p>
    </LegalPage>
  )
}

function DeletionEn() {
  return (
    <LegalPage
      title="Delete your account"
      meta="Last updated: 27 June 2026 · Wallet360"
    >
      <p className="legal-meta"><em>This is a courtesy translation. If there is any
        divergence, the Portuguese version prevails (switch the app language to
        Portuguese to read it).</em></p>

      <p>You can delete your Wallet360 account and all associated data at any time.
        Deletion is <strong>permanent and irreversible</strong>.</p>

      <div className="legal-box accent">
        <strong>Before you delete:</strong> you can export all your data in{' '}
        <em>Settings → Data</em> (JSON file), to keep it or take it elsewhere.
      </div>

      <h2>How to delete (in the app)</h2>
      <ol className="legal-steps">
        <li>Sign in to your account at <a href="https://wallet360.pt">wallet360.pt</a>.</li>
        <li>Go to <strong>Settings → Danger zone</strong>.</li>
        <li>Tap <strong>Delete account</strong>, confirm your identity and type the
          confirmation word.</li>
        <li>The account and all data are deleted immediately; the session is ended.</li>
      </ol>

      <h2>How to delete (by email)</h2>
      <p>If you cannot access the app, send a request from your account's email address
        to <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a> with the
        subject "Delete account". We confirm and delete the account within{' '}
        <strong>30 days</strong>.</p>

      <h2>What data is deleted</h2>
      <p>When you delete your account, the following are permanently removed, in cascade:</p>
      <ul>
        <li>Account and credentials (email, password <em>hash</em> / Google link, PIN
          and biometric keys).</li>
        <li>All financial data: credits and repayments, investment assets and movements,
          budget income/expenses and imported transactions.</li>
        <li>Preferences (language, <em>watchlist</em>) and bank/broker connections, if
          any.</li>
      </ul>
      <p>Our database provider's (Neon) backups are removed within their retention
        period (typically a few days to weeks).</p>

      <h2>What data is retained</h2>
      <div className="legal-box red">
        We retain only a <strong>pseudonymised deletion log</strong>: a SHA-256{' '}
        <em>hash</em> of the email and the deletion date. It exists to prove the request
        was fulfilled and contains <strong>no</strong> readable personal data and no
        financial data. Nothing else is retained, unless required by law.
      </div>

      <h2>Contact</h2>
      <p>Tomás Marques — <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>.</p>
    </LegalPage>
  )
}

export default AccountDeletion
