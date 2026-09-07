/* neon-runner · 06-player.js
   operator abilities, sentry, player state, input, weapon logic, melee
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- ability engine ---------- */
function applyCharacter() {
  const c = CH(), h = c.hands, m = c.mods || {};
  gloveMat.color.copy(C(h.glove));
  glovePad.color.copy(C(h.pad));
  cuffMat.color.copy(C(h.cuff));
  sleeveMat.color.copy(C(h.sleeve));
  strapMat.color.copy(C(h.strap));
  skinMat.color.copy(C(h.skin));
  P.charDmg = m.dmg || 1;
  P.charHeal = m.heal || 1;
  P.charCrit = m.crit || 1;
  P.charAggro = m.aggro || 1;
  P.maxHp += m.hp || 0;
  P.speedMul *= m.speed || 1;
  P.dashMax *= m.dash || 1;
  P.reloadMul *= m.reload || 1;
  P.abilityCool = 0;
  P.abilityT = 0;
  P.ability = c.ability.id;
  syncAbilityHUD();
}
function activateAbility() {
  if (state !== 'play' || P.abilityCool > 0 || P.abilityT > 0) return;
  const a = CH().ability;
  P.abilityT = a.dur;
  P.abilityCool = a.cd + a.dur;
  sfx.power();
  toast(a.name.toUpperCase() + ' ACTIVE', a.col);
  shakeAmt = Math.min(shakeAmt + 0.2, 0.6);
  spark(tmpV.copy(camera.position).setY(P.feetY + 0.4), a.col, 26, tmpV2.set(0, 4, 0), 7, 0.6, 0.07);
  document.body.style.setProperty('--abil', '#' + new T.Color(a.col).getHexString());
  document.body.classList.add('ability');
  if (P.ability === 'triage') P.hp = Math.min(P.maxHp, P.hp + 45 * P.charHeal);
  if (P.ability === 'aegis') P.shield = Math.max(P.shield, 60);
  if (P.ability === 'sentry') deploySentry();
}
function updateAbility(dt) {
  if (P.abilityCool > 0) P.abilityCool = Math.max(0, P.abilityCool - dt);
  if (P.abilityT > 0) {
    P.abilityT = Math.max(0, P.abilityT - dt);
    if (P.ability === 'triage') P.hp = Math.min(P.maxHp, P.hp + 14 * dt);
    if (P.ability === 'phase' && keys.fire) P.abilityT = 0;      // firing breaks stealth
    if (P.abilityT === 0) {
      document.body.classList.remove('ability');
      toast(CH().ability.name.toUpperCase() + ' ENDED', 0x5c6b8c);
    }
  }
  updateSentry(dt);
  syncAbilityHUD();
}
const ABIL = {
  on: id => P.abilityT > 0 && P.ability === id
};

/* ---------- engineer sentry ---------- */
let sentry = null;
function deploySentry() {
  if (!sentry) {
    const g2 = new T.Group();
    const base = new T.Mesh(new T.CylinderGeometry(0.42, 0.52, 0.22, 10), new T.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.5, metalness: 0.7 }));
    g2.add(base);
    const post = new T.Mesh(new T.CylinderGeometry(0.09, 0.09, 0.5, 8), base.material);
    post.position.y = 0.34; g2.add(post);
    const head = new T.Group(); head.position.y = 0.66; g2.add(head);
    head.add(new T.Mesh(new T.BoxGeometry(0.34, 0.26, 0.4), base.material));
    const barrel = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.44, 8), base.material);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.34; head.add(barrel);
    const eye = new T.Mesh(new T.SphereGeometry(0.07, 8, 6), new T.MeshBasicMaterial({ color: C(0xffd9a0) }));
    eye.position.set(0, 0.1, -0.18); head.add(eye);
    for (const s of [-1, 1]) {
      const leg = new T.Mesh(new T.BoxGeometry(0.06, 0.06, 0.34), base.material);
      leg.position.set(s * 0.3, -0.06, 0.1); leg.rotation.x = 0.5; g2.add(leg);
    }
    scene.add(g2);
    sentry = { g: g2, head: head, life: 0, cool: 0 };
  }
  camera.getWorldDirection(tmpV);
  tmpV.y = 0; tmpV.normalize();
  const px = camera.position.x + tmpV.x * 2.2, pz = camera.position.z + tmpV.z * 2.2;
  sentry.g.position.set(px, floorAt(px, pz) + 0.11, pz);
  sentry.g.visible = true;
  sentry.life = CH().ability.dur;
  sentry.cool = 0.3;
}
function updateSentry(dt) {
  if (!sentry || sentry.life <= 0) return;
  sentry.life -= dt;
  if (sentry.life <= 0) {
    sentry.g.visible = false;
    spark(sentry.g.position, 0xffd9a0, 14, tmpV2.set(0, 1, 0), 5, 0.4, 0.05);
    return;
  }
  // acquire the nearest hostile in range and put rounds into it
  let best = null, bd = 34;
  for (let i = 0; i < enemies.length; i++) {
    const d = enemies[i].g.position.distanceTo(sentry.g.position);
    if (d < bd) { bd = d; best = enemies[i]; }
  }
  if (!best) return;
  sentry.head.lookAt(best.g.position);
  sentry.cool -= dt;
  if (sentry.cool <= 0) {
    sentry.cool = 0.22;
    damageEnemy(best, 0.85, best.g.position, false);
    tracer(sentry.g.position.clone().setY(sentry.g.position.y + 0.66), best.g.position, C(0xffd9a0), 1);
    tone(880, 620, 0.05, 'square', 0.05);
  }
}

