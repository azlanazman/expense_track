import { currentUser, userSettings, setUserSettings } from './state.js';
import { fmt, fmt0, catColor, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetMonth, fetchBudgetTemplate, updateUserSettings } from './db.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _cache = null;
let _chart = null;
let _catChart = null;

export function clearInsightsState() {
  _cache = null;
  if (_chart)    { _chart.destroy();    _chart    = null; }
  if (_catChart) { _catChart.destroy(); _catChart = null; }
}

// ── Entry point ────────────────────────────────────────────────────────────────

export async function initInsights() {
  const body = document.getElementById('budget-insights-body');
  body.innerHTML = '<div class="insights-loading">Loading insights…</div>';
  try {
    await ensureChartJS();
    await ensureTreemapPlugin();
    const data = await loadData(currentUser.uid);
    body.innerHTML = '';
    renderKPIs(body, data);
    renderTrendChart(body, data);
    renderCategorySection(body, data);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<div class="list-hint" style="padding:40px 0">Failed to load — please try again</div>';
  }
}

// ── Script loaders ─────────────────────────────────────────────────────────────

function ensureChartJS() {
  if (window.Chart) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    s.onload  = resolve;
    s.onerror = () => reject(new Error('Chart.js failed to load'));
    document.head.appendChild(s);
  });
}

function ensureTreemapPlugin() {
  if (window._treemapLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js';
    s.onload  = () => { window._treemapLoaded = true; resolve(); };
    s.onerror = () => reject(new Error('Treemap plugin failed to load'));
    document.head.appendChild(s);
  });
}

// ── Data loading ───────────────────────────────────────────────────────────────

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

