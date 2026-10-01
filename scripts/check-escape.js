#!/usr/bin/env node
// Heuristic guard for the project's #1 security rule: never interpolate
// user-supplied text into HTML without escapeHtml().
//
// Usage:  node scripts/check-escape.js [dir]        (default dir: js)
// Exit code 1 if anything suspicious is found.
//
// It flags `${expr}` on a line that also contains HTML (`<`), when `expr` is a bare
// reference (no function call) to a field that normally holds user text, e.g.
// `${a.name}`, `${entry.notes}`, `${m}`. Wrap in escapeHtml(), or if the value is
// provably safe (fixed list, number), append `// escape-ok` to the line.
// This is a tripwire, not a proof: it cannot see multi-line templates or
// values built elsewhere, so code review still matters.
const fs = require('fs');
const path = require('path');

const dir = process.argv[2] || 'js';
const USER_FIELDS = new Set([
  'name', 'notes', 'note', 'category', 'cat', 'subCategory', 'paymentMethod',
  'pay', 'method', 'account', 'label', 'title', 'text', 'desc', 'description',
  'colour', 'color',
]);
const SINGLE_LETTER_LOOP_VARS = new Set(['m', 'p', 'c', 's']); // payment/category loops
const SKIP_FILES = new Set(['db.js', 'demo.js', 'helpers.js', 'export.js', 'state.js', 'firebase.js']);

let found = 0;
for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.js') && !SKIP_FILES.has(f))) {
  const lines = fs.readFileSync(path.join(dir, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!line.includes('<') || !line.includes('${') || /escape-ok/.test(line)) return;
    const re = /\$\{\s*([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)\s*\}/g;
    let m;
    while ((m = re.exec(line))) {
      const expr = m[1];
      const last = expr.split(/\??\./).pop();
      const risky = USER_FIELDS.has(last) || (!expr.includes('.') && SINGLE_LETTER_LOOP_VARS.has(expr));
      if (risky) {
        found++;
        console.log(`${path.join(dir, file)}:${i + 1}: unescaped \${${expr}} in HTML -> use escapeHtml(${expr})`);
      }
    }
  });
}
if (found) {
  console.log(`\n${found} possible unescaped interpolation(s).`);
  process.exit(1);
}
console.log('check-escape: no suspicious interpolations found.');
