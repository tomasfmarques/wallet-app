# Política de Privacidade — Wallet360

> **DRAFT — requer revisão jurídica antes de publicar.** Preenche os campos
> entre `[colchetes]` com os dados reais do responsável pelo tratamento. Este
> texto é um ponto de partida, não aconselhamento jurídico.

**Última atualização:** [DATA]
**Responsável pelo tratamento:** [NOME / ENTIDADE], [MORADA], contacto: [EMAIL]

A Wallet360 ("a aplicação", "nós") é uma aplicação de finanças pessoais que
reúne crédito/hipoteca, investimentos e orçamento num só sítio. Esta política
explica que dados recolhemos, porquê, como os protegemos e os teus direitos ao
abrigo do RGPD (Regulamento (UE) 2016/679).

## 1. Que dados recolhemos

- **Conta:** email e palavra-passe (guardada apenas como *hash* bcrypt, nunca em
  texto simples). Em alternativa, o identificador da tua conta Google se usares
  o *Sign in with Google*.
- **Dados financeiros que introduzes ou importas:** créditos, ativos de
  investimento, receitas/despesas do orçamento e transações importadas de
  extratos bancários (CSV/OFX/PDF) ou, quando ativado, via Open Banking.
- **Preferências:** idioma e lista de *watchlist*.
- **Dados técnicos:** *cookie* de sessão para te manteres autenticado.
  [Se ativares monitorização de erros (Sentry), indica-o aqui.]

**Não** recolhemos dados de localização, contactos, nem usamos publicidade ou
*tracking* de terceiros.

## 2. Para que usamos os dados (finalidades e base legal)

- Prestar o serviço (cálculos de crédito, projeções, orçamento) — **execução do
  contrato** (art. 6.º/1-b).
- Autenticação e segurança da conta — **interesse legítimo** (art. 6.º/1-f).
- Cumprir obrigações legais quando aplicável — **obrigação legal** (art. 6.º/1-c).

Os teus dados financeiros são usados **exclusivamente** para te mostrar a ti as
tuas finanças. Não os vendemos nem partilhamos para fins de marketing.

## 3. Onde processamos os extratos bancários

Os ficheiros de extrato (CSV/OFX/PDF) são lidos **no teu navegador**; só as
linhas que confirmas são enviadas para o servidor e guardadas como movimentos do
orçamento. O ficheiro original não é carregado.

## 4. Subcontratantes (alojamento e serviços)

- **Vercel** — alojamento da aplicação e API (UE/EUA). [Confirmar região.]
- **Neon** — base de dados PostgreSQL, região da UE (Frankfurt).
- **Google** — apenas se usares *Sign in with Google* (validação do token).
- **Yahoo Finance / Frankfurter** — cotações e câmbio; enviamos apenas o
  *ticker*/moeda, nunca dados pessoais.
- **[Provedor de Open Banking, ex.: GoCardless]** — apenas se ligares uma conta
  bancária; a autenticação ocorre no site do teu banco e o acesso é só de
  leitura.

Todos os subcontratantes tratam dados ao abrigo de contratos adequados.
Transferências para fora do EEE, quando existam, baseiam-se em cláusulas
contratuais-tipo. [Confirmar.]

## 5. Retenção

Mantemos os teus dados enquanto a conta existir. Ao eliminares a conta, os dados
associados são apagados — ver [Política de eliminação de conta](account-deletion.md).

## 6. Os teus direitos (RGPD)

Tens direito de acesso, retificação, eliminação, limitação, portabilidade e
oposição. Podes **exportar** todos os teus dados a qualquer momento em
*Definições → Exportar*, e **eliminar** a conta em [Definições → Eliminar conta /
contactando [EMAIL]]. Para exercer qualquer direito, contacta [EMAIL]. Tens
ainda o direito de reclamar junto da **CNPD** (cnpd.pt).

## 7. Segurança

Palavras-passe guardadas com bcrypt; ligações cifradas (TLS); segredos apenas em
variáveis de ambiente do servidor; base de dados num fornecedor da UE.

## 8. Menores

A aplicação não se destina a menores de [16] anos.

## 9. Alterações

Podemos atualizar esta política; a data acima reflete a última alteração.

## 10. Contacto

[NOME] — [EMAIL].
