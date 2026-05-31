# Handoff: 💸WALLET — Autenticação + Backend com base de dados

## Visão geral

**💸WALLET** é uma app de *tracking* financeiro pessoal, atualmente um protótipo
**100% front-end** (HTML + CSS + JavaScript vanilla + Chart.js), sem build, sem
servidor. Os dados vivem no `localStorage` do browser.

Tem três áreas funcionais:

1. **Empréstimo da casa** — tracking mês a mês da prestação, registo de
   amortizações reais, simulador "e se" de amortização, tabela anual.
2. **Investimentos** — carteira real (quantidade, investido, valor atual,
   ganho/perda), reforços mensais por ativo, projeção de juro composto a 5–40
   anos, watchlist "Em alta · Nasdaq" com cotações ao vivo opcionais (Finnhub).
3. **Visão geral + Configurações** — dashboard agregado e edição dos dados do
   empréstimo / Euribor / export-import JSON.

### O que se pretende ADICIONAR (o objetivo deste handoff)

> O protótipo guarda tudo localmente e é monoutilizador. Queremos torná-lo uma
> aplicação real e multiutilizador:

1. **Páginas de Sign in / Sign up / Sign out** (autenticação de utilizadores).
2. **Backend com base de dados** — cada utilizador tem os seus próprios dados
   (empréstimo, pagamentos, amortizações, carteira, reforços) guardados no
   servidor em vez do `localStorage`.
3. **Migração da camada de persistência** — o `localStorage` atual passa a ser
   uma API REST autenticada. O modelo de dados já está desenhado para isto
   (ver secção *Modelo de dados*).

---

## Sobre os ficheiros de design (LER PRIMEIRO)

Os ficheiros em `design_app/` são uma **referência de design funcional** — um
protótipo que demonstra o aspeto e o comportamento pretendidos. **Não são código
de produção para copiar diretamente.** A tarefa é **recriar este design no
ambiente alvo** (ver *Stack recomendada*), reutilizando os padrões e bibliotecas
desse ambiente, e **adicionar** a autenticação e o backend descritos.

A lógica de negócio (motor de amortização, projeção de juro composto, fórmulas
de ganho/perda) está bem isolada e **pode e deve ser reaproveitada quase tal e
qual** — está em JavaScript puro, sem dependências de DOM:

- `design_app/engine.js` — motor de amortização do empréstimo (schedule mensal,
  amortizações, taxa fixa→Euribor). **Reutilizável no backend** (Node) ou no
  front.
- A projeção de investimentos (`simA`/`simAll` em `page-portfolio.js`) — juro
  composto com reforços crescentes. **Reutilizável.**

## Fidelidade

**Alta fidelidade (hi-fi).** Cores, tipografia, espaçamento e interações são
finais. Recriar a UI fielmente, usando as bibliotecas/padrões do codebase alvo.
Os *design tokens* exatos estão na secção própria e em `design_app/styles.css`.

---

## Stack recomendada

O protótipo não tem framework. Sugestão de stack moderna e simples para um
desenvolvedor com Claude Code (adaptar ao que já exista, se existir):

| Camada | Recomendação | Alternativas |
|---|---|---|
| Front-end | **React + Vite + TypeScript** | Next.js, SvelteKit, Vue |
| Estilos | Portar `styles.css` (CSS variables) ou Tailwind com os tokens | CSS Modules |
| Gráficos | **Chart.js** (já usado) via `react-chartjs-2` | Recharts |
| Backend | **Node + Express** ou **Next.js API routes** | Fastify, Hono |
| Base de dados | **PostgreSQL + Prisma ORM** | SQLite (dev), Supabase, Drizzle |
| Auth | **Auth.js (NextAuth)** ou Lucia; ou Supabase Auth / Clerk | JWT à mão |
| Cotações | Finnhub (já integrado no front) — **mover a chamada para o backend** | Alpha Vantage |

> Se já existir um codebase, **ignorar a stack acima** e seguir os padrões dele.

---

## Modelo de dados (migrar de localStorage → base de dados)

Hoje todo o estado é um único objeto JSON guardado em
`localStorage["investimentos.tracker.v1"]`. A forma exata está em
`design_app/state.js` (`DEFAULT_STATE`). Eis o mapeamento sugerido para tabelas
relacionais. **Tudo passa a ter `user_id`.**

### `users`
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| email | text unique | login |
| password_hash | text | se auth própria (bcrypt/argon2) |
| name | text | |
| created_at | timestamptz | |

