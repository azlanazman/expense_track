// Insights home ("Pocket" dial + LCD + Tape strips): one glance at how this salary period is going.
// Reads the current salary period only. Maths is the same as the locked design in project doc 09.
import { currentUser, userSettings } from './state.js';
import { fmt0, escapeHtml, parseLocalDate, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetTemplate, fetchBudgetMonth } from './db.js';
import { openAnalysis } from './analysis.js';
import { WORD, clamp, abbrev, iconFor, catStatus, tapeStrip } from './tape.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const EARLY_DAYS = 4;   // before this many days into the period, pace says nothing useful

let S = null;             // computed model for the period on screen
let sel = 'all';          // selected strip key: 'all' | category name | '@bills' | '@save'
let prevAngle;            // pointer starts from its last angle, so it swings rather than jumps
let typeTimer;

export function clearPocketState() {
  S = null; sel = 'all'; prevAngle = undefined;
  clearInterval(typeTimer);
  const body = document.getElementById('pk-body');
  if (body) body.innerHTML = '';
}

export async function initPocket() {
  sel = 'all';
  prevAngle = undefined;
  await load();
  render(false);
}

// After a save / edit / delete / limit change: recompute, keep the screen still, optionally select a category
export async function refreshPocket(category) {
  if (!S) return;
  await load();
  if (category && S.infos.some(i => i.name === category)) sel = category;
  render(true);
}

// ── Data ─────────────────────────────────────────────────────────────────────

const rm = (n) => 'RM ' + (n < 0 ? '−' : '') + fmt0(Math.abs(n));

async function load() {
  const uid = currentUser.uid;
  const sd  = userSettings.salaryDay ?? 25;
  const sp  = salaryPeriodMonth(sd);
  const start = salaryStartForMonth(sd, sp.year, sp.month);
  const end   = salaryEndForMonth(sd, sp.year, sp.month);

  const [expenses, template, month] = await Promise.all([
    fetchExpenses(uid, start, end),
    fetchBudgetTemplate(uid),
    fetchBudgetMonth(uid, sp.year, sp.month),
  ]);

  const dayMs   = 86400000;
  const total   = Math.max(1, Math.round((parseLocalDate(end) - parseLocalDate(start)) / dayMs) + 1);
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const day     = clamp(Math.round((today - parseLocalDate(start)) / dayMs) + 1, 1, total);
  const T       = day / total;
  const dl      = total - day;

  const income = (month?.income || []).reduce((s, x) => s + (x.amount || 0), 0);
  const goalPct = userSettings.savingsGoalPct ?? 20;

  // Fixed bills: planned amounts from the template, paid state from this period's payment records
  let billsTotal = 0, billsPaid = 0, fixedPlanned = 0, billsDue = 0;
  for (const g of (template?.groups || [])) {
    for (const item of g.items) {
      const pay = (month?.payments || []).find(p => p.itemId === item.id);
      const amount = pay?.amount ?? item.defaultAmount ?? 0;
      billsTotal += 1;
      fixedPlanned += amount;
      if (pay?.paid) billsPaid += 1; else billsDue += amount;
    }
  }

  const variable = expenses.filter(e => !e.isIncome && (!e.type || e.type === 'variable'));
  const spentBy = {};
  variable.forEach(e => { spentBy[e.category] = (spentBy[e.category] || 0) + e.amount; });
  const names = [...(userSettings.categories || [])];
  Object.keys(spentBy).forEach(c => { if (!names.includes(c)) names.push(c); });
  const limits = userSettings.categoryLimits || {};

  const early = day < EARLY_DAYS;
  const infos = names.map(name => {
    const spent = spentBy[name] || 0, limit = limits[name] || 0;
    const { used, pace, left, st } = catStatus(spent, limit, T, early);
    return { name, spent, limit, used, pace, left, st, safe: left > 0 && dl > 0 ? left / dl : 0 };
  });

  const varTotal = infos.reduce((s, i) => s + i.spent, 0);
  const budget   = income - fixedPlanned - income * goalPct / 100;
  const left     = budget - varTotal;
  const projVar  = varTotal / T;
  const projNet  = income - fixedPlanned - projVar;
  const rate     = income > 0 ? projNet / income * 100 : 0;
  let tone;
  if (income <= 0) tone = 'none';
  else if (early) tone = 'early';
  else { const rr = Math.round(rate); tone = rr >= goalPct ? 'good' : rr >= 10 ? 'warn' : 'bad'; }
  let worst = null;
  infos.forEach(i => { if ((i.st === 'warn' || i.st === 'bad') && (!worst || i.pace > worst.pace)) worst = i; });

  S = {
    start, end, total, day, T, dl, income, goalPct, goalAmt: income * goalPct / 100,
    billsTotal, billsPaid, billsDue, fixedPlanned, infos, varTotal, budget, left,
    used: budget > 0 ? varTotal / budget : (varTotal > 0 ? 1.04 : 0),
    allowed: left > 0 && dl > 0 ? left / dl : 0,
    projNet, rate, tone, worst, early,
  };
}

