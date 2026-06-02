import { currentUser, userSettings } from './state.js';
import { fmt, displayDate, monthLabel, catColor, showToast } from './helpers.js';
import { fetchMonth, updateExpense, deleteExpense, fetchTransfersByMonth, fetchAccounts } from './db.js';

const PAGE_SIZE   = 10;
const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

const CAL_SVG   = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
const CHEV_SVG  = `<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;
const CHECK_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const EDIT_SVG  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

const TRANSFER_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;

let logState = {
  year: new Date().getFullYear(), month: new Date().getMonth() + 1,
  filter: 'All', entries: [], transfers: [], accounts: [], openId: null,
  showTransfers: false, page: 1,
};

export async function initLog() {
  logState.year          = new Date().getFullYear();
  logState.month         = new Date().getMonth() + 1;
  logState.filter        = 'All';
  logState.openId        = null;
  logState.showTransfers = false;
  logState.page          = 1;
  await loadLog();
}

export function showLogTransfers() {
  logState.showTransfers = true;
  logState.filter        = 'All';
  logState.page          = 1;
  loadLog();
}

async function loadLog() {
  const { year, month } = logState;
  const uid = currentUser.uid;
  const y   = String(year);
  const m   = String(month).padStart(2, '0');
  [logState.entries, logState.accounts] = await Promise.all([
    fetchMonth(uid, year, month),
    fetchAccounts(uid).catch(() => []),
  ]);
  try {
    logState.transfers = await fetchTransfersByMonth(uid, `${y}-${m}-01`, `${y}-${m}-31`);
  } catch {
    logState.transfers = [];
  }
  renderLog();
}

function renderLog() {
  const { entries, filter, year, month, showTransfers, transfers, page } = logState;
  document.getElementById('log-eyebrow').textContent     = monthLabel(year, month);
  document.getElementById('log-month-title').textContent = monthLabel(year, month);

  if (showTransfers) {
    const sorted     = transfers.slice().sort((a, b) => b.date.localeCompare(a.date));
    const totalPages = Math.ceil(sorted.length / PAGE_SIZE) || 1;
    const pageItems  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    document.getElementById('log-total').innerHTML =
      `RM ${fmt(sorted.reduce((s, t) => s + t.amount, 0))} <span>· ${sorted.length} transfer${sorted.length === 1 ? '' : 's'}</span>`;
    renderFilterChips();
    const list = document.getElementById('log-list');
    if (sorted.length === 0) {
      list.innerHTML = '<div class="list-hint">No transfers this month</div>';
    } else {
      list.innerHTML = '';
      pageItems.forEach(tf => list.appendChild(buildTransferLogRow(tf)));
      if (totalPages > 1) renderPagination(list, page, totalPages);
    }
    return;
  }

  const pool     = entries.filter(e => !e.isIncome);
  const filtered = (filter === 'All' ? pool : pool.filter(e => e.paymentMethod === filter))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total      = filtered.reduce((s, e) => s + e.amount, 0);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  document.getElementById('log-total').innerHTML =
    `RM ${fmt(total)} <span>· ${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'}</span>`;

  renderFilterChips();

  const list = document.getElementById('log-list');
  if (filtered.length === 0) {
    list.innerHTML = '<div class="list-hint">No expenses this month</div>';
    return;
  }
  list.innerHTML = '';
  pageItems.forEach(entry =>
    list.appendChild(entry.id === logState.openId ? buildEditForm(entry) : buildLogRow(entry))
  );
  if (totalPages > 1) renderPagination(list, page, totalPages);
  list.insertAdjacentHTML('beforeend',
    `<div class="list-hint">${EDIT_SVG}tap a row to edit or delete</div>`);
}

function renderPagination(list, page, totalPages) {
  const PREV_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;
  const NEXT_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;
  const div = document.createElement('div');
  div.className = 'log-pagination';
  div.innerHTML = `
    <button class="log-page-btn" id="lp-prev" type="button"${page <= 1 ? ' disabled' : ''}>${PREV_SVG}</button>
    <span class="log-page-info">${page} of ${totalPages}</span>
    <button class="log-page-btn" id="lp-next" type="button"${page >= totalPages ? ' disabled' : ''}>${NEXT_SVG}</button>`;
  div.querySelector('#lp-prev').addEventListener('click', () => { logState.page--; renderLog(); });
  div.querySelector('#lp-next').addEventListener('click', () => { logState.page++; renderLog(); });
  list.appendChild(div);
}

