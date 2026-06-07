# 💸 WALLET — Caveats, decisions, and deferred work

Living record of every decision I made without explicit confirmation, every
shortcut I took, and every item I deferred for a later phase. Update this file
whenever a new caveat is introduced. Each entry has:

- **What** — the decision or shortcut
- **Why** — the reason I made it
- **How to change** — what to do if you want a different approach

---

## Phase 0 — Project setup

### Decisions

- **Workspaces layout, not monorepo tooling**
  - **What**: root `package.json` declares `frontend` + `backend` as npm
    workspaces; root scripts use `concurrently` to run both.
  - **Why**: lightest possible setup, no Turborepo/Nx config to maintain.
  - **How to change**: if you want shared types / caching / parallel builds at
    scale, layer in Turborepo. The current scripts won't conflict.

### Stack

- **Node 24 (not LTS 22)**
  - **What**: `winget install OpenJS.NodeJS.LTS` actually installed v24.16.0.
  - **Why**: that's what winget served when run.
  - **How to change**: `winget uninstall OpenJS.NodeJS.LTS` then install LTS
    via fnm or the official v22 MSI. No code change needed; all deps work on
    22 and 24.

- **SQLite for dev, Postgres-shaped schema**
  - **What**: Prisma datasource is `sqlite` in dev; the file lives at
    `backend/prisma/dev.db`. The schema is portable.
  - **Why**: zero setup, no service to manage, no admin install.
  - **How to change**: in `backend/prisma/schema.prisma` swap `provider =
    "sqlite"` for `"postgresql"`, change `DATABASE_URL` in `backend/.env`, run
    `npm run db:migrate -w backend -- --name init`. The `LoanAmortization.modo`
    field will stay a `String` — converting it back to a real Prisma enum is
    optional (see next entry).

- **`LoanAmortizationMode` enum → `String` column**
  - **What**: the design uses an enum `prazo | prestacao`. SQLite + Prisma 5
    doesn't support enums, so I stored it as `String` and validate at the app
    layer.
  - **Why**: needed to make migrations run on SQLite.
  - **How to change**: when (if) you switch to Postgres, you can re-introduce
    `enum LoanAmortizationMode { prazo prestacao }` in the schema and change
    the field type back. The frontend type `'prazo' | 'prestacao'` already
    matches both representations.

---

## Phase 1 — Authentication

### Decisions

- **Inline validation, no schema library**
  - **What**: `routes/auth.ts` validates fields with hand-written helpers.
  - **Why**: zero extra deps, easy to read.
  - **How to change**: drop in `zod` and replace the helpers with parsed
    schemas. The error shape `{ errors: { field: msg } }` already matches what
    the frontend `fieldErrorsFrom` helper expects.

- **MemoryStore sessions**
  - **What**: `express-session` uses the default in-process MemoryStore.
  - **Why**: works out-of-the-box for dev.
  - **How to change**: `connect-pg-simple` is already in `backend/package.json`.
    Wire it up in `backend/src/index.ts` once Postgres is available — pass
    `store: new PgSimpleStore({ conObject: { connectionString:
    process.env.DATABASE_URL } })` to `session()`.

- **CORS locked to `localhost:5173` in dev, `false` in prod**
  - **What**: `backend/src/index.ts` allows credentialed requests from the Vite
    dev server only.
  - **Why**: tight default until a real frontend URL exists.
  - **How to change**: when deploying, change the `origin` value to your
    frontend's URL (e.g. `https://wallet.example.com`). If frontend + backend
    share an origin you can drop CORS entirely.

- **Session cookie is `connect.sid` (default name)**
  - **What**: logout explicitly clears `connect.sid`.
  - **Why**: matches `express-session`'s default.
  - **How to change**: if you customize `session({ name: 'wallet.sid' })`,
    update the `res.clearCookie(...)` call in the logout route too.

### Behavioural caveats

- **Same-error for wrong email vs wrong password**: login returns the same
  401 + message regardless of which is wrong. Intentional, mild leak-prevention.

---

## Phase 2A — Loan core

### Decisions

- **Engine lives on the backend only**
  - **What**: `backend/src/lib/loanEngine.ts` is the single source of truth for
    amortization math. The frontend never recomputes; it hits the API.
  - **Why**: avoid drift between two implementations.
  - **How to change**: if you ever need pure-frontend simulation (e.g. for an
    offline mode), copy the file to `frontend/src/lib/loanEngine.ts`. The
    module has no Node-specific imports.

- **Rate units: fraction in DB, percent in UI**
  - **What**: TAN, spread, Euribor are stored as fractions (e.g. `0.022`) but
    entered/displayed as percent (`2.2`).
  - **Why**: matches financial convention, easier UX.
  - **How to change**: conversion happens at form submit
    (`LoanSetupForm.tsx`) and on edit-prefill. If you change one place, mirror
    the other.

- **`computeKpis` uses UTC "today"**
  - **What**: the "current month" anchor for KPIs comes from `new Date()`
    in UTC.
  - **Why**: avoids timezone drift between server and client.
  - **How to change**: pass a `referenceYm` to `computeKpis()` if you want a
    fixed reference month (e.g. for testing).

### Behavioural caveats

