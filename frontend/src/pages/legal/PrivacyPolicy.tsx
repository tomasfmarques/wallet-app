import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LegalPage } from '@/components/legal/LegalPage'
import { asAppLanguage } from '@/i18n'

/**
 * Public privacy policy — pt-PT (binding) + EN (courtesy translation), switched
 * on the active i18n language. Source-of-record mirror: docs/legal/privacy-policy.md
 * (pt) — keep the PT block in sync with it; the EN block is a faithful translation
 * of the PT text. The bodies are per-language JSX (not JSON keys) on purpose:
 * long-form legal prose with embedded markup must stay reviewable as one piece.
 * Published contact + controller are confirm-before-Play defaults.
 */
export function PrivacyPolicy() {
  const { i18n } = useTranslation()
  return asAppLanguage(i18n.resolvedLanguage) === 'en' ? <PolicyEn /> : <PolicyPt />
}

function PolicyPt() {
  return (
    <LegalPage
      title="Política de Privacidade"
      meta="Última atualização: 27 de junho de 2026"
    >
      <p>
        Responsável pelo tratamento: <strong>Tomás Marques</strong> (Portugal) ·
        Contacto: <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>
      </p>

      <p>
        A Wallet360 ("a aplicação", "nós") é uma aplicação de finanças pessoais que
        reúne crédito/hipoteca, investimentos e orçamento num só sítio. Esta política
        explica que dados recolhemos, porquê, como os protegemos e os teus direitos ao
        abrigo do RGPD (Regulamento (UE) 2016/679).
      </p>

      <div className="legal-box accent">
        <strong>Em resumo:</strong> os teus dados financeiros servem exclusivamente para
        te mostrar a ti as tuas finanças. Não os vendemos, não os usamos para publicidade
        e não fazemos <em>tracking</em> de terceiros. Os extratos bancários são lidos no
        teu dispositivo. Podes exportar ou eliminar tudo a qualquer momento.
      </div>

      <h2>1. Que dados recolhemos</h2>
      <ul>
        <li><strong>Conta:</strong> email e palavra-passe (guardada apenas como <em>hash</em>{' '}
          bcrypt, nunca em texto simples). Em alternativa, o identificador da tua conta
          Google se usares o <em>Sign in with Google</em>.</li>
        <li><strong>Dados financeiros que introduzes ou importas:</strong> créditos/hipotecas,
          ativos de investimento, receitas/despesas do orçamento e transações importadas de
          extratos bancários (CSV/OFX/PDF) ou, quando ativado, via Open Banking.</li>
        <li><strong>Preferências:</strong> idioma e lista de <em>watchlist</em>.</li>
        <li><strong>Dados técnicos:</strong> um <em>cookie</em> de sessão para te manteres
          autenticado.</li>
      </ul>
      <p><strong>Não</strong> recolhemos dados de localização nem de contactos, e não usamos
        publicidade nem <em>tracking</em> de terceiros.</p>

      <h2>2. Para que usamos os dados (finalidades e base legal)</h2>
      <ul>
        <li>Prestar o serviço (cálculos de crédito, projeções, orçamento) —{' '}
          <strong>execução do contrato</strong> (art. 6.º/1-b).</li>
        <li>Autenticação e segurança da conta — <strong>interesse legítimo</strong> (art. 6.º/1-f).</li>
        <li>Manter um registo das eliminações de conta para fins de conformidade —{' '}
          <strong>interesse legítimo / obrigação legal</strong> (art. 6.º/1-f e 1-c). Este
          registo é pseudonimizado e não contém dados pessoais legíveis (ver secção 5).</li>
      </ul>

      <h2>3. Como tratamos os extratos bancários</h2>
      <p>Os ficheiros de extrato (CSV/OFX/PDF) são lidos <strong>no teu navegador</strong>;
        só as linhas que confirmas são enviadas para o servidor e guardadas como movimentos
        do orçamento. O ficheiro original não é carregado nem armazenado.</p>

      <h2>3-A. Modo Casal (partilha entre duas contas)</h2>
      <p>Se ativares o <strong>Modo Casal</strong> e o teu par aceitar o convite, cada um
        passa a ver do outro <strong>apenas o primeiro nome e totais agregados</strong>
        (valor da carteira, dívida de crédito, receitas/despesas mensais e saldo).
        <strong> Nunca são partilhados movimentos individuais, extratos, nomes de
        comerciantes, emails ou qualquer outro detalhe.</strong> Qualquer um dos membros
        pode sair a qualquer momento (Definições → Conta), o que termina de imediato a
        partilha nos dois sentidos; os dados de cada conta não são afetados.</p>

      <h2>4. Subcontratantes (alojamento e serviços)</h2>
      <table>
        <tbody>
          <tr><th>Serviço</th><th>Finalidade</th><th>Região</th></tr>
          <tr><td>Vercel</td><td>Alojamento da aplicação e API</td><td>UE/EUA (cláusulas contratuais-tipo)</td></tr>
          <tr><td>Neon</td><td>Base de dados PostgreSQL</td><td>UE — Frankfurt</td></tr>
          <tr><td>Google</td><td>Apenas se usares <em>Sign in with Google</em> (validação do token)</td><td>UE/EUA</td></tr>
          <tr><td>Yahoo Finance / Frankfurter</td><td>Cotações e câmbio (enviamos só o <em>ticker</em>/moeda, nunca dados pessoais)</td><td>—</td></tr>
          <tr><td>Open Banking (ligação bancária)</td><td>Atualmente <strong>inativo</strong>. Quando ativado, a ligação é feita por um fornecedor licenciado (AISP) que atua como subcontratante; a autenticação ocorre no site do teu banco e o acesso é apenas de leitura.</td><td>UE</td></tr>
        </tbody>
      </table>
      <p>Transferências para fora do EEE, quando existam, baseiam-se em cláusulas
        contratuais-tipo.</p>

      <h2>5. Retenção e eliminação</h2>
      <p>Mantemos os teus dados enquanto a conta existir. Ao eliminares a conta, todos os
        dados associados são apagados de forma permanente e em cascata. As cópias de
        segurança do nosso fornecedor de base de dados (Neon) são removidas dentro do
        respetivo período de retenção (habitualmente alguns dias a semanas). Ver a{' '}
        <Link to="/eliminar-conta">Política de eliminação de conta</Link>.</p>
      <p>Conservamos apenas um <strong>registo de eliminação pseudonimizado</strong> — um{' '}
        <em>hash</em> SHA-256 do email e a data — que prova que a eliminação ocorreu sem
        reter qualquer dado pessoal legível nem dados financeiros.</p>

      <h2>6. Os teus direitos (RGPD)</h2>
      <p>Tens direito de acesso, retificação, eliminação, limitação, portabilidade e
        oposição. Podes <strong>exportar</strong> todos os teus dados a qualquer momento em{' '}
        <em>Definições → Dados</em> (JSON), e <strong>eliminar</strong> a conta em{' '}
        <em>Definições → Zona de perigo</em> ou contactando{' '}
        <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>. Tens ainda o direito
        de reclamar junto da <strong>CNPD</strong> (<a href="https://www.cnpd.pt" target="_blank" rel="noopener">cnpd.pt</a>).</p>

      <h2>7. Segurança</h2>
      <p>Palavras-passe guardadas com bcrypt; ligações cifradas (TLS); credenciais de
        corretora cifradas em repouso (AES-256-GCM); segredos apenas em variáveis de
        ambiente do servidor; base de dados num fornecedor da UE.</p>

      <h2>8. Menores</h2>
      <p>A aplicação não se destina a menores de 16 anos.</p>

      <h2>9. Alterações</h2>
      <p>Podemos atualizar esta política; a data no topo reflete a última alteração.</p>

      <h2>10. Contacto</h2>
      <p>Tomás Marques — <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>.</p>
    </LegalPage>
  )
}

