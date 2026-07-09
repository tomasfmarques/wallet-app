# Decisions — Modo Casal (household)

## 2026-07-09 — WS7: household v1 (aggregate-only sharing)

Roadmap WS7 ([`../roadmap-2026-07-spec.md`](../roadmap-2026-07-spec.md)).

### Scope decisions (deliberate — v2 material, do not "fix")

- **Two members max, ONE household per user** (`HouseholdMember.userId` is
  unique), **aggregate-level sharing only**: each member sees the partner's
  first NAME and module TOTALS (portfolio value/gain, loan outstanding +
  prestações, monthly income/expenses/balance) — **never line items, emails,
  ids, merchants or extratos**. Line-item sharing / >2 members / roles = v2.
- `GET /api/household/overview` is **the ONLY endpoint in the whole app where
  data crosses users** — code-review any change to it for leaks first. Every
  other route stays session-user-scoped.

### Schema (`add_household`, additive, BOTH schema files)

`Household` / `HouseholdMember` / `HouseholdInvite` (sha256 token hash like
PasswordResetToken; 7-day expiry; single-use; max 3 unused per household).
**All three EXCLUDED from export/import** (cross-user data can't restore into
a single-user backup — membership is re-created by inviting again; noted in
export.ts). User deletion cascades membership/invites; the LAST member leaving
deletes the household in code (`DELETE /membership`).

### API (`routes/household.ts`, requireAuth)

- `GET /` own membership (partner name only) · `POST /` create (400 if
  member) · `POST /invites` mint link `{APP_ORIGIN}/casal/aceitar?token=…`
  (409 full, 429 >3 unused) · `POST /join` (409 already-member/full, 400
  invalid/expired/used; join+consume in one transaction) · `DELETE
  /membership` leave.
- `GET /overview`: per member, computed with the SAME engines as the
  individual pages (loanEngine `computeKpis`, `lib/loanSync` live prestações,
  plan-only budget semantics `active+!pending+source:null`) then summed.

### Frontend

- New i18n namespace **`household`** (registered in `i18n/index.ts`
  NAMESPACES+resources — the checklist for any future namespace).
- Settings → Conta → `HouseholdSection` (create → invite link + copy →
  partner name → leave with confirm).
- `/casal/aceitar` (`HouseholdJoin`) — inside the authed layout so a
  logged-out partner passes through sign-in first. `/casal` (`Household`) —
  combined KPI cards + per-member table; non-member state points to Settings.
- **Privacy policy** gained section 3-A (pt) describing exactly what Modo
  Casal shares and that leaving ends sharing both ways. EN version rides the
  existing EN-legal-pages owner task (STATE #4).

### Verified

API: 3-account flow (create, dup-create 400, invite, join, token reuse 400,
invite-when-full 409, overview identical for both members + combined = sum,
regex leak-check for `@`/userId on the payload → clean, non-member 404, leave,
empty-household auto-delete). Browser: Settings create→invite→copy link, a
second account joined via that real link, `/casal` renders combined + per-
member table, join page renders. tsc + build clean.

### Don't

- Don't add fields to `/overview` without the leak-check mindset (names +
  numbers only).
- Don't export/import the household tables.
- Don't allow >2 members by bumping MAX_MEMBERS without revisiting the invite
  and overview semantics (v2 design work, not a constant tweak).

### WS7 review fixes folded in before ship

- **Invite token survives auth (was blocking):** AuthGuard now preserves
  `pathname + SEARCH` in the redirect state; SignUp gained the same
  `location.state.from` contract as SignIn (post-signup navigate + Google
  button `redirectTo`); the SignIn↔SignUp cross-links forward the state; the
  demo button honors `redirectTo` too. Browser-verified: logged-out invite →
  /signin → auth → back on `/casal/aceitar?token=…` → accept → `/casal`.
  **Don't** hardcode `/overview` as a post-auth destination again — read
  `location.state.from`.
- **First-name promise enforced in code** (`firstName()` in household.ts,
  both serializers) — the policy says "primeiro nome", so the API sends the
  first token of `User.name`, not whatever the signup field holds.
- **Join race narrowed:** interactive transaction re-counts members before
  inserting (two concurrent redeems of the last slot → one gets 409). A
  READ-COMMITTED double-recount race remains theoretically possible on
  Postgres — accepted at this scale, documented here.
- Dead `join.success/goSee` keys dropped; invite link is a readOnly
  select-all input; member table keys by index.
