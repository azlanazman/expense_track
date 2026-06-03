import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app-check.js';

// Values are injected by GitHub Actions (see SECURITY.md).
// For local development: replace __PLACEHOLDER__ values with your real Firebase config.
// Never commit a file with real values — the placeholders are intentional.
const firebaseConfig = {
  apiKey:            "",
  authDomain:        "",
  projectId:         "",
  storageBucket:     "",
  messagingSenderId: "",
  appId:             ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// App Check — inject  via GitHub Actions secret RECAPTCHA_KEY.
// See SECURITY.md for setup instructions.
const _rk = "";
if (_rk !== "") {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(_rk),
    isTokenAutoRefreshEnabled: true,
  });
}
