import { currentUser, userSettings } from './state.js';
import { fmt, parseLocalDate, monthLabel, catColor, showToast } from './helpers.js';
import { fetchExpenses } from './db.js';
import { exportReport } from './export.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const SHARED_CATS = ['Family', 'Subs', 'Car Maintenance'];

// ── State ─────────────────────────────────────────────────────────────────────

let rptState = {
  period:    'monthly',
  year:      new Date().getFullYear(),
  month:     new Date().getMonth() + 1,
  startDate: '',
  endDate:   '',
  selected:  [],
  tab:       'variable',
  entries:   [],
  expanded:  new Set()
};

// ── Public entry ──────────────────────────────────────────────────────────────

export async function initReport() {
  const now = new Date();
  rptState.period   = 'salary';
  rptState.year     = now.getFullYear();
  rptState.month    = now.getMonth() + 1;
  rptState.selected = [];
  rptState.tab      = 'variable';
  rptState.expanded = new Set();
  computePeriodDates();
  await loadReport();
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function shortDate(s) {
  return parseLocalDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function daysBetween(s, e) {
  return Math.max(1, Math.round((parseLocalDate(e) - parseLocalDate(s)) / 86400000) + 1);
}

function computePeriodDates() {
  const { period, year, month } = rptState;
  if (period === 'monthly') {
    const y = String(year), m = String(month).padStart(2, '0');
    rptState.startDate = `${y}-${m}-01`;
    rptState.endDate   = `${y}-${m}-31`;
  } else if (period === 'salary') {
    const sd = userSettings.salaryDay ?? 25;
    rptState.startDate = salaryStart(sd);
    rptState.endDate   = salaryEnd(sd);
  }
}

function salaryStart(sd) {
  const t = new Date();
  const today = t.getDate(), y = t.getFullYear(), m = t.getMonth() + 1;
  if (today >= sd) {
    // Salary already arrived this month — period started this month
    const day = Math.min(sd, new Date(y, m, 0).getDate());
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else {
    // Before salary day — period started last month
    const pm = m === 1 ? 12 : m - 1;
    const py = m === 1 ? y - 1 : y;
    const day = Math.min(sd, new Date(py, pm, 0).getDate());
    return `${py}-${String(pm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}

function salaryEnd(sd) {
  const t = new Date();
  const today = t.getDate(), y = t.getFullYear(), m = t.getMonth() + 1;
  if (sd <= 1) {
    // Salary on 1st — period runs the full calendar month
    const last = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }
  if (today >= sd) {
    // Salary arrived — period ends sd−1 of next month
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    const day = Math.min(sd - 1, new Date(ny, nm, 0).getDate());
    return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  } else {
    // Before salary day — period ends sd−1 of this month
    const day = Math.min(sd - 1, new Date(y, m, 0).getDate());
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}

// ── Data load ─────────────────────────────────────────────────────────────────

async function loadReport() {
  rptState.entries  = await fetchExpenses(currentUser.uid, rptState.startDate, rptState.endDate);
  rptState.expanded = new Set();
  renderReport();
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderReport() {
  const { period, year, month, startDate, endDate, selected, tab, entries } = rptState;

  // Header title + month nav arrows
  const titleEl  = document.getElementById('rpt-range-title');
  const prevBtn  = document.getElementById('rpt-prev-month');
  const nextBtn  = document.getElementById('rpt-next-month');
  if (period === 'monthly') {
    titleEl.textContent = monthLabel(year, month);
    prevBtn.style.visibility = '';
    nextBtn.style.visibility = '';
  } else {
    titleEl.textContent = `${shortDate(startDate)} – ${shortDate(endDate)}`;
    prevBtn.style.visibility = 'hidden';
    nextBtn.style.visibility = 'hidden';
  }

  // Period chips
  const periodRow = document.getElementById('rpt-period-row');
  periodRow.innerHTML = '';
  [{ key: 'monthly', label: 'Monthly' }, { key: 'salary', label: 'Salary Period' }, { key: 'custom', label: 'Custom' }]
    .forEach(p => {
      const btn = document.createElement('button');
      btn.className = `chip${p.key === period ? ' on' : ''}`;
      btn.type = 'button';
      btn.textContent = p.label;
      btn.addEventListener('click', async () => {
        rptState.period   = p.key;
        rptState.selected = [];
        if (p.key === 'custom') {
          document.getElementById('rpt-custom-dates').style.display = '';
          document.getElementById('rpt-from-date').value = rptState.startDate;
          document.getElementById('rpt-to-date').value   = rptState.endDate;
          renderReport();
        } else {
          document.getElementById('rpt-custom-dates').style.display = 'none';
          computePeriodDates();
          await loadReport();
        }
      });
      periodRow.appendChild(btn);
    });

  // Custom date inputs
  if (period === 'custom') {
    document.getElementById('rpt-custom-dates').style.display = '';
    const fromInp = document.getElementById('rpt-from-date');
    const toInp   = document.getElementById('rpt-to-date');
    fromInp.onchange = toInp.onchange = async () => {
      if (fromInp.value && toInp.value && fromInp.value <= toInp.value) {
        rptState.startDate = fromInp.value;
        rptState.endDate   = toInp.value;
        rptState.selected  = [];
        await loadReport();
      }
    };
  } else {
    document.getElementById('rpt-custom-dates').style.display = 'none';
  }

  // Tab bar
  const tabBar = document.getElementById('rpt-tab-bar');
  tabBar.innerHTML = '';
  [{ key: 'variable', label: 'Variable' }, { key: 'fixed', label: 'Fixed' }, { key: 'combined', label: 'Combined' }]
    .forEach(t => {
      const btn = document.createElement('button');
      btn.className = `rpt-tab${t.key === tab ? ' on' : ''}`;
      btn.type = 'button';
      btn.textContent = t.label;
      btn.addEventListener('click', () => {
        rptState.tab      = t.key;
        rptState.selected = [];
        rptState.expanded = new Set();
        renderReport();
      });
      tabBar.appendChild(btn);
    });

  // Partition entries by type
  const varEntries   = entries.filter(e => !e.type || e.type === 'variable');
  const fixedEntries = entries.filter(e => e.type === 'fixed');
  const tabEntries   = tab === 'variable' ? varEntries : tab === 'fixed' ? fixedEntries : entries;

  // Payment filter chips (based on current tab entries)
  const allMethods    = [...new Set(tabEntries.map(e => e.paymentMethod))].sort();
  const isAll         = selected.length === 0;
  const activeMethods = isAll ? allMethods : selected.filter(m => allMethods.includes(m));

  const filterRow = document.getElementById('rpt-filter-row');
  filterRow.innerHTML = '';
  const allChip = document.createElement('button');
  allChip.className = `chip${isAll ? ' on' : ''}`;
  allChip.type = 'button';
  allChip.textContent = 'All';
  allChip.addEventListener('click', () => { rptState.selected = []; renderReport(); });
  filterRow.appendChild(allChip);
  allMethods.forEach(m => {
    const chip = document.createElement('button');
    chip.className = `chip${selected.includes(m) ? ' on' : ''}`;
    chip.type = 'button';
    chip.textContent = m;
    chip.addEventListener('click', () => {
      rptState.selected = selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m];
      renderReport();
    });
    filterRow.appendChild(chip);
  });

  // Filtered entries
  const filteredVar   = isAll ? varEntries   : varEntries.filter(e => activeMethods.includes(e.paymentMethod));
  const filteredFixed = isAll ? fixedEntries : fixedEntries.filter(e => activeMethods.includes(e.paymentMethod));
  const filtered      = tab === 'variable' ? filteredVar : tab === 'fixed' ? filteredFixed
    : [...filteredVar, ...filteredFixed];

  const colMethods = activeMethods;

  // Stat cards
  const total    = filtered.reduce((s, e) => s + e.amount, 0);
  const days     = daysBetween(startDate, endDate);
  const dailyAvg = total / days;
  document.getElementById('rpt-stats').innerHTML = `
    <div class="stat-card accent">
      <div class="stat-label">Total spent</div>
      <div class="stat-val" style="font-size:22px">RM ${fmt(total)}</div>
    </div>
    <div class="stat-card comp">
      <div class="stat-label">Daily average</div>
      <div class="stat-val" style="font-size:22px">RM ${fmt(dailyAvg)}</div>
    </div>`;

  // Breakdown bars
  const catTotals = {};
  filtered.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCat  = topCats[0]?.[1] || 1;
  document.getElementById('rpt-breakdown').innerHTML = topCats.length
    ? topCats.map(([cat, amt]) => `
      <div class="bd-row">
        <div class="bd-name"><span class="chip-dot" style="background:${catColor(cat, userSettings.categories)}"></span>${cat}</div>
        <div class="bd-bar"><span class="bd-fill" style="width:${(amt/maxCat*100).toFixed(1)}%;background:${catColor(cat, userSettings.categories)}"></span></div>
        <div class="bd-amt">RM ${fmt(amt)}</div>
      </div>`).join('')
    : `<div class="list-hint">No data for this period</div>`;

  // Table
  const tableEl = document.getElementById('rpt-table');

  if (tab === 'variable')       renderVarTable(tableEl, filteredVar, colMethods);
  else if (tab === 'fixed')     renderFixedTable(tableEl, filteredFixed, colMethods);
  else                          renderCombinedTable(tableEl, filteredVar, filteredFixed, colMethods);

  // Export button
  const footnote = document.getElementById('rpt-footnote');
  footnote.innerHTML = '';
  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.style.cssText = 'margin-top:16px;width:100%;padding:13px 16px;border-radius:var(--radius);border:1.5px solid var(--accent-line);background:var(--accent-soft);color:var(--accent-ink);font:inherit;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px';
  exportBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>Export to Sheets`;
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled    = true;
    exportBtn.textContent = 'Exporting…';
    try {
      await exportReport(rptState.entries, rptState.startDate, rptState.endDate);
    } catch (e) {
      console.error(e);
      showToast('Export failed — check connection');
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>Export to Sheets`;
    }
  });
  footnote.appendChild(exportBtn);
}

// ── Variable tab ──────────────────────────────────────────────────────────────

function renderVarTable(tableEl, varEntries, colMethods) {
  const cats = [...new Set(varEntries.map(e => e.category))].sort();

  const headCols   = colMethods.map(m => `<th>${m}</th>`).join('');
  const grandTotal = varEntries.reduce((s, e) => s + e.amount, 0);
  const footTotals = colMethods.map(m => {
    const s = varEntries.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
    return s > 0 ? `<td>RM ${fmt(s)}</td>` : `<td class="zero">—</td>`;
  }).join('');

  tableEl.innerHTML = `
    <thead><tr><th class="sticky-col">Category</th>${headCols}<th class="tot-col">Total</th></tr></thead>
    <tbody></tbody>
    <tfoot><tr><td class="sticky-col">Total</td>${footTotals}<td class="tot-col">RM ${fmt(grandTotal)}</td></tr></tfoot>`;

  const tbody = tableEl.querySelector('tbody');
  if (!cats.length) {
    tbody.innerHTML = emptyRow(colMethods.length, 'No variable expenses');
    return;
  }
  cats.forEach(cat => tbody.appendChild(buildVarRow(cat, varEntries.filter(e => e.category === cat), colMethods)));
}

function buildVarRow(cat, catEntries, colMethods) {
  const rowTotal    = catEntries.reduce((s, e) => s + e.amount, 0);
  const key         = 'var_' + cat;
  const methodCells = colMethods.map(m => {
    const s = catEntries.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
    return `<td class="${s ? '' : 'zero'}">${s ? 'RM ' + fmt(s) : '—'}</td>`;
  }).join('');

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="sticky-col">
      <button class="rpt-expand-btn" type="button">▸</button>
      <span class="chip-dot" style="background:${catColor(cat, userSettings.categories)}"></span>${cat}
    </td>
    ${methodCells}
    <td class="tot-col">RM ${fmt(rowTotal)}</td>`;

  tr.querySelector('.rpt-expand-btn').addEventListener('click', e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (rptState.expanded.has(key)) {
      rptState.expanded.delete(key);
      btn.textContent = '▸';
      removeSubRows(tr);
    } else {
      rptState.expanded.add(key);
      btn.textContent = '▾';
      insertAfter(tr, buildVarSubRows(catEntries, colMethods));
    }
  });
  return tr;
}

function buildVarSubRows(catEntries, colMethods) {
  const byDate = {};
  catEntries.forEach(e => {
    if (!byDate[e.date]) byDate[e.date] = {};
    byDate[e.date][e.paymentMethod] = (byDate[e.date][e.paymentMethod] || 0) + e.amount;
  });
  return Object.entries(byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, methods]) => {
      const dayTotal    = Object.values(methods).reduce((s, v) => s + v, 0);
      const methodCells = colMethods.map(m =>
        methods[m]
          ? `<td style="color:var(--ink-2)">RM ${fmt(methods[m])}</td>`
          : `<td class="zero">—</td>`
      ).join('');
      const tr = document.createElement('tr');
      tr.className = 'rpt-sub-row';
      tr.innerHTML = `
        <td class="sticky-col" style="padding-left:30px;font-size:12.5px;font-weight:500;color:var(--ink-2)">${shortDate(date)}</td>
        ${methodCells}
        <td class="tot-col" style="color:var(--ink-2)">RM ${fmt(dayTotal)}</td>`;
      return tr;
    });
}

// ── Fixed tab ─────────────────────────────────────────────────────────────────

function renderFixedTable(tableEl, fixedEntries, colMethods) {
  const groups = [...new Set(fixedEntries.map(e => e.category))].sort();

  const headCols   = colMethods.map(m => `<th>${m}</th>`).join('');
  const grandTotal = fixedEntries.reduce((s, e) => s + e.amount, 0);
  const footTotals = colMethods.map(m => {
    const s = fixedEntries.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
    return s > 0 ? `<td>RM ${fmt(s)}</td>` : `<td class="zero">—</td>`;
  }).join('');

  tableEl.innerHTML = `
    <thead><tr><th class="sticky-col">Group</th>${headCols}<th class="tot-col">Total</th></tr></thead>
    <tbody></tbody>
    <tfoot><tr><td class="sticky-col">Total</td>${footTotals}<td class="tot-col">RM ${fmt(grandTotal)}</td></tr></tfoot>`;

  const tbody = tableEl.querySelector('tbody');
  if (groups.length) {
    groups.forEach(g => tbody.appendChild(buildFixedRow(g, fixedEntries.filter(e => e.category === g), colMethods)));
  } else {
    tbody.innerHTML = emptyRow(colMethods.length, 'No fixed payments');
  }

}

function buildFixedRow(groupName, groupEntries, colMethods) {
  const rowTotal    = groupEntries.reduce((s, e) => s + e.amount, 0);
  const key         = 'fixed_' + groupName;
  const methodCells = colMethods.map(m => {
    const s = groupEntries.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
    return `<td class="${s ? '' : 'zero'}">${s ? 'RM ' + fmt(s) : '—'}</td>`;
  }).join('');

  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="sticky-col">
      <button class="rpt-expand-btn" type="button">▸</button>
      ${groupName}
    </td>
    ${methodCells}
    <td class="tot-col">RM ${fmt(rowTotal)}</td>`;

  tr.querySelector('.rpt-expand-btn').addEventListener('click', e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    if (rptState.expanded.has(key)) {
      rptState.expanded.delete(key);
      btn.textContent = '▸';
      removeSubRows(tr);
    } else {
      rptState.expanded.add(key);
      btn.textContent = '▾';
      insertAfter(tr, buildFixedSubRows(groupEntries, colMethods));
    }
  });
  return tr;
}

function buildFixedSubRows(groupEntries, colMethods) {
  const subCats = [...new Set(groupEntries.map(e => e.subCategory || '—'))].sort();
  return subCats.map(sub => {
    const subEntries  = groupEntries.filter(e => (e.subCategory || '—') === sub);
    const subTotal    = subEntries.reduce((s, e) => s + e.amount, 0);
    const methodCells = colMethods.map(m => {
      const s = subEntries.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
      return s > 0 ? `<td style="color:var(--ink-2)">RM ${fmt(s)}</td>` : `<td class="zero">—</td>`;
    }).join('');
    const tr = document.createElement('tr');
    tr.className = 'rpt-sub-row';
    tr.innerHTML = `
      <td class="sticky-col" style="padding-left:30px;font-size:12.5px;font-weight:500;color:var(--ink-2)">${sub}</td>
      ${methodCells}
      <td class="tot-col" style="color:var(--ink-2)">RM ${fmt(subTotal)}</td>`;
    return tr;
  });
}

// ── Combined tab ──────────────────────────────────────────────────────────────

function renderCombinedTable(tableEl, varEntries, fixedEntries, colMethods) {
  const rows = [];

  SHARED_CATS.forEach(cat => {
    const ve = varEntries.filter(e => e.category === cat);
    const fe = fixedEntries.filter(e => e.category === cat);
    const total = [...ve, ...fe].reduce((s, e) => s + e.amount, 0);
    if (total > 0) rows.push({ kind: 'shared', cat, ve, fe, total });
  });

  [...new Set(varEntries.map(e => e.category))].filter(c => !SHARED_CATS.includes(c)).sort().forEach(cat => {
    const ve    = varEntries.filter(e => e.category === cat);
    const total = ve.reduce((s, e) => s + e.amount, 0);
    if (total > 0) rows.push({ kind: 'var', cat, ve, fe: [], total });
  });

  [...new Set(fixedEntries.map(e => e.category))].filter(c => !SHARED_CATS.includes(c)).sort().forEach(cat => {
    const fe    = fixedEntries.filter(e => e.category === cat);
    const total = fe.reduce((s, e) => s + e.amount, 0);
    if (total > 0) rows.push({ kind: 'fixed', cat, ve: [], fe, total });
  });

  const allCombined = [...varEntries, ...fixedEntries];
  const grandTotal  = allCombined.reduce((s, e) => s + e.amount, 0);
  const headCols    = colMethods.map(m => `<th>${m}</th>`).join('');
  const footTotals  = colMethods.map(m => {
    const s = allCombined.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
    return s > 0 ? `<td>RM ${fmt(s)}</td>` : `<td class="zero">—</td>`;
  }).join('');

  tableEl.innerHTML = `
    <thead><tr><th class="sticky-col">Category</th>${headCols}<th class="tot-col">Total</th></tr></thead>
    <tbody></tbody>
    <tfoot><tr><td class="sticky-col">Total</td>${footTotals}<td class="tot-col">RM ${fmt(grandTotal)}</td></tr></tfoot>`;

  const tbody = tableEl.querySelector('tbody');
  if (!rows.length) {
    tbody.innerHTML = emptyRow(colMethods.length, 'No data for this period');
    return;
  }

  rows.forEach(row => {
    const all         = [...row.ve, ...row.fe];
    const methodCells = colMethods.map(m => {
      const s = all.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
      return `<td class="${s ? '' : 'zero'}">${s ? 'RM ' + fmt(s) : '—'}</td>`;
    }).join('');
    const pill = row.kind === 'var'
      ? `<span class="rpt-pill var">var</span>`
      : row.kind === 'fixed'
        ? `<span class="rpt-pill fixed">fixed</span>`
        : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="sticky-col"><span class="chip-dot" style="background:${catColor(row.cat, userSettings.categories)}"></span>${row.cat}${pill}</td>
      ${methodCells}
      <td class="tot-col">RM ${fmt(row.total)}</td>`;
    tbody.appendChild(tr);
  });
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function removeSubRows(tr) {
  let next = tr.nextSibling;
  while (next?.classList?.contains('rpt-sub-row')) {
    const rem = next; next = next.nextSibling; rem.remove();
  }
}

function insertAfter(ref, rows) {
  rows.forEach(row => { ref.after(row); ref = row; });
}

function emptyRow(colCount, msg) {
  return `<tr><td colspan="${colCount + 2}" style="text-align:center;color:var(--ink-3);padding:24px;font-size:13.5px;font-weight:500">${msg}</td></tr>`;
}

// ── Month navigation ──────────────────────────────────────────────────────────

document.getElementById('rpt-prev-month').addEventListener('click', async () => {
  if (rptState.period !== 'monthly') return;
  rptState.month--;
  if (rptState.month < 1) { rptState.month = 12; rptState.year--; }
  computePeriodDates();
  await loadReport();
});

document.getElementById('rpt-next-month').addEventListener('click', async () => {
  if (rptState.period !== 'monthly') return;
  rptState.month++;
  if (rptState.month > 12) { rptState.month = 1; rptState.year++; }
  computePeriodDates();
  await loadReport();
});
