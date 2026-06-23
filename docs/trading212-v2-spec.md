# Trading 212 direct API — v2 live-sync (build spec)

_Status: **SHIPPED** (`9542e29`, gated on `BROKER_ENC_KEY`). v1 (CSV import)
shipped `fad58ed`. Built mirroring the GoCardless `bank.ts` pattern, reusing the
import pipeline. This doc remains the reference for the open auth/rate-limit
questions resolved at connect-time. Last updated: 2026-06-23._

> **Live in `routes/broker.ts` + `lib/{crypto,trading212}.ts` + `BrokerConnection`.**
> `resolveAuth` tries raw/Bearer key then secret (open question #1 handled by
> trying variants); instruments cached 24h **per env**; FX-failed positions are
> skipped (not stored wrong). To activate: generate a read-only T212 key + set
> `BROKER_ENC_KEY` (`openssl rand -base64 32`) in Vercel. Still to confirm with a
> real key: the exact working auth header (logged implicitly by which variant
> authenticates) and per-endpoint rate-limit numbers.

## Goal

A "Ligar Trading 212" → "Sincronizar" flow that pulls the user's live positions
from the Trading 212 Public API and folds them into the portfolio through the
**same mapping pipeline as v1** (ISIN → Yahoo symbol, EUR conversion, dedup).
No file juggling; one click to refresh holdings.

## What the API gives us (researched)

- **Public API**, free, opt-in per account. Covers **General Invest + Stock &
  Shares ISA only** (not SIPP). Keys are **account-scoped** and **differ between
  live and practice/demo**.
- **Auth = key + secret pair** (current official flow — the secret is shown once
  at generation, treat as a password). ⚠️ Older client libs (e.g. bennycode) use
  a *single* key in the `Authorization` header, so the header semantics changed
  and the **exact request header must be confirmed with a real key at build time**
  (the `/connect` validate call resolves this empirically — see Open questions).
  When generating, the user can grant **read-only** scope (account data +
  portfolio + history) — we instruct read-only; we never place orders.
- **Base URLs** (key-scoped): live `https://live.trading212.com/api/v0`,
  practice `https://demo.trading212.com/api/v0`.
- **Rate limits: per-account** (not per-key/per-IP), **per-endpoint, strict**.
  Exact numbers aren't published in machine-readable form; treat as: portfolio =
  most permissive but still throttled (sync **on-demand only**, never poll);
  **instruments metadata is heavily limited → cache ≥24h** (it's a large, slow-
  changing list). Handle 429 with a clear "try again shortly" message.

### Endpoints used
| Purpose | Endpoint | Notes |
|---|---|---|
| Validate key on connect | `GET /equity/account/info` (or `/account/cash`) | cheap call to confirm the key works + read account currency |
| Current holdings | `GET /equity/portfolio` | the snapshot we import |
| Ticker → ISIN/name/currency | `GET /equity/metadata/instruments` | **cache ≥24h**; large; maps T212 ticker → ISIN |

### Expected response shapes (verify against live)
- **`/equity/portfolio`** → array of positions: `ticker` (T212 id, e.g.
  `AAPL_US_EQ`), `quantity`, `averagePrice`, `currentPrice` (both in the
  **instrument currency**), `ppl` / `fxPpl` (in **account currency**),
  `initialFillDate`, `maxBuy`, `maxSell`, `pieQuantity`.
- **`/equity/metadata/instruments`** → array: `ticker`, `type`, `isin`, `name`,
  `currencyCode`, `shortName`, `addedOn`, `maxOpenQuantity`.

## Mapping → Wallet360 `PortfolioAsset` (reuses v1)

For each portfolio position, join to its instrument (by T212 `ticker`) for
`isin`, `name`, `currencyCode`, then:
- `isin` ← instrument `isin` (already a column since v1, `add_portfolio_asset_isin`).
- `ticker` (Yahoo) ← **resolve `isin` → Yahoo symbol** via the existing
  `searchTickers`/`/api/quotes/search` — identical to v1, already proven
  (`IE00B4L5Y983 → IWDA.AS`, `IE00BK5BQT80 → VWRA.L`).
