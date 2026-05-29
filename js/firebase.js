import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js';
import { getAuth, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.3.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyCZVMB-jFO3XnqC3fsm8Ue0qoqAGRYJ_7A",
  authDomain: "expense-track-5b2d3.firebaseapp.com",
  projectId: "expense-track-5b2d3",
  storageBucket: "expense-track-5b2d3.firebasestorage.app",
  messagingSenderId: "21700594656",
  appId: "1:21700594656:web:cdfd84a4e6d4d07273f985"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();
