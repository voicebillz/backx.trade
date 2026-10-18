// Loaded synchronously in <head> so the theme is set before first paint.
// External file (not inline) so the CSP needs no 'unsafe-inline' for scripts.
// Theme before first paint: saved choice wins, else follow the browser (light only if it asks for light).
(function () {
  try {
    var t = localStorage.getItem('backx.theme');
    if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    var p = localStorage.getItem('backx.price');
    if (p) document.documentElement.dataset.price = p;
  } catch (e) { document.documentElement.dataset.theme = 'dark'; }
})();