function billTone() {
  if (S.income <= 0 || S.billsTotal === 0) return 'none';
  if (S.early) return 'good';
  const r = S.billsPaid / S.billsTotal;
  return r >= S.T - 0.15 ? 'good' : r >= S.T - 0.4 ? 'warn' : 'bad';
}

// One detail model for a strip, used by the strip itself and by the LCD
function detail(key) {
  if (key === '@bills') {
    const left = S.billsTotal - S.billsPaid;
    return { key, title: 'Bills', code: 'BILL', icon: 'bills', tone: billTone(), big: S.billsPaid + '/' + S.billsTotal, aria: S.billsPaid + ' of ' + S.billsTotal + ' paid',
      frac: S.billsTotal ? S.billsPaid / S.billsTotal : 0, notch: S.billsTotal ? S.T : null,
      stats: [S.billsPaid + ' PAID', left + ' LEFT'],
      line: S.billsTotal === 0 ? 'Add your bills in Settings › Budget templates and they show up here.'
        : left === 0 ? 'Every bill is paid. Nothing is late.'
        : left + ' bill' + (left === 1 ? '' : 's') + ' left, ' + rm(S.billsDue) + ' in total.' };
  }
  if (key === '@save') {
    const gap = S.projNet - S.goalAmt, none = S.income <= 0;
    return { key, title: 'Savings', code: 'SAVE', icon: 'savings', tone: none ? 'none' : S.early ? 'early' : S.tone, big: none ? '—' : rm(S.projNet).replace('RM ', ''), aria: none ? 'needs income' : 'projected saving ' + rm(S.projNet),
      frac: none || S.goalAmt <= 0 ? 0 : clamp(S.projNet / S.goalAmt, 0, 1), notch: null,
      stats: ['GOAL ' + rm(S.goalAmt), 'PROJECTED ' + rm(S.projNet)],
      line: none ? 'Set your income in Budget to see where you will land.'
        : S.early ? 'Too early to project. Give it a few more days.'
        : gap >= 0 ? 'At this pace you finish ' + rm(gap) + ' above your goal.'
        : 'At this pace you finish ' + rm(-gap) + ' short of your goal. Small trims in the next days close it.' };
  }
  const i = S.infos.find(x => x.name === key);
  return { key, title: i.name, code: abbrev(i.name), icon: iconFor(i.name), tone: i.st, big: fmt0(i.spent), aria: rm(i.spent) + ' spent',
    frac: clamp(i.used, 0, 1), notch: i.limit ? S.T : null,
    stats: [rm(i.spent) + ' SPENT', i.limit ? (i.left >= 0 ? rm(i.left) + ' LEFT' : rm(-i.left) + ' OVER') : 'NO LIMIT'],
    line: catLine(i) };
}

function catLine(i) {
  if (!i.limit) return i.spent > 0 ? 'No limit yet. Set one in Analysis › Spending and this strip starts to move.' : 'No limit set. Set one in Analysis › Spending.';
  if (i.spent === 0) return 'Nothing spent here yet.';
  if (i.used >= 1) return 'Limit passed by ' + rm(-i.left) + '. Let this one rest until the next period.';
  if (S.early) return rm(i.left) + ' left for ' + S.dl + ' days. Too early to read the pace.';
  if (i.st === 'good') return rm(i.left) + ' left for ' + S.dl + ' days. About ' + rm(i.safe) + ' a day keeps it comfy.';
  if (i.st === 'warn') return 'A touch ahead of the period. ' + rm(i.safe) + ' a day keeps it inside the limit.';
  const run = i.left / (i.spent / S.day);
  return 'At this speed it hits the limit in about ' + Math.max(1, Math.round(run)) + ' days. ' + rm(i.safe) + ' a day brings it back.';
}

