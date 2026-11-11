// Offline cache for Queue Crew. There is no build step: the worker saves whatever the app
// loads, answers from the saved copy instantly (good when signal is bad), and quietly
// refreshes that copy in the background, so edits pushed to GitHub reach phones by themselves.
const CACHE = 'queue-crew';

const sameOrigin = (u) => {
  try { return new URL(u, self.location).origin === self.location.origin; } catch { return false; }
};
// One cache entry per file, ignoring ?query strings.
const keyFor = (u) => { const url = new URL(u, self.location); url.search = ''; url.hash = ''; return url.href; };

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); // old versioned caches
    await self.clients.claim();
  })());
});

// On the very first visit the page loads before this worker is in charge, so the page
// sends the list of files it loaded and we save them here.
self.addEventListener('message', (e) => {
  const urls = (e.data && e.data.cache) || [];
  e.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.filter(sameOrigin).map((u) =>
    fetch(u, { cache: 'no-cache' }).then((res) => res.ok && cache.put(keyFor(u), res)).catch(() => {})))));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !sameOrigin(req.url)) return;
  const key = keyFor(req.url);
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    if (hit) {
      e.waitUntil(fresh.catch(() => {}));
      return hit;
    }
    try {
      return await fresh;
    } catch {
      return (await cache.match(keyFor('./'))) || Response.error();
    }
  })());
});
