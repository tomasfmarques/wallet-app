# Wallet360 — Build plan 2026-07 (agent-executable spec)

_Source: full code/security/product audit of 2026-07-08 + owner direction._
_Each workstream (WS) below is independently executable by an agent in its own
session. Read **Global rules** first, then only the WS you're building._

**Ship order & dependencies:**

| WS | Name | Size | Depends on | Schema change |
|----|------|------|-----------|---------------|
| WS1 | Security hardening batch | S | — | no |
| WS2 | Cron infra + Auto-Euribor | M | — | yes (additive) |
| WS3 | Web Push notifications + reminders | M/L | WS2 (cron) | yes (additive) |
| WS4 | Automatic monthly email digest | M | WS2 (cron) | yes (additive, shares WS3 prefs) |
| WS5 | "Fecho do mês" month-in-review | M | — (better after WS4) | no |
| WS6 | Assistente IRS — mais-valias | L | — | no (computed) |
| WS7 | Modo Casal (household) | L | — | yes (additive, 3 tables) |
| WS8 | Vite major upgrade | S/M | — | no |

Recommended sequence: WS1 → WS2 → WS3+WS4 (share infra) → WS5 → WS6 → WS7. WS8 anytime.

---

## Global rules (read before ANY workstream)

1. **Two Prisma schemas.** Any model change touches BOTH
   `backend/prisma/schema.prisma` (SQLite dev) AND
   `backend/prisma/schema.prod.prisma` (Postgres prod), plus
   `backend/src/routes/export.ts` + `import.ts` (unless the table is
   deliberately excluded — each WS says which). Dev migration:
   `npm run db:migrate -w backend -- --name <name>`. Prod applies via
   `db:push:prod` on deploy — **all changes below are additive** (new tables /
   nullable columns / defaulted columns), so no Neon snapshot is needed; if you
   deviate into a rename/drop, STOP and take a snapshot first.
2. **Backend is CommonJS** (ts-node-dev dev, tsc build). No ESM-only packages
   unless dynamically imported.
3. **i18n:** every user-facing string via `react-i18next`; add keys to BOTH
   `frontend/src/i18n/locales/pt/<ns>.json` and `en/<ns>.json` (parity is
   checked). Emails are sent in the user's stored language
   (`PortfolioSettings.language`, fallback pt) — email strings live backend-side
   (see WS4) since the backend has no i18next; use a simple `{ pt: …, en: … }`
   dictionary module.
4. **Serverless (Vercel).** No long-running processes, no node-cron. Scheduled
   work = **Vercel Cron** hitting an authenticated endpoint (WS2 builds this
   once; WS3/WS4 plug into it). Function `maxDuration` is 30s — batch and
   paginate anything that iterates users.
5. **Env-gating pattern:** every new integration ships OFF until its env var is
   set (like `BROKER_ENC_KEY`). Each WS lists its vars; code must degrade
   gracefully (feature hidden / console fallback) when unset.
6. **Never hardcode colours** (theme tokens), **no emoji as UI icons** (use
   `components/ui/Icon.tsx` — extend it if a new icon is needed).
7. Before commit: run `npm run build` (tsc both workspaces must pass), update
   `docs/STATE.md`, log decisions in the right `docs/decisions/*.md`, and use
   the `code-reviewer` agent. Push to `main` = prod deploy.

---

## WS1 — Security hardening batch (no schema)

Three fixes from the 2026-07-08 audit. One PR, backend-only.

### 1a. Normalize email casing

- Add `function normalizeEmail(e: string): string { return e.trim().toLowerCase() }`
  in a shared spot (e.g. `backend/src/lib/normalizeEmail.ts` or top of `auth.ts`).
- Apply at **every** email read/write boundary:
  - `auth.ts` `/signup`: normalize before the `findUnique` existence check AND
    before `user.create`.
  - `auth.ts` `/login`: normalize before `findUnique`.
  - `auth.ts` `/forgot-password`: already lowercases — switch to the shared
    helper for consistency.
  - `authGoogle.ts`: already lowercases (`payload.email.toLowerCase()`) — switch
    to the helper.
  - `import.ts`: check whether restore matches on email; if so, normalize there
    too.