// The default LCD message when no strip is selected
function verdictLine() {
  const t = S.tone, d = Math.round((S.used - S.T) * 100), ad = Math.abs(d), ap = rm(S.allowed).toUpperCase();
  if (t === 'none')  return 'NO INCOME SET. ADD IT IN BUDGET.';
  if (t === 'early') return 'DAY ' + S.day + ' OF ' + S.total + '. TOO EARLY TO READ THE PACE.';
  const pts = ad + (ad === 1 ? ' PT' : ' PTS');
  if (t === 'good')  return 'ON PACE. ' + (d <= 0 ? pts + ' UNDER' : pts + ' OVER') + '. ' + ap + '/DAY SAFE.';
  if (t === 'warn')  return 'DRIFT +' + pts + (S.worst ? '. ' + S.worst.name.toUpperCase() + ' HOT' : '') + '. TRIM TO ' + ap + '/DAY.';
  return 'OVER PACE. HALT FLEX SPEND. ' + (S.left > 0 ? ap + '/DAY MAX.' : 'NOTHING LEFT THIS PERIOD.');
}

// ── Render ───────────────────────────────────────────────────────────────────

function pol(cx, cy, r, deg) { const a = deg * Math.PI / 180; return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; }

function dialSVG() {
  const tone = S.tone, none = tone === 'none', cx = 162, cy = 130, n = S.total;
  const used = none ? 0 : clamp(S.used, 0, 1.04);
  const th = -135 + 270 * used, tg = -135 + 270 * S.T;
  let h = `<svg viewBox="0 6 324 224" role="img" aria-label="Dial. Money used ${Math.round(S.used * 100)}%, period used ${Math.round(S.T * 100)}%">`;
  for (let k = 1; k <= n; k++) {
    const d = -135 + 270 * k / n, p1 = pol(cx, cy, k === S.day ? 98 : 101, d), p2 = pol(cx, cy, 112, d);
    h += `<line class="${k <= S.day ? 'pk-tk-p' : 'pk-tk-f'}" x1="${p1[0].toFixed(1)}" y1="${p1[1].toFixed(1)}" x2="${p2[0].toFixed(1)}" y2="${p2[1].toFixed(1)}" stroke-width="${k === S.day ? 4 : 2.4}" stroke-linecap="round"/>`;
  }
  const l0 = pol(cx, cy, 92, -135), l1 = pol(cx, cy, 92, 135);
  h += `<text class="pk-dim" x="${(l0[0] - 4).toFixed(1)}" y="${(l0[1] + 20).toFixed(1)}" font-size="9" font-weight="800" text-anchor="middle" letter-spacing=".1em">DAY 1</text>`;
  h += `<text class="pk-dim" x="${(l1[0] + 4).toFixed(1)}" y="${(l1[1] + 20).toFixed(1)}" font-size="9" font-weight="800" text-anchor="middle" letter-spacing=".1em">DAY ${n}</text>`;
  if (!none && tone !== 'early') {
    const a0 = Math.min(th, tg), a1 = Math.max(th, tg);
    if (a1 - a0 > 1.5) {
      const q0 = pol(cx, cy, 90, a0), q1 = pol(cx, cy, 90, a1);
      h += `<path class="pk-gap" d="M${q0[0].toFixed(1)} ${q0[1].toFixed(1)} A90 90 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${q1[0].toFixed(1)} ${q1[1].toFixed(1)}" fill="none" stroke-width="7" stroke-linecap="round"/>`;
    }
  }
  h += `<circle class="pk-rim" cx="${cx}" cy="${cy + 4}" r="80"/><circle class="pk-knob${none ? ' none' : ''}" cx="${cx}" cy="${cy}" r="78"/><circle cx="${cx}" cy="${cy}" r="78" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="2"/>`;
  h += `<g id="pk-ptr" data-a="${th.toFixed(1)}" style="transform-origin:${cx}px ${cy}px;transform:rotate(${prevAngle === undefined ? -135 : prevAngle}deg)"><rect x="${cx - 3.5}" y="${cy - 74}" width="7" height="24" rx="3.5" fill="#fff"/></g>`;
  const big = none ? '--' : fmt0(Math.abs(S.left)), fs = big.length > 4 ? 38 : 46;
  const sub = none ? 'SET INCOME' : S.left > 0 && S.dl > 0 ? '≈ ' + fmt0(S.allowed) + ' / DAY' : S.left > 0 ? 'LAST DAY' : 'PAUSE';
  h += `<g text-anchor="middle"><text class="pk-onknob" x="${cx}" y="${cy - 26}" font-size="9.5" font-weight="800" letter-spacing=".13em">RM LEFT</text>`;
  h += `<text class="pk-onknob" x="${cx}" y="${cy + 14}" font-size="${fs}" font-weight="800" letter-spacing="-.04em">${S.left < 0 && !none ? '−' : ''}${big}</text>`;
  h += `<text class="pk-onknob" x="${cx}" y="${cy + 36}" font-size="10" font-weight="800" letter-spacing=".08em">${sub}</text></g>`;
  return h + '</svg>';
}

