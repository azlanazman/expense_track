import { currentUser, userSettings } from './state.js';
import { fmt, showToast } from './helpers.js';
import { fetchBudgetTemplate, persistBudgetTemplate } from './db.js';

const DEFAULT_BUDGET_TEMPLATE = {
  groups: [
    { id:'housing',       name:'Housing',       items:[] },
    { id:'transport',     name:'Transport',     items:[] },
    { id:'insurance',     name:'Insurance',     items:[] },
    { id:'family',        name:'Family',        items:[] },
    { id:'subscriptions', name:'Subscriptions', items:[] },
    { id:'savings',       name:'Savings',       items:[] },
    { id:'other',         name:'Other',         items:[] },
  ]
};

let btState = {
  template:    null,
  collapsed:   new Set(),
  editGroupId: null,
  editItemId:  null,
  editPay:     ''
};

// ── Public entry point ────────────────────────────────────────────────────────

export async function initBudgetTemplates() {
  if (!btState.template) await loadTemplate();
  renderBudgetTemplates();
}

// ── Data layer ────────────────────────────────────────────────────────────────

async function loadTemplate() {
  let t = await fetchBudgetTemplate(currentUser.uid);
  if (!t) {
    t = JSON.parse(JSON.stringify(DEFAULT_BUDGET_TEMPLATE));
    try {
      await persistBudgetTemplate(currentUser.uid, t);
    } catch (e) {
      console.error(e);
    }
  }
  btState.template = t;
}

