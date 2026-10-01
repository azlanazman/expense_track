// Service worker for the installed app (PWA).
//
// What it does: keeps a copy of the app's own files (HTML, JS, icons), the vendored libraries, the Firebase
// SDK modules and the Google Fonts, so the installed app opens fast and shows its interface without a network.
//
// What it never does: it does not intercept Firestore, Authentication or any other API call, and it stores
// no user data. Only an explicit allowlist of static files is cached (see fetch handler); everything else
// goes straight to the network.
//
// Updates: the app's own files are fetched network-first with revalidation, so a new deploy is picked up on
// the next load with no hard refresh. Bump VERSION only if this file's caching logic changes.

const VERSION = 'v1';
const SHELL_CACHE = `shell-${VERSION}`;   // this site's own files
const LIB_CACHE   = `libs-${VERSION}`;    // versioned third-party static files
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(['./', 'manifest.webmanifest', 'favicon.svg']))
      .catch(() => {})                       // never block installation on a failed precache
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== LIB_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;                       // the browser manages this file itself
    if (url.pathname.includes('/vendor/')) {                           // version is in the file name
      event.respondWith(cacheFirst(req, LIB_CACHE));
    } else {
      event.respondWith(networkFirst(req, SHELL_CACHE));
    }
    return;
  }

  // Cross-origin: only these static, versioned files. Anything else (Firestore, Auth, ...) is not touched.
  if (url.origin === 'https://www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) {
    event.respondWith(cacheFirst(req, LIB_CACHE));
  } else if (url.origin === 'https://fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(req, LIB_CACHE));
  } else if (url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, LIB_CACHE));
  }
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('network timeout')), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    // 'no-cache' = always revalidate with the server (cheap 304 when unchanged), so deploys show up immediately
    const res = await withTimeout(fetch(req, { cache: 'no-cache' }), NETWORK_TIMEOUT_MS);
    if (res && res.ok && !res.redirected) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' })
      || (req.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    return Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const refresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => undefined);
  return hit || (await refresh) || Response.error();
}
