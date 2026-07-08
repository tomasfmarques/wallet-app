# Decisions — Auth (email/password + Google Sign In)

## 2026-06-27 — Store-gating legal layer (privacy + public deletion URL + deletion log)

- **What:** the Play-store-gating legal layer. (1) **Public legal pages** served as
  plain static HTML, (2) a **DeletionLog** audit table, (3) discoverability links
  in-app. In-app account deletion already existed (`DELETE /api/me`, cascade +
  session destroy) — this adds the *public* surface + the audit trail.
- **Public pages — initial approach: static HTML** (`frontend/public/*.html`).
  **SUPERSEDED the same day → in-app React routes** (see the update at the end of this
  entry); kept here for context. The original rationale for static was: files matched by
  Vercel's filesystem layer *before* the SPA catch-all rewrite, so JS-free + crawlable.
  That was traded away for in-app/mobile UX (the user asked for "a proper web page" linked
  in-app). Both approaches are **pt-PT only for now** (EN is a follow-up; legal text is
  deliberately NOT routed through react-i18next to avoid bloating the namespaces and
  breaking the pt/en key-parity check).
- **DeletionLog model** (both schemas, migration `add_deletion_log`, **additive**):
  `emailHash` (sha256 of lowercased email), `method` (default `self-service`),
  `note?`, `deletedAt`. **Pseudonymous by design** — no PII, no financial data; a
  one-way hash so a deletion can be *verified* without retaining identity. **NOT
  linked to User** (must survive deletion) and **deliberately excluded from
  export/import** (system audit log, not user-scoped) — noted in both route files +
  the schema comment so it doesn't read as a forgotten two-schema step.
- **Wiring:** `DELETE /api/me` captures the email pre-delete, deletes the user
  (cascade), then writes the log **best-effort** (a log-write failure never fails the
  user's deletion). No read endpoint — query via Prisma Studio / Neon (no admin-auth
  concept yet).
- **Discoverability:** sign-in footer (`Privacidade · Eliminar conta`), a sign-up
  **consent line** (`Ao criar conta, aceitas a Política de Privacidade`), and a link
  from Settings → Danger Zone. New i18n keys `auth.legal.*` + `settings.danger.deletePolicy`
  (pt/en parity).
- **Published defaults (CONFIRM before Play submission):** controller =
  *Tomás Marques (individual, Portugal)*; contact = **privacy@wallet360.pt** (needs a
  live mailbox/forwarding — chosen over the personal Gmail to keep it off a public,
  indexable page); no postal address; min age 16. The user did not answer the
  identity prompt, so these are privacy-preserving defaults, easy to change (one
  constant each in the two HTML files + the `docs/legal/*.md` source-of-record).
- **Still pending here:** final legal review; EN versions of the public pages; the
  mailbox for privacy@wallet360.pt. **Email verification on signup stays deferred**
  (see below) — it was bundled with this push but is its own two-schema PR.
- **Update (same day): switched static HTML → in-app React routes.** `/privacidade`
  + `/eliminar-conta` are now public React pages (`pages/legal/*` +
  `components/legal/LegalPage.tsx`) styled with the app's design system, linked from
  sign-in, sign-up, and **Settings** via react-router `<Link>` (so they stay inside the
  SPA/PWA on mobile instead of breaking out to a static file — the reason for the
  switch). The old `.html` URLs keep working via **Vercel 301 redirects**
  (`vercel.json`); the `frontend/public/*.html` files were removed. Trade-off vs static:
  SPA-rendered (needs JS) — fine for Play (Google renders JS) and a better in-app/mobile
  experience.

## 2026-06-21 — Demo mode (ephemeral seeded account)

- **What:** a throwaway sandbox account so visitors can try the app pre-signup and
  devs can demo/test without touching real data. Entry: a **small "Try the demo"
  link** on the sign-in page + a **Demo section** in Settings → Account. Each entry
  mints a fresh ephemeral account (so concurrent demos are isolated).
- **Model:** `User.isDemo` (**additive schema**, migration `add_user_is_demo`, both
  Prisma files). Demo users have no `passwordHash` → unreachable by normal login;
  only minted via `POST /api/auth/demo`.
- **Seeding:** `backend/src/lib/demoSeed.ts` `seedDemoAccount(userId, {clearFirst?})`
  creates a curated dataset (1 mortgage, 3 portfolio assets w/ 12mo flows + settings,
  salary/freelance incomes, fixed expenses + import-style monthly *actuals* so
  Movimentos/Análise have content, 2 learned rules). Months are relative to now so it
  always looks current. Seeds **directly** (does NOT reuse/refactor the import route).
