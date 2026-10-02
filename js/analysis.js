// Analysis sub-page (Insights › Full analysis). One scroll of "plates", each answering one question.
// Phase A: shell + "Am I improving?" (saved per pay period against the savings goal).
// Later phases add plates by pushing more renderers onto PLATES (see doc 12 in the project).
import { currentUser, userSettings } from './state.js';
import { fmt0, escapeHtml, parseLocalDate, todayString, salaryPeriodLabel, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetMonth, fetchBudgetTemplate } from './db.js';
import { clamp, ico, tapeStrip, iconFor } from './tape.js';
import { holidaysBetween, holidayOn } from './holidays.js';

const PERIODS   = 12;
const EARLY_DAYS = 4;   // same rule as the Insights home: pace says nothing in the first days of a period
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const rm = (n) => 'RM ' + (n < 0 ? '−' : '') + fmt0(Math.abs(n));

// ── State ──────────────────────────────────────────────────────────────────────

let _cache = null;           // { periods, expenses, ... } for the 12-period window
let sel    = null;           // index of the selected bar in plate 1 (null = overview)
let cell   = null;           // selected cell of the category grid: { c: 'Food' | 'All', p: period index }
let dayPer = null;           // period shown in the calendar (index)
let dayIdx = null;           // selected day of that period (0-based, day 1 = salary day), null = none
let look   = null;           // category chosen in "Look up a category"
let lookPer = null;          // period chosen there (index)

export function clearAnalysisState() {
  _cache = null;
  sel = null;
  cell = null;
  dayPer = null; dayIdx = null; look = null; lookPer = null;
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
  dayPer = null; dayIdx = null; look = null; lookPer = null;
  initAnalysis();
}

