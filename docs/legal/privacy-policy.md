# Política de Privacidade — Wallet360

> **Fonte de registo.** A versão **publicada** vive em
> [`frontend/public/privacidade.html`](../../frontend/public/privacidade.html)
> → https://wallet360.pt/privacidade.html. Mantém os dois em sincronia.
> Continua a requerer revisão jurídica final antes de submeter à Play.

**Última atualização:** 2026-06-27
**Responsável pelo tratamento:** Tomás Marques (Portugal) — contacto: privacy@wallet360.pt

> ⚠️ **A confirmar antes da submissão à Play:** (1) o email `privacy@wallet360.pt`
> precisa de uma caixa/encaminhamento ativo; (2) confirmar se é necessária morada
> postal do responsável; (3) confirmar a região de processamento da Vercel.

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

**Não** recolhemos dados de localização, nem contactos, nem usamos publicidade ou
*tracking* de terceiros.

## 2. Finalidades e base legal

- Prestar o serviço (cálculos de crédito, projeções, orçamento) — **execução do
  contrato** (art. 6.º/1-b).
- Autenticação e segurança da conta — **interesse legítimo** (art. 6.º/1-f).
- Registo pseudonimizado das eliminações de conta para conformidade —
  **interesse legítimo / obrigação legal** (art. 6.º/1-f e 1-c). Ver secção 5.

Os teus dados financeiros são usados **exclusivamente** para te mostrar a ti as
tuas finanças. Não os vendemos nem partilhamos para fins de marketing.

## 3. Onde processamos os extratos bancários

Os ficheiros de extrato (CSV/OFX/PDF) são lidos **no teu navegador**; só as
linhas que confirmas são enviadas para o servidor e guardadas como movimentos do
orçamento. O ficheiro original não é carregado.

## 4. Subcontratantes (alojamento e serviços)

- **Vercel** — alojamento da aplicação e API (UE/EUA, cláusulas contratuais-tipo).
- **Neon** — base de dados PostgreSQL, região da UE (Frankfurt).
- **Google** — apenas se usares *Sign in with Google* (validação do token).
- **Yahoo Finance / Frankfurter** — cotações e câmbio; enviamos apenas o
  *ticker*/moeda, nunca dados pessoais.
- **Open Banking (ligação bancária)** — atualmente **inativo**. Quando ativado, a
  ligação é feita por um fornecedor licenciado (AISP) que atua como subcontratante;
  a autenticação ocorre no site do teu banco e o acesso é apenas de leitura.

Transferências para fora do EEE, quando existam, baseiam-se em cláusulas
contratuais-tipo.

## 5. Retenção e eliminação

Mantemos os teus dados enquanto a conta existir. Ao eliminares a conta, os dados
associados são apagados em cascata — ver [Eliminação de conta](account-deletion.md).
As cópias de segurança do fornecedor de base de dados (Neon) são removidas dentro do
respetivo período de retenção (habitualmente alguns dias a semanas). Conservamos apenas
um **registo de eliminação pseudonimizado**: um *hash* SHA-256 do email + a data, que
prova que a eliminação ocorreu sem reter dados pessoais legíveis nem dados financeiros
(tabela `deletion_log`).

## 6. Os teus direitos (RGPD)

Acesso, retificação, eliminação, limitação, portabilidade e oposição. Podes
**exportar** todos os teus dados em *Definições → Exportar* (JSON) e **eliminar**
a conta em *Definições → Eliminar conta* ou contactando privacy@wallet360.pt.
Tens ainda o direito de reclamar junto da **CNPD** (cnpd.pt).

## 7. Segurança

bcrypt para palavras-passe; TLS nas ligações; credenciais de corretora cifradas
em repouso (AES-256-GCM); segredos apenas em variáveis de ambiente do servidor;
base de dados num fornecedor da UE.

## 8. Menores

A aplicação não se destina a menores de 16 anos.

## 9. Alterações

Podemos atualizar esta política; a data acima reflete a última alteração.

## 10. Contacto

Tomás Marques — privacy@wallet360.pt.
