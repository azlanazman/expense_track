import { signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';

import { auth, provider } from './firebase.js';
import { currentUser, setCurrentUser, setUserSettings } from './state.js';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENTS, showToast } from './helpers.js';
import { fetchUserSettings, persistUserSettings } from './db.js';
import { openAddSheet, closeAddSheet, isAddSheetOpen, clearAddState } from './add.js';
import { clearLogState } from './log.js';
import { initPocket, refreshPocket, clearPocketState } from './pocket.js';
import { initReport, refreshReport, openTransactions, openTransactionsOnDate, clearReportState } from './report.js';
import { renderSettings } from './settings.js';
import { initBudget, refreshBudget, clearBudgetState } from './budget.js';
import { clearAccountsState } from './accounts.js';
import { clearSavingsState } from './savings.js';
import { clearAnalysisState, reopenAnalysis, initAnalysis } from './analysis.js';
import { initOnboarding } from './onboarding.js';
import { DEMO_EMAIL, seedDemoDataIfNeeded } from './demo.js';
import { registerServiceWorker } from './pwa.js';
import { appLockActive, lockOnAuth } from './applock.js';

registerServiceWorker();   // installable app + offline shell (skipped on localhost, see pwa.js)

// ── Production: silence console output ──────────────────────────────────────
if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  console.log = console.info = console.debug = () => {};
}

// ── Navigation ──────────────────────────────────────────────────────────────

// Set when Report was opened from Analysis (day detail): the phone's back button then returns to Analysis
let returnToAnalysis = false;

export function showScreen(name) {
  returnToAnalysis = false;   // any other navigation cancels the way back
  ['insights', 'report', 'budget', 'settings'].forEach(s => {
    document.getElementById(`screen-${s}`).style.display = s === name ? '' : 'none';
    document.getElementById(`nav-${s}`).classList.toggle('on', s === name);
  });
  if (name !== 'budget') document.getElementById('acc-transfer-fab').classList.remove('show');
  sessionStorage.setItem('activeScreen', name);
}

document.getElementById('nav-add').addEventListener('click', () => openAddSheet());
document.getElementById('nav-insights').addEventListener('click', () => { initPocket(); showScreen('insights'); });
document.getElementById('nav-report').addEventListener('click', () => { initReport(); showScreen('report'); });
document.getElementById('nav-budget').addEventListener('click', () => { initBudget(); showScreen('budget'); });
document.getElementById('nav-settings').addEventListener('click', () => { renderSettings(); showScreen('settings'); });

// Intercept phone back button — close any open sub-page instead of leaving the app
window.addEventListener('popstate', () => {
  if (isAddSheetOpen()) { closeAddSheet(true); return; }   // back button closes the Add sheet first
  const openSubPage = document.querySelector('.sub-page.active');
  if (openSubPage) { openSubPage.classList.remove('active'); return; }
  if (returnToAnalysis) { returnToAnalysis = false; showScreen('insights'); initPocket(); reopenAnalysis(); }
});

document.addEventListener('nav:show-log-transfers', () => {
  showScreen('report');
  openTransactions({ transfers: true });
});

// Analysis › "See N transactions" (a day) or "Open <category> in Report": close the Analysis page and open Report › Transactions, filtered
document.addEventListener('nav:show-transactions-date', (e) => {
  document.querySelector('.sub-page.active')?.classList.remove('active');
  showScreen('report');
  history.pushState(null, '');          // so the phone's back button has a step to take
  returnToAnalysis = true;              // (set after showScreen, which clears it)
  const { date = '', anchor = date, category = '' } = e.detail;
  openTransactionsOnDate(anchor, { date, category });
});

document.addEventListener('nav:go-home', () => {
  initPocket();
  showScreen('insights');
});

// An expense was saved, edited or deleted: refresh whichever screen is underneath (keeps its filters and period)
document.addEventListener('expenses:changed', (e) => {
  const screen = sessionStorage.getItem('activeScreen');
  if      (screen === 'insights') refreshPocket(e.detail?.category);
  else if (screen === 'report')   refreshReport();
  else if (screen === 'budget')   refreshBudget();
});

// ── 15-minute idle session timeout (C2) ─────────────────────────────────────

const IDLE_MS = 15 * 60 * 1000;
const WARN_MS = IDLE_MS - 60_000;
let idleTimer, warnTimer;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(warnTimer);
  if (!currentUser) return;
  if (appLockActive()) return;   // installed app with the fingerprint lock on: stays signed in, the lock is the gate
  warnTimer = setTimeout(() => showToast('Session expiring in 60 s — tap to stay'), WARN_MS);
  idleTimer = setTimeout(() => { if (currentUser) signOut(auth); }, IDLE_MS);
}

