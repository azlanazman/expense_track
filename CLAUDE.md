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
│   ├── db.js               # All Firestore operations
│   ├── add.js              # Screen 1 — Add Expense
│   ├── log.js              # Screen 2 — Expense Log
│   ├── report.js           # Screen 3 — Monthly Report
│   ├── settings.js         # Screen 4 — Settings
│   ├── budget.js           # Screen 5 — Budget overview (5a) + checklist (5b)
│   └── budget-templates.js # Budget templates sub-page (Settings)
└── firestore.rules
```

### Module dependency graph

```
firebase.js ◄── db.js ◄── add.js, log.js, report.js, settings.js, budget.js
state.js    ◄── db.js, add.js, log.js, report.js, settings.js, budget.js
helpers.js  ◄── add.js, log.js, report.js, settings.js, budget.js
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
- Fixed tab: fixed group × method table, ▾ expands items. CC Balance + Car Maintenance Balance
  rows amber, conditional on those items existing in `budgetTemplates`.
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
isVariable toggle. Add item per group, add group at bottom. CC budget + Car Maintenance budget
at top. Slide transition ≤ 220ms via `translateX` JS mini-stack (`subPageStack`).

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