function renderFilterChips() {
  const { entries, filter, showTransfers, transfers } = logState;
  const methods   = ['All', ...new Set(entries.map(e => e.paymentMethod))];
  const hasTransfers = transfers.length > 0;
  const chipMethods = methods.slice(0, 4);
  const hidden      = methods.slice(4);
  const filterRow   = document.getElementById('log-filter-row');

  filterRow.innerHTML =
    chipMethods.map(m =>
      `<button class="chip${!showTransfers && m === filter ? ' on' : ''}" data-method="${m}" type="button">${m}</button>`
    ).join('') +
    (hidden.length ? `<button class="chip add" id="log-more-chip" type="button">+${hidden.length}</button>` : '') +
    (hasTransfers ? `<button class="chip${showTransfers ? ' on' : ''}" id="log-transfers-chip" type="button">Transfers</button>` : '');

  filterRow.querySelectorAll('.chip:not(.add):not(#log-transfers-chip)').forEach(btn =>
    btn.addEventListener('click', () => {
      logState.showTransfers = false;
      logState.filter        = btn.dataset.method;
      logState.page          = 1;
      renderLog();
    })
  );

  const moreChip = document.getElementById('log-more-chip');
  if (moreChip) {
    moreChip.addEventListener('click', () => {
      filterRow.innerHTML = methods.map(m =>
        `<button class="chip${!showTransfers && m === filter ? ' on' : ''}" data-method="${m}" type="button">${m}</button>`
      ).join('') +
      (hasTransfers ? `<button class="chip${showTransfers ? ' on' : ''}" id="log-transfers-chip" type="button">Transfers</button>` : '');
      filterRow.querySelectorAll('.chip:not(#log-transfers-chip)').forEach(b =>
        b.addEventListener('click', () => { logState.showTransfers = false; logState.filter = b.dataset.method; logState.page = 1; renderLog(); })
      );
      wireTransfersChip();
    });
  }

  wireTransfersChip();
}

function wireTransfersChip() {
  const chip = document.getElementById('log-transfers-chip');
  if (chip) chip.addEventListener('click', () => { logState.showTransfers = true; logState.page = 1; renderLog(); });
}

function buildTransferLogRow(tf) {
  const accounts = logState.accounts || [];
  const fromAcc  = accounts.find(a => a.id === tf.fromAccountId);
  const toAcc    = accounts.find(a => a.id === tf.toAccountId);
  const fromName = fromAcc?.name || tf.fromAccountId;
  const toName   = toAcc?.name   || tf.toAccountId;

  const row = document.createElement('div');
  row.className = 'log-row log-transfer-row';
  row.style.cursor = 'default';
  row.innerHTML = `
    <div style="width:36px;height:36px;border-radius:999px;background:var(--accent-soft);color:var(--accent-ink);display:grid;place-items:center;flex-shrink:0">
      ${TRANSFER_SVG}
    </div>
    <div class="log-main">
      <div class="log-cat" style="color:var(--accent-ink)">${fromName} → ${toName}</div>
      <div class="log-meta">${tf.date ? displayDate(tf.date) : ''}${tf.notes ? ' · ' + tf.notes : ''} <span class="pay-pill xs">transfer</span></div>
    </div>
    <div class="log-right">
      <div class="log-amt" style="color:var(--accent-ink)">RM ${fmt(tf.amount)}</div>
    </div>`;
  return row;
}

function buildLogRow(entry) {
  const btn = document.createElement('button');
  btn.className = 'log-row';
  btn.innerHTML = `
    <span class="log-dot" style="background:${catColor(entry.category, userSettings.categories)}"></span>
    <div class="log-main">
      <div class="log-cat">${entry.category}</div>
      <div class="log-meta">${displayDate(entry.date)} <span class="pay-pill xs">${entry.paymentMethod}</span></div>
    </div>
    <div class="log-right">
      <div class="log-amt">RM ${fmt(entry.amount)}</div>
      ${entry.notes ? `<div class="log-note">${entry.notes}</div>` : ''}
    </div>`;
  btn.addEventListener('click', () => { logState.openId = entry.id; renderLog(); });
  return btn;
}

