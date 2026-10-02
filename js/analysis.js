// Analysis sub-page (Insights › Full analysis). One scroll of "plates", each answering one question.
// Phase A: shell + "Am I improving?" (saved per pay period against the savings goal).
// Later phases add plates by pushing more renderers onto PLATES (see doc 12 in the project).
import { currentUser, userSettings } from './state.js';
import { fmt0, escapeHtml, parseLocalDate, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetMonth, fetchBudgetTemplate } from './db.js';
import { clamp } from './tape.js';
import { holidaysBetween } from './holidays.js';

const PERIODS   = 12;
const EARLY_DAYS = 4;   // same rule as the Insights home: pace says nothing in the first days of a period
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const rm = (n) => 'RM ' + (n < 0 ? '−' : '') + fmt0(Math.abs(n));

// ── State ──────────────────────────────────────────────────────────────────────

let _cache = null;           // { periods, expenses, ... } for the 12-period window
let sel    = null;           // index of the selected bar in plate 1 (null = overview)
let cell   = null;           // selected cell of the category grid: { c: 'Food' | 'All', p: period index }

export function clearAnalysisState() {
  _cache = null;
  sel = null;
  cell = null;
  const body = document.getElementById('analysis-body');
  if (body) body.innerHTML = '';
}

// An expense or limit changed somewhere else: forget the cache, redraw if the page is open
document.addEventListener('expenses:changed', () => {
  _cache = null;
  if (document.getElementById('analysis-page')?.classList.contains('active')) initAnalysis();
});

// ── Entry points ───────────────────────────────────────────────────────────────

// Slide the page in (opened from Insights › Full analysis); the back button and the phone's back button close it
export function openAnalysis() {
  document.getElementById('analysis-page').classList.add('active');
  history.pushState(null, '');
  sel = null;
  cell = null;
  initAnalysis();
}

document.getElementById('analysis-back').addEventListener('click', () => {
  document.getElementById('analysis-page').classList.remove('active');
});

export async function initAnalysis() {
  const body = document.getElementById('analysis-body');
  if (!_cache) body.innerHTML = '<div class="an-loading">Loading…</div>';
  try {
    const data = await load(currentUser.uid);
    render(data);
  } catch (e) {
    console.error(e);
    body.innerHTML = '<div class="list-hint" style="padding:40px 0">Failed to load — please try again</div>';
  }
}

// ── Data ───────────────────────────────────────────────────────────────────────

// Periods are named by the month they END in (28 Feb – 27 Mar = "Mar"). One function, so it is easy to flip later.
function periodLabel(p) {
  return MONTH_SHORT[parseLocalDate(p.end).getMonth()];
}

async function load(uid) {
  if (_cache) return _cache;

  const sd = userSettings.salaryDay ?? 25;
  const sp = salaryPeriodMonth(sd);
  const refs = [];
  for (let i = PERIODS - 1; i >= 0; i--) {
    let year = sp.year, month = sp.month - i;
    while (month <= 0) { month += 12; year--; }
    refs.push({ year, month, start: salaryStartForMonth(sd, year, month), end: salaryEndForMonth(sd, year, month) });
  }

  const [expenses, template, ...months] = await Promise.all([
    fetchExpenses(uid, refs[0].start, refs[PERIODS - 1].end),
    fetchBudgetTemplate(uid),
    ...refs.map(r => fetchBudgetMonth(uid, r.year, r.month)),
  ]);

  const goalPct = userSettings.savingsGoalPct ?? 20;
  const dayMs   = 86400000;
  const today   = new Date(); today.setHours(0, 0, 0, 0);

  const periods = refs.map((r, i) => {
    const bm  = months[i];
    const pe  = expenses.filter(e => e.date >= r.start && e.date <= r.end && !e.isIncome);
    const income   = (bm?.income || []).reduce((s, x) => s + (x.amount || 0), 0);
    const fixed    = pe.filter(e => e.type === 'fixed').reduce((s, e) => s + e.amount, 0);
    const variable = pe.filter(e => !e.type || e.type === 'variable').reduce((s, e) => s + e.amount, 0);
    const p = { ...r, i, income, fixed, variable, goal: income * goalPct / 100, hasData: income > 0, current: i === PERIODS - 1 };
    p.label = periodLabel(p);
    p.year  = parseLocalDate(r.end).getFullYear();
    p.saved = income - fixed - variable;
    // Variable spend by category (the grid and the later daily views only look at variable spending)
    p.cat = {};
    pe.filter(e => !e.type || e.type === 'variable').forEach(e => { const c = e.category || 'Other'; p.cat[c] = (p.cat[c] || 0) + e.amount; });
    p.hasSpend  = variable > 0;
    p.holidays  = holidaysBetween(r.start, r.end);
    p.trip      = (userSettings.periodTags || []).find(t => t && t.from <= r.end && t.to >= r.start) || null;

    if (p.current) {
      // Still running: project the period the way the Insights home does (planned bills, spending pace)
      const total = Math.max(1, Math.round((parseLocalDate(r.end) - parseLocalDate(r.start)) / dayMs) + 1);
      const day   = clamp(Math.round((today - parseLocalDate(r.start)) / dayMs) + 1, 1, total);
      let fixedPlanned = 0;
      for (const g of (template?.groups || [])) {
        for (const item of g.items) {
          const pay = (bm?.payments || []).find(x => x.itemId === item.id);
          fixedPlanned += pay?.amount ?? item.defaultAmount ?? 0;
        }
      }
      p.day = day; p.total = total; p.early = day < EARLY_DAYS;
      p.projected = income - fixedPlanned - variable / (day / total);
    }
    return p;
  });

  // Categories: the user's own order first, then any that only appear in the spending
  const seen = new Set(periods.flatMap(p => Object.keys(p.cat)));
  const cats = (userSettings.categories || []).filter(c => seen.has(c));
  seen.forEach(c => { if (!cats.includes(c)) cats.push(c); });

  _cache = { periods, goalPct, cats };
  return _cache;
}

