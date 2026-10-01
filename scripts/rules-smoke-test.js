// Firestore rules smoke test — run in the BROWSER CONSOLE on http://localhost:8000
// (the app must be running against the TEST project; the script refuses otherwise).
//
// It signs in as the current user (or as the email/password account you pass in),
// tries a series of allowed and forbidden reads/writes, and prints PASS/FAIL per case.
// It cleans up the documents it creates.
//
// Usage (paste the whole file into the console, then call one of):
//   await runRulesSmokeTest()                                         // as the user signed in to the app (e.g. your Google account)
//   await runRulesSmokeTest({ email: 'demo@expense-track.app', password: 'TrackMoney!23' })  // demo identity
//   await runRulesSmokeTest({ email: 'stranger@example.com', password: '<its password>' })  // must be fully denied
//
// Keep OWNERS / DEMO_EMAIL in sync with firestore.rules.
async function runRulesSmokeTest(creds) {
  const OWNERS = ['mhdazlan.azman@gmail.com', 'irzazman@gmail.com'];
  const DEMO_EMAIL = 'demo@expense-track.app';

  const appSrc = document.querySelector('script[type="module"][src*="app.js"]').src;
  const base = appSrc.replace('app.js', '');
  const { auth: mainAuth, db: mainDb, ENV_NAME } = await import(base + 'firebase.js');
  if (ENV_NAME !== 'test') { console.warn('ABORTED: not running against the test project (ENV_NAME=' + ENV_NAME + ').'); return; }

  const G = 'https://www.gstatic.com/firebasejs/11.3.1/';
  const fsm = await import(G + 'firebase-firestore.js');
  const { collection, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, doc, serverTimestamp, writeBatch } = fsm;

  // ── Which identity are we testing? ──────────────────────────────────────────
  let user, db;
  if (creds) {
    const appMod  = await import(G + 'firebase-app.js');
    const authMod = await import(G + 'firebase-auth.js');
    const app2 = appMod.initializeApp(mainAuth.app.options, 'smoke-' + Date.now());
    const auth2 = authMod.getAuth(app2);
    user = (await authMod.signInWithEmailAndPassword(auth2, creds.email, creds.password)).user;
    db = fsm.getFirestore(app2);
  } else {
    user = mainAuth.currentUser;
    db = mainDb;
    if (!user) { console.warn('Sign in to the app first (or pass { email, password }).'); return; }
  }
  const provider = user.providerData[0]?.providerId;
  const allowed =
    (provider === 'google.com' && user.emailVerified && OWNERS.includes(user.email)) ||
    (provider === 'password' && user.email === DEMO_EMAIL);
  const uid = user.uid;
  console.warn(`Testing as ${user.email} (${provider}) -> treated as ${allowed ? 'ALLOWED user' : 'STRANGER: everything must be denied'}`);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const results = [];
  async function t(name, expectAllow, fn) {
    const want = allowed && expectAllow;
    let ok = false, err = '';
    try { await fn(); ok = true; } catch (e) { err = e.code || e.message; }
    results.push({ test: name, expected: want ? 'allow' : 'deny', actual: ok ? 'allow' : 'deny (' + err + ')', result: ok === want ? 'PASS' : 'FAIL' });
    return ok;
  }
  const validExpense = () => ({ uid, date: '2026-01-15', amount: 12.5, category: 'SmokeTest', paymentMethod: 'SmokeTest', notes: '', createdAt: serverTimestamp() });
  const validTransfer = () => ({ uid, fromAccountId: 'smoke-a', toAccountId: 'smoke-b', amount: 5, date: '2026-01-15', notes: '', type: 'transfer', createdAt: serverTimestamp() });
  const validPotTxn = () => ({ uid, potId: 'smoke-pot', type: 'contribute', amount: 5, linkedAccountId: 'smoke-a', date: '2026-01-15', notes: '', createdAt: serverTimestamp() });

  // ── expenses ────────────────────────────────────────────────────────────────
  let e1 = null;
  await t('expense: valid create', true, async () => { e1 = await addDoc(collection(db, 'expenses'), validExpense()); });
  await t('expense: amount 0 rejected', false, () => addDoc(collection(db, 'expenses'), { ...validExpense(), amount: 0 }));
  await t('expense: negative amount rejected', false, () => addDoc(collection(db, 'expenses'), { ...validExpense(), amount: -3 }));
  await t('expense: unknown extra field rejected', false, () => addDoc(collection(db, 'expenses'), { ...validExpense(), hacker: true }));
  await t("expense: someone else's uid rejected", false, () => addDoc(collection(db, 'expenses'), { ...validExpense(), uid: 'someone-else' }));
  await t('expense: bad date rejected', false, () => addDoc(collection(db, 'expenses'), { ...validExpense(), date: '2026-1-5' }));
  await t('expense: bad type rejected', false, () => addDoc(collection(db, 'expenses'), { ...validExpense(), type: 'weird' }));
  const e1ref = () => doc(db, 'expenses', e1 ? e1.id : 'smoke-nonexistent');
  await t('expense: valid update', true, () => updateDoc(e1ref(), { amount: 20 }));
  await t('expense: re-assigning uid rejected', false, () => updateDoc(e1ref(), { uid: 'someone-else' }));
  await t('expense: update to negative amount rejected', false, () => updateDoc(e1ref(), { amount: -5 }));
  await t('expense: update adding unknown field rejected', false, () => updateDoc(e1ref(), { hacker: 1 }));
  await t('expense: read own (query by uid)', true, () => getDocs(query(collection(db, 'expenses'), where('uid', '==', uid))));
  await t("expense: read someone else's (query by other uid)", false, () => getDocs(query(collection(db, 'expenses'), where('uid', '==', 'someone-else'))));
  await t('expense: unfiltered list rejected', false, () => getDocs(collection(db, 'expenses')));

  // ── transfers ───────────────────────────────────────────────────────────────
  let t1 = null;
  await t('transfer: valid create', true, async () => { t1 = await addDoc(collection(db, 'transfers'), validTransfer()); });
  await t('transfer: from == to rejected', false, () => addDoc(collection(db, 'transfers'), { ...validTransfer(), toAccountId: 'smoke-a' }));
  await t('transfer: update always rejected', false, () => updateDoc(doc(db, 'transfers', t1 ? t1.id : 'smoke-nonexistent'), { notes: 'x' }));
  await t('transfer: delete own', true, () => deleteDoc(doc(db, 'transfers', t1 ? t1.id : 'smoke-nonexistent')));

  // ── potTransactions (includes the pot-deletion query fix) ───────────────────
  await t('potTxn: valid create', true, () => addDoc(collection(db, 'potTransactions'), validPotTxn()));
  await t('potTxn: bad type rejected', false, () => addDoc(collection(db, 'potTransactions'), { ...validPotTxn(), type: 'bogus' }));
  await t('potTxn: delete-by-pot query (uid + potId)', true, async () => {
    if (!creds && allowed) {
      const { deletePotTransactionsByPot } = await import(base + 'db.js');
      await deletePotTransactionsByPot(uid, 'smoke-pot');
    } else {
      const snap = await getDocs(query(collection(db, 'potTransactions'), where('uid', '==', uid), where('potId', '==', 'smoke-pot')));
      const b = writeBatch(db); snap.docs.forEach(d => b.delete(d.ref)); await b.commit();
    }
  });
  await t('potTxn: old-style query by potId only rejected', false, () => getDocs(query(collection(db, 'potTransactions'), where('potId', '==', 'smoke-pot'))));

  // ── auditLog ────────────────────────────────────────────────────────────────
  const audit = (over = {}) => ({ uid, action: 'create', collection: 'expenses', docId: 'smoke', timestamp: serverTimestamp(), userAgent: 'smoke', ...over });
  await t('audit: valid create', true, () => addDoc(collection(db, 'auditLog', uid, 'entries'), audit()));
  await t('audit: client-supplied timestamp rejected', false, () => addDoc(collection(db, 'auditLog', uid, 'entries'), audit({ timestamp: new Date() })));
  await t('audit: bad action rejected', false, () => addDoc(collection(db, 'auditLog', uid, 'entries'), audit({ action: 'hack' })));
  await t('audit: extra field rejected', false, () => addDoc(collection(db, 'auditLog', uid, 'entries'), audit({ extra: 1 })));
  await t("audit: writing into someone else's log rejected", false, () => addDoc(collection(db, 'auditLog', 'someone-else', 'entries'), audit({ uid: 'someone-else' })));
  await t('audit: read rejected', false, () => getDocs(collection(db, 'auditLog', uid, 'entries')));

  // ── single-document collections ─────────────────────────────────────────────
  await t('settings: read own', true, () => getDoc(doc(db, 'userSettings', uid)));
  await t("settings: read someone else's", false, () => getDoc(doc(db, 'userSettings', 'someone-else')));
  await t('settings: salaryDay 99 rejected', false, () => setDoc(doc(db, 'userSettings', uid), { salaryDay: 99 }, { merge: true }));
  await t("accounts: write someone else's doc rejected", false, () => setDoc(doc(db, 'accounts', 'someone-else'), { accounts: [] }));
  await t('budgetMonth: own doc id valid', true, () => setDoc(doc(db, 'budgetMonths', uid + '_1999-01'), { income: [], payments: [] }));
  await t('budgetMonth: delete own', true, () => deleteDoc(doc(db, 'budgetMonths', uid + '_1999-01')));
  await t("budgetMonth: someone else's doc id rejected", false, () => setDoc(doc(db, 'budgetMonths', 'someone-else_2026-01'), { income: [], payments: [] }));
  await t('budgetMonth: malformed id rejected', false, () => setDoc(doc(db, 'budgetMonths', uid + '_junk'), { income: [], payments: [] }));
  await t('unknown collection rejected', false, () => setDoc(doc(db, 'random', 'x'), { a: 1 }));

  // ── cleanup ─────────────────────────────────────────────────────────────────
  if (e1) { try { await deleteDoc(doc(db, 'expenses', e1.id)); } catch (_) {} }

  console.table(results);
  const failed = results.filter(r => r.result === 'FAIL');
  console.warn(`RULES SMOKE TEST (${user.email}): ${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length) console.warn('FAILED:\n' + failed.map(f => `- ${f.test}: expected ${f.expected}, got ${f.actual}`).join('\n'));
  return results;
}
console.warn('Loaded. Now run: await runRulesSmokeTest()');
