// Settings › Payment capture: creates the capture key the phone's automation app uses, and shows the values to
// copy into it. The key lives in Firestore at captureKeys/{uid} (owner-only) and in the screen below while it is open.
import { currentUser } from './state.js';
import { db } from './firebase.js';
import { showToast } from './helpers.js';
import { fetchCaptureKey, saveCaptureKey, removeCaptureKey } from './db.js';
import { DEMO_EMAIL } from './demo.js';

const row    = document.getElementById('capture-row');
const btn    = document.getElementById('btn-capture');
const sub    = document.getElementById('capture-sub');
const panel  = document.getElementById('capture-panel');
const status = document.getElementById('capture-status');
const fields = document.getElementById('capture-fields');
const makeBtn = document.getElementById('capture-make');
const dropBtn = document.getElementById('capture-drop');
const copySetup = document.getElementById('capture-copy-setup');
const copyTest  = document.getElementById('capture-copy-test');

let key = null;
let open = false;

const projectId = () => (db && db.app && db.app.options && db.app.options.projectId) || '';
const endpoint = () => `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents/inbox`;

function body(app, title, text, when) {
  return `{"fields":{"uid":{"stringValue":"${currentUser.uid}"},"key":{"stringValue":"${key}"},"app":{"stringValue":"${app}"},"title":{"stringValue":"${title}"},"text":{"stringValue":"${text}"},"receivedAt":{"stringValue":"${when}"}}}`;
}

function newKey() {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');   // 48 hex characters
}

function show() {
  panel.hidden = !open;
  if (!open) { fields.textContent = ''; return; }
  status.textContent = key ? 'Capture is set up. Copy these into your automation app.' : 'No capture key yet. Create one, then copy the setup into MacroDroid.';
  makeBtn.textContent = key ? 'Make a new key' : 'Create capture key';
  dropBtn.hidden = !key;
  copySetup.hidden = !key;
  copyTest.hidden = !key;
  fields.textContent = '';
  if (!key) return;
  [['Web address', endpoint()], ['Your ID', currentUser.uid], ['Capture key', key]].forEach(([label, val]) => {
    const wrap = document.createElement('div');
    wrap.className = 'cap-field';
    const l = document.createElement('span');
    l.className = 'block-label'; l.textContent = label;
    const inp = document.createElement('input');
    inp.className = 'input-row note'; inp.readOnly = true; inp.value = val; inp.setAttribute('aria-label', label);
    inp.addEventListener('focus', () => inp.select());
    wrap.append(l, inp);
    fields.appendChild(wrap);
  });
}

async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); showToast(done); }
  catch (_) { showToast('Could not copy: press and hold a field to copy it'); }
}

export async function renderCapture() {
  if (!row) return;
  const ok = currentUser && currentUser.email !== DEMO_EMAIL;
  row.style.display = ok ? '' : 'none';
  if (!ok) return;
  try { key = await fetchCaptureKey(currentUser.uid); } catch (_) { key = null; }
  sub.textContent = key ? 'On: payment notifications can be sent to your inbox' : 'Off: set up to capture payment notifications';
  show();
}

btn && btn.addEventListener('click', () => { open = !open; show(); });

makeBtn && makeBtn.addEventListener('click', async () => {
  if (key && !confirm('A new key replaces the old one. Update it in MacroDroid too, or captures will stop. Continue?')) return;
  makeBtn.disabled = true;
  try {
    const k = newKey();
    await saveCaptureKey(currentUser.uid, k);
    key = k;
    sub.textContent = 'On: payment notifications can be sent to your inbox';
    showToast('Capture key created');
  } catch (e) { console.error(e); showToast('Could not create the key (are the rules published?)'); }
  makeBtn.disabled = false;
  show();
});

dropBtn && dropBtn.addEventListener('click', async () => {
  if (!confirm('Turn capture off? The automation app will stop being accepted.')) return;
  try { await removeCaptureKey(currentUser.uid); key = null; sub.textContent = 'Off: set up to capture payment notifications'; showToast('Capture is off'); }
  catch (e) { console.error(e); showToast('Could not turn capture off'); }
  show();
});

// Copies ONLY the JSON body (it must start with "{" in MacroDroid). The web address and content type are separate fields.
copySetup && copySetup.addEventListener('click', () => {
  if (!key) { showToast('Create or reload the capture key first'); return; }
  copy(body('APP NAME', 'NOTIFICATION TITLE', 'NOTIFICATION TEXT', 'YYYY-MM-DD HH:MM'), 'Body copied: replace the 4 CAPITAL words with MacroDroid magic text');
});

copyTest && copyTest.addEventListener('click', () => key ? copy(
  `curl -X POST '${endpoint()}' -H 'Content-Type: application/json' -d '` + body('Touch n Go', 'Payment successful', 'You have paid RM1.23 to TEST SHOP', new Date().toISOString().slice(0, 16).replace('T', ' ')) + `'`,
  'Test command copied: paste it in Terminal') : showToast('Create or reload the capture key first'));

export function clearCapture() { key = null; open = false; if (panel) { panel.hidden = true; fields.textContent = ''; } }
