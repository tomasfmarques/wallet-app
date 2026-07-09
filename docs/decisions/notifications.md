# Decisions — Notifications (Web Push + reminders)

## 2026-07-08 — WS3: Web Push notifications (roadmap spec WS3)

Shipped per [`../roadmap-2026-07-spec.md`](../roadmap-2026-07-spec.md).
**Env-gated on `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`**
(generate: `npx web-push generate-vapid-keys`; subject =
`mailto:privacy@wallet360.pt`). Unset → `/api/push/vapid-key` 503, the
Settings section hides itself entirely, and the cron task reports "skipped".

### Service worker: generateSW → injectManifest (`1069041`, own commit)

- `frontend/src/sw.ts` is now the SW source (vite-plugin-pwa
  `strategies: 'injectManifest'`). It reproduces the old generateSW behaviour
  1:1 — precache manifest, SPA `NavigationRoute` with `/api` denylist,
  NetworkOnly `/api` GET, CacheFirst Google Fonts, `cleanupOutdatedCaches`,
  `skipWaiting()`+`clientsClaim()` (= registerType autoUpdate) — and adds the
  `push` + `notificationclick` listeners (the whole reason for the switch:
  generateSW cannot host listeners).
- **Keep caching changes in sw.ts now, not vite.config.ts** — the `workbox:{}`
  config block is gone; only `injectManifest.globPatterns` remains there.
- Verified: build emits the same 26 precache entries as before the switch.
- `notificationclick` focuses an existing tab (navigating it) before opening a
  new window. Payload shape: `{ title, body, url }`.

### Schema (additive, `add_push_and_notification_prefs`, BOTH schema files)

- `PushSubscription` (endpoint unique, p256dh, auth) — device-bound like
  passkeys → **EXCLUDED from export/import**; cascade-dies with the user.
- `NotificationPreference` (1:1 user; `pushPayment`/`pushEuribor`/
  `pushImportReminder`/`emailMonthlyDigest`, all default TRUE — the digest is
  **opt-out** by design) — user data → **included in export/import**.

### API (`routes/push.ts`, requireAuth)

- `GET /vapid-key` (503 when gated — the frontend probe), `POST /subscribe`
  (upsert by endpoint; validates https + length caps; an endpoint that changed
  hands moves owner), `DELETE /subscribe` (own rows only), `GET|PUT /prefs`
  (upsert-with-defaults on first read; PUT takes any subset of the 4 booleans).

### Daily evaluation (`lib/notifications.ts`, runs inside `/api/cron/daily`)

- **Dedup model = deterministic calendar conditions, NO sent-log table.** The
  cron runs once/day; each rule fires on exactly one day per cycle:
  1. **Payment due** — fixed ACTIVE expenses with `dayOfMonth === tomorrow`
     (month-end wraps to day 1). **Deviation from spec:** the spec said to
     derive the day from `Loan.dataInicio`, but dataInicio is "AAAA-MM" — there
     IS no day-of-month on loans; the linked fixed expense's `dayOfMonth` is
     the only real day the data has (loan-linked expenses show the prestação).
  2. **Euribor revision** — fires on **day 1 of the revision month itself**
     (`projectRevision().nextRevisionYm === nowYm`), when the bank's reference
     average (previous month, per WS2) is final → most accurate projection.
     Deviation from the spec's "14 days before": revisions are month-granular.
  3. **Import reminder** — day 5, has past imports (`source != null`), none
     scoped to the current month (`startYm === nowYm`).
- Only users with ≥1 subscription are evaluated; per-user try/catch; copy from
  `lib/notifyCopy.ts` (pt/en via `PortfolioSettings.language`, fallback pt).
- Sender prunes dead subscriptions on 404/410; other failures are logged and
  the subscription kept (e.g. transient push-service errors).

### Settings UI (`components/settings/NotificationsSection.tsx`)

- Under Preferências, between Theme and Language. **Renders its own heading**
  so heading+card hide together when gated/unsupported. Enable flow:
  permission → `pushManager.subscribe` (VAPID key fetched from the API — no
  build-time env) → POST. Four topic checkboxes (optimistic + revert), a
  "Desativar neste dispositivo" button, and an iOS hint when not standalone
  (iOS ≥16.4 only delivers push to installed PWAs). i18n
  `settings:notifications.*` pt+en.

### Verify limitation

Real delivery (OS notification) needs a real browser subscription against
FCM/Mozilla — not reproducible headlessly. Verified instead: routes (503 gate,
prefs persistence, subscribe validation/upsert, devices count), the cron
evaluation matching the due-tomorrow expense and attempting delivery through
web-push's encryption path (fake key fails at encryption, caught + logged, run
unaffected), and the Settings UI render. **First real-device test happens after
the owner sets the VAPID env vars in Vercel.**

### Don't

- Don't move caching config back to vite.config.ts (`workbox:{}` is dead).
- Don't add a sent-log table "to be safe" — the determinism IS the dedup; a
  second cron schedule on the same day is the thing to avoid instead.
- Don't export PushSubscription rows; don't restore them on import.

### Code-review fixes folded in before ship

- **Live prestação in payment pushes:** `loanPrestacoes`/`syncedAmount` were
  hoisted from `routes/budget.ts` into **`lib/loanSync.ts`** (shared) — a
  loan-linked expense's push now quotes the SAME live prestação the Budget page
  shows, not the stale stored `amount`. Don't reintroduce a local copy in
  budget.ts (that drift is exactly what caused the bug).
- **Shared-device ownership guard:** `GET /api/push/prefs` returns the user's
  own `endpoints[]`; the Settings section only shows "subscribed" when the
  browser's local subscription endpoint is among them (a previous user's
  leftover shows "Ativar" — enabling re-claims the device). **Logout releases
  the device binding**: `useLogout` best-effort DELETEs + unsubscribes the
  local subscription BEFORE destroying the session, so finance alerts never
  keep flowing to a device someone else now controls.
