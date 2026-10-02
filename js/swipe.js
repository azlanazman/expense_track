// Horizontal swipe between sibling views (Report: Variable/Fixed/Combined, Budget: Overview/Accounts/Savings).
// onSwipe(el, fn): fn(+1) for a swipe left (next view), fn(-1) for a swipe right (previous view).
// Ignored when the gesture starts on a form field or inside something that scrolls sideways (e.g. the report table).

const MIN_DX = 60;      // px travelled sideways
const RATIO = 1.6;      // sideways must beat vertical by this factor, so normal scrolling never switches views

function scrollsSideways(node, stopAt) {
  for (let n = node; n && n !== stopAt && n.nodeType === 1; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
  }
  return false;
}

export function onSwipe(el, fn) {
  let x0 = 0, y0 = 0, t0 = 0, live = false;

  el.addEventListener('touchstart', e => {
    live = false;
    if (e.touches.length !== 1) return;
    const t = e.target;
    if (t.closest('input, textarea, select, [contenteditable]') || scrollsSideways(t, el)) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    live = true;
  }, { passive: true });

  el.addEventListener('touchend', e => {
    if (!live) return;
    live = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (Date.now() - t0 > 700) return;
    if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * RATIO) return;
    fn(dx < 0 ? 1 : -1);
  }, { passive: true });

  el.addEventListener('touchcancel', () => { live = false; }, { passive: true });
}

// Short slide-in of the new view, from the side the finger moved towards. Skipped for reduced motion.
export function slideIn(el, dir) {
  if (!el || !el.animate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate(
    [{ opacity: 0, transform: `translateX(${dir > 0 ? 28 : -28}px)` }, { opacity: 1, transform: 'none' }],
    { duration: 180, easing: 'ease-out' }
  );
}
