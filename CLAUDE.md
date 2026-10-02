# Daily Expense Tracker — Claude Code Guide

## Project overview

Mobile-first personal expense tracker. Google Sign-In (Firebase Auth), Firestore database, GitHub Pages hosting. No build step — plain HTML/CSS/vanilla JS with ES modules. `index.html` = HTML skeleton + ALL CSS; logic split into `js/` modules.

Design (redesign shipped 2026-10-02; the locked spec is the project doc `09-redesign-decisions.md`, the as-built log is doc `11`): **cream plates with a hard bottom edge** ("Pocket + Tape"). Every card, chip, key and segmented control is a raised plate (`border:0; box-shadow:0 4px 0 var(--edge)`) on a `--screen-bg` page; chips press down 3px. Light is the default theme, Dark is an option (Settings › Appearance). The bottom nav is dark in both themes with a raised round yellow Add button. Accent = yellow (`--accent`), the only accent; orange is reserved for the Insights dial and Tape selection (`--pk-knob`). Selected chips/keys are ink-dark (`.chip.on` = `--ink` bg, `--screen-bg` text). Text on yellow fills always uses dark ink (`--on-accent`) — never white.

---

## Repo structure

```
index.html              # HTML skeleton + ALL CSS (source of truth for styles)
vendor/                 # Vendored third-party libs (Chart.js, treemap plugin, SheetJS); see vendor/README.md
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
  insights.js           # Analysis sub-page (the old Insights, 3-lens dashboard), opened from Insights › Full analysis
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
- **App lock (`js/applock.js`):** Settings › App lock (installed app only, not the demo account) registers a WebAuthn platform credential (fingerprint / screen lock). Credential id and uid live in `localStorage` (`applock.cred`, `applock.uid`) per device. `#lock-screen` covers the app on cold start and on return after more than 30 s away (also covers it when backgrounded so the app switcher shows nothing); `#app` is `inert` while locked. Unlock = `navigator.credentials.get` with `userVerification: 'required'`, checking challenge, origin and the user-verified flag. It is a device-side gate only (no server check); Firestore rules remain the real protection. While on, the person stays signed in (no idle sign-out); sign-out or a different account clears it. Dev: on localhost `?applock=1` acts like the installed app (use `localhost`, WebAuthn rejects IP hosts).
- **On signOut / tab hide:** `clearLogState()`, `clearBudgetState()`, `clearReportState()`, `clearAccountsState()`, `clearSavingsState()`, `clearInsightsState()` wipe financial data from memory. Each module exports its own `clear*State()` function.
- **visibilitychange** in `app.js`: clears state on tab hide, re-initialises active screen on tab show.
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
- Screen header padding: `calc(var(--sp) * 14px) 24px calc(var(--sp) * 18px)`
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

**Tape on other screens (phase E, `tape.js`):** Budget overview = income plate, `.pk-three` plate (Income / Fixed / Save goal), static LCD net balance (income − fixed paid − variable), "Bills paid" LED-bar plate (tone from `ratioTone`) and Category limits as Tape strips (tap a strip → `openCategoryLimitSheet`, exported from `insights.js`; a limit change always dispatches `expenses:changed`, and re-runs `initInsights()` only while `#analysis-page` is open). Accounts/Savings totals are static LCDs (`lcdStatic`); savings pots use `ledBar` with the pot colour. Report › Summary = static LCD total (+ daily average) and neutral Tape strips (`isStatic`, tone `n`, bar = share of the biggest category, `%` of total, all categories high→low). Checklist progress is an LED-bar plate. Onboarding account-type badges use `--tb-*` tokens (light/dark). Chart gridlines come from `GRID()` in `insights.js`. Use `lcdStatic`/`tapeStrip`/`ledBar` for any new readout rather than new card styles.

**Category limit sheet:** `openCategoryLimitSheet(cat)` (exported from `insights.js`, opened from Budget strips and Analysis rows) builds `.lim-overlay` / `.lim-sheet` with an `.as-amt.sm` amount trough and a `.btn-save` key (same look as the Add sheet).

**Analysis (`insights.js`, formerly Budget Insights):** Sub-page opened by `openAnalysis()` (Insights › Full analysis; it pushes a history entry so the phone back button closes it); renders into `#analysis-body`.

- **Time model:** All 12 buckets are **salary periods**, not calendar months. `periodRefs` = array of `{ year, month, start, end }` where `start`/`end` are `"YYYY-MM-DD"`. Current period is always `periodRefs[11]`. All date filters use `e.date >= start && e.date <= end` — never `startsWith`.
- **Data loading:** `loadData()` fetches expenses, template, accounts, pots, transfers, potTxns, and 12 `budgetMonths` docs in one `Promise.all`. Result cached in `_cache`; nulled when a category limit changes.
- **Hero block:** net balance (38px, green/coral), verdict pill (`On track` ≥20% / `Watch` ≥10% / `Over` <10% savings rate), one-line narrative, 4-KPI strip (saved % · fixed % · variable % · RM/day), bills-paid progress bar.
- **Lens switcher:** sticky segmented control (Spending · Habits · Savings). Active lens persisted to `localStorage` under key `'insights-lens'`. Switching calls `destroyCharts()` then re-renders.
- **Details expanders:** treemap, payment-flow table, contribution chart are inside collapsible `.details` elements. Content is **lazy-rendered** — Chart.js instances created only when the expander opens (Chart.js needs a visible DOM to compute dimensions). The `makeDetailsExpander(label)` helper exposes `.setContent(fn)` to register the render callback.
- **Limit bars:** CSS-based horizontal bars (not Chart.js). Each row is a `<button>` — clicking opens `openCategoryLimitSheet(cat)` which saves to `userSettings.categoryLimits` via `updateUserSettings` and nulls `_cache` before re-running `initInsights()`.
- **`.ins-block`** is the Insights card class (white surface, border, `border-radius: var(--radius-lg)`). Do not confuse with the global `.block-label` (which is reused inside `.ins-block`).

