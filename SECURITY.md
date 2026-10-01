# Security

This app holds private financial data. It is a static site (GitHub Pages) talking directly to Firebase from the browser, so the browser is untrusted and **Firestore security rules are the real protection**. Everything in this repo, including the Firebase web config, is public by design.

## Layers

1. **Firestore rules** (`firestore.rules`) are the access control. Only two kinds of user are admitted, each limited to documents under their own uid:
   - the owner: Google sign-in, verified email, email on the allowlist at the top of the rules;
   - the public demo account (`demo@expense-track.app`, email/password; the password is in `js/app.js` on purpose).
   Everyone else is denied. Writes are validated (key allowlists, amount/date/text limits, uid cannot be reassigned, audit-log timestamp is server-enforced).
2. **Firebase Authentication**: Google and Email/Password providers; new-user sign-up is disabled in the console, so only existing accounts can sign in. Authorised domains are `localhost`, `azlanazman.github.io` and the project's `firebaseapp.com` / `web.app` domains.
3. **API key restriction** (Google Cloud Console): the browser key is restricted to HTTP referrers (the Pages site, the Firebase auth domains, localhost).
4. **Content-Security-Policy** (meta tag in `index.html`): limits where scripts, frames and network calls can go. All third-party libraries are vendored in `vendor/` and served from the same origin.
5. **Output escaping**: every piece of user data placed into an HTML template goes through `escapeHtml()` (`js/helpers.js`). `node scripts/check-escape.js` flags likely misses; run it before committing.
6. **Client behaviour**: 15-minute idle sign-out, screen state cleared on sign-out and when the tab is hidden, audit log of writes.

## Known limitations

- GitHub Pages cannot set response headers, so `frame-ancestors`, `X-Frame-Options` and HSTS cannot be set by us. Clickjacking protection is therefore weak. Moving to a host that supports headers (Cloudflare Pages, Netlify, Firebase Hosting) would fix that.
- A meta-tag CSP cannot be report-only; test CSP changes on localhost and watch the console for "Refused to ..." messages.
- App Check is not enabled. The demo account is public, so someone could use its quota. Mitigation: a billing budget alert in Google Cloud.
- SheetJS 0.18.5 is the last npm release and has known issues when *parsing* untrusted files. The app only writes `.xlsx`, never reads uploads. Do not add spreadsheet import without upgrading first.

## Environments and testing

- `localhost` automatically uses the **test** Firebase project (`expense-track-test-4748f`); the live site uses production. `?env=prod` on localhost forces production.
- Test rule changes in the test project first: publish `firestore.rules` there, then run `scripts/rules-smoke-test.js` in the browser console on localhost as the owner, the demo account and a stranger account (37 cases each). Then publish to production (Firebase console → Firestore → Rules; the Rules history allows rollback).
- Composite indexes the app needs are in `firestore.indexes.json`.

## Console settings to keep

- Authentication → Settings → User actions: sign-up disabled.
- Google Cloud → Credentials → browser key: HTTP referrer restriction.
- Authorised domains: no `github.com`.

## Reporting

This is a personal project. If you find a problem, open a private security advisory on the GitHub repo or contact the owner.
