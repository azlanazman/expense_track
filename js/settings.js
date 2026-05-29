import { currentUser, userSettings, setUserSettings } from './state.js';
import { catColor } from './helpers.js';
import { persistUserSettings } from './db.js';

export function renderSettings() {
  document.getElementById('settings-eyebrow').textContent = currentUser?.email || '';
  document.getElementById('account-email').textContent    = currentUser?.email || '';
  renderCatChips();
  renderPayChips();
}

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
        await persistUserSettings(currentUser.uid, updated);
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
        await persistUserSettings(currentUser.uid, updated);
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
