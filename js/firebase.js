import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';

const PROD_CONFIG = {
  apiKey: "AIzaSyCZVMB-jFO3XnqC3fsm8Ue0qoqAGRYJ_7A",
  authDomain: "expense-track-5b2d3.firebaseapp.com",
  projectId: "expense-track-5b2d3",
  storageBucket: "expense-track-5b2d3.firebasestorage.app",
  messagingSenderId: "21700594656",
  appId: "1:21700594656:web:cdfd84a4e6d4d07273f985"
};

// Test project (public web config, same sensitivity as production's).
// Used automatically on localhost so local development never touches real data.
// Add ?env=prod to a localhost URL to deliberately use production.
const TEST_CONFIG = {
  apiKey: "AIzaSyBE4M6pVaJMhw6-4TQq2D2dP99T4nNKRk8",
  authDomain: "expense-track-test-4748f.firebaseapp.com",
  projectId: "expense-track-test-4748f",
  storageBucket: "expense-track-test-4748f.firebasestorage.app",
  messagingSenderId: "292373240716",
  appId: "1:292373240716:web:0a418dffb65b1b499b14a9"
};

const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const FORCE_PROD = new URLSearchParams(location.search).get('env') === 'prod';
const firebaseConfig = IS_LOCAL && !FORCE_PROD ? TEST_CONFIG : PROD_CONFIG;
export const ENV_NAME = firebaseConfig === TEST_CONFIG ? 'test' : 'prod';
if (ENV_NAME === 'test') document.title = '[TEST] ' + document.title;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// App Check is not enabled. If it is added later, put the (public) reCAPTCHA site key directly in
// this file and call initializeAppCheck(app, ...) with it; do not rely on a build-time placeholder.
