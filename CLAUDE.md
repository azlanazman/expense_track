# Daily Expense Tracker — Claude Code Guide

## Project overview

Mobile-first personal expense tracker. Google Sign-In (Firebase Auth), Firestore database, GitHub Pages hosting. No build step — plain HTML/CSS/vanilla JS with ES modules. `index.html` = HTML skeleton + ALL CSS; logic split into `js/` modules.

Design (redesign shipped 2026-10-02; the locked spec is the project doc `09-redesign-decisions.md`, the as-built log is doc `11`): **cream plates with a hard bottom edge** ("Pocket + Tape"). Every card, chip, key and segmented control is a raised plate (`border:0; box-shadow:0 4px 0 var(--edge)`) on a `--screen-bg` page; chips press down 3px. Light is the default theme, Dark is an option (Settings › Appearance). The bottom nav is dark in both themes with a raised round yellow Add button. Accent = yellow (`--accent`), the only accent; orange is reserved for the Insights dial and Tape selection (`--pk-knob`). Selected chips/keys are ink-dark (`.chip.on` = `--ink` bg, `--screen-bg` text). Text on yellow fills always uses dark ink (`--on-accent`) — never white.

---

## Repo structure

```
index.html              # HTML skeleton + ALL CSS (source of truth for styles)
vendor/                 # Vendored third-party libs (SheetJS only); see vendor/README.md
SECURITY.md             # Security layers, known limitations, environments and testing
js/
  app.js                # Entry point: auth, navigation, session timeout, state clearing
  firebase.js           # Firebase init (environment switch by hostname)
  state.js              # Shared mutable state (currentUser, userSettings)
  helpers.js            # Pure utils: fmt, catColor, showToast, escapeHtml, sanitise*
  db.js                 # All Firestore operations + audit log
  export.js             # Report → Export to Sheets (.xlsx via vendored SheetJS, lazy-loaded)
  onboarding.js         # New-user onboarding overlay
  theme.js              # Plain (non-module) script in <head>: sets data-theme from localStorage('theme') before first paint
  add.js                # Add Expense bottom sheet (opened by the round + in the nav; not a screen)
  log.js                # Transactions view of the Report (was the Log screen): list, edit/delete, Transfers chip, export
  report.js             # Report screen: period + Summary | Transactions switch; owns the period and entries
  settings.js           # Screen 4 — Settings
  budget.js             # Screen 5 — Budget overview/checklist + sub-tab routing
  budget-templates.js   # Budget templates sub-page (Settings)
  accounts.js           # Budget → Accounts sub-tab + Transfer flow
  savings.js            # Budget → Savings sub-tab
  tape.js               # Shared Tape pieces: strips, LED bar, static LCD, category icons, on-track/watch/over rule (phase E)
  pocket.js             # Insights home: dial + LCD + Tape strips for the current salary period (new in phase D)
  analysis.js           # Analysis sub-page (plates; phase A = Am I improving?), opened from Insights › Full analysis
  holidays.js           # Federal Malaysian public holidays 2025-2027 (Analysis)
  limit-sheet.js        # Category limit sheet (opened from Budget strips)
firestore.rules
```

`init*()` / `render*()` called from `app.js` nav handlers. Module-level event listeners wired at import time.

**Cross-tab navigation** (avoids circular imports) — custom DOM events in `app.js`:
- `nav:show-log-transfers` — accounts.js dispatches; app.js opens Report › Transactions with the Transfers chip on (`openTransactions({transfers:true})`)
- `nav:go-home` — onboarding.js dispatches on completion; app.js opens the Report
- `expenses:changed` — add.js (after a save) and log.js (after an edit/delete) dispatch; app.js reloads the screen underneath (`refreshReport` / `refreshBudget`), keeping its period and filters

---

## Security

### Rules (non-negotiable)

- **Never use `innerHTML` with user-supplied data.** Always call `escapeHtml(str)` from `helpers.js` first. This includes: category names, payment method names, account names, notes, pot names, group/item names from templates.
- **Never write to Firestore without sanitising.** Call `sanitiseAmount(n)`, `sanitiseDate(s)`, `sanitiseText(s, maxLen)` from `helpers.js` before any write. These are already called inside `db.js` write functions — don't bypass them by writing directly.
- **Never call Firestore APIs directly from screen modules.** All reads and writes go through `db.js`. This ensures audit logging and sanitisation are never skipped.
- **Run `node scripts/check-escape.js` before committing.** It is a tripwire that flags `${name}`-style interpolations of user-text fields in HTML templates. If a flagged value is provably safe (fixed list, number), add `// escape-ok` on that line only when the line is plain JS, never inside a template literal; otherwise wrap in `escapeHtml()`. It cannot see multi-line templates, so review still matters.

