# Daily Expense Tracker — Claude Code Build Guide

## Project overview

A mobile-first personal expense tracking web app. Single-user, Google Sign-In via
Firebase Auth, data stored in Firestore. Deployed as a static site on GitHub Pages.
No build step — plain HTML, CSS, and vanilla JavaScript. `index.html` contains the
HTML skeleton and all CSS; app logic is split into ES modules under `js/`.

Design direction: **colour blocking, bold, pop-up feel** — large solid colour blocks,
strong coloured shadows, elevated cards. Accent = bright yellow (`oklch(0.84 0.18 86)`),
complement = jet black (`oklch(0.22 0.01 265)`). Source of truth: `design_handoff_expense_tracker/` folder.

---

## Tech stack

| Layer      | Choice                              | Reason                             |
|------------|-------------------------------------|------------------------------------|
| Hosting    | GitHub Pages                        | Static, free, auto-deploys on push |
| Auth       | Firebase Authentication (Google)    | One-tap login, no passwords        |
| Database   | Cloud Firestore                     | Real-time NoSQL, free tier enough  |
| Frontend   | Vanilla JS + HTML + CSS, ES modules | No build step, no bundler needed   |
| Offline    | Disabled                            | Not required                       |

---

## Repository structure

```
/
├── index.html                          # HTML skeleton + all CSS
├── js/
│   ├── app.js                          # Entry point: auth, navigation, user settings
│   ├── firebase.js                     # Firebase app init (auth, db, provider)
│   ├── state.js                        # Shared mutable state (currentUser, userSettings)
│   ├── helpers.js                      # Pure utilities: fmt, dates, catColor, toast
│   ├── db.js                           # All Firestore operations
│   ├── add.js                          # Screen 1 — Add Expense
│   ├── log.js                          # Screen 2 — Expense Log
│   ├── report.js                       # Screen 3 — Monthly Report
│   ├── settings.js                     # Screen 4 — Settings
│   ├── budget.js                       # Screen 5 — Budget overview + checklist
│   └── budget-templates.js             # Budget templates sub-page (Settings)
├── firestore.rules                     # Firestore security rules
├── README.md                           # Setup and deploy guide
├── CLAUDE.md                           # This file
└── design_handoff_expense_tracker/     # Design reference (do not ship)
    ├── Expense Tracker.html
    ├── app.jsx
    ├── data.jsx
    ├── screens.jsx
    ├── ui.jsx
    └── tweaks-panel.jsx
```

### Module dependency graph

```
firebase.js ◄── db.js ◄── add.js, log.js, report.js, settings.js, budget.js
state.js    ◄── db.js, add.js, log.js, report.js, settings.js, budget.js
helpers.js  ◄── add.js, log.js, report.js, settings.js, budget.js
app.js      ◄── imports all screen modules; is the <script> entry point
```

`index.html` loads only `<script type="module" src="js/app.js"></script>`.
Each screen module is imported once by `app.js`; module-level event listeners
are wired at import time. Screen `init*()` / `render*()` functions are called
from `app.js` nav handlers.

---

## Design system (FINAL — locked)

### Font

**Plus Jakarta Sans** — geometric, neutral, modern.
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
```
Weights used: 400 / 500 / 600 / 700 / 800.
Fallback: `system-ui, sans-serif`.
Always set: `-webkit-font-smoothing: antialiased` and
`font-feature-settings: "ss01" 1, "cv01" 1`.

Use **tabular numerals** (`font-variant-numeric: tabular-nums`) for ALL money
values, counts, and report figures so columns stay aligned.

### Typography scale

| Role                        | Size      | Weight | Tracking    |
|-----------------------------|-----------|--------|-------------|
| Screen `h1` title           | 30px      | 800    | −0.025em    |
| Report month / log total    | 22–24px   | 800    | −0.02em     |
| Stat card value             | 30px      | 800    | −0.025em    |
| Amount input (hero card)    | 46px      | 800    | −0.03em     |
| Body / field value          | 16px      | 500    | —           |
| Row title / row amount      | 16px      | 700    | —           |
| Field label                 | 13px      | 600    | —           |
| Eyebrow / meta              | 12.5–13px | 600    | —           |
| Section block label         | 12px      | 700    | 0.08em, UC  |
| Chip label                  | 14px      | 600    | —           |
| Payment pill                | 10.5–12px | 700    | 0.03em      |

### CSS variables — full `:root` block

Paste this verbatim into `index.html`. Do not change any value.

```css
:root {
  /* neutrals */
  --ink:        oklch(0.24 0.012 265);   /* primary text  ≈ #2b2f36 */
  --ink-2:      oklch(0.46 0.012 265);   /* secondary */
  --ink-3:      oklch(0.62 0.012 265);   /* tertiary / muted */
  --line:       oklch(0.91 0.006 265);   /* borders */
  --line-2:     oklch(0.95 0.005 265);   /* hairlines */
  --surface:    oklch(1 0 0);            /* cards = white */
  --screen-bg:  oklch(0.994 0.002 95);   /* screen background, warm near-white */
  --page-bg:    oklch(0.965 0.004 95);   /* page behind frames */
  --danger:     oklch(0.55 0.16 25);     /* destructive / sign out */

  /* accent — teal (FINAL) */
  --accent:        oklch(0.62 0.115 185);
  --accent-strong: oklch(0.57 0.115 185);       /* hover */
  --accent-soft:   oklch(0.962 0.05 185);        /* pale tint fills */
  --accent-line:   oklch(0.9 0.07 185);          /* tinted borders */
  --accent-ink:    oklch(0.46 0.109 185);        /* text on soft tint */
  --accent-shadow: oklch(0.62 0.115 185 / 0.55); /* coloured shadow */
  --on-accent:     oklch(0.99 0.006 185);        /* text on accent fill */

  /* complement — coral / hue+180° = 5 */
  --comp:        oklch(0.64 0.115 5);
  --comp-soft:   oklch(0.962 0.05 5);
  --comp-line:   oklch(0.9 0.07 5);
  --comp-ink:    oklch(0.46 0.109 5);
  --comp-shadow: oklch(0.64 0.115 5 / 0.5);
  --on-comp:     oklch(0.99 0.006 5);

  /* radius (corners = subtle) */
  --radius:    12px;
  --radius-sm: 7px;
  --radius-lg: 19px;
  /* chips always use border-radius: 999px regardless */

  /* spacing multiplier (density = airy) */
  --sp: 1;
}
```

### Category dot colours (tonal mode — FINAL)

Each category has a fixed dot colour: `oklch(0.64 0.085 <hue>)`.
Implement as a JS lookup — not user-configurable.

```js
const CATEGORY_COLOURS = {
  family:       'oklch(0.64 0.085 150)',
  food:         'oklch(0.64 0.085 25)',
  toll:         'oklch(0.64 0.085 60)',
  parking:      'oklch(0.64 0.085 330)',
  fuel:         'oklch(0.64 0.085 250)',
  car:          'oklch(0.64 0.085 285)',
  subs:         'oklch(0.64 0.085 200)',
  medical:      'oklch(0.64 0.085 5)',
  misc:         'oklch(0.64 0.085 100)',
  _default:     'oklch(0.64 0.085 265)',
};

