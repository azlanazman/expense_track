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
│   ├── app.js              # Entry point: auth, navigation, user settings seed, onboarding check
│   ├── firebase.js         # Firebase init (auth, db, provider)
│   ├── state.js            # Shared mutable state (currentUser, userSettings)
│   ├── helpers.js          # Pure utils: fmt, catColor, showToast; DEFAULT_* preset constants
│   ├── db.js               # All Firestore operations (expenses, accounts, transfers, pots)
│   ├── onboarding.js       # New-user onboarding overlay (tour + setup + final screen)
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

`init*()` / `render*()` functions are called from `app.js` nav handlers.
Module-level event listeners are wired at import time.

**Cross-tab navigation** (avoids circular imports) uses custom DOM events in `app.js`:
- `nav:show-log-transfers` — accounts.js dispatches; app.js activates Transfers chip in log
- `nav:go-add` — onboarding.js dispatches on completion; app.js calls `showScreen('add')`

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
const fmt  = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Math.round(n).toLocaleString(undefined);
// `RM ${fmt(amount)}` → "RM 1,204.50"
// negative: `−RM ${fmt(Math.abs(n))}` — always use minus prefix, never locale negative format
```

### Category dot colours

Defined in `helpers.js` as `CATEGORY_COLOURS` (lowercase keys). Vibrant colour-block style — high chroma
(0.20–0.27), distinct hues per category. Fallback for unknown names cycles `FALLBACK_HUES = [40, 120, 220, 300, 170, 70, 10, 230]`
at `oklch(0.62 0.22 <hue>)`. Universal keys: food, transport, shopping, health, entertainment, bills, savings, other.

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
categories          string[]   ordered variable category names
paymentMethods      string[]   ordered payment method names
salaryDay           number     day salary arrives, default 25
onboardingComplete  boolean    true = skip onboarding on next login
onboardingDate      string     ISO timestamp of setup completion
consentGiven        boolean    true = user accepted data storage consent on tour slide 2
consentDate         string     ISO timestamp of consent
```

### `budgetTemplates/{uid}`
```
groups: [{ id, name, items: [{ id, name, paymentMethod, defaultAmount, isVariable }] }]
```
Default scaffold (new users): Housing · Transport · Insurance · Family · Subscriptions · Savings · Other — all empty.

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
- Seeded from `userSettings.paymentMethods` on first open of Accounts tab, or during onboarding
- `createdAt` is an ISO string (client-side seeding, not a Firestore timestamp)
- Double-seeding guard: `initAccounts()` skips seed if accounts array already exists and is non-empty

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

**Screen 0 — Login:** Full-screen centred, single Google Sign-In button. After auth,
`checkOnboarding(uid)` runs — shows onboarding overlay if `onboardingComplete` is not true,
otherwise goes straight to Screen 1.

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
3. Budget templates → (slide-in sub-page)
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
  dashed, isVariable=true). Empty groups: "No items — add in Settings → Budget templates".
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

## Onboarding flow

Triggered once for new users immediately after Google Sign-In. Overlay mounts inside `#app`
with `position:absolute` (not `fixed` — avoids viewport/iframe height collapse). Removed from
DOM (not just hidden) on completion. Dispatches `nav:go-add` instead of importing `showScreen`
(circular import guard).

### Tour — 3 slides

Progress dots at top (pill=current, faded=done, small=upcoming). Slide transitions:
opacity + translateY(8px→0), 250ms. "Skip tour" on slides 0–1 jumps to Setup Step 0.
Slide 2 (Security) has no skip — it's the consent moment; "Set up my app →" writes `consentGiven:true`.

| Slide | Title | Key content |
|-------|-------|-------------|
| 0 — Welcome | "Your finances, finally clear" | Log expenses · Smart reports · Account balances |
| 1 — Budget | "Know your net balance" | Income tracking · Fixed bill checklist · Savings pots |
| 2 — Security | "Your data, yours only" | Consent note above CTA; tapping CTA writes `consentGiven:true` |

### Setup — 5 steps

