import { currentUser, userSettings } from './state.js';
import { fmt, todayString, displayDate, showToast } from './helpers.js';
import { fetchAccounts, persistAccounts, addTransfer, fetchAllTransfers, fetchAllExpenses, fetchPotTransactions } from './db.js';

const ACCOUNT_TYPE_ICONS = {
  bank:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
  ewallet: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/></svg>`,
  card:    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`,
  savings: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.8 2-3 2-4.5C20 9 20 5 19 5z"/><path d="M2 9.5a5 5 0 0 1 5-5"/></svg>`,
};

const ACCOUNT_TYPES = ['ewallet', 'bank', 'card', 'savings'];
const ARROW_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

let accState = {
  accounts:        null,
  allExpenses:     [],
  allTransfers:    [],
  potTransactions: [],
  editId:          null,
  isNew:           false,
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function initAccounts() {
  await loadAccounts();
  renderAccounts();
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadAccounts() {
  const uid = currentUser.uid;
  let accounts = await fetchAccounts(uid);

  if (!accounts) {
    accounts = userSettings.paymentMethods.map((name, i) => ({
      id:             `acc-${Date.now()}-${i}`,
      name,
      openingBalance: 0,
      type:           'ewallet',
      createdAt:      new Date().toISOString(),
    }));
    try {
      await persistAccounts(uid, accounts);
    } catch (e) {
      console.error(e);
    }
  }

  accState.accounts        = accounts;
  accState.allExpenses     = await fetchAllExpenses(uid);
  accState.allTransfers    = await fetchAllTransfers(uid);
  accState.potTransactions = await fetchPotTransactions(uid);
}

function calcBalance(account) {
  const { id, name, openingBalance } = account;
  const startDate = account.createdAt
    ? (account.createdAt.toDate ? account.createdAt.toDate().toISOString().slice(0, 10) : account.createdAt.slice(0, 10))
    : '2000-01-01';

  const expenses = accState.allExpenses.filter(e => e.paymentMethod === name && e.date >= startDate);
  const income   = expenses.filter(e => e.isIncome).reduce((s, e) => s + e.amount, 0);
  const spend    = expenses.filter(e => !e.isIncome).reduce((s, e) => s + e.amount, 0);
  const tfOut    = accState.allTransfers.filter(t => t.fromAccountId === id).reduce((s, t) => s + t.amount, 0);
  const tfIn     = accState.allTransfers.filter(t => t.toAccountId   === id).reduce((s, t) => s + t.amount, 0);
  const potOut   = accState.potTransactions.filter(c => c.linkedAccountId === id && c.type === 'contribute').reduce((s, c) => s + c.amount, 0);
  const potIn    = accState.potTransactions.filter(c => c.linkedAccountId === id && c.type === 'withdraw').reduce((s, c) => s + c.amount, 0);

  return (openingBalance || 0) + income - spend - tfOut + tfIn - potOut + potIn;
}

function lastUpdated(account) {
  const { id, name } = account;
  const dates = [
    ...accState.allExpenses.filter(e => e.paymentMethod === name).map(e => e.date),
    ...accState.allTransfers.filter(t => t.fromAccountId === id || t.toAccountId === id).map(t => t.date),
  ].filter(Boolean).sort().reverse();
  return dates[0] ? displayDate(dates[0]) : 'No activity';
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderAccounts() {
  const body = document.getElementById('budget-body');
  body.innerHTML = '';

  const total = accState.accounts.reduce((s, a) => s + calcBalance(a), 0);

  // Total card
  const totalCard = document.createElement('div');
  totalCard.className = 'acc-total-card';
  totalCard.innerHTML = `
    <div class="acc-total-label">Total across accounts</div>
    <div class="acc-total-val">RM ${fmt(total)}</div>`;
  body.appendChild(totalCard);

  // Account list
  const listSec = document.createElement('section');
  listSec.innerHTML = '<span class="block-label">Accounts</span>';
  const listCard = document.createElement('div');
  listCard.className = 'acc-list';

  accState.accounts.forEach(acc => listCard.appendChild(buildAccRow(acc)));
  listSec.appendChild(listCard);

  const addBtn = document.createElement('button');
  addBtn.type      = 'button';
  addBtn.className = 'acc-add-btn';
  addBtn.style.marginTop = '10px';
  addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add account`;
  addBtn.addEventListener('click', () => openAccSheet(null));
  listSec.appendChild(addBtn);
  body.appendChild(listSec);

  // Recent transfers
  const recentTf = accState.allTransfers.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const tfSec = document.createElement('section');

  const tfHdr = document.createElement('div');
  tfHdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px';
  tfHdr.innerHTML = `<span class="block-label" style="margin-bottom:0">Recent transfers</span>`;
  const seeAll = document.createElement('button');
  seeAll.type = 'button';
  seeAll.style.cssText = 'font-size:12.5px;font-weight:700;color:var(--accent-ink);background:var(--accent-soft);border:1px solid var(--accent-line);padding:5px 12px;border-radius:999px;cursor:pointer';
  seeAll.textContent = 'See all';
  seeAll.addEventListener('click', () => document.dispatchEvent(new CustomEvent('nav:show-log-transfers')));
  tfHdr.appendChild(seeAll);
  tfSec.appendChild(tfHdr);

  if (recentTf.length === 0) {
    tfSec.insertAdjacentHTML('beforeend', '<p style="color:var(--ink-3);font-size:13.5px;font-weight:500;padding:12px 0">No transfers yet</p>');
  } else {
    const tfCard = document.createElement('div');
    tfCard.className = 'recent-transfers';
    recentTf.forEach(tf => tfCard.appendChild(buildTransferRow(tf)));
    tfSec.appendChild(tfCard);
  }
  body.appendChild(tfSec);

  // Wire FAB
  document.getElementById('acc-transfer-fab').onclick = openTransferSheet;
}

function buildAccRow(acc) {
  const bal    = calcBalance(acc);
  const isNeg  = bal < 0;
  const btn    = document.createElement('button');
  btn.type     = 'button';
  btn.className = 'acc-row';
  btn.innerHTML = `
    <div class="acc-icon">${ACCOUNT_TYPE_ICONS[acc.type] || ACCOUNT_TYPE_ICONS.ewallet}</div>
    <div class="acc-info">
      <div class="acc-name">${acc.name}</div>
      <div class="acc-meta">${lastUpdated(acc)}</div>
    </div>
    <div class="acc-bal-col">
      <div class="acc-bal-val" style="color:${isNeg ? 'var(--danger)' : 'var(--accent-ink)'}">${isNeg ? '−' : ''}RM ${fmt(Math.abs(bal))}</div>
      <div class="acc-bal-open">Opening RM ${fmt(acc.openingBalance || 0)}</div>
    </div>`;
  btn.addEventListener('click', () => openAccSheet(acc.id));
  return btn;
}

function buildTransferRow(tf) {
  const fromAcc = accState.accounts.find(a => a.id === tf.fromAccountId);
  const toAcc   = accState.accounts.find(a => a.id === tf.toAccountId);
  const fromName = fromAcc?.name || tf.fromAccountId;
  const toName   = toAcc?.name   || tf.toAccountId;

  const row = document.createElement('div');
  row.className = 'transfer-row';
  row.innerHTML = `
    <div class="transfer-icon">${ARROW_SVG}</div>
    <div class="transfer-info">
      <div class="transfer-label">${fromName} → ${toName}</div>
      <div class="transfer-meta">${tf.date ? displayDate(tf.date) : ''}${tf.notes ? ' · ' + tf.notes : ''}</div>
    </div>
    <div class="transfer-amt">RM ${fmt(tf.amount)}</div>`;
  return row;
}

// ── Account sheet ─────────────────────────────────────────────────────────────

function openAccSheet(id) {
  const acc      = id ? accState.accounts.find(a => a.id === id) : null;
  accState.editId = id;
  accState.isNew  = !acc;

  document.getElementById('acc-sheet-title').textContent = acc ? 'Edit account' : 'Add account';
  document.getElementById('acc-name-inp').value = acc?.name || '';
  document.getElementById('acc-bal-inp').value  = acc?.openingBalance > 0 ? String(acc.openingBalance) : '';

  const currentType = acc?.type || 'ewallet';
  const chipsEl = document.getElementById('acc-type-chips');
  chipsEl.innerHTML = ACCOUNT_TYPES.map(t => `
    <button class="type-chip${t === currentType ? ' on' : ''}" data-type="${t}" type="button">
      ${ACCOUNT_TYPE_ICONS[t]} ${t.charAt(0).toUpperCase() + t.slice(1)}
    </button>`).join('');
  chipsEl.querySelectorAll('.type-chip').forEach(c =>
    c.addEventListener('click', () => {
      chipsEl.querySelectorAll('.type-chip').forEach(x => x.classList.remove('on'));
      c.classList.add('on');
    })
  );

  openSheet('acc-sheet');
}

document.getElementById('acc-save-btn').addEventListener('click', async () => {
  const name  = document.getElementById('acc-name-inp').value.trim();
  if (!name) { document.getElementById('acc-name-inp').focus(); return; }
  const bal   = parseFloat(document.getElementById('acc-bal-inp').value) || 0;
  const type  = document.querySelector('#acc-type-chips .type-chip.on')?.dataset.type || 'ewallet';

  if (accState.isNew) {
    accState.accounts.push({
      id:             `acc-${Date.now()}`,
      name, openingBalance: bal, type,
      createdAt:      new Date().toISOString(),
    });
  } else {
    const acc = accState.accounts.find(a => a.id === accState.editId);
    if (acc) { acc.name = name; acc.openingBalance = bal; acc.type = type; }
  }

  try {
    await persistAccounts(currentUser.uid, accState.accounts);
    closeSheet('acc-sheet');
    renderAccounts();
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
  }
});

document.getElementById('acc-cancel-btn').addEventListener('click', () => closeSheet('acc-sheet'));

// ── Transfer sheet ────────────────────────────────────────────────────────────

function openTransferSheet() {
  const accounts = accState.accounts;
  const opts = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  document.getElementById('tf-from').innerHTML = opts;
  document.getElementById('tf-to').innerHTML   = opts;
  if (accounts.length > 1) document.getElementById('tf-to').selectedIndex = 1;
  document.getElementById('tf-amount').value = '';
  document.getElementById('tf-date').value   = todayString();
  document.getElementById('tf-notes').value  = '';
  updateTransferPreview();
  openSheet('transfer-sheet');
}

function updateTransferPreview() {
  const fromId = document.getElementById('tf-from').value;
  const toId   = document.getElementById('tf-to').value;
  const amt    = parseFloat(document.getElementById('tf-amount').value) || 0;
  const preview = document.getElementById('tf-preview');

  if (!fromId || !toId || fromId === toId) { preview.classList.remove('show'); return; }

  const fromAcc = accState.accounts.find(a => a.id === fromId);
  const toAcc   = accState.accounts.find(a => a.id === toId);
  if (!fromAcc || !toAcc) { preview.classList.remove('show'); return; }

  const fromBal = calcBalance(fromAcc) - amt;
  const toBal   = calcBalance(toAcc)   + amt;

  document.getElementById('tf-prev-from-lbl').textContent = `${fromAcc.name} after`;
  document.getElementById('tf-prev-to-lbl').textContent   = `${toAcc.name} after`;
  document.getElementById('tf-prev-from-val').textContent = `${fromBal < 0 ? '−' : ''}RM ${fmt(Math.abs(fromBal))}`;
  document.getElementById('tf-prev-to-val').textContent   = `${toBal   < 0 ? '−' : ''}RM ${fmt(Math.abs(toBal))}`;
  document.getElementById('tf-prev-from-val').style.color = fromBal < 0 ? 'var(--danger)' : 'var(--ink)';
  document.getElementById('tf-prev-to-val').style.color   = toBal   < 0 ? 'var(--danger)' : 'var(--ink)';
  preview.classList.add('show');
}

['tf-from', 'tf-to', 'tf-amount'].forEach(id =>
  document.getElementById(id).addEventListener('change', updateTransferPreview)
);
document.getElementById('tf-amount').addEventListener('input', e => {
  const v = e.target.value.replace(/[^0-9.]/g, '');
  const p = v.split('.');
  e.target.value = p.length > 2 ? p[0] + '.' + p.slice(1).join('') : v;
  updateTransferPreview();
});

document.getElementById('tf-confirm-btn').addEventListener('click', async () => {
  const fromId = document.getElementById('tf-from').value;
  const toId   = document.getElementById('tf-to').value;
  const amt    = parseFloat(document.getElementById('tf-amount').value);
  const date   = document.getElementById('tf-date').value;

  if (fromId === toId) { showToast('From and To must be different'); return; }
  if (!amt || amt <= 0) { showToast('Enter a valid amount'); return; }
  if (!date) { showToast('Choose a date'); return; }

  try {
    await addTransfer({
      uid: currentUser.uid,
      fromAccountId: fromId,
      toAccountId:   toId,
      amount: amt,
      date,
      notes: document.getElementById('tf-notes').value.trim(),
      type: 'transfer',
    });
    accState.allTransfers = await fetchAllTransfers(currentUser.uid);
    closeSheet('transfer-sheet');
    renderAccounts();
    showToast('Transfer saved!');
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
  }
});

document.getElementById('tf-cancel-btn').addEventListener('click', () => closeSheet('transfer-sheet'));

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function openSheet(id) {
  document.getElementById(id).classList.add('active');
  document.getElementById('sheet-backdrop').classList.add('active');
}

function closeSheet(id) {
  document.getElementById(id).classList.remove('active');
  document.getElementById('sheet-backdrop').classList.remove('active');
}
