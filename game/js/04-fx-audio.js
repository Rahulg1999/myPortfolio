/* neon-runner · 04-fx-audio.js
   rain, particles, tracers, impacts, audio engine, adaptive score, playlists
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- rain (entirely GPU-side: nothing to update on the CPU) ---------- */
const RAIN = 2600, RAIN_CELL = 84, RAIN_H = 46;
const rainGeo = new T.BufferGeometry();
(function () {
  const pos = new Float32Array(RAIN * 6);        // placeholder, real position is derived in the shader
  const base = new Float32Array(RAIN * 6);
  const par = new Float32Array(RAIN * 4);
  for (let i = 0; i < RAIN; i++) {
    const x = rand(-RAIN_CELL / 2, RAIN_CELL / 2), z = rand(-RAIN_CELL / 2, RAIN_CELL / 2);
    const y = Math.random() * RAIN_H, sp = rand(46, 72);
    for (let v = 0; v < 2; v++) {
      base[i * 6 + v * 3] = x; base[i * 6 + v * 3 + 1] = y; base[i * 6 + v * 3 + 2] = z;
      par[i * 4 + v * 2] = sp; par[i * 4 + v * 2 + 1] = v;   // v=1 is the tail vertex
    }
  }
  rainGeo.setAttribute('position', new T.BufferAttribute(pos, 3));
  rainGeo.setAttribute('aBase', new T.BufferAttribute(base, 3));
  rainGeo.setAttribute('aPar', new T.BufferAttribute(par, 2));
})();
const rainMat = new T.ShaderMaterial({
  transparent: true, blending: T.AdditiveBlending, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uCam: { value: new T.Vector3() }, uTint: { value: C(0x9fc4ff) }, uOpacity: { value: 1 } },
  vertexShader: `
    attribute vec3 aBase; attribute vec2 aPar;
    uniform float uTime; uniform vec3 uCam;
    varying float vFade;
    void main(){
      float cell = ` + RAIN_CELL.toFixed(1) + `;
      vec3 p;
      p.x = aBase.x + floor((uCam.x - aBase.x)/cell + 0.5)*cell;
      p.z = aBase.z + floor((uCam.z - aBase.z)/cell + 0.5)*cell;
      p.y = mod(aBase.y - uTime*aPar.x, ` + RAIN_H.toFixed(1) + `) + aPar.y*1.05;
      vec4 mv = modelViewMatrix*vec4(p,1.0);
      float d = length(p.xz - uCam.xz);
      vFade = smoothstep(cell*0.5, cell*0.16, d) * 0.22;
      gl_Position = projectionMatrix*mv;
    }`,
  fragmentShader: `
    varying float vFade; uniform vec3 uTint; uniform float uOpacity;
    void main(){ gl_FragColor = vec4(uTint, vFade * uOpacity); }`
});
const rain = new T.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);

