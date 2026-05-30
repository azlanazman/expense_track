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

---

## App screens & behaviour

**Screen 0 — Login:** Full-screen centred, single Google Sign-In button.

**Screen 1 — Add Expense:** Amount hero card (teal fill) → date → category (dot + dropdown)
→ payment method (pill + dropdown) → notes → Save. On save: validate amount > 0, write to
Firestore, toast "Saved!", reset amount only (keep date/category/method). One dropdown open
at a time.

**Screen 2 — Expense Log:** Month nav `◀ May 2026 ▶` in header. Filter chips: All + payment
methods with data (first 3 + dashed `+N` expander), single-select. Rows sorted date desc.
Row tap → edit/delete sheet (confirm before delete). Footer: "✎ tap a row to edit or delete".

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

**Screen 5 — Budget:**
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

---

## Navigation

5 tabs, fixed bottom nav, safe-area aware (`env(safe-area-inset-bottom)`).

| Tab      | Icon        | Screen |
|----------|-------------|--------|
| Add      | plus        | 1      |
| Log      | list        | 2      |
| Report   | chart-bar   | 3      |
| Budget   | ti-wallet   | 5      |
| Settings | settings    | 4      |

Active: `.nav-item.on`. Budget, Log, and Report each maintain **independent** month state.

---

## Key behaviour rules

- **Uncheck paid item** → delete orphaned expense doc, set `paid: false` in budgetMonths.
- **New month** → auto-seed `budgetMonths/{uid}_{YYYY-MM}` from `budgetTemplates` on first open.
- **Log sort:** always date desc on client, regardless of Firestore return order.
- **Report Variable expand:** shows one sub-row per day (daily total), not per transaction.
- **Mobile UX:** min tap target 44×44px; `inputmode="decimal"` on amount; `input[type=date]`
  for date picker; no horizontal scroll except `.grid-scroll` report table.

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

## Phase 3 — COMPLETE ✓

| # | What | File(s) | Status |
|---|------|---------|--------|
| P3-1 | `DEFAULT_CATEGORIES`: `'Car'` → `'Car Maintenance'`; added `'car maintenance'` colour key | `js/helpers.js` | ✓ done |
| P3-2 | try/catch on all Firestore writes in budget modules; `showToast('Error — please try again')` on failure | `js/budget.js`, `js/budget-templates.js` | ✓ done |
| P3-3 | Removed unused `todayString` import | `js/report.js` | ✓ done |
| P3-4 | `DEFAULT_BUDGET_TEMPLATE` slimmed to generic scaffold; kept `cc-balance` + `carmaint-balance` by ID | `js/budget-templates.js` | ✓ done |
| P3-5 | `DEFAULT_PAYMENTS` left as-is — app targets Malaysian users | `js/helpers.js` | ✓ decided |

---

## Phase 4 — Accounts, Transfers & Savings Pots — COMPLETE ✓

| # | What | File(s) | Status |
|---|------|---------|--------|
| P4-1 | Budget sub-tab chips: Overview · Accounts · Savings; month nav hides on non-Overview tabs | `js/budget.js`, `index.html` | ✓ done |
| P4-2 | Accounts list seeded from paymentMethods; running balance calc; add/edit sheet (no delete) | `js/accounts.js`, `js/db.js` | ✓ done |
| P4-3 | Transfer FAB → sheet; From ≠ To validation (toast); preview card; recent transfers section; "See all" → Log Transfers | `js/accounts.js`, `js/app.js` | ✓ done |
| P4-4 | Transfers chip in Log; transfer rows with formatted date + teal icon; `showLogTransfers()` export | `js/log.js` | ✓ done |
| P4-5 | Savings pots: progress bar, Add/Withdraw flow, colour picker, monthly toggle (label only), delete pot | `js/savings.js`, `js/db.js` | ✓ done |

**Firestore index required:** `fetchTransfersByMonth` queries `transfers` on `(uid, date)`. First use will throw an error in the console with a direct link to create the composite index in Firebase console.

---

### Overview

