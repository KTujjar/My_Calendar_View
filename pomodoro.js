'use strict';
/* Pomodoro timer for My Calendar View.
   State is saved as an end timestamp, so the timer keeps going if the tab is
   closed or reloaded. A chrome.alarms alarm (handled in background.js) shows a
   notification when a session ends even if no calendar tab is open. */
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
  };
  const hasAlarms = typeof chrome !== 'undefined' && chrome.alarms;
  const ALARM = 'pomodoro';

  const MODES = {
    focus: { label: 'Focus', done: 'Focus session complete', next: 'Time for a break.' },
    short: { label: 'Short break', done: 'Break over', next: 'Ready to focus?' },
    long: { label: 'Long break', done: 'Long break over', next: 'Ready to focus?' },
  };
  const DEFAULTS = {
    focus: 25, short: 5, long: 15, longEvery: 4,
    autoBreaks: false, autoFocus: false,
    ringtone: 'chime', volume: 0.7, repeats: 3,
  };

  let cfg = { ...DEFAULTS };
  // mode, running, endAt (ms, when running), remaining (ms, when paused), focusCount
  // task: {title, doneId, start} — the calendar event this focus session is for
  let state = { mode: 'focus', running: false, endAt: 0, remaining: null, focusCount: 0, task: null };
  let tickTimer = null, endTimer = null;

  // ---------- ringtones (synthesized, no audio files) ----------
  let ctx = null;
  let ringing = null; // {stop()}
  function audio() {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(c, out, { freq, start, dur, type = 'sine', vol = 1, attack = 0.01 }) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start); o.stop(start + dur + 0.05);
    return o;
  }
  // Each ringtone schedules one "ring" starting at t and returns its length (s).
  const RINGTONES = {
    chime: { name: 'Chime', play(c, out, t) {
      tone(c, out, { freq: 880, start: t, dur: 0.9, vol: 0.5 });
      tone(c, out, { freq: 1318.5, start: t + 0.18, dur: 1.1, vol: 0.45 });
      return 1.4;
    } },
    bell: { name: 'Bell', play(c, out, t) {
      [[523.25, 0.5], [1046.5, 0.25], [1567, 0.12], [2637, 0.06]].forEach(([f, v]) =>
        tone(c, out, { freq: f, start: t, dur: 2.2, vol: v, attack: 0.005 }));
      return 2.2;
    } },
    digital: { name: 'Digital beep', play(c, out, t) {
      for (let i = 0; i < 4; i++) tone(c, out, { freq: 2000, start: t + i * 0.16, dur: 0.09, type: 'square', vol: 0.18, attack: 0.002 });
      return 1.1;
    } },
    marimba: { name: 'Marimba', play(c, out, t) {
      [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => {
        tone(c, out, { freq: f, start: t + i * 0.14, dur: 0.45, vol: 0.5, attack: 0.003 });
        tone(c, out, { freq: f * 4, start: t + i * 0.14, dur: 0.08, vol: 0.08, attack: 0.002 });
      });
      return 1.1;
    } },
    rise: { name: 'Gentle rise', play(c, out, t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, out, { freq: f, start: t + i * 0.22, dur: 0.9, type: 'triangle', vol: 0.35, attack: 0.06 }));
      return 1.8;
    } },
    alarm: { name: 'Alarm clock', play(c, out, t) {
      for (let i = 0; i < 8; i++) tone(c, out, { freq: i % 2 ? 1400 : 1700, start: t + i * 0.09, dur: 0.07, type: 'square', vol: 0.15, attack: 0.002 });
      return 1.0;
    } },
  };

  function playRingtone(id, repeats) {
    stopRinging();
    const rt = RINGTONES[id] || RINGTONES.chime;
    let c;
    try { c = audio(); } catch { return; }
    const out = c.createGain();
    out.gain.value = Math.max(0, Math.min(1, Number(cfg.volume)));
    out.connect(c.destination);
    let t = c.currentTime + 0.05;
    for (let i = 0; i < repeats; i++) t += rt.play(c, out, t) + 0.5;
    const done = setTimeout(() => stopRinging(), (t - c.currentTime) * 1000);
    ringing = { stop() { clearTimeout(done); try { out.disconnect(); } catch { /* gone */ } } };
    $('pomoStopRing').hidden = false;
  }
  function stopRinging() {
    if (ringing) { ringing.stop(); ringing = null; }
    const b = $('pomoStopRing');
    if (b) b.hidden = true;
  }

  // ---------- timer logic ----------
  const durMs = (mode) => Math.max(1, Number(cfg[mode]) || DEFAULTS[mode]) * 60e3;
  const remainingMs = () => state.running ? Math.max(0, state.endAt - Date.now())
    : (state.remaining == null ? durMs(state.mode) : state.remaining);

  function save() { store.set('pomoState', state); }
  function setAlarm() {
    if (!hasAlarms) return;
    chrome.alarms.clear(ALARM);
    if (state.running) chrome.alarms.create(ALARM, { when: state.endAt });
    store.set('pomoAlarmInfo', {
      mode: state.mode, nextMode: nextMode(), endAt: state.endAt,
      task: state.task ? state.task.title : null,
    });
  }

  function start() {
    try { audio(); } catch { /* audio unavailable */ }
    stopRinging();
    if (state.running) return;
    state.endAt = Date.now() + remainingMs();
    state.running = true;
    state.remaining = null;
    save(); setAlarm(); schedule(); paint();
  }
  function pause() {
    if (!state.running) return;
    state.remaining = remainingMs();
    state.running = false;
    save(); setAlarm(); schedule(); paint();
  }
  function reset() {
    stopRinging();
    state.running = false; state.remaining = null;
    save(); setAlarm(); schedule(); paint();
  }
  function switchMode(mode, autoStart) {
    state.mode = mode; state.running = false; state.remaining = null;
    if (autoStart) { start(); return; }
    save(); setAlarm(); schedule(); paint();
  }
  function nextMode() {
    if (state.mode !== 'focus') return 'focus';
    const n = state.focusCount + 1;
    return n % Math.max(1, Number(cfg.longEvery) || 4) === 0 ? 'long' : 'short';
  }
  function skip() { stopRinging(); advance(false); }

  // Session finished (or skipped): move to the next mode.
  function advance(finishedNaturally, silent) {
    const from = state.mode;
    const to = nextMode();
    if (from === 'focus' && finishedNaturally) {
      state.focusCount += 1;
      recordFocus(durMs('focus'));
      if (state.task) askTaskDone();
    }
    if (finishedNaturally && !silent) {
      playRingtone(cfg.ringtone, Math.max(1, Number(cfg.repeats) || 1));
      flash(`${MODES[from].done}. ${MODES[to === 'focus' ? from : 'focus'].next}`);
    }
    const auto = finishedNaturally && !silent && (to === 'focus' ? cfg.autoFocus : cfg.autoBreaks);
    switchMode(to, auto);
  }

  // ---------- focus history (for stats) ----------
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  async function recordFocus(ms) {
    const hist = (await store.get('pomoHistory')) || {};
    const k = ymd(new Date());
    const day = hist[k] || { sessions: 0, minutes: 0 };
    day.sessions += 1;
    day.minutes += Math.round(ms / 60e3);
    hist[k] = day;
    // keep a year of history
    const cutoff = ymd(new Date(Date.now() - 366 * 864e5));
    for (const key of Object.keys(hist)) if (key < cutoff) delete hist[key];
    await store.set('pomoHistory', hist);
  }

  // ---------- focusing on a calendar event ----------
  function focusOn(task) {
    state.task = task;
    $('pomoPanel').hidden = false;
    $('pomoAsk').hidden = true;
    if (state.mode === 'focus' && state.running) { save(); setAlarm(); paint(); return; }
    stopRinging();
    state.mode = 'focus'; state.running = false; state.remaining = null;
    start();
  }
  function askTaskDone() {
    $('pomoAskTitle').textContent = state.task.title;
    $('pomoAsk').hidden = false;
    $('pomoPanel').hidden = false;
  }
  function answerTask(done) {
    $('pomoAsk').hidden = true;
    state.pendingAsk = false;
    if (done && state.task) {
      document.dispatchEvent(new CustomEvent('cal:complete', { detail: { doneId: state.task.doneId, start: state.task.start } }));
      state.task = null;
    }
    save(); setAlarm(); paint();
  }

  function schedule() {
    clearInterval(tickTimer); clearTimeout(endTimer);
    if (!state.running) return;
    tickTimer = setInterval(paint, 1000);
    // A single timeout (not a chain) so background-tab throttling doesn't delay it much.
    endTimer = setTimeout(() => {
      if (state.running && Date.now() >= state.endAt - 50) { state.running = false; advance(true); }
      else schedule();
    }, Math.max(0, state.endAt - Date.now()));
  }

  // ---------- UI ----------
  const fmtTime = (ms) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };
  const TITLE_RE = /^[▶⏸] \d+:\d\d [^·]+· /;
  function setTitle(prefix) {
    const base = document.title.replace(TITLE_RE, '');
    document.title = prefix ? `${prefix} · ${base}` : base;
  }

  function paint() {
    const ms = remainingMs();
    const total = durMs(state.mode);
    const t = fmtTime(ms);
    $('pomoTime').textContent = t;
    $('pomoBar').style.width = `${Math.min(100, (1 - ms / total) * 100)}%`;
    const panel = $('pomoPanel');
    panel.dataset.mode = state.mode;
    for (const b of document.querySelectorAll('[data-pomo-mode]')) {
      b.classList.toggle('active', b.dataset.pomoMode === state.mode);
    }
    const startBtn = $('pomoStart');
    startBtn.textContent = state.running ? 'Pause' : (state.remaining != null ? 'Resume' : 'Start');

    const every = Math.max(1, Number(cfg.longEvery) || 4);
    const dots = $('pomoDots');
    dots.textContent = '';
    const inCycle = state.focusCount % every;
    for (let i = 0; i < every; i++) {
      const d = document.createElement('span');
      d.className = 'pomo-dot' + (i < inCycle ? ' filled' : '');
      dots.appendChild(d);
    }
    $('pomoCount').textContent = `${state.focusCount} focus session${state.focusCount === 1 ? '' : 's'} today`;

    const task = $('pomoTask');
    task.hidden = !state.task;
    $('pomoTaskTitle').textContent = state.task ? state.task.title : '';

    const active = state.running || state.remaining != null;
    const badge = $('pomoBadge');
    badge.textContent = active ? t : '';
    $('btnPomo').classList.toggle('running', state.running);
    $('btnPomo').dataset.mode = state.mode;
    setTitle(active ? `${state.running ? '▶' : '⏸'} ${t} ${MODES[state.mode].label}` : '');
  }

  let flashTimer = null;
  function flash(msg) {
    const f = $('pomoFlash');
    f.textContent = msg;
    f.hidden = false;
    $('pomoPanel').hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { f.hidden = true; }, 15000);
  }

  function fillSettings() {
    $('pomoFocusMin').value = cfg.focus;
    $('pomoShortMin').value = cfg.short;
    $('pomoLongMin').value = cfg.long;
    $('pomoEvery').value = cfg.longEvery;
    $('pomoAutoBreaks').checked = !!cfg.autoBreaks;
    $('pomoAutoFocus').checked = !!cfg.autoFocus;
    $('pomoVolume').value = Math.round(cfg.volume * 100);
    $('pomoRepeats').value = cfg.repeats;
    const sel = $('pomoRingtone');
    sel.textContent = '';
    for (const [id, r] of Object.entries(RINGTONES)) {
      const o = document.createElement('option');
      o.value = id; o.textContent = r.name;
      sel.appendChild(o);
    }
    sel.value = RINGTONES[cfg.ringtone] ? cfg.ringtone : 'chime';
  }
  function saveCfg() { store.set('pomoSettings', cfg); }

  function bind() {
    $('btnPomo').addEventListener('click', (e) => {
      e.stopPropagation();
      $('pomoPanel').hidden = !$('pomoPanel').hidden;
    });
    $('pomoClose').addEventListener('click', () => { $('pomoPanel').hidden = true; });
    $('pomoStart').addEventListener('click', () => (state.running ? pause() : start()));
    $('pomoReset').addEventListener('click', reset);
    $('pomoSkip').addEventListener('click', skip);
    $('pomoStopRing').addEventListener('click', stopRinging);
    for (const b of document.querySelectorAll('[data-pomo-mode]')) {
      b.addEventListener('click', () => { stopRinging(); switchMode(b.dataset.pomoMode, false); });
    }
    const num = (id, key, min, max) => $(id).addEventListener('change', () => {
      const v = Math.round(Number($(id).value));
      cfg[key] = Math.min(max, Math.max(min, Number.isFinite(v) ? v : DEFAULTS[key]));
      $(id).value = cfg[key];
      saveCfg();
      paint();
    });
    num('pomoFocusMin', 'focus', 1, 180);
    num('pomoShortMin', 'short', 1, 60);
    num('pomoLongMin', 'long', 1, 120);
    num('pomoEvery', 'longEvery', 2, 12);
    num('pomoRepeats', 'repeats', 1, 10);
    $('pomoAutoBreaks').addEventListener('change', () => { cfg.autoBreaks = $('pomoAutoBreaks').checked; saveCfg(); });
    $('pomoAutoFocus').addEventListener('change', () => { cfg.autoFocus = $('pomoAutoFocus').checked; saveCfg(); });
    $('pomoRingtone').addEventListener('change', () => {
      cfg.ringtone = $('pomoRingtone').value; saveCfg();
      playRingtone(cfg.ringtone, 1);
    });
    $('pomoVolume').addEventListener('change', () => {
      cfg.volume = Number($('pomoVolume').value) / 100; saveCfg();
      playRingtone(cfg.ringtone, 1);
    });
    $('pomoPreview').addEventListener('click', () => playRingtone(cfg.ringtone, 1));
    $('pomoTaskClear').addEventListener('click', () => { state.task = null; $('pomoAsk').hidden = true; save(); setAlarm(); paint(); });
    $('pomoAskYes').addEventListener('click', () => answerTask(true));
    $('pomoAskNo').addEventListener('click', () => answerTask(false));
    document.addEventListener('pomo:focus', (e) => { if (e.detail) focusOn(e.detail); });
    $('pomoResetCount').addEventListener('click', () => { state.focusCount = 0; save(); paint(); });

    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest('input, select, textarea')) return;
      const settingsOpen = $('settingsBackdrop') && !$('settingsBackdrop').hidden;
      if (settingsOpen) return;
      if (e.key.toLowerCase() === 'f') {
        $('pomoPanel').hidden = !$('pomoPanel').hidden;
        e.preventDefault();
      } else if (e.key === ' ' && !$('pomoPanel').hidden && !e.target.closest('button')) {
        state.running ? pause() : start();
        e.preventDefault();
      }
    });

    // Keep several open calendar tabs in step.
    if (hasChrome && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.pomoSettings) { cfg = { ...DEFAULTS, ...changes.pomoSettings.newValue }; fillSettings(); }
        if (changes.pomoState && JSON.stringify(changes.pomoState.newValue) !== JSON.stringify(state)) {
          state = { ...state, ...changes.pomoState.newValue };
          schedule();
        }
        if (changes.pomoSettings || changes.pomoState) paint();
      });
    }
  }

  // Reset the "today" counter at midnight.
  function rollDay() {
    const today = new Date().toDateString();
    if (state.day !== today) { state.day = today; state.focusCount = 0; save(); }
  }

  (async function init() {
    cfg = { ...DEFAULTS, ...((await store.get('pomoSettings')) || {}) };
    state = { ...state, ...((await store.get('pomoState')) || {}) };
    rollDay();
    // Finished while the tab was closed: move on quietly (the notification already told you).
    if (state.running && state.endAt <= Date.now()) {
      const wasFocus = state.mode === 'focus';
      state.running = false;
      advance(true, true);
      state.pendingAsk = wasFocus && !!state.task;
    }
    fillSettings();
    bind();
    if (state.task && state.mode !== 'focus' && state.pendingAsk) askTaskDone();
    schedule();
    paint();
    setInterval(() => { rollDay(); if (!state.running) paint(); }, 60e3);
    // view.js rewrites document.title on render; re-apply the timer prefix.
    new MutationObserver(() => {
      if (!TITLE_RE.test(document.title) && (state.running || state.remaining != null)) paint();
    }).observe(document.querySelector('title'), { childList: true });
  })();
})();