- **Existing mixed-case rows:** add a one-off protected cleanup endpoint OR a
  note in STATE.md for a manual Prisma-studio fix. Check prod first: if the
  owner's account is the only real one and it's already lowercase, skip the
  migration entirely (document that decision). If duplicates exist
  (same email differing only by case), DO NOT auto-merge — surface and stop.

### 1b. Invalidate other sessions on password change/reset

- Prod sessions live in the Postgres `session` table (connect-pg-simple; the
  row's `sess` JSON contains `userId`). Dev uses MemoryStore (skip silently).
- Implement `async function destroyOtherSessions(userId: string, currentSid?: string)`
  in `backend/src/lib/sessions.ts`:
  - Postgres path: `DELETE FROM "session" WHERE sess::jsonb->>'userId' = $1 AND sid <> $2`
    via `prisma.$executeRawUnsafe` (parameterized) — the table is not in the
    Prisma schema, raw SQL is expected here. Guard with the same
    `DATABASE_URL?.startsWith('postgres')` check as `index.ts`.
  - No-postgres path: no-op (dev restart clears memory anyway).
- Call it after: successful `/change-password`, successful `/reset-password`
  (there is no current sid — destroy ALL sessions for the user; they log in
  fresh), and (optional, decide) after PIN disable.
- `req.sessionID` gives the current sid in `/change-password` so the active
  session survives.

### 1c. Per-account login lockout

- Reuse the existing kvStore lockout in `auth.ts` (`cpIsLocked`/`cpRecordFail`/
  `cpClear`, currently used for change-password + PIN) with a new namespace
  `login:<normalizedEmail>`.
- On `/login`: check lock BEFORE bcrypt compare → 429 with the existing
  "Demasiadas tentativas" message shape; record fail on wrong password AND on
  Google-only-account attempts; clear on success.
- Key on email (not userId) so unknown-email attempts can't be used to probe
  account existence via timing of the lock check — check the lock for every
  request regardless of whether the user exists.
- Keep limits consistent with CP_MAX=5 / 15 min. IP limiter stays as-is
  (defence in depth).

### Acceptance (WS1)

- Signup with `Foo@X.com` then login with `foo@x.com` works (same account).
- Password reset kills a second logged-in browser's session (verify manually on
  a Neon branch or trust the SQL + log output).
- 6th wrong password on one account → 429 even from a different IP (simulate:
  in dev, temporarily set IS_PROD-like max or call the helper directly in a
  test script). tsc + build clean.

---

## WS2 — Cron infra + Auto-Euribor

Foundation for WS3/WS4 + kills the last manual chore in the loan module.

### 2.1 Cron endpoint infra (build once)

- New router `backend/src/routes/cron.ts`, mounted at `/api/cron` in
  `index.ts` **before** rate limiters or with its own exemption (Vercel cron
  calls come from Vercel infra; the general apiLimiter at 300/15min is fine —
  don't exempt, just don't put it behind authLimiter).
- Auth: require header `Authorization: Bearer ${process.env.CRON_SECRET}`;
  405/401 otherwise. Also accept `x-vercel-cron: 1` **only in combination with**
  the secret (belt and braces — the secret is the gate).
- One dispatcher endpoint: `POST /api/cron/daily` (Vercel Hobby allows limited
  cron jobs with daily granularity — ONE daily job dispatches everything):
  ```ts
  // pseudocode
  const today = new Date() // UTC; PT is UTC+0/+1 — day-of-month logic is safe
  await fetchAndStoreEuribor()            // WS2 (every run)
  await evaluatePushNotifications()       // WS3 (no-op until built/configured)
  if (today.getUTCDate() === 1) await sendMonthlyDigests()  // WS4
  ```
  Each task in its own try/catch — one failure must not kill the others; report
  `{ ok, tasks: { euribor: 'ok'|'skipped'|'error: …', … } }`.
- `vercel.json` addition:
  ```json
  "crons": [{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }]
  ```
  Note: Vercel cron GETs the path — make the route accept GET (Vercel sends GET;
  keep POST too for manual triggering via curl).
- Env: `CRON_SECRET` (owner sets in Vercel; generate `openssl rand -hex 32`).
  Unset → endpoint returns 503 and does nothing (gate pattern).