- **Last installment rounding**: when the schedule is about to pay off, the
  last installment is clamped so principal doesn't go negative. The `prestacao`
  on that last row may be slightly smaller than the steady-state PMT.

- **Extra amortizations applied after the regular installment**: interest for
  the month is computed on the pre-payment capital. Matches most real bank
  behaviour but verify against your contract if it matters.

---

## Phase 2B — Loan UI

### Decisions

- **Dropped `MonthlyTracking.tsx` from the Loan page**
  - **What**: the flat tracking list from Phase 2A was replaced by
    `YearAccordion.tsx`. The old file still exists in the repo, no longer
    imported anywhere.
  - **Why**: kept it as a reference; harmless dead code.
  - **How to change**: delete `frontend/src/components/loan/MonthlyTracking.tsx`
    whenever you're done with it.

- **Capital chart samples every 6 months**
  - **What**: `CapitalChart.tsx` plots every 6th month + the final point.
  - **Why**: 480-row schedules choke Chart.js with all points enabled.
  - **How to change**: pass `sampleEvery={1}` for full resolution, or `12` for
    yearly. The last point is always included.

- **Simulator schedules amortizations only in January each year**
  - **What**: `POST /api/loan/simulate` places `annualAmount` at `YYYY-01` for
    each year from `startYear` onward, mode `prazo`.
  - **Why**: simplest model matching the README's "annual amortization" slider.
  - **How to change**: extend the endpoint body with a `month` field (1-12)
    and use that in `simAmortizations.push({ ym: \`${y}-${month}\`, ... })`.

- **Dark navy navbar**
  - **What**: `#0B1120` background matching the design screenshot. Section
    title + subtitle visible only on ≥900px screens.
  - **Why**: high-fidelity match to the design reference.
  - **How to change**: edit `.navbar` and related selectors in
    `frontend/src/index.css`.

### Behavioural caveats

