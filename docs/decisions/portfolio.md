# Decisions — Investments / Portfolio (assets, quotes, FX, charts)

_Source: split from CAVEATS-full.md._

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

- **Both portfolio rows and watchlist cards are wired** to open the chart
  modal (clicking a "Em alta · Nasdaq" card opens it too; the card's "+
  Adicionar" button stops propagation).

---

## Phase 6D — Currency-aware search + EUR-converted auto-fill

### Decisions

- **Search-result currency is derived, not fetched**
  - **What**: Yahoo's `/v1/finance/search` returns no currency. `currencyForResult()`
    in `backend/src/lib/yahooFinance.ts` infers it from the symbol suffix
    (`SUFFIX_CCY`: `.KS`→KRW, `.SW`→CHF, `.DE`→EUR…), falling back to an
    exchange-code map (`EXCHANGE_CCY`), then defaulting unsuffixed tickers to USD.
  - **Why**: the alternative — a per-symbol quote lookup to read the real
    currency — means up to 8 extra Yahoo calls per debounced keystroke, and the
    v7 quote endpoint now needs a crumb/cookie (flaky). The suffix encodes the
    listing venue reliably for the vast majority of results.
  - **Caveat**: it's a hint. Ambiguous venues (Cboe Europe `CXE`, London `IOB`
    GDRs) deliberately return `null` → the UI shows a "—" badge rather than a
    wrong currency. Extend the maps as real gaps appear.

- **Prices are FX-converted to EUR before auto-fill (`priceEur`)**
  - **What**: `/api/quotes/cagr` now returns `priceEur` = `convertPrice(currentPrice,
    currency, 'EUR')` (Frankfurter, in `backend/src/lib/fx.ts`). `AssetModal` uses
    it to prefill "Investido (€)/Valor (€)".
  - **Why**: the form fields are EUR; previously a USD/KRW spot price was filled
    as if it were euros (≈10 % error for USD, orders of magnitude for KRW).

- **EUR auto-fill has NO native-price fallback**
  - **What**: `fillPrice = priceEur ?? (nativeCurrency === 'EUR' ? nativePrice : null)`.
    If FX fails for a non-EUR listing, the amount fields stay empty.
  - **Why**: an empty field the user fills in is safer than a confidently
    wrong number labelled "auto-preenchido". Don't reintroduce `?? nativePrice`.
  - **GBp note**: LSE prices come back as `GBp` (pence); `normalizeSubunit` in
    `fx.ts` divides by 100 before converting, so `priceEur` is right even though
    the search badge says "GBP".

---

## 2026-06-19 — Investment risk = annualized volatility

