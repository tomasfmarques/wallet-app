# Bank sync v2 — provider decision + build spec (Enable Banking)

_Replaces the dead GoCardless integration (see decision log in
[`decisions/budget.md`](decisions/budget.md), 2026-06-25). Researched
2026-07-15. This is the contract for the swap; the provider-agnostic flow in
`backend/src/routes/bank.ts` stays._

---

## 1. Decision

### The field (free + secure, PT coverage, usable by an individual)

| Provider | Free tier | Self-serve | PT coverage | Personal use | Verdict |
|---|---|---|---|---|---|
| **Enable Banking** (FI) | ✅ **Restricted Production** — free, real bank data, limited to accounts YOU link | ✅ sign-up + app registration, no contract | ✅ 26 PT ASPSPs — CGD, Millennium BCP (×2 connectors), Santander Totta, novobanco, BPI, Montepio, ActivoBank, BBVA, Revolut, Wise, N26… **but NOT Banco CTT** (see §1a) | ✅ designed for it (terms/KYB checks skipped in restricted mode) | **WINNER** |
| GoCardless BAD (ex-Nordigen) | — | — | — | — | ❌ **closed to new signups** (confirmed again 2026) |
| Salt Edge | Sandbox/dev role only | Partial | ✅ broad | Production needs a partner contract + KYB | Backup |
| Tink / TrueLayer / Yapily | Sandbox only | ❌ sales-led | ✅ | ❌ enterprise KYB | No |
| Plaid | Sandbox; paid EU | Partial | ⚠️ thin PT coverage | ❌ | No |
| SIBS API Market (direct) | Sandbox free | ✅ | ✅ (it IS the PT hub) | ❌ production requires **your own AISP licence** | No — non-starter for an individual |

### ⚠️ 1a. CORRECTION (2026-07-16) — Banco CTT is NOT covered