### `loans` (1 por utilizador, ou vários no futuro)
Mapeia `STATE.loan`:
| coluna | tipo | exemplo |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| capital | numeric | 240000 |
| prazo_meses | int | 480 |
| tan_fixa | numeric | 0.022 (fração) |
| meses_fixos | int | 24 |
| spread | numeric | 0.006 |
| euribor | numeric | 0.02107 |
| data_inicio | text/date | "2024-01" (AAAA-MM) |

### `loan_payments`
Mapeia `STATE.payments` (`{ 'AAAA-MM': { paid, real } }`):
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| loan_id | uuid FK | |
| ym | text | "AAAA-MM" |
| paid | bool | marcado como pago |
| real | numeric null | valor realmente pago (pode diferir do previsto) |

### `loan_amortizations`
Mapeia `STATE.amortizacoes` (`[{ id, ym, valor, modo }]`):
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| loan_id | uuid FK | |
| ym | text | "AAAA-MM" |
| valor | numeric | montante amortizado |
| modo | enum | 'prazo' \| 'prestacao' |

### `euribor_history`
Mapeia `STATE.euriborHist` (`[{ ym, valor }]`):
| coluna | tipo |
|---|---|
| id | uuid PK |
| loan_id | uuid FK |
| ym | text |
| valor | numeric |

### `portfolio_assets`
Mapeia `STATE.portfolio.assets`:
| coluna | tipo | exemplo |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| name | text | "Microsoft" |
| ticker | text | "MSFT" |
| qty | numeric | 1.11391596 |
| invested | numeric | custo de aquisição acumulado |
| value | numeric | valor de mercado atual |
| monthly | numeric | reforço mensal (campo `m`) |
| expected_return | numeric | retorno esperado %/ano (campo `r`) |

### `portfolio_flows`
Mapeia `asset.flows` (histórico de reforços `[{ ym, amount }]`):
| coluna | tipo |
|---|---|
| id | uuid PK |
| asset_id | uuid FK |
| ym | text |
| amount | numeric |

### `portfolio_settings` (1 por utilizador)
Mapeia os globais `STATE.portfolio`:
| coluna | tipo | campo original |
|---|---|---|
| g_inc | int | gInc (aumento anual reforços %) |
| g_fy | int | gFY (anos iniciais sem aumento) |
| g_h | int | gH (horizonte em anos) |

> **Cotações ao vivo:** a chave Finnhub (`STATE.finnhubKey` / `portfolio.apiKey`)
> **não deve** ficar no cliente em produção. Guardar como variável de ambiente no
> servidor (`FINNHUB_API_KEY`) e expor um endpoint `GET /api/quotes?symbols=...`
> que faz o proxy. Assim a chave nunca chega ao browser.

---

## API REST sugerida

Todas autenticadas (cookie de sessão ou Bearer JWT). Resposta JSON.

```
POST   /api/auth/signup        { email, password, name }      → cria user + sessão
POST   /api/auth/login         { email, password }            → sessão
POST   /api/auth/logout                                        → termina sessão
GET    /api/me                                                 → user atual

GET    /api/loan                                               → loan + payments + amort + euribor
PUT    /api/loan               { ...campos do empréstimo }
PUT    /api/loan/payments/:ym  { paid, real }
POST   /api/loan/amortizations { ym, valor, modo }
DELETE /api/loan/amortizations/:id
POST   /api/loan/euribor       { valor }                       → adiciona ao histórico + atualiza atual

GET    /api/portfolio                                          → assets + settings
POST   /api/portfolio/assets   { name, ticker, qty, invested, value, monthly, expectedReturn }
PUT    /api/portfolio/assets/:id
DELETE /api/portfolio/assets/:id
POST   /api/portfolio/assets/:id/reforcar { amount, ym, price? } → atualiza invested/value/qty + cria flow
PUT    /api/portfolio/settings { gInc, gFY, gH }

GET    /api/quotes?symbols=NVDA,AAPL,...                        → proxy Finnhub (chave no servidor)
```

O export/import JSON atual (Configurações) pode manter-se como
*backup/restore* por utilizador, agora a ler/escrever via API.

---

## Ecrãs / Vistas

A app é uma SPA com **navbar fixa no topo** e quatro páginas comutadas por
`location.hash`. Recriar cada uma como rota (`/overview`, `/loan`,
`/investments`, `/settings`), **protegidas por autenticação**.

## NOVO — Autenticação (a construir)
- **Sign in** — email + password, link "criar conta", erros de validação inline,
  estado de loading no botão. Após sucesso → `/overview`.
- **Sign up** — nome + email + password (+ confirmação), regras de password,
  erros inline. Após sucesso → onboarding/`/overview`.
- **Sign out** — botão na navbar (à direita, junto ao nome do utilizador) que
  termina a sessão e volta ao Sign in.
