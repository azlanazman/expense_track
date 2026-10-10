// Inbox of captured payment notifications. The phone's automation app (MacroDroid) posts each notification to
// Firestore's `inbox` collection (rules: firestore.rules, "Payment capture"); here the app reads the pending ones as
// the owner. Nothing becomes an expense until it is ticked and saved in the review list (js/add.js, js/review.js).
// Memory only: cleared on sign-out and when the tab is hidden, like all financial data.
import { currentUser } from './state.js';
import { fetchInbox, deleteInboxItem } from './db.js';
import { DEMO_EMAIL } from './demo.js';

let items = [];

const badge  = document.getElementById('nav-badge');
const banner = document.getElementById('add-inbox-banner');
const bannerText = document.getElementById('add-inbox-text');

export function inboxItems() { return items; }

function paint() {
  const n = items.length;
  if (badge) { badge.hidden = n === 0; badge.textContent = n > 9 ? '9+' : String(n); }
  if (banner) banner.hidden = n === 0;
  if (bannerText) bannerText.textContent = `${n} captured payment${n === 1 ? '' : 's'} to review`;
}

export async function refreshInbox() {
  if (!currentUser || currentUser.email === DEMO_EMAIL) { items = []; paint(); return items; }
  try {
    items = (await fetchInbox(currentUser.uid))
      .filter(i => i && typeof i.text === 'string')
      .sort((a, b) => String(a.receivedAt || '').localeCompare(String(b.receivedAt || '')));
  } catch (e) {
    console.error(e);   // rules not published yet, or offline: stay quiet
    items = [];
  }
  paint();
  return items;
}

export async function removeInboxItems(ids) {
  const gone = new Set();
  await Promise.all(ids.map(async id => {
    try { await deleteInboxItem(id); gone.add(id); } catch (e) { console.error(e); }
  }));
  items = items.filter(i => !gone.has(i.id));
  paint();
  return gone;
}

export function clearInboxState() {
  items = [];
  paint();
}

// Opened from the phone notification ("tap to review") with ./?inbox=1
export function hasInboxFlag() { return new URLSearchParams(location.search).has('inbox'); }
export function clearInboxFlag() {
  const u = new URL(location.href);
  u.searchParams.delete('inbox');
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}