/* ---------- player ---------- */
const P = {
  hp: 100, maxHp: 100, shield: 0, ammo: 30, mag: 30,
  weapon: 'pulse', owned: { pulse: true }, ammoIn: { pulse: 30, scatter: 8, rail: 5 },
  buffs: { overdrive: 0, focus: 0 },
  reloading: 0, reloadMax: 1.25, ads: false, reloadPhase: 0, fireCool: 0, dashCool: 0, dashT: 0, iFrames: 0,
  feetY: 0, vy: 0, grounded: true, mods: {}, magMul: 1, waveMinHp: 100,
  coyote: 0, jumpBuf: 0, jumpHeld: false,   // see the movement block in update()
  burstLeft: 0, meleeT: 0, respawning: false, ability: 'breach', abilityCool: 0, abilityT: 0,
  charDmg: 1, charHeal: 1, charCrit: 1, charAggro: 1, slots: ['pulse', null, null], slotIdx: 0,
  optics: { iron: 1 }, lootOptics: {}, scope: 'iron', scopeSway: 0, aim: 0,
  nades: 2, nadeCool: 0,
  dashMax: 2.6, speedMul: 1, reloadMul: 1, lootMul: 1,
  noDmg: 0, score: 0, kills: 0, combo: 1, comboT: 0,
  yaw: 0, pitch: 0, recoil: 0, recoilY: 0, bob: 0, vel: new T.Vector3(),
  /* handling state: bloom is the accumulated inaccuracy cone (radians), sprayIdx the
     shot number within the current burst, sprayT the time since the last shot.
     crouchF is 0 standing .. 1 fully crouched; crouchLock is the C toggle. */
  bloom: 0, sprayIdx: 0, sprayT: 9, crouchF: 0, crouchLock: false,
  extracting: 0
};
let state = 'menu';      // menu | play | pause | dead | win
let wave = 0, waveTimer = 0, spawnQueue = [], spawnCool = 0, extraction = false;
let shakeAmt = 0, hurtFlash = 0, time = 0;
const keys = {};
let qHeldAt = 0, qWheelArmed = false;   // weapon-wheel hold detection (see 10-ui.js)
let locked = false;

const canvas = renderer.domElement;
// ChatGPT/web previews commonly run the game inside a sandboxed iframe. Pointer Lock is
// forbidden there unless the host iframe grants allow-pointer-lock, so use normal mouse
// movement as a graceful fallback instead of throwing a SecurityError.
const embedded = window.top !== window.self;
document.addEventListener('mousemove', e => {
  if (state !== 'play') return;
  if (!locked && !embedded) return;
  const mx = e.movementX || 0, my = e.movementY || 0;
  if (!mx && !my) return;
  if (WHEEL.open) { wheelAim(mx, my); return; }   // wheel takes the mouse while open
  const s = CFG.sens * (P.ads ? OPT.adsSens * SC().sens : 1);
  P.yaw -= mx * s;
  P.pitch = clamp(P.pitch - my * s * (OPT.invertY ? -1 : 1), -1.5, 1.5);
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === document.body;
  if (!locked && state === 'play' && !embedded) pause();
});
addEventListener('keydown', e => {
  keys[e.code] = true;
  /* Jump buffering: remember the press for a moment so a jump entered a few frames before
     landing still fires on touchdown, instead of being swallowed. Standard platformer
     technique — without it, fast repeated jumps feel like the game is dropping inputs. */
  if (e.code === 'Space' && !e.repeat) P.jumpBuf = JUMP_BUFFER;
  if (e.code === 'KeyR') reload();
  /* Crouch: hold Ctrl, or toggle with C. Both drive the same want-flag, so a player
     who holds Ctrl out of habit and one who taps C get identical behaviour. */
  if (e.code === 'KeyC' && !e.repeat) P.crouchLock = !P.crouchLock;
  if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && state === 'play') e.preventDefault();
  if (e.code === 'KeyE') dash();
  if (e.code === 'Digit1') selectSlot(0);
  if (e.code === 'Digit2') selectSlot(1);
  if (e.code === 'Digit3') selectSlot(2);
  if (e.code === 'KeyQ' && !e.repeat) { qHeldAt = time; qWheelArmed = true; }
  if (e.code === 'KeyV') cycleScope(e.shiftKey ? -1 : 1);
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyT') takeOfferedWeapon();
  if (e.code === 'Tab') { e.preventDefault(); if (!MP.sbFull) { MP.sbFull = true; renderScoreboard(); } }
  if (e.code === 'KeyF') activateAbility();
  // N skips to the next track; the list reshuffles when it wraps (see musicNext)
  if (e.code === 'KeyN') musicNext(1);
  if (e.code === 'Backquote') { perfOn = !perfOn; perfEl.style.display = perfOn ? 'block' : 'none'; }
  if (e.code === 'Escape' && state === 'play') pause();
});
addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Tab' && MP.sbFull) { MP.sbFull = false; renderScoreboard(); }
  if (e.code === 'KeyQ') {
    // released before the hold threshold: treat it as the old quick-swap
    if (WHEEL.open) closeWheel(true);
    else if (qWheelArmed && time - qHeldAt < WHEEL_HOLD) cycleWeapon();
    qWheelArmed = false;
  }
});
addEventListener('keydown', e => { if (e.code === 'Space') e.preventDefault(); }, { passive: false });
addEventListener('mousedown', e => { if (e.button === 0) { keys.fire = true; keys.fireEdge = true; } if (e.button === 2 && state === 'play') { P.ads = true; document.body.classList.add('ads'); } });
addEventListener('mouseup', e => { if (e.button === 0) keys.fire = false; if (e.button === 2) { P.ads = false; document.body.classList.remove('ads'); } });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const STEP = 1.3;                              // max ledge you can walk up without jumping
function hitsWall(x, z, r, feet) {
  const f = feet === undefined ? -1e9 : feet;
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    if (b.off) continue;
    if (b.h <= f + STEP) continue;             // low enough to step onto, not a wall
    if (Math.abs(x - b.x) < b.hw + r && Math.abs(z - b.z) < b.hd + r) return true;
  }
  return false;
}
/* If a move (or a lift, or a destroyed prop) leaves the player overlapping a
   solid, push them out along the shallowest axis instead of trapping them. */
