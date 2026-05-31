import { fmt, showToast, DEFAULT_CATEGORIES, DEFAULT_PAYMENTS, DEFAULT_PAYMENT_TYPES } from './helpers.js';
import {
  updateUserSettings, persistAccounts, fetchAccounts, updateBudgetMonthIncome
} from './db.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const ICON_BANK    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`;
const ICON_EWALLET = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/></svg>`;
const ICON_CARD    = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>`;
const ICON_SAVINGS = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.8 2-3 2-4.5C20 9 20 5 19 5z"/><path d="M2 9.5a5 5 0 0 1 5-5"/></svg>`;
const TYPE_ICONS   = { bank: ICON_BANK, ewallet: ICON_EWALLET, card: ICON_CARD, savings: ICON_SAVINGS };

const TYPE_CYCLE = ['bank', 'ewallet', 'card', 'savings'];
const TYPE_BADGE_STYLE = {
  bank:    'background:var(--accent-soft);color:var(--accent-ink)',
  ewallet: 'background:#fff8e8;color:#854F0B',
  card:    'background:#f0f7ff;color:#185FA5',
  savings: 'background:#f0fff8;color:#0F6E56',
};

// ── State ──────────────────────────────────────────────────────────────────────

let uid;
const state = {
  categoryPreset: 'general',
  categories:     [...DEFAULT_CATEGORIES],
  methodPreset:   'general',
  methods:        [...DEFAULT_PAYMENTS],
  methodTypes:    { ...DEFAULT_PAYMENT_TYPES },
  salaryDay:      null,
  salary:         0,
  claim:          0,
};
let seededAccounts = [];

// ── Entry point ────────────────────────────────────────────────────────────────

export function initOnboarding(uidParam) {
  uid = uidParam;
  const overlay = document.getElementById('onboarding-overlay');
  overlay.innerHTML = buildHTML();
  bindEvents();
  showStep('t0');
}

// ── Navigation ─────────────────────────────────────────────────────────────────

function showStep(id) {
  document.querySelectorAll('#onboarding-overlay .ob-step').forEach(s => s.classList.remove('active'));
  const el = qs(`#ob-${id}`);
  if (!el) return;
  el.classList.add('active');
  if (id === 's0') renderDayGrid();
  if (id === 'sc') renderCategoryChips();
  if (id === 's1') renderMethodChips();
  if (id === 's2') renderBalanceRows();
}

function showFinalScreen() {
  document.querySelectorAll('#onboarding-overlay .ob-step').forEach(s => s.classList.remove('active'));
  qs('#ob-final').classList.add('active');

  const rows = [
    summaryRow('Salary day', state.salaryDay ? ordinal(state.salaryDay) : 'Not set'),
    summaryRow('Categories', String(state.categories.length)),
    summaryRow('Accounts linked', String(seededAccounts.length)),
    summaryRow('Monthly salary', state.salary > 0 ? `RM ${fmt(state.salary)}` : 'Not set', true),
  ];
  qs('#ob-summary').innerHTML = rows.join('');
}

function dismissOnboarding() {
  document.getElementById('onboarding-overlay').remove();
  document.dispatchEvent(new CustomEvent('nav:go-add'));
}

// ── Dynamic step renderers ─────────────────────────────────────────────────────

function renderDayGrid() {
  const grid = qs('#ob-day-grid');
  let html = '';
  for (let d = 1; d <= 31; d++) {
    html += `<button class="ob-day${state.salaryDay === d ? ' selected' : ''}" data-day="${d}" type="button">${d}</button>`;
  }
  grid.innerHTML = html;

  grid.querySelectorAll('.ob-day').forEach(btn => {
    btn.addEventListener('click', () => {
      state.salaryDay = parseInt(btn.dataset.day);
      grid.querySelectorAll('.ob-day').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      qs('#ob-s0-cont').disabled = false;
      qs('#ob-day-hint').textContent = `Salary period: ${ordinal(state.salaryDay)} each month`;
    });
  });

  if (state.salaryDay) qs('#ob-s0-cont').disabled = false;
}

