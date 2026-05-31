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