function unstick(pos, r, feet) {
  for (let pass = 0; pass < 3; pass++) {
    let hit = null, best = 1e9, ax = 0, sg = 1;
    for (let i = 0; i < blockers.length; i++) {
      const b = blockers[i];
      if (b.off || b.h <= feet + STEP) continue;
      const ox = (b.hw + r) - Math.abs(pos.x - b.x);
      const oz = (b.hd + r) - Math.abs(pos.z - b.z);
      if (ox <= 0 || oz <= 0) continue;
      const d = Math.min(ox, oz);
      if (d < best) { best = d; hit = b; ax = ox < oz ? 0 : 2; sg = ax === 0 ? Math.sign(pos.x - b.x) || 1 : Math.sign(pos.z - b.z) || 1; }
    }
    if (!hit) return;
    if (ax === 0) pos.x = hit.x + sg * (hit.hw + r + 0.02);
    else pos.z = hit.z + sg * (hit.hd + r + 0.02);
  }
}
function slide(pos, dx, dz, r, feet) {
  if (!hitsWall(pos.x + dx, pos.z, r, feet)) pos.x += dx;
  if (!hitsWall(pos.x, pos.z + dz, r, feet)) pos.z += dz;
  pos.x = clamp(pos.x, -CFG.bounds, CFG.bounds);
  pos.z = clamp(pos.z, -CFG.bounds, CFG.bounds);
}
function wallOverlapping(x, z, r, feet) {
  const f = feet === undefined ? -1e9 : feet;
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    if (b.off) continue;
    if (b.h <= f + STEP) continue;
    if ((b.hw + r) - Math.abs(x - b.x) > 0 && (b.hd + r) - Math.abs(z - b.z) > 0) return true;
  }
  return false;
}
function resolveWallPenetration(pos, r, feet) {
  for (let iter = 0; iter < 4; iter++) {
    let pushed = false;
    const f = feet === undefined ? -1e9 : feet;
    for (let i = 0; i < blockers.length; i++) {
      const b = blockers[i];
      if (b.off) continue;
      if (b.h <= f + STEP) continue;
      const overlapX = (b.hw + r) - Math.abs(pos.x - b.x);
      const overlapZ = (b.hd + r) - Math.abs(pos.z - b.z);
      if (overlapX > 0 && overlapZ > 0) {
        if (overlapX < overlapZ) pos.x += pos.x > b.x ? overlapX + 0.02 : -(overlapX + 0.02);
        else pos.z += pos.z > b.z ? overlapZ + 0.02 : -(overlapZ + 0.02);
        pushed = true;
      }
    }
    if (!pushed) break;
  }
}
function slideEntity(pos, dx, dz, r, feet) {
  if (!hitsWall(pos.x + dx, pos.z + dz, r, feet)) { pos.x += dx; pos.z += dz; }
  else {
    if (!hitsWall(pos.x + dx, pos.z, r, feet)) pos.x += dx;
    if (!hitsWall(pos.x, pos.z + dz, r, feet)) pos.z += dz;
  }
  resolveWallPenetration(pos, r, feet);
  if (wallOverlapping(pos.x, pos.z, r, feet)) {
    const ux = camera.position.x - pos.x, uz = camera.position.z - pos.z;
    const len = Math.hypot(ux, uz) || 1;
    pos.x += (ux / len) * 0.18; pos.z += (uz / len) * 0.18;
    resolveWallPenetration(pos, r, feet);
  }
  pos.x = clamp(pos.x, -CFG.bounds, CFG.bounds);
  pos.z = clamp(pos.z, -CFG.bounds, CFG.bounds);
}

/* ---------- weapon logic ---------- */
const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), fwd = new T.Vector3(),
      origin = new T.Vector3(), baseDir = new T.Vector3(), endPt = new T.Vector3(), tmpV3 = new T.Vector3();
// camera-relative basis for the shot cone, rebuilt per trigger pull
const aimRight = new T.Vector3(), aimUp = new T.Vector3();
const W = () => GUNS[P.weapon];
/* Beyond `falloff` metres a weapon tapers to 35% — keeps shotguns and SMGs honest. */
function falloff(w, dist) {
  if (!w.falloff || dist <= w.falloff) return 1;
  const over = (dist - w.falloff) / w.falloff;
  return Math.max(0.35, 1 - over * 0.9);
}

/* ---- melee: a swept arc in front of you, not a hitscan ray ---- */
function meleeSwing(w) {
  P.fireCool = w.rate * modRate();
  P.meleeT = MELEE_DUR;
  sfx.dash();
  shakeAmt = Math.min(shakeAmt + w.kick * 0.5, 0.7);
  camera.getWorldDirection(baseDir);
  let hits = 0;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    tmpV.copy(e.g.position).sub(camera.position);
    const d = tmpV.length();
    if (d > w.range + e.hitR) continue;
    tmpV.normalize();
    if (tmpV.dot(baseDir) < Math.cos(w.arc * 0.5)) continue;   // outside the swing arc
    damageEnemy(e, w.dmg * modDmg(), e.g.position, false);
    if (w.knock && !e.dead) {
      slide(e.g.position, tmpV.x * w.knock * 0.1, tmpV.z * w.knock * 0.1, 1.0, e.g.position.y - 0.5);
    }
    hits++;
  }
  if (mpInMatch() && MP.connected) {      // melee only reaches players in a live match
    for (const id in MP.ghosts) {
      const gh = MP.ghosts[id];
      if (!gh.alive) continue;
      if (mpTeamMode() && mpTeamOf(+id) === mpTeamOf(MP.id)) continue;
      tmpV.copy(gh.mesh.position).sub(camera.position);
      const dd = tmpV.length();
      if (dd > w.range + 0.9) continue;
      tmpV.normalize();
      if (tmpV.dot(baseDir) < Math.cos(w.arc * 0.5)) continue;
      mpSend({ t: 'event', e: { k: 'hit', target: +id, dmg: w.dmg * modDmg() * 9, head: false } });
      hitmarker(false); sfx.hit();
      hits++;
    }
  }
  if (BOSS.active) {
    const bd2 = BOSS.active.m.g.position.distanceTo(camera.position);
    if (bd2 < w.range + 4) { bossHit(w.dmg * modDmg() * 0.6, BOSS.active.m.g.position, false); hits++; }
  }
  for (let i = 0; i < barrels.length; i++) {
    const b = barrels[i];
    if (b.live && Math.hypot(b.x - camera.position.x, b.z - camera.position.z) < w.range) popBarrel(b, 0);
  }
  if (!hits) {
    endPt.copy(camera.position).addScaledVector(baseDir, w.range * 0.8);
    spark(endPt, w.tint, 4, tmpV2.set(0, 0, 0), 3, 0.2, 0.04);
  }
  hudFlash();
}