['mousemove', 'keydown', 'touchstart', 'click'].forEach(evt =>
  document.addEventListener(evt, resetIdleTimer, { passive: true }));

// Turning the app lock on or off changes whether the idle sign-out applies; "Sign out instead" on the lock screen
document.addEventListener('applock:changed', resetIdleTimer);
document.addEventListener('applock:signout', () => signOut(auth));

// ── Clear financial state from memory ────────────────────────────────────────

function clearAllFinancialState() {
  clearAddState();
  clearLogState();
  clearPocketState();
  clearBudgetState();
  clearReportState();
  clearAccountsState();
  clearSavingsState();
  clearAnalysisState();
}

// ── visibilitychange: clear state when tab hidden (M1) ───────────────────────

document.addEventListener('visibilitychange', () => {
  if (!currentUser) return;
  if (document.hidden) {
    clearAllFinancialState();
  } else {
    const screen = sessionStorage.getItem('activeScreen');
    if      (screen === 'budget')   initBudget();
    else if (screen === 'report')   initReport();
    else if (screen === 'insights') initPocket();
    // The Analysis sub-page sits over Insights: its content was cleared when the tab was hidden, so load it again
    if (document.getElementById('analysis-page')?.classList.contains('active')) initAnalysis();
  }
});

// ── Auth ─────────────────────────────────────────────────────────────────────

document.getElementById('btn-google-signin').addEventListener('click', async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { console.error(e); showToast('Sign-in failed — please try again'); }
});

document.getElementById('btn-demo-signin').addEventListener('click', async () => {
  const btn = document.getElementById('btn-demo-signin');
  btn.disabled = true;
  btn.textContent = 'Loading demo…';
  try {
    await signInWithEmailAndPassword(auth, DEMO_EMAIL, 'TrackMoney!23');
  } catch (e) {
    console.error(e);
    showToast('Demo sign-in failed — please try again');
    btn.disabled = false;
    btn.textContent = 'Try Demo';
  }
});

document.getElementById('btn-signout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  lockOnAuth(user);   // drops a lock that belongs to someone else, the demo account or a signed-out device
  if (user) {
    setCurrentUser(user);
    resetIdleTimer();

    if (user.email === DEMO_EMAIL) {
      const btn = document.getElementById('btn-demo-signin');
      btn.disabled = true;
      btn.textContent = 'Setting up demo…';
      try { await seedDemoDataIfNeeded(user.uid); } catch (_) {}
    }

    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('app').style.display = '';
    let settings;
    try {
      settings = await loadUserSettings();
    } catch (e) {
      console.error(e);
      // Firestore rules only admit the owner's Google accounts and the demo account.
      if (e && e.code === 'permission-denied') {
        showToast('This account is not authorised to use this app');
        await signOut(auth);
        return;
      }
      throw e;
    }
    if (settings?.onboardingComplete) {
      const saved = sessionStorage.getItem('activeScreen');
      if      (saved === 'budget')   { initBudget();     showScreen('budget'); }
      else if (saved === 'settings') { renderSettings(); showScreen('settings'); }
      else if (saved === 'report')   { initReport();     showScreen('report'); }
      else                           { initPocket();     showScreen('insights'); }
    } else {
      document.getElementById('onboarding-overlay').style.display = 'flex';
      initOnboarding(user.uid);
    }
  } else {
    setCurrentUser(null);
    clearTimeout(idleTimer);
    clearTimeout(warnTimer);
    clearAllFinancialState();
    sessionStorage.removeItem('activeScreen');
    document.getElementById('screen-login').style.display = '';
    document.getElementById('app').style.display = 'none';
  }
});

// ── User settings ────────────────────────────────────────────────────────────

async function loadUserSettings() {
  let settings = await fetchUserSettings(currentUser.uid);
  if (settings) {
    if (settings.salaryDay === undefined) {
      settings = { ...settings, salaryDay: 25 };
      await persistUserSettings(currentUser.uid, settings);
    }
    setUserSettings(settings);
  } else {
    const defaults = { categories: DEFAULT_CATEGORIES, paymentMethods: DEFAULT_PAYMENTS, salaryDay: 25 };
    setUserSettings(defaults);
    await persistUserSettings(currentUser.uid, defaults);
    settings = defaults;
  }
  return settings;
}