/* ---------- particles ---------- */
const PMAX = 1000;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX);
const pVel = [], pLife = [], pMax = [];
for (let i = 0; i < PMAX; i++) { pVel.push(new T.Vector3()); pLife.push(0); pMax.push(1); pPos[i * 3 + 1] = -999; }
const pGeo = new T.BufferGeometry();
pGeo.setAttribute('position', new T.BufferAttribute(pPos, 3));
pGeo.setAttribute('pcolor', new T.BufferAttribute(pCol, 3));
pGeo.setAttribute('size', new T.BufferAttribute(pSize, 1));
const particles = new T.Points(pGeo, new T.ShaderMaterial({
  transparent: true, blending: T.AdditiveBlending, depthWrite: false,
  uniforms: { scale: { value: innerHeight } },
  vertexShader: `
    attribute float size; attribute vec3 pcolor; varying vec3 vC; uniform float scale;
    void main(){ vC=pcolor; vec4 mv=modelViewMatrix*vec4(position,1.0);
      gl_PointSize = size * scale / max(-mv.z, 0.1); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `
    varying vec3 vC;
    void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
      gl_FragColor=vec4(vC, 1.0-d*2.0); }`
}));
particles.frustumCulled = false;
scene.add(particles);
let pCur = 0, pAlive = 0;
function spark(pos, col, n, spread, speed, life, size) {
  const c = C(col);
  for (let k = 0; k < n; k++) {
    const i = pCur = (pCur + 1) % PMAX;
    pPos[i * 3] = pos.x; pPos[i * 3 + 1] = pos.y; pPos[i * 3 + 2] = pos.z;
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
    pSize[i] = size * rand(0.6, 1.4);
    pVel[i].set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize()
      .multiplyScalar(speed * rand(0.35, 1)).addScaledVector(spread, 1);
    pLife[i] = pMax[i] = life * rand(0.6, 1.2);
    pAlive++;
  }
}
function updateParticles(dt) {
  if (pAlive <= 0) return;
  pAlive = 0;
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pAlive++;
    pLife[i] -= dt;
    const f = Math.max(pLife[i], 0) / pMax[i];
    pVel[i].y -= 22 * dt;
    pVel[i].multiplyScalar(1 - 2.2 * dt);
    pPos[i * 3] += pVel[i].x * dt; pPos[i * 3 + 1] += pVel[i].y * dt; pPos[i * 3 + 2] += pVel[i].z * dt;
    if (pPos[i * 3 + 1] < 0.05) { pPos[i * 3 + 1] = 0.05; pVel[i].y *= -0.3; pVel[i].x *= 0.6; pVel[i].z *= 0.6; }
    pSize[i] = Math.max(pSize[i] * (1 - 0.9 * dt), 0.001);
    if (pLife[i] <= 0) pPos[i * 3 + 1] = -999;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.size.needsUpdate = true;
  pGeo.attributes.pcolor.needsUpdate = true;
}

/* ---------- tracers & impacts ---------- */
const tracers = [];
const tracerGeo = new T.CylinderGeometry(0.018, 0.018, 1, 5, 1, true);
tracerGeo.translate(0, 0.5, 0);
tracerGeo.rotateX(Math.PI / 2);
for (let i = 0; i < 14; i++) {
  const m = new T.Mesh(tracerGeo, new T.MeshBasicMaterial({ color: C(0xfff0c0), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  m.visible = false; m.frustumCulled = false; scene.add(m); tracers.push({ m: m, t: 0 });
}
let tracerIdx = 0;
function tracer(a, b, col, k) {
  const o = tracers[tracerIdx = (tracerIdx + 1) % tracers.length];
  o.m.visible = true; o.t = col && k > 2 ? 0.16 : 0.075;
  o.dur = o.t;
  o.m.position.copy(a); o.m.lookAt(b);
  o.m.scale.set(k || 1, k || 1, a.distanceTo(b));
  if (col) o.m.material.color.copy(col);
  o.m.material.opacity = 1;
}
const decalTex = (function () {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.35, 'rgba(255,140,60,0.6)'); g.addColorStop(1, 'rgba(255,80,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
})();
const decals = [];
for (let i = 0; i < 10; i++) {
  const m = new T.Mesh(new T.PlaneGeometry(0.9, 0.9), new T.MeshBasicMaterial({ map: decalTex, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
  m.visible = false; scene.add(m); decals.push({ m: m, t: 0 });
}
let decalIdx = 0;
function impact(p, n) {
  const o = decals[decalIdx = (decalIdx + 1) % decals.length];
  o.m.visible = true; o.t = 0.25;
  o.m.position.copy(p).addScaledVector(n, 0.04);
  o.m.lookAt(p.clone().add(n));
  o.m.material.color.setHex(0xffffff);
  o.m.material.opacity = 1;
  o.m.scale.setScalar(rand(0.7, 1.3));
}

/* ---------- audio ---------- */
let AC = null, master = null, noiseBuf = null, rainGain = null, musicGain = null;
function initAudio() {
  if (AC) return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  AC = new Ctx();
  master = AC.createGain(); master.gain.value = 0.5; master.connect(AC.destination);
  const len = AC.sampleRate * 2;
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
  // rain bed
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
  rainGain = AC.createGain(); rainGain.gain.value = 0.05;
  src.connect(hp); hp.connect(rainGain); rainGain.connect(master); src.start();
  // sub drone
  musicGain = AC.createGain(); musicGain.gain.value = 0.0; musicGain.connect(master);
  // dedicated bus for the score, gently compressed so kicks don't swamp gunfire
  MUSIC.bus = AC.createGain();
  MUSIC.bus.gain.value = MUSIC.mode === 'score' ? MUSIC.vol : 0;
  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
  MUSIC.bus.connect(comp); comp.connect(master);
  MUSIC.next = AC.currentTime + 0.1;
  if (!MUSIC.timer) MUSIC.timer = setInterval(musicScheduler, 25);
  /* The three-oscillator sub-drone that used to live here has been REMOVED. It ran
     unconditionally — startGame() ramped musicGain to 0.7 — so it hummed underneath your
     own tracks as well as the adaptive score, with no way to turn it off. musicGain is
     kept (startGame still ramps it) so nothing downstream breaks; it simply has no
     source connected any more. */
}
/* ============================================================
   SOUNDTRACK
   Two sources, one bus:
     'score'  — an original adaptive cue sequenced in-engine. Four intensity
                tiers driven by what is happening on screen.
     'custom' — your own audio files or stream URLs, played through an
                <audio> element (no decode step, no CORS wall, seeks fine).
   ============================================================ */
const MUSIC = {
  mode: 'score', vol: 0.55, el: null, fade: null, playing: null,
  lists: { menu: [], game: [] }, idx: { menu: -1, game: -1 },
  bpm: 128, step: 0, next: 0, timer: null, intensity: 0, target: 0, bus: null
};
const SCALE = [0, 3, 5, 7, 10, 12, 15];          // A natural minor pentatonic-ish
const ROOT = 55;                                  // A1
const midi = n => ROOT * Math.pow(2, n / 12);

const PAT = {
  kick:  [1,0,0,0, 0,0,1,0, 0,0,1,0, 0,0,0,0],
  snare: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,1],
  hat:   [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,1,1,0],
  bass:  [0,0,0,0, 0,3,0,0, 5,0,0,0, 3,0,2,0],
  stab:  [0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]
};

function mKick(t, g) {
  const o = AC.createOscillator(), gn = AC.createGain();
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  gn.gain.setValueAtTime(g, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  o.connect(gn); gn.connect(MUSIC.bus); o.start(t); o.stop(t + 0.36);
}
function mNoise(t, dur, type, freq, g, q) {
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  const gn = AC.createGain();
  gn.gain.setValueAtTime(g, t);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(gn); gn.connect(MUSIC.bus);
  s.start(t); s.stop(t + dur + 0.02);
}
function mTone(t, freq, dur, type, g, detune, filter) {
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (detune) o.detune.value = detune;
  const gn = AC.createGain();
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(g, t + 0.012);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (filter) {
    const f = AC.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(filter, t); f.Q.value = 7;
    f.frequency.exponentialRampToValueAtTime(Math.max(filter * 0.35, 120), t + dur);
    o.connect(f); node = f;
  }
  node.connect(gn); gn.connect(MUSIC.bus);
  o.start(t); o.stop(t + dur + 0.03);
}

/* One 16th note. Layers switch in as intensity climbs. */
function musicStep(n, t) {
  const I = MUSIC.intensity;
  const bar = Math.floor(n / 16) % 8;
  const i = n % 16;

  if (I >= 1 && PAT.kick[i]) mKick(t, 0.55 + I * 0.08);
  if (I >= 1) {
    const b = PAT.bass[i];
    if (b) mTone(t, midi(b), 0.30, 'sawtooth', 0.24, 0, 300 + I * 220);
    if (i === 0) mTone(t, midi(0), 0.9, 'sawtooth', 0.16, -6, 200);
  }
  if (I >= 2 && PAT.hat[i]) mNoise(t, 0.045, 'highpass', 7200, 0.16, 1.2);
  if (I >= 3 && i % 2 === 1) mNoise(t, 0.028, 'highpass', 9000, 0.07, 1.2);   // double time
  if (I >= 2 && PAT.snare[i]) {
    mNoise(t, 0.14, 'bandpass', 1900, 0.30, 0.9);
    mTone(t, 180, 0.09, 'triangle', 0.10);
  }
  if (I >= 2) {                                   // arpeggio, sixteenth pulse
    const deg = SCALE[(i + bar) % SCALE.length];
    if (i % (I >= 3 ? 1 : 2) === 0)
      mTone(t, midi(deg + 24), 0.13, 'square', 0.055, (i % 4) * 3, 1400 + I * 700);
  }
  if (I >= 3 && PAT.stab[i]) {                    // industrial hit
    mNoise(t, 0.5, 'bandpass', 420, 0.34, 2.4);
    mTone(t, midi(-12), 0.55, 'sawtooth', 0.22, 0, 260);
  }
  if (i === 0 && bar === 7 && I >= 2) {           // riser into the next phrase
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + 1.8);
    const gn = AC.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.18, t + 1.7);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 1.95);
    s.connect(f); f.connect(gn); gn.connect(MUSIC.bus);
    s.start(t); s.stop(t + 2);
  }
}

function musicScheduler() {
  if (!AC || MUSIC.mode !== 'score') return;
  const spb = 60 / MUSIC.bpm / 4;
  while (MUSIC.next < AC.currentTime + 0.15) {
    if (MUSIC.next < AC.currentTime) MUSIC.next = AC.currentTime + 0.02;
    musicStep(MUSIC.step, MUSIC.next);
    MUSIC.step++;
    MUSIC.next += spb;
  }
}

/* Intensity follows the fight, and eases rather than snapping. */
function musicIntensity(dt) {
  let want = 0;
  if (state === 'play') {
    want = 1;
    if (enemies.length >= 3 || P.fireCool > 0) want = 2;
    if (BOSS.active || P.hp < 35 || enemies.length >= 8) want = 3;
  }
  MUSIC.target = want;
  if (MUSIC.intensity < MUSIC.target) MUSIC.intensity = MUSIC.target;      // rise instantly
  else if (MUSIC.intensity > MUSIC.target) {
    MUSIC.ease = (MUSIC.ease || 0) + dt;
    if (MUSIC.ease > 3.5) { MUSIC.intensity--; MUSIC.ease = 0; }           // fall slowly
  } else MUSIC.ease = 0;
}

/* ---------- custom playlists: separate menu and combat slots ---------- */
function musicContext() { return state === 'play' ? 'game' : 'menu'; }
function listOf(which) { return MUSIC.lists[which]; }
/* Fall back to the other slot if the wanted one is empty, so a single
   playlist still covers the whole game. */
function activeList() {
  const want = musicContext();
  if (listOf(want).length) return want;
  const other = want === 'game' ? 'menu' : 'game';
  return listOf(other).length ? other : null;
}
function musicEl() {
  if (!MUSIC.el) {
    MUSIC.el = new Audio();
    MUSIC.el.crossOrigin = 'anonymous';
    MUSIC.el.addEventListener('ended', () => musicNext(1));
    MUSIC.el.addEventListener('error', () => {
      toast('TRACK FAILED TO LOAD', 0xff2f7a);
      const L = listOf(MUSIC.playing || 'menu');
      if (L && L.length > 1) musicNext(1);
    });
  }
  return MUSIC.el;
}
/* Short crossfade so menu -> combat isn't a hard cut. */
function fadeTo(vol, ms, then) {
  const el = musicEl();
  if (MUSIC.fade) clearInterval(MUSIC.fade);
  const from = el.volume, steps = Math.max(1, Math.round(ms / 30));
  let i = 0;
  MUSIC.fade = setInterval(() => {
    i++;
    el.volume = clamp(from + (vol - from) * (i / steps), 0, 1);
    if (i >= steps) { clearInterval(MUSIC.fade); MUSIC.fade = null; if (then) then(); }
  }, 30);
}
function musicPlayIdx(i, which) {
  which = which || activeList();
  if (!which) return;
  const L = listOf(which);
  if (!L.length) return;
  MUSIC.playing = which;
  MUSIC.idx[which] = (i + L.length) % L.length;
  const t = L[MUSIC.idx[which]];
  const el = musicEl();
  el.src = t.url;
  el.volume = 0;
  /* Self-correcting playlist: the scan is deliberately optimistic (see probeTrack), so a
     entry that turns out not to exist is dropped here and the next one is tried. One pass
     through the list prunes anything the probe guessed wrong about. */
  el.onerror = () => {
    el.onerror = null;
    const at = L.indexOf(t);
    if (at >= 0) L.splice(at, 1);
    if (!L.length) { MUSIC.playing = null; autoMusicSource(); return; }
    musicPlayIdx(MUSIC.idx[which], which);
  };
  const p = el.play();
  if (p && p.catch) p.catch(() => {});
  fadeTo(MUSIC.vol, 700);
  toast('NOW PLAYING · ' + t.name.toUpperCase().slice(0, 28), which === 'game' ? 0xff2f7a : 0x7fe4ff);

}
/* Next track. On reaching the end of a list it reshuffles before wrapping, so repeated
   skipping keeps producing a new order rather than cycling the same sequence. */
function musicNext(dir) {
  const which = MUSIC.playing || activeList();
  if (!which) return;
  const L = listOf(which);
  if (!L.length) return;
  const step = dir || 1;
  const nextIdx = MUSIC.idx[which] + step;
  if (nextIdx >= L.length || nextIdx < 0) {
    const current = L[MUSIC.idx[which]];
    shuffleMusic(which);
    // never open the reshuffled pass on the track that just played
    if (L.length > 1 && current && L[0] === current) { L.push(L.shift()); }
    musicPlayIdx(0, which);
    return;
  }
  musicPlayIdx(nextIdx, which);
}
function musicStop() { if (MUSIC.el) MUSIC.el.pause(); }
/* Runs every frame: swaps slot when you deploy or come back to the menu. */
function musicWatchContext() {
  if (MUSIC.mode !== 'custom') return;
  const want = activeList();
  if (!want) { musicStop(); MUSIC.playing = null; return; }
  if (MUSIC.playing !== want) {
    const first = MUSIC.playing === null;
    const start = MUSIC.idx[want] < 0 ? 0 : MUSIC.idx[want];
    if (first) musicPlayIdx(start, want);
    else fadeTo(0, 500, () => musicPlayIdx(start, want));
  } else if (MUSIC.el && MUSIC.el.paused && MUSIC.el.src) {
    const p = MUSIC.el.play(); if (p && p.catch) p.catch(() => {});
  }
}
/* The Source dropdown is gone. There is no decision for the player to make: if there
   are files in music/, they play; if there are not, the adaptive score covers. This is
   called after a scan and whenever the context changes. */
function autoMusicSource() {
  const haveFiles = MUSIC.lists.menu.length > 0 || MUSIC.lists.game.length > 0;
  setMusicMode(haveFiles ? 'custom' : 'score');
}
function setMusicMode(mode) {
  MUSIC.mode = mode;
  if (mode === 'custom') {
    MUSIC.intensity = 0;
    MUSIC.playing = null;
    musicWatchContext();
  } else {
    musicStop();
    MUSIC.playing = null;
    MUSIC.next = AC ? AC.currentTime + 0.05 : 0;
  }
  if (MUSIC.bus) MUSIC.bus.gain.value = mode === 'score' ? MUSIC.vol : 0;
  PROFILE.settings.musicMode = mode;
  saveProfile();
}
function setMusicVol(v) {
  MUSIC.vol = v;
  if (MUSIC.bus) MUSIC.bus.gain.value = MUSIC.mode === 'score' ? v : 0;
  if (MUSIC.el && !MUSIC.fade) MUSIC.el.volume = v;
  PROFILE.settings.musicVol = v;
  saveProfile();
}
/* ---------- folder playlists ----------
   Music is files on disk, not a UI. Drop tracks into:

       music/menu/     played in the menus
       music/combat/   played during a run

   named 01, 02, 03 … (any common audio extension). The game finds them on load and
   shuffles each list at the start of every match.

   Why numbered names: a browser cannot list a directory, and doing it server-side was
   explicitly not wanted — so the game probes `01`, `02`, … until it misses several in a
   row. Numbering is the price of needing no server and no manifest to maintain. */
const MUSIC_EXTS = ['mp3', 'ogg', 'm4a', 'opus', 'wav', 'webm'];
const MUSIC_MAX = 40;          // highest number looked for
const MUSIC_MISS_STOP = 3;     // give up after this many consecutive missing numbers
const MUSIC_FOLDER = { menu: 'music/menu/', game: 'music/combat/' };

/* Does a track exist at this base name? Resolves to the working URL, or null.

   Two strategies, in order:
     1. HEAD request — instant and definitive, and the only one that scales. Served over
        http(s) this is the path taken.
     2. <audio> metadata probe — the fallback for file:// where fetch is blocked.

   The audio probe alone was not good enough: it waits for `loadedmetadata`, which for a
   multi-megabyte MP3 can exceed a short timeout, and a track that times out is silently
   dropped from the playlist. That is exactly what happened to a 4.8 MB file — it existed,
   was perfectly playable, and simply never appeared. Hence HEAD first, and a much longer
   timeout on the fallback. */
/* Does a track exist at `base` (no extension)? Resolves to the working URL, or null.

   This has to work from BOTH `http://` (via server.js) and a plain `file://` open, and
   those behave very differently:

     - `fetch()` is blocked outright on file:// (opaque origin), so a HEAD probe there
       rejects. That is "cannot tell", NOT "missing" — fall through to the audio probe.
     - `<audio>` on file:// may never fire `loadedmetadata` at all, depending on the
       browser. Waiting for a positive signal therefore reports every track missing.

   So the audio probe is inverted: a MISSING file errors almost immediately, so the
   absence of an error within a short window is taken as "present". Being wrong that way
   is cheap — musicPlayIdx prunes any track that fails to load when it is actually
   reached, so the list self-corrects on first play. Being wrong the other way (what the
   old code did) means a correct music folder plays nothing at all. */
let probeAssumed = false;   // true when the last probe timed out rather than confirming
function probeTrack(base) {
  probeAssumed = false;
  const tryHead = (url) => fetch(url, { method: 'HEAD', cache: 'no-store' })
    .then(r => (r && r.ok) ? url : null)
    .catch(() => undefined);          // undefined = "could not tell", fall through to audio

  const tryAudio = (url) => new Promise(resolve => {
    const a = new Audio();
    a.preload = 'metadata';
    let settled = false;
    const done = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      resolve(ok ? url : null);
    };
    // No error by now: assume present. A missing local file errors in milliseconds.
    const timer = setTimeout(() => { probeAssumed = true; done(true); }, 900);
    a.addEventListener('loadedmetadata', () => done(true), { once: true });
    a.addEventListener('canplaythrough', () => done(true), { once: true });
    a.addEventListener('loadeddata', () => done(true), { once: true });
    a.addEventListener('durationchange', () => done(true), { once: true });
    a.addEventListener('suspend', () => done(true), { once: true });
    a.addEventListener('error', () => done(false), { once: true });
    a.src = url;
    try { a.load(); } catch (e) {}
  });

  return (async () => {
    for (const ext of MUSIC_EXTS) {
      const url = base + '.' + ext;
      if (typeof fetch === 'function' && location.protocol !== 'file:') {
        const head = await tryHead(url);
        if (head) return head;
        if (head === null) continue;       // definitively absent — next extension
      }
      const viaAudio = await tryAudio(url); // fetch unavailable or inconclusive
      if (viaAudio) return viaAudio;
    }
    return null;
  })();
}

async function scanMusicFolder(which) {
  const dir = MUSIC_FOLDER[which];
  const list = MUSIC.lists[which];
  list.length = 0;
  let misses = 0, assumed = 0;
  for (let n = 1; n <= MUSIC_MAX && misses < MUSIC_MISS_STOP; n++) {
    const pad = String(n).padStart(2, '0');
    let url = await probeTrack(dir + pad);
    if (!url && n < 10) url = await probeTrack(dir + n);   // also accept unpadded 1..9
    if (url && probeAssumed) assumed++; else if (url) assumed = 0;
    if (assumed >= 2) break;          // walked off the end of a folder we cannot verify
    if (url) {
      misses = 0;
      list.push({ name: decodeURIComponent(url.split('/').pop().replace(/\.[^.]+$/, '')), url: url, local: false });
    } else misses++;
  }
  return list.length;
}

/* Scan both folders once at boot. Silent when the folders are empty — the built-in
   adaptive score just keeps playing. */
let musicScanned = false;
async function scanMusicLibrary() {
  if (musicScanned) return;
  musicScanned = true;
  try {
    const [m, g] = [await scanMusicFolder('menu'), await scanMusicFolder('game')];
    shuffleMusic('menu'); shuffleMusic('game');
    autoMusicSource();
    if (m || g) toast('SOUNDTRACK · ' + m + ' MENU / ' + g + ' COMBAT', 0x35ffc4);
    updateMusicStatus(m, g);
  } catch (e) { updateMusicStatus(0, 0); }
}

/* Fisher-Yates. Called at the start of every match so a run never opens on the same
   track twice in a row (unless there is only one). */
function shuffleMusic(which) {
  const L = MUSIC.lists[which];
  for (let i = L.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = L[i]; L[i] = L[j]; L[j] = t;
  }
  MUSIC.idx[which] = -1;
}
function reshuffleForMatch() {
  shuffleMusic('game');
  if (MUSIC.mode === 'custom' && MUSIC.lists.game.length) {
    MUSIC.playing = null;          // force musicWatchContext to start the new first track
  }
}
function updateMusicStatus(m, g) {
  const el = $('musicStatus');
  if (!el) return;
  const total = (m || 0) + (g || 0);
  const isFile = location.protocol === 'file:';
  if (total) {
    el.textContent = m + ' menu track' + (m === 1 ? '' : 's') + ' · '
      + g + ' combat track' + (g === 1 ? '' : 's') + ' found';
    el.className = 'musicStatus ok';
    return;
  }
  /* Opened straight off disk, browsers restrict what a file:// page may load, and media
     is one of the restricted things — so a perfectly correct music folder can come back
     empty. Say so instead of leaving the player hunting for a naming mistake. */
  el.textContent = isFile
    ? 'No tracks readable — the game was opened as a file. Browsers block local media this way. Run "node server.js" and open the address it prints.'
    : 'No files found — using the built-in adaptive score.';
  el.className = 'musicStatus';
}

function noise(dur, type, freq, gain, q) {
  if (!AC) return;
  const s = AC.createBufferSource(); s.buffer = noiseBuf;
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
  const g = AC.createGain(); g.gain.setValueAtTime(gain, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(); s.stop(AC.currentTime + dur + 0.02);
  return f;
}
function tone(f0, f1, dur, type, gain) {
  if (!AC) return;
  const o = AC.createOscillator(); o.type = type || 'sine';
  o.frequency.setValueAtTime(f0, AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), AC.currentTime + dur);
  const g = AC.createGain();
  g.gain.setValueAtTime(0.0001, AC.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, AC.currentTime + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur);
  o.connect(g); g.connect(master); o.start(); o.stop(AC.currentTime + dur + 0.02);
}
const sfx = {
  shot() { noise(0.14, 'bandpass', 1500, 0.5, 0.8); tone(320, 60, 0.11, 'square', 0.16); },
  shotgun() { noise(0.34, 'lowpass', 1200, 0.75, 1); tone(190, 44, 0.26, 'square', 0.22); },
  rail() { tone(1900, 160, 0.34, 'sawtooth', 0.20); noise(0.28, 'highpass', 2600, 0.34, 3); },
  swap() { tone(420, 620, 0.07, 'square', 0.10); setTimeout(() => tone(880, 880, 0.05, 'square', 0.07), 90); },
  power() { [0, 90, 180].forEach((d, i) => setTimeout(() => tone([523, 659, 880][i], [523, 659, 880][i], 0.28, 'triangle', 0.12), d)); },
  windup() { tone(90, 300, 0.45, 'sawtooth', 0.06); },
  hit() { tone(1400, 900, 0.05, 'square', 0.10); },
  crit() { tone(2200, 1500, 0.07, 'square', 0.13); },
  kill() { noise(0.45, 'lowpass', 900, 0.55, 1); tone(180, 40, 0.4, 'sawtooth', 0.16); },
  hurt() { noise(0.25, 'lowpass', 500, 0.5, 1); tone(150, 60, 0.22, 'sine', 0.2); },
  dry() { tone(240, 200, 0.04, 'square', 0.07); },
  reload() { tone(500, 380, 0.05, 'square', 0.08); setTimeout(() => tone(700, 520, 0.06, 'square', 0.09), 260); },
  dash() { noise(0.34, 'bandpass', 2400, 0.35, 2); },
  jump() { tone(280, 420, 0.09, 'triangle', 0.07); },
  blast() { noise(0.7, 'lowpass', 700, 0.9, 1); tone(140, 32, 0.65, 'sawtooth', 0.26); },
  alarm() { [0, 260, 520].forEach(d => setTimeout(() => tone(660, 440, 0.3, 'square', 0.11), d)); },
  pickup() { tone(660, 990, 0.14, 'triangle', 0.13); },
  wave() { tone(110, 220, 0.7, 'sawtooth', 0.12); setTimeout(() => tone(165, 330, 0.7, 'sawtooth', 0.10), 140); },
  ping() { tone(1320, 1320, 0.18, 'sine', 0.10); },
  win() {[0, 160, 320, 560].forEach((d, i) => setTimeout(() => tone([392, 523, 659, 784][i], [392, 523, 659, 784][i], 0.5, 'triangle', 0.13), d)); },
  lose() { tone(220, 55, 1.4, 'sawtooth', 0.18); }
};
