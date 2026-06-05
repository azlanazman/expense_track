# Daily Expense Tracker — Claude Code Guide

## Project overview

Mobile-first personal expense tracker. Google Sign-In (Firebase Auth), Firestore database, GitHub Pages hosting. No build step — plain HTML/CSS/vanilla JS with ES modules. `index.html` = HTML skeleton + ALL CSS; logic split into `js/` modules.

Design: **colour blocking, bold, pop-up feel** — solid fills, strong coloured shadows, elevated cards. Accent = yellow (`--accent`, `oklch(0.84 0.18 86)`), complement = dark/navy (`--comp`). Text on yellow fills always uses dark ink (`--on-accent: oklch(0.28 0.05 86)`) — never white.

---

## Repo structure

```
index.html              # HTML skeleton + ALL CSS (source of truth for styles)
_headers                # GitHub Pages security headers (CSP, HSTS, X-Frame-Options)
SECURITY.md             # API key domain restriction + App Check setup instructions
js/
  app.js                # Entry point: auth, navigation, session timeout, state clearing
  firebase.js           # Firebase init + App Check stub
  state.js              # Shared mutable state (currentUser, userSettings)
  helpers.js            # Pure utils: fmt, catColor, showToast, escapeHtml, sanitise*
  db.js                 # All Firestore operations + audit log
  export.js             # Report → Export to Sheets (.xlsx via SheetJS CDN, lazy-loaded)
  onboarding.js         # New-user onboarding overlay
  add.js                # Screen 1 — Add Expense
  log.js                # Screen 2 — Expense Log (+ Transfers chip)
  report.js             # Screen 3 — Report
  settings.js           # Screen 4 — Settings
  budget.js             # Screen 5 — Budget overview/checklist + sub-tab routing
  budget-templates.js   # Budget templates sub-page (Settings)
  accounts.js           # Budget → Accounts sub-tab + Transfer flow
  savings.js            # Budget → Savings sub-tab
  insights.js           # Budget → Insights sub-page (3-lens dashboard)
firestore.rules
```

`init*()` / `render*()` called from `app.js` nav handlers. Module-level event listeners wired at import time.

**Cross-tab navigation** (avoids circular imports) — custom DOM events in `app.js`:
- `nav:show-log-transfers` — accounts.js dispatches; app.js activates Transfers chip in log
- `nav:go-add` — onboarding.js dispatches on completion

---

## Security

### Rules (non-negotiable)

- **Never use `innerHTML` with user-supplied data.** Always call `escapeHtml(str)` from `helpers.js` first. This includes: category names, payment method names, account names, notes, pot names, group/item names from templates.
- **Never write to Firestore without sanitising.** Call `sanitiseAmount(n)`, `sanitiseDate(s)`, `sanitiseText(s, maxLen)` from `helpers.js` before any write. These are already called inside `db.js` write functions — don't bypass them by writing directly.
- **Never call Firestore APIs directly from screen modules.** All reads and writes go through `db.js`. This ensures audit logging and sanitisation are never skipped.

### Helpers (`helpers.js`)

```js
escapeHtml(str)              // encode &, <, >, ", ' — use before any innerHTML with user data
sanitiseText(val, maxLen)    // trim + cap at maxLen chars (default 200)
sanitiseAmount(val)          // throws if ≤ 0 or ≥ 1,000,000; returns rounded float
sanitiseDate(val)            // throws if not "YYYY-MM-DD" format
```

### Session & state

- **15-minute idle timeout** in `app.js` — resets on mouse/key/touch/click. Warns at 14 min via toast, signs out at 15 min.
- **On signOut / tab hide:** `clearLogState()`, `clearBudgetState()`, `clearReportState()`, `clearAccountsState()`, `clearSavingsState()`, `clearInsightsState()` wipe financial data from memory. Each module exports its own `clear*State()` function.
- **visibilitychange** in `app.js`: clears state on tab hide, re-initialises active screen on tab show.
- `sessionStorage` stores only the active screen name — never financial data.

### Firestore rules summary

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

## Design system

**Font:** Plus Jakarta Sans (400/500/600/700/800). Always: `-webkit-font-smoothing: antialiased`, `font-feature-settings: "ss01" 1, "cv01" 1`.

**Tabular numerals:** `font-variant-numeric: tabular-nums` on ALL money values and report figures.

**Global form element reset** in `index.html`: `button, input, select, textarea { font: inherit; }` — ensures all form elements use Plus Jakarta Sans.

