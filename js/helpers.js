export const fmt  = (n) => n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmt0 = (n) => Math.round(n).toLocaleString('en-MY');

export function parseLocalDate(s) { return new Date(s + 'T00:00:00'); }

export function displayDate(s) {
  return parseLocalDate(s).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
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
  // Malaysian preset (preserved for existing users)
  family:           'oklch(0.64 0.085 150)',
  toll:             'oklch(0.64 0.085 60)',
  parking:          'oklch(0.64 0.085 330)',
  fuel:             'oklch(0.64 0.085 250)',
  car:              'oklch(0.64 0.085 285)',
  'car maintenance':'oklch(0.64 0.085 285)',
  subs:             'oklch(0.64 0.085 200)',
  medical:          'oklch(0.64 0.085 5)',
  misc:             'oklch(0.64 0.085 100)',
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
export const MY_CATEGORIES_PRESET  = ['Family', 'Food', 'Toll', 'Parking', 'Fuel', 'Car Maintenance', 'Subs', 'Medical', 'Misc'];
export const DEFAULT_PAYMENTS      = ['Cash', 'Bank', 'Credit Card', 'E-Wallet'];
export const MY_PAYMENTS_PRESET    = ['TNG', 'CIMB', 'RHB', 'MLMT', 'SETEL', 'AEON', 'SPAY'];
export const MY_PAYMENTS_TYPES     = { TNG:'ewallet', SETEL:'ewallet', AEON:'ewallet', SPAY:'ewallet', CIMB:'bank', RHB:'bank', MLMT:'bank' };
export const DEFAULT_PAYMENT_TYPES = { 'Cash':'ewallet', 'Bank':'bank', 'Credit Card':'card', 'E-Wallet':'ewallet' };

let toastTimer;
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
