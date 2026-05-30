# Daily Expense Tracker — Claude Code Guide

## Project overview

Mobile-first personal expense tracker. Google Sign-In via Firebase Auth, data in Firestore,
deployed as a static site on GitHub Pages. No build step — plain HTML/CSS/vanilla JS with
ES modules. `index.html` = HTML skeleton + all CSS; logic split into `js/` modules.

Design direction: **colour blocking, bold, pop-up feel** — solid colour fills, strong coloured
shadows, elevated cards. Accent = teal (`--accent`), complement = black (`--comp`).

---

## Tech stack

| Layer    | Choice                              |
|----------|-------------------------------------|
| Hosting  | GitHub Pages (auto-deploy on push)  |
| Auth     | Firebase Authentication (Google)    |
| Database | Cloud Firestore                     |
| Frontend | Vanilla JS + HTML + CSS, ES modules |

---

## Repository structure

```
/
├── index.html              # HTML skeleton + ALL CSS (source of truth for styles)
├── js/
│   ├── app.js              # Entry point: auth, navigation, user settings seed
│   ├── firebase.js         # Firebase init (auth, db, provider)
│   ├── state.js            # Shared mutable state (currentUser, userSettings)
│   ├── helpers.js          # Pure utils: fmt, parseLocalDate, catColor, showToast
│   ├── db.js               # All Firestore operations (expenses, accounts, transfers, pots)
│   ├── add.js              # Screen 1 — Add Expense
│   ├── log.js              # Screen 2 — Expense Log (+ Transfers chip)
│   ├── report.js           # Screen 3 — Monthly Report
│   ├── settings.js         # Screen 4 — Settings
│   ├── budget.js           # Screen 5 — Budget overview/checklist + sub-tab routing
│   ├── budget-templates.js # Budget templates sub-page (Settings)
│   ├── accounts.js         # Budget → Accounts sub-tab + Transfer flow
│   └── savings.js          # Budget → Savings sub-tab
└── firestore.rules
```

### Module dependency graph

```
firebase.js ◄── db.js ◄── add.js, log.js, report.js, settings.js, budget.js, accounts.js, savings.js
state.js    ◄── db.js, add.js, log.js, report.js, settings.js, budget.js, accounts.js, savings.js
helpers.js  ◄── add.js, log.js, report.js, settings.js, budget.js, accounts.js, savings.js
budget.js   ◄── accounts.js, savings.js  (sub-tab routing)
app.js      ◄── imports all screen modules (single <script> entry point)
```

Screen `init*()` / `render*()` functions are called from `app.js` nav handlers.
Module-level event listeners are wired at import time.

---

## Design system

**Font:** Plus Jakarta Sans (weights 400/500/600/700/800). Always set
`-webkit-font-smoothing: antialiased` and `font-feature-settings: "ss01" 1, "cv01" 1`.

**Tabular numerals:** `font-variant-numeric: tabular-nums` on ALL money values, counts,
and report figures.

