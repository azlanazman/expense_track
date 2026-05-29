# Daily Expense Tracker

A mobile-first personal expense tracker. Google Sign-In, Firestore backend, deployed as a static site on GitHub Pages.

## Setup

### 1. Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com) and create a new project.
2. Enable **Firestore Database** (start in production mode).
3. Enable **Authentication → Sign-in method → Google**.
4. Go to **Project Settings → Your apps → Add web app**, copy the config object.

### 2. Paste Firebase config

Open `index.html` and find:

```js
const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  ...
```

Replace the placeholder values with your real Firebase config.

### 3. Firestore index

On first load, the query may fail with a console link to create a composite index on `(uid ASC, date DESC)`. Click the link and create the index.

### 4. Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Source: Deploy from branch → main → / (root)**.
3. Your app will be live at `https://yourusername.github.io/repo-name`.
4. Add that URL to Firebase **Authentication → Authorised domains**.

### 5. Deploy Firestore rules

```bash
npm install -g firebase-tools
firebase login
firebase init firestore   # select your project
firebase deploy --only firestore:rules
```

## Usage

- **Add** — enter amount, date, category, payment method, and optional notes.
- **Log** — browse and filter monthly expenses; tap a row to edit or delete.
- **Report** — monthly totals, category breakdown, and a full payment × category grid.
- **Settings** — manage categories and payment methods; sign out.
