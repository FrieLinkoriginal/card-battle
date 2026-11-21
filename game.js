/* TEMPO — jeu d'arcade de précision à un seul bouton.
   Aucune dépendance, aucun asset externe. */
(() => {
  'use strict';

  // ---------------------------------------------------------------- utilitaires
  const TAU = Math.PI * 2;
  const SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const rand = (a, b) => a + Math.random() * (b - a);

  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    else if (d < -Math.PI) d += TAU;
    return d;
  }

  // ---------------------------------------------------------------- sauvegarde
  const SAVE_KEY = 'tempo.save.v1';
  const save = { best: 0, bestCombo: 0, runs: 0, muted: false };

  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) Object.assign(save, JSON.parse(raw) || {});
  } catch (_) { /* stockage indisponible */ }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (_) {}
  }

  // ---------------------------------------------------------------- audio
  let AC = null;

  function audio() {
    if (!AC) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { AC = new C(); } catch (_) { return null; }
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }

  function tone(freq, dur, type, gain, target, delay) {
    if (save.muted) return;
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
      const step = Math.min(combo, 14);
      const f = 520 * Math.pow(2, step / 12);
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
    flip() {
      tone(720, 0.07, 'sine', 0.03, 420);
    },
    start() {
      tone(330, 0.09, 'triangle', 0.04);
      tone(660, 0.14, 'triangle', 0.04, null, 0.08);
    },
    over() {
      tone(240, 0.5, 'sawtooth', 0.05, 55);
      tone(120, 0.7, 'sine', 0.04, 40, 0.05);
    }
  };

  // ---------------------------------------------------------------- canvas
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const overlay = document.getElementById('overlay');
  const menuEl = document.getElementById('menu');
  const overEl = document.getElementById('over');
  const livesEl = document.getElementById('lives');
  const recordEl = document.getElementById('record');
  const finalScoreEl = document.getElementById('finalScore');
  const recordLineEl = document.getElementById('recordLine');
  const finalStatsEl = document.getElementById('finalStats');
  const muteBtn = document.getElementById('mute');

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
    screen: 'menu',       // menu | play | dying | over
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
    beatRecord: false,
    level: 1,
    cooldown: 0,
    overTimer: 0,
    shake: 0,
    flash: 0,
    flashColor: '92,225,255',
    pulse: 0,
    time: 0,
    particles: [],
    floats: [],
    rings: []
  };

  const MAX_LIVES = 3;
  const HITS_PER_LEVEL = 6;

  function hue() {
    return (188 + (G.level - 1) * 13) % 360;
  }

  // ---------------------------------------------------------------- effets
  function burst(x, y, color, count, speed, spread) {
    const s = speed || 240;
    for (let i = 0; i < count; i++) {
      const a = (spread === undefined ? Math.random() * TAU : rand(-spread, spread));
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

  function drawRing() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.075)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

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
    if (G.screen === 'menu' || G.screen === 'over') return;
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
    const h = hue();
    const a0 = G.dir > 0 ? G.theta - span : G.theta;
    const a1 = G.dir > 0 ? G.theta : G.theta + span;

    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'hsl(' + h + ' 100% 70%)';
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, R, a0, a1);
    ctx.stroke();

    const b0 = G.dir > 0 ? G.theta - span * 0.5 : G.theta;
    const b1 = G.dir > 0 ? G.theta : G.theta + span * 0.5;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, R, b0, b1);
    ctx.stroke();
    ctx.restore();
  }

  function drawNeedle() {
    const cos = Math.cos(G.theta);
    const sin = Math.sin(G.theta);
    const h = hue();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'hsl(' + h + ' 100% 70%)';
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

    const scoreText = G.score.toLocaleString('fr-FR');
    let scoreSize = Math.round(R * 0.44);
    const maxW = R * 1.34;
    ctx.font = '700 ' + scoreSize + 'px ' + MONO;
    const measured = ctx.measureText(scoreText).width;
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

    if (G.screen === 'play' || G.screen === 'dying') {
      ctx.font = '600 ' + Math.round(R * 0.085) + 'px ' + SANS;
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.letterSpacing = '0.14em';
      ctx.fillText('NIVEAU ' + G.level, cx, cy + R * 0.5);
    }
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

    ctx.save();
    ctx.translate(ox, oy);
    drawStars();
    drawDisc();
    drawRing();
    drawTarget();
    drawTrail();
    drawNeedle();
    drawRings();
    drawParticles();
    drawCenter();
    drawFloats();
    ctx.restore();

    if (G.flash > 0.001) {
      ctx.globalAlpha = clamp(G.flash, 0, 1) * 0.34;
      ctx.fillStyle = 'rgb(' + G.flashColor + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- logique
  function update(dt) {
    G.time += dt;
    G.shake = Math.max(0, G.shake - dt * 2.6);
    G.flash = Math.max(0, G.flash - dt * 3.2);
    G.pulse = Math.max(0, G.pulse - dt * 4);
    G.cooldown = Math.max(0, G.cooldown - dt);

    if (G.screen === 'menu') {
      G.theta = (G.theta + 1.25 * dt) % TAU;
    } else if (G.screen === 'play') {
      G.theta += G.dir * G.omega * dt;
      if (G.theta >= TAU) G.theta -= TAU;
      else if (G.theta < 0) G.theta += TAU;
    } else if (G.screen === 'dying') {
      G.theta += G.dir * G.omega * 0.15 * dt;
      G.overTimer -= dt;
      if (G.overTimer <= 0) endRun();
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
      r.r += (R * 1.9) * dt;
    }
  }

  // ---------------------------------------------------------------- gameplay
  function speedForLevel(level) {
    return Math.min(7.4, 2.55 + (level - 1) * 0.30);
  }

  function widthForLevel(level, golden) {
    const base = Math.max(0.064, 0.262 - (level - 1) * 0.0105);
    return golden ? base * 0.74 : base;
  }

  function spawnTarget() {
    G.target.golden = G.level >= 3 && Math.random() < 0.10;
    G.target.hw = widthForLevel(G.level, G.target.golden);
    // Laisse toujours au joueur un temps de réaction lisible, même à haute vitesse.
    const ahead = clamp(G.omega * rand(0.62, 1.30), 1.1, TAU * 0.78);
    let a = G.theta + G.dir * ahead;
    a = ((a % TAU) + TAU) % TAU;
    G.target.a = a;
  }

  function reset() {
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
    G.beatRecord = false;
    G.cooldown = 0.25;
    G.overTimer = 0;
    G.shake = 0;
    G.flash = 0;
    G.particles.length = 0;
    G.floats.length = 0;
    G.rings.length = 0;
    spawnTarget();
    renderLives();
  }

  function startGame() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    reset();
    G.screen = 'play';
    overlay.classList.add('is-hidden');
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

    const h = golden ? 44 : hue();
    const col = 'hsl(' + h + ' 100% 68%)';
    const tx = cx + Math.cos(G.target.a) * R;
    const ty = cy + Math.sin(G.target.a) * R;

    burst(tx, ty, col, perfect ? 22 : 12, perfect ? 380 : 250, 1.1);
    ringPulse(col, perfect ? 4 : 2.5);
    G.pulse = 1;
    G.shake = Math.max(G.shake, perfect ? 0.34 : 0.16);

    if (!G.beatRecord && save.best > 0 && G.score > save.best) {
      G.beatRecord = true;
      G.flash = 0.42;
      G.flashColor = '255,215,106';
      floatText(cx, cy - R * 0.68, 'NOUVEAU RECORD', '#ffd76a', 20);
      tone(784, 0.12, 'triangle', 0.045);
      tone(1175, 0.16, 'triangle', 0.04, null, 0.09);
    }

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

    // Bascule de sens : le cerveau doit se réadapter.
    if (G.level >= 4 && Math.random() < 0.16) {
      G.dir *= -1;
      G.pulse = 1;
      sfx.flip();
    }

    spawnTarget();
    G.cooldown = 0.06;
  }

  function miss() {
    G.combo = 0;
    G.lives -= 1;
    G.shake = 1;
    G.flash = 0.85;
    G.flashColor = '255,70,95';
    G.cooldown = 0.22;

    const tx = cx + Math.cos(G.theta) * R;
    const ty = cy + Math.sin(G.theta) * R;
    burst(tx, ty, '#ff5a72', 18, 300);
    floatText(cx, cy + R * 0.78, 'RATÉ', '#ff7f92', 22);
    sfx.miss();

    renderLives();

    if (G.lives <= 0) {
      G.screen = 'dying';
      G.overTimer = 0.85;
      G.shake = 1.6;
      G.flash = 1;
      burst(cx, cy, '#ff5a72', 42, 460);
      sfx.over();
    } else {
      spawnTarget();
    }
  }

  function press() {
    if (G.screen === 'menu' || G.screen === 'over') {
      audio(); // débloque l'audio sur le geste utilisateur
      startGame();
      return;
    }
    if (G.screen !== 'play' || G.cooldown > 0) return;

    const d = Math.abs(angDiff(G.theta, G.target.a));
    if (d <= G.target.hw) hit(d / G.target.hw);
    else miss();
  }

  function endRun() {
    if (G.screen === 'over') return;
    G.screen = 'over';

    const isRecord = G.score > save.best;
    save.best = Math.max(save.best, G.score);
    save.bestCombo = Math.max(save.bestCombo, G.bestCombo);
    save.runs += 1;
    persist();
    updateRecordPill();

    finalScoreEl.textContent = G.score.toLocaleString('fr-FR');
    if (isRecord && G.score > 0) {
      recordLineEl.textContent = '🏆 Nouveau record';
      recordLineEl.classList.add('new');
    } else {
      recordLineEl.textContent = 'Record : ' + save.best.toLocaleString('fr-FR');
      recordLineEl.classList.remove('new');
    }
    finalStatsEl.textContent =
      'Combo max ×' + G.bestCombo +
      ' · Parfaits ' + G.perfects +
      ' · Niveau ' + G.level;

    menuEl.classList.add('hidden');
    overEl.classList.remove('hidden');
    overlay.classList.remove('is-hidden');
  }

  // ---------------------------------------------------------------- HUD
  function renderLives() {
    let html = '';
    for (let i = 0; i < MAX_LIVES; i++) {
      html += '<div class="life' + (i < G.lives ? '' : ' gone') + '"></div>';
    }
    livesEl.innerHTML = html;
  }

  function updateRecordPill() {
    recordEl.textContent = 'Record ' + save.best.toLocaleString('fr-FR');
  }

  function updateMuteBtn() {
    muteBtn.textContent = save.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', save.muted ? 'Activer le son' : 'Couper le son');
  }

  function toggleMute() {
    save.muted = !save.muted;
    persist();
    updateMuteBtn();
    if (!save.muted) tone(660, 0.08, 'sine', 0.04);
  }

  // ---------------------------------------------------------------- entrées
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      press();
    } else if (e.code === 'KeyM') {
      toggleMute();
    }
  });

  cvs.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    press();
  });

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('button')) return;
    press();
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.getElementById('startBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    audio();
    startGame();
  });

  document.getElementById('retryBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    audio();
    startGame();
  });

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMute();
  });
  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());

  window.addEventListener('blur', () => { last = performance.now(); });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

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
  renderLives();
  updateRecordPill();
  updateMuteBtn();
  requestAnimationFrame(frame);
})();
