// Demo account data. Everything is generated relative to TODAY, so the demo always looks current:
// 13 salary periods ending with the running one, a realistic mix of daily spending (with repeating notes so the
// "small leaks" plate has something to find), fixed bills, income, transfers, savings pots and two trip tags.
// The generator (buildDemo) is pure and deterministic: the same day gives the same data and the same document ids,
// so seeding twice can never create duplicates. The demo is refreshed automatically when its data is older than
// REFRESH_DAYS or when DEMO_VERSION changes (see seedDemoDataIfNeeded).
import { doc, setDoc, getDoc, writeBatch, collection } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';
import { db } from './firebase.js';
import { deleteAllUserData } from './db.js';
import { parseLocalDate, salaryStartForMonth, salaryEndForMonth } from './helpers.js';

export const DEMO_EMAIL = 'demo@expense-track.app';

const DEMO_VERSION = 2;     // bump to make every demo visitor get regenerated data once
const REFRESH_DAYS = 14;    // regenerate when the demo's data is older than this
const PERIODS      = 13;    // salary periods generated, the last one is the running period
const SALARY_DAY   = 25;
const SALARY       = 7000;

// ── Small helpers ────────────────────────────────────────────────────────────

const pad  = (n) => String(n).padStart(2, '0');
const ymd  = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = parseLocalDate(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysBetween = (a, b) => Math.round((parseLocalDate(b) - parseLocalDate(a)) / 86400000);
const r2   = (n) => Math.round(n * 100) / 100;

// Small deterministic random generator (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Static setup ─────────────────────────────────────────────────────────────

const ACC = { maybank: 'acc-demo-1', cimb: 'acc-demo-2', tng: 'acc-demo-3', cc: 'acc-demo-4' };
const POT = { emergency: 'pot-demo-1', holiday: 'pot-demo-2' };
const IT  = { rent: 'i-rent', util: 'i-util', loan: 'i-carloan', petrol: 'i-petrol', med: 'i-med', carIns: 'i-carins', netflix: 'i-netflix', spotify: 'i-spotify', emerg: 'i-emerg' };

const TEMPLATE = { groups: [
  { id: 'g-housing',   name: 'Housing',       items: [
    { id: IT.rent,   name: 'Rent',           paymentMethod: 'Maybank',     defaultAmount: 1500, isVariable: false },
    { id: IT.util,   name: 'Utilities',      paymentMethod: 'Maybank',     defaultAmount: 180,  isVariable: false } ]},
  { id: 'g-transport', name: 'Transport',     items: [
    { id: IT.loan,   name: 'Car Loan',       paymentMethod: 'Maybank',     defaultAmount: 850,  isVariable: false },
    { id: IT.petrol, name: 'Petrol',         paymentMethod: 'Touch n Go',  defaultAmount: 300,  isVariable: true  } ]},
  { id: 'g-insurance', name: 'Insurance',     items: [
    { id: IT.med,    name: 'Medical',        paymentMethod: 'Maybank',     defaultAmount: 150,  isVariable: false },
    { id: IT.carIns, name: 'Car Insurance',  paymentMethod: 'Maybank',     defaultAmount: 220,  isVariable: false } ]},
  { id: 'g-subs',      name: 'Subscriptions', items: [
    { id: IT.netflix, name: 'Netflix',       paymentMethod: 'Credit Card', defaultAmount: 45,   isVariable: false },
    { id: IT.spotify, name: 'Spotify',       paymentMethod: 'Credit Card', defaultAmount: 20,   isVariable: false } ]},
  { id: 'g-savings',   name: 'Savings',       items: [
    { id: IT.emerg,  name: 'Emergency Fund', paymentMethod: 'CIMB',        defaultAmount: 500,  isVariable: false } ]},
]};

// Day offsets (from the period's first day) when each fixed bill is paid, and what it costs
const BILLS = [
  { it: IT.rent,    off: 6,  amt: () => 1500, expense: true  },
  { it: IT.loan,    off: 7,  amt: () => 850,  expense: true  },
  { it: IT.med,     off: 6,  amt: () => 150,  expense: true  },
  { it: IT.netflix, off: 6,  amt: () => 45,   expense: true  },
  { it: IT.spotify, off: 6,  amt: () => 20,   expense: true  },
  { it: IT.carIns,  off: 10, amt: () => 220,  expense: true  },
  { it: IT.util,    off: 20, amt: (R) => Math.round(165 + R() * 35), expense: true },
  // Petrol is tracked through the daily Transport entries and the Emergency Fund through its pot, so these two
  // are only ticked off (no expense is created for them)
  { it: IT.petrol,  off: 20, amt: (R) => Math.round(250 + R() * 60), expense: false },
  { it: IT.emerg,   off: 0,  amt: () => 500,  expense: false },
];
const ITEM_BY_ID = {};
TEMPLATE.groups.forEach(g => g.items.forEach(i => { ITEM_BY_ID[i.id] = { ...i, group: g.name }; }));

// Daily spending patterns. w = relative weight, pm = payment methods to pick from
const SMALL_FOOD = [
  { n: 'Kopi',        lo: 4.5, hi: 9,  w: 4, pm: ['Touch n Go', 'Touch n Go', 'Maybank'] },
  { n: 'Nasi lemak',  lo: 6,   hi: 12, w: 3, pm: ['Touch n Go', 'Maybank'] },
  { n: 'Roti canai',  lo: 5,   hi: 10, w: 2, pm: ['Maybank', 'Touch n Go'] },
  { n: 'Lunch',       lo: 11,  hi: 22, w: 5, pm: ['Maybank', 'Touch n Go', 'Credit Card'] },
  { n: 'Teh tarik',   lo: 3.5, hi: 7,  w: 2, pm: ['Touch n Go'] },
];

function pick(R, list) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let t = R() * total;
  for (const x of list) { t -= x.w; if (t <= 0) return x; }
  return list[list.length - 1];
}
const between = (R, lo, hi) => r2(lo + R() * (hi - lo));
const oneOf   = (R, arr) => arr[Math.floor(R() * arr.length)];

