// App lock: asks for the phone's fingerprint (WebAuthn platform authenticator) every time the installed app is
// opened or returned to. While it is on, the 15-minute idle sign-out is skipped (see app.js), so the person stays
// signed in and the fingerprint is the gate. The check is on this device only: it keeps people out of an unlocked
// phone, it does not replace the Firestore rules, which still protect the data on the server.
// Per-device state lives in localStorage: applock.cred (credential id) and applock.uid (who it belongs to).
import { currentUser } from './state.js';
import { DEMO_EMAIL } from './demo.js';

const K_CRED = 'applock.cred', K_UID = 'applock.uid';
const GRACE_MS = 30_000;   // coming back within this long does not ask again
const $ = (id) => document.getElementById(id);

// ── Small helpers ────────────────────────────────────────────────────────────

function read(k)     { try { return localStorage.getItem(k); } catch (_) { return null; } }
function store(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (_) {} }

const b64u = {
  to:   (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  from: (s)   => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
};

// Dev only: on localhost, ?applock=1 behaves like the installed app so the lock can be tried in a desktop browser
const DEV = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
  (/[?&]applock=1/.test(location.search) || sessionStorage.getItem('applock.dev') === '1');
if (DEV) { try { sessionStorage.setItem('applock.dev', '1'); } catch (_) {} }

export function isStandalone() {
  return DEV || window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export async function lockSupported() {
  try {
    return !!(window.PublicKeyCredential && navigator.credentials &&
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch (_) { return false; }
}

// Is a lock set up on this device for the signed-in person?
export function isLockOn(user = currentUser) {
  return !!read(K_CRED) && (!user || read(K_UID) === user.uid);
}

// The lock is in force: set up, running as the installed app, and not the demo account
export function appLockActive() {
  return isLockOn() && isStandalone() && currentUser?.email !== DEMO_EMAIL;
}

function changed() { document.dispatchEvent(new CustomEvent('applock:changed')); }

// ── Turn on / off ────────────────────────────────────────────────────────────

export async function enableLock(user) {
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: { name: 'Expense Tracker' },
    user: { id: new TextEncoder().encode(user.uid), name: user.email || 'owner', displayName: 'Expense Tracker' },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000,
    attestation: 'none',
  } });
  if (!cred) throw new Error('no credential');
  store(K_CRED, b64u.to(cred.rawId));
  store(K_UID, user.uid);
  changed();
}

export function disableLock() {
  store(K_CRED, null);
  store(K_UID, null);
  locked = false;
  hideLock();
  changed();
}

// ── Lock screen ──────────────────────────────────────────────────────────────

let locked = false;   // true until the fingerprint has been accepted
let busy = false;     // a fingerprint prompt is open

function setMsg(t) { const m = $('lock-msg'); if (m) m.textContent = t; }

function showLock() {
  const el = $('lock-screen'); if (!el) return;
  el.classList.add('on');
  const app = $('app'); if (app) app.inert = true;
  const b = $('lock-unlock'); if (b && !busy) b.focus({ preventScroll: true });
}

function hideLock() {
  const el = $('lock-screen'); if (el) el.classList.remove('on');
  const app = $('app'); if (app) app.inert = false;
}

async function verified(assertion, challenge) {
  const cd = JSON.parse(new TextDecoder().decode(assertion.response.clientDataJSON));
  if (cd.type !== 'webauthn.get' || cd.challenge !== b64u.to(challenge) || cd.origin !== location.origin) return false;
  const flags = new Uint8Array(assertion.response.authenticatorData)[32];
  return (flags & 0x01) !== 0 && (flags & 0x04) !== 0;   // user present and user verified (fingerprint or screen lock)
}

async function tryUnlock(silent) {
  if (busy) return;
  const id = read(K_CRED);
  if (!id) { locked = false; hideLock(); return; }
  busy = true;
  setMsg('Waiting for your fingerprint…');
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const a = await navigator.credentials.get({ publicKey: {
      challenge,
      allowCredentials: [{ type: 'public-key', id: b64u.from(id), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    } });
    if (a && await verified(a, challenge)) {
      locked = false;
      setMsg('Use your fingerprint to continue.');
      hideLock();
    } else {
      setMsg('That did not work. Tap Unlock to try again.');
    }
  } catch (_) {
    setMsg(silent ? 'Tap Unlock to use your fingerprint.' : 'Fingerprint not accepted. Tap Unlock to try again.');
  } finally {
    busy = false;
  }
}

// ── Wiring ───────────────────────────────────────────────────────────────────

// Called from app.js on every sign-in / sign-out
export function lockOnAuth(user) {
  if (!user || user.email === DEMO_EMAIL || (read(K_CRED) && read(K_UID) !== user.uid)) {
    if (read(K_CRED)) disableLock();
    locked = false;
    hideLock();
  }
}

let hiddenAt = 0, wasLocked = false;

function init() {
  const unlock = $('lock-unlock'), out = $('lock-signout');
  if (unlock) unlock.addEventListener('click', () => tryUnlock(false));
  if (out) out.addEventListener('click', () => document.dispatchEvent(new CustomEvent('applock:signout')));

  // Coming back to the app: ask again unless it was only away for a moment
  document.addEventListener('visibilitychange', () => {
    if (busy || !appLockActive()) return;
    if (document.hidden) { hiddenAt = Date.now(); wasLocked = locked; showLock(); }   // keeps data out of the app switcher
    else if (!wasLocked && Date.now() - hiddenAt < GRACE_MS) hideLock();
    else { locked = true; showLock(); tryUnlock(true); }
  });

  // Cold start: cover the app before anything else renders
  if (read(K_CRED) && isStandalone()) { locked = true; showLock(); tryUnlock(true); }
}

init();
