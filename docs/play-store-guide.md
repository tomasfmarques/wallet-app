# Google Play — account creation + listing guide (owner runbook)

_End-to-end path from "no Google Play account" to "Wallet360 live on the Play
Store". Complements [`wallet360-hub/PLAY-STORE.md`](../wallet360-hub/PLAY-STORE.md)
(the TWA build runbook) — this doc covers the account, the listing, the review
requirements and Wallet360-specific answers. Written 2026-07-15._

---

## 0. What you're shipping

A **Trusted Web Activity (TWA)** — a thin signed Android wrapper pointing at the
live PWA at `https://wallet360.pt`. Web deploys update the app instantly; only
native-shell changes ever need a new upload.

**⚠️ Naming collision:** an unrelated app called **"Wallet 360"** (MsM,
`cl.inmas.wallet360`, Chilean, Spanish-language) already exists on the Play
Store. Google may flag identical names at review, and users may confuse them.
Use a distinctive listing title, e.g. **"Wallet360 — Finanças Pessoais"** or
**"Wallet360: crédito, orçamento e investimentos"** (max 30 chars:
"Wallet360 — Finanças" fits). The package id `pt.wallet360.twa` is already
distinct — only the display name needs care.

## 1. Create the developer account (~30 min + up to 48 h verification)

1. Go to **https://play.google.com/console/signup** signed in with the Google
   account that should own the app long-term (consider a dedicated account,
   e.g. `dev@wallet360.pt` forwarding, rather than the personal Gmail — the
   account owner cannot be changed later, only transferred).
2. Choose **"Yourself"** (personal account). An organization account would
   skip the 12-tester requirement (see §5) but needs a D-U-N-S number +
   registered company — not worth it for now.
3. Pay the **€25 one-time** registration fee (card).
4. **Identity verification:** upload a government ID (CC/passport). Google
   also verifies an address and may require a phone. Personal accounts show
   the **legal name publicly** on the listing unless you later register as an
   organization. Verification typically clears in 1–2 days.
5. In **Settings → Developer account → Contact details**, set a public
   contact email (use `privacy@wallet360.pt` or a dedicated support alias —
   this is public on the listing).

