// Review list: shown inside the Add sheet when a screenshot holds several transactions.
// One card per transaction (tick to save, edit note / amount / date / category / account), then one Save button.
// Built with DOM calls (textContent / .value only), so nothing read from an image is ever treated as HTML.
import { fmt, todayString } from './helpers.js';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function select(options, value, label) {
  const s = el('select', 'rv-select');
  s.setAttribute('aria-label', label);
  options.forEach(o => { const op = el('option', '', o); op.value = o; s.appendChild(op); });
  s.value = options.includes(value) ? value : (options[0] || '');
  return s;
}

const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= todayString() && !isNaN(new Date(d + 'T00:00:00'));
const amountOf = s => { const n = parseFloat(String(s).replace(/,/g, '')); return n > 0 && n < 1000000 ? Math.round(n * 100) / 100 : 0; };

// rows: [{ merchant, amount, date, dir, payment, category, learned, dateGuess, dup }]
// opts: { cats, pays, defaultCat, defaultPay, onSave(items) -> Promise<number[]> (indexes saved), onBack() }
export function renderReview(root, rows, opts) {
  const { cats, pays } = opts;
  root.textContent = '';
  const state = rows.map((r, i) => ({
    i,
    inc: r.dir !== 'in' && !r.dup && r.amount > 0,
    locked: r.dir === 'in',
    note: r.merchant || '',
    amount: r.amount > 0 ? Number(r.amount).toFixed(2) : '',
    date: r.date,
    category: r.category && cats.includes(r.category) ? r.category : opts.defaultCat,
    guessCat: !(r.category && cats.includes(r.category)),
    payment: r.payment && pays.includes(r.payment) ? r.payment : opts.defaultPay,
    dir: r.dir, dup: !!r.dup, dupNote: r.dupNote || '', source: r.source || '', noAmount: !(r.amount > 0), dateGuess: !!r.dateGuess, saved: false, cardEl: null,
  }));

  root.appendChild(el('p', 'rv-lead', opts.lead || `${rows.length} transactions found. Untick the ones to skip, fix anything that looks wrong, then save. A dashed box means a guess: check it.`));

  // paid with (all rows)
  const allWrap = el('div', 'rv-all');
  allWrap.appendChild(el('span', 'block-label', 'Paid with (all rows)'));
  const allSel = select(pays, '', 'Set the account for every row');
  const mixed = el('option', '', 'Mixed'); mixed.value = ''; allSel.insertBefore(mixed, allSel.firstChild);
  allWrap.appendChild(allSel);
  root.appendChild(allWrap);

  const list = el('div', 'rv-list');
  root.appendChild(list);

  const foot = el('div', 'rv-foot');
  const sum = el('div', 'rv-sum');
  sum.setAttribute('aria-live', 'polite');
  const saveBtn = el('button', 'btn-save', '');
  saveBtn.type = 'button';
  const back = el('button', 'as-again', 'Back to single entry');
  back.type = 'button';
  foot.append(sum, saveBtn, back);
  root.appendChild(foot);

  function syncAll() {
    const live = state.filter(s => !s.saved);
    const first = live[0] && live[0].payment;
    allSel.value = live.length && live.every(s => s.payment === first) ? first : '';
  }

  function refresh() {
    const picked = state.filter(s => !s.saved && s.inc && !s.locked);
    const total = picked.reduce((t, s) => t + amountOf(s.amount), 0);
    sum.textContent = picked.length ? `${picked.length} selected · RM ${fmt(total)}` : 'Nothing selected';
    saveBtn.textContent = picked.length ? `Save ${picked.length} expense${picked.length === 1 ? '' : 's'}` : 'Select at least one';
    saveBtn.disabled = !picked.length;
    state.forEach(s => {
      if (!s.cardEl) return;
      s.cardEl.classList.toggle('off', !s.inc || s.locked);
    });
    syncAll();
  }

  function card(s) {
    const c = el('div', 'rv-card');
    s.cardEl = c;
    const top = el('div', 'rv-top');
    const cb = el('input', 'rv-check');
    cb.type = 'checkbox';
    cb.checked = s.inc && !s.locked;
    cb.disabled = s.locked;
    cb.setAttribute('aria-label', 'Save this transaction');
    cb.addEventListener('change', () => { s.inc = cb.checked; refresh(); });
    const note = el('input', 'rv-note');
    note.type = 'text'; note.maxLength = 200; note.value = s.note; note.placeholder = 'What was it?';
    note.setAttribute('aria-label', 'Note');
    note.addEventListener('input', () => { s.note = note.value; });
    const amtWrap = el('label', 'rv-amt');
    amtWrap.appendChild(el('span', '', 'RM'));
    const amt = el('input', '');
    amt.type = 'text'; amt.inputMode = 'decimal'; amt.value = s.amount; amt.setAttribute('aria-label', 'Amount in ringgit');
    amt.addEventListener('input', () => { amt.value = amt.value.replace(/[^0-9.]/g, ''); s.amount = amt.value; amt.classList.remove('bad'); refresh(); });
    amtWrap.appendChild(amt);
    top.append(cb, note, amtWrap);
    c.appendChild(top);

    const bot = el('div', 'rv-bot');
    const date = el('input', 'rv-date');
    date.type = 'date'; date.value = s.date; date.max = todayString(); date.setAttribute('aria-label', 'Date');
    if (s.dateGuess) date.classList.add('guess');
    date.addEventListener('change', () => { if (date.value) { s.date = date.value; s.dateGuess = false; date.classList.remove('guess', 'bad'); } });
    const cat = select(cats, s.category, 'Category');
    if (s.guessCat) cat.classList.add('guess');
    cat.addEventListener('change', () => { s.category = cat.value; s.guessCat = false; cat.classList.remove('guess'); });
    const pay = select(pays, s.payment, 'Paid with');
    pay.addEventListener('change', () => { s.payment = pay.value; syncAll(); });
    s.payEl = pay;
    bot.append(date, cat, pay);
    c.appendChild(bot);

    if (s.source) c.appendChild(el('div', 'rv-src', s.source));
    if (s.locked || s.dup || s.dateGuess || s.noAmount) {
      const tags = el('div', 'rv-tags');
      if (s.locked) tags.appendChild(el('span', 'rv-tag in', 'Money in · not an expense'));
      if (s.dup) tags.appendChild(el('span', 'rv-tag dup', s.dupNote || 'Already saved? same day and amount'));
      if (s.noAmount) tags.appendChild(el('span', 'rv-tag dup', 'Amount not found: type it in'));
      if (s.dateGuess) tags.appendChild(el('span', 'rv-tag', 'Check the date'));
      c.appendChild(tags);
    }
    if (opts.onDismiss) {
      const dis = el('button', 'rv-dismiss', 'Dismiss');
      dis.type = 'button';
      dis.addEventListener('click', async () => {
        dis.disabled = true;
        let ok = false;
        try { ok = await opts.onDismiss(s.i); } catch (e) { console.error(e); }
        if (ok) { s.saved = true; c.remove(); refresh(); } else dis.disabled = false;
      });
      c.appendChild(dis);
    }
    s._amt = amt; s._date = date;
    return c;
  }

  state.forEach(s => list.appendChild(card(s)));

  allSel.addEventListener('change', () => {
    if (!allSel.value) return;
    state.forEach(s => { s.payment = allSel.value; if (s.payEl) s.payEl.value = allSel.value; });
  });

  let busy = false;
  saveBtn.addEventListener('click', async () => {
    if (busy) return;
    const picked = state.filter(s => !s.saved && s.inc && !s.locked);
    let bad = null;
    picked.forEach(s => {
      const okAmt = amountOf(s.amount) > 0, okDate = validDate(s.date);
      s._amt.classList.toggle('bad', !okAmt);
      s._date.classList.toggle('bad', !okDate);
      if (!bad && (!okAmt || !okDate)) bad = s;
    });
    if (bad) { bad.cardEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); opts.onInvalid && opts.onInvalid(); return; }
    busy = true; saveBtn.disabled = true;
    const items = picked.map(s => ({ index: s.i, note: s.note.trim(), amount: amountOf(s.amount), date: s.date, category: s.category, payment: s.payment }));
    let done = [];
    try { done = await opts.onSave(items); } catch (e) { console.error(e); }
    (done || []).forEach(i => { const s = state[i]; if (s) { s.saved = true; if (s.cardEl) s.cardEl.remove(); } });
    busy = false;
    refresh();
  });
  back.addEventListener('click', () => opts.onBack());

  refresh();
  return { remaining: () => state.filter(s => !s.saved && !s.locked).length };
}
