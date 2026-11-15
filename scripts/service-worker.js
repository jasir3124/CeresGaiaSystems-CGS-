/* Generated into public/sw.js after every production build. */
const VERSION = __BUILD_ID__;
const SHELL = `cgs-shell-${VERSION}`;
const PRECACHE = __PRECACHE__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(PRECACHE)));
  // Activate updates when the previous app windows close, avoiding mixed builds.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('cgs-shell-') && key !== SHELL) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never download or cache external map tiles, imagery, or third-party requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // A cached app shell lets installed users reopen the dashboard without a network.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try { return await fetch(request); }
      catch { return (await caches.match('/')) || Response.error(); }
    })());
    return;
  }
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
  }
});
