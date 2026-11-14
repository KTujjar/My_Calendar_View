'use strict';
/* Themes: built-in presets, a live editor, custom background media (stored in
   IndexedDB), export/import, icon packs, and a theme-coloured extension icon. */
(() => {
  const $ = (id) => document.getElementById(id);
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  const store = {
    async get(key) {
      if (hasChrome) return (await chrome.storage.local.get(key))[key];
      try { const v = localStorage.getItem(key); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
    },
    async set(key, val) {
      if (hasChrome) return chrome.storage.local.set({ [key]: val });
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ }
    },
    async remove(key) {
      if (hasChrome) return chrome.storage.local.remove(key);
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    },
  };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- definitions ----------
  const FONTS = {
    system: { name: 'System', css: 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' },
    rounded: { name: 'Rounded', css: 'ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", system-ui, sans-serif' },
    serif: { name: 'Serif', css: 'ui-serif, "New York", Charter, Georgia, "Times New Roman", serif' },
    mono: { name: 'Monospace', css: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace' },
  };
  const ICON_SLOTS = [
    ['refresh', 'Refresh'], ['stats', 'Stats'], ['pomo', 'Timer'], ['theme', 'Themes'], ['settings', 'Settings'],
  ];
  const ICON_PACKS = {
    classic: { name: 'Classic', icons: { refresh: '↻', stats: '📊', pomo: '🍅', theme: '🎨', settings: '⚙' } },
    minimal: { name: 'Minimal', icons: { refresh: '↻', stats: '▤', pomo: '◔', theme: '◐', settings: '⚙' } },
    playful: { name: 'Playful', icons: { refresh: '🔄', stats: '📈', pomo: '⏰', theme: '🌈', settings: '🛠️' } },
    space: { name: 'Space', icons: { refresh: '🛰️', stats: '🔭', pomo: '🚀', theme: '🌌', settings: '🪐' } },
    nature: { name: 'Nature', icons: { refresh: '🍃', stats: '🌻', pomo: '🌱', theme: '🌸', settings: '🍄' } },
    cozy: { name: 'Cozy', icons: { refresh: '🔁', stats: '📒', pomo: '☕', theme: '🕯️', settings: '🧶' } },
  };

  const base = (o) => ({
    scheme: 'dark',
    colors: { bg: '#15171a', text: '#e8eaed', accent: '#5b8def', done: '#3fb873' },
    bg: { type: 'none', colors: ['#5b8def', '#a78bfa', '#34d399'], speed: 1, density: 1, dim: 0.1, blur: 0, media: null },
    glass: 0.5, glassBlur: 0, round: 1, font: 'system',
    icons: { pack: 'classic', custom: {} },
    ...o,
  });
  const PRESETS = [
    { id: 'system', name: 'System', system: true },
    base({ id: 'aurora', name: 'Northern Lights',
      colors: { bg: '#0a0f1e', text: '#e8ecf5', accent: '#5eead4', done: '#4ade80' },
      bg: { type: 'aurora', colors: ['#22d3ee', '#a78bfa', '#34d399'], speed: 1, density: 1, dim: 0.1, blur: 0, media: null } }),
    base({ id: 'sunset', name: 'Sunset Drive', font: 'rounded', icons: { pack: 'playful', custom: {} },
      colors: { bg: '#1c0f1e', text: '#fdf0f3', accent: '#fb7185', done: '#4ade80' },
      bg: { type: 'gradient', colors: ['#f97316', '#db2777', '#7c3aed'], speed: 1, density: 1, dim: 0.15, blur: 0, media: null } }),
    base({ id: 'ocean', name: 'Deep Ocean',
      colors: { bg: '#04131d', text: '#e2f3fb', accent: '#38bdf8', done: '#34d399' },
      bg: { type: 'waves', colors: ['#0ea5e9', '#0369a1', '#14b8a6'], speed: 1, density: 1, dim: 0.05, blur: 0, media: null } }),
    base({ id: 'space', name: 'Deep Space', icons: { pack: 'space', custom: {} },
      colors: { bg: '#05060d', text: '#e6e8f2', accent: '#818cf8', done: '#4ade80' },
      bg: { type: 'stars', colors: ['#ffffff', '#c7d2fe', '#f5d0fe'], speed: 1, density: 1, dim: 0, blur: 0, media: null } }),
    base({ id: 'forest', name: 'Firefly Forest', icons: { pack: 'nature', custom: {} },
      colors: { bg: '#07130d', text: '#e5f2e8', accent: '#a3e635', done: '#4ade80' },
      bg: { type: 'fireflies', colors: ['#fde047', '#bef264', '#86efac'], speed: 1, density: 1, dim: 0, blur: 0, media: null } }),
    base({ id: 'neon', name: 'Neon Rain', font: 'mono', icons: { pack: 'minimal', custom: {} },
      colors: { bg: '#0a0612', text: '#f1e9ff', accent: '#f0abfc', done: '#5eead4' },
      bg: { type: 'rain', colors: ['#22d3ee', '#e879f9', '#818cf8'], speed: 1, density: 1, dim: 0, blur: 0, media: null } }),
    base({ id: 'snow', name: 'Snow Day', scheme: 'light', icons: { pack: 'cozy', custom: {} },
      colors: { bg: '#bccfe1', text: '#14202e', accent: '#1d4ed8', done: '#15803d' },
      bg: { type: 'snow', colors: ['#ffffff', '#ffffff', '#eef5ff'], speed: 1, density: 1.2, dim: 0, blur: 0, media: null }, glass: 0.42 }),
    base({ id: 'bubblegum', name: 'Bubblegum', scheme: 'light', font: 'rounded', icons: { pack: 'playful', custom: {} },
      colors: { bg: '#fdf0f7', text: '#3b1d2e', accent: '#db2777', done: '#15803d' },
      bg: { type: 'bubbles', colors: ['#f472b6', '#a78bfa', '#60a5fa'], speed: 1, density: 1, dim: 0, blur: 0, media: null }, glass: 0.55 }),
    base({ id: 'shapes', name: 'Pastel Shapes', scheme: 'light', icons: { pack: 'minimal', custom: {} },
      colors: { bg: '#f6f4ef', text: '#24221f', accent: '#7c3aed', done: '#15803d' },
      bg: { type: 'shapes', colors: ['#f87171', '#60a5fa', '#fbbf24'], speed: 1, density: 1, dim: 0, blur: 0, media: null }, glass: 0.6 }),
    base({ id: 'paper', name: 'Paper', scheme: 'light', font: 'serif', icons: { pack: 'minimal', custom: {} },
      colors: { bg: '#f7f3ea', text: '#2b2722', accent: '#b45309', done: '#3f7d20' },
      bg: { type: 'none', colors: ['#d6c7a1', '#e7dcc1', '#cdb98f'], speed: 1, density: 1, dim: 0, blur: 0, media: null }, glass: 1 }),
    base({ id: 'midnight', name: 'Midnight',
      colors: { bg: '#0f1115', text: '#e6e6e6', accent: '#f59e0b', done: '#4ade80' },
      bg: { type: 'none', colors: ['#f59e0b', '#ef4444', '#8b5cf6'], speed: 1, density: 1, dim: 0, blur: 0, media: null }, glass: 1 }),
  ];
  // The System theme's values, used as a starting point when you customise it.
  const SYSTEM_DARK = base({ colors: { bg: '#15171a', text: '#e8eaed', accent: '#5b8def', done: '#3fb873' } });
  const SYSTEM_LIGHT = base({ scheme: 'light', colors: { bg: '#ffffff', text: '#1f2328', accent: '#2563eb', done: '#1f9d55' }, glass: 0.6 });

  // ---------- media storage (IndexedDB; blobs are too big for chrome.storage) ----------
  let dbp = null;
  function db() {
    dbp = dbp || new Promise((res, rej) => {
      const q = indexedDB.open('mycal-themes', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('media');
      q.onsuccess = () => res(q.result);
      q.onerror = () => rej(q.error);
    });
    return dbp;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction('media', mode);
      const r = fn(tx.objectStore('media'));
      tx.oncomplete = () => res(r && r.result);
      tx.onerror = () => rej(tx.error);
    });
  }
  const mediaPut = (id, blob) => idb('readwrite', (s) => s.put(blob, id));
  const mediaGet = (id) => idb('readonly', (s) => s.get(id));
  const mediaDel = (id) => idb('readwrite', (s) => s.delete(id));
  const MAX_MEDIA = 60 * 1024 * 1024;

  // ---------- state ----------
  let custom = [];          // user themes
  let activeId = 'system';
  const all = () => [...PRESETS, ...custom];
  const find = (id) => all().find((t) => t.id === id) || PRESETS[0];
  const active = () => find(activeId);

  let saveT = null;
  function saveState() {
    clearTimeout(saveT);
    saveT = setTimeout(() => store.set('themeState', { activeId, custom }), 250);
  }

  // ---------- colour helpers ----------
  const HEX = /^#[0-9a-f]{6}$/i;
  const okHex = (v, d) => (HEX.test(v || '') ? v.toLowerCase() : d);
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  const onColor = (hex) => (lum(hex) > 0.4 ? '#0b1220' : '#ffffff');
  const systemDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  // ---------- applying a theme ----------
  const VAR_KEYS = ['--bg', '--text', '--accent', '--accent-text', '--done', '--font', '--glass', '--glass-blur', '--round', '--bg-dim', '--bg-blur'];
  const ATTR_KEYS = ['data-theme', 'data-scheme', 'data-has-bg'];
  let mediaUrl = null;

  function iconsFor(theme) {
    const pack = ICON_PACKS[(theme.icons && theme.icons.pack) || 'classic'] || ICON_PACKS.classic;
    return { ...pack.icons, ...((theme.icons && theme.icons.custom) || {}) };
  }
  function applyIcons(map) {
    for (const node of document.querySelectorAll('[data-ico]')) {
      const v = map[node.dataset.ico];
      if (v) node.textContent = v;
    }
  }

  async function apply(theme) {
    const root = document.documentElement;
    for (const k of VAR_KEYS) root.style.removeProperty(k);
    for (const a of ATTR_KEYS) root.removeAttribute(a);
    const boot = { vars: {}, attrs: {} };
    const setVar = (k, v) => { root.style.setProperty(k, v); boot.vars[k] = v; };
    const setAttr = (k, v) => { root.setAttribute(k, v); boot.attrs[k] = v; };

    if (theme.system) {
      applyIcons(ICON_PACKS.classic.icons);
      window.ThemeBG.set(null);
      setMedia(null);
      setAppIcon(null);
      try { localStorage.setItem('themeBoot', JSON.stringify(boot)); } catch { /* ignore */ }
      return;
    }
    const c = theme.colors;
    setAttr('data-theme', theme.id);
    setAttr('data-scheme', theme.scheme === 'light' ? 'light' : 'dark');
    setVar('--bg', c.bg);
    setVar('--text', c.text);
    setVar('--accent', c.accent);
    setVar('--accent-text', onColor(c.accent));
    setVar('--done', c.done);
    setVar('--font', (FONTS[theme.font] || FONTS.system).css);
    setVar('--round', String(theme.round));
    const b = theme.bg;
    const hasBg = b.type !== 'none' && !(b.type === 'media' && !b.media);
    if (hasBg) {
      setAttr('data-has-bg', '1');
      setVar('--glass', `${Math.round(theme.glass * 100)}%`);
      setVar('--glass-blur', `${theme.glassBlur}px`);
      setVar('--bg-dim', String(b.dim));
      setVar('--bg-blur', `${b.blur}px`);
    }
    applyIcons(iconsFor(theme));
    window.ThemeBG.set(hasBg && b.type !== 'media' ? {
      type: b.type, colors: b.colors, speed: b.speed, density: b.density, base: c.bg, dark: theme.scheme !== 'light',
    } : null);
    await setMedia(b.type === 'media' ? b.media : null);
    setAppIcon(theme);
    try { localStorage.setItem('themeBoot', JSON.stringify(boot)); } catch { /* ignore */ }
  }

  let mediaKey = null;
  async function setMedia(media) {
    const layer = window.ThemeBG.layer();
    const key = media ? media.id : null;
    if (key === mediaKey) return;
    mediaKey = key;
    for (const n of layer.querySelectorAll('.theme-media')) n.remove();
    if (mediaUrl) { URL.revokeObjectURL(mediaUrl); mediaUrl = null; }
    if (!media) return;
    let blob;
    try { blob = await mediaGet(media.id); } catch { blob = null; }
    if (!blob || mediaKey !== key) return;
    mediaUrl = URL.createObjectURL(blob);
    let node;
    if (media.kind === 'video') {
      node = el('video', 'theme-media');
      node.muted = true; node.loop = true; node.autoplay = true; node.playsInline = true;
      node.src = mediaUrl;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) node.autoplay = false;
      else node.play().catch(() => {});
    } else {
      node = el('img', 'theme-media');
      node.alt = '';
      node.src = mediaUrl;
    }
    layer.prepend(node);
  }

  // Extension toolbar icon + tab favicon, drawn in the theme's accent colour.
  function drawIcon(size, accent, fg) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const x = cv.getContext('2d');
    const s = size;
    const rr = (px, py, w, h, r) => { x.beginPath(); x.roundRect(px, py, w, h, r); };
    rr(0, 0, s, s, s * 0.22); x.fillStyle = accent; x.fill();
    rr(s * 0.2, s * 0.26, s * 0.6, s * 0.56, s * 0.08); x.fillStyle = fg; x.fill();
    x.fillStyle = accent;
    x.fillRect(s * 0.2, s * 0.4, s * 0.6, s * 0.06);
    const d = s * 0.09;
    for (const [cx, cy] of [[0.36, 0.56], [0.5, 0.56], [0.64, 0.56], [0.36, 0.69], [0.5, 0.69]]) x.fillRect(s * cx - d / 2, s * cy - d / 2, d, d);
    x.fillStyle = fg;
    x.fillRect(s * 0.32, s * 0.18, s * 0.08, s * 0.14);
    x.fillRect(s * 0.6, s * 0.18, s * 0.08, s * 0.14);
    return cv;
  }
  function setAppIcon(theme) {
    const link = document.querySelector('link[rel="icon"]');
    const canAction = typeof chrome !== 'undefined' && chrome.action && chrome.action.setIcon;
    if (!theme) {
      if (link) link.href = 'icons/icon32.png';
      if (canAction) {
        chrome.action.setIcon({ path: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png' } });
        store.remove('actionIcon');
      }
      return;
    }
    const accent = theme.colors.accent, fg = onColor(accent);
    if (link) link.href = drawIcon(64, accent, fg).toDataURL('image/png');
    if (canAction) {
      const imageData = {}, saved = {};
      for (const size of [16, 32, 48]) {
        const id = drawIcon(size, accent, fg).getContext('2d').getImageData(0, 0, size, size);
        imageData[size] = id;
        saved[size] = Array.from(id.data);
      }
      chrome.action.setIcon({ imageData }).catch(() => {});
      store.set('actionIcon', saved); // background.js re-applies this when Chrome starts
    }
  }

  // ---------- editing ----------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  // Editing a built-in theme makes an editable copy first.
  function editable() {
    const cur = active();
    if (!cur.system && !PRESETS.includes(cur)) return cur;
    const src = cur.system ? (systemDark() ? SYSTEM_DARK : SYSTEM_LIGHT) : cur;
    const copy = clone(src);
    copy.id = 'c' + Date.now().toString(36);
    copy.name = `${cur.name} (custom)`;
    delete copy.system;
    custom.push(copy);
    activeId = copy.id;
    return copy;
  }
  let applyT = null;
  function change(fn, { rerender = false } = {}) {
    const wasPreset = PRESETS.includes(active());
    const t = editable();
    fn(t);
    saveState();
    clearTimeout(applyT);
    applyT = setTimeout(() => apply(t), 30);
    if (rerender) renderEditor();
    else {
      renderCards();
      if (wasPreset) {
        // Keep the control being dragged alive; just relabel the section.
        const h = $('themeEditHead');
        if (h) h.textContent = `Customize “${t.name}” — saved as your own theme`;
      }
    }
  }

  // ---------- validation (imported files are untrusted) ----------
  const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const cleanStr = (v, max, d) => (typeof v === 'string' ? v.slice(0, max) : d);
  function sanitize(t) {
    const d = SYSTEM_DARK;
    const c = (t && t.colors) || {};
    const b = (t && t.bg) || {};
    const ic = (t && t.icons) || {};
    const customIcons = {};
    for (const [k] of ICON_SLOTS) {
      const v = ic.custom && ic.custom[k];
      if (typeof v === 'string' && v.trim()) customIcons[k] = [...v.trim()].slice(0, 4).join('');
    }
    return {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name: cleanStr(t && t.name, 40, 'Imported theme') || 'Imported theme',
      scheme: t && t.scheme === 'light' ? 'light' : 'dark',
      colors: {
        bg: okHex(c.bg, d.colors.bg), text: okHex(c.text, d.colors.text),
        accent: okHex(c.accent, d.colors.accent), done: okHex(c.done, d.colors.done),
      },
      bg: {
        type: Object.prototype.hasOwnProperty.call(window.ThemeBG.TYPES, b.type) ? b.type : 'none',
        colors: [0, 1, 2].map((i) => okHex(b.colors && b.colors[i], d.bg.colors[i])),
        speed: clamp(b.speed, 0.1, 3, 1), density: clamp(b.density, 0.2, 3, 1),
        dim: clamp(b.dim, 0, 0.9, 0.1), blur: clamp(b.blur, 0, 30, 0), media: null,
      },
      glass: clamp(t && t.glass, 0.2, 1, 0.5), glassBlur: clamp(t && t.glassBlur, 0, 30, 0),
      round: clamp(t && t.round, 0, 2.5, 1),
      font: FONTS[t && t.font] ? t.font : 'system',
      icons: { pack: ICON_PACKS[ic.pack] ? ic.pack : 'classic', custom: customIcons },
    };
  }

  // ---------- export / import ----------
  async function exportTheme() {
    const t = active();
    const src = t.system ? (systemDark() ? SYSTEM_DARK : SYSTEM_LIGHT) : t;
    const out = { format: 'my-calendar-view-theme', version: 1, theme: { ...clone(src), id: undefined, name: t.name } };
    out.theme.bg.media = null;
    if (t.bg && t.bg.media) {
      const blob = await mediaGet(t.bg.media.id).catch(() => null);
      if (blob && blob.size <= 25 * 1024 * 1024) {
        out.media = { kind: t.bg.media.kind, name: t.bg.media.name, data: await new Promise((res) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob);
        }) };
      }
    }
    const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(t.name || 'theme').replace(/[^\w\- ]+/g, '').trim() || 'theme'}.mycaltheme.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  async function importTheme(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { return note('That file isn’t a theme.'); }
    if (!data || data.format !== 'my-calendar-view-theme' || !data.theme) return note('That file isn’t a My Calendar View theme.');
    const t = sanitize(data.theme);
    const m = data.media;
    if (m && typeof m.data === 'string' && /^data:(image|video)\/[\w.+-]+;base64,/.test(m.data)) {
      try {
        const blob = await (await fetch(m.data)).blob();
        if (blob.size <= MAX_MEDIA) {
          const id = 'm' + Date.now().toString(36);
          await mediaPut(id, blob);
          t.bg.media = { id, kind: blob.type.startsWith('video/') ? 'video' : 'image', name: cleanStr(m.name, 80, 'background') };
          t.bg.type = 'media';
        }
      } catch { /* skip media */ }
    }
    if (t.bg.type === 'media' && !t.bg.media) t.bg.type = 'none';
    custom.push(t);
    activeId = t.id;
    saveState(); apply(t); renderEditor();
    note(`Imported “${t.name}”.`);
  }
  async function uploadMedia(file) {
    if (!file) return;
    if (!/^(image|video)\//.test(file.type)) return note('Choose an image, GIF or video file.');
    if (file.size > MAX_MEDIA) return note('That file is over 60 MB. Try a smaller one.');
    const id = 'm' + Date.now().toString(36);
    await mediaPut(id, file);
    change((t) => {
      const old = t.bg.media;
      t.bg.media = { id, kind: file.type.startsWith('video/') ? 'video' : 'image', name: file.name.slice(0, 80) };
      t.bg.type = 'media';
      if (old) cleanupMedia(old.id, t.id);
    }, { rerender: true });
  }
  function cleanupMedia(mediaId, exceptThemeId) {
    const used = custom.some((t) => t.id !== exceptThemeId && t.bg.media && t.bg.media.id === mediaId);
    if (!used) mediaDel(mediaId).catch(() => {});
  }
  function deleteTheme(id) {
    const t = custom.find((x) => x.id === id);
    if (!t) return;
    custom = custom.filter((x) => x.id !== id);
    if (t.bg.media) cleanupMedia(t.bg.media.id, null);
    if (activeId === id) activeId = 'system';
    saveState(); apply(active()); renderEditor();
  }

  let noteT = null;
  function note(msg) {
    const n = $('themeNote');
    if (!n) return;
    n.textContent = msg; n.hidden = false;
    clearTimeout(noteT); noteT = setTimeout(() => { n.hidden = true; }, 5000);
  }

  // ---------- editor UI ----------
  function card(t) {
    const src = t.system ? (systemDark() ? SYSTEM_DARK : SYSTEM_LIGHT) : t;
    const b = el('button', 'theme-card');
    b.type = 'button';
    b.classList.toggle('active', t.id === activeId);
    const sw = el('div', 'theme-swatch');
    const [c1, c2, c3] = src.bg.colors;
    const bgOn = src.bg.type !== 'none';
    sw.style.background = bgOn
      ? `radial-gradient(circle at 20% 30%, ${c1}aa, transparent 60%), radial-gradient(circle at 80% 70%, ${c2}aa, transparent 60%), radial-gradient(circle at 60% 20%, ${c3}88, transparent 55%), ${src.colors.bg}`
      : src.colors.bg;
    const aa = el('span', 'theme-aa', 'Aa');
    aa.style.color = src.colors.text;
    sw.appendChild(aa);
    const dot = el('span', 'theme-dot');
    dot.style.background = src.colors.accent;
    sw.appendChild(dot);
    if (src.bg.type !== 'none') sw.appendChild(el('span', 'theme-anim', src.bg.type === 'media' ? '🖼' : '✦'));
    b.appendChild(sw);
    b.appendChild(el('span', 'theme-name', t.name));
    b.title = t.system ? 'Follows your computer’s light/dark setting' : `${t.name} · ${(window.ThemeBG.TYPES[src.bg.type] || {}).name || ''}`;
    b.addEventListener('click', () => { activeId = t.id; saveState(); apply(t); renderEditor(); });
    return b;
  }
  function renderCards() {
    const grid = $('themeCards');
    if (!grid) return;
    grid.textContent = '';
    for (const t of all()) grid.appendChild(card(t));
  }

  function field(label, control, cls) {
    const l = el('label', 'tfield' + (cls ? ' ' + cls : ''));
    l.appendChild(el('span', 'tlabel', label));
    l.appendChild(control);
    return l;
  }
  function colorInput(value, onInput) {
    const i = el('input');
    i.type = 'color'; i.value = value;
    i.addEventListener('input', () => onInput(i.value));
    return i;
  }
  function range(value, min, max, step, onInput, fmt) {
    const wrap = el('span', 'trange');
    const i = el('input');
    i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
    const out = el('output', null, fmt(value));
    i.addEventListener('input', () => { out.textContent = fmt(Number(i.value)); onInput(Number(i.value)); });
    wrap.appendChild(i); wrap.appendChild(out);
    return wrap;
  }
  function select(options, value, onChange) {
    const s = el('select');
    for (const [v, label] of options) { const o = el('option', null, label); o.value = v; s.appendChild(o); }
    s.value = value;
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  const pct = (v) => `${Math.round(v * 100)}%`;

  function renderEditor() {
    const body = $('themeBody');
    if (!body) return;
    body.textContent = '';
    const note0 = el('div', 'theme-note');
    note0.id = 'themeNote'; note0.hidden = true;
    body.appendChild(note0);

    const grid = el('div', 'theme-cards');
    grid.id = 'themeCards';
    body.appendChild(grid);
    renderCards();

    const cur = active();
    const isPreset = PRESETS.includes(cur);
    const t = cur.system ? (systemDark() ? SYSTEM_DARK : SYSTEM_LIGHT) : cur;

    const head = el('div', 'theme-edit-head');
    const h3 = el('h3', null, `Customize “${cur.name}”`);
    h3.id = 'themeEditHead';
    head.appendChild(h3);
    if (isPreset) head.appendChild(el('span', 'hint', 'Changes save as your own copy.'));
    body.appendChild(head);

    if (!isPreset) {
      const name = el('input', 'tname');
      name.value = cur.name; name.maxLength = 40;
      name.addEventListener('input', () => change((x) => { x.name = name.value || 'My theme'; }));
      body.appendChild(field('Name', name, 'wide'));
    }

    // Look
    const sec = (title) => { const s = el('section', 'tsec'); s.appendChild(el('h4', null, title)); body.appendChild(s); return s; };
    let s = sec('Colors');
    const g1 = el('div', 'tgrid'); s.appendChild(g1);
    g1.appendChild(field('Mode', select([['dark', 'Dark'], ['light', 'Light']], t.scheme, (v) => change((x) => { x.scheme = v; }))));
    g1.appendChild(field('Background', colorInput(t.colors.bg, (v) => change((x) => { x.colors.bg = v; }))));
    g1.appendChild(field('Text', colorInput(t.colors.text, (v) => change((x) => { x.colors.text = v; }))));
    g1.appendChild(field('Accent', colorInput(t.colors.accent, (v) => change((x) => { x.colors.accent = v; }))));
    g1.appendChild(field('Completed', colorInput(t.colors.done, (v) => change((x) => { x.colors.done = v; }))));

    // Background
    s = sec('Animated background');
    const g2 = el('div', 'tgrid'); s.appendChild(g2);
    const types = Object.entries(window.ThemeBG.TYPES).map(([k, v]) => [k, v.name]);
    g2.appendChild(field('Effect', select(types, t.bg.type, (v) => change((x) => { x.bg.type = v; }, { rerender: true })), 'wide'));
    if (t.bg.type === 'media') {
      const row = el('div', 'tmedia');
      const up = el('button', 'btn', t.bg.media ? 'Replace file…' : 'Upload image, GIF or video…');
      up.type = 'button';
      const file = el('input'); file.type = 'file'; file.accept = 'image/*,video/*'; file.hidden = true;
      file.addEventListener('change', () => uploadMedia(file.files[0]));
      up.addEventListener('click', () => file.click());
      row.appendChild(up); row.appendChild(file);
      row.appendChild(el('span', 'hint', t.bg.media ? t.bg.media.name : 'Up to 60 MB. Stays on this computer.'));
      s.appendChild(row);
    } else if (t.bg.type !== 'none') {
      const g3 = el('div', 'tgrid'); s.appendChild(g3);
      [0, 1, 2].forEach((i) => g3.appendChild(field(`Color ${i + 1}`, colorInput(t.bg.colors[i], (v) => change((x) => { x.bg.colors[i] = v; })))));
      g3.appendChild(field('Speed', range(t.bg.speed, 0.1, 3, 0.1, (v) => change((x) => { x.bg.speed = v; }), (v) => `${v.toFixed(1)}×`)));
      g3.appendChild(field('Amount', range(t.bg.density, 0.2, 3, 0.1, (v) => change((x) => { x.bg.density = v; }), (v) => `${v.toFixed(1)}×`)));
    }
    if (t.bg.type !== 'none') {
      const g4 = el('div', 'tgrid'); s.appendChild(g4);
      g4.appendChild(field('Dim background', range(t.bg.dim, 0, 0.9, 0.05, (v) => change((x) => { x.bg.dim = v; }), pct)));
      g4.appendChild(field('Blur background', range(t.bg.blur, 0, 30, 1, (v) => change((x) => { x.bg.blur = v; }), (v) => `${v}px`)));
      g4.appendChild(field('Panel opacity', range(t.glass, 0.2, 1, 0.02, (v) => change((x) => { x.glass = v; }), pct)));
      g4.appendChild(field('Panel frost', range(t.glassBlur, 0, 30, 1, (v) => change((x) => { x.glassBlur = v; }), (v) => `${v}px`)));
    }

    // Style
    s = sec('Style');
    const g5 = el('div', 'tgrid'); s.appendChild(g5);
    g5.appendChild(field('Font', select(Object.entries(FONTS).map(([k, v]) => [k, v.name]), t.font, (v) => change((x) => { x.font = v; }))));
    g5.appendChild(field('Roundness', range(t.round, 0, 2.5, 0.1, (v) => change((x) => { x.round = v; }), (v) => `${v.toFixed(1)}×`)));

    // Icons
    s = sec('Icons');
    const g6 = el('div', 'tgrid'); s.appendChild(g6);
    g6.appendChild(field('Icon pack', select(Object.entries(ICON_PACKS).map(([k, v]) => [k, v.name]), t.icons.pack,
      (v) => change((x) => { x.icons = { pack: v, custom: {} }; }, { rerender: true })), 'wide'));
    const map = iconsFor(t);
    for (const [slot, label] of ICON_SLOTS) {
      const i = el('input', 'ticon');
      i.value = map[slot]; i.maxLength = 8;
      i.setAttribute('aria-label', `${label} icon`);
      i.addEventListener('input', () => change((x) => {
        const v = [...i.value.trim()].slice(0, 4).join('');
        if (v) x.icons.custom[slot] = v; else delete x.icons.custom[slot];
      }));
      g6.appendChild(field(label, i, 'narrow'));
    }
    s.appendChild(el('p', 'hint', 'Type or paste any emoji or symbol to use your own. The extension’s toolbar icon also takes on your accent color.'));

    // Actions
    const act = el('div', 'theme-actions');
    const exp = el('button', 'btn', 'Export theme');
    exp.type = 'button';
    exp.addEventListener('click', exportTheme);
    const imp = el('button', 'btn', 'Import theme…');
    imp.type = 'button';
    const impFile = el('input'); impFile.type = 'file'; impFile.accept = '.json,application/json'; impFile.hidden = true;
    impFile.addEventListener('change', () => { if (impFile.files[0]) importTheme(impFile.files[0]); });
    imp.addEventListener('click', () => impFile.click());
    act.appendChild(exp); act.appendChild(imp); act.appendChild(impFile);
    if (!isPreset) {
      const del = el('button', 'btn danger', 'Delete theme');
      del.type = 'button';
      let armed = false;
      del.addEventListener('click', () => {
        if (!armed) { armed = true; del.textContent = 'Click again to delete'; setTimeout(() => { armed = false; del.textContent = 'Delete theme'; }, 3000); return; }
        deleteTheme(cur.id);
      });
      act.appendChild(del);
    }
    body.appendChild(act);
  }

  function open() { renderEditor(); $('themeBackdrop').hidden = false; }
  function close() { $('themeBackdrop').hidden = true; }

  // ---------- init ----------
  (async function init() {
    const saved = (await store.get('themeState')) || {};
    custom = Array.isArray(saved.custom) ? saved.custom.map((t) => {
      const clean = sanitize(t);
      clean.id = typeof t.id === 'string' ? t.id.slice(0, 40) : clean.id;
      if (t.bg && t.bg.media && typeof t.bg.media.id === 'string') clean.bg.media = { id: t.bg.media.id, kind: t.bg.media.kind === 'video' ? 'video' : 'image', name: cleanStr(t.bg.media.name, 80, '') };
      if (clean.bg.type === 'media' && !clean.bg.media) clean.bg.type = 'none';
      return clean;
    }) : [];
    activeId = typeof saved.activeId === 'string' && all().some((t) => t.id === saved.activeId) ? saved.activeId : 'system';
    await apply(active());

    $('btnTheme').addEventListener('click', (e) => { e.stopPropagation(); $('themeBackdrop').hidden ? open() : close(); });
    $('btnCloseTheme').addEventListener('click', close);
    $('themeBackdrop').addEventListener('click', (e) => { if (e.target === $('themeBackdrop')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('themeBackdrop').hidden) close(); });
    // System theme follows the OS light/dark switch.
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (active().system && !$('themeBackdrop').hidden) renderEditor();
      });
    }
  })();
})();
