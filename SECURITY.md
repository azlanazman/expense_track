# Security Setup Guide

## Overview

This app stores private financial data. Security depends on:
1. Firebase Authentication (Google Sign-In)
2. Firestore Security Rules (in `firestore.rules`)
3. API key domain restrictions in Google Cloud Console
4. GitHub Actions secrets injection (keeps keys out of git history)

## Required GitHub Secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add:

| Secret name | Where to find it |
|-------------|-----------------|
| `FIREBASE_API_KEY` | Firebase Console → Project settings → Your apps |
| `FIREBASE_AUTH_DOMAIN` | Firebase Console → Project settings → Your apps |
| `FIREBASE_PROJECT_ID` | Firebase Console → Project settings → Your apps |
| `FIREBASE_STORAGE_BUCKET` | Firebase Console → Project settings → Your apps |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase Console → Project settings → Your apps |
| `FIREBASE_APP_ID` | Firebase Console → Project settings → Your apps |
| `RECAPTCHA_KEY` | reCAPTCHA admin console (optional — see App Check section) |

After adding secrets, **change GitHub Pages deployment source** to the `gh-pages` branch (Settings → Pages → Deploy from branch → gh-pages).

## How It Works

- `main` branch: `firebase.js` contains `__PLACEHOLDER__` strings (safe to commit)
- On push to main: GitHub Actions runs, injects real values, deploys to `gh-pages`
- `gh-pages` branch: deployed site with real values (never edited directly)

## Local Development

The `main` branch has placeholder values in `js/firebase.js`. For local development:

1. Copy `js/firebase.js` somewhere safe
2. Replace the `__PLACEHOLDER__` values with your real Firebase config
3. Never commit the file with real values

Alternatively, add a pre-commit hook that checks for placeholder values.

## Firebase App Check (Optional but Recommended)

App Check adds verification that requests come from your app domain, preventing API abuse:

1. Go to Firebase Console → App Check → Register app
2. Choose reCAPTCHA v3 and register your domain
3. Copy the site key from Google reCAPTCHA Admin (console.cloud.google.com → reCAPTCHA Enterprise)
4. Add it as the `RECAPTCHA_KEY` secret

## API Key Domain Restrictions

Even though Firebase web API keys are public by design, restrict yours to your domain:

1. Google Cloud Console → APIs & Services → Credentials
2. Click your API key → Application restrictions → HTTP referrers
3. Add your GitHub Pages domain: `https://<username>.github.io/*`

## SRI Hash for SheetJS

The export feature loads SheetJS from a CDN. To enable Subresource Integrity protection:

1. Compute the hash:
   ```bash
   curl -s https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js \
     | openssl dgst -sha384 -binary | base64
   ```
2. In `js/export.js` and `js/log.js`, update the `ensureSheetJS()` function:
   ```js
   s.integrity = 'sha384-<your-computed-hash>';
   s.crossOrigin = 'anonymous';
   ```

## Firestore Rules

Rules are in `firestore.rules`. Deploy them after any change:
```bash
firebase deploy --only firestore:rules
```

Key protections in current rules:
- Every document read/write requires the caller's UID to match the stored UID
- `amount` must be `> 0` and `< 1,000,000`
- `date` must match `YYYY-MM-DD` format
- `notes` and text fields capped at 500 characters
- Transfers are immutable after creation (`allow update: if false`)
- `auditLog` is write-only (no reads/updates/deletes)
- Catch-all `deny` at the bottom