**Prerequisites from STATE (do before submitting, not before signing up):**
- [ ] `privacy@wallet360.pt` mailbox/forwarding exists (STATE Next-steps #5a).
- [x] Privacy policy live: `https://wallet360.pt/privacidade` (pt+en).
- [x] Account deletion page live: `https://wallet360.pt/eliminar-conta`.
- [x] Data-safety answers prepared: [`docs/legal/play-data-safety.md`](legal/play-data-safety.md).

## 2. Build the signed app bundle (AAB)

Follow [`wallet360-hub/PLAY-STORE.md`](../wallet360-hub/PLAY-STORE.md) verbatim:

```bash
npx @bubblewrap/cli init --manifest https://wallet360.pt/manifest.webmanifest
# Application ID: pt.wallet360.twa · Host: wallet360.pt
npx @bubblewrap/cli build          # creates android.keystore on first run
npx @bubblewrap/cli fingerprint    # prints the SHA-256 cert fingerprint
```

- **Back up `android.keystore` + its passwords** (password manager + offline
  copy). Losing it = you can never update the app.
- Paste the fingerprint into
  `frontend/public/.well-known/assetlinks.json` (replace the
  `REPLACE_WITH_…` placeholder), commit, push, and verify
  `https://wallet360.pt/.well-known/assetlinks.json` returns it (200,
  `application/json`). Wrong/missing fingerprint = app opens with a browser
  URL bar instead of full-screen (the #1 TWA failure symptom).

## 3. Create the app in Play Console

**Create app** → name (see §0), default language **Portuguese (Portugal)**,
type **App**, **Free**. Then work through the *Dashboard* checklist:

### Store listing
| Field | Value |
|---|---|
| App name (30) | `Wallet360 — Finanças` |
| Short description (80) | e.g. `Crédito habitação, orçamento e investimentos — as tuas finanças num só sítio.` |
| Full description (4000) | Expand from the landing copy; mention: simuladores grátis, importação de extratos (PDF/Excel/CSV), crédito + Euribor, carteira de investimentos, Modo Casal, PWA sem anúncios. Avoid the standalone phrase "Wallet 360" (collision, §0) — always write `Wallet360`. |
| App icon | 512×512 PNG (from `frontend/public/`, regenerate via `npm run generate-pwa-assets -w frontend`) |
| Feature graphic | 1024×500 (create from the landing hero + wordmark) |
| Screenshots | ≥2 phone (1080×1920+): Overview, Saldo/Análise, Crédito, Simulador. Take from a real device/emulator in pt-PT. |
| Category | Finance |
| Contact email | the public alias from §1 |
| Also add | an **English (US)** listing translation (the app is bilingual) |

### Policy declarations (App content section)
- **Privacy policy:** `https://wallet360.pt/privacidade`
- **App access:** the app requires sign-in → provide the reviewer a path:
  "Tap *Experimenta a demo* on the sign-in screen — no credentials needed"
  (the demo account seeds sandbox data; this is exactly what it's for).
- **Ads:** No (AdSense only lives on the public web pages, never in-app).
- **Content rating (IARC questionnaire):** utility/finance, no user-generated
  public content, no gambling → rates PEGI 3 / Everyone.
- **Target audience:** 18+ (finance app; do NOT tick child-appeal).
- **Data safety:** answer exactly from
  [`docs/legal/play-data-safety.md`](legal/play-data-safety.md) — collects
  email + financial data + identifiers, no sharing, encrypted in transit,
  deletion URL `https://wallet360.pt/eliminar-conta`. **If `SENTRY_DSN` is
  active in prod (it is, since 2026-07-13), also declare Diagnostics/Crash
  logs** (the doc's note).
- **Financial features declaration:** Play asks finance apps what they do.
  Wallet360 is a **personal finance management/budgeting tool** — it does NOT
  provide loans, banking, payments or investment services. Declare only what
  it is; nothing licensable applies.
- **Government app / News app:** No.

## 4. Upload & internal testing (same day)

1. **Testing → Internal testing** → create release → upload
   `app-release-bundle.aab` → add your own email to the tester list → roll out.
2. Install via the opt-in link on your Android phone; verify:
   full-screen (no URL bar — asset links OK), sign-in, biometrics, statement
   import, push-notification prompt.

## 5. ⚠️ The 12-testers / 14-days gate (personal accounts)

Personal developer accounts created after 2023-11-13 must, **before they can
publish to production**, run a **closed test with ≥12 opted-in testers for 14
consecutive days** (reduced from 20 on 2024-12-11). Reviewers also assess
*engagement* — real people actually using the app — not just the count.

Plan:
1. **Testing → Closed testing** → create track → upload the same AAB.
2. Recruit 12–15 testers (family, friends, colleagues, the Modo Casal circle;
   there are also mutual-testing communities). They join via opt-in URL and
   must **stay opted-in and active for 14 consecutive days** — someone who
   drops on day 10 resets their own counter.
3. During the window: push a couple of web-side improvements (visible app
   changes without new AABs — a TWA advantage), reply to tester feedback.
4. After 14 days the Console unlocks **"Apply for production"** — answer the
   questionnaire honestly (what was tested, what changed).

Budget **~3 weeks** from AAB upload to production eligibility.

## 6. Production release

1. **Production** → create release → same AAB → roll out (staged % optional).
2. First production review of a finance app can take **up to ~7 days**.
3. Post-launch: the listing URL is
   `https://play.google.com/store/apps/details?id=pt.wallet360.twa` — add an
   official Play badge to the landing (`InstallCta` has a `TODO(Play Store)`
   branch ready for exactly this) and to `docs/STATE.md`.

## 7. Maintenance

- Web deploys update the app content instantly — no resubmission.
- New AAB only for shell changes (icon, splash, permissions): bump
  `versionCode`/`versionName` in `twa-manifest.json`, rebuild, upload.
- Keep the Data safety form in sync with reality (e.g. when bank sync ships —
  see [`bank-sync-spec.md`](bank-sync-spec.md) — the declared data types
  don't change: it's still "financial info, collected, not shared", but
  review the form then anyway).