Budget tab gains 3 internal sub-tabs: **Overview · Accounts · Savings**
Navigation stays at 5 tabs — no new tab added.

| Sub-tab | What's inside |
|---|---|
| Overview | Existing 5a + 5b (unchanged) |
| Accounts | Account balances, running totals, transfer history, add transfer |
| Savings | Savings pots with goals, progress bars, contribute/withdraw |

---

### Design decisions (locked)

- Payment methods (TNG, CIMB, RHB, MLMT, SETEL, AEON, SPAY) ARE the accounts — seeded automatically from `userSettings.paymentMethods` on first open of Accounts tab
- User can add extra accounts (e.g. CIMB THAJI) via `+ Add account` — name + opening balance + optional type
- Account type affects icon only (bank / e-wallet / card / savings) — no functional difference
- Transfers appear in the Expense Log with a double-arrow icon, teal colour, and are excluded from expense totals
- Log gets a new `Transfers` filter chip alongside payment method chips
- Savings pot contributions reduce the linked account balance; withdrawals increase it
- Both monthly fixed and ad-hoc contributions supported per pot

---

### New Firestore collections

#### `accounts/{uid}`
```
accounts: [
  {
    id              string    unique id
    name            string    e.g. "CIMB", "TNG", "CIMB THAJI"
    openingBalance  number    manually set by user
    type            string    "bank" | "ewallet" | "card" | "savings"
    createdAt       timestamp
  }
]
```

Seeded on first open of Accounts tab from `userSettings.paymentMethods`.
Each seeded account gets `openingBalance: 0` — user edits to set real value.
New manually added accounts also start at `openingBalance: 0`.

#### `transfers/{id}`
```
uid             string
fromAccountId   string    references accounts[].id
toAccountId     string    references accounts[].id
amount          number
date            string    "YYYY-MM-DD"
notes           string    optional
createdAt       timestamp
type            string    "transfer" (for Log filtering)
```

#### `savingsPots/{uid}`
```
pots: [
  {
    id              string
    name            string    e.g. "Emergency", "Car", "Vacation"
    linkedAccountId string    references accounts[].id
    targetAmount    number    goal amount (0 = no goal set)
    currentBalance  number    running balance
    colour          string    oklch colour string for dot + progress bar
    isMonthlyFixed  boolean   true = has a recurring monthly contribution
    monthlyAmount   number    amount if isMonthlyFixed = true
    createdAt       timestamp
  }
]
```

---

### Account balance calculation

Computed client-side on render — never stored directly (avoids race conditions):

```js
function calcAccountBalance(accountId, accountName, openingBalance, expenses, transfers, potTransactions) {
  // income adds to balance
  const incomeTotal = expenses
    .filter(e => e.isIncome && e.paymentMethod === accountName)
    .reduce((s, e) => s + e.amount, 0);

  // variable + fixed spending reduces balance
  const spendTotal = expenses
    .filter(e => !e.isIncome && e.paymentMethod === accountName)
    .reduce((s, e) => s + e.amount, 0);

  // transfers out reduce balance
  const transferOut = transfers
    .filter(t => t.fromAccountId === accountId)
    .reduce((s, t) => s + t.amount, 0);

  // transfers in increase balance
  const transferIn = transfers
    .filter(t => t.toAccountId === accountId)
    .reduce((s, t) => s + t.amount, 0);

  // pot contributions reduce linked account balance
  const potOut = potTransactions
    .filter(c => c.linkedAccountId === accountId && c.type === 'contribute')
    .reduce((s, c) => s + c.amount, 0);

  // pot withdrawals increase linked account balance
  const potIn = potTransactions
    .filter(c => c.linkedAccountId === accountId && c.type === 'withdraw')
    .reduce((s, c) => s + c.amount, 0);

  return openingBalance + incomeTotal - spendTotal - transferOut + transferIn - potOut + potIn;
}
```

Match expenses to accounts by `paymentMethod` name (string match against `account.name`).

**Query boundary:** Only load expenses and transfers dated on or after `account.createdAt`. Ignore older records — they predate the account and would distort the balance.

---

### Screen behaviour — Accounts sub-tab (Budget → Accounts)