- `qty` ← `quantity`.
- `invested` (EUR) ← `quantity × averagePrice`, converted **instrument currency →
  EUR** via `convertPrice` (Frankfurter, in `fx.ts`). (Or `value - ppl` if we
  trust `ppl` in account currency — but currency-convert is consistent with v1.)
- `value` (EUR) ← `quantity × currentPrice` → EUR (or let the user run
  "Atualizar valores" afterwards, as in v1).
- `monthly` ← 0 (forward-looking plan, set by the user — same rule as v1).
- `flows` ← none from the snapshot (history would need `/history/orders`, rate-
  limited; defer — or backfill from a one-time CSV import).

**Refactor prep:** extract the v1 route's create-loop into an exported
`processPortfolioImportItems(userId, items)` in `portfolio.ts` (like
`processImportItems` in `budget.ts`), so both the CSV route and broker sync share
dedup + validation + nested-flow creation. Low-risk, do it as the first v2 commit.

## Storage & security (the key difference from `bank.ts`)

GoCardless stores an opaque `requisitionId` (not secret). The **T212 key+secret
is a real credential** → must be **encrypted at rest**. The repo has no symmetric
crypto helper today (only `randomBytes`/`createHash`).

- **New `backend/src/lib/crypto.ts`** — AES-256-GCM `encrypt(plain)→{iv,tag,ct}`
  / `decrypt(...)`, keyed by a new env `BROKER_ENC_KEY` (32-byte base64; set in
  Vercel only). Fail closed if the env is unset (feature gated off, like
  `credentials()` in `bank.ts`).
- **Schema (additive)** — new model `BrokerConnection { id, userId, broker
  ("trading212"), keyEnc, secretEnc?, env ("live"|"demo"), accountCurrency?,
  createdAt }` (both Prisma schemas + migration + `import.ts`/`export.ts` — and
  **exclude the encrypted secrets from export/backup**, like `WebAuthnCredential`).
  Alternatively park it on `PortfolioSettings`, but a dedicated model is cleaner
  and matches `BankConnection`.
- Never log the key/secret; `/status` returns only `{ configured, connected, env,
  lastSyncAt }` — never the credential.

## Endpoints + UI (mirror `bank.ts`)
- `GET  /api/portfolio/broker/status` → `{ configured, connected, env, lastSyncAt }`.
- `POST /api/portfolio/broker/connect` `{ apiKey, apiSecret?, env }` → validate via
  `/equity/account/info`; on success, encrypt + store; on 401 return a clear error.
- `POST /api/portfolio/broker/sync` → pull portfolio + (cached) instruments → map →
  `processPortfolioImportItems`; return the same `{ created, skipped }` summary.
- `DELETE /api/portfolio/broker` → wipe the stored connection.
- **UI:** a "Ligar Trading 212" button next to "Importar do Trading 212" in the
  Portfolio header; once connected, a "⟳ Sincronizar" action. Reuse the v1 review
  modal optionally, or sync directly (positions are already structured, less need
  for a review step than the CSV).

## Open questions to resolve at build (with a real key)
1. **Exact auth header** — single `Authorization: <key>` vs key+secret (header pair
   or HMAC signing). The `/connect` validate call against the user's own key
   resolves this; build the header behind a tiny adapter so it's easy to adjust.
2. **Exact rate-limit numbers** per endpoint (portfolio vs metadata) → set cache
   TTLs + a cooldown on the Sincronizar button accordingly.
3. **Currency of `averagePrice`/`currentPrice`** — confirm instrument-currency
   (needs FX) vs account-currency. Affects the `invested`/`value` conversion.
4. **Fractional-share precision** and pies (`pieQuantity`) — confirm a position's
   `quantity` already includes pie holdings, or sum them.

## Effort & risk
- ~½–1 day once a key is available. Main risks: the auth-header ambiguity (#1)
  and rate limits (#2) — both empirically resolved at connect time, low blast
  radius. Schema change is additive (safe `db:push:prod`). Encryption is the one
  genuinely new piece (small, well-trodden AES-GCM).

Sources: [T212 API docs](https://docs.trading212.com/api) ·
[API key (help)](https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key) ·
[Rate limiting](https://docs.trading212.com/api/section/rate-limiting) ·
[redoc reference](https://t212public-api-docs.redoc.ly/).