async function loadData(uid) {
  if (_cache) return _cache;

  const now = new Date();
  const sd  = userSettings.salaryDay ?? 25;

  // Last 12 calendar months, oldest first
  const monthRefs = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthRefs.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const oldest    = monthRefs[0];
  const startDate = `${oldest.year}-${String(oldest.month).padStart(2,'0')}-01`;
  const endDate   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-31`;

  const [expenses, template, ...budgetMonths] = await Promise.all([
    fetchExpenses(uid, startDate, endDate),
    fetchBudgetTemplate(uid),
    ...monthRefs.map(({ year, month }) => fetchBudgetMonth(uid, year, month)),
  ]);

  // Monthly chart aggregates
  const monthly = monthRefs.map(({ year, month }, i) => {
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    const me  = expenses.filter(e => e.date?.startsWith(prefix));
    const bm  = budgetMonths[i];
    const income   = (bm?.income   || []).reduce((s, x) => s + (x.amount || 0), 0);
    const fixed    = me.filter(e => e.type === 'fixed').reduce((s, e) => s + e.amount, 0);
    const variable = me.filter(e => !e.type || e.type === 'variable').reduce((s, e) => s + e.amount, 0);
    return { year, month, income, fixed, variable, net: income - fixed - variable };
  });

  // KPI: current salary period
  const sp      = salaryPeriodMonth(sd);
  const spStart = salaryStartForMonth(sd, sp.year, sp.month);
  const spEnd   = salaryEndForMonth(sd, sp.year, sp.month);
  const spExp   = expenses.filter(e => e.date >= spStart && e.date <= spEnd);

  const bmIdx = monthRefs.findIndex(r => r.year === sp.year && r.month === sp.month);
  const curBM = bmIdx >= 0 ? budgetMonths[bmIdx] : null;

  const incomeTotal   = (curBM?.income || []).reduce((s, x) => s + (x.amount || 0), 0);
  const fixedTotal    = spExp.filter(e => e.type === 'fixed').reduce((s, e) => s + e.amount, 0);
  const variableTotal = spExp.filter(e => !e.type || e.type === 'variable').reduce((s, e) => s + e.amount, 0);
  const netBalance    = incomeTotal - fixedTotal - variableTotal;

  const spStartDt   = new Date(spStart + 'T00:00:00');
  const daysElapsed = Math.max(1, Math.round((now - spStartDt) / 86_400_000) + 1);

  const templateItemIds = new Set(template?.groups?.flatMap(g => g.items.map(i => i.id)) || []);
  const activePayments  = (curBM?.payments || []).filter(p => templateItemIds.has(p.itemId));
  const paidCount  = activePayments.filter(p => p.paid).length;
  const totalItems = templateItemIds.size;

  const prevM    = monthly[monthly.length - 2];
  const netDelta = prevM ? netBalance - prevM.net : null;

  _cache = {
    expenses,
    monthRefs,
    monthly,
    kpi: {
      netBalance, netDelta,
      savingsRate: incomeTotal > 0 ? (netBalance    / incomeTotal) * 100 : 0,
      fixedRatio:  incomeTotal > 0 ? (fixedTotal    / incomeTotal) * 100 : 0,
      varRatio:    incomeTotal > 0 ? (variableTotal / incomeTotal) * 100 : 0,
      dailyAvg:    variableTotal / daysElapsed,
      paidCount,   totalItems,
    },
  };
  return _cache;
}

// ── Section 1: KPI Cards ───────────────────────────────────────────────────────

function renderKPIs(body, { kpi }) {
  const { netBalance, netDelta, savingsRate, fixedRatio, varRatio, dailyAvg, paidCount, totalItems } = kpi;

  const isNegNet = netBalance < 0;
  const netClr   = isNegNet ? 'var(--danger)' : 'var(--accent-ink)';
  const savClr   = savingsRate >= 20 ? 'var(--positive)' : savingsRate >= 10 ? 'var(--accent-ink)' : 'var(--danger)';

  let deltaHtml = '';
  if (netDelta !== null) {
    const up = netDelta >= 0;
    deltaHtml = `<span class="kpi-delta ${up ? 'up' : 'dn'}">${up ? '↑' : '↓'} vs last month</span>`;
  }

  const billsPct = totalItems > 0 ? (paidCount / totalItems) * 100 : 0;
  const allPaid  = totalItems > 0 && paidCount === totalItems;

  const section = document.createElement('section');
  section.innerHTML = `
    <span class="block-label">This period</span>
    <div class="kpi-grid">
      <div class="kpi-card kpi-featured">
        <div class="kpi-label">Net balance</div>
        <div class="kpi-val" style="color:${netClr}">${isNegNet ? '−' : ''}RM ${fmt(Math.abs(netBalance))}</div>
        ${deltaHtml}
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Savings rate</div>
        <div class="kpi-val" style="color:${savClr}">${savingsRate.toFixed(1)}%</div>
        <div class="kpi-sub">of income</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Fixed</div>
        <div class="kpi-val">${fixedRatio.toFixed(0)}%</div>
        <div class="kpi-sub">of income</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Variable</div>
        <div class="kpi-val">${varRatio.toFixed(0)}%</div>
        <div class="kpi-sub">of income</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Daily avg</div>
        <div class="kpi-val">RM ${fmt0(dailyAvg)}</div>
        <div class="kpi-sub">variable only</div>
      </div>
    </div>
    <div class="kpi-bills${allPaid ? ' all-paid' : ''}">
      <div class="kpi-bills-row">
        <span class="kpi-bills-label">Bills paid this period</span>
        <span class="kpi-bills-count">${paidCount} / ${totalItems}</span>
      </div>
      <div class="kpi-bills-track">
        <div class="kpi-bills-fill" style="width:${billsPct.toFixed(1)}%"></div>
      </div>
    </div>`;
  body.appendChild(section);
}

// ── Section 2: Trend Chart ─────────────────────────────────────────────────────

function renderTrendChart(body, { monthly }) {
  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Income vs Spending · 12 months</span>';

  const wrap   = document.createElement('div');
  wrap.className = 'insights-chart-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);
  body.appendChild(section);

  const labels       = monthly.map(m => MONTH_SHORT[m.month - 1]);
  const incomeData   = monthly.map(m => m.income);
  const fixedData    = monthly.map(m => m.fixed);
  const variableData = monthly.map(m => m.variable);
  const netData      = monthly.map(m => m.net);

  // Spike: variable > 120% of prior 5-month rolling avg → coral
  const varBg = variableData.map((v, i) => {
    if (i < 5) return C.AMBER;
    const avg = variableData.slice(i - 5, i).reduce((s, x) => s + x, 0) / 5;
    return avg > 0 && v > avg * 1.2 ? C.SPIKE : C.AMBER;
  });

  if (_chart) _chart.destroy();
  _chart = new window.Chart(canvas, {
    data: {
      labels,
      datasets: [
        { type:'bar',  label:'Income',   data:incomeData,   backgroundColor:C.INCOME, stack:'income', borderRadius:3, borderSkipped:false, order:2 },
        { type:'bar',  label:'Fixed',    data:fixedData,    backgroundColor:C.FIXED,  stack:'spend',  borderRadius:0, order:2 },
        { type:'bar',  label:'Variable', data:variableData, backgroundColor:varBg,    stack:'spend',
          borderRadius:{ topLeft:3, topRight:3, bottomLeft:0, bottomRight:0 }, borderSkipped:'bottom', order:2 },
        { type:'line', label:'Net',      data:netData,      borderColor:C.NET, backgroundColor:'transparent',
          borderWidth:2, pointRadius:3, pointBackgroundColor:netData.map(n => n >= 0 ? C.NET : C.SPIKE),
          tension:0.3, order:1, segment:{ borderColor: ctx => ctx.p1.parsed.y < 0 ? C.SPIKE : C.NET } },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ display:true, position:'top', align:'start',
          labels:{ boxWidth:10, boxHeight:10, padding:12,
            font:{ family:"'Plus Jakarta Sans', sans-serif", size:11, weight:'600' }, color:'#8888a0' } },
        tooltip:{ backgroundColor:'rgba(18,18,28,0.90)',
          titleFont:{ family:"'Plus Jakarta Sans', sans-serif", size:12, weight:'700' },
          bodyFont: { family:"'Plus Jakarta Sans', sans-serif", size:12 }, padding:10,
          callbacks:{ label: ctx => { const v=ctx.parsed.y; return ` ${ctx.dataset.label}: ${v<0?'−':''}RM ${fmt(Math.abs(v))}`; } } },
      },
      scales:{
        x:{ grid:{display:false}, border:{display:false},
          ticks:{ font:{family:"'Plus Jakarta Sans', sans-serif", size:10, weight:'600'}, color:'#9898b0' } },
        y:{ beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, border:{display:false},
          ticks:{ font:{family:"'Plus Jakarta Sans', sans-serif", size:10}, color:'#9898b0',
            callback: v => 'RM '+fmt0(v), maxTicksLimit:5 } },
      },
    },
  });
}

// ── Section 3: Category deep dive ─────────────────────────────────────────────

function renderCategorySection(body, { expenses, monthRefs }) {
  const varExp = expenses.filter(e => !e.type || e.type === 'variable');

  const curRef  = monthRefs[monthRefs.length - 1];
  const prevRef = monthRefs[monthRefs.length - 2];
  const curPfx  = `${curRef.year}-${String(curRef.month).padStart(2,'0')}`;
  const prevPfx = `${prevRef.year}-${String(prevRef.month).padStart(2,'0')}`;

  const curCats  = groupByCategory(varExp.filter(e => e.date?.startsWith(curPfx)));
  const prevCats = groupByCategory(varExp.filter(e => e.date?.startsWith(prevPfx)));
  const avg12    = compute12mCatAvg(varExp, monthRefs);

  const allKeys = [...new Set([...Object.keys(curCats), ...Object.keys(prevCats)])];
  const limits  = userSettings.categoryLimits || {};

  const catData = allKeys
    .map(cat => ({
      cat,
      cur:     curCats[cat]  || 0,
      prev:    prevCats[cat] || 0,
      avg12:   avg12[cat]    || 0,
      limit:   limits[cat]   || 0,
      momPct:  prevCats[cat] > 0 ? ((curCats[cat] || 0) - prevCats[cat]) / prevCats[cat] : null,
      above12m: (avg12[cat] || 0) > 0 && (curCats[cat] || 0) > (avg12[cat] || 0) * 1.2,
    }))
    .filter(d => d.cur > 0 || d.prev > 0)
    .sort((a, b) => b.cur - a.cur);

  if (!catData.length) return;

  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Category breakdown · this month</span>';
  body.appendChild(section);

  renderTreemap(section, catData);
  renderTopCategoryBars(section, catData);
}

// ── Treemap ────────────────────────────────────────────────────────────────────

function renderTreemap(section, catData) {
  const wrap   = document.createElement('div');
  wrap.className = 'insights-treemap-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);

  const tree = catData.filter(d => d.cur > 0).map(d => ({
    category: d.cat,
    v:        d.cur,
    momPct:   d.momPct,
    above12m: d.above12m,
  }));

  new window.Chart(canvas, {
    type: 'treemap',
    data: {
      datasets: [{
        tree,
        key:    'v',
        groups: ['category'],
        spacing: 1.5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
        backgroundColor(ctx) {
          if (ctx.type !== 'data') return 'transparent';
          const cat  = ctx.raw.g;
          const item = catData.find(d => d.cat === cat);
          const base = catColor(cat, userSettings.categories);
          if (!item || item.momPct === null) return base;
          // Darker if spend grew, lighter if it shrank
          const deltaL = -Math.min(Math.max(item.momPct * 0.14, -0.11), 0.11);
          return tintOklch(base, deltaL);
        },
        labels: {
          display: true,
          overflow: 'fit',
          formatter(ctx) {
            if (ctx.type !== 'data') return '';
            const cat  = ctx.raw.g;
            const item = catData.find(d => d.cat === cat);
            const flag = item?.above12m ? ' ↑' : '';
            return [abbrev(cat) + flag, 'RM ' + fmt0(ctx.raw.v)];
          },
          color: ['rgba(255,255,255,0.96)', 'rgba(255,255,255,0.72)'],
          font: [
            { family:"'Plus Jakarta Sans', sans-serif", size:11, weight:'700' },
            { family:"'Plus Jakarta Sans', sans-serif", size:10, weight:'500' },
          ],
        },
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(18,18,28,0.90)',
          titleFont: { family:"'Plus Jakarta Sans', sans-serif", size:12, weight:'700' },
          bodyFont:  { family:"'Plus Jakarta Sans', sans-serif", size:12 },
          padding: 10,
          callbacks: {
            title: items => items[0]?.raw?.g || '',
            label(ctx) {
              const cat  = ctx.raw.g;
              const item = catData.find(d => d.cat === cat);
              const lines = [`RM ${fmt(ctx.raw.v)}`];
              if (item?.momPct !== null && item?.momPct !== undefined) {
                const sign = item.momPct >= 0 ? '+' : '−';
                lines.push(`${sign}${Math.abs(item.momPct * 100).toFixed(0)}% vs last month`);
              }
              if (item?.above12m) lines.push('↑ >20% above 12-month avg');
              return lines;
            },
          },
        },
      },
    },
  });
}

// ── Top categories horizontal bar ─────────────────────────────────────────────

function renderTopCategoryBars(section, catData) {
  const top = catData.slice(0, Math.min(8, catData.length));
  if (!top.length) return;

  // Hint label
  const hint = document.createElement('div');
  hint.className = 'insights-bar-hint';
  hint.textContent = 'Tap bar to set spending limit';
  section.appendChild(hint);

  const wrap   = document.createElement('div');
  wrap.className = 'insights-bar-wrap';
  wrap.style.height = `${top.length * 44 + 48}px`;
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);

  const cats     = userSettings.categories;
  const labels   = top.map(d => abbrev(d.cat));
  const catBgs   = top.map(d => catColor(d.cat, cats));

  // Split current bar into within-limit + overspend
  const withinData = top.map(d => d.limit > 0 ? Math.min(d.cur, d.limit) : d.cur);
  const overData   = top.map(d => d.limit > 0 ? Math.max(0, d.cur - d.limit) : 0);
  const prevData   = top.map(d => d.prev);

  const FONT = { family:"'Plus Jakarta Sans', sans-serif" };

  if (_catChart) _catChart.destroy();
  _catChart = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label:           'This month',
          data:            withinData,
          backgroundColor: catBgs,
          borderRadius:    { topLeft:0, topRight:3, bottomLeft:0, bottomRight:3 },
          borderSkipped:   'left',
          stack:           'cur',
        },
        {
          label:           'Over limit',
          data:            overData,
          backgroundColor: C.SPIKE,
          borderRadius:    { topLeft:0, topRight:3, bottomLeft:0, bottomRight:3 },
          borderSkipped:   'left',
          stack:           'cur',
        },
        {
          label:           'Last month',
          data:            prevData,
          backgroundColor: C.PREV,
          borderRadius:    3,
          stack:           'prev',
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode:'index', intersect:false },
      onClick(e, elements) {
        if (!elements.length) return;
        const idx = elements[0].index;
        openCategoryLimitSheet(top[idx].cat);
      },
      plugins: {
        legend: { display:true, position:'top', align:'start',
          labels: { boxWidth:10, boxHeight:10, padding:10,
            font:{ ...FONT, size:11, weight:'600' }, color:'#8888a0',
            filter: item => item.text !== 'Over limit' || overData.some(v => v > 0),
          },
        },
        tooltip: {
          backgroundColor: 'rgba(18,18,28,0.90)',
          titleFont: { ...FONT, size:12, weight:'700' },
          bodyFont:  { ...FONT, size:12 }, padding:10,
          callbacks: {
            label(ctx) {
              const d = top[ctx.dataIndex];
              if (ctx.dataset.label === 'Over limit' && ctx.parsed.x === 0) return null;
              const v = ctx.parsed.x;
              let line = ` ${ctx.dataset.label}: RM ${fmt(v)}`;
              if (ctx.dataset.label === 'This month' && d.limit > 0)
                line += `  (limit RM ${fmt0(d.limit)})`;
              if (ctx.dataset.label === 'Last month' && d.momPct !== null) {
                const sign = d.momPct >= 0 ? '+' : '−';
                line += `  ${sign}${Math.abs(d.momPct * 100).toFixed(0)}%`;
              }
              return line;
            },
          },
        },
      },
      scales: {
        x: { stacked:true, beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, border:{display:false},
          ticks:{ font:{...FONT, size:10}, color:'#9898b0', callback: v => 'RM '+fmt0(v), maxTicksLimit:4 } },
        y: { stacked:true, grid:{display:false}, border:{display:false},
          ticks:{ font:{...FONT, size:11, weight:'600'}, color:'#4a4a60' } },
      },
    },
  });
}

// ── Category limit sheet ───────────────────────────────────────────────────────

function openCategoryLimitSheet(cat) {
  const existing = (userSettings.categoryLimits || {})[cat] || 0;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.48);z-index:200;display:flex;flex-direction:column;justify-content:flex-end;';

  const sheet = document.createElement('div');
  sheet.style.cssText = `background:var(--surface);border-radius:20px 20px 0 0;padding:16px 24px calc(28px + env(safe-area-inset-bottom,0px));`;

  const grabber = document.createElement('div');
  grabber.className = 'export-grabber';

  const titleEl = document.createElement('div');
  titleEl.className = 'sheet-title';
  titleEl.textContent = `${cat} — monthly limit`;

  const field = document.createElement('div');
  field.className = 'field';
  field.style.marginTop = '16px';

  const pfx = document.createElement('span');
  pfx.className = 'field-prefix';
  pfx.textContent = 'RM';

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.inputMode = 'decimal';
  inp.placeholder = '0.00';
  inp.style.fontVariantNumeric = 'tabular-nums';
  if (existing > 0) inp.value = String(existing);
  field.appendChild(pfx);
  field.appendChild(inp);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'cta-btn';
  saveBtn.style.marginTop = '16px';
  saveBtn.textContent = 'Set limit';

  sheet.appendChild(grabber);
  sheet.appendChild(titleEl);
  sheet.appendChild(field);
  sheet.appendChild(saveBtn);

  if (existing > 0) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.style.cssText = 'width:100%;text-align:center;padding:12px;font:inherit;font-size:14px;font-weight:600;color:var(--danger);background:none;border:none;cursor:pointer;margin-top:4px;';
    removeBtn.textContent = 'Remove limit';
    removeBtn.addEventListener('click', () => persistLimit(0));
    sheet.appendChild(removeBtn);
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
    _cache = null;
    initInsights();
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function groupByCategory(exps) {
  const out = {};
  exps.forEach(e => {
    const cat = e.category || 'Other';
    out[cat] = (out[cat] || 0) + e.amount;
  });
  return out;
}

function compute12mCatAvg(varExp, monthRefs) {
  const totals = {};
  monthRefs.forEach(({ year, month }) => {
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    Object.entries(groupByCategory(varExp.filter(e => e.date?.startsWith(prefix)))).forEach(([cat, amt]) => {
      totals[cat] = (totals[cat] || 0) + amt;
    });
  });
  const avg = {};
  Object.keys(totals).forEach(cat => { avg[cat] = totals[cat] / 12; });
  return avg;
}

function tintOklch(colorStr, deltaL) {
  const m = colorStr.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!m) return colorStr;
  const L = Math.max(0.30, Math.min(0.88, parseFloat(m[1]) + deltaL));
  return `oklch(${L.toFixed(3)} ${m[2]} ${m[3]})`;
}

const abbrev = s => s.length > 10 ? s.slice(0, 9) + '.' : s;

// ── Chart colour palette ───────────────────────────────────────────────────────

const C = (() => {
  const s = getComputedStyle(document.documentElement);
  const v = n => s.getPropertyValue(n).trim();
  const a = (c, x) => c.replace(')', ` / ${x})`);
  return {
    INCOME: a(v('--positive'), 0.65),
    FIXED:  a(v('--comp'),     0.75),
    AMBER:  a(v('--accent'),   0.75),
    SPIKE:  a(v('--danger'),   0.75),
    NET:    v('--positive'),
    PREV:   a(v('--ink-3'),    0.30),
  };
})();
