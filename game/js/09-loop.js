/* neon-runner · 09-loop.js
   render pipeline, adaptive resolution, warm-up, lifecycle, resize
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- render ---------- */
/* Layer 1 holds rain, sparks, tracers and impact decals: they cost a lot of overdraw
   and contribute almost nothing to a blurred puddle, so the mirror camera skips them. */
rain.layers.set(1);
particles.layers.set(1);
tracers.forEach(t => t.m.layers.set(1));
decals.forEach(d => d.m.layers.set(1));
camera.layers.enable(1);

const mirror = new T.Matrix4().makeScale(1, -1, 1);
const reflCam = new T.PerspectiveCamera();
reflCam.matrixAutoUpdate = false;
reflCam.layers.set(0);

function render() {
  const pr = renderer.getPixelRatio();
  const w = innerWidth * pr, h = innerHeight * pr;

  // 1 — planar reflection of the wet street
  if (CFG.quality === 'high') {
    ground.visible = false; rain.visible = false;
    reflCam.projectionMatrix.copy(camera.projectionMatrix);
    reflCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    camera.updateMatrixWorld();
    reflCam.matrixWorld.multiplyMatrices(mirror, camera.matrixWorld);
    renderer.setRenderTarget(rtRefl);
    renderer.clear(true, true, false);
    renderer.render(scene, reflCam);
    ground.visible = true; rain.visible = true;
  }

  // 2 — world
  renderer.setRenderTarget(rtScene);
  renderer.clear(true, true, false);
  renderer.render(scene, camera);

  // 3 — weapon on top, own depth range
  renderer.clearDepth();
  vmCam.aspect = camera.aspect; vmCam.updateProjectionMatrix();
  renderer.render(vmScene, vmCam);

  // 4 — bloom, two octaves
  matBright.uniforms.tD.value = rtScene.texture;
  blit(matBright, rtA);
  const iters = CFG.quality === 'high' ? 2 : 1;
  matBlur.uniforms.res.value.set(w / 2, h / 2);
  for (let i = 0; i < iters; i++) {
    matBlur.uniforms.tD.value = rtA.texture; matBlur.uniforms.dir.value.set(1, 0); blit(matBlur, rtB);
    matBlur.uniforms.tD.value = rtB.texture; matBlur.uniforms.dir.value.set(0, 1); blit(matBlur, rtA);
  }
  matDown.uniforms.tD.value = rtA.texture; blit(matDown, rtC);
  matBlur.uniforms.res.value.set(w / 5, h / 5);
  for (let i = 0; i < iters; i++) {
    matBlur.uniforms.tD.value = rtC.texture; matBlur.uniforms.dir.value.set(1, 0); blit(matBlur, rtD);
    matBlur.uniforms.tD.value = rtD.texture; matBlur.uniforms.dir.value.set(0, 1); blit(matBlur, rtC);
  }

  // 5 — grade
  matFinal.uniforms.tD.value = rtScene.texture;
  matFinal.uniforms.tB.value = rtA.texture;
  matFinal.uniforms.tW.value = rtC.texture;
  matFinal.uniforms.time.value = time;
  matFinal.uniforms.hurt.value = hurtFlash;
  matFinal.uniforms.speed.value = clamp(Math.hypot(P.vel.x, P.vel.z) / 46, 0, 1) * (P.dashT > 0 ? 1 : 0.25);
  matFinal.uniforms.res.value.set(w, h);
  blit(matFinal, null);
}

const clock = new T.Clock();
let frameMs = 16.7, scaleCool = 3, perfOn = false, perfCool = 0, perfFrames = 0, frameErrors = 0;
const perfEl = $('perf');

