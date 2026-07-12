/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_SENTRY_DSN?: string
  // WS-L6 (docs/landing-spec.md) — build-time AdSense client id. Unset in
  // dev/most deploys: AdSlot renders nothing and zero ad code enters the
  // bundle until the owner has AdSense approval.
  readonly VITE_ADSENSE_CLIENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