function renderCategoryChips() {
  const container = qs('#ob-cat-chips');
  container.innerHTML = state.categories.map(c =>
    `<button class="ob-chip on" data-cat="${escapeHtml(c)}" type="button">${escapeHtml(c)}</button>`
  ).join('') + `<button class="ob-chip add" id="ob-add-cat" type="button">+ add</button>`;

  container.querySelectorAll('.ob-chip[data-cat]').forEach(chip => {
    chip.addEventListener('click', () => {
      const cat = chip.dataset.cat;
      if (chip.classList.contains('on')) {
        if (state.categories.length <= 1) { showToast('Keep at least one category'); return; }
        state.categories = state.categories.filter(c => c !== cat);
        chip.classList.remove('on');
      } else {
        state.categories.push(cat);
        chip.classList.add('on');
      }
      updateCatCount();
    });
  });

  qs('#ob-add-cat').addEventListener('click', () => {
    const addChip = qs('#ob-add-cat');
    addChip.style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Category name';
    inp.style.cssText = 'padding:9px 14px;border-radius:999px;border:1.5px solid var(--accent);font:inherit;font-size:14px;font-weight:600;outline:none;max-width:140px;color:var(--ink);background:var(--surface)';
    container.appendChild(inp);
    inp.focus();

    const commit = () => {
      const name = inp.value.trim();
      inp.remove();
      addChip.style.display = '';
      if (name && !state.categories.includes(name)) {
        state.categories.push(name);
        renderCategoryChips();
      }
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { inp.remove(); addChip.style.display = ''; }
    });
    inp.addEventListener('blur', commit);
  });

  updateCatCount();
}

function updateCatCount() {
  qs('#ob-cat-count').textContent = `${state.categories.length} selected`;
}

function renderMethodChips() {
  const container = qs('#ob-method-chips');
  container.innerHTML = state.methods.map(m => {
    const type  = state.methodTypes[m] || 'bank';
    const bstyle = TYPE_BADGE_STYLE[type] || TYPE_BADGE_STYLE.bank;
    return `
      <div class="ob-chip-wrap">
        <button class="ob-chip on" data-method="${escapeHtml(m)}" type="button">${escapeHtml(m)}</button>
        <button class="ob-type-badge" data-method="${escapeHtml(m)}" style="${bstyle}" type="button">${type}</button>
      </div>`;
  }).join('') + `<button class="ob-chip add" id="ob-add-chip" type="button">+ add</button>`;

  // Toggle chip on/off
  container.querySelectorAll('.ob-chip[data-method]').forEach(chip => {
    chip.addEventListener('click', () => {
      const method = chip.dataset.method;
      if (chip.classList.contains('on')) {
        if (state.methods.length <= 1) { showToast('Keep at least one method'); return; }
        state.methods = state.methods.filter(m => m !== method);
        delete state.methodTypes[method];
        renderMethodChips();
      } else {
        state.methods.push(method);
        renderMethodChips();
      }
      updateMethodCount();
    });
  });

  // Cycle type badge
  container.querySelectorAll('.ob-type-badge').forEach(badge => {
    badge.addEventListener('click', () => {
      const method = badge.dataset.method;
      const cur    = state.methodTypes[method] || 'bank';
      const next   = TYPE_CYCLE[(TYPE_CYCLE.indexOf(cur) + 1) % TYPE_CYCLE.length];
      state.methodTypes[method] = next;
      badge.textContent = next;
      Object.assign(badge.style, parseBadgeStyle(TYPE_BADGE_STYLE[next]));
    });
  });

  // Add custom method
  qs('#ob-add-chip').addEventListener('click', () => {
    const addChip = qs('#ob-add-chip');
    addChip.style.display = 'none';
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'Method name';
    inp.style.cssText = 'padding:9px 14px;border-radius:999px;border:1.5px solid var(--accent);font:inherit;font-size:14px;font-weight:600;outline:none;max-width:140px;color:var(--ink);background:var(--surface)';
    container.appendChild(inp);
    inp.focus();

    const commit = () => {
      const name = inp.value.trim();
      inp.remove();
      addChip.style.display = '';
      if (name && !state.methods.includes(name)) {
        state.methods.push(name);
        state.methodTypes[name] = 'bank';
        renderMethodChips();
      }
    };
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { inp.remove(); addChip.style.display = ''; }
    });
    inp.addEventListener('blur', commit);
  });

  updateMethodCount();
}