- **Simulate compares base = current loan vs sim = with overrides**: the base
  uses `loan.euribor` (your persisted value), so if you change Euribor in
  Configurações it will change the baseline. The simulator's "savings" KPI
  therefore mixes rate-delta savings with amortization savings — that's
  intentional (it's what really matters to your wallet) but worth knowing.

- **`POST /api/loan/euribor` updates both history and the loan**: posting a
  new Euribor entry also overwrites `loan.euribor` (the current value used by
  the engine). If you want history-only with no engine effect, add a `dryRun`
  flag to the endpoint.

---

## Phase 3 — Investments

### Decisions

- **Default expected return is 7 % annual**
  - **What**: `AssetModal.tsx` prefills `expectedReturn` at 7% for new assets.
    The backend also defaults to 0.07 if not sent.
  - **Why**: a reasonable long-run global-equities benchmark.
  - **How to change**: edit the default in `AssetModal.tsx` (`useState('7')`)
    and/or `POST /api/portfolio/assets` (`req.body?.expectedReturn ?? 0.07`).

- **Default projection settings: gInc=3%, gFY=2, gH=20**
  - **What**: when a user first opens `/investments` (or `/overview` with
    investments), `ensureSettings()` creates a `PortfolioSettings` row with
    these defaults.
  - **Why**: matches the prototype's `DEFAULT_STATE`.
  - **How to change**: edit `ensureSettings()` in `backend/src/routes/portfolio.ts`.

- **Reforçar without `price` keeps qty unchanged**
  - **What**: if no price-per-unit is provided, `value += amount` and
    `qty` stays the same. With a price, qty grows by `amount/price` and value
    is re-derived as `qty * price`.
  - **Why**: simpler UX for the "I added cash" case; price is optional.
  - **How to change**: if you'd prefer the no-price path to also update qty
    using the current implied price (`value / qty`), edit the route handler in
    `backend/src/routes/portfolio.ts`.

- **Projection updates persist on every slider release (debounced 350ms)**
  - **What**: `ProjectionPanel.tsx` writes `gInc / gFY / gH` to the server
    after a debounce. The local state is the source of truth while dragging.
  - **Why**: live updates feel responsive without spamming the API.
  - **How to change**: lengthen the debounce (line `setTimeout(..., 350)`), or
    add an explicit "Guardar" button if you'd rather not auto-persist.

- **Allocation bar uses a fixed 7-colour palette**
  - **What**: `AssetTable.tsx` cycles through `ALLOC_COLOURS` (blue, teal,
    purple, orange, amber, green, red) by index.
  - **Why**: deterministic colours per position, matches the design's accent
    palette.
  - **How to change**: edit `ALLOC_COLOURS` in `AssetTable.tsx`. For >7 assets
    colours repeat — fine in practice for personal use.

- **Delete confirmation via native `confirm()` dialog**
  - **What**: clicking "Remover" on an asset row uses `window.confirm(...)`.
  - **Why**: zero-effort confirmation. Native dialog is OS-themed.
  - **How to change**: build a custom confirmation modal (reuse
    `components/ui/Modal.tsx`).

### Behavioural caveats

- **Projection's "totalContributed" is over the horizon, not over the loan**:
  it includes the full `gH` years of monthly contributions even though the
  user might pay off the mortgage halfway through. The two engines don't
  cross-talk yet.

- **Compound math uses end-of-month contribution timing**: `value = value *
  (1 + r/12) + contribution`. If you want contributions at month start, swap
  the operations: `value = (value + contribution) * (1 + r/12)`. The
  difference is small over long horizons but exists.

### Deferred (Phase 3B)

- ~~**Watchlist "Em alta · Nasdaq" with Finnhub proxy**~~ — done in Phase 3B.
- **Milestone table** at the end of the projection (e.g. "valor após 10 anos",
  "valor após 20 anos") — currently only the chart and 3 summary KPIs.
- **Asset flows history view**: the DB records every reforço in `portfolio_flows`,
  but there's no UI to browse them per asset.

---

## Phase 3B — Watchlist + live quotes

### Decisions

- **Hardcoded watchlist of 8 Nasdaq tickers**
  - **What**: `frontend/src/hooks/useQuotes.ts` exports a `WATCHLIST` constant
    with NVDA, AAPL, MSFT, GOOGL, AMZN, META, TSLA, AMD.
  - **Why**: matches the design's "Em alta · Nasdaq" section without needing
    a settings UI on day one.
  - **How to change**: edit the `WATCHLIST` array, or make it a per-user
    field on `PortfolioSettings` and expose a UI in Configurações.

- **In-memory cache, 60s TTL per symbol**
  - **What**: `backend/src/lib/quotesCache.ts` keeps a `Map<symbol, {data,
    expiry}>` in module scope. Frontend `useQuotes` mirrors that TTL via
    `staleTime` + `refetchInterval`.
  - **Why**: Finnhub free tier is 60 calls/min — caching keeps us nowhere
    near that limit no matter how often pages reload.
  - **How to change**: edit `TTL_MS` in `quotesCache.ts`. For multi-process
    hosting (PM2 cluster, multiple containers) swap the Map for Redis — each
    process currently has its own cache.

- **Per-symbol error isolation**
  - **What**: `GET /api/quotes` returns one entry per requested symbol; a
    failed fetch becomes `{ symbol, ..., error: 'Fetch failed' }` instead of
    crashing the whole response.
  - **Why**: one bad ticker shouldn't blank the whole watchlist.
  - **How to change**: if you'd rather fail loudly, replace the `try/catch`
    in `routes/quotes.ts` with a single `Promise.all` that doesn't catch.

- **Watchlist prices shown in USD with EUR formatting**
  - **What**: Finnhub returns USD prices; the UI formats them with the EUR
    symbol because the rest of the app is in EUR.
  - **Why**: simplest path; the modal hint says "USD" so it's not silently
    wrong, but the trend card itself shows "€". Honest cosmetic issue.
  - **How to change**: either add a real USD→EUR conversion (would need
    another API like exchangerate.host) or format the trend cards with `$`
    by adding a `usd` formatter to `format.ts`.

- **Quick-add modal auto-fills invested + value from qty × price**
  - **What**: clicking "+ Adicionar" on a trend card opens the AssetModal
    with ticker/name prefilled; typing a qty auto-fills the empty
    invested/value fields (qty × Finnhub price). The user can override.
  - **Why**: removes 80% of the typing for the common case.
  - **How to change**: remove the `useEffect` that watches `qty` in
    `AssetModal.tsx`.

- **Max 20 symbols per `/api/quotes` request**
  - **What**: requesting more is silently truncated.
  - **Why**: hard upper bound to keep one request from chewing through the
    Finnhub minute quota.
  - **How to change**: edit `MAX_SYMBOLS` in `routes/quotes.ts`.

### Behavioural caveats

- **First load may show "sem dados" for ~1 second**: the watchlist fires
  the API call on mount; before it resolves, cards render skeleton state.
  Subsequent loads are instant (react-query cache + backend cache).

- **Backend restart clears the in-memory cache**: not a correctness issue,
  but the first request after a `ts-node-dev` restart will be slower because
  it has to hit Finnhub for all 8 tickers in parallel.

- **No retry on Finnhub 5xx**: a single failed fetch results in
  `error: 'Fetch failed'` for that symbol until the 60s react-query refetch
  fires. If you want eager retries, wrap `fetchQuote` in a small retry
  helper or bump react-query's `retry` from 1 to 3.

---

## Phase 3C — Historical-return hint

### Decisions

- **Backend exposes `GET /api/quotes/metric?symbol=X`** that proxies
  Finnhub's `/stock/metric?metric=all`. Cache TTL = 1 hour per symbol
  (in-memory `Map` in `backend/src/lib/quotesCache.ts`).

- **AssetModal shows a clickable hint** with the best available historical
  return (10y → 5y → 3y → 1y) below the "Retorno esperado anual" field. Click
  it and the input gets filled. We deliberately do NOT auto-fill — the user
  decides.

### Behavioural caveats

- **Multi-year returns may be `null`**. Finnhub's free tier reliably returns
  `52WeekPriceReturnDaily` (1-year). 3y/5y/10y often come back null —
  premium-gated for many symbols. If everything is null, the modal falls back
  to the generic hint "Sugestão: 7-10%".

- **1-year return ≠ expected long-term return**. The 1-year window is
  volatile; one bad year can show a negative value for a long-term-positive
  stock. Treat the hint as "recent performance", not "future expectation".

- **Metric is fetched while the user is typing the ticker**. Each unique
  ticker hits Finnhub at most once per hour (cache). React-query also caches,
  so repeated keystrokes don't fire new requests.

---

## Phase 4A — Settings (account, Euribor, export)

### Decisions

- **Email is read-only**. The Account section displays the current email but
  doesn't allow editing it. Changing email properly requires a confirmation
  flow (send-token-to-old, verify-token-on-new) which is out of scope. Name
  is editable.

- **Change-password requires current password**. Defence against an attacker
  who hijacked an unattended browser session. `POST /api/auth/change-password`
  returns 401 with `{ errors: { currentPassword: ... } }` if wrong.

- **Export JSON dumps everything** (loan + payments + amortizations + euribor
  history + portfolio + flows + settings + user profile minus password hash).
  Schema version 1 — bump if breaking changes happen.

- **Export download uses fetch + Blob**, not a direct link. This way the
  session cookie travels with the request (a plain `<a href>` would too, but
  this lets me handle errors with a nice message).

- **Euribor editor adds-and-updates only**. No delete (the existing endpoint
  doesn't support it). Easy to add later: `DELETE /api/loan/euribor/:id`.

### Behavioural caveats

- **Adding a new Euribor entry also changes `loan.euribor`** (the "current"
  value used by the engine). This is intentional — the UI says so — but if
  you wanted history-only changes you'd need to add a `dryRun` flag.

- **No "Are you sure?" prompt before sign-out**. The button just signs you
  out. The sign-out button already exists in the navbar; this is duplicated
  here for discoverability.

### ~~Deferred (Phase 4B)~~ — done in Phase 4B.

---

## Phase 4B — Import + Watchlist + Danger Zone

### Decisions

- **Schema migration** added `watchlistSymbols String?` to `PortfolioSettings`.
  Comma-separated tickers; null/empty means "use the app default". Max 16
  tickers, ticker regex `/^[A-Z][A-Z0-9.\-]{0,9}$/`. Junk is silently dropped
  by the route (e.g. `'TSLA,nvda, AAPL, INVALID!!, AAPL'` → `'TSLA,NVDA,AAPL'`).

- **Static `KNOWN_NAMES` map for ticker → company name**. The app currently
  ships with ~18 mappings (FAANG + a few extras). User-added tickers without
  a known name just show the uppercase ticker. To extend, edit
  `frontend/src/hooks/useQuotes.ts` → `KNOWN_NAMES`.

- **Import is destructive** — `POST /api/import` wipes the user's loan,
  portfolio assets, and portfolio settings inside a `prisma.$transaction`,
  then recreates from the payload. The user account (id, email, password,
  createdAt) is never touched. UI requires a checkbox confirmation before
  the call fires.

- **Import preserves the existing user**. If you export from user A and
  import into user B, the imported data becomes B's data. That's expected.
  We do NOT honour the `user` field in the payload (it's ignored).

- **Auto-detects the prototype's `localStorage` shape** and transforms it
  in-place before the v1 logic runs. The detector triggers on either of:
  no `meta` field + presence of `amortizacoes`/`euriborHist`, or assets
  using `tk`/`m` instead of `ticker`/`monthly`. The transformer:
  - Converts `payments` map (`{ "YYYY-MM": { paid, real } }`) → array
  - Renames `amortizacoes` → `amortizations`, `euriborHist` → `euriborHistory`
  - Asset fields: `tk → ticker`, `m → monthly`, **`r/100 → expectedReturn`**
    (prototype stores % as integer like `12`; v1 stores fraction like `0.12`)
  - Lifts `gInc/gFY/gH` from portfolio root into `portfolio.settings`
  - Ignores `finnhubKey` and asset numeric `id`s (the latter would conflict
    with my UUID schema; new ones are generated on insert)
  - Adds `meta.schemaVersion: 1` + `importedFrom: 'prototype'`
  - Reported back to the client as `summary.importedFrom`

- **Schema-version gate**: `meta.schemaVersion !== 1` → 400. Bump the
  constant in `routes/import.ts` and `routes/export.ts` together when the
  shape ever changes; add migration logic if you need to accept old files.

- **Body size limit raised to 10 MB**. The export of a heavily-used account
  could grow (e.g. years of monthly payments × multiple assets × flows).
  10 MB covers ~5 years of dense usage comfortably.

- **Reset and Delete both require the current password**. Defence against
  unattended browser sessions. Wrong password → 401 with
  `errors.currentPassword`. Delete additionally requires typing
  `APAGAR` to confirm.

- **Delete destroys the session server-side** before responding 200. The
  frontend then redirects to `/signin`. The `useDeleteAccount` hook uses
  raw `fetch` (not the `api` helper) because the helper's `delete` method
  doesn't take a body.

### Behavioural caveats

- **Import doesn't validate semantic consistency.** It checks types and YM
  format but won't reject e.g. `prazoMeses < mesesFixos`. The engine will
  still run on broken data; KPIs may look weird until you re-edit the loan.

- **Cascade deletes rely on Prisma schema FK rules.** They're all set to
  `onDelete: Cascade` so `prisma.user.delete()` is enough to wipe everything.
  If you ever change that, the delete-account flow will start leaving
  orphans behind.

- **Reset doesn't invalidate the session.** You stay logged in, but
  everything is gone. This is intentional — you might want to immediately
  reconfigure.

- **The watchlist editor mutates local state until you click Guardar.**
  Removing a chip doesn't hit the server until save. If you navigate away
  without saving, your unsaved changes are lost. There's no "unsaved
  changes" warning yet.

### Things still not done (future work, not blocking "100% functional")

- **Drag-to-reorder for watchlist tickers.**
- **Asset flows history view** (the data is there in `portfolio_flows`,
  there's just no UI to browse a single asset's reforço history).
- **Loan milestone table** at the end of the projection.
- **Email change flow** (currently the email field in Account is read-only).

---

## Phase 5 — Google Sign In

### Setup the user needs to do (one-time)

1. **Google Cloud Console** → create project (or use existing).
2. **APIs & Services → OAuth consent screen** → configure (External, app name
   "WALLET", your support email).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: Web application
   - Authorized JavaScript origins: `http://localhost:5173` (add your prod URL
     when you have one)
4. Copy the **Web client ID**.
5. Set it in **both** env files:
   ```
   # backend/.env
   GOOGLE_CLIENT_ID="123-abc.apps.googleusercontent.com"
   # frontend/.env.local   (create the file if it doesn't exist)
   VITE_GOOGLE_CLIENT_ID="123-abc.apps.googleusercontent.com"
   ```
6. Restart the dev server. The button renders automatically.

### Decisions

- **Used Google Identity Services (GIS)**, not classic OAuth redirect dance.
  GIS is Google's current recommendation and gives the official styled button
  out of the box. Frontend gets an ID token (JWT), posts it to backend,
  backend verifies via `google-auth-library`.

- **Account matching order**: googleId → verified email auto-link → new user.
  Existing email/password user signing in with Google (same email, verified)
  is **automatically linked**: their existing data stays, and now they can
  sign in either way.

- **Schema migration**: `User.passwordHash` is now `String?` (nullable),
  added `User.googleId String? @unique`. Existing users keep their passwords;
  Google-only users have `passwordHash = null`.

- **Email/password login for a Google-only user** returns a clear error:
  *"Esta conta usa Sign in with Google. Usa o botão Google para entrar."*
  Not a generic 401.

- **Change-password for a Google-only user** returns 400 with a hint to use
  Google. (Future work: add a "Define password" flow that lets Google-only
  users set their first password.)

- **Reset / Delete with Google-only user**: skip the current-password check.
  Having a valid session is already proof of identity since the session was
  minted via Google. Extracted into a `verifyIdentity()` helper that handles
  both paths.

- **Frontend gracefully hides the button** if `VITE_GOOGLE_CLIENT_ID` is
  unset. No broken UI when not configured.

### Behavioural caveats

- **Auto-linking by verified email is a UX decision, not a security one**.
  If you ever support unverified email signups (you don't, currently), this
  logic would need to be tightened. Google always sends `email_verified:
  true` for `@gmail.com` accounts; for Workspace it depends on the domain
  config.

- **GSI script loads asynchronously**. On a cold page load the button takes
  up to 1s to render. We poll `window.google.accounts.id` every 100ms with
  no upper bound — if Google is blocked (ad-blockers, network), the button
  simply never appears. Email/password still works.

- **The Google button has its own visual identity** (Google's brand
  guidelines require this). It won't perfectly match the rest of the
  app's `--accent` colour. That's intentional — Google requires the
  official look.

- **One Google project per dev/prod environment**, OR one project with
  multiple authorized origins. For local dev + a hosted prod, the simplest
  is to add both origins to the same OAuth client.

### Untested in this implementation

- I wrote the integration but couldn't run a true E2E test because that
  requires a real Google account interacting with the popup. Backend code
  paths were verified to compile; the actual sign-in flow needs the user to
  click the button in a real browser after setting up `GOOGLE_CLIENT_ID`.

---

## Phase 6 — Yahoo Finance + FX (accurate returns and prices)

### Decisions

- **Switched expected-return data from Finnhub to Yahoo Finance.** Finnhub's
  free tier only exposes the 1-year `52WeekPriceReturnDaily` reliably, and
  it doesn't cover non-US listings (IWDA, SXR8, Samsung). Yahoo's unofficial
  `/v8/finance/chart` endpoint is free, no API key, returns 10y of monthly
  closes, and covers global exchanges via suffixes.

- **Multi-period CAGR instead of single 1-year return.** The AssetModal now
  shows pills for 1/3/5/10-year CAGRs (the longest-available window first).
  CAGR is split- and dividend-adjusted (we prefer `adjclose` over raw `close`).
  Much more stable than a 1-year price change — a single bad year doesn't
  poison the projection.

- **Symbol resolution probes common exchange suffixes** in order: `''`, `.L`,
  `.DE`, `.MI`, `.PA`, `.AS`, `.HE`, `.KS`, `.TO`. First match wins.
  Plus a hand-curated `SYMBOL_OVERRIDES` map for cases where the prototype's
  ticker doesn't match Yahoo's convention (e.g. `SMSN → 005930.KS`).

- **Portfolio currency is EUR.** When refreshing values from Yahoo we convert
  using Frankfurter (ECB-sourced, free, no key). Rates cached for 1h.

- **Subunit normalization for GBp / ZAc / ILA**. UK-listed prices often
  come back in pence (`GBp`), South Africa in cents (`ZAc`), Israel in
  agorot (`ILA`). The `normalizeSubunit()` helper divides by 100 and remaps
  the currency code so FX lookup uses the canonical currency.

- **Refresh is destructive on the value field**. `POST /refresh-values`
  overwrites `asset.value` with the FX-converted market value. `invested`
  (the cost basis) is never touched. If you want to "undo", re-import the
  backup or edit the asset.

### Behavioural caveats

- **Yahoo is unofficial.** It's stable and used by basically every finance
  tool, but Yahoo could change the endpoint shape or rate-limit at any time.
  If that happens, the `/cagr` and refresh routes will start returning empty.
  Alternatives: Alpha Vantage (free 25 calls/day, has historical), FMP
  (free tier), Stooq (CSV only, fiddly).

- **CAGR is in the asset's native currency**, not EUR-adjusted. This is
  the standard convention — currency cancels in the ratio. If a US stock
  returns 20%/yr in USD but USD depreciated 5%/yr against EUR, your EUR
  return is closer to 14%. The pill numbers don't account for that.

- **The resolved symbol might surprise you.** `IWDA` → `IWDA.L` makes sense,
  but if you accidentally type a ticker that overlaps with another exchange
  (e.g. `BARC` exists on multiple exchanges), the suffix probe order
  decides which one wins. Always check the "Fonte: Yahoo &lt;symbol&gt;"
  line in the modal.

- **Refresh changes value but not qty.** If a stock had a stock split and
  Yahoo's adjusted prices reflect it but the user's qty is pre-split, the
  refreshed value will be wrong. Edit the asset to fix `qty` if you notice
  big unexpected changes.

- **Frankfurter coverage**. ECB tracks ~30 major currencies including KRW,
  JPY, CNY, USD, GBP, etc. Doesn't include some smaller currencies (e.g.
  ARS, VES). If `getFxRate()` returns null, refresh-value returns a per-asset
  error with the unsupported currency.

- **The KRW conversion makes Samsung values look very different from
  the user-entered "1138€" baseline**. The prototype's value field was
  user-typed and reflected what they thought was true at the time. The new
  refresh uses today's actual market price × FX, which can diverge a lot
  for years-old data or wrong qty entries.

### Untested combinations

- Stock-split adjustment edge cases (Samsung had a 50:1 split in 2018; the
  qty in old data may not match what `adjclose` assumes).
- Tickers where Yahoo and your broker disagree about share unit (ADR vs
  underlying, GDR vs local, etc.). You may need to manually edit qty.

---

## Phase 6B — Reforçar auto-market-price

### Decisions

- **Reforçar now defaults to "Cotação atual de mercado"**. The modal has 3
  radio modes:
  1. **Cotação atual de mercado** (default) — backend auto-fetches the live
     price from Yahoo, applies FX to EUR, computes `qty += amount / priceEur`
     and `value = qty × priceEur`.
  2. **Preço manual** — user types an EUR price per share (existing flow).
  3. **Só cash** — no price; `invested += amount`, `value += amount`,
     qty unchanged.

- **Cost basis (`invested`) always grows by exactly `amount`**. The mode only
  affects how `qty` and `value` move. This is invariant: the cost basis is
  the source of truth for "how much money did I put in".

- **The `price` field accepts the string `"market"`** as an alias for
  `useMarketPrice: true`. Either works; the explicit boolean is cleaner.

### Behavioural caveats

- **Preview math in the modal is approximate**. While typing the amount, the
  modal shows `≈ X un.` using the *native-currency* price as the divisor
  (we don't fetch FX in the frontend). The backend uses the precise
  FX-adjusted EUR price at submit time, so the persisted qty may differ
  slightly from the preview. This is purely cosmetic.

---

## Phase 6C — Per-stock price chart (Trading212-style)

Clicking an asset row in "A minha carteira" now opens a modal with the stock's
real price progression and a range selector (1M / 6M / 1A / 5A / Máx).

### Decisions

- **Reuses the Yahoo Finance proxy.** New `getYahooHistory(symbol, range)` in
  `backend/src/lib/yahooFinance.ts` resolves the symbol via the existing
  `getYahooChart` (suffix probing + cache), then fetches the requested window.
  Endpoint: `GET /api/quotes/history?symbol=X&range=1y` → `{ resolvedSymbol,
  currency, currentPrice, points: [{ t, price }] }`. Cached 15 min per
  symbol+range. range → (Yahoo range, interval): 1mo/1d, 6mo/1d, 1y/1d,
  5y/1wk, max/1mo.

- **Chart in native currency, not EUR.** The progression shows the stock's
  quote currency (USD, etc.) from Yahoo — distinct from the portfolio's
  EUR-converted `value`. Uses `Intl.NumberFormat`, falling back to a plain
  number + code for subunit currencies Intl rejects (GBp, ZAc).

- **`StockChartModal`** (react-chartjs-2 Line, gradient fill, green/red by
  period change). The whole asset row is clickable (`role=button`); the
  action buttons stop propagation so Reforçar/Editar/Remover still work.

- **Adjusted closes** (split/dividend) are used for the series, consistent
  with the CAGR feature.

### Behavioural caveats

- **Not real-time.** 15-min cache; this is a progression chart, not a trading
  ticker. Intraday (1D) ranges aren't offered — Yahoo's free intraday data is
  flaky and the budget app doesn't need tick-level detail.

- **Same Yahoo-is-unofficial risk** as Phase 6 (endpoint could change/rate-
  limit). Symbols that don't resolve show a "sem dados" message.

- **Only portfolio rows are wired** so far. The watchlist trend cards could
  open the same modal trivially (the modal just takes a symbol) — not done yet.

---

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

## Phase 8 — Production deployment readiness

### What's done in code (no more pending items from the original checklist)

- **`backend/src/index.ts` rewritten** to handle prod-vs-dev cleanly:
  - `app.set('trust proxy', 1)` when `NODE_ENV=production` so secure cookies
    work behind Render's reverse proxy.
  - `cors()` reads `ALLOWED_ORIGINS` (comma-separated). If unset in prod we
    return `origin: false` (recommended for same-origin Render deployment).
    Dev still hard-codes `localhost:5173`.
  - `connect-pg-simple` is wired as the session store **only** when
    `NODE_ENV=production` AND `DATABASE_URL` starts with `postgres`. The
    `session` table is auto-created. SSL is enabled with
    `rejectUnauthorized: false` since Neon/Render PG present a managed cert.
  - `express-rate-limit` applied to `/api/auth/login`, `/signup`,
    `/google`, `/change-password`. 10 attempts per IP per 15 minutes in
    prod; 100 in dev (so we don't trip ourselves up).
  - Static-serves `frontend/dist` and SPA-catches non-`/api/*` paths when
    `NODE_ENV=production`. Single-origin deploy means no CORS dance.
  - Health check at `/api/health` now reports `env` so the host can verify
    it really booted in production mode.

- **`backend/prisma/schema.prod.prisma`** — Postgres mirror of the dev
  SQLite schema. Provider is `"postgresql"`; everything else is identical
  (models, fields, indexes, relations). The two files must be kept in sync
  manually — they're effectively the same except for one line.

- **`backend/package.json` scripts**:
  - `db:generate:prod` → `prisma generate --schema=prisma/schema.prod.prisma`
  - `db:push:prod` → `prisma db push --schema=...prod.prisma --accept-data-loss`
  - `deploy:prep` → runs both, in order

- **Root `package.json` scripts**:
  - `prod:build` → `npm install && npm run deploy:prep && npm run build`
  - `prod:start` → `npm run start --workspace=backend`

- **`render.yaml`** — declarative Blueprint config so the user can deploy
  by clicking "New → Blueprint → connect repo". Includes free-tier plan,
  Frankfurt region default, health-check path, build + start commands, env
  var declarations (some `sync: false` so they're set in the dashboard,
  `SESSION_SECRET` uses `generateValue: true` so Render rolls a strong one).

- **`DEPLOY.md`** — step-by-step deploy guide: push to GitHub → create
  Neon DB → connect Render Blueprint → paste env vars → smoke test.

### Decisions made for production readiness

- **Render + Neon** chosen over Vercel + Supabase / Fly + Cockroach.
  Reasoning: Render's free Web Service supports long-running Node servers
  with sessions (Vercel serverless would require auth refactor). Neon's
  free tier is the most generous for Postgres (0.5 GB + 191h compute/mo)
  and supports SQL extensions. Both signup with GitHub, no credit card.

- **Single-origin deploy** (backend serves the built frontend) chosen over
  separate frontend host. Removes the CORS layer entirely, keeps session
  cookies same-origin (no SameSite=None complications), one URL for the
  user to remember.

- **`prisma db push --accept-data-loss` over `prisma migrate`** for the
  prod schema. Reason: my SQLite migrations folder isn't portable to
  Postgres anyway, and `db push` is idempotent so re-running on each
  deploy is safe. **`--accept-data-loss` is dangerous if you ever rename
  a field** — it'll drop the old column. Mitigation: take a Neon snapshot
  before any rename/breaking schema change.

- **Rate limit is 10/15-min per IP for auth endpoints**. Tight enough to
  block brute force, loose enough that a fat-fingered user doesn't get
  locked out. Behind Render's proxy the IP is the real client IP because
  of `trust proxy: 1`.

- **`ALLOWED_ORIGINS` unset in prod = same-origin**. Saves the user from
  having to set this if they don't have a custom domain yet. The Render
  URL just serves both API and SPA from itself.

- **Backend still uses CommonJS, not ESM**. Render supports both fine and
  changing module systems mid-flight would break too many imports. The
  built `dist/index.js` runs straight via `node dist/index.js`.

### Behavioural caveats

- **First cold start ~30-45 seconds** combined Render (15-min idle spin
  down) + Neon (5-min idle suspend). After that, requests are sub-second.
  Mitigation: keep the service warm with a cron pinging `/api/health` every
  10 minutes — but that uses up the 750 free hours faster. For personal
  use the cold start is acceptable.

- **`db:push` doesn't preserve history**. If you ever want proper
  Prisma migrations on prod, regenerate them against Neon: edit
  `schema.prod.prisma`, run `prisma migrate dev` pointed at Neon dev
  branch, commit the new migration directory, switch the script to
  `prisma migrate deploy`.

- **Two prisma schemas to keep in sync** is fragile. A pre-commit hook
  could diff them and refuse to commit if they diverge. Not done; flagged
  as future work.

- **`express-rate-limit` uses in-memory state**. With multiple Render
  instances (only on paid plans), each instance has its own count — an
  attacker can fan out across them. For a free-tier single instance this
  is fine.

- **Frontend bundle is 499 KB / 156 KB gzipped**. Most of that is
  Chart.js. Could be reduced by code-splitting the loan/portfolio/budget
  charts into separate routes, but TTFB is already fine over HTTPS so
  it's premature optimization.

### What the user still has to do (no way to automate)

1. Push the repo to GitHub
2. Sign up for Neon → create a project → copy the connection string
3. Sign up for Render → New Blueprint → connect repo
4. Paste env vars: `DATABASE_URL`, `FINNHUB_API_KEY`. Leave
   `SESSION_SECRET` (Render generates) and `ALLOWED_ORIGINS` (empty)
5. Wait ~5 min for first deploy
6. Visit `https://wallet-app-xxxx.onrender.com`
7. (When ready) Add the Render URL to Google OAuth authorized origins

All of these are in `DEPLOY.md`.

---

## Production hosting checklist

Things that are fine for local dev but need attention before exposing the app
to the public internet. Roughly ordered from "do this first" to "nice to
have."

### Must-fix before going public

- **Switch DB from SQLite to Postgres.** SQLite locks the whole file on
  writes and doesn't replicate. Use Supabase / Neon / Railway / Fly Postgres
  (all have free tiers). See "How to change" under Phase 0 SQLite caveat.

- **Wire `connect-pg-simple` as the session store.** The default
  `MemoryStore` resets sessions every time the backend restarts and can't
  span multiple Node processes. The package is already in deps — pass
  `store: new PgSimpleStore({ conObject: { connectionString:
  process.env.DATABASE_URL } })` to `session()` in
  `backend/src/index.ts`.

- **Generate a strong `SESSION_SECRET`.** Replace the placeholder in
  `backend/.env` with the output of `openssl rand -hex 32` (or PowerShell:
  `[Convert]::ToHexString((1..32 | %{ Get-Random -Maximum 256 }))`). Never
  commit it.

- **Open up CORS to your real frontend URL.** In `backend/src/index.ts`
  the prod branch is currently `origin: false` (blocks everything). Change
  to your real frontend URL, e.g. `origin: 'https://wallet.example.com'`.
  If front + back share an origin, drop CORS entirely.

- **Serve over HTTPS.** The session cookie has `secure: true` when
  `NODE_ENV=production`, which means it's dropped on plain HTTP. Use
  Cloudflare/Caddy/Vercel/Render — any of those terminate TLS for free.

- **Rate-limit `/api/auth/login` and `/api/auth/signup`.** Add
  `express-rate-limit` (not yet in deps) — e.g. 5 attempts per IP per 15
  minutes on login, 3 signups per IP per hour. Without this, the app is
  brute-forceable.

### Finnhub-specific (only if you ship the watchlist)

- **Free tier is "personal use" only.** Finnhub's ToS effectively requires
  a paid plan ($25/mo+) for public/commercial apps. Read their terms before
  going live with multiple users.

- **60 calls/min is shared across ALL users.** With a few users actively
  viewing the watchlist, you'll hit the limit fast. Either:
  - Cache quotes server-side (e.g. 60-second TTL in memory or Redis) so
    repeated requests for the same tickers don't burn the budget.
  - Switch to "bring your own key" — let each user paste their own Finnhub
    key into Configurações, store it on the `User` row, use it for that
    user's requests only.

- **Never log the key.** Currently `backend/src/routes/quotes.ts` doesn't
  log it, but be careful with any future error handlers — `console.error(err)`
  on a request error can dump the URL with the key in query params.

### Nice to have

- **Backups.** Postgres providers usually do this automatically. If you stay
  on SQLite for any reason, schedule snapshots (e.g.
  `Copy-Item dev.db dev.db.$(Get-Date -Format yyyyMMdd-HHmm).bak` via Task
  Scheduler).

- **Per-user audit log.** No record of who did what when. For a money app
  that touches your real numbers, even a simple
  `audit_log(user_id, action, payload_json, created_at)` table is useful for
  debugging "why did this value change?".

- **Email verification on signup.** Currently any email string works. Add a
  one-time token sent via SES/Postmark/Resend if you care about email
  ownership.

- **2FA.** Out of scope for now but worth flagging if the app ever holds
  serious money decisions.

## How this file is maintained

When I introduce a new caveat in a future phase, I append it to this file in
the same shape (What / Why / How to change). When a caveat is resolved (e.g.
you migrate to Postgres and re-introduce the enum), strike it through or
delete it.

If you ever want a "still-relevant only" view, ask me to prune resolved entries.