### Helpers (`helpers.js`)

```js
escapeHtml(str)              // encode &, <, >, ", ' — use before any innerHTML with user data
sanitiseText(val, maxLen)    // trim + cap at maxLen chars (default 200)
sanitiseAmount(val)          // throws if ≤ 0 or ≥ 1,000,000; returns rounded float
sanitiseDate(val)            // throws if not "YYYY-MM-DD" format
```

### Session & state

- **15-minute idle timeout** in `app.js` — resets on mouse/key/touch/click. Warns at 14 min via toast, signs out at 15 min. Skipped while the App lock is in force (`appLockActive()` in `js/applock.js`).
- **App lock (`js/applock.js`):** Settings › App lock (installed app only, not the demo account) registers a WebAuthn platform credential (fingerprint / screen lock). Credential id and uid live in `localStorage` (`applock.cred`, `applock.uid`) per device. `#lock-screen` covers the app on cold start and on return after more than 30 s away (a plain page refresh of an already-unlocked app does not ask again: `sessionStorage` `applock.ok` / `applock.away`, only honoured when the navigation type is `reload`) (also covers it when backgrounded so the app switcher shows nothing); `#app` is `inert` while locked. Unlock = `navigator.credentials.get` with `userVerification: 'required'`, checking challenge, origin and the user-verified flag. It is a device-side gate only (no server check); Firestore rules remain the real protection. While on, the person stays signed in (no idle sign-out); sign-out or a different account clears it. Dev: on localhost `?applock=1` acts like the installed app (use `localhost`, WebAuthn rejects IP hosts).
- **Demo data (`js/demo.js`):** `buildDemo()` generates the demo account's data relative to today: 13 salary periods ending with the running one (salary day 25, RM 7,000), about 900 expenses, transfers and savings-pot transactions, budget months, limits, goal and two trips. Ids are deterministic (`dm-e-0001`, `dm-t-…`, `dm-p-…`), so seeding is idempotent. `seedDemoDataIfNeeded(uid)` regenerates (via `deleteAllUserData`, then batched writes, `userSettings` last) when the account is empty, `demoVersion` differs from `DEMO_VERSION`, or the seed is older than `REFRESH_DAYS` (14). Bump `DEMO_VERSION` after changing the generator. Settings › Reset demo data forces a regeneration.
- **Swipe between views (`js/swipe.js`):** `onSwipe(el, fn)` calls `fn(+1)` / `fn(-1)` for a left / right swipe (60 px, mostly horizontal, under 0.7 s; ignored on form fields and inside sideways-scrolling areas such as the report table). Used by Report › Summary (Variable / Fixed / Combined, `setReportTab`) and Budget (Overview / Accounts / Savings, `switchSubTab`); `slideIn()` adds a short slide animation. Tapping the tab bars still works as before.
- **On signOut / tab hide:** `clearLogState()`, `clearBudgetState()`, `clearReportState()`, `clearAccountsState()`, `clearSavingsState()`, `clearInsightsState()` wipe financial data from memory. Each module exports its own `clear*State()` function.
- **visibilitychange** in `app.js`: clears state on tab hide, re-initialises active screen on tab show, and also reloads the Analysis sub-page if it is open (`initAnalysis()`); otherwise it came back blank because hiding the tab empties `#analysis-body`.
- `sessionStorage` stores only the active screen name — never financial data.

### Firestore rules summary

- **Who is admitted:** only the owner's verified Google accounts (email allowlist at the top of `firestore.rules`) and the public demo email/password account. Everyone else is denied by the catch-all. Each admitted user can only read or write documents under their own uid. If you add an owner account, edit the allowlist in BOTH `firestore.rules` and `scripts/rules-smoke-test.js`.
- `expenses`, `transfers`, `potTransactions`: key allowlists plus full validation on create, and on update for expenses (uid is pinned, so a document can never be re-assigned). If you add a field to a document written by `db.js`, add it to the matching `valid*` function in `firestore.rules` or the write will be rejected.
- List queries MUST include `where('uid', '==', uid)`. Rules are not filters, so a query without it is rejected outright.
- `auditLog` entries must carry `timestamp: serverTimestamp()` and only the known keys.
- **Testing rule changes:** publish to the TEST project, run `scripts/rules-smoke-test.js` in the browser console on localhost (as the owner, the demo account, and a stranger account), then deploy to production. Deploy with `firebase deploy --only firestore:rules --project test` (or `prod`); indexes are in `firestore.indexes.json`.