### 2.2 Auto-Euribor fetch

- **Source:** Euribor rates are published by EMMI but freely mirrored. Use the
  ECB SDW/`data-api.ecb.europa.eu` if it carries Euribor, else a public mirror
  (e.g. `euribor-rates.eu` unofficial endpoints are scrape-y — prefer an
  official/stable source; **investigate at build time and document the choice**
  in `docs/decisions/loan.md`). Required tenors: **3M, 6M, 12M** (PT mortgages
  revise on these).
- **Storage (additive schema, BOTH schemas):**
  ```prisma
  model EuriborRate {
    id        String   @id @default(cuid())
    tenor     String   // "3m" | "6m" | "12m"
    date      String   // "YYYY-MM-DD" (rate's value date)
    value     Float    // percent, e.g. 2.152
    createdAt DateTime @default(now())
    @@unique([tenor, date])
  }
  ```
  Global table (not per-user) → **exclude from export.ts/import.ts** (it's
  public market data, not user data — note the exclusion in both files'
  comments, same pattern as DeletionLog).
- Fetch task upserts today's (or latest published) value per tenor. Idempotent
  via the unique constraint.
- **Loan linkage:** add nullable `Loan.euriborTenor String?` (additive, both
  schemas, export/import whitelists). UI: loan setup form gains a tenor select
  (3/6/12 meses; default null = "manual" — existing behaviour unchanged).
- **Revision projection endpoint:** `GET /api/loan/:id/revision` →
  ```
  { nextRevisionYm, currentRate, latestEuribor, projectedRate,
    currentPayment, projectedPayment, deltaMonthly }
  ```
  Next revision date = anniversary walk from `dataInicio` by tenor (6M tenor →
  revisions every 6 months from the end of `mesesFixos`). Projected payment =
  run the existing `loanEngine` with euribor overridden to the latest stored
  value from the loan's tenor. **Only when `euriborTenor` is set.**
- **UI:** Loan page shows a "Próxima revisão" card when tenor is set:
  date + projected new payment + delta (i18n ns `loan`, pt+en). Use existing
  card/KPI styles; theme tokens only.
- **Do NOT auto-write `loan.euribor`** on fetch in v1 — the engine keeps the
  user-confirmed rate; the card shows the *projection*. (Auto-apply at revision
  date is a v2 decision — log as open thread.) This avoids silently changing
  the user's amortization math.

### Acceptance (WS2)

- `curl -X POST -H "Authorization: Bearer $CRON_SECRET" localhost:4000/api/cron/daily`
  → euribor rows appear; second run same day → no duplicates.
- Unset `CRON_SECRET` → 503.
- Loan with `euriborTenor: "6m"` + a stored rate shows the revision card with a
  plausible delta; loan without tenor shows nothing and behaves exactly as
  before. Both schemas updated; export excludes EuriborRate; tsc clean.

---

## WS3 — Web Push notifications + reminders

### 3.1 Service-worker strategy switch (prerequisite)

- Current: `vite-plugin-pwa` **generateSW** — cannot host push listeners.
  Switch to **injectManifest**: create `frontend/src/sw.ts` that (a) reproduces
  the current Workbox behaviour — precache manifest, `/api` NetworkOnly — and
  (b) adds `push` + `notificationclick` listeners.
  ```ts
  // frontend/src/sw.ts (sketch)
  import { precacheAndRoute } from 'workbox-precaching'
  import { registerRoute } from 'workbox-routing'
  import { NetworkOnly } from 'workbox-strategies'
  declare let self: ServiceWorkerGlobalScope
  precacheAndRoute(self.__WB_MANIFEST)
  registerRoute(({ url }) => url.pathname.startsWith('/api'), new NetworkOnly())
  self.addEventListener('push', (e) => {
    const d = e.data?.json() ?? {}
    e.waitUntil(self.registration.showNotification(d.title ?? 'Wallet360', {
      body: d.body, icon: '/pwa-192x192.png', badge: '/pwa-192x192.png',
      data: { url: d.url ?? '/' },
    }))
  })
  self.addEventListener('notificationclick', (e) => {
    e.notification.close()
    e.waitUntil(self.clients.openWindow(e.notification.data?.url ?? '/'))
  })
  ```
  vite.config.ts: `strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts'`.
  **Verify the precache still works** (build → `dist/sw.js` contains the
  manifest; app loads offline-shell as before). This is the riskiest step —
  do it as its own commit.

