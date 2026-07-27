// Minimal service worker for installability + offline shell, plus the PWA share
// target (see the /share branch below).
// Bump CACHE to invalidate. API routes are never cached (always network).
const CACHE = 'thermomixer-v2';
const SHELL = ['/', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

// Hand-off storage for shared images, drained by src/lib/image/shareInbox.ts.
const SHARE_INBOX = 'thermomixer-share-inbox';
// The inbox is hand-off storage, not a versioned asset cache, so it must survive
// activation — an update landing mid-share would otherwise eat the photos.
const KEEP = [CACHE, SHARE_INBOX];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Web Share Target: the OS POSTs shared images here. MUST come before the
  // non-GET early return below, which would otherwise let it hit the network.
  if (request.method === 'POST' && url.pathname === '/share') {
    event.respondWith(handleShare(request));
    return;
  }

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

// Park the shared files in the inbox cache, then bounce to the app. Every write
// is awaited before the redirect, or the page could load and read an empty inbox.
// The redirect carries only a trigger — the cache is the source of truth for what
// actually arrived.
async function handleShare(request) {
  try {
    const form = await request.formData();
    const files = form
      .getAll('photos')
      .filter((f) => f && typeof f.arrayBuffer === 'function' && f.size > 0);

    const cache = await caches.open(SHARE_INBOX);
    for (const stale of await cache.keys()) await cache.delete(stale);

    await Promise.all(
      files.map((file, i) =>
        cache.put(
          shareKey(i),
          new Response(file, {
            headers: {
              'content-type': file.type || 'application/octet-stream',
              // Encoded: a raw filename with non-ASCII throws on header set.
              'x-share-name': encodeURIComponent(file.name || `shared-${i + 1}`),
            },
          }),
        ),
      ),
    );

    return Response.redirect(files.length ? '/?share=1' : '/?share=0', 303);
  } catch {
    return Response.redirect('/?share=error', 303);
  }
}

// Zero-padded so the client's lexicographic sort keeps page order past nine.
function shareKey(i) {
  return `/share-inbox/${String(i).padStart(3, '0')}`;
}
