import { Link } from 'react-router-dom'
import { LegalPage } from '@/components/legal/LegalPage'

/**
 * Public privacy policy (pt-PT). Source-of-record mirror: docs/legal/privacy-policy.md.
 * Keep the two in sync. Published contact + controller are confirm-before-Play defaults.
 */
export function PrivacyPolicy() {
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

export default PrivacyPolicy
