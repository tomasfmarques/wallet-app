/// <reference lib="webworker" />
// Custom service worker (vite-plugin-pwa `injectManifest` strategy).
// Replaces the old generateSW config 1:1 — precache, SPA navigation fallback,
// NetworkOnly /api, CacheFirst Google Fonts — and adds the Web Push handlers
// (the whole reason for the strategy switch: generateSW can't host listeners).
// Keep the caching sections in sync with docs/decisions/notifications.md.

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkOnly, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

// registerType: 'autoUpdate' semantics — activate new SW versions immediately.
self.skipWaiting()
clientsClaim()

// ── Precache the built app shell ─────────────────────────────────
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// ── Offline SPA routing — but NEVER intercept the API ────────────
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api/],
}))

// Financial + auth data must always be live — never serve a cached copy.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api'),
  new NetworkOnly(),
  'GET',
)

// Outfit font (Google Fonts) — safe to cache aggressively.
registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
)

// ── Web Push ─────────────────────────────────────────────────────
// Payload shape (see backend/src/lib/notifications.ts): { title, body, url }.
interface PushPayload {
  title?: string
  body?: string
  url?: string
}

self.addEventListener('push', (event) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    // Non-JSON payload (shouldn't happen) — show something rather than nothing.
    data = { body: event.data?.text() }
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Wallet360', {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url: string = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an open tab if there is one; navigate it to the target.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