**CSS variables** are defined in `index.html` `:root`. Key groups: `--ink` / `--ink-2` /
`--ink-3` (text), `--line` / `--line-2` (borders), `--surface` / `--screen-bg` (fills),
`--accent` / `--accent-soft` / `--accent-line` / `--accent-ink` / `--accent-shadow` /
`--on-accent` (teal), `--comp` / `--comp-soft` etc. (black/coral complement), `--amber` /
`--on-amber` (needs-entry states), `--positive` / `--on-positive` (green remaining),
`--danger` (destructive), `--radius` / `--radius-sm` / `--radius-lg`, `--sp` (spacing multiplier).

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
// defined in helpers.js — use these everywhere
const fmt  = (n) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Math.round(n).toLocaleString('en-MY');
// `RM ${fmt(amount)}` → "RM 1,204.50"
// negative: `−RM ${fmt(Math.abs(n))}` — always use minus prefix, never locale negative format
```

### Category dot colours

Defined in `helpers.js` as `CATEGORY_COLOURS` lookup (lowercase keys). Pattern:
`oklch(0.64 0.085 <hue>)`. `catColor(key)` returns the colour or `_default`.
New user-created categories cycle hues: `[40, 120, 220, 300, 170, 70, 10, 230]`.

---

## Firestore data model

### `expenses/{id}`
```
uid            string     Firebase Auth UID
date           string     "YYYY-MM-DD"
amount         number
category       string     variable category OR fixed group name
subCategory    string     optional (e.g. "Wife", "Netflix")
paymentMethod  string
notes          string
createdAt      timestamp
type           string     "variable" | "fixed" | "income" (undefined treated as "variable")
budgetItemId   string     optional — links to budgetTemplates item (fixed only)
isIncome       boolean    true for income entries
```

### `userSettings/{uid}`
```
categories      string[]   ordered variable category names
paymentMethods  string[]   ordered payment method names
salaryDay       number     day salary arrives, default 25
```

### `budgetTemplates/{uid}`
```
groups: [{ id, name, items: [{ id, name, paymentMethod, defaultAmount, isVariable }] }]
```

### `budgetMonths/{uid}_{YYYY-MM}`
```
income:   [{ id, name, amount }]
payments: [{ itemId, paid, amount, paidDate, expenseId }]
```

Auto-seeded from `budgetTemplates/{uid}` on first open of a new month, all `paid: false`.

### `accounts/{uid}`
```
accounts: [{ id, name, openingBalance, type, createdAt }]
```
- `type`: `"bank" | "ewallet" | "card" | "savings"` — affects icon only
- Seeded from `userSettings.paymentMethods` on first open of the Accounts tab
- `createdAt` is an ISO string (client-side seeding, not a Firestore timestamp)

### `transfers/{id}`
```
uid, fromAccountId, toAccountId, amount, date ("YYYY-MM-DD"), notes, createdAt, type="transfer"
```
Querying by month uses a compound query on `(uid, date)` — requires a Firestore composite index.
First use logs a console error with a direct link to create the index.

### `savingsPots/{uid}`
```
pots: [{ id, name, linkedAccountId, targetAmount, currentBalance, colour, isMonthlyFixed, monthlyAmount, createdAt }]
```

### `potTransactions/{id}`
```
uid, potId, type ("contribute"|"withdraw"), amount, linkedAccountId, date, notes, createdAt
```

---

## App screens & behaviour

**Screen 0 — Login:** Full-screen centred, single Google Sign-In button.

**Screen 1 — Add Expense:** Amount hero card (teal fill) → date → category (dot + dropdown)
→ payment method (pill + dropdown) → notes → Save. On save: validate amount > 0, write to
Firestore, toast "Saved!", reset amount only (keep date/category/method). One dropdown open
at a time.

**Screen 2 — Expense Log:** Month nav `◀ May 2026 ▶` in header. Filter chips: All + payment
methods with data (first 3 + dashed `+N` expander) + **Transfers** chip (appears when
transfers exist for the month), single-select. Rows sorted date desc.
Row tap → edit/delete sheet (confirm before delete). Footer: "✎ tap a row to edit or delete".
Transfer rows: teal circle icon (`ti-arrows-exchange`), "FROM → TO" in teal, excluded from
totals when All/payment chip is active; shown only when Transfers chip is active.

**Screen 3 — Monthly Report:** Period chips: `Monthly` (single month nav) + `Salary Period`
(auto From=salaryDay prev month, To=salaryDay−1 current, user can override). Payment method
filter chips: multi-select, `All` resets. Three tabs: Variable · Fixed · Combined.
- Each tab: two stat cards (Total spent teal + Daily avg black) + category bar chart + table.
- Variable tab: category × method table, ▾ expands to daily totals (same-day transactions summed).
- Fixed tab: fixed group × method table, ▾ expands items.
- Combined tab: Family/Subs/Car Maintenance merged (var+fixed); others get `var`/`fixed` pill.
- Table: sticky first column, zero cells → `—`, total column `.tot-col`, footer totals row.

**Screen 4 — Settings:**
1. Variable categories — `.chip.soft` with dots, add/rename/delete
2. Payment methods — `.chip.soft.comp`, add/rename/delete
3. Budget templates → (slide-in sub-page, see below)
4. Salary day — tap → number picker 1–31, saves to `userSettings/{uid}.salaryDay`
5. Google account row card (email)
6. Sign out — danger row card

Budget templates sub-page: groups as collapsible sections, items with name/payMethod/amount/
isVariable toggle. Add item per group, add group at bottom (delete group via visible trash button
in header). Slide transition ≤ 220ms via `translateX` JS mini-stack (`subPageStack`).

**Screen 5 — Budget (3 internal sub-tabs):**

Sub-tab bar: **Overview · Accounts · Savings** below the Budget header.
Month nav is visible only on the Overview sub-tab.

- **5a Overview:** Net balance hero card (black bg, teal number) = Income − Fixed − Variable.
  Progress bar: % fixed items paid. 4 stat cards: Income (teal), Fixed (black), Variable (neutral),
  Remaining (green ≥0 / red <0). Income section: Salary/Claim/Other with inline edit.
  Fixed summary: mini group list, tap "X/N paid → checklist" to go to 5b.
- **5b Checklist:** Month nav. Progress bar X/N paid. Groups as collapsible accordion.
  Item states: paid (checked, struck-through), unpaid (empty checkbox), needs-entry (amber
  dashed, isVariable=true).
  Marking paid: write `expenses` doc (type="fixed", category=group, subCategory=item,
  budgetItemId, date=today) + update `budgetMonths` payment record.
  Unchecking paid: delete the expense doc + set `paid: false`.
- **5c Accounts:** Total card (teal) = sum of all running balances. Account list: type icon,
  name, running balance (teal ≥0 / red <0), opening balance muted below, last activity date.
  Tap account → edit sheet (name + opening balance only — no delete).
  `+ Add account` dashed card → bottom sheet: name, opening balance, type.
  Recent transfers section (last 5) with "See all" → Log tab with Transfers chip active.
  FAB transfer button → bottom sheet: From/To dropdowns, amount, date, notes, balance
  preview card. From ≠ To enforced with toast.
- **5d Savings:** Total card (teal) = sum of all pot balances. Pot cards: colour dot, name
  (tap to edit), linked account, coloured progress bar (currentBalance/targetAmount), balance +
  goal text, Add + Withdraw buttons.
  Add/Withdraw → bottom sheet: amount, date, notes. Withdraw max = currentBalance.
  `+ New pot` dashed card → bottom sheet: name, linked account, goal amount, 6-colour picker,
  monthly recurring toggle (label only — no auto-apply).
  Pot edit sheet: name, linked account, target, colour, monthly toggle + amount; Delete at bottom
  (hard-deletes pot + all its potTransactions).

---

## Navigation

5 tabs, fixed bottom nav, safe-area aware (`env(safe-area-inset-bottom)`).

| Tab      | Icon        | Screen |
|----------|-------------|--------|
| Add      | plus        | 1      |
| Log      | list        | 2      |
| Report   | chart-bar   | 3      |
| Budget   | ti-wallet   | 5 (3 sub-tabs: Overview · Accounts · Savings) |
| Settings | settings    | 4      |

Active: `.nav-item.on`. Budget, Log, and Report each maintain **independent** month state.

Cross-tab navigation (to avoid circular imports) uses custom DOM events dispatched and
handled in `app.js`. Currently wired: `nav:show-log-transfers` (accounts.js → app.js → log.js).

---

## Key behaviour rules

- **Uncheck paid item** → delete orphaned expense doc, set `paid: false` in budgetMonths.
- **New month** → auto-seed `budgetMonths/{uid}_{YYYY-MM}` from `budgetTemplates` on first open.
- **Log sort:** always date desc on client, regardless of Firestore return order.
- **Report Variable expand:** shows one sub-row per day (daily total), not per transaction.
- **Mobile UX:** min tap target 44×44px; `inputmode="decimal"` on amount; `input[type=date]`
  for date picker; no horizontal scroll except `.grid-scroll` report table.
- **Accounts: no delete** — edit name + opening balance only. Deleting would orphan transfers
  and pot links.
- **Account balance** computed client-side on render (never stored). Formula:
  `openingBalance + income − spend − transfersOut + transfersIn − potContributions + potWithdrawals`.
  Only loads expenses/transfers dated ≥ `account.createdAt` (ignores older records).
  Match expenses to accounts by `paymentMethod` string === `account.name`.
- **Savings pot `currentBalance`** is stored (not computed) — always written through
  Add/Withdraw flows; never derived from potTransactions.
- **Monthly recurring toggle** on pots is a reminder label only — contributions are always manual.
- **Transfer From ≠ To** enforced with toast on confirm (not a disabled button).
- **Budget sub-tab wiring** uses `btn.onclick =` assignment (not addEventListener) so handlers
  are replaced (not stacked) on repeated `initBudget()` calls.

### Account type icons

```js
const ACCOUNT_TYPE_ICONS = {
  bank:    'ti-building-bank',
  ewallet: 'ti-wallet',
  card:    'ti-credit-card',
  savings: 'ti-piggy-bank',
};
```

### Default pot colours (6 presets)

```js
const POT_COLOURS = [
  'oklch(0.62 0.115 185)',  // teal (accent)
  'oklch(0.64 0.115 5)',    // coral (complement)
  'oklch(0.64 0.085 250)',  // blue
  'oklch(0.64 0.085 60)',   // amber
  'oklch(0.58 0.13 145)',   // green (positive)
  'oklch(0.64 0.085 300)',  // purple
];
```

---

## Combined report — shared categories

Rows merged across variable + fixed when names match exactly:

| Category        | Variable side              | Fixed side                    |
|-----------------|----------------------------|-------------------------------|
| Family          | expenses tagged "Family"   | Fixed group "Family" paid     |
| Subs            | expenses tagged "Subs"     | Fixed group "Subs" paid       |
| Car Maintenance | expenses tagged "Car Maintenance" | Fixed group "Car Maintenance" paid |

All other fixed groups → `fixed` pill. All other variable categories → `var` pill.

---

## Phase 6 — Onboarding

### Overview

Triggered once for new users immediately after Google Sign-In, before the main app
renders. Stores completion flag in `userSettings/{uid}.onboardingComplete = true`.
On subsequent logins, skip directly to Screen 1 (Add Expense).

**Structure:**
- Part 1: Tour — 3 slides, skippable at any point
- Part 2: Setup — 4 guided steps, each individually skippable
- Final: Summary screen → enters main app

**Total time:** ~2 minutes if all steps completed. ~20 seconds if tour skipped.

**New JS module:** `js/onboarding.js`
Mounted as a full-screen overlay above the main app shell.
Removed from DOM (not just hidden) after completion.

---

### Feasibility fixes — apply before building

These are spec bugs that must be corrected at build time:

**1. Circular import — `dismissOnboarding` navigation**
`onboarding.js` cannot import `showScreen` from `app.js` (app.js imports onboarding.js).
Use a DOM event instead — same pattern as accounts.js "See all":
```js
function dismissOnboarding() {
  document.getElementById('onboarding-overlay').remove();
  document.dispatchEvent(new CustomEvent('nav:go-add'));
}
// app.js handles:
document.addEventListener('nav:go-add', () => showScreen('add'));
```

**2. Accounts double-seeding conflict**
Onboarding Step 1 seeds `accounts/{uid}`. `accounts.js` also seeds on first open of the
Accounts tab. Guard in `initAccounts()`: if accounts array already exists and is non-empty,
skip seeding. Always call `fetchAccounts(uid)` first and only seed if result is null or empty.

**3. `budgetMonths` write must use merge**
`saveIncome()` in onboarding must not overwrite the `payments` field seeded later by `budget.js`.
Use `setDoc(ref, { income: [...] }, { merge: true })` — not a plain `setDoc`.

**4. Inline `onclick="acceptConsent()"` won't resolve in ES modules**
Functions defined inside ES modules are not on `window`. All button event listeners in the
onboarding overlay must be attached via `addEventListener` after the HTML is injected into the DOM.

**5. Phase 5 S7 consent screen is redundant**
S7 described a separate `#consent-overlay`. Do not build it. Consent lives in Slide 2
(Security) of the Phase 6 tour — a single "I understand — continue" confirmation is enough.
Write `consentGiven: true` to `userSettings` when the user taps "Set up my app →" on Slide 2.

