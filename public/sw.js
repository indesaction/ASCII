// ASCII Atelier service worker: offline support.
// Navigations are network-first (so updates land), assets are cache-first
// (Vite fingerprints them, so a cached copy is always correct).
// The build replaces the precache list and version (see vite.config.ts).
const VERSION = 'dev'
const PRECACHE = []
const CACHE = 'atelier-' + VERSION
const CORE = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './fonts/JetBrainsMonoNL-Regular.woff', './fonts/JetBrainsMonoNL-Bold.woff', ...PRECACHE]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => undefined))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put('./', copy))
          return res
        })
        .catch(() => caches.match('./', { ignoreVary: true }).then((r) => r || Response.error())),
    )
    return
  }

  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
