# Eliminação de Conta — Wallet360

> **DRAFT — requer revisão antes de publicar.** O Google Play exige um URL
> público que explique como eliminar a conta e que dados são removidos.

**Última atualização:** [DATA]

## Como eliminar a tua conta

**Na aplicação:** [Definições → Eliminar conta] — confirmação obrigatória.
[Se ainda não existir esta opção na app, ver "Ainda não há eliminação na app".]

**Por email:** envia um pedido de [seu_email@dominio] a partir do email da conta
para [EMAIL]. Eliminamos a conta no prazo de [30] dias.

## Que dados são eliminados

Ao eliminar a conta, são removidos de forma permanente:

- Conta e credenciais (email, *hash* da palavra-passe / ligação Google).
- Todos os dados financeiros: créditos e amortizações, ativos e movimentos de
  investimento, receitas/despesas do orçamento e transações importadas.
- Preferências (idioma, *watchlist*) e ligações bancárias (Open Banking), se
  existirem.

A eliminação é **em cascata** (todos os registos associados ao utilizador são
apagados). Cópias de segurança são purgadas no ciclo seguinte (até [N] dias).

## Que dados podem ser retidos

Apenas o estritamente exigido por lei (ex.: registos contabilísticos, se
aplicável). [Confirmar — por defeito, nada.]

## Antes de eliminar

Podes **exportar** todos os teus dados em *Definições → Exportar* (JSON).

## Ainda não há eliminação na app?

[Se a app ainda não tiver botão de eliminação: implementar um endpoint
`DELETE /api/me` que apague o utilizador (cascade já existe nas relações Prisma)
+ um botão em Definições. Até lá, processar pedidos por email no prazo indicado.]

## Contacto

[NOME] — [EMAIL].