function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta();
  let dt = Math.min(raw, 0.05);
  // the wheel slows time rather than pausing it — a free pause would be abusable in PvP
  if (typeof WHEEL !== 'undefined' && WHEEL.open) dt *= 0.35;
  renderer.info.reset();

  // Resolution follows the frame budget: drop pixels before dropping frames.
  frameMs = frameMs * 0.92 + Math.min(raw * 1000, 90) * 0.08;
  scaleCool -= dt;
  if (state === 'play' && OPT.adaptive && scaleCool <= 0) {
    if (frameMs > 21 && renderScale > 0.6) {
      renderScale = Math.max(0.6, renderScale - 0.12); applyScale(); scaleCool = 2.5; frameMs = 16.7;
    } else if (frameMs < 13 && renderScale < 1) {
      renderScale = Math.min(1, renderScale + 0.12); applyScale(); scaleCool = 4; frameMs = 16.7;
    }
  }

  try {
    update(dt);
    render();
  } catch (err) {
    frameErrors++;
    if (frameErrors < 4) console.error('Frame error:', err);
    if (frameErrors === 4) console.error('Further frame errors suppressed.');
  }

  perfFrames++;
  if (perfOn) {
    perfCool -= dt;
    if (perfCool <= 0) {
      const r = renderer.info.render;
      perfEl.textContent = Math.round(1000 / frameMs) + ' fps · ' + r.calls + ' calls · '
        + (r.triangles / 1000).toFixed(0) + 'k tris · ' + Math.round(renderScale * 100) + '% res';
      perfCool = 0.3;
    }
  }
}

/* Warm every shader before the player can start: three compiles lazily, so the first
   drone, the first shot and the first bloom pass would each stall a frame otherwise. */
function warmUp() {
  const stash = [];
  const show = o => { stash.push([o, o.visible]); o.visible = true; };
  tracers.forEach(t => show(t.m));
  decals.forEach(d => show(d.m));
  show(padGroup);
  const far = new T.Vector3(9000, 2, 9000);
  const es = ['seeker', 'gunner', 'brute'].map(t => spawnEnemy(t, far));
  const pk = [];
  Object.keys(PU).forEach(k => { dropPickup(far, k); pk.push(pickups[pickups.length - 1]); });
  const sh = makeShot();
  sh.m.position.copy(far); sh.m.visible = true;
  for (const k in gunModels) gunModels[k].visible = true;

  renderer.compile(scene, camera);
  renderer.compile(vmScene, vmCam);
  render();          // builds the bright-pass, blur, downsample and grade programs
  render();

  /* Restore the weapon actually in hand, not a hardcoded pulse. The warm-up shows every
     viewmodel for two frames to force its shaders to compile; putting 'pulse' back
     afterwards meant that if this ran after a loadout was applied you carried a Pulse
     Rifle on screen whatever you were really holding, until your next weapon switch. */
  const held = (typeof P !== 'undefined' && P.weapon) || 'pulse';
  for (const k in gunModels) gunModels[k].visible = (k === held);
  es.forEach(despawnEnemy); enemies.length = 0;
  pk.forEach(despawnPickup); pickups.length = 0;
  despawnShot(sh);
  stash.forEach(s => { s[0].visible = s[1]; });
  window.__warmed = 1;
}

/* ---------- resize & adaptive resolution ---------- */
function applyScale() {
  renderer.setPixelRatio(basePR * renderScale);
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  makeTargets();
  groundMat.uniforms.tRefl.value = rtRefl.texture;
  particles.material.uniforms.scale.value = innerHeight * renderer.getPixelRatio();
}
addEventListener('resize', applyScale);
addEventListener('resize', () => positionContractHud());

/* ---------- lifecycle ---------- */
/* Optics bought in the Armoury (opt_*) are fitted at the start of every run and behave
   like looted ones — they persist across weapon swaps, unlike a gun's integral optic. */
function applyOwnedOptics() {
  ['reflex', 'tac', 'long'].forEach(k => {
    if (owned('opt_' + k)) { P.optics[k] = 1; P.lootOptics[k] = 1; }
  });
}