- **What:** a risk metric for the portfolio, computed from data we already have.
  `backend/src/lib/risk.ts` (pure): `annualizedVolatility(prices)` = sample
  stddev of monthly returns × √12 (uses the last ≤60 monthly returns of each
  holding's Yahoo 10y series from `getYahooChart`); `riskLevel(vol%)` →
  `baixo|medio|alto|muito_alto` (thresholds 10/20/35); `portfolioRisk(items)` =
  **value-weighted** average vol + coverage.
- **Why volatility:** it's the standard quantitative risk proxy and the ONLY one
  computable with the current API for free — Finnhub `beta` exists
  (`/api/quotes/metric`) but needs `FINNHUB_API_KEY`, which isn't set in prod.
- **Endpoint:** `GET /api/portfolio/risk` (in `portfolio.ts`) — fetches each
  holding's Yahoo chart (cached 1h), returns per-asset vol/level + the portfolio
  aggregate. Kept **separate from `GET /api/portfolio`** (which uses stored
  values and never calls Yahoo) so the main render stays fast; the Portfolio +
  Compare pages load it lazily (`usePortfolioRisk`, 30-min cache, `enabled` flag).
  Per-asset failures degrade to `volatility: null` (shown as "—"), never 500.
- **Shown:** `RiskCard` on the Portfolio page (portfolio level + volatility +
  per-asset breakdown). Risk-level pills styled in `index.css` (`.risk-*`).
- **Simplifications (documented, intentional):**
  - **Level thresholds are heuristics** (cash/bonds <10, broad ETFs ~10–20,
    single stocks ~20–35, crypto >35). Tune in `riskLevel()` if needed.
  - Volatility ≠ a complete risk picture (no drawdown, liquidity, concentration).
- **Don't:** move risk into `GET /api/portfolio` — it would put N Yahoo calls on
  the dashboard's hot path. Keep it lazy.

### 2026-06-20 — Correlation-aware portfolio volatility (covariance)

- **Upgraded** the headline portfolio risk from a value-weighted average to a
  proper **covariance** model: `σ_p = √(wᵀΣw)×√12` over the months COMMON to all
  usable assets, so **diversification is credited** (σ_p ≤ the weighted average).
  `correlatedPortfolioVol()` in `risk.ts`; `monthlyReturns(prices, timestamps)`
  keys returns by calendar month. `getYahooChart` now also returns aligned
  `timestamps` (prices array unchanged → CAGR unaffected).
- **Fallback:** needs ≥2 assets with ≥12 overlapping months; otherwise falls back
  to the value-weighted average. `/api/portfolio/risk` now returns
  `weightedVolatility` + `correlationModeled` alongside `volatility`, and the
  `RiskCard` shows the diversification benefit when modeled.
- **Verified:** identical assets → σ_p = single-asset vol (ρ=1, no benefit);
  perfectly anti-correlated 50/50 → ≈0; imperfectly correlated → σ_p < weighted.

### 2026-06-20 — Yahoo failover (stale-cache, F8)

- **What:** `getYahooChart` now keeps a `lastGood` map (per key, never expires
  until replaced). On a fetch failure it serves the **last good (stale)** chart
  instead of `null`, and re-tries Yahoo sooner (`STALE_RETRY_MS` 5 min) rather than
  caching the miss for the full hour. Benefits everything that reads Yahoo:
  value refresh, CAGR, history, and risk degrade gracefully during transient
  Yahoo outages.
- **Scope/limits:** in-memory, so on **serverless cold start** `lastGood` is empty
  (same as before — no regression); it helps within a warm instance. A durable
  cross-instance cache would need the DB/external store (deferred).
- **Finnhub backup NOT wired:** Finnhub's quote endpoint doesn't return the
  listing currency, so it can't safely price a multi-currency EUR portfolio
  (would mis-convert). Left for later, and the key is unset in prod anyway. The
  stale-cache is the failover that actually ships.

### 2026-06-20 — Asset flows history + watchlist drag-to-reorder

- **Flows history:** `FlowsModal` lists an asset's `portfolio_flows` (already in
  the portfolio response — no new endpoint), opened from a per-row "Histórico"
  button in `AssetTable`.
- **Watchlist reorder:** native HTML5 drag (a drag handle per `TrendCard`)
  reorders the list and persists via `useUpdateSettings({ watchlistSymbols })`
  (CSV, the existing `normalizeWatchlist` format). Optimistic local order,
  resynced when the underlying symbol set changes.

---


## 2026-06-23 — Trading212 import v1 (CSV) + `PortfolioAsset.isin`

- **What:** import a Trading212 portfolio from its **transactions CSV** export
  (Settings → History → Export). `frontend/src/lib/trading212Parser.ts` (pure)
  parses the order ledger, keeps buy/sell actions, and aggregates per **ISIN**
  with the **average-cost** method into net positions + monthly `flows`
  (dividends/deposits/interest ignored). `Trading212ImportModal` resolves each
  ISIN → a Yahoo-usable symbol via the existing `/api/quotes/search` proxy
  (Yahoo search accepts ISINs), shows an editable review table, and posts to a
  new `POST /api/portfolio/import` (bulk-create assets + nested flows in a
  `$transaction`, dedup by ISIN→ticker vs existing + within batch).
- **Schema (additive):** `PortfolioAsset.isin String?` — both `schema.prisma` +
  `schema.prod.prisma`, migration `add_portfolio_asset_isin`, `import.ts`
  whitelist; `export.ts` carries it via full-row dump. ISIN is the stable
  cross-broker identity (Yahoo ticker can drift), used for dedup + the v2 API map.
- **Why CSV first:** no stored broker secret, no rate limits, reuses the
  client-side parse-and-review pattern; the CSV carries ISIN (clean Yahoo
  mapping) and full history (cost basis + flows). Direct API live-sync is **v2**.
