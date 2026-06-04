import { currentUser, userSettings, setUserSettings } from './state.js';
import { fmt, fmt0, catColor, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetMonth, fetchBudgetTemplate, updateUserSettings,
  fetchSavingsPots, fetchPotTransactions, fetchAccounts, fetchAllTransfers } from './db.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _cache  = null;
let _charts = [];          // all Chart.js instances — destroyed together on clear

function destroyCharts() {
  _charts.forEach(c => { try { c.destroy(); } catch (_) {} });
  _charts.length = 0;
}

export function clearInsightsState() {
  _cache = null;
  destroyCharts();
}

// ── Entry point ────────────────────────────────────────────────────────────────

export async function initInsights() {
  const body = document.getElementById('budget-insights-body');
  destroyCharts();
  body.innerHTML = '<div class="insights-loading">Loading insights…</div>';
  try {
    await ensureChartJS();
    await ensureTreemapPlugin();
    const data = await loadData(currentUser.uid);
    body.innerHTML = '';
    renderKPIs(body, data);
    renderTrendChart(body, data);
    renderCategorySection(body, data);
    renderHabitsSection(body, data);
    renderSavingsSection(body, data);
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

  const monthRefs = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthRefs.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const oldest    = monthRefs[0];
  const startDate = `${oldest.year}-${String(oldest.month).padStart(2,'0')}-01`;
  const endDate   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}-31`;

  const [expenses, template, accounts, pots, transfers, potTxns, ...budgetMonths] = await Promise.all([
    fetchExpenses(uid, startDate, endDate),
    fetchBudgetTemplate(uid),
    fetchAccounts(uid).then(r => r || []),
    fetchSavingsPots(uid).then(r => r || []),
    fetchAllTransfers(uid),
    fetchPotTransactions(uid),
    ...monthRefs.map(({ year, month }) => fetchBudgetMonth(uid, year, month)),
  ]);

  const monthly = monthRefs.map(({ year, month }, i) => {
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    const me  = expenses.filter(e => e.date?.startsWith(prefix));
    const bm  = budgetMonths[i];
    const income   = (bm?.income   || []).reduce((s, x) => s + (x.amount || 0), 0);
    const fixed    = me.filter(e => e.type === 'fixed').reduce((s, e) => s + e.amount, 0);
    const variable = me.filter(e => !e.type || e.type === 'variable').reduce((s, e) => s + e.amount, 0);
    return { year, month, income, fixed, variable, net: income - fixed - variable };
  });

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
    expenses, monthRefs, monthly,
    accounts, pots, transfers, potTxns,
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
  const wrap = document.createElement('div');
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

  const varBg = variableData.map((v, i) => {
    if (i < 5) return C.AMBER;
    const avg = variableData.slice(i - 5, i).reduce((s, x) => s + x, 0) / 5;
    return avg > 0 && v > avg * 1.2 ? C.SPIKE : C.AMBER;
  });

  _charts.push(new window.Chart(canvas, {
    data: {
      labels,
      datasets: [
        { type:'bar',  label:'Income',   data:incomeData,   backgroundColor:C.INCOME, stack:'income', borderRadius:3, borderSkipped:false, order:2 },
        { type:'bar',  label:'Fixed',    data:fixedData,    backgroundColor:C.FIXED,  stack:'spend',  borderRadius:0, order:2 },
        { type:'bar',  label:'Variable', data:variableData, backgroundColor:varBg,    stack:'spend',
          borderRadius:{ topLeft:3, topRight:3, bottomLeft:0, bottomRight:0 }, borderSkipped:'bottom', order:2 },
        { type:'line', label:'Net', data:netData, borderColor:C.NET, backgroundColor:'transparent',
          borderWidth:2, pointRadius:3, pointBackgroundColor:netData.map(n => n >= 0 ? C.NET : C.SPIKE),
          tension:0.3, order:1, segment:{ borderColor: ctx => ctx.p1.parsed.y < 0 ? C.SPIKE : C.NET } },
      ],
    },
    options: {
      responsive:true, maintainAspectRatio:false, interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ display:true, position:'top', align:'start',
          labels:{ boxWidth:10, boxHeight:10, padding:12, font:FONT(11,'600'), color:'#8888a0' } },
        tooltip:{ backgroundColor:'rgba(18,18,28,0.90)', titleFont:FONT(12,'700'), bodyFont:FONT(12), padding:10,
          callbacks:{ label: ctx => { const v=ctx.parsed.y; return ` ${ctx.dataset.label}: ${v<0?'−':''}RM ${fmt(Math.abs(v))}`; } } },
      },
      scales:{
        x:{ grid:{display:false}, border:{display:false}, ticks:{ font:FONT(10,'600'), color:'#9898b0' } },
        y:{ beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, border:{display:false},
          ticks:{ font:FONT(10), color:'#9898b0', callback: v => 'RM '+fmt0(v), maxTicksLimit:5 } },
      },
    },
  }));
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
  const limits   = userSettings.categoryLimits || {};

  const catData = [...new Set([...Object.keys(curCats), ...Object.keys(prevCats)])]
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

function renderTreemap(section, catData) {
  const wrap = document.createElement('div');
  wrap.className = 'insights-treemap-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);

  const tree = catData.filter(d => d.cur > 0).map(d => ({
    category: d.cat, v: d.cur, momPct: d.momPct, above12m: d.above12m,
  }));

  _charts.push(new window.Chart(canvas, {
    type: 'treemap',
    data: {
      datasets: [{
        tree, key:'v', groups:['category'], spacing:1.5,
        borderWidth:1, borderColor:'rgba(255,255,255,0.5)',
        backgroundColor(ctx) {
          if (ctx.type !== 'data') return 'transparent';
          const cat  = ctx.raw.g;
          const item = catData.find(d => d.cat === cat);
          const base = catColor(cat, userSettings.categories);
          if (!item || item.momPct === null) return base;
          return tintOklch(base, -Math.min(Math.max(item.momPct * 0.14, -0.11), 0.11));
        },
        labels: {
          display:true, overflow:'fit',
          formatter(ctx) {
            if (ctx.type !== 'data') return '';
            const cat  = ctx.raw.g;
            const item = catData.find(d => d.cat === cat);
            return [abbrev(cat) + (item?.above12m ? ' ↑' : ''), 'RM ' + fmt0(ctx.raw.v)];
          },
          color:['rgba(255,255,255,0.96)','rgba(255,255,255,0.72)'],
          font:[
            { family:"'Plus Jakarta Sans', sans-serif", size:11, weight:'700' },
            { family:"'Plus Jakarta Sans', sans-serif", size:10, weight:'500' },
          ],
        },
      }],
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ backgroundColor:'rgba(18,18,28,0.90)', titleFont:FONT(12,'700'), bodyFont:FONT(12), padding:10,
          callbacks:{
            title: items => items[0]?.raw?.g || '',
            label(ctx) {
              const cat  = ctx.raw.g;
              const item = catData.find(d => d.cat === cat);
              const lines = [`RM ${fmt(ctx.raw.v)}`];
              if (item?.momPct !== null && item?.momPct !== undefined) {
                const s = item.momPct >= 0 ? '+' : '−';
                lines.push(`${s}${Math.abs(item.momPct * 100).toFixed(0)}% vs last month`);
              }
              if (item?.above12m) lines.push('↑ >20% above 12-month avg');
              return lines;
            },
          },
        },
      },
    },
  }));
}

function renderTopCategoryBars(section, catData) {
  const top = catData.slice(0, Math.min(8, catData.length));
  if (!top.length) return;

  const hint = document.createElement('div');
  hint.className = 'insights-bar-hint';
  hint.textContent = 'Tap a bar to set a spending limit';
  section.appendChild(hint);

  const wrap = document.createElement('div');
  wrap.className = 'insights-bar-wrap';
  wrap.style.height = `${top.length * 44 + 48}px`;
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);

  const cats      = userSettings.categories;
  const withinData = top.map(d => d.limit > 0 ? Math.min(d.cur, d.limit) : d.cur);
  const overData   = top.map(d => d.limit > 0 ? Math.max(0, d.cur - d.limit) : 0);
  const prevData   = top.map(d => d.prev);

  _charts.push(new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: top.map(d => abbrev(d.cat)),
      datasets: [
        { label:'This month', data:withinData, backgroundColor:top.map(d => catColor(d.cat, cats)),
          borderRadius:{ topLeft:0, topRight:3, bottomLeft:0, bottomRight:3 }, borderSkipped:'left', stack:'cur' },
        { label:'Over limit', data:overData, backgroundColor:C.SPIKE,
          borderRadius:{ topLeft:0, topRight:3, bottomLeft:0, bottomRight:3 }, borderSkipped:'left', stack:'cur' },
        { label:'Last month', data:prevData, backgroundColor:C.PREV, borderRadius:3, stack:'prev' },
      ],
    },
    options: {
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      onClick(_, elements) {
        if (!elements.length) return;
        openCategoryLimitSheet(top[elements[0].index].cat);
      },
      plugins:{
        legend:{ display:true, position:'top', align:'start',
          labels:{ boxWidth:10, boxHeight:10, padding:10, font:FONT(11,'600'), color:'#8888a0',
            filter: item => item.text !== 'Over limit' || overData.some(v => v > 0) } },
        tooltip:{ backgroundColor:'rgba(18,18,28,0.90)', titleFont:FONT(12,'700'), bodyFont:FONT(12), padding:10,
          callbacks:{
            label(ctx) {
              const d = top[ctx.dataIndex];
              if (ctx.dataset.label === 'Over limit' && ctx.parsed.x === 0) return null;
              let line = ` ${ctx.dataset.label}: RM ${fmt(ctx.parsed.x)}`;
              if (ctx.dataset.label === 'This month' && d.limit > 0) line += `  (limit RM ${fmt0(d.limit)})`;
              if (ctx.dataset.label === 'Last month' && d.momPct !== null) {
                const s = d.momPct >= 0 ? '+' : '−';
                line += `  ${s}${Math.abs(d.momPct * 100).toFixed(0)}%`;
              }
              return line;
            },
          },
        },
      },
      scales:{
        x:{ stacked:true, beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, border:{display:false},
          ticks:{ font:FONT(10), color:'#9898b0', callback: v => 'RM '+fmt0(v), maxTicksLimit:4 } },
        y:{ stacked:true, grid:{display:false}, border:{display:false},
          ticks:{ font:FONT(11,'600'), color:'#4a4a60' } },
      },
    },
  }));
}

// ── Section 4: Habit patterns ─────────────────────────────────────────────────

function renderHabitsSection(body, { expenses, monthRefs }) {
  const varExp = expenses.filter(e => !e.type || e.type === 'variable');
  renderDayOfWeekHeatmap(body, varExp, monthRefs);
  renderCategoryLines(body, varExp, monthRefs);
  renderPaymentFlow(body, expenses, monthRefs);
}

// ── 4a: Day-of-week heatmap ────────────────────────────────────────────────────

function renderDayOfWeekHeatmap(body, varExp, monthRefs) {
  const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // For each month × weekday: avg daily spend (total / count of that weekday in month)
  const grid = monthRefs.map(({ year, month }) => {
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dayCounts = Array(7).fill(0);
    const dayTotals = Array(7).fill(0);

    for (let d = 1; d <= daysInMonth; d++) {
      dayCounts[(new Date(year, month - 1, d).getDay() + 6) % 7]++;
    }
    varExp.filter(e => e.date?.startsWith(prefix)).forEach(e => {
      const dd = parseInt(e.date.slice(8), 10);
      const di = (new Date(year, month - 1, dd).getDay() + 6) % 7;
      dayTotals[di] += e.amount;
    });

    return {
      label: MONTH_SHORT[month - 1],
      days:  dayCounts.map((cnt, i) => cnt > 0 ? dayTotals[i] / cnt : 0),
    };
  });

  const allValues = grid.flatMap(r => r.days);
  const maxVal    = Math.max(...allValues, 1);

  // Weekend vs weekday insight
  let wkdayTotal = 0, wkendTotal = 0, wkdayCnt = 0, wkendCnt = 0;
  monthRefs.forEach(({ year, month }) => {
    for (let d = 1; d <= new Date(year, month, 0).getDate(); d++) {
      const di = (new Date(year, month - 1, d).getDay() + 6) % 7;
      if (di < 5) wkdayCnt++; else wkendCnt++;
    }
  });
  varExp.forEach(e => {
    if (!e.date) return;
    const [y, m, d] = e.date.split('-').map(Number);
    const di = (new Date(y, m - 1, d).getDay() + 6) % 7;
    if (di < 5) wkdayTotal += e.amount; else wkendTotal += e.amount;
  });
  const wkdayAvg = wkdayCnt > 0 ? wkdayTotal / wkdayCnt : 0;
  const wkendAvg = wkendCnt > 0 ? wkendTotal / wkendCnt : 0;
  const ratio    = wkdayAvg > 0 ? wkendAvg / wkdayAvg : 0;

  // Accent colour components for inline opacity tinting
  const { L: aL, C: aC, H: aH } = ACCENT_OKLCH;

  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Spending by day of week</span>';

  // Insight callout
  if (wkdayAvg > 0 || wkendAvg > 0) {
    const ins = document.createElement('div');
    ins.className = 'heatmap-insight';
    if (ratio >= 1.1) {
      ins.textContent = `You spend ${ratio.toFixed(1)}× more per day on weekends than weekdays`;
    } else if (ratio < 0.9 && ratio > 0) {
      ins.textContent = `Weekdays drive most of your spending — weekends are ${(1/ratio).toFixed(1)}× lower`;
    } else {
      ins.textContent = `Your spending is fairly even across the week`;
    }
    section.appendChild(ins);
  }

  // Grid
  const gridWrap = document.createElement('div');
  gridWrap.className = 'heatmap-wrap';

  // Header row
  const hdr = document.createElement('div');
  hdr.className = 'heatmap-row heatmap-header';
  const emptyLbl = document.createElement('div');
  emptyLbl.className = 'heatmap-ml';
  hdr.appendChild(emptyLbl);
  DAY_LABELS.forEach((d, di) => {
    const dh = document.createElement('div');
    dh.className = 'heatmap-dh' + (di >= 5 ? ' wkend' : '');
    dh.textContent = d;
    hdr.appendChild(dh);
  });
  gridWrap.appendChild(hdr);

  // Data rows
  grid.forEach(({ label, days }) => {
    const row = document.createElement('div');
    row.className = 'heatmap-row';

    const ml = document.createElement('div');
    ml.className = 'heatmap-ml';
    ml.textContent = label;
    row.appendChild(ml);

    days.forEach((val, di) => {
      const cell = document.createElement('div');
      cell.className = 'heatmap-cell' + (di >= 5 ? ' wkend' : '');
      const opacity = val > 0 ? Math.max(0.08, val / maxVal) : 0;
      // weekend cells use slightly deeper shade
      const cellL = di >= 5 ? aL * 0.86 : aL;
      cell.style.backgroundColor = opacity > 0
        ? `oklch(${cellL.toFixed(3)} ${aC} ${aH} / ${opacity.toFixed(3)})`
        : 'transparent';
      if (val > 0) cell.setAttribute('title', `RM ${fmt0(val)}/day avg`);
      row.appendChild(cell);
    });

    gridWrap.appendChild(row);
  });

  section.appendChild(gridWrap);
  body.appendChild(section);
}

// ── 4b: 12-month per-category lines ───────────────────────────────────────────

function renderCategoryLines(body, varExp, monthRefs) {
  // Top 6 categories by total 12-month spend
  const catTotals = groupByCategory(varExp);
  const top6 = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);

  if (!top6.length) return;

  // Monthly totals per category
  const catMonthly = {};
  top6.forEach(cat => {
    catMonthly[cat] = monthRefs.map(({ year, month }) => {
      const prefix = `${year}-${String(month).padStart(2,'0')}`;
      return varExp
        .filter(e => (e.category || 'Other') === cat && e.date?.startsWith(prefix))
        .reduce((s, e) => s + e.amount, 0);
    });
  });

  // Creeping: last-3-months avg > first-3-months avg by >20%
  const isTrending = cat => {
    const d = catMonthly[cat];
    const f3 = d.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
    const l3 = d.slice(-3).reduce((s, v) => s + v, 0) / 3;
    return f3 > 0 && l3 > f3 * 1.2;
  };

  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Category trends · 12 months</span>';
  const wrap   = document.createElement('div');
  wrap.className = 'insights-chart-wrap';
  wrap.style.height = '260px';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);
  body.appendChild(section);

  _charts.push(new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: monthRefs.map(r => MONTH_SHORT[r.month - 1]),
      datasets: top6.map(cat => {
        const data     = catMonthly[cat];
        const base     = catColor(cat, userSettings.categories);
        const trending = isTrending(cat);

        // Larger point + spike colour where value > 150% of prior 3-month avg
        const pointR = data.map((v, i) => {
          if (i < 3) return 2;
          const avg3 = data.slice(i - 3, i).reduce((s, x) => s + x, 0) / 3;
          return avg3 > 0 && v > avg3 * 1.5 ? 6 : 2;
        });
        const pointBg = data.map((v, i) => {
          if (i < 3) return base;
          const avg3 = data.slice(i - 3, i).reduce((s, x) => s + x, 0) / 3;
          return avg3 > 0 && v > avg3 * 1.5 ? C.SPIKE : base;
        });

        return {
          label: abbrev(cat) + (trending ? ' ↑' : ''),
          data, borderColor:base, backgroundColor:'transparent',
          borderWidth:2, pointRadius:pointR, pointBackgroundColor:pointBg, tension:0.3,
        };
      }),
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:'index', intersect:false },
      plugins:{
        legend:{ display:true, position:'top', align:'start',
          labels:{ boxWidth:20, boxHeight:2, padding:10, font:FONT(11,'600'), color:'#4a4a60' } },
        tooltip:{ backgroundColor:'rgba(18,18,28,0.90)', titleFont:FONT(12,'700'), bodyFont:FONT(12), padding:10,
          callbacks:{
            label: ctx => ` ${ctx.dataset.label.replace(' ↑','')}: RM ${fmt(ctx.parsed.y)}`,
          },
        },
      },
      scales:{
        x:{ grid:{display:false}, border:{display:false}, ticks:{ font:FONT(10,'600'), color:'#9898b0' } },
        y:{ beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, border:{display:false},
          ticks:{ font:FONT(10), color:'#9898b0', callback: v => 'RM '+fmt0(v), maxTicksLimit:5 } },
      },
    },
  }));
}

// ── 4c: Payment method flow table ─────────────────────────────────────────────

function renderPaymentFlow(body, expenses, monthRefs) {
  const curRef = monthRefs[monthRefs.length - 1];
  const curPfx = `${curRef.year}-${String(curRef.month).padStart(2,'0')}`;
  const curExp = expenses.filter(e => e.date?.startsWith(curPfx) && e.type !== 'income');

  if (!curExp.length) return;

  const methods = [...new Set(curExp.map(e => e.paymentMethod).filter(Boolean))];
  if (!methods.length) return;

  // Top 4 categories by spend
  const catTotals = {};
  curExp.forEach(e => { const c = e.category||'Other'; catTotals[c] = (catTotals[c]||0)+e.amount; });
  const top4 = Object.entries(catTotals).sort((a,b) => b[1]-a[1]).slice(0,4).map(([c]) => c);

  // Build matrix
  const matrix = {};
  methods.forEach(m => {
    const mExp = curExp.filter(e => e.paymentMethod === m);
    matrix[m] = { _total: mExp.reduce((s,e) => s+e.amount, 0) };
    top4.forEach(cat => {
      matrix[m][cat] = mExp.filter(e=>(e.category||'Other')===cat).reduce((s,e)=>s+e.amount,0);
    });
  });

  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Where each account spent · this month</span>';

  const scroll = document.createElement('div');
  scroll.style.cssText = 'overflow-x:auto;-webkit-overflow-scrolling:touch;';

  const table = document.createElement('table');
  table.className = 'flow-table';

  // Header
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Account', ...top4.map(c => abbrev(c)), 'Total'].forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.textAlign = i === 0 ? 'left' : 'right';
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement('tbody');
  methods.forEach(m => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = abbrev(m, 13);
    nameTd.style.fontWeight = '600';
    nameTd.style.color = 'var(--ink)';
    tr.appendChild(nameTd);

    top4.forEach(cat => {
      const td  = document.createElement('td');
      const val = matrix[m][cat] || 0;
      td.textContent = val > 0 ? `RM ${fmt0(val)}` : '—';
      td.style.textAlign = 'right';
      td.style.color = val > 0 ? 'var(--ink)' : 'var(--ink-3)';
      tr.appendChild(td);
    });

    const totTd = document.createElement('td');
    totTd.textContent = `RM ${fmt0(matrix[m]._total)}`;
    totTd.style.cssText = 'text-align:right;font-weight:700;color:var(--ink)';
    tr.appendChild(totTd);

    tbody.appendChild(tr);
  });

  // Totals row
  const totTr = document.createElement('tr');
  totTr.className = 'flow-total-row';
  const lbl = document.createElement('td');
  lbl.textContent = 'Total';
  lbl.style.fontWeight = '700';
  totTr.appendChild(lbl);

  top4.forEach(cat => {
    const td  = document.createElement('td');
    const val = methods.reduce((s, m) => s + (matrix[m][cat]||0), 0);
    td.textContent = `RM ${fmt0(val)}`;
    td.style.cssText = 'text-align:right;font-weight:700;';
    totTr.appendChild(td);
  });

  const grand = document.createElement('td');
  grand.textContent = `RM ${fmt0(methods.reduce((s,m) => s+matrix[m]._total, 0))}`;
  grand.style.cssText = 'text-align:right;font-weight:800;color:var(--accent-ink);';
  totTr.appendChild(grand);

  tbody.appendChild(totTr);
  table.appendChild(tbody);
  scroll.appendChild(table);
  section.appendChild(scroll);
  body.appendChild(section);
}

// ── Section 5: Savings trajectory ─────────────────────────────────────────────

function renderSavingsSection(body, { pots, potTxns, accounts, expenses, transfers, monthRefs }) {
  if (!pots?.length && !accounts?.length) return;
  if (pots?.length)    renderPotCards(body, pots, potTxns, monthRefs);
  if (pots?.length)    renderContributionChart(body, pots, potTxns, monthRefs);
  if (accounts?.length) renderNetWorthChart(body, { accounts, expenses, transfers, potTxns, pots, monthRefs });
}

// ── 5a: Pot progress cards ─────────────────────────────────────────────────────

function renderPotCards(body, pots, potTxns, monthRefs) {
  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Savings goals</span>';

  const grid = document.createElement('div');
  grid.className = 'pot-grid';

  pots.forEach(pot => {
    const pct  = pot.targetAmount > 0 ? Math.min((pot.currentBalance || 0) / pot.targetAmount, 1) : 0;
    const proj = projectCompletion(pot, potTxns);
    const card = document.createElement('div');
    card.className = 'pot-card';

    const gaugeWrap = document.createElement('div');
    gaugeWrap.className = 'pot-gauge';
    gaugeWrap.innerHTML = buildGaugeSVG(pct, pot.colour || 'var(--accent)');
    card.appendChild(gaugeWrap);

    const nameEl = document.createElement('div');
    nameEl.className = 'pot-name';
    nameEl.textContent = pot.name;
    card.appendChild(nameEl);

    const balEl = document.createElement('div');
    balEl.className = 'pot-bal';
    balEl.textContent = `RM ${fmt0(pot.currentBalance || 0)} / ${fmt0(pot.targetAmount || 0)}`;
    card.appendChild(balEl);

    if (proj.done) {
      const doneEl = document.createElement('div');
      doneEl.className = 'pot-eta done';
      doneEl.textContent = '✓ Goal reached';
      card.appendChild(doneEl);
    } else if (proj.noRecent) {
      const etaEl = document.createElement('div');
      etaEl.className = 'pot-eta muted';
      etaEl.textContent = 'No recent contributions';
      card.appendChild(etaEl);
    } else {
      const etaEl = document.createElement('div');
      etaEl.className = 'pot-eta';
      etaEl.textContent = `~${proj.monthsLeft} mo. to goal`;
      card.appendChild(etaEl);
    }

    if (!proj.done && proj.noContrib) {
      const alertEl = document.createElement('div');
      alertEl.className = 'pot-alert';
      alertEl.textContent = '⚠ Nothing added this month';
      card.appendChild(alertEl);
    }

    grid.appendChild(card);
  });

  section.appendChild(grid);
  body.appendChild(section);
}

function buildGaugeSVG(pct, color) {
  const r = 36, cx = 50, cy = 52;
  const arc  = Math.PI * r;
  const fill = pct * arc;
  const lbl  = Math.round(pct * 100);
  return `<svg viewBox="0 0 100 56" width="90" height="50" aria-hidden="true">
    <path d="M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}"
      fill="none" stroke="var(--line-2)" stroke-width="7" stroke-linecap="round"/>
    <path d="M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}"
      fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"
      stroke-dasharray="${fill.toFixed(1)} ${arc.toFixed(1)}"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle"
      font-size="14" font-weight="800" fill="var(--ink)"
      font-family="'Plus Jakarta Sans', sans-serif">${lbl}%</text>
  </svg>`;
}

function projectCompletion(pot, potTxns) {
  const remaining = (pot.targetAmount || 0) - (pot.currentBalance || 0);
  if (remaining <= 0) return { done: true };

  const now     = new Date();
  const contribs = (potTxns || []).filter(t => t.potId === pot.id && t.type === 'contribute');

  // Avg monthly contribution over last 3 months
  let total3 = 0;
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const pfx = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}`;
    total3 += contribs.filter(t => t.date?.startsWith(pfx)).reduce((s, t) => s + t.amount, 0);
  }
  const avgMonthly = total3 / 3;

  const curPfx    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2,'0')}`;
  const noContrib = !contribs.some(t => t.date?.startsWith(curPfx));

  if (avgMonthly <= 0) return { done: false, noRecent: true, noContrib };

  return { done: false, monthsLeft: Math.ceil(remaining / avgMonthly), noContrib };
}

// ── 5b: Contribution history chart ────────────────────────────────────────────

function renderContributionChart(body, pots, potTxns, monthRefs) {
  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Monthly contributions · 12 months</span>';
  const wrap = document.createElement('div');
  wrap.className = 'insights-chart-wrap';
  wrap.style.height = '160px';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);
  body.appendChild(section);

  _charts.push(new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels: monthRefs.map(r => MONTH_SHORT[r.month - 1]),
      datasets: pots.map(pot => ({
        label: abbrev(pot.name),
        data: monthRefs.map(({ year, month }) => {
          const pfx = `${year}-${String(month).padStart(2,'0')}`;
          return (potTxns || [])
            .filter(t => t.potId === pot.id && t.date?.startsWith(pfx))
            .reduce((s, t) => t.type === 'contribute' ? s + t.amount : s - t.amount, 0);
        }),
        backgroundColor: pot.colour || C.AMBER,
        borderRadius: 2,
        stack: 'pots',
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: pots.length > 1, position: 'top', align: 'start',
          labels: { boxWidth: 10, boxHeight: 10, padding: 10, font: FONT(11,'600'), color: '#8888a0' } },
        tooltip: { backgroundColor: 'rgba(18,18,28,0.90)', titleFont: FONT(12,'700'), bodyFont: FONT(12), padding: 10,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y >= 0 ? '' : '−'}RM ${fmt(Math.abs(ctx.parsed.y))}` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { display: false },
          ticks: { font: FONT(10,'600'), color: '#9898b0' } },
        y: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false },
          ticks: { font: FONT(10), color: '#9898b0', callback: v => 'RM ' + fmt0(v), maxTicksLimit: 4 } },
      },
    },
  }));
}

