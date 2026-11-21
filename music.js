/* Moteur musical procédural : 4 morceaux synthétisés en direct par la Web Audio API.
   Aucun fichier audio, aucun droit, un tempo exact au millième de seconde. */
window.Music = (function () {
  'use strict';

  const TRACKS = [
    { id: 'neon',  name: 'Néon',   bpm: 118, bars: 48, root: 45, scale: [0, 3, 5, 7, 10], mood: 'synthwave', accent: '#5ce1ff' },
    { id: 'pulse', name: 'Pulse',  bpm: 132, bars: 44, root: 41, scale: [0, 2, 3, 7, 10], mood: 'techno',    accent: '#ff6ad5' },
    { id: 'nuit',  name: 'Nuit',   bpm: 96,  bars: 36, root: 40, scale: [0, 3, 7, 10, 12], mood: 'lofi',     accent: '#b28bff' },
    { id: 'orage', name: 'Orage',  bpm: 150, bars: 56, root: 38, scale: [0, 2, 5, 7, 9],  mood: 'dnb',       accent: '#7dff9e' }
  ];

  let ac = null;
  let master = null;
  let noise = null;
  let muted = false;

  let playing = false;
  let timer = null;
  let current = null;
  let startAt = 0;
  let totalSteps = 0;
  let step = 0;
  let nextT = 0;
  let ended = false;
  let endCb = null;

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function context() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.34;
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      master.connect(comp).connect(ac.destination);

      noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.2), ac.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function gainNode(peak, t, attack, decay) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  function kick(t, peak) {
    const o = ac.createOscillator();
    const g = gainNode(peak, t, 0.005, 0.22);
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.28);
  }

  function snare(t, peak) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.9;
    const g = gainNode(peak, t, 0.004, 0.13);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + 0.2);
  }

  function hat(t, peak, open) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 1.7;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7200;
    const g = gainNode(peak, t, 0.002, open ? 0.09 : 0.028);
    src.connect(hp).connect(g).connect(master);
    src.start(t);
    src.stop(t + (open ? 0.14 : 0.06));
  }

  function bass(t, freq, dur, peak) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(760, t);
    lp.frequency.exponentialRampToValueAtTime(180, t + dur);
    lp.Q.value = 6;
    const g = gainNode(peak, t, 0.008, dur);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function arp(t, freq, peak) {
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = gainNode(peak, t, 0.004, 0.11);
    o.connect(lp).connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.16);
  }

  function pad(t, freqs, dur, peak) {
    const g = gainNode(peak, t, 0.5, dur);
    freqs.forEach((f) => {
      const o = ac.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.6);
    });
    g.connect(master);
  }

  const PROG = [0, 0, 5, 3];
  const ARP_PATTERN = [0, 2, 4, 2, 1, 3, 4, 3];

  function playStep(i, t) {
    const bar = (i / 16) | 0;
    const s = i % 16;
    const tr = current;
    const isDnb = tr.mood === 'dnb';
    const isLofi = tr.mood === 'lofi';

    if (s === 0 || s === 8 || (bar % 8 === 7 && s === 14)) kick(t, isLofi ? 0.42 : 0.55);
    if (s === 4 || s === 12) snare(t, isLofi ? 0.1 : 0.16);

    if (s % 2 === 0) hat(t, s % 4 === 0 ? 0.05 : 0.028, bar % 4 === 3 && s === 14);
    if (isDnb && s % 4 === 2) hat(t, 0.022);

    const off = PROG[bar % 4];

    if (s % 2 === 0) {
      const d = [0, 0, 7, 0, 5, 0, 3, 0][(bar * 2 + ((s / 2) | 0)) % 8];
      bass(t, midi(tr.root + off + d - 12), isLofi ? 0.22 : 0.16, isLofi ? 0.13 : 0.17);
    }

    if (s % 2 === 1 || (isDnb && s % 4 === 3)) {
      const deg = tr.scale[ARP_PATTERN[(i + bar) % ARP_PATTERN.length] % tr.scale.length];
      arp(t, midi(tr.root + 12 + off + deg), isLofi ? 0.026 : 0.038);
    }

    if (s === 0 && bar % 4 === 0) {
      const chord = [0, tr.scale[2], tr.scale[4]].map((d) => midi(tr.root + off + d + 12));
      pad(t, chord, (60 / tr.bpm) * 4, 0.035);
    }
  }

  function tick() {
    if (!playing || !ac) return;
    const now = ac.currentTime;
    while (nextT < now + 0.22 && step < totalSteps) {
      playStep(step, nextT);
      nextT += 60 / current.bpm / 4;
      step += 1;
    }
    if (step >= totalSteps && now >= nextT && !ended) {
      ended = true;
      clearInterval(timer);
      timer = null;
      playing = false;
      if (endCb) {
        const cb = endCb;
        endCb = null;
        try { cb(); } catch (e) { console.error(e); }
      }
    }
  }

  function start(track, delay) {
    const c = context();
    if (!c) return false;
    stop();
    current = track;
    step = 0;
    totalSteps = track.bars * 16;
    startAt = c.currentTime + Math.max(0.06, delay || 0);
    nextT = startAt;
    playing = true;
    ended = false;
    timer = setInterval(tick, 25);
    tick();
    return true;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    playing = false;
    ended = false;
    endCb = null;
  }

  function time() {
    if (!ac || !current) return 0;
    return ac.currentTime - startAt;
  }

  function duration(track) {
    return (track.bars * 4 * 60) / track.bpm;
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 0.34;
  }

  function onEnd(cb) { endCb = cb; }

  // morceau personnalisé (Spotify ou autre) : le rythme vient d'un BPM connu
  function customTrack(bpm, bars, name) {
    return { id: 'custom', name: name || 'Personnalisé', bpm: bpm, bars: bars || 48, root: 45, scale: [0, 3, 5, 7, 10], mood: 'synthwave', accent: '#5ce1ff' };
  }

  return {
    tracks: TRACKS,
    byId: (id) => TRACKS.find((t) => t.id === id) || null,
    context: context,
    start: start,
    stop: stop,
    time: time,
    duration: duration,
    setMuted: setMuted,
    onEnd: onEnd,
    customTrack: customTrack,
    isPlaying: () => playing
  };
})();