// ── The generator ────────────────────────────────────────────────────────────

export function buildDemo(uid, today = ymd(new Date()), now = new Date()) {
  const sp = (() => {
    // salaryPeriodMonth uses the real clock; derive from `today` so tests can pass any date
    const t = parseLocalDate(today), d = t.getDate(), y = t.getFullYear(), m = t.getMonth() + 1;
    return d >= SALARY_DAY ? { year: y, month: m } : { year: m === 1 ? y - 1 : y, month: m === 1 ? 12 : m - 1 };
  })();

  // Periods, oldest first
  const periods = [];
  for (let i = PERIODS - 1; i >= 0; i--) {
    let year = sp.year, month = sp.month - i;
    while (month <= 0) { month += 12; year--; }
    periods.push({
      i: PERIODS - 1 - i, year, month,
      start: salaryStartForMonth(SALARY_DAY, year, month),
      end:   salaryEndForMonth(SALARY_DAY, year, month),
      key:   `${year}-${pad(month)}`,
    });
  }
  const current = periods[PERIODS - 1];
  const live    = (date) => date <= today;

  const expenses = [], transfers = [], potTxns = [], months = {};
  let n = 0;
  const eid = () => `dm-e-${String(++n).padStart(4, '0')}`;
  const addVar = (date, amount, category, paymentMethod, notes) => {
    if (!live(date) || amount <= 0) return;
    expenses.push({ id: eid(), uid, type: 'variable', isIncome: false, date, amount: r2(amount), category, paymentMethod, notes: notes || '', createdAt: date + 'T10:00:00.000Z' });
  };

  // Two trips, placed relative to the periods so they are always inside the window
  const tripA = { id: 'trip-demo-1', name: 'Balik kampung', p: periods[PERIODS - 8], off: 22, days: 5 };
  const tripB = { id: 'trip-demo-2', name: 'Langkawi trip', p: periods[PERIODS - 3], off: 14, days: 4 };
  const periodTags = [tripA, tripB].map(t => ({ id: t.id, name: t.name, from: addDays(t.p.start, t.off), to: addDays(t.p.start, t.off + t.days - 1) }));
  const tripDay = (date) => periodTags.find(t => date >= t.from && date <= t.to);

  // Per-period variable spending
  for (const p of periods) {
    const R = rng(Number(p.key.replace('-', '')) * 7919);
    const endMonth = parseLocalDate(p.end).getMonth() + 1;
    const shop  = endMonth === 3 ? 1.45 : endMonth === 11 ? 1.6 : endMonth === 12 ? 1.2 : endMonth === 1 ? 0.8 : 1;
    const fun   = endMonth === 12 ? 1.5 : 1;
    const food  = endMonth === 3 ? 1.15 : endMonth === 12 ? 1.1 : 1;
    const last  = Math.min(daysBetween(p.start, p.end), daysBetween(p.start, today));

    let sinceFuel = 3 + Math.floor(R() * 4);
    for (let d = 0; d <= last; d++) {
      const date = addDays(p.start, d);
      const wd = parseLocalDate(date).getDay();          // 0 Sun .. 6 Sat
      const weekend = wd === 0 || wd === 6;

      // Food: a small item most days, a bigger meal some days
      if (R() < 0.92) { const f = pick(R, SMALL_FOOD); addVar(date, between(R, f.lo, f.hi) * food, 'Food', oneOf(R, f.pm), f.n); }
      if (R() < (weekend ? 0.62 : 0.25)) addVar(date, between(R, weekend ? 28 : 17, weekend ? 62 : 36) * food, 'Food', oneOf(R, ['Maybank', 'Credit Card', 'Touch n Go']), weekend ? 'Family dinner' : 'Dinner');
      if (R() < 0.05) addVar(date, between(R, 60, 140), 'Food', 'Maybank', 'Groceries');

      // Transport
      if (--sinceFuel <= 0) { addVar(date, between(R, 68, 92), 'Transport', 'Touch n Go', 'Petrol'); sinceFuel = 8 + Math.floor(R() * 4); }
      if (!weekend && R() < 0.3)  addVar(date, between(R, 3, 9), 'Transport', 'Touch n Go', 'Toll');
      if (R() < 0.1)              addVar(date, between(R, 9, 28), 'Transport', 'Credit Card', 'Grab');
      if (R() < 0.12)             addVar(date, between(R, 2, 7), 'Transport', 'Touch n Go', 'Parking');

      // Trips: extra spending on the tagged days
      const trip = tripDay(date);
      if (trip) {
        const first = date === trip.from, lastDay = date === trip.to;
        if (trip.id === 'trip-demo-1') {
          if (first || lastDay) { addVar(date, between(R, 28, 45), 'Transport', 'Touch n Go', 'Tol'); addVar(date, between(R, 95, 130), 'Transport', 'Touch n Go', 'Petrol balik kampung'); }
          addVar(date, between(R, 45, 105), 'Food', 'Maybank', 'Makan raya');
          if (first) addVar(date, between(R, 220, 320), 'Shopping', 'Maybank', 'Duit raya');
        } else {
          if (!lastDay) addVar(date, between(R, 250, 310), 'Entertainment', 'Credit Card', 'Hotel');
          addVar(date, between(R, 55, 120), 'Food', 'Credit Card', 'Makan Langkawi');
          if (first) addVar(date, between(R, 60, 90), 'Transport', 'Credit Card', 'Ferry');
          if (date === addDays(trip.from, 1)) addVar(date, between(R, 110, 160), 'Entertainment', 'Credit Card', 'Island tour');
        }
      }
    }

    // A few bigger or occasional items per period, on fixed day offsets so they stay stable
    const at = (off) => addDays(p.start, off);
    addVar(at(3 + Math.floor(R() * 4)),  between(R, 95, 190) * shop,  'Shopping', 'Maybank', 'Groceries');
    addVar(at(14 + Math.floor(R() * 5)), between(R, 70, 210) * shop,  'Shopping', 'Credit Card', oneOf(R, ['Online shopping', 'Clothes', 'Home supplies']));
    if (endMonth === 11) addVar(at(16), between(R, 180, 320), 'Shopping', 'Credit Card', '11.11 sale');
    addVar(at(8 + Math.floor(R() * 4)),  between(R, 110, 122), 'Bills', 'Maybank', 'Internet + phone');
    addVar(at(9 + Math.floor(R() * 6)),  between(R, 28, 45) * fun,  'Entertainment', 'Credit Card', 'Movies');
    if (R() < 0.65) addVar(at(17 + Math.floor(R() * 5)), between(R, 60, 120) * fun, 'Entertainment', 'Credit Card', 'Dinner out');
    if (R() < 0.55) addVar(at(5 + Math.floor(R() * 14)), between(R, 38, 85), 'Health', 'Maybank', oneOf(R, ['Clinic visit', 'Pharmacy']));
  }

  // Income, fixed bills and the budget month of each period
  const ccSpend = {}, tngSpend = {};
  for (const e of expenses) {
    const k = periods.find(p => e.date >= p.start && e.date <= p.end)?.key; if (!k) continue;
    if (e.paymentMethod === 'Credit Card')  ccSpend[k]  = (ccSpend[k]  || 0) + e.amount;
    if (e.paymentMethod === 'Touch n Go')   tngSpend[k] = (tngSpend[k] || 0) + e.amount;
  }

  for (const p of periods) {
    const R = rng(Number(p.key.replace('-', '')) * 104729);
    const salaryId = eid();
    expenses.push({ id: salaryId, uid, type: 'income', isIncome: true, date: p.start, amount: SALARY, category: 'Income', subCategory: 'Salary', paymentMethod: 'Maybank', notes: '', createdAt: p.start + 'T07:00:00.000Z' });
    const income = [{ id: 'inc-salary', name: 'Salary', amount: SALARY, account: 'Maybank', expenseId: salaryId }];

    const freelanceDate = addDays(p.start, 12);
    if (p.i % 2 === 1 && live(freelanceDate)) {            // freelance work in about every other period
      const amt = Math.round((600 + R() * 400) / 10) * 10, fid = eid();
      expenses.push({ id: fid, uid, type: 'income', isIncome: true, date: freelanceDate, amount: amt, category: 'Income', subCategory: 'Freelance', paymentMethod: 'Maybank', notes: '', createdAt: freelanceDate + 'T09:00:00.000Z' });
      income.push({ id: 'inc-freelance', name: 'Freelance', amount: amt, account: 'Maybank', expenseId: fid });
    } else if (p === current) {
      income.push({ id: 'inc-freelance', name: 'Freelance', amount: 0, account: 'Maybank' });
    }

    const payments = BILLS.map(b => {
      const item = ITEM_BY_ID[b.it], date = addDays(p.start, b.off), amount = b.amt(R), paid = live(date);
      let expenseId = null;
      if (paid && b.expense) {
        expenseId = eid();
        expenses.push({ id: expenseId, uid, type: 'fixed', isIncome: false, date, amount, category: item.group, subCategory: item.name, paymentMethod: item.paymentMethod, budgetItemId: item.id, notes: '', createdAt: date + 'T08:00:00.000Z' });
      }
      return { itemId: b.it, paid, amount, paidDate: paid ? date : null, expenseId };
    });
    months[p.key] = { income, payments };
  }

  // Transfers
  let prevCC = 0;
  for (const p of periods) {
    const tng = Math.max(50, Math.ceil((tngSpend[p.key] || 0) / 50) * 50);
    const add = (off, to, amount, notes) => {
      const date = addDays(p.start, off);
      if (!live(date) || amount <= 0) return;
      transfers.push({ id: `dm-t-${p.key}-${off}-${to}`, uid, type: 'transfer', date, amount, fromAccountId: ACC.maybank, toAccountId: to, notes, createdAt: date + 'T09:00:00.000Z' });
    };
    add(1, ACC.tng,  tng, 'Top up');
    add(1, ACC.cimb, 800, 'Savings transfer');
    add(8, ACC.cc,   Math.ceil(prevCC / 10) * 10, 'Card payment');
    prevCC = ccSpend[p.key] || 0;
  }

  // Savings pots: Emergency Fund 500 a period (3,000 to start), Holiday Fund 300 a period
  let pn = 0;
  const pot = (potId, date, amount, notes) => { if (live(date)) potTxns.push({ id: `dm-p-${String(++pn).padStart(3, '0')}`, uid, potId, type: 'contribute', amount, linkedAccountId: ACC.cimb, date, notes, createdAt: date + 'T10:00:00.000Z' }); };
  pot(POT.emergency, periods[0].start, 3000, 'Initial deposit');
  for (const p of periods) {
    pot(POT.emergency, p.start, 500, '');
    if (p.i > 0) pot(POT.holiday, p.start, 300, '');
  }
  const potTotal = (id) => potTxns.filter(t => t.potId === id).reduce((s, t) => s + t.amount, 0);
  const created = periods[0].start + 'T00:00:00.000Z';

  return {
    periods, today,
    settings: {
      categories: ['Food', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Bills', 'Savings', 'Other'],
      paymentMethods: ['Maybank', 'CIMB', 'Touch n Go', 'Credit Card'],
      salaryDay: SALARY_DAY, savingsGoalPct: 20,
      categoryLimits: { Food: 750, Transport: 520, Shopping: 450, Entertainment: 260 },
      periodTags, tripSuggestionsDismissed: [],
      onboardingComplete: true, onboardingDate: now.toISOString(), consentGiven: true, consentDate: now.toISOString(),
      demoSeededAt: now.toISOString(), demoVersion: DEMO_VERSION,
    },
    accounts: { accounts: [
      { id: ACC.maybank, name: 'Maybank',     openingBalance: 2000, type: 'bank',    createdAt: created },
      { id: ACC.cimb,    name: 'CIMB',        openingBalance: 6200, type: 'bank',    createdAt: created },
      { id: ACC.tng,     name: 'Touch n Go',  openingBalance: 200,  type: 'ewallet', createdAt: created },
      { id: ACC.cc,      name: 'Credit Card', openingBalance: 0,    type: 'card',    createdAt: created },
    ] },
    template: TEMPLATE,
    pots: { pots: [
      { id: POT.emergency, name: 'Emergency Fund', linkedAccountId: ACC.cimb, targetAmount: 15000, currentBalance: potTotal(POT.emergency), colour: 'oklch(0.62 0.115 185)', isMonthlyFixed: true,  monthlyAmount: 500, createdAt: created },
      { id: POT.holiday,   name: 'Holiday Fund',   linkedAccountId: ACC.cimb, targetAmount: 5000,  currentBalance: potTotal(POT.holiday),   colour: 'oklch(0.64 0.115 5)',   isMonthlyFixed: false, monthlyAmount: 0,   createdAt: created },
    ] },
    expenses, transfers, potTxns, months,
  };
}

// ── Writing it to Firestore ──────────────────────────────────────────────────

async function writeAll(uid) {
  const d = buildDemo(uid);

  // userSettings last, so a half-finished seed is retried on the next sign-in
  await setDoc(doc(db, 'accounts', uid),        d.accounts);
  await setDoc(doc(db, 'budgetTemplates', uid), d.template);
  await setDoc(doc(db, 'savingsPots', uid),     d.pots);
  for (const [key, data] of Object.entries(d.months)) await setDoc(doc(db, 'budgetMonths', `${uid}_${key}`), data);

  const ops = [
    ...d.expenses.map(({ id, ...e }) => [doc(collection(db, 'expenses'), id), e]),
    ...d.transfers.map(({ id, ...t }) => [doc(collection(db, 'transfers'), id), t]),
    ...d.potTxns.map(({ id, ...t }) => [doc(collection(db, 'potTransactions'), id), t]),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach(([ref, data]) => batch.set(ref, data));
    await batch.commit();
  }
  await setDoc(doc(db, 'userSettings', uid), d.settings);
}

// Called when the demo account signs in and from Settings › Reset demo data.
// Seeds an empty demo, and regenerates it when it is older than REFRESH_DAYS or from an older generator version.
export async function seedDemoDataIfNeeded(uid) {
  const snap = await getDoc(doc(db, 'userSettings', uid));
  const s = snap.exists() ? snap.data() : null;
  const age = s?.demoSeededAt ? (Date.now() - Date.parse(s.demoSeededAt)) / 86400000 : Infinity;
  if (s?.onboardingComplete && s.demoVersion === DEMO_VERSION && age < REFRESH_DAYS) return;
  if (s) await deleteAllUserData(uid);      // drop the old demo data first
  await writeAll(uid);
}
