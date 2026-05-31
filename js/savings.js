import { currentUser } from './state.js';
import { fmt, todayString, showToast } from './helpers.js';
import { fetchSavingsPots, persistSavingsPots, addPotTransaction, deletePotTransactionsByPot, fetchAccounts } from './db.js';

const POT_COLOURS = [
  'oklch(0.62 0.115 185)',
  'oklch(0.64 0.115 5)',
  'oklch(0.64 0.085 250)',
  'oklch(0.64 0.085 60)',
  'oklch(0.58 0.13 145)',
  'oklch(0.64 0.085 300)',
];

let savState = {
  pots:     null,
  accounts: null,
  txnPotId: null,
  txnType:  'contribute',
  editPotId: null,
  selectedColour: POT_COLOURS[0],
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function initSavings() {
  await loadSavings();
  renderSavings();
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadSavings() {
  const uid = currentUser.uid;
  savState.pots     = await fetchSavingsPots(uid) || [];
  savState.accounts = await fetchAccounts(uid) || [];
}

async function savePots() {
  await persistSavingsPots(currentUser.uid, savState.pots);
}

// ── Render ────────────────────────────────────────────────────────────────────

export function renderSavings() {
  const body = document.getElementById('budget-body');
  body.innerHTML = '';

  const total = savState.pots.reduce((s, p) => s + (p.currentBalance || 0), 0);

  const totalCard = document.createElement('div');
  totalCard.className = 'sav-total-card';
  totalCard.innerHTML = `
    <div class="acc-total-label">Total saved</div>
    <div class="acc-total-val">RM ${fmt(total)}</div>`;
  body.appendChild(totalCard);

  const potsSec = document.createElement('section');
  potsSec.innerHTML = '<span class="block-label">Savings pots</span>';

  if (savState.pots.length === 0) {
    potsSec.insertAdjacentHTML('beforeend', '<p style="color:var(--ink-3);font-size:13.5px;font-weight:500;padding:12px 0">No savings pots yet. Add one below.</p>');
  } else {
    const potsWrap = document.createElement('div');
    potsWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    savState.pots.forEach(pot => potsWrap.appendChild(buildPotCard(pot)));
    potsSec.appendChild(potsWrap);
  }

  const addBtn = document.createElement('button');
  addBtn.type      = 'button';
  addBtn.className = 'pot-add-btn';
  addBtn.style.marginTop = '10px';
  addBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New savings pot`;
  addBtn.addEventListener('click', () => openPotSheet(null));
  potsSec.appendChild(addBtn);
  body.appendChild(potsSec);
}

function buildPotCard(pot) {
  const card = document.createElement('div');
  card.className = 'pot-card';

  const bal    = pot.currentBalance || 0;
  const target = pot.targetAmount   || 0;
  const pct    = target > 0 ? Math.min(100, (bal / target) * 100) : 100;
  const acc    = savState.accounts.find(a => a.id === pot.linkedAccountId);
  const colour = pot.colour || POT_COLOURS[0];

  card.innerHTML = `
    <div class="pot-hdr">
      <div class="pot-dot" style="background:${colour}"></div>
      <button class="pot-name-btn" type="button">${pot.name}</button>
      ${acc ? `<span class="pot-acc-lbl">${acc.name}</span>` : ''}
    </div>
    <div class="pot-bar-wrap">
      <div class="pot-bar-fill" style="width:${pct.toFixed(1)}%;background:${colour}"></div>
    </div>
    <div class="pot-bal-row">
      <span class="pot-bal-val">RM ${fmt(bal)}</span>
      ${target > 0 ? `<span class="pot-bal-goal">goal RM ${fmt(target)}</span>` : ''}
      ${target > 0 ? `<span style="font-size:12px;font-weight:600;color:var(--ink-3);margin-left:auto">${pct.toFixed(0)}%</span>` : ''}
    </div>
    <div class="pot-btns">
      <button class="pot-btn add" type="button">Add</button>
      <button class="pot-btn withdraw" type="button">Withdraw</button>
    </div>`;

  card.querySelector('.pot-name-btn').addEventListener('click', () => openPotSheet(pot.id));
  card.querySelector('.pot-btn.add').addEventListener('click', () => openTxnSheet(pot.id, 'contribute'));
  card.querySelector('.pot-btn.withdraw').addEventListener('click', () => openTxnSheet(pot.id, 'withdraw'));
  return card;
}

// ── Pot transaction sheet ─────────────────────────────────────────────────────

function openTxnSheet(potId, type) {
  savState.txnPotId = potId;
  savState.txnType  = type;
  const pot = savState.pots.find(p => p.id === potId);

  document.getElementById('ptxn-title').textContent     = type === 'contribute' ? `Add to "${pot.name}"` : `Withdraw from "${pot.name}"`;
  document.getElementById('ptxn-acc-label').textContent = type === 'contribute' ? 'From account' : 'To account';
  document.getElementById('ptxn-amount').value = '';
  document.getElementById('ptxn-date').value   = todayString();
  document.getElementById('ptxn-notes').value  = '';

  const accSel = document.getElementById('ptxn-account');
  accSel.innerHTML = savState.accounts.map(a =>
    `<option value="${a.id}"${a.id === pot.linkedAccountId ? ' selected' : ''}>${a.name}</option>`
  ).join('');

  openSheet('pot-txn-sheet');
}

document.getElementById('ptxn-amount').addEventListener('input', e => {
  const v = e.target.value.replace(/[^0-9.]/g, '');
  const p = v.split('.');
  e.target.value = p.length > 2 ? p[0] + '.' + p.slice(1).join('') : v;
});

document.getElementById('ptxn-confirm-btn').addEventListener('click', async () => {
  const amt  = parseFloat(document.getElementById('ptxn-amount').value);
  const date = document.getElementById('ptxn-date').value;
  if (!amt || amt <= 0) { showToast('Enter a valid amount'); return; }
  if (!date) { showToast('Choose a date'); return; }

  const { txnPotId, txnType } = savState;
  const pot = savState.pots.find(p => p.id === txnPotId);
  if (!pot) return;

  if (txnType === 'withdraw' && amt > (pot.currentBalance || 0)) {
    showToast(`Max withdraw is RM ${fmt(pot.currentBalance || 0)}`);
    return;
  }

  try {
    await addPotTransaction({
      uid:             currentUser.uid,
      potId:           txnPotId,
      type:            txnType,
      amount:          amt,
      linkedAccountId: document.getElementById('ptxn-account').value || pot.linkedAccountId,
      date,
      notes: document.getElementById('ptxn-notes').value.trim(),
    });

    pot.currentBalance = (pot.currentBalance || 0) + (txnType === 'contribute' ? amt : -amt);
    await savePots();

    closeSheet('pot-txn-sheet');
    renderSavings();
    showToast(txnType === 'contribute' ? 'Added!' : 'Withdrawn!');
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
  }
});

document.getElementById('ptxn-cancel-btn').addEventListener('click', () => closeSheet('pot-txn-sheet'));

// ── Pot edit sheet ────────────────────────────────────────────────────────────

function openPotSheet(potId) {
  savState.editPotId = potId;
  const pot    = potId ? savState.pots.find(p => p.id === potId) : null;
  const isNew  = !pot;

  document.getElementById('pot-sheet-title').textContent = isNew ? 'New savings pot' : 'Edit pot';
  document.getElementById('pot-name-inp').value   = pot?.name || '';
  document.getElementById('pot-target-inp').value = pot?.targetAmount > 0 ? String(pot.targetAmount) : '';
  document.getElementById('pot-monthly-chk').checked  = pot?.isMonthlyFixed || false;
  document.getElementById('pot-monthly-amt').value     = pot?.monthlyAmount > 0 ? String(pot.monthlyAmount) : '';
  document.getElementById('pot-monthly-row').style.display = (pot?.isMonthlyFixed) ? '' : 'none';
  document.getElementById('pot-delete-btn').style.display  = isNew ? 'none' : '';

  // Account dropdown
  const sel = document.getElementById('pot-acc-select');
  sel.innerHTML = savState.accounts.map(a =>
    `<option value="${a.id}"${a.id === pot?.linkedAccountId ? ' selected' : ''}>${a.name}</option>`
  ).join('');

  // Colour swatches
  savState.selectedColour = pot?.colour || POT_COLOURS[0];
  const swatchEl = document.getElementById('pot-colour-swatches');
  swatchEl.innerHTML = POT_COLOURS.map(c =>
    `<button class="colour-swatch${c === savState.selectedColour ? ' on' : ''}" data-colour="${c}" type="button" style="background:${c}"></button>`
  ).join('');
  swatchEl.querySelectorAll('.colour-swatch').forEach(sw =>
    sw.addEventListener('click', () => {
      savState.selectedColour = sw.dataset.colour;
      swatchEl.querySelectorAll('.colour-swatch').forEach(x => x.classList.remove('on'));
      sw.classList.add('on');
    })
  );

  openSheet('pot-sheet');
}

document.getElementById('pot-monthly-chk').addEventListener('change', e => {
  document.getElementById('pot-monthly-row').style.display = e.target.checked ? '' : 'none';
});

['pot-target-inp', 'pot-monthly-amt'].forEach(id =>
  document.getElementById(id).addEventListener('input', e => {
    const v = e.target.value.replace(/[^0-9.]/g, '');
    const p = v.split('.');
    e.target.value = p.length > 2 ? p[0] + '.' + p.slice(1).join('') : v;
  })
);

document.getElementById('pot-save-btn').addEventListener('click', async () => {
  const name = document.getElementById('pot-name-inp').value.trim();
  if (!name) { document.getElementById('pot-name-inp').focus(); return; }

  const linkedAccountId = document.getElementById('pot-acc-select').value;
  const targetAmount    = parseFloat(document.getElementById('pot-target-inp').value) || 0;
  const isMonthlyFixed  = document.getElementById('pot-monthly-chk').checked;
  const monthlyAmount   = isMonthlyFixed ? (parseFloat(document.getElementById('pot-monthly-amt').value) || 0) : 0;
  const colour          = savState.selectedColour;

  const { editPotId } = savState;
  if (!editPotId) {
    savState.pots.push({
      id: `pot-${Date.now()}`,
      name, linkedAccountId, targetAmount,
      currentBalance: 0,
      colour, isMonthlyFixed, monthlyAmount,
      createdAt: new Date().toISOString(),
    });
  } else {
    const pot = savState.pots.find(p => p.id === editPotId);
    if (pot) Object.assign(pot, { name, linkedAccountId, targetAmount, colour, isMonthlyFixed, monthlyAmount });
  }

  try {
    await savePots();
    closeSheet('pot-sheet');
    renderSavings();
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
  }
});

document.getElementById('pot-delete-btn').addEventListener('click', async () => {
  const { editPotId } = savState;
  if (!editPotId) return;
  const pot = savState.pots.find(p => p.id === editPotId);
  if (!confirm(`Delete pot "${pot?.name}"? This also deletes all its transaction history.`)) return;

  try {
    await deletePotTransactionsByPot(editPotId);
    savState.pots = savState.pots.filter(p => p.id !== editPotId);
    await savePots();
    closeSheet('pot-sheet');
    renderSavings();
    showToast('Pot deleted');
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
  }
});

document.getElementById('pot-cancel-btn').addEventListener('click', () => closeSheet('pot-sheet'));

// ── Sheet helpers ─────────────────────────────────────────────────────────────

function openSheet(id) {
  document.getElementById(id).classList.add('active');
  document.getElementById('sheet-backdrop').classList.add('active');
}

function closeSheet(id) {
  document.getElementById(id).classList.remove('active');
  document.getElementById('sheet-backdrop').classList.remove('active');
}