// ── Plate 1: Am I improving? ──────────────────────────────────────────────────

function plateImproving({ periods, goalPct }) {
  const done = periods.filter(p => !p.current && p.hasData);
  const cur  = periods[PERIODS - 1];
  const met  = done.filter(p => p.saved >= p.goal).length;
  let streak = 0;
  for (let i = periods.length - 2; i >= 0; i--) {
    const p = periods[i];
    if (!p.hasData || p.saved < p.goal) break;
    streak++;
  }
  const best = done.length ? Math.max(...done.map(p => p.saved)) : 0;
  const avg  = done.length ? done.reduce((s, p) => s + p.saved, 0) / done.length : 0;
  const avgGoal = done.length ? done.reduce((s, p) => s + p.goal, 0) / done.length : 0;

  const s = sel !== null ? periods[sel] : null;
  let l1, l2;
  if (s) {
    l1 = [s.label.toUpperCase() + (s.current ? ' · SO FAR' : ''), s.hasData ? 'GOAL ' + rm(s.goal) : 'NO DATA'];
    if (!s.hasData)      l2 = 'No income set for this period, so there is nothing to compare.';
    else if (s.current)  l2 = s.early ? 'Day ' + s.day + ' of ' + s.total + '. Too early to call.'
      : 'Day ' + s.day + ' of ' + s.total + '. On this pace you would save ' + rm(s.projected) + (s.projected >= s.goal ? ', ' + rm(s.projected - s.goal) + ' above goal.' : ', ' + rm(s.goal - s.projected) + ' short of goal.');
    else l2 = 'Saved ' + rm(s.saved) + (s.saved >= s.goal ? ', ' + rm(s.saved - s.goal) + ' above goal.' : ', ' + rm(s.goal - s.saved) + ' short of goal.');
  } else if (!done.length) {
    l1 = ['12 PERIODS', 'GOAL ' + goalPct + '% OF INCOME'];
    l2 = 'Add income to your budget months and the saved amount per period shows up here.';
  } else {
    l1 = [done.length + ' PERIODS', 'GOAL ' + goalPct + '% OF INCOME'];
    l2 = 'Goal met in ' + met + ' of ' + done.length + ' periods. Average saved ' + rm(avg) + (avg >= avgGoal ? ', above' : ', below') + ' your average goal of ' + rm(avgGoal) + '.';
  }

  const vals = periods.map(p => p.current ? (p.early ? 0 : Math.max(0, p.projected)) : Math.max(0, p.saved));
  const max  = Math.max(1, ...vals, ...periods.map(p => p.goal)) * 1.12;
  const H = 92;
  let bars = '';
  periods.forEach((p, i) => {
    const v  = vals[i];
    const ht = p.hasData ? Math.max(3, v / max * H) : 3;
    const cls = !p.hasData ? 'nodata' : p.current ? 'proj' : (p.saved < p.goal ? 'miss' : '');
    const val = p.current ? (p.early || !p.hasData ? 'too early' : 'projected ' + rm(p.projected)) : (p.hasData ? 'saved ' + rm(p.saved) : 'no data');
    bars += `<button type="button" class="an-bar ${cls}${sel === i ? ' sel' : ''}" data-i="${i}" aria-pressed="${sel === i}" aria-label="${escapeHtml(p.label)} period, ${val}">` +
      `<i class="an-fill" style="height:${ht.toFixed(1)}px"></i>` +
      (p.hasData && p.goal > 0 ? `<u class="an-gt" style="bottom:${(p.goal / max * H).toFixed(1)}px"></u>` : '') + '</button>';
  });
  const labels = periods.map(p => `<span class="${p.current ? 'cur' : ''}">${escapeHtml(p.label)}</span>`).join('');

  let h = '<div class="pk-plate an-plate"><div class="an-h">Am I improving?</div>' +
    '<div class="an-q">Saved each pay period against your goal. Tap a bar for the detail.</div>' +
    `<div class="pk-lcd an-lcd"><div class="pk-l1"><span>${l1[0]}</span><span>${l1[1]}</span></div><div class="an-l2">${l2}</div></div>` +
    `<div class="an-bars" style="height:${H}px">${bars}</div><div class="an-bl">${labels}</div>` +
    '<div class="an-legend"><span><i class="k on"></i>Goal met</span><span><i class="k off"></i>Below goal</span><span><i class="k dash"></i>This period, projected</span><span><i class="k tick"></i>Goal</span></div>';
  if (done.length) {
    h += `<div class="pk-three an-stats"><div><span class="pk-lab">Goal met</span><b>${met} of ${done.length}</b></div>` +
      `<div><span class="pk-lab">In a row</span><b>${streak}</b></div>` +
      `<div><span class="pk-lab">Best</span><b>${rm(best)}</b></div></div>`;
  }
  return h + '</div>';
}


