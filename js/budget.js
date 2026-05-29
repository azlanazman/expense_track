import { currentUser } from './state.js';
import { fmt, monthLabel } from './helpers.js';
import { fetchBudgetTemplate, fetchBudgetMonth, persistBudgetMonth, fetchMonth } from './db.js';

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
  year:             new Date().getFullYear(),
  month:            new Date().getMonth() + 1,
  monthData:        null,
  template:         null,
  variableExpenses: []
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function initBudget() {
  bdgState.template = null; // always reload fresh
  await loadData();
  renderBudget();
}

// ── Data ──────────────────────────────────────────────────────────────────────

async function loadData() {
  const { year, month } = bdgState;
  const uid = currentUser.uid;

  bdgState.template = await fetchBudgetTemplate(uid);

  if (!bdgState.template) {
    bdgState.monthData        = { income: JSON.parse(JSON.stringify(DEFAULT_INCOME)), payments: [] };
    bdgState.variableExpenses = [];
    return;
  }

  let monthData = await fetchBudgetMonth(uid, year, month);
  if (!monthData) {
    monthData = seedMonth(bdgState.template);
    await persistBudgetMonth(uid, year, month, monthData);
  }
  bdgState.monthData = monthData;

  const all = await fetchMonth(uid, year, month);
  bdgState.variableExpenses = all.filter(e => !e.type || e.type === 'variable');
}

function seedMonth(template) {
  return {
    income: JSON.parse(JSON.stringify(DEFAULT_INCOME)),
    payments: template.groups.flatMap(g =>
      g.items
        .filter(i => !i.isCalculated)
        .map(i => ({ itemId: i.id, paid: false, amount: i.defaultAmount, paidDate: null, expenseId: null }))
    )
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderBudget() {
  const { year, month, monthData, template, variableExpenses } = bdgState;

  document.getElementById('budget-month-title').textContent = monthLabel(year, month);

  const body = document.getElementById('budget-body');
  body.innerHTML = '';

  if (!template) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:48px 0;color:var(--ink-3)">
        <span style="font-size:15px;font-weight:600">No budget template set up</span>
        <span style="font-size:13px">Go to Settings → Budget templates to get started</span>
      </div>`;
    return;
  }

  const incomeTotal   = monthData.income.reduce((s, i) => s + (i.amount || 0), 0);
  const fixedPaid     = monthData.payments.filter(p => p.paid).reduce((s, p) => s + (p.amount || 0), 0);
  const variableTotal = variableExpenses.reduce((s, e) => s + e.amount, 0);
  const netBalance    = incomeTotal - fixedPaid - variableTotal;

  const totalItems  = template.groups.reduce((s, g) => s + g.items.filter(i => !i.isCalculated).length, 0);
  const paidCount   = monthData.payments.filter(p => p.paid).length;
  const progressPct = totalItems > 0 ? (paidCount / totalItems * 100) : 0;

  body.appendChild(buildHero(netBalance, incomeTotal, fixedPaid, variableTotal, progressPct, paidCount, totalItems));
  body.appendChild(buildStatGrid(incomeTotal, fixedPaid, variableTotal, netBalance));
  body.appendChild(buildIncomeSection(monthData.income));
  body.appendChild(buildFixedSummary(template, monthData.payments, paidCount, totalItems));
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

// ── Stat cards ────────────────────────────────────────────────────────────────

function buildStatGrid(income, fixed, variable, remaining) {
  const isPos = remaining >= 0;
  const div   = document.createElement('div');
  div.className = 'stat-grid';
  div.innerHTML = `
    <div class="stat-card accent">
      <div class="stat-label">Income</div>
      <div class="stat-val">RM ${fmt(income)}</div>
    </div>
    <div class="stat-card comp">
      <div class="stat-label">Fixed paid</div>
      <div class="stat-val" style="font-size:22px">RM ${fmt(fixed)}</div>
    </div>
    <div class="stat-card surface">
      <div class="stat-label">Variable so far</div>
      <div class="stat-val" style="font-size:22px">RM ${fmt(variable)}</div>
    </div>
    <div class="stat-card ${isPos ? 'positive' : 'negative'}">
      <div class="stat-label">Remaining</div>
      <div class="stat-val" style="font-size:22px">${isPos ? '' : '−'}RM ${fmt(Math.abs(remaining))}</div>
    </div>`;
  return div;
}

// ── Income section ────────────────────────────────────────────────────────────

function buildIncomeSection(income) {
  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Income</span>';

  const card = document.createElement('div');
  card.className = 'income-card';

  income.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'income-row';
    row.innerHTML = `
      <span class="income-dot" style="background:${INCOME_DOTS[entry.id] || 'var(--ink-3)'}"></span>
      <span class="income-name">${entry.name}</span>
      <span class="income-val" id="income-val-${entry.id}">
        RM ${fmt(entry.amount || 0)}
        <span style="color:var(--ink-3)">${PENCIL_IC}</span>
      </span>`;
    row.querySelector('.income-val').addEventListener('click', () => startIncomeEdit(entry));
    card.appendChild(row);
  });

  section.appendChild(card);
  return section;
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
    await persistBudgetMonth(currentUser.uid, bdgState.year, bdgState.month, bdgState.monthData);
    renderBudget();
  }

  inp.addEventListener('blur', save);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') renderBudget(); });
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
    const totalN = group.items.filter(i => !i.isCalculated).length;

    const row = document.createElement('div');
    row.className = 'fixed-group-row';
    row.innerHTML = `
      <span class="fixed-group-name">${group.name}</span>
      <span class="fixed-group-meta">${paidN}/${totalN}</span>
      <span class="fixed-group-amt">${paidAmt > 0 ? 'RM ' + fmt(paidAmt) : '—'}</span>`;
    container.appendChild(row);
  });
}

// ── Checklist navigation (placeholder — Task 11 fills content) ────────────────

export function showChecklist() {
  document.getElementById('budget-checklist-page').classList.add('active');
}

document.getElementById('budget-checklist-back').addEventListener('click', () => {
  document.getElementById('budget-checklist-page').classList.remove('active');
});

// ── Month navigation ──────────────────────────────────────────────────────────

document.getElementById('budget-prev-month').addEventListener('click', async () => {
  bdgState.month--;
  if (bdgState.month < 1) { bdgState.month = 12; bdgState.year--; }
  await loadData();
  renderBudget();
});

document.getElementById('budget-next-month').addEventListener('click', async () => {
  bdgState.month++;
  if (bdgState.month > 12) { bdgState.month = 1; bdgState.year++; }
  await loadData();
  renderBudget();
});
