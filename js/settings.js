import { currentUser, userSettings, setUserSettings } from './state.js';
import { catColor } from './helpers.js';
import { persistUserSettings, fetchAccounts, persistAccounts } from './db.js';
import { initBudgetTemplates } from './budget-templates.js';

export function renderSettings() {
  document.getElementById('settings-eyebrow').textContent = currentUser?.email || '';
  document.getElementById('account-email').textContent    = currentUser?.email || '';
  document.getElementById('salary-day-val').textContent   = ordinal(userSettings.salaryDay ?? 25);
  renderCatChips();
  renderPayChips();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Sub-page navigation (Budget templates) ───────────────────────────────────

const subPage = document.getElementById('settings-sub-page');
document.getElementById('settings-sub-back').addEventListener('click', () => {
  subPage.classList.remove('active');
});
document.getElementById('btn-budget-templates').addEventListener('click', async () => {
  subPage.classList.add('active');
  history.pushState(null, '');
  await initBudgetTemplates();
});

// ── Salary day bottom sheet ───────────────────────────────────────────────────

const salarySheet   = document.getElementById('salary-sheet');
const sheetBackdrop = document.getElementById('sheet-backdrop');

function openSalarySheet() {
  const current = userSettings.salaryDay ?? 25;
  const grid = document.getElementById('day-picker-grid');
  grid.innerHTML = Array.from({ length: 31 }, (_, i) => i + 1).map(d =>
    `<button class="day-btn${d === current ? ' on' : ''}" data-day="${d}" type="button">${d}</button>`
  ).join('');
  grid.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const day = parseInt(btn.dataset.day);
      const updated = { ...userSettings, salaryDay: day };
      setUserSettings(updated);
      await persistUserSettings(currentUser.uid, updated);
      closeSalarySheet();
      document.getElementById('salary-day-val').textContent = ordinal(day);
    });
  });
  salarySheet.classList.add('active');
  sheetBackdrop.classList.add('active');
}

function closeSalarySheet() {
  salarySheet.classList.remove('active');
  sheetBackdrop.classList.remove('active');
}

sheetBackdrop.addEventListener('click', () => {
  document.querySelectorAll('.bottom-sheet.active').forEach(s => s.classList.remove('active'));
  sheetBackdrop.classList.remove('active');
});
document.getElementById('btn-salary-day').addEventListener('click', openSalarySheet);

// ── Categories ───────────────────────────────────────────────────────────────

function renderCatChips() {
  const wrap = document.getElementById('cat-chips');
  wrap.innerHTML = '';
  userSettings.categories.forEach((cat, idx) => wrap.appendChild(makeCatChip(cat, idx)));

  const addBtn = document.createElement('button');
  addBtn.className = 'chip add';
  addBtn.type      = 'button';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = 'New category';
    inp.style.cssText = 'border:1px solid var(--accent-line);border-radius:999px;padding:9px 15px;font:inherit;font-size:14px;font-weight:600;color:var(--ink);outline:none;min-width:120px;';
    wrap.replaceChild(inp, addBtn);
    inp.focus();
    async function saveNew() {
      const val = inp.value.trim();
      if (val) {
        const updated = { ...userSettings, categories: [...userSettings.categories, val] };
        setUserSettings(updated);
        await persistUserSettings(currentUser.uid, updated);
      }
      renderCatChips();
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') renderCatChips(); });
    inp.addEventListener('blur', saveNew);
  });
  wrap.appendChild(addBtn);
}