- Ownership enforced on every collection via `request.auth.uid`
- `amount`: number, `> 0`, `< 1,000,000`
- `date`: string matching `YYYY-MM-DD`
- `notes` / text fields: `≤ 500` chars
- `transfers` and `potTransactions`: **immutable** after creation (`allow update: if false`)
- `auditLog/{uid}/entries`: create-only — no read, update, or delete
- Catch-all deny at bottom

### Audit log

Every `addExpense`, `updateExpense`, `deleteExpense`, `addTransfer`, `addPotTransaction` in `db.js` calls `writeAuditLog(action, collection, docId)` — fire-and-forget, never blocks the main operation. Writes to `auditLog/{uid}/entries/{auto-id}`.

### `markPaid` with zero amount

If a checklist item is marked paid with amount = 0, no `expenses` doc is created (Firestore rules reject amount ≤ 0). The payment is still recorded in `budgetMonths` with `expenseId: null`.

---

## Content-Security-Policy and third-party code
- `index.html` has a CSP `<meta>` tag. Scripts may load only from `'self'`, `www.gstatic.com` (Firebase SDK) and `apis.google.com` (Google sign-in popup). No inline `<script>` and no inline event handlers (`onclick=` etc.): attach listeners in JS.
- Do not add a CDN `<script>`. Put third-party libraries in `vendor/` (with licence, version in the file name, and an entry in `vendor/README.md`) and load them by relative path.
- Any new external host the app calls (fonts, APIs, images) must be added to the right directive in the CSP, and tested on localhost with the console open: a violation shows as "Refused to ...".

## PWA
- `manifest.webmanifest`, `sw.js` (service worker, repo root so its scope is the whole site), `js/pwa.js` (registers it; skipped on localhost unless `?sw=1`), `favicon.svg` and `icons/` (PNG sizes generated by `scripts/icons/mark.py` then `render.py`; yellow "T" on a pure black `#000` background). The login screen shows `favicon.svg` as an `<img class="login-mark">`.
- `sw.js` caches only an allowlist of static files and never touches Firestore/Auth or other API calls. The site's own files are network-first with revalidation, so deploys need no cache bump. Bump `VERSION` in `sw.js` only when its caching logic changes. Third-party libs stay in `vendor/` with versioned file names (cache-first).
- To test the service worker locally open `http://localhost:8000/?sw=1`; unregister it in DevTools → Application afterwards.

## Environments

- **Production:** Firebase project `expense-track-5b2d3`, served by GitHub Pages from `main` (root).
- **Test:** Firebase project `expense-track-test-4748f`. `js/firebase.js` selects it automatically when the page runs on `localhost` / `127.0.0.1`, and the tab title is prefixed `[TEST]`. Add `?env=prod` to a localhost URL to deliberately use production.
- Run locally with `python3 -m http.server 8000` in the repo folder, then open `http://localhost:8000`.
- The test project needs the same `firestore.rules` published (Firebase console → Firestore → Rules) and the composite indexes on `(uid, date)` for `expenses` and `transfers` (the console error link creates them). Its demo user is `demo@expense-track.app`.

---

## Design system

**Font:** Plus Jakarta Sans (400/500/600/700/800). Always: `-webkit-font-smoothing: antialiased`, `font-feature-settings: "ss01" 1, "cv01" 1`.

**Tabular numerals:** `font-variant-numeric: tabular-nums` on ALL money values and report figures.

**Global form element reset** in `index.html`: `button, input, select, textarea { font: inherit; }` — ensures all form elements use Plus Jakarta Sans.

**Theme tokens:** `:root` holds the light set (page `--screen-bg #E8E4DA`, plate `--surface #F4F1E8`, `--edge #C9C3B1`, `--inset #D9D4C6`, `--nav #181B1F`); `:root[data-theme="dark"]` overrides them (page `#121315`, plate `#1D1E22`, edge `#070708`, inset `#0E0F11`, nav `#08080A`). Keep using the old variable names below — they are remapped to the new palette. New work uses `var(--edge)` for the hard bottom edge and `var(--inset)` for troughs. Never hard-code a colour that must differ between themes. The redesign CSS is appended in labelled blocks near the end of the `<style>` (`Redesign, phase A/B/C`) and overrides the older rules above it.

**CSS variables** in `index.html :root`: `--ink`/`--ink-2`/`--ink-3` (text), `--line`/`--line-2` (borders), `--surface`/`--screen-bg` (fills), `--accent`/`--accent-soft`/`--accent-line`/`--accent-ink`/`--accent-shadow`/`--on-accent` (yellow — `on-accent` is dark ink, not white), `--comp`/`--comp-soft`/`--comp-line`/`--comp-ink` (dark navy), `--amber`/`--amber-soft`/`--amber-ink`/`--on-amber` (needs-entry), `--positive`/`--positive-soft`/`--positive-ink`/`--on-positive` (green), `--danger`/`--danger-soft`/`--danger-ink`, `--radius`/`--radius-sm`/`--radius-lg`, `--sp` (spacing multiplier).

