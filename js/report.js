import { currentUser, userSettings } from './state.js';
import { fmt, parseLocalDate, todayString, monthLabel, catColor } from './helpers.js';
import { fetchExpenses } from './db.js';

function shortDate(s) {
  return parseLocalDate(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: '2-digit' });
}

function daysBetween(startStr, endStr) {
  return Math.round((parseLocalDate(endStr) - parseLocalDate(startStr)) / 86400000) + 1;
}

function getPeriodDates(period) {
  const t = new Date();
  const y = t.getFullYear(), m = t.getMonth();
  switch (period) {
    case 'month':
      return { start: `${y}-${String(m + 1).padStart(2, '0')}-01`, end: todayString() };
    case 'salary': {
      const pm = m === 0 ? 12 : m;
      const py = m === 0 ? y - 1 : y;
      return {
        start: `${py}-${String(pm).padStart(2, '0')}-28`,
        end:   `${y}-${String(m + 1).padStart(2, '0')}-27`
      };
    }
    case '3m': {
      const d = new Date(y, m - 2, 1);
      return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: todayString() };
    }
    case '6m': {
      const d = new Date(y, m - 5, 1);
      return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, end: todayString() };
    }
    default:
      return { start: todayString(), end: todayString() };
  }
}

let rptState = { period: 'month', startDate: '', endDate: '', selected: [], entries: [] };

export async function initReport() {
  rptState.period   = 'month';
  rptState.selected = [];
  const { start, end } = getPeriodDates('month');
  rptState.startDate = start;
  rptState.endDate   = end;
  await loadReport();
}

async function loadReport() {
  rptState.entries = await fetchExpenses(currentUser.uid, rptState.startDate, rptState.endDate);
  renderReport();
}

