# Wallet360 → Google Play (TWA runbook)

> **Full owner guide** (account creation, listing fields, the 12-testers/14-days
> gate, Wallet360-specific policy answers): [`docs/play-store-guide.md`](../docs/play-store-guide.md).
> This file remains the build-side runbook it references.

How to ship the installable PWA to the Play Store as a **Trusted Web Activity
(TWA)** — a thin Android wrapper over the live `https://wallet360.pt` PWA. One
codebase; the Play listing just points at the site.

> **Status:** the PWA half is **done** (Phase 2 — manifest, service worker, icons,
> installable). Everything below is the **manual tail** that needs a paid account +
> an Android toolchain, so it isn't automated here.

## Prerequisites (one-time)

- **Google Play Developer account** — €25 one-time (play.google.com/console).
- **JDK 17** and the **Android SDK** (or just let Bubblewrap download them on first run).
- **Node** (already have it) for the Bubblewrap CLI.
- The PWA live and passing install criteria at `https://wallet360.pt` (manifest +
  service worker + HTTPS — all shipped in Phase 2).

## Steps

1. **Init the TWA project** from the live manifest:
   ```bash
   npx @bubblewrap/cli init --manifest https://wallet360.pt/manifest.webmanifest
   ```
   - Application ID: **`pt.wallet360.twa`** (must match `package_name` in
     `frontend/public/.well-known/assetlinks.json`).
   - Host: `wallet360.pt`. Accept the icon/colors pulled from the manifest.

2. **Build the signed app bundle:**
   ```bash
   npx @bubblewrap/cli build
   ```
   On first build Bubblewrap creates a signing keystore (`android.keystore`).
   **Back this keystore up** — losing it means you can't update the app later.

3. **Wire Digital Asset Links** (proves the app owns the domain, so the TWA runs
   full-screen with no URL bar):
   ```bash
   npx @bubblewrap/cli fingerprint   # prints the SHA-256 of the signing cert
   ```
   - Paste that fingerprint into
     [`frontend/public/.well-known/assetlinks.json`](../frontend/public/.well-known/assetlinks.json),
     replacing `REPLACE_WITH_SHA256_FINGERPRINT_FROM_BUBBLEWRAP_SIGNING_KEY`.
   - Commit + push → Vercel redeploys → verify it serves at
     `https://wallet360.pt/.well-known/assetlinks.json` (must be `application/json`,
     200, no auth).

4. **Submit to Play Console:**
   - Create the app, upload `app-release-bundle.aab` (from step 2).
   - Fill the store listing (use the 512 icon + screenshots), content rating, data-
     safety form (declare: stores financial data, uses cookies/session), privacy
     policy URL.
   - Roll out to internal testing first, then production.

## Keep-in-mind

- The TWA shows **exactly** the live site — every web deploy updates the app with no
  resubmission (only native shell changes need a new AAB).
- If asset-links verification fails, the app opens with a browser URL bar (Custom
  Tab) instead of full-screen — that's the #1 symptom of a wrong/missing fingerprint.
- Bump `versionCode`/`versionName` in `twa-manifest.json` for each new AAB upload.
- Data-safety: Wallet360 stores bank-statement-derived data; be accurate in the Play
  data-safety questionnaire (collected, encrypted in transit, not sold).

## Related
- PWA config: `frontend/vite.config.ts` (manifest + workbox).
- Icons: `frontend/public/*.png` (regenerate via `npm run generate-pwa-assets -w frontend`).
- Plan: `docs/PUBLIC-LAUNCH-PLAN.md` (Phase 2), `~/.claude/plans/crispy-jumping-fairy.md`.