---

## Onboarding flow

Triggered once after Sign-In if `onboardingComplete !== true`. Overlay mounts inside `#app` with `position:absolute` (not `fixed` — avoids viewport/iframe height collapse). Removed from DOM on completion (not hidden). Dispatches `nav:go-add` (circular import guard — can't import `showScreen`).

**Tour (3 slides):** slides 0–1 have "Skip tour" → jumps to Setup Step 0. Slide 2 (Security/consent) has no skip — CTA writes `consentGiven:true`.

**Setup (5 steps):**

| Step | Topic | Firestore write |
|------|-------|-----------------|
| 0 | Salary day (grid 1–31; Continue disabled until tapped) | `updateDoc userSettings { salaryDay }` |
| 1 | Categories (`General ✓ / Start blank` presets) | `updateDoc userSettings { categories }` |
| 2 | Payment methods (type badges cycle `bank→ewallet→card→savings`) | `updateDoc userSettings { paymentMethods }` + `setDoc accounts/{uid}` |
| 3 | Opening balances (RM prefix + decimal per account) | `setDoc accounts/{uid}` |
| 4 | Monthly income (Salary + Claim, neither enforced) | `setDoc budgetMonths/{uid}_{YYYY-MM} { income } { merge:true }` |

**Final screen:** writes `onboardingComplete:true` + `onboardingDate`, removes overlay, dispatches `nav:go-add`.

**Re-trigger:**
```js
await updateDoc(doc(db, 'userSettings', currentUser.uid), { onboardingComplete: false });
location.reload();
```

---

## Key invariants

- **Negative money:** always `−RM ${fmt(Math.abs(n))}` — en-dash, never locale negative. Everywhere.
- **XSS:** every user-supplied string in `innerHTML` must be wrapped in `escapeHtml()`. Never skip this.
- **Sanitisation:** `sanitiseAmount` / `sanitiseDate` / `sanitiseText` are called inside `db.js` — do not duplicate in screen modules, but do not bypass `db.js` either.
- **Income sync:** `syncIncomeExpense()` in `budget.js` creates/updates/deletes `expenses` doc (`isIncome:true, type:'income'`) when income amount or account changes. Stores `expenseId` back on income entry.
- **Budget counts:** filter payments to current template `itemId`s in both `renderBudget` and `renderChecklist` — never count orphaned records.
- **Transfer FAB:** hidden via `classList.remove('show')` in `showScreen()`. Re-shown by `switchSubTab('accounts')`.
- **Budget sub-tab wiring:** uses `btn.onclick =` (not `addEventListener`) — prevents stacked handlers on repeated `initBudget()` calls.
- **Accounts no delete:** edit name + opening balance only — deleting orphans transfers and pot links.
- **Accounts double-seed guard:** skip seed if `accounts` array exists and non-empty.
- **ES module listeners:** buttons in dynamically injected HTML must use `addEventListener` after injection — module functions are not on `window`.
- **Transfer From ≠ To:** enforced with toast on confirm (not a disabled button).
- **Monthly recurring toggle** on pots = reminder label only; contributions always manual.
- **Insights chart lazy-render:** never render Chart.js charts into hidden containers. Expander charts (treemap, payment flow, contributions) must be rendered inside `.setContent(fn)` callbacks — they only fire when the expander opens and the canvas is visible.
- **Insights `_cache` invalidation:** set `_cache = null` before calling `initInsights()` whenever data that affects the dashboard changes (currently: only `categoryLimits`). Do not bust the cache on every navigation — it's intentionally persistent across lens switches.
- **`.ins-block` vs `.block`:** Insights block cards use `.ins-block` (not `.block`) to avoid CSS conflicts with other screens. Always use `.ins-block` for new card containers in `insights.js`.
- **Insights salary-period dates:** `periodRefs[11]` is always the current period. Do not use `findIndex` to locate it. Do not use `startsWith` for date filtering — use `>=`/`<=` string comparison on `"YYYY-MM-DD"`.
- **`pot-eta` variants in Insights:** `.ok` (yellow — in progress), `.done` (green — goal reached), `.warn` (coral — no recent contributions). The global savings screen uses different class names for its pot cards — do not share these styles.

---

## Defaults & presets (`helpers.js`)

```js
DEFAULT_CATEGORIES = ['Food','Transport','Shopping','Health','Entertainment','Bills','Savings','Other']
DEFAULT_PAYMENTS   = ['Cash','Bank','Credit Card','E-Wallet']
DEFAULT_PAYMENT_TYPES = { Cash:'ewallet', Bank:'bank', 'Credit Card':'card', 'E-Wallet':'ewallet' }
```

Type badge colours: bank=teal-soft, ewallet=amber-soft, card=blue-soft, savings=green-soft.
