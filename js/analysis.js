// Analysis sub-page (Insights › Full analysis). One scroll of "plates", each answering one question.
// Phase A: shell + "Am I improving?" (saved per pay period against the savings goal).
// Later phases add plates by pushing more renderers onto PLATES (see doc 12 in the project).
import { currentUser, userSettings } from './state.js';
import { fmt0, escapeHtml, parseLocalDate, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetMonth, fetchBudgetTemplate } from './db.js';
import { clamp } from './tape.js';

const PERIODS   = 12;
const EARLY_DAYS = 4;   // same rule as the Insights home: pace says nothing in the first days of a period
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const rm = (n) => 'RM ' + (n < 0 ? '−' : '') + fmt0(Math.abs(n));

// ── State ──────────────────────────────────────────────────────────────────────

let _cache = null;           // { periods, expenses, ... } for the 12-period window
let sel    = null;           // index of the selected bar in plate 1 (null = overview)

export function clearAnalysisState() {
  _cache = null;
  sel = null;
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
    p.saved = income - fixed - variable;

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

  _cache = { periods, goalPct };
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

// ── Page ───────────────────────────────────────────────────────────────────────

const PLATES = [plateImproving];

function render(data) {
  const body = document.getElementById('analysis-body');
  body.innerHTML = PLATES.map(fn => fn(data)).join('');
}

document.getElementById('analysis-body').addEventListener('click', (e) => {
  const bar = e.target.closest('.an-bar');
  if (bar && _cache) {
    const i = Number(bar.dataset.i);
    sel = sel === i ? null : i;
    render(_cache);
  }
});
