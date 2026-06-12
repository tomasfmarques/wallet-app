# Decisions — Settings (account, Euribor, export/import, danger zone)

_Source: split from CAVEATS-full.md._

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