- **Endpoints** (`auth.ts`, rate-limited): `POST /demo` (lazy-GC stale demo users
  >24h via cascade delete → create ephemeral user → seed → `session.regenerate` +
  `userId` + 1-day cookie, mirroring signup) and `POST /demo/reset` (re-seed the
  current demo account; demo-only). `/api/me` gains `isDemo`.
- **Cleanup:** no cron → **lazy GC** on each `/demo` call deletes demo users older
  than 24h (cascade wipes all their data). Serverless-friendly.
- **Frontend:** `useDemoLogin`/`useDemoReset` (useAuth), `DemoSection` (open / reset
  / exit), a persistent **demo banner** in `Layout` ("temporary data · Create
  account · Exit"). Entering demo from a real account replaces the session (a
  `confirm()` warns; real data untouched — return = sign back in).
- **Browser-verified:** sign-in demo link → seeded `/overview` (income/debt/wedge),
  banner shown, `/api/me isDemo:true`; Settings shows reset/exit; reset → ok.
- **Don't:** allow demo accounts to be reachable by password login (no hash by
  design); don't skip the lazy GC (only cleanup mechanism).


_Source: split from CAVEATS-full.md._

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

## 2026-06-21 — Google silent auto sign-in + 6-digit PIN app-lock + biometrics

### Google silent auto sign-in
- `GoogleSignInButton.tsx` now sets `auto_select: true` + `use_fedcm_for_prompt: true`
  and calls `google.accounts.id.prompt()` (One Tap). A remembered account signs in
  **silently** via the existing callback; otherwise the chooser shows. The rendered
  button stays as the manual fallback.
- `useAuth.useLogout` calls `google.accounts.id.disableAutoSelect()` (via the global)
  so an explicit logout doesn't instantly re-sign the user.
- **Note:** One Tap needs a real browser Google/FedCM session — it errors in
  headless/automation (`FedCM get() NetworkError`), which is expected, not a bug.

### PIN app-lock (server-verified) + biometrics (WebAuthn)
Banking-style app-lock layered over the session. **Re-lock = launch only.**
- **Schema (additive, both Prisma files, migration `add_pin_and_webauthn`):**
  `User.pinHash` (bcrypt) + new `WebAuthnCredential` model (per device).
  **Deliberately excluded from export/import** (device+origin-bound); `User` isn't
  serialized in backup so `pinHash` needs no export change either.
- **PIN endpoints** in `auth.ts`: `/pin/set`, `/pin/verify` (rate-limited via the
  change-password lockout, keyed `pin:<userId>`; returns `lockedOut` → client logs
  out), `/pin/disable`. Re-auth reuses the password-or-session rule. `/api/me` gains
  `hasPin` + `hasBiometrics`.
- **WebAuthn** (`routes/webauthn.ts`, `@simplewebauthn/server` v13): register/auth
  options+verify, list, delete. RP id/origin from `APP_ORIGIN`; challenge on the
  session. Biometrics requires a PIN first (PIN is the fallback).
- **Frontend:** `LockProvider`/`useLock` (sessionStorage `w360:unlocked` ⇒
  launch-only), `LockGate` wrapping `Layout` inside `AuthGuard`, full-screen
  `LockScreen` (6-dot pad + biometric button + sign-out), `useSecurity` mutations
  (`@simplewebauthn/browser`), Settings → **Security** tab (`SecuritySection`).
- **Boundary:** the lock is a client gate over a still-valid session; the PIN hash
  is server-verified + rate-limited (anti-brute-force). Server-wide route
  enforcement (a `pinVerified` session flag) is intentionally out of scope.

---


## 2026-06-23 — Lock screen: fingerprint keypad key + auto-prompt on launch (`5848d4e`)

- **What:** the `LockScreen` biometric affordance moved from a separate "Use
  biometrics" text button into the **keypad's empty bottom-left cell** as a
  fingerprint SVG (accent-coloured, mirrors the ⌫ key on the bottom-right). When
  `user?.hasBiometrics`, WebAuthn is now **auto-triggered once on launch** (a
  `useRef` one-shot guard + an `auto` flag), so the user doesn't have to tap.
- **Why:** the text button was easy to miss and required an extra tap; a fingerprint
  glyph in the pad reads as "biometric unlock" instantly, and auto-prompting matches
  native banking apps.
