// Quick entry: turn a typed line ("grab 18 tng", "rm 12.50 lunch yesterday cimb") into expense fields,
// and learn category / payment-method habits from past notes. Pure functions, no DOM and no Firestore.

const DATE_WORDS = {
  today: 'today',
  yesterday: 'yesterday', ytd: 'yesterday', semalam: 'yesterday', kelmarin: 'yesterday',
};

const words = s => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Everything a name can be called in a quick line: the full name (spaces removed), its initials
// ("Touch n Go" -> tng) and each word of 3+ letters. An alias shared by two names is dropped.
export function aliasMap(names) {
  const seen = new Map();   // alias -> name, or null when ambiguous
  const add = (alias, name) => {
    if (!alias) return;
    if (seen.has(alias) && seen.get(alias) !== name) seen.set(alias, null);
    else if (!seen.has(alias)) seen.set(alias, name);
  };
  names.forEach(name => {
    const w = words(name);
    add(w.join(''), name);
    if (w.length > 1) add(w.map(x => x[0]).join(''), name);
    w.filter(x => x.length >= 3).forEach(x => add(x, name));
  });
  const out = new Map();
  seen.forEach((v, k) => { if (v) out.set(k, v); });
  return out;
}

// Learning: for every word (3+ letters) in past notes, count which category and payment method went with it.
export function buildLearn(entries) {
  const stats = new Map();
  entries.forEach(e => {
    if (!e || !e.notes || e.isIncome) return;
    new Set(words(e.notes).filter(w => w.length >= 3 && !/^\d+$/.test(w))).forEach(w => {
      let s = stats.get(w);
      if (!s) { s = { n: 0, c: {}, p: {} }; stats.set(w, s); }
      s.n++;
      if (e.category) s.c[e.category] = (s.c[e.category] || 0) + 1;
      if (e.paymentMethod) s.p[e.paymentMethod] = (s.p[e.paymentMethod] || 0) + 1;
    });
  });
  return stats;
}

function top(counts, valid, n) {
  let best = null, bc = 0;
  Object.entries(counts).forEach(([k, c]) => { if (valid.includes(k) && c > bc) { best = k; bc = c; } });
  return best && bc / n >= 0.6 ? best : null;
}

// Best habit for a note: the word seen most often, with a clear winner (60%+) and at least 2 past entries.
export function suggest(note, learn, cats, pays) {
  if (!learn || !note) return null;
  let best = null;
  new Set(words(note).filter(w => w.length >= 3)).forEach(w => {
    const s = learn.get(w);
    if (s && s.n >= 2 && (!best || s.n > best.s.n)) best = { w, s };
  });
  if (!best) return null;
  const category = top(best.s.c, cats, best.s.n);
  const payment = top(best.s.p, pays, best.s.n);
  return category || payment ? { word: best.w, n: best.s.n, category, payment } : null;
}

// Longest-first match of 1 to 3 tokens against an alias map; returns [name, tokenCount] or null.
function matchAt(tokens, i, map) {
  for (let len = Math.min(3, tokens.length - i); len >= 1; len--) {
    const key = words(tokens.slice(i, i + len).join(' ')).join('');
    if (key && map.has(key)) return [map.get(key), len];
  }
  return null;
}

export function parseQuick(text, { cats = [], pays = [], learn = null } = {}) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean);
  const payMap = aliasMap(pays), catMap = aliasMap(cats);
  const used = new Array(tokens.length).fill(false);
  const out = { amount: null, payment: null, category: null, dateKind: null, note: '', learned: null };

  // amount: "rm18", "rm 18", "18.50", or the last whole number
  const num = t => { const m = /^(?:rm)?(\d+(?:[.,]\d{1,2})?)$/i.exec(t); return m ? parseFloat(m[1].replace(',', '.')) : null; };
  let pick = -1;
  tokens.forEach((t, i) => { if (/^rm\d/i.test(t) && num(t) !== null && pick < 0) pick = i; });
  if (pick < 0) tokens.forEach((t, i) => { if (/^rm$/i.test(t) && i + 1 < tokens.length && num(tokens[i + 1]) !== null) { pick = i + 1; used[i] = true; } });
  if (pick < 0) tokens.forEach((t, i) => { if (/^\d+[.,]\d{1,2}$/.test(t) && pick < 0) pick = i; });
  if (pick < 0) tokens.forEach((t, i) => { if (num(t) !== null) pick = i; });
  if (pick >= 0) { out.amount = num(tokens[pick]); used[pick] = true; }

  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue;
    const lower = tokens[i].toLowerCase().replace(/[^a-z]/g, '');
    if (DATE_WORDS[lower] && !out.dateKind) { out.dateKind = DATE_WORDS[lower]; used[i] = true; continue; }
    if (!out.payment) {
      const m = matchAt(tokens, i, payMap);
      if (m) { out.payment = m[0]; for (let k = 0; k < m[1]; k++) used[i + k] = true; i += m[1] - 1; continue; }
    }
    if (!out.category) {
      const m = matchAt(tokens, i, catMap);
      if (m) { out.category = m[0]; for (let k = 0; k < m[1]; k++) used[i + k] = true; i += m[1] - 1; continue; }
    }
  }

  out.note = tokens.filter((_, i) => !used[i]).join(' ');

  // habits fill what the line did not say
  const s = suggest(out.note, learn, cats, pays);
  if (s) {
    if (!out.category && s.category) { out.category = s.category; out.learned = s; }
    if (!out.payment && s.payment) { out.payment = s.payment; out.learned = s; }
  }
  return out;
}
