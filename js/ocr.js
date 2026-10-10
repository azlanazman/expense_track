// Reads the text in a screenshot or photo, on the phone (nothing is uploaded).
// Tesseract.js is vendored in vendor/tesseract-7.0.0/ and loaded only when this is called.
const BASE = new URL('../vendor/tesseract-7.0.0/', import.meta.url).href;
const MAX_BYTES = 20 * 1024 * 1024;

// Phone screenshots are often dark mode (light text on dark): flip those, grey-scale and stretch the contrast,
// which is what the recogniser reads best.
async function prepare(blob) {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, 1500 / bmp.width) * (bmp.width < 700 ? 700 / bmp.width : 1);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) { const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = y; sum += y; }
  const dark = sum / (d.length / 4) < 120;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) { const y = dark ? 255 - d[i] : d[i]; d[i] = y; if (y < lo) lo = y; if (y > hi) hi = y; }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const y = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = y; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c;
}

// Returns { text, lines }: all the text, and the second pass's lines with their positions in the (scaled) image.
export async function readImageText(blob, onProgress) {
  if (!blob || !/^image\//.test(blob.type || 'image/png')) throw new Error('Not an image');
  if (blob.size > MAX_BYTES) throw new Error('Image too large');
  const canvas = await prepare(blob);
  const mod = await import(BASE + 'tesseract.esm.min.js');
  const createWorker = mod.createWorker || mod.default.createWorker;
  let pass = 0;
  const worker = await createWorker('eng', 1, {
    workerPath: BASE + 'worker.min.js',
    corePath: BASE + 'tesseract-core-simd-lstm.wasm.js',
    langPath: BASE,
    workerBlobURL: false,   // load the worker from our own file, so a strict script-src needs no blob:
    gzip: true,
    logger: m => { if (onProgress && m.status === 'recognizing text') onProgress((pass + m.progress) / 2); },
  });
  try {
    // Two looks at the same image: normal page layout, then "scattered text". Big hero amounts ("-RM 12.50")
    // are sometimes skipped by the page layout analysis, so the second pass makes sure they are read.
    const first = await worker.recognize(canvas);
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    pass = 1;
    const second = await worker.recognize(canvas, {}, { text: true, blocks: true });
    // Positions of every line of the second pass: they let a list of transactions be split into rows
    const lines = [];
    ((second.data && second.data.blocks) || []).forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => {
      const t = (l.text || '').trim();
      if (t && l.bbox) lines.push({ t, x0: l.bbox.x0, y0: l.bbox.y0, x1: l.bbox.x1, y1: l.bbox.y1 });
    })));
    return { text: (first.data.text || '') + '\n' + (second.data.text || ''), lines };
  } finally {
    await worker.terminate();
  }
}
