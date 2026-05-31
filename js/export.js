import { fetchBudgetMonth } from './db.js';
import { currentUser } from './state.js';

const SHARED_CATS  = ['Family', 'Subs', 'Car Maintenance'];
const SHEETJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

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

// ── Public entry ───────────────────────────────────────────────────────────────

export async function exportReport(entries, startDate, endDate) {
  await ensureSheetJS();
  const XLSX = window.XLSX;

  const varEntries   = entries.filter(e => !e.type || e.type === 'variable');
  const fixedEntries = entries.filter(e =>  e.type === 'fixed');

  const varMethods   = [...new Set(varEntries.map(e => e.paymentMethod))].sort();
  const fixedMethods = [...new Set(fixedEntries.map(e => e.paymentMethod))].sort();
  const allMethods   = [...new Set(entries.map(e => e.paymentMethod))].sort();

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildVariableSheet (XLSX, varEntries,   varMethods),              'Variable');
  XLSX.utils.book_append_sheet(wb, buildFixedSheet    (XLSX, fixedEntries, fixedMethods),            'Fixed');
  XLSX.utils.book_append_sheet(wb, buildCombinedSheet (XLSX, varEntries,   fixedEntries, allMethods),'Combined');

  const incomeRows = await fetchIncomeForPeriod(startDate, endDate);
  XLSX.utils.book_append_sheet(wb, buildIncomeSheet(XLSX, incomeRows), 'Income');

  XLSX.writeFile(wb, `expense-${startDate}–${endDate}.xlsx`);
}

// ── Sheet 1: Variable ─────────────────────────────────────────────────────────

function buildVariableSheet(XLSX, varEntries, methods) {
  const cats = [...new Set(varEntries.map(e => e.category))].sort();
  const rows = [['Category', ...methods, 'Total']];

  cats.forEach(cat => {
    const catE     = varEntries.filter(e => e.category === cat);
    const rowTotal = catE.reduce((s, e) => s + e.amount, 0);
    rows.push([cat, ...methods.map(m => sum(catE, m) || ''), rowTotal]);

    // Daily sub-rows (date desc)
    const byDate = {};
    catE.forEach(e => {
      byDate[e.date] = byDate[e.date] || {};
      byDate[e.date][e.paymentMethod] = (byDate[e.date][e.paymentMethod] || 0) + e.amount;
    });
    Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).forEach(([date, dm]) => {
      const dayTotal = Object.values(dm).reduce((s, v) => s + v, 0);
      rows.push([`  ${fmtDate(date)}`, ...methods.map(m => dm[m] || ''), dayTotal]);
    });
  });

  const grandTotal = varEntries.reduce((s, e) => s + e.amount, 0);
  rows.push(['TOTAL', ...methods.map(m => sum(varEntries, m)), grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, ...methods.map(() => ({ wch: 13 })), { wch: 13 }];
  return ws;
}

// ── Sheet 2: Fixed ────────────────────────────────────────────────────────────

function buildFixedSheet(XLSX, fixedEntries, methods) {
  const groups = [...new Set(fixedEntries.map(e => e.category))].sort();
  const rows   = [['Group', 'Item', ...methods, 'Total']];

  groups.forEach(group => {
    const groupE     = fixedEntries.filter(e => e.category === group);
    const groupTotal = groupE.reduce((s, e) => s + e.amount, 0);
    rows.push([group, '', ...methods.map(m => sum(groupE, m) || ''), groupTotal]);

    // Item sub-rows
    [...new Set(groupE.map(e => e.subCategory || '—'))].sort().forEach(item => {
      const itemE     = groupE.filter(e => (e.subCategory || '—') === item);
      const itemTotal = itemE.reduce((s, e) => s + e.amount, 0);
      rows.push(['', item, ...methods.map(m => sum(itemE, m) || ''), itemTotal]);
    });
  });

  const grandTotal = fixedEntries.reduce((s, e) => s + e.amount, 0);
  rows.push(['TOTAL', '', ...methods.map(m => sum(fixedEntries, m)), grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 22 }, ...methods.map(() => ({ wch: 13 })), { wch: 13 }];
  return ws;
}

// ── Sheet 3: Combined ─────────────────────────────────────────────────────────

function buildCombinedSheet(XLSX, varEntries, fixedEntries, methods) {
  const rows = [['Category', 'Type', ...methods, 'Total']];

  const addRow = (label, type, allE) => {
    const total = allE.reduce((s, e) => s + e.amount, 0);
    if (!total) return;
    rows.push([label, type, ...methods.map(m => sum(allE, m) || ''), total]);
  };

  // Shared cats: merge var + fixed
  SHARED_CATS.forEach(cat => {
    const ve = varEntries.filter(e => e.category === cat);
    const fe = fixedEntries.filter(e => e.category === cat);
    addRow(cat, 'merged', [...ve, ...fe]);
  });

  // Remaining variable categories
  [...new Set(varEntries.map(e => e.category))].filter(c => !SHARED_CATS.includes(c)).sort()
    .forEach(cat => addRow(cat, 'variable', varEntries.filter(e => e.category === cat)));

  // Remaining fixed groups
  [...new Set(fixedEntries.map(e => e.category))].filter(c => !SHARED_CATS.includes(c)).sort()
    .forEach(cat => addRow(cat, 'fixed', fixedEntries.filter(e => e.category === cat)));

  const allE       = [...varEntries, ...fixedEntries];
  const grandTotal = allE.reduce((s, e) => s + e.amount, 0);
  rows.push(['TOTAL', '', ...methods.map(m => sum(allE, m)), grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 10 }, ...methods.map(() => ({ wch: 13 })), { wch: 13 }];
  return ws;
}

// ── Sheet 4: Income ───────────────────────────────────────────────────────────

function buildIncomeSheet(XLSX, incomeRows) {
  const rows = [['Month', 'Source', 'Amount']];
  let total  = 0;
  incomeRows.forEach(r => { rows.push([r.month, r.source, r.amount]); total += r.amount; });
  rows.push(['', 'TOTAL', total]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 13 }];
  return ws;
}

// ── Income data fetch ─────────────────────────────────────────────────────────

async function fetchIncomeForPeriod(startDate, endDate) {
  const uid    = currentUser.uid;
  const start  = new Date(startDate + 'T00:00:00');
  const end    = new Date(endDate   + 'T00:00:00');
  const rows   = [];
  let   cur    = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMth = new Date(end.getFullYear(),   end.getMonth(),   1);

  while (cur <= endMth) {
    const y = cur.getFullYear(), m = cur.getMonth() + 1;
    const data = await fetchBudgetMonth(uid, y, m);
    if (data?.income) {
      const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      data.income.forEach(entry => rows.push({ month: label, source: entry.name, amount: entry.amount || 0 }));
    }
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return rows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sum(entries, method) {
  return entries.filter(e => e.paymentMethod === method).reduce((s, e) => s + e.amount, 0);
}

function fmtDate(s) {
  return new Date(s + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
