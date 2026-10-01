# Daily Expense Tracker

A mobile-first personal expense tracker. Vanilla HTML/CSS/JS (ES modules, no build step), Firebase Auth + Firestore, hosted on GitHub Pages.

Live: https://azlanazman.github.io/expense_track/ (use "Try Demo" to look around).

## Screens

Add, Log (browse, filter, edit, export), Report (monthly totals, category breakdown, payment grid, export), Budget (monthly fixed-bill checklist and income), Accounts (balances and transfers), Savings (pots), Insights (spending, habits and savings lenses), Settings (categories, payment methods, salary day, data tools). First sign-in runs onboarding.

## Run locally

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

ES modules need http, not `file://`. On localhost the app automatically talks to the **test** Firebase project (tab title starts with `[TEST]`); add `?env=prod` to use production deliberately.

## Deploy

GitHub Pages serves the `main` branch (root). Push or merge to `main` and the site updates within a few minutes. Firestore rules are deployed separately (Firebase console → Firestore → Rules, or `firebase deploy --only firestore:rules --project prod`). See `SECURITY.md` before changing rules, and `CLAUDE.md` for architecture and development conventions.

## Setting up a fresh Firebase project

1. Create a Firebase project; enable Firestore, Google sign-in and (for the demo) Email/Password.
2. Put the web app config in `js/firebase.js` (`PROD_CONFIG` / `TEST_CONFIG`).
3. Add your Pages domain and `localhost` to Authentication → Authorised domains.
4. Publish `firestore.rules` and deploy `firestore.indexes.json` (`firebase deploy --only firestore --project <alias>`; aliases are in `.firebaserc`). Edit the owner email allowlist at the top of the rules first.

## Checks before committing

```bash
node scripts/check-escape.js     # flags user data interpolated into HTML without escapeHtml()
```
