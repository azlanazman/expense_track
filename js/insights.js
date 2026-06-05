import { currentUser, userSettings, setUserSettings } from './state.js';
import { fmt, fmt0, catColor, escapeHtml,
  salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetMonth, fetchBudgetTemplate, updateUserSettings,
  fetchSavingsPots, fetchPotTransactions, fetchAccounts, fetchAllTransfers } from './db.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _cache  = null;
let _charts = [];

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
    renderHero(body, data);
    renderLensSwitcher(body, data);
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

  const sp = salaryPeriodMonth(sd);
  const periodRefs = [];
  for (let i = 11; i >= 0; i--) {
    let year = sp.year, month = sp.month - i;
    while (month <= 0) { month += 12; year--; }
    const start = salaryStartForMonth(sd, year, month);
    const end   = salaryEndForMonth(sd, year, month);
    periodRefs.push({ year, month, start, end });
  }

  const startDate = periodRefs[0].start;
  const endDate   = periodRefs[11].end;

  const [expenses, template, accounts, pots, transfers, potTxns, ...budgetMonths] = await Promise.all([
    fetchExpenses(uid, startDate, endDate),
    fetchBudgetTemplate(uid),
    fetchAccounts(uid).then(r => r || []),
    fetchSavingsPots(uid).then(r => r || []),
    fetchAllTransfers(uid),
    fetchPotTransactions(uid),
    ...periodRefs.map(({ year, month }) => fetchBudgetMonth(uid, year, month)),
  ]);

  const monthly = periodRefs.map(({ year, month, start, end }, i) => {
    const bm = budgetMonths[i];
    const pe = expenses.filter(e => e.date >= start && e.date <= end);
    const income   = (bm?.income   || []).reduce((s, x) => s + (x.amount || 0), 0);
    const fixed    = pe.filter(e => e.type === 'fixed').reduce((s, e) => s + e.amount, 0);
    const variable = pe.filter(e => !e.type || e.type === 'variable').reduce((s, e) => s + e.amount, 0);
    return { year, month, start, end, income, fixed, variable, net: income - fixed - variable };
  });

  const curPeriod = periodRefs[11];
  const spExp     = expenses.filter(e => e.date >= curPeriod.start && e.date <= curPeriod.end);
  const curBM     = budgetMonths[11];

  const incomeTotal   = (curBM?.income || []).reduce((s, x) => s + (x.amount || 0), 0);
  const fixedTotal    = spExp.filter(e => e.type === 'fixed').reduce((s, e) => s + e.amount, 0);
  const variableTotal = spExp.filter(e => !e.type || e.type === 'variable').reduce((s, e) => s + e.amount, 0);
  const netBalance    = incomeTotal - fixedTotal - variableTotal;

  const spStartDt   = new Date(curPeriod.start + 'T00:00:00');
  const daysElapsed = Math.max(1, Math.round((now - spStartDt) / 86_400_000) + 1);

  const templateItemIds = new Set(template?.groups?.flatMap(g => g.items.map(i => i.id)) || []);
  const activePayments  = (curBM?.payments || []).filter(p => templateItemIds.has(p.itemId));
  const paidCount  = activePayments.filter(p => p.paid).length;
  const totalItems = templateItemIds.size;

  const prevM    = monthly[monthly.length - 2];
  const netDelta = prevM ? netBalance - prevM.net : null;

  const p      = curPeriod;
  const sDt    = new Date(p.start + 'T00:00:00');
  const eDt    = new Date(p.end   + 'T00:00:00');
  const fmtDt  = d => `${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
  const periodLabel = `${fmtDt(sDt)} – ${fmtDt(eDt)}`;

  _cache = {
    expenses, periodRefs, monthly,
    accounts, pots, transfers, potTxns,
    kpi: {
      netBalance, netDelta,
      savingsRate: incomeTotal > 0 ? (netBalance    / incomeTotal) * 100 : 0,
      fixedRatio:  incomeTotal > 0 ? (fixedTotal    / incomeTotal) * 100 : 0,
      varRatio:    incomeTotal > 0 ? (variableTotal / incomeTotal) * 100 : 0,
      dailyAvg:    variableTotal / daysElapsed,
      paidCount,   totalItems,
      periodLabel,
    },
  };
  return _cache;
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function makeBlock(label) {
  const block = document.createElement('div');
  block.className = 'ins-block';
  if (label) {
    const lbl = document.createElement('span');
    lbl.className = 'block-label';
    lbl.textContent = label;
    block.appendChild(lbl);
  }
  return block;
}

function summaryPill(tone, innerHTML) {
  const div = document.createElement('div');
  div.className = `summary ${tone}`;
  const spark = document.createElement('span');
  spark.className = 'sum-spark';
  const text = document.createElement('span');
  text.className = 'sum-text';
  text.innerHTML = innerHTML;
  div.appendChild(spark);
  div.appendChild(text);
  return div;
}

function makeDetailsExpander(label) {
  const wrap = document.createElement('div');
  wrap.className = 'details';

  const hdr = document.createElement('button');
  hdr.type = 'button';
  hdr.className = 'details-h';
  hdr.innerHTML = `<span>${escapeHtml(label)}</span><span class="details-chev">⌄</span>`;

  const body = document.createElement('div');
  body.className = 'details-body';
  body.style.display = 'none';

  let renderFn = null;
  let rendered = false;

  hdr.addEventListener('click', () => {
    const open = !wrap.classList.contains('open');
    wrap.classList.toggle('open', open);
    body.style.display = open ? '' : 'none';
    if (open && !rendered && renderFn) {
      rendered = true;
      renderFn(body);
    }
  });

  wrap.appendChild(hdr);
  wrap.appendChild(body);
  wrap.setContent = fn => { renderFn = fn; };
  return wrap;
}

// ── Narrative copy ─────────────────────────────────────────────────────────────

function heroVerdict(kpi) {
  const sr = kpi.savingsRate;
  if (sr >= 20) return { pill: 'On track', tone: 'good', line: `Saving ${Math.round(sr)}% of income — comfortably above your 20% goal.` };
  if (sr >= 10) return { pill: 'Watch',    tone: 'warn', line: `Saving ${Math.round(sr)}% — okay, but variable spend is creeping up.` };
  return           { pill: 'Over',     tone: 'bad',  line: `Only ${Math.round(sr)}% saved this period — spending is running hot.` };
}

function buildSpendingSummary({ expenses, periodRefs, monthly }) {
  const curM   = monthly[11];
  const varAvg = monthly.reduce((s, m) => s + m.variable, 0) / 12;
  const varVsAvg = varAvg > 0 ? (curM.variable - varAvg) / varAvg : 0;
  const varExp = expenses.filter(e => !e.type || e.type === 'variable');
  const { start, end } = periodRefs[11];
  const curCats = groupByCategory(varExp.filter(e => e.date >= start && e.date <= end));
  const topCats = Object.entries(curCats).sort((a, b) => b[1] - a[1]);
  const pctStr  = (varVsAvg >= 0 ? '+' : '') + Math.round(varVsAvg * 100) + '%';
  let html = `Variable spend <b>RM ${fmt0(curM.variable)}</b> — ${pctStr} vs your 12-period average.`;
  if (varVsAvg > 0.05 && topCats.length >= 2) {
    html += ` <b>${escapeHtml(topCats[0][0])}</b> and <b>${escapeHtml(topCats[1][0])}</b> drove the rise.`;
  }
  return html;
}

function buildHabitsSummary(wkdayAvg, wkendAvg) {
  if (wkdayAvg === 0 && wkendAvg === 0) return 'No spending data for habit analysis yet.';
  const ratio = wkdayAvg > 0 ? wkendAvg / wkdayAvg : 0;
  if (ratio >= 1.1) return `You spend <b>${Math.round((ratio - 1) * 100)}% more on weekends</b> than weekdays. Friday–Sunday is where the variable budget goes.`;
  if (ratio < 0.9 && ratio > 0) return `Weekdays drive most of your spending — weekends are <b>${Math.round((1 / ratio - 1) * 100)}% lower</b>.`;
  return 'Your spending is <b>fairly even</b> across the week.';
}

function buildSavingsSummary({ pots, potTxns, accounts, expenses, transfers, periodRefs }) {
  const dates    = periodRefs.map(r => r.end);
  const accFirst = (accounts || []).reduce((s, a) => s + computeAccBalance(a, expenses, transfers, potTxns, dates[0]),  0);
  const accLast  = (accounts || []).reduce((s, a) => s + computeAccBalance(a, expenses, transfers, potTxns, dates[11]), 0);
  const potsFirst = (pots || []).reduce((total, pot) => {
    let bal = pot.currentBalance || 0;
    (potTxns || []).filter(t => t.potId === pot.id && t.date > dates[0])
      .forEach(t => { bal += t.type === 'contribute' ? -t.amount : t.amount; });
    return total + Math.max(0, bal);
  }, 0);
  const potsLast = (pots || []).reduce((s, p) => s + Math.max(0, p.currentBalance || 0), 0);
  const growth   = (accLast + potsLast) - (accFirst + potsFirst);
  const base     = accFirst + potsFirst;
  const growthPct = base > 0 ? Math.abs(growth / base * 100) : 0;
  const needAttention = (pots || []).filter(p => {
    const proj = projectCompletion(p, potTxns, periodRefs);
    return !proj.done && proj.noContrib;
  }).length;
  const sign = growth >= 0 ? '+' : '−';
  let html = `Net worth <b>${sign}RM ${fmt0(Math.abs(growth))}</b> (${sign}${growthPct.toFixed(0)}%) over 12 periods.`;
  if (needAttention > 0) html += ` ${needAttention} pot${needAttention > 1 ? 's' : ''} need${needAttention > 1 ? '' : 's'} attention.`;
  return html;
}

// ── Hero block ─────────────────────────────────────────────────────────────────

function renderHero(body, { kpi }) {
  const { netBalance, netDelta, savingsRate, fixedRatio, varRatio, dailyAvg, paidCount, totalItems, periodLabel } = kpi;
  const verdict  = heroVerdict(kpi);
  const isNeg    = netBalance < 0;
  const netClr   = isNeg ? 'var(--danger-ink)' : 'var(--positive-ink)';
  const billsPct = totalItems > 0 ? (paidCount / totalItems) * 100 : 0;
  const allPaid  = totalItems > 0 && paidCount === totalItems;

  let deltaHtml = '';
  if (netDelta !== null) {
    const up   = netDelta >= 0;
    const good = !isNeg && up;
    deltaHtml = `<span class="delta ${good ? 'good' : 'bad'}">${up ? '↑' : '↓'} RM ${fmt0(Math.abs(netDelta))}</span>`;
  }

  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.innerHTML = `
    <div class="hero-top">
      <div>
        <span class="hero-eyebrow">This period · ${escapeHtml(periodLabel)}</span>
        <div class="hero-net" style="color:${netClr}">${isNeg ? '−' : ''}RM ${fmt0(Math.abs(netBalance))}</div>
        <div class="hero-netlabel">net balance ${deltaHtml}</div>
      </div>
      <span class="verdict ${verdict.tone}">${verdict.pill}</span>
    </div>
    <p class="hero-line">${verdict.line}</p>
    <div class="kpi-strip">
      <div class="kpi"><span class="kpi-v" style="color:var(--positive-ink)">${Math.round(savingsRate)}%</span><span class="kpi-l">saved</span></div>
      <div class="kpi"><span class="kpi-v">${Math.round(fixedRatio)}%</span><span class="kpi-l">fixed</span></div>
      <div class="kpi"><span class="kpi-v">${Math.round(varRatio)}%</span><span class="kpi-l">variable</span></div>
      <div class="kpi"><span class="kpi-v">RM ${fmt0(dailyAvg)}</span><span class="kpi-l">/ day</span></div>
    </div>
    <div class="bills${allPaid ? ' done' : ''}">
      <div class="bills-row"><span>Bills paid</span><span>${paidCount} / ${totalItems}</span></div>
      <div class="bills-track"><div class="bills-fill" style="width:${billsPct.toFixed(1)}%"></div></div>
    </div>`;

  body.appendChild(hero);
}

// ── Lens switcher ──────────────────────────────────────────────────────────────

const LENS_KEY = 'insights-lens';

function renderLensSwitcher(body, data) {
  const LENSES = ['Spending', 'Habits', 'Savings'];
  let active = (() => {
    try { const s = localStorage.getItem(LENS_KEY); return LENSES.includes(s) ? s : 'Spending'; }
    catch (_) { return 'Spending'; }
  })();

  const seg = document.createElement('div');
  seg.className = 'seg';

  const lensWrap = document.createElement('div');
  lensWrap.className = 'lens';

  LENSES.forEach(name => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'seg-btn' + (name === active ? ' on' : '');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      if (name === active) return;
      active = name;
      try { localStorage.setItem(LENS_KEY, active); } catch (_) {}
      seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', b.textContent === active));
      destroyCharts();
      lensWrap.innerHTML = '';
      mountLens(lensWrap, active, data);
    });
    seg.appendChild(btn);
  });

  body.appendChild(seg);
  body.appendChild(lensWrap);
  mountLens(lensWrap, active, data);
}

function mountLens(container, name, data) {
  if      (name === 'Spending') renderSpendingLens(container, data);
  else if (name === 'Habits')   renderHabitsLens(container, data);
  else                          renderSavingsLens(container, data);
}

// ── Spending lens ──────────────────────────────────────────────────────────────

function renderSpendingLens(container, data) {
  const { expenses, periodRefs } = data;
  const varExp = expenses.filter(e => !e.type || e.type === 'variable');

  // Compute catData once — used by both limit bars and treemap
  const curPeriod  = periodRefs[11];
  const prevPeriod = periodRefs[10];
  const curCats  = groupByCategory(varExp.filter(e => e.date >= curPeriod.start  && e.date <= curPeriod.end));
  const prevCats = groupByCategory(varExp.filter(e => e.date >= prevPeriod.start && e.date <= prevPeriod.end));
  const avg12    = compute12mCatAvg(varExp, periodRefs);
  const limits   = userSettings.categoryLimits || {};
  const catData  = [...new Set([...Object.keys(curCats), ...Object.keys(prevCats)])]
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

  container.appendChild(summaryPill('accent', buildSpendingSummary(data)));

  // Trend chart
  const trendBlock = makeBlock('Income vs spending · 12 periods');
  renderTrendChart(trendBlock, data);
  const legend = document.createElement('div');
  legend.className = 'trend-legend';
  legend.innerHTML = `
    <span><i class="sw" style="background:var(--positive-soft)"></i>income</span>
    <span><i class="sw" style="background:var(--comp);opacity:0.85"></i>fixed</span>
    <span><i class="sw" style="background:var(--accent)"></i>variable</span>
    <span><i class="sw line" style="background:var(--positive)"></i>net</span>`;
  trendBlock.appendChild(legend);
  container.appendChild(trendBlock);

  // Limit bars (primary)
  if (catData.length) {
    const barsBlock = makeBlock('Against your limits');
    renderLimitBars(barsBlock, catData);
    container.appendChild(barsBlock);
  }

  // Treemap in expander
  const treemapData = catData.filter(d => d.cur > 0);
  if (treemapData.length) {
    const exp = makeDetailsExpander('Spending share · treemap');
    exp.setContent(body => {
      const wrap = document.createElement('div');
      wrap.className = 'insights-treemap-wrap';
      const canvas = document.createElement('canvas');
      wrap.appendChild(canvas);
      body.appendChild(wrap);
      _charts.push(new window.Chart(canvas, {
        type: 'treemap',
        data: {
          datasets: [{
            tree: treemapData.map(d => ({ category: d.cat, v: d.cur, momPct: d.momPct, above12m: d.above12m })),
            key:'v', groups:['category'], spacing:1.5,
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
                    lines.push(`${s}${Math.abs(item.momPct * 100).toFixed(0)}% vs last period`);
                  }
                  if (item?.above12m) lines.push('↑ >20% above 12-period avg');
                  return lines;
                },
              },
            },
          },
        },
      }));
    });
    container.appendChild(exp);
  }
}

// ── Habits lens ────────────────────────────────────────────────────────────────

function renderHabitsLens(container, data) {
  const { expenses, periodRefs } = data;
  const varExp = expenses.filter(e => !e.type || e.type === 'variable');

  // Compute wkday/wkend for summary
  let wkdayTotal = 0, wkendTotal = 0, wkdayCnt = 0, wkendCnt = 0;
  periodRefs.forEach(({ start, end }) => {
    const cur = new Date(start + 'T00:00:00');
    const fin = new Date(end   + 'T00:00:00');
    while (cur <= fin) {
      const di = (cur.getDay() + 6) % 7;
      if (di < 5) wkdayCnt++; else wkendCnt++;
      cur.setDate(cur.getDate() + 1);
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

  container.appendChild(summaryPill('comp', buildHabitsSummary(wkdayAvg, wkendAvg)));

  // Heatmap
  const hmBlock = makeBlock('When you spend · avg / weekday');
  renderDayOfWeekHeatmap(hmBlock, varExp, periodRefs);
  container.appendChild(hmBlock);

  // Category trend lines
  const clBlock = makeBlock('Category trends · 12 periods');
  renderCategoryLines(clBlock, varExp, periodRefs);
  const cap = document.createElement('span');
  cap.className = 'cap muted';
  cap.textContent = '↑ = creeping up over the last quarter · coral dot = spike';
  clBlock.appendChild(cap);
  container.appendChild(clBlock);

  // Payment flow in expander
  const flowExp = makeDetailsExpander('Payment flow · this period');
  flowExp.setContent(body => renderPaymentFlow(body, expenses, periodRefs));
  container.appendChild(flowExp);
}

// ── Savings lens ───────────────────────────────────────────────────────────────

function renderSavingsLens(container, data) {
  const { pots, potTxns, accounts, periodRefs } = data;

  if (!pots?.length && !accounts?.length) {
    const empty = document.createElement('div');
    empty.className = 'list-hint';
    empty.style.padding = '40px 0';
    empty.textContent = 'Add accounts or savings pots to see your savings trajectory';
    container.appendChild(empty);
    return;
  }

  container.appendChild(summaryPill('good', buildSavingsSummary(data)));

  // Pot gauge cards
  if (pots?.length) {
    const potsBlock = makeBlock('Savings pots');
    renderPotCards(potsBlock, pots, potTxns, periodRefs);
    container.appendChild(potsBlock);
  }

  // Net worth chart
  if (accounts?.length) {
    const nwBlock = makeBlock('Net worth · 12 periods');
    renderNetWorthChart(nwBlock, data);
    container.appendChild(nwBlock);
  }

  // Contributions in expander
  if (pots?.length) {
    const contribExp = makeDetailsExpander('Contribution history · 12 periods');
    contribExp.setContent(body => {
      const wrap = document.createElement('div');
      wrap.className = 'insights-chart-wrap';
      wrap.style.height = '160px';
      const canvas = document.createElement('canvas');
      wrap.appendChild(canvas);
      body.appendChild(wrap);
      _charts.push(new window.Chart(canvas, {
        type: 'bar',
        data: {
          labels: periodRefs.map(r => MONTH_SHORT[r.month - 1]),
          datasets: pots.map(pot => ({
            label: abbrev(pot.name),
            data: periodRefs.map(({ start, end }) =>
              (potTxns || [])
                .filter(t => t.potId === pot.id && t.date >= start && t.date <= end)
                .reduce((s, t) => t.type === 'contribute' ? s + t.amount : s - t.amount, 0)
            ),
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
    });
    container.appendChild(contribExp);
  }
}

// ── Trend chart ────────────────────────────────────────────────────────────────

function renderTrendChart(container, { monthly }) {
  const wrap = document.createElement('div');
  wrap.className = 'insights-chart-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  container.appendChild(wrap);

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
        legend:{ display:false },
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

// ── Limit bars (CSS-based) ─────────────────────────────────────────────────────

function renderLimitBars(container, catData) {
  const top = catData.slice(0, 8);
  const max = Math.max(...top.map(d => Math.max(d.cur, d.prev, d.limit || 0)), 1);

  const wrap = document.createElement('div');
  wrap.className = 'limitbars';

  top.forEach(d => {
    const over    = d.limit > 0 && d.cur > d.limit;
    const curW    = (d.cur  / max * 100).toFixed(1);
    const prevW   = (d.prev / max * 100).toFixed(1);
    const limW    = d.limit > 0 ? (d.limit / max * 100).toFixed(1) : null;
    const col     = catColor(d.cat, userSettings.categories);
    const fillCol = over ? 'var(--danger)' : col;

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'lb-row';
    row.innerHTML = `
      <span class="lb-name"><span class="chip-dot" style="background:${col}"></span>${escapeHtml(abbrev(d.cat, 10))}</span>
      <span class="lb-track">
        <span class="lb-prev" style="width:${prevW}%"></span>
        <span class="lb-fill" style="width:${curW}%;background:${fillCol}"></span>
        ${limW !== null ? `<span class="lb-limit" style="left:${limW}%"></span>` : ''}
      </span>
      <span class="lb-amt${over ? ' over' : ''}">RM ${fmt0(d.cur)}</span>`;
    row.addEventListener('click', () => openCategoryLimitSheet(d.cat));
    wrap.appendChild(row);
  });

  const legend = document.createElement('div');
  legend.className = 'lb-legend';
  legend.innerHTML = `<span><i class="dot-prev"></i> last period</span><span><i class="dot-lim"></i> limit</span><span class="muted">tap a bar to set a limit</span>`;
  wrap.appendChild(legend);
  container.appendChild(wrap);
}

// ── Day-of-week heatmap ────────────────────────────────────────────────────────

function renderDayOfWeekHeatmap(container, varExp, periodRefs) {
  const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  const grid = periodRefs.map(({ month, start, end }) => {
    const dayCounts = Array(7).fill(0);
    const dayTotals = Array(7).fill(0);
    const cur = new Date(start + 'T00:00:00');
    const fin = new Date(end   + 'T00:00:00');
    while (cur <= fin) {
      dayCounts[(cur.getDay() + 6) % 7]++;
      cur.setDate(cur.getDate() + 1);
    }
    varExp.filter(e => e.date >= start && e.date <= end).forEach(e => {
      const [y, m, d] = e.date.split('-').map(Number);
      dayTotals[(new Date(y, m - 1, d).getDay() + 6) % 7] += e.amount;
    });
    return { label: MONTH_SHORT[month - 1], days: dayCounts.map((cnt, i) => cnt > 0 ? dayTotals[i] / cnt : 0) };
  });

  const allValues = grid.flatMap(r => r.days);
  const maxVal    = Math.max(...allValues, 1);
  const { L: aL, C: aC, H: aH } = ACCENT_OKLCH;

  const gridWrap = document.createElement('div');
  gridWrap.className = 'heatmap';

  // Header row
  const hdr = document.createElement('div');
  hdr.className = 'hm-row';
  hdr.appendChild(Object.assign(document.createElement('div'), { className: 'hm-lab' }));
  DAY_LABELS.forEach((d, di) => {
    hdr.appendChild(Object.assign(document.createElement('div'), {
      className: 'hm-dh' + (di >= 5 ? ' wk' : ''),
      textContent: d,
    }));
  });
  gridWrap.appendChild(hdr);

  grid.forEach(({ label, days }) => {
    const row = document.createElement('div');
    row.className = 'hm-row';
    row.appendChild(Object.assign(document.createElement('div'), { className: 'hm-lab', textContent: label }));
    days.forEach((val, di) => {
      const cell    = document.createElement('div');
      cell.className = 'hm-cell' + (di >= 5 ? ' wk' : '');
      const opacity = val > 0 ? Math.max(0.08, val / maxVal) : 0;
      const cellL   = di >= 5 ? aL * 0.86 : aL;
      cell.style.backgroundColor = opacity > 0
        ? `oklch(${cellL.toFixed(3)} ${aC} ${aH} / ${opacity.toFixed(3)})`
        : 'transparent';
      if (val > 0) cell.title = `RM ${fmt0(val)}/day avg`;
      row.appendChild(cell);
    });
    gridWrap.appendChild(row);
  });

  container.appendChild(gridWrap);
}

// ── Category trend lines ───────────────────────────────────────────────────────

function renderCategoryLines(container, varExp, periodRefs) {
  const catTotals = groupByCategory(varExp);
  const top6 = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c]) => c);
  if (!top6.length) return;

  const catMonthly = {};
  top6.forEach(cat => {
    catMonthly[cat] = periodRefs.map(({ start, end }) =>
      varExp.filter(e => (e.category || 'Other') === cat && e.date >= start && e.date <= end)
            .reduce((s, e) => s + e.amount, 0)
    );
  });

  const isTrending = cat => {
    const d = catMonthly[cat];
    const f3 = d.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
    const l3 = d.slice(-3).reduce((s, v) => s + v, 0) / 3;
    return f3 > 0 && l3 > f3 * 1.2;
  };

  const wrap = document.createElement('div');
  wrap.className = 'insights-chart-wrap';
  wrap.style.height = '200px';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  _charts.push(new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: periodRefs.map(r => MONTH_SHORT[r.month - 1]),
      datasets: top6.map(cat => {
        const data     = catMonthly[cat];
        const base     = catColor(cat, userSettings.categories);
        const trending = isTrending(cat);
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
          callbacks:{ label: ctx => ` ${ctx.dataset.label.replace(' ↑','')}: RM ${fmt(ctx.parsed.y)}` } },
      },
      scales:{
        x:{ grid:{display:false}, border:{display:false}, ticks:{ font:FONT(10,'600'), color:'#9898b0' } },
        y:{ beginAtZero:true, grid:{color:'rgba(0,0,0,0.05)'}, border:{display:false},
          ticks:{ font:FONT(10), color:'#9898b0', callback: v => 'RM '+fmt0(v), maxTicksLimit:5 } },
      },
    },
  }));
}

// ── Payment flow table ─────────────────────────────────────────────────────────

function renderPaymentFlow(container, expenses, periodRefs) {
  const curPeriod = periodRefs[periodRefs.length - 1];
  const curExp = expenses.filter(e => e.date >= curPeriod.start && e.date <= curPeriod.end && e.type !== 'income');
  if (!curExp.length) return;

  const methods = [...new Set(curExp.map(e => e.paymentMethod).filter(Boolean))];
  if (!methods.length) return;

  const catTotals = {};
  curExp.forEach(e => { const c = e.category||'Other'; catTotals[c] = (catTotals[c]||0)+e.amount; });
  const top4 = Object.entries(catTotals).sort((a,b) => b[1]-a[1]).slice(0,4).map(([c]) => c);

  const matrix = {};
  methods.forEach(m => {
    const mExp = curExp.filter(e => e.paymentMethod === m);
    matrix[m] = { _total: mExp.reduce((s,e) => s+e.amount, 0) };
    top4.forEach(cat => { matrix[m][cat] = mExp.filter(e=>(e.category||'Other')===cat).reduce((s,e)=>s+e.amount,0); });
  });

  const scroll = document.createElement('div');
  scroll.className = 'flow-scroll';

  const table = document.createElement('table');
  table.className = 'flow-table';

  // thead
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  ['Account', ...top4.map(c => abbrev(c)), 'Total'].forEach((h, i) => {
    const th = document.createElement('th');
    if (i === 0) th.className = 'fsticky';
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  // tbody
  const tbody = document.createElement('tbody');
  methods.forEach(m => {
    const tr = document.createElement('tr');
    const nameTd = document.createElement('td');
    nameTd.textContent = abbrev(m, 13);
    nameTd.className = 'fsticky';
    tr.appendChild(nameTd);
    top4.forEach(cat => {
      const td  = document.createElement('td');
      const val = matrix[m][cat] || 0;
      td.textContent = val > 0 ? `RM ${fmt0(val)}` : '—';
      td.className   = val > 0 ? '' : 'z';
      tr.appendChild(td);
    });
    const totTd = document.createElement('td');
    totTd.textContent = `RM ${fmt0(matrix[m]._total)}`;
    totTd.className = 'ftot';
    tr.appendChild(totTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  // tfoot totals row
  const tfoot = document.createElement('tfoot');
  const totTr = document.createElement('tr');
  const lbl = document.createElement('td');
  lbl.textContent = 'Total';
  lbl.className = 'fsticky';
  totTr.appendChild(lbl);
  top4.forEach(cat => {
    const td  = document.createElement('td');
    const val = methods.reduce((s, m) => s + (matrix[m][cat]||0), 0);
    td.textContent = `RM ${fmt0(val)}`;
    totTr.appendChild(td);
  });
  const grand = document.createElement('td');
  grand.textContent = `RM ${fmt0(methods.reduce((s,m) => s+matrix[m]._total, 0))}`;
  totTr.appendChild(grand);
  tfoot.appendChild(totTr);
  table.appendChild(tfoot);

  scroll.appendChild(table);
  container.appendChild(scroll);
}

// ── Pot gauge cards ────────────────────────────────────────────────────────────

function renderPotCards(container, pots, potTxns, periodRefs) {
  const grid = document.createElement('div');
  grid.className = 'pot-grid';

  pots.forEach(pot => {
    const pct  = pot.targetAmount > 0 ? Math.min((pot.currentBalance || 0) / pot.targetAmount, 1) : 0;
    const proj = projectCompletion(pot, potTxns, periodRefs);
    const card = document.createElement('div');
    card.className = 'pot-card';

    const gaugeWrap = document.createElement('div');
    gaugeWrap.className = 'pot-gauge';
    gaugeWrap.innerHTML = buildGaugeSVG(pct, pot.colour || 'var(--accent)');
    card.appendChild(gaugeWrap);

    card.appendChild(Object.assign(document.createElement('div'), { className: 'pot-name', textContent: pot.name }));

    const balEl = document.createElement('div');
    balEl.className = 'pot-bal';
    balEl.innerHTML = `RM ${fmt0(pot.currentBalance || 0)} <span style="color:var(--ink-3)">/ ${fmt0(pot.targetAmount || 0)}</span>`;
    card.appendChild(balEl);

    const etaEl = document.createElement('div');
    if (proj.done) {
      etaEl.className = 'pot-eta done';
      etaEl.textContent = '✓ Goal reached';
    } else if (proj.noRecent) {
      etaEl.className = 'pot-eta warn';
      etaEl.textContent = '⚠ No recent contributions';
    } else {
      etaEl.className = 'pot-eta ok';
      etaEl.textContent = `~${proj.monthsLeft} mo. to goal`;
    }
    card.appendChild(etaEl);

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// ── Net worth chart ────────────────────────────────────────────────────────────

function renderNetWorthChart(container, { accounts, expenses, transfers, potTxns, pots, periodRefs }) {
  const periodEndDates = periodRefs.map(r => r.end);

  const accHistory = (accounts || []).map(acc => ({
    acc,
    data: periodEndDates.map(d => computeAccBalance(acc, expenses, transfers, potTxns, d)),
  }));

  const potsHistory = periodEndDates.map(endDate =>
    (pots || []).reduce((total, pot) => {
      let bal = pot.currentBalance || 0;
      (potTxns || []).filter(t => t.potId === pot.id && t.date > endDate)
        .forEach(t => { bal += t.type === 'contribute' ? -t.amount : t.amount; });
      return total + Math.max(0, bal);
    }, 0)
  );

  const wrap = document.createElement('div');
  wrap.className = 'insights-chart-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  _charts.push(new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: periodRefs.map(r => MONTH_SHORT[r.month - 1]),
      datasets: [
        ...accHistory.map((a, i) => ({
          label: abbrev(a.acc.name),
          data: a.data,
          backgroundColor: AREA_FILLS[i % AREA_FILLS.length],
          borderColor:     AREA_BORDERS[i % AREA_BORDERS.length],
          borderWidth: 1.5, fill: true, stack: 'accounts', tension: 0.3, pointRadius: 2,
        })),
        ...(pots?.length ? [{
          label: 'Savings pots', data: potsHistory,
          borderColor: C.NET, backgroundColor: 'transparent',
          borderWidth: 2, borderDash: [4, 3], fill: false, tension: 0.3, pointRadius: 2,
        }] : []),
      ],
    },
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

// ── Gauge SVG ──────────────────────────────────────────────────────────────────

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

function projectCompletion(pot, potTxns, periodRefs) {
  const remaining = (pot.targetAmount || 0) - (pot.currentBalance || 0);
  if (remaining <= 0) return { done: true };
  const contribs   = (potTxns || []).filter(t => t.potId === pot.id && t.type === 'contribute');
  const last3      = periodRefs.slice(-3);
  const total3     = last3.reduce((sum, { start, end }) =>
    sum + contribs.filter(t => t.date >= start && t.date <= end).reduce((s, t) => s + t.amount, 0), 0);
  const avgMonthly = total3 / 3;
  const curPeriod  = periodRefs[periodRefs.length - 1];
  const noContrib  = !contribs.some(t => t.date >= curPeriod.start && t.date <= curPeriod.end);
  if (avgMonthly <= 0) return { done: false, noRecent: true, noContrib };
  return { done: false, monthsLeft: Math.ceil(remaining / avgMonthly), noContrib };
}

// ── Account balance ────────────────────────────────────────────────────────────

function computeAccBalance(account, expenses, transfers, potTxns, upToDate) {
  let bal = account.openingBalance || 0;
  const name = account.name;
  const id   = account.id;
  (expenses || []).forEach(e => {
    if (e.date > upToDate) return;
    if (e.isIncome && e.paymentMethod === name)                                    bal += e.amount;
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
  titleEl.textContent = `${cat} — spending limit`;

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

function compute12mCatAvg(varExp, periodRefs) {
  const totals = {};
  periodRefs.forEach(({ start, end }) => {
    Object.entries(groupByCategory(varExp.filter(e => e.date >= start && e.date <= end)))
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
