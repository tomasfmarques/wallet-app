# Decisions — Theme (Light / Dark / System)

## 2026-07-03 — Dark mode via a semantic-token override block

- **What:** app-wide Light / Dark / System theme (was light-only). Selector in
  Settings → Preferências (`components/settings/ThemeSection.tsx`).
- **Mechanism:** `hooks/useTheme.tsx` — a `ThemeProvider` stores the *preference*
  (`light|dark|system`) in `localStorage['w360:theme']`, resolves it to `light|dark`
  (system → `matchMedia('(prefers-color-scheme: dark)')`), writes `data-theme` on
  `<html>`, keeps the PWA `<meta theme-color>` in step, and re-renders consumers when
  the OS scheme flips in system mode (`resolved` is reactive state, not computed inline
  — otherwise mounted charts kept stale colours). A **no-flash inline `<script>`** in
  `index.html` applies the saved theme before first paint (mirrors the resolve logic).
- **Colours = tokens.** `index.css` `:root` holds ~30 light colour tokens; a
  `:root[data-theme="dark"]` block overrides every one. Components reference `var(--…)`,
  so they adapt automatically. **Light values are unchanged** (the old palette), so
  light mode is byte-for-byte identical.
- **Why a token override, not per-component dark rules:** one override block vs. dozens
  of `[data-theme=dark] .x` rules. The cost was converting ~120 hardcoded literals in
  `index.css` to `var()`. Done with a **case trick**: `:root` defs written lowercase,
  rule literals were uppercase → a `sed` uppercase→`var()` pass converted the rules
  without clobbering the definitions. (After conversion there are no bare literals left
  in rules, so the case reliance is one-time only.)
- **Semantic tint families** got role tokens (`--bg-success`, `--text-warning`,
  `--border-danger`, …) so badges/banners adapt; the navbar stays navy (`--ink`) in
  both themes on purpose.

## Charts (Chart.js can't read CSS vars)

- `lib/chartTheme.ts` `useChartColors()` returns `{ grid, text, segmentBorder, resolved }`
  from the resolved theme. Each chart uses these for grid/axis-text/segment colours and
  **includes `cc.resolved` (or the derived colours) in its options `useMemo` deps** so it
  recomputes → redraws on toggle. New charts must follow this.
- **Donut legend text needs `fontColor` per generated item.** A custom `generateLabels`
  bypasses `labels.color`, so Chart.js falls back to its dark default → unreadable on the
  dark card. Fix: set `fontColor: cc.text` on each returned legend item.

## Google (GSI) sign-in button — the white frame

- **Problem:** in dark mode the button showed a white frame that appeared ~0.5s after
  load. Cause: on the **real domain** GSI upgrades the button to a **cross-origin FedCM
  iframe** and paints a light surface in the ~10px/2px padding around the 320×40 dark
  (`filled_black`) button. This only happens on the real domain (localhost renders it
  inline, no iframe — so it's not reproducible in dev).
- **What did NOT work:** `color-scheme: dark` on the iframe — it's already inherited from
  `:root` and GSI ignores it; the white is painted *inside* the cross-origin iframe, which
  CSS cannot style.
- **Fix:** clip `.gsi-button` to the button's content box in dark mode
  (`overflow:hidden` + a negative iframe margin) so the white band overflows and is
  cropped. **Fragile:** the offsets (`320×40`, `-10/-2`) depend on GSI's current iframe
  geometry for our fixed `width:320, size:large` config — re-measure if Google changes
  the padding. Verified live on wallet360.pt via the browser.
- The button theme itself is `theme: resolved === 'dark' ? 'filled_black' : 'outline'`
  (`components/auth/GoogleSignInButton.tsx`), re-rendered on theme flip.

## Gotcha: the service worker caches the bundle

- Visual/CSS fixes don't appear after a deploy until the Workbox SW picks up the new
  bundle (hard-refresh, or reopen/reinstall the PWA). This repeatedly masqueraded as
  "the fix didn't work" while debugging. To force it: unregister the SW +
  `caches.delete(...)`, then reload.

## 2026-07-16 — Dark palette: measured, not eyeballed (+ GSI offsets re-measured)

The open thread said "the dark palette shades are a considered first pass —
specific tokens may want tuning". "Tuning" by eye is guessing, so instead every
foreground/background token pair the UI actually renders was scored for WCAG
contrast. **The dark palette came out healthy — one real failure, now fixed.**

- **`--muted-l` was failing AA in dark: #6C7A8C scored 3.75:1 on `--surface`
  and 3.09:1 on `--surface-3`, against the 4.5:1 that normal text needs.** It
  isn't decorative — it styles real 11.5–12.5px copy (`.field-hint`,
  `.slider-bounds`, `.auth-divider`, `.hold-chart-hint`). Changed to **#8C99AA**:
  the smallest step clearing AA on every dark surface (worst 4.67:1) while
  staying visibly fainter than `--muted` (#9BA8B9), so the text/muted/muted-l
  hierarchy survives. Anything lighter collapses the two tiers together.
- Everything else in dark passes. The only sub-4.5 pairs left are `--accent` on
  its own tints (3.42–4.44), which style links/controls — UI components, where
  the AA threshold is 3.0.
- **Light mode was audited too but deliberately NOT touched.** It shows several
  sub-AA pairs, but most are artefacts of pairing tokens that never meet
  (`--text` on `--ink` is the navy navbar, which uses light text). `--muted-l`
  on white (2.72:1) does look like a genuine light-mode failure — but light is
  **byte-for-byte the pre-theme palette by design**, so changing it is a
  separate, deliberate call, not a drive-by. Left as a known finding.

**GSI clip offsets — re-measured, verdict: leave alone.** Measured on live
wallet360.pt in dark with no Google session: GSI rendered the button as
same-document DOM (`.nsm7Bb-HzV7m-LgbsSe`, 320x40, bg rgb(32,33,36)), the only
iframe being 0x0 offscreen — so the `-10px/-2px` offsets applied to nothing and
there was no white frame. That is NOT evidence the hack is dead: GSI serves the
iframe-hosted *personalized* button to visitors who ARE signed into Google, which
is the case that caused the frame. Reproducing it needs a Google-signed-in
Chrome, which the automated browser isn't — so the rule stays (it costs nothing
when the iframe is absent) and `index.css` now records exactly this, so the next
reader doesn't re-derive it. Removing it on the strength of a session-less
measurement would have regressed real users' dark mode.
