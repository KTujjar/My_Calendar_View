'use strict';
/* Stats panel: focus time from the Pomodoro history, and completed vs scheduled
   events from the calendar (via window.MyCal, provided by view.js). */
(() => {
  const $ = (id) => document.getElementById(id);
  const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  async function getLocal(key) {
    if (hasChrome) return (await chrome.storage.local.get(key))[key];
    try { const v = localStorage.getItem(key); return v == null ? undefined : JSON.parse(v); } catch { return undefined; }
  }
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtDow = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
  const fmtMins = (m) => {
    if (!m) return '0m';
    const h = Math.floor(m / 60), r = m % 60;
    return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
  };

  let range = 7;
  try { range = Number(localStorage.getItem('statsRange')) === 30 ? 30 : 7; } catch { /* default */ }

  function streaks(hist) {
    // Consecutive days with at least one focus session.
    const has = (d) => !!(hist[ymd(d)] && hist[ymd(d)].sessions);
    const day = new Date(); day.setHours(12, 0, 0, 0);
    if (!has(day)) day.setDate(day.getDate() - 1); // today not started yet doesn't break it
    let current = 0;
    while (has(day)) { current++; day.setDate(day.getDate() - 1); }
    const keys = Object.keys(hist).filter((k) => hist[k].sessions).sort();
    let best = 0, run = 0, prev = null;
    for (const k of keys) {
      const d = new Date(`${k}T12:00:00`);
      run = prev && Math.round((d - prev) / 864e5) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    }
    return { current, best: Math.max(best, current) };
  }

  function tile(label, value, sub) {
    const t = el('div', 'stat-tile');
    t.appendChild(el('div', 'stat-label', label));
    t.appendChild(el('div', 'stat-value', value));
    if (sub) t.appendChild(el('div', 'stat-sub', sub));
    return t;
  }

  // Bar chart. rows: [{date, value, track?, tip}]; track draws a muted "out of" bar behind.
  function barChart({ title, rows, max, fmtAxis, cls, legend }) {
    const wrap = el('section', 'chart ' + (cls || ''));
    const head = el('div', 'chart-head');
    head.appendChild(el('h3', null, title));
    if (legend) {
      const lg = el('div', 'chart-legend');
      for (const [c, label] of legend) {
        const item = el('span', 'lg-item');
        item.appendChild(el('span', 'lg-swatch ' + c));
        item.appendChild(document.createTextNode(label));
        lg.appendChild(item);
      }
      head.appendChild(lg);
    }
    wrap.appendChild(head);

    const plot = el('div', 'chart-plot');
    const axis = el('div', 'chart-axis');
    axis.appendChild(el('span', null, fmtAxis(max)));
    axis.appendChild(el('span', null, fmtAxis(max / 2)));
    axis.appendChild(el('span', null, '0'));
    plot.appendChild(axis);
    const bars = el('div', 'chart-bars');
    bars.style.setProperty('--n', rows.length);
    const tip = el('div', 'chart-tip');
    tip.hidden = true;
    rows.forEach((r, i) => {
      const col = el('div', 'bar-col');
      col.tabIndex = 0;
      col.setAttribute('aria-label', r.tip);
      if (r.track != null) {
        const tr = el('div', 'bar track');
        tr.style.height = `${(r.track / max) * 100}%`;
        col.appendChild(tr);
      }
      const b = el('div', 'bar fill');
      b.style.height = `${(r.value / max) * 100}%`;
      if (!r.value) b.classList.add('zero');
      col.appendChild(b);
      const show = () => {
        tip.textContent = r.tip;
        tip.hidden = false;
        const pct = ((i + 0.5) / rows.length) * 100;
        tip.style.left = `${pct}%`;
        tip.classList.toggle('flip-left', pct > 75);
        tip.classList.toggle('flip-right', pct < 25);
        col.classList.add('hover');
      };
      const hide = () => { tip.hidden = true; col.classList.remove('hover'); };
      col.addEventListener('mouseenter', show);
      col.addEventListener('mouseleave', hide);
      col.addEventListener('focus', show);
      col.addEventListener('blur', hide);
      bars.appendChild(col);
    });
    bars.appendChild(tip);
    plot.appendChild(bars);
    wrap.appendChild(plot);

    const labels = el('div', 'chart-labels');
    labels.style.setProperty('--n', rows.length);
    rows.forEach((r, i) => {
      const show = rows.length <= 7 || i === rows.length - 1 || (rows.length - 1 - i) % 5 === 0;
      labels.appendChild(el('span', null, show ? (rows.length <= 7 ? fmtDow.format(r.date) : String(r.date.getDate())) : ''));
    });
    wrap.appendChild(labels);
    return wrap;
  }

  function niceMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }

  async function renderStats() {
    for (const b of document.querySelectorAll('[data-stats-range]')) {
      b.classList.toggle('active', Number(b.dataset.statsRange) === range);
    }
    const body = $('statsBody');
    body.textContent = '';
    const hist = (await getLocal('pomoHistory')) || {};
    const cal = window.MyCal && window.MyCal.hasCalendars() ? window.MyCal.completionByDay(range) : [];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const h = hist[ymd(d)] || { sessions: 0, minutes: 0 };
      const c = cal[range - 1 - i] || { total: 0, done: 0 };
      days.push({ date: d, minutes: h.minutes, sessions: h.sessions, total: c.total, done: c.done });
    }
    const sum = (k) => days.reduce((a, d) => a + d[k], 0);
    const mins = sum('minutes'), sessions = sum('sessions'), total = sum('total'), done = sum('done');
    const { current, best } = streaks(hist);

    const tiles = el('div', 'stat-tiles');
    tiles.appendChild(tile('Focus time', fmtMins(mins), `${fmtMins(Math.round(mins / range))} a day on average`));
    tiles.appendChild(tile('Focus sessions', String(sessions), sessions ? `${(sessions / range).toFixed(1)} a day` : 'Start one with 🍅'));
    tiles.appendChild(tile('Events completed', `${done} / ${total}`, total ? `${Math.round((done / total) * 100)}% of scheduled` : 'Nothing scheduled'));
    tiles.appendChild(tile('Focus streak', `${current} day${current === 1 ? '' : 's'}`, `Best: ${best} day${best === 1 ? '' : 's'}`));
    body.appendChild(tiles);

    const peak = Math.max(...days.map((d) => d.minutes));
    const maxMin = niceMax(peak, peak <= 60 ? 30 : 120); // keeps the midline label a round number
    body.appendChild(barChart({
      title: 'Focus time per day',
      cls: 'focus',
      max: maxMin,
      fmtAxis: (v) => fmtMins(Math.round(v)),
      rows: days.map((d) => ({
        date: d.date, value: d.minutes,
        tip: `${fmtDay.format(d.date)} · ${fmtMins(d.minutes)} (${d.sessions} session${d.sessions === 1 ? '' : 's'})`,
      })),
    }));

    const maxEv = niceMax(Math.max(...days.map((d) => d.total)), 2);
    body.appendChild(barChart({
      title: 'Events completed per day',
      cls: 'events',
      max: maxEv,
      fmtAxis: (v) => String(Math.round(v)),
      legend: [['fill', 'Completed'], ['track', 'Scheduled']],
      rows: days.map((d) => ({
        date: d.date, value: d.done, track: d.total,
        tip: `${fmtDay.format(d.date)} · ${d.done} of ${d.total} completed`,
      })),
    }));

    // Table view of the same numbers.
    const det = el('details', 'stats-table');
    det.appendChild(el('summary', null, 'Show as table'));
    const table = el('table');
    const thead = el('tr');
    ['Day', 'Focus', 'Sessions', 'Completed', 'Scheduled'].forEach((h) => thead.appendChild(el('th', null, h)));
    table.appendChild(thead);
    for (const d of [...days].reverse()) {
      const tr = el('tr');
      [fmtDay.format(d.date), fmtMins(d.minutes), d.sessions, d.done, d.total].forEach((v) => tr.appendChild(el('td', null, String(v))));
      table.appendChild(tr);
    }
    det.appendChild(table);
    body.appendChild(det);

    body.appendChild(el('p', 'hint', 'Focus time counts finished Pomodoro focus sessions. Events exclude declined and multi-day all-day events.'));
  }

  function open() { $('statsBackdrop').hidden = false; renderStats(); }
  function close() { $('statsBackdrop').hidden = true; }

  $('btnStats').addEventListener('click', (e) => { e.stopPropagation(); open(); });
  $('btnCloseStats').addEventListener('click', close);
  $('statsBackdrop').addEventListener('click', (e) => { if (e.target === $('statsBackdrop')) close(); });
  for (const b of document.querySelectorAll('[data-stats-range]')) {
    b.addEventListener('click', () => {
      range = Number(b.dataset.statsRange);
      try { localStorage.setItem('statsRange', String(range)); } catch { /* ignore */ }
      renderStats();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('statsBackdrop').hidden) { close(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, select, textarea')) return;
    if (!$('settingsBackdrop').hidden) return;
    if (e.key.toLowerCase() === 's') { $('statsBackdrop').hidden ? open() : close(); e.preventDefault(); }
  });
  if (hasChrome && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.pomoHistory && !$('statsBackdrop').hidden) renderStats();
    });
  }
})();
