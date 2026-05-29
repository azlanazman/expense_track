import { currentUser, userSettings } from './state.js';
import { displayDate, todayString, catColor, showToast } from './helpers.js';
import { addExpense } from './db.js';

const CHEV_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

let addState = { date: todayString(), category: '', payment: '', catDdOpen: false, payDdOpen: false };

export function initAdd() {
  addState.date     = todayString();
  addState.category = userSettings.categories[0] || '';
  addState.payment  = userSettings.paymentMethods[0] || '';
  renderAddScreen();
}

function renderAddScreen() {
  const d = new Date();
  document.getElementById('add-eyebrow').textContent =
    d.toLocaleDateString('en-MY', { day: 'numeric', month: 'long', year: 'numeric' });
  document.getElementById('add-date-display').textContent = displayDate(addState.date);
  document.getElementById('add-date-input').value = addState.date;
  document.getElementById('add-cat-display').innerHTML =
    `<span class="chip-dot" style="background:${catColor(addState.category, userSettings.categories)}"></span>${addState.category}`;
  document.getElementById('add-pay-display').innerHTML =
    `<span class="pay-pill sm">${addState.payment}</span>`;
}

// ── Date picker ─────────────────────────────────────────────────────────────

const addDateBtn   = document.getElementById('add-date-btn');
const addDateInput = document.getElementById('add-date-input');

addDateBtn.addEventListener('click', () =>
  addDateInput.showPicker ? addDateInput.showPicker() : addDateInput.click());
addDateInput.addEventListener('change', () => {
  addState.date = addDateInput.value;
  document.getElementById('add-date-display').textContent = displayDate(addState.date);
});

// ── Category dropdown ────────────────────────────────────────────────────────

const addCatBtn  = document.getElementById('add-cat-btn');
const addCatDd   = document.getElementById('add-cat-dd');
const addCatChev = document.getElementById('add-cat-chev');

function openCatDd() {
  closePayDd();
  addState.catDdOpen = true;
  addCatChev.classList.add('open');
  addCatDd.style.display = '';
  addCatDd.innerHTML = userSettings.categories.map(c => `
    <button class="dd-item${c === addState.category ? ' on' : ''}" data-cat="${c}" type="button">
      <span class="chip-dot" style="background:${catColor(c, userSettings.categories)}"></span>${c}
      ${c === addState.category ? `<span class="dd-check">${CHECK_SVG}</span>` : ''}
    </button>`).join('');
  addCatDd.querySelectorAll('.dd-item').forEach(btn => {
    btn.addEventListener('click', () => {
      addState.category = btn.dataset.cat;
      closeCatDd();
      document.getElementById('add-cat-display').innerHTML =
        `<span class="chip-dot" style="background:${catColor(addState.category, userSettings.categories)}"></span>${addState.category}`;
    });
  });
}
function closeCatDd() {
  addState.catDdOpen = false;
  addCatChev.classList.remove('open');
  addCatDd.style.display = 'none';
}
addCatBtn.addEventListener('click', () => addState.catDdOpen ? closeCatDd() : openCatDd());

// ── Payment dropdown ─────────────────────────────────────────────────────────

const addPayBtn  = document.getElementById('add-pay-btn');
const addPayDd   = document.getElementById('add-pay-dd');
const addPayChev = document.getElementById('add-pay-chev');

function openPayDd() {
  closeCatDd();
  addState.payDdOpen = true;
  addPayChev.classList.add('open');
  addPayDd.style.display = '';
  addPayDd.innerHTML = userSettings.paymentMethods.map(p => `
    <button class="dd-item${p === addState.payment ? ' on' : ''}" data-pay="${p}" type="button">
      <span class="pay-pill sm">${p}</span>
      ${p === addState.payment ? `<span class="dd-check">${CHECK_SVG}</span>` : ''}
    </button>`).join('');
  addPayDd.querySelectorAll('.dd-item').forEach(btn => {
    btn.addEventListener('click', () => {
      addState.payment = btn.dataset.pay;
      closePayDd();
      document.getElementById('add-pay-display').innerHTML =
        `<span class="pay-pill sm">${addState.payment}</span>`;
    });
  });
}
function closePayDd() {
  addState.payDdOpen = false;
  addPayChev.classList.remove('open');
  addPayDd.style.display = 'none';
}
addPayBtn.addEventListener('click', () => addState.payDdOpen ? closePayDd() : openPayDd());

document.addEventListener('click', (e) => {
  if (!document.getElementById('add-cat-field').contains(e.target)) closeCatDd();
  if (!document.getElementById('add-pay-field').contains(e.target)) closePayDd();
});

// ── Amount input ─────────────────────────────────────────────────────────────

document.getElementById('add-amount').addEventListener('input', (e) => {
  const v = e.target.value.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  e.target.value = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
});

// ── Save ─────────────────────────────────────────────────────────────────────

document.getElementById('btn-save-expense').addEventListener('click', async () => {
  const amtRaw = document.getElementById('add-amount').value.trim();
  const amount = parseFloat(amtRaw);
  if (!amtRaw || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount'); return; }
  try {
    await addExpense({
      uid:           currentUser.uid,
      date:          addState.date,
      amount,
      category:      addState.category,
      paymentMethod: addState.payment,
      notes:         document.getElementById('add-notes').value.trim(),
    });
    document.getElementById('add-amount').value = '';
    document.getElementById('add-notes').value  = '';
    showToast('Saved!');
  } catch (e) { console.error(e); showToast('Error saving'); }
});
