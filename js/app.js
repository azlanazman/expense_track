import { signInWithPopup, onAuthStateChanged, signOut }
  from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';

import { auth, provider } from './firebase.js';
import { currentUser, setCurrentUser, setUserSettings } from './state.js';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENTS } from './helpers.js';
import { fetchUserSettings, persistUserSettings } from './db.js';
import { initAdd } from './add.js';
import { initLog } from './log.js';
import { initReport } from './report.js';
import { renderSettings } from './settings.js';
import { initBudget } from './budget.js';

// ── Navigation ──────────────────────────────────────────────────────────────

export function showScreen(name) {
  ['add', 'log', 'report', 'budget', 'settings'].forEach(s => {
    document.getElementById(`screen-${s}`).style.display = s === name ? '' : 'none';
    document.getElementById(`nav-${s}`).classList.toggle('on', s === name);
  });
}

document.getElementById('nav-add').addEventListener('click', () => showScreen('add'));
document.getElementById('nav-log').addEventListener('click', () => { initLog(); showScreen('log'); });
document.getElementById('nav-report').addEventListener('click', () => { initReport(); showScreen('report'); });
document.getElementById('nav-budget').addEventListener('click', () => { initBudget(); showScreen('budget'); });
document.getElementById('nav-settings').addEventListener('click', () => { renderSettings(); showScreen('settings'); });

// ── Auth ────────────────────────────────────────────────────────────────────

document.getElementById('btn-google-signin').addEventListener('click', async () => {
  try { await signInWithPopup(auth, provider); }
  catch (e) { console.error(e); alert('Sign-in failed: ' + e.message); }
});

document.getElementById('btn-signout').addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    setCurrentUser(user);
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('app').style.display = '';
    await loadUserSettings();
    initAdd();
    showScreen('add');
  } else {
    setCurrentUser(null);
    document.getElementById('screen-login').style.display = '';
    document.getElementById('app').style.display = 'none';
  }
});

// ── User settings ───────────────────────────────────────────────────────────

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
  }
}