// ── 5c: Net worth trajectory ───────────────────────────────────────────────────

function renderNetWorthChart(body, { accounts, expenses, transfers, potTxns, pots, monthRefs }) {
  const section = document.createElement('section');
  section.innerHTML = '<span class="block-label">Net worth · 12 months</span>';

  const monthEnds = monthRefs.map(({ year, month }) => {
    const last = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  });

  // Balance per account per month-end
  const accHistory = (accounts || []).map(acc => ({
    acc,
    data: monthEnds.map(d => computeAccBalance(acc, expenses, transfers, potTxns, d)),
  }));

  // Savings pots total — reconstruct backwards from currentBalance
  const potsHistory = monthEnds.map(endDate =>
    (pots || []).reduce((total, pot) => {
      let bal = pot.currentBalance || 0;
      (potTxns || [])
        .filter(t => t.potId === pot.id && t.date > endDate)
        .forEach(t => { bal += t.type === 'contribute' ? -t.amount : t.amount; });
      return total + Math.max(0, bal);
    }, 0)
  );

  // Trend annotation
  const sumFirst = accHistory.reduce((s, a) => s + a.data[0], 0) + potsHistory[0];
  const sumLast  = accHistory.reduce((s, a) => s + a.data[11], 0) + potsHistory[11];
  const growth   = sumLast - sumFirst;
  if (growth !== 0 && sumFirst !== 0) {
    const growthPct = Math.abs(growth / sumFirst * 100);
    const trend = document.createElement('div');
    trend.className = 'heatmap-insight';
    const sign = growth >= 0 ? '+' : '−';
    trend.textContent = `Net worth ${growth >= 0 ? 'grew' : 'declined'} ${sign}RM ${fmt0(Math.abs(growth))} over 12 months (${sign}${growthPct.toFixed(0)}%)`;
    section.appendChild(trend);
  }

  const wrap = document.createElement('div');
  wrap.className = 'insights-chart-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  section.appendChild(wrap);
  body.appendChild(section);

  const datasets = [
    ...accHistory.map((a, i) => ({
      label: abbrev(a.acc.name),
      data: a.data,
      backgroundColor: AREA_FILLS[i % AREA_FILLS.length],
      borderColor:     AREA_BORDERS[i % AREA_BORDERS.length],
      borderWidth: 1.5,
      fill: true,
      stack: 'accounts',
      tension: 0.3,
      pointRadius: 2,
    })),
    ...(pots?.length ? [{
      label: 'Savings pots',
      data: potsHistory,
      borderColor: C.NET,
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [4, 3],
      fill: false,
      tension: 0.3,
      pointRadius: 2,
    }] : []),
  ];

  _charts.push(new window.Chart(canvas, {
    type: 'line',
    data: { labels: monthRefs.map(r => MONTH_SHORT[r.month - 1]), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: true, position: 'top', align: 'start',
          labels: { boxWidth: 12, boxHeight: 10, padding: 10, font: FONT(11,'600'), color: '#8888a0' } },
        tooltip: { backgroundColor: 'rgba(18,18,28,0.90)', titleFont: FONT(12,'700'), bodyFont: FONT(12), padding: 10,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: RM ${fmt(ctx.parsed.y)}` } },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false },
          ticks: { font: FONT(10,'600'), color: '#9898b0' } },
        y: { stacked: true, grid: { color: 'rgba(0,0,0,0.05)' }, border: { display: false },
          ticks: { font: FONT(10), color: '#9898b0', callback: v => 'RM ' + fmt0(v), maxTicksLimit: 5 } },
      },
    },
  }));
}

function computeAccBalance(account, expenses, transfers, potTxns, upToDate) {
  let bal = account.openingBalance || 0;
  const name = account.name;
  const id   = account.id;

  (expenses || []).forEach(e => {
    if (e.date > upToDate) return;
    if (e.isIncome && e.paymentMethod === name)                                   bal += e.amount;
    else if ((!e.type || e.type === 'variable' || e.type === 'fixed') && e.paymentMethod === name) bal -= e.amount;
  });
  (transfers || []).forEach(t => {
    if (t.date > upToDate) return;
    if (t.toAccountId   === id) bal += t.amount;
    if (t.fromAccountId === id) bal -= t.amount;
  });
  (potTxns || []).forEach(p => {
    if (p.date > upToDate || p.linkedAccountId !== id) return;
    if (p.type === 'contribute') bal -= p.amount;
    else                         bal += p.amount;
  });

  return bal;
}

// ── Category limit sheet ───────────────────────────────────────────────────────

function openCategoryLimitSheet(cat) {
  const existing = (userSettings.categoryLimits || {})[cat] || 0;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.48);z-index:200;display:flex;flex-direction:column;justify-content:flex-end;';

  const sheet = document.createElement('div');
  sheet.style.cssText = 'background:var(--surface);border-radius:20px 20px 0 0;padding:16px 24px calc(28px + env(safe-area-inset-bottom,0px));';

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
  inp.type = 'text'; inp.inputMode = 'decimal'; inp.placeholder = '0.00';
  inp.style.fontVariantNumeric = 'tabular-nums';
  if (existing > 0) inp.value = String(existing);
  field.appendChild(pfx); field.appendChild(inp);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button'; saveBtn.className = 'cta-btn';
  saveBtn.style.marginTop = '16px'; saveBtn.textContent = 'Set limit';

  sheet.appendChild(grabber); sheet.appendChild(titleEl);
  sheet.appendChild(field);  sheet.appendChild(saveBtn);

  if (existing > 0) {
    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.style.cssText = 'width:100%;text-align:center;padding:12px;font:inherit;font-size:14px;font-weight:600;color:var(--danger);background:none;border:none;cursor:pointer;margin-top:4px;';
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
    _cache = null;
    initInsights();
  }
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function groupByCategory(exps) {
  const out = {};
  exps.forEach(e => { const c = e.category||'Other'; out[c] = (out[c]||0)+e.amount; });
  return out;
}

function compute12mCatAvg(varExp, monthRefs) {
  const totals = {};
  monthRefs.forEach(({ year, month }) => {
    const prefix = `${year}-${String(month).padStart(2,'0')}`;
    Object.entries(groupByCategory(varExp.filter(e => e.date?.startsWith(prefix))))
      .forEach(([cat, amt]) => { totals[cat] = (totals[cat]||0)+amt; });
  });
  const avg = {};
  Object.keys(totals).forEach(c => { avg[c] = totals[c] / 12; });
  return avg;
}

function tintOklch(colorStr, deltaL) {
  const m = colorStr.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  if (!m) return colorStr;
  const L = Math.max(0.30, Math.min(0.88, parseFloat(m[1]) + deltaL));
  return `oklch(${L.toFixed(3)} ${m[2]} ${m[3]})`;
}

const abbrev = (s, max = 10) => s.length > max ? s.slice(0, max - 1) + '.' : s;

// ── Chart helpers & palette ────────────────────────────────────────────────────

const FONT = (size, weight = '500') => ({ family:"'Plus Jakarta Sans', sans-serif", size, weight });

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

const AREA_FILLS   = [
  'oklch(0.58 0.13 145 / 0.22)',
  'oklch(0.84 0.18 86  / 0.22)',
  'oklch(0.72 0.14 55  / 0.22)',
  'oklch(0.55 0.16 25  / 0.18)',
];
const AREA_BORDERS = [
  'oklch(0.58 0.13 145)',
  'oklch(0.84 0.18 86)',
  'oklch(0.72 0.14 55)',
  'oklch(0.55 0.16 25)',
];

const ACCENT_OKLCH = (() => {
  const m = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent').trim()
    .match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/);
  return m ? { L:parseFloat(m[1]), C:parseFloat(m[2]), H:parseFloat(m[3]) } : { L:0.84, C:0.18, H:86 };
})();
