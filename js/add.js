// Add expense: a bottom sheet opened from the round "+" in the nav bar (there is no Add screen any more).
// Amount first, then category / account / date chips, optional note. Save morphs to a tick and closes;
// "Save & add another" keeps the sheet open. Closes by X, backdrop, Escape, swipe-down or the phone back button.
import { currentUser, userSettings } from './state.js';
import { displayDate, todayString, parseLocalDate, catColor, showToast, escapeHtml, fmt } from './helpers.js';
import { addExpense } from './db.js';

const LAST_KEY = 'addLast';   // last used category + account (not financial data): the sheet opens with them

const sheet     = document.getElementById('add-sheet');
const backdrop  = document.getElementById('add-backdrop');
const grab      = document.getElementById('add-grab');
const amountEl  = document.getElementById('add-amount');
const amountBox = document.getElementById('add-amt-wrap');
const notesEl   = document.getElementById('add-notes');
const noteBtn   = document.getElementById('add-note-btn');
const noteWrap  = document.getElementById('add-note-wrap');
const catWrap   = document.getElementById('add-cat-chips');
const payWrap   = document.getElementById('add-pay-chips');
const dateWrap  = document.getElementById('add-date-chips');
const dateInput = document.getElementById('add-date-input');
const saveBtn   = document.getElementById('btn-save-expense');
const againBtn  = document.getElementById('btn-save-another');

const CAL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

const st = { open: false, saving: false, category: '', payment: '', date: todayString(), dateKind: 'today' };

sheet.inert = true;   // closed: nothing inside can take focus

// ── Open / close ─────────────────────────────────────────────────────────────

export function isAddSheetOpen() { return st.open; }

export function openAddSheet() {
  if (st.open) return;
  const cats = userSettings.categories || [];
  const pays = userSettings.paymentMethods || [];
  let last = {};
  try { last = JSON.parse(localStorage.getItem(LAST_KEY) || '{}') || {}; } catch (_) { last = {}; }
  st.category = cats.includes(last.c) ? last.c : (cats[0] || '');
  st.payment  = pays.includes(last.p) ? last.p : (pays[0] || '');
  st.date     = todayString();
  st.dateKind = 'today';
  st.saving   = false;
  amountEl.value = '';
  notesEl.value  = '';
  setNoteOpen(false);
  resetSaveBtn();
  renderChips();

  st.open = true;
  sheet.inert = false;
  sheet.setAttribute('aria-hidden', 'false');
  backdrop.classList.add('active');
  sheet.classList.add('active');
  document.body.classList.add('add-open');
  history.pushState({ addSheet: true }, '');
  trackKeyboard(true);
  amountEl.focus({ preventScroll: true });   // inside the tap, so iOS raises the keyboard straight away
}

export function closeAddSheet(fromPopstate = false) {
  if (!st.open) return;
  st.open = false;
  sheet.classList.remove('active', 'dragging');
  sheet.style.transform = '';
  backdrop.classList.remove('active');
  document.body.classList.remove('add-open');
  sheet.setAttribute('aria-hidden', 'true');
  sheet.inert = true;
  trackKeyboard(false);
  if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
  if (!fromPopstate && history.state && history.state.addSheet) history.back();
}

// Wipes anything typed (called on sign-out and when the tab is hidden)
export function clearAddState() {
  amountEl.value = '';
  notesEl.value  = '';
  closeAddSheet(true);
}

// ── Keyboard avoidance (iOS keeps the layout viewport when the keyboard opens) ──

function onViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  sheet.style.bottom = kb + 'px';
  sheet.style.maxHeight = Math.max(240, vv.height - 12) + 'px';
}
function trackKeyboard(on) {
  const vv = window.visualViewport;
  if (!vv) return;
  if (on) {
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
    onViewport();
  } else {
    vv.removeEventListener('resize', onViewport);
    vv.removeEventListener('scroll', onViewport);
    sheet.style.bottom = '';
    sheet.style.maxHeight = '';
  }
}

// ── Chips ────────────────────────────────────────────────────────────────────