async function saveTemplate() {
  try {
    await persistBudgetTemplate(currentUser.uid, btState.template);
  } catch (e) {
    console.error(e);
    showToast('Error — please try again');
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderBudgetTemplates() {
  const body = document.getElementById('budget-templates-body');
  body.innerHTML = '';

  // Groups section
  const groupsSec = document.createElement('section');
  groupsSec.innerHTML = '<span class="block-label">Fixed groups</span>';

  btState.template.groups.forEach(group => groupsSec.appendChild(buildGroup(group)));

  // Add group
  const addGroupBtn = document.createElement('button');
  addGroupBtn.type      = 'button';
  addGroupBtn.className = 'chip add';
  addGroupBtn.style.cssText = 'width:100%;justify-content:center;margin-top:8px;padding:14px;border-radius:var(--radius);font-size:14px;';
  addGroupBtn.textContent  = '+ Add group';
  addGroupBtn.addEventListener('click', startAddGroup);
  groupsSec.appendChild(addGroupBtn);

  body.appendChild(groupsSec);
}

// ── Group accordion ───────────────────────────────────────────────────────────

function buildGroup(group) {
  const isOpen = !btState.collapsed.has(group.id);
  const wrap = document.createElement('div');
  wrap.className = 'tmpl-section';
  wrap.style.marginTop = '10px';

  const CHEV = `<svg class="tmpl-chev${isOpen ? ' open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

  const hdr = document.createElement('div');
  hdr.className = 'tmpl-group-hdr';
  hdr.innerHTML = `
    ${CHEV}
    <span class="tmpl-group-name">${group.name}</span>
    <span class="tmpl-group-count">${group.items.length} item${group.items.length !== 1 ? 's' : ''}</span>
    <button class="tmpl-add-item" type="button" title="Add item" aria-label="Add item">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    </button>
    <button class="tmpl-del-group" type="button" title="Delete group" aria-label="Delete group">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
    </button>`;

  hdr.querySelector('.tmpl-group-name').addEventListener('click', () => toggleGroup(group.id));
  hdr.querySelector('.tmpl-chev').addEventListener('click',       () => toggleGroup(group.id));
  hdr.querySelector('.tmpl-add-item').addEventListener('click', e => {
    e.stopPropagation();
    openEditSheet(group.id, null);
  });
  hdr.querySelector('.tmpl-del-group').addEventListener('click', async e => {
    e.stopPropagation();
    if (!confirm(`Delete group "${group.name}" and all its items?`)) return;
    btState.template.groups = btState.template.groups.filter(g => g.id !== group.id);
    await saveTemplate();
    renderBudgetTemplates();
  });

  wrap.appendChild(hdr);

  if (isOpen) {
    const groupBody = document.createElement('div');
    groupBody.className = 'tmpl-group-body';
    group.items.forEach(item => groupBody.appendChild(buildItem(group, item)));
    wrap.appendChild(groupBody);
  }

  return wrap;
}

function toggleGroup(groupId) {
  if (btState.collapsed.has(groupId)) btState.collapsed.delete(groupId);
  else btState.collapsed.add(groupId);
  renderBudgetTemplates();
}

// ── Item row ──────────────────────────────────────────────────────────────────

function buildItem(group, item) {
  const row = document.createElement('button');
  row.type      = 'button';
  row.className = 'tmpl-item-row';

  let rightEl;
  if (item.isVariable) {
    rightEl = `<span class="tmpl-var-badge">variable</span>`;
  } else if (item.defaultAmount > 0) {
    rightEl = `<span class="tmpl-item-amt">RM ${fmt(item.defaultAmount)}</span>`;
  } else {
    rightEl = `<span class="tmpl-item-amt" style="color:var(--ink-3)">—</span>`;
  }

  row.innerHTML = `
    <span class="tmpl-item-name">${item.name}</span>
    <span class="pay-pill" style="font-size:10.5px;padding:3px 8px">${item.paymentMethod}</span>
    ${rightEl}
    <svg class="muted-ic" style="flex-shrink:0;color:var(--ink-3)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;

  row.addEventListener('click', () => openEditSheet(group.id, item.id));
  return row;
}

// ── Add group ─────────────────────────────────────────────────────────────────

function startAddGroup() {
  const body    = document.getElementById('budget-templates-body');
  const lastSec = body.querySelector('section:last-child');
  const addBtn  = lastSec.querySelector('.chip.add');

  const inp = document.createElement('input');
  inp.type      = 'text';
  inp.className = 'input-row';
  inp.placeholder = 'Group name';
  inp.style.cssText = 'margin-top:8px;width:100%;';
  lastSec.insertBefore(inp, addBtn);
  inp.focus();

  async function save() {
    const name = inp.value.trim();
    if (name) {
      btState.template.groups.push({ id: `group-${Date.now()}`, name, items: [] });
      await saveTemplate();
    }
    renderBudgetTemplates();
  }
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') renderBudgetTemplates(); });
  inp.addEventListener('blur', save);
}

// ── Edit sheet ────────────────────────────────────────────────────────────────

function openEditSheet(groupId, itemId) {
  btState.editGroupId = groupId;
  btState.editItemId  = itemId;

  const group  = btState.template.groups.find(g => g.id === groupId);
  const item   = itemId ? group.items.find(it => it.id === itemId) : null;
  const isNew = !item;

  document.getElementById('ies-title').textContent = isNew ? 'Add item' : 'Edit item';

  const nameInp = document.getElementById('ies-name');
  nameInp.value    = item?.name || '';
  nameInp.disabled = false;

  // Payment method <select>
  const paySelect = document.getElementById('ies-pay-select');
  const currentPay = item?.paymentMethod || (userSettings.paymentMethods[0] || '');
  paySelect.innerHTML = userSettings.paymentMethods.map(p =>
    `<option value="${p}"${p === currentPay ? ' selected' : ''}>${p}</option>`
  ).join('');

  const amtInp = document.getElementById('ies-amount');
  amtInp.value    = item?.defaultAmount > 0 && !item?.isVariable ? String(item.defaultAmount) : '';
  amtInp.disabled = item?.isVariable || false;

  const varChk = document.getElementById('ies-variable');
  varChk.checked  = item?.isVariable || false;
  varChk.disabled = false;
  varChk.onchange = e => { amtInp.disabled = e.target.checked; if (e.target.checked) amtInp.value = ''; };

  document.getElementById('ies-calc-note').style.display = 'none';
  document.getElementById('ies-delete').style.display    = !isNew ? '' : 'none';

  const sheet   = document.getElementById('item-edit-sheet');
  const backdrop = document.getElementById('sheet-backdrop');
  sheet.scrollTop = 0;
  sheet.classList.add('active');
  backdrop.classList.add('active');
}

function closeEditSheet() {
  document.getElementById('item-edit-sheet').classList.remove('active');
  document.getElementById('sheet-backdrop').classList.remove('active');
  btState.editGroupId = null;
  btState.editItemId  = null;
}

// ── Edit sheet module-level wiring ────────────────────────────────────────────

document.getElementById('ies-save').addEventListener('click', async () => {
  const name = document.getElementById('ies-name').value.trim();
  if (!name) { document.getElementById('ies-name').focus(); return; }

  const { editGroupId, editItemId } = btState;
  const group      = btState.template.groups.find(g => g.id === editGroupId);
  const isNew      = !editItemId;
  const isVariable = document.getElementById('ies-variable').checked;
  const amtRaw     = document.getElementById('ies-amount').value.trim();
  const defaultAmount = isVariable ? 0 : (parseFloat(amtRaw) || 0);
  const paymentMethod = document.getElementById('ies-pay-select').value;

  if (isNew) {
    group.items.push({
      id: `${editGroupId}-${Date.now()}`,
      name, paymentMethod, defaultAmount, isVariable
    });
  } else {
    const item = group.items.find(it => it.id === editItemId);
    item.name          = name;
    item.paymentMethod = paymentMethod;
    item.defaultAmount = defaultAmount;
    item.isVariable    = isVariable;
  }

  await saveTemplate();
  closeEditSheet();
  renderBudgetTemplates();
});

document.getElementById('ies-delete').addEventListener('click', async () => {
  if (!confirm('Delete this item?')) return;
  const { editGroupId, editItemId } = btState;
  const group = btState.template.groups.find(g => g.id === editGroupId);
  group.items = group.items.filter(it => it.id !== editItemId);
  await saveTemplate();
  closeEditSheet();
  renderBudgetTemplates();
});

document.getElementById('ies-amount').addEventListener('input', e => {
  const v = e.target.value.replace(/[^0-9.]/g, '');
  const parts = v.split('.');
  e.target.value = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : v;
});