---

### Firestore changes

No new collections. Extends `userSettings/{uid}`:

```
onboardingComplete   boolean    true = skip onboarding on next login
onboardingDate       string     ISO timestamp of when setup was completed
consentGiven         boolean    true = user accepted data consent on Slide 2
consentDate          string     ISO timestamp of consent
```

Salary day, categories, paymentMethods, and income already exist in
`userSettings` and `budgetMonths` — onboarding writes to these same fields.

---

### Part 1 — Tour (3 slides)

Renders as a full-screen overlay with bottom sheet style card.
Progress shown as 3 dots at the top (pill = current, circle = upcoming, faded = done).
Each slide has a hero icon block, large title, subtitle, 3 feature rows, and action buttons.

#### Slide 0 — Welcome
- Icon: `ti-wallet` on teal-soft background
- Title: "Your finances, finally clear"
- Subtitle: Track every ringgit — expenses, fixed bills, income, savings, and account balances in one place.
- Features: Log expenses instantly · Smart reports · Account balances
- Primary CTA: "Next →"
- Secondary: "Skip tour — go to setup" (text button, muted)

#### Slide 1 — Budget
- Icon: `ti-wallet` on jet black background, amber icon color
- Title: "Know your net balance"
- Subtitle: See exactly what's left after salary, fixed bills, and daily spending — updated live every month.
- Features: Income tracking · Fixed bill checklist · Savings pots
- Primary CTA: "Next →"
- Back button (outline) + Skip link

