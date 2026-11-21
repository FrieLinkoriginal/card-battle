/* Couche réseau : salons temps réel via Supabase Realtime (canaux publics).
   Présence = qui est là + skin. Broadcast = états de partie. Aucune donnée en base. */
window.TempoOnline = (function () {
  'use strict';

  const SUPABASE_URL = 'https://xjktoqdcycjpfzgmukdl.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqa3RvcWRjeWNqcGZ6Z211a2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ5MzkyNTQsImV4cCI6MjExMDUxNTI1NH0.OKM-3gZDPPCEoGGZxste0VR195pz6U5c46o5zoPUUYM';

  const EVENTS = ['start', 'state', 'over', 'bye'];
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let client = null;
  let channel = null;
  let topic = null;
  let timeoutId = null;
  let profile = null;
  let id = randomId();

  const listeners = {};
  const state = {
    status: 'idle',   // idle | connecting | ready | error
    error: '',
    code: null,
    players: [],
    self: { id: id, name: '', skin: 'b01', host: false }
  };

  function randomId() {
    let s = '';
    for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  function generateCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  function emit(name, data) {
    const cbs = listeners[name];
    if (!cbs) return;
    for (let i = 0; i < cbs.length; i++) {
      try { cbs[i](data); } catch (e) { console.error(e); }
    }
  }

  function on(name, cb) {
    (listeners[name] = listeners[name] || []).push(cb);
    return function off() {
      const arr = listeners[name] || [];
      const i = arr.indexOf(cb);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  function setStatus(status, error) {
    state.status = status;
    state.error = error || '';
    emit('status', state);
  }

  function available() {
    return !!(window.supabase && window.supabase.createClient);
  }

  function ensureClient() {
    if (client) return client;
    if (!available()) return null;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return client;
  }

  function presencePayload() {
    return {
      id: id,
      name: profile.name,
      skin: profile.skin,
      host: !!profile.host,
      joined: profile.joined
    };
  }

  function readPlayers() {
    if (!channel) return [];
    const raw = channel.presenceState() || {};
    const list = [];
    Object.keys(raw).forEach(function (key) {
      const metas = raw[key] || [];
      const m = metas[metas.length - 1];
      if (!m) return;
      list.push({
        id: m.id || key,
        name: m.name || 'Joueur',
        skin: m.skin || 'b01',
        hostFlag: !!m.host,
        joined: m.joined || 0
      });
    });
    list.sort(function (a, b) {
      if (a.hostFlag !== b.hostFlag) return a.hostFlag ? -1 : 1;
      return a.joined - b.joined;
    });
    // Un seul hôte : le premier drapeau, sinon le plus ancien.
    let hostAssigned = false;
    list.forEach(function (p) {
      if (p.hostFlag && !hostAssigned) { p.isHost = true; hostAssigned = true; }
      else p.isHost = false;
    });
    if (!hostAssigned && list.length) list[0].isHost = true;
    return list;
  }

  function syncPlayers() {
    state.players = readPlayers();
    state.self.isHost = state.players.some(function (p) { return p.id === id && p.isHost; });
    emit('players', state.players);
  }

  function clearTimer() {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  }

  function destroy() {
    clearTimer();
    if (channel && client) {
      try { client.removeChannel(channel); } catch (e) { /* ignoré */ }
    }
    channel = null;
    topic = null;
    state.code = null;
    state.players = [];
  }

  function joinRoom(code, prof) {
    if (!available()) {
      setStatus('error', 'Bibliothèque réseau indisponible.');
      return Promise.reject(new Error('supabase indisponible'));
    }
    destroy();
    ensureClient();
    profile = prof;
    id = id || randomId();
    topic = 'tempo-room-' + code;
    state.code = code;
    setStatus('connecting');

    channel = client.channel(topic, {
      config: {
        presence: { key: id },
        broadcast: { self: false, ack: false }
      }
    });

    channel.on('presence', { event: 'sync' }, syncPlayers);
    channel.on('presence', { event: 'join' }, syncPlayers);
    channel.on('presence', { event: 'leave' }, syncPlayers);

    EVENTS.forEach(function (ev) {
      channel.on('broadcast', { event: ev }, function (msg) {
        emit('event', { event: ev, payload: (msg && msg.payload) || {} });
      });
    });

    return new Promise(function (resolve, reject) {
      let settled = false;
      timeoutId = setTimeout(function () {
        if (!settled) {
          settled = true;
          setStatus('error', 'Délai dépassé : le serveur ne répond pas.');
          reject(new Error('timeout'));
        }
      }, 12000);

      channel.subscribe(function (status) {
        if (status === 'SUBSCRIBED') {
          clearTimer();
          channel.track(presencePayload()).then(function () {
            syncPlayers();
            setStatus('ready');
            if (!settled) { settled = true; resolve(code); }
          }).catch(function (e) {
            setStatus('error', 'Présence refusée : ' + (e && e.message ? e.message : 'inconnue'));
            if (!settled) { settled = true; reject(e); }
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (!settled) {
            settled = true;
            clearTimer();
            setStatus('error', 'Connexion impossible. Vérifie ta connexion et réessaie.');
            reject(new Error('channel_error'));
          }
        } else if (status === 'CLOSED') {
          if (state.status === 'ready') setStatus('idle');
        }
      });
    });
  }

  function updateProfile(partial) {
    if (profile) Object.assign(profile, partial);
    if (channel && state.status === 'ready') {
      channel.track(presencePayload()).catch(function () { /* ignoré */ });
    }
  }

  function send(event, payload) {
    if (!channel || state.status !== 'ready') return;
    try {
      channel.send({ type: 'broadcast', event: event, payload: payload });
    } catch (e) { /* ignoré */ }
  }

  function leave() {
    if (channel && state.status === 'ready') {
      try { send('bye', { id: id }); } catch (e) { /* ignoré */ }
    }
    destroy();
    setStatus('idle');
  }

  return {
    available: available,
    on: on,
    createRoom: function (prof) {
      prof.host = true;
      prof.joined = Date.now();
      return joinRoom(generateCode(), prof);
    },
    joinRoom: function (code, prof) {
      prof.host = false;
      prof.joined = Date.now();
      return joinRoom(String(code || '').toUpperCase().trim(), prof);
    },
    update: updateProfile,
    send: send,
    leave: leave,
    state: state,
    myId: function () { return id; },
    isHost: function () { return !!state.self.isHost; }
  };
})();