// Helper — returns dot colour for any category key
function catColor(key) {
  return CATEGORY_COLOURS[key] ?? CATEGORY_COLOURS._default;
}
```

For new user-created categories not in this list, cycle through a set of fallback
hues: `[40, 120, 220, 300, 170, 70, 10, 230]`.

### Spacing & layout

- **Horizontal screen padding:** `24px`
- **Screen header padding:** `calc(var(--sp) * 14px) 24px calc(var(--sp) * 18px)`
- **Body gap between sections:** `calc(var(--sp) * 18px)`
- **Field internal padding:** `calc(var(--sp) * 14px) 16px`
- **Settings section gap:** `calc(var(--sp) * 26px)`
- **Bottom nav padding:** `12px 8px calc(12px + var(--sp) * 6px)`
- **Filter chip row gap:** `9px`

### Money formatting

```js
const fmt  = (n) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n) => Math.round(n).toLocaleString('en-MY');
// Usage: `RM ${fmt(amount)}`  → "RM 1,204.50"
```

---

## Component CSS (verbatim from design handoff)

Copy these styles into the `<style>` block of `index.html`.

```css
* { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: var(--screen-bg);
  font-family: "Plus Jakarta Sans", system-ui, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "ss01" 1, "cv01" 1;
}

/* ── Amount hero card ── */
.amount-card {
  background: var(--accent);
  color: var(--on-accent);
  border-radius: var(--radius-lg);
  padding: calc(var(--sp) * 22px) 24px;
  box-shadow: 0 12px 24px -12px var(--accent-shadow);
}
.amount-label { font-size: 13px; font-weight: 600; opacity: 0.85; }
.amount-input { display: flex; align-items: baseline; gap: 10px; margin-top: 6px; }
.amount-input .rm { font-size: 24px; font-weight: 700; opacity: 0.85; }
.amount-input input {
  background: none; border: none; outline: none;
  color: var(--on-accent); font: inherit;
  font-size: 46px; font-weight: 800; letter-spacing: -0.03em;
  width: 100%; font-variant-numeric: tabular-nums;
}
.amount-input input::placeholder { color: var(--on-accent); opacity: 0.55; }

/* ── Form fields ── */
.field { display: flex; flex-direction: column; gap: 8px; position: relative; }
.field-label { font-size: 13px; font-weight: 600; color: var(--ink-2); }
.input-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: calc(var(--sp) * 14px) 16px;
  font-size: 16px; font-weight: 500; color: var(--ink);
  width: 100%; cursor: pointer; transition: 0.15s; text-align: left;
}
.input-row.select:hover { border-color: var(--accent-line); }
input.input-row { outline: none; }
input.input-row::placeholder { color: var(--ink-3); font-weight: 500; }
.chev { transition: transform 0.2s; }
.chev.open { transform: rotate(180deg); color: var(--accent); }

/* ── In-flow dropdown ── */
.dropdown {
  position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 20;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: 0 16px 40px -12px oklch(0.3 0.02 265 / 0.28);
  padding: 6px; max-height: 280px; overflow: auto;
}
.dd-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; text-align: left; background: none; border: none;
  padding: 11px 12px; border-radius: calc(var(--radius) * 0.7);
  font: inherit; font-size: 15px; font-weight: 500; color: var(--ink);
  cursor: pointer; transition: 0.12s;
}
.dd-item:hover { background: var(--accent-soft); }
.dd-item.on { color: var(--accent); font-weight: 700; }
.dd-check { margin-left: auto; color: var(--accent); }

/* ── Chips ── */
.chip {
  display: inline-flex; align-items: center; gap: 7px;
  font: inherit; font-size: 14px; font-weight: 600; color: var(--ink-2);
  background: var(--surface); border: 1px solid var(--line);
  padding: 9px 15px; border-radius: 999px; cursor: pointer;
  transition: 0.14s; white-space: nowrap;
}
.chip:hover { border-color: var(--accent-line); }
.chip.on { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.chip.soft { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent-ink); }
.chip.soft.comp { background: var(--comp-soft); border-color: var(--comp-line); color: var(--comp-ink); }
.chip.add { background: none; border-style: dashed; color: var(--ink-3); }
.chip.add:hover { color: var(--accent); border-color: var(--accent); }
.chip-dot { width: 11px; height: 11px; border-radius: 999px; flex-shrink: 0; }
.filter-row { display: flex; flex-wrap: wrap; gap: 9px; padding: 0 24px calc(var(--sp) * 16px); }

/* ── Payment pill ── */
.pay-pill {
  display: inline-flex; align-items: center;
  font-size: 11px; font-weight: 700; letter-spacing: 0.03em;
  background: var(--comp-soft); color: var(--comp-ink);
  padding: 3px 8px; border-radius: 6px;
}

/* ── Log list ── */
.log-row {
  display: flex; align-items: center; gap: 14px;
  width: 100%; text-align: left; background: none; border: none;
  border-bottom: 1px solid var(--line-2);
  padding: calc(var(--sp) * 15px) 2px;
  cursor: pointer; font: inherit; transition: 0.12s;
}
.log-row:hover {
  background: var(--accent-soft); border-radius: var(--radius-sm);
  padding-left: 12px; padding-right: 12px; border-bottom-color: transparent;
}
.log-dot { width: 13px; height: 13px; border-radius: 999px; flex-shrink: 0; }
.log-main { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 0; }
.log-cat { font-size: 16px; font-weight: 700; color: var(--ink); }
.log-meta { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--ink-3); font-weight: 500; }
.log-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.log-amt { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; white-space: nowrap; }
.log-note { font-size: 12px; color: var(--ink-3); font-style: italic; }
.list-hint { display: flex; align-items: center; justify-content: center; gap: 7px;
  color: var(--ink-3); font-size: 12.5px; font-weight: 500; padding: 18px 0 4px; }

