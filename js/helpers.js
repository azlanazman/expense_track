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
  // Universal defaults
  food:             'oklch(0.64 0.085 25)',
  transport:        'oklch(0.64 0.085 60)',
  shopping:         'oklch(0.64 0.085 330)',
  health:           'oklch(0.64 0.085 5)',
  entertainment:    'oklch(0.64 0.085 285)',
  bills:            'oklch(0.64 0.085 250)',
  savings:          'oklch(0.64 0.085 150)',
  other:            'oklch(0.64 0.085 100)',
  _default:         'oklch(0.64 0.085 265)',
};
export const FALLBACK_HUES = [40, 120, 220, 300, 170, 70, 10, 230];

export function catColor(name, allCats) {
  const key = name.toLowerCase();
  if (CATEGORY_COLOURS[key]) return CATEGORY_COLOURS[key];
  const idx = allCats.findIndex(c => c.toLowerCase() === key);
  return `oklch(0.64 0.085 ${FALLBACK_HUES[(idx < 0 ? 0 : idx) % 8]})`;
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