- **Guarda de rotas** — sem sessão, qualquer rota redireciona para `/signin`.
- **Estilo:** seguir os tokens abaixo. Sugestão: cartão centrado (max-width
  ~380px, igual ao `.modal`), fundo `--bg`, logótipo 💸WALLET no topo
  (ver `.brand` no `index.html`). Inputs e botões já existem como
  `.field`/`.input-suffix`/`.btn.btn-primary` em `styles.css`.

### Visão geral (`#overview`)
- **Propósito:** dashboard agregado (empréstimo + investimentos) e atalhos.
- **Layout:** coluna central, `max-width` ~960px, secções com `.section-label`.
- **Componentes:** grelha de KPIs (`.kpi-grid` / `.kpi`) para o empréstimo
  (capital em dívida com barra de progresso, próxima prestação, conclusão
  prevista, poupança) e para investimentos (valor atual, já investido,
  ganho/perda, reforço mensal, projeção). Cartões "em breve" (Receitas,
  Despesas, Património). Código em `design_app/page-misc.js` (`OverviewPage`).

### Empréstimo (`#loan`)
- **Propósito:** tracking mensal + simulação + tabela. Três sub-separadores
  (`.subtabs`/`.subtab`).
- **Tracking mensal:** cartão de destaque do mês atual (marcar pago / valor
  real), KPIs, gráfico de evolução do capital (Chart.js, linha), lista de meses
  agrupada por ano em acordeão (3 layouts via Tweaks: linha/cartões/tabela),
  registo de amortizações reais (modal).
- **Simulação de amortização:** modo "e se" com sliders (montante anual, ano de
  início, Euribor futura) — **não altera dados**, só simula. Comparativo
  sem/com amortização + gráfico.
- **Tabela anual:** evolução ano a ano.
- **Lógica:** `design_app/engine.js` + `design_app/page-loan.js`.

### Investimentos (`#portfolio`)
- **Propósito:** carteira real + reforços + projeção + watchlist.
- **Componentes (de cima para baixo):**
  1. **Em alta · Nasdaq** — grelha de cartões (`.trend-card`) com ticker,
     variação diária (verde/vermelho), preço, e botão "+ Adicionar". Cotações
     ao vivo opcionais via Finnhub (mover para o backend).
  2. **A minha carteira** — total no topo (valor atual, ganho/perda € e %), barra
     de alocação, e linhas por ativo (`.hold-row`: badge, nome, quantidade,
     valor, ganho/perda, botões **Reforçar** / editar / remover).
  3. **Reforço mensal por ativo** — lista (`.mp-row`) com €/mês editável por
     ativo + total.
  4. **Parâmetros da projeção** — 3 sliders (aumento anual dos reforços, anos
     sem aumento, horizonte).
  5. **KPIs** + **gráfico de projeção** (Chart.js) + **tabela de marcos**.
- **Lógica:** `design_app/page-portfolio.js`.

### Configurações (`#config`)
- Editar dados do empréstimo, atualizar Euribor (com histórico), export/import
  JSON, repor dados. Código em `design_app/page-misc.js` (`ConfigPage`).
- **Adicionar aqui:** secção de conta (nome/email, mudar password, terminar
  sessão).

---

## Interações & comportamento

- **Navegação:** SPA por `location.hash`; recriar como router. `window.scrollTo(0,0)`
  na troca de página.
- **Gráficos (Chart.js):** linha, `maintainAspectRatio:false`, altura fixa do
  contentor (240–300px), tooltip escuro (`#0B1120`). **Bug conhecido já
  resolvido no protótipo:** destruir a instância do gráfico antes de re-render
  para evitar canvas órfão (gráfico em branco) — replicar isto no port (em React,
  usar `react-chartjs-2` que trata disto, ou destruir no cleanup do `useEffect`).
- **Modais:** overlay `.modal-overlay` + `.modal`, fecha ao clicar fora.
- **Toasts:** confirmação curta no fundo (`.toast`), ~2,2s.
- **Tweaks (opcional):** painel de personalização (layout do tracking, cor de
  acento, densidade) via `postMessage` ao host — **específico do ambiente de
  prototipagem, pode ser ignorado** no port (ou reimplementado como
  Definições de UI).
- **Recálculo reativo:** mudar qualquer input (valor real, reforço, slider,
  amortização) recalcula KPIs, gráficos e tabelas imediatamente.

## Gestão de estado

No protótipo é um objeto global `STATE` + `save()`/`load()` em `localStorage`.
No port:
- Estado do servidor (empréstimo, carteira) → *data fetching* (React Query /
  SWR) contra a API REST.
- Estado de UI (separador ativo, anos abertos no acordeão, valores dos sliders) →
  estado local de componente.
- **Toda a escrita passa a ser um pedido à API** (otimista, se quiseres).

