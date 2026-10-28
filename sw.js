/* Pages index: keeps only the shell of the index page offline, and stays out of
   the way of every sub-app.  A service worker registered here has scope over
   /Pages/, so it sees requests for /Pages/<sub-app>/... too: those are left
   alone (the sub-apps have their own workers).  Bump CACHE to ship a new shell. */
const CACHE = 'pages-v3';
const BASE = new URL('./', self.location).pathname;   // e.g. '/Pages/'
const ROOT = BASE.replace(/\/$/, '');                 // e.g. '/Pages'

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// The shell: these cache-first, everything else is untouched.
const SHELL = new Set([BASE, ROOT, BASE + 'index.html', BASE + 'manifest.json',
  BASE + 'icon-192.png', BASE + 'icon-512.png']);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const isUpdate = keys.some((k) => k !== CACHE);
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // On an update (not a first install) the window that triggered it still
    // shows the old build, so refresh it once. Sub-app windows are left open.
    if (isUpdate) {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => {
        let p;
        try { p = new URL(c.url).pathname; } catch (_) { return; }
        if (SHELL.has(p)) c.navigate(c.url).catch(() => {});
      });
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate';
  if (!SHELL.has(url.pathname)) return;   // sub-apps and everything else: hands off

  // HTML goes network-first, so an edit shows up on a plain reload instead of
  // being shadowed by the cached copy; the icons and manifest stay cache-first.
  if (isNav) {
    e.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./index.html', { ignoreSearch: true })))
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
