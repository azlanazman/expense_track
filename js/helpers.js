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
  family:   'oklch(0.62 0.20 150)',
  food:     'oklch(0.62 0.20 25)',
  toll:     'oklch(0.62 0.20 60)',
  parking:  'oklch(0.62 0.20 330)',
  fuel:     'oklch(0.62 0.20 250)',
  car:      'oklch(0.62 0.20 285)',
  subs:     'oklch(0.62 0.20 200)',
  medical:  'oklch(0.62 0.20 5)',
  misc:     'oklch(0.62 0.20 100)',
  _default: 'oklch(0.62 0.20 265)',
};
export const FALLBACK_HUES = [40, 120, 220, 300, 170, 70, 10, 230];

export function catColor(name, allCats) {
  const key = name.toLowerCase();
  if (CATEGORY_COLOURS[key]) return CATEGORY_COLOURS[key];
  const idx = allCats.findIndex(c => c.toLowerCase() === key);
  return `oklch(0.62 0.20 ${FALLBACK_HUES[(idx < 0 ? 0 : idx) % 8]})`;
}

export const DEFAULT_CATEGORIES = ['Family', 'Food', 'Toll', 'Parking', 'Fuel', 'Car', 'Subs', 'Medical', 'Misc'];
export const DEFAULT_PAYMENTS   = ['TNG', 'CIMB', 'RHB', 'MLMT', 'SETEL', 'AEON', 'SPAY'];

let toastTimer;
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