**Scoped radius override:** `#analysis-body` sets `--radius: 20px`, `--radius-sm: 12px`, `--radius-lg: 26px` — all child elements in Insights inherit these larger radii. Do not change the global `--radius` (12px) for Insights work.

### Typography scale

| Role                     | Size      | Weight | Tracking   |
|--------------------------|-----------|--------|------------|
| Screen h1                | 30px      | 800    | −0.025em   |
| Report month / log total | 22–24px   | 800    | −0.02em    |
| Stat card value          | 30px      | 800    | −0.025em   |
| Amount input (hero)      | 46px      | 800    | −0.03em    |
| Body / field value       | 16px      | 500    | —          |
| Row title / row amount   | 16px      | 700    | —          |
| Field label              | 13px      | 600    | —          |
| Eyebrow / meta           | 12.5–13px | 600    | —          |
| Section block label      | 12px      | 700    | 0.08em, UC |
| Chip label               | 14px      | 600    | —          |
| Payment pill             | 10.5–12px | 700    | 0.03em     |

### Spacing tokens

- Screen horizontal padding: `24px`
- **Type scale (use these, never a raw px):** `--fs-micro` 10 (dense chart labels only), `--fs-caption` 11 (tracked-caps labels, badges, legends), `--fs-small` 12 (notes, meta, pills), `--fs-meta` 13 (secondary text, field labels), `--fs-body` 14 (default text, chips, table cells), `--fs-title` 16 (row titles, amounts, buttons, inputs; 16px also stops iOS zooming into inputs), `--fs-head` 18 (sheet and stepper titles), `--fs-num` 22 (big card figures), `--fs-num-lg` 26 (LCD number on phones ≤360px, onboarding step titles), `--fs-display` 30 (LCD number, login and onboarding titles), `--fs-hero` 44 (Add amount). They are defined in `:root`; CSS and the inline styles in `js/*.js` both use `font-size: var(--fs-…)`. The SVG labels in the Insights dial (`font-size="10"` attributes in `pocket.js`) are in dial units and follow the 10 minimum.
- **Page headers (one style, from Insights):** `.pg-hdr` (top-level screens) holds a `.pk-top` row (`<b>TITLE</b>` tracked caps on the left, muted detail on the right: `DAY n/N` or `N DAYS` for periods, the account email on Settings). Screens with periods add a `.stepper` under it: a yellow inset capsule (`--accent-soft`) with a raised yellow `.step-btn` chevron key at each end (yellow so it does not read as another grey tab bar) and a `.step-title` label (IDs kept: `rpt-prev-month`, `budget-prev-month`, `chk-prev-month`...). A step key that cannot move is `disabled` (dimmed), never hidden. Sub-pages use `.sub-page-hdr` = round `.back-btn` + `.pk-top` title; the checklist's stepper sits under it in `.pg-hdr.sub`. Rule: round raised key = Back; wide inset capsule = step through periods. Budget hides the stepper on the Accounts and Savings sub-tabs. Budget Overview and the Checklist can step forward at most ONE period past the current salary period (`atLastAllowedPeriod()` in `budget.js`; the next key is dimmed there), so empty future `budgetMonths` docs and future-dated bill ticks are not created by accident. The Add sheet title uses the same tracked-caps style (`.as-top h2`) with a round raised close key (`.as-x`). Every other bottom sheet (category limit, trip, salary day, savings goal, account, template item) uses `.sheet-title` in the same tracked-caps style.
- Body section gap: `calc(var(--sp) * 18px)`
- Field internal padding: `calc(var(--sp) * 14px) 16px`
- Filter chip row gap: `9px`
- Chips: always `border-radius: 999px`

### Money formatting

```js
// helpers.js — use everywhere
const fmt  = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Math.round(n).toLocaleString(undefined);
// positive: `RM ${fmt(amount)}`
// negative: `−RM ${fmt(Math.abs(n))}` — en-dash, NEVER locale negative format
// total cards: `${val < 0 ? '−' : ''}RM ${fmt(Math.abs(val))}`
```

### Category colours (`helpers.js` `CATEGORY_COLOURS`, lowercase keys)

```js
food:'oklch(0.65 0.24 30)'  transport:'oklch(0.70 0.20 80)'  shopping:'oklch(0.62 0.27 345)'
health:'oklch(0.58 0.24 12)'  entertainment:'oklch(0.56 0.27 290)'  bills:'oklch(0.52 0.24 245)'
savings:'oklch(0.60 0.24 155)'  other:'oklch(0.68 0.20 125)'
// fallback: oklch(0.62 0.22 <hue>) cycling FALLBACK_HUES = [40,120,220,300,170,70,10,230]
```