// ── Plate 2: Category by period ───────────────────────────────────────────────

const HOUSE = '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>';
const house = (n) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HOUSE}</svg>`;

const median = (a) => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const heat = (f) => f <= 0 ? 'var(--inset)' : `color-mix(in srgb, var(--pk-knob) ${Math.round(10 + clamp(f, 0, 1) * 90)}%, var(--inset))`;
const shortName = (n) => n.length > 7 ? n.slice(0, 6) + '.' : n;
const spendOf = (p, c) => c === 'All' ? p.variable : (p.cat[c] || 0);

function trendOf(done, c) {
  if (done.length < 4) return null;
  const sum = (a) => a.reduce((s, p) => s + spendOf(p, c), 0);
  const a = sum(done.slice(-3)), b = sum(done.slice(-6, -3));
  return b > 0 ? (a - b) / b : null;
}

function plateGrid({ periods, cats }) {
  const done = periods.filter(p => !p.current && p.hasSpend);
  const last = periods.length - 1;
  let h = '<div class="pk-plate an-plate"><div class="an-h">Category by period</div>' +
    '<div class="an-q">More orange = more than that category usually costs. Tap a cell.</div>';
  if (done.length < 2 || !cats.length) {
    return h + '<div class="an-empty">Needs a few finished periods of spending before it can compare them.</div></div>';
  }
  if (!cell || (cell.c !== 'All' && !cats.includes(cell.c)) || !periods[cell.p]) {
    cell = { c: 'All', p: done[done.length - 1].i };
  }
  const p = periods[cell.p], isAll = cell.c === 'All';
  const val = spendOf(p, cell.c);
  const usual = median(done.map(x => spendOf(x, cell.c)));
  const diff = val - usual;

  // Readout
  let l2;
  if (p.current) l2 = 'Day ' + p.day + ' of ' + p.total + ' so far.';
  else if (!p.hasSpend) l2 = 'No spending recorded in this period.';
  else l2 = Math.abs(diff) < usual * 0.05 ? 'About your usual (' + rm(usual) + ').' : rm(Math.abs(diff)) + (diff > 0 ? ' above' : ' below') + ' your usual ' + rm(usual) + '.';
  const hn = [...new Set(p.holidays.map(x => x.name))];
  if (hn.length) l2 += ' ' + hn.join(', ') + '.';
  if (p.trip) l2 += ' Trip: ' + p.trip.name + '.';
  const range = p.start.slice(8) + '/' + p.start.slice(5, 7) + ' – ' + p.end.slice(8) + '/' + p.end.slice(5, 7);
  h += `<div class="pk-lcd an-lcd"><div class="pk-l1"><span>${escapeHtml((isAll ? 'ALL VARIABLE' : cell.c.toUpperCase()) + ' · ' + p.label.toUpperCase() + (p.current ? ' (SO FAR)' : ''))}</span><span>${rm(val)}</span></div>` +
    `<div class="an-l2">${escapeHtml(l2)}</div><div class="pk-note an-range">${range}</div></div>`;

  // Month header (first letter) and year markers
  let mx = '<div class="an-mx"><div class="an-mrow an-mh"><span></span>' +
    periods.map(x => `<span class="${x.current ? 'cur' : ''}">${escapeHtml(x.label.charAt(0))}</span>`).join('') + '<span></span></div>' +
    '<div class="an-mrow an-mh an-yr"><span></span>' +
    periods.map((x, i) => `<span>${i === 0 || x.label === 'Jan' ? "’" + String(x.year).slice(2) : ''}</span>`).join('') + '<span></span></div>';

  // Holiday row (dots = number of public holidays) and Trip row (only once a tag exists)
  mx += '<div class="an-mrow"><span class="an-rl">Holiday</span>' + periods.map(x => {
    const n = x.holidays.length;
    return `<div class="an-ev" role="img" aria-label="${escapeHtml(x.label)}: ${n} public holiday${n === 1 ? '' : 's'}">` + '<i></i>'.repeat(Math.min(n, 3)) + '</div>';
  }).join('') + '<span></span></div>';
  if (periods.some(x => x.trip)) {
    mx += '<div class="an-mrow"><span class="an-rl">Trip</span>' + periods.map(x =>
      `<div class="an-ev" role="img" aria-label="${escapeHtml(x.label)}: ${x.trip ? escapeHtml(x.trip.name) : 'no trip'}">${x.trip ? house(12) : ''}</div>`).join('') + '<span></span></div>';
  }

  // Category rows, then ALL
  [...cats, 'All'].forEach(c => {
    const tot = c === 'All', name = tot ? 'ALL' : shortName(c).toUpperCase();
    const mxv = Math.max(...done.map(x => spendOf(x, c)), 1);
    const tr = trendOf(done, c);
    const flat = tr === null || Math.abs(tr) < 0.04;
    const trTxt = tr === null ? '–' : flat ? '● flat' : (tr > 0 ? '▲ +' : '▼ −') + Math.round(Math.abs(tr) * 100) + '%';
    mx += `<div class="an-mrow${tot ? ' tot' : ''}"><button type="button" class="an-rowbtn" data-c="${escapeHtml(c)}" aria-label="${escapeHtml(tot ? 'All categories' : c)}">` +
      `<span>${escapeHtml(name)}</span></button>`;
    periods.forEach(x => {
      const v = spendOf(x, c), on = cell.c === c && cell.p === x.i;
      const bg = x.current || !x.hasSpend ? 'var(--inset)' : heat(v / mxv);
      mx += `<button type="button" class="an-cell${x.current ? ' partial' : ''}${on ? ' sel' : ''}" style="background:${bg}" data-c="${escapeHtml(c)}" data-p="${x.i}" aria-pressed="${on}" ` +
        `aria-label="${escapeHtml((tot ? 'All categories' : c) + ', ' + x.label + ' period, ' + rm(v) + (x.current ? ' so far' : ''))}"></button>`;
    });
    mx += `<span class="an-trend ${flat ? '' : tr > 0 ? 'up' : 'dn'}">${trTxt}</span></div>`;
  });
  mx += '</div>';

  h += mx + '<div class="an-legend"><span class="an-ramp"><i style="background:var(--inset)"></i><i style="background:' + heat(0.25) + '"></i><i style="background:' + heat(0.5) + '"></i><i style="background:' + heat(0.75) + '"></i><i style="background:' + heat(1) + '"></i></span><span>less → more</span>' +
    '<span><i class="hd"></i>public holiday</span>' + (periods.some(x => x.trip) ? '<span>' + house(12) + 'trip</span>' : '') + '</div>' +
    '<div class="an-ph">Shade is relative to each category\'s own heaviest finished period. Trend = last 3 finished periods vs the 3 before. Dashed column = this period so far. Variable spending only; public holidays are federal.</div></div>';
  return h;
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PLATES = [plateImproving, plateGrid];

function render(data) {
  const body = document.getElementById('analysis-body');
  body.innerHTML = PLATES.map(fn => fn(data)).join('');
}

document.getElementById('analysis-body').addEventListener('click', (e) => {
  if (!_cache) return;
  const bar = e.target.closest('.an-bar');
  if (bar) {
    const i = Number(bar.dataset.i);
    sel = sel === i ? null : i;
    render(_cache);
    return;
  }
  const c = e.target.closest('.an-cell');
  if (c) { cell = { c: c.dataset.c, p: Number(c.dataset.p) }; render(_cache); return; }
  const row = e.target.closest('.an-rowbtn');
  if (row) { cell = { c: row.dataset.c, p: cell ? cell.p : _cache.periods.length - 2 }; render(_cache); }
});
