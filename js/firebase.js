import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app-check.js';

// Values are injected by GitHub Actions (see SECURITY.md).
// For local development: replace __PLACEHOLDER__ values with your real Firebase config.
// Never commit a file with real values — the placeholders are intentional.
const firebaseConfig = {
  apiKey:            "__FIREBASE_API_KEY__",
  authDomain:        "__FIREBASE_AUTH_DOMAIN__",
  projectId:         "__FIREBASE_PROJECT_ID__",
  storageBucket:     "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId:             "__FIREBASE_APP_ID__"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// App Check — inject __RECAPTCHA_KEY__ via GitHub Actions secret RECAPTCHA_KEY.
// See SECURITY.md for setup instructions.
const _rk = "__RECAPTCHA_KEY__";
if (_rk !== "__RECAPTCHA_KEY__") {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(_rk),
    isTokenAutoRefreshEnabled: true,
  });
}