- **Key decisions / edge cases (all verified):**
  - **Average cost** on partial sells: `cost -= avg × soldQty`; closed positions
    (qty→0) dropped. Transactions are **sorted chronologically** before
    aggregating (multi-file/yearly exports merge unsorted).
  - `value` defaults to the **cost basis**; the user then runs "Atualizar
    valores" for live Yahoo prices. `monthly` (forward-looking contribution) is
    left 0 on import on purpose — historical buys are not a future plan.
  - Cost uses the account-currency **Total** column (EUR for EU accounts); rows
    where no cost can be derived (`total === 0`) are **skipped** so a parse
    failure can't corrupt the average. Invalid ISINs (not `[A-Z0-9]{12}`) are
    nulled in the parser. Flows capped at 120 server-side.
  - **Dedup is "skip if ISIN OR ticker already exists"** (vs existing + within
    batch) — deliberately conservative to avoid duplicate holdings, even if it
    means a manually-added ticker isn't ISIN-backfilled.
- **Don't:** price imported assets off the T212 ticker — the whole quote/CAGR/
  risk stack uses Yahoo, so the ISIN→Yahoo resolution (editable in the review
  table) is required.

### Deferred — Trading212 direct API (v2)
Live sync mirroring `bank.ts`: an **encrypted** per-user T212 API key (new env
`BROKER_ENC_KEY`, AES-GCM), `GET /equity/portfolio` + cached `/metadata/instruments`
→ the **same** import pipeline + persisted ISIN. Confirm at build time: current
auth model (single key vs key+secret), per-endpoint rate limits, and EU-ETF ISIN
resolution coverage. Live vs practice base URLs are key-scoped.

### 2026-06-23 — Imported assets refresh via qty×price (`9504f85`)

- **Symptom:** after a Trading212 CSV import, every holding showed `0 € (0,0 %)`
  gain even after "Atualizar valores" (with the banner reporting them updated).
- **Cause:** `refresh-value(s)` is **delta-based** — it scales `value` by the
  price change since `lastPriceEur`. A freshly imported asset has `value = cost
  basis` and `lastPriceEur = null`, so the first refresh only records the
  baseline and leaves value at cost → `value − invested = 0`.
- **Fix:** new `refreshedValue(asset, priceEur)` helper — **imported assets
  (`isin` set) → `value = qty × priceEur`** (broker qty is reliable, shows real
  trajectory + self-heals on next refresh); manual/legacy assets keep the
  price-delta scaling (their qty may be a placeholder — the original rationale).
- **Don't:** drop the `isin` gate and make refresh always `qty × price` — that
  reintroduces the bug the delta logic guards against for hand-curated assets.

## 2026-06-23 — Trading 212 direct API live-sync (v2) + bank-style import hub (`9542e29`)

- **What:** a "Ligar Trading 212" flow (mirrors GoCardless `bank.ts`) that pulls
  live positions and folds them into the portfolio via the **same**
  `processPortfolioImportItems` pipeline as the CSV import. Plus the CSV importer
  restructured into a platform menu (Trading 212 active; Revolut/DEGIRO/XTB/IBKR
  "brevemente").
- **Security (the key difference from bank.ts):** a broker API key is a real
  credential, so it's **encrypted at rest** — `lib/crypto.ts` (AES-256-GCM,
  env `BROKER_ENC_KEY`). The integration is **gated**: `brokerEncConfigured()`
  false → `/status` returns `configured:false` and the UI shows "brevemente"
  (exactly the GoCardless gate). `BrokerConnection` (additive schema, both files,
  migration) stores `keyEnc`/`secretEnc` — **excluded from export/import backup**
  (like `WebAuthnCredential`), so `export.ts`/`import.ts` are intentionally untouched.
- **Auth model is unconfirmed:** `resolveAuth` (`lib/trading212.ts`) tries raw key,
  `Bearer key`, then the secret variants against `/equity/account/info` and uses
  whichever authenticates — so we don't have to pin the header blind. Confirm the
  winning variant + per-endpoint rate limits once a real key exists.
- **Mapping decisions:** positions → items reuse the v1 ISIN→Yahoo bridge
  (`searchTickers`) + Frankfurter EUR conversion. A position whose FX is
  **unavailable is skipped** (never store a native-currency figure as EUR).
  Instruments metadata cached 24h **per env** (live/demo lists must not mix).
  Mapping runs in concurrent batches + a 15s per-user sync cooldown to stay under
  the serverless timeout and respect T212's per-account rate limits.
- **Setup to go live:** generate a **read-only** T212 key (Invest/ISA only),
  set `BROKER_ENC_KEY` in Vercel. See [`docs/trading212-v2-spec.md`](../trading212-v2-spec.md).
- **Don't:** log/return the key; drop the `brokerEncConfigured` gate; or add
  `BrokerConnection` to export/import (it holds secrets).

## 2026-07-09 — WS6: Assistente IRS — mais-valias (Anexo J helper)

