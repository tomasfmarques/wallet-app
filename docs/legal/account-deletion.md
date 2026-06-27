# Eliminação de Conta — Wallet360

> **Fonte de registo.** A versão **publicada** vive em
> [`frontend/public/eliminar-conta.html`](../../frontend/public/eliminar-conta.html)
> → https://wallet360.pt/eliminar-conta.html. É o URL público a fornecer à Play.
> Mantém os dois em sincronia.

**Última atualização:** 2026-06-27

## Como eliminar a tua conta

**Na aplicação:** *Definições → Zona de perigo → Eliminar conta* — confirmação de
identidade + palavra de confirmação obrigatórias. A conta e todos os dados são
apagados de imediato e a sessão é terminada (`DELETE /api/me`).

**Por email:** envia um pedido a partir do email da conta para
privacy@wallet360.pt (assunto "Eliminar conta"). Eliminamos no prazo de 30 dias.

## Que dados são eliminados

Ao eliminar a conta, são removidos de forma permanente e em cascata:

- Conta e credenciais (email, *hash* da palavra-passe / ligação Google, PIN,
  chaves biométricas).
- Todos os dados financeiros: créditos e amortizações, ativos e movimentos de
  investimento, receitas/despesas do orçamento e transações importadas.
- Preferências (idioma, *watchlist*) e ligações bancárias / de corretora.

A eliminação é **em cascata** (FKs Prisma `onDelete: Cascade`). As cópias de segurança
do fornecedor de base de dados (Neon) são removidas dentro do respetivo período de
retenção (habitualmente alguns dias a semanas).

## Que dados são retidos

Apenas um **registo de eliminação pseudonimizado** (tabela `deletion_log`): um
*hash* SHA-256 do email + a data. **Não** contém dados pessoais legíveis nem dados
financeiros — serve só para comprovar que o pedido foi cumprido. Nada mais é retido,
salvo exigência legal.

## Antes de eliminar

Podes **exportar** todos os teus dados em *Definições → Exportar* (JSON).

## Contacto

Tomás Marques — privacy@wallet360.pt.
