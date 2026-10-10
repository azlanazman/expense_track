// Add expense: a bottom sheet opened from the round "+" in the nav bar (there is no Add screen any more).
// Amount first, then category / account / date chips, optional note. Save morphs to a tick and closes;
// "Save & add another" keeps the sheet open. Closes by X, backdrop, Escape, swipe-down or the phone back button.
import { currentUser, userSettings } from './state.js';
import { displayDate, todayString, parseLocalDate, catColor, showToast, escapeHtml, fmt } from './helpers.js';
import { addExpense, fetchExpenses } from './db.js';
import { buildLearn, suggest } from './quickparse.js';
import { parseReceiptText, parseTransactions } from './receiptparse.js';
import { renderReview } from './review.js';

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
const hintEl    = document.getElementById('add-hint');
const imgBtn    = document.getElementById('add-img-btn');
const fileEl    = document.getElementById('add-file');
const formEl    = document.getElementById('add-form');
const reviewEl  = document.getElementById('add-review');
const titleEl   = document.getElementById('add-sheet-title');

const CAL_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

const st = { reviewing: false, open: false, saving: false, category: '', payment: '', date: todayString(), dateKind: 'today', catTouched: false, payTouched: false };

// Habits learned from the last 120 days of notes (kept in memory only; cleared with the sheet state)
let hist = { entries: [], learn: null, loaded: false, loading: false };
let histPromise = null;
function loadHist() {
  if (!histPromise) histPromise = loadHistNow();
  return histPromise;
}
async function loadHistNow() {
  if (hist.loaded || hist.loading || !currentUser) return;
  hist.loading = true;
  try {
    const from = dateWith(-120);
    const rows = await fetchExpenses(currentUser.uid, from, todayString());
    hist.entries = rows.filter(e => e.notes && !e.isIncome);
    hist.learn = buildLearn(hist.entries);
    hist.loaded = true;
  } catch (e) { console.error(e); }
  hist.loading = false;
}

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
  st.catTouched = false;
  st.payTouched = false;
  amountEl.value = '';
  notesEl.value  = '';
  hintEl.textContent = '';
  hideReview();
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
  loadHist();
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
  hintEl.textContent = '';
  hist = { entries: [], learn: null, loaded: false, loading: false };
  histPromise = null;
  hideReview();
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
  st.catTouched = true;
  renderChips();
});
payWrap.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pay]');
  if (!b) return;
  st.payment = b.dataset.pay;
  st.payTouched = true;
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

// ── Learned habits ───────────────────────────────────────────────────────────

// Applies parsed fields without overriding a chip the person tapped by hand
function applyFields(r) {
  const cats = userSettings.categories || [], pays = userSettings.paymentMethods || [];
  if (r.category && cats.includes(r.category) && !st.catTouched) st.category = r.category;
  if (r.payment && pays.includes(r.payment) && !st.payTouched) st.payment = r.payment;
  if (r.dateKind === 'yesterday') { st.dateKind = 'yesterday'; st.date = dateWith(-1); }
  else if (r.dateKind === 'today') { st.dateKind = 'today'; st.date = todayString(); }
  renderChips();
}

// Typing a note by hand: suggest the usual category / account for that word
let noteTimer = 0;
notesEl.addEventListener('input', () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    const s = suggest(notesEl.value, hist.learn, userSettings.categories || [], userSettings.paymentMethods || []);
    if (!s) { hintEl.textContent = ''; return; }
    applyFields({ category: s.category, payment: s.payment });
    hintEl.textContent = [s.category, s.payment].filter(Boolean).join(' · ') + ` · learned from “${s.word}” ×${s.n}`;
  }, 200);
});

// ── Screenshot or receipt: read on the phone, filled in for the person to confirm ──

