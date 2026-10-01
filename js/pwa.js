// Registers the service worker so the app can be installed and opens offline (see /sw.js).
// Skipped on localhost so development is never served from a cache; add ?sw=1 to a localhost URL to test it.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal && !new URLSearchParams(location.search).has('sw')) return;

  const register = () => navigator.serviceWorker.register('sw.js').catch((e) => console.error('Service worker registration failed', e));
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