### 3.2 Subscription storage + endpoints

- Schema (additive, BOTH schemas; **exclude from export/import** like
  WebAuthnCredential — device-bound, not portable):
  ```prisma
  model PushSubscription {
    id        String   @id @default(cuid())
    userId    String
    endpoint  String   @unique
    p256dh    String
    auth      String
    createdAt DateTime @default(now())
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  }
  model NotificationPreference {
    id                 String  @id @default(cuid())
    userId             String  @unique
    pushPayment        Boolean @default(true)   // prestação due
    pushEuribor        Boolean @default(true)   // revision impact
    pushImportReminder Boolean @default(true)   // monthly statement nudge
    emailMonthlyDigest Boolean @default(true)   // WS4 (opt-OUT model)
    user               User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  }
  ```
  NotificationPreference IS user data → include in export/import whitelists.
- Backend: `npm i web-push -w backend`. New `backend/src/routes/push.ts`
  (requireAuth, mounted `/api/push`):
  - `GET /vapid-key` → `{ key }` (public VAPID key; 503 if unconfigured). No
    build-time env needed on the frontend.
  - `POST /subscribe` `{ endpoint, keys: { p256dh, auth } }` → upsert by
    endpoint (userId-scoped).
  - `DELETE /subscribe` `{ endpoint }` → delete own subscription.
  - `GET|PUT /prefs` → read/update NotificationPreference (upsert on first
    read with defaults).
- Env gate: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
  (`mailto:privacy@wallet360.pt`). Generate:
  `npx web-push generate-vapid-keys`. Unset → `/vapid-key` 503 and the whole
  Settings block hides.

### 3.3 Notification evaluation (runs inside WS2's daily cron)

`backend/src/lib/notifications.ts` → `evaluatePushNotifications()`:

- **Prestação due (pushPayment):** for each user with subscriptions + prefs on:
  loans → next payment day is derived from `dataInicio`'s day-of-month; also
  fixed expenses with `day` set and `loanId` null. Send the day BEFORE:
  "Amanhã: prestação Casa — €1.120". Dedup: don't re-send the same
  (user, loanId, ym) — track in-memory is useless on serverless → add a sent-log
  table OR make it deterministic: cron runs once daily, condition
  `paymentDay - 1 === todayDay` fires exactly once per month by construction.
  **Choose the deterministic condition; no sent-log table needed.** Handle
  month-length edges (payment day 31 in a 30-day month → clamp like the loan
  engine does; day 1 → notify on the last day of the previous month).
- **Euribor revision (pushEuribor):** requires WS2. When a loan's next revision
  is exactly 14 days away: "A tua prestação deve passar de €X para €Y em
  <mês>." Deterministic by date-diff === 14.
- **Import reminder (pushImportReminder):** if user has ≥1 past statement
  import (`Income/Expense.source != null` exists) AND none dated in the current
  month AND today is the 5th: "Ainda não importaste o extrato de <mês>."
- Sender helper: iterate the user's PushSubscriptions; on 404/410 from the push
  service, delete the dead subscription row. Batch users with `findMany` +
  `Promise.allSettled`; keep total under the 30s budget (fine at current scale;
  add a `take/skip` loop for future-proofing).
- All notification copy: pt/en via the user's stored language, from a backend
  dictionary module `backend/src/lib/notifyCopy.ts` (`{ pt: {...}, en: {...} }`).

### 3.4 Frontend UX

- Settings → Preferências → new "Notificações" section
  (`components/settings/NotificationsSection.tsx`):
  - If `/api/push/vapid-key` 503s OR no SW/Push support → hide entirely.
  - Enable flow: button "Ativar notificações" → `Notification.requestPermission()`
    → `registration.pushManager.subscribe({ userVisibleOnly: true,
    applicationServerKey: <vapid key as Uint8Array> })` → POST /subscribe.
  - Three toggles (prestação / Euribor / lembrete de importação) → PUT /prefs.
  - Show per-device status; "Desativar neste dispositivo" → unsubscribe + DELETE.