function resetGame() {
  enemies.slice().forEach(despawnEnemy); enemies.length = 0;
  shots.slice().forEach(despawnShot); shots.length = 0;
  pickups.slice().forEach(despawnPickup); pickups.length = 0;
  P.hp = 100; P.shield = 0; P.reloading = 0; P.reloadPhase = 0; P.ads = false; document.body.classList.remove('ads');
  P.optics = { iron: 1 }; P.lootOptics = {}; P.scope = 'iron'; P.scopeSway = 0; P.aim = 0;
  applyOwnedOptics();   // Armoury-issued optics are fitted from the drop
  P.nades = grenadeMax() + (owned('kit_cache') ? 1 : 0); P.nadeCool = 0;
  if (owned('kit_harness')) P.shield = Math.max(P.shield, 40);   // Assault Harness
  document.body.classList.remove('tube');
handsRig.position.set(0, 0, 0); handsRig.rotation.set(0, 0, 0);
poseHands();
P.dashCool = 0; P.dashT = 0;
  P.buffs.overdrive = 0; P.buffs.focus = 0;
  P.owned = { pulse: true };
  P.ammoIn = {};
  P.mods = {};
  P.slots = loadout.slice(0, slotCount());   // PvP carries primary + secondary only
  P.slotIdx = 0;
  P.owned = {};
  P.slots.forEach(k => { if (k) { P.owned[k] = true; P.ammoIn[k] = magSize(k); } });
  // Forward Cache tops every carried magazine, not just the one in hand
  if (owned('kit_cache')) P.slots.forEach(k => { if (k) P.ammoIn[k] = magSize(k); });
  P.weapon = P.slots[0] || 'pulse';
  applyIntegralOptic(null, P.weapon);   // start scoped if you dropped in with a sniper
  P.owned[P.weapon] = true;
  P.mag = magSize(P.weapon); P.ammo = P.mag;
  for (const k in gunModels) gunModels[k].visible = (k === P.weapon);
  muzzleFlash.position.z = GUNS[P.weapon].muzz;
  buildSlotHUD();
  P.vy = 0; P.grounded = true;
  if (BOSS.active) { BOSS.active.m.g.visible = false; BOSS.active.m.blob.visible = false; BOSS.active = null; }
  $('bossBar').style.display = 'none';
  EVENT.kind = null; EVENT.t = 0;
  document.body.classList.remove('blackout');
  buildBarrelMeshes();
  renderMods();
  applyPerk();
  applyCharacter();
  if (sentry) { sentry.life = 0; sentry.g.visible = false; }
  document.body.classList.remove('ability');
  const sp = MAPS[currentMap].spawn;
  camera.position.set(sp[0], 0, sp[1]);
  P.feetY = floorAt(sp[0], sp[1]);
  camera.position.y = P.feetY + EYE_STAND;
  for (const k in gunModels) gunModels[k].visible = (k === 'pulse');
  muzzleFlash.position.z = GUNS.pulse.muzz;
  MAG_HOME.set(0, GUNS.pulse.magY || -0.08, GUNS.pulse.magZ || 0.035);
  magProp.position.copy(MAG_HOME);
  magProp.visible = false;
  lastDayPhase = '';
  dayClock = MAPS[currentMap].dayStart;
  updateDayNight(0);
  syncHUD.lastAmmo = -1;
  P.score = 0; P.kills = 0; P.combo = 1; P.comboT = 0; P.extracting = 0;
  P.yaw = 0; P.pitch = 0; P.recoil = 0; P.recoilY = 0;
  // handling state is per-run: never start a fresh run mid-spray or stuck in a crouch
  P.bloom = 0; P.sprayIdx = 0; P.sprayT = 9; P.crouchF = 0; P.crouchLock = false;
  P.vel.set(0, 0, 0);
  camera.position.set(0, EYE_STAND, 26);
  wave = 0; waveTimer = 0; spawnQueue = [];
  extraction = false; padGroup.visible = false;
  hurtFlash = 0; shakeAmt = 0;
  hud.reload.style.opacity = 0;
  hud.toast.innerHTML = '';
  setObjective('Clear ' + EXTRACT_WAVE + ' waves, then extract — or push to ' + DEEP_WAVE + ' · ' + MAPS[currentMap].name);
  syncPlayerNameUI();
  buildPips();
  syncHUD();
  syncScopeHUD();
}
function startGame() {
  reshuffleForMatch();          // a new match opens on a freshly shuffled combat list
  /* A multiplayer match pins the seed so every client builds an identical level; a solo
     run rolls a fresh one. Consumed here so it can never leak into the next solo run.
     Note this is wired as a click handler ($('play')), so it must not take arguments. */
  runSeed = (typeof forcedSeed === 'number' && forcedSeed) ? forcedSeed
            : ((Date.now() ^ (Math.random() * 0xffffffff)) | 0 || 7);
  forcedSeed = null;
  buildMapWorld();
  resetRunStats();
  initAudio();
  if (AC && AC.state === 'suspended') AC.resume();
  if (musicGain) musicGain.gain.setTargetAtTime(0.7, AC.currentTime, 2.0);

  setPlayerName($('playerName').value);
  if (playerName !== DEFAULT_NAME) toast('CALLSIGN LOCKED · ' + playerName, 0x7fe4ff);
  $('menu').classList.remove('show');
  $('end').classList.remove('show');
  $('pause').classList.remove('show');
  pausedRun = false;
  $('resumeNav').style.display = 'none';
  resetGame();
  state = 'play';
  requestLock();
  startWave();
  waveTimer = 7;
}