function parseBadgeStyle(styleStr) {
  const result = {};
  styleStr.split(';').forEach(pair => {
    const [prop, val] = pair.split(':').map(s => s.trim());
    if (prop && val) {
      const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      result[camel] = val;
    }
  });
  return result;
}

function updateMethodCount() {
  qs('#ob-method-count').textContent = `${state.methods.length} selected`;
}

function renderBalanceRows() {
  const container = qs('#ob-bal-rows');
  const visible   = seededAccounts.slice(0, 5);
  const more      = seededAccounts.length - 5;

  container.innerHTML = visible.map(acc => `
    <div class="ob-bal-row">
      <div style="color:var(--ink-3)">${TYPE_ICONS[acc.type] || ICON_BANK}</div>
      <div style="flex:1;font-size:15px;font-weight:700">${escapeHtml(acc.name)}</div>
      <div style="display:flex;align-items:center">
        <span style="font-size:14px;font-weight:700;color:var(--ink-2);padding-right:6px">RM</span>
        <input type="text" inputmode="decimal" placeholder="0.00" data-acc-id="${acc.id}"
          style="width:90px;border:none;border-left:1.5px solid var(--line);outline:none;font:inherit;font-size:15px;font-weight:700;text-align:right;padding:2px 0 2px 10px;background:transparent;color:var(--ink);font-variant-numeric:tabular-nums">
      </div>
    </div>`).join('') + (more > 0
    ? `<div style="padding:10px 16px;font-size:13px;font-weight:500;color:var(--ink-3)">and ${more} more — set in Budget → Accounts</div>`
    : '');
}

// ── Event binding ──────────────────────────────────────────────────────────────