- **Silent auto-fallback:** `tryBiometric(auto)` — on the auto attempt, a failure
  (browser needs a user gesture, e.g. Safari/iOS; or cancellation) is **swallowed**,
  no error shown, so the fingerprint key + PIN remain. Only a *manual* tap that fails
  shows the "use your PIN" hint. The `lock.biometricChecking` i18n key is now unused
  and was removed (kept pt/en parity).
- **Verify limitation:** the live passkey path can't be exercised in headless Chrome
  (registering a passkey needs a real/virtual authenticator). The key render + layout
  were browser-verified by force-rendering then reverting; the WebAuthn call itself is
  the unchanged `useWebAuthnAuth`.
- **Don't:** require a user gesture assumption — auto-trigger on load is best-effort by
  design; never remove the PIN/manual fallback.

## 2026-06-24 — Deferred: email verification on signup (until ~launch)

- **Status: PENDING / deferred on purpose.** Not built. Decision: hold it until
  shortly before opening the app to the public — it adds signup friction with no
  benefit while the user base is just the owner + demo.
- **Scope when picked up (S3/F7):** add `User.emailVerified` (Boolean, default
  false) + reuse the existing password-reset token plumbing (`PasswordResetToken`
  + `lib/email.ts` console-fallback) for a verification token; a
  `GET /verify-email?token=…` route + a small confirmation page; gate sensitive
  actions until verified. **Two-schema change + migration + export/import** —
  treat as its own focused PR with a Neon snapshot beforehand.
- **Why deferred over the cadences work:** email verification is contained but
  launch-gating (only matters with real external users); non-monthly cadences
  delivers immediate value to the owner now. Done: cadences (`add_budget_frequency`).
- **Trigger to revisit:** the pre-public legal/launch push (pairs with the
  privacy-policy + account-deletion URL work in [`../legal/`](../legal/) and
  STATE next-step #4).

## 2026-07-08 — WS1 security hardening: email casing, session invalidation, login lockout

Shipped as the roadmap's WS1 ([`../roadmap-2026-07-spec.md`](../roadmap-2026-07-spec.md)).
Backend-only, no schema change.

- **Email normalization (`lib/normalizeEmail.ts` + `lib/userLookup.ts`):**
  emails are stored/compared lowercase+trimmed at every boundary — signup
  (existence check + create), login, forgot-password, and Google sign-in.
  **The legacy fallback lives in ONE place** — `findUserByEmail()` in
  `lib/userLookup.ts` (normalized lookup, then raw-input retry when the casing
  differs) — used by all FOUR read sites: login, forgot-password, signup dedup,
  and the **Google auto-link** (main lookup + concurrent-link recovery). The
  Google site matters: without the fallback, a pre-normalization account stored
  `Foo@x.com` + a Google sign-in with that address would silently create a
  DUPLICATE Google-only user (caught in code review pre-ship). No data
  migration needed, nobody gets locked out. **Residual edge (accepted):** a legacy mixed-case row
  (`Foo@x.com`) queried with a THIRD casing (`FOO@x.com`) misses both lookups;
  a case-insensitive query would need pg-only `mode: 'insensitive'` (SQLite dev
  lacks it). Realistically zero users affected (owner account is lowercase;
  Google + demo accounts always were normalized).
- **Session invalidation (`lib/sessions.ts` → `destroyOtherSessions`):** after a
  successful change-password the user's OTHER sessions are deleted from the pg
  `session` table (raw SQL — the table belongs to connect-pg-simple, not the
  Prisma schema; `sess::jsonb->>'userId'`); the acting session survives via
  `req.sessionID`. After a reset-password ALL the user's sessions die (the reset
  flow has no session to keep). No-op off Postgres (dev MemoryStore). Failures
  are logged, never block the password change (best-effort hardening).
- **Per-account login lockout:** `/login` now uses the existing kvStore lockout
  (5 fails / 15 min, same counters as PIN/change-password) with namespace
  `login:<normalizedEmail>`. Checked for EVERY request (unknown emails too) so
  the lock check can't probe account existence; fails recorded on wrong password
  AND on password attempts against Google-only accounts; cleared on success.
  **Trade-off (deliberate):** an attacker can lock a victim's password login for
  15 min by spamming wrong passwords — acceptable for a finance app (and Google
  sign-in is unaffected). The per-IP limiter stays as defence in depth.
- **Verified:** live against the dev backend — mixed-case signup stores
  lowercase; cross-casing login works; cross-casing duplicate signup → 409;
  6th attempt after 5 fails → 429 even with the correct password and any casing.
- **Don't:** remove the raw-input fallback lookups without first migrating any
  mixed-case rows; don't key the login lockout on userId (existence probe).
