'use strict';
/* My Calendar View — renders Google Calendar iCal feeds in a week/day grid
   that shows only the hours you choose. Everything stays in this browser. */
(() => {
  const DEFAULTS = {
    calendars: [],        // [{id, url, name, nameAuto, color, enabled}]
    startHour: 8,
    endHour: 24,          // 24 = midnight
    fit: true,
    weekStart: 0,         // 0 = Sunday
    showWeekends: true,
    accountIndex: 2,
    view: 'week',
    doneSound: true,      // play a short chime when completing an event
    reminderMin: 5,       // notify this many minutes before events (0 = off)
  };
  const PALETTE = ['#4285f4', '#33b679', '#f4511e', '#8e24aa', '#e4a11b', '#039be5', '#e67c73', '#0b8043'];
  const MIN_HOUR_PX = 34;
  const MIN_EVENT_PX = 20;
  const SCROLL_HOUR_PX = 48;
  const DAY_MS = 864e5;
  const REFRESH_MS = 10 * 60e3;

  // ---------- storage (chrome.storage in the extension, localStorage when previewed as a plain page) ----------
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

  // ---------- state ----------
  let settings = { ...DEFAULTS };
  let anchor = startOfDay(new Date());
  const models = new Map();   // calId -> {events, calendarId, name, count}
  const meta = new Map();     // calId -> {fetchedAt, error}
  let lastFetch = 0;
  let refreshing = false;
  let hourPx = SCROLL_HOUR_PX;
  let nowRefs = [];
  let renderedDay = startOfDay(new Date()).getTime();

  const $ = (id) => document.getElementById(id);

  // ---------- date helpers ----------
  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function atHour(day, h) { return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, 0, 0, 0); }
  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function startOfWeek(d, ws) { const s = startOfDay(d); return addDays(s, -((s.getDay() - ws + 7) % 7)); }
  const pad = (n, w = 2) => String(n).padStart(w, '0');

  const fmt = {
    time: new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }),
    hour: new Intl.DateTimeFormat(undefined, { hour: 'numeric' }),
    dow: new Intl.DateTimeFormat(undefined, { weekday: 'short' }),
    longDay: new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    medDay: new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }),
    shortDay: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    monthDay: new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }),
    range: new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }),
  };
  function timeRange(s, e) {
    if (s.getTime() === e.getTime()) return fmt.time.format(s);
    if (!sameDay(s, e)) {
      if (e - s < DAY_MS) return `${fmt.time.format(s)} – ${fmt.time.format(e)} (+1 day)`;
      return `${fmt.shortDay.format(s)}, ${fmt.time.format(s)} – ${fmt.shortDay.format(e)}, ${fmt.time.format(e)}`;
    }
    try { return fmt.time.formatRange(s, e); } catch { return `${fmt.time.format(s)} – ${fmt.time.format(e)}`; }
  }
  function hourLabel(h) { return h === 24 ? 'Midnight' : fmt.hour.format(atHour(new Date(2000, 0, 1), h)); }
  function utcStamp(d) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  }
  function ago(ts) {
    if (!ts) return '';
    const m = Math.round((Date.now() - ts) / 60e3);
    if (m < 1) return 'Updated just now';
    if (m < 60) return `Updated ${m} min ago`;
    return `Updated ${fmt.time.format(new Date(ts))}`;
  }

  // ---------- DOM helper ----------
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------- Google Calendar links ----------
  const gBase = () => `https://calendar.google.com/calendar/u/${Number(settings.accountIndex) || 0}/r`;
  function dayUrl(d) { return `${gBase()}/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; }
  function createUrl(s, e) { return s ? `${gBase()}/eventedit?dates=${utcStamp(s)}/${utcStamp(e)}` : `${gBase()}/eventedit`; }
  function ridString(t) {
    if (t.isDate) return `${pad(t.year, 4)}${pad(t.month)}${pad(t.day)}`;
    return utcStamp(t.toJSDate());
  }
  function eventUrl(o) {
    if (o.uid && /@google\.com$/i.test(o.uid) && o.calendarId) {
      let id = o.uid.replace(/@google\.com$/i, '');
      if (o.recurrenceId) id += '_' + ridString(o.recurrenceId);
      const eid = btoa(unescape(encodeURIComponent(`${id} ${o.calendarId}`))).replace(/=+$/, '');
      return `${gBase()}/eventedit/${eid}`;
    }
    return dayUrl(o.start);
  }
  function calendarIdFromUrl(url) {
    const m = /\/ical\/([^/]+)\//.exec(url);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }

  // ---------- iCal parsing & expansion ----------
  function parseCalendar(text, cal) {
    const comp = new ICAL.Component(ICAL.parse(text));
    for (const vtz of comp.getAllSubcomponents('vtimezone')) {
      try { ICAL.TimezoneService.register(vtz); } catch { /* ignore bad zone */ }
    }
    const masters = new Map();
    const exceptions = [];
    const events = [];
    for (const ve of comp.getAllSubcomponents('vevent')) {
      let ev;
      try { ev = new ICAL.Event(ve); } catch { continue; }
      if (ev.isRecurrenceException()) exceptions.push(ev);
      else { events.push(ev); if (ev.uid) masters.set(ev.uid, ev); }
    }
    for (const ex of exceptions) {
      const m = masters.get(ex.uid);
      if (m && m.isRecurring()) {
        try { m.relateException(ex); continue; } catch { /* fall through */ }
      }
      events.push(ex);
    }
    return {
      events,
      count: events.length,
      name: comp.getFirstPropertyValue('x-wr-calname') || null,
      calendarId: calendarIdFromUrl(cal.url),
    };
  }

  function isDeclined(item, calendarId) {
    if (!calendarId) return false;
    const me = calendarId.toLowerCase();
    for (const p of item.attendees || []) {
      const who = String(p.getFirstValue() || '').toLowerCase().replace(/^mailto:/, '');
      if (who === me) return String(p.getParameter('partstat') || '').toUpperCase() === 'DECLINED';
    }
    return false;
  }

  function expand(cal, model, rangeStart, rangeEnd) {
    const out = [];
    const rs = rangeStart.getTime();
    const re = rangeEnd.getTime();

    const push = (item, sd, ed, recurrenceId) => {
      if (!sd) return;
      const status = String(item.component.getFirstPropertyValue('status') || '').toUpperCase();
      if (status === 'CANCELLED') return;
      const allDay = !!sd.isDate;
      const s = sd.toJSDate();
      let e = ed ? ed.toJSDate() : (allDay ? addDays(s, 1) : new Date(s));
      if (allDay && e <= s) e = addDays(s, 1);
      if (e < s) e = new Date(s);
      const st = s.getTime(), et = e.getTime();
      const inRange = st < re && (et > rs || (et === st && st >= rs));
      if (!inRange) return;
      const rid = recurrenceId || item.recurrenceId || null;
      const doneKey = rid
        ? `${cal.id}|${item.uid}|${ymd(rid.toJSDate())}`
        : `${cal.id}|${item.uid}`;
      out.push({
        key: `${cal.id}|${item.uid}|${st}`,
        doneId: hashKey(doneKey),
        calId: cal.id,
        calName: cal.name,
        color: cal.color,
        title: item.summary || '(No title)',
        location: item.location || '',
        description: item.description || '',
        start: s,
        end: e,
        allDay,
        uid: item.uid,
        recurrenceId: recurrenceId || item.recurrenceId || null,
        calendarId: model.calendarId,
        declined: isDeclined(item, model.calendarId),
      });
    };

    for (const ev of model.events) {
      try {
        if (ev.isRecurring()) {
          const it = ev.iterator();
          const stopAt = re + 7 * DAY_MS;      // small buffer for moved exceptions
          const skipBefore = rs - 60 * DAY_MS; // occurrences this early can't reach the range
          let next; let n = 0;
          while ((next = it.next())) {
            if (++n > 50000) break;
            const t = next.toJSDate().getTime();
            if (t >= stopAt) break;
            if (t < skipBefore) continue;
            const d = ev.getOccurrenceDetails(next);
            push(d.item, d.startDate, d.endDate, next);
          }
        } else {
          push(ev, ev.startDate, ev.endDate, null);
        }
      } catch (err) {
        console.warn('Skipping event', ev && ev.summary, err);
      }
    }
    return out;
  }

  // ---------- fetching ----------
  async function loadCached() {
    for (const cal of settings.calendars) {
      const c = await store.get(`ics_${cal.id}`);
      if (c && c.text) {
        try {
          models.set(cal.id, parseCalendar(c.text, cal));
          meta.set(cal.id, { fetchedAt: c.fetchedAt, error: null });
          lastFetch = Math.max(lastFetch, c.fetchedAt || 0);
        } catch (e) { /* will refetch */ }
      }
    }
  }

  async function fetchCalendar(cal) {
    const res = await fetch(cal.url, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) {
      if (res.status === 404) throw new Error('Link not found — it may have been reset in Google Calendar settings');
      throw new Error(`Google returned HTTP ${res.status}`);
    }
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error("That link didn't return a calendar. Use the “Secret address in iCal format”.");
    const model = parseCalendar(text, cal);
    const fetchedAt = Date.now();
    await store.set(`ics_${cal.id}`, { text, fetchedAt });
    models.set(cal.id, model);
    meta.set(cal.id, { fetchedAt, error: null });
    if (model.name && cal.nameAuto !== false && cal.name !== model.name) {
      cal.name = model.name;
      cal.nameAuto = true;
      await saveSettings();
    }
  }

  async function refreshAll() {
    if (refreshing) return;
    const cals = settings.calendars.filter((c) => c.enabled !== false);
    if (!cals.length) return;
    refreshing = true;
    setStatus('Refreshing…', true);
    await Promise.all(cals.map(async (cal) => {
      try { await fetchCalendar(cal); }
      catch (err) {
        const prev = meta.get(cal.id) || {};
        meta.set(cal.id, { ...prev, error: err.message || String(err) });
      }
    }));
    lastFetch = Date.now();
    refreshing = false;
    render();
    renderCalList();
  }

  function setStatus(text, spinning) {
    const s = $('status');
    s.textContent = text;
    s.classList.toggle('spin', !!spinning);
  }
  function updateStatus() {
    if (refreshing) return;
    const times = settings.calendars.map((c) => (meta.get(c.id) || {}).fetchedAt || 0).filter(Boolean);
    setStatus(times.length ? ago(Math.min(...times)) : '');
  }
  function updateBanner() {
    const errs = settings.calendars
      .filter((c) => c.enabled !== false && (meta.get(c.id) || {}).error)
      .map((c) => `${c.name || 'Calendar'}: ${meta.get(c.id).error}`);
    const b = $('banner');
    b.hidden = !errs.length;
    b.textContent = errs.length ? `Couldn't refresh — ${errs.join(' · ')}. Showing the last saved copy if there is one.` : '';
  }

  // ---------- settings ----------
  async function loadSettings() {
    const saved = (await store.get('settings')) || {};
    settings = { ...DEFAULTS, ...saved };
    settings.calendars = (settings.calendars || []).map((c) => ({ ...c }));
  }
  async function saveSettings() { await store.set('settings', settings); }

  // ---------- completed events ----------
  // Completions are keyed by event (and, for repeating events, by the date of the
  // original occurrence) so they survive time changes. They live in
  // chrome.storage.sync so they follow you to any Chrome you're signed into.
  // Stored compactly as {hash: dayNumber}, split into shards under the 8 KB
  // per-item sync limit, and entries older than DONE_KEEP_DAYS are pruned.
  const DONE_KEEP_DAYS = 120;
  const DONE_MAX = 3000;
  const DONE_SHARD = 250;
  const DONE_PREFIX = 'done_';
  const syncArea = hasChrome && chrome.storage.sync ? chrome.storage.sync : null;
  let completed = new Map();   // doneId -> day number (days since epoch) of the event
  let legacyDone = new Set();  // keys saved by the first version (local only)
  let doneShardCount = 0;

  function ymd(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; }
  function hashKey(str) {
    // cyrb53: short, stable 53-bit hash, encoded base36 (~11 chars)
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  const dayNum = (d) => Math.floor(startOfDay(d).getTime() / DAY_MS + 0.5);

  async function readDoneStore() {
    const merged = {};
    if (syncArea) {
      const all = await syncArea.get(null);
      doneShardCount = 0;
      for (const [k, v] of Object.entries(all)) {
        if (!k.startsWith(DONE_PREFIX) || !v || typeof v !== 'object') continue;
        doneShardCount = Math.max(doneShardCount, Number(k.slice(DONE_PREFIX.length)) + 1);
        Object.assign(merged, v);
      }
    } else {
      Object.assign(merged, (await store.get('completedV2')) || {});
    }
    return merged;
  }

  async function loadCompleted() {
    let merged = {};
    try { merged = await readDoneStore(); } catch (e) { console.warn('Could not read completions', e); }
    const cutoff = dayNum(new Date()) - DONE_KEEP_DAYS;
    completed = new Map(Object.entries(merged).filter(([, d]) => d >= cutoff));
    const legacy = await store.get('completed');
    legacyDone = new Set(Array.isArray(legacy) ? legacy : []);
  }

  let saveTimer = null;
  function saveCompleted() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeCompleted, 300);
  }
  async function writeCompleted() {
    const entries = [...completed.entries()].sort((a, b) => b[1] - a[1]).slice(0, DONE_MAX);
    try {
      if (syncArea) {
        const data = {};
        const shards = Math.ceil(entries.length / DONE_SHARD);
        for (let i = 0; i < shards; i++) {
          data[DONE_PREFIX + i] = Object.fromEntries(entries.slice(i * DONE_SHARD, (i + 1) * DONE_SHARD));
        }
        const stale = [];
        for (let i = shards; i < doneShardCount; i++) stale.push(DONE_PREFIX + i);
        writingSync = true;
        if (shards) await syncArea.set(data);
        if (stale.length) await syncArea.remove(stale);
        doneShardCount = shards;
      } else {
        await store.set('completedV2', Object.fromEntries(entries));
      }
    } catch (e) {
      console.warn('Could not save completions', e);
      setStatus("Couldn't sync completions — will retry on next change");
    } finally {
      setTimeout(() => { writingSync = false; }, 500);
    }
    if (legacyDone.size === 0 && (await store.get('completed')) !== undefined) await store.remove('completed');
    else if (legacyDone.size) await store.set('completed', [...legacyDone]);
  }
  let writingSync = false;

  function isDone(o) {
    if (completed.has(o.doneId)) return true;
    if (legacyDone.has(o.key)) {
      // Migrate a completion saved by the first version to the new key.
      legacyDone.delete(o.key);
      completed.set(o.doneId, dayNum(o.start));
      saveCompleted();
      return true;
    }
    return false;
  }

  function setDone(o, done) {
    if (done) completed.set(o.doneId, dayNum(o.start));
    else { completed.delete(o.doneId); legacyDone.delete(o.key); }
    saveCompleted();
    refreshDoneMarks(done ? o.doneId : null);
    if (done) celebrate();
    afterDoneChange();
  }
  function afterDoneChange() { updateUpcoming(); scheduleReminders(); }

  // Completion requested from the Pomodoro panel ("Mark complete" after a focus session).
  document.addEventListener('cal:complete', (e) => {
    const { doneId, start } = e.detail || {};
    if (!doneId) return;
    completed.set(doneId, dayNum(new Date(start || Date.now())));
    saveCompleted();
    refreshDoneMarks(doneId);
    afterDoneChange();
  });

  // ---------- upcoming events & reminders ----------
  function upcomingOccurrences(hours) {
    const now = Date.now();
    let occ = [];
    for (const cal of settings.calendars) {
      if (cal.enabled === false) continue;
      const model = models.get(cal.id);
      if (model) occ = occ.concat(expand(cal, model, new Date(now - 12 * 3.6e6), new Date(now + hours * 3.6e6)));
    }
    return occ
      .filter((o) => !o.allDay && !o.declined && o.end.getTime() > now && !isDone(o))
      .sort((a, b) => a.start - b.start);
  }
  const fmtDur = (ms) => {
    const m = Math.max(1, Math.round(ms / 60e3));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h}h ${r}m` : `${h}h`;
  };
  let upcomingTarget = null;
  function updateUpcoming() {
    const chip = $('nextUp');
    if (!chip) return;
    const now = Date.now();
    const list = settings.calendars.length ? upcomingOccurrences(14) : [];
    const current = list.find((o) => o.start.getTime() <= now);
    const next = list.find((o) => o.start.getTime() > now);
    let text = '', o = null;
    if (current) { o = current; text = `Now: ${current.title} · ${fmtDur(current.end - now)} left`; }
    else if (next && next.start - now <= 12 * 3.6e6) {
      o = next;
      const ms = next.start - now;
      text = ms <= 2 * 3.6e6 ? `Next: ${next.title} in ${fmtDur(ms)}` : `Next: ${next.title} at ${fmt.time.format(next.start)}`;
    }
    upcomingTarget = o;
    chip.hidden = !o;
    chip.textContent = text;
    chip.title = o ? `${whenText(o)} · ${o.title}` : '';
    chip.classList.toggle('now', !!current);
    chip.classList.toggle('soon', !current && !!next && next.start - now <= 15 * 60e3);
  }

  // Schedule Chrome alarms for the next ~day of events; background.js turns them
  // into notifications, so they fire even when no calendar tab is open.
  const hasAlarms = typeof chrome !== 'undefined' && chrome.alarms;
  let reminderSig = '';
  let reminderTimer = null;
  function scheduleReminders() {
    clearTimeout(reminderTimer);
    reminderTimer = setTimeout(doScheduleReminders, 800);
  }
  async function doScheduleReminders() {
    if (!hasAlarms) return;
    const lead = Math.max(0, Number(settings.reminderMin) || 0) * 60e3;
    const now = Date.now();
    const list = lead ? upcomingOccurrences(26).filter((o) => o.start.getTime() - lead > now + 5e3).slice(0, 40) : [];
    const info = {};
    for (const o of list) {
      info[`evt|${o.doneId}|${o.start.getTime()}`] = {
        title: o.title, start: o.start.getTime(), end: o.end.getTime(), location: o.location || '', lead,
      };
    }
    const sig = JSON.stringify(info);
    if (sig === reminderSig) return;
    reminderSig = sig;
    try {
      const all = await chrome.alarms.getAll();
      await Promise.all(all.filter((a) => a.name.startsWith('evt|') && !info[a.name]).map((a) => chrome.alarms.clear(a.name)));
      const have = new Set(all.map((a) => a.name));
      for (const [name, v] of Object.entries(info)) {
        if (!have.has(name)) chrome.alarms.create(name, { when: v.start - v.lead });
      }
      await store.set('eventReminders', info);
    } catch (e) { console.warn('Could not schedule reminders', e); }
  }

  // Completed vs scheduled per day, for the stats panel (stats.js).
  window.MyCal = {
    completionByDay(numDays) {
      const today = startOfDay(new Date());
      const first = addDays(today, -(numDays - 1));
      const end = addDays(today, 1);
      let occ = [];
      for (const cal of settings.calendars) {
        if (cal.enabled === false) continue;
        const model = models.get(cal.id);
        if (model) occ = occ.concat(expand(cal, model, first, end));
      }
      const days = [];
      for (let i = 0; i < numDays; i++) days.push({ date: addDays(first, i), total: 0, done: 0, seen: new Set() });
      for (const o of occ) {
        if (!countsTowardProgress(o)) continue;
        const idx = Math.round((startOfDay(o.start) - first) / DAY_MS);
        const d = days[idx];
        if (!d || d.seen.has(o.doneId)) continue;
        d.seen.add(o.doneId);
        d.total += 1;
        if (isDone(o)) d.done += 1;
      }
      return days.map(({ date, total, done }) => ({ date, total, done }));
    },
    hasCalendars: () => settings.calendars.length > 0,
  };

  function toggleCompleted(o) { const d = !isDone(o); setDone(o, d); return d; }

  // Update calendar blocks and per-day progress without a full re-render.
  function refreshDoneMarks(justDoneId) {
    for (const node of document.querySelectorAll('[data-done-id]')) {
      const d = completed.has(node.dataset.doneId);
      node.classList.toggle('done', d);
      if (d && node.dataset.doneId === justDoneId && !reducedMotion()) {
        node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop');
      }
    }
    updateProgress();
  }

  // ---------- celebration (animation + optional chime) ----------
  const reducedMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let audioCtx = null;
  function celebrate() {
    if (!settings.doneSound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [[880, 0], [1318.5, 0.09]].forEach(([freq, at]) => {
        const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + at);
        g.gain.exponentialRampToValueAtTime(0.18, t0 + at + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.32);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(t0 + at); osc.stop(t0 + at + 0.35);
      });
    } catch { /* audio not available */ }
  }

  // ---------- per-day progress ----------
  let progressRefs = []; // [{node, items:[o]}]
  function countsTowardProgress(o) {
    if (o.declined) return false;
    if (o.allDay) return o.end - o.start <= DAY_MS; // skip multi-day spans like trips
    return true;
  }
  function updateProgress() {
    for (const r of progressRefs) {
      const total = r.items.length;
      const done = r.items.filter(isDone).length;
      r.node.textContent = total ? `${done}/${total} done` : '';
      r.node.classList.toggle('all', total > 0 && done === total);
    }
  }

  // ---------- rendering ----------
  function visibleDays() {
    if (settings.view === 'day') return [startOfDay(anchor)];
    const s = startOfWeek(anchor, Number(settings.weekStart) || 0);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(s, i);
      if (!settings.showWeekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
      days.push(d);
    }
    return days.length ? days : [startOfDay(anchor)];
  }

  function rangeTitle(days) {
    if (settings.view === 'day') return fmt.longDay.format(days[0]);
    const a = days[0], b = days[days.length - 1];
    try { return fmt.range.formatRange(a, b); } catch { return `${fmt.shortDay.format(a)} – ${fmt.range.format(b)}`; }
  }

  function layoutColumns(items) {
    // items: [{s, e}] (ms). Assign col / cols using real times, so back-to-back
    // events (one ends 10:30, next starts 10:30) stay in the same column.
    items.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s));
    let cluster = [], colsEnd = [], clusterEnd = -Infinity;
    const finish = () => { for (const it of cluster) it.cols = colsEnd.length; cluster = []; colsEnd = []; };
    for (const it of items) {
      const e = Math.max(it.e, it.s + 1);
      if (it.s >= clusterEnd) { finish(); clusterEnd = -Infinity; }
      let col = colsEnd.findIndex((end) => end <= it.s);
      if (col === -1) { col = colsEnd.length; colsEnd.push(e); } else colsEnd[col] = e;
      it.col = col;
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, e);
    }
    finish();
    // Every event is drawn at least MIN_EVENT_PX tall so it stays readable.
    // Back-to-back events in the same column form a chain; the chain keeps its
    // real start and end, and short events borrow height from longer ones in it.
    const minMs = ((MIN_EVENT_PX + 2) / hourPx) * 3.6e6;
    const chains = [];
    const tail = new Map(); // "col/cols" -> last chain in that lane
    for (const it of items) {
      const lane = `${it.col}/${it.cols}`;
      const ch = tail.get(lane);
      if (ch && ch.end === it.s) { ch.items.push(it); ch.end = it.e; }
      else { const n = { items: [it], end: it.e }; chains.push(n); tail.set(lane, n); }
    }
    for (const ch of chains) {
      const list = ch.items, start = list[0].s, span = ch.end - start;
      const dur = list.map((it) => Math.max(1, it.e - it.s));
      let sizes;
      if (list.length > 1 && list.length * minMs <= span) {
        // Shrink only the longest events: cap c so sum(min(want, c)) === span.
        const want = dur.map((d) => Math.max(minMs, d));
        let lo = minMs, hi = Math.max(...want);
        for (let i = 0; i < 40; i++) {
          const c = (lo + hi) / 2;
          const sum = want.reduce((acc, w) => acc + Math.min(w, c), 0);
          if (sum > span) hi = c; else lo = c;
        }
        sizes = want.map((w) => Math.min(w, lo));
      } else {
        sizes = dur.map((d) => Math.max(minMs, d));
      }
      let t = start;
      list.forEach((it, i) => { it.vs = t; it.ve = t + sizes[i]; t = it.ve; });
    }
    // Safety net: if something still collides with an event drawn above it in
    // the same horizontal space (very dense days), nudge it down.
    const placed = [];
    for (const it of items) {
      const l = it.col / it.cols, r = (it.col + 1) / it.cols;
      let shift = 0;
      for (const o of placed) {
        if (o.l < r - 1e-9 && o.r > l + 1e-9 && o.ve > it.vs + shift && o.vs < it.vs + shift) shift = o.ve - it.vs;
      }
      it.vs += shift; it.ve += shift;
      placed.push({ l, r, vs: it.vs, ve: it.ve });
    }
    return items;
  }

  function render() {
    closePopover();
    hoveredEvent = null;
    const hasCals = settings.calendars.length > 0;
    $('welcome').hidden = hasCals;
    $('calendar').hidden = !hasCals;
    $('btnDay').classList.toggle('active', settings.view === 'day');
    $('btnWeek').classList.toggle('active', settings.view !== 'day');
    updateBanner();
    updateStatus();

    const days = visibleDays();
    $('rangeTitle').textContent = rangeTitle(days);
    document.title = `${rangeTitle(days)} · My Calendar`;
    if (!hasCals) return;

    const startH = Number(settings.startHour);
    const endH = Number(settings.endHour);
    const hours = endH - startH;
    const rangeStart = days[0];
    const rangeEnd = addDays(days[days.length - 1], 1);
    const now = new Date();
    renderedDay = startOfDay(now).getTime();

    // Collect occurrences
    let occ = [];
    for (const cal of settings.calendars) {
      if (cal.enabled === false) continue;
      const model = models.get(cal.id);
      if (model) occ = occ.concat(expand(cal, model, rangeStart, rangeEnd));
    }

    // Bucket per day
    const perDay = days.map((day) => {
      const dayStart = day, dayEnd = addDays(day, 1);
      const visStart = atHour(day, startH);
      const visEnd = endH === 24 ? dayEnd : atHour(day, endH);
      const bucket = { allDay: [], early: [], late: [], timed: [] };
      for (const o of occ) {
        if (o.allDay) {
          if (o.start < dayEnd && o.end > dayStart) bucket.allDay.push(o);
          continue;
        }
        const zero = o.start.getTime() === o.end.getTime();
        const touches = zero ? (o.start >= dayStart && o.start < dayEnd) : (o.start < dayEnd && o.end > dayStart);
        if (!touches) continue;
        const s = o.start < dayStart ? dayStart : o.start;
        const e = o.end > dayEnd ? dayEnd : o.end;
        const visible = zero ? (s >= visStart && s < visEnd) : (e > visStart && s < visEnd);
        if (visible) {
          const vs = s < visStart ? visStart : s;
          const ve = e > visEnd ? visEnd : e;
          bucket.timed.push({ o, s: vs.getTime(), e: ve.getTime(), clipTop: o.start < visStart, clipBottom: o.end > visEnd });
        } else if (e <= visStart) bucket.early.push(o);
        else bucket.late.push(o);
      }
      const byStart = (a, b) => a.start - b.start || a.title.localeCompare(b.title);
      bucket.allDay.sort((a, b) => (b.end - b.start) - (a.end - a.start) || byStart(a, b));
      bucket.early.sort(byStart);
      bucket.late.sort(byStart);
      return { day, visStart, visEnd, ...bucket };
    });

    const root = $('calendar');
    root.textContent = '';
    root.style.setProperty('--cols', days.length);

    // Header
    const head = el('div', 'cal-head');
    head.appendChild(el('div', 'gutter'));
    progressRefs = [];
    for (const d of perDay) {
      const { day } = d;
      const h = el('div', 'day-head');
      if (sameDay(day, now)) h.classList.add('today');
      else if (day < startOfDay(now)) h.classList.add('past');
      h.appendChild(el('div', 'dow', fmt.dow.format(day)));
      h.appendChild(el('div', 'dnum', String(day.getDate())));
      const prog = el('div', 'progress');
      h.appendChild(prog);
      const seen = new Set();
      const items = [...d.allDay, ...d.early, ...d.timed.map((t) => t.o), ...d.late]
        .filter((o) => countsTowardProgress(o) && !seen.has(o.doneId) && seen.add(o.doneId));
      progressRefs.push({ node: prog, items });
      h.title = fmt.medDay.format(day);
      h.addEventListener('click', () => { anchor = day; settings.view = 'day'; saveSettings(); render(); });
      head.appendChild(h);
    }
    root.appendChild(head);
    updateProgress();
    updateUpcoming();
    scheduleReminders();

    // Strips: all-day, before start, after end
    const strip = (label, key, opts = {}) => {
      if (!perDay.some((d) => d[key].length)) return;
      const row = el('div', 'cal-strip');
      const lab = el('div', 'strip-label');
      label.split('\n').forEach((part, i) => { if (i) lab.appendChild(el('br')); lab.appendChild(document.createTextNode(part)); });
      row.appendChild(lab);
      for (const d of perDay) {
        const cell = el('div', 'strip-cell');
        for (const o of d[key]) cell.appendChild(chip(o, opts.allDay));
        row.appendChild(cell);
      }
      root.appendChild(row);
    };
    strip('All day', 'allDay', { allDay: true });
    if (startH > 0) strip(`Before\n${hourLabel(startH)}`, 'early');
    if (endH < 24) strip(`After\n${hourLabel(endH)}`, 'late');

    // Body
    const body = el('div', 'cal-body');
    root.appendChild(body);
    if (settings.fit) {
      const avail = body.clientHeight - 2;
      hourPx = Math.max(MIN_HOUR_PX, Math.floor(avail / hours));
      body.classList.toggle('fit', hourPx * hours <= avail + 2);
    } else {
      hourPx = SCROLL_HOUR_PX;
    }

    const grid = el('div', 'cal-grid');
    grid.style.height = `${hours * hourPx}px`;
    const gutter = el('div', 'gutter');
    for (let h = startH; h < endH; h++) {
      const lab = el('div', 'hour-label', hourLabel(h));
      const y = (h - startH) * hourPx;
      lab.style.top = `${y}px`;
      if (h === startH) { lab.style.transform = 'none'; lab.style.top = '2px'; }
      gutter.appendChild(lab);
    }
    grid.appendChild(gutter);

    nowRefs = [];
    for (const d of perDay) {
      const col = el('div', 'day-col');
      if (sameDay(d.day, now)) col.classList.add('today');
      for (let h = 0; h < hours; h++) {
        const line = el('div', 'hour-line');
        line.style.top = `${h * hourPx}px`;
        col.appendChild(line);
        if (hourPx >= 44) {
          const half = el('div', 'half-line');
          half.style.top = `${h * hourPx + hourPx / 2}px`;
          col.appendChild(half);
        }
      }

      for (const it of layoutColumns(d.timed)) col.appendChild(eventBlock(it, d.visStart, now));

      col.addEventListener('dblclick', (ev) => {
        if (ev.target.closest('.event')) return;
        const y = ev.clientY - col.getBoundingClientRect().top;
        const mins = Math.floor((y / hourPx) * 2) * 30; // snap to 30 min
        const s = new Date(d.visStart.getTime() + mins * 60e3);
        window.open(createUrl(s, new Date(s.getTime() + 3.6e6)), '_blank', 'noopener');
      });
      col.title = 'Double-click to create an event';

      if (sameDay(d.day, now)) {
        const nl = el('div', 'now-line');
        col.appendChild(nl);
        nowRefs.push({ node: nl, visStart: d.visStart, visEnd: d.visEnd });
      }
      grid.appendChild(col);
    }
    body.appendChild(grid);
    positionNowLines();

    if (!settings.fit || !body.classList.contains('fit')) {
      // scroll near the current time if today is visible, else to the top
      const ref = nowRefs[0];
      if (ref && now > ref.visStart && now < ref.visEnd) {
        body.scrollTop = Math.max(0, ((now - ref.visStart) / 3.6e6) * hourPx - body.clientHeight / 3);
      }
    }
  }

  function positionNowLines() {
    const now = new Date();
    for (const r of nowRefs) {
      const inside = now >= r.visStart && now < r.visEnd;
      r.node.hidden = !inside;
      if (inside) r.node.style.top = `${((now - r.visStart) / 3.6e6) * hourPx}px`;
    }
  }

  function chip(o, allDay) {
    const c = el('div', 'chip');
    c.style.setProperty('--ev-color', o.color);
    if (allDay) c.classList.add('allday');
    else c.appendChild(el('span', 't', fmt.time.format(o.start)));
    c.appendChild(document.createTextNode(o.title));
    if (o.end <= new Date()) c.classList.add('past');
    if (o.declined) c.classList.add('declined');
    c.dataset.doneId = o.doneId;
    trackHover(c, o);
    if (isDone(o)) c.classList.add('done');
    c.title = allDay ? o.title : `${timeRange(o.start, o.end)} · ${o.title}`;
    c.addEventListener('click', (ev) => { ev.stopPropagation(); showPopover(o, c); });
    return c;
  }

  function eventBlock(it, visStart, now) {
    const { o } = it;
    const top = ((it.vs - visStart.getTime()) / 3.6e6) * hourPx;
    const height = ((it.ve - it.vs) / 3.6e6) * hourPx - 2;
    const b = el('div', 'event');
    b.style.setProperty('--ev-color', o.color);
    b.style.top = `${top + 1}px`;
    b.style.height = `${height}px`;
    const w = 100 / it.cols;
    b.style.left = `calc(${it.col * w}% + 2px)`;
    b.style.width = `calc(${w}% - ${it.col === it.cols - 1 ? 6 : 3}px)`;
    if (it.clipTop) b.classList.add('clip-top');
    if (it.clipBottom) b.classList.add('clip-bottom');
    if (o.end <= now) b.classList.add('past');
    if (o.declined) b.classList.add('declined');
    b.dataset.doneId = o.doneId;
    trackHover(b, o);
    if (isDone(o)) b.classList.add('done');

    const when = timeRange(o.start, o.end);
    if (height < 36) {
      b.classList.add('short');
      b.appendChild(el('span', 'title', o.title));
      b.appendChild(el('span', 'time', fmt.time.format(o.start)));
    } else {
      const t = el('div', 'title', o.title);
      const lines = Math.max(1, Math.floor((height - 22) / 15));
      t.style.display = '-webkit-box';
      t.style.webkitBoxOrient = 'vertical';
      t.style.webkitLineClamp = String(Math.min(lines, 3));
      b.appendChild(t);
      b.appendChild(el('div', 'time', when));
      if (o.location && height > 64) b.appendChild(el('div', 'loc', o.location));
    }
    b.title = `${when} · ${o.title}${o.location ? ' · ' + o.location : ''}`;
    b.addEventListener('click', (ev) => { ev.stopPropagation(); showPopover(o, b); });
    return b;
  }

  // ---------- popover ----------
  function linkify(parent, text) {
    const re = /(https?:\/\/[^\s<>"')\]]+)/g;
    let last = 0; let m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = el('a', null, m[1]);
      a.href = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer';
      parent.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function plainText(desc) {
    if (!/<[a-z][\s\S]*>/i.test(desc)) return desc;
    const doc = new DOMParser().parseFromString(desc.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n'), 'text/html');
    // keep hrefs visible so they can be linkified
    doc.querySelectorAll('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (href && !a.textContent.includes(href) && /^https?:/i.test(href)) a.textContent = `${a.textContent} (${href})`;
    });
    return doc.body.textContent || '';
  }

  function whenText(o) {
    if (o.allDay) {
      const lastDay = addDays(o.end, -1);
      return sameDay(o.start, lastDay) ? `${fmt.medDay.format(o.start)} · All day` : `${fmt.monthDay.format(o.start)} – ${fmt.monthDay.format(lastDay)} · All day`;
    }
    if (o.end - o.start < DAY_MS) return `${fmt.medDay.format(o.start)} · ${timeRange(o.start, o.end)}`;
    return timeRange(o.start, o.end);
  }

  function showPopover(o, anchorEl) {
    const p = $('popover');
    p.textContent = '';
    p.style.setProperty('--ev-color', o.color);

    const close = el('button', 'btn icon p-close', '✕');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', closePopover);
    p.appendChild(close);

    const title = el('div', 'p-title');
    title.appendChild(el('span', 'dot'));
    title.appendChild(el('span', null, o.title));
    p.appendChild(title);
    p.appendChild(el('div', 'p-row', whenText(o) + (o.declined ? ' · Declined' : '')));
    if (o.location) {
      const row = el('div', 'p-row');
      row.appendChild(document.createTextNode('📍 '));
      if (/^https?:\/\//i.test(o.location)) linkify(row, o.location);
      else {
        const a = el('a', null, o.location);
        a.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.location)}`;
        a.target = '_blank'; a.rel = 'noopener noreferrer';
        row.appendChild(a);
      }
      p.appendChild(row);
    }
    p.appendChild(el('div', 'p-row', o.calName || ''));
    if (o.description) {
      const d = el('div', 'p-desc');
      linkify(d, plainText(o.description).trim());
      p.appendChild(d);
    }
    const actions = el('div', 'p-actions');
    const doneBtn = el('button', 'btn complete');
    const setDoneLabel = () => {
      const d = isDone(o);
      doneBtn.textContent = d ? '↺ Mark incomplete' : '✓ Complete';
      doneBtn.title = 'Shortcut: C';
      doneBtn.classList.toggle('is-done', d);
    };
    setDoneLabel();
    doneBtn.addEventListener('click', (ev) => { ev.stopPropagation(); toggleCompleted(o); setDoneLabel(); });
    popoverState = { o, setDoneLabel };
    actions.appendChild(doneBtn);
    const focusBtn = el('button', 'btn', '🍅 Focus on this');
    focusBtn.title = 'Start a Pomodoro focus session for this event';
    focusBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      document.dispatchEvent(new CustomEvent('pomo:focus', {
        detail: { title: o.title, doneId: o.doneId, start: o.start.getTime() },
      }));
      closePopover();
    });
    actions.appendChild(focusBtn);
    const open = el('a', 'btn primary', 'Open in Google Calendar');
    open.href = eventUrl(o); open.target = '_blank'; open.rel = 'noopener';
    open.style.textDecoration = 'none';
    actions.appendChild(open);
    p.appendChild(actions);

    p.hidden = false;
    const r = anchorEl.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.right + 8;
    if (left + pw > vw - 8) left = r.left - pw - 8;
    if (left < 8) left = Math.min(Math.max(8, r.left), vw - pw - 8);
    let top = r.top;
    if (top + ph > vh - 8) top = vh - ph - 8;
    p.style.left = `${Math.max(8, left)}px`;
    p.style.top = `${Math.max(8, top)}px`;
  }
  let popoverState = null;
  let hoveredEvent = null; // event under the mouse, for the C shortcut
  function trackHover(node, o) {
    node.addEventListener('mouseenter', () => { hoveredEvent = o; });
    node.addEventListener('mouseleave', () => { if (hoveredEvent === o) hoveredEvent = null; });
  }
  function closePopover() { $('popover').hidden = true; popoverState = null; }

  // ---------- settings dialog ----------
  function fillHourSelects() {
    const s = $('setStart'), e = $('setEnd');
    s.textContent = ''; e.textContent = '';
    for (let h = 0; h <= 23; h++) { const o = el('option', null, h === 0 ? 'Midnight' : hourLabel(h)); o.value = h; s.appendChild(o); }
    for (let h = 1; h <= 24; h++) { const o = el('option', null, hourLabel(h)); o.value = h; e.appendChild(o); }
  }

  function openSettings() {
    $('setStart').value = settings.startHour;
    $('setEnd').value = settings.endHour;
    $('setFit').checked = !!settings.fit;
    $('setWeekStart').value = settings.weekStart;
    $('setWeekends').checked = !!settings.showWeekends;
    $('setDoneSound').checked = !!settings.doneSound;
    $('setReminder').value = String(settings.reminderMin ?? 5);
    $('setAccount').value = settings.accountIndex;
    renderCalList();
    $('settingsBackdrop').hidden = false;
  }
  function closeSettings() { $('settingsBackdrop').hidden = true; }

  function renderCalList() {
    const list = $('calList');
    list.textContent = '';
    if (!settings.calendars.length) { list.appendChild(el('p', 'hint', 'No calendars yet.')); return; }
    for (const cal of settings.calendars) {
      const row = el('div', 'cal-item');
      const color = el('input');
      color.type = 'color'; color.value = cal.color; color.title = 'Color';
      color.addEventListener('input', () => { cal.color = color.value; saveSettings(); render(); });
      const on = el('input');
      on.type = 'checkbox'; on.checked = cal.enabled !== false; on.title = 'Show this calendar';
      on.addEventListener('change', () => { cal.enabled = on.checked; saveSettings(); render(); if (on.checked && !models.has(cal.id)) refreshAll(); });
      const name = el('input', 'name');
      name.value = cal.name || 'Calendar';
      name.addEventListener('change', () => { cal.name = name.value.trim() || 'Calendar'; cal.nameAuto = false; saveSettings(); render(); });
      const m = meta.get(cal.id) || {};
      const info = el('span', 'meta', m.error ? '⚠ error' : (models.has(cal.id) ? `${models.get(cal.id).count} events` : 'not loaded'));
      if (m.error) info.title = m.error;
      const del = el('button', 'btn danger', 'Remove');
      del.addEventListener('click', async () => {
        if (!confirm(`Remove “${cal.name}” from this view? (Your Google Calendar isn't affected.)`)) return;
        settings.calendars = settings.calendars.filter((c) => c.id !== cal.id);
        models.delete(cal.id); meta.delete(cal.id);
        await store.remove(`ics_${cal.id}`);
        await saveSettings();
        renderCalList(); render();
      });
      row.append(on, color, name, info, del);
      list.appendChild(row);
    }
  }

  function validateUrl(raw) {
    let u;
    try { u = new URL(raw.trim().replace(/^webcal:/i, 'https:')); } catch { return { error: "That doesn't look like a link." }; }
    if (u.hostname !== 'calendar.google.com') return { error: 'Only Google Calendar iCal links (calendar.google.com) are supported.' };
    if (!/\.ics$/i.test(u.pathname)) return { error: 'Use the “Secret address in iCal format” — it ends in .ics.' };
    return { url: u.toString() };
  }

  async function addCalendar(raw) {
    const v = validateUrl(raw);
    if (v.error) { alert(v.error); return false; }
    if (settings.calendars.some((c) => c.url === v.url)) { alert('That calendar is already added.'); return false; }
    const cal = {
      id: Math.random().toString(36).slice(2, 10),
      url: v.url,
      name: 'Calendar',
      nameAuto: true,
      color: PALETTE[settings.calendars.length % PALETTE.length],
      enabled: true,
    };
    settings.calendars.push(cal);
    await saveSettings();
    render();
    await refreshAll();
    return true;
  }

  // ---------- navigation ----------
  function move(dir) {
    anchor = addDays(anchor, dir * (settings.view === 'day' ? 1 : 7));
    render();
  }
  function setView(v) { settings.view = v; saveSettings(); render(); }

  // ---------- wire up ----------
  function bind() {
    $('btnToday').addEventListener('click', () => { anchor = startOfDay(new Date()); render(); });
    $('btnPrev').addEventListener('click', () => move(-1));
    $('btnNext').addEventListener('click', () => move(1));
    $('btnDay').addEventListener('click', () => setView('day'));
    $('btnWeek').addEventListener('click', () => setView('week'));
    $('btnRefresh').addEventListener('click', () => refreshAll());
    $('btnNew').addEventListener('click', () => window.open(createUrl(), '_blank', 'noopener'));
    $('btnSettings').addEventListener('click', openSettings);
    $('btnCloseSettings').addEventListener('click', closeSettings);
    $('btnSaveSettings').addEventListener('click', closeSettings);
    $('settingsBackdrop').addEventListener('click', (e) => { if (e.target === $('settingsBackdrop')) closeSettings(); });

    $('setStart').addEventListener('change', () => {
      settings.startHour = Number($('setStart').value);
      if (settings.endHour <= settings.startHour) { settings.endHour = settings.startHour + 1; $('setEnd').value = settings.endHour; }
      saveSettings(); render();
    });
    $('setEnd').addEventListener('change', () => {
      settings.endHour = Number($('setEnd').value);
      if (settings.endHour <= settings.startHour) { settings.startHour = settings.endHour - 1; $('setStart').value = settings.startHour; }
      saveSettings(); render();
    });
    $('setFit').addEventListener('change', () => { settings.fit = $('setFit').checked; saveSettings(); render(); });
    $('setWeekStart').addEventListener('change', () => { settings.weekStart = Number($('setWeekStart').value); saveSettings(); render(); });
    $('setWeekends').addEventListener('change', () => { settings.showWeekends = $('setWeekends').checked; saveSettings(); render(); });
    $('setReminder').addEventListener('change', () => {
      settings.reminderMin = Number($('setReminder').value);
      saveSettings(); scheduleReminders();
    });
    $('nextUp').addEventListener('click', (e) => {
      e.stopPropagation();
      if (upcomingTarget) showPopover(upcomingTarget, $('nextUp'));
    });
    $('setDoneSound').addEventListener('change', () => {
      settings.doneSound = $('setDoneSound').checked; saveSettings();
      if (settings.doneSound) celebrate();
    });
    $('setAccount').addEventListener('change', () => { settings.accountIndex = Math.max(0, Number($('setAccount').value) || 0); saveSettings(); });

    $('addCalForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await addCalendar($('addCalUrl').value)) $('addCalUrl').value = '';
    });
    $('welcomeForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (await addCalendar($('welcomeUrl').value)) $('welcomeUrl').value = '';
    });

    document.addEventListener('click', (e) => {
      const p = $('popover');
      if (!p.hidden && !p.contains(e.target)) closePopover();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePopover(); closeSettings(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest('input, select, textarea') || !$('settingsBackdrop').hidden) return;
      const k = e.key.toLowerCase();
      if (k === 'c') {
        // Popup open → that event; otherwise the event under the mouse.
        const target = popoverState && !$('popover').hidden ? popoverState.o : hoveredEvent;
        if (!target) return;
        toggleCompleted(target);
        if (popoverState && popoverState.o.doneId === target.doneId) popoverState.setDoneLabel();
        e.preventDefault();
        return;
      }
      if (k === 't') { anchor = startOfDay(new Date()); render(); }
      else if (k === 'arrowleft' || k === 'k' || k === 'p') move(-1);
      else if (k === 'arrowright' || k === 'j' || k === 'n') move(1);
      else if (k === 'd' || k === '1') setView('day');
      else if (k === 'w' || k === '7') setView('week');
      else if (k === 'r') refreshAll();
      else return;
      e.preventDefault();
    });

    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(render, 120); });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Date.now() - lastFetch > 2 * 60e3) refreshAll();
    });
    setInterval(() => {
      if (startOfDay(new Date()).getTime() !== renderedDay) render();
      else { positionNowLines(); updateStatus(); updateUpcoming(); }
    }, 60e3);
    setInterval(() => { if (!document.hidden) refreshAll(); }, REFRESH_MS);
  }

  (async function init() {
    fillHourSelects();
    bind();
    await loadSettings();
    await loadCompleted();
    await loadCached();
    render();
    if (syncArea && chrome.storage.onChanged) {
      let st;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || writingSync) return;
        if (!Object.keys(changes).some((k) => k.startsWith(DONE_PREFIX))) return;
        clearTimeout(st);
        st = setTimeout(async () => {
          await loadCompleted();
          refreshDoneMarks(null);
          if (popoverState) popoverState.setDoneLabel();
        }, 200);
      });
    }
    if (settings.calendars.length) refreshAll();
  })();
})();