function bindEvents() {
  // Tour navigation
  qs('#ob-t0-next').addEventListener('click', () => showStep('t1'));
  qs('#ob-t0-skip').addEventListener('click', () => showStep('s0'));
  qs('#ob-t1-next').addEventListener('click', () => showStep('t2'));
  qs('#ob-t1-back').addEventListener('click', () => showStep('t0'));
  qs('#ob-t1-skip').addEventListener('click', () => showStep('s0'));
  qs('#ob-t2-next').addEventListener('click', async () => {
    try {
      await updateUserSettings(uid, { consentGiven: true, consentDate: new Date().toISOString() });
    } catch (e) {
      console.warn('Consent write failed:', e);
    }
    showStep('s0');
  });
  qs('#ob-t2-back').addEventListener('click', () => showStep('t1'));

  // Setup 0 — salary day
  qs('#ob-s0-cont').addEventListener('click', async () => {
    if (!state.salaryDay) return;
    try { await updateUserSettings(uid, { salaryDay: state.salaryDay }); }
    catch (e) { showToast('Error saving — please try again'); return; }
    showStep('sc');
  });
  qs('#ob-s0-back').addEventListener('click', () => showStep('t2'));
  qs('#ob-s0-skip').addEventListener('click', () => showStep('sc'));

  // Setup categories (sc) — preset buttons
  qs('#ob-cat-preset-general').addEventListener('click', () => {
    state.categoryPreset = 'general';
    state.categories = [...DEFAULT_CATEGORIES];
    updatePresetButtons('#ob-cat-preset-general', '#ob-cat-preset-blank');
    renderCategoryChips();
  });
  qs('#ob-cat-preset-blank').addEventListener('click', () => {
    state.categoryPreset = 'blank';
    state.categories = [];
    updatePresetButtons('#ob-cat-preset-blank', '#ob-cat-preset-general');
    renderCategoryChips();
  });
  qs('#ob-sc-cont').addEventListener('click', async () => {
    try { await updateUserSettings(uid, { categories: state.categories }); }
    catch (e) { showToast('Error saving — please try again'); return; }
    showStep('s1');
  });
  qs('#ob-sc-back').addEventListener('click', () => showStep('s0'));
  qs('#ob-sc-skip').addEventListener('click', () => showStep('s1'));

  // Setup 1 — payment methods
  qs('#ob-method-preset-general').addEventListener('click', () => {
    state.methodPreset = 'general';
    state.methods = [...DEFAULT_PAYMENTS];
    state.methodTypes = { ...DEFAULT_PAYMENT_TYPES };
    updatePresetButtons('#ob-method-preset-general');
    renderMethodChips();
  });
  qs('#ob-s1-cont').addEventListener('click', async () => {
    if (state.methods.length === 0) { showToast('Select at least one method'); return; }
    try {
      await updateUserSettings(uid, { paymentMethods: state.methods });
      const existing = await fetchAccounts(uid);
      if (!existing || existing.length === 0) {
        seededAccounts = state.methods.map((name, i) => ({
          id:             `acc-${Date.now()}-${i}`,
          name,
          openingBalance: 0,
          type:           state.methodTypes[name] || 'bank',
          createdAt:      new Date().toISOString(),
        }));
        await persistAccounts(uid, seededAccounts);
      } else {
        seededAccounts = existing;
      }
    } catch (e) {
      showToast('Error saving — please try again'); return;
    }
    showStep('s2');
  });
  qs('#ob-s1-back').addEventListener('click', () => showStep('sc'));

  // Setup 2 — opening balances
  qs('#ob-s2-cont').addEventListener('click', async () => {
    await saveBalances();
    showStep('s3');
  });
  qs('#ob-s2-back').addEventListener('click', () => showStep('s1'));
  qs('#ob-s2-skip').addEventListener('click', () => showStep('s3'));

  // Setup 3 — monthly income
  qs('#ob-s3-cont').addEventListener('click', async () => {
    state.salary = parseFloat(qs('#ob-salary').value) || 0;
    state.claim  = parseFloat(qs('#ob-claim').value) || 0;
    const now = new Date();
    try {
      await updateBudgetMonthIncome(uid, now.getFullYear(), now.getMonth() + 1, [
        { id: 'salary', name: 'Salary', amount: state.salary },
        { id: 'claim',  name: 'Claim',  amount: state.claim  },
        { id: 'other',  name: 'Other',  amount: 0            },
      ]);
    } catch (e) {
      showToast('Error saving — please try again'); return;
    }
    showFinalScreen();
  });
  qs('#ob-s3-back').addEventListener('click', () => showStep('s2'));

  // Final
  qs('#ob-final-btn').addEventListener('click', async () => {
    try {
      await updateUserSettings(uid, {
        onboardingComplete: true,
        onboardingDate:     new Date().toISOString(),
      });
    } catch (e) {
      showToast('Error — please try again'); return;
    }
    dismissOnboarding();
  });
}

function updatePresetButtons(activeId, ...inactiveIds) {
  const active = qs(activeId);
  if (active) {
    active.style.background = 'var(--ink)';
    active.style.color = 'var(--screen-bg)';
    active.style.borderColor = 'var(--ink)';
  }
  inactiveIds.forEach(id => {
    const el = qs(id);
    if (el) {
      el.style.background = 'transparent';
      el.style.color = 'var(--ink-2)';
      el.style.borderColor = 'var(--line)';
    }
  });
}

// ── Firestore: save balances ───────────────────────────────────────────────────