**Header:** eyebrow "Budget", h1 "Accounts"

**Total card:** teal card at top — "Total across accounts" + sum of all account balances

**Account list:**
- Each account: icon (by type), name, running balance (large, tabular), opening balance (muted small below)
- Running balance: teal if ≥ 0, danger red if < 0
- "last updated" = date of most recent expense/transfer touching this account
- Tap account → account detail sheet: edit name, edit opening balance only — no delete (accounts are permanent; deleting would orphan transfers and pot links)
- `+ Add account` dashed card at bottom → bottom sheet: name input, opening balance, type selector (bank/ewallet/card/savings)

**Recent transfers section:**
- Shows last 5 transfers, double-arrow icon, teal text
- "See all" link → switches to Log tab with Transfers chip active; `log.js` exports `showLogTransfers()` which `app.js` calls on nav switch

**`+ Transfer` button** (floating or in header):
- Bottom sheet: From dropdown (account list), To dropdown, amount input, date, notes
- From and To must differ — confirm button disabled if same account selected
- Preview card: shows new balance for both accounts after transfer
- Confirm → write to `transfers/{id}`, update both account balances (recalculated on next render)
- Transfer appears in Expense Log

---

### Screen behaviour — Savings sub-tab (Budget → Savings)

**Header:** eyebrow "Budget", h1 "Savings"

**Total card:** teal card — "Total saved" + sum of all pot `currentBalance` values

**Pot cards (one per pot):**
- Colour dot + pot name + linked account name (muted, right-aligned)
- Progress bar: `currentBalance / targetAmount` width, coloured by pot colour
  - If `targetAmount = 0`: bar shows solid fill, no percentage
- Balance line: `RM <currentBalance>` (large tabular) + `goal RM <targetAmount>` (muted)
- Two buttons: `Add` (teal tint) + `Withdraw` (neutral tint)
- Tap pot name → edit sheet: name, linked account, target amount, colour picker,
  monthly fixed toggle + amount input (toggle is a reminder label only — contributions are always manual)
- Edit sheet has a Delete button at bottom: confirm dialog → hard-delete pot + all its `potTransactions`

**Add contribution flow:**
1. Tap `Add` → bottom sheet: amount input, date, notes
2. On confirm: `pots[id].currentBalance += amount`, deduct from linked account balance (recalculated on next render)
   Write to `potTransactions/{txId}` (top-level collection)

**Withdraw flow:**
1. Tap `Withdraw` → bottom sheet: amount input (max = currentBalance), date, notes
2. On confirm: `pots[id].currentBalance -= amount`, add to linked account balance (recalculated on next render)
   Write to `potTransactions/{txId}` (top-level collection)

**`+ New pot` dashed card** at bottom → bottom sheet:
- Name, linked account (dropdown from accounts list), target amount (optional),
  colour picker (6 preset oklch colours), monthly fixed toggle + amount

#### `potTransactions/{txId}` — top-level collection
```
uid             string
potId           string
type            string    "contribute" | "withdraw"
amount          number
linkedAccountId string
date            string    "YYYY-MM-DD"
notes           string
createdAt       timestamp
```

---

### Log — Transfers chip

Add `Transfers` as a new filter chip in Screen 2 (Expense Log), after the payment method chips.

**Transfer rows in Log:**
- Icon: double-arrow (`ti-arrows-exchange`), teal background circle
- Category text: "CIMB → TNG" in teal colour
- Meta: date · "transfer" · notes (if any)
- Amount: teal, no minus sign (not an expense)
- Excluded from the header total RM and entry count when "All" or a payment method chip is selected
- Shown only when "Transfers" chip is active

**Implementation note:** Query `transfers` collection separately when Log month changes.
Merge and sort with expenses by date desc when Transfers chip is active.

---

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

### Account type icons (Tabler outline)

```js
const ACCOUNT_TYPE_ICONS = {
  bank:    'ti-building-bank',
  ewallet: 'ti-wallet',
  card:    'ti-credit-card',
  savings: 'ti-piggy-bank',
};
```