---

## Design tokens

Definidos em `:root` em `design_app/styles.css`. Principais:

**Cores**
- Fundo app `--bg: #F0F4F9` · Superfície `--surface: #FFFFFF` · Superfície 2 `#F8FAFC`
- Texto `--text: #0F172A` · Atenuado `--muted: #64748B` · `--muted-l: #94A3B8`
- Acento (azul) `--accent: #2563EB` · escuro `#1D4ED8` · claro `#EFF6FF` · médio `#DBEAFE` · borda `#BFDBFE`
  - (Tweaks permite trocar acento para teal `#0EA5A4`, roxo `#7C3AED`, laranja `#E8590C`)
- Verde `--green: #059669` / `--green-d: #047857` · Vermelho `--red: #DC2626`
- Âmbar `--amber: #D97706` · Bordas `--border: #E2E8F0` / `--border-s: #F1F5F9`
- Navy de tooltips/realces `#0B1120`

**Tipografia**
- Família: **Outfit** (Google Fonts), pesos 300/400/500/600/700.
- KPIs grandes ~30px/700; títulos de página ~22–26px/700; corpo 13–14px;
  metadados 11.5–12.5px. `font-feature-settings: "tnum"` em números.

**Raios**
- `--r-sm` 7px · `--r` 9px · `--r-lg` 12px (cartões) · `--r-xl` 16px (modais) ·
  pílulas/badges arredondados.

**Sombras**
- `--sh: 0 1px 3px rgba(15,23,42,.07), 0 1px 2px rgba(15,23,42,.04)`
- `--sh-m: 0 4px 16px rgba(15,23,42,.08)` · `--sh-l` (modais) maior.

**Espaçamento**
- Cartões com `padding` ~1–1.25rem; grelhas com `gap` 10–14px; secções
  separadas ~1.5rem.

## Assets

- **Fontes:** Outfit via Google Fonts (`<link>` no `<head>`).
- **Gráficos:** Chart.js 4.4.1 (CDN no protótipo; usar pacote npm no port).
- **Ícones:** SVG inline (stroke), sem biblioteca externa.
- **Logótipo:** emoji 💸 + wordmark "WALLET" (componível em texto, sem imagem).
- **Cotações:** API Finnhub (`https://finnhub.io`) — requer chave gratuita,
  **a mover para o backend**.
- Sem imagens rasterizadas no design.

## Ficheiros (em `design_app/`)

| Ficheiro | Conteúdo |
|---|---|
| `index.html` | Shell da SPA: navbar, router por hash, painel de Tweaks, toasts, protocolo do host. |
| `styles.css` | **Todos os design tokens** e estilos dos componentes. |
| `engine.js` | Motor de amortização do empréstimo (puro, reutilizável). |
| `state.js` | Modelo de dados, persistência localStorage, export/import, helpers de data/formatação. **Base do esquema da BD.** |
| `page-loan.js` | Página Empréstimo (tracking, simulação, tabela). |
| `page-portfolio.js` | Página Investimentos (carteira, reforços, projeção, watchlist + Finnhub). |
| `page-misc.js` | Visão geral + Configurações. |

---

## Como usar o Claude Code (passo a passo)

1. **Descarrega** o ZIP deste handoff (botão de download no chat) e descomprime.
2. Instala o **Claude Code** e abre um terminal na pasta onde queres o projeto
   (ou num codebase já existente).
3. Coloca a pasta `design_app/` e este `README.md` dentro do projeto (ou ao lado).
4. Arranca o Claude Code e dá-lhe um *prompt* inicial, por exemplo:

   > "Lê o `README.md` e a pasta `design_app/`. É o design de referência de uma
   > app de tracking financeiro. Quero recriá-la em **React + Vite + TypeScript**
   > com um backend **Express + Prisma + PostgreSQL**. Começa por: (1) andaime do
   > projeto, (2) esquema Prisma a partir da secção *Modelo de dados*, (3)
   > autenticação email/password com sessão (sign in/up/out + guarda de rotas),
   > (4) endpoints REST da secção *API REST*, (5) portar a UI da Visão geral.
   > Reutiliza `engine.js` e a lógica de projeção tal como estão. Não avances
   > para a próxima fase sem eu confirmar."

5. Trabalha **por fases** e confirma cada uma (auth → BD → empréstimo →
   investimentos → cotações).
6. **Segredos:** mete `FINNHUB_API_KEY` e a ligação à BD num `.env` (nunca no
   cliente).

> Dica: o Claude Code é melhor a partir de **código** do que de imagens. Este
> bundle é tudo código — aponta-o aos ficheiros em `design_app/` sempre que
> quiseres recriar um ecrã fielmente.