- i18n ns `settings`: keys under `notifications.*` (pt+en parity).
- iOS caveat: Web Push needs the PWA installed (iOS ≥16.4); show a hint line
  when `!window.matchMedia('(display-mode: standalone)')` on iOS.

### Acceptance (WS3)

- Build passes with injectManifest; offline shell still loads; `/api` never
  cached.
- With VAPID env set locally: subscribe in the browser, trigger
  `POST /api/cron/daily` with a loan whose payment day is tomorrow → OS
  notification appears; click → app opens at `/loan`.
- Dead-subscription cleanup: delete the subscription in devtools, re-run cron →
  row removed, no crash. Both schemas + export/import updated (prefs in,
  subscriptions out). Docs: decision log in `docs/decisions/` (new file
  `notifications.md`).

---

## WS4 — Automatic monthly email digest (zero user config)

**Model: opt-OUT.** Every user with an email gets the digest for months where
they have data; a one-click unsubscribe link + a Settings toggle
(`NotificationPreference.emailMonthlyDigest`, default true — table from WS3;
if WS4 ships first, create the table here with the same shape).

### 4.1 Sending infra

- Extend `backend/src/lib/email.ts`: extract the transporter; add
  `sendMonthlyDigestEmail(to, lang, data)`. Keep the console fallback when SMTP
  unset (gate pattern).
- **Owner prerequisite (surface in STATE.md):** `SMTP_HOST/USER/PASS/FROM` are
  NOT currently set in Vercel — digests (and password resets!) only console-log
  in prod today. Recommend a transactional provider (Resend/Brevo/Postmark)
  SMTP creds; pairs with the existing privacy@wallet360.pt mailbox task.

### 4.2 Digest content (compute per user, previous calendar month)

Reuse existing engines — do NOT reimplement math:
- **Budget:** plan vs real for the closed month (same aggregation the Análise
  tab uses — check `frontend/src/lib/budgetReal.ts` for the semantics and
  mirror them backend-side, or compute from the same Prisma queries
  `budget.ts` uses): income real, expenses real, month balance, top 3 expense
  categories, delta vs plan.
- **Portfolio:** current total value + invested + gain/loss (DB values as of
  send time; fine for v1 — no snapshot table).
- **Loan:** outstanding, % paid, next payment; if WS2 shipped and a revision
  falls in the next 60 days, include the projection line.
- **Wedge:** one line from `/api/simulate/compare` defaults if the user has
  loan+assets: "Investir €X rende ~€Y vs €Z poupados a amortizar."
- Skip sections with no data; skip the email entirely if the user has NO data
  at all (fresh signups) or is a demo account (`isDemo`).

### 4.3 Template + unsubscribe

- Inline-styled HTML like the reset email (email clients: no external CSS, no
  theme tokens — use the light-palette hexes; this is the one place hardcoded
  colours are allowed, note it in the file).
- pt/en from `PortfolioSettings.language` via a backend copy dictionary
  (share `notifyCopy.ts` structure).
- Footer: "Recebes este resumo mensal porque tens conta na Wallet360." +
  unsubscribe link: `GET /api/email/unsubscribe?u=<userId>&sig=<hmac>` where
  `sig = HMAC-SHA256(userId, SESSION_SECRET)` — no login needed, sets
  `emailMonthlyDigest=false`, responds with a tiny confirmation HTML page
  (pt). Constant-time compare on the sig.
- Settings → Preferências → Notificações gains the "Resumo mensal por email"
  toggle (same section as WS3).

### 4.4 Scheduling

- Runs from WS2's dispatcher on day 1 (UTC). Iterate users in pages of ~50
  (`Promise.allSettled` per page) to stay under 30s; if user count ever makes
  this tight, split into a queued follow-up call (`?page=N`) — note as
  future-proofing comment, don't build it now.

### Acceptance (WS4)

- Local run with SMTP unset: cron on a simulated day-1 logs one rendered digest
  per seeded user to console; demo users skipped; user with
  `emailMonthlyDigest=false` skipped.
