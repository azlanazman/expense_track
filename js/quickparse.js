// Learned habits: which category / payment method usually goes with the words in a note, plus name matching
// (aliasMap / matchAt) shared with the screenshot reader. Pure functions, no DOM and no Firestore.

const words = s => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// Everything a name can be called in a note or receipt: the full name (spaces removed), its initials
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
    if (w.includes('n')) add(w.map(x => x === 'n' ? 'and' : x).join(''), name);   // "Touch n Go" is also written "Touch and Go"
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

// Longest-first match of 1 to 4 tokens against an alias map; returns [name, tokenCount] or null.
export function matchAt(tokens, i, map) {
  for (let len = Math.min(4, tokens.length - i); len >= 1; len--) {
    const key = words(tokens.slice(i, i + len).join(' ')).join('');
    if (key && map.has(key)) return [map.get(key), len];
  }
  return null;
}
