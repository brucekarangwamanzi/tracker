/* Generated from the exported app. Cache app files only, never account/API data. */
const CACHE = __CACHE_NAME__;
const FILES = __PRECACHE_FILES__;
const STATIC = new Set(FILES);
const APP_ROUTE = /^\/(?:$|(?:skills|money|loans|more|settings|review|roi|reminders|sync-issues|add-skill|add-study|add-transaction|transfer|budget|planner|add-loan|pay-loan)(?:\/|$)|(?:skill|loan|entry|reminder)\/[^/]+\/?$)/;

self.addEventListener('install', event => {
  // A failed or incomplete download fails installation. The previous app stays active.
  // Future updates wait until all old app windows close, preserving loaded bundles.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(file => new Request(file, {cache: 'reload', credentials: 'omit'})))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('bruces-life-shell-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('authorization')) return;
  if (request.mode === 'navigate' && APP_ROUTE.test(url.pathname)) {
    event.respondWith((async () => (await caches.open(CACHE)).match('/index.html').then(cached => cached || fetch(request)))());
  } else if (STATIC.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE), cached = await cache.match(url.pathname);
      if (cached) return cached;
      // Refill an evicted static asset only after a successful same-origin response.
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') await cache.put(url.pathname, response.clone());
      return response;
    })());
  }
});
