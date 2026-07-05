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