/* ---- lobbed grenade: arcs under gravity, detonates on contact ---- */
function lobGrenade(w, dir) {
  const s = shotPool.pop() || makeShot();
  s.m.material.color.copy(C(w.tint));
  s.halo.material.color.copy(C(w.tint));
  s.m.position.copy(origin);
  s.m.scale.setScalar(1.1);
  s.m.visible = true;
  s.v.copy(dir).multiplyScalar(38).addScaledVector(UP_AXIS, 5);
  s.life = 5; s.dmg = 0; s.hitR = 0.6;
  s.grav = 26; s.blastR = w.blastR; s.blastDmg = w.blastDmg * modDmg(); s.friendly = true;
  shots.push(s);
}
/* ---------- grenades ----------
   A throwable every loadout carries, independent of the weapon in your hands, so you
   always have an answer to someone holding an angle. Deliberately scarce (grenadeMax()
   per life, restored on respawn) and slow to cook, so it opens a fight rather than
   replacing one — the PvP blast tuning in PVP_TUNE applies to it too. */
const GRENADE_BASE = 2;
/* Ordnance upgrade adds capacity; read live so buying it applies on the next run. */
function grenadeMax() { return GRENADE_BASE + (PROFILE.upgrades.ordnance || 0); }
const GRENADE_CD = 0.9;
function throwGrenade() {
  if (state !== 'play' || P.nades <= 0 || P.nadeCool > 0 || P.reloading > 0) return;
  P.nades--;
  P.nadeCool = GRENADE_CD;
  camera.getWorldDirection(baseDir);
  muzzleWorldPos(origin);   // leave the actual barrel, not a point near the crosshair
  const s = shotPool.pop() || makeShot();
  s.m.material.color.copy(C(0x35ffc4));
  s.halo.material.color.copy(C(0x35ffc4));
  s.m.position.copy(origin);
  s.m.scale.setScalar(0.9);
  s.m.visible = true;
  s.v.copy(baseDir).multiplyScalar(34).addScaledVector(UP_AXIS, 7);
  s.life = 2.2;                 // fuse, not flight time — it cooks off wherever it is
  s.dmg = 0; s.hitR = 0.5;
  s.grav = 26; s.blastR = 8.5; s.blastDmg = 6.5 * modDmg(); s.friendly = true;
  shots.push(s);
  sfx.swap();
  toast('GRENADE · ' + P.nades + ' LEFT', 0x35ffc4);
  syncHUD.lastAmmo = -1;
}

/* ---------- reticles ----------
   One drawing per optic tier, all authored in a 400x400 viewBox so they scale with
   the tube. Deliberately different sight pictures, not one crosshair at four sizes:
   a red dot occludes almost nothing for close work, while the sniper glass carries
   graduated holdover marks you can actually range with. */
const RETICLES = {
  none: '',
  /* 2x reflex: illuminated dot with four short reference ticks — fast, minimal occlusion */
  dot: '<g stroke="currentColor" stroke-width="2" fill="none">'
     + '<circle cx="200" cy="200" r="3.6" fill="currentColor" stroke="none"/>'
     + '<g opacity=".7">'
     + '<line x1="200" y1="168" x2="200" y2="180"/><line x1="200" y1="220" x2="200" y2="232"/>'
     + '<line x1="168" y1="200" x2="180" y2="200"/><line x1="220" y1="200" x2="232" y2="200"/>'
     + '</g></g>',
  /* 4x tactical: duplex crosshair — thick posts thinning to a fine centre, plus holdover bars */
  duplex: '<g stroke="currentColor" fill="none">'
        + '<g stroke-width="4.5">'
        + '<line x1="200" y1="52" x2="200" y2="120"/><line x1="200" y1="280" x2="200" y2="348"/>'
        + '<line x1="52" y1="200" x2="120" y2="200"/><line x1="280" y1="200" x2="348" y2="200"/>'
        + '</g>'
        + '<g stroke-width="1.5">'
        + '<line x1="200" y1="120" x2="200" y2="186"/><line x1="200" y1="214" x2="200" y2="280"/>'
        + '<line x1="120" y1="200" x2="186" y2="200"/><line x1="214" y1="200" x2="280" y2="200"/>'
        + '</g>'
        + '<circle cx="200" cy="200" r="1.8" fill="currentColor" stroke="none"/>'
        + '<g stroke-width="1.5" opacity=".8">'
        + '<line x1="188" y1="232" x2="212" y2="232"/><line x1="192" y1="258" x2="208" y2="258"/>'
        + '<line x1="188" y1="284" x2="212" y2="284"/>'
        + '</g></g>',
  /* 8x sniper: fine christmas-tree — graduated holdover with windage marks on each stadia */
  milmarks: '<g stroke="currentColor" fill="none" stroke-width="1.2">'
          + '<line x1="200" y1="44" x2="200" y2="188"/><line x1="200" y1="212" x2="200" y2="356"/>'
          + '<line x1="44" y1="200" x2="188" y2="200"/><line x1="212" y1="200" x2="356" y2="200"/>'
          + '<circle cx="200" cy="200" r="1.2" fill="currentColor" stroke="none"/>'
          + '<g opacity=".9">'
          + '<line x1="186" y1="228" x2="214" y2="228"/><line x1="176" y1="228" x2="180" y2="228"/><line x1="220" y1="228" x2="224" y2="228"/>'
          + '<line x1="190" y1="256" x2="210" y2="256"/><line x1="180" y1="256" x2="184" y2="256"/><line x1="216" y1="256" x2="220" y2="256"/>'
          + '<line x1="186" y1="284" x2="214" y2="284"/><line x1="176" y1="284" x2="180" y2="284"/><line x1="220" y1="284" x2="224" y2="284"/>'
          + '<line x1="190" y1="312" x2="210" y2="312"/>'
          + '<line x1="186" y1="340" x2="214" y2="340"/>'
          + '</g>'
          + '<g opacity=".75">'
          + '<line x1="156" y1="194" x2="156" y2="206"/><line x1="112" y1="194" x2="112" y2="206"/>'
          + '<line x1="244" y1="194" x2="244" y2="206"/><line x1="288" y1="194" x2="288" y2="206"/>'
          + '</g></g>'
};
const SC = () => SCOPES[P.scope] || SCOPES.iron;
function ownedOptics() { return SCOPE_ORDER.filter(k => P.optics[k]); }
/* dir=1 cycles forward (V), dir=-1 cycles backward (Shift+V) — iron sights always
   sit in the cycle, so running it backward once is the "unequip to iron" shortcut. */