#### Slide 2 — Security (consent moment)
- Icon: `ti-shield-check` on teal-soft background
- Title: "Your data, yours only"
- Subtitle: Secured with Google Sign-In. Your financial data is locked to your account — nobody else can see it.
- Features: Private by design · Auto session timeout · Delete all data anytime
- Consent note (small, muted, above CTA): "By continuing you agree that your financial data is
  stored in Google Firebase, private to your account. You can delete all data anytime in Settings."
- Primary CTA: "Set up my app →" (transitions to Part 2; writes `consentGiven: true`)
- Back button only (no skip — security/consent slide always shown)

#### Tour navigation rules
- Dots: current = wide pill (teal), past = small faded teal dot, future = small gray dot
- "Skip tour" link visible on slides 0 and 1, jumps directly to Setup Step 0
- Back button appears from slide 1 onwards
- Slide transitions: `opacity 0→1 + translateY 8px→0`, 250ms ease

---

### Part 2 — Setup (4 steps)

Progress bar across top of each step (not dots — feels more productive).
Step badge top-right: "Setup X of 4".
Each step has: eyebrow label, large title, subtitle, input area, bottom buttons.

#### Setup Step 0 — Salary day
- Eyebrow: "Let's personalise"
- Title: "When do you get paid?"
- Subtitle: "This sets your salary period for reports — e.g. 25th means your month runs 25 May → 24 Jun."
- Input: 7-column day grid (days 1–31), tap to select. Selected day = teal filled pill.
- Hint below grid: "Tap a day above" → updates to "Salary period: Nth each month" on selection.
- Continue button: disabled (opacity 0.4) until a day is tapped, then enabled.
- Skip: "Skip for now" text button — advances with no salaryDay written.
- On continue: `updateDoc userSettings/{uid}, { salaryDay: selectedDay }`
- Progress bar: 25% filled