$('play').addEventListener('click', startGame);
$('again').addEventListener('click', startGame);
$('resume').addEventListener('click', resume);
let pausedRun = false;
$('pauseSettings').addEventListener('click', () => {
  pausedRun = true;
  $('resumeNav').style.display = 'flex';
  $('pause').classList.remove('show');
  $('menu').classList.add('show');
  showView('settings');
});
$('resumeNav').addEventListener('click', () => {
  pausedRun = false;
  $('resumeNav').style.display = 'none';
  $('menu').classList.remove('show');
  $('pause').classList.add('show');
});
$('quit').addEventListener('click', () => {
  /* Abandoning a live match has to tell the room: if we started it the round ends for
     everyone, otherwise we just drop out. Without this the others kept playing a match
     whose host had walked away, with no way for it to ever finish. */
  const wasInMatch = typeof mpLeaveMatch === 'function' && mpLeaveMatch();
  $('pause').classList.remove('show');
  $('end').classList.remove('show');
  $('menu').classList.add('show');
  pausedRun = false;
  $('resumeNav').style.display = 'none';
  showView(wasInMatch ? 'multiplayer' : 'home');
  state = 'menu';
});
$('toMenu').addEventListener('click', () => {
  $('end').classList.remove('show');
  $('menu').classList.add('show');
  showView('home');
  state = 'menu';
});
/* ---------- deployment picker: live-drawn map thumbnails ---------- */
function mapThumb(cv, key) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  const th = MAPS[key];
  const g1 = x.createLinearGradient(0, 0, 0, H);
  g1.addColorStop(0, '#0b1120'); g1.addColorStop(1, '#05070d');
  x.fillStyle = g1; x.fillRect(0, 0, W, H);
  const A = '#' + new T.Color(th.accent).getHexString();
  x.strokeStyle = A; x.fillStyle = A;
  if (key === 'rain') {                       // street grid seen from above
    x.globalAlpha = .22;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) x.fillRect(6 + i * 26, 5 + j * 26, 18, 18);
    x.globalAlpha = .9; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, H / 2); x.lineTo(W, H / 2); x.moveTo(W / 2, 0); x.lineTo(W / 2, H); x.stroke();
  } else if (key === 'yard') {                // three lanes with cut-throughs
    x.globalAlpha = .25; x.fillRect(0, 10, W, 8); x.fillRect(0, H - 18, W, 8);
    x.globalAlpha = .9; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, H / 2 - 4); x.lineTo(W, H / 2 - 4); x.moveTo(0, H / 2 + 4); x.lineTo(W, H / 2 + 4); x.stroke();
    x.globalAlpha = .5;
    for (let i = 0; i < 3; i++) x.fillRect(8 + i * 30, H / 2 - 9, 20, 18);
  } else {                                    // rooftop decks with gaps
    x.globalAlpha = .28;
    [[8, 8, 22, 18], [40, 6, 26, 20], [12, 32, 24, 18], [46, 34, 20, 16]].forEach(r => x.fillRect(r[0], r[1], r[2], r[3]));
    x.globalAlpha = .85; x.lineWidth = 2;
    x.beginPath(); x.moveTo(24, 26); x.lineTo(50, 26); x.moveTo(30, 30); x.lineTo(30, 44); x.stroke();
  }
  x.globalAlpha = 1;
}
let playerName = PROFILE.name || 'OPERATOR';
const DEFAULT_NAME = 'OPERATOR';
const MAX_NAME_LEN = 18;