function cycleScope(dir) {
  if (state !== 'play') return;
  const own = ownedOptics();
  if (own.length < 2) { toast('NO OTHER OPTIC FITTED', 0x5c6b8c); return; }
  const step = dir < 0 ? -1 : 1;
  P.scope = own[(own.indexOf(P.scope) + step + own.length) % own.length];
  P.ads = false;                          // never swap magnification mid-aim
  document.body.classList.remove('ads');
  sfx.swap();
  toast(SC().name.toUpperCase() + ' FITTED', SC().col);
  syncScopeHUD();
}
function syncScopeHUD() {
  const el = $('scopeChip');
  if (!el) return;
  const own = ownedOptics();
  el.style.display = own.length > 1 ? 'flex' : 'none';
  if (own.length > 1) {
    el.innerHTML = own.map(k => {
      const s = SCOPES[k];
      const col = '#' + new T.Color(s.col).getHexString();
      return '<i class="' + (k === P.scope ? 'on' : '') + '" style="--sc:' + col + '">' + s.name + '</i>';
    }).join('');
  }
  paintReticle();
}
/* Redraw both sight pictures for the current optic: the tube reticle (4x/8x) and the
   non-magnified red dot (2x), which sits over the world with the weapon still visible. */
function paintReticle() {
  const s = SC(), col = '#' + new T.Color(s.col).getHexString();
  const tube = $('scopeTube');
  if (tube) {
    tube.style.setProperty('--sc', col);   // keep glass tint correct if the optic changes mid-aim
    tube.style.setProperty('--scD', 'min(' + (s.lens || 56) + 'vh,' + (s.lens || 56) + 'vw)');
    tube.style.setProperty('--scBlur', (s.blur || 5) + 'px');
    tube.style.setProperty('--scDim', s.dim === undefined ? 0.5 : s.dim);
  }
  document.body.classList.toggle('pipscope', !!s.pip);
  const tubeRet = $('scopeReticle');
  if (tubeRet) tubeRet.innerHTML = s.tube ? (RETICLES[s.ret] || '') : '';
  /* Only optics that actually draw their own sight picture replace the crosshair.
     Iron sights don't, so they must keep the normal crosshair while aiming. */
  const hasDot = !s.tube && s.ret !== 'none';
  document.body.classList.toggle('dotoptic', hasDot);
  const dot = $('dotSight');
  if (dot) {
    dot.innerHTML = hasDot ? (RETICLES[s.ret] || '') : '';
    dot.style.color = col;
  }
  const mag = $('scopeMag');
  if (mag) mag.textContent = s.mag + 'x';
}
/* Aiming is cancelled by anything that should break your sight picture. */
function breakAds(reason) {
  if (!P.ads) return;
  P.ads = false;
  document.body.classList.remove('ads');
}
/* ---- salvaged weapon mods: global, one of each, stack across all guns ---- */
const MODS = {
  extended:   { name: 'Extended Cells', desc: '+50% magazine', col: 0x7fe4ff },
  hollow:     { name: 'Hollow Rounds',  desc: '+35% damage',   col: 0xff2f7a },
  stabilizer: { name: 'Gyro Stabiliser', desc: '-40% spread',  col: 0x35ffc4 },
  coolant:    { name: 'Coolant Sleeve', desc: '+25% fire rate', col: 0xffb347 },
  siphon:     { name: 'Siphon Core',    desc: 'Kills restore 6 HP', col: 0xa46bff }
};
const modMag = () => 1 + (P.mods.extended ? 0.5 : 0);
const modDmg = () => (1 + (P.mods.hollow ? 0.35 : 0)) * P.charDmg * (ABIL.on('breach') ? 1.25 : 1);
const modRate = () => 1 - (P.mods.coolant ? 0.2 : 0);
const modSpread = () => 1 - (P.mods.stabilizer ? 0.4 : 0);

/* ---------- the aim cone ----------
   Total inaccuracy for the weapon in hand right now, as a cone HALF-angle in radians.
   Everything that is not learnable lives here; everything that is lives in recoilStep().

   Terms are additive rather than multiplicative because they are independent sources of
   error — the gun's own dispersion, the fact that you are running, the fact that you are
   airborne, and the heat in the barrel do not scale each other. Crouching multiplies only
   the weapon's base term, exactly like inaccuracy_crouch in the Counter-Strike model:
   planting your feet steadies the gun, it does not make jumping accurate.

   Read by shoot() for the bullets and by the HUD for the crosshair gap, so the crosshair
   is never lying to you about where rounds can land. */