async function saveBalances() {
  if (seededAccounts.length === 0) return;
  const inputs = document.querySelectorAll('#ob-bal-rows input[data-acc-id]');
  const updates = {};
  inputs.forEach(inp => { updates[inp.dataset.accId] = parseFloat(inp.value) || 0; });
  const updated = seededAccounts.map(acc => ({
    ...acc,
    openingBalance: updates[acc.id] !== undefined ? updates[acc.id] : acc.openingBalance,
  }));
  try {
    await persistAccounts(uid, updated);
    seededAccounts = updated;
  } catch (e) {
    showToast('Error saving balances — you can update in Budget → Accounts');
  }
}

// ── HTML skeleton ──────────────────────────────────────────────────────────────

function buildHTML() {
  return `
    <!-- Tour 0: Welcome -->
    <div class="ob-step" id="ob-t0">
      <div style="padding:36px 24px 0;display:flex;justify-content:center">
        <div class="ob-dots">
          <div class="ob-dot current"></div>
          <div class="ob-dot"></div>
          <div class="ob-dot"></div>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;padding:32px 24px 24px">
        <div style="width:72px;height:72px;border-radius:20px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;margin-bottom:28px;color:var(--accent-ink)">${walletSVG(32)}</div>
        <h1 style="font-size:30px;font-weight:800;letter-spacing:-0.025em;margin-bottom:12px;line-height:1.15">Your finances,<br>finally clear</h1>
        <p style="font-size:15px;font-weight:500;color:var(--ink-2);line-height:1.65;margin-bottom:32px">Track every dollar — expenses, fixed bills, income, savings, and account balances in one place.</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${featureRow('Log expenses instantly')}
          ${featureRow('Smart monthly reports')}
          ${featureRow('Account balances live')}
        </div>
      </div>
      <div style="padding:0 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-t0-next">Next →</button>
        <button style="background:none;border:none;font:inherit;font-size:14px;font-weight:600;color:var(--ink-3);cursor:pointer;padding:8px" id="ob-t0-skip">Skip tour — go to setup</button>
      </div>
    </div>

    <!-- Tour 1: Budget -->
    <div class="ob-step" id="ob-t1">
      <div style="padding:36px 24px 0;display:flex;justify-content:center">
        <div class="ob-dots">
          <div class="ob-dot done"></div>
          <div class="ob-dot current"></div>
          <div class="ob-dot"></div>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;padding:32px 24px 24px">
        <div style="width:72px;height:72px;border-radius:20px;background:var(--comp);display:flex;align-items:center;justify-content:center;margin-bottom:28px;color:var(--amber)">${walletSVG(32)}</div>
        <h1 style="font-size:30px;font-weight:800;letter-spacing:-0.025em;margin-bottom:12px;line-height:1.15">Know your net balance</h1>
        <p style="font-size:15px;font-weight:500;color:var(--ink-2);line-height:1.65;margin-bottom:32px">See exactly what's left after salary, fixed bills, and daily spending — updated live every month.</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${featureRow('Income tracking')}
          ${featureRow('All your accounts tracked live')}
          ${featureRow('Mark fixed bills as paid each month')}
        </div>
      </div>
      <div style="padding:0 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-t1-next">Next →</button>
        <div style="display:flex;gap:10px">
          <button class="ob-btn-outline" style="flex:1" id="ob-t1-back">← Back</button>
          <button style="flex:1;background:none;border:none;font:inherit;font-size:14px;font-weight:600;color:var(--ink-3);cursor:pointer;padding:8px" id="ob-t1-skip">Skip tour</button>
        </div>
      </div>
    </div>

    <!-- Tour 2: Security + Consent -->
    <div class="ob-step" id="ob-t2">
      <div style="padding:36px 24px 0;display:flex;justify-content:center">
        <div class="ob-dots">
          <div class="ob-dot done"></div>
          <div class="ob-dot done"></div>
          <div class="ob-dot current"></div>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;padding:32px 24px 24px">
        <div style="width:72px;height:72px;border-radius:20px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;margin-bottom:28px;color:var(--accent-ink)">${shieldSVG(32)}</div>
        <h1 style="font-size:30px;font-weight:800;letter-spacing:-0.025em;margin-bottom:12px;line-height:1.15">Your data,<br>yours only</h1>
        <p style="font-size:15px;font-weight:500;color:var(--ink-2);line-height:1.65;margin-bottom:32px">Secured with Google Sign-In. Your financial data is locked to your account — nobody else can see it.</p>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px">
          ${featureRow('Private by design')}
          ${featureRow('Auto session timeout')}
          ${featureRow('Delete all data anytime')}
        </div>
        <p style="font-size:12.5px;font-weight:500;color:var(--ink-3);line-height:1.65">By continuing, you agree that your financial data is stored in Google Firebase, private to your account only. You can delete all data anytime in Settings.</p>
      </div>
      <div style="padding:0 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-t2-next">Set up my app →</button>
        <button class="ob-btn-outline" id="ob-t2-back">← Back</button>
      </div>
    </div>

    <!-- Setup 0: Salary Day -->
    <div class="ob-step" id="ob-s0">
      <div style="padding:20px 24px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div class="ob-prog-bar" style="flex:1;margin-right:16px"><div class="ob-prog-fill" style="width:20%"></div></div>
          <span style="font-size:12px;font-weight:700;color:var(--ink-3);white-space:nowrap">Setup 1 of 5</span>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 24px 24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Let's personalise</div>
        <h2 style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-bottom:10px">When do you get paid?</h2>
        <p style="font-size:14px;font-weight:500;color:var(--ink-2);line-height:1.6;margin-bottom:28px">This sets your salary period for reports — e.g. 25th means your month runs 25 May → 24 Jun.</p>
        <div id="ob-day-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:14px"></div>
        <p id="ob-day-hint" style="font-size:13px;font-weight:500;color:var(--ink-3);text-align:center;min-height:18px">Tap a day above</p>
      </div>
      <div style="padding:16px 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-s0-cont" disabled>Continue</button>
        <div style="display:flex;gap:10px">
          <button class="ob-btn-outline" style="flex:1" id="ob-s0-back">← Back</button>
          <button style="flex:1;background:none;border:none;font:inherit;font-size:14px;font-weight:600;color:var(--ink-3);cursor:pointer;padding:8px" id="ob-s0-skip">Skip for now</button>
        </div>
      </div>
    </div>

    <!-- Setup categories (sc) -->
    <div class="ob-step" id="ob-sc">
      <div style="padding:20px 24px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div class="ob-prog-bar" style="flex:1;margin-right:16px"><div class="ob-prog-fill" style="width:40%"></div></div>
          <span style="font-size:12px;font-weight:700;color:var(--ink-3);white-space:nowrap">Setup 2 of 5</span>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 24px 24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Your spending</div>
        <h2 style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-bottom:10px">How do you categorise?</h2>
        <p style="font-size:14px;font-weight:500;color:var(--ink-2);line-height:1.6;margin-bottom:20px">Choose a starting set. You can add, rename, or remove categories later in Settings.</p>
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <button id="ob-cat-preset-general" type="button" style="flex:1;padding:8px 0;border-radius:999px;border:1.5px solid var(--ink);background:var(--ink);color:var(--screen-bg);font:inherit;font-size:13px;font-weight:700;cursor:pointer">General ✓</button>
          <button id="ob-cat-preset-blank" type="button" style="flex:1;padding:8px 0;border-radius:999px;border:1.5px solid var(--line);background:transparent;color:var(--ink-2);font:inherit;font-size:13px;font-weight:700;cursor:pointer">Start blank</button>
        </div>
        <div id="ob-cat-chips" style="display:flex;flex-wrap:wrap;gap:9px;margin-bottom:14px"></div>
        <p id="ob-cat-count" style="font-size:13px;font-weight:600;color:var(--ink-3)"></p>
      </div>
      <div style="padding:16px 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-sc-cont">Continue</button>
        <div style="display:flex;gap:10px">
          <button class="ob-btn-outline" style="flex:1" id="ob-sc-back">← Back</button>
          <button style="flex:1;background:none;border:none;font:inherit;font-size:14px;font-weight:600;color:var(--ink-3);cursor:pointer;padding:8px" id="ob-sc-skip">Skip for now</button>
        </div>
      </div>
    </div>

    <!-- Setup 1: Payment Methods -->
    <div class="ob-step" id="ob-s1">
      <div style="padding:20px 24px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div class="ob-prog-bar" style="flex:1;margin-right:16px"><div class="ob-prog-fill" style="width:60%"></div></div>
          <span style="font-size:12px;font-weight:700;color:var(--ink-3);white-space:nowrap">Setup 3 of 5</span>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 24px 24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Your accounts</div>
        <h2 style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-bottom:10px">Which do you use?</h2>
        <p style="font-size:14px;font-weight:500;color:var(--ink-2);line-height:1.6;margin-bottom:20px">Select all your payment methods. Tap the type badge to change account type.</p>
        <div style="display:flex;gap:8px;margin-bottom:20px">
          <button id="ob-method-preset-general" type="button" style="flex:1;padding:8px 0;border-radius:999px;border:1.5px solid var(--ink);background:var(--ink);color:var(--screen-bg);font:inherit;font-size:13px;font-weight:700;cursor:pointer">General ✓</button>
        </div>
        <div id="ob-method-chips" style="display:flex;flex-wrap:wrap;gap:9px;margin-bottom:14px"></div>
        <p id="ob-method-count" style="font-size:13px;font-weight:600;color:var(--ink-3)"></p>
      </div>
      <div style="padding:16px 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-s1-cont">Continue</button>
        <button class="ob-btn-outline" id="ob-s1-back">← Back</button>
      </div>
    </div>

    <!-- Setup 2: Opening Balances -->
    <div class="ob-step" id="ob-s2">
      <div style="padding:20px 24px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div class="ob-prog-bar" style="flex:1;margin-right:16px"><div class="ob-prog-fill" style="width:80%"></div></div>
          <span style="font-size:12px;font-weight:700;color:var(--ink-3);white-space:nowrap">Setup 4 of 5</span>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 24px 24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Account balances</div>
        <h2 style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-bottom:10px">Starting balances</h2>
        <p style="font-size:14px;font-weight:500;color:var(--ink-2);line-height:1.6;margin-bottom:24px">Enter your current balance for each account. Leave blank to start from zero.</p>
        <div id="ob-bal-rows" class="ob-bal-card"></div>
      </div>
      <div style="padding:16px 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-s2-cont">Continue</button>
        <div style="display:flex;gap:10px">
          <button class="ob-btn-outline" style="flex:1" id="ob-s2-back">← Back</button>
          <button style="flex:1;background:none;border:none;font:inherit;font-size:14px;font-weight:600;color:var(--ink-3);cursor:pointer;padding:8px" id="ob-s2-skip">Skip — set up later</button>
        </div>
      </div>
    </div>

    <!-- Setup 3: Monthly Income -->
    <div class="ob-step" id="ob-s3">
      <div style="padding:20px 24px 0">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div class="ob-prog-bar" style="flex:1;margin-right:16px"><div class="ob-prog-fill" style="width:100%"></div></div>
          <span style="font-size:12px;font-weight:700;color:var(--ink-3);white-space:nowrap">Setup 5 of 5</span>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:20px 24px 24px">
        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:8px">Almost done</div>
        <h2 style="font-size:26px;font-weight:800;letter-spacing:-0.02em;margin-bottom:10px">Your monthly income</h2>
        <p style="font-size:14px;font-weight:500;color:var(--ink-2);line-height:1.6;margin-bottom:28px">Used to calculate your net balance. You can update this anytime in Budget → Overview.</p>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
          <label style="font-size:13px;font-weight:600;color:var(--ink-2)">Salary <span style="color:var(--ink-3);font-weight:500">required*</span></label>
          <div style="display:flex;align-items:center;border:2px solid var(--accent);border-radius:var(--radius);background:var(--surface);overflow:hidden">
            <span style="padding:14px 10px 14px 16px;font-size:15px;font-weight:700;color:var(--accent-ink)">RM</span>
            <input id="ob-salary" type="text" inputmode="decimal" placeholder="0.00"
              style="flex:1;border:none;outline:none;font:inherit;font-size:16px;font-weight:600;padding:14px 16px 14px 0;background:transparent;color:var(--ink);font-variant-numeric:tabular-nums">
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:24px">
          <label style="font-size:13px;font-weight:600;color:var(--ink-2)">Claim / allowance <span style="color:var(--ink-3);font-weight:500">optional</span></label>
          <div style="display:flex;align-items:center;border:1.5px solid var(--line);border-radius:var(--radius);background:var(--surface);overflow:hidden">
            <span style="padding:14px 10px 14px 16px;font-size:15px;font-weight:700;color:var(--ink-3)">RM</span>
            <input id="ob-claim" type="text" inputmode="decimal" placeholder="0.00"
              style="flex:1;border:none;outline:none;font:inherit;font-size:16px;font-weight:600;padding:14px 16px 14px 0;background:transparent;color:var(--ink);font-variant-numeric:tabular-nums">
          </div>
        </div>
        <div style="background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:var(--radius);padding:14px 16px">
          <div style="font-size:12px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--accent-ink);margin-bottom:6px">Set up after</div>
          <div style="font-size:13px;font-weight:500;color:var(--ink-2);line-height:1.7">Budget templates (fixed bills) · Savings pot goals · Category budgets — all in Settings after setup</div>
        </div>
      </div>
      <div style="padding:16px 24px 48px;display:flex;flex-direction:column;gap:12px">
        <button class="ob-btn-main" id="ob-s3-cont">Continue</button>
        <button class="ob-btn-outline" id="ob-s3-back">← Back</button>
      </div>
    </div>

    <!-- Final screen -->
    <div class="ob-step" id="ob-final">
      <div style="flex:1;overflow-y:auto;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px 24px;text-align:center">
        <div style="width:80px;height:80px;border-radius:999px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;margin-bottom:24px;color:var(--accent-ink)">${checkSVG(38)}</div>
        <h1 style="font-size:30px;font-weight:800;letter-spacing:-0.025em;margin-bottom:10px">You're all set!</h1>
        <p style="font-size:15px;font-weight:500;color:var(--ink-2);margin-bottom:28px">Here's what's been configured for you:</p>
        <div id="ob-summary" style="width:100%;background:var(--surface);border-radius:var(--radius);border:1px solid var(--line);overflow:hidden;margin-bottom:12px;text-align:left"></div>
        <div style="width:100%;background:var(--accent-soft);border:1px solid var(--accent-line);border-radius:var(--radius);padding:14px 16px;text-align:left">
          <div style="font-size:13px;font-weight:700;color:var(--accent-ink)">Next step → Add your first expense</div>
        </div>
      </div>
      <div style="padding:0 24px 48px">
        <button class="ob-btn-main" id="ob-final-btn">Start tracking →</button>
      </div>
    </div>
  `;
}

// ── SVG helpers ────────────────────────────────────────────────────────────────

function walletSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0z"/></svg>`;
}

function shieldSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;
}

function checkSVG(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function featureRow(text) {
  return `<div style="display:flex;align-items:center;gap:10px">
    <div style="width:20px;height:20px;border-radius:999px;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--accent-ink)">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span style="font-size:14.5px;font-weight:600;color:var(--ink-2)">${text}</span>
  </div>`;
}

function summaryRow(label, value, isLast = false) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:13px 16px${isLast ? '' : ';border-bottom:1px solid var(--line-2)'}">
    <span style="font-size:14px;font-weight:600;color:var(--ink-2)">${label}</span>
    <span style="font-size:14px;font-weight:700;color:var(--ink)">${value}</span>
  </div>`;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function qs(sel) { return document.querySelector(sel); }

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