function shortDay(iso) {
  const d = parseLocalDate(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fillFromText(text, source) {
  const cats = userSettings.categories || [], pays = userSettings.paymentMethods || [];
  const r = parseReceiptText(text, { cats, pays, learn: hist.learn });
  if (!r.amount && !r.merchant && !r.date) { hintEl.textContent = `Nothing readable found in the ${source}. Type it in.`; return; }
  if (r.amount) amountEl.value = String(r.amount);
  if (r.merchant && !notesEl.value.trim()) { notesEl.value = r.merchant; setNoteOpen(true); }
  if (r.date) {
    st.date = r.date;
    st.dateKind = r.date === todayString() ? 'today' : r.date === dateWith(-1) ? 'yesterday' : 'custom';
  }
  applyFields({ category: r.category, payment: r.payment });
  const bits = [r.amount ? 'RM ' + fmt(r.amount) : 'amount not found', r.date ? shortDay(r.date) : 'date not found'];
  if (r.merchant) bits.push(r.merchant);
  hintEl.textContent = `From ${source}: ${bits.join(' · ')} · check before saving`;
}

async function fillFromImage(blob) {
  hintEl.textContent = 'Reading screenshot…';
  try {
    const { readImageText } = await import('./ocr.js');
    const { text, lines } = await readImageText(blob, p => { hintEl.textContent = `Reading screenshot… ${Math.round(p * 100)}%`; });
    await loadHist();
    if (!st.open) return;
    const cats = userSettings.categories || [], pays = userSettings.paymentMethods || [];
    const { rows } = parseTransactions(lines, { cats, pays, learn: hist.learn });
    if (rows.length >= 2) { hintEl.textContent = ''; await showReview(rows); }
    else fillFromText(text, 'screenshot');
  } catch (e) {
    console.error(e);
    hintEl.textContent = '';
    showToast('Could not read that image');
  }
}

// ── Several transactions in one screenshot: a review list inside the sheet ───

function hideReview() {
  st.reviewing = false;
  reviewEl.hidden = true;
  reviewEl.textContent = '';
  formEl.hidden = false;
  titleEl.textContent = 'Add expense';
  sheet.classList.remove('reviewing');
}

// Same day and same amount already saved: shown unticked with a warning
async function markDuplicates(rows) {
  const dates = rows.map(r => r.date).filter(Boolean).sort();
  if (!dates.length || !currentUser) return;
  const from = dates[0], to = dates[dates.length - 1];
  if ((parseLocalDate(to) - parseLocalDate(from)) / 86400000 > 62) return;
  try {
    const have = await fetchExpenses(currentUser.uid, from, to);
    const keys = new Set(have.filter(e => !e.isIncome).map(e => e.date + '|' + Number(e.amount).toFixed(2)));
    rows.forEach(r => { if (r.dir !== 'in' && keys.has(r.date + '|' + r.amount.toFixed(2))) r.dup = true; });
  } catch (e) { console.error(e); }
}

async function showReview(rows) {
  const cats = userSettings.categories || [], pays = userSettings.paymentMethods || [];
  await markDuplicates(rows);
  if (!st.open) return;
  st.reviewing = true;
  formEl.hidden = true;
  reviewEl.hidden = false;
  titleEl.textContent = 'Review transactions';
  sheet.classList.add('reviewing');
  sheet.scrollTop = 0;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  renderReview(reviewEl, rows, {
    cats, pays,
    defaultCat: st.category,
    defaultPay: st.payment,
    onInvalid: () => showToast('Fix the highlighted amount or date'),
    onBack: () => { hideReview(); amountEl.focus({ preventScroll: true }); },
    onSave: saveReview,
  });
}

// Saves the ticked rows; returns the indexes that were saved (failed ones stay in the list)
async function saveReview(items) {
  const results = await Promise.allSettled(items.map(it => addExpense({
    uid: currentUser.uid, date: it.date, amount: it.amount, category: it.category, paymentMethod: it.payment, notes: it.note,
  })));
  const saved = [];
  let total = 0;
  results.forEach((r, k) => {
    if (r.status !== 'fulfilled') { console.error(r.reason); return; }
    const it = items[k];
    saved.push(it.index);
    total += it.amount;
    if (it.note && hist.loaded) hist.entries.push({ notes: it.note, category: it.category, paymentMethod: it.payment });
  });
  if (hist.loaded) hist.learn = buildLearn(hist.entries);
  if (saved.length) {
    showToast(`Saved ${saved.length} expense${saved.length === 1 ? '' : 's'} · RM ${fmt(total)}`);
    document.dispatchEvent(new CustomEvent('expenses:changed', { detail: {} }));
  }
  if (saved.length < items.length) showToast(`${items.length - saved.length} could not be saved, try again`);
  else setTimeout(() => closeAddSheet(), 600);
  return saved;
}

imgBtn.addEventListener('click', () => fileEl.click());
fileEl.addEventListener('change', () => {
  const f = fileEl.files && fileEl.files[0];
  fileEl.value = '';
  if (f) fillFromImage(f);
});

// Called by js/share.js with an item from the phone's Share menu
export async function openAddFromShare({ blob, text }) {
  openAddSheet();
  await loadHist();
  if (blob) await fillFromImage(blob);
  else if (text) fillFromText(text, 'shared text');
}

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
  const noteSaved = notesEl.value.trim();
  if (noteSaved && hist.loaded) {   // learn from this entry straight away
    hist.entries.push({ notes: noteSaved, category: st.category, paymentMethod: st.payment });
    hist.learn = buildLearn(hist.entries);
  }
  saveBtn.classList.add('done');   // button morphs to a tick
  showToast(`Saved RM ${fmt(amount)} · ${st.category}`);
  document.dispatchEvent(new CustomEvent('expenses:changed', { detail: { category: st.category } }));   // app.js refreshes the screen underneath

  setTimeout(() => {
    if (another) {
      amountEl.value = '';
      notesEl.value  = '';
          hintEl.textContent = '';
      st.catTouched = false;
      st.payTouched = false;
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
  const f = [...sheet.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]):not([tabindex="-1"])')].filter(el => !el.hidden && el.offsetParent !== null);
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
