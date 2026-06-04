import { currentUser, userSettings } from './state.js';
import { fmt, monthLabel, showToast, escapeHtml, todayString, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth, salaryPeriodLabel } from './helpers.js';
import { fetchBudgetTemplate, fetchBudgetMonth, persistBudgetMonth, fetchExpenses, addExpense, updateExpense, deleteExpense } from './db.js';
import { initAccounts } from './accounts.js';
import { initSavings } from './savings.js';
import { initInsights } from './insights.js';

// ── State ─────────────────────────────────────────────────────────────────────

const DEFAULT_INCOME = [
  { id: 'salary', name: 'Salary', amount: 0 },
  { id: 'claim',  name: 'Claim',  amount: 0 },
  { id: 'other',  name: 'Other',  amount: 0 }
];

const INCOME_DOTS = {
  salary: 'var(--accent)',
  claim:  'var(--positive)',
  other:  'var(--ink-3)'
};

const PENCIL_IC = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
const ARROW_IC  = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

let bdgState = {
  year:               new Date().getFullYear(),
  month:              new Date().getMonth() + 1,
  monthData:          null,
  template:           null,
  variableExpenses:   [],
  chkCollapsed:       new Set(),
  subTab:             'overview',
};

export function clearBudgetState() {
  bdgState.monthData        = null;
  bdgState.variableExpenses = [];
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function initBudget() {
  const sp = salaryPeriodMonth(userSettings.salaryDay);
  bdgState.year  = sp.year;
  bdgState.month = sp.month;
  bdgState.template = null;
  wireSubTabs();
  await switchSubTab(bdgState.subTab);
}

function wireSubTabs() {
  document.querySelectorAll('#budget-subtab-bar .rpt-tab').forEach(btn => {
    btn.onclick = () => switchSubTab(btn.dataset.subtab);
  });
}

async function switchSubTab(tab) {
  bdgState.subTab = tab;
  document.querySelectorAll('#budget-subtab-bar .rpt-tab').forEach(b =>
    b.classList.toggle('on', b.dataset.subtab === tab)
  );

  const showMonthNav = tab === 'overview';
  document.getElementById('budget-prev-month').style.visibility = showMonthNav ? '' : 'hidden';
  document.getElementById('budget-next-month').style.visibility = showMonthNav ? '' : 'hidden';
  document.getElementById('budget-month-title').textContent =
    tab === 'overview' ? _bdgPeriodLabel() :
    tab === 'accounts' ? 'Accounts' : 'Savings';

  document.getElementById('acc-transfer-fab').classList.toggle('show', tab === 'accounts');

  if (tab === 'overview') {
    await loadData();
    renderBudget();
  } else if (tab === 'accounts') {
    await initAccounts();
  } else {
    await initSavings();
  }
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadData() {
  const { year, month } = bdgState;
  const uid = currentUser.uid;

  bdgState.template = await fetchBudgetTemplate(uid);

  let monthData = await fetchBudgetMonth(uid, year, month);
  if (!monthData) {
    monthData = bdgState.template
      ? seedMonth(bdgState.template)
      : { income: JSON.parse(JSON.stringify(DEFAULT_INCOME)), payments: [] };
    try { await persistBudgetMonth(uid, year, month, monthData); } catch (e) { console.error(e); }
  } else {
    // Onboarding may have written only {income} with no payments field
    if (!monthData.income)   monthData.income   = JSON.parse(JSON.stringify(DEFAULT_INCOME));
    if (!monthData.payments) monthData.payments = [];
    // Seed any template items not yet represented in payments
    if (bdgState.template) {
      const existing = new Set(monthData.payments.map(p => p.itemId));
      const missing  = bdgState.template.groups.flatMap(g =>
        g.items.filter(i => !existing.has(i.id))
          .map(i => ({ itemId: i.id, paid: false, amount: i.defaultAmount, paidDate: null, expenseId: null }))
      );
      if (missing.length > 0) {
        monthData.payments.push(...missing);
        try { await persistBudgetMonth(uid, year, month, monthData); } catch (e) { console.error(e); }
      }
    }
  }
  bdgState.monthData = monthData;

  if (!bdgState.template) {
    bdgState.variableExpenses = [];
    return;
  }
  const sd = userSettings.salaryDay;
  const spStart = salaryStartForMonth(sd, year, month);
  const spEnd   = salaryEndForMonth(sd, year, month);
  const all = await fetchExpenses(uid, spStart, spEnd);
  bdgState.variableExpenses = all.filter(e => !e.type || e.type === 'variable');
}

function seedMonth(template) {
  return {
    income: JSON.parse(JSON.stringify(DEFAULT_INCOME)),
    payments: template.groups.flatMap(g =>
      g.items.map(i => ({ itemId: i.id, paid: false, amount: i.defaultAmount, paidDate: null, expenseId: null }))
    )
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

function _bdgPeriodLabel() {
  const { year, month } = bdgState;
  const sd = userSettings.salaryDay;
  return salaryPeriodLabel(salaryStartForMonth(sd, year, month), salaryEndForMonth(sd, year, month));
}

function renderBudget() {
  const { monthData, template, variableExpenses } = bdgState;

  document.getElementById('budget-month-title').textContent = _bdgPeriodLabel();
  document.getElementById('budget-prev-month').style.visibility = '';
  document.getElementById('budget-next-month').style.visibility = '';

  const body = document.getElementById('budget-body');
  body.innerHTML = '';

  if (!template) {
    body.appendChild(buildIncomeSection(monthData.income));
    const notice = document.createElement('div');
    notice.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;padding:32px 0;color:var(--ink-3)';
    notice.innerHTML = `
      <span style="font-size:15px;font-weight:600">No budget template set up</span>
      <span style="font-size:13px">Go to Settings → Budget templates to get started</span>`;
    body.appendChild(notice);
    body.appendChild(buildInsightsRow());
    return;
  }

  const incomeTotal   = monthData.income.reduce((s, i) => s + (i.amount || 0), 0);
  const variableTotal = variableExpenses.reduce((s, e) => s + e.amount, 0);

  // Only count payments that correspond to current template items (orphaned records are ignored)
  const templateItemIds = new Set(template.groups.flatMap(g => g.items.map(i => i.id)));
  const activePayments  = monthData.payments.filter(p => templateItemIds.has(p.itemId));
  const totalItems  = templateItemIds.size;
  const paidCount   = activePayments.filter(p => p.paid).length;
  const fixedPaidActive = activePayments.filter(p => p.paid).reduce((s, p) => s + (p.amount || 0), 0);
  const progressPct = totalItems > 0 ? (paidCount / totalItems * 100) : 0;
  const netBalance  = incomeTotal - fixedPaidActive - variableTotal;

  body.appendChild(buildHero(netBalance, incomeTotal, fixedPaidActive, variableTotal, progressPct, paidCount, totalItems));
  body.appendChild(buildIncomeSection(monthData.income));
  body.appendChild(buildFixedSummary(template, activePayments, paidCount, totalItems));
  body.appendChild(buildInsightsRow());
}

// ── Hero card ─────────────────────────────────────────────────────────────────

function buildHero(net, income, fixed, variable, pct, paid, total) {
  const isNeg  = net < 0;
  const valClr = isNeg ? 'color:oklch(0.85 0.12 20)' : 'color:var(--accent)';
  const div    = document.createElement('div');
  div.className = 'budget-hero';
  div.innerHTML = `
    <div class="budget-hero-label">Net balance</div>
    <div class="budget-hero-val" style="${valClr}">${isNeg ? '−' : ''}RM ${fmt(Math.abs(net))}</div>
    <div class="budget-hero-eq">Income ${fmt(income)} − Fixed ${fmt(fixed)} − Variable ${fmt(variable)}</div>
    <div class="budget-hero-bar">
      <div class="budget-hero-fill" style="width:${pct.toFixed(1)}%"></div>
    </div>
    <div class="budget-hero-bar-label">${paid} of ${total} fixed items paid</div>`;
  return div;
}


// ── Income section ────────────────────────────────────────────────────────────

function buildIncomeSection(income) {
  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Income</span>';

  const card = document.createElement('div');
  card.className = 'income-card';

  income.forEach(entry => {
    const hasAcc = !!entry.account;
    const row = document.createElement('div');
    row.className = 'income-row';
    row.style.position = 'relative';
    row.innerHTML = `
      <span class="income-dot" style="background:${INCOME_DOTS[entry.id] || 'var(--ink-3)'}"></span>
      <span class="income-name">${escapeHtml(entry.name)}</span>
      <button class="income-acc-pill${hasAcc ? ' set' : ''}" type="button" id="income-acc-${entry.id}">
        ${escapeHtml(entry.account || 'Account')}
      </button>
      <span class="income-val" id="income-val-${entry.id}">
        RM ${fmt(entry.amount || 0)}
        <span style="color:var(--ink-3)">${PENCIL_IC}</span>
      </span>`;
    row.querySelector('.income-val').addEventListener('click', () => startIncomeEdit(entry));
    row.querySelector(`#income-acc-${entry.id}`).addEventListener('click', e => {
      e.stopPropagation();
      openIncomeAccDropdown(entry, row);
    });
    card.appendChild(row);
  });

  section.appendChild(card);
  return section;
}

function openIncomeAccDropdown(entry, row) {
  document.querySelectorAll('.income-acc-dd').forEach(d => d.remove());

  const dd = document.createElement('div');
  dd.className = 'income-acc-dd';

  ['', ...(userSettings.paymentMethods || [])].forEach(acc => {
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = `income-acc-opt${(entry.account || '') === acc ? ' on' : ''}`;
    opt.textContent = acc || '— None'; // textContent is safe — no escaping needed
    opt.addEventListener('click', async () => {
      dd.remove();
      const idx = bdgState.monthData.income.findIndex(i => i.id === entry.id);
      if (idx >= 0) {
        if (acc) bdgState.monthData.income[idx].account = acc;
        else delete bdgState.monthData.income[idx].account;
        try {
          await persistBudgetMonth(currentUser.uid, bdgState.year, bdgState.month, bdgState.monthData);
          await syncIncomeExpense(bdgState.monthData.income[idx]);
        } catch (e) {
          console.error(e);
          showToast('Error — please try again');
        }
      }
      renderBudget();
    });
    dd.appendChild(opt);
  });

  row.appendChild(dd);

  setTimeout(() => {
    const close = e => {
      if (!dd.contains(e.target)) { dd.remove(); document.removeEventListener('click', close); }
    };
    document.addEventListener('click', close);
  }, 0);
}

function startIncomeEdit(entry) {
  const valEl = document.getElementById(`income-val-${entry.id}`);
  if (!valEl) return;

  const inp = document.createElement('input');
  inp.type        = 'text';
  inp.inputMode   = 'decimal';
  inp.value       = entry.amount > 0 ? String(entry.amount) : '';
  inp.placeholder = '0.00';
  inp.style.cssText = 'border:1px solid var(--accent-line);border-radius:var(--radius-sm);padding:7px 10px;font:inherit;font-size:15px;font-weight:700;width:110px;text-align:right;outline:none;color:var(--ink);font-variant-numeric:tabular-nums;background:var(--surface);';
  valEl.replaceWith(inp);
  inp.focus();
  if (inp.value) inp.select();

  inp.addEventListener('input', e => {
    const v = e.target.value.replace(/[^0-9.]/g, '');
    const parts = v.split('.');
    e.target.value = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
  });

  async function save() {
    const val = parseFloat(inp.value) || 0;
    const idx = bdgState.monthData.income.findIndex(i => i.id === entry.id);
    if (idx >= 0) bdgState.monthData.income[idx].amount = val;
    try {
      await persistBudgetMonth(currentUser.uid, bdgState.year, bdgState.month, bdgState.monthData);
      if (idx >= 0) await syncIncomeExpense(bdgState.monthData.income[idx]);
    } catch (e) {
      console.error(e);
      showToast('Error — please try again');
    }
    renderBudget();
  }

  inp.addEventListener('blur', save);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') renderBudget(); });
}

// ── Income ↔ expense sync ─────────────────────────────────────────────────────

async function syncIncomeExpense(entry) {
  const uid      = currentUser.uid;
  const date     = todayString();
  const hasData  = entry.account && entry.amount > 0;

  if (entry.expenseId) {
    if (!hasData) {
      // Account removed or amount zeroed — delete the expense doc
      try { await deleteExpense(entry.expenseId); } catch (_) {}
      delete entry.expenseId;
      await persistBudgetMonth(uid, bdgState.year, bdgState.month, bdgState.monthData);
    } else {
      // Update existing
      try {
        await updateExpense(entry.expenseId, {
          amount: entry.amount, paymentMethod: entry.account,
          date, subCategory: entry.name,
        });
      } catch (_) {
        // Doc deleted externally — recreate
        const ref = await addExpense({
          uid, date, amount: entry.amount, paymentMethod: entry.account,
          isIncome: true, type: 'income', category: 'Income', subCategory: entry.name,
        });
        entry.expenseId = ref.id;
        await persistBudgetMonth(uid, bdgState.year, bdgState.month, bdgState.monthData);
      }
    }
  } else if (hasData) {
    // Create new expense doc
    const ref = await addExpense({
      uid, date, amount: entry.amount, paymentMethod: entry.account,
      isIncome: true, type: 'income', category: 'Income', subCategory: entry.name,
    });
    entry.expenseId = ref.id;
    await persistBudgetMonth(uid, bdgState.year, bdgState.month, bdgState.monthData);
  }
}

// ── Fixed summary ─────────────────────────────────────────────────────────────

function buildFixedSummary(template, payments, paidCount, totalItems) {
  const section = document.createElement('section');

  const hdr = document.createElement('div');
  hdr.className = 'fixed-hdr';
  hdr.innerHTML = `
    <span class="block-label" style="margin-bottom:0">Fixed</span>
    <button class="fixed-link" id="budget-to-checklist" type="button">
      ${paidCount}/${totalItems} paid ${ARROW_IC}
    </button>`;
  hdr.querySelector('#budget-to-checklist').addEventListener('click', showChecklist);
  section.appendChild(hdr);

  const card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:0 16px;';

  const [shown, hidden] = [template.groups.slice(0, 4), template.groups.slice(4)];
  appendGroupRows(shown, payments, card);

  section.appendChild(card);

  if (hidden.length > 0) {
    const moreBtn = document.createElement('button');
    moreBtn.type      = 'button';
    moreBtn.className = 'chip add';
    moreBtn.style.cssText = 'width:100%;justify-content:center;padding:12px;margin-top:8px;font-size:13px;';
    moreBtn.textContent  = `+ ${hidden.length} more groups`;
    moreBtn.addEventListener('click', () => {
      appendGroupRows(hidden, payments, card);
      section.removeChild(moreBtn);
    });
    section.appendChild(moreBtn);
  }

  return section;
}

function appendGroupRows(groups, payments, container) {
  groups.forEach(group => {
    const paidAmt = payments
      .filter(p => group.items.some(i => i.id === p.itemId) && p.paid)
      .reduce((s, p) => s + (p.amount || 0), 0);
    const paidN  = payments.filter(p => group.items.some(i => i.id === p.itemId) && p.paid).length;
    const totalN = group.items.length;

    const row = document.createElement('div');
    row.className = 'fixed-group-row';
    row.innerHTML = `
      <span class="fixed-group-name">${escapeHtml(group.name)}</span>
      <span class="fixed-group-meta">${paidN}/${totalN}</span>
      <span class="fixed-group-amt">${paidAmt > 0 ? 'RM ' + fmt(paidAmt) : '—'}</span>`;
    container.appendChild(row);
  });
}

// ── Checklist navigation ──────────────────────────────────────────────────────

export function showChecklist() {
  renderChecklist();
  document.getElementById('budget-checklist-page').classList.add('active');
  history.pushState(null, '');
}

document.getElementById('budget-checklist-back').addEventListener('click', () => {
  document.getElementById('budget-checklist-page').classList.remove('active');
});

document.getElementById('chk-prev-month').addEventListener('click', async () => {
  bdgState.month--;
  if (bdgState.month < 1) { bdgState.month = 12; bdgState.year--; }
  await loadData();
  renderChecklist();
  renderBudget();
});

document.getElementById('chk-next-month').addEventListener('click', async () => {
  bdgState.month++;
  if (bdgState.month > 12) { bdgState.month = 1; bdgState.year++; }
  await loadData();
  renderChecklist();
  renderBudget();
});

// ── Checklist render ──────────────────────────────────────────────────────────

function renderChecklist() {
  const { year, month, monthData, template, variableExpenses } = bdgState;

  document.getElementById('budget-checklist-title').textContent = monthLabel(year, month);

  const body = document.getElementById('budget-checklist-body');
  body.innerHTML = '';

  if (!template) {
    body.innerHTML = `<p style="text-align:center;color:var(--ink-3);padding:48px 0;font-size:14px;font-weight:500">No budget template. Go to Settings → Budget templates.</p>`;
    return;
  }

  const chkItemIds     = new Set(template.groups.flatMap(g => g.items.map(i => i.id)));
  const chkPayments    = monthData.payments.filter(p => chkItemIds.has(p.itemId));
  const totalItems     = chkItemIds.size;
  const paidCount      = chkPayments.filter(p => p.paid).length;

  body.appendChild(buildChkProgress(paidCount, totalItems));

  template.groups.forEach(group => {
    body.appendChild(buildChkGroup(group, chkPayments));
  });

  const hint = document.createElement('div');
  hint.className = 'list-hint';
  hint.style.paddingBottom = '24px';
  hint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Tap checkbox to pay · tap ✓ again to undo`;
  body.appendChild(hint);
}

function buildChkProgress(paidCount, total) {
  const pct = total > 0 ? (paidCount / total * 100) : 0;
  const div = document.createElement('div');
  div.className = 'chk-progress';
  div.innerHTML = `
    <span class="chk-progress-label">${paidCount} / ${total} paid</span>
    <div class="chk-progress-bar-wrap">
      <div class="chk-progress-fill" style="width:${pct.toFixed(1)}%"></div>
    </div>`;
  return div;
}

function buildChkGroup(group, payments) {
  const isCollapsed = bdgState.chkCollapsed.has(group.id);
  const paidN   = payments.filter(p => group.items.some(i => i.id === p.itemId) && p.paid).length;
  const allPaid = group.items.length > 0 && paidN === group.items.length;

  const wrapper = document.createElement('div');
  wrapper.className = 'chk-group';

  const hdr = document.createElement('div');
  hdr.className = `chk-group-hdr${isCollapsed ? '' : ' open'}`;
  hdr.innerHTML = `
    <span class="chk-group-name">${escapeHtml(group.name)}</span>
    <span class="chk-group-badge${allPaid ? '' : ' partial'}">${paidN}/${group.items.length}</span>
    <span class="chk-group-chev${isCollapsed ? '' : ' open'}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
    </span>`;
  hdr.addEventListener('click', () => {
    if (bdgState.chkCollapsed.has(group.id)) bdgState.chkCollapsed.delete(group.id);
    else bdgState.chkCollapsed.add(group.id);
    renderChecklist();
  });
  wrapper.appendChild(hdr);

  if (!isCollapsed) {
    const gbody = document.createElement('div');
    gbody.className = 'chk-group-body';
    if (group.items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:14px 16px;font-size:13px;font-weight:500;color:var(--ink-3);font-style:italic';
      empty.textContent = 'No items — add in Settings → Budget templates';
      gbody.appendChild(empty);
    } else {
      group.items.forEach(item => {
        const payment = payments.find(p => p.itemId === item.id);
        gbody.appendChild(buildChkItem(item, payment));
      });
    }
    wrapper.appendChild(gbody);
  }

  return wrapper;
}

function buildChkItem(item, payment) {
  const isPaid     = payment?.paid || false;
  const isVariable = item.isVariable;

  const row = document.createElement('div');
  row.className = `chk-item${isPaid ? ' paid-row' : ''}`;

  const cbClass   = isPaid ? 'paid' : (isVariable ? 'needs' : '');
  const checkIcon = isPaid
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
    : '';

  const displayAmt = isPaid && payment?.amount
    ? `RM ${fmt(payment.amount)}`
    : (item.defaultAmount > 0 ? `RM ${fmt(item.defaultAmount)}` : '—');

  row.innerHTML = `
    <button class="chk-cb${cbClass ? ' ' + cbClass : ''}" type="button" aria-label="${isPaid ? 'Unmark paid' : 'Mark paid'}">
      ${checkIcon}
    </button>
    <div class="chk-item-main">
      <div class="chk-item-name">${escapeHtml(item.name)}</div>
      <div class="chk-item-pay">${escapeHtml(item.paymentMethod)}</div>
    </div>
    <div class="chk-item-right">
      <span class="chk-item-amt">${displayAmt}</span>
    </div>`;

  row.querySelector('.chk-cb').addEventListener('click', async e => {
    e.stopPropagation();
    if (isPaid) {
      await markUnpaid(item.id);
    } else {
      openEntry(row, item.id, item.defaultAmount || 0);
    }
  });

  return row;
}

// ── Inline entry ──────────────────────────────────────────────────────────────

function openEntry(itemRow, itemId, defaultAmt) {
  document.querySelectorAll('.chk-entry').forEach(el => el.remove());

  const entry = document.createElement('div');
  entry.className = 'chk-entry';
  entry.innerHTML = `
    <span class="chk-entry-rm">RM</span>
    <input type="text" inputmode="decimal" placeholder="0.00" autocomplete="off" value="${defaultAmt > 0 ? defaultAmt : ''}" />
    <button class="chk-entry-ok" type="button">Pay</button>
    <button class="chk-entry-cancel" type="button">✕</button>`;

  itemRow.after(entry);
  const inp = entry.querySelector('input');
  inp.focus();
  if (inp.value) inp.select();

  inp.addEventListener('input', e => {
    const raw   = e.target.value.replace(/[^0-9.]/g, '');
    const parts = raw.split('.');
    e.target.value = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw;
  });

  async function confirm() {
    const val = parseFloat(inp.value) || 0;
    entry.remove();
    await markPaid(itemId, val);
  }

  entry.querySelector('.chk-entry-ok').addEventListener('click', confirm);
  entry.querySelector('.chk-entry-cancel').addEventListener('click', () => entry.remove());
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter')  confirm();
    if (e.key === 'Escape') entry.remove();
  });
}

// ── Mark paid / unpaid ────────────────────────────────────────────────────────

async function markPaid(itemId, amount) {
  const { year, month, monthData, template } = bdgState;
  const uid = currentUser.uid;

  let group, item;
  for (const g of template.groups) {
    const found = g.items.find(i => i.id === itemId);
    if (found) { group = g; item = found; break; }
  }
  if (!item) return;

  const now     = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  try {
    let expId = null;
    if (amount > 0) {
      const expRef = await addExpense({
        uid,
        date:          dateStr,
        amount,
        category:      group.name,
        subCategory:   item.name,
        paymentMethod: item.paymentMethod,
        notes:         '',
        type:          'fixed',
        budgetItemId:  item.id
      });
      expId = expRef.id;
    }

    const rec  = { itemId, paid: true, amount, paidDate: dateStr, expenseId: expId };
    const pidx = monthData.payments.findIndex(p => p.itemId === itemId);
    if (pidx >= 0) monthData.payments[pidx] = rec;
    else monthData.payments.push(rec);

    await persistBudgetMonth(uid, year, month, monthData);
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
    return;
  }
  renderChecklist();
  renderBudget();
}

async function markUnpaid(itemId) {
  const { year, month, monthData } = bdgState;
  const uid = currentUser.uid;

  const pidx = monthData.payments.findIndex(p => p.itemId === itemId);
  if (pidx < 0) return;

  const payment = monthData.payments[pidx];
  try {
    if (payment.expenseId) {
      await deleteExpense(payment.expenseId);
    }
    monthData.payments[pidx] = { itemId, paid: false, amount: 0, paidDate: null, expenseId: null };
    await persistBudgetMonth(uid, year, month, monthData);
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
    return;
  }
  renderChecklist();
  renderBudget();
}

// ── Month navigation ──────────────────────────────────────────────────────────

document.getElementById('budget-prev-month').addEventListener('click', async () => {
  if (bdgState.subTab !== 'overview') return;
  bdgState.month--;
  if (bdgState.month < 1) { bdgState.month = 12; bdgState.year--; }
  await loadData();
  renderBudget();
});

document.getElementById('budget-next-month').addEventListener('click', async () => {
  if (bdgState.subTab !== 'overview') return;
  bdgState.month++;
  if (bdgState.month > 12) { bdgState.month = 1; bdgState.year++; }
  await loadData();
  renderBudget();
});

// ── Insights entry row ────────────────────────────────────────────────────────

function buildInsightsRow() {
  const section = document.createElement('section');
  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = 'row-card';
  btn.innerHTML = `
    <div class="rc-ic">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
    </div>
    <div class="rc-main">
      <div class="rc-title">Insights</div>
      <div class="rc-sub">Trends, habits &amp; financial health</div>
    </div>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--ink-3);flex-shrink:0"><polyline points="9 18 15 12 9 6"/></svg>`;
  btn.addEventListener('click', () => {
    document.getElementById('budget-insights-page').classList.add('active');
    history.pushState(null, '');
    initInsights();
  });
  section.appendChild(btn);
  return section;
}

document.getElementById('budget-insights-back').addEventListener('click', () => {
  document.getElementById('budget-insights-page').classList.remove('active');
});