- Unsubscribe link with valid sig flips the flag and renders confirmation;
  tampered sig → 400. Numbers in the digest match the Análise tab for the same
  month (manual check with the demo account). i18n: pt and en renders both
  correct.

---

## WS5 — "Fecho do mês" (month-in-review ritual) — frontend-only

Goal: the monthly statement import becomes a rewarding ritual, not a chore.

- **Trigger:** after a successful statement import
  (`ImportStatementModal` success path) AND ALSO reachable anytime via a
  "Fecho do mês" button on the Budget Análise tab (so users who don't import
  can still get it).
- **New component** `frontend/src/components/budget/MonthCloseModal.tsx`
  (full-screen modal, mobile-first, swipe/next-button through 4–5 cards):
  1. **Saldo do mês** — income real, expenses real, balance, vs plan delta
     (green/red). Data: same queries the Análise tab already uses (react-query
     cache will usually be warm).
  2. **Top categorias** — top 3 expense categories + biggest single movement.
  3. **Variação vs mês anterior** — spending delta % vs previous month
     ("Gastaste −12% em Restauração 🎉" — no, NO emoji-as-icon: use Icon set;
     text stays plain).
  4. **Património** — portfolio value + monthly delta, loan outstanding delta
     (both from existing endpoints).
  5. **Streak** — consecutive months with ≥1 import (compute from distinct
     `source`-months in Income/Expense; no schema — derive client-side from the
     movements query or add a tiny `GET /api/budget/import-months` returning
     distinct YMs).
- Confetti/celebration: keep it subtle — a checkmark animation with existing
  CSS; no new deps.
- Dismiss state: `localStorage['w360:monthClose:<ym>'] = 'seen'` → auto-open
  only once per month per device (manual button always works).
- i18n ns `budget`, keys under `monthClose.*` (pt+en).
- Charts inside the modal (if any) must use `useChartColors()` deps rule
  (see traps in STATE.md).

### Acceptance (WS5)

- Import a statement in dev → modal auto-opens with correct numbers (cross-check
  vs Análise); reload → doesn't re-open; button on Análise reopens it.
- Works in dark mode (token-only colours); pt+en parity; tsc clean.

---

## WS6 — Assistente IRS: mais-valias (annual capital-gains report)

**Positioning:** the Anexo J (quadro 9.2A) helper for PT retail investors using
foreign brokers (T212/DEGIRO/XTB…). The app already stores buy/sell history.

### 6.1 Data reality check (do this FIRST)

Read `backend/prisma/schema.prisma` (`ImportedTxn`, `PortfolioAsset`,
`AssetFlow`/flows model — verify exact names/fields) and
`frontend/src/lib/trading212Parser.ts`. The CSV import path stores per-order
transactions (`ImportedTxn`, deduped by orderId) — confirm it keeps: side
(buy/sell), ISIN, qty, price, currency, EUR value, executed date. **If sells'
per-lot data is aggregated away before storage, the engine below works off
`ImportedTxn` rows directly — that's the expectation. If `ImportedTxn` turns
out to be dedup-keys-only (no amounts), STOP and extend the import to store the
needed fields (additive columns) before building the engine.**

### 6.2 FIFO realized-gains engine

- `backend/src/lib/capitalGains.ts` (pure, unit-testable):
  ```ts
  type Lot = { date: string; qty: number; unitCostEur: number }
  type Sale = { date: string; qty: number; unitProceedsEur: number; isin: string }
  type RealizedGain = {
    isin: string; symbol?: string; name?: string
    acquiredDate: string; soldDate: string; qty: number
    costEur: number; proceedsEur: number; gainEur: number
  }
  function computeRealizedGains(txns: ImportedTxnLike[], year: number): RealizedGain[]
  ```
- **FIFO matching per ISIN** (PT law mandates FIFO for securities — CIRS
  art. 43.º/6.º-D; put the legal reference in a comment). A sale consumes the
  oldest lots first; one sale can produce MULTIPLE RealizedGain rows (one per
  consumed lot) — that's what Anexo J wants (per acquisition-date rows).