/* ── Report stat cards ── */
.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.stat-card {
  border-radius: var(--radius-lg); padding: calc(var(--sp) * 18px) 18px;
  display: flex; flex-direction: column; gap: 8px;
  min-height: 96px; justify-content: space-between;
}
.stat-card.accent { background: var(--accent); color: var(--on-accent); box-shadow: 0 12px 24px -14px var(--accent-shadow); }
.stat-card.comp   { background: var(--comp);   color: var(--on-comp);   box-shadow: 0 12px 24px -14px var(--comp-shadow); }
.stat-label { font-size: 12.5px; font-weight: 600; opacity: 0.85; }
.stat-val   { font-size: 30px; font-weight: 800; letter-spacing: -0.025em; font-variant-numeric: tabular-nums; }
.block-label { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 4px; display: block; }

/* ── Breakdown bars ── */
.breakdown { display: flex; flex-direction: column; gap: 11px; }
.bd-row { display: grid; grid-template-columns: 92px 1fr auto; align-items: center; gap: 12px; }
.bd-name { display: inline-flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 600; color: var(--ink); }
.bd-bar  { height: 8px; background: var(--line-2); border-radius: 999px; overflow: hidden; }
.bd-fill { display: block; height: 100%; border-radius: 999px; }
.bd-amt  { font-size: 13.5px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--ink-2); }

/* ── Report table ── */
.grid-scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); -webkit-overflow-scrolling: touch; }
.report-table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
.report-table th, .report-table td { padding: 12px 14px; text-align: right; white-space: nowrap; font-size: 13.5px; }
.report-table thead th { font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; color: var(--ink-3); text-transform: uppercase; background: var(--surface); border-bottom: 1px solid var(--line); }
.report-table tbody td { font-weight: 600; color: var(--ink); border-bottom: 1px solid var(--line-2); }
.report-table tbody td.zero { color: oklch(0.82 0.006 265); font-weight: 500; }
.report-table .sticky-col { position: sticky; left: 0; text-align: left; background: var(--surface); font-weight: 700; }
.report-table thead .sticky-col { z-index: 2; }
.report-table .tot-col { font-weight: 800; color: var(--accent-ink); background: var(--accent-soft); }
.report-table tfoot td { font-weight: 800; color: var(--ink); background: var(--accent-soft); border-top: 1.5px solid var(--accent-line); }
.report-table tfoot .sticky-col { background: var(--accent-soft); }
.report-table tfoot .tot-col { background: var(--accent); color: var(--on-accent); }