### Account type icons

```js
const ACCOUNT_TYPE_ICONS = { bank:'ti-building-bank', ewallet:'ti-wallet', card:'ti-credit-card', savings:'ti-piggy-bank' };
```

### Pot colours (6 presets)

```js
const POT_COLOURS = [
  'oklch(0.62 0.115 185)', // teal
  'oklch(0.64 0.115 5)',   // coral
  'oklch(0.64 0.085 250)', // blue
  'oklch(0.64 0.085 60)',  // amber
  'oklch(0.58 0.13 145)',  // green
  'oklch(0.64 0.085 300)', // purple
];
```

---

## Firestore data model

### `expenses/{id}`
```
uid, date ("YYYY-MM-DD"), amount, category, subCategory, paymentMethod, notes, createdAt
type        "variable" | "fixed" | "income"  (undefined → "variable")
budgetItemId  links to budgetTemplates item (fixed only)
isIncome    true for entries synced from budgetMonths via syncIncomeExpense()
```

### `userSettings/{uid}`
```
categories          string[]   ordered variable category names
paymentMethods      string[]   ordered payment method names
salaryDay           number     default 25
categoryLimits      object     { [categoryName]: number } — per-category spending limits (Insights strips, Analysis)
savingsGoalPct      number     default 20 — share of income to keep (Settings › Savings goal); the Insights dial budgets income − bills − this
onboardingComplete  boolean
onboardingDate      string     ISO timestamp
consentGiven        boolean    set on tour slide 2 CTA
consentDate         string     ISO timestamp
```

### `budgetTemplates/{uid}`
```
groups: [{ id, name, items: [{ id, name, paymentMethod, defaultAmount, isVariable }] }]
```
Default scaffold: Housing · Transport · Insurance · Family · Subscriptions · Savings · Other (all empty).

### `budgetMonths/{uid}_{YYYY-MM}`
```
income:   [{ id, name, amount, account?, expenseId? }]
payments: [{ itemId, paid, amount, paidDate, expenseId }]
```
- `income[].account` — payment method name income is deposited into
- `income[].expenseId` — synced expense doc ID; written by `syncIncomeExpense()` in `budget.js`
- Auto-seeded from template on first open of a new month
- Income write: always `setDoc(..., { merge:true })` — never plain `setDoc` (clobbers `payments`)

### `accounts/{uid}`
```
accounts: [{ id, name, openingBalance, type, createdAt, adjustments?: [{ id, date, amount, createdAt }] }]
// type: "bank" | "ewallet" | "card" | "savings" — icon only
// createdAt: ISO string (not Firestore timestamp)
```
Seeded from `userSettings.paymentMethods` on first Accounts open or during onboarding. Double-seeding guard: skip if array exists and non-empty.

### `transfers/{id}`
```
uid, fromAccountId, toAccountId, amount, date ("YYYY-MM-DD"), notes, createdAt, type="transfer"
```
Immutable after creation (Firestore rule: `allow update: if false`). Month queries use compound index on `(uid, date)`.

### `savingsPots/{uid}`
```
pots: [{ id, name, linkedAccountId, targetAmount, currentBalance, colour, isMonthlyFixed, monthlyAmount, createdAt }]
```

### `potTransactions/{id}`
```
uid, potId, type ("contribute"|"withdraw"), amount, linkedAccountId, date, notes, createdAt
// linkedAccountId = account used for this transaction (may differ from pot's linkedAccountId)
```
Immutable after creation (Firestore rule: `allow update: if false`).

### `auditLog/{uid}/entries/{id}`
```
uid, action ("create"|"update"|"delete"), collection, docId, timestamp, userAgent
```
Write-only — Firestore rules block all reads, updates, deletes. Never queried by the app.

---

## Navigation

Fixed dark bottom nav, safe-area aware (`env(safe-area-inset-bottom)`), five grid slots: Insights · Report · **round + (opens the Add sheet)** · Budget · Settings.

| Tab      | Screen |
|----------|--------|
| Insights | `#screen-insights` (`js/pocket.js`); Analysis slides over it as a sub-page |
| +        | Add expense bottom sheet (`js/add.js`), not a screen |
| Report   | `#screen-report`, views Summary · Transactions (the old Log) |
| Budget   | `#screen-budget` (sub-tabs: Overview · Accounts · Savings) |
| Settings | `#screen-settings` |

Active: `.nav-item.on`. Budget and Report maintain **independent** period state. The default screen is Insights.

**Screen persistence:** `showScreen(name)` → `sessionStorage('activeScreen')`. Restored on `onAuthStateChanged` (including refresh). Cleared on signOut.

