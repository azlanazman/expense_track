// Insights home ("Pocket" dial + LCD + Tape strips): one glance at how this salary period is going.
// Reads the current salary period only. Maths is the same as the locked design in project doc 09.
import { currentUser, userSettings } from './state.js';
import { fmt0, escapeHtml, parseLocalDate, salaryPeriodMonth, salaryStartForMonth, salaryEndForMonth } from './helpers.js';
import { fetchExpenses, fetchBudgetTemplate, fetchBudgetMonth } from './db.js';
import { openAnalysis } from './insights.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const GLYPH  = { good: '✓', warn: '▲', bad: '■', none: '–', early: '–' };
const WORD   = { good: 'On track', warn: 'Watch', bad: 'Over', none: 'Not set', early: 'Too early' };
const EARLY_DAYS = 4;   // before this many days into the period, pace says nothing useful

const ICON = {
  food:      '<path d="M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 3c-2.4 1.8-2.8 6-.6 8.4L17 12v9"/>',
  transport: '<path d="M4 16l1.6-5.2A2 2 0 0 1 7.5 9.4h9a2 2 0 0 1 1.9 1.4L20 16v3h-2.4v-1.6H6.4V19H4z"/><circle cx="7.6" cy="15" r=".9" fill="currentColor"/><circle cx="16.4" cy="15" r=".9" fill="currentColor"/>',
  family:    '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3 20c0-3.2 2.3-5.4 5-5.4s5 2.2 5 5.4M14.5 20c0-2.2 1.5-3.8 3.4-3.8 1.9 0 3.1 1.6 3.1 3.8"/>',
  shopping:  '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  health:    '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  other:     '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  bills:     '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  savings:   '<path d="M12 21v-8"/><path d="M12 13c-4 0-6-2.5-6-6 3.5 0 6 2 6 6zM12 13c4 0 6-2.5 6-6-3.5 0-6 2-6 6z"/>',
  tag:       '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor"/>',
};
const ICON_BY_NAME = { food: 'food', transport: 'transport', family: 'family', shopping: 'shopping', health: 'health', misc: 'other', other: 'other', bills: 'bills', savings: 'savings' };
const ico = (k, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.tag}</svg>`;
const iconFor = (name) => ICON_BY_NAME[String(name).toLowerCase()] || 'tag';

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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rm = (n) => 'RM ' + (n < 0 ? '−' : '') + fmt0(Math.abs(n));
const abbrev = (s) => (s.length > 10 ? s.slice(0, 9) + '.' : s);

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
    const used = limit ? spent / limit : 0, pace = used / T, left = limit - spent;
    let st;
    if (!limit) st = 'none';
    else if (used >= 1) st = 'bad';
    else if (early) st = 'good';
    else st = pace <= 1.05 ? 'good' : pace <= 1.3 ? 'warn' : 'bad';
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

function stripHTML(d, n, half) {
  const none = d.tone === 'none', segN = half ? 10 : 24;
  const lit = none ? 0 : Math.round(clamp(d.frac, 0, 1) * segN);
  let bar = '<span class="pk-bar">';
  for (let k = 0; k < segN; k++) bar += `<i class="${k < lit ? 'on' : ''}" style="--k:${k}"></i>`;
  if (d.notch !== null && !none) bar += `<u style="left:${(d.notch * 100).toFixed(1)}%"></u>`;
  bar += '</span>';
  const nm   = half ? escapeHtml(d.code) : escapeHtml(abbrev(d.title).toUpperCase());   // already escaped
  const aria = escapeHtml(d.title) + ', ' + WORD[d.tone] + ', ' + escapeHtml(d.aria);
  return `<button type="button" class="pk-tp pk-st-${d.tone}${sel === d.key ? ' sel' : ''}${half ? ' half' : ''}" data-key="${escapeHtml(d.key)}" aria-pressed="${sel === d.key}" aria-label="${aria}" style="--i:${n}">` +
    `<span class="pk-tp-ic">${ico(d.icon, 15)}</span>` + '<span class="pk-tp-nm">' + nm + '</span>' + (half ? '' : bar) +
    `<span class="pk-tp-v">${escapeHtml(d.big)}</span><span class="pk-glyph">${GLYPH[d.tone]}</span>` + (half ? bar : '') + '</button>';
}

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
