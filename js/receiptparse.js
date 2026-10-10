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

// ── A list of transactions (history screen of an e-wallet or bank app) ───────
// `lines` are the OCR lines with positions ({ t, x0, y0, x1, y1 }). Every amount ("-RM18.00") is an anchor; the other
// lines are attached to the nearest anchor by height, so each row gets its own merchant, date and payment method and
// nothing leaks between rows. Returns { rows } with 2+ rows when the screenshot looks like a list, else { rows: [] }.

const AMOUNT_RE = /([-–−+])?\s*(RM|MYR)?\s*(?<![\d.,])(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?![\d]|\.\d|\s*[ap]\.?m\b)/gi;
const MONEY_IN = /\b(reload|top[\s-]?up|refund|cash\s?back|received?|credited|credit adjustment|transfer from|salary|income|deposit|reversal|duitnow from)\b/i;
const NOT_AMOUNT = /\b(balance|baki|available|limit|points?|mata|rebate|saving|saved|fee|tax|sst|gst|rounding|discount)\b/i;
const STATUS = /^(success(ful)?|completed|pending|failed|processing|approved|payment|purchase|transfer|transaction|debit|credit|refund|reload|top[\s-]?up|view all|see all|history|transaction history|activity|recent|all|filter|today|yesterday)\b[\s.:!]*$/i;
const TIME_RE = /\b\d{1,2}[:.]\d{2}\s*([ap]\.?m\.?)?/gi;

function medianOf(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }

function relDate(text, today) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (/\btoday\b|\bhari ini\b/i.test(text)) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  if (/\byesterday\b|\bsemalam\b|\bkelmarin\b/i.test(text)) { d.setDate(d.getDate() - 1); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  return null;
}

function rowMerchant(texts) {
  for (const raw of texts) {
    let t = raw.replace(AMOUNT_RE, ' ');
    t = t.replace(TIME_RE, ' ').replace(/\b\d{1,2}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{2,4}\b/g, ' ').replace(/\b20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/g, ' ');
    t = t.replace(new RegExp('\\b\\d{1,2}(?:st|nd|rd|th)?[\\s-]+' + MON_RE + ',?[\\s-]+(?:\\d{4}|\\d{2})\\b', 'gi'), ' ');
    t = t.replace(/^(?:paid to|payment to|pay to|transfer to|purchase at|purchase from|payment for|to)\b\s*[:\-]?\s*/i, '');
    t = t.replace(/\s+/g, ' ').trim();
    const letters = (t.match(/[A-Za-z]/g) || []).length;
    if (letters < 3 || letters < t.replace(/\s/g, '').length * 0.5) continue;
    if (STATUS.test(t) || (CHROME.test(t) && t.split(' ').length <= 2)) continue;
    const m = tidy(t);
    if (m.length >= 3) return m;
  }
  return '';
}

export function parseTransactions(rawLines, { cats = [], pays = [], learn = null, today = new Date() } = {}) {
  const lines = (rawLines || []).map(l => ({ ...l, cy: (l.y0 + l.y1) / 2, h: Math.max(1, l.y1 - l.y0) })).filter(l => l.t).sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  if (lines.length < 4) return { rows: [] };
  const medH = medianOf(lines.map(l => l.h));

  // 1. anchors: every amount figure that is not a balance, fee, points…
  const anchors = [];
  lines.forEach(l => {
    AMOUNT_RE.lastIndex = 0;
    let m;
    while ((m = AMOUNT_RE.exec(l.t))) {
      const value = parseFloat(m[3].replace(/,/g, '') + '.' + m[4]);
      if (!(value > 0) || value >= 1000000) continue;
      const before = l.t.slice(0, m.index) + ' ' + l.t.slice(m.index + m[0].length);
      if (NOT_AMOUNT.test(before)) continue;
      anchors.push({ line: l, value, plus: m[1] === '+', cy: l.cy, used: [l] });
    }
  });
  // a figure beside a "Balance" / "Fee" label on the same line is skipped too
  const hasAmount = t => new RegExp(AMOUNT_RE.source, 'i').test(t);
  const clean = anchors.filter(a => !lines.some(l => l !== a.line && !hasAmount(l.t) && Math.abs(l.cy - a.cy) < medH * 0.7 && NOT_AMOUNT.test(l.t)));
  if (clean.length < 2) return { rows: [] };

  // 2. every other line goes to the nearest anchor, if it is close enough
  const anchorLines = new Set(clean.map(a => a.line));
  const maxD = medH * 2.6;
  const attached = new Map(clean.map(a => [a, []]));
  const loose = [];
  lines.forEach(l => {
    if (anchorLines.has(l)) return;
    let best = null, bd = Infinity;
    clean.forEach(a => { const d = Math.abs(a.cy - l.cy); if (d < bd) { bd = d; best = a; } });
    if (best && bd <= maxD) attached.get(best).push(l); else loose.push(l);
  });

  // 3. date headers ("3 Oct 2026" above a group of rows) and the screen's own text (for the payment method)
  const heads = loose.map(l => ({ cy: l.cy, date: findDate(l.t, today) || relDate(l.t, today) })).filter(h => h.date);
  const screenText = loose.map(l => l.t).join('\n');

  const rows = [];
  let prev = null;
  clean.sort((a, b) => a.cy - b.cy).forEach(a => {
    const near = attached.get(a).sort((x, y) => x.cy - y.cy || x.x0 - y.x0);
    const sameLine = [a.line, ...near].map(l => l.t);
    const text = sameLine.join('\n');
    const own = findDate(text, today) || relDate(text, today);
    let date = own, guess = false;
    if (!date) {
      const h = [...heads].reverse().find(x => x.cy < a.cy);
      date = h ? h.date : prev;
      guess = !h;   // inherited from the row above: shown as "check the date"
    }
    const merchant = rowMerchant([...near.map(l => l.t), a.line.t]);
    const sign = a.plus;
    const isIn = sign || MONEY_IN.test(text);
    const payment = findPayment(text, pays) || findPayment(screenText, pays);
    const s = suggest(merchant, learn, cats, pays);
    rows.push({
      merchant, amount: a.value, date, dateOwn: !!own, dateGuess: guess,
      dir: isIn ? 'in' : 'out',
      payment: payment || (s && s.payment) || null,
      category: s && s.category ? s.category : null, learned: s || null,
    });
    if (date) prev = date;
  });

  // list mode only when the dates show these are separate transactions (a receipt has one date and item prices)
  const ownDates = rows.filter(r => r.dateOwn).length;
  const headDates = new Set(heads.map(h => h.date)).size;
  if (!(ownDates >= 2 || (headDates >= 2 && rows.length >= 2))) return { rows: [] };
  rows.forEach(r => { if (!r.date) { const t = today; r.date = iso(t.getFullYear(), t.getMonth() + 1, t.getDate()); r.dateGuess = true; } });
  return { rows };
}
