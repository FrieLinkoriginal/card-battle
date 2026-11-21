/* Catalogue des skins de cercle : 50 basiques + 20 prestige.
   Chaque skin sait se dessiner sur un canvas et se prévisualiser en CSS. */
window.SKINS = (function () {
  'use strict';

  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------- basiques
  const BASIC = [
    ['Rouge feu', '#ff2d2d'],
    ['Rubis', '#e0115f'],
    ['Framboise', '#ff3f6c'],
    ['Rose bonbon', '#ff6fae'],
    ['Magenta', '#ff2fd0'],
    ['Fuchsia', '#e100e1'],
    ['Violet', '#8a2be2'],
    ['Améthyste', '#9966cc'],
    ['Lavande', '#b39ddb'],
    ['Indigo', '#4b4bff'],
    ['Bleu nuit', '#1e3a8a'],
    ['Bleu roi', '#2453ff'],
    ['Azur', '#2f9bff'],
    ['Cyan', '#22d3ee'],
    ['Turquoise', '#17c3b2'],
    ['Menthe', '#3ddc97'],
    ['Émeraude', '#10b981'],
    ['Jade', '#00a878'],
    ['Vert pomme', '#7ed957'],
    ['Lime', '#b6ff2e'],
    ['Olive', '#9aa32b'],
    ['Moutarde', '#d4a017'],
    ['Or', '#ffc847'],
    ['Ambre', '#ffb000'],
    ['Orange', '#ff8c1a'],
    ['Mandarine', '#ff6b1a'],
    ['Corail', '#ff6f5e'],
    ['Saumon', '#ff8f7a'],
    ['Pêche', '#ffb59e'],
    ['Sable', '#e3c9a0'],
    ['Beige', '#d9c7a7'],
    ['Ivoire', '#f4ecd8'],
    ['Blanc lunaire', '#eef4ff'],
    ['Argent', '#cfd6e4'],
    ['Platine', '#e8eef8'],
    ['Gris acier', '#8a96a8'],
    ['Anthracite', '#5b6678'],
    ['Graphite', '#3c4553'],
    ['Brun terre', '#8b5a2b'],
    ['Cuivre', '#b87333'],
    ['Bordeaux', '#c0264f'],
    ['Prune', '#a0306e'],
    ['Aubergine', '#8a3fa8'],
    ['Bleu pétrole', '#1f8f9c'],
    ['Vert bouteille', '#2e8b57'],
    ['Kaki', '#8f9350'],
    ['Chair', '#edb9a2'],
    ['Lilas', '#c8a2e8'],
    ['Bleu pastel', '#a3c4ff'],
    ['Vert pastel', '#a8e6cf']
  ];

  const basics = BASIC.map(function (entry, i) {
    const id = 'b' + String(i + 1).padStart(2, '0');
    return {
      id: id,
      name: entry[0],
      tier: 'basic',
      kind: 'solid',
      colors: [entry[1]],
      glow: 18,
      price: i < 3 ? 0 : 120 + i * 6
    };
  });

  // ---------------------------------------------------------------- prestige
  const premium = [
    { id: 'p01', name: 'Sang', kind: 'gradient', colors: ['#ff0033', '#7a0018'], price: 2200, pulse: true, glow: 26 },
    { id: 'p02', name: 'Or liquide', kind: 'gradient', colors: ['#fff3b0', '#ffc847', '#a87400'], price: 2400, glow: 30 },
    { id: 'p03', name: 'Sunset', kind: 'gradient', colors: ['#ff5f6d', '#ffc371', '#ffe9a8'], price: 2400, glow: 26 },
    { id: 'p04', name: 'Glacier', kind: 'gradient', colors: ['#eaffff', '#7fe3ff', '#2f7fff'], price: 2600, pulse: true, glow: 30 },
    { id: 'p05', name: 'Émeraude royale', kind: 'gradient', colors: ['#d8ffe8', '#10b981', '#04563c'], price: 2600, double: true, glow: 28 },
    { id: 'p06', name: 'Chrome', kind: 'gradient', colors: ['#ffffff', '#9aa7bd', '#2c3444', '#e8f0ff'], price: 2800, glow: 24 },
    { id: 'p07', name: 'Radioactif', kind: 'solid', colors: ['#9dff2e'], price: 3000, dash: true, glow: 34 },
    { id: 'p08', name: 'Aurore', kind: 'gradient', colors: ['#4dffb8', '#4db8ff', '#a64dff'], price: 3200, glow: 30 },
    { id: 'p09', name: 'Vaporwave', kind: 'conic', colors: ['#ff71ce', '#01cdfe', '#b967ff'], price: 3200, dash: true, glow: 30 },
    { id: 'p10', name: 'Aurore boréale', kind: 'gradient', colors: ['#00ffc8', '#3fa9ff', '#a06bff'], price: 3400, pulse: true, double: true, glow: 32 },
    { id: 'p11', name: 'Lave', kind: 'gradient', colors: ['#ffe066', '#ff6b00', '#7a1200'], price: 3400, pulse: true, glow: 34 },
    { id: 'p12', name: 'Trou noir', kind: 'solid', colors: ['#0a0a12'], price: 3600, double: true, glow: 0, glowColor: '#ffffff' },
    { id: 'p13', name: 'Cyberpunk', kind: 'conic', colors: ['#00fff0', '#ff00a8', '#ffe600'], price: 3600, dash: true, glow: 32 },
    { id: 'p14', name: 'Nébuleuse', kind: 'conic', colors: ['#5b2cff', '#ff3ea5', '#00d4ff', '#5b2cff'], price: 3800, pulse: true, glow: 34 },
    { id: 'p15', name: 'Prisme', kind: 'conic', colors: ['#ff4d4d', '#ffd24d', '#4dff88', '#4dd2ff', '#a64dff', '#ff4dbf'], price: 4000, double: true, glow: 28 },
    { id: 'p16', name: 'Hologramme', kind: 'conic', colors: ['#a8f0ff', '#ffb3f0', '#b3ffd9', '#fff0b3', '#a8f0ff'], price: 4200, pulse: true, glow: 36 },
    { id: 'p17', name: 'Galaxie', kind: 'conic', colors: ['#0b1030', '#3b1e8f', '#ff5fa2', '#0b1030'], price: 4400, glow: 34 },
    { id: 'p18', name: 'Plasma', kind: 'gradient', colors: ['#ff00e5', '#ff5c00', '#7a00ff'], price: 4600, pulse: true, glow: 38 },
    { id: 'p19', name: 'Arc-en-ciel', kind: 'rainbow', colors: ['#ff4d4d'], price: 5000, glow: 34 },
    { id: 'p20', name: 'Diamant', kind: 'conic', colors: ['#ffffff', '#b9e6ff', '#ffffff', '#8fd0ff'], price: 6000, double: true, pulse: true, glow: 40 }
  ].map(function (s) {
    s.tier = 'premium';
    return s;
  });

  const all = basics.concat(premium);
  const byId = {};
  all.forEach(function (s) { byId[s.id] = s; });

  const DEFAULT_ID = 'b01';
  const FREE = basics.filter(function (s) { return s.price === 0; }).map(function (s) { return s.id; });

  // ---------------------------------------------------------------- rendu canvas
  function strokeStyleFor(ctx, skin, cx, cy, r, time) {
    const c = skin.colors || ['#ffffff'];
    if (skin.kind === 'gradient') {
      const a = time * 0.35;
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r;
      const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      c.forEach(function (col, i) {
        g.addColorStop(c.length === 1 ? 0 : i / (c.length - 1), col);
      });
      return g;
    }
    if (skin.kind === 'conic') {
      if (typeof ctx.createConicGradient === 'function') {
        const g = ctx.createConicGradient(time * 0.45, cx, cy);
        const n = c.length;
        for (let i = 0; i < n; i++) g.addColorStop(i / n, c[i]);
        g.addColorStop(1, c[0]);
        return g;
      }
      return c[0];
    }
    if (skin.kind === 'rainbow') {
      if (typeof ctx.createConicGradient === 'function') {
        const g = ctx.createConicGradient(time * 0.9, cx, cy);
        for (let i = 0; i <= 6; i++) {
          g.addColorStop(i / 6, 'hsl(' + ((time * 70 + i * 60) % 360) + ' 100% 62%)');
        }
        return g;
      }
      return 'hsl(' + ((time * 70) % 360) + ' 100% 62%)';
    }
    return c[0];
  }

  function ring(ctx, cx, cy, r, skin, time, width) {
    if (!skin) skin = byId[DEFAULT_ID];
    const w = (width || 7);
    const pulse = skin.pulse ? 1 + Math.sin(time * 3.2) * 0.32 : 1;

    ctx.save();
    ctx.lineWidth = w * pulse;
    ctx.lineCap = 'round';
    ctx.strokeStyle = strokeStyleFor(ctx, skin, cx, cy, r, time);
    const glowColor = skin.glowColor || skin.colors[skin.colors.length - 1];
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = skin.glow === undefined ? 18 : skin.glow;
    if (skin.dash) {
      ctx.setLineDash([r * 0.26, r * 0.16]);
      ctx.lineDashOffset = -time * 70;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.stroke();

    if (skin.double) {
      ctx.setLineDash([]);
      ctx.shadowBlur = (skin.glow || 0) * 0.6;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = Math.max(1.2, w * 0.22);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.86, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- aperçu CSS
  function swatch(skin) {
    const c = skin.colors;
    let bg;
    if (skin.kind === 'conic' || skin.kind === 'rainbow') {
      const stops = skin.kind === 'rainbow'
        ? ['#ff4d4d', '#ffd24d', '#4dff88', '#4dd2ff', '#a64dff', '#ff4dbf', '#ff4d4d']
        : c.concat([c[0]]);
      bg = 'conic-gradient(from 0deg,' + stops.join(',') + ')';
    } else if (skin.kind === 'gradient') {
      bg = 'linear-gradient(135deg,' + c.join(',') + ')';
    } else {
      bg = c[0];
    }
    return 'background:' + bg + ';box-shadow:0 0 16px ' +
      (skin.glowColor || c[c.length - 1]) + '66';
  }

  return {
    all: all,
    basic: basics,
    premium: premium,
    byId: byId,
    DEFAULT_ID: DEFAULT_ID,
    FREE: FREE,
    ring: ring,
    swatch: swatch
  };
})();
