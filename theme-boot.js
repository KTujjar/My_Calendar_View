'use strict';
// Applies the last-used theme's colours before the page paints, so there's no
// flash of the default theme while themes.js loads the full theme from storage.
(() => {
  try {
    const boot = JSON.parse(localStorage.getItem('themeBoot') || 'null');
    if (!boot) return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(boot.vars || {})) root.style.setProperty(k, v);
    for (const [k, v] of Object.entries(boot.attrs || {})) root.setAttribute(k, v);
  } catch { /* ignore */ }
})();