The original draft of this spec claimed Banco CTT was supported ("beta, since
2023-07", from a changelog). **That was wrong.** Verified against the live
Control Panel → ASPSP status page (the authoritative source), the 26 PT ASPSPs
are: ATLANTICO Europa, Abanca, Activo Bank, BBVA, BPG, BPI, Banco Comercial
Portugues, Bankinter, BiG, Caixa Central de Crédito Agrícola Mutuo, Caixa
Económica Montepio Geral, Caixa Económica da Misericórdia de Angra do Heroísmo,
Caixa Geral de Depósitos, Cofidis, Crédito Agrícola, Millennium BCP, N26,
PayPal, Revolut, Santander Totta, SumUp, Unicre, Wise, bunq, novobanco,
novobanco dos Açores. **Banco CTT is absent.**

**Consequence:** the owner's Banco CTT account CANNOT be synced via Enable
Banking — it stays on the **file import** path (.xlsx/CSV/PDF), which is why
that importer matters. Bank sync only helps for the banks above (BCP is the
owner's usable one).

**Note:** BCP appears TWICE — `Millennium BCP` and `Banco Comercial Portugues`
are separate connectors for the same bank. If one errors, try the other.

**Don't** re-add Banco CTT to any list without re-checking the live ASPSP status
page; changelogs are not authoritative.

### Why Enable Banking wins

- **Free where it matters:** "Restricted Production" gives **real production
  data at zero cost**, restricted to bank accounts linked by the app owner in
  their Control Panel. That is *exactly* Wallet360's current reality: the
  owner's own Banco CTT / BCP accounts. Any user can go through a bank
  authorization, but the API strips accounts that weren't explicitly linked —
  so it's structurally impossible to leak someone else's data in this mode.
- **They are the licensed TPP** — no AISP licence needed on our side (the same
  blocker that killed every "direct PSD2" option).
- **Security posture:** ISO 27001 certified; EU company (Finland); explicit
  "we do not monetize customer data" policy; auth is **per-request RS256 JWTs
  signed with a private key that only we hold** (no long-lived bearer secret
  sitting in a dashboard).
- **Ecosystem proof:** Firefly III (the reference OSS personal-finance app)
  adopted Enable Banking as its GoCardless replacement for the same reasons.
- **Fits the scaffold:** institutions → consent link → accounts → transactions
  maps 1:1 onto `bank.ts`; the shared import pipeline
  (`processImportItems`: dedup + learned rules + Por classificar) is untouched.

### The honest constraints (document in UI copy)

1. **Restricted mode = owner-linked accounts only.** Other Wallet360 users
   tapping "Ligar banco" will authenticate fine but get **zero accounts back**
   unless their accounts were linked in our Control Panel first (possible for
   household/Modo Casal by doing the link flow together). The UI must present
   bank sync as **"beta pessoal"** until a full-production agreement is signed
   (that's a commercial contract + KYB — the future "Pro" path, only worth it
   when there are real users to pay for it).
2. **Consent expiry:** PSD2 consents are bank-capped (typically 90–180 days,
   we request via `access.valid_until`); after expiry the user re-authorizes.
   Banco CTT / ActivoBank connectors are flagged **beta** — expect rough edges.
3. Sandbox apps and production apps are separate registrations; the free path
   uses a **production app activated in restricted mode** ("Activate by
   linking accounts" button) — the sandbox (mock ASPSPs) is only for local dev.

## 2. API mapping (GoCardless → Enable Banking)

Base URL `https://api.enablebanking.com`. Auth: every request carries
`Authorization: Bearer <JWT>`, where the JWT is **RS256-signed by us** with the
private key downloaded at app registration (`<app_id>.pem`), header
`kid = <app_id>`, payload `iss: "enablebanking.com"`, `aud:
"api.enablebanking.com"`, `iat/exp` (keep ≤ 24 h; sign fresh per request or
cache ~1 h). Node's built-in `crypto.createSign('RSA-SHA256')` does this —
**no new dependency** (CommonJS-safe).

| Concern | GoCardless (old) | Enable Banking (new) |
|---|---|---|
| Credentials | `secret_id`+`secret_key` → 24 h token | `APP_ID` + private-key PEM → self-signed JWT per request |
| Bank list | `GET /institutions/?country=pt` | `GET /aspsps?country=PT` → `{ name, country, logo, … }` (identify by `name`+`country`, no id) |
| Start consent | `POST /requisitions/` → `{ id, link }` | `POST /auth` `{ aspsp:{name,country}, redirect_url, state, access:{valid_until} }` → `{ url }` |
| Return leg | poll requisition status (`LN`) | bank redirects to `redirect_url?code=…` → **`POST /sessions` `{ code }`** → `{ session_id, accounts:[uid…] }` (one-shot exchange — NEW callback step) |
| Accounts | `requisition.accounts[]` | from the session response (store them) |
| Transactions | `GET /accounts/{id}/transactions/` → `transactions.booked[]` | `GET /accounts/{uid}/transactions?date_from=…` → `{ transactions:[…], continuation_key }` (paginate until no key; keep `status === "BOOK"`) |
| Amount sign | signed `transactionAmount.amount` | `transaction_amount.amount` (positive) + `credit_debit_indicator` (`CRDT`/`DBIT` → sign) |
| Description | creditorName/debtorName/remittance | `creditor.name` / `debtor.name` / `remittance_information[]` (array — join) |
| Revoke | `DELETE /requisitions/{id}` | `DELETE /sessions/{id}` |

## 3. Build plan (no schema change)

**WS-B1 — `backend/src/lib/enableBanking.ts`**: JWT signer (crypto, RS256, kid
header, 1 h cache), `eb<T>(path, init)` fetch helper, typed shapes (Aspsp,
AuthResponse, Session, Transaction), 24 h ASPSP cache. Gated on
`ENABLE_BANKING_APP_ID` + `ENABLE_BANKING_PRIVATE_KEY_B64` (PEM base64-encoded
into one env line; decode at boot). Never log the key; never send it to the
frontend.

**WS-B2 — rewrite `routes/bank.ts` upstream calls** (route surface unchanged +
one addition):
- `GET /status` — configured = both envs set; list `BankConnection`s.
- `GET /institutions` — from `/aspsps?country=PT`; keep `sanitizeLogo`.
- `POST /connect` — `POST /auth` with `redirect_url = APP_ORIGIN +
  '/budget?bank=back'`, `state = <uuid>` (store), `access.valid_until = now +
  90 d`; create `BankConnection` `{ requisitionId: state, status: 'created' }`
  (the **existing column stores our state now**, then the session id — soft
  reuse, no migration); return the bank URL.
- **NEW `POST /callback`** `{ code, state }` — exchange `POST /sessions`;
  match `BankConnection` by `requisitionId === state`, update it to
  `{ requisitionId: session_id, status: 'linked' }` and stash account uids
  (JSON in the existing `institutionId`/notes-style field or re-fetch the
  session at sync time — session GET returns accounts).
- `POST /sync` — per linked connection: fetch transactions per account uid
  (paginate, `date_from` = 90 d back), map to the import-item shape (sign from
  `credit_debit_indicator`, name from creditor/debtor/remittance, `startYm =
  endYm = booking_date.slice(0,7)`), feed **the same `processImportItems`**.
  On 401/410 for a session → mark connection `expired`.
- `DELETE /connections/:id` — also `DELETE /sessions/{id}` upstream.

> **Implementation note (drift):** the redirect carries no `?bank=back` marker —
> Enable Banking appends its own `?code=&state=`, and Budget.tsx detects the
> return leg by their presence. The Control Panel whitelists `https://wallet360.pt/budget`
> only (Production apps require https), so the consent round-trip works on prod,
> not localhost.

**WS-B3 — frontend `BankConnectModal` + Budget.tsx**: on mount with
`?bank=back&code=…&state=…` in the URL → `POST /api/bank/callback`, strip the
params, invalidate bank status, prompt "Sincronizar agora". Copy: badge the
feature **"beta pessoal"** (constraint #1). Everything else (bank cards,
search, sync button) already exists.

**WS-B4 — env + docs**: Vercel envs `ENABLE_BANKING_APP_ID`,
`ENABLE_BANKING_PRIVATE_KEY_B64`; redeploy to activate (env-change trap!);
update STATE Platforms table + `decisions/budget.md`. Ships **gated OFF** like
every integration.

## 4. Owner activation runbook (once the code ships)

1. **Sign up** at `https://enablebanking.com/sign-in/` (account auto-created
   on first verified sign-in). Free; no company data needed for restricted use.
2. Control Panel → **Applications → Register application**:
   - Environment: **Production** (restricted-mode path; sandbox = mock banks
     only, useful for local dev first if you want).
   - Redirect URLs: `https://wallet360.pt/budget` (and
     `http://localhost:5173/budget` on a separate sandbox app for dev).
   - The browser downloads **`<app_id>.pem` — the only copy of the private
     key.** Store it in the password manager; never commit it.
3. The app starts **Inactive** → click **"Activate by linking accounts"** →
   authorize your **Banco CTT** (and BCP/others) via the bank's own
   app/site. The app flips to **active (restricted)** — API returns exactly
   these accounts, free.
4. Set the Vercel envs: `ENABLE_BANKING_APP_ID=<app_id>`,
   `ENABLE_BANKING_PRIVATE_KEY_B64=$(base64 -w0 <app_id>.pem)` → **Redeploy**
   (envs don't apply to the running deployment).
5. In the app: Saldo → **Ligar banco** → pick the bank → authorize →
   **Sincronizar** — lines land in "Por classificar" through the same pipeline
   as file imports (dedup makes re-syncs safe).
6. Every ~90 days (or per bank cap): re-authorize when the connection shows
   **expirada**.

## 5. Sources

- Enable Banking docs: quick-start (`/docs/api/quick-start/`), linked accounts
  (`/docs/api/linked-accounts/`), PT market (`/docs/markets/pt/`), FAQ.
- Enable Banking changelog 2023-07 (Banco CTT + ActivoBank beta connectors).
- openbankingtracker.com "Free & Indie Open Banking APIs (2026)" (landscape,
  GoCardless closure).
- Firefly III data-importer docs (Enable Banking as the GoCardless successor).
