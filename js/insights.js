import { currentUser, userSettings } from './state.js';
import { fmt, fmt0, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetMonth, fetchBudgetTemplate } from './db.js';

// ── State ──────────────────────────────────────────────────────────────────────

let _cache = null;
let _chart = null;

export function clearInsightsState() {
  _cache = null;
  if (_chart) { _chart.destroy(); _chart = null; }
}

// ── Entry point ────────────────────────────────────────────────────────────────

export async function initInsights() {
  const body = document.getElementById('budget-insights-body');
  body.innerHTML = '<div class="insights-loading">Loading insights…</div>';
  try {
    await ensureChartJS();
    const data = await loadData(currentUser.uid);
    body.innerHTML = '';
    renderKPIs(body, data);
    renderTrendChart(body, data);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<div class="list-hint" style="padding:40px 0">Failed to load — please try again</div>';
  }
}

// ── Chart.js lazy load ─────────────────────────────────────────────────────────

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

  // Bills paid from current month + template
  const templateItemIds = new Set(template?.groups?.flatMap(g => g.items.map(i => i.id)) || []);
  const activePayments  = (curBM?.payments || []).filter(p => templateItemIds.has(p.itemId));
  const paidCount  = activePayments.filter(p => p.paid).length;
  const totalItems = templateItemIds.size;

  // vs last month (calendar month net comparison)
  const prevM    = monthly[monthly.length - 2];
  const netDelta = prevM ? netBalance - prevM.net : null;

  _cache = {
    monthly,
    kpi: {
      netBalance,
      netDelta,
      savingsRate: incomeTotal > 0 ? (netBalance    / incomeTotal) * 100 : 0,
      fixedRatio:  incomeTotal > 0 ? (fixedTotal    / incomeTotal) * 100 : 0,
      varRatio:    incomeTotal > 0 ? (variableTotal / incomeTotal) * 100 : 0,
      dailyAvg:    variableTotal / daysElapsed,
      paidCount,
      totalItems,
    },
  };
  return _cache;
}

// ── Section 1: KPI Cards ───────────────────────────────────────────────────────

function renderKPIs(body, { kpi }) {
  const { netBalance, netDelta, savingsRate, fixedRatio, varRatio, dailyAvg, paidCount, totalItems } = kpi;

  const isNegNet  = netBalance < 0;
  const netClr    = isNegNet ? 'var(--danger)' : 'var(--accent-ink)';
  const savClr    = savingsRate >= 20 ? 'var(--positive)' : savingsRate >= 10 ? 'var(--accent-ink)' : 'var(--danger)';

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
  const section  = document.createElement('section');
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

  // Spike: variable > 120% of prior 5-month avg → use danger colour
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
        {
          type: 'bar',
          label: 'Income',
          data: incomeData,
          backgroundColor: C.INCOME,
          stack: 'income',
          borderRadius: 3,
          borderSkipped: false,
          order: 2,
        },
        {
          type: 'bar',
          label: 'Fixed',
          data: fixedData,
          backgroundColor: C.FIXED,
          stack: 'spend',
          borderRadius: 0,
          order: 2,
        },
        {
          type: 'bar',
          label: 'Variable',
          data: variableData,
          backgroundColor: varBg,
          stack: 'spend',
          borderRadius: { topLeft: 3, topRight: 3, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: 'bottom',
          order: 2,
        },
        {
          type: 'line',
          label: 'Net',
          data: netData,
          borderColor: C.NET,
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: netData.map(n => n >= 0 ? C.NET : C.SPIKE),
          tension: 0.3,
          order: 1,
          segment: {
            borderColor: ctx => ctx.p1.parsed.y < 0 ? C.SPIKE : C.NET,
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          align: 'start',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            padding: 12,
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: '600' },
            color: '#8888a0',
          },
        },
        tooltip: {
          backgroundColor: 'rgba(18,18,28,0.90)',
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 12, weight: '700' },
          bodyFont:  { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          padding: 10,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              const abs = Math.abs(v);
              const sign = v < 0 ? '−' : '';
              return ` ${ctx.dataset.label}: ${sign}RM ${fmt(abs)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid:   { display: false },
          border: { display: false },
          ticks: {
            font:  { family: "'Plus Jakarta Sans', sans-serif", size: 10, weight: '600' },
            color: '#9898b0',
          },
        },
        y: {
          beginAtZero: true,
          grid:   { color: 'rgba(0,0,0,0.05)' },
          border: { display: false },
          ticks: {
            font:  { family: "'Plus Jakarta Sans', sans-serif", size: 10 },
            color: '#9898b0',
            callback: v => 'RM ' + fmt0(v),
            maxTicksLimit: 5,
          },
        },
      },
    },
  });
}

// ── Chart colour palette (resolved from CSS variables at load time) ────────────

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
  };
})();
