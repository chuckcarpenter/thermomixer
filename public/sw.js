// Minimal service worker for installability + offline shell.
// Bump CACHE to invalidate. API routes are never cached (always network).
const CACHE = 'thermomixer-v1';
const SHELL = ['/', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls or non-GET — always hit the network.
  if (request.method !== 'GET' || url.pathname.startsWith('/api/')) return;

  // Pages: network-first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Static assets: cache-first, populate cache on miss.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
          return res;
        }),
    ),
  );
});