function aimCone(w) {
  if (!w || w.melee) return 0;
  const stance = 1 + (INACC_CROUCH - 1) * P.crouchF;
  let s = w.spread * stance;
  // quadratic in speed: walking is nearly free, sprinting is not
  const mv = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 13);
  s += INACC_MOVE * mv * mv;
  if (!P.grounded) s += INACC_AIR;
  s += P.bloom;
  if (P.ads) s *= w.adsSpread;      // glass tightens the whole cone, bloom included
  return s * modSpread();
}
/* Scatter `fwd` off `dir` by up to `cone` radians, uniformly over the disc.
   sqrt() on the radius is what makes it uniform — sampling the radius directly packs
   most of a shotgun's pellets into the middle of its own pattern. Writes into the shared
   `fwd` temp and returns it, so it can be used inline. */
function coneDir(dir, cone) {
  fwd.copy(dir);
  if (cone > 0) {
    const a = Math.random() * 6.283185307, r = Math.sqrt(Math.random()) * cone;
    fwd.addScaledVector(aimRight, Math.cos(a) * r).addScaledVector(aimUp, Math.sin(a) * r);
  }
  return fwd.normalize();
}
function magSize(k) { return Math.round(GUNS[k].mag * modMag() * (P.magMul || 1)); }
function grantMod(id) {
  if (!id || P.mods[id]) {
    const free = Object.keys(MODS).filter(k => !P.mods[k]);
    if (!free.length) { P.score += 750; toast('SALVAGE CONVERTED · +750', 0x35ffc4); return; }
    id = pick(free);
  }
  P.mods[id] = true;
  P.mag = magSize(P.weapon);
  P.ammo = Math.min(P.mag, P.ammo + (MODS[id] === MODS.extended ? 10 : 0));
  buildPips(); syncHUD.lastAmmo = -1;
  toast(MODS[id].name.toUpperCase() + ' · ' + MODS[id].desc, MODS[id].col);
  sfx.power();
  renderMods();
}

/* ---- boss hit resolution ---- */
function raySphereT(o, d, c, r) {
  const ex = c.x - o.x, ey = c.y - o.y, ez = c.z - o.z;
  const proj = ex * d.x + ey * d.y + ez * d.z;
  if (proj <= 0) return -1;
  const p2 = ex * ex + ey * ey + ez * ez - proj * proj;
  if (p2 > r * r) return -1;
  return proj - Math.sqrt(r * r - p2);
}
function castBoss(o, d, maxD) {
  const b = BOSS.active;
  if (!b || !b.m.g.visible) return -1;
  let best = -1;
  for (const c of b.m.cores) {
    if (!c.alive) continue;
    c.arm.getWorldPosition(tmpV3);
    const t = raySphereT(o, d, tmpV3, 1.55);
    if (t > 0 && t < maxD && (best < 0 || t < best)) best = t;
  }
  const t2 = raySphereT(o, d, b.m.g.position, 3.6);
  if (t2 > 0 && t2 < maxD && (best < 0 || t2 < best)) best = t2;
  return best;
}

/* Integral optics belong to the weapon, not the operator: fit the incoming gun's glass,
   and strip the outgoing gun's so it doesn't linger in the cycle on an unscoped weapon.
   Looted optics (P.lootOptics) are unaffected — those stay yours across every weapon. */
function applyIntegralOptic(from, to) {
  const prev = from && GUNS[from] && GUNS[from].optic;
  if (prev && !P.lootOptics[prev]) delete P.optics[prev];
  const next = to && GUNS[to] && GUNS[to].optic;
  if (next) P.optics[next] = 1;
  if (!P.optics[P.scope]) P.scope = next || 'iron';
  else if (next) P.scope = next;
}
function switchWeapon(w) {
  if (state !== 'play' || !P.owned[w] || w === P.weapon || P.dashT > 0) return;
  breakAds();
  applyIntegralOptic(P.weapon, w);
  P.ammoIn[P.weapon] = P.ammo;
  P.weapon = w;
  P.mag = magSize(w);
  P.ammo = Math.min(P.ammoIn[w], P.mag);
  P.reloading = 0;
  hud.reload.style.opacity = 0;
  for (const k in gunModels) gunModels[k].visible = (k === w);
  poseHands();
  muzzleFlash.position.z = GUNS[w].muzz;
  MAG_HOME.set(0, GUNS[w].magY || -0.08, GUNS[w].magZ || 0.035);
  magProp.position.copy(MAG_HOME);
  magProp.visible = false;
  gunPivot.rotation.y = 0.6; gunPivot.rotation.x = 0.5;
  buildPips(); syncHUD.lastAmmo = -1;
  syncScopeHUD();
  sfx.swap();
  toast(GUNS[w].name.toUpperCase() + ' READY', GUNS[w].tint);
  if (GUNS[w].optic) toast(SCOPES[GUNS[w].optic].name.toUpperCase() + ' FITTED', SCOPES[GUNS[w].optic].col);
}
function cycleWeapon() {
  const carried = P.slots.filter(Boolean);
  if (carried.length < 2) return;
  switchWeapon(carried[(carried.indexOf(P.weapon) + 1) % carried.length]);
}
/* How many weapons you carry. PvP is primary + secondary: two guns force a real
   commitment (a long gun and an answer for close range) instead of a three-slot
   toolbox that covers every range at once. PvE keeps all three. */
const SLOT_LABELS = ['Primary', 'Secondary', 'Tertiary'];
function slotCount() {
  return (typeof mpCompetitive === 'function' && mpCompetitive()) ? 2 : 3;
}
function slotLabel(i) {
  return slotCount() === 2 ? SLOT_LABELS[i] : 'Slot ' + (i + 1);
}
function selectSlot(i) {
  if (i >= slotCount()) return;                 // slot 3 does not exist in PvP
  if (!P.slots[i]) return;
  P.slotIdx = i;
  switchWeapon(P.slots[i]);
}
/* ---------- opt-in weapon pickups ----------
   A weapon crate you walk over used to swap your gun instantly. That is fine when your
   hands are empty and awful when they aren't — especially in PvP, where losing your
   chosen loadout to a stray footstep decides fights. `pickupOffer` holds the crate you
   are standing on; TAKE_KEY commits the swap. */
