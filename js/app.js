import { signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';

import { auth, provider } from './firebase.js';
import { currentUser, setCurrentUser, setUserSettings } from './state.js';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENTS, showToast } from './helpers.js';
import { fetchUserSettings, persistUserSettings } from './db.js';
import { initAdd } from './add.js';
import { initLog, showLogTransfers, clearLogState } from './log.js';
import { initReport, clearReportState } from './report.js';
import { renderSettings } from './settings.js';
import { initBudget, clearBudgetState } from './budget.js';
import { clearAccountsState } from './accounts.js';
import { clearSavingsState } from './savings.js';
import { initOnboarding } from './onboarding.js';
import { DEMO_EMAIL, seedDemoDataIfNeeded } from './demo.js';

// ── Production: silence console output ──────────────────────────────────────
if (location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
  console.log = console.info = console.debug = () => {};
}

// ── Navigation ──────────────────────────────────────────────────────────────

export function showScreen(name) {
  ['add', 'log', 'report', 'budget', 'settings'].forEach(s => {
    document.getElementById(`screen-${s}`).style.display = s === name ? '' : 'none';
    document.getElementById(`nav-${s}`).classList.toggle('on', s === name);
  });
  if (name !== 'budget') document.getElementById('acc-transfer-fab').classList.remove('show');
  sessionStorage.setItem('activeScreen', name);
}

document.getElementById('nav-add').addEventListener('click', () => showScreen('add'));
document.getElementById('nav-log').addEventListener('click', () => { initLog(); showScreen('log'); });
document.getElementById('nav-report').addEventListener('click', () => { initReport(); showScreen('report'); });
document.getElementById('nav-budget').addEventListener('click', () => { initBudget(); showScreen('budget'); });
document.getElementById('nav-settings').addEventListener('click', () => { renderSettings(); showScreen('settings'); });

// Intercept phone back button — close any open sub-page instead of leaving the app
window.addEventListener('popstate', () => {
  const openSubPage = document.querySelector('.sub-page.active');
  if (openSubPage) openSubPage.classList.remove('active');
});

document.addEventListener('nav:show-log-transfers', () => {
  showScreen('log');
  initLog().then(() => showLogTransfers());
});

document.addEventListener('nav:go-add', () => {
  initAdd();
  showScreen('add');
});

// ── 15-minute idle session timeout (C2) ─────────────────────────────────────

const IDLE_MS = 15 * 60 * 1000;
const WARN_MS = IDLE_MS - 60_000;
let idleTimer, warnTimer;

function resetIdleTimer() {
  clearTimeout(idleTimer);
  clearTimeout(warnTimer);
  if (!currentUser) return;
  warnTimer = setTimeout(() => showToast('Session expiring in 60 s — tap to stay'), WARN_MS);
  idleTimer = setTimeout(() => { if (currentUser) signOut(auth); }, IDLE_MS);
}

['mousemove', 'keydown', 'touchstart', 'click'].forEach(evt =>
  document.addEventListener(evt, resetIdleTimer, { passive: true }));

// ── Clear financial state from memory ────────────────────────────────────────

function clearAllFinancialState() {
  clearLogState();
  clearBudgetState();
  clearReportState();
  clearAccountsState();
  clearSavingsState();
}

// ── visibilitychange: clear state when tab hidden (M1) ───────────────────────

document.addEventListener('visibilitychange', () => {
  if (!currentUser) return;
  if (document.hidden) {
    clearAllFinancialState();
  } else {
    const screen = sessionStorage.getItem('activeScreen') || 'add';
    if      (screen === 'log')    initLog();
    else if (screen === 'report') initReport();
    else if (screen === 'budget') initBudget();
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
    const settings = await loadUserSettings();
    if (settings?.onboardingComplete) {
      const saved = sessionStorage.getItem('activeScreen') || 'add';
      if      (saved === 'log')      { initLog();        showScreen('log'); }
      else if (saved === 'report')   { initReport();     showScreen('report'); }
      else if (saved === 'budget')   { initBudget();     showScreen('budget'); }
      else if (saved === 'settings') { renderSettings(); showScreen('settings'); }
      else                           { initAdd();        showScreen('add'); }
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