const stripHTML = (d, n, half) => tapeStrip(d, n, { half, selected: sel === d.key });

function render(still) {
  const body = document.getElementById('pk-body');
  if (!S) { body.innerHTML = ''; return; }
  const tone = S.tone, none = tone === 'none';
  const delta = Math.round((S.used - S.T) * 100);
  const d = sel === 'all' || !isValidKey(sel) ? null : detail(sel);
  if (!d) sel = 'all';
  const fmtD = (iso) => { const x = parseLocalDate(iso); return x.getDate() + ' ' + MONTHS[x.getMonth()]; };

  let h = `<div class="pk-top"><b>INSIGHTS</b><span>DAY ${S.day}/${S.total} · ${fmtD(S.start)}–${fmtD(S.end)}</span></div>`;
  h += `<div class="pk-dial pk-st-${tone}">${dialSVG()}<div class="pk-stat"><b><span class="pk-led"></span>${none ? 'AWAITING INPUT' : escapeHtml(WORD[tone]).toUpperCase()}</b><span>PACE ${none || tone === 'early' ? '--' : (delta > 0 ? '+' : delta < 0 ? '−' : '±') + Math.abs(delta) + (Math.abs(delta) === 1 ? ' PT' : ' PTS')}</span></div></div>`;

  const msg = d ? d.line : verdictLine();
  h += `<div class="pk-lcd pk-st-${d ? d.tone : tone}" aria-live="polite"><div class="pk-l1"><span>${d ? escapeHtml(d.title).toUpperCase() : 'ALL CATEGORIES'}</span><span>${d ? d.stats.map(escapeHtml).join(' · ') : 'TAP ONE TO READ IT'}</span></div><div class="pk-l2" id="pk-msg" data-msg="${escapeHtml(msg)}"></div></div>`;

  h += `<div class="pk-list${sel !== 'all' ? ' has-sel' : ''}">`;
  if (S.infos.length === 0) h += '<div class="pk-empty">Add categories in Settings and they appear here.</div>';
  S.infos.forEach((i, n) => { h += stripHTML(detail(i.name), n, false); });
  h += `<div class="pk-two">${stripHTML(detail('@bills'), S.infos.length, true)}${stripHTML(detail('@save'), S.infos.length + 1, true)}</div></div>`;
  h += `<div class="pk-more-row"><button type="button" class="pk-more" id="pk-analysis">Full analysis <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button></div>`;

  body.className = 'pk-body' + (still ? ' still' : '');
  body.innerHTML = h;

  const ptr = document.getElementById('pk-ptr');
  if (ptr) {
    const a = +ptr.getAttribute('data-a');
    if (still || prevAngle === a) { ptr.style.transform = 'rotate(' + a + 'deg)'; }
    else requestAnimationFrame(() => requestAnimationFrame(() => {
      ptr.style.transition = 'transform 1.3s cubic-bezier(.3,1.45,.5,1)';
      ptr.style.transform = 'rotate(' + a + 'deg)';
    }));
    prevAngle = a;
  }
  typeIt();
}

function isValidKey(k) { return k === '@bills' || k === '@save' || S.infos.some(i => i.name === k); }

function typeIt() {
  const e = document.getElementById('pk-msg');
  clearInterval(typeTimer);
  if (!e) return;
  const full = e.getAttribute('data-msg');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { e.textContent = full; return; }
  let n = 0;
  typeTimer = setInterval(() => { n += 1; e.textContent = full.slice(0, n); if (n >= full.length) clearInterval(typeTimer); }, 14);
}

// ── Events ───────────────────────────────────────────────────────────────────

document.getElementById('pk-body').addEventListener('click', (e) => {
  if (e.target.closest('#pk-analysis')) { openAnalysis(); return; }
  const strip = e.target.closest('.pk-tp');
  if (!strip || !S) return;
  const key = strip.getAttribute('data-key');
  sel = sel === key ? 'all' : key;
  render(true);
  const again = [...document.querySelectorAll('#pk-body .pk-tp')].find(b => b.getAttribute('data-key') === key);
  if (again) again.focus({ preventScroll: true });   // keep keyboard focus on the strip that was just tapped
});
