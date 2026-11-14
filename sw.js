/* Options Screens service worker.
   Network-first for HTML and JSON so online data is never stale.
   Cached fallback when offline. Bump CACHE when changing shell/assets.
   Daily screen data uses network-first and does not require a bump. */
const CACHE = 'options-screens-v20261114';
const SCOPE = '/options-alerts-dashboard';
const PRECACHE = [
  SCOPE + '/',
  SCOPE + '/index.html',
  SCOPE + '/weekly/',
  SCOPE + '/weekly/index.html',
  SCOPE + '/weekly/weekly.json',
  SCOPE + '/leaps/',
  SCOPE + '/leaps/index.html',
  SCOPE + '/leaps/leaps.json',
  SCOPE + '/manifest.webmanifest',
  SCOPE + '/manifest.json',
  SCOPE + '/icons/icon-192.png',
  SCOPE + '/icons/icon-512.png',
  SCOPE + '/icons/icon-192-maskable.png',
  SCOPE + '/icons/icon-512-maskable.png',
  SCOPE + '/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(PRECACHE.map(url =>
        cache.add(url).catch(err => console.warn('precache skip', url, err))
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function inScope(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(SCOPE + '/');
}
function isHTML(req, url) {
  if (req.mode === 'navigate') return true;
  const p = url.pathname;
  return p.endsWith('.html') || p.endsWith('/');
}
function isJSON(url) {
  return url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest');
}
function offlineResponse(cached) {
  const headers = new Headers(cached.headers);
  headers.set('X-Offline-Cache', '1');
  return new Response(cached.body, {status: cached.status, statusText: cached.statusText, headers});
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!inScope(url)) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      }
      throw new Error('bad status');
    } catch (e) {
      const cached = await caches.match(req);
      if (cached) return offlineResponse(cached);
      if (isHTML(req, url)) {
        const fallback = await caches.match(SCOPE + '/weekly/index.html');
        if (fallback) return offlineResponse(fallback);
      }
      throw e;
    }
  })());
});