Progress bar at top. Step badge top-right: "Setup N of 5".

| Step | Topic | Progress | Firestore write |
|------|-------|----------|-----------------|
| 0 | Salary day — 7-col day grid 1–31; Continue disabled until tapped; Skip available | 20% | `updateDoc userSettings { salaryDay }` |
| 1 | Categories — chip grid; `General ✓ / Start blank` preset buttons | 40% | `updateDoc userSettings { categories }` |
| 2 | Payment methods — chip grid with type badges; `General ✓` preset button | 60% | `updateDoc userSettings { paymentMethods }` + `setDoc accounts/{uid}` |
| 3 | Opening balances — one row per account, RM prefix + decimal input; Skip available | 80% | `setDoc accounts/{uid}` (update openingBalance per account) |
| 4 | Monthly income — Salary + Claim fields (neither enforced) | 100% | `setDoc budgetMonths/{uid}_{YYYY-MM} { income:[…] } { merge:true }` |

### Final screen

Centred layout, check icon in teal-soft circle. Summary rows: salary day, categories count,
accounts linked, salary amount. "Start tracking →" writes `onboardingComplete:true` +
`onboardingDate` to `userSettings`, removes overlay from DOM, dispatches `nav:go-add`.

### Re-trigger (dev/testing)

Add a temporary reset row to Settings or paste in browser devtools:
```js
await updateDoc(doc(db, 'userSettings', currentUser.uid), { onboardingComplete: false });
location.reload();
```

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
  Only loads expenses/transfers dated ≥ `account.createdAt`. Match by `paymentMethod === account.name`.
- **Savings pot `currentBalance`** is stored (not computed) — always written through
  Add/Withdraw flows; never derived from potTransactions.
- **Monthly recurring toggle** on pots is a reminder label only — contributions are always manual.
- **Transfer From ≠ To** enforced with toast on confirm (not a disabled button).
- **Budget sub-tab wiring** uses `btn.onclick =` assignment (not addEventListener) so handlers
  are replaced (not stacked) on repeated `initBudget()` calls.
- **`budgetMonths` income write:** always `setDoc(..., { merge: true })` — never plain setDoc,
  which would clobber the `payments` field seeded separately by `budget.js`.
- **Accounts double-seeding:** `initAccounts()` and onboarding Step 2 both seed accounts.
  Guard: skip seed if `accounts` array already exists and is non-empty.
- **ES module event listeners:** all buttons in dynamically injected HTML must be wired via
  `addEventListener` after injection — functions inside ES modules are not on `window`.

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

| Category        | Variable side              | Fixed side                         |
|-----------------|----------------------------|------------------------------------|
| Family          | expenses tagged "Family"   | Fixed group "Family" paid          |
| Subs            | expenses tagged "Subs"     | Fixed group "Subs" paid            |
| Car Maintenance | expenses tagged "Car Maintenance" | Fixed group "Car Maintenance" paid |

All other fixed groups → `fixed` pill. All other variable categories → `var` pill.

---

## Defaults & presets

Seed defaults only apply when no existing Firestore data is found — existing users are never affected.

### Category presets (`helpers.js`)

```js
DEFAULT_CATEGORIES = ['Food','Transport','Shopping','Health','Entertainment','Bills','Savings','Other']
```

Onboarding Step 1 offers `General ✓ | Start blank` preset buttons.

### Payment method presets (`helpers.js`)

```js
DEFAULT_PAYMENTS      = ['Cash','Bank','Credit Card','E-Wallet']
DEFAULT_PAYMENT_TYPES = { Cash:'ewallet', Bank:'bank', 'Credit Card':'card', 'E-Wallet':'ewallet' }
```

Onboarding Step 2: each chip has a type badge that cycles `bank → ewallet → card → savings` on tap.
Type badge colours: bank=teal-soft, ewallet=amber-soft, card=blue-soft, savings=green-soft.

### Budget template preset (`budget-templates.js`)

Default scaffold: Housing · Transport · Insurance · Family · Subscriptions · Savings · Other (all empty).
