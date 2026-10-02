// Applies the saved theme before the page paints (loaded as a plain script in <head>, so there is no flash).
// Light is the default; the choice is made in Settings > Appearance (see setTheme in helpers.js).
(function () {
  var t = 'light';
  try { if (localStorage.getItem('theme') === 'dark') t = 'dark'; } catch (e) { /* storage blocked: stay light */ }
  document.documentElement.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'dark' ? '#121315' : '#E8E4DA');
})();