- Edge cases: partial lots (fractional shares — T212 has them), sells with no
  matching buy in the data (imported mid-position) → flag the row as
  `incomplete: true` with cost 0 and a UI warning "aquisição anterior aos dados
  importados — completa manualmente"; multiple currencies → all stored values
  are already EUR (verify; if native-currency, convert via the stored EUR
  value, never re-fetch FX for past dates in v1).
- **Year boundary:** gains belong to the SALE date's calendar year.

### 6.3 API + UI

- `GET /api/portfolio/capital-gains?year=2026` (requireAuth) →
  `{ year, rows: RealizedGain[], totals: { proceeds, cost, gain },
     estimatedTax: gain > 0 ? gain * 0.28 : 0, incompleteCount }`
  (28% autonomous rate; note the englobamento option in the disclaimer, don't
  compute it).
- Frontend: new section on the Portfolio page (collapsible card, like RISK):
  "IRS — Mais-valias" with a year selector (years present in the data),
  the totals, estimated tax, and the per-row table (acquired date/value, sold
  date/value, gain — the Anexo J quadro 9.2A column order). Buttons:
  **Export CSV** (reuse `lib/csvExport.ts` guards) and **Print/PDF** (v1 =
  `window.print()` with a print stylesheet for the card; no PDF lib).
- **Disclaimer (mandatory, visible):** "Esta simulação não constitui
  aconselhamento fiscal. Confirma os valores com um contabilista / no e-fatura
  Portal das Finanças." (pt+en; i18n ns `portfolio`, keys `irs.*`).
- Empty state: no sells in data → StateBlock explaining what will appear here
  once sells are imported.

### Acceptance (WS6)

- Unit-test the engine in a script (scratchpad or `backend/scripts/`): a
  synthetic sequence — buy 10 @ €10 (Jan), buy 10 @ €20 (Feb), sell 15 @ €30
  (Nov) → two rows: 10 units gain €200 (lot 1) + 5 units gain €50 (lot 2);
  totals €250; tax €70. Fractional and incomplete-lot cases covered.
- Real check: the owner's imported T212 history renders without crashes;
  `incompleteCount` surfaces mid-position imports honestly.
- No schema change (or, if 6.1 forced columns: additive, both schemas,
  export/import updated). Decision log: `docs/decisions/portfolio.md`.

---

## WS7 — Modo Casal (household v1: shared read-only overview)

**v1 scope decision (deliberate, log it):** two members, ONE household per
user, **aggregate-level sharing only** — each member sees combined + per-member
module totals, NEVER the partner's transaction/line-item detail. No
cross-editing. Line-item sharing / >2 members / roles = v2, out of scope.

### 7.1 Schema (additive, BOTH schemas)

```prisma
model Household {
  id        String            @id @default(cuid())
  name      String            @default("A nossa casa")
  createdAt DateTime          @default(now())
  members   HouseholdMember[]
  invites   HouseholdInvite[]
}
model HouseholdMember {
  id          String    @id @default(cuid())
  householdId String
  userId      String    @unique          // one household per user (v1)
  joinedAt    DateTime  @default(now())
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
}
model HouseholdInvite {
  id          String    @id @default(cuid())
  householdId String
  tokenHash   String    @unique          // sha256 of the raw token (like PasswordResetToken)
  expiresAt   DateTime
  used        Boolean   @default(false)
  createdAt   DateTime  @default(now())
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)
}
```
- **Export/import: EXCLUDE all three** (cross-user data can't be restored into
  a single-user backup; note in both files). User deletion cascades member/
  invites; a household whose last member leaves is deleted (handled in code).

### 7.2 API — `backend/src/routes/household.ts` (`/api/household`, requireAuth)

