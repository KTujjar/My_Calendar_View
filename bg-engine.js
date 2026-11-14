'use strict';
/* Animated theme backgrounds. Draws into a fixed full-screen canvas behind the
   app. Soft effects (gradients, aurora, waves) render at low resolution and are
   scaled up by CSS, which blurs them for free; particle effects render sharp.
   Pauses automatically when the tab is hidden (requestAnimationFrame) and draws
   a single still frame when the OS asks for reduced motion. */
(() => {
  const TYPES = {
    none: { name: 'None' },
    gradient: { name: 'Flowing gradient', soft: true },
    aurora: { name: 'Aurora', soft: true },
    waves: { name: 'Waves', soft: 0.5 },
    stars: { name: 'Starfield' },
    snow: { name: 'Snowfall' },
    rain: { name: 'Rain' },
    bubbles: { name: 'Bubbles' },
    fireflies: { name: 'Fireflies' },
    shapes: { name: 'Floating shapes' },
    media: { name: 'My image / GIF / video' },
  };

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function rgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    const n = m ? parseInt(m[1], 16) : 0x888888;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };
  function mixHex(a, b, t) {
    const x = rgb(a), y = rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  let layer, canvas, ctx, raf = 0, last = 0, t = 0;
  let cfg = null;      // {type, colors[3], speed, density, base, dark}
  let W = 0, H = 0, scale = 1;
  let st = null;       // per-type state

  function ensureLayer() {
    if (layer) return;
    layer = document.createElement('div');
    layer.className = 'theme-bg';
    layer.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    layer.appendChild(canvas);
    const dim = document.createElement('div');
    dim.className = 'theme-dim';
    layer.appendChild(dim);
    document.body.prepend(layer);
    ctx = canvas.getContext('2d');
    let rt;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (cfg) { resize(); init(); } }, 150); });
  }

  function resize() {
    const t0 = TYPES[cfg.type] || {};
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    scale = t0.soft === true ? 0.2 : (t0.soft ? t0.soft : dpr);
    W = Math.max(1, Math.round(window.innerWidth * scale));
    H = Math.max(1, Math.round(window.innerHeight * scale));
    canvas.width = W; canvas.height = H;
  }

  // Number of particles scales with screen area and the density setting.
  const count = (base) => Math.max(4, Math.round(base * cfg.density * (window.innerWidth * window.innerHeight) / (1440 * 900)));

  function init() {
    const c = cfg.colors;
    const s = scale;
    switch (cfg.type) {
      case 'stars': {
        st = { stars: [], shooting: null, nextShoot: rand(2, 6) };
        for (let i = 0; i < count(260); i++) {
          st.stars.push({ x: rand(0, W), y: rand(0, H), z: Math.pow(Math.random(), 2.2), ph: rand(0, 6.28), tw: rand(0.6, 2.2), col: pick(c) });
        }
        break;
      }
      case 'snow': {
        st = [];
        for (let i = 0; i < count(170); i++) st.push(flake(true));
        break;
      }
      case 'rain': {
        st = [];
        for (let i = 0; i < count(220); i++) st.push(drop(true));
        break;
      }
      case 'bubbles': {
        st = [];
        for (let i = 0; i < count(38); i++) st.push(bubble(true));
        break;
      }
      case 'fireflies': {
        st = [];
        for (let i = 0; i < count(70); i++) {
          st.push({ x: rand(0, W), y: rand(0, H), a: rand(0, 6.28), v: rand(10, 28) * s, ph: rand(0, 6.28), r: rand(1.6, 3.2) * s, col: pick(c) });
        }
        break;
      }
      case 'shapes': {
        st = [];
        for (let i = 0; i < count(22); i++) {
          st.push({
            x: rand(0, W), y: rand(0, H), size: rand(18, 70) * s, rot: rand(0, 6.28), vr: rand(-0.25, 0.25),
            vx: rand(-12, 12) * s, vy: rand(-12, 12) * s, kind: pick(['tri', 'square', 'circle', 'ring', 'plus']), col: pick(c),
          });
        }
        break;
      }
      default: st = null;
    }
  }
  function flake(anywhere) {
    const s = scale, r = rand(0.8, 3.6) * s;
    return { x: rand(0, W), y: anywhere ? rand(0, H) : rand(-20, -4) * s, r, vy: (12 + r / s * 14) * s, ph: rand(0, 6.28), sw: rand(8, 26) * s, col: pick(cfg.colors) };
  }
  function drop(anywhere) {
    const s = scale, len = rand(12, 30) * s;
    return { x: rand(-0.2 * W, W * 1.1), y: anywhere ? rand(0, H) : rand(-60, -10) * s, len, vy: rand(550, 900) * s, col: pick(cfg.colors) };
  }
  function bubble(anywhere) {
    const s = scale, r = rand(6, 42) * s;
    return { x: rand(0, W), y: anywhere ? rand(0, H) : H + r + rand(0, 40) * s, r, vy: rand(14, 42) * s, ph: rand(0, 6.28), col: pick(cfg.colors) };
  }

  function paintBase() {
    // Base: gentle vertical gradient from the theme background towards colour 1.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, cfg.base);
    g.addColorStop(1, mixHex(cfg.base, cfg.colors[0], cfg.dark ? 0.12 : 0.08));
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function frame(dt) {
    const sp = cfg.speed;
    t += dt * sp;
    const c = cfg.colors;
    paintBase();
    const glow = cfg.dark ? 'lighter' : 'source-over';
    switch (cfg.type) {
      case 'gradient': {
        ctx.globalCompositeOperation = glow;
        const R = Math.max(W, H) * 0.75;
        c.forEach((col, i) => {
          const x = W * (0.5 + 0.38 * Math.cos(t * 0.11 + i * 2.1));
          const y = H * (0.5 + 0.38 * Math.sin(t * 0.09 + i * 1.7));
          const g = ctx.createRadialGradient(x, y, 0, x, y, R);
          g.addColorStop(0, rgba(col, cfg.dark ? 0.55 : 0.5));
          g.addColorStop(1, rgba(col, 0));
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        });
        break;
      }
      case 'aurora': {
        ctx.globalCompositeOperation = glow;
        ctx.lineCap = 'round';
        c.forEach((col, i) => {
          const baseY = H * (0.22 + i * 0.12);
          for (const [w, a] of [[0.22, 0.10], [0.13, 0.16], [0.06, 0.24]]) {
            ctx.beginPath();
            for (let x = -10; x <= W + 10; x += 3) {
              const y = baseY
                + Math.sin(x * 0.012 / scale * 0.2 + t * 0.35 + i * 1.3) * H * 0.09
                + Math.sin(x * 0.03 / scale * 0.2 - t * 0.22 + i) * H * 0.035;
              x === -10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = rgba(col, a * (cfg.dark ? 1 : 0.8));
            ctx.lineWidth = H * w;
            ctx.stroke();
          }
        });
        break;
      }
      case 'waves': {
        ctx.globalCompositeOperation = 'source-over';
        const layers = 4;
        for (let i = 0; i < layers; i++) {
          const col = c[i % c.length];
          const y0 = H * (0.58 + i * 0.1);
          const amp = H * (0.035 - i * 0.004);
          const k = (0.006 + i * 0.0025) / scale;
          ctx.beginPath();
          ctx.moveTo(0, H);
          for (let x = 0; x <= W + 4; x += 4) {
            ctx.lineTo(x, y0 + Math.sin(x * k + t * (0.6 + i * 0.25) + i * 2) * amp + Math.sin(x * k * 2.3 - t * 0.4) * amp * 0.35);
          }
          ctx.lineTo(W, H);
          ctx.closePath();
          ctx.fillStyle = rgba(col, 0.28 + i * 0.12);
          ctx.fill();
        }
        break;
      }
      case 'stars': {
        ctx.globalCompositeOperation = glow;
        for (const s of st.stars) {
          s.x -= (4 + s.z * 22) * scale * dt * sp;
          s.y += (1 + s.z * 4) * scale * dt * sp;
          if (s.x < -2) s.x += W + 4;
          if (s.y > H + 2) s.y -= H + 4;
          const a = (0.35 + s.z * 0.65) * (0.65 + 0.35 * Math.sin(t * s.tw + s.ph));
          ctx.fillStyle = rgba(s.col, a);
          ctx.beginPath();
          ctx.arc(s.x, s.y, (0.7 + s.z * 2.1) * scale, 0, 6.283);
          ctx.fill();
        }
        st.nextShoot -= dt * sp;
        if (st.nextShoot <= 0 && !st.shooting) {
          st.shooting = { x: rand(W * 0.3, W * 1.1), y: rand(-20, H * 0.4), life: 0 };
          st.nextShoot = rand(4, 10);
        }
        if (st.shooting) {
          const sh = st.shooting;
          sh.life += dt * sp;
          const p = sh.life / 0.9;
          const hx = sh.x - p * W * 0.45, hy = sh.y + p * H * 0.3;
          const g = ctx.createLinearGradient(hx, hy, hx + 90 * scale, hy - 60 * scale);
          g.addColorStop(0, rgba(c[0], 0.9 * (1 - p)));
          g.addColorStop(1, rgba(c[0], 0));
          ctx.strokeStyle = g; ctx.lineWidth = 1.6 * scale;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 90 * scale, hy - 60 * scale); ctx.stroke();
          if (p >= 1) st.shooting = null;
        }
        break;
      }
      case 'snow': {
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < st.length; i++) {
          const f = st[i];
          f.y += f.vy * dt * sp;
          const x = f.x + Math.sin(t * 0.8 + f.ph) * f.sw;
          if (f.y > H + 6) { st[i] = flake(false); continue; }
          ctx.fillStyle = rgba(f.col, cfg.dark ? 0.85 : 0.95);
          ctx.beginPath(); ctx.arc(x, f.y, f.r, 0, 6.283); ctx.fill();
        }
        break;
      }
      case 'rain': {
        ctx.globalCompositeOperation = glow;
        ctx.lineCap = 'round';
        ctx.lineWidth = 1.2 * scale;
        for (let i = 0; i < st.length; i++) {
          const d = st[i];
          d.y += d.vy * dt * sp;
          d.x -= d.vy * 0.22 * dt * sp;
          if (d.y > H + d.len) { st[i] = drop(false); continue; }
          ctx.strokeStyle = rgba(d.col, cfg.dark ? 0.45 : 0.55);
          ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * 0.22, d.y - d.len); ctx.stroke();
        }
        break;
      }
      case 'bubbles': {
        ctx.globalCompositeOperation = 'source-over';
        for (let i = 0; i < st.length; i++) {
          const b = st[i];
          b.y -= b.vy * dt * sp;
          const x = b.x + Math.sin(t * 0.7 + b.ph) * b.r * 0.6;
          if (b.y < -b.r - 4) { st[i] = bubble(false); continue; }
          ctx.fillStyle = rgba(b.col, 0.12);
          ctx.strokeStyle = rgba(b.col, 0.55);
          ctx.lineWidth = 1.5 * scale;
          ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 6.283); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.18, 0, 6.283); ctx.fill();
        }
        break;
      }
      case 'fireflies': {
        ctx.globalCompositeOperation = glow;
        for (const f of st) {
          f.a += rand(-1.2, 1.2) * dt * sp;
          f.x += Math.cos(f.a) * f.v * dt * sp;
          f.y += Math.sin(f.a) * f.v * dt * sp;
          if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10;
          if (f.y < -10) f.y = H + 10; if (f.y > H + 10) f.y = -10;
          const a = Math.max(0, Math.sin(t * 1.3 + f.ph)) ** 2;
          const R = f.r * 5;
          const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
          g.addColorStop(0, rgba(f.col, 0.9 * a));
          g.addColorStop(0.25, rgba(f.col, 0.35 * a));
          g.addColorStop(1, rgba(f.col, 0));
          ctx.fillStyle = g;
          ctx.fillRect(f.x - R, f.y - R, R * 2, R * 2);
        }
        break;
      }
      case 'shapes': {
        ctx.globalCompositeOperation = 'source-over';
        ctx.lineWidth = 2.5 * scale;
        ctx.lineJoin = 'round';
        for (const p of st) {
          p.x += p.vx * dt * sp; p.y += p.vy * dt * sp; p.rot += p.vr * dt * sp;
          const m = p.size;
          if (p.x < -m) p.x = W + m; if (p.x > W + m) p.x = -m;
          if (p.y < -m) p.y = H + m; if (p.y > H + m) p.y = -m;
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.strokeStyle = rgba(p.col, 0.6);
          ctx.fillStyle = rgba(p.col, 0.16);
          ctx.beginPath();
          const r = m / 2;
          if (p.kind === 'tri') { ctx.moveTo(0, -r); ctx.lineTo(r * 0.87, r * 0.5); ctx.lineTo(-r * 0.87, r * 0.5); ctx.closePath(); }
          else if (p.kind === 'square') ctx.rect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
          else if (p.kind === 'plus') { const w = r * 0.32; ctx.rect(-w, -r, w * 2, r * 2); ctx.rect(-r, -w, r * 2, w * 2); }
          else ctx.arc(0, 0, r * 0.8, 0, 6.283);
          if (p.kind !== 'ring' && p.kind !== 'plus') ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        break;
      }
      default: break;
    }
  }

  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(now) {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    frame(dt);
    raf = requestAnimationFrame(loop);
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; last = 0; }

  window.ThemeBG = {
    TYPES,
    /* config: {type, colors:[hex,hex,hex], speed, density, base(hex), dark(bool)} or null */
    set(config) {
      ensureLayer();
      stop();
      cfg = config && config.type && config.type !== 'none' && config.type !== 'media' ? {
        type: config.type,
        colors: (config.colors || []).slice(0, 3).concat(['#888888', '#888888', '#888888']).slice(0, 3),
        speed: Math.max(0.05, Number(config.speed) || 1),
        density: Math.max(0.1, Number(config.density) || 1),
        base: config.base || '#000000',
        dark: !!config.dark,
      } : null;
      canvas.hidden = !cfg;
      if (!cfg) return;
      resize(); init();
      if (reduced()) { t = 3; frame(0); } else raf = requestAnimationFrame(loop);
    },
    layer() { ensureLayer(); return layer; },
  };
})();
