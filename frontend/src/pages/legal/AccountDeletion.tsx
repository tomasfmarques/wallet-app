import { LegalPage } from '@/components/legal/LegalPage'

/**
 * Public account-deletion page (pt-PT) — the URL given to Google Play.
 * Source-of-record mirror: docs/legal/account-deletion.md. Keep in sync.
 */
export function AccountDeletion() {
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

export default AccountDeletion
