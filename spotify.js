/* Spotify (optionnel) : OAuth PKCE + Web Playback SDK.
   Chaque joueur doit avoir un compte Premium pour entendre le morceau.
   Toute erreur est encapsulée : le jeu continue avec ses musiques intégrées. */
window.TempoSpotify = (function () {
  'use strict';

  const CLIENT_ID = '5f5c9685b354435e8b25fd8cd4e3cdc7';
  const SCOPES = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state'
  ].join(' ');
  const API = 'https://api.spotify.com/v1';
  const TOKEN_KEY = 'tempo.spotify.v1';
  const VERIFIER_KEY = 'tempo.spotify.verifier';

  let player = null;
  let deviceId = null;
  let sdkLoading = null;
  let lastState = null;
  let lastAt = 0;
  let status = 'non connecté';
  let currentTrack = null;

  const listeners = [];

  function emit() {
    listeners.forEach((fn) => {
      try { fn(snapshot()); } catch (e) { console.error(e); }
    });
  }

  function redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  function configured() {
    return !!CLIENT_ID && CLIENT_ID.length > 10;
  }

  // ---------------------------------------------------------------- tokens
  function loadTokens() {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveTokens(t) {
    try { localStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch (e) { /* ignoré */ }
  }

  function clearTokens() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignoré */ }
  }

  function loggedIn() {
    const t = loadTokens();
    return !!(t && t.access_token);
  }

  async function accessToken() {
    const t = loadTokens();
    if (!t || !t.access_token) throw new Error('Non connecté à Spotify');
    if (t.expires_at && Date.now() < t.expires_at - 30000) return t.access_token;
    if (!t.refresh_token) throw new Error('Session Spotify expirée');
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: CLIENT_ID
    });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
    if (!res.ok) throw new Error('Rafraîchissement du jeton refusé');
    const json = await res.json();
    const next = {
      access_token: json.access_token,
      refresh_token: json.refresh_token || t.refresh_token,
      expires_at: Date.now() + (json.expires_in || 3600) * 1000
    };
    saveTokens(next);
    return next.access_token;
  }

  // ---------------------------------------------------------------- PKCE
  function randomString(len) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const bytes = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
    return out;
  }

  function base64url(bytes) {
    let str = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function challengeFor(verifier) {
    const data = new TextEncoder().encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return base64url(digest);
  }

  async function connect() {
    if (!configured()) {
      setStatus('Aucun Client ID Spotify configuré.');
      return;
    }
    const verifier = randomString(64);
    try { sessionStorage.setItem(VERIFIER_KEY, verifier); } catch (e) { /* ignoré */ }
    const challenge = await challengeFor(verifier);
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri(),
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge
    });
    window.location.href = 'https://accounts.spotify.com/authorize?' + params.toString();
  }

  async function handleCallback() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const err = params.get('error');
    if (err) {
      setStatus('Spotify : ' + err);
      return false;
    }
    if (!code) return false;

    let verifier = '';
    try { verifier = sessionStorage.getItem(VERIFIER_KEY) || ''; } catch (e) { /* ignoré */ }

    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri(),
        client_id: CLIENT_ID,
        code_verifier: verifier
      });
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      if (!res.ok) throw new Error('échange refusé (' + res.status + ')');
      const json = await res.json();
      saveTokens({
        access_token: json.access_token,
        refresh_token: json.refresh_token,
        expires_at: Date.now() + (json.expires_in || 3600) * 1000
      });
      setStatus('Connecté à Spotify.');
      // nettoie l'URL
      window.history.replaceState({}, '', redirectUri());
      return true;
    } catch (e) {
      setStatus('Connexion Spotify impossible : ' + e.message);
      return false;
    }
  }

  function logout() {
    clearTokens();
    if (player) {
      try { player.disconnect(); } catch (e) { /* ignoré */ }
      player = null;
    }
    deviceId = null;
    lastState = null;
    setStatus('Déconnecté.');
  }

  // ---------------------------------------------------------------- SDK
  function loadSdk() {
    if (window.Spotify && window.Spotify.Player) return Promise.resolve(true);
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise((resolve) => {
      let done = false;
      window.onSpotifyWebPlaybackSDKReady = () => {
        done = true;
        resolve(true);
      };
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.onerror = () => { if (!done) resolve(false); };
      document.body.appendChild(script);
      setTimeout(() => { if (!done) resolve(false); }, 12000);
    });
    return sdkLoading;
  }

  async function initPlayer() {
    if (player && deviceId) return true;
    const ok = await loadSdk();
    if (!ok) {
      setStatus('SDK Spotify indisponible (réseau bloqué ?).');
      return false;
    }
    const token = await accessToken();

    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };

      player = new window.Spotify.Player({
        name: 'TEMPO',
        getOAuthToken: (cb) => {
          accessToken().then(cb).catch(() => cb(token));
        },
        volume: 0.75
      });

      player.addListener('ready', ({ device_id }) => {
        deviceId = device_id;
        setStatus('Prêt (Premium requis).');
        done(true);
      });

      player.addListener('not_ready', () => {
        deviceId = null;
        setStatus('Lecteur indisponible.');
      });

      player.addListener('player_state_changed', (state) => {
        lastState = state;
        lastAt = performance.now();
        if (state && state.track_window && state.track_window.current_track) {
          currentTrack = state.track_window.current_track;
        }
        emit();
      });

      player.addListener('initialization_error', ({ message }) => {
        setStatus('Erreur SDK : ' + message);
        done(false);
      });
      player.addListener('authentication_error', ({ message }) => {
        setStatus('Auth refusée : ' + message);
        done(false);
      });
      player.addListener('account_error', () => {
        setStatus('Spotify Premium requis pour la lecture.');
        done(false);
      });

      player.connect().then((success) => {
        if (!success) {
          setStatus('Lecture Spotify impossible.');
          done(false);
        }
      }).catch(() => done(false));

      setTimeout(() => done(!!deviceId), 12000);
    });
  }

  async function api(path, options) {
    const token = await accessToken();
    const opts = options || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    const res = await fetch(API + path, opts);
    if (res.status === 204) return null;
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json && json.error && json.error.message ? json.error.message : 'HTTP ' + res.status;
      throw new Error(msg);
    }
    return json;
  }

  function parseTrack(input) {
    const value = String(input || '').trim();
    if (!value) return null;
    let m = value.match(/spotify:track:([A-Za-z0-9]+)/);
    if (m) return { uri: 'spotify:track:' + m[1], id: m[1] };
    m = value.match(/track\/([A-Za-z0-9]+)/);
    if (m) return { uri: 'spotify:track:' + m[1], id: m[1] };
    if (/^[A-Za-z0-9]{22}$/.test(value)) return { uri: 'spotify:track:' + value, id: value };
    return null;
  }

  async function loadTrack(input) {
    const parsed = parseTrack(input);
    if (!parsed) throw new Error('Lien Spotify invalide');
    const info = await api('/tracks/' + parsed.id);
    currentTrack = {
      uri: parsed.uri,
      id: parsed.id,
      name: info.name,
      artists: (info.artists || []).map((a) => a.name).join(', '),
      duration_ms: info.duration_ms
    };
    setStatus('Morceau chargé : ' + currentTrack.name);
    emit();
    return currentTrack;
  }

  async function play(positionMs) {
    if (!player) throw new Error('Lecteur non initialisé');
    if (!deviceId) throw new Error('Aucun appareil Spotify actif');
    const token = await accessToken();
    if (currentTrack) {
      const res = await fetch(API + '/me/player/play?device_id=' + deviceId, {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ uris: [currentTrack.uri], position_ms: Math.max(0, positionMs || 0) })
      });
      if (!res.ok && res.status !== 204) {
        const txt = await res.text().catch(() => '');
        throw new Error('Lecture refusée (' + res.status + ') ' + txt.slice(0, 80));
      }
    }
    const st = await player.getCurrentState();
    lastState = st;
    lastAt = performance.now();
    return true;
  }

  async function pause() {
    if (player) await player.pause().catch(() => null);
  }

  async function seek(ms) {
    if (player) await player.seek(ms).catch(() => null);
  }

  function position() {
    if (!lastState) return 0;
    const base = lastState.position || 0;
    if (lastState.paused) return base / 1000;
    return (base + (performance.now() - lastAt)) / 1000;
  }

  function snapshot() {
    return {
      configured: configured(),
      loggedIn: loggedIn(),
      ready: !!deviceId,
      status: status,
      track: currentTrack,
      position: position(),
      redirect: redirectUri()
    };
  }

  function setStatus(s) {
    status = s;
    emit();
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return {
    connect: connect,
    handleCallback: handleCallback,
    logout: logout,
    initPlayer: initPlayer,
    loadTrack: loadTrack,
    play: play,
    pause: pause,
    seek: seek,
    position: position,
    snapshot: snapshot,
    onChange: onChange,
    loggedIn: loggedIn,
    redirectUri: redirectUri
  };
})();
