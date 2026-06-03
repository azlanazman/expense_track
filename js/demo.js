import {
  collection, addDoc, doc, setDoc, getDoc,
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';
import { db } from './firebase.js';

export const DEMO_EMAIL = 'demo@expense-track.app';

export async function seedDemoDataIfNeeded(uid) {
  const snap = await getDoc(doc(db, 'userSettings', uid));
  if (snap.exists() && snap.data().onboardingComplete) return;
  await seedDemoData(uid);
}

async function seedDemoData(uid) {
  const ACC = {
    maybank: 'acc-demo-1',
    cimb:    'acc-demo-2',
    tng:     'acc-demo-3',
    cc:      'acc-demo-4',
  };

  const ITEMS = {
    rent:      'i-rent',
    utilities: 'i-util',
    carLoan:   'i-carloan',
    petrol:    'i-petrol',
    medical:   'i-med',
    carIns:    'i-carins',
    netflix:   'i-netflix',
    spotify:   'i-spotify',
    emergency: 'i-emerg',
  };

  const POTS = {
    emergency: 'pot-demo-1',
    holiday:   'pot-demo-2',
  };

  // ── userSettings ─────────────────────────────────────────────────────────
  await setDoc(doc(db, 'userSettings', uid), {
    categories:         ['Food', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Bills', 'Savings', 'Other'],
    paymentMethods:     ['Maybank', 'CIMB', 'Touch n Go', 'Credit Card'],
    salaryDay:          25,
    onboardingComplete: true,
    onboardingDate:     new Date().toISOString(),
    consentGiven:       true,
    consentDate:        new Date().toISOString(),
  });

  // ── accounts ──────────────────────────────────────────────────────────────
  await setDoc(doc(db, 'accounts', uid), {
    accounts: [
      { id: ACC.maybank, name: 'Maybank',     openingBalance: 8500, type: 'bank',    createdAt: '2026-01-01T00:00:00.000Z' },
      { id: ACC.cimb,    name: 'CIMB',        openingBalance: 3200, type: 'bank',    createdAt: '2026-01-01T00:00:00.000Z' },
      { id: ACC.tng,     name: 'Touch n Go',  openingBalance: 200,  type: 'ewallet', createdAt: '2026-01-01T00:00:00.000Z' },
      { id: ACC.cc,      name: 'Credit Card', openingBalance: 0,    type: 'card',    createdAt: '2026-01-01T00:00:00.000Z' },
    ],
  });

  // ── budgetTemplates ───────────────────────────────────────────────────────
  await setDoc(doc(db, 'budgetTemplates', uid), {
    groups: [
      { id: 'g-housing', name: 'Housing', items: [
        { id: ITEMS.rent,      name: 'Rent',           paymentMethod: 'Maybank',      defaultAmount: 1500, isVariable: false },
        { id: ITEMS.utilities, name: 'Utilities',      paymentMethod: 'Maybank',      defaultAmount: 180,  isVariable: false },
      ]},
      { id: 'g-transport', name: 'Transport', items: [
        { id: ITEMS.carLoan,   name: 'Car Loan',       paymentMethod: 'Maybank',      defaultAmount: 850,  isVariable: false },
        { id: ITEMS.petrol,    name: 'Petrol',         paymentMethod: 'Touch n Go',   defaultAmount: 300,  isVariable: true  },
      ]},
      { id: 'g-insurance', name: 'Insurance', items: [
        { id: ITEMS.medical,   name: 'Medical',        paymentMethod: 'Maybank',      defaultAmount: 150,  isVariable: false },
        { id: ITEMS.carIns,    name: 'Car Insurance',  paymentMethod: 'Maybank',      defaultAmount: 220,  isVariable: false },
      ]},
      { id: 'g-subs', name: 'Subscriptions', items: [
        { id: ITEMS.netflix,   name: 'Netflix',        paymentMethod: 'Credit Card',  defaultAmount: 45,   isVariable: false },
        { id: ITEMS.spotify,   name: 'Spotify',        paymentMethod: 'Credit Card',  defaultAmount: 20,   isVariable: false },
      ]},
      { id: 'g-savings', name: 'Savings', items: [
        { id: ITEMS.emergency, name: 'Emergency Fund', paymentMethod: 'CIMB',         defaultAmount: 500,  isVariable: false },
      ]},
    ],
  });

  // ── savingsPots ───────────────────────────────────────────────────────────
  await setDoc(doc(db, 'savingsPots', uid), {
    pots: [
      {
        id: POTS.emergency, name: 'Emergency Fund',
        linkedAccountId: ACC.cimb, targetAmount: 15000, currentBalance: 5500,
        colour: 'oklch(0.62 0.115 185)', isMonthlyFixed: true, monthlyAmount: 500,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: POTS.holiday, name: 'Holiday Fund',
        linkedAccountId: ACC.cimb, targetAmount: 5000, currentBalance: 1800,
        colour: 'oklch(0.64 0.115 5)', isMonthlyFixed: false, monthlyAmount: 0,
        createdAt: '2026-02-01T00:00:00.000Z',
      },
    ],
  });

  // ── variable expenses (April – June 2026) ─────────────────────────────────
  const varExpenses = [
    // April
    { date: '2026-04-02', amount: 25.50,  category: 'Food',          paymentMethod: 'Maybank',      notes: 'Lunch' },
    { date: '2026-04-03', amount: 12.00,  category: 'Food',          paymentMethod: 'Touch n Go',   notes: 'Breakfast' },
    { date: '2026-04-05', amount: 80.00,  category: 'Transport',     paymentMethod: 'Touch n Go',   notes: 'Petrol' },
    { date: '2026-04-08', amount: 156.90, category: 'Shopping',      paymentMethod: 'Credit Card',  notes: 'Grocery haul' },
    { date: '2026-04-10', amount: 18.50,  category: 'Food',          paymentMethod: 'Maybank',      notes: 'Dinner' },
    { date: '2026-04-12', amount: 55.00,  category: 'Entertainment', paymentMethod: 'Credit Card',  notes: 'Movies + dinner' },
    { date: '2026-04-14', amount: 22.00,  category: 'Food',          paymentMethod: 'Touch n Go',   notes: '' },
    { date: '2026-04-15', amount: 75.00,  category: 'Transport',     paymentMethod: 'Touch n Go',   notes: 'Petrol' },
    { date: '2026-04-18', amount: 65.00,  category: 'Health',        paymentMethod: 'Maybank',      notes: 'Clinic visit' },
    { date: '2026-04-20', amount: 34.50,  category: 'Food',          paymentMethod: 'Maybank',      notes: 'Family dinner' },
    { date: '2026-04-22', amount: 210.00, category: 'Shopping',      paymentMethod: 'Credit Card',  notes: 'Clothing' },
    { date: '2026-04-25', amount: 120.00, category: 'Bills',         paymentMethod: 'Maybank',      notes: 'Internet + phone' },
    { date: '2026-04-28', amount: 16.00,  category: 'Food',          paymentMethod: 'Touch n Go',   notes: '' },
    { date: '2026-04-30', amount: 42.00,  category: 'Entertainment', paymentMethod: 'Credit Card',  notes: 'Streaming + games' },
    // May
    { date: '2026-05-01', amount: 28.00,  category: 'Food',          paymentMethod: 'Maybank',      notes: '' },
    { date: '2026-05-03', amount: 85.00,  category: 'Transport',     paymentMethod: 'Touch n Go',   notes: 'Petrol' },
    { date: '2026-05-05', amount: 189.90, category: 'Shopping',      paymentMethod: 'Credit Card',  notes: 'Online shopping' },
    { date: '2026-05-07', amount: 16.00,  category: 'Food',          paymentMethod: 'Touch n Go',   notes: '' },
    { date: '2026-05-10', amount: 60.00,  category: 'Entertainment', paymentMethod: 'Credit Card',  notes: 'Concert tickets' },
    { date: '2026-05-12', amount: 35.50,  category: 'Food',          paymentMethod: 'Maybank',      notes: 'Groceries' },
    { date: '2026-05-15', amount: 45.00,  category: 'Health',        paymentMethod: 'Maybank',      notes: 'Pharmacy' },
    { date: '2026-05-17', amount: 82.00,  category: 'Transport',     paymentMethod: 'Touch n Go',   notes: 'Petrol + parking' },
    { date: '2026-05-20', amount: 19.00,  category: 'Food',          paymentMethod: 'Touch n Go',   notes: '' },
    { date: '2026-05-22', amount: 145.00, category: 'Shopping',      paymentMethod: 'Credit Card',  notes: 'Home supplies' },
    { date: '2026-05-24', amount: 38.00,  category: 'Food',          paymentMethod: 'Maybank',      notes: 'Weekend brunch' },
    { date: '2026-05-27', amount: 115.00, category: 'Bills',         paymentMethod: 'Maybank',      notes: 'Utilities' },
    { date: '2026-05-29', amount: 48.00,  category: 'Entertainment', paymentMethod: 'Credit Card',  notes: 'Dinner out' },
    { date: '2026-05-31', amount: 24.50,  category: 'Food',          paymentMethod: 'Touch n Go',   notes: '' },
    // June
    { date: '2026-06-01', amount: 22.50,  category: 'Food',          paymentMethod: 'Maybank',      notes: '' },
    { date: '2026-06-02', amount: 80.00,  category: 'Transport',     paymentMethod: 'Touch n Go',   notes: 'Petrol' },
    { date: '2026-06-03', amount: 15.00,  category: 'Food',          paymentMethod: 'Touch n Go',   notes: '' },
  ];

  for (const e of varExpenses) {
    await addDoc(collection(db, 'expenses'), {
      uid, type: 'variable', isIncome: false, ...e,
      createdAt: e.date + 'T10:00:00.000Z',
    });
  }

  // ── fixed expenses for paid June items ────────────────────────────────────
  const fixedPaid = [
    { date: '2026-06-01', amount: 1500, category: 'Housing',       subCategory: 'Rent',          paymentMethod: 'Maybank',     itemId: ITEMS.rent },
    { date: '2026-06-02', amount: 850,  category: 'Transport',     subCategory: 'Car Loan',      paymentMethod: 'Maybank',     itemId: ITEMS.carLoan },
    { date: '2026-06-01', amount: 150,  category: 'Insurance',     subCategory: 'Medical',       paymentMethod: 'Maybank',     itemId: ITEMS.medical },
    { date: '2026-06-01', amount: 45,   category: 'Subscriptions', subCategory: 'Netflix',       paymentMethod: 'Credit Card', itemId: ITEMS.netflix },
    { date: '2026-06-01', amount: 20,   category: 'Subscriptions', subCategory: 'Spotify',       paymentMethod: 'Credit Card', itemId: ITEMS.spotify },
  ];

  const expenseIdByItem = {};
  for (const { itemId, ...rest } of fixedPaid) {
    const ref = await addDoc(collection(db, 'expenses'), {
      uid, type: 'fixed', isIncome: false, ...rest,
      createdAt: rest.date + 'T08:00:00.000Z',
    });
    expenseIdByItem[itemId] = ref.id;
  }

  // ── budgetMonths ──────────────────────────────────────────────────────────
  await setDoc(doc(db, 'budgetMonths', `${uid}_2026-06`), {
    income: [
      { id: 'inc-jun-1', name: 'Salary',    amount: 5500, account: 'Maybank' },
      { id: 'inc-jun-2', name: 'Freelance', amount: 800,  account: 'Maybank' },
    ],
    payments: [
      { itemId: ITEMS.rent,      paid: true,  amount: 1500, paidDate: '2026-06-01', expenseId: expenseIdByItem[ITEMS.rent]      || null },
      { itemId: ITEMS.utilities, paid: false, amount: 180,  paidDate: null,          expenseId: null },
      { itemId: ITEMS.carLoan,   paid: true,  amount: 850,  paidDate: '2026-06-02', expenseId: expenseIdByItem[ITEMS.carLoan]   || null },
      { itemId: ITEMS.petrol,    paid: false, amount: 300,  paidDate: null,          expenseId: null },
      { itemId: ITEMS.medical,   paid: true,  amount: 150,  paidDate: '2026-06-01', expenseId: expenseIdByItem[ITEMS.medical]   || null },
      { itemId: ITEMS.carIns,    paid: false, amount: 220,  paidDate: null,          expenseId: null },
      { itemId: ITEMS.netflix,   paid: true,  amount: 45,   paidDate: '2026-06-01', expenseId: expenseIdByItem[ITEMS.netflix]   || null },
      { itemId: ITEMS.spotify,   paid: true,  amount: 20,   paidDate: '2026-06-01', expenseId: expenseIdByItem[ITEMS.spotify]   || null },
      { itemId: ITEMS.emergency, paid: false, amount: 500,  paidDate: null,          expenseId: null },
    ],
  });

  await setDoc(doc(db, 'budgetMonths', `${uid}_2026-05`), {
    income: [
      { id: 'inc-may-1', name: 'Salary',    amount: 5500, account: 'Maybank' },
      { id: 'inc-may-2', name: 'Freelance', amount: 600,  account: 'Maybank' },
    ],
    payments: [
      { itemId: ITEMS.rent,      paid: true, amount: 1500, paidDate: '2026-05-01', expenseId: null },
      { itemId: ITEMS.utilities, paid: true, amount: 175,  paidDate: '2026-05-15', expenseId: null },
      { itemId: ITEMS.carLoan,   paid: true, amount: 850,  paidDate: '2026-05-02', expenseId: null },
      { itemId: ITEMS.petrol,    paid: true, amount: 250,  paidDate: '2026-05-20', expenseId: null },
      { itemId: ITEMS.medical,   paid: true, amount: 150,  paidDate: '2026-05-01', expenseId: null },
      { itemId: ITEMS.carIns,    paid: true, amount: 220,  paidDate: '2026-05-01', expenseId: null },
      { itemId: ITEMS.netflix,   paid: true, amount: 45,   paidDate: '2026-05-01', expenseId: null },
      { itemId: ITEMS.spotify,   paid: true, amount: 20,   paidDate: '2026-05-01', expenseId: null },
      { itemId: ITEMS.emergency, paid: true, amount: 500,  paidDate: '2026-05-25', expenseId: null },
    ],
  });

  await setDoc(doc(db, 'budgetMonths', `${uid}_2026-04`), {
    income: [
      { id: 'inc-apr-1', name: 'Salary', amount: 5500, account: 'Maybank' },
    ],
    payments: [
      { itemId: ITEMS.rent,      paid: true,  amount: 1500, paidDate: '2026-04-01', expenseId: null },
      { itemId: ITEMS.utilities, paid: true,  amount: 190,  paidDate: '2026-04-15', expenseId: null },
      { itemId: ITEMS.carLoan,   paid: true,  amount: 850,  paidDate: '2026-04-02', expenseId: null },
      { itemId: ITEMS.petrol,    paid: true,  amount: 280,  paidDate: '2026-04-22', expenseId: null },
      { itemId: ITEMS.medical,   paid: true,  amount: 150,  paidDate: '2026-04-01', expenseId: null },
      { itemId: ITEMS.carIns,    paid: false, amount: 220,  paidDate: null,          expenseId: null },
      { itemId: ITEMS.netflix,   paid: true,  amount: 45,   paidDate: '2026-04-01', expenseId: null },
      { itemId: ITEMS.spotify,   paid: true,  amount: 20,   paidDate: '2026-04-01', expenseId: null },
      { itemId: ITEMS.emergency, paid: true,  amount: 500,  paidDate: '2026-04-25', expenseId: null },
    ],
  });

  // ── transfers ─────────────────────────────────────────────────────────────
  const transfers = [
    { date: '2026-04-26', amount: 500, fromAccountId: ACC.maybank, toAccountId: ACC.cimb, notes: 'Savings transfer' },
    { date: '2026-05-15', amount: 100, fromAccountId: ACC.maybank, toAccountId: ACC.tng,  notes: 'Top up' },
    { date: '2026-05-26', amount: 800, fromAccountId: ACC.maybank, toAccountId: ACC.cimb, notes: 'Savings transfer' },
    { date: '2026-06-01', amount: 150, fromAccountId: ACC.maybank, toAccountId: ACC.tng,  notes: 'Top up' },
  ];

  for (const t of transfers) {
    await addDoc(collection(db, 'transfers'), {
      uid, type: 'transfer', ...t,
      createdAt: t.date + 'T09:00:00.000Z',
    });
  }

  // ── pot transactions ──────────────────────────────────────────────────────
  const potTxns = [
    { potId: POTS.emergency, type: 'contribute', amount: 3000, linkedAccountId: ACC.cimb, date: '2025-12-01', notes: 'Initial deposit' },
    { potId: POTS.emergency, type: 'contribute', amount: 500,  linkedAccountId: ACC.cimb, date: '2026-01-25', notes: '' },
    { potId: POTS.emergency, type: 'contribute', amount: 500,  linkedAccountId: ACC.cimb, date: '2026-02-25', notes: '' },
    { potId: POTS.emergency, type: 'contribute', amount: 500,  linkedAccountId: ACC.cimb, date: '2026-03-25', notes: '' },
    { potId: POTS.emergency, type: 'contribute', amount: 500,  linkedAccountId: ACC.cimb, date: '2026-04-25', notes: '' },
    { potId: POTS.emergency, type: 'contribute', amount: 500,  linkedAccountId: ACC.cimb, date: '2026-05-25', notes: '' },
    { potId: POTS.holiday,   type: 'contribute', amount: 600,  linkedAccountId: ACC.cimb, date: '2026-03-01', notes: '' },
    { potId: POTS.holiday,   type: 'contribute', amount: 600,  linkedAccountId: ACC.cimb, date: '2026-04-01', notes: '' },
    { potId: POTS.holiday,   type: 'contribute', amount: 600,  linkedAccountId: ACC.cimb, date: '2026-05-01', notes: '' },
  ];

  for (const t of potTxns) {
    await addDoc(collection(db, 'potTransactions'), {
      uid, ...t,
      createdAt: t.date + 'T10:00:00.000Z',
    });
  }
}
