// Category spending-limit sheet (opened from the Budget screen and the Insights category strips).
// Saves to userSettings.categoryLimits, then tells the screens to redraw via `expenses:changed`.
import { currentUser, userSettings, setUserSettings } from './state.js';
import { updateUserSettings } from './db.js';

export function openCategoryLimitSheet(cat) {
  const existing = (userSettings.categoryLimits || {})[cat] || 0;

  const overlay = document.createElement('div');
  overlay.className = 'lim-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'lim-sheet';

  const grabber = document.createElement('div');
  grabber.className = 'export-grabber';

  const titleEl = document.createElement('div');
  titleEl.className = 'sheet-title';
  titleEl.textContent = `${cat} — spending limit`;

  const subEl = document.createElement('div');
  subEl.className = 'sheet-sub';
  subEl.textContent = 'Per salary period. Leave empty or remove to switch the limit off.';

  const field = document.createElement('div');
  field.className = 'as-amt sm';

  const pfx = document.createElement('span');
  pfx.className = 'rm';
  pfx.textContent = 'RM';

  const inp = document.createElement('input');
  inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = '0.00'; inp.autocomplete = 'off';
  inp.setAttribute('aria-label', `${cat} spending limit in ringgit`);
  if (existing > 0) inp.value = String(existing);
  field.appendChild(pfx); field.appendChild(inp);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button'; saveBtn.className = 'btn-save'; saveBtn.textContent = 'Set limit';

  sheet.appendChild(grabber); sheet.appendChild(titleEl); sheet.appendChild(subEl);
  sheet.appendChild(field);  sheet.appendChild(saveBtn);

  if (existing > 0) {
    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'lim-remove';
    rmBtn.textContent = 'Remove limit';
    rmBtn.addEventListener('click', () => persistLimit(0));
    sheet.appendChild(rmBtn);
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  setTimeout(() => inp.focus(), 80);

  inp.addEventListener('input', e => {
    const raw = e.target.value.replace(/[^0-9.]/g, '');
    const pts = raw.split('.');
    e.target.value = pts.length > 2 ? pts[0] + '.' + pts.slice(1).join('') : raw;
  });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') saveBtn.click(); });
  saveBtn.addEventListener('click', () => persistLimit(parseFloat(inp.value) || 0));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  async function persistLimit(val) {
    overlay.remove();
    const limits = { ...(userSettings.categoryLimits || {}) };
    if (val > 0) limits[cat] = val; else delete limits[cat];
    setUserSettings({ ...userSettings, categoryLimits: limits });
    try { await updateUserSettings(currentUser.uid, { categoryLimits: limits }); } catch (e) { console.error(e); }
    document.dispatchEvent(new CustomEvent('expenses:changed'));   // Insights, Budget and Report strips use these limits
  }
}