#### Setup Step 1 — Payment methods
- Eyebrow: "Your accounts"
- Title: "Which do you use?"
- Subtitle: "Select all your payment methods. You can add more later in Settings."
- Input: chip grid, all 7 defaults pre-selected (TNG, CIMB, RHB, MLMT, SETEL, AEON, SPAY).
  Tap chip to toggle off. Dashed "+ add" chip opens inline text input for custom method.
  Counter below: "N selected"
- No skip button — defaults are always selected, so this is never blocking.
- On continue: write `userSettings/{uid}.paymentMethods = [selected]`
  Also seed `accounts/{uid}.accounts` from selected methods (openingBalance: 0, type from ACCOUNT_TYPE_MAP).
- Progress bar: 50% filled

**Account type auto-assignment for seeded accounts:**
```js
const ACCOUNT_TYPE_MAP = {
  TNG:   'ewallet', SETEL: 'ewallet', AEON: 'ewallet', SPAY: 'ewallet',
  CIMB:  'bank',    RHB:   'bank',    MLMT: 'bank',
};
// Unknown names default to 'bank'
```

#### Setup Step 2 — Opening balances
- Eyebrow: "Account balances"
- Title: "Starting balances"
- Subtitle: "Enter your current balance for each account. Leave blank to start from zero."
- Input: list of account rows (one per selected method from Step 1).
  Each row: type icon, account name, "RM" prefix, number input (`inputmode="decimal"`).
  If more than 5 accounts, show first 5 with "and N more — set in Budget → Accounts" note.
- Skip: "Skip — set up later" text button.
- On continue: write entered values to `accounts/{uid}.accounts[].openingBalance`. Blank → 0.
- Progress bar: 75% filled

**Icon assignment for account rows:**
```js
const TYPE_ICONS = {
  bank:    { icon: 'ti-building-bank', bg: 'oklch(0.962 0.05 185)', color: 'oklch(0.46 0.109 185)' },
  ewallet: { icon: 'ti-wallet',        bg: '#fff8e8',                color: '#854F0B' },
  card:    { icon: 'ti-credit-card',   bg: '#f0f7ff',                color: '#185FA5' },
  savings: { icon: 'ti-piggy-bank',    bg: '#f0fff8',                color: '#0F6E56' },
};
```

#### Setup Step 3 — Monthly income
- Eyebrow: "Almost done"
- Title: "Your monthly income"
- Subtitle: "Used to calculate your net balance. You can update this anytime in Budget → Overview."
- Input:
  - Salary (Gaji) — teal-outlined field, `inputmode="decimal"`, "required" label (not enforced)
  - Claim / allowance — normal field, "optional" label
  - Info tile: "You can also set up: Budget templates (fixed bills) · Savings pots · Category budgets — all in Settings after setup"
- No skip button — fields are not enforced (can finish with 0).
- On continue: `setDoc(budgetMonths/{uid}_{YYYY-MM}, { income: [...] }, { merge: true })`
  ```js
  [
    { id: 'salary', name: 'Salary', amount: salaryValue },
    { id: 'claim',  name: 'Claim',  amount: claimValue  },
    { id: 'other',  name: 'Other',  amount: 0           },
  ]
  ```
- Progress bar: 100% filled

---

### Final screen

Shown after Setup Step 3 is completed.

Layout: centred column, no progress bar, no step badge.