- Toggle revert is functional (per-key), send-failure logs are terse (no
  push-service response dumps).

## 2026-07-09 — WS4: automatic monthly email digest

Roadmap WS4. **Zero user config, opt-OUT** (`NotificationPreference.
emailMonthlyDigest`, default true — toggle shipped with WS3's Settings
section; plus a session-free unsubscribe link in every email). No schema
change (the prefs table came with WS3).

- **Pipeline:** `/api/cron/daily` runs `sendMonthlyDigests()` on **day 1**
  (UTC) — or any day via `?force=digest` (still Bearer-gated; owner testing +
  missed-run recovery). Paged user loop (50/page), per-user try/catch, skips:
  demo accounts, opted-out, and users with zero data.
- **Content** (`lib/digest.ts` → `buildDigestData`): previous calendar month.
  Budget block mirrors **frontend `budgetReal.ts` semantics** — actuals
  (source + startYm === month) + folded recurring FIXED plan rows not
  represented by a same-merchant actual; variable = actuals only; plan-only
  fallback with a "sem extrato importado" note. Loan-linked amounts via
  `lib/loanSync` (live prestação). Plan-net line for comparison. Top-3 expense
  categories. Portfolio value/invested/gain. Per-loan outstanding/%/payment +
  the WS2 revision projection when ≤2 months away. **Wedge line deferred to
  v2** — the compare engine lives inline in `routes/simulate.ts` (not
  callable); extract it first if the line is wanted.
- **merchantKey moved VERBATIM to `lib/merchantKey.ts`** (byte-identical —
  verified programmatically) so the digest reuses it without importing a
  router; the frontend-parity trap (CLAUDE.md #3) now points there.
- **Email** (`lib/email.ts` → `sendMonthlyDigestEmail`): inline-styled HTML +
  plain-text alt, pt/en via `notifyCopy` digest keys, locale-aware EUR
  formatting. This file is the ONE sanctioned home of hardcoded colours
  (email clients can't read CSS vars). Console fallback when SMTP unset.
- **Unsubscribe** (`routes/email.ts`, `GET /api/email/unsubscribe?u&sig`,
  **no session**): HMAC-SHA256 of `digest-unsub:<userId>` under
  `SESSION_SECRET`, constant-time compare; flips the pref via upsert; answers
  with a tiny standalone pt HTML page. `email.ts` imports `DigestData` as a
  **type-only import** — don't turn it into a value import (circular require).
- **Verified:** builder output hand-checked against demo data (folded salary,
  June actuals, top categories, live prestação); pt render via console
  fallback incl. unsubscribe URL; tampered sig → 400; valid sig → page + pref
  false; forced cron run: 6 sent / 6 skipped on the dev DB.
- **Owner prerequisite unchanged:** SMTP_* in Vercel (also fixes reset
  emails). Until set, prod digests only console-log.

### WS4 code-review fixes folded in before ship

- **HTML injection (blocking):** expense/category/loan names can originate
  from bank-statement imports — `escapeHtml()` in `lib/email.ts` now escapes
  every user-controlled value in the digest's HTML branch (the plain-text alt
  stays raw — no HTML context). Verified with a hostile `<img onerror>` name.
- Budget section gates on rows actually IN the month (no all-zero "Saldo do
  mês" for users whose plan starts in a future month); plaintext alt gained
  the top-categories line; `frontend/src/lib/merchant.ts`'s parity comment now
  points at `backend/src/lib/merchantKey.ts`.

## 2026-07-09 — Email/cron/push infrastructure (provider + DNS choices)

Not visible from code — recorded so nobody re-derives it. All of this is Vercel
env + external dashboards, no repo change.

- **Provider = Resend** (transactional email), account on the owner's Gmail,
  region **Ireland (eu-west-1)** to match the app's EU data residency. SMTP path
  (`smtp.resend.com:587`, user `resend`, pass = a Resend API key). The API key is
  the "Onboarding"/`wallet360-smtp` key — Resend shows a key's full value ONLY at
  creation; the list truncates it, so to rotate you CREATE a new key (can't
  re-reveal). `SMTP_FROM=noreply@wallet360.pt` (apex sender).
- **Sender domain verified via `send.wallet360.pt` subdomain records** (Resend's
  standard SES-backed setup): DKIM `resend._domainkey` TXT, SPF `send` TXT
  (`v=spf1 include:amazonses.com ~all`), MX `send` →
  `feedback-smtp.eu-west-1.amazonses.com` prio 10, DMARC `_dmarc` TXT. This
  verifies the APEX for sending (send from `@wallet360.pt`).
- **DNS lives at dominios.pt** (registrar; SolutEDNS panel at `my.dominios.pt`,
  nameservers `dns1-4.host-redirect.com`) — NOT Vercel. **Their panel requires
  TXT values wrapped in double quotes** or it errors "Content must be quoted".
- **`privacy@wallet360.pt` INBOUND is still NOT set up** — the verified records
  are for SENDING only (the `send` subdomain). Receiving mail at
  privacy@wallet360.pt (the published legal contact, Next steps #5) needs a
  separate inbound/forwarding setup. Sending as noreply@ works; receiving at
  privacy@ does not yet.
- **Verification method for SMTP going forward:** don't use the owner's
  `forgot-password` (Google-only account → no send). Use
  `GET /api/cron/daily?force=digest` with the `CRON_SECRET` bearer, then check
  Resend → Emails (SMTP sends appear there). Confirmed **Delivered** 2026-07-09.
