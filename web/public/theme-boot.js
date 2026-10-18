// Loaded synchronously in <head> so the theme is set before first paint.
// External file (not inline) so the CSP needs no 'unsafe-inline' for scripts.
// Dark is the standard for backx.trade; a theme the user picked is remembered and wins.
(function () {
  try {
    var t = localStorage.getItem('backx.theme');
    document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
    var p = localStorage.getItem('backx.price');
    if (p) document.documentElement.dataset.price = p;
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
})();
