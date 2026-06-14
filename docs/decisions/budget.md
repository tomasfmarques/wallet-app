# Decisions — Budget / Saldo (incomes, expenses, imports, bank connect)

_Source: split from CAVEATS-full.md._

## Phase 7A — Budget module

### Decisions

- **Two DB tables: `Income` and `Expense` (with `type` discriminator).**
  `Expense.type` is a string `'fixed' | 'variable'` (SQLite has no enum
  support, same as the `LoanAmortizationMode` solution). Both tables are
  scoped per-user with `onDelete: Cascade`.

- **`amount` is monthly EUR for both incomes and expenses**. Annual figures
  are derived (× 12). For irregular incomes/expenses (e.g. annual bonus),
  divide by 12 yourself before entering — or extend the schema later with a
  `frequency` field.

- **`active` is a soft toggle**, not a delete. KPIs only sum active rows.
  Useful for pausing a subscription temporarily, ending a job, etc. Inactive
  rows still show in the list but greyed out.

- **`startYm` and `endYm` are stored but not yet used in KPIs**. They're
  available for future month-by-month views (e.g. "what was my budget in
  2025-03?"). Current KPIs are "as of now".

- **5 KPIs in the strip**: Receitas, Despesas fixas, Despesas variáveis,
  **Saldo livre** (income − fixed), **Saldo final** (income − all). The
  saldo final card colours green/red based on sign and shows annualized
  value in the meta line.

- **Confirmation via native `confirm()` dialog** for delete. Same pattern as
  the asset table; could be a custom modal later for consistency.

- **Categories are free-text**, not a fixed list. Suggestions appear as
  placeholder text ("Habitação, Subscrições…" for fixed, "Alimentação,
  Lazer…" for variable). A future Phase 7B could derive distinct categories
  for a breakdown chart.

### ~~Deferred (Phase 7B)~~ — partially done in Phase 7B.

---

## Phase 7B — Budget analytics

### Decisions

- **Two sub-tabs** on `/budget`: **Tabelas** (the existing CRUD view) and
  **Análise** (charts). The KPI strip stays visible above the tabs so the
  totals are always one glance away.

- **Three CategoryDonuts** in the Análise tab: one for fixed, one for
  variable, one for incomes. Each groups rows by category (free-text;
  blanks become "Sem categoria"), sorts by amount descending, and shows
  percentages in both the legend and the tooltip. Inactive rows are excluded
  — they don't count toward the active budget.

- **BudgetTimeline = 12-month stacked-bar chart** with positive income bars,
  negative expense bars (split by fixed/variable colour), and an overlaid
  blue **net line**. Default window is the trailing 12 months ending in the
  current month.

- **Timeline honours `startYm` and `endYm`** so historical months reflect
  what was active back then. A salary that started 7 months ago doesn't
  contribute to months before it; an expired subscription stops contributing
  after `endYm`. Rows without start/end dates are treated as "always on" —
  acceptable default for typical recurring items.

- **Average net per month over the window** is shown as a strong figure in
  the chart card header. Coloured green/red based on sign.

- **Donut grid is responsive** — `repeat(auto-fit, minmax(320px, 1fr))`.
  Each donut keeps its own legend and total label.

- **Chart.js scales** are now registered globally in `lib/chartSetup.ts`:
  added `BarElement` (timeline) and `ArcElement` (donuts) on top of the
  existing line/category/linear/point + filler.

### Behavioural caveats

- **All amounts are monthly** — the timeline doesn't model irregular
  cadences (annual bonuses, weekly groceries). The simplification is fine
  for budgeting but won't precisely reflect actual cash-flow timing.

- **Timeline math runs on the frontend**, not the server. For tens of
  thousands of rows this would slow down; for typical personal-use volumes
  (≤100 rows) it's instant.

- **Categories are case-sensitive** in the donut. "Comida" and "comida"
  show as two slices. Could be normalized in a future polish round.

- **Inactive rows still show** in the table (greyed out) but are excluded
  from KPIs, donuts, AND timeline calculations. That's the consistent rule:
  inactive = doesn't count.

### Still deferred (Phase 7C)

- ~~**CSV import from bank statements**~~ — done in Phase 7C (CSV **and** OFX).
- **Actual vs. budget overlays** on the timeline — bands showing variance.
- **Non-monthly cadences** (annual, weekly, biweekly) for incomes/expenses.

### Post-7B tweak — categories restored with dictionary auto-suggest

Brought categories back, but smarter:

- **`frontend/src/lib/categoryDictionary.ts`** — Portuguese keyword → category
  map (~160 entries) covering utilities (Água/Luz/EDP → Serviços), groceries
  (Continente/Lidl/Pingo Doce → Alimentação), subscriptions (Netflix/Spotify
  → Subscrições), restaurants, transports, and more. Matching is
  **case-insensitive** and **accent-stripped** so "agua" matches "água".

- **`inferCategory(name)`** function returns the category for the first
  matching keyword. Keywords are pre-sorted by length descending so
  longer phrases ("uber eats" → Restauração) win over shorter ones
  ("uber" → Transportes).

- **Auto-suggest in `IncomeModal` / `ExpenseModal`**: as the user types the
  name, the category select is auto-populated with the inferred value and
  a ✨ **"sugerida"** pill appears next to the label. The moment the user
  manually picks anything (including blank), a `useRef` flag locks the
  field so subsequent name changes don't override their choice. Editing
  an existing row preserves the saved category.

- **Standard category lists** (`INCOME_CATEGORIES`, `EXPENSE_CATEGORIES`)
  drive the `<select>` options. The dropdown also offers the blank
  "— por classificar —" option so users can deliberately leave it
  uncategorized.

- **`UncategorizedBanner` (e-Fatura-style)**: appears at the top of
  `/budget` when any active items have no category. Click "Classificar
  agora →" → modal lists every uncategorized item with an inline `<select>`
  pre-populated with the dictionary's best guess. "Guardar tudo" fires
  parallel `useUpdateIncome` / `useUpdateExpense` mutations for everything
  the user filled in. Yellow → amber gradient + 📌 icon to match
  Portugal's actual e-Fatura visual cue.

- **`CategoryDonut`** is back to grouping by `category`. Items without
  one are bucketed as "Por classificar" so the donut never silently drops
  data.

- **`budget-pill-uncat`** = small yellow pill shown in budget row sub-text
  when category is missing, so even users who dismiss the banner see at a
  glance which rows still need attention.

### Behavioural caveats (dictionary)

- **Dictionary is hardcoded** — no backend, no admin UI. Adding a new keyword
  means editing `categoryDictionary.ts` and redeploying. For a personal
  app this is fine; if you ever ship this commercially, move it to the DB
  and add an admin page.

- **First-match-wins, not best-match-wins**. After length-sorting, the
  loop returns the first hit. So "Uber Pro" matches `uber pro`-prefixed
  keywords if any exist, otherwise falls back to `uber` → Transportes.

- **Inference runs on every keystroke** (within React's debounced
  rendering). For typical name lengths this is fine, but the loop is O(N)
  over ~160 entries per keystroke. If the dictionary ever grows to
  thousands, switch to a trie or Aho-Corasick.

- **Auto-suggestions don't persist** by default — they only fill the form
  field. The user must save the entry for the category to land in the DB.
  This is intentional: typing the name shouldn't write to the server.

---

## Phase 7C — Bank statement import (CSV / OFX)

> **This is "Option B".** The user's real goal is a live read of their bank
> account. The direct route — **"Option A" (GoCardless / Nordigen Bank Account
> Data API, free PSD2 tier, ~2500 EU banks incl. all major PT ones)** — remains
> the recommended end state and is **still TODO**. Option B (manual statement
> upload) is the no-API-keys fallback we built first. When Option A lands, it
> should feed the *same* `POST /api/budget/import` pipeline, just sourced from
> the API instead of a file. **Keep reminding the user about Option A.**

### What was built

- **`POST /api/budget/import`** (in `backend/src/routes/budget.ts`) — accepts
  `{ items: ImportItem[] }`, each item `{ kind: 'income'|'expense', name,
  amount, category?, type?, dayOfMonth?, startYm?, endYm?, notes? }`. Validates
  with the existing budget helpers, **skips invalid rows** (not fatal) and
  reports `summary: { incomes, expenses, skipped }`. Inserts via
  `createMany` inside a `$transaction`. Caps at 2000 rows/request.

- **`frontend/src/lib/statementParser.ts`** — pure, dependency-free parser.
  - **CSV**: auto-detects delimiter (`;` / tab / `,`), parses quoted fields,
    finds the header row by keyword, maps date/description/amount columns
    (handles separate Débito/Crédito columns → signed amount).
  - **OFX**: extracts `<STMTTRN>` blocks, reads `TRNAMT` / `DTPOSTED` /
    `NAME` + `MEMO`.
  - **Number parsing** handles European `1.234,56`, US `1234.56`, `(45,00)`
    parentheses-negatives, currency suffixes, NBSP thousands.
  - **Date parsing** handles `DD-MM-YYYY` (PT default), `YYYY-MM-DD`,
    `DD/MM/YY`, OFX `YYYYMMDD`.

- **`frontend/src/components/budget/ImportStatementModal.tsx`** — file picker
  → review table. Each row: include checkbox, editable name, kind toggle
  (Receita/Despesa, defaulted by amount sign), category select
  (auto-inferred via `inferCategory`), signed amount. "Importar N" posts the
  selected rows. File is read **client-side** (FileReader) — nothing leaves
  the browser until the user confirms.

- **`useImportBudget()`** hook + **"Importar extrato"** button in the Saldo
  page header.

### Decisions

- **Each statement line → its own income/expense row, scoped to one month.**
  We set `startYm = endYm = the transaction's month` so the timeline treats it
  as a one-off (it won't recur forever). Imported expenses default to
  `type: 'variable'` (actual spend).

- **Auto-classification by sign**: positive amount = income (credit),
  negative = expense (debit). The user can flip any row in the review table.

- **Category auto-inference reuses the existing dictionary** — Continente →
  Alimentação, Netflix → Subscrições, Uber Eats → Restauração, Salário →
  Salário, etc. Works well on real PT statement descriptions.

### Behavioural caveats

- **Planned-vs-actuals tension (important).** The budget model holds *monthly
  recurring* amounts; statement lines are *one-off actuals*. Importing a
  month of transactions inflates that month's KPI totals because `summarize()`
  sums all active rows regardless of month. For now imported lines are
  month-scoped so the *timeline* stays correct, but the top KPI strip mixes
  planned + actual. The clean fix is a separate `Transaction`/actuals table
  with an "actual vs. budget" overlay — flagged as the natural follow-up
  (and the right home for Option A's API-sourced data too).

- **Duplicate detection (done).** Each imported line is fingerprinted as
  `kind | ym | day | amount(2dp) | normalized-name` (`dupSignature`, kept
  identical in `frontend/src/lib/statementParser.ts` and
  `backend/src/routes/budget.ts`). On import the backend loads the user's
  existing **month-scoped** rows (startYm === endYm — i.e. prior imports,
  never genuine recurring items), builds a signature set, and skips matches,
  reporting a `duplicates` count. It also dedupes within the same batch. The
  modal pre-flags likely dupes using the cached budget data and unticks them
  by default, so re-importing the same statement is a safe no-op. Name
  matching is accent- and whitespace-insensitive.

  - **`dayOfMonth` added to the `Income` model** (it already existed on
    `Expense`) so the day survives in the DB and cross-import dedup stays
    day-accurate for income too. Schema change applied to both
    `schema.prisma` and `schema.prod.prisma`; dev DB updated via `prisma db
    push`. **Prod note:** `deploy:prep` runs `db push` on deploy, so the
    Postgres `incomes.day_of_month` column is added automatically — no manual
    migration needed.
  - **Residual limitation:** two identical transactions on the *same day*
    with the same amount and description still collapse to one signature
    (genuinely indistinguishable from a re-import). Acceptable for budgeting.

- **Encoding is read as UTF-8.** Some PT banks export CSV as
  Windows-1252/Latin-1, which can garble accented characters. The text is
  editable in the review table, but a future polish could detect/convert
  encodings (or let the user pick).

- **Long descriptions are truncated to 80 chars** (the `name` column limit).
  Nothing is stored in `notes` currently — could preserve the full original
  there later.

- **CSV format variety.** The parser targets the common PT layouts (CGD, BCP,
  Novo Banco, Millennium, ActivoBank). An unusual export with no recognizable
  header falls back to a positional guess (first col = date, last = amount);
  the user fixes anything wrong in the review table before importing.

### Still TODO (the real goal)

- **Option A — GoCardless Bank Account Data API.** Direct, live, no manual
  export. Free PSD2 tier. Flow: user picks bank → OAuth → store
  `requisition_id` per user → backend pulls `/transactions` → feed the same
  import pipeline. PSD2 consent expires every 90 days (re-auth needed).
  **This is the thing the user actually wants — keep surfacing it.**
- ~~**Duplicate detection** on re-import.~~ — done (see caveat above).
- **Actual-vs-budget overlay** so imported actuals don't distort planned KPIs.

---

## Phase 7D — Saldo: 4 buckets + "Por classificar"

Restructured the Saldo (budget) page into four tables — **Receitas fixas /
variáveis** and **Despesas fixas / variáveis** — plus an e-Fatura-style
**"Por classificar"** holding box for imported lines.

### Decisions

- **`type` added to `Income`** (`'fixed' | 'variable'`, default `'fixed'`).
  Income now shares the same fixed/variable axis as `Expense`. The default
  means existing income rows (salary etc.) backfill to **fixed** on migration
  — verified against the dev DB, nothing landed in "Por classificar".

- **`pending` boolean added to both `Income` and `Expense`** (default
  `false`). `pending = true` means an imported line that hasn't been assigned
  fixed/variable yet. It shows **only** in the "Por classificar" box, and is
  excluded from KPIs, the timeline, the donuts, and the four tables.

- **Imports now land as `pending: true`** (was: expense defaulted to
  `variable`). The income/expense split still comes from the +/− sign at
  import; the fixed/variable split is deferred to the holding box. The stored
  `type` on a pending row is a provisional placeholder, overwritten on
  classify.

- **Classify = one PATCH.** Tapping **Fixa**/**Variável** in the box calls the
  existing income/expense update with `{ type, pending: false }`; the budget
  query invalidates and the row moves to the matching table automatically. No
  new endpoint.

- **Backend GET returns pending items separately** (`pendingIncomes`,
  `pendingExpenses`) from the classified `incomes`/`expenses`. This keeps the
  blast radius tiny: `summarize()` and every chart/KPI component still receive
  only classified items, so none of them needed changes.

- **Two "classify" concepts coexist, by design.** The amber
  `UncategorizedBanner` triages the free-text *spending category* (Habitação,
  Alimentação…); the new blue "Por classificar" box triages the
  *fixed/variable* axis. They're orthogonal. Imported lines usually arrive
  with an auto-inferred category, so most won't trigger the amber banner.

### Behavioural caveats

- **Pending items don't affect any total until classified.** Intentional
  (mirrors e-Fatura "waiting"), and it nudges the user to classify, but a big
  import won't move the Saldo final until the box is cleared.

- **Manual adds are never pending.** Adding via "+ Adicionar fixa/variável"
  on any of the four tables sets the bucket immediately. Only the importer
  produces pending rows.

- **Re-import dedup spans pending too.** The duplicate guard (backend) queries
  all rows regardless of `pending`, and the import modal now pre-flags against
  both classified and pending items, so re-importing before classifying is
  still a safe no-op.

---

## Phase 7E — PDF statement import (positional column parsing)

Added PDF support to the statement importer. The hard part is distinguishing
the **transaction amount** (Montante / Débito-Crédito) from the **running
balance** (Saldo) — they're identical as numbers. Solved positionally.

### Decisions

- **`pdfjs-dist` for text-with-coordinates.** `frontend/src/lib/
  pdfStatementParser.ts` reads every text fragment's `(x, y)`, clusters them
  into rows by `y` (4px tolerance, which also re-joins a description and its
  amounts when the bank splits them across a pixel), then detects the column
  headers and reads the amount from the column under **Montante** (or
  **Débito**/**Crédito**), **explicitly skipping the Saldo column** by x-distance.

- **Two layouts handled from the header:** CTT-style single signed *Montante*
  column, and BCP/Millennium-style *Débito*/*Crédito* pair (amount = crédito −
  débito). Verified against two real statements (CTT: 88 txns, BCP: 4 txns) —
  all picked the transaction amount, never the balance.

- **Row gating kills page-furniture false positives.** Only rows *below* the
  column header and *above* a `SALDO FINAL/DISPONÍVEL/CONTABILÍSTICO` footer
  count, plus an amount sanity cap (|amount| ≤ 1,000,000) rejects stray figures
  like the account number in a page header.

- **Lazy-loaded + code-split.** pdf.js (~1.4 MB worker + ~110 KB gzip) is
  reached only via `await import('@/lib/pdfStatementParser')` when the user
  actually picks a `.pdf`. The main bundle is unchanged; CSV/OFX users never
  download it. Parsing stays **client-side** — the PDF never leaves the browser.

- **Date resolution.** Full `DD-MM-YYYY` dates (CTT) parse directly. Short
  `M.DD`/`DD.MM` tokens (BCP) lack a year and are month/day-ambiguous, so they
  resolve against the statement's year+month pulled from its period header.

### Behavioural caveats

- **Heuristic, not exact.** Column detection relies on header keywords
  (`Montante`, `Débito`, `Crédito`, `Saldo`) and x-proximity. A bank whose PDF
  uses different labels or a wildly different layout may parse partially — the
  user reviews every row in the import table before confirming, and can fix
  amounts/descriptions there.

- **Wrapped multi-amount rows** (e.g. a foreign-currency line that splits the
  charge across two physical lines) can occasionally mis-attribute one of the
  amounts. Rare; visible and editable in review.

- **Scanned/image PDFs won't work** — there's no OCR. Only PDFs with a real
  text layer (all bank-generated statements) are supported.

- **No new DB fields**, so export/import backup is unaffected by this phase.

---

## Phase 7F — Bank connect (Option A scaffold) + merchant-grouped movements

### Bank connect (GoCardless Bank Account Data, PSD2)

- **Full backend flow built** in `backend/src/routes/bank.ts`: `/status`,
  `/institutions` (full PT list, 24h cache), `/connect` (creates requisition →
  returns the bank's consent link), `/sync` (pulls booked transactions for all
  linked accounts → **same import pipeline** as statement uploads: dedup +
  learned rules + "Por classificar", `source` = bank name), `DELETE
  /connections/:id`. New `BankConnection` model (in export/import backup).
- **Gated on env vars** `GOCARDLESS_SECRET_ID` + `GOCARDLESS_SECRET_KEY`
  (free account at bankaccountdata.gocardless.com → User secrets). Until set
  on Render, `/status` returns `configured:false` and the modal shows the
  featured banks (CTT, Millennium BCP, Montepio — Clearbit logos) as
  "brevemente". **Once the user creates the GoCardless account and sets the
  two env vars, everything goes live with no code change.**
- **"Ligar banco" modal** explains why it's secure (PSD2/regulated provider,
  auth happens on the bank's own site, read-only, 90-day revocable consent).
  When configured: featured banks first + search across all PT institutions
  (logos from GoCardless). After consent the user returns and hits
  "⟳ Sincronizar transações".
- Redirect URL is derived from the request origin → works on wallet360.pt and
  on the onrender.com host alike.

### Merchant-grouped movements (Saldo)

- The per-month variable list is now **grouped by merchant** (Excel-pivot
  style): one row per comerciante with count badge + signed total, sorted by
  movement size; expanding shows each transaction with **date (dia X), source
  bank badge, category, value**, per-transaction checkbox + edit. Group
  checkbox selects all (indeterminate state supported). Income+expense live in
  one combined list now — much more compact than the old two columns.
- New `source String?` on Income/Expense (in export/import). The statement
  importer infers it from the file name (CTT/BCP/Montepio → bank name, else
  "Extrato"); bank sync sets the institution name; manual adds stay null and
  display as "Manual".
- Grouping reuses the same merchant-key normalization as learned rules
  (`frontend/src/lib/merchant.ts` — keep in sync with backend).

---

## 2026-06-14 — FX1: planned vs actuals (no schema change)

- **What:** the recurring **plan** and the imported **actuals** are now two lanes
  sharing the same `Income`/`Expense` tables. Discriminator = the existing `source`
  field: `!!source` ⇒ imported actual; `null` ⇒ recurring plan.
- **Why:** they were being summed (month view double-counted salary+import; the
  headline KPI counted every imported month as if recurring). A separate
  `Transaction` table would have been cleaner but meant the two-schema trap + a
  migration; deriving from `source` got the same result with zero schema risk.
- **How it shows:** `GET /api/budget` returns `incomes/expenses` (plan) +
  `actualIncomes/actualExpenses` (source set); `summarize()` KPIs are plan-only;
  `MonthAnalysis` renders planeado vs real. **"Movimentos do mês" (`VariableMonths`)
  shows the month's REAL movements** (actuals + manual), editable — so each view has
  a deliberate lane: headline KPIs + Análise = plan/planeado-vs-real; Movimentos =
  real. (An earlier cut accidentally hid actuals from Movimentos — fixed `82357ac`.)
- **Still open:** plan line and its imported actual are NOT linked (mismatched
  names like "Salário" vs "ORDENADO ACME"), so the same item can look duplicated —
  see "plan ↔ actual matching" in STATE.
- **How to change:** if you add a real transactions table later, retire the
  `source`-derived split and update `summarize` + the GET split + `MonthAnalysis`.

## 2026-06-14 — Statement import is Windows-1252, not UTF-8

- **What:** `ImportStatementModal` reads the file as an ArrayBuffer, decodes UTF-8,
  and **falls back to windows-1252** when the result contains `�`.
- **Why:** PT bank CSV/OFX exports are usually Latin-1; reading them as UTF-8 turned
  "SOLUÇÃO" into "SOLU��O". The `�` are unrecoverable once stored, so
  `POST /api/budget/cleanup-encoding` + a Saldo banner delete those rows for re-import.
- **How to change:** don't revert to `readAsText(file, 'utf-8')`. If a bank ships
  true UTF-8, the fallback simply never triggers.