function dateWith(offsetDays) {
  const d = parseLocalDate(todayString());
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderChips() {
  const cats = userSettings.categories || [];
  const pays = userSettings.paymentMethods || [];
  catWrap.innerHTML = cats.map(c => `
    <button class="chip${c === st.category ? ' on' : ''}" data-cat="${escapeHtml(c)}" type="button" aria-pressed="${c === st.category}">
      <span class="chip-dot" style="background:${catColor(c, cats)}"></span>${escapeHtml(c)}
    </button>`).join('');
  payWrap.innerHTML = pays.map(p => `
    <button class="chip${p === st.payment ? ' on' : ''}" data-pay="${escapeHtml(p)}" type="button" aria-pressed="${p === st.payment}">${escapeHtml(p)}</button>`).join('');
  const custom = st.dateKind === 'custom';
  dateWrap.innerHTML =
    `<button class="chip${st.dateKind === 'today' ? ' on' : ''}" data-date="today" type="button" aria-pressed="${st.dateKind === 'today'}">Today</button>` +
    `<button class="chip${st.dateKind === 'yesterday' ? ' on' : ''}" data-date="yesterday" type="button" aria-pressed="${st.dateKind === 'yesterday'}">Yesterday</button>` +
    `<button class="chip${custom ? ' on' : ''}" data-date="pick" type="button" aria-pressed="${custom}">${CAL_SVG}${custom ? displayDate(st.date) : 'Pick'}</button>`;
}

catWrap.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  st.category = b.dataset.cat;
  renderChips();
});
payWrap.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pay]');
  if (!b) return;
  st.payment = b.dataset.pay;
  renderChips();
});
dateWrap.addEventListener('click', (e) => {
  const b = e.target.closest('[data-date]');
  if (!b) return;
  const k = b.dataset.date;
  if (k === 'pick') {
    dateInput.value = st.date;
    if (dateInput.showPicker) dateInput.showPicker(); else dateInput.click();
    return;
  }
  st.dateKind = k;
  st.date = k === 'today' ? todayString() : dateWith(-1);
  renderChips();
});
dateInput.addEventListener('change', () => {
  if (!dateInput.value) return;
  st.date = dateInput.value;
  st.dateKind = st.date === todayString() ? 'today' : st.date === dateWith(-1) ? 'yesterday' : 'custom';
  renderChips();
});

// ── Note (collapsed until asked for) ─────────────────────────────────────────

function setNoteOpen(open) {
  noteBtn.hidden = open;
  noteWrap.hidden = !open;
}
noteBtn.addEventListener('click', () => { setNoteOpen(true); notesEl.focus(); });

// ── Amount ───────────────────────────────────────────────────────────────────

amountEl.addEventListener('input', (e) => {
  const v = e.target.value.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  e.target.value = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
});

function shake() {
  amountBox.classList.remove('shake');
  void amountBox.offsetWidth;   // restart the animation
  amountBox.classList.add('shake');
}

// ── Save ─────────────────────────────────────────────────────────────────────

function resetSaveBtn() {
  saveBtn.classList.remove('done');
  saveBtn.disabled = false;
  againBtn.disabled = false;
}

async function save(another) {
  if (st.saving) return;
  const amtRaw = amountEl.value.trim();
  const amount = parseFloat(amtRaw);
  if (!amtRaw || isNaN(amount) || amount <= 0) { shake(); amountEl.focus(); showToast('Enter a valid amount'); return; }
  if (amount >= 1000000) { shake(); amountEl.focus(); showToast('Amount must be under RM 1,000,000'); return; }
  if (!st.category || !st.payment) { showToast('Choose a category and an account'); return; }

  st.saving = true;
  saveBtn.disabled = true;
  againBtn.disabled = true;
  try {
    await addExpense({
      uid:           currentUser.uid,
      date:          st.date,
      amount,
      category:      st.category,
      paymentMethod: st.payment,
      notes:         notesEl.value.trim(),
    });
  } catch (e) {
    console.error(e);
    showToast('Error saving');
    st.saving = false;
    resetSaveBtn();
    return;
  }

  try { localStorage.setItem(LAST_KEY, JSON.stringify({ c: st.category, p: st.payment })); } catch (_) { /* ignore */ }
  saveBtn.classList.add('done');   // button morphs to a tick
  showToast(`Saved RM ${fmt(amount)} · ${st.category}`);
  document.dispatchEvent(new CustomEvent('expenses:changed', { detail: { category: st.category } }));   // app.js refreshes the screen underneath

  setTimeout(() => {
    if (another) {
      amountEl.value = '';
      notesEl.value  = '';
      st.saving = false;
      resetSaveBtn();
      amountEl.focus({ preventScroll: true });
    } else {
      closeAddSheet();
      st.saving = false;
      resetSaveBtn();
    }
  }, another ? 500 : 750);
}

saveBtn.addEventListener('click', () => save(false));
againBtn.addEventListener('click', () => save(true));
amountEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(false); } });

// ── Dismiss: X, backdrop, Escape, swipe down; keep Tab inside the sheet ──────

document.getElementById('add-close').addEventListener('click', () => closeAddSheet());
backdrop.addEventListener('click', () => closeAddSheet());

document.addEventListener('keydown', (e) => {
  if (!st.open) return;
  if (e.key === 'Escape') { closeAddSheet(); return; }
  if (e.key !== 'Tab') return;
  const f = [...sheet.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"])')].filter(el => !el.hidden && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], lastEl = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
  else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
});

let drag = null;
grab.addEventListener('pointerdown', (e) => {
  drag = { y: e.clientY, dy: 0 };
  sheet.classList.add('dragging');
  grab.setPointerCapture(e.pointerId);
});
grab.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.dy = Math.max(0, e.clientY - drag.y);
  sheet.style.transform = `translateY(${drag.dy}px)`;
});
function endDrag() {
  if (!drag) return;
  const dy = drag.dy;
  drag = null;
  sheet.classList.remove('dragging');
  if (dy > 90) closeAddSheet(); else sheet.style.transform = '';
}
grab.addEventListener('pointerup', endDrag);
grab.addEventListener('pointercancel', endDrag);