const TAKE_KEY = 'T';
let pickupOffer = null;
function wantsPrompt(key) {
  if (typeof mpCompetitive === 'function' && mpCompetitive()) return true;  // always ask in PvP
  const slot = P.slots.indexOf(null);
  return slot < 0;                       // PvE: only ask when it would overwrite a gun
}
function takeOfferedWeapon() {
  if (state !== 'play' || !pickupOffer) return;
  const p = pickupOffer;
  pickupOffer = null;
  const el = $('takePrompt'); if (el) el.style.display = 'none';
  collect(p);
}

/* Looted weapons replace whatever is in the active slot. */
function takeWeapon(key) {
  if (P.slots.indexOf(key) >= 0) {                 // already carried: top it up instead
    P.ammoIn[key] = magSize(key);
    if (P.weapon === key) { P.ammo = P.mag; syncHUD.lastAmmo = -1; }
    toast(GUNS[key].name.toUpperCase() + ' RESUPPLIED', GUNS[key].tint);
    return;
  }
  const empty = P.slots.indexOf(null);
  const slot = empty >= 0 ? empty : P.slotIdx;
  const dropped = P.slots[slot];
  P.slots[slot] = key;
  P.owned[key] = true;
  P.ammoIn[key] = magSize(key);
  if (dropped) { delete P.owned[dropped]; toast('DROPPED ' + GUNS[dropped].name.toUpperCase(), 0x5c6b8c); }
  P.slotIdx = slot;
  switchWeapon(key);
  buildSlotHUD();
}
function grantWeapon(w) { takeWeapon(w); return; }
function grantWeaponLegacy(w) {
  const isNew = !P.owned[w];
  P.owned[w] = true;
  P.ammoIn[w] = GUNS[w].mag;
  if (isNew) switchWeapon(w); else { P.ammo = P.weapon === w ? GUNS[w].mag : P.ammo; }
}
function reload() {
  if (state !== 'play' || P.respawning || P.reloading > 0 || P.ammo === P.mag || W().melee) return;
  P.reloadMax = W().reload * P.reloadMul;
  P.reloading = P.reloadMax;
  P.reloadPhase = 0;
  const w = W();
  MAG_HOME.set(0, w.magY || -0.08, w.magZ || 0.035);
  magProp.position.copy(MAG_HOME);
  magProp.rotation.set(0, 0, 0);
  magProp.visible = true;
  sfx.reload();
}
function dash() {
  if (state !== 'play' || P.respawning || P.dashCool > 0) return;
  breakAds();
  P.dashCool = P.dashMax; P.dashT = 0.18; P.iFrames = perk === 'phantom' ? 0.5 : 0.34; sfx.dash();
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  for (let i = 0; i < 10; i++)
    spark(tmpV.copy(camera.position).addScaledVector(fwd, -0.5).setY(rand(0.4, 2.0)), 0x7fe4ff, 1, tmpV2.set(0, 0, 0), 4, 0.35, 0.05);
}

