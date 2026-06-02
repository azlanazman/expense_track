export const fmt  = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt0 = (n) => Math.round(n).toLocaleString(undefined);

export function parseLocalDate(s) { return new Date(s + 'T00:00:00'); }

export function displayDate(s) {
  return parseLocalDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

// Returns { year, month } of the month the current salary period started in.
export function salaryPeriodMonth(salaryDay) {
  const sd = salaryDay ?? 25;
  const t = new Date();
  const today = t.getDate(), y = t.getFullYear(), m = t.getMonth() + 1;
  if (today >= sd) return { year: y, month: m };
  return { year: m === 1 ? y - 1 : y, month: m === 1 ? 12 : m - 1 };
}

// "YYYY-MM-DD" start of the salary period whose anchor month is (year, month).
export function salaryStartForMonth(sd, year, month) {
  const day = Math.min(sd ?? 25, new Date(year, month, 0).getDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// "YYYY-MM-DD" end of the salary period whose anchor month is (year, month).
export function salaryEndForMonth(sd, year, month) {
  sd = sd ?? 25;
  if (sd <= 1) {
    const last = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  }
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  const day = Math.min(sd - 1, new Date(ny, nm, 0).getDate());
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Compact label: "25 May – 24 Jun 2026" (year shown once unless it spans years).
export function salaryPeriodLabel(startDate, endDate) {
  const s = parseLocalDate(startDate), e = parseLocalDate(endDate);
  const fmt = (d, showYear) =>
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(showYear ? { year: 'numeric' } : {}) });
  return s.getFullYear() === e.getFullYear()
    ? `${fmt(s)} – ${fmt(e, true)}`
    : `${fmt(s, true)} – ${fmt(e, true)}`;
}

export const CATEGORY_COLOURS = {
  food:             'oklch(0.65 0.24 30)',
  transport:        'oklch(0.70 0.20 80)',
  shopping:         'oklch(0.62 0.27 345)',
  health:           'oklch(0.58 0.24 12)',
  entertainment:    'oklch(0.56 0.27 290)',
  bills:            'oklch(0.52 0.24 245)',
  savings:          'oklch(0.60 0.24 155)',
  other:            'oklch(0.68 0.20 125)',
  _default:         'oklch(0.58 0.24 268)',
};
export const FALLBACK_HUES = [40, 120, 220, 300, 170, 70, 10, 230];

export function catColor(name, allCats) {
  const key = name.toLowerCase();
  if (CATEGORY_COLOURS[key]) return CATEGORY_COLOURS[key];
  const idx = allCats.findIndex(c => c.toLowerCase() === key);
  return `oklch(0.62 0.22 ${FALLBACK_HUES[(idx < 0 ? 0 : idx) % 8]})`;
}

export const DEFAULT_CATEGORIES    = ['Food', 'Transport', 'Shopping', 'Health', 'Entertainment', 'Bills', 'Savings', 'Other'];
export const DEFAULT_PAYMENTS      = ['Cash', 'Bank', 'Credit Card', 'E-Wallet'];
export const DEFAULT_PAYMENT_TYPES = { 'Cash':'ewallet', 'Bank':'bank', 'Credit Card':'card', 'E-Wallet':'ewallet' };

let toastTimer;
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
