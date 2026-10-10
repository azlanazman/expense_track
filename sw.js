// Service worker for the installed app (PWA).
//
// What it does: keeps a copy of the app's own files (HTML, JS, icons), the vendored libraries, the Firebase
// SDK modules and the Google Fonts, so the installed app opens fast and shows its interface without a network.
//
// What it never does: it does not intercept Firestore, Authentication or any other API call. Only an explicit
// allowlist of static files is cached (see fetch handler); everything else goes straight to the network.
//
// One exception to "no user data": when something is shared to the installed app from the phone's Share menu
// (a screenshot or text), the POST to /share-target is caught here and the item is held in the SHARE cache just
// long enough for the app to pick it up (js/share.js deletes the cache straight away; anything older than
// 15 minutes is ignored and purged at the next app start).
//
// Updates: the app's own files are fetched network-first with revalidation, so a new deploy is picked up on
// the next load with no hard refresh. Bump VERSION only if this file's caching logic changes.

const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;   // this site's own files
const LIB_CACHE   = `libs-${VERSION}`;    // versioned third-party static files
const SHARE_CACHE = 'share-inbox-v1';      // a shared screenshot / text, until the app picks it up
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
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== LIB_CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith(handleShare(req));
    return;
  }
  if (req.method !== 'GET') return;

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

// Share Target: keep the shared image / text for the app, then send the person to the app
async function handleShare(req) {
  try {
    const fd = await req.formData();
    await caches.delete(SHARE_CACHE);
    const cache = await caches.open(SHARE_CACHE);
    const file = fd.get('shot');
    const hasFile = !!(file && typeof file !== 'string' && file.size > 0 && file.size < 20 * 1024 * 1024);
    if (hasFile) {
      await cache.put(new URL('share-inbox/file', self.registration.scope), new Response(file, { headers: { 'Content-Type': file.type || 'image/png' } }));
    }
    const meta = {
      title: String(fd.get('title') || '').slice(0, 300),
      text: String(fd.get('text') || '').slice(0, 4000),
      url: String(fd.get('url') || '').slice(0, 500),
      hasFile,
      ts: Date.now(),
    };
    await cache.put(new URL('share-inbox/meta', self.registration.scope), new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch (_) { /* fall through: the app simply opens */ }
  return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
}

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