function makeCatChip(cat, idx) {
  const chip = document.createElement('span');
  chip.className   = 'chip soft';
  chip.style.position = 'relative';
  chip.innerHTML = `
    <span class="chip-dot" style="background:${catColor(cat, userSettings.categories)}"></span>
    <span class="cat-label" style="cursor:pointer">${cat}</span>
    <button type="button" class="chip-x" style="background:none;border:none;cursor:pointer;color:var(--ink-3);padding:0 0 0 6px;font-size:14px;line-height:1;display:inline-flex;align-items:center;" title="Remove">✕</button>`;

  chip.querySelector('.cat-label').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type  = 'text';
    inp.value = cat;
    inp.style.cssText = 'border:none;outline:none;background:none;font:inherit;font-size:14px;font-weight:600;color:var(--accent-ink);width:80px;';
    chip.querySelector('.cat-label').replaceWith(inp);
    inp.focus(); inp.select();
    async function saveRename() {
      const val = inp.value.trim();
      if (val && val !== cat) {
        const cats    = [...userSettings.categories];
        cats[idx]     = val;
        const updated = { ...userSettings, categories: cats };
        setUserSettings(updated);
        await persistUserSettings(currentUser.uid, updated);
      }
      renderCatChips();
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') renderCatChips(); });
    inp.addEventListener('blur', saveRename);
  });

  chip.querySelector('.chip-x').addEventListener('click', async () => {
    if (!confirm(`Remove "${cat}"?`)) return;
    const updated = { ...userSettings, categories: userSettings.categories.filter((_, i) => i !== idx) };
    setUserSettings(updated);
    await persistUserSettings(currentUser.uid, updated);
    renderCatChips();
  });

  return chip;
}

// ── Payment methods ──────────────────────────────────────────────────────────

function renderPayChips() {
  const wrap = document.getElementById('pay-chips');
  wrap.innerHTML = '';
  userSettings.paymentMethods.forEach((pay, idx) => wrap.appendChild(makePayChip(pay, idx)));

  const addBtn = document.createElement('button');
  addBtn.className   = 'chip add';
  addBtn.type        = 'button';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.placeholder = 'New method';
    inp.style.cssText = 'border:1px solid var(--comp-line);border-radius:999px;padding:9px 15px;font:inherit;font-size:14px;font-weight:600;color:var(--ink);outline:none;min-width:120px;';
    wrap.replaceChild(inp, addBtn);
    inp.focus();
    async function saveNew() {
      const val = inp.value.trim();
      if (val) {
        const updated = { ...userSettings, paymentMethods: [...userSettings.paymentMethods, val] };
        setUserSettings(updated);
        const accounts = (await fetchAccounts(currentUser.uid)) || [];
        if (!accounts.find(a => a.name === val)) {
          accounts.push({ id: `acc-${Date.now()}`, name: val, openingBalance: 0, type: 'ewallet', createdAt: new Date().toISOString() });
        }
        await Promise.all([persistUserSettings(currentUser.uid, updated), persistAccounts(currentUser.uid, accounts)]);
      }
      renderPayChips();
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') renderPayChips(); });
    inp.addEventListener('blur', saveNew);
  });
  wrap.appendChild(addBtn);
}

function makePayChip(pay, idx) {
  const chip = document.createElement('span');
  chip.className = 'chip soft comp';
  chip.innerHTML = `
    <span class="pay-label" style="cursor:pointer">${pay}</span>
    <button type="button" class="chip-x" style="background:none;border:none;cursor:pointer;color:var(--comp-ink);padding:0 0 0 6px;font-size:14px;line-height:1;display:inline-flex;align-items:center;" title="Remove">✕</button>`;

  chip.querySelector('.pay-label').addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type  = 'text';
    inp.value = pay;
    inp.style.cssText = 'border:none;outline:none;background:none;font:inherit;font-size:14px;font-weight:600;color:var(--comp-ink);width:70px;';
    chip.querySelector('.pay-label').replaceWith(inp);
    inp.focus(); inp.select();
    async function saveRename() {
      const val = inp.value.trim();
      if (val && val !== pay) {
        const methods = [...userSettings.paymentMethods];
        methods[idx]  = val;
        const updated = { ...userSettings, paymentMethods: methods };
        setUserSettings(updated);
        const accounts = (await fetchAccounts(currentUser.uid)) || [];
        const acc = accounts.find(a => a.name === pay);
        if (acc) acc.name = val;
        await Promise.all([persistUserSettings(currentUser.uid, updated), persistAccounts(currentUser.uid, accounts)]);
      }
      renderPayChips();
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') renderPayChips(); });
    inp.addEventListener('blur', saveRename);
  });

  chip.querySelector('.chip-x').addEventListener('click', async () => {
    if (!confirm(`Remove "${pay}"?`)) return;
    const updated = { ...userSettings, paymentMethods: userSettings.paymentMethods.filter((_, i) => i !== idx) };
    setUserSettings(updated);
    await persistUserSettings(currentUser.uid, updated);
    renderPayChips();
  });

  return chip;
}