- Check icon in large teal-soft circle (`ti-check`, 72px circle)
- Title: "You're all set!"
- Subtitle: "Here's what's been configured for you:"
- Summary card rows:
  - Salary day: "Nth" or "Not set"
  - Accounts: "N linked"
  - Salary: "RM X,XXX" or "Not set"
  - Next step row (teal-soft bg): "Next step → Add first expense"
- Primary CTA: "Start tracking →"
  - Writes `onboardingComplete: true`, `onboardingDate: new Date().toISOString()` to `userSettings`
  - Removes `#onboarding-overlay` from DOM
  - Dispatches `nav:go-add` event (app.js calls `showScreen('add')`)

---

### Overlay structure (HTML)

```html
<!-- Add to index.html, directly inside #app div, before the screen divs -->
<div id="onboarding-overlay"
     style="position:absolute;inset:0;z-index:900;background:#fdfcf8;
            display:flex;flex-direction:column;overflow:hidden">
  <!-- Onboarding content rendered here by onboarding.js -->
</div>
```

`position: absolute` (not fixed) keeps it in normal document flow and avoids
viewport/iframe height collapse. The overlay fills the app shell exactly.

Show/hide logic in `app.js`:
```js
async function checkOnboarding(uid) {
  const settings = await fetchUserSettings(uid);  // already called — reuse the result
  if (!settings?.onboardingComplete) {
    document.getElementById('onboarding-overlay').style.display = 'flex';
    initOnboarding(uid);
  } else {
    document.getElementById('onboarding-overlay').style.display = 'none';
  }
}
// Call checkOnboarding(uid) at end of loadUserSettings(), before initAdd() + showScreen()
```

---

### Onboarding JS module structure

```js
// js/onboarding.js

export function initOnboarding(uid) {
  renderOnboarding();
  bindTourNavigation();
  bindSetupSteps(uid);
}

const state = {
  tourStep:  0,
  setupStep: -1,    // -1 = in tour, 0–3 = in setup
  salaryDay: null,
  methods:   ['TNG','CIMB','RHB','MLMT','SETEL','AEON','SPAY'],
  balances:  {},    // { accountName: amount }
  salary:    0,
  claim:     0,
};

function showTourSlide(n)  { /* show slide n, hide others, update dots */ }
function showSetupStep(n)  { /* show step n, hide others, update progress bar */ }
function showFinalScreen() { /* show final, populate summary rows */ }
function dismissOnboarding() {
  document.getElementById('onboarding-overlay').remove();
  document.dispatchEvent(new CustomEvent('nav:go-add'));
}

// Firestore writes (all use await, wrapped in try/catch with showToast on error)
async function saveSalaryDay(uid, day)       { /* updateDoc userSettings */ }
async function savePaymentMethods(uid, arr)  { /* updateDoc userSettings + setDoc accounts */ }
async function saveOpeningBalances(uid, obj) { /* fetch accounts, update balances, setDoc */ }
async function saveIncome(uid, sal, claim)   { /* setDoc budgetMonths with merge:true */ }
async function completeOnboarding(uid)       { /* updateDoc onboardingComplete:true */ }
```

---

### Animation spec

```css
/* Add to index.html <style> block */

.ob-step { display: none; animation: obFadeIn 0.25s ease; }
.ob-step.active { display: flex; flex-direction: column; flex: 1; }

@keyframes obFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.ob-dot {
  width: 6px; height: 6px; border-radius: 999px;
  background: rgba(0,0,0,0.12);
  transition: width 0.3s ease, background 0.3s ease;
}
.ob-dot.current { width: 18px; background: var(--accent); }
.ob-dot.done    { background: var(--accent); opacity: 0.4; }

.ob-prog-fill { transition: width 0.35s ease; }

.ob-day.selected {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}

.ob-btn-main:disabled { opacity: 0.4; cursor: not-allowed; }

@media (prefers-reduced-motion: reduce) {
  .ob-step { animation: none; }
  .ob-dot, .ob-prog-fill { transition: none; }
}
```

---

### Build tasks — Phase 6

#### Task O1 — Overlay scaffold + tour slides
```
Create js/onboarding.js and add the onboarding overlay div to index.html (inside #app,
before screen divs). Implement the 3 tour slides (Welcome, Budget, Security) with dot
navigation, slide transitions (opacity + translateY, 250ms), hero icon blocks, feature rows,
Next/Back buttons, and "Skip tour" text links on slides 0 and 1.
Slide 2 includes a consent note above the CTA; tapping "Set up my app →" writes
consentGiven:true to userSettings before advancing.
checkOnboarding(uid) in app.js shows the overlay if onboardingComplete is not true.
app.js listens for nav:go-add custom event to call showScreen('add').
```

