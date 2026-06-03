import {
  collection, addDoc, query, where, orderBy, getDocs,
  doc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';
import { db } from './firebase.js';
import { currentUser } from './state.js';
import { sanitiseText, sanitiseAmount, sanitiseDate } from './helpers.js';

// ── Audit log (fire-and-forget — never blocks main operations) ────────────────

async function writeAuditLog(action, collectionName, docId) {
  if (!currentUser?.uid) return;
  try {
    await addDoc(collection(db, 'auditLog', currentUser.uid, 'entries'), {
      uid: currentUser.uid,
      action,
      collection: collectionName,
      docId,
      timestamp: serverTimestamp(),
      userAgent: navigator.userAgent.slice(0, 200),
    });
  } catch (_) {}
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function fetchExpenses(uid, startDate, endDate) {
  const q = query(
    collection(db, 'expenses'),
    where('uid',  '==', uid),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function fetchMonth(uid, year, month) {
  const y = String(year);
  const m = String(month).padStart(2, '0');
  return fetchExpenses(uid, `${y}-${m}-01`, `${y}-${m}-31`);
}

export async function addExpense(data) {
  const clean = {
    ...data,
    amount:        sanitiseAmount(data.amount),
    date:          sanitiseDate(data.date),
    category:      sanitiseText(data.category, 100),
    paymentMethod: sanitiseText(data.paymentMethod, 100),
    notes:         sanitiseText(data.notes || '', 500),
  };
  const ref = await addDoc(collection(db, 'expenses'), { ...clean, createdAt: serverTimestamp() });
  writeAuditLog('create', 'expenses', ref.id);
  return ref;
}

export async function updateExpense(id, data) {
  const clean = { ...data };
  if (clean.amount   !== undefined) clean.amount        = sanitiseAmount(clean.amount);
  if (clean.date     !== undefined) clean.date          = sanitiseDate(clean.date);
  if (clean.category !== undefined) clean.category      = sanitiseText(clean.category, 100);
  if (clean.paymentMethod !== undefined) clean.paymentMethod = sanitiseText(clean.paymentMethod, 100);
  if (clean.notes    !== undefined) clean.notes         = sanitiseText(clean.notes || '', 500);
  writeAuditLog('update', 'expenses', id);
  return updateDoc(doc(db, 'expenses', id), clean);
}

export async function deleteExpense(id) {
  writeAuditLog('delete', 'expenses', id);
  return deleteDoc(doc(db, 'expenses', id));
}

// ── User settings ─────────────────────────────────────────────────────────────

export async function fetchUserSettings(uid) {
  const snap = await getDoc(doc(db, 'userSettings', uid));
  return snap.exists() ? snap.data() : null;
}

export function persistUserSettings(uid, settings) {
  return setDoc(doc(db, 'userSettings', uid), settings);
}

export function updateUserSettings(uid, fields) {
  return updateDoc(doc(db, 'userSettings', uid), fields);
}

// ── Budget template ───────────────────────────────────────────────────────────

export async function fetchBudgetTemplate(uid) {
  const snap = await getDoc(doc(db, 'budgetTemplates', uid));
  return snap.exists() ? snap.data() : null;
}

export function persistBudgetTemplate(uid, template) {
  return setDoc(doc(db, 'budgetTemplates', uid), template);
}

// ── Budget months ─────────────────────────────────────────────────────────────

export async function fetchBudgetMonth(uid, year, month) {
  const id = `${uid}_${year}-${String(month).padStart(2, '0')}`;
  const snap = await getDoc(doc(db, 'budgetMonths', id));
  return snap.exists() ? snap.data() : null;
}

export function persistBudgetMonth(uid, year, month, data) {
  const id = `${uid}_${year}-${String(month).padStart(2, '0')}`;
  return setDoc(doc(db, 'budgetMonths', id), data);
}

export function updateBudgetMonthIncome(uid, year, month, income) {
  const id = `${uid}_${year}-${String(month).padStart(2, '0')}`;
  return setDoc(doc(db, 'budgetMonths', id), { income }, { merge: true });
}

// ── Accounts ──────────────────────────────────────────────────────────────────

export async function fetchAccounts(uid) {
  const snap = await getDoc(doc(db, 'accounts', uid));
  return snap.exists() ? snap.data().accounts : null;
}

export function persistAccounts(uid, accounts) {
  return setDoc(doc(db, 'accounts', uid), { accounts });
}

// ── Transfers ─────────────────────────────────────────────────────────────────

export async function addTransfer(data) {
  const clean = {
    ...data,
    amount: sanitiseAmount(data.amount),
    date:   sanitiseDate(data.date),
    notes:  sanitiseText(data.notes || '', 500),
  };
  const ref = await addDoc(collection(db, 'transfers'), { ...clean, createdAt: serverTimestamp() });
  writeAuditLog('create', 'transfers', ref.id);
  return ref;
}

export async function fetchTransfersByMonth(uid, startDate, endDate) {
  const q = query(
    collection(db, 'transfers'),
    where('uid',  '==', uid),
    where('date', '>=', startDate),
    where('date', '<=', endDate),
    orderBy('date', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fetchAllTransfers(uid) {
  const q = query(collection(db, 'transfers'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Savings pots ──────────────────────────────────────────────────────────────

export async function fetchSavingsPots(uid) {
  const snap = await getDoc(doc(db, 'savingsPots', uid));
  return snap.exists() ? snap.data().pots : null;
}

export function persistSavingsPots(uid, pots) {
  return setDoc(doc(db, 'savingsPots', uid), { pots });
}

// ── Pot transactions ──────────────────────────────────────────────────────────

export async function addPotTransaction(data) {
  const clean = {
    ...data,
    amount: sanitiseAmount(data.amount),
    date:   sanitiseDate(data.date),
    notes:  sanitiseText(data.notes || '', 500),
  };
  const ref = await addDoc(collection(db, 'potTransactions'), { ...clean, createdAt: serverTimestamp() });
  writeAuditLog('create', 'potTransactions', ref.id);
  return ref;
}

export async function fetchPotTransactions(uid) {
  const q = query(collection(db, 'potTransactions'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deletePotTransactionsByPot(potId) {
  const q = query(collection(db, 'potTransactions'), where('potId', '==', potId));
  const snap = await getDocs(q);
  if (snap.empty) return;
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  return batch.commit();
}

// ── All expenses (no date filter) ─────────────────────────────────────────────

export async function fetchAllExpenses(uid) {
  const q = query(collection(db, 'expenses'), where('uid', '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Delete all user data ──────────────────────────────────────────────────────

export async function deleteAllUserData(uid) {
  const [expSnap, tfSnap, ptSnap] = await Promise.all([
    getDocs(query(collection(db, 'expenses'),        where('uid', '==', uid))),
    getDocs(query(collection(db, 'transfers'),       where('uid', '==', uid))),
    getDocs(query(collection(db, 'potTransactions'), where('uid', '==', uid))),
  ]);

  const allDocs = [...expSnap.docs, ...tfSnap.docs, ...ptSnap.docs];
  for (let i = 0; i < allDocs.length; i += 490) {
    const batch = writeBatch(db);
    allDocs.slice(i, i + 490).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  // budgetMonths IDs are {uid}_{YYYY-MM} — build refs directly, no query needed.
  // Firestore silently no-ops deletes of non-existent docs.
  const bmBatch = writeBatch(db);
  for (let y = 2020; y <= 2035; y++) {
    for (let m = 1; m <= 12; m++) {
      const id = `${uid}_${y}-${String(m).padStart(2, '0')}`;
      bmBatch.delete(doc(db, 'budgetMonths', id));
    }
  }
  await bmBatch.commit();

  const finalBatch = writeBatch(db);
  finalBatch.delete(doc(db, 'userSettings',    uid));
  finalBatch.delete(doc(db, 'budgetTemplates', uid));
  finalBatch.delete(doc(db, 'accounts',        uid));
  finalBatch.delete(doc(db, 'savingsPots',     uid));
  await finalBatch.commit();
}
