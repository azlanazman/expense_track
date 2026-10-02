// Shared "Tape" pieces: label-maker strips with an LED bar, a segmented LED bar, category icons and the
// on-track / watch / over status rule. Used by the Insights home (pocket.js), Budget and Report.
// The look lives in index.html (`.pk-*` classes and `--pk-*` tokens).
import { escapeHtml, fmt } from './helpers.js';

export const GLYPH = { good: '✓', warn: '▲', bad: '■', none: '–', early: '–' };
export const WORD  = { good: 'On track', warn: 'Watch', bad: 'Over', none: 'Not set', early: 'Too early' };

export const clamp  = (v, a, b) => Math.max(a, Math.min(b, v));
export const abbrev = (s) => (s.length > 10 ? s.slice(0, 9) + '.' : s);

const ICON = {
  food:      '<path d="M7 3v7M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3M7 11v10M17 3c-2.4 1.8-2.8 6-.6 8.4L17 12v9"/>',
  transport: '<path d="M4 16l1.6-5.2A2 2 0 0 1 7.5 9.4h9a2 2 0 0 1 1.9 1.4L20 16v3h-2.4v-1.6H6.4V19H4z"/><circle cx="7.6" cy="15" r=".9" fill="currentColor"/><circle cx="16.4" cy="15" r=".9" fill="currentColor"/>',
  family:    '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M3 20c0-3.2 2.3-5.4 5-5.4s5 2.2 5 5.4M14.5 20c0-2.2 1.5-3.8 3.4-3.8 1.9 0 3.1 1.6 3.1 3.8"/>',
  shopping:  '<path d="M6 8h12l-1 12H7z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  health:    '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/>',
  other:     '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  bills:     '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>',
  savings:   '<path d="M12 21v-8"/><path d="M12 13c-4 0-6-2.5-6-6 3.5 0 6 2 6 6zM12 13c4 0 6-2.5 6-6-3.5 0-6 2-6 6z"/>',
  tag:       '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor"/>',
};
const ICON_BY_NAME = { food: 'food', transport: 'transport', family: 'family', shopping: 'shopping', health: 'health', misc: 'other', other: 'other', bills: 'bills', savings: 'savings' };

export const ico = (k, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ICON.tag}</svg>`;
export const iconFor = (name) => ICON_BY_NAME[String(name).toLowerCase()] || 'tag';

// Status of one category against its limit. `T` = share of the period elapsed (1 for a finished period);
// `early` ignores pace in the first days of a period.
export function catStatus(spent, limit, T, early) {
  const used = limit ? spent / limit : 0, pace = T > 0 ? used / T : 0, left = limit - spent;
  let st;
  if (!limit) st = 'none';
  else if (used >= 1) st = 'bad';
  else if (early) st = 'good';
  else st = pace <= 1.05 ? 'good' : pace <= 1.3 ? 'warn' : 'bad';
  return { used, pace, left, st };
}

// One strip. d = { key, title, code, icon, tone, big, aria, frac, notch }; every text field is escaped here.
//   opts.half      narrow variant (two per row, bar underneath)
//   opts.selected  orange "pressed" state
//   opts.static    not a button (Report): no press, optional `pct` text instead of the glyph
//   opts.attrs     extra attributes for the button (already safe)
export function tapeStrip(d, n, opts = {}) {
  const { half = false, selected = false, isStatic = false, pct = '' } = opts;
  const none = d.tone === 'none', segN = half ? 10 : 24;
  const lit = none ? 0 : Math.round(clamp(d.frac, 0, 1) * segN);
  let bar = '<span class="pk-bar">';
  for (let k = 0; k < segN; k++) bar += `<i class="${k < lit ? 'on' : ''}" style="--k:${k}"></i>`;
  if (d.notch !== null && d.notch !== undefined && !none) bar += `<u style="left:${(d.notch * 100).toFixed(1)}%"></u>`;
  bar += '</span>';
  const nm   = half ? escapeHtml(d.code) : escapeHtml(abbrev(d.title).toUpperCase());   // already escaped
  const aria = escapeHtml(d.title) + ', ' + (isStatic ? '' : WORD[d.tone] + ', ') + escapeHtml(d.aria);
  const cls  = 'pk-tp pk-st-' + d.tone + (selected ? ' sel' : '') + (half ? ' half' : '') + (isStatic ? ' static rp' : '');
  const tail = isStatic ? '<span class="pk-tp-pc">' + escapeHtml(pct) + '</span>' : '<span class="pk-glyph">' + GLYPH[d.tone] + '</span>';
  const open = isStatic
    ? `<div class="${cls}" role="group" aria-label="${aria}" style="--i:${n}">`
    : `<button type="button" class="${cls}" data-key="${escapeHtml(d.key)}" aria-pressed="${selected}" aria-label="${aria}" style="--i:${n}">`;
  return open + `<span class="pk-tp-ic">${ico(d.icon, 15)}</span>` + '<span class="pk-tp-nm">' + nm + '</span>' + (half ? '' : bar) +
    '<span class="pk-tp-v">' + escapeHtml(d.big) + '</span>' + tail + (half ? bar : '') + (isStatic ? '</div>' : '</button>');
}

// Segmented LED bar (bills paid, savings pots). `on` of `total` steps lit, in the status colour of `tone`
// (good / warn / bad) or in `colour` (a CSS colour for pots).
export function ledBar(on, total, tone, colour) {
  let s = '';
  for (let k = 0; k < total; k++) s += `<i class="${k < on ? 'on' : ''}"></i>`;
  const style = colour ? ` style="--c:${escapeHtml(colour)}"` : '';
  return `<div class="pk-ledbar pk-st-${tone || 'good'}"${style}>` + s + '</div>';
}

// Bills paid against the share of the period gone: on track if paid keeps up with the calendar
export function ratioTone(paid, total, T, early) {
  if (!total) return 'none';
  if (early) return 'good';
  const r = paid / total;
  return r >= T - 0.15 ? 'good' : r >= T - 0.4 ? 'warn' : 'bad';
}

// Static LCD readout (no typing effect): a label row, a big amount and an optional small line underneath.
// `note` is trusted text built by the caller from numbers only.
export function lcdStatic(left, right, amount, note) {
  return '<div class="pk-lcd static plain"><div class="pk-l1"><span>' + escapeHtml(left) + '</span><span>' + escapeHtml(right) + '</span></div>' +
    '<div class="pk-bigv"><small>RM</small>' + (amount < 0 ? '−' : '') + fmt(Math.abs(amount)) + '</div>' +
    (note ? '<div class="pk-note">' + escapeHtml(note) + '</div>' : '') + '</div>';
}
