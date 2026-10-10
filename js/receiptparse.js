// Screenshot / receipt text -> expense fields. Pure functions (no DOM, no Firestore); the text comes from js/ocr.js
// (OCR of a screenshot) or from shared text. Everything it returns is a suggestion the person confirms in the Add sheet.
import { aliasMap, matchAt, suggest } from './quickparse.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, mac: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogos: 8, sep: 9, sept: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12 };
const MON_RE = '(jan|feb|mar|mac|apr|may|mei|jun|jul|aug|ogos|sept?|oct|okt|nov|dec|dis)[a-z]*';

const GOOD_WORDS = /\b(total|amount|paid|payment|pay|jumlah|bayaran|grand|debit|charged|purchase|pembelian|transaction amount)\b/i;
const BAD_WORDS  = /\b(balance|baki|cashback|rebate|points?|mata|change|tax|sst|gst|service|rounding|discount|diskaun|saving|saved|fee|reload|limit|tender|cash)\b/i;
const CHROME = /^(transaction|details?|success(ful)?|status|reference|ref|id|date|time|amount|total|payment|method|wallet|balance|receipt|thank|thanks|back|share|done|close|ok|view|invoice|tel|gst|sst|tax|cashier|paid|completed|pay|merchant|to|from|rm|myr|no|order|category|type|authorised|authorized|approved)\b/i;

const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

function validDate(y, m, d, today) {
  if (y < 2020 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);   // allow today and a day of slack
  return dt > t ? null : iso(y, m, d);
}

export function findDate(text, today = new Date()) {
  let m;
  const tryAll = [
    [new RegExp('\\b(20\\d{2})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b', 'g'), x => [+x[1], +x[2], +x[3]]],
    [new RegExp('\\b(\\d{1,2})\\s*[-/.]\\s*(\\d{1,2})\\s*[-/.]\\s*(\\d{2,4})\\b', 'g'), x => [x[3].length === 2 ? 2000 + +x[3] : +x[3], +x[2], +x[1]]],   // day first
    [new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+' + MON_RE + ',?[\\s-]+(\\d{4}|\\d{2})\\b', 'gi'), x => [x[3].length === 2 ? 2000 + +x[3] : +x[3], MONTHS[x[2].toLowerCase()], +x[1]]],
    [new RegExp('\\b' + MON_RE + '\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b', 'gi'), x => [+x[3], MONTHS[x[1].toLowerCase()], +x[2]]],
  ];
  for (const [re, pick] of tryAll) {
    while ((m = re.exec(text))) {
      const [y, mo, d] = pick(m);
      const ok = validDate(y, mo, d, today);
      if (ok) return ok;
    }
  }
  return null;
}

// Every money-looking figure in the text, scored by what surrounds it
export function findAmount(text) {
  const lines = text.split(/\r?\n/);
  const found = [];
  lines.forEach((line, li) => {
    const re = /(-|–|−)?\s*(RM|MYR)?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})\b/gi;
    let m;
    while ((m = re.exec(line))) {
      const value = parseFloat(m[3].replace(/,/g, '') + '.' + m[4]);
      if (!(value > 0) || value >= 1000000) continue;
      let score = 0;
      if (m[2]) score += 3;
      if (m[1]) score += 2;
      if (GOOD_WORDS.test(line)) score += 5;
      if (BAD_WORDS.test(line)) score -= 6;
      if (li === 0) score += 0.5;
      found.push({ value, score, li });
    }
  });
  if (!found.length) return null;
  found.sort((a, b) => b.score - a.score || a.li - b.li || b.value - a.value);
  return found[0].value;
}

function tidy(s) {
  let t = s.replace(/[|_~=<>{}\[\]\\^`]+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, '');
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length > 3 && letters === letters.toUpperCase()) t = t.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  return t.slice(0, 40);
}

export function findMerchant(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  // "Paid to  Grab", or the line after a bare "To" / "Merchant" label
  for (let i = 0; i < lines.length; i++) {
    const m = /^(?:paid to|payment to|pay to|merchant|merchant name|recipient|store|outlet|to)\b[\s:]*(.*)$/i.exec(lines[i]);
    if (m) {
      const rest = tidy(m[1]);
      if (/[A-Za-z]{3}/.test(rest)) return rest;
      if (lines[i + 1] && /[A-Za-z]{3}/.test(lines[i + 1]) && !CHROME.test(lines[i + 1])) return tidy(lines[i + 1]);
    }
  }
  for (const l of lines) {
    const letters = (l.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || letters < l.replace(/\s/g, '').length * 0.5) continue;   // mostly digits or symbols
    if (CHROME.test(l) || /\d+\.\d{2}/.test(l)) continue;
    const t = tidy(l);
    if (t.length >= 3) return t;
  }
  return '';
}

const GENERIC = new Set(['card', 'credit', 'debit', 'wallet', 'bank', 'pay', 'cash', 'visa', 'master', 'mastercard', 'online']);

export function findPayment(text, pays) {
  const map = aliasMap(pays);
  const tokens = text.split(/\s+/).filter(Boolean);
  const hits = {};
  for (let i = 0; i < tokens.length; i++) {
    const m = matchAt(tokens, i, map);
    if (m && !(m[1] === 1 && GENERIC.has(tokens[i].toLowerCase().replace(/[^a-z]/g, '')))) { hits[m[0]] = (hits[m[0]] || 0) + 1; i += m[1] - 1; }
  }
  const best = Object.entries(hits).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

export function parseReceiptText(text, { cats = [], pays = [], learn = null, today = new Date() } = {}) {
  const t = String(text || '');
  const out = { amount: findAmount(t), date: findDate(t, today), merchant: findMerchant(t), payment: findPayment(t, pays), category: null, learned: null };
  const s = suggest(out.merchant, learn, cats, pays);
  if (s) {
    if (s.category) { out.category = s.category; out.learned = s; }
    if (!out.payment && s.payment) { out.payment = s.payment; out.learned = s; }
  }
  return out;
}
