// Receives what the phone's Share menu sent to the installed app (screenshot or text).
// sw.js catches the POST to /share-target, keeps the shared item in a short-lived cache and redirects to ./?shared=1.
// Here, once the person is signed in, the item is taken out of the cache (and the cache deleted), then opened in
// the Add sheet, where it is read on the phone and filled in for the person to confirm.
import { openAddFromShare } from './add.js';

const CACHE = 'share-inbox-v1';   // same name as in sw.js
const MAX_AGE_MS = 15 * 60 * 1000;

export function hasSharedFlag() { return new URLSearchParams(location.search).has('shared'); }

function clearSharedFlag() {
  const u = new URL(location.href);
  u.searchParams.delete('shared');
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}

export async function purgeShared() {
  try { if ('caches' in window) await caches.delete(CACHE); } catch (_) { /* ignore */ }
}

async function takeShared() {
  if (!('caches' in window)) return null;
  const cache = await caches.open(CACHE);
  const base = new URL('share-inbox/', document.baseURI);
  const metaRes = await cache.match(new URL('meta', base));
  if (!metaRes) return null;
  const meta = await metaRes.json();
  let blob = null;
  if (meta.hasFile) {
    const fr = await cache.match(new URL('file', base));
    if (fr) blob = await fr.blob();
  }
  await caches.delete(CACHE);   // the shared item is not kept once it has been picked up
  if (!meta.ts || Date.now() - meta.ts > MAX_AGE_MS) return null;
  const text = [meta.title, meta.text, meta.url].filter(Boolean).join('\n').slice(0, 4000);
  return { blob, text };
}

export async function handleSharedIfAny() {
  if (!hasSharedFlag()) return;
  clearSharedFlag();
  let item = null;
  try { item = await takeShared(); } catch (e) { console.error(e); }
  if (item && (item.blob || item.text)) await openAddFromShare(item);
}