/* ── Settings row cards ── */
.row-card {
  display: flex; align-items: center; gap: 14px;
  width: 100%; text-align: left;
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--radius); padding: 16px;
  cursor: pointer; font: inherit; transition: 0.14s;
}
.row-card + .row-card { margin-top: 10px; }
.row-card:hover { border-color: var(--accent-line); }
.rc-ic { width: 40px; height: 40px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
.rc-main { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.rc-title { font-size: 15.5px; font-weight: 700; color: var(--ink); }
.rc-sub   { font-size: 12.5px; color: var(--ink-3); }
.row-card.danger { color: var(--danger); }
.row-card.danger .rc-ic { background: oklch(0.95 0.03 25); color: var(--danger); }
.row-card.danger .rc-title { color: var(--danger); }
.row-card.danger:hover { border-color: oklch(0.8 0.08 25); background: oklch(0.985 0.012 25); }

/* ── Bottom nav ── */
.bottom-nav {
  display: flex; align-items: stretch; justify-content: space-around;
  border-top: 1px solid var(--line); background: var(--surface);
  padding: 12px 8px calc(12px + var(--sp) * 6px);
  position: fixed; bottom: 0; left: 0; right: 0;
  padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
.nav-item {
  display: flex; flex-direction: column; align-items: center; gap: 5px; flex: 1;
  background: none; border: none; font: inherit;
  font-size: 11.5px; font-weight: 600; color: var(--ink-3);
  cursor: pointer; transition: 0.14s; padding: 2px 0;
  min-height: 44px; justify-content: center;
}
.nav-item.on    { color: var(--accent); font-weight: 700; }
.nav-item:hover { color: var(--accent); }

/* ── Screen scaffold ── */
.screen { display: flex; flex-direction: column; min-height: 100dvh; padding-bottom: calc(60px + env(safe-area-inset-bottom, 0px)); }
.hdr { padding: calc(var(--sp) * 14px) 24px calc(var(--sp) * 18px); }
.hdr-eyebrow { font-size: 12.5px; font-weight: 600; color: var(--ink-3); margin-bottom: 5px; }
.hdr h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.05; }
.hdr-total { margin-top: 12px; font-size: 22px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.hdr-total span { font-size: 13px; font-weight: 600; color: var(--ink-3); letter-spacing: 0; }
.screen-body { padding: 0 24px calc(var(--sp) * 22px); display: flex; flex-direction: column; gap: calc(var(--sp) * 18px); flex: 1; }

/* ── Month nav (Report header) ── */
.report-hdr { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.month-title { text-align: center; }
.month-nav {
  width: 40px; height: 40px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--surface);
  color: var(--ink); display: grid; place-items: center;
  cursor: pointer; flex-shrink: 0; transition: 0.15s;
}
.month-nav:hover { background: var(--accent-soft); border-color: var(--accent-line); color: var(--accent); }

/* ── Login screen ── */
.login-screen {
  min-height: 100dvh; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 40px 24px; gap: 32px; background: var(--screen-bg);
}
.login-title { font-size: 30px; font-weight: 800; letter-spacing: -0.025em; text-align: center; }
.login-sub { font-size: 14px; color: var(--ink-3); text-align: center; }
.btn-google {
  display: flex; align-items: center; gap: 12px;
  background: var(--accent); color: var(--on-accent);
  border: none; border-radius: var(--radius-lg);
  padding: 16px 28px; font: inherit; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: 0.15s; width: 100%; max-width: 320px; justify-content: center;
  box-shadow: 0 12px 24px -12px var(--accent-shadow);
}
.btn-google:hover { background: var(--accent-strong); }

/* ── Save button ── */
.btn-save {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--accent); color: var(--on-accent);
  border: none; border-radius: var(--radius-lg);
  padding: 16px; font: inherit; font-size: 16px; font-weight: 700;
  cursor: pointer; transition: 0.15s; width: 100%;
  box-shadow: 0 12px 24px -12px var(--accent-shadow);
}
.btn-save:hover { background: var(--accent-strong); }

/* ── Toast notification ── */
.toast {
  position: fixed; bottom: calc(70px + env(safe-area-inset-bottom, 0px));
  left: 50%; transform: translateX(-50%);
  background: var(--ink); color: oklch(0.99 0 0);
  padding: 10px 20px; border-radius: 999px;
  font-size: 13.5px; font-weight: 600; white-space: nowrap;
  opacity: 0; transition: opacity 0.2s;
  pointer-events: none; z-index: 100;
}
.toast.show { opacity: 1; }

/* ── Mobile responsive ── */
@media (max-width: 460px) {
  body { padding: 0; }
}
```

---

## Firebase project setup (one-time, done by user)

1. Go to https://console.firebase.google.com
2. Create a new project (e.g. `my-expense-tracker`)
3. Enable **Firestore Database** (start in production mode)
4. Enable **Authentication** → Sign-in method → **Google**
5. Add your GitHub Pages domain to **Authorised domains**: `yourusername.github.io`
6. Go to Project Settings → Your apps → Add web app
7. Copy the Firebase config object and paste into `index.html` where marked
   `// PASTE FIREBASE CONFIG HERE`

---

## Firestore data model

### Collection: `expenses`

```
expenses/{expenseId}
  uid            string     — Firebase Auth user ID (owner)
  date           string     — "YYYY-MM-DD"
  amount         number     — e.g. 12.50
  category       string     — e.g. "Food"
  paymentMethod  string     — e.g. "TNG"
  notes          string     — optional, can be empty string
  createdAt      timestamp  — Firestore server timestamp
```

### Collection: `userSettings`

```
userSettings/{uid}
  categories      string[]   — ordered list of category names
  paymentMethods  string[]   — ordered list of payment method names
```

### Defaults (seed on first login if no userSettings doc exists)

```js
const DEFAULT_CATEGORIES = [
  'Family','Food','Toll','Parking','Fuel',
  'Car','Subs','Medical','Misc'
];
const DEFAULT_PAYMENTS = ['TNG','CIMB','RHB','MLMT','SETEL','AEON','SPAY'];
```

---

## Firestore security rules

File: `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /expenses/{expenseId} {
      allow read, write: if request.auth != null
        && request.auth.uid == resource.data.uid;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.uid;
    }
    match /userSettings/{uid} {
      allow read, write: if request.auth != null
        && request.auth.uid == uid;
    }
  }
}
```

---

## App screens and behaviour

### Screen 0 — Login

- Full-screen centred layout on `--screen-bg`
- App name + subtitle
- Single "Sign in with Google" button using `.btn-google` styles
- Firebase `signInWithPopup(provider)` → on success show Screen 1

### Screen 1 — Add Expense

Header: eyebrow = today's date, `h1` = "Add expense"

Body (top → bottom):
1. **Amount hero card** (`.amount-card`) — teal filled block; label "Amount" + big
   `RM` prefix + numeric input (`inputmode="decimal"`, placeholder `0.00`, strips
   non `[0-9.]` characters)
2. **Date** field — `input[type=date]`, displayed as "29 May 2026" format
3. **Category** field — select row with colour dot + value + chevron; opens in-flow
   `.dropdown` listing all categories with dots and checkmark on selected
4. **Payment method** field — select row with `.pay-pill` + chevron; dropdown lists
   all methods
5. **Notes** — `input[type=text]`, placeholder "optional…"
6. **Save expense** button (`.btn-save`) with check icon

On save: validate amount > 0, write to Firestore, show `.toast` "Saved!", reset
amount field (keep date, category, payment method).

Opening one dropdown closes the other.

### Screen 2 — Expense Log

Header: eyebrow = "May 2026", `h1` = "Expense log",
`hdr-total` = `RM <sum>` + ` · <n> entries` (muted span)

Filter chips: `All` + payment methods that have entries in the selected month.
Show first 3 + a dashed `+N` chip that expands the rest. Single-select.
Active chip = `.chip.on`. Recompute total and count on filter change.

List rows (`.log-row`): colour dot → category name + meta line (date + `.pay-pill`)
→ amount (right-aligned, tabular) + italic note.

Row tap → bottom sheet or inline form with pre-filled fields + Delete button
(confirm before deleting).

Footer hint: "✎ tap a row to edit or delete"

Month navigation: `◀ May 2026 ▶` in the header.

### Screen 3 — Monthly Report

Header: month nav buttons (`.month-nav`) flanking centred title.

Filter chips: same chip row as Log but **multi-select**. `All` clears selection
(shows all columns). Narrowing selection reduces grid columns and recomputes totals.

Stat cards (2-up grid):
- Left: `.stat-card.accent` — "Total spent" + `RM <total>`
- Right: `.stat-card.comp` — "Entries" + `<count>`

Top categories: `.breakdown` bars — category name + dot, proportional fill bar
coloured by category, amount on the right.

Report table (`.grid-scroll` wrapper for horizontal scroll):
- Sticky first column = category (dot + name, left-aligned)
- One column per selected payment method (right-aligned, tabular)
- Zero cells render `—` with `.zero` class (faded)
- Rightmost "Total" column → `.tot-col` (accent-soft bg, accent-ink text)
- `<tfoot>` totals row → `accent-soft` bg; grand-total cell → solid accent fill +
  white text

### Screen 4 — Settings

Header: eyebrow = "signed in as you@gmail.com", `h1` = "Settings"

**Categories section:** `.chip-wrap` of `.chip.soft` chips (each with dot) +
a `.chip.add` dashed chip to add new. Tap chip to rename inline; swipe/long-press
or a small ✕ to delete. Changes write immediately to `userSettings/{uid}`.

**Payment methods section:** same chip pattern but `.chip.soft.comp` (complement
tint) + `.chip.add`.

**Account section:** `.row-card` with round `.rc-ic` icon (accent-soft bg, accent
colour), title "Google account", subtitle = user email, chevron.

**Sign out:** `.row-card.danger` — signs out and returns to Login screen.

---

## Navigation

Bottom nav bar — fixed to bottom, 4 items, safe-area aware.

| Tab label | Icon (inline SVG or Tabler) | Screen |
|-----------|-----------------------------|-|
| Add       | plus / add                  | Screen 1 |
| Log       | list                        | Screen 2 |
| Report    | chart-bar                   | Screen 3 |
| Settings  | settings                    | Screen 4 |

Active tab: `.nav-item.on` (accent colour, weight 700).

---

## Key implementation notes

### Firestore query

```js
import { query, collection, where, orderBy } from 'firebase/firestore';

const q = query(
  collection(db, 'expenses'),
  where('uid', '==', user.uid),
  where('date', '>=', `${year}-${String(month).padStart(2,'0')}-01`),
  where('date', '<=', `${year}-${String(month).padStart(2,'0')}-31`),
  orderBy('date', 'desc')
);
```

Requires a composite index on `(uid, date)` — Firestore will prompt you to create
it on first query.

### Date handling

- Store as `"YYYY-MM-DD"` string — easy to range-query by month
- Display as `"29 May 2026"` using `new Date(date).toLocaleDateString('en-MY', { day:'numeric', month:'short', year:'numeric' })`
- Default to user's local timezone

### Mobile UX requirements

- Minimum tap target: 44×44px for all interactive elements
- `inputmode="decimal"` on amount input → numeric keyboard on iOS/Android
- `input[type=date]` for date picker → native mobile UI
- `env(safe-area-inset-bottom)` on nav bar → iPhone notch safe
- No horizontal scroll on any screen except `.grid-scroll` report table

---

## GitHub Pages deployment

1. Push code to GitHub repository
2. Settings → Pages → Source: Deploy from branch → `main` → `/ (root)`
3. Live at `https://yourusername.github.io/repo-name`
4. Add this URL to Firebase Authorised Domains

Auto-deploys on every `git push` to `main`. No CI/CD needed.

---

## Build order for Claude Code

### Phase 1 — COMPLETE ✓

All Phase 1 screens are built and live on `main`. The codebase is modular:
edit the relevant `js/*.js` file for each screen, not `index.html`.

| # | What | File | Status |
|---|------|------|--------|
| 1 | HTML skeleton + CSS | `index.html` | ✓ done |
| 2 | Firebase init + auth | `js/firebase.js`, `js/app.js` | ✓ done |
| 3 | Shared state + helpers + DB | `js/state.js`, `js/helpers.js`, `js/db.js` | ✓ done |
| 4 | Screen 0 — Login | `js/app.js` | ✓ done |
| 5 | Screen 4 — Settings | `js/settings.js` | ✓ done |
| 6 | Screen 1 — Add Expense | `js/add.js` | ✓ done |
| 7 | Screen 2 — Expense Log | `js/log.js` | ✓ done |
| 8 | Screen 3 — Monthly Report | `js/report.js` | ✓ done |
| 9 | `firestore.rules` | `firestore.rules` | ✓ done |
| 10 | `README.md` | `README.md` | ✓ done |

---

## IMPORTANT — How to run Phase 2 builds

**Build one task at a time.** Each task below is a separate Claude Code session.

Each task edits a specific `js/*.js` file. **Never regenerate a whole file from
scratch** — read the existing file first, then append or edit the relevant section.
New screens (e.g. Budget) get their own new file.

For HTML changes (adding a new screen container or nav item), edit `index.html`
in the same task that builds the screen logic.

---

## PHASE 2 — Budget screen + Report revamp (LOCKED SPEC)

This section supersedes any earlier budget/report notes. Build after the original
7 tasks are complete.

---

### Phase 2 locked decisions (pre-build, do not revisit)

**Design direction:** Colour blocking + pop-up feel throughout. All primary stat cards
and hero cards use solid colour fills (no tint-only cards for primary surfaces).
Strong coloured box-shadows on every card. Cards should feel elevated and bold.

**New CSS tokens** — paste into `:root` in `index.html` alongside existing variables:

```css
/* amber — needs-entry checkbox, CC Balance & Car Maintenance rows */
--amber:        oklch(0.72 0.14 55);
--amber-strong: oklch(0.66 0.14 55);
--amber-soft:   oklch(0.96 0.045 55);
--amber-line:   oklch(0.88 0.08 55);
--amber-ink:    oklch(0.38 0.10 55);
--amber-shadow: oklch(0.72 0.14 55 / 0.50);
--on-amber:     oklch(0.14 0.04 55);

/* positive — Remaining stat card when net balance ≥ 0 */
--positive:        oklch(0.58 0.13 145);
--positive-strong: oklch(0.53 0.13 145);
--positive-soft:   oklch(0.96 0.04 145);
--positive-shadow: oklch(0.58 0.13 145 / 0.50);
--on-positive:     oklch(0.99 0.006 145);
```

**Budget stat card colour mapping:**

| Card | CSS | Note |
|---|---|---|
| Income | `.stat-card.accent` | solid yellow — existing class |
| Fixed paid | `.stat-card.comp` | solid black — existing class |
| Variable so far | `.stat-card` (white surface, strong shadow) | neutral rest in colour-blocking grid |
| Remaining (≥0) | `.stat-card.positive` | solid green |
| Remaining (<0) | `.stat-card.negative` (uses `--danger`) | solid red |

**Budget hero card** — jet black bg, yellow number:
```css
.budget-hero {
  background: var(--comp);
  color: var(--on-comp);
  /* number value uses color: var(--accent) */
}
```

**Sub-page navigation (Budget Templates in Settings):**
Use CSS `transform: translateX` slide transition, not instant show/hide.
Pattern: a JS mini-stack (`subPageStack`) — push adds a screen div class `sub-page-enter`,
pop reverses. Keep the slide duration ≤ 220ms.

**Behaviour rules locked:**
1. **Uncheck paid item** → delete orphaned expense doc from Firestore, set `paid: false` in budgetMonths.
2. **New month auto-seed** → on first open of a budget month with no doc, silently create
   `budgetMonths/{uid}_{YYYY-MM}` with payments seeded from `budgetTemplates/{uid}`, all `paid: false`.
3. **CC Balance formula** → scope RHB spend to `type === "variable"` expenses only.
4. **Month navigation** → Budget, Log, and Report each maintain independent month state.
5. **Report period chips** → only `Monthly` + `Salary Period`. 3M/6M removed; custom range
   is accessible via a `Custom` chip (manual from/to dates).

---

### Updated category definitions

#### Variable categories (Add Expense screen)
`Family`, `Food`, `Toll`, `Parking`, `Fuel`, `Car Maintenance`, `Subs`, `Medical`, `Misc`

Note: "Car Maintenance" replaces old "Car Maintainence" (spelling fixed).

#### Fixed budget groups + subcategories
| Group | Subcategories | Default payment |
|---|---|---|
| Loan | PTPTN, Car | CIMB, MLMT |
| Bills | Unifi, Umobile (personal), Umobile (parents), TNB, Air Selangor | TNG |
| Takaful | Takaful | CIMB |
| Family | Parents, Parents (motor), Wife, Aidan, Groceries | CIMB |
| Subs | Netflix, Sooka, Google One, Quronly, LinkedIn, Claude | TNG |
| Spay | SPaylater | SPAY |
| Community | Zakat, Sedekah | TNG / CIMB |
| CC | Charge (manual), Balance (calculated) | RHB |
| Car Maintenance | Balance (calculated) | CIMB |
| Saving | Emergency | CIMB (THAJI) |

#### Income items
`Salary` (fixed monthly, user sets amount), `Claim` (manual each month), `Other` (manual)

#### Savings buckets (design later)
`Car`, `CC`, `Others`

---

### Smart calculated fields

#### CC Balance
```
CC Balance = CC Budget (set in template)
           − CC Charge (entered manually in checklist each month)
           − Total RHB variable spend that month (auto-pulled from expenses)
```
Result is transferred to Savings CC. Shown in Fixed report tab with amber highlight.

#### Car Maintenance Balance
```
Car Maintenance Balance = Car Maintenance Budget (set in template)
                        − Total "Car Maintenance" variable expenses that month
```
Result transferred to Savings Car.

Both calculated fields shown in:
- Budget checklist as "auto-calc" (read-only, updates live)
- Report → Fixed tab as a highlighted row with formula footnote

---

### Firestore data model (updated)

#### `expenses/{id}` — unchanged structure, new fields
```
uid            string
date           string       "YYYY-MM-DD"
amount         number
category       string       variable category OR fixed group name
subCategory    string       optional — e.g. "Wife", "PTPTN", "Netflix"
paymentMethod  string
notes          string
createdAt      timestamp
type           string       "variable" | "fixed" | "income"
budgetItemId   string       optional — links to budgetTemplates item id (fixed only)
isIncome       boolean      true for income entries
```

#### `userSettings/{uid}` — updated
```
categories      string[]    variable categories list
paymentMethods  string[]    payment methods list
salaryDay       number      day of month salary arrives, default 25
```

#### `budgetTemplates/{uid}`
```
groups: [
  {
    id          string
    name        string      e.g. "Loan"
    items: [
      {
        id              string
        name            string      e.g. "PTPTN"
        paymentMethod   string
        defaultAmount   number      0 if variable
        isVariable      boolean     true = user enters amount each month
        isCalculated    boolean     true = CC Balance, Car Maintenance Balance
      }
    ]
  }
]
ccBudget              number    monthly CC budget (for CC Balance calc)
carMaintenanceBudget  number    monthly car maintenance budget
```

#### `budgetMonths/{uid}_{YYYY-MM}`
```
income: [
  { id, name, amount }     one entry per income item
]
payments: [
  {
    itemId      string      references budgetTemplates item id
    paid        boolean
    amount      number      actual amount paid (may differ from default)
    paidDate    string      "YYYY-MM-DD"
    expenseId   string      id of auto-created expense doc
  }
]
```

---

### Screen 5 — Budget (full spec)

#### 5a: Overview (landing)

Header: eyebrow = "Jun 2026", h1 = "Budget"

**Net balance hero card** (jet black `#1a1200`, yellow text `#d4a017`):
- Label: "Net balance"
- Value: `RM <income − fixed − variable>` in large bold
- Equation line: "Salary + Claim − Fixed − Variable" (muted small)
- Progress bar: % of fixed items paid this month

**4 stat cards (2×2 grid):**
- Income (yellow card): sum of all income entries this month
- Fixed (black card): sum of all paid fixed items this month
- Variable so far (warm tint): sum of variable expenses this month
- Remaining (green tint): net balance

**Income section:**
- Card with 3 rows: Salary, Claim, Other
- Each row: dot, name, amount with edit pencil icon
- Tap amount → inline number input, saves to `budgetMonths/{uid}_{YYYY-MM}.income`

**Fixed summary section:**
- Header: "Fixed" + "X/N paid → checklist" link (taps to 5b)
- Mini list showing top groups with their totals
- Collapsed view — shows first 4 groups + "+ N more"

#### 5b: Checklist (sub-screen, tapped from 5a)

Header: month nav `◀ Jun 2026 ▶`
Progress bar: `X / N paid` label right-aligned

**Groups (collapsible accordion):**
- ▸ = collapsed (shows group name + total only)
- ▾ = expanded (shows all items)
- Default: all expanded

**Item row states:**
- `paid` (checkbox filled black+yellow ✓): amount struck-through, greyed
- `unpaid` (empty checkbox): amount shown normally
- `needs entry` (amber dashed checkbox): isVariable=true items — tap to enter amount before marking paid
- `calculated` (auto-calc badge): CC Balance, Car Maintenance Balance — read-only, updates live

**Marking paid:**
1. User taps checkbox
2. App writes expense doc to `expenses` collection:
   - `type: "fixed"`, `category`: group name, `subCategory`: item name
   - `paymentMethod`: from template, `amount`: from payment entry
   - `budgetItemId`: item id, `date`: today
3. Updates `budgetMonths/{uid}_{YYYY-MM}.payments[itemId].paid = true`
4. Updates `budgetMonths/{uid}_{YYYY-MM}.payments[itemId].expenseId`

**CC Balance row** (calculated, read-only):
- Shows: `RM <ccBudget − ccCharge − rhbVariableSpend>`
- Footnote: "Budget X − Charge Y − RHB spend Z"
- Amber highlight

**Car Maintenance Balance row** (calculated, read-only):
- Shows: `RM <carMainBudget − carMainVariableSpend>`

---

### Screen 3 — Report (revamped spec)

#### Period selector (replaces old 4 chips)
Two chips only:
- `Monthly` — shows single calendar month, with `◀ Jun 2026 ▶` nav
- `Salary Period` — auto-sets From = salaryDay of previous month, To = salaryDay−1 of current month (e.g. 25 May → 24 Jun). User can override From/To manually.

#### Payment method filter chips
Multi-select. `All` resets to show all columns. Only methods with data shown.

#### Three tabs: Variable · Fixed · Combined

**On all three tabs:**
- Two stat cards: Total spent (yellow) + Daily average (black)
- Top categories bar chart (coloured dots, proportional bars, amounts right)
  - Variable tab: top variable categories
  - Fixed tab: top fixed groups
  - Combined tab: top merged categories
- Breakdown table (category × payment method, horizontal scroll)

**Variable tab:**
- Rows = variable categories that have expenses in the period
- Each row has ▾ to expand subcategories (user-entered notes become sub-rows)
- Columns = payment methods with data
- Zero cells = —
- Total column highlighted (accent-soft)
- Footer totals row

**Fixed tab:**
- Rows = fixed groups that have paid items in the period
- Each group row ▾ expands to show individual items paid
- CC Balance and Car Maintenance Balance rows highlighted amber (calculated)
- Columns = payment methods
- Footer formula footnote for CC and Car Maintenance

**Combined tab:**
- Shared categories (Family, Subs, Car Maintenance) → one merged row
  - Cell value = variable amount + fixed amount for that category × method
- Non-shared categories appear as their own rows
- Fixed-only groups (Loan, Bills, Takaful, Spay, Community, Saving) appear as rows
- Label column shows category name with a small pill: `var` or `fixed` for non-shared,
  no pill for merged rows
- Same stat cards and bar chart as above but merged data

#### Report table behaviour
- `table-layout: fixed`, horizontal scroll wrapper `.grid-scroll`
- Sticky first column (category name)
- `font-variant-numeric: tabular-nums` on all amount cells
- Zero cells: `—` with `.zero` class (faded)
- Total column: `.tot-col` (accent-soft bg, accent-ink text)
- Footer row: `accent-soft` bg, grand-total cell solid accent fill + black text

---

### Screen 4 — Settings (updated)

Sections in order:

1. **Variable categories** — chips with dots, add/rename/delete
2. **Payment methods** — chips, add/rename/delete
3. **Budget templates** → taps to sub-page (see below)
4. **Salary settings** — single row card:
   - Label: "Salary day"
   - Value: day number (e.g. "25th")
   - Tap → number picker 1–31
   - Saves to `userSettings/{uid}.salaryDay`
   - Used to auto-set Salary Period date range in Report
5. **Google account** — row card with email
6. **Sign out** — danger row card

#### Budget templates sub-page (Settings → Budget templates)

Accessed from Settings row "Budget templates →".

Layout:
- List of groups (Loan, Bills, Takaful, etc.)
- Each group expandable to show items
- Tap item → edit sheet:
  - Name (text input)
  - Payment method (dropdown)
  - Default amount (number input, 0 = not set)
  - Mark as variable (toggle — means user enters amount each month)
  - Mark as calculated (read-only toggle, only CC Balance + Car Maint Balance)
- Add item button inside each group
- Add group button at bottom
- Delete: swipe or long-press → confirm

Special fields at top of page:
- **CC monthly budget** — number input (used in CC Balance formula)
- **Car Maintenance monthly budget** — number input

---

### Navigation update

5 tabs (already in app): **Add · Log · Report · Budget · Settings**

Tab order and icons unchanged from Phase 1 design. Budget tab uses `ti-wallet` icon.

---

### Phase 2 — COMPLETE ✓

All Phase 2 tasks are built and live on `main`.

| # | What | File | Status |
|---|------|------|--------|
| 8  | Salary day setting + Budget templates row in Settings | `js/settings.js` | ✓ done |
| 9  | Budget templates sub-page | `js/budget-templates.js`, `js/db.js` | ✓ done |
| 10 | Budget overview screen (5a) | `js/budget.js`, `js/db.js` | ✓ done |
| 11 | Budget checklist screen (5b) | `js/budget.js`, `js/db.js` | ✓ done |
| 12 | Report revamp (period chips, 3 tabs, expandable rows) | `js/report.js` | ✓ done |

---

### Post-Phase 2 behaviour notes (live on `main`)

These decisions were made after Phase 2 shipped and are now the source of truth:

- **Log sort order** — entries always sorted by date descending on the client side (`js/log.js`), regardless of Firestore return order.
- **Report Variable tab expand** — tapping ▾ on a category row shows one sub-row per day (daily total), not one row per transaction. Multiple transactions on the same day are summed by payment method.
- **Calculated items deletable** — `isCalculated: true` items (CC Balance, Car Maintenance Balance) can be deleted from Budget Templates. The delete button is no longer hidden for them.
- **Report amber rows are conditional** — CC Balance and Car Maintenance Balance amber rows in Report → Fixed tab only render if those items still exist in the user's `budgetTemplates` document. Deleting them from Budget Templates removes them from the report too.

---

### Build tasks for Phase 2

#### Task 8 — userSettings salary day + Settings UI update
Files: `js/settings.js`, `index.html` (Settings screen HTML)
Prompt:
```
Edit js/settings.js. Add salaryDay field (default 25) to userSettings/{uid}
in Firestore (update loadUserSettings seed in js/app.js if needed).
Add a "Salary settings" row card to the Settings screen showing the current
salaryDay value. Tap → number picker 1–31 that saves to Firestore via
persistUserSettings in js/db.js. Also add a "Budget templates →" row card
that sets a flag to show a placeholder Budget templates sub-screen. Update
index.html to add the Budget templates sub-screen container div if needed.
```

#### Task 9 — Budget templates sub-page
Files: `js/settings.js` (or new `js/budget-templates.js`), `js/db.js`, `index.html`
Prompt:
```
Build the Budget templates sub-page (accessed from Settings → Budget templates).
Show groups as collapsible sections. Each item row shows name, payment method,
default amount. Tap item → bottom sheet with: name input, payment method
dropdown, default amount input, isVariable toggle. Add item and add group
buttons. Delete via long-press confirm. Add CC monthly budget and Car
Maintenance monthly budget fields at top. All data reads/writes to
budgetTemplates/{uid} in Firestore — add fetchBudgetTemplate and
persistBudgetTemplate helpers to js/db.js. Seed default groups and items from
CLAUDE.md on first access if doc doesn't exist.
```

#### Task 10 — Budget overview screen (5a)
Files: `js/budget.js` (new), `js/db.js`, `index.html`
Prompt:
```
Create js/budget.js and export initBudget(). Add Budget nav tab to index.html
and wire it in js/app.js. Build Budget screen (5a) overview. Net balance hero
card (black bg, yellow text): Income − Fixed paid − Variable spend. 4 stat
cards: Income (yellow), Fixed (black), Variable (warm tint), Remaining (green
tint). Income section: 3 rows (Salary, Claim, Other) with inline amount edit,
saves to budgetMonths/{uid}_{YYYY-MM}.income — add Firestore helpers to
js/db.js. Fixed summary: mini list of groups with totals, tap "X/N paid →
checklist" navigates to 5b.
```

#### Task 11 — Budget checklist screen (5b)
Files: `js/budget.js`, `js/db.js`
Prompt:
```
Add checklist sub-screen (5b) to js/budget.js. Month nav arrows. Progress
bar X/N paid. Load budgetTemplates groups and items. Render as collapsible
accordion groups. Three item states: paid (checked, struck through), unpaid
(empty checkbox), needs-entry (amber, isVariable=true). Tap unpaid → amount
input then confirm to mark paid. Marking paid: write expense doc to Firestore
with type="fixed", category=group, subCategory=item, paymentMethod from
template, budgetItemId, date=today — use addExpense from js/db.js. Update
budgetMonths payment record. CC Balance row: read-only, shows
ccBudget − ccCharge − sum of RHB variable expenses this month (query via
fetchExpenses in js/db.js). Car Maintenance Balance: carMainBudget − sum of
Car Maintenance variable spend. Both rows highlighted amber.
```

#### Task 12 — Report revamp
Files: `js/report.js`
Prompt:
```
Revamp js/report.js. Replace period chips with two only: Monthly (with month
nav arrows, reads salaryDay from userSettings) and Salary Period (auto
From=salaryDay prev month, To=salaryDay-1 current month, user can override).
Add three tabs: Variable, Fixed, Combined. Variable tab: category × payment
method table, ▾ rows expand subcategories (notes as sub-rows), only
type="variable" expenses (treat undefined type as variable). Fixed tab: group
× payment method table, ▾ rows expand items, only type="fixed" expenses, CC
Balance and Car Maintenance Balance rows highlighted amber with formula
footnote. Combined tab: merge shared categories (Family, Subs, Car
Maintenance) into single rows summing variable + fixed amounts; non-shared
categories appear as own rows with var/fixed pill label. All three tabs show:
two stat cards (Total spent yellow + Daily average black) and top categories
bar chart. Table scrolls horizontally inside grid-scroll. Sticky first column.
```

---

### Default budget template seed data

Seed this into `budgetTemplates/{uid}` on first access if document does not exist:

```js
const DEFAULT_BUDGET_TEMPLATE = {
  ccBudget: 0,
  carMaintenanceBudget: 0,
  groups: [
    { id:'loan', name:'Loan', items:[
      { id:'loan-ptptn', name:'PTPTN', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'loan-car', name:'Car', paymentMethod:'MLMT', defaultAmount:0, isVariable:false, isCalculated:false }
    ]},
    { id:'bills', name:'Bills', items:[
      { id:'bills-unifi', name:'Unifi', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'bills-umobile-personal', name:'Umobile (personal)', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'bills-umobile-parents', name:'Umobile (parents)', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'bills-tnb', name:'TNB', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'bills-airsel', name:'Air Selangor', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false }
    ]},
    { id:'takaful', name:'Takaful', items:[
      { id:'takaful-main', name:'Takaful', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false }
    ]},
    { id:'family', name:'Family', items:[
      { id:'family-parents', name:'Parents', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'family-parents-motor', name:'Parents (motor)', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'family-wife', name:'Wife', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'family-aidan', name:'Aidan', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'family-groceries', name:'Groceries', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false }
    ]},
    { id:'subs', name:'Subs', items:[
      { id:'subs-netflix', name:'Netflix', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'subs-sooka', name:'Sooka', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'subs-googleone', name:'Google One', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'subs-quronly', name:'Quronly', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'subs-linkedin', name:'LinkedIn', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'subs-claude', name:'Claude', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false }
    ]},
    { id:'spay', name:'Spay', items:[
      { id:'spay-main', name:'SPaylater', paymentMethod:'SPAY', defaultAmount:0, isVariable:false, isCalculated:false }
    ]},
    { id:'community', name:'Community', items:[
      { id:'community-zakat', name:'Zakat', paymentMethod:'TNG', defaultAmount:0, isVariable:false, isCalculated:false },
      { id:'community-sedekah', name:'Sedekah', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false }
    ]},
    { id:'cc', name:'CC', items:[
      { id:'cc-charge', name:'Charge', paymentMethod:'RHB', defaultAmount:0, isVariable:true, isCalculated:false },
      { id:'cc-balance', name:'Balance', paymentMethod:'RHB', defaultAmount:0, isVariable:false, isCalculated:true }
    ]},
    { id:'carmaint', name:'Car Maintenance', items:[
      { id:'carmaint-balance', name:'Balance', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:true }
    ]},
    { id:'saving', name:'Saving', items:[
      { id:'saving-emergency', name:'Emergency', paymentMethod:'CIMB', defaultAmount:0, isVariable:false, isCalculated:false }
    ]}
  ]
};
```

---

### Categories shared between Variable and Fixed (for Combined report)

These category names appear in both variable expenses and fixed budget groups.
The Combined tab merges rows where names match exactly:

| Shared category | Variable side | Fixed side |
|---|---|---|
| Family | Variable expenses tagged "Family" | Fixed group "Family" paid items |
| Subs | Variable expenses tagged "Subs" | Fixed group "Subs" paid items |
| Car Maintenance | Variable expenses tagged "Car Maintenance" | Fixed group "Car Maintenance" paid items |

All other fixed groups (Loan, Bills, Takaful, Spay, Community, CC, Saving) appear as
fixed-only rows in the Combined tab with a `fixed` pill label.

All other variable categories (Food, Toll, Parking, Fuel, Medical, Misc) appear as
variable-only rows with a `var` pill label.
