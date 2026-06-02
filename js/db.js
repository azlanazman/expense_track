import {
  collection, addDoc, query, where, orderBy, getDocs,
  doc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';
import { db } from './firebase.js';

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

export function addExpense(data) {
  return addDoc(collection(db, 'expenses'), { ...data, createdAt: serverTimestamp() });
}

export function updateExpense(id, data) {
  return updateDoc(doc(db, 'expenses', id), data);
}

export function deleteExpense(id) {
  return deleteDoc(doc(db, 'expenses', id));
}

export async function fetchUserSettings(uid) {
  const snap = await getDoc(doc(db, 'userSettings', uid));
  return snap.exists() ? snap.data() : null;
}

export function persistUserSettings(uid, settings) {
  return setDoc(doc(db, 'userSettings', uid), settings);
}

export async function fetchBudgetTemplate(uid) {
  const snap = await getDoc(doc(db, 'budgetTemplates', uid));
  return snap.exists() ? snap.data() : null;
}

export function persistBudgetTemplate(uid, template) {
  return setDoc(doc(db, 'budgetTemplates', uid), template);
}

export async function fetchBudgetMonth(uid, year, month) {
  const id = `${uid}_${year}-${String(month).padStart(2, '0')}`;
  const snap = await getDoc(doc(db, 'budgetMonths', id));
  return snap.exists() ? snap.data() : null;
}

export function persistBudgetMonth(uid, year, month, data) {
  const id = `${uid}_${year}-${String(month).padStart(2, '0')}`;
  return setDoc(doc(db, 'budgetMonths', id), data);
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

export function addTransfer(data) {
  return addDoc(collection(db, 'transfers'), { ...data, createdAt: serverTimestamp() });
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

export function addPotTransaction(data) {
  return addDoc(collection(db, 'potTransactions'), { ...data, createdAt: serverTimestamp() });
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

export async function deleteAllUserData(uid) {
  // Query collections that use uid field
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

export function updateUserSettings(uid, fields) {
  return updateDoc(doc(db, 'userSettings', uid), fields);
}

export function updateBudgetMonthIncome(uid, year, month, income) {
  const id = `${uid}_${year}-${String(month).padStart(2, '0')}`;
  return setDoc(doc(db, 'budgetMonths', id), { income }, { merge: true });
}