function sanitizeName(raw) {
  return (raw || '').trim()
    .replace(/[^\w\s\-']/g, '')
    .slice(0, MAX_NAME_LEN) || DEFAULT_NAME;
}
function syncPlayerNameUI() {
  const home = $('homeName');
  if (home) home.textContent = playerName;
  const top = $('topbarName');
  if (top) top.textContent = playerName + ' · ' + (MAPS[currentMap] ? MAPS[currentMap].code : 'SECTOR 12');
  const inp = $('playerName');
  if (inp && document.activeElement !== inp) inp.value = playerName;
}
function setPlayerName(raw) {
  const before = playerName;
  playerName = sanitizeName(raw);
  PROFILE.name = playerName;
  saveProfile();
  syncPlayerNameUI();
  // Tell the room, or everyone keeps showing the callsign we connected with.
  if (playerName !== before && typeof mpAnnounceName === 'function') mpAnnounceName();
}
function mapUnlocked(key) {
  if (typeof mpCompetitive === 'function' && mpCompetitive()) return true;
  return owned('map_' + key);
}
function buildMapPicker() {
  const list = $('mapList');
  list.innerHTML = '';
  Object.keys(MAPS).forEach(key => {
    const th = MAPS[key];
    // Every drop zone is playable in multiplayer — credit gating decides PvE progression,
    // not who you are allowed to fight on. mapUnlocked() is the single source of truth.
    const locked = !mapUnlocked(key);
    const card = document.createElement('button');
    card.className = 'mapCard' + (key === currentMap ? ' sel' : '') + (locked ? ' locked' : '');
    card.disabled = locked;
    card.type = 'button';
    card.dataset.map = key;
    const cv = document.createElement('canvas');
    cv.width = 74; cv.height = 56;
    card.appendChild(cv);
    const body = document.createElement('div');
    body.innerHTML = '<div class="code">' + th.code + '</div><h3>' + th.name + '</h3>'
      + '<div class="tags">' + th.tags.map(t => '<span>' + t + '</span>').join('') + '</div>';
    card.appendChild(body);
    const thr = document.createElement('div');
    thr.className = 'threat';
    thr.innerHTML = [0, 1, 2].map(i => '<i class="' + (i < th.threat ? 'on' : '') + '"></i>').join('');
    card.appendChild(thr);
    if (locked) {
      const lk = document.createElement('div');
      lk.className = 'lockTag';
      const item = SHOP.find(s => s.id === 'map_' + key);
      lk.textContent = item ? item.cost.toLocaleString() + ' cr' : 'Locked';
      card.appendChild(lk);
    }
    card.addEventListener('click', () => { if (!locked) selectMap(key); });
    card.addEventListener('mouseenter', () => { $('mapBlurb').textContent = th.blurb; });
    card.addEventListener('focus', () => { $('mapBlurb').textContent = th.blurb; });
    list.appendChild(card);
    mapThumb(cv, key);
  });
  $('mapBlurb').textContent = MAPS[currentMap].blurb;
}
function selectMap(key) {
  setMap(key);
  PROFILE.settings.map = key; saveProfile();
  document.querySelectorAll('.mapCard').forEach(c => c.classList.toggle('sel', c.dataset.map === key));
  $('mapBlurb').textContent = MAPS[key].blurb;
  $('homeMap').textContent = MAPS[key].name;
  syncPlayerNameUI();
  menuBlip();
}
buildMapPicker();
$('homeMap').textContent = MAPS[currentMap].name;
syncPlayerNameUI();
const playerNameInput = $('playerName');
playerNameInput.addEventListener('input', () => setPlayerName(playerNameInput.value));
playerNameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); $('deployBtn').click(); }
});