**Add sheet:** `openAddSheet()` pushes `history.pushState({addSheet:true})`, so the phone back button closes the sheet first (see `popstate` in `app.js`). The sheet is `inert` while closed, traps focus, tracks the keyboard with `visualViewport`, and swipe-down on the grab handle (>90px) dismisses it. While open `body.add-open` moves the toast to the top so it never covers Save. Closed `.bottom-sheet`s are `visibility:hidden` with no shadow (a closed sheet's shadow used to show as a grey haze above the nav).

**Phone back button:** Sub-pages call `history.pushState(null,'')` on open. `popstate` listener in `app.js` closes `.sub-page.active`. Covers: Settings → Budget Templates, Budget → Checklist.

---

## Screen behaviour (non-obvious rules only)

**Add (sheet):** Amount, then category and account chips, date chips (Today / Yesterday / Pick), optional note. Category, account and the last-used default come from `userSettings` and `localStorage('addLast')`. Save closes after the tick; Save & add another keeps the sheet open and clears the amount.

**Report › Transactions (old Log):** Shares the Report's period (Monthly / Salary / Custom and the arrows) and the Report's loaded entries: `report.js` `loadReport()` fetches once and hands the result to `log.setLogData()`; `log.js` only adds accounts and transfers for the same dates (`activateLog()`, cached per period). Edits and deletes dispatch `expenses:changed`, which reloads through the Report. Transfer rows are excluded from totals when All/payment chip active; shown only when the Transfers chip is active. Rows sorted date desc (client-side), 10 per page; a delete that empties the last page steps back one page. The list shows every non-income entry (fixed and variable), so its total matches the Summary's Combined tab, not Variable.

**Report:** Default period = Salary Period (not Monthly). Salary period: if `today >= salaryDay`, started this month; otherwise last month — auto-advances, no stored state. The header arrows step back and forward by salary period (anchor month `spYear`/`spMonth`, dates from `salaryStartForMonth`/`salaryEndForMonth` in `helpers.js`; forward stops at the current period; the year is shown in the title for older periods). Export has a fifth sheet, Details (one row per expense, with Notes). Variable expand = one sub-row per day (daily total, not per transaction). Export downloads all payment methods regardless of active filter chips.

**Report — Combined tab shared categories** (merged var+fixed when names match exactly):

| Category        | Variable side               | Fixed side                    |
|-----------------|-----------------------------|-------------------------------|
| Family          | expenses tagged "Family"    | Fixed group "Family" paid     |
| Subs            | expenses tagged "Subs"      | Fixed group "Subs" paid       |
| Car Maintenance | expenses tagged same name   | Fixed group same name         |

**Budget Overview:** Net balance = Income − Fixed − Variable. Progress bar denominator = current template items only (orphaned records excluded). Income rows have account selector pill → triggers `syncIncomeExpense()`.

**Budget Checklist:** Marking paid writes `expenses` doc (type="fixed", amount > 0) + updates `budgetMonths`. If amount = 0, only `budgetMonths` is updated (no expense doc — Firestore rules require amount > 0). Unchecking deletes the expense doc + sets `paid:false`.

**Budget Accounts:** Balance computed client-side — never stored — by the single shared function `computeAccountBalance` in `js/balance.js` (used by Accounts and the Insights net-worth chart; do not copy the formula elsewhere). It also adds `account.adjustments` (dated corrections saved by the "Set today's balances" sheet: the owner types the real balance, the difference becomes an adjustment dated today). Opening balances are not rewritten. Formula: `openingBalance + income − spend − transfersOut + transfersIn − potContributions + potWithdrawals`. All expenses for that `paymentMethod` included (no date floor). Income from `isIncome:true` expense docs.

**Budget Savings:** `currentBalance` is stored, not computed — always written through Add/Withdraw flows. Per-transaction account can differ from pot's `linkedAccountId`; `calcBalance` reads `linkedAccountId` on each `potTransaction`.

**Settings → Budget Templates:** Slide transition ≤ 220ms via `translateX`. Delete group via trash button in section header.

**Export to Sheets (`export.js`):** 4 sheets — Variable, Fixed, Combined, Income. Income sheet fetches `budgetMonths` for every calendar month overlapping the export range.

**Insights home (`pocket.js`):** reads only the current salary period (day n of N). Variable budget = income − planned bills (template amounts) − income × `savingsGoalPct`; pointer = variable spent ÷ budget; today tick = day ÷ total days; per category used = spent ÷ limit, pace = used ÷ time elapsed (Over if used ≥ 1 or pace > 1.3, Watch if pace > 1.05, else On track; no limit = Not set); overall verdict from the projected saving rate (On track ≥ goal, Watch ≥ 10%, else Over; no income = Awaiting input). Before day 4 the verdict reads "Too early" and per-category pace is ignored. Strips are the user's own categories (any number) plus Bills (paid ÷ total from the checklist) and Save. Tapping a strip selects it and fills the LCD; tapping again clears. `refreshPocket(category)` runs on `expenses:changed` and selects the category just saved. Pocket colours are `--pk-*` tokens (light and dark); category icons come from `ICON_BY_NAME` with a tag fallback. Limits are set in Analysis › Spending (a limit change dispatches `expenses:changed`).

**Tape on other screens (phase E, `tape.js`):** Budget overview = income plate, `.pk-three` plate (Income / Fixed / Save goal), static LCD net balance (income − fixed paid − variable), "Bills paid" LED-bar plate (tone from `ratioTone`) and Category limits as Tape strips (tap a strip → `openCategoryLimitSheet`, exported from `limit-sheet.js`; a limit change always dispatches `expenses:changed`). Accounts/Savings totals are static LCDs (`lcdStatic`); savings pots use `ledBar` with the pot colour. Report › Summary = static LCD total (+ daily average) and neutral Tape strips (`isStatic`, tone `n`, bar = share of the biggest category, `%` of total, all categories high→low). Checklist progress is an LED-bar plate. Onboarding account-type badges use `--tb-*` tokens (light/dark). Use `lcdStatic`/`tapeStrip`/`ledBar` for any new readout rather than new card styles.

**Category limit sheet:** `openCategoryLimitSheet(cat)` (exported from `limit-sheet.js`, opened from Budget strips) builds `.lim-overlay` / `.lim-sheet` with an `.as-amt.sm` amount trough and a `.btn-save` key (same look as the Add sheet).

**Analysis (`analysis.js`, redesign phase A; locked spec = project doc `12-analysis-redesign-decisions.md`):** Sub-page opened by `openAnalysis()` (Insights › Full analysis; pushes a history entry so the phone back button closes it); renders "plates" (one per question) into `#analysis-body`. `js/insights.js` (old 3-lens dashboard, Chart.js/treemap) is retired.

- **Time model:** 12 salary periods (`refs` = `{ year, month, start, end }`, current = last). Date filters use `e.date >= start && e.date <= end`, never `startsWith`. Periods are labelled by the month they END in (28 Feb – 27 Mar = "Mar") via the single function `periodLabel`.
- **Data:** `load()` fetches 12 periods of expenses, the template and 12 `budgetMonths`; cached in `_cache`, cleared by `clearAnalysisState()` and on `expenses:changed` (redraws if the page is open). Per period: income (budgetMonths income lines), fixed and variable expenses (`type`), `saved = income − fixed − variable`, `goal = income × savingsGoalPct`. A period with income 0 is "no data" and ignored in the stats. The current period is projected like the Insights home (planned fixed from the template + variable ÷ share of period gone; "too early" under 4 days).
- **Plates:** `PLATES` array in `analysis.js` (add new plates there). Phase A has "Am I improving?": 12 bars (solid = goal met, faded = below, dashed = current projected, green tick = that period's goal), tap a bar for the LCD detail, stats goal met / in a row / best. Styles are `.an-*` in `index.html` (plates reuse `.pk-plate`, `.pk-lcd`, `.pk-three`). Chart.js is no longer loaded by Analysis.
- **Category limit sheet:** `openCategoryLimitSheet(cat)` now lives in `js/limit-sheet.js` (imported by `budget.js`); it saves to `userSettings.categoryLimits` and dispatches `expenses:changed`.
- **Category by period (phase B):** grid of variable spend per category × 12 periods. Shade = spend ÷ that category's highest finished period (`heat()`, `--pk-knob` over `--inset`); the current period is a dashed unshaded "so far" column; trend = last 3 finished periods vs the 3 before (±4% = flat); readout compares with the median ("usual") of finished periods. Holiday row from `js/holidays.js` (federal Malaysian holidays 2025–2027, review each year; `holidaysBetween`/`holidayOn`); Trip row appears only when a tag in `userSettings.periodTags` (`{id,name,from,to}`) overlaps a period. Selected cell lives in `cell`.
- **Day by day + calendar (phase C):** `days` per period = one entry per calendar day `{ i (0 = salary day), date, d, wd (Mon=0), v (variable spend, null for future days), cats, nAll (all non-income entries that day, what Transactions lists), hol, trip }`. Plate 3 = 12 rows × 31 cells (`.an-dv`), shade scale = 75% of the biggest day in a finished period (`dayScale`), peak day outlined, holiday dot, LCD readout of heaviest / lightest day-of-period and the first-3-days average (days 29–31 need at least half the periods). Plate 4 = calendar of the selected period (`dayPer`, arrows) with highest / lowest / no-spend stats and a day detail (`dayIdx`): neutral static Tape strips per category and the button "See N transactions on D Mon ›" which dispatches `nav:show-transactions-date` `{ date }`. The back button returns to Analysis (`returnToAnalysis` in `app.js`, `reopenAnalysis()`).
- **Report › Transactions date filter:** `app.js` handles `nav:show-transactions-date` (closes the open sub-page, shows Report, calls `openTransactionsOnDate(date)` in `report.js`, which finds the salary period containing the date, loads it, switches to Transactions and calls `setLogDate(date)`). `log.js` keeps `logState.dateFilter`, applies it through `visibleEntries()` (list, count, total and export) and shows a removable `#log-date-chip` first in the filter row; a period change or the chip clears it.
- **Leaks and look-up (phase D):** `p.ents` = the period's variable entries. "Where small leaks go" looks at the last finished period: groups of 3+ entries by normalised note (`noteKey`: lower case, digits/punctuation dropped), label = most common spelling, category = most common category; falls back to category + sub-category when no note repeats; plus the 5 biggest single purchases. "Look up a category": category chips (`look`), 12 bars with a dashed usual line (median of finished periods), tap a bar to pick the period (`lookPer`), stats usual / lowest / highest, and "Open <category> (<period>) in Report ›" which dispatches `nav:show-transactions-date` `{ anchor, category }`. `log.js` has `logState.catFilter` with a removable `#log-cat-chip` next to the date chip; `setLogFilters({ date, category })` sets both and `openTransactionsOnDate(anchor, { date, category })` in `report.js` opens the salary period containing `anchor`.
- **Trips (phase E):** tags live in `userSettings.periodTags` (`[{ id, name, from, to }]`, max 40, name ≤ 40 chars, trip ≤ 90 days) and dismissed suggestions in `userSettings.tripSuggestionsDismissed` (period start dates). Both are saved with `updateUserSettings` (no rules change: `userSettings` has no key allowlist) by `saveTripSettings()` in `analysis.js`, which reverts the local copy and toasts if the write fails. "Your trips" sits in the Category-by-period plate: a chip per trip (tap to edit in `openTripSheet`, a `.lim-overlay` bottom sheet with name, From, To, Delete), "+ Add a trip", and at most one suggestion card (`findSuggestion`): newest period without a tag where Transport is ≥ 2× its usual (and ≥ RM 100 above it) or 3+ notes contain travel words (`TRIP_WORDS`: kampung, balik, tol, toll, hotel, homestay, chalet, resort). "Tag" opens the form prefilled with a suggested date span for the owner to adjust; "No" remembers the dismissal. Nothing is tagged without a Save. Trips also show where the daily trend is read: `p.trips` (all tags touching a period) and `d.trip` (the tag covering a day) drive a bar under the date in the calendar, a line under the day cells in the 12-row overview, a house on the row label, "trip day" legend items, and a "Trips in this period" block under the calendar (`calTrips`: days, spend and per-day average against the period's other days, an Edit chip per trip, and "+ Add a trip" prefilled from the selected day).
- **Cleanup done:** old Analysis CSS (`.hero*`, `.kpi*`, `.verdict`, `.lens`, `.ins-block`, `.details*`, `.lb-*`, `.hm-*`, `.flow-*`, `.pot-grid`, chart wrappers) removed from `index.html`; Chart.js and the treemap plugin are no longer used (delete `vendor/chart-4.4.0.umd.js`, `vendor/chartjs-chart-treemap-3.1.0.min.js` and their two LICENSE files with `git rm`).
- **ES module listeners:** buttons in dynamically injected HTML must use `addEventListener` after injection — module functions are not on `window`.
- **Transfer From ≠ To:** enforced with toast on confirm (not a disabled button).
- **Monthly recurring toggle** on pots = reminder label only; contributions always manual.
- **`pot-eta` variants in Insights:** `.ok` (yellow — in progress), `.done` (green — goal reached), `.warn` (coral — no recent contributions). The global savings screen uses different class names for its pot cards — do not share these styles.

---

## Defaults & presets (`helpers.js`)

```js
DEFAULT_CATEGORIES = ['Food','Transport','Shopping','Health','Entertainment','Bills','Savings','Other']
DEFAULT_PAYMENTS   = ['Cash','Bank','Credit Card','E-Wallet']
DEFAULT_PAYMENT_TYPES = { Cash:'ewallet', Bank:'bank', 'Credit Card':'card', 'E-Wallet':'ewallet' }
```

Type badge colours: bank=teal-soft, ewallet=amber-soft, card=blue-soft, savings=green-soft.
