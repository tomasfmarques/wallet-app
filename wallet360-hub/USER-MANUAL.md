# Wallet360 — Manual do utilizador

> Manual curto e prático da app **tal como existe hoje** (https://wallet360.pt).
> Escrito em português porque descreve a app, que é em pt-PT. Onde um fluxo ainda
> está áspero, está assinalado com ⚠️.

---

## Começar

1. Cria conta em **/signup** com email + password, ou entra com **Google**.
2. Aterras na **Visão geral**. No início está vazia — vais preenchendo módulo a módulo.
3. Navegação:
   - **Telemóvel:** barra inferior — **Início · Gestão · Saldo · Definições**. O botão **Gestão** abre um painel com **Crédito**, **Investimentos** e **Amortizar ou Investir?**.
   - **Computador:** os mesmos separadores na barra de topo.

---

## 🏠 Visão geral (Início)

A tua fotografia financeira num só ecrã:

- **KPIs principais:** valor da carteira, capital em dívida (somado de todos os créditos), saldo mensal e receitas mensais.
- **Gráfico de cashflow** (receitas vs despesas), com alternância mês/ano.
- **Cartões-resumo** por módulo (Crédito, Investimentos, Saldo). Clica num cartão para saltar para o módulo.
- Cartão de entrada **"⚖️ Amortizar ou Investir?"** que abre o simulador.

⚠️ **Bug conhecido (F4):** se importaste um extrato, as **RECEITAS MENSAIS podem aparecer a `0 €`** e o saldo mensal a vermelho, mesmo com salário importado. As linhas importadas entram como movimentos de um único mês e ainda não contam como receita recorrente. A app **não está partida** — é o tema "planeado vs. realizado" que está a ser corrigido (ver `TODO.md` FX1).

---

## 💳 Crédito

Gere um ou vários créditos (casa, carro…) com tracking mensal e simulação.

- **Adicionar crédito:** capital, prazo (meses), TAN fixa, meses fixos, spread, Euribor, data de início. Também aceita bonificação e TAEG.
- **Vários créditos:** alterna entre eles pelos chips no topo. Os KPIs da Visão geral somam todos.
- **KPIs:** capital em dívida, % pago, próxima prestação, conclusão prevista, taxa efetiva.
- Três separadores:
  - **Tracking mensal** — gráfico de evolução do capital + acordeão de pagamentos por ano. Marca cada prestação como **paga**.
  - **Simulação** — simula amortizações/cenários sobre o crédito.
  - **Tabela anual** — quadro ano a ano (capital, juros, amortizado).
- **Amortizações:** botão **"Amortizações (N)"** no topo para registar e ver amortizações extra.
- **Editar dados / Remover** o crédito a partir do cabeçalho.

---

## 📈 Investimentos

A tua carteira, com cotações ao vivo e projeção.

- **Watchlist "Em alta · NASDAQ":** símbolos a acompanhar; podes adicionar diretamente à carteira a partir daqui.
- **Adicionar ativo:** nome, ticker (com pesquisa de ticker integrada), quantidade, valor investido, valor atual, reforço mensal e rentabilidade esperada.
- **A minha carteira:** lista por ativo com valor atual, ganho/perda (€ e %) e barra de alocação. Por linha:
  - **Reforçar** — registar um novo aporte.
  - **↻** — atualizar o valor desse ativo com a cotação atual (Yahoo Finance).
  - **Editar / Remover.**
  - Clica na linha para ver a **evolução do preço** num gráfico.
- **↻ Atualizar valores** (topo) — atualiza **todos** os ativos de uma vez; mostra quantos foram atualizados e quais ficaram sem cotação.
- **Reforço mensal por ativo** e **Projeção** (valor futuro segundo a rentabilidade e o horizonte definidos).

⚠️ As cotações dependem de um endpoint não oficial do Yahoo. Se um ativo ficar **"sem cotação"**, tenta novamente mais tarde (ver `KEEP-IN-MIND.md` F8).

---

## 💶 Saldo

As tuas receitas e despesas planeadas, mês a mês.

- **Importar extrato:** carrega um ficheiro do banco (CSV/PDF). A app deteta receitas vs despesas pelo sinal, infere categorias, e **marca duplicados** se reimportares o mesmo extrato (re-importar é seguro, não duplica).
- **Por classificar (caixa 📥):** as linhas importadas ficam aqui à espera. Em cada linha escolhes **Fixa** ou **Variável**. **A app aprende o comércio** e aplica a mesma escolha às linhas iguais — agora e em importações futuras.
- **Tabelas:** Receitas fixas, Despesas fixas, e variáveis mês a mês. Adicionar/editar/remover; podes **pausar** uma linha (fica inativa, não conta no total).
- **Análise:** 
  - **Visão geral** — histórico de 12 meses + donuts de distribuição por categoria (despesas fixas, variáveis, receitas).
  - **Mês a mês** — drill-down de um mês específico (clica num mês do histórico).
- **🏦 Ligar banco:** entrada para sincronização automática (GoCardless). Hoje mostra fallback "brevemente" — ainda não está ativo.

⚠️ As linhas importadas são de um único mês — ver o aviso de receitas a `0 €` na Visão geral (F4).

---

## ⚖️ Amortizar ou Investir?

O simulador de decisão — o diferenciador da app. Compara amortizar o crédito vs investir o mesmo montante.

- Escolhe o crédito (se tiveres mais que um). Mostra uma faixa de contexto: taxa efetiva, capital em dívida, prestação, conclusão prevista.
- **Parâmetros** (já vêm com valores inteligentes a partir dos teus dados):
  - **Montante a alocar (€)** — predefinido para a tua prestação.
  - **Modo:** *Reduzir prazo* (prestação igual, pagas mais cedo) ou *Reduzir prestação* (prazo igual, prestação baixa).
  - **Rentabilidade esperada** do investimento (slider; usa a do teu portfolio se existir).
  - **Imposto sobre mais-valias** (slider; Portugal = 28 %).
- **Resultado** (recalcula automaticamente): banner com a recomendação (**Amortizar / Investir / Equivalente**), colunas lado a lado (juros poupados, tempo poupado, poupança mensal · vs · ganho líquido, valor futuro, ganho bruto), **ponto de equilíbrio** e gráfico da evolução do ganho ao longo do tempo.
- **↺ Repor valores** volta aos predefinidos do teu crédito/portfolio.

---

## ⚙️ Configurações

Cinco separadores:

- **Conta** — dados da conta, alterar password.
- **Euribor** — editor dos valores de Euribor usados nos cálculos do crédito.
- **Backup** — **Exportar** e **Importar**:
  - **Exportar:** descarrega tudo num JSON (crédito, pagamentos, amortizações, carteira, reforços, definições). **Pede a password atual antes de exportar** (proteção extra). O ficheiro **não** inclui a password.
  - **Importar:** restaura a partir de um backup JSON.
- **Watchlist** — gerir os símbolos da watchlist dos Investimentos.
- **Perigo (Zona perigosa):**
  - **Repor dados** — apaga crédito + carteira + configurações, mantém a conta. Pede password.
  - **Apagar conta** — apaga a conta e todos os dados, **irreversível**. Pede password **e** que escrevas `APAGAR` para confirmar.

---

## Notas honestas (o que ainda está áspero)

- **Receitas importadas a `0 €`** na Visão geral até serem reconciliadas — o tema "planeado vs. realizado" (F4/FX1).
- **Sem onboarding** — uma conta nova aterra numa Visão geral vazia sem guia (FX2 planeado).
- **Cotações** dependem de um endpoint não oficial; podem falhar pontualmente (F8).
- **Ligar banco** ainda não funciona (bloqueado externamente no GoCardless); por agora usa **Importar extrato**.
