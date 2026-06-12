# Decisions — Auth (email/password + Google Sign In)

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