function shootOnce() {                 // a burst follow-up: same path, no trigger gate
  const w = W();
  if (w.burst) { const keep = P.burstLeft; shoot(); P.burstLeft = keep; }
  else shoot();
}
function shoot() {
  const w = W();
  if (state !== 'play' || P.respawning || P.fireCool > 0 || P.reloading > 0) return;
  if (w.melee) { meleeSwing(w); return; }
  if (P.ammo <= 0) { sfx.dry(); reload(); return; }
  const over = P.buffs.overdrive > 0;
  if (!over) { P.ammo--; P.ammoIn[P.weapon] = P.ammo; }
  if (w.burst && P.burstLeft <= 0) P.burstLeft = w.burst - 1;
  P.fireCool = (w.burst && P.burstLeft <= 0 ? w.burstGap : w.rate) * (over ? 0.45 : 1) * modRate()
    * (ABIL.on('breach') ? 0.65 : 1) * pvpTune(P.weapon).rate;
  if (typeof RUNSTAT !== 'undefined') RUNSTAT.shots++;
  sfx[w.sound]();
  // tell the room we fired — the only thing that reveals us on an opponent's radar
  if (typeof mpCompetitive === 'function' && mpCompetitive()) mpSend({ t: 'event', e: { k: 'fire' } });
  if (ABIL.on('phase')) P.abilityT = 0;                 // firing breaks Phase
  /* Recoil: a learnable pattern, damped by ADS, by crouching, and by the Handling
     upgrade. It kicks the CAMERA, and the camera is what the next shot is fired down,
     so pulling against it works exactly the way it does in CS or CoD — this is not a
     cosmetic shake. Recovery back to the original aim point happens in update(). */
  const handle = Math.max(0.45, 1 - (PROFILE.upgrades.handling || 0) * 0.035);
  const steady = handle * (1 - 0.18 * P.crouchF);
  const kickP = recoilStep(w, P.sprayIdx);
  P.recoil = Math.min(P.recoil + kickP.v * (P.ads ? 0.55 : 1) * steady, 0.19);
  P.recoilY += kickP.h * (P.ads ? 0.6 : 1) * steady * (1 + rand(-0.12, 0.12));
  /* Bloom: the random half. Grows per shot toward the weapon's cap while the trigger is
     held, decays in update() once it is released — so a tap is accurate and the tenth
     round of a spray is not, which is the whole reason to burst-fire. */
  P.bloom = Math.min(P.bloom + w.bloom * (1 - 0.3 * P.crouchF), w.bloomMax);
  P.sprayIdx++;
  P.sprayT = 0;
  shakeAmt = Math.min(shakeAmt + w.kick, 0.7);
  muzzleFlash.material.opacity = 1;
  muzzleFlash.rotation.z = Math.random() * 6.28;
  muzzleFlash.scale.setScalar(w.pellets > 1 ? rand(1.4, 1.9) : rand(0.8, 1.3));
  muzzleFlash.material.color.copy(over ? C(0xffb347) : C(w.tint));
  gun.position.z += w.kick * 0.22;
  muzzleLight.intensity = 9 + w.kick * 14;
  hudFlash();

  camera.getWorldDirection(baseDir);
  /* Camera-relative basis for the cone. The old code perturbed the world x/y/z of the
     direction vector, which made the pattern an axis-aligned BOX whose shape changed as
     you turned and which biased pellets toward the centre. right = fwd x worldUp,
     up = right x fwd gives a cone that is round and centred on the aim point from any
     angle — the only way a crosshair can honestly represent it. */
  aimRight.set(-baseDir.z, 0, baseDir.x);
  if (aimRight.lengthSq() < 1e-8) aimRight.set(1, 0, 0);   // straight up or down
  aimRight.normalize();
  aimUp.crossVectors(aimRight, baseDir).normalize();
  const cone = aimCone(w);
  muzzleWorldPos(origin);   // tracers leave the visible muzzle at any FOV / ADS state
  if (w.lob) { lobGrenade(w, coneDir(baseDir, cone)); return; }
  const beamCol = over ? C(0xffb347) : C(w.tint);
  const thick = w.pierce ? 3.2 : 1;
  const o = camera.position;

  for (let p = 0; p < w.pellets; p++) {
    coneDir(baseDir, cone);

    const wallOk = castWall(o, fwd, w.range);
    const wD = wallOk ? wallHit.d : w.range;
    const pHit = castPlayers(o, fwd, Math.min(wD, w.range));
    if (pHit) {
      endPt.copy(o).addScaledVector(fwd, pHit.t);
      const dmgOut = w.dmg * modDmg() * falloff(w, pHit.t) * (pHit.mult || 1) * 9 * pvpTune(P.weapon).dmg;
      mpSend({ t: 'event', e: { k: 'hit', target: pHit.id, dmg: dmgOut, head: !!pHit.head } });
      if (pHit.zone && BODY_ZONES[pHit.zone].label) toast(BODY_ZONES[pHit.zone].label, pHit.head ? 0xffb347 : 0x5c6b8c);
      spark(endPt, 0xff2f7a, pHit.head ? 14 : 8, tmpV2.set(0, 1, 0), 6, 0.3, 0.05);
      hitmarker(!!pHit.head);
      damageNumber(endPt, Math.round(dmgOut), !!pHit.head);
      pHit.head ? sfx.crit() : sfx.hit();
      tracer(origin, endPt, beamCol, thick);
      continue;
    }
    /* Bots are shot on the same terms as human players — they sit between the player
       hit test and the PvE tests so a bot in front of a drone takes the round. */
    const botHit = castBots(o, fwd, Math.min(wD, w.range));
    if (botHit) {
      endPt.copy(o).addScaledVector(fwd, botHit.t);
      const dmgOut = w.dmg * modDmg() * falloff(w, botHit.t) * (botHit.mult || 1) * 9 * pvpTune(P.weapon).dmg;
      botDamage(botHit.b, dmgOut, endPt, !!botHit.head);   // owns sparks, hitmarker, score
      if (botHit.zone && BODY_ZONES[botHit.zone].label) toast(BODY_ZONES[botHit.zone].label, botHit.head ? 0xffb347 : 0x5c6b8c);
      tracer(origin, endPt, beamCol, thick);
      continue;
    }
    const bT = castBoss(o, fwd, Math.min(wD, w.range));
    if (bT >= 0) {
      endPt.copy(o).addScaledVector(fwd, bT);
      bossHit(w.dmg * modDmg(), endPt, false);
      tracer(origin, endPt, beamCol, thick);
      continue;
    }
    const list = castEnemies(o, fwd, w.pierce ? wD : w.range);

    if (w.pierce) {
      for (let k = 0; k < list.length; k++) {
        const h = list[k];
        if (h.e.dead) continue;
        endPt.copy(o).addScaledVector(fwd, h.t);
        damageEnemy(h.e, w.dmg * modDmg() * falloff(w, h.t) * (h.perp < h.e.coreR ? 2 : 1), endPt, h.perp < h.e.coreR);
        if (w.pierceMax && k + 1 >= w.pierceMax) break;
      }
      if (wallOk) {
        endPt.copy(o).addScaledVector(fwd, wD);
        impact(endPt, tmpV.set(wallHit.nx, wallHit.ny, wallHit.nz));
        if (wallHit.b && wallHit.b.barrel) popBarrel(wallHit.b.barrel, 0);
        spark(endPt, w.tint, 10, tmpV2.set(0, 1, 0), 6, 0.35, 0.05);
      }
      tracer(origin, endPt.copy(o).addScaledVector(fwd, wD), beamCol, thick);
      continue;
    }

    const first = list.length ? list[0] : null;
    if (first && first.t < wD) {
      endPt.copy(o).addScaledVector(fwd, first.t);
      const crit = first.perp < first.e.coreR || ABIL.on('mark');
      damageEnemy(first.e, w.dmg * modDmg() * falloff(w, first.t) * (crit ? 3 * P.charCrit : 1), endPt, crit);
      tracer(origin, endPt, beamCol, thick);
    } else if (wallOk) {
      endPt.copy(o).addScaledVector(fwd, wD);
      impact(endPt, tmpV.set(wallHit.nx, wallHit.ny, wallHit.nz));
      if (wallHit.b && wallHit.b.barrel) popBarrel(wallHit.b.barrel, 0);
      spark(endPt, 0xffb066, 6, tmpV2.set(0, 1, 0), 5, 0.35, 0.045);
      tracer(origin, endPt, beamCol, thick);
    } else {
      tracer(origin, endPt.copy(o).addScaledVector(fwd, w.range), beamCol, thick);
    }
  }
}