function buildEditForm(entry) {
  const id   = entry.id;
  const wrap = document.createElement('div');
  wrap.className = 'log-edit';
  wrap.innerHTML = `
    <div class="field">
      <label class="field-label">Amount</label>
      <input class="input-row note" type="text" inputmode="decimal" id="ea-${id}" value="${entry.amount}" autocomplete="off" />
    </div>
    <div class="field">
      <label class="field-label">Date</label>
      <button class="input-row select" id="ed-btn-${id}" type="button">
        <span id="ed-disp-${id}">${displayDate(entry.date)}</span>
        <span class="muted-ic">${CAL_SVG}</span>
      </button>
      <input type="date" id="ed-inp-${id}" value="${entry.date}" style="position:absolute;opacity:0;pointer-events:none;width:0;height:0" />
    </div>
    <div class="field" id="ec-field-${id}">
      <label class="field-label">Category</label>
      <button class="input-row select" id="ec-btn-${id}" type="button">
        <span class="sel-val" id="ec-disp-${id}">
          <span class="chip-dot" style="background:${catColor(entry.category, userSettings.categories)}"></span>${entry.category}
        </span>
        <span class="muted-ic"><svg class="chev" id="ec-chev-${id}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
      </button>
      <div class="dropdown" id="ec-dd-${id}" style="display:none"></div>
    </div>
    <div class="field" id="ep-field-${id}">
      <label class="field-label">Account</label>
      <button class="input-row select" id="ep-btn-${id}" type="button">
        <span class="sel-val" id="ep-disp-${id}"><span class="pay-pill sm">${entry.paymentMethod}</span></span>
        <span class="muted-ic"><svg class="chev" id="ep-chev-${id}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></span>
      </button>
      <div class="dropdown" id="ep-dd-${id}" style="display:none"></div>
    </div>
    <div class="field">
      <label class="field-label">Notes</label>
      <input class="input-row note" type="text" id="en-${id}" value="${entry.notes || ''}" placeholder="optional…" autocomplete="off" />
    </div>
    <div class="log-edit-actions">
      <button class="btn-update" id="es-${id}" type="button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Update
      </button>
      <button class="btn-delete" id="edel-${id}" type="button">Delete</button>
    </div>`;

  let editDate = entry.date, editCat = entry.category, editPay = entry.paymentMethod;
  let catOpen = false, payOpen = false;

  // Amount
  wrap.querySelector(`#ea-${id}`).addEventListener('input', (e) => {
    const v = e.target.value.replace(/[^0-9.]/g, '');
    const parts = v.split('.');
    e.target.value = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
  });

  // Date
  const dBtn = wrap.querySelector(`#ed-btn-${id}`);
  const dInp = wrap.querySelector(`#ed-inp-${id}`);
  dBtn.addEventListener('click', () => dInp.showPicker ? dInp.showPicker() : dInp.click());
  dInp.addEventListener('change', () => {
    editDate = dInp.value;
    wrap.querySelector(`#ed-disp-${id}`).textContent = displayDate(editDate);
  });

  // Category dd
  const cBtn  = wrap.querySelector(`#ec-btn-${id}`);
  const cDd   = wrap.querySelector(`#ec-dd-${id}`);
  const cChev = wrap.querySelector(`#ec-chev-${id}`);
  function openCatDd() {
    closePayDd(); catOpen = true; cChev.classList.add('open'); cDd.style.display = '';
    cDd.innerHTML = userSettings.categories.map(c => `
      <button class="dd-item${c === editCat ? ' on' : ''}" data-cat="${c}" type="button">
        <span class="chip-dot" style="background:${catColor(c, userSettings.categories)}"></span>${c}
        ${c === editCat ? `<span class="dd-check">${CHECK_SVG}</span>` : ''}
      </button>`).join('');
    cDd.querySelectorAll('.dd-item').forEach(b => b.addEventListener('click', () => {
      editCat = b.dataset.cat;
      wrap.querySelector(`#ec-disp-${id}`).innerHTML =
        `<span class="chip-dot" style="background:${catColor(editCat, userSettings.categories)}"></span>${editCat}`;
      closeCatDd();
    }));
  }
  function closeCatDd() { catOpen = false; cChev.classList.remove('open'); cDd.style.display = 'none'; }
  cBtn.addEventListener('click', () => catOpen ? closeCatDd() : openCatDd());

  // Payment dd
  const pBtn  = wrap.querySelector(`#ep-btn-${id}`);
  const pDd   = wrap.querySelector(`#ep-dd-${id}`);
  const pChev = wrap.querySelector(`#ep-chev-${id}`);
  function openPayDd() {
    closeCatDd(); payOpen = true; pChev.classList.add('open'); pDd.style.display = '';
    pDd.innerHTML = userSettings.paymentMethods.map(p => `
      <button class="dd-item${p === editPay ? ' on' : ''}" data-pay="${p}" type="button">
        <span class="pay-pill sm">${p}</span>
        ${p === editPay ? `<span class="dd-check">${CHECK_SVG}</span>` : ''}
      </button>`).join('');
    pDd.querySelectorAll('.dd-item').forEach(b => b.addEventListener('click', () => {
      editPay = b.dataset.pay;
      wrap.querySelector(`#ep-disp-${id}`).innerHTML = `<span class="pay-pill sm">${editPay}</span>`;
      closePayDd();
    }));
  }
  function closePayDd() { payOpen = false; pChev.classList.remove('open'); pDd.style.display = 'none'; }
  pBtn.addEventListener('click', () => payOpen ? closePayDd() : openPayDd());

  // Update
  wrap.querySelector(`#es-${id}`).addEventListener('click', async () => {
    const amtRaw = wrap.querySelector(`#ea-${id}`).value.trim();
    const amount = parseFloat(amtRaw);
    if (!amtRaw || isNaN(amount) || amount <= 0) { showToast('Enter a valid amount'); return; }
    try {
      await updateExpense(id, { amount, date: editDate, category: editCat, paymentMethod: editPay, notes: wrap.querySelector(`#en-${id}`).value.trim() });
      logState.openId = null;
      await loadLog();
      showToast('Updated!');
    } catch (e) { console.error(e); showToast('Error updating'); }
  });

  // Delete
  wrap.querySelector(`#edel-${id}`).addEventListener('click', async () => {
    if (!confirm('Delete this expense?')) return;
    try {
      await deleteExpense(id);
      logState.openId = null;
      await loadLog();
      showToast('Deleted');
    } catch (e) { console.error(e); showToast('Error deleting'); }
  });

  return wrap;
}

