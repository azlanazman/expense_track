import {
  collection, addDoc, query, where, orderBy, getDocs,
  doc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp
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