function PolicyEn() {
  return (
    <LegalPage
      title="Privacy Policy"
      meta="Last updated: 27 June 2026"
    >
      <p className="legal-meta"><em>This is a courtesy translation. If there is any
        divergence, the Portuguese version prevails (switch the app language to
        Portuguese to read it).</em></p>

      <p>
        Data controller: <strong>Tomás Marques</strong> (Portugal) ·
        Contact: <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>
      </p>

      <p>
        Wallet360 ("the app", "we") is a personal-finance app that brings
        credit/mortgage, investments and budgeting together in one place. This policy
        explains what data we collect, why, how we protect it, and your rights under
        the GDPR (Regulation (EU) 2016/679).
      </p>

      <div className="legal-box accent">
        <strong>In short:</strong> your financial data is used exclusively to show you
        your own finances. We do not sell it, we do not use it for advertising, and
        there is no third-party tracking. Bank statements are read on your device. You
        can export or delete everything at any time.
      </div>

      <h2>1. What data we collect</h2>
      <ul>
        <li><strong>Account:</strong> email and password (stored only as a bcrypt{' '}
          <em>hash</em>, never in plain text). Alternatively, your Google account
          identifier if you use <em>Sign in with Google</em>.</li>
        <li><strong>Financial data you enter or import:</strong> credits/mortgages,
          investment assets, budget income/expenses and transactions imported from bank
          statements (CSV/OFX/PDF) or, when enabled, via Open Banking.</li>
        <li><strong>Preferences:</strong> language and <em>watchlist</em>.</li>
        <li><strong>Technical data:</strong> a session <em>cookie</em> to keep you
          signed in.</li>
      </ul>
      <p>We do <strong>not</strong> collect location or contact data, and we use no
        advertising or third-party tracking.</p>

      <h2>2. What we use the data for (purposes and legal basis)</h2>
      <ul>
        <li>Providing the service (credit calculations, projections, budgeting) —{' '}
          <strong>performance of a contract</strong> (art. 6(1)(b)).</li>
        <li>Authentication and account security — <strong>legitimate interest</strong> (art. 6(1)(f)).</li>
        <li>Keeping a record of account deletions for compliance purposes —{' '}
          <strong>legitimate interest / legal obligation</strong> (art. 6(1)(f) and (1)(c)).
          This log is pseudonymised and contains no readable personal data (see section 5).</li>
      </ul>

      <h2>3. How we handle bank statements</h2>
      <p>Statement files (CSV/OFX/PDF) are read <strong>in your browser</strong>; only
        the lines you confirm are sent to the server and stored as budget movements. The
        original file is never uploaded or stored.</p>

      <h2>3-A. Couple Mode (sharing between two accounts)</h2>
      <p>If you enable <strong>Couple Mode</strong> and your partner accepts the invite,
        each of you can see <strong>only the other's first name and aggregate
        totals</strong> (portfolio value, credit debt, monthly income/expenses and
        balance). <strong>Individual movements, statements, merchant names, emails or
        any other detail are never shared.</strong> Either member can leave at any time
        (Settings → Account), which immediately ends sharing in both directions; neither
        account's data is affected.</p>

      <h2>4. Processors (hosting and services)</h2>
      <table>
        <tbody>
          <tr><th>Service</th><th>Purpose</th><th>Region</th></tr>
          <tr><td>Vercel</td><td>App and API hosting</td><td>EU/US (standard contractual clauses)</td></tr>
          <tr><td>Neon</td><td>PostgreSQL database</td><td>EU — Frankfurt</td></tr>
          <tr><td>Google</td><td>Only if you use <em>Sign in with Google</em> (token validation)</td><td>EU/US</td></tr>
          <tr><td>Yahoo Finance / Frankfurter</td><td>Quotes and FX rates (we send only the <em>ticker</em>/currency, never personal data)</td><td>—</td></tr>
          <tr><td>Open Banking (bank connection)</td><td>Currently <strong>inactive</strong>. When enabled, the connection is made through a licensed provider (AISP) acting as a processor; authentication happens on your bank's site and access is read-only.</td><td>EU</td></tr>
        </tbody>
      </table>
      <p>Transfers outside the EEA, where they occur, rely on standard contractual
        clauses.</p>

      <h2>5. Retention and deletion</h2>
      <p>We keep your data for as long as the account exists. When you delete your
        account, all associated data is permanently deleted, in cascade. Our database
        provider's (Neon) backups are removed within their retention period (typically a
        few days to weeks). See the{' '}
        <Link to="/eliminar-conta">Account-deletion policy</Link>.</p>
      <p>We retain only a <strong>pseudonymised deletion log</strong> — a SHA-256{' '}
        <em>hash</em> of the email and the date — which proves the deletion happened
        without keeping any readable personal data or any financial data.</p>

      <h2>6. Your rights (GDPR)</h2>
      <p>You have the rights of access, rectification, erasure, restriction,
        portability and objection. You can <strong>export</strong> all your data at any
        time in <em>Settings → Data</em> (JSON), and <strong>delete</strong> your account
        in <em>Settings → Danger zone</em> or by contacting{' '}
        <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>. You also have the
        right to lodge a complaint with the <strong>CNPD</strong>, the Portuguese
        supervisory authority (<a href="https://www.cnpd.pt" target="_blank" rel="noopener">cnpd.pt</a>).</p>

      <h2>7. Security</h2>
      <p>Passwords stored with bcrypt; encrypted connections (TLS); broker credentials
        encrypted at rest (AES-256-GCM); secrets kept only in server environment
        variables; database hosted with an EU provider.</p>

      <h2>8. Children</h2>
      <p>The app is not intended for children under 16.</p>

      <h2>9. Changes</h2>
      <p>We may update this policy; the date at the top reflects the latest change.</p>

      <h2>10. Contact</h2>
      <p>Tomás Marques — <a href="mailto:privacy@wallet360.pt">privacy@wallet360.pt</a>.</p>
    </LegalPage>
  )
}

export default PrivacyPolicy