// Back from Report › Transactions (opened from day detail): show the page again exactly as it was
export function reopenAnalysis() {
  document.getElementById('analysis-page').classList.add('active');
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
const dstr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

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
  const todayStr = todayString();
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
    p.ents      = pe.filter(e => !e.type || e.type === 'variable');   // variable entries, for the leaks plate
    // One entry per day of the period: variable spend, by category, plus how many transactions the Transactions view will list
    const byDate = {};
    pe.forEach(e => {
      const b = byDate[e.date] || (byDate[e.date] = { v: 0, cats: {}, nAll: 0 });
      b.nAll++;
      if (!e.type || e.type === 'variable') { b.v += e.amount; const c = e.category || 'Other'; b.cats[c] = (b.cats[c] || 0) + e.amount; }
    });
    const tags = userSettings.periodTags || [];
    p.days = [];
    for (let d = parseLocalDate(r.start), k = 0; dstr(d) <= r.end; d.setDate(d.getDate() + 1), k++) {
      const ds = dstr(d), b = byDate[ds] || { v: 0, cats: {}, nAll: 0 };
      p.days.push({ i: k, date: ds, d: new Date(d), wd: (d.getDay() + 6) % 7, v: ds > todayStr ? null : b.v, cats: b.cats, nAll: b.nAll,
        hol: holidayOn(ds), trip: tags.some(t => t && t.from <= ds && ds <= t.to) });
    }
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


// ── Plates 3 and 4: Day by day, then the calendar with day detail ─────────────

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MON = MONTH_SHORT;
const dayName = (d) => WD[d.wd] + ' ' + d.d.getDate() + ' ' + MON[d.d.getMonth()];

// Heat scale shared by the overview and the calendar: 75% of the biggest day in a finished period = full colour
function dayScale(periods) {
  let mx = 0;
  periods.filter(p => !p.current && p.hasSpend).forEach(p => p.days.forEach(d => { if (d.v > mx) mx = d.v; }));
  return Math.max(1, mx * 0.75);
}

function ensureDayPer(periods) {
  if (dayPer === null || !periods[dayPer]) {
    const done = periods.filter(p => !p.current && p.hasSpend);
    dayPer = (done.length ? done[done.length - 1] : periods[periods.length - 1]).i;
    dayIdx = null;
  }
}

function plateDays({ periods }) {
  const done = periods.filter(p => !p.current && p.hasSpend);
  let h = '<div class="pk-plate an-plate"><div class="an-h">Day by day</div>' +
    '<div class="an-q">Each row is a pay period, each cell a day. Day 1 is salary day. Tap a row or a day.</div>';
  if (done.length < 2) return h + '<div class="an-empty">Needs a few finished periods of spending before it can compare days.</div></div>';
  ensureDayPer(periods);

  // Average per day-of-period over finished periods (days 29–31 exist in only some of them: need at least half)
  const sums = [], cnt = [];
  for (let i = 0; i < 31; i++) { sums[i] = 0; cnt[i] = 0; }
  done.forEach(p => p.days.forEach(d => { sums[d.i] += d.v; cnt[d.i]++; }));
  const av = sums.map((s, i) => cnt[i] >= Math.ceil(done.length / 2) ? s / cnt[i] : null);
  const idx = av.map((v, i) => [v, i]).filter(a => a[0] !== null).sort((a, b) => b[0] - a[0]);
  const hi = idx[0], lo = idx[idx.length - 1];
  const first3 = (av[0] + av[1] + av[2]) / 3;
  h += `<div class="pk-lcd an-lcd"><div class="pk-l1"><span>ACROSS ${done.length} PERIODS</span><span>AVG PER DAY</span></div>` +
    `<div class="an-l2">Heaviest on day ${hi[1] + 1} (${rm(hi[0])} on average). Lightest on day ${lo[1] + 1} (${rm(lo[0])}). The first 3 days after payday average ${rm(first3)}.</div></div>`;

  const mx = dayScale(periods);
  h += '<div class="an-dv">';
  periods.forEach(p => {
    let pk = -1, pv = 0;
    p.days.forEach(d => { if (d.v !== null && d.v > pv) { pv = d.v; pk = d.i; } });
    let cells = '';
    for (let i = 0; i < 31; i++) {
      const d = p.days[i];
      if (!d) cells += '<i class="an-dc out"></i>';
      else if (d.v === null) cells += '<i class="an-dc out box"></i>';
      else cells += `<i class="an-dc${d.i === pk ? ' pk' : ''}${d.hol ? ' hd' : ''}${dayPer === p.i && dayIdx === d.i ? ' sel' : ''}${d.v === 0 ? ' zero' : ''}" data-p="${p.i}" data-d="${d.i}" style="${d.v === 0 ? '' : 'background:' + heat(d.v / mx)}"></i>`;
    }
    h += `<button type="button" class="an-dvr${dayPer === p.i ? ' on' : ''}" data-p="${p.i}" aria-label="${escapeHtml(p.label)} period${p.current ? ' so far' : ''}, open its calendar">` +
      `<span class="an-rl${p.current ? ' cur' : ''}">${escapeHtml(p.label)}${p.trip ? house(9) : ''}</span><span class="an-dcells">${cells}</span></button>`;
  });
  h += '</div><div class="an-dax"><span></span><span class="an-axis">' +
    [1, 5, 10, 15, 20, 25, 30].map(n => `<b style="left:${((n - 0.5) / 31 * 100).toFixed(2)}%">${n}</b>`).join('') + '</span></div>';
  h += '<div class="an-legend"><span><i class="k zero"></i>no spend</span><span class="an-ramp"><i style="background:' + heat(0.2) + '"></i><i style="background:' + heat(0.6) + '"></i><i style="background:' + heat(1) + '"></i></span><span>more</span>' +
    '<span><i class="k pkk"></i>peak day</span><span><i class="hd"></i>holiday</span></div></div>';
  return h;
}

function plateCalendar({ periods }) {
  const done = periods.filter(p => !p.current && p.hasSpend);
  if (done.length < 2) return '';
  ensureDayPer(periods);
  const p = periods[dayPer];
  const prev = dayPer > 0 ? periods[dayPer - 1] : null;
  const past = p.days.filter(d => d.v !== null), spend = past.filter(d => d.v > 0).sort((a, b) => b.v - a.v);
  const top = spend[0], low = spend[spend.length - 1];
  const zero = past.length - spend.length;
  const prevZero = prev && prev.hasSpend ? prev.days.filter(d => d.v === 0).length : null;
  const prevTop = prev ? prev.days.filter(d => d.v > 0).sort((a, b) => b.v - a.v)[0] : null;

  let h = '<div class="pk-plate an-plate"><div class="an-chead"><div><div class="an-h">' + escapeHtml(p.label) + ' period' + (p.current ? ' (so far)' : '') + '</div>' +
    '<div class="an-q" style="margin:2px 0 0">' + escapeHtml(salaryPeriodLabel(p.start, p.end)) + ' ’' + String(p.year).slice(2) + '</div></div>' +
    '<span class="an-period"><button type="button" class="an-pp" data-step="-1" aria-label="Earlier period"' + (dayPer === 0 ? ' disabled' : '') + '>‹</button>' +
    '<span>' + escapeHtml(p.label) + '</span><button type="button" class="an-pp" data-step="1" aria-label="Later period"' + (dayPer === periods.length - 1 ? ' disabled' : '') + '>›</button></span></div>';

  // Weekdays run across the top (Mon–Sun), one row per week
  const mx = dayScale(periods), off = p.days[0].wd, weeks = Math.ceil((off + p.days.length) / 7);
  h += '<div class="an-cal">' + WD.map(w => `<div class="an-wd">${w}</div>`).join('');
  for (let r = 0; r < weeks; r++) {
    for (let c = 0; c < 7; c++) {
      const i = r * 7 + c - off, d = p.days[i];
      if (i < 0 || !d) { h += '<div class="an-cd out"></div>'; continue; }
      if (d.v === null) { h += `<div class="an-cd out box"><span>${d.d.getDate()}</span></div>`; continue; }
      const cls = 'an-cd' + (d.v === 0 ? ' zero' : '') + (d.v / mx > 0.55 ? ' hot' : '') + (top && d === top ? ' hi' : '') + (low && d === low && low !== top ? ' lo' : '') + (dayIdx === d.i ? ' sel' : '');
      const aria = dayName(d) + ', ' + (d.v ? rm(d.v) : 'no spending') + (d.hol ? ', ' + d.hol : '') + (d.trip ? ', trip' : '');
      h += `<button type="button" class="${cls}" data-day="${d.i}" aria-pressed="${dayIdx === d.i}" aria-label="${escapeHtml(aria)}" style="${d.v === 0 ? '' : 'background:' + heat(d.v / mx)}">` +
        `<span>${d.d.getDate()}</span>${d.v ? `<span class="v">${fmt0(d.v)}</span>` : ''}${d.hol ? '<i class="p"></i>' : ''}${d.trip ? '<i class="tr"></i>' : ''}</button>`;
    }
  }
  h += '</div>';

  h += dayDetail(p);

  const ds = (d) => d.d.getDate() + ' ' + MON[d.d.getMonth()];
  h += `<div class="pk-three an-stats"><div><span class="pk-lab">Highest</span><b>${top ? ds(top) : '—'}</b><small>${top ? rm(top.v) : ''}</small></div>` +
    `<div><span class="pk-lab">Lowest</span><b>${low ? ds(low) : '—'}</b><small>${low ? rm(low.v) : ''}</small></div>` +
    `<div><span class="pk-lab">No-spend days</span><b>${zero}</b><small>${prevZero === null ? '' : (zero >= prevZero ? '+' : '−') + Math.abs(zero - prevZero) + ' vs ' + escapeHtml(prev.label)}</small></div></div>`;
  const hs = p.days.filter(d => d.hol).map(d => ds(d) + ' · ' + d.hol);
  if (hs.length || p.trip) h += '<div class="an-ph">' + (hs.length ? 'Holidays: ' + escapeHtml(hs.join(', ')) + '. ' : '') + (p.trip ? 'Trip: ' + escapeHtml(p.trip.name) + ' (bar under the date).' : '') + '</div>';
  if (prevTop) h += `<div class="an-ph">${escapeHtml(prev.label)} period peaked on ${ds(prevTop)} at ${rm(prevTop.v)}.</div>`;
  h += '<div class="an-legend"><span><i class="k pkk"></i>highest</span><span><i class="k lowk"></i>lowest day with spend</span><span><i class="hd"></i>holiday</span></div></div>';
  return h;
}

function dayDetail(p) {
  const d = dayIdx !== null ? p.days[dayIdx] : null;
  if (!d || d.v === null) return '<div class="an-ph an-hint">Tap a day to see what it was spent on.</div>';
  const ent = Object.entries(d.cats).filter(a => a[1] > 0).sort((a, b) => b[1] - a[1]);
  const n = ent.length;
  let l2 = d.v === 0 ? 'No variable spending this day.' : n + ' categor' + (n > 1 ? 'ies' : 'y') + ', biggest is ' + ent[0][0] + ' (' + rm(ent[0][1]) + ').';
  if (d.hol) l2 += ' ' + d.hol + '.';
  if (d.trip) l2 += ' During your trip.';
  let h = `<div class="an-dd"><div class="pk-lcd an-lcd" style="margin-top:12px"><div class="pk-l1"><span>${escapeHtml(dayName(d).toUpperCase())}</span><span>${rm(d.v)}</span></div><div class="an-l2">${escapeHtml(l2)}</div></div>`;
  if (ent.length) {
    h += '<div class="an-tps">' + ent.map(([c, amt], k) => tapeStrip({
      key: c, title: c, code: c, icon: iconFor(c), tone: 'n', big: fmt0(amt),
      aria: 'RM ' + fmt0(amt) + ', ' + Math.round(amt / d.v * 100) + '% of the day', frac: amt / ent[0][1], notch: null,
    }, k, { isStatic: true, pct: Math.round(amt / d.v * 100) + '%' })).join('') + '</div>';
  }
  if (d.nAll > 0) {
    h += `<div class="an-center"><button type="button" class="an-key" data-date="${escapeHtml(d.date)}">See ${d.nAll} transaction${d.nAll === 1 ? '' : 's'} on ${d.d.getDate()} ${MON[d.d.getMonth()]} ›</button></div>`;
  }
  return h + '</div>';
}


// ── Plate 5: Where small leaks go ─────────────────────────────────────────────

// Same note, whatever the case, numbers or punctuation: "Kopi 2" and "kopi" are one group
const noteKey = (t) => String(t || '').toLowerCase().replace(/[\d_]+/g, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const sentence = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
const top1 = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

// Groups of 3 or more entries by `keyOf`; label = the most common spelling, category = the most common category
function groupEntries(ents, keyOf, labelOf) {
  const g = {};
  ents.forEach(e => {
    const k = keyOf(e);
    if (!k) return;
    const x = g[k] || (g[k] = { n: 0, total: 0, labels: {}, cats: {} });
    x.n++; x.total += e.amount;
    const l = labelOf(e); x.labels[l] = (x.labels[l] || 0) + 1;
    const c = e.category || 'Other'; x.cats[c] = (x.cats[c] || 0) + 1;
  });
  return Object.values(g).filter(x => x.n >= 3).map(x => ({ n: x.n, total: x.total, avg: x.total / x.n, label: top1(x.labels), cat: top1(x.cats) }))
    .sort((a, b) => b.total - a.total);
}

function plateLeaks({ periods }) {
  const done = periods.filter(p => !p.current && p.hasSpend);
  let h = '<div class="pk-plate an-plate"><div class="an-h">Where small leaks go</div>';
  if (!done.length) return h + '<div class="an-empty">Needs a finished period of spending first.</div></div>';
  const p = done[done.length - 1];
  h += `<div class="an-q">${escapeHtml(p.label)} period (${escapeHtml(salaryPeriodLabel(p.start, p.end))}), your last finished one. Frequent small spends add up quietly.</div>`;

  let groups = groupEntries(p.ents, e => { const k = noteKey(e.notes); return k.length >= 2 ? k : ''; }, e => sentence(String(e.notes).trim().replace(/\s+/g, ' ')));
  let basis = 'Grouped by the note you typed (capitals, numbers and punctuation ignored), 3 or more entries.';
  if (!groups.length) {
    groups = groupEntries(p.ents, e => e.subCategory ? (e.category || '') + '|' + e.subCategory : '', e => String(e.subCategory));
    basis = groups.length ? 'Not enough repeated notes, so these are grouped by sub-category (3 or more entries).' : '';
  }
  if (!groups.length) h += '<div class="an-empty">Nothing repeated 3 or more times yet. Consistent notes (the same words each time) make this list useful.</div>';
  groups.slice(0, 6).forEach(g => {
    h += `<div class="an-row"><span class="an-dot">${ico(iconFor(g.cat), 17)}</span><span class="an-grow">${escapeHtml(g.label)}<small>${g.n}× · average ${rm(g.avg)} · ${escapeHtml(g.cat)}</small></span><b>${rm(g.total)}</b></div>`;
  });
  if (basis) h += `<div class="an-ph">${basis}</div>`;

  const big = p.ents.slice().sort((a, b) => b.amount - a.amount).slice(0, 5);
  h += '<div class="an-sub">Biggest single purchases</div>';
  big.forEach(e => {
    const d = parseLocalDate(e.date);
    const what = String(e.notes || '').trim() || e.subCategory || e.category || 'Expense';
    h += `<div class="an-row"><span class="an-grow">${escapeHtml(sentence(what))}<small>${d.getDate()} ${MON[d.getMonth()]} · ${escapeHtml(e.category || 'Other')}</small></span><b>${rm(e.amount)}</b></div>`;
  });
  return h + '</div>';
}

// ── Plate 6: Look up a category ───────────────────────────────────────────────

function plateLookup({ periods, cats }) {
  const done = periods.filter(p => !p.current && p.hasSpend);
  let h = '<div class="pk-plate an-plate"><div class="an-h">Look up a category</div>';
  if (done.length < 2 || !cats.length) return h + '<div class="an-empty">Needs a few finished periods of spending first.</div></div>';
  if (!look || !cats.includes(look)) look = cats.slice().sort((a, b) => periods.reduce((s, p) => s + (p.cat[b] || 0), 0) - periods.reduce((s, p) => s + (p.cat[a] || 0), 0))[0];
  if (lookPer === null || !periods[lookPer]) lookPer = done[done.length - 1].i;
  const sp = periods[lookPer];
  const vals = periods.map(p => p.cat[look] || 0), dv = done.map(p => p.cat[look] || 0);
  const usual = median(dv), best = Math.min(...dv), worst = Math.max(...dv);
  const bp = done.find(p => (p.cat[look] || 0) === best), wp = done.find(p => (p.cat[look] || 0) === worst);
  const max = Math.max(1, ...vals, usual * 1.1) * 1.08, H = 84;

  h += '<div class="an-chips">' + cats.map(c => `<button type="button" class="chip${c === look ? ' on' : ''}" data-look="${escapeHtml(c)}" aria-pressed="${c === look}">${escapeHtml(c)}</button>`).join('') + '</div>';
  const v = sp.cat[look] || 0, diff = v - usual;
  const l2 = sp.current ? 'Day ' + sp.day + ' of ' + sp.total + ' so far.' : Math.abs(diff) < usual * 0.05 ? 'About your usual (' + rm(usual) + ').' : rm(Math.abs(diff)) + (diff > 0 ? ' above' : ' below') + ' your usual ' + rm(usual) + '.';
  h += `<div class="pk-lcd an-lcd"><div class="pk-l1"><span>${escapeHtml(look.toUpperCase() + ' · ' + sp.label.toUpperCase() + (sp.current ? ' (SO FAR)' : ''))}</span><span>${rm(v)}</span></div><div class="an-l2">${escapeHtml(l2)}</div></div>`;

  let bars = '';
  periods.forEach((p, i) => {
    const hh = Math.max(3, vals[i] / max * H);
    bars += `<button type="button" class="an-bar an-lb${p.current ? ' proj' : ''}${lookPer === i ? ' sel' : ''}" data-lp="${i}" aria-pressed="${lookPer === i}" aria-label="${escapeHtml(look + ', ' + p.label + ' period, ' + rm(vals[i]) + (p.current ? ' so far' : ''))}"><i class="an-fill" style="height:${hh.toFixed(1)}px"></i></button>`;
  });
  h += `<div class="an-bars" style="height:${H}px">${bars}<div class="an-usual" style="bottom:${(usual / max * H).toFixed(1)}px"><b>USUAL</b></div></div>` +
    '<div class="an-bl">' + periods.map(p => `<span class="${p.current ? 'cur' : ''}">${escapeHtml(p.label)}</span>`).join('') + '</div>';
  h += `<div class="pk-three an-stats"><div><span class="pk-lab">Usual</span><b>${rm(usual)}</b></div><div><span class="pk-lab">Lowest</span><b>${rm(best)}</b><small>${escapeHtml(bp.label)}</small></div><div><span class="pk-lab">Highest</span><b>${rm(worst)}</b><small>${escapeHtml(wp.label)}</small></div></div>`;
  h += `<div class="an-center" style="margin-top:14px"><button type="button" class="an-key" data-go-cat="${escapeHtml(look)}" data-go-anchor="${sp.start}">Open ${escapeHtml(look)} (${escapeHtml(sp.label)}) in Report ›</button></div></div>`;
  return h;
}

// ── Page ───────────────────────────────────────────────────────────────────────

const PLATES = [plateImproving, plateGrid, plateDays, plateCalendar, plateLeaks, plateLookup];

function render(data) {
  const body = document.getElementById('analysis-body'), page = document.getElementById('analysis-page');
  const top = page.scrollTop;   // keep the reading position when a tap redraws the plates
  body.innerHTML = PLATES.map(fn => fn(data)).join('');
  page.scrollTop = top;
}

document.getElementById('analysis-body').addEventListener('click', (e) => {
  if (!_cache) return;
  const bar = e.target.closest('.an-bar:not(.an-lb)');
  if (bar) {
    const i = Number(bar.dataset.i);
    sel = sel === i ? null : i;
    render(_cache);
    return;
  }
  const c = e.target.closest('.an-cell');
  if (c) { cell = { c: c.dataset.c, p: Number(c.dataset.p) }; render(_cache); return; }
  const row = e.target.closest('.an-rowbtn');
  if (row) { cell = { c: row.dataset.c, p: cell ? cell.p : _cache.periods.length - 2 }; render(_cache); return; }
  const dc = e.target.closest('.an-dc[data-p]');
  if (dc) { dayPer = Number(dc.dataset.p); dayIdx = Number(dc.dataset.d); render(_cache); return; }
  const dr = e.target.closest('.an-dvr');
  if (dr) { dayPer = Number(dr.dataset.p); dayIdx = null; render(_cache); return; }
  const pp = e.target.closest('.an-pp');
  if (pp && !pp.disabled) { dayPer = clamp(dayPer + Number(pp.dataset.step), 0, _cache.periods.length - 1); dayIdx = null; render(_cache); return; }
  const cd = e.target.closest('.an-cd[data-day]');
  if (cd) { const i = Number(cd.dataset.day); dayIdx = dayIdx === i ? null : i; render(_cache); return; }
  const lk = e.target.closest('[data-look]');
  if (lk) { look = lk.dataset.look; render(_cache); return; }
  const lb = e.target.closest('.an-lb');
  if (lb) { lookPer = Number(lb.dataset.lp); render(_cache); return; }
  const goCat = e.target.closest('[data-go-cat]');
  if (goCat) { document.dispatchEvent(new CustomEvent('nav:show-transactions-date', { detail: { anchor: goCat.dataset.goAnchor, category: goCat.dataset.goCat } })); return; }
  const key = e.target.closest('.an-key[data-date]');
  if (key) document.dispatchEvent(new CustomEvent('nav:show-transactions-date', { detail: { date: key.dataset.date } }));
});
