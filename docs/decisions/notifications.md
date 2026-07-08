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