Roadmap WS6 ([`../roadmap-2026-07-spec.md`](../roadmap-2026-07-spec.md)).

- **Data reality check outcome:** `ImportedTxn` was dedup-keys-only → extended
  with NULLABLE gains columns (`side/isin/ticker/qty/totalEur/ym/txnTime` —
  additive migration `extend_imported_txn_for_gains`, BOTH schemas,
  export/import updated). `applyPortfolioTransactions` now persists the
  metadata on first apply AND **BACKFILLS legacy rows on re-import** (update
  gated on `side IS NULL`; the txn itself stays idempotently skipped). So the
  owner's existing history lights up by re-importing the same T212 CSV once.
- **Engine (`lib/capitalGains.ts`, pure/unit-tested):** FIFO per instrument
  (CIRS art. 43.º — legally mandated for securities), ordered by `txnTime`
  then `ym`. One sale emits ONE ROW PER CONSUMED LOT — the exact Anexo J
  quadro 9.2A shape (year+month granular, so `ym` precision is sufficient).
  A sale exceeding imported buys emits an `incomplete` row (cost 0, flagged) —
  positions predating the data are surfaced honestly, never guessed. Gains
  belong to the SALE's calendar year. 28 % autonomous rate on positive net
  gain only (englobamento mentioned in the disclaimer, not computed).
- **API:** `GET /api/portfolio/capital-gains?year=` — rows + totals +
  estimatedTax + incompleteCount + availableYears; display names resolved
  from the user's holdings (isin → ticker → raw key).
- **UI:** collapsible "IRS — Mais-valias" section on the Portfolio page
  (`CapitalGainsCard`): year selector (from availableYears), net-gain +
  estimated-tax KPIs, per-lot table (incomplete rows amber), CSV export
  (formula-guarded), `window.print()` with a print stylesheet that isolates
  the card, mandatory not-tax-advice disclaimer, empty states. i18n
  `portfolio:irs.*` pt+en.
- **Verified:** engine unit tests (spec scenario 10@10+10@20 sell 15@30 →
  +200/+50, tax 70; fractional; sell-without-buy; partial coverage; year
  filter — all green); end-to-end through the REAL apply endpoint (metadata
  persisted, per-lot rows correct, €700 on €2 500); UI browser-checked.
- **Don't:** drop the `side IS NULL` guard on backfill (would let a crafted
  re-import rewrite history); don't compute englobamento; don't switch FIFO
  to average-cost "for simplicity" (illegal for PT IRS).

### WS6 review fixes folded in before ship

- **Backfill scalability (was blocking):** only rows whose `side` is still
  null are queued for backfill (the applied-orders query now selects `side`),
  and the backfill runs OUTSIDE the atomic holdings transaction in chunks of
  25 parallel updates — a multi-year first re-import can carry thousands of
  legacy rows and must not blow the 5s interactive-transaction budget (which
  would roll back the holdings AND retry the same oversized batch forever).
  Partial failure just leaves the remainder for the next re-import (the
  `side IS NULL` guard keeps every write idempotent). Verified: nulled a row,
  re-imported → metadata restored, data-carrying sibling untouched, holdings
  idempotently skipped.
- **Engine tests are committed** (`backend/scripts/test-capital-gains.js`,
  11 checks incl. free-share zero-cost lots and no-tax-on-loss; run after
  `npm run build -w backend`). The zero-total-buy behaviour is now guarded by
  an explicit comment in `capitalGains.ts` (free shares = zero-cost lots; do
  NOT "fix" the filter to `<= 0`).
- Print stylesheet includes the section heading (the toggle IS the title —
  an accountant-readable header on the printed Anexo J working paper).

## 2026-07-11 — Public simulators reuse the backend engines via `@engines` Vite alias

The landing-funnel tools (`/simuladores/*`) compile `backend/src/lib/loanEngine.ts`
and `backend/src/lib/capitalGains.ts` DIRECTLY into the frontend bundle through a
`@engines` Vite alias (+ tsconfig paths). Chosen over a shared npm workspace
because both files have **zero imports** — a workspace added CJS/ESM and Vercel
function-bundling risk for nothing. Consequences:
- Those two files must stay import-free and side-effect-free (warning comment at
  the top of each; the client build breaks otherwise).
- There is deliberately NO duplicated engine — no merchant.ts-style parity trap.
- SW precache consciously includes the marketing/tool chunks (+~96 KiB): installed
  users get the simulators offline. Revisit only if precache size becomes a problem.