// ── Export ───────────────────────────────────────────────────────────────────

async function ensureSheetJS() {
  if (window.XLSX) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src     = SHEETJS_URL;
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Failed to load SheetJS'));
    document.head.appendChild(s);
  });
}

async function exportLog() {
  const { entries, filter, year, month, showTransfers, transfers, accounts } = logState;
  showToast('Preparing export…');
  try {
    await ensureSheetJS();
    const XLSX  = window.XLSX;
    const wb    = XLSX.utils.book_new();
    const y     = String(year);
    const m     = String(month).padStart(2, '0');

    if (showTransfers) {
      const sorted = transfers.slice().sort((a, b) => b.date.localeCompare(a.date));
      const rows   = [['Date', 'From', 'To', 'Amount', 'Notes']];
      sorted.forEach(tf => {
        const from = accounts.find(a => a.id === tf.fromAccountId);
        const to   = accounts.find(a => a.id === tf.toAccountId);
        rows.push([tf.date, from?.name || tf.fromAccountId, to?.name || tf.toAccountId, tf.amount, tf.notes || '']);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 24 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Transfers');
      XLSX.writeFile(wb, `log-${y}-${m}-transfers.xlsx`);
    } else {
      const pool     = entries.filter(e => !e.isIncome);
      const filtered = (filter === 'All' ? pool : pool.filter(e => e.paymentMethod === filter))
        .sort((a, b) => b.date.localeCompare(a.date));
      const rows = [['Date', 'Category', 'Sub-category', 'Account', 'Notes', 'Amount', 'Type']];
      filtered.forEach(e => rows.push([
        e.date, e.category, e.subCategory || '', e.paymentMethod, e.notes || '', e.amount, e.type || 'variable',
      ]));
      const total = filtered.reduce((s, e) => s + e.amount, 0);
      rows.push(['', '', '', '', 'TOTAL', total, '']);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Log');
      const label = filter === 'All' ? '' : `-${filter.toLowerCase().replace(/\s+/g, '-')}`;
      XLSX.writeFile(wb, `log-${y}-${m}${label}.xlsx`);
    }
    showToast('Downloaded!');
  } catch (e) {
    console.error(e);
    showToast('Export failed');
  }
}

document.getElementById('log-export-btn').addEventListener('click', exportLog);

// ── Month nav ────────────────────────────────────────────────────────────────

document.getElementById('log-prev-month').addEventListener('click', async () => {
  logState.month--;
  if (logState.month < 1) { logState.month = 12; logState.year--; }
  logState.filter = 'All'; logState.openId = null; logState.showTransfers = false; logState.page = 1;
  await loadLog();
});
document.getElementById('log-next-month').addEventListener('click', async () => {
  logState.month++;
  if (logState.month > 12) { logState.month = 1; logState.year++; }
  logState.filter = 'All'; logState.openId = null; logState.showTransfers = false; logState.page = 1;
  await loadLog();
});
