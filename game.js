/* TEMPO — arcade de précision à un bouton + duels en ligne + boutique de skins. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utilitaires
  const TAU = Math.PI * 2;
  const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrap = (a) => ((a % TAU) + TAU) % TAU;

  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    return d;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');


  // ---------------------------------------------------------------- profil
  const PKEY = 'tempo.profile.v2';

  function defaultProfile() {
    return {
      name: '',
      points: 0,
      owned: SKINS.FREE.slice(),
      skin: SKINS.DEFAULT_ID,
      best: 0,
      bestCombo: 0,
      runs: 0,
      wins: 0,
      muted: false,
      streak: 0,
      lastDaily: ''
    };
  }

  const profile = (function load() {
    const base = defaultProfile();
    try {
      const raw = localStorage.getItem(PKEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') Object.assign(base, saved);
      }
    } catch (e) { /* stockage indisponible */ }

    if (!Array.isArray(base.owned)) base.owned = [];
    SKINS.FREE.forEach((id) => {
      if (base.owned.indexOf(id) === -1) base.owned.push(id);
    });
    base.owned = base.owned.filter((id) => !!SKINS.byId[id]);
    if (!SKINS.byId[base.skin] || base.owned.indexOf(base.skin) === -1) {
      base.skin = SKINS.DEFAULT_ID;
    }
    base.points = Math.max(0, Math.floor(Number(base.points) || 0));
    base.best = Math.max(0, Math.floor(Number(base.best) || 0));
    base.streak = Math.max(0, Math.floor(Number(base.streak) || 0));
    if (!base.name) base.name = 'Joueur' + Math.floor(rand(10, 99));
    return base;
  })();

  function saveProfile() {
    try { localStorage.setItem(PKEY, JSON.stringify(profile)); } catch (e) { /* ignoré */ }
  }

  function addPoints(n) {
    profile.points = Math.max(0, profile.points + Math.round(n));
    saveProfile();
    syncHud();
  }

  // ---------------------------------------------------------------- points quotidiens
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dayKey(d);
  }

  function dailyStatus() {
    const today = dayKey();
    if (profile.lastDaily === today) return { claimed: true, bonus: 0, streak: profile.streak };
    const streak = profile.lastDaily === yesterdayKey() ? profile.streak + 1 : 1;
    const bonus = 100 + 50 * Math.min(streak, 7);
    return { claimed: false, bonus, streak };
  }

  function claimDaily() {
    const st = dailyStatus();
    if (st.claimed) return null;
    profile.lastDaily = dayKey();
    profile.streak = st.streak;
    profile.points += st.bonus;
    saveProfile();
    syncHud();
    updateDailyLine();
    return st;
  }

  function updateDailyLine() {
    const st = dailyStatus();
    const el = $('dailyLine');
    if (!el) return;
    el.textContent = st.claimed
      ? 'Série ' + profile.streak + ' j · bonus de demain t\'attend'
      : 'Bonus du jour : +' + st.bonus + ' ◆ (série ' + st.streak + ')';
  }

  // ---------------------------------------------------------------- audio
  let AC = null;

  function audio() {
    if (window.Music) {
      const shared = Music.context();
      if (shared) return shared;
    }
    if (!AC) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { AC = new C(); } catch (e) { return null; }
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function tone(freq, dur, type, gain, target, delay) {
    if (profile.muted) return;
    const ac = audio();
    if (!ac) return;
    const t0 = ac.currentTime + (delay || 0);
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (target && target !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(24, target), t0 + dur);
    }
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain || 0.05), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const sfx = {
    hit(combo, perfect) {
      const f = 520 * Math.pow(2, Math.min(combo, 14) / 12);
      tone(f, 0.075, 'triangle', 0.045);
      if (perfect) {
        tone(f * 1.5, 0.09, 'sine', 0.04, null, 0.035);
        tone(f * 2, 0.12, 'sine', 0.028, null, 0.075);
      }
    },
    gold() {
      tone(880, 0.1, 'sine', 0.05);
      tone(1320, 0.14, 'sine', 0.042, null, 0.06);
      tone(1760, 0.16, 'sine', 0.03, null, 0.12);
    },
    miss() {
      tone(180, 0.26, 'sawtooth', 0.055, 62);
      tone(90, 0.3, 'square', 0.03, 44, 0.02);
    },
    level() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.04, null, i * 0.055));
    },
    flip() { tone(720, 0.07, 'sine', 0.03, 420); },
    start() {
      tone(330, 0.09, 'triangle', 0.04);
      tone(660, 0.14, 'triangle', 0.04, null, 0.08);
    },
    over() {
      tone(240, 0.5, 'sawtooth', 0.05, 55);
      tone(120, 0.7, 'sine', 0.04, 40, 0.05);
    },
    coin() {
      tone(988, 0.09, 'triangle', 0.04);
      tone(1319, 0.16, 'triangle', 0.035, null, 0.07);
    },
    win() {
      [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.18, 'triangle', 0.045, null, i * 0.09));
    }
  };

  // ---------------------------------------------------------------- DOM
  const $ = (id) => document.getElementById(id);

  const cvs = $('game');
  const ctx = cvs.getContext('2d');
  const overlay = $('overlay');
  const livesEl = $('lives');
  const pointsPill = $('pointsPill');
  const recordPill = $('recordPill');
  const muteBtn = $('mute');
  const toastEl = $('toast');

  const PANELS = ['homePanel', 'shopPanel', 'rhythmPanel', 'onlinePanel', 'roomPanel', 'overPanel'].map($);

  function showPanel(id) {
    PANELS.forEach((p) => p.classList.toggle('hidden', p.id !== id));
    overlay.classList.remove('is-hidden');
  }

  function hideOverlay() { overlay.classList.add('is-hidden'); }

  function isOverlayVisible() { return !overlay.classList.contains('is-hidden'); }

  let toastTimer = null;
  function toast(msg, gold) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.toggle('gold', !!gold);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------- canvas
  let W = 0, H = 0, DPR = 1, cx = 0, cy = 0, R = 200;
  let bgGrad = null;
  let stars = [];

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    cvs.width = Math.round(W * DPR);
    cvs.height = Math.round(H * DPR);
    cvs.style.width = W + 'px';
    cvs.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx = W / 2;
    cy = H / 2 + (H > 620 ? H * 0.012 : 0);
    R = clamp(Math.min(W, H) * 0.325, 80, 254);

    bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.72);
    bgGrad.addColorStop(0, '#0d1826');
    bgGrad.addColorStop(0.55, '#070b13');
    bgGrad.addColorStop(1, '#04060a');

    stars = [];
    const n = Math.round(clamp((W * H) / 22000, 26, 90));
    for (let i = 0; i < n; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: rand(0.6, 1.7),
        p: Math.random() * TAU,
        s: rand(0.4, 1.3)
      });
    }
  }

  // ---------------------------------------------------------------- état
  const G = {
    rule: 'arcade',      // arcade | rhythm
    mode: 'solo',        // solo | online
    screen: 'menu',      // menu | countdown | play | dying | spectate | over
    theta: -Math.PI / 2,
    dir: 1,
    omega: 2.55,
    target: { a: 0, hw: 0.26, golden: false },
    lives: 3,
    score: 0,
    combo: 0,
    bestCombo: 0,
    hits: 0,
    perfects: 0,
    level: 1,
    cooldown: 0,
    overTimer: 0,
    startsAt: 0,
    shake: 0,
    flash: 0,
    flashColor: '92,225,255',
    pulse: 0,
    time: 0,
    rng: null,
    eliminated: false,
    beatRecord: false,
    deadAt: 0,
    particles: [],
    floats: [],
    rings: [],
    nsent: 0
  };

  const ROOM = {
    active: false,
    host: false,
    code: null,
    players: [],
    match: null,
    ended: false,
    endTimer: 0,
    lastMatch: null
  };

  const MAX_LIVES = 3;
  const HITS_PER_LEVEL = 6;

  const rng = () => (G.rng ? G.rng() : Math.random());
  const hue = () => (188 + (G.level - 1) * 13) % 360;
  const myId = () => (window.TempoOnline ? TempoOnline.myId() : 'me');
  const mySkin = () => SKINS.byId[profile.skin] || SKINS.byId[SKINS.DEFAULT_ID];

  // ---------------------------------------------------------------- effets
  function burst(x, y, color, count, speed, spread) {
    const s = speed || 240;
    for (let i = 0; i < count; i++) {
      const a = spread === undefined ? Math.random() * TAU : rand(-spread, spread);
      const v = rand(s * 0.25, s);
      G.particles.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: rand(0.35, 0.8),
        max: 0.8,
        size: rand(1.6, 4.4),
        color
      });
    }
  }

  function floatText(x, y, text, color, size) {
    G.floats.push({ x, y, text, color, size: size || 20, life: 0.95, vy: -62 });
  }

  function ringPulse(color, width) {
    G.rings.push({ r: R * 0.55, life: 0.55, max: 0.55, color, width: width || 3 });
  }

  // ---------------------------------------------------------------- rendu
  function drawStars() {
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(G.time * s.s + s.p));
      ctx.globalAlpha = tw * 0.5;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawDisc() {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.98);
    g.addColorStop(0, 'rgba(8,14,24,0.92)');
    g.addColorStop(0.72, 'rgba(7,12,21,0.55)');
    g.addColorStop(1, 'rgba(6,10,18,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.98, 0, TAU);
    ctx.fill();
  }

  function drawTicks() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU;
      const long = i % 4 === 0;
      const r0 = R + (long ? 9 : 5);
      const r1 = R + 15;
      ctx.globalAlpha = long ? 0.5 : 0.2;
      ctx.lineWidth = long ? 1.6 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTarget() {
    if (G.screen !== 'play' && G.screen !== 'countdown') return;
    const a = G.target.a;
    const hw = G.target.hw;
    const h = G.target.golden ? 44 : hue();
    const col = 'hsl(' + h + ' 100% 62%)';
    const pulse = 1 + Math.sin(G.time * 7) * 0.045;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.shadowColor = col;
    ctx.shadowBlur = 26;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.92;
    ctx.lineWidth = 17 * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a - hw, a + hw);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a - hw * 0.28, a + hw * 0.28);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrail() {
    if (G.screen === 'over') return;
    const span = 1.05;
    const accent = mySkin().colors[0] || '#5ce1ff';
    const a0 = G.dir > 0 ? G.theta - span : G.theta;
    const a1 = G.dir > 0 ? G.theta : G.theta + span;

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();

    const b0 = G.dir > 0 ? G.theta - span * 0.5 : G.theta;
    const b1 = G.dir > 0 ? G.theta : G.theta + span * 0.5;
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, b0, b1);
    ctx.stroke();
    ctx.restore();
  }

  function drawNeedle() {
    const cos = Math.cos(G.theta);
    const sin = Math.sin(G.theta);
    const accent = mySkin().colors[0] || '#5ce1ff';

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(cx + cos * (R - 16), cy + sin * (R - 16));
    ctx.lineTo(cx + cos * (R + 16), cy + sin * (R + 16));
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cx + cos * R, cy + sin * R, 5.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawCenter() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const h = hue();

    const scoreText = fmt(G.score);
    let scoreSize = Math.round(R * 0.44);
    const maxW = R * 1.34;
    ctx.font = '700 ' + scoreSize + 'px ' + MONO;
    let measured = ctx.measureText(scoreText).width;
    if (measured > maxW) {
      scoreSize = Math.max(16, Math.floor((scoreSize * maxW) / measured));
      ctx.font = '700 ' + scoreSize + 'px ' + MONO;
    }
    ctx.fillStyle = '#f2fbff';
    ctx.shadowColor = 'hsla(' + h + ' 100% 60% / 0.5)';
    ctx.shadowBlur = 22;
    ctx.fillText(scoreText, cx, cy - R * 0.08);
    ctx.shadowBlur = 0;

    if (G.combo > 1 && G.screen === 'play') {
      ctx.font = '700 ' + Math.round(R * 0.115) + 'px ' + SANS;
      ctx.fillStyle = 'hsl(' + h + ' 100% 70%)';
      ctx.fillText('COMBO ×' + G.combo, cx, cy + R * 0.28);
    }

    if (G.screen === 'play' || G.screen === 'dying' || G.screen === 'spectate') {
      ctx.font = '600 ' + Math.round(R * 0.085) + 'px ' + SANS;
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fillText('NIVEAU ' + G.level, cx, cy + R * 0.5);
    }
    ctx.restore();
  }

  function drawCountdown() {
    const remaining = G.startsAt - Date.now();
    const n = Math.max(1, Math.ceil(remaining / 1000));
    const frac = 1 - ((remaining % 1000) / 1000);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.25 + 0.75 * (1 - frac);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(92,225,255,0.8)';
    ctx.shadowBlur = 40;
    ctx.font = '800 ' + Math.round(R * 0.7) + 'px ' + SANS;
    ctx.fillText(String(n), cx, cy - R * 0.02);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.font = '600 ' + Math.round(R * 0.075) + 'px ' + SANS;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('PRÊT ?', cx, cy + R * 0.52);
    ctx.restore();
  }

  function drawSpectate() {
    if (G.screen !== 'spectate') return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ff8fa3';
    ctx.font = '800 ' + Math.round(R * 0.17) + 'px ' + SANS;
    ctx.fillText('ÉLIMINÉ', cx, cy - R * 0.03);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '600 ' + Math.round(R * 0.072) + 'px ' + SANS;
    ctx.fillText('LA PARTIE CONTINUE…', cx, cy + R * 0.16);
    ctx.restore();
  }

  function drawParticles() {
    for (let i = 0; i < G.particles.length; i++) {
      const p = G.particles[i];
      const t = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.35 + t * 0.65), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRings() {
    for (let i = 0; i < G.rings.length; i++) {
      const r = G.rings[i];
      const t = clamp(r.life / r.max, 0, 1);
      ctx.globalAlpha = t * 0.7;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * t + 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFloats() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < G.floats.length; i++) {
      const f = G.floats[i];
      const t = clamp(f.life / 0.95, 0, 1);
      ctx.globalAlpha = t;
      ctx.fillStyle = f.color;
      ctx.font = '800 ' + f.size + 'px ' + SANS;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function opponentList() {
    if (!ROOM.match) return [];
    return ROOM.match.roster.filter((p) => p.id !== myId());
  }

  function drawChips() {
    if (G.mode !== 'online' || !ROOM.match) return;
    const others = opponentList();
    if (!others.length) return;

    const n = others.length;
    const slot = Math.min(86, (W - 24) / n);
    const y = H - 52;
    const startX = W / 2 - (n * slot) / 2 + slot / 2;
    const small = slot < 64;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      const p = others[i];
      const st = (ROOM.match.states && ROOM.match.states[p.id]) || { lives: 3, score: 0, alive: true };
      const skin = SKINS.byId[p.skin] || SKINS.byId[SKINS.DEFAULT_ID];
      const x = startX + i * slot;
      const rad = Math.min(24, slot * 0.28);

      ctx.globalAlpha = st.alive ? 1 : 0.32;
      SKINS.ring(ctx, x, y, rad, skin, G.time, small ? 3 : 3.6);

      ctx.font = '600 ' + (small ? 8 : 9) + 'px ' + SANS;
      ctx.fillStyle = 'rgba(234,246,255,0.62)';
      const nm = p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name;
      ctx.fillText(nm, x, y - rad - 13);

      ctx.font = '700 ' + (small ? 8 : 9.5) + 'px ' + MONO;
      ctx.fillStyle = st.alive ? 'rgba(255,255,255,0.85)' : 'rgba(255,140,160,0.9)';
      ctx.fillText(st.alive ? fmt(st.score) : 'OUT', x, y + rad + 13);

      for (let k = 0; k < MAX_LIVES; k++) {
        const on = k < (st.lives || 0);
        ctx.beginPath();
        ctx.fillStyle = on ? 'rgba(126,240,255,0.95)' : 'rgba(255,255,255,0.13)';
        ctx.arc(x - 7 + k * 7, y + rad + 25, 1.9, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, W, H);
    if (bgGrad) {
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);
    }

    const sh = G.shake;
    const ox = sh > 0.001 ? (Math.random() - 0.5) * sh * 22 : 0;
    const oy = sh > 0.001 ? (Math.random() - 0.5) * sh * 22 : 0;

    if (G.rule === 'rhythm') {
      drawRhythmScene(ox, oy);
      if (G.flash > 0.001) {
        ctx.globalAlpha = clamp(G.flash, 0, 1) * 0.34;
        ctx.fillStyle = 'rgb(' + G.flashColor + ')';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      return;
    }

    ctx.save();
    ctx.translate(ox, oy);
    drawStars();
    drawDisc();
    SKINS.ring(ctx, cx, cy, R, mySkin(), G.time, 6);
    drawTicks();
    drawTarget();
    drawTrail();
    drawNeedle();
    drawRings();
    drawParticles();
    drawCenter();
    drawSpectate();
    if (G.screen === 'countdown') drawCountdown();
    drawFloats();
    ctx.restore();

    drawGhosts();

    if (G.flash > 0.001) {
      ctx.globalAlpha = clamp(G.flash, 0, 1) * 0.34;
      ctx.fillStyle = 'rgb(' + G.flashColor + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- mise à jour
  function update(dt) {
    G.time += dt;
    G.shake = Math.max(0, G.shake - dt * 2.6);
    G.flash = Math.max(0, G.flash - dt * 3.2);
    G.pulse = Math.max(0, G.pulse - dt * 4);
    G.cooldown = Math.max(0, G.cooldown - dt);

    updateGhosts(dt);

    if (G.rule === 'rhythm') {
      ryUpdate(dt);
    } else if (G.screen === 'menu') {
      G.theta = (G.theta + 1.25 * dt) % TAU;
    } else if (G.screen === 'countdown') {
      if (Date.now() >= G.startsAt) {
        G.screen = 'play';
        G.cooldown = 0.1;
      }
    } else if (G.screen === 'play') {
      G.theta += G.dir * G.omega * dt;
      if (G.theta >= TAU) G.theta -= TAU;
      else if (G.theta < 0) G.theta += TAU;
      if (G.mode === 'online') {
        G.nsent += dt;
        if (G.nsent > 0.6) { G.nsent = 0; sendState(false); }
      }
    } else if (G.screen === 'dying') {
      G.theta += G.dir * G.omega * 0.15 * dt;
      G.overTimer -= dt;
      if (G.overTimer <= 0) endSoloRun();
    }

    const drag = Math.max(0, 1 - 2.4 * dt);
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life -= dt;
      if (p.life <= 0) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy = p.vy * drag + 70 * dt;
    }

    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i];
      f.life -= dt;
      if (f.life <= 0) { G.floats.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= drag;
    }

    for (let i = G.rings.length - 1; i >= 0; i--) {
      const r = G.rings[i];
      r.life -= dt;
      if (r.life <= 0) { G.rings.splice(i, 1); continue; }
      r.r += R * 1.9 * dt;
    }

    if (G.mode === 'online') updateOnline(dt);
  }

  // ---------------------------------------------------------------- règles
  function speedForLevel(level) {
    return Math.min(7.4, 2.55 + (level - 1) * 0.30);
  }

  function widthForLevel(level, golden) {
    const base = Math.max(0.064, 0.262 - (level - 1) * 0.0105);
    return golden ? base * 0.74 : base;
  }

  function spawnTarget() {
    // Trois tirages fixes, quel que soit le chemin : la séquence reste identique
    // pour tous les joueurs en ligne.
    const goldenRoll = rng();
    const jitter = rng();
    const rawA = rng() * TAU;

    const golden = G.level >= 3 && goldenRoll < 0.10;
    let a = rawA;
    const lead = G.dir > 0 ? wrap(rawA - G.theta) : wrap(G.theta - rawA);
    if (lead < 0.95) a = wrap(G.theta + G.dir * (0.95 + jitter * 0.6));

    G.target.golden = golden;
    G.target.a = a;
    G.target.hw = widthForLevel(G.level, golden);
  }

  function resetRun() {
    G.theta = -Math.PI / 2;
    G.dir = 1;
    G.level = 1;
    G.omega = speedForLevel(1);
    G.lives = MAX_LIVES;
    G.score = 0;
    G.combo = 0;
    G.bestCombo = 0;
    G.hits = 0;
    G.perfects = 0;
    G.cooldown = 0.3;
    G.overTimer = 0;
    G.shake = 0;
    G.flash = 0;
    G.particles.length = 0;
    G.floats.length = 0;
    G.rings.length = 0;
    G.eliminated = false;
    G.beatRecord = false;
    G.deadAt = 0;
    G.nsent = 0;
    spawnTarget();
    renderLives();
  }

  function startSolo() {
    leaveRoom(true);
    if (window.Music) Music.stop();
    RHY.active = false;
    G.rule = 'arcade';
    G.mode = 'solo';
    G.rng = null;
    resetRun();
    G.screen = 'play';
    hideOverlay();
    audio();
    sfx.start();
    ringPulse('hsl(190 100% 70%)', 2);
  }

  function hit(norm) {
    const perfect = norm <= 0.30;
    const golden = G.target.golden;

    G.combo += 1;
    G.hits += 1;
    if (perfect) G.perfects += 1;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;

    const mult = Math.min(9, 1 + Math.floor(G.combo / 3));
    const base = 18 + G.level * 7;
    const gain = Math.round(base * mult * (golden ? 3 : 1) * (perfect ? 1.5 : 1));
    G.score += gain;

    if (!G.beatRecord && profile.best > 0 && G.score > profile.best) {
      G.beatRecord = true;
      G.flash = 0.42;
      G.flashColor = '255,215,106';
      floatText(cx, cy - R * 0.68, 'NOUVEAU RECORD', '#ffd76a', 20);
      tone(784, 0.12, 'triangle', 0.045);
      tone(1175, 0.16, 'triangle', 0.04, null, 0.09);
    }

    const h = golden ? 44 : hue();
    const col = 'hsl(' + h + ' 100% 68%)';
    const tx = cx + Math.cos(G.target.a) * R;
    const ty = cy + Math.sin(G.target.a) * R;

    burst(tx, ty, col, perfect ? 22 : 12, perfect ? 380 : 250, 1.1);
    ringPulse(col, perfect ? 4 : 2.5);
    G.pulse = 1;
    G.shake = Math.max(G.shake, perfect ? 0.34 : 0.16);

    const label = perfect ? 'PARFAIT' : (golden ? 'OR' : '+' + gain);
    floatText(tx, ty - 18, label, perfect ? '#ffffff' : col, perfect ? 22 : 19);

    if (golden) sfx.gold();
    else sfx.hit(G.combo, perfect);

    const nextLevel = 1 + Math.floor(G.hits / HITS_PER_LEVEL);
    if (nextLevel !== G.level) {
      G.level = nextLevel;
      G.omega = speedForLevel(G.level);
      G.flash = 0.55;
      G.flashColor = '92,225,255';
      floatText(cx, cy - R * 0.72, 'NIVEAU ' + G.level, 'hsl(190 100% 74%)', 26);
      sfx.level();
    }

    // Tirage consommé à tous les niveaux ≥ 4 : séquence identique pour tous.
    if (G.level >= 4) {
      const flip = rng();
      if (flip < 0.16) {
        G.dir *= -1;
        G.pulse = 1;
        sfx.flip();
      }
    }

    spawnTarget();
    G.cooldown = 0.06;
    if (G.mode === 'online') sendState(true);
  }

  function miss() {
    G.combo = 0;
    G.lives -= 1;
    G.shake = 1;
    G.flash = 0.85;
    G.flashColor = '255,70,95';
    G.cooldown = 0.24;

    const tx = cx + Math.cos(G.theta) * R;
    const ty = cy + Math.sin(G.theta) * R;
    burst(tx, ty, '#ff5a72', 18, 300);
    floatText(cx, cy + R * 0.78, 'RATÉ', '#ff7f92', 22);
    sfx.miss();

    // Fait revenir l'aiguille vers la cible plus vite : la pénalité est la vie,
    // pas l'attente.
    const ahead = G.dir > 0 ? wrap(G.target.a - G.theta) : wrap(G.theta - G.target.a);
    if (ahead > Math.PI) G.dir *= -1;

    renderLives();

    if (G.lives <= 0) die();
    else if (G.mode === 'online') sendState(true);
  }

  function die() {
    if (G.mode === 'online') {
      G.eliminated = true;
      G.deadAt = Date.now();
      const st = ROOM.match && ROOM.match.states[myId()];
      if (st) {
        st.alive = false;
        st.deadAt = G.deadAt;
        st.lives = 0;
        st.score = G.score;
      }
      G.screen = 'spectate';
      G.shake = 1.6;
      G.flash = 1;
      G.flashColor = '255,70,95';
      burst(cx, cy, '#ff5a72', 42, 460);
      sfx.over();
      sendState(true);
      renderLives();
      return;
    }

    G.screen = 'dying';
    G.overTimer = 0.85;
    G.shake = 1.6;
    G.flash = 1;
    G.flashColor = '255,70,95';
    burst(cx, cy, '#ff5a72', 42, 460);
    sfx.over();
    renderLives();
  }

  function press(side) {
    if (G.rule === 'rhythm') { ryPress(side || 0); return; }
    if (G.screen !== 'play' || G.cooldown > 0) return;
    if (isOverlayVisible()) return;

    const d = Math.abs(angDiff(G.theta, G.target.a));
    if (d <= G.target.hw) hit(d / G.target.hw);
    else miss();
  }

  // ---------------------------------------------------------------- fin de partie solo
  function endSoloRun() {
    if (G.screen === 'over') return;
    G.screen = 'over';

    const isRecord = G.score > profile.best;
    profile.best = Math.max(profile.best, G.score);
    profile.bestCombo = Math.max(profile.bestCombo, G.bestCombo);
    profile.runs += 1;

    const earned = Math.round(G.score / 40);
    profile.points += earned;
    saveProfile();
    syncHud();

    $('overLabel').textContent = 'Partie terminée';
    $('finalScore').textContent = fmt(G.score);
    if (isRecord && G.score > 0) {
      $('recordLine').textContent = '🏆 Nouveau record';
      $('recordLine').classList.add('new');
    } else {
      $('recordLine').textContent = 'Record : ' + fmt(profile.best);
      $('recordLine').classList.remove('new');
    }

    $('finalStats').innerHTML =
      '<p class="statsText">Combo max ×' + G.bestCombo + ' · Parfaits ' + G.perfects + ' · Niveau ' + G.level + '</p>' +
      '<p class="earned">+' + fmt(earned) + ' ◆</p>';

    $('retryBtn').textContent = 'Rejouer';
    $('retryBtn').disabled = false;
    $('homeBtn').classList.remove('hidden');
    $('overHint').textContent = 'Espace pour rejouer';

    showPanel('overPanel');
    setTimeout(updateDailyLine, 10);
  }

  // ---------------------------------------------------------------- en ligne
  function sendState(force) {
    if (!ROOM.active || !ROOM.match) return;
    const mirror = ROOM.match.states[myId()];
    if (mirror) {
      mirror.lives = G.lives;
      mirror.score = G.score;
      mirror.alive = !G.eliminated;
      mirror.deadAt = G.deadAt || 0;
    }
    TempoOnline.send('state', {
      id: myId(),
      lives: G.lives,
      score: G.score,
      alive: !G.eliminated,
      deadAt: G.deadAt || 0,
      theta: G.rule === 'rhythm' ? ryTheta() : G.theta
    });
    if (force) G.nsent = 0;
  }

  function renderRoom() {
    const list = ROOM.players;
    const ul = $('playerList');
    if (!ul) return;

    if (!list.length) {
      ul.innerHTML = '<li class="pEmpty">Personne pour l\'instant…</li>';
    } else {
      ul.innerHTML = list.map((p) => {
        const skin = SKINS.byId[p.skin] || SKINS.byId[SKINS.DEFAULT_ID];
        const self = p.id === myId();
        return '<li class="playerRow' + (self ? ' self' : '') + '">' +
          '<span class="swatch" style="' + SKINS.swatch(skin) + '"><i></i></span>' +
          '<span class="playerName">' + escapeHtml(p.name) + (self ? ' (toi)' : '') + '</span>' +
          (p.isHost ? '<span class="playerTag">Hôte</span>' : '') +
          '</li>';
      }).join('');
    }

    $('roomCode').textContent = ROOM.code || 'SALON';

    const canStart = ROOM.host && list.length >= 2 && list.length <= 5;
    const btn = $('startMatchBtn');
    btn.disabled = !canStart;
    const what = roomMode === 'rhythm' ? 'Lancer le morceau' : 'Lancer la partie';
    btn.textContent = ROOM.host ? (list.length < 2 ? 'En attente de joueurs' : what) : 'En attente de l\'hôte';
    renderRoomSettings();

    let status;
    if (!ROOM.active) status = 'Déconnecté.';
    else if (list.length >= 2) status = list.length + ' joueurs · prêts ?';
    else status = 'En attente d\'un deuxième joueur…';
    if (ROOM.ended && ROOM.host) status = 'Partie terminée · relance quand tu veux';
    $('roomStatus').textContent = status;

    $('roomHint').textContent = list.length >= 5
      ? 'Salon complet (5 joueurs max).'
      : 'Partage le code ' + (ROOM.code || '') + ' à tes potes.';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function setOnlineStatus(text, isError) {
    const el = $('onlineHint');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('errorText', !!isError);
  }

  function createRoom() {
    audio();
    if (!TempoOnline.available()) {
      setOnlineStatus('Réseau indisponible : recharge la page.', true);
      return;
    }
    const name = ($('nameInput').value || profile.name).trim().slice(0, 14) || profile.name;
    profile.name = name;
    saveProfile();
    setOnlineStatus('Création du salon…', false);

    TempoOnline.createRoom({ name, skin: profile.skin }).then((code) => {
      ROOM.active = true;
      ROOM.code = code;
      ROOM.host = true;
      ROOM.players = TempoOnline.state.players;
      ROOM.match = null;
      ROOM.ended = false;
      showPanel('roomPanel');
      renderRoom();
    }).catch(() => {
      ROOM.active = false;
      setOnlineStatus(TempoOnline.state.error || 'Connexion impossible.', true);
    });
  }

  function joinRoom() {
    audio();
    if (!TempoOnline.available()) {
      setOnlineStatus('Réseau indisponible : recharge la page.', true);
      return;
    }
    const code = ($('codeInput').value || '').trim().toUpperCase();
    if (code.length !== 5) {
      setOnlineStatus('Le code doit faire 5 caractères.', true);
      return;
    }
    const name = ($('nameInput').value || profile.name).trim().slice(0, 14) || profile.name;
    profile.name = name;
    saveProfile();
    setOnlineStatus('Connexion au salon ' + code + '…', false);

    TempoOnline.joinRoom(code, { name, skin: profile.skin }).then(() => {
      ROOM.active = true;
      ROOM.code = code;
      ROOM.host = false;
      ROOM.players = TempoOnline.state.players;
      ROOM.match = null;
      ROOM.ended = false;
      showPanel('roomPanel');
      renderRoom();
    }).catch(() => {
      ROOM.active = false;
      setOnlineStatus(TempoOnline.state.error || 'Salon introuvable.', true);
    });
  }

  function leaveRoom(silent) {
    if (ROOM.active && TempoOnline.available()) TempoOnline.leave();
    ROOM.active = false;
    ROOM.host = false;
    ROOM.code = null;
    ROOM.players = [];
    ROOM.match = null;
    ROOM.ended = false;
    ROOM.endTimer = 0;
    if (!silent) {
      G.mode = 'solo';
      G.screen = 'menu';
      G.rng = null;
      showPanel('homePanel');
    }
  }

  function hostStartMatch() {
    if (!ROOM.active) return;
    const roster = ROOM.players.slice(0, 5).map((p) => ({ id: p.id, name: p.name, skin: p.skin }));
    if (!roster.some((p) => p.id === myId())) {
      roster.unshift({ id: myId(), name: profile.name, skin: profile.skin });
    }
    if (roster.length < 2) { toast('Il faut au moins 2 joueurs'); return; }

    const common = {
      seed: Math.floor(Math.random() * 2147483647) + 1,
      startsAt: Date.now() + 2800,
      round: Date.now(),
      roster
    };

    if (roomMode === 'rhythm') {
      const spotifyWanted = roomTrackId === 'spotify' && !!RHY.spotifyTrack && TempoSpotify.loggedIn();
      const builtin = Music.byId(roomTrackId) || Music.tracks[0];
      const bpm = spotifyWanted ? spotifyBpm() : builtin.bpm;
      const bars = spotifyWanted
        ? Math.max(8, Math.floor(((RHY.spotifyTrack.duration || 180) * bpm) / 240))
        : builtin.bars;

      const payload = Object.assign({}, common, {
        kind: 'rhythm',
        trackId: spotifyWanted ? 'spotify' : builtin.id,
        trackName: spotifyWanted ? RHY.spotifyTrack.name : builtin.name,
        bpm: bpm,
        bars: bars,
        bots: roomBots,
        skill: botSkill,
        spotifyUri: spotifyWanted ? RHY.spotifyTrack.uri : null,
        spotifyDuration: spotifyWanted ? RHY.spotifyTrack.duration : 0
      });

      TempoOnline.send('start', payload);
      beginOnlineRhythm(payload);
      return;
    }

    TempoOnline.send('start', Object.assign({}, common, { kind: 'arcade' }));
    beginOnlineMatch(common);
  }

  function beginOnlineRhythm(payload) {
    if (!payload || !payload.roster || payload.roster.length < 2) return;

    ROOM.match = {
      seed: payload.seed,
      round: payload.round,
      roster: payload.roster.slice(0, 5),
      states: {},
      startAt: payload.startsAt,
      rhythm: true
    };
    ROOM.match.roster.forEach((p) => {
      ROOM.match.states[p.id] = { lives: MAX_LIVES, score: 0, alive: true, deadAt: 0 };
    });
    ROOM.ended = false;
    ROOM.endTimer = 0;

    const spotifyOk = !!payload.spotifyUri && TempoSpotify.loggedIn();
    const track = spotifyOk
      ? Music.customTrack(payload.bpm, payload.bars, payload.trackName || 'Spotify')
      : (Music.byId(payload.trackId) || Music.customTrack(payload.bpm, payload.bars, payload.trackName || 'Tempo'));

    rySetup({
      track: track,
      bpm: payload.bpm,
      bars: payload.bars,
      seed: payload.seed,
      startsAt: payload.startsAt,
      botCount: payload.bots | 0,
      skill: payload.skill === undefined ? botSkill : payload.skill,
      online: true,
      spotify: spotifyOk,
      spotifyTrack: spotifyOk
        ? { uri: payload.spotifyUri, duration: payload.spotifyDuration || 180, name: payload.trackName }
        : null
    });

    if (spotifyOk) {
      TempoSpotify.loadTrack(payload.spotifyUri)
        .then(() => TempoSpotify.play(0))
        .catch((e) => toast('Spotify : ' + e.message, true));
    } else if (payload.spotifyUri) {
      toast('Spotify indisponible ici : musique synthétisée à la place', true);
    }
  }

  function applyRoomSettings(s) {
    if (!s) return;
    if (s.mode === 'rhythm' || s.mode === 'arcade') roomMode = s.mode;
    if (s.trackId) roomTrackId = s.trackId;
    if (s.bots !== undefined) roomBots = clamp(s.bots | 0, 0, 3);
    renderRoomSettings();
    renderRoom();
  }

  function pushRoomSettings() {
    if (!ROOM.active) return;
    TempoOnline.send('settings', { mode: roomMode, trackId: roomTrackId, bots: roomBots });
  }

  function beginOnlineMatch(payload) {
    if (!payload || !payload.roster || payload.roster.length < 2) return;
    G.rule = 'arcade';
    Music.stop();

    const roster = payload.roster.slice(0, 5);
    if (!roster.some((p) => p.id === myId())) {
      roster.push({ id: myId(), name: profile.name, skin: profile.skin });
    }

    ROOM.match = {
      seed: payload.seed,
      round: payload.round,
      roster: roster,
      states: {},
      startAt: payload.startsAt
    };
    ROOM.match.roster.forEach((p) => {
      ROOM.match.states[p.id] = { lives: MAX_LIVES, score: 0, alive: true, deadAt: 0 };
    });
    ROOM.ended = false;
    ROOM.endTimer = 0;
    ROOM.lastMatch = 'online';

    G.mode = 'online';
    G.rng = mulberry32(payload.seed);
    resetRun();
    G.screen = 'countdown';
    G.startsAt = payload.startsAt;
    hideOverlay();
    audio();
    toast('Duel lancé : ' + ROOM.match.roster.length + ' joueurs', true);
  }

  function onOnlineEvent(msg) {
    if (!msg) return;
    const p = msg.payload || {};

    if (msg.event === 'start') {
      if (!ROOM.active) return;
      if (p.kind === 'rhythm') beginOnlineRhythm(p);
      else beginOnlineMatch(p);
      return;
    }

    if (msg.event === 'settings') {
      applyRoomSettings(p);
      return;
    }

    if (msg.event === 'state') {
      if (!ROOM.match || !p.id) return;
      const known = ROOM.match.roster.some((r) => r.id === p.id);
      if (!known) return;
      const st = ROOM.match.states[p.id] || (ROOM.match.states[p.id] = { lives: 3, score: 0, alive: true, deadAt: 0 });
      st.lives = Math.max(0, Math.min(MAX_LIVES, p.lives | 0));
      st.score = Math.max(0, p.score | 0);
      st.alive = !!p.alive;
      st.deadAt = p.deadAt || 0;
      st.theta = typeof p.theta === 'number' ? p.theta : st.theta;
      return;
    }

    if (msg.event === 'bye') {
      if (ROOM.match && p.id && ROOM.match.states[p.id]) {
        const st = ROOM.match.states[p.id];
        if (st.alive) { st.alive = false; st.deadAt = Date.now(); }
      }
    }
  }

  function updateOnline(dt) {
    if (!ROOM.active) return;

    if (ROOM.match && !ROOM.ended && G.screen !== 'over' && G.rule !== 'rhythm') {
      // Déconnexions : un joueur absent depuis 4 s est éliminé.
      const present = {};
      ROOM.players.forEach((p) => { present[p.id] = true; });
      ROOM.match.roster.forEach((p) => {
        if (present[p.id]) { p.lastSeen = Date.now(); return; }
        if (!p.lastSeen) p.lastSeen = Date.now();
        const st = ROOM.match.states[p.id];
        if (st && st.alive && Date.now() - p.lastSeen > 4000) {
          st.alive = false;
          st.deadAt = Date.now();
        }
      });

      let alive = 0;
      ROOM.match.roster.forEach((p) => {
        const st = ROOM.match.states[p.id];
        if (!st || st.alive) alive += 1;
      });

      const running = G.screen === 'play' || G.screen === 'spectate';
      const tooLong = Date.now() - ROOM.match.startAt > 240000;

      if (running && (alive <= 1 || tooLong)) {
        ROOM.endTimer += dt;
        if (ROOM.endTimer > 1.1) finishOnlineMatch();
      } else {
        ROOM.endTimer = 0;
      }
    }
  }

  function finishOnlineMatch() {
    if (ROOM.ended || !ROOM.match) return;
    ROOM.ended = true;
    G.screen = 'over';

    const rows = ROOM.match.roster.map((p) => {
      const st = ROOM.match.states[p.id] || { lives: 0, score: 0, alive: false, deadAt: 0 };
      return {
        id: p.id,
        name: p.name,
        skin: p.skin,
        score: st.score,
        alive: st.alive,
        deadAt: st.deadAt
      };
    });

    const living = rows.filter((r) => r.alive).sort((a, b) => b.score - a.score);
    const dead = rows.filter((r) => !r.alive).sort((a, b) => (b.deadAt || 0) - (a.deadAt || 0));
    const ordered = living.concat(dead);

    const myIndex = ordered.findIndex((r) => r.id === myId());
    const myRank = myIndex >= 0 ? myIndex + 1 : ordered.length;
    const me = ordered[myIndex] || { score: G.score };

    let earned = 30;
    if (myRank === 1) earned = 150;
    else if (myRank === 2) earned = 75;

    if (myRank === 1) { profile.wins += 1; sfx.win(); } else { sfx.over(); }
    profile.best = Math.max(profile.best, G.score);
    profile.bestCombo = Math.max(profile.bestCombo, G.bestCombo);
    profile.runs += 1;
    profile.points += earned;
    saveProfile();
    syncHud();

    $('overLabel').textContent = myRank === 1 ? '🏆 Victoire' : (myRank === 2 ? '2ᵉ place' : myRank + 'ᵉ place');
    $('finalScore').textContent = fmt(me.score);
    $('recordLine').textContent = ordered.length + ' joueurs · ' + (myRank === 1 ? 'dernier debout' : 'éliminé');
    $('recordLine').classList.toggle('new', myRank === 1);

    $('finalStats').innerHTML = ordered.map((r, i) => {
      const skin = SKINS.byId[r.skin] || SKINS.byId[SKINS.DEFAULT_ID];
      return '<div class="resultRow' + (r.id === myId() ? ' self' : '') + (i === 0 ? ' first' : '') + '">' +
        '<span class="resultRank">' + (i + 1) + '</span>' +
        '<span class="swatch" style="' + SKINS.swatch(skin) + '"><i></i></span>' +
        '<span class="resultName">' + escapeHtml(r.name) + '</span>' +
        '<span class="resultScore">' + fmt(r.score) + '</span>' +
        '</div>';
    }).join('') + '<p class="earned">+' + fmt(earned) + ' ◆</p>';

    const btn = $('retryBtn');
    if (ROOM.host) {
      btn.textContent = 'Revanche';
      btn.disabled = false;
      $('overHint').textContent = 'Tu es l\'hôte : lance la revanche quand tu veux';
    } else {
      btn.textContent = 'En attente de l\'hôte';
      btn.disabled = true;
      $('overHint').textContent = 'L\'hôte peut relancer une partie';
    }
    $('homeBtn').classList.remove('hidden');

    showPanel('overPanel');
  }

  // ---------------------------------------------------------------- HUD
  function renderLives() {
    let html = '';
    for (let i = 0; i < MAX_LIVES; i++) {
      html += '<div class="life' + (i < G.lives ? '' : ' gone') + '"></div>';
    }
    livesEl.innerHTML = html;
  }

  function syncHud() {
    if (pointsPill) pointsPill.textContent = '◆ ' + fmt(profile.points);
    if (recordPill) recordPill.textContent = 'Record ' + fmt(profile.best);
    if ($('shopPoints')) $('shopPoints').textContent = fmt(profile.points);
  }

  function updateMuteBtn() {
    muteBtn.textContent = profile.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', profile.muted ? 'Activer le son' : 'Couper le son');
  }

  function toggleMute() {
    profile.muted = !profile.muted;
    saveProfile();
    if (window.Music) Music.setMuted(profile.muted);
    updateMuteBtn();
    if (!profile.muted) tone(660, 0.08, 'sine', 0.04);
  }

  // ---------------------------------------------------------------- boutique
  let shopTab = 'basic';

  function shopItems() {
    if (shopTab === 'basic') return SKINS.basic;
    if (shopTab === 'premium') return SKINS.premium;
    return SKINS.all.filter((s) => profile.owned.indexOf(s.id) !== -1);
  }

  function renderShop() {
    const grid = $('skinGrid');
    if (!grid) return;
    const items = shopItems();

    grid.innerHTML = items.map((skin) => {
      const owned = profile.owned.indexOf(skin.id) !== -1;
      const equipped = profile.skin === skin.id;
      const cant = !owned && profile.points < skin.price;
      const cls = 'skinCard' + (equipped ? ' equipped' : '') + (owned ? ' owned' : ' locked') + (cant ? ' cant' : '');
      const meta = equipped ? 'Équipé' : (owned ? 'Utiliser' : fmt(skin.price) + ' ◆');
      return '<button class="' + cls + '" data-id="' + skin.id + '">' +
        '<span class="swatch" style="' + SKINS.swatch(skin) + '"><i></i></span>' +
        '<span class="skinName">' + escapeHtml(skin.name) + '</span>' +
        '<span class="skinMeta">' + meta + '</span>' +
        '</button>';
    }).join('');

    $('shopPoints').textContent = fmt(profile.points);
    $('shopHint').textContent = shopTab === 'owned'
      ? (items.length ? 'Clique pour équiper.' : 'Aucun skin ici : file voir les basiques.')
      : 'Clique sur un skin pour l\'acheter puis l\'équiper.';
  }

  function onSkinClick(id) {
    const skin = SKINS.byId[id];
    if (!skin) return;
    const owned = profile.owned.indexOf(id) !== -1;

    if (owned) {
      if (profile.skin === id) return;
      profile.skin = id;
      saveProfile();
      renderShop();
      sfx.coin();
      toast('Skin équipé : ' + skin.name);
      return;
    }

    if (profile.points < skin.price) {
      toast('Il manque ' + fmt(skin.price - profile.points) + ' ◆', true);
      sfx.miss();
      return;
    }

    profile.points -= skin.price;
    profile.owned.push(id);
    profile.skin = id;
    saveProfile();
    syncHud();
    renderShop();
    sfx.coin();
    toast('Débloqué : ' + skin.name, true);
    if (ROOM.active && TempoOnline.available()) TempoOnline.update({ skin: id });
  }

  // ---------------------------------------------------------------- navigation
  function goHome() {
    leaveRoom(true);
    if (window.Music) Music.stop();
    if (RHY.spotifyMode && window.TempoSpotify) TempoSpotify.pause();
    RHY.active = false;
    G.rule = 'arcade';
    G.mode = 'solo';
    G.screen = 'menu';
    G.rng = null;
    updateDailyLine();
    renderShop();
    showPanel('homePanel');
  }

  function openShop() {
    renderShop();
    showPanel('shopPanel');
  }

  function openOnline() {
    $('nameInput').value = profile.name;
    setOnlineStatus('2 à 5 joueurs · 3 vies · le dernier debout gagne', false);
    showPanel('onlinePanel');
  }

  function retry() {
    if (ROOM.active) {
      if (ROOM.match && !ROOM.ended) return;
      if (ROOM.host) hostStartMatch();
      else toast('L\'hôte doit lancer la revanche');
      return;
    }
    if (G.rule === 'rhythm') { startRhythmSolo(); return; }
    startSolo();
  }

  // ---------------------------------------------------------------- mode rythme
  const RHY = {
    active: false,
    track: null,
    notes: [],
    next: 0,
    duration: 0,
    startsAt: 0,
    ended: false,
    useWall: false,
    spotifyMode: false,
    spotifyTrack: null,
    bots: [],
    rivals: [],
    botSkill: 0.72,
    lastOpts: null
  };

  const NOTE_BEAT = TAU / 4;
  const HIT_WINDOW = 0.10;
  const PERFECT_WINDOW = 0.035;
  const BOT_NAMES = ['Nova', 'Echo', 'Vex'];
  const BOT_SKINS = ['p04', 'p09', 'p18'];

  let rhythmTrackId = 'neon';
  let botCount = 2;
  let botSkill = 0.72;
  let roomMode = 'arcade';
  let roomTrackId = 'neon';
  let roomBots = 2;

  const TRACK_HUE = { neon: 190, pulse: 320, nuit: 265, orage: 140, spotify: 150 };

  function ryHue() {
    if (!RHY.track) return 190;
    return TRACK_HUE[RHY.track.id] === undefined ? 190 : TRACK_HUE[RHY.track.id];
  }

  function noteAngle(beat) { return -Math.PI / 2 + beat * NOTE_BEAT; }

  function ryBuildNotes(bpm, bars, seed) {
    const beat = 60 / bpm;
    const rnd = mulberry32((seed || 1) * 2654435761 % 2147483647);
    const notes = [];
    const total = bars * 4;
    let b = 4;

    while (b < total) {
      const prog = (b - 4) / Math.max(1, total - 4);
      const roll = rnd();
      let type = 'normal';

      if (prog > 0.28 && roll < 0.13) type = 'trap';
      else if (prog > 0.40 && roll < 0.27) type = 'side';
      else if (prog > 0.55 && roll < 0.40) type = 'hold';

      const note = {
        t: b * beat,
        angle: noteAngle(b),
        type: type,
        golden: type === 'normal' && b % 16 === 0,
        side: 0,
        end: 0,
        done: false,
        hit: false,
        held: false
      };

      if (type === 'side') note.side = rnd() < 0.5 ? 1 : 2;
      if (type === 'hold') {
        note.end = note.t + beat * 2 - beat * 0.06;
        note.span = 2;
        b += 2;
      } else {
        b += 1;
      }

      notes.push(note);
    }
    return notes;
  }

  function ryTime() {
    if (RHY.spotifyMode) return TempoSpotify.position();
    if (RHY.useWall) return (Date.now() - RHY.startsAt) / 1000;
    return Music.time();
  }

  function ryBeat() { return 60 / (RHY.track ? RHY.track.bpm : 120); }
  function ryTheta() { return -Math.PI / 2 + (ryTime() / ryBeat()) * NOTE_BEAT; }

  function ryMakeBot(index, name, skill, notes, seed) {
    const rnd = mulberry32((seed || 1) * 31 + index * 7919 + 13);
    const cumScore = [];
    const cumLives = [];
    let score = 0;
    let combo = 0;
    let lives = 3;

    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      if (n.type === 'trap') {
        cumScore.push(score);
        cumLives.push(lives);
        continue;
      }
      if (rnd() < skill) {
        combo += 1;
        const perfect = rnd() < 0.12 + skill * 0.28;
        const mult = Math.min(5, 1 + Math.floor(combo / 8));
        score += Math.round(100 * mult * (n.golden ? 3 : 1) * (perfect ? 1.5 : 1));
      } else {
        combo = 0;
        lives -= 1;
        if (lives <= 0) { score = Math.round(score * 0.8); lives = 1; }
      }
      cumScore.push(score);
      cumLives.push(lives);
    }

    return {
      id: 'bot' + index,
      name: name,
      skin: BOT_SKINS[index % BOT_SKINS.length],
      isBot: true,
      cursor: 0,
      cumScore: cumScore,
      cumLives: cumLives,
      score: 0,
      lives: 3
    };
  }

  function rySetup(opts) {
    const track = opts.track;
    const notes = ryBuildNotes(opts.bpm || track.bpm, opts.bars || track.bars, opts.seed || 1);

    RHY.track = track;
    RHY.notes = notes;
    RHY.next = 0;
    RHY.ended = false;
    RHY.active = true;
    RHY.spotifyMode = !!opts.spotify;
    RHY.spotifyTrack = opts.spotifyTrack || null;
    RHY.botSkill = opts.skill === undefined ? botSkill : opts.skill;
    RHY.rivals = [];
    RHY.bots = [];
    RHY.hold = null;

    const count = Math.max(0, Math.min(3, opts.botCount === undefined ? botCount : opts.botCount));
    for (let i = 0; i < count; i++) {
      RHY.bots.push(ryMakeBot(i, BOT_NAMES[i], RHY.botSkill, notes, opts.seed || 1));
    }

    const beat = 60 / (opts.bpm || track.bpm);

    if (RHY.spotifyMode) {
      const dur = (opts.spotifyTrack && opts.spotifyTrack.duration) || 180;
      RHY.duration = dur;
      RHY.startsAt = Date.now();
      RHY.useWall = false;
      G.screen = 'play';
      G.startsAt = RHY.startsAt - 1500;
    } else {
      RHY.duration = (notes.length + 4) * beat;
      RHY.startsAt = opts.startsAt || (Date.now() + 2200);
      const delay = Math.max(0.25, (RHY.startsAt - Date.now()) / 1000);
      RHY.useWall = !Music.start(track, delay);
      G.startsAt = RHY.startsAt;
      G.screen = 'countdown';
    }

    G.rule = 'rhythm';
    G.mode = opts.online ? 'online' : 'solo';
    G.rng = null;
    resetRun();
    G.screen = RHY.spotifyMode ? 'play' : 'countdown';
    G.cooldown = 0.1;
    RHY.lastOpts = opts;
    hideOverlay();
    audio();
    if (RHY.spotifyMode) {
      TempoSpotify.play(0).catch((e) => toast('Spotify : ' + e.message, true));
    }
    toast('Le meilleur score à la fin du morceau gagne', true);
  }

  async function startRhythmSolo() {
    audio();
    const useSpotify = rhythmTrackId === 'spotify';
    if (useSpotify) {
      if (!RHY.spotifyTrack) { toast('Charge d\'abord un morceau Spotify'); return; }
      if (!TempoSpotify.loggedIn()) { toast('Connecte-toi à Spotify'); return; }
    }
    const track = useSpotify
      ? Music.customTrack(spotifyBpm(), 48, RHY.spotifyTrack.name)
      : (Music.byId(rhythmTrackId) || Music.tracks[0]);

    if (useSpotify) {
      try {
        const ready = await TempoSpotify.initPlayer();
        if (!ready) throw new Error('lecteur indisponible (Premium requis)');
        await TempoSpotify.play(0);
      } catch (e) {
        toast('Spotify : ' + e.message, true);
        return;
      }
    }

    rySetup({
      track: track,
      bpm: useSpotify ? spotifyBpm() : track.bpm,
      bars: useSpotify ? Math.max(8, Math.floor(((RHY.spotifyTrack.duration || 180) * spotifyBpm()) / 240)) : track.bars,
      seed: Math.floor(Math.random() * 2147483647) + 1,
      botCount: botCount,
      skill: botSkill,
      online: false,
      spotify: useSpotify,
      spotifyTrack: RHY.spotifyTrack
    });
  }

  function spotifyBpm() {
    const v = parseInt($('spBpmInput').value, 10);
    return clamp(isFinite(v) ? v : 120, 50, 220);
  }

  function ryPress(side) {
    if (G.screen !== 'play' || G.cooldown > 0 || RHY.hold) return;
    const t = ryTime();
    let idx = -1;
    let err = 1e9;

    for (let i = RHY.next; i < Math.min(RHY.notes.length, RHY.next + 4); i++) {
      const n = RHY.notes[i];
      if (n.done) continue;
      const e = Math.abs(t - n.t);
      if (e < err) { err = e; idx = i; }
    }

    if (idx < 0 || err > HIT_WINDOW) {
      G.flash = Math.max(G.flash, 0.10);
      G.flashColor = '255,255,255';
      return;
    }

    const n = RHY.notes[idx];

    // --- piège : il ne fallait pas appuyer
    if (n.type === 'trap') {
      n.done = true;
      ryDamage('PIÈGE !', n);
      return;
    }

    // --- gauche / droite
    if (n.type === 'side') {
      const chosen = side === 0 ? 1 : side;
      if (chosen !== n.side) {
        n.done = true;
        ryDamage(n.side === 1 ? 'GAUCHE !' : 'DROITE !', n);
        return;
      }
    }

    n.done = true;
    n.hit = true;
    const perfect = err <= PERFECT_WINDOW;
    const px = cx + Math.cos(n.angle) * R;
    const py = cy + Math.sin(n.angle) * R;
    const col = n.type === 'side' ? 'hsl(268 100% 72%)'
      : n.type === 'hold' ? 'hsl(24 100% 64%)'
        : (n.golden ? 'hsl(45 100% 65%)' : 'hsl(' + ryHue() + ' 100% 68%)');

    // --- note tenue : on démarre la charge
    if (n.type === 'hold') {
      n.held = true;
      RHY.hold = { note: n, t0: t };
      G.combo += 1;
      G.hits += 1;
      burst(px, py, col, 10, 190, 1.0);
      floatText(px, py - 16, 'TIENS', col, 17);
      sfx.hit(G.combo, false);
      G.cooldown = 0.02;
      return;
    }

    G.combo += 1;
    G.hits += 1;
    if (perfect) G.perfects += 1;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;

    const mult = Math.min(5, 1 + Math.floor(G.combo / 8));
    let gain = Math.round(100 * mult * (n.golden ? 3 : 1) * (perfect ? 1.5 : 1));
    if (n.type === 'side') gain = Math.round(gain * 1.15);
    G.score += gain;

    burst(px, py, col, perfect ? 20 : 10, perfect ? 320 : 210, 1.1);
    ringPulse(col, perfect ? 4 : 2.2);
    G.shake = Math.max(G.shake, perfect ? 0.28 : 0.12);
    const label = n.type === 'side' ? (n.side === 1 ? 'GAUCHE' : 'DROITE') : (perfect ? 'PARFAIT' : '+' + gain);
    floatText(px, py - 16, label, perfect ? '#ffffff' : col, perfect ? 21 : 17);
    if (n.golden) sfx.gold(); else sfx.hit(G.combo, perfect);

    if (!G.beatRecord && profile.best > 0 && G.score > profile.best) {
      G.beatRecord = true;
      G.flash = 0.35;
      G.flashColor = '255,215,106';
      floatText(cx, cy - R * 0.68, 'NOUVEAU RECORD', '#ffd76a', 20);
    }

    G.cooldown = 0.04;
    if (G.mode === 'online') sendState(true);
  }

  function ryRelease() {
    const h = RHY.hold;
    if (!h) return;
    RHY.hold = null;
    const n = h.note;
    const t = ryTime();

    if (t < n.end - 0.24) { ryDamage('TROP TÔT', n); return; }
    if (t > n.end + 0.32) { ryDamage('DÉPASSÉ', n); return; }

    const mult = Math.min(5, 1 + Math.floor(G.combo / 8));
    const gain = Math.round(170 * mult);
    G.score += gain;
    G.hits += 1;
    if (G.combo > G.bestCombo) G.bestCombo = G.combo;

    const px = cx + Math.cos(n.angle) * R;
    const py = cy + Math.sin(n.angle) * R;
    burst(px, py, 'hsl(24 100% 66%)', 22, 330, 1.1);
    ringPulse('hsl(24 100% 66%)', 4);
    floatText(px, py - 16, '+' + gain, '#ffc38a', 21);
    G.shake = Math.max(G.shake, 0.26);
    sfx.gold();

    if (G.mode === 'online') sendState(true);
  }

  function ryDamage(reason, n) {
    G.combo = 0;
    G.lives -= 1;
    G.shake = 1;
    G.flash = 0.85;
    G.flashColor = '255,70,95';
    RHY.hold = null;

    const px = cx + Math.cos(n ? n.angle : G.theta) * R;
    const py = cy + Math.sin(n ? n.angle : G.theta) * R;
    burst(px, py, '#ff5a72', 18, 300);
    floatText(cx, cy + R * 0.78, reason || 'RATÉ', '#ff8fa3', 21);
    sfx.miss();

    if (G.lives > 0) {
      renderLives();
      if (G.mode === 'online') sendState(true);
      return;
    }

    const lost = Math.round(G.score * 0.2);
    G.score = Math.max(0, G.score - lost);
    G.lives = 1;
    G.flash = 1;
    G.shake = 1.4;
    floatText(cx, cy - R * 0.55, 'KO −20 %', '#ff8fa3', 26);
    sfx.over();
    renderLives();
    if (G.mode === 'online') sendState(true);
  }

  function ryMiss(n) {
    ryDamage('RATÉ', n);
  }

  function updateBots(t) {
    for (let b = 0; b < RHY.bots.length; b++) {
      const bot = RHY.bots[b];
      const notes = RHY.notes;
      while (bot.cursor < notes.length && notes[bot.cursor].t <= t) bot.cursor += 1;
      const i = bot.cursor - 1;
      bot.score = i >= 0 ? bot.cumScore[i] : 0;
      bot.lives = i >= 0 ? bot.cumLives[i] : 3;
    }
  }

  function updateRhythmRivals() {
    if (!ROOM.match) return;
    RHY.rivals = ROOM.match.roster.filter((p) => p.id !== myId()).map((p) => {
      const st = ROOM.match.states[p.id] || { score: 0, lives: 3 };
      return { id: p.id, name: p.name, skin: p.skin, score: st.score || 0, lives: st.lives === undefined ? 3 : st.lives };
    });
  }

  function ryStandings() {
    const rows = [{
      id: myId(),
      name: profile.name,
      skin: profile.skin,
      score: G.score,
      lives: G.lives,
      isMe: true
    }];
    RHY.bots.forEach((b) => rows.push({
      id: b.id, name: b.name, skin: b.skin, score: b.score, lives: b.lives, isBot: true
    }));
    RHY.rivals.forEach((r) => rows.push({
      id: r.id, name: r.name, skin: r.skin, score: r.score, lives: r.lives
    }));
    rows.sort((a, b) => b.score - a.score);
    return rows;
  }

  function ryUpdate(dt) {
    if (!RHY.active) return;

    if (G.screen === 'countdown') {
      if (ryTime() >= 0) {
        G.screen = 'play';
        G.cooldown = 0.05;
      }
      return;
    }
    if (G.screen !== 'play') return;

    const t = ryTime();
    updateBots(t);
    if (G.mode === 'online') updateRhythmRivals();

    const gap = t - (RHY.lastT || 0);
    RHY.lastT = t;

    while (RHY.next < RHY.notes.length && RHY.notes[RHY.next].t < t - HIT_WINDOW) {
      const n = RHY.notes[RHY.next];
      if (!n.done) {
        n.done = true;
        // piège : ne rien faire est la bonne réponse
        if (gap <= 0.7 && n.type !== 'trap') ryMiss(n);
      }
      RHY.next += 1;
    }

    // note tenue : rester appuyé au-delà de la fin = dépassement
    if (RHY.hold && t > RHY.hold.note.end + 0.30) {
      const held = RHY.hold.note;
      RHY.hold = null;
      ryDamage('DÉPASSÉ', held);
    }

    // filet de sécurité Spotify : si la lecture ne démarre pas, on passe à l'horloge locale
    if (RHY.spotifyMode && !RHY.useWall) {
      if (t < 0.4) RHY.frozen = (RHY.frozen || 0) + dt;
      else RHY.frozen = 0;
      if (RHY.frozen > 6) {
        RHY.useWall = true;
        RHY.startsAt = Date.now() - Math.max(0, t) * 1000;
        RHY.frozen = 0;
        toast('Lecture Spotify bloquée : on continue sans le son', true);
      }
    }

    if (G.mode === 'online') {
      G.nsent += dt;
      if (G.nsent > 0.45) { G.nsent = 0; sendState(false); }
    }

    if (t >= RHY.duration) ryEnd();
  }

  function ryEnd() {
    if (RHY.ended) return;
    RHY.ended = true;
    RHY.active = false;
    Music.stop();
    if (RHY.spotifyMode) TempoSpotify.pause();
    G.screen = 'over';

    const rows = ryStandings();
    const myIndex = rows.findIndex((r) => r.isMe);
    const myRank = myIndex >= 0 ? myIndex + 1 : rows.length;

    let earned = 30;
    if (myRank === 1) earned = 150;
    else if (myRank === 2) earned = 75;

    if (myRank === 1) { profile.wins += 1; sfx.win(); } else sfx.over();
    profile.best = Math.max(profile.best, G.score);
    profile.bestCombo = Math.max(profile.bestCombo, G.bestCombo);
    profile.runs += 1;
    profile.points += earned;
    saveProfile();
    syncHud();

    $('overLabel').textContent = myRank === 1 ? '🏆 Meilleur score' : myRank + 'ᵉ au classement';
    $('finalScore').textContent = fmt(G.score);
    $('recordLine').textContent = (RHY.track ? RHY.track.name : 'Morceau') + ' · ' + rows.length + ' joueurs';
    $('recordLine').classList.toggle('new', myRank === 1);

    $('finalStats').innerHTML = rows.map((r, i) => {
      const skin = SKINS.byId[r.skin] || SKINS.byId[SKINS.DEFAULT_ID];
      return '<div class="resultRow' + (r.isMe ? ' self' : '') + (i === 0 ? ' first' : '') + '">' +
        '<span class="resultRank">' + (i + 1) + '</span>' +
        '<span class="swatch" style="' + SKINS.swatch(skin) + '"><i></i></span>' +
        '<span class="resultName">' + escapeHtml(r.name) + '</span>' +
        '<span class="resultScore">' + fmt(r.score) + '</span>' +
        '</div>';
    }).join('') + '<p class="earned">+' + fmt(earned) + ' ◆</p>';

    const btn = $('retryBtn');
    if (ROOM.active && !ROOM.host) {
      btn.textContent = 'En attente de l\'hôte';
      btn.disabled = true;
      $('overHint').textContent = 'L\'hôte peut relancer un morceau';
    } else {
      btn.textContent = 'Rejouer';
      btn.disabled = false;
      $('overHint').textContent = 'Espace pour rejouer';
    }
    $('homeBtn').classList.remove('hidden');
    showPanel('overPanel');
  }

  // ---------------------------------------------------------------- rendu rythme
  function drawRhythmScene(ox, oy) {
    const t = ryTime();
    const beat = ryBeat();
    const theta = ryTheta();

    ctx.save();
    ctx.translate(ox, oy);

    drawStars();
    drawDisc();

    // progression du morceau
    const prog = clamp(t / Math.max(1, RHY.duration), 0, 1);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 24, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'hsl(' + ryHue() + ' 100% 62%)';
    ctx.shadowColor = 'hsl(' + ryHue() + ' 100% 62%)';
    ctx.shadowBlur = 12;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R + 24, -Math.PI / 2, -Math.PI / 2 + prog * TAU);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.42;
    SKINS.ring(ctx, cx, cy, R, mySkin(), G.time, 4);
    ctx.restore();
    drawTicks();

    // notes à venir
    const winAngle = (HIT_WINDOW / (4 * beat)) * TAU;
    const perfectAngle = (PERFECT_WINDOW / (4 * beat)) * TAU;
    const last = Math.min(RHY.notes.length, RHY.next + 5);

    for (let i = RHY.next; i < last; i++) {
      const n = RHY.notes[i];
      if (n.done || n.type !== 'hold') continue;
      drawNote(n, clamp(1 - (n.t - t) / (2.2 * beat), 0, 1), winAngle, perfectAngle, true);
    }

    for (let i = RHY.next; i < last; i++) {
      const n = RHY.notes[i];
      if (n.done) continue;
      const near = clamp(1 - (n.t - t) / (2.2 * beat), 0, 1);
      drawNote(n, near, winAngle, perfectAngle, false);
    }

    // aiguille
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const accent = mySkin().colors[0] || '#5ce1ff';
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 2.6;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(cx + cos * (R - 18), cy + sin * (R - 18));
    ctx.lineTo(cx + cos * (R + 18), cy + sin * (R + 18));
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.arc(cx + cos * R, cy + sin * R, 5.6, 0, TAU);
    ctx.fill();
    ctx.restore();

    drawRings();
    drawParticles();

    // score central
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const scoreText = fmt(G.score);
    let size = Math.round(R * 0.40);
    ctx.font = '700 ' + size + 'px ' + MONO;
    let w = ctx.measureText(scoreText).width;
    if (w > R * 1.3) {
      size = Math.max(16, Math.floor((size * R * 1.3) / w));
      ctx.font = '700 ' + size + 'px ' + MONO;
    }
    ctx.fillStyle = '#f2fbff';
    ctx.shadowColor = 'hsla(' + ryHue() + ' 100% 60% / 0.5)';
    ctx.shadowBlur = 22;
    ctx.fillText(scoreText, cx, cy - R * 0.06);
    ctx.shadowBlur = 0;

    if (G.combo > 1) {
      ctx.font = '700 ' + Math.round(R * 0.10) + 'px ' + SANS;
      ctx.fillStyle = 'hsl(' + ryHue() + ' 100% 70%)';
      ctx.fillText('COMBO ×' + G.combo, cx, cy + R * 0.26);
    }

    const remain = Math.max(0, RHY.duration - Math.max(0, t));
    ctx.font = '600 ' + Math.round(R * 0.078) + 'px ' + SANS;
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    const label = (RHY.track ? RHY.track.name.toUpperCase() : 'TEMPO') + ' · ' + Math.ceil(remain) + ' s';
    ctx.fillText(label, cx, cy + R * 0.46);

    ctx.restore();

    if (G.screen === 'countdown') drawCountdown();
    drawFloats();
    ctx.restore();

    drawGhosts();

    // rappel des commandes au démarrage du morceau
    if (t > 0 && t < 9) {
      const a = Math.min(1, t) * clamp((9 - t) / 2, 0, 1) * 0.75;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '600 ' + (W < 560 ? 11 : 12.5) + 'px ' + SANS;
      ctx.fillStyle = '#cfe9ff';
      ctx.fillText('◀ gauche : clic gauche / Q / moitié d\'écran', W / 2, H - 60);
      ctx.fillText('droite : clic droit / D / moitié d\'écran ▶', W / 2, H - 42);
      ctx.fillStyle = 'rgba(255,180,150,0.92)';
      ctx.fillText('piège ✕ : ne clique pas  ·  tenue : garde appuyé', W / 2, H - 22);
      ctx.restore();
    }

    // classement en direct
    const rows = ryStandings();
    const rank = rows.findIndex((r) => r.isMe) + 1;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 12px ' + SANS;
    ctx.fillStyle = rows.length > 1 ? (rank === 1 ? '#ffd76a' : 'rgba(234,246,255,0.55)') : 'rgba(234,246,255,0.4)';
    ctx.fillText(rank + ' / ' + rows.length, cx, cy - R - 44);
    ctx.restore();
  }

  function drawNote(n, near, winAngle, perfectAngle, guideOnly) {
    const isHold = n.type === 'hold';
    const col = n.type === 'trap' ? 'hsl(348 100% 64%)'
      : n.type === 'side' ? 'hsl(268 100% 72%)'
        : isHold ? 'hsl(24 100% 64%)'
          : (n.golden ? 'hsl(45 100% 64%)' : 'hsl(' + ryHue() + ' 100% 64%)');

    ctx.save();
    ctx.lineCap = 'round';

    if (isHold) {
      const endA = n.angle + 2 * NOTE_BEAT;
      ctx.globalAlpha = 0.10 + near * 0.22;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, R, n.angle, endA);
      ctx.stroke();
      if (guideOnly) { ctx.restore(); return; }

      if (RHY.hold && RHY.hold.note === n) {
        const cur = Math.min(ryTheta(), endA);
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = '#ffd2a6';
        ctx.shadowColor = '#ffb067';
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.arc(cx, cy, R, n.angle, cur);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 0.22 + near * 0.78;
    ctx.strokeStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = n.type === 'trap' ? 4 : 18 + near * 16;
    ctx.lineWidth = 13 + near * 4;
    if (n.type === 'trap') ctx.setLineDash([11, 10]);
    ctx.beginPath();
    ctx.arc(cx, cy, R, n.angle - winAngle, n.angle + winAngle);
    ctx.stroke();
    if (n.type === 'trap') ctx.setLineDash([]);

    if (!isHold && n.type !== 'trap') {
      ctx.globalAlpha = 0.35 + near * 0.65;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, R, n.angle - perfectAngle, n.angle + perfectAngle);
      ctx.stroke();
    }

    if (n.type === 'normal') { ctx.restore(); return; }

    const bx = cx + Math.cos(n.angle) * (R + 34);
    const by = cy + Math.sin(n.angle) * (R + 34);
    ctx.globalAlpha = (0.55 + near * 0.45) * 0.9;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(4,8,14,0.72)';
    ctx.beginPath();
    ctx.arc(bx, by, 12, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 0.6 + near * 0.4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = col;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 3.2;

    if (n.type === 'trap') {
      ctx.beginPath();
      ctx.moveTo(bx - 6, by - 6);
      ctx.lineTo(bx + 6, by + 6);
      ctx.moveTo(bx + 6, by - 6);
      ctx.lineTo(bx - 6, by + 6);
      ctx.stroke();
    } else if (n.type === 'side') {
      const d = n.side === 1 ? -1 : 1;
      ctx.beginPath();
      ctx.moveTo(bx + d * 7.5, by);
      ctx.lineTo(bx - d * 6, by - 7.5);
      ctx.lineTo(bx - d * 6, by + 7.5);
      ctx.closePath();
      ctx.fill();
    } else if (n.type === 'hold') {
      ctx.beginPath();
      ctx.arc(bx, by, 5.5, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - 11);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- cercles fantômes des potes
  const GHOSTS = {};

  function rivalList() {
    const rows = [];

    if (G.rule === 'rhythm') {
      RHY.bots.forEach((b) => rows.push({
        id: b.id, name: b.name, skin: b.skin, score: b.score, lives: b.lives, theta: ryTheta()
      }));
      RHY.rivals.forEach((r) => rows.push({
        id: r.id, name: r.name, skin: r.skin, score: r.score, lives: r.lives, theta: ryTheta()
      }));
    }

    if (G.mode === 'online' && ROOM.match && G.rule !== 'rhythm') {
      ROOM.match.roster.forEach((p) => {
        if (p.id === myId()) return;
        const st = ROOM.match.states[p.id] || {};
        rows.push({
          id: p.id,
          name: p.name,
          skin: p.skin,
          score: st.score || 0,
          lives: st.lives === undefined ? MAX_LIVES : st.lives,
          theta: st.theta === undefined ? -Math.PI / 2 : st.theta
        });
      });
    }

    return rows.slice(0, 4);
  }

  function updateGhosts(dt) {
    const list = rivalList();
    list.forEach((g) => {
      const s = GHOSTS[g.id] || (GHOSTS[g.id] = {
        theta: g.theta || -Math.PI / 2, score: g.score, lives: g.lives, flash: 0, flashCol: '92,225,255'
      });
      if (g.theta !== undefined) {
        const d = angDiff(g.theta, s.theta);
        s.theta += d * Math.min(1, dt * 9);
      }
      if (g.score > s.score) { s.flash = 1; s.flashCol = '92,225,255'; }
      if (g.lives < s.lives) { s.flash = 1; s.flashCol = '255,90,114'; }
      s.score = g.score;
      s.lives = g.lives;
      s.flash = Math.max(0, s.flash - dt * 2.2);
    });
  }

  function drawGhosts() {
    const list = rivalList();
    if (!list.length) return;

    const gr = clamp(R * 0.30, 28, 68);
    const dist = R + gr + (W < 760 ? 16 : 52);
    const slots = [-135, -45, 135, 45].map((a) => (a * Math.PI) / 180);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < list.length && i < slots.length; i++) {
      const g = list[i];
      const skin = SKINS.byId[g.skin] || SKINS.byId[SKINS.DEFAULT_ID];
      const px = clamp(cx + Math.cos(slots[i]) * dist, gr + 12, W - gr - 12);
      const py = clamp(cy + Math.sin(slots[i]) * dist, gr + 72, H - gr - 14);
      const st = GHOSTS[g.id] || { theta: g.theta || 0, flash: 0, flashCol: '255,90,114' };
      const alive = (g.lives || 0) > 0;

      // halo
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(6,12,22,0.55)';
      ctx.beginPath();
      ctx.arc(px, py, gr + 8, 0, TAU);
      ctx.fill();

      // anneau du pote (semi-transparent)
      ctx.globalAlpha = alive ? 0.5 : 0.22;
      SKINS.ring(ctx, px, py, gr, skin, G.time, Math.max(2.6, gr * 0.13));

      // aiguille du pote
      ctx.globalAlpha = alive ? 0.85 : 0.25;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.shadowColor = skin.colors[0] || '#ffffff';
      ctx.shadowBlur = alive ? 8 : 0;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + Math.cos(st.theta) * (gr - 8), py + Math.sin(st.theta) * (gr - 8));
      ctx.lineTo(px + Math.cos(st.theta) * (gr + 8), py + Math.sin(st.theta) * (gr + 8));
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px + Math.cos(st.theta) * gr, py + Math.sin(st.theta) * gr, 2.2, 0, TAU);
      ctx.fill();

      // flash dégât / point
      if (st.flash > 0.01) {
        ctx.globalAlpha = st.flash * 0.85;
        ctx.strokeStyle = 'rgb(' + st.flashCol + ')';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(px, py, gr + 8 + (1 - st.flash) * 14, 0, TAU);
        ctx.stroke();
      }

      // nom
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(234,246,255,0.72)';
      ctx.font = '600 ' + Math.round(clamp(gr * 0.24, 8, 11)) + 'px ' + SANS;
      const nm = g.name.length > 9 ? g.name.slice(0, 8) + '…' : g.name;
      ctx.fillText(nm, px, py - gr - 16);

      // score
      ctx.fillStyle = g.lives > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,140,160,0.9)';
      ctx.font = '700 ' + Math.round(clamp(gr * 0.26, 8.5, 12)) + 'px ' + MONO;
      ctx.fillText(fmt(g.score), px, py + gr + 15);

      // vies
      for (let k = 0; k < MAX_LIVES; k++) {
        ctx.beginPath();
        ctx.fillStyle = k < (g.lives || 0) ? 'rgba(126,240,255,0.95)' : 'rgba(255,255,255,0.13)';
        ctx.arc(px - 7 + k * 7, py + gr + 28, 1.9, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawRhythmChips() {
    const rows = ryStandings().filter((r) => !r.isMe);
    if (!rows.length) return;

    const n = rows.length;
    const slot = Math.min(88, (W - 24) / n);
    const y = H - 52;
    const startX = W / 2 - (n * slot) / 2 + slot / 2;
    const small = slot < 64;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < n; i++) {
      const p = rows[i];
      const skin = SKINS.byId[p.skin] || SKINS.byId[SKINS.DEFAULT_ID];
      const x = startX + i * slot;
      const rad = Math.min(24, slot * 0.28);

      SKINS.ring(ctx, x, y, rad, skin, G.time, small ? 3 : 3.6);

      ctx.font = '600 ' + (small ? 8 : 9) + 'px ' + SANS;
      ctx.fillStyle = 'rgba(234,246,255,0.62)';
      const nm = p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name;
      ctx.fillText(nm, x, y - rad - 13);

      ctx.font = '700 ' + (small ? 8 : 9.5) + 'px ' + MONO;
      ctx.fillStyle = i === 0 ? '#ffd76a' : 'rgba(255,255,255,0.85)';
      ctx.fillText(fmt(p.score), x, y + rad + 13);

      for (let k = 0; k < MAX_LIVES; k++) {
        ctx.beginPath();
        ctx.fillStyle = k < (p.lives || 0) ? 'rgba(126,240,255,0.95)' : 'rgba(255,255,255,0.13)';
        ctx.arc(x - 7 + k * 7, y + rad + 25, 1.9, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- entrées
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (isOverlayVisible()) {
        if (!$('overPanel').classList.contains('hidden')) retry();
        else if (!$('homePanel').classList.contains('hidden')) startSolo();
        return;
      }
      press();
      return;
    }

    if (e.code === 'KeyM') { toggleMute(); return; }

    if (e.code === 'KeyQ' || e.code === 'ArrowLeft') {
      if (!isOverlayVisible()) press(1);
      return;
    }

    if (e.code === 'KeyD' || e.code === 'ArrowRight') {
      if (!isOverlayVisible()) press(2);
      return;
    }

    if (e.code === 'Escape') {
      if (!isOverlayVisible()) goHome();
      return;
    }
  });

  cvs.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const mouse = e.pointerType === 'mouse' || e.pointerType === 'pen' || !e.pointerType;
    const side = mouse
      ? (e.button === 2 ? 2 : 1)
      : ((e.clientX === undefined ? W / 2 : e.clientX) < W / 2 ? 1 : 2);
    press(side);
  });

  cvs.addEventListener('pointerup', () => {
    if (G.rule === 'rhythm') ryRelease();
  });

  window.addEventListener('pointerup', () => {
    if (G.rule === 'rhythm') ryRelease();
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      if (G.rule === 'rhythm') ryRelease();
    }
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // boutons
  $('soloBtn').addEventListener('click', () => startSolo());
  $('onlineBtn').addEventListener('click', () => openOnline());
  $('shopBtn').addEventListener('click', () => openShop());
  $('createBtn').addEventListener('click', () => createRoom());
  $('joinBtn').addEventListener('click', () => joinRoom());
  $('startMatchBtn').addEventListener('click', () => hostStartMatch());
  $('leaveRoomBtn').addEventListener('click', () => goHome());
  $('retryBtn').addEventListener('click', () => retry());
  $('homeBtn').addEventListener('click', () => goHome());
  muteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(); });
  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => goHome());
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      shopTab = tab.dataset.tab;
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
      renderShop();
    });
  });

  $('skinGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.skinCard');
    if (card) onSkinClick(card.dataset.id);
  });

  $('nameInput').addEventListener('input', (e) => {
    const v = e.target.value.trim().slice(0, 14);
    if (v) {
      profile.name = v;
      saveProfile();
      if (ROOM.active && TempoOnline.available()) TempoOnline.update({ name: v });
    }
  });

  $('codeInput').addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  });

  $('codeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); joinRoom(); }
  });

  window.addEventListener('blur', () => { last = performance.now(); });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  // ---------------------------------------------------------------- interfaces rythme
  function openRhythm() {
    renderRhythmPanel();
    showPanel('rhythmPanel');
  }

  function renderRhythmPanel() {
    const cards = Music.tracks.map((t) => {
      const sel = rhythmTrackId === t.id;
      return '<button class="trackCard' + (sel ? ' sel' : '') + '" data-track="' + t.id + '">' +
        '<span class="trackDot" style="background:' + t.accent + ';box-shadow:0 0 14px ' + t.accent + '"></span>' +
        '<span class="trackName">' + escapeHtml(t.name) + '</span>' +
        '<span class="trackMeta">' + t.bpm + ' BPM · ' + Math.round(Music.duration(t)) + ' s</span>' +
        '</button>';
    });

    if (RHY.spotifyTrack) {
      cards.push('<button class="trackCard' + (rhythmTrackId === 'spotify' ? ' sel' : '') + '" data-track="spotify">' +
        '<span class="trackDot" style="background:#1db954;box-shadow:0 0 14px #1db954"></span>' +
        '<span class="trackName">' + escapeHtml(RHY.spotifyTrack.name) + '</span>' +
        '<span class="trackMeta">Spotify · ' + spotifyBpm() + ' BPM</span>' +
        '</button>');
    }

    const list = $('trackList');
    if (list) list.innerHTML = cards.join('');

    document.querySelectorAll('#botSeg button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.bots) === botCount);
    });
    document.querySelectorAll('#skillSeg button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.skill) === botSkill);
    });

    const btn = $('startRhythmBtn');
    if (btn) btn.textContent = rhythmTrackId === 'spotify' ? 'Lancer sur Spotify' : 'Lancer le morceau';
  }

  function renderRoomSettings() {
    const seg = $('modeSeg');
    if (!seg) return;

    document.querySelectorAll('#modeSeg button').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === roomMode);
      b.disabled = !ROOM.host;
    });

    const opts = $('roomRhythmOpts');
    if (opts) opts.classList.toggle('hidden', roomMode !== 'rhythm');

    const sel = $('roomTrack');
    if (sel) {
      let html = Music.tracks.map((t) =>
        '<option value="' + t.id + '">' + escapeHtml(t.name) + ' · ' + t.bpm + ' BPM</option>').join('');
      if (RHY.spotifyTrack) {
        html += '<option value="spotify">Spotify · ' + escapeHtml(RHY.spotifyTrack.name) + '</option>';
      }
      sel.innerHTML = html;
      if (!Music.byId(roomTrackId) && roomTrackId !== 'spotify') roomTrackId = 'neon';
      sel.value = roomTrackId;
      sel.disabled = !ROOM.host;
    }

    document.querySelectorAll('#roomBotSeg button').forEach((b) => {
      b.classList.toggle('active', Number(b.dataset.bots) === roomBots);
      b.disabled = !ROOM.host;
    });
  }

  // ---------------------------------------------------------------- Spotify
  let tapTimes = [];

  function tapTempo() {
    const now = performance.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2200) tapTimes = [];
    tapTimes.push(now);
    if (tapTimes.length > 6) tapTimes.shift();
    if (tapTimes.length >= 2) {
      let sum = 0;
      for (let i = 1; i < tapTimes.length; i++) sum += tapTimes[i] - tapTimes[i - 1];
      const bpm = Math.round(60000 / (sum / (tapTimes.length - 1)));
      if (bpm >= 50 && bpm <= 220) {
        $('spBpmInput').value = bpm;
        renderRhythmPanel();
      }
    }
  }

  function refreshSpotifyUi(snap) {
    if (!snap && window.TempoSpotify) snap = TempoSpotify.snapshot();
    if (!snap || !$('spStatus')) return;
    const parts = [];
    parts.push(snap.loggedIn ? 'Compte connecté' : 'Non connecté');
    if (snap.loggedIn) parts.push(snap.ready ? 'lecteur prêt' : 'lecteur en attente');
    $('spStatus').textContent = parts.join(' · ') + ' — ' + snap.status;
    $('spConnectBtn').textContent = snap.loggedIn ? 'Se déconnecter' : 'Se connecter à Spotify';
    $('spHint').textContent = snap.loggedIn
      ? 'Colle un lien, règle le BPM (tap tempo), puis lance. Premium requis pour entendre le morceau.'
      : 'Redirection à autoriser dans ton dashboard Spotify : ' + snap.redirect;
  }

  function initSpotifyUi() {
    if (!window.TempoSpotify) return;

    TempoSpotify.onChange(refreshSpotifyUi);
    refreshSpotifyUi();

    TempoSpotify.handleCallback().then((ok) => {
      refreshSpotifyUi();
      if (ok) toast('Spotify connecté', true);
    }).catch(() => null);

    $('spConnectBtn').addEventListener('click', () => {
      const snap = TempoSpotify.snapshot();
      if (snap.loggedIn) {
        TempoSpotify.logout();
        refreshSpotifyUi();
        toast('Spotify déconnecté');
        return;
      }
      audio();
      TempoSpotify.connect().catch((e) => toast('Spotify : ' + e.message, true));
    });

    $('spLoadBtn').addEventListener('click', async () => {
      try {
        audio();
        await TempoSpotify.initPlayer();
        const track = await TempoSpotify.loadTrack($('spTrackInput').value);
        RHY.spotifyTrack = { uri: track.uri, name: track.name, duration: (track.duration_ms || 180000) / 1000 };
        RHY.spotifyTrack.duration = Math.max(30, RHY.spotifyTrack.duration);
        rhythmTrackId = 'spotify';
        renderRhythmPanel();
        refreshSpotifyUi();
        toast('Morceau prêt : ' + track.name, true);
      } catch (e) {
        toast('Spotify : ' + e.message, true);
      }
    });

    $('spTapBtn').addEventListener('click', tapTempo);
  }

  function wireRhythmUi() {
    $('rhythmBtn').addEventListener('click', () => openRhythm());

    $('startRhythmBtn').addEventListener('click', () => startRhythmSolo());

    $('trackList').addEventListener('click', (e) => {
      const card = e.target.closest('.trackCard');
      if (!card) return;
      rhythmTrackId = card.dataset.track;
      renderRhythmPanel();
    });

    document.querySelectorAll('#botSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        botCount = clamp(Number(b.dataset.bots) || 0, 0, 3);
        renderRhythmPanel();
      });
    });

    document.querySelectorAll('#skillSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        botSkill = Number(b.dataset.skill) || 0.72;
        renderRhythmPanel();
      });
    });

    document.querySelectorAll('#modeSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        if (!ROOM.host) return;
        roomMode = b.dataset.mode;
        renderRoomSettings();
        renderRoom();
        pushRoomSettings();
      });
    });

    const sel = $('roomTrack');
    if (sel) {
      sel.addEventListener('change', () => {
        if (!ROOM.host) return;
        roomTrackId = sel.value;
        pushRoomSettings();
      });
    }

    document.querySelectorAll('#roomBotSeg button').forEach((b) => {
      b.addEventListener('click', () => {
        if (!ROOM.host) return;
        roomBots = clamp(Number(b.dataset.bots) || 0, 0, 3);
        renderRoomSettings();
        pushRoomSettings();
      });
    });
  }

  // ---------------------------------------------------------------- réseau : abonnements
  if (window.TempoOnline) {
    TempoOnline.on('players', (players) => {
      ROOM.players = players || [];
      const self = ROOM.players.find((p) => p.id === myId());
      if (self) ROOM.host = !!self.isHost;
      if (ROOM.active) {
        renderRoom();
        if (ROOM.host && TempoOnline.state.status === 'ready') pushRoomSettings();
      }
    });

    TempoOnline.on('event', onOnlineEvent);

    TempoOnline.on('status', (st) => {
      if (st.status === 'error' && !ROOM.active) {
        setOnlineStatus(st.error || 'Connexion impossible.', true);
      }
    });
  }

  // ---------------------------------------------------------------- boucle
  let last = performance.now();

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- init
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  resize();
  if (window.Music) Music.setMuted(profile.muted);
  wireRhythmUi();
  initSpotifyUi();
  renderRhythmPanel();
  renderLives();
  syncHud();
  updateMuteBtn();
  updateDailyLine();
  renderShop();

  const daily = claimDaily();
  if (daily) {
    setTimeout(() => {
      toast('Bonus quotidien : +' + daily.bonus + ' ◆ · série ' + daily.streak + ' j', true);
      if (!profile.muted) { tone(880, 0.1, 'triangle', 0.05); tone(1320, 0.18, 'triangle', 0.04, null, 0.09); }
    }, 600);
  }

  showPanel('homePanel');
  requestAnimationFrame(frame);

  // expose pour les tests hors navigateur
  window.__TEMPO__ = {
    G: G, ROOM: ROOM, RHY: RHY, profile: profile, SKINS: SKINS,
    ghosts: GHOSTS, rivalList: rivalList, press: press, release: ryRelease, theta: ryTheta
  };
})();