#### Task O2 — Setup steps 0–3
```
Implement the 4 setup steps in js/onboarding.js:
Step 0: 7-col day grid (days 1–31), Continue disabled until a day is tapped. On continue:
  updateDoc userSettings salaryDay.
Step 1: Pre-selected payment method chips, toggle off/on, dashed + add for custom.
  On continue: write paymentMethods to userSettings + setDoc accounts/{uid} from selection
  using ACCOUNT_TYPE_MAP. Guard against double-seeding: only write if accounts don't already exist.
Step 2: Account rows (one per selected method), RM prefix + number input.
  On continue: fetch accounts/{uid}, update openingBalance per account, setDoc.
Step 3: Salary + Claim fields (teal outline on salary). On continue: setDoc budgetMonths
  current month with { income: [...] } using merge:true.
All event listeners attached via addEventListener (not inline onclick).
Each step: step badge top-right, progress bar (25/50/75/100%), eyebrow, title, subtitle,
back button, skip where specified.
```

#### Task O3 — Final screen + completion
```
Implement the final screen in js/onboarding.js. Show after Setup Step 3 "Continue".
Display summary rows: salary day, accounts count, salary amount, teal-soft next-step row.
Primary CTA writes onboardingComplete:true + onboardingDate to userSettings, removes
#onboarding-overlay from DOM, dispatches nav:go-add event.
```

---

### Re-trigger onboarding (for testing)

Run in browser devtools console after signing in:

```js
// Paste into console — resets onboarding flag then reloads
const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/11.3.1/firebase-app.js');
// Instead: use the already-loaded db instance from the app
// Easiest: temporarily add a reset button to Settings in dev mode
```

Simpler approach — add a hidden reset row to Settings (behind a flag or just temporarily):
```js
// js/settings.js — temporary dev helper
async function resetOnboarding() {
  await updateDoc(doc(db, 'userSettings', currentUser.uid), { onboardingComplete: false });
  location.reload();
}
```

---

## Phase 7 — Generalisation (new-user ready)

### Overview

The app currently ships hardcoded to one user's Malaysian setup. This phase
strips all personal data from seed defaults and replaces them with universal
starting points. Malaysian-specific options are preserved as optional presets
offered during onboarding — not removed.

Files changed: `js/helpers.js`, `js/budget-templates.js`, `js/onboarding.js`

---

### Task G1 — Replace DEFAULT_CATEGORIES (helpers.js)

```js
// NEW — universal
const DEFAULT_CATEGORIES = [
  'Food','Transport','Shopping','Health',
  'Entertainment','Bills','Savings','Other'
];

// Malaysian preset — offered as one-tap option in onboarding Step 1
const MY_CATEGORIES_PRESET = [
  'Family','Food','Toll','Parking','Fuel',
  'Car Maintenance','Subs','Medical','Misc'
];
```

Update `CATEGORY_COLOURS` to cover new universal names (keep all existing hue values):

```js
const CATEGORY_COLOURS = {
  food:          'oklch(0.64 0.085 25)',
  transport:     'oklch(0.64 0.085 60)',
  shopping:      'oklch(0.64 0.085 330)',
  health:        'oklch(0.64 0.085 5)',
  entertainment: 'oklch(0.64 0.085 285)',
  bills:         'oklch(0.64 0.085 250)',
  savings:       'oklch(0.64 0.085 150)',
  other:         'oklch(0.64 0.085 100)',
  // Malaysian preset keys (still used if user picks that preset)
  family:           'oklch(0.64 0.085 150)',
  toll:             'oklch(0.64 0.085 60)',
  parking:          'oklch(0.64 0.085 330)',
  fuel:             'oklch(0.64 0.085 250)',
  'car maintenance':'oklch(0.64 0.085 285)',
  subs:             'oklch(0.64 0.085 200)',
  medical:          'oklch(0.64 0.085 5)',
  misc:             'oklch(0.64 0.085 100)',
  _default:         'oklch(0.64 0.085 265)',
};
```

---

### Task G2 — Replace DEFAULT_PAYMENTS + type selector in onboarding (helpers.js, onboarding.js)

```js
// NEW — universal
const DEFAULT_PAYMENTS = ['Cash','Bank','Credit Card','E-Wallet'];

const MY_PAYMENTS_PRESET = ['TNG','CIMB','RHB','MLMT','SETEL','AEON','SPAY'];

const MY_PAYMENTS_TYPES = {
  TNG: 'ewallet', SETEL: 'ewallet', AEON: 'ewallet', SPAY: 'ewallet',
  CIMB: 'bank', RHB: 'bank', MLMT: 'bank',
};

const DEFAULT_PAYMENT_TYPES = {
  'Cash': 'ewallet', 'Bank': 'bank', 'Credit Card': 'card', 'E-Wallet': 'ewallet',
};
```