**CSS variables** in `index.html :root`: `--ink`/`--ink-2`/`--ink-3` (text), `--line`/`--line-2` (borders), `--surface`/`--screen-bg` (fills), `--accent`/`--accent-soft`/`--accent-line`/`--accent-ink`/`--accent-shadow`/`--on-accent` (yellow — `on-accent` is dark ink, not white), `--comp`/`--comp-soft`/`--comp-line`/`--comp-ink` (dark navy), `--amber`/`--amber-soft`/`--amber-ink`/`--on-amber` (needs-entry), `--positive`/`--positive-soft`/`--positive-ink`/`--on-positive` (green), `--danger`/`--danger-soft`/`--danger-ink`, `--radius`/`--radius-sm`/`--radius-lg`, `--sp` (spacing multiplier).

**Scoped radius override:** `#budget-insights-body` sets `--radius: 20px`, `--radius-sm: 12px`, `--radius-lg: 26px` — all child elements in Insights inherit these larger radii. Do not change the global `--radius` (12px) for Insights work.

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
categoryLimits      object     { [categoryName]: number } — per-category spending limits (Insights)
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
accounts: [{ id, name, openingBalance, type, createdAt }]
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

5 tabs, fixed bottom nav, safe-area aware (`env(safe-area-inset-bottom)`).

| Tab      | Screen |
|----------|--------|
| Add      | 1      |
| Log      | 2      |
| Report   | 3      |
| Budget   | 5 (sub-tabs: Overview · Accounts · Savings; Overview has an Insights sub-page) |
| Settings | 4      |

Active: `.nav-item.on`. Budget, Log, Report maintain **independent** month state.

**Screen persistence:** `showScreen(name)` → `sessionStorage('activeScreen')`. Restored on `onAuthStateChanged` (including refresh). Cleared on signOut.

**Phone back button:** Sub-pages call `history.pushState(null,'')` on open. `popstate` listener in `app.js` closes `.sub-page.active`. Covers: Settings → Budget Templates, Budget → Checklist.

---

## Screen behaviour (non-obvious rules only)

**Add:** Reset amount only on save — keep date/category/method. One dropdown open at a time.

**Log:** Transfer rows excluded from totals when All/payment chip active; shown only when Transfers chip active. Rows sorted date desc (client-side).

**Report:** Default period = Salary Period (not Monthly). Salary period: if `today >= salaryDay`, started this month; otherwise last month — auto-advances, no stored state. Variable expand = one sub-row per day (daily total, not per transaction). Export downloads all payment methods regardless of active filter chips.

**Report — Combined tab shared categories** (merged var+fixed when names match exactly):

| Category        | Variable side               | Fixed side                    |
|-----------------|-----------------------------|-------------------------------|
| Family          | expenses tagged "Family"    | Fixed group "Family" paid     |
| Subs            | expenses tagged "Subs"      | Fixed group "Subs" paid       |
| Car Maintenance | expenses tagged same name   | Fixed group same name         |

**Budget Overview:** Net balance = Income − Fixed − Variable. Progress bar denominator = current template items only (orphaned records excluded). Income rows have account selector pill → triggers `syncIncomeExpense()`.

**Budget Checklist:** Marking paid writes `expenses` doc (type="fixed", amount > 0) + updates `budgetMonths`. If amount = 0, only `budgetMonths` is updated (no expense doc — Firestore rules require amount > 0). Unchecking deletes the expense doc + sets `paid:false`.

**Budget Accounts:** Balance computed client-side — never stored. Formula: `openingBalance + income − spend − transfersOut + transfersIn − potContributions + potWithdrawals`. All expenses for that `paymentMethod` included (no date floor). Income from `isIncome:true` expense docs.

**Budget Savings:** `currentBalance` is stored, not computed — always written through Add/Withdraw flows. Per-transaction account can differ from pot's `linkedAccountId`; `calcBalance` reads `linkedAccountId` on each `potTransaction`.

**Settings → Budget Templates:** Slide transition ≤ 220ms via `translateX`. Delete group via trash button in section header.

**Export to Sheets (`export.js`):** 4 sheets — Variable, Fixed, Combined, Income. Income sheet fetches `budgetMonths` for every calendar month overlapping the export range.

**Budget Insights (`insights.js`):** Sub-page inside Budget → Overview. Opened via an "Insights" button in the overview header; renders into `#budget-insights-body`.

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