- `GET /` → own membership: `{ household: { id, name, members: [{ name }] } | null }`
  (partner's NAME only — never email/id).
- `POST /` → create household (400 if already a member) + return it.
- `POST /invites` → member-only; mint raw token (32B hex), store sha256, 7-day
  expiry, single-use; return `{ link: `${APP_ORIGIN}/casal/aceitar?token=…` }`.
  Cap: max 3 unused invites per household (spam guard).
- `POST /join` `{ token }` → validate hash+expiry+unused; 409 if requester is
  already in a household OR household is full (2 members); join + mark used.
- `DELETE /membership` → leave; if household now empty, delete it.
- `GET /overview` → membership-checked aggregate across BOTH members' userIds:
  ```
  { members: [{ name, portfolioValue, loanOutstanding, monthlyBalance }],
    combined: { portfolioValue, invested, gainLoss,
                loanOutstanding, loanNextPaymentTotal,
                monthlyIncome, monthlyExpenses, monthlyBalance } }
  ```
  Compute by reusing the same queries/engines the individual pages use
  (loan engine KPIs, portfolio sums, budget summarize) — per member, then sum.
  **This endpoint is the ONLY place data crosses users; keep every other route
  strictly session-user-scoped.** No caching in v1.

### 7.3 Frontend

- Settings → Conta → "Modo Casal" block (`components/settings/HouseholdSection.tsx`):
  create household / show partner name / copy-invite-link (with expiry note) /
  leave (confirm dialog).
- Join route `/casal/aceitar` (`pages/HouseholdJoin.tsx`): logged-in → shows
  who invited ("Convite para partilhar finanças") + Aceitar/Recusar; logged-out →
  redirect to signin with `?next=`.
- New page `/casal` (`pages/Household.tsx`), nav-gated: link appears in the
  "Gestão" area only when membership exists. Content: combined KPI cards
  (mirror Overview card styles), per-member breakdown table, and — if both
  members have loans+assets — a combined wedge line. Empty/error via StateBlock.
- i18n: new namespace `household` (register it in the i18n init + both locale
  folders; follow `docs/decisions/i18n.md` for the namespace checklist).
- Icons: reuse existing set; add a `users`/`heart` line icon to `Icon.tsx` if
  none fits (follow the 18-icon style: 1.5px stroke, monochrome).

### 7.4 Privacy notes (must-do)

- The privacy policy page needs a paragraph on household sharing (what the
  partner sees: aggregates only). Update `pages/legal/*` pt text + flag EN as
  part of the existing EN-legal-pages task.
- `GET /overview` must never return emails, ids, or line items — only names +
  numbers. Code-review this endpoint specifically.

### Acceptance (WS7)

- Two dev accounts: A creates + invites, B joins via link → both see `/casal`
  with identical combined numbers = sum of their individual pages.
- B leaves → A sees "sem par" state; household with 0 members is gone (check
  DB). Invite reuse → 409; expired → 400; third member → 409.
- Export of A contains NO household tables; deleting B's account leaves A
  functional (membership cascade). Both schemas in sync; tsc clean.
  Decision log: new `docs/decisions/household.md`.

---

## WS8 — Vite major upgrade (dev-only advisories)

- Current: vite 5.4.x. `npm audit` flags dev-server-only issues fixed in ≥6.
- Steps: bump `vite` + `@vitejs/plugin-react` + `vite-plugin-pwa` to their
  mutually-compatible latest majors in `frontend/package.json`; read each
  major's migration notes (vite 6 + 7: Node ≥18/20, `manualChunks` API
  unchanged; vite-plugin-pwa needs the version matching vite major).
- Verify: `npm run dev` (HMR ok), `npm run build` (chunks still split, PWA
  precache generated, **if WS3 shipped: injectManifest still compiles sw.ts**),
  bundle sizes comparable (no >500 KB warning).
- Run `npm audit` after → the esbuild/vite advisories must be gone.
- No app code changes expected; if the plugin-pwa major changes config keys,
  adjust `vite.config.ts` + `pwa-assets.config.ts` only.

---

## Owner prerequisites (env vars — features gate OFF without them)

| Var | Enables | How |
|-----|---------|-----|
| `CRON_SECRET` | WS2/3/4 scheduling | `openssl rand -hex 32` → Vercel |
| `SMTP_HOST/USER/PASS/FROM` | WS4 digests + existing reset emails in prod | transactional provider (Resend/Brevo) |
| `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` | WS3 push | `npx web-push generate-vapid-keys` |
| `SENTRY_DSN`, `VITE_SENTRY_DSN`, `UPSTASH_*`, `BROKER_ENC_KEY` | already-shipped gated features | see STATE.md Next steps #1 |

---

_Update this file's WS status lines as workstreams ship; keep STATE.md's
Next steps pointing here instead of duplicating the detail._