Remove `ACCOUNT_TYPE_MAP` from onboarding.js. Instead, each account chip gets a type badge
that cycles `bank → ewallet → card → savings → bank` on tap:

```html
<div class="method-chip-wrap">
  <div class="chip on">TNG</div>
  <div class="type-badge" data-method="TNG">ewallet</div>
</div>
```

Badge colour per type: bank=teal-soft, ewallet=amber-soft, card=blue-soft, savings=green-soft.
When Malaysian preset is applied, types set from `MY_PAYMENTS_TYPES` (unknown → bank).

Add preset row above chip grid in onboarding Step 1 (payment methods):
```
[ General defaults ]  [ Malaysian e-wallets ]
```
"Malaysian e-wallets" adds MY_PAYMENTS_PRESET to existing selection (union, not replace).

---

### Task G3 — Replace DEFAULT_BUDGET_TEMPLATE (budget-templates.js)

Replace the existing personal template with a generic empty scaffold:

```js
const DEFAULT_BUDGET_TEMPLATE = {
  ccBudget: 0,
  carMaintenanceBudget: 0,
  groups: [
    { id: 'housing',       name: 'Housing',       items: [] },
    { id: 'transport',     name: 'Transport',     items: [] },
    { id: 'insurance',     name: 'Insurance',     items: [] },
    { id: 'family',        name: 'Family',        items: [] },
    { id: 'subscriptions', name: 'Subscriptions', items: [] },
    { id: 'savings',       name: 'Savings',       items: [] },
    { id: 'other',         name: 'Other',         items: [] },
  ]
};
```

Add empty-state prompt inside Budget checklist when a group has no items:
```
[ + Add your first fixed bill ]
```
Tapping navigates to Settings → Budget templates → that group.

Add Malaysian quick-setup collapsible card at top of Settings → Budget templates:
```
Quick setup for Malaysian users
[ Apply Malaysian template ]
```
Merges generalised Malaysian items into current groups (no overwrite of existing items).
Confirms before applying.

**Malaysian template items:**
```js
const MY_BUDGET_TEMPLATE_ITEMS = {
  loan:          [{ name:'PTPTN' }, { name:'Car loan' }],
  bills:         [{ name:'Internet' }, { name:'Mobile (self)' }, { name:'Mobile (family)' },
                  { name:'Electricity' }, { name:'Water' }],
  insurance:     [{ name:'Takaful / insurance' }],
  family:        [{ name:'Parents' }, { name:'Spouse' }, { name:'Children' }, { name:'Groceries' }],
  subscriptions: [{ name:'Streaming' }, { name:'Cloud / apps' }],
  savings:       [{ name:'Emergency fund' }],
  other:         [{ name:'Zakat' }, { name:'Sedekah' }, { name:'SPaylater' }],
};
// All: paymentMethod:'', defaultAmount:0, isVariable:false
```

---

### Task G4 — Update onboarding copy + add preset selectors (onboarding.js)

Slide 1 (Budget) copy changes:
- "TNG, CIMB, RHB — all tracked" → "all your accounts tracked live"
- "Mark Unifi, TNB, loans as paid" → "mark fixed bills as paid each month"

Add preset selector row above category chips in onboarding (Step 1 — after renaming to categories):
```
Choose a starting point:
[ General ✓ ]  [ Malaysian ]  [ Start blank ]
```

Update onboarding state:
```js
const state = {
  tourStep:       0,
  setupStep:      -1,
  categoryPreset: 'general',
  categories:     [...DEFAULT_CATEGORIES],
  methodPreset:   'general',
  methods:        [...DEFAULT_PAYMENTS],
  methodTypes:    { Cash:'ewallet', Bank:'bank', 'Credit Card':'card', 'E-Wallet':'ewallet' },
  salaryDay:      null,
  balances:       {},
  salary:         0,
  claim:          0,
};
```

---

### Build order for Phase 7

| Task | File | Effort |
|---|---|---|
| G1 | `js/helpers.js` — swap DEFAULT_CATEGORIES + update CATEGORY_COLOURS | 20 min |
| G2 | `js/helpers.js` — swap DEFAULT_PAYMENTS; `js/onboarding.js` — remove ACCOUNT_TYPE_MAP, add type badges + preset row | 45 min |
| G3 | `js/budget-templates.js` — replace scaffold; add empty-state in `budget.js`; add MY quick-setup in settings | 1 hr |
| G4 | `js/onboarding.js` — update copy, add preset selector in steps 1+2, update state | 45 min |

**Total estimated effort: ~2.5 hours**