function renderReport() {
  const { entries, selected, startDate, endDate, period } = rptState;

  // Header title
  const titleEl = document.getElementById('rpt-range-title');
  if (period === 'month') {
    const d = new Date(startDate + 'T00:00:00');
    titleEl.textContent = monthLabel(d.getFullYear(), d.getMonth() + 1);
  } else if (period === 'salary') {
    titleEl.textContent = 'Salary period';
  } else {
    titleEl.textContent = `${shortDate(startDate)} – ${shortDate(endDate)}`;
  }

  // Period chips
  const periods = [
    { key: 'month',  label: 'This Month' },
    { key: '3m',     label: '3 Months'   },
    { key: '6m',     label: '6 Months'   },
    { key: 'custom', label: 'Custom'      },
  ];
  const periodRow = document.getElementById('rpt-period-row');
  periodRow.innerHTML = periods.map(p =>
    `<button class="chip${p.key === period ? ' on' : ''}" data-period="${p.key}" type="button">${p.label}</button>`
  ).join('');
  periodRow.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', async () => {
      const p = btn.dataset.period;
      rptState.period = p;
      if (p === 'custom') {
        document.getElementById('rpt-custom-dates').style.display = '';
        document.getElementById('rpt-from-date').value = rptState.startDate;
        document.getElementById('rpt-to-date').value   = rptState.endDate;
        renderReport();
      } else {
        document.getElementById('rpt-custom-dates').style.display = 'none';
        const { start, end } = getPeriodDates(p);
        rptState.startDate = start;
        rptState.endDate   = end;
        rptState.selected  = [];
        await loadReport();
      }
    });
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

  const allMethods     = [...new Set(entries.map(e => e.paymentMethod))];
  const isAll          = selected.length === 0;
  const activeMethods  = isAll ? allMethods : selected.filter(s => allMethods.includes(s));
  const filteredEntries = isAll ? entries : entries.filter(e => activeMethods.includes(e.paymentMethod));

  // Payment filter chips
  const filterRow = document.getElementById('rpt-filter-row');
  filterRow.innerHTML =
    `<button class="chip${isAll ? ' on' : ''}" data-method="__all__" type="button">All</button>` +
    allMethods.map(m =>
      `<button class="chip${selected.includes(m) ? ' on' : ''}" data-method="${m}" type="button">${m}</button>`
    ).join('');
  filterRow.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.method === '__all__') {
        rptState.selected = [];
      } else {
        const m = btn.dataset.method;
        rptState.selected = selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m];
      }
      renderReport();
    });
  });

  // Stat cards
  const total    = filteredEntries.reduce((s, e) => s + e.amount, 0);
  const days     = daysBetween(startDate, endDate);
  const dailyAvg = days > 0 ? total / days : 0;
  document.getElementById('rpt-stats').innerHTML = `
    <div class="stat-card accent">
      <div class="stat-label">Total spent</div>
      <div class="stat-val">RM ${fmt(total)}</div>
    </div>
    <div class="stat-card comp">
      <div class="stat-label">Daily average</div>
      <div class="stat-val" style="font-size:22px">RM ${fmt(dailyAvg)}</div>
    </div>`;

  // Top categories breakdown bars
  const catTotals = {};
  filteredEntries.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount; });
  const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const maxCat  = topCats[0]?.[1] || 1;
  document.getElementById('rpt-breakdown').innerHTML = topCats.map(([cat, amt]) => `
    <div class="bd-row">
      <div class="bd-name"><span class="chip-dot" style="background:${catColor(cat, userSettings.categories)}"></span>${cat}</div>
      <div class="bd-bar"><span class="bd-fill" style="width:${(amt / maxCat * 100).toFixed(1)}%;background:${catColor(cat, userSettings.categories)}"></span></div>
      <div class="bd-amt">RM ${fmt(amt)}</div>
    </div>`).join('');

  // Report table
  const allCats   = [...new Set(entries.map(e => e.category))].sort();
  const table     = document.getElementById('rpt-table');
  const multiMonth = days > 35;

  if (multiMonth) {
    const months = [...new Set(entries.map(e => e.date.slice(0, 7)))].sort();
    const colLabel = ym => {
      const [y, m] = ym.split('-');
      return new Date(+y, +m - 1, 1).toLocaleDateString('en-MY', { month: 'short', year: '2-digit' });
    };
    const headCols   = months.map(ym => `<th>${colLabel(ym)}</th>`).join('');
    const footTotals = months.map(ym => {
      const s = filteredEntries.filter(e => e.date.startsWith(ym)).reduce((sum, e) => sum + e.amount, 0);
      return `<td>${s > 0 ? 'RM ' + fmt(s) : '—'}</td>`;
    }).join('');
    const grandTotal = filteredEntries.reduce((s, e) => s + e.amount, 0);
    const rows = allCats.map(cat => {
      const cells    = months.map(ym => {
        const s = filteredEntries.filter(e => e.category === cat && e.date.startsWith(ym)).reduce((sum, e) => sum + e.amount, 0);
        return s > 0 ? `<td>RM ${fmt(s)}</td>` : `<td class="zero">—</td>`;
      }).join('');
      const rowTotal = filteredEntries.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      return `<tr>
        <td class="sticky-col"><span class="chip-dot" style="background:${catColor(cat, userSettings.categories)}"></span>${cat}</td>
        ${cells}<td class="tot-col">RM ${fmt(rowTotal)}</td>
      </tr>`;
    }).join('');
    table.innerHTML = `
      <thead><tr><th class="sticky-col">Category</th>${headCols}<th class="tot-col">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="sticky-col">Total</td>${footTotals}<td class="tot-col">RM ${fmt(grandTotal)}</td></tr></tfoot>`;
  } else {
    const colMethods = isAll ? allMethods : activeMethods;
    const headCols   = colMethods.map(m => `<th>${m}</th>`).join('');
    const footTotals = colMethods.map(m => {
      const s = filteredEntries.filter(e => e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
      return `<td>${s > 0 ? 'RM ' + fmt(s) : '—'}</td>`;
    }).join('');
    const grandTotal = filteredEntries.reduce((s, e) => s + e.amount, 0);
    const rows = allCats.map(cat => {
      const cells    = colMethods.map(m => {
        const s = filteredEntries.filter(e => e.category === cat && e.paymentMethod === m).reduce((sum, e) => sum + e.amount, 0);
        return s > 0 ? `<td>RM ${fmt(s)}</td>` : `<td class="zero">—</td>`;
      }).join('');
      const rowTotal = filteredEntries.filter(e => e.category === cat).reduce((s, e) => s + e.amount, 0);
      return `<tr>
        <td class="sticky-col"><span class="chip-dot" style="background:${catColor(cat, userSettings.categories)}"></span>${cat}</td>
        ${cells}<td class="tot-col">RM ${fmt(rowTotal)}</td>
      </tr>`;
    }).join('');
    table.innerHTML = `
      <thead><tr><th class="sticky-col">Category</th>${headCols}<th class="tot-col">Total</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="sticky-col">Total</td>${footTotals}<td class="tot-col">RM ${fmt(grandTotal)}</td></tr></tfoot>`;
  }
}
