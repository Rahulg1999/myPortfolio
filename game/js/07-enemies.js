/* neon-runner · 07-enemies.js
   enemy chassis, projectiles, pickups, waves, the Warden boss
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- enemies ---------- */
const enemies = [];
const WHITE = new T.Color(1, 1, 1);
const TYPES = {
  seeker: { hp: 3, speed: 6.4, dmg: 7, color: 0xff2f7a, scale: 1.0, range: 2.4, score: 100, standoff: 2.6, tell: 0.42, lungeSpeed: 26 },
  gunner: { hp: 5, speed: 5.0, dmg: 9, color: 0xa46bff, scale: 1.1, range: 22, score: 160, standoff: 18, tell: 0, lungeSpeed: 0, spread: 0.055 },
  brute: { hp: 13, speed: 3.6, dmg: 15, color: 0xffb347, scale: 1.9, range: 3.4, score: 320, standoff: 3.4, tell: 0.62, lungeSpeed: 19 }
};
/* ============================================================
   ENEMY CHASSIS
   Three unrelated builds — nothing is shared but the material setup, so each
   role is readable from its outline alone even with the colour stripped out.
   ============================================================ */
const haloGeo = new T.PlaneGeometry(2.4, 2.4);
const ePool = { seeker: [], gunner: [], brute: [] };
const tmpQ = new T.Quaternion();
const UP_AXIS = new T.Vector3(0, 1, 0);

function makeEnemy(type) {
  const t = TYPES[type];
  const g = new T.Group();
  const body = new T.Group();          // parts live here so idle motion survives lookAt
  g.add(body);
  const colL = C(t.color);
  const shell = new T.MeshStandardMaterial({ color: 0x101422, roughness: 0.35, metalness: 0.9, emissive: colL, emissiveIntensity: 0.35, side: T.DoubleSide });
  const plate = new T.MeshStandardMaterial({ color: 0x2a3040, roughness: 0.5, metalness: 0.75, side: T.DoubleSide });
  const glow = new T.MeshBasicMaterial({ color: colL.clone() });
  const haloMat = new T.MeshBasicMaterial({ map: decalTex, color: colL, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false });
  const add = (geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    body.add(m);
    return m;
  };
  const spin = [], orbit = [];
  let core;

  if (type === 'seeker') {
    /* INTERCEPTOR — a dart. Needle nose, swept delta wings, twin burners.
       No rings, no orbiting debris: pure forward-facing arrowhead. */
    add(new T.ConeGeometry(0.17, 1.05, 6), shell, 0, 0, -0.62, -Math.PI / 2);          // nose
    add(new T.OctahedronGeometry(0.34, 0), shell, 0, 0, 0.02, 0, 0, 0, 0.9, 0.62, 1.7); // fuselage
    for (const s of [-1, 1]) {
      add(new T.BoxGeometry(0.62, 0.045, 0.40), plate, s * 0.44, -0.02, 0.16, 0, 0, s * 0.30)  // delta wing
        .rotation.y = s * 0.42;
      add(new T.BoxGeometry(0.05, 0.30, 0.22), plate, s * 0.70, 0.11, 0.30, 0, 0, s * 0.22);   // winglet
      const burner = add(new T.CylinderGeometry(0.10, 0.13, 0.30, 8), shell, s * 0.20, 0, 0.55, Math.PI / 2);
      add(new T.ConeGeometry(0.11, 0.42, 8), glow, s * 0.20, 0, 0.80, -Math.PI / 2);           // exhaust plume
      spin.push({ m: burner, ax: 'y', sp: 6 });
    }
    core = add(new T.SphereGeometry(0.20, 10, 8), glow, 0, 0.02, -0.10, 0, 0, 0, 1.5, 0.42, 0.9); // eye slit
    add(new T.BoxGeometry(0.30, 0.02, 0.02), glow, 0, 0.20, -0.26);
  } else if (type === 'gunner') {
    /* WEAPONS PLATFORM — a flat hex hull with a turret drum and three
       downward nacelles. Wide and squat where the seeker is long and thin. */
    add(new T.CylinderGeometry(0.78, 0.60, 0.20, 6), plate, 0, 0.02, 0, 0, Math.PI / 6);       // hull
    const collar = add(new T.CylinderGeometry(0.44, 0.50, 0.09, 6), shell, 0, 0.14, 0, 0, Math.PI / 6);
    spin.push({ m: collar, ax: 'y', sp: -0.9 });
    add(new T.CylinderGeometry(0.30, 0.34, 0.30, 12), shell, 0, 0.30, 0);                      // turret drum
    add(new T.BoxGeometry(0.16, 0.16, 0.92), shell, 0, 0.30, -0.52);                           // barrel
    core = add(new T.CylinderGeometry(0.12, 0.14, 0.14, 10), glow, 0, 0.30, -0.96, Math.PI / 2); // muzzle
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      add(new T.CylinderGeometry(0.13, 0.09, 0.36, 8), plate, Math.cos(a) * 0.62, -0.18, Math.sin(a) * 0.62);
      add(new T.CircleGeometry(0.13, 10), glow, Math.cos(a) * 0.62, -0.37, Math.sin(a) * 0.62, -Math.PI / 2); // thruster wash
    }
    const mast = add(new T.CylinderGeometry(0.02, 0.02, 0.55, 5), plate, 0.28, 0.42, 0.28);     // antenna
    add(new T.SphereGeometry(0.05, 8, 6), glow, 0.28, 0.70, 0.28);
    spin.push({ m: mast, ax: 'y', sp: 1.4 });
  } else {
    /* SIEGE FRAME — heavy, hunched, armoured. Four slab plates grind around a
       hip ring; a narrow visor is the only glow. Bulk where the others are open. */
    add(new T.BoxGeometry(1.05, 0.86, 0.90), plate, 0, 0.14, 0);                               // torso
    add(new T.OctahedronGeometry(0.62, 0), shell, 0, 0.14, -0.10, 0, 0, 0, 1.15, 0.85, 0.95);  // beveled chest
    for (const s of [-1, 1]) {
      add(new T.BoxGeometry(0.46, 0.62, 0.78), plate, s * 0.74, 0.26, 0, 0, 0, s * 0.18);      // pauldron
      add(new T.BoxGeometry(0.20, 0.20, 0.62), shell, s * 0.74, -0.16, 0.02);                  // arm stub
    }
    add(new T.CylinderGeometry(0.86, 1.02, 0.34, 8), plate, 0, -0.44, 0);                      // hip skirt
    add(new T.CylinderGeometry(0.30, 0.44, 0.26, 8), glow, 0, -0.66, 0, 0, 0, 0, 1, 0.3, 1);   // underglow
    core = add(new T.BoxGeometry(0.52, 0.11, 0.10), glow, 0, 0.34, -0.48);                     // visor slit
    add(new T.BoxGeometry(0.66, 0.26, 0.16), plate, 0, 0.36, -0.42);                           // brow
    const hub = new T.Group();
    body.add(hub);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const sl = new T.Mesh(new T.BoxGeometry(0.16, 0.72, 0.34), plate);
      sl.position.set(Math.cos(a) * 1.12, -0.05, Math.sin(a) * 1.12);
      sl.rotation.y = -a;
      hub.add(sl);
    }
    spin.push({ m: hub, ax: 'y', sp: 0.75 });
  }

  const halo = new T.Mesh(haloGeo, haloMat);
  g.add(halo);
  g.scale.setScalar(t.scale);

  const blob = makeBlob(3.0 * t.scale);
  scene.add(blob); scene.add(g);
  return {
    type: type, g: g, body: body, core: core, halo: halo, spin: spin, orbit: orbit, blob: blob,
    shellMat: shell, plateMat: plate, glowMat: glow, color: t.color, colL: colL,
    maxHp: t.hp, speed: t.speed, dmg: t.dmg, range: t.range, score: t.score,
    coreR: 0.40 * t.scale, hitR: 0.95 * t.scale,
    standoff: t.standoff, tellMax: t.tell, lungeSpeed: t.lungeSpeed,
    lungeDir: new T.Vector3(), y: 1.5 * t.scale
  };
}
/* Drones are pooled — spawning one during a wave allocates nothing and compiles nothing. */
function spawnEnemy(type, pos) {
  const e = ePool[type].pop() || makeEnemy(type);
  const d = diffMul();
  const t = TYPES[type];
  e.maxHp = Math.round(t.hp * d.hp);
  e.hp = e.maxHp;
  e.speed = t.speed * d.speed * (typeof EV !== 'undefined' ? EV.mul.enemySpeed : 1);
  e.dmg = t.dmg * d.dmg;
  e.lungeSpeed = t.lungeSpeed * d.speed;
  e.dead = false; e.flash = 0;
  e.windup = 0; e.lunge = 0; e.struck = false;
  e.cool = rand(1.0, 2.4); e.phase = rand(0, 6.28);
  e.g.position.copy(pos);
  resolveWallPenetration(e.g.position, e.hitR * 0.85, pos.y - 0.5);
  e.g.visible = true; e.blob.visible = true;
  enemies.push(e);
  return e;
}
function despawnEnemy(e) {
  e.dead = true;
  e.g.visible = false; e.blob.visible = false;
  ePool[e.type].push(e);
}
/* `quiet` is the splash path. A single grenade can hit a dozen enemies at once, and the
   per-hit feedback here is the expensive part: a DOM damage number, a setTimeout-backed
   hitmarker, and a FRESH WEB AUDIO NODE GRAPH each. Twelve of those in one frame is what
   made explosions stutter. In quiet mode the caller (boom) plays one aggregate hitmarker
   and one sound for the whole blast, and only the first few numbers are drawn. */
function damageEnemy(e, dmg, point, critical, quiet) {
  if (typeof RUNSTAT !== 'undefined') RUNSTAT.hits++;   // accuracy readout
  if (e.dead) return;
  e.hp -= dmg; e.flash = 1;
  spark(point, critical ? 0xffffff : e.color, quiet ? 3 : (critical ? 14 : 8), tmpV.set(0, 0.5, 0), 6, 0.3, 0.05);
  if (!quiet) {
    hitmarker(critical);
    damageNumber(point, dmg * 10, critical);
    critical ? sfx.crit() : sfx.hit();
  } else if (boomNumbers < 3) {
    boomNumbers++;
    damageNumber(point, dmg * 10, false);
  }
  if (e.hp <= 0) killEnemy(e, quiet);
}
let boomNumbers = 0;   // damage numbers already drawn for the explosion in progress
function killEnemy(e, quiet) {
  e.dead = true;
  const p = e.g.position.clone();
  // a blast killing six drones does not need six full death bursts
  spark(p, e.color, quiet ? 14 : 40, tmpV.set(0, 2, 0), 12, 0.85, 0.09);
  if (!quiet) spark(p, 0xffffff, 12, tmpV.set(0, 1, 0), 16, 0.4, 0.07);
  if (!quiet) sfx.kill();
  shakeAmt = Math.min(shakeAmt + 0.22, 0.6);
  despawnEnemy(e);
  enemies.splice(enemies.indexOf(e), 1);
  P.kills++;
  bumpStat('kills');
  if (e.type === 'brute') bumpStat('brutes');
  P.comboT = 3.0; P.combo = Math.min(P.combo + 1, 9);
  if (P.mods.siphon) P.hp = Math.min(P.maxHp, P.hp + 6);
  if (owned('kit_stim')) P.hp = Math.min(P.maxHp, P.hp + 8);      // Combat Stim
  P.score += Math.round(e.score * P.combo * 0.5);
  /* Loot was landing on ~54% of kills plus a guaranteed brute drop — about 42
     pickups a run, which made every reward meaningless. Rates below give ~9 a
     run, and enemy pressure was reduced to match (see TUNING notes). */
  // Deep Pockets widens every drop roll
  const roll = Math.random() / (P.lootMul * (owned('kit_scavenger') ? 2 : 1) * (typeof EV !== 'undefined' ? EV.mul.loot : 1));
  if (e.type === 'brute') {
    if (roll < 0.14) dropPickup(p, 'hp');
    else if (roll < 0.30) dropPickup(p, 'ammo');
    else if (roll < 0.40) dropPickup(p, pick(POWERS));
    else if (roll < 0.46) dropScope(p);
    else if (roll < 0.52 && Object.keys(P.mods).length < 5) dropPickup(p, 'salvage');
  } else {
    if (roll < 0.05) dropPickup(p, 'hp');
    else if (roll < 0.11) dropPickup(p, 'ammo');
    else if (roll < 0.13) dropPickup(p, pick(POWERS));
    else if (roll < 0.145) dropScope(p);
    else if (roll < 0.155 && Object.keys(P.mods).length < 5) dropPickup(p, 'salvage');
  }
  toast(P.combo > 1 ? 'x' + P.combo + ' CHAIN' : 'TARGET DOWN', e.color);
}

/* ---------- enemy projectiles ---------- */
const shots = [], shotPool = [];
const shotPrev = new T.Vector3(), segAB = new T.Vector3(), segAP = new T.Vector3();
/* Distance from point P to segment AB — catches fast projectiles that would
   otherwise skip past the player between frames. */
function segPointDist(a, b, p) {
  segAB.subVectors(b, a);
  segAP.subVectors(p, a);
  const len2 = segAB.lengthSq();
  const t = len2 > 1e-6 ? clamp(segAP.dot(segAB) / len2, 0, 1) : 0;
  return segAP.distanceTo(segAB.multiplyScalar(t));
}
const shotGeo = new T.SphereGeometry(0.19, 10, 8);
const shotHaloGeo = new T.PlaneGeometry(1.1, 1.1);
function makeShot() {
  const m = new T.Mesh(shotGeo, new T.MeshBasicMaterial({ color: 0xffffff }));
  const halo = new T.Mesh(shotHaloGeo, new T.MeshBasicMaterial({ map: decalTex, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }));
  m.add(halo); scene.add(m);
  return { m: m, halo: halo, v: new T.Vector3(), life: 0, dmg: 0 };
}
function enemyShoot(e) {
  const s = shotPool.pop() || makeShot();
  s.m.material.color.copy(e.colL);
  s.halo.material.color.copy(e.colL);
  s.m.position.copy(e.g.position);
  s.m.scale.setScalar(1);
  s.m.visible = true;
  /* Aim error. A drone used to put a perfectly-aimed round on your chest every single
     time. With the player now paying a real accuracy cost for moving, a dead-eye drone
     is the wrong half of that bargain — so the tracking error scales with how fast YOU
     are moving. Stand still and they still hit you dead-on; sprint across their front
     and they have to lead you and mostly cannot. The projectile is slow enough to dodge
     either way, so this adds counterplay to movement rather than making them harmless.
     Same scatterDir() the bots and the player's shotguns use. */
  s.v.copy(camera.position).setY(camera.position.y - 0.3).sub(e.g.position).normalize();
  const pSpd = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 13);
  scatterDir(s.v, (e.spread || 0) * (0.28 + 0.72 * pSpd * pSpd));
  s.v.multiplyScalar(25);
  s.life = 5; s.dmg = e.dmg; s.hitR = 1.15; s.grav = 0; s.friendly = false;
  shots.push(s);
  tone(900, 420, 0.18, 'sawtooth', 0.07);
}
function despawnShot(s) { s.m.visible = false; shotPool.push(s); }
addEventListener('beforeunload', () => { clearTimeout(MP.reconnectT); if (MP.ws) MP.ws.close(); });

/* ---------- pickups & power-ups ---------- */
const pickups = [];
const PU = {
  hp:        { col: 0x35ffc4, label: '+30 INTEGRITY', shape: 'gem', radarShape: 'circle', radarSize: 3.2, cat: 'supply' },
  ammo:      { col: 0x7fe4ff, label: 'AMMO RESUPPLY', shape: 'box', radarShape: 'circle', radarSize: 3.2, cat: 'supply' },
  overdrive: { col: 0xffb347, label: 'OVERDRIVE · 9s', shape: 'gem', radarShape: 'circle', radarSize: 3.2, cat: 'supply' },
  barrier:   { col: 0x7fe4ff, label: 'BARRIER · 80', shape: 'gem', radarShape: 'circle', radarSize: 3.2, cat: 'supply' },
  focus:     { col: 0xa46bff, label: 'TIME FRACTURE · 7s', shape: 'gem', radarShape: 'circle', radarSize: 3.2, cat: 'supply' },
  scope_reflex: { col: 0x35ffc4, label: 'REFLEX 2x OPTIC', shape: 'mod', beam: 1, radarShape: 'diamond', radarSize: 4.2, cat: 'optic' },
  scope_tac:    { col: 0xffb347, label: 'TACTICAL 4x OPTIC', shape: 'mod', beam: 1, radarShape: 'diamond', radarSize: 4.4, cat: 'optic' },
  scope_long:   { col: 0xff2f7a, label: 'LONGSHOT 8x OPTIC', shape: 'mod', beam: 2, radarShape: 'diamond', radarSize: 4.6, cat: 'optic' },

  modcrate:  { col: 0x7fe4ff, label: 'MOD CRATE', shape: 'modcrate', beam: 2, radarShape: 'diamond', radarSize: 4.5, cat: 'mod' },
  salvage:   { col: 0x7fe4ff, label: 'WEAPON MOD SALVAGED', shape: 'mod', beam: 1, radarShape: 'diamond', radarSize: 3.8, cat: 'mod' },
  prototype: { col: 0xff2f7a, label: 'PROTOTYPE RECOVERED', shape: 'mod', beam: 2, radarShape: 'diamond', radarSize: 4.2, cat: 'mod' }
};
// one crate entry per weapon, built from the arsenal so new guns need no extra wiring
for (const k in GUNS) {
  if (k === 'pulse') continue;
  PU[k] = { col: GUNS[k].tint, label: GUNS[k].name.toUpperCase() + ' ACQUIRED',
            shape: 'crate', radarShape: 'square', radarSize: 4.8, cat: 'weapon' };
}
const POWERS = ['overdrive', 'barrier', 'focus'];
/* Optic rarity climbs with the wave, and you never get a duplicate. */
function dropScope(p) {
  const pool = [];
  if (!P.optics.reflex) pool.push('reflex', 'reflex', 'reflex');
  if (!P.optics.tac && wave >= 3) pool.push('tac', 'tac');
  if (!P.optics.long && wave >= 5) pool.push('long');
  if (!pool.length) { dropPickup(p, 'ammo'); return; }
  dropPickup(p, 'scope_' + pick(pool));
}
const puPool = {};
function nextModPreview() {
  const free = Object.keys(MODS).filter(k => !P.mods[k]);
  return free.length ? pick(free) : null;
}
function dropPickup(pos, kind, modId) {
  const def = PU[kind];
  const col = kind === 'modcrate' && modId ? MODS[modId].col : def.col;
  const reuse = (puPool[kind] = puPool[kind] || []).pop();
  if (reuse) {
    reuse.g.position.set(pos.x, floorAt(pos.x, pos.z) + 1.0, pos.z);
    reuse.g.visible = true; reuse.t = 0; reuse.pulseT = 3;
    reuse.modId = modId || null;
    reuse.life = def.shape === 'crate' || def.shape === 'modcrate' || def.beam ? 999 : 26;
    if (kind === 'modcrate' && modId && reuse.g.userData.stripe) {
      reuse.g.userData.stripe.material.color.copy(C(MODS[modId].col));
      reuse.g.userData.icon.material.emissive.copy(C(MODS[modId].col));
      if (reuse.g.userData.beam) reuse.g.userData.beam.material.color.copy(C(MODS[modId].col));
    }
    pickups.push(reuse);
    return reuse;
  }
  const g = new T.Group();
  const geo = def.shape === 'gem' ? new T.IcosahedronGeometry(0.36, 0)
    : def.shape === 'crate' ? new T.BoxGeometry(0.78, 0.44, 0.44)
    : def.shape === 'modcrate' ? new T.BoxGeometry(0.92, 0.48, 0.52)
    : def.shape === 'mod' ? new T.OctahedronGeometry(0.42, 1)
    : new T.BoxGeometry(0.5, 0.34, 0.34);
  const m = new T.Mesh(geo, new T.MeshStandardMaterial({
    color: 0x0d1018, metalness: 0.8, roughness: 0.3, emissive: C(col), emissiveIntensity: 0.9
  }));
  g.add(m);
  if (def.shape === 'crate') {
    const ring = new T.Mesh(new T.TorusGeometry(0.55, 0.035, 6, 20), new T.MeshBasicMaterial({ color: C(col) }));
    ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.ring = ring;
  }
  if (def.shape === 'modcrate') {
    const stripe = new T.Mesh(new T.BoxGeometry(0.96, 0.06, 0.56), new T.MeshBasicMaterial({ color: C(col) }));
    stripe.position.y = 0.22; g.add(stripe); g.userData.stripe = stripe;
    const icon = new T.Mesh(new T.OctahedronGeometry(0.22, 0), new T.MeshStandardMaterial({
      color: 0x0d1018, metalness: 0.85, roughness: 0.25, emissive: C(col), emissiveIntensity: 1.4
    }));
    icon.position.y = 0.42; g.add(icon); g.userData.icon = icon;
  }
  const halo = new T.Mesh(new T.PlaneGeometry(1.9, 1.9), new T.MeshBasicMaterial({
    map: decalTex, color: C(col), transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  if (def.beam || def.shape === 'modcrate') {
    const beam = new T.Mesh(new T.CylinderGeometry(def.beam > 1 || def.shape === 'modcrate' ? 0.75 : 0.5, 0.16, 26, 12, 1, true),
      new T.MeshBasicMaterial({ color: C(col), transparent: true, opacity: def.shape === 'modcrate' ? 0.18 : (def.beam > 1 ? 0.16 : 0.10), blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    beam.position.y = 13; g.add(beam); g.userData.beam = beam;
  }
  g.position.set(pos.x, floorAt(pos.x, pos.z) + 1.0, pos.z);
  scene.add(g);
  const pu = { g: g, halo: halo, kind: kind, t: 0, life: def.shape === 'crate' || def.shape === 'modcrate' || def.beam ? 999 : 26, modId: modId || null, pulseT: 3 };
  pickups.push(pu);
  return pu;
}
function despawnPickup(p) { p.g.visible = false; (puPool[p.kind] = puPool[p.kind] || []).push(p); }
function dropCrate(kind) {
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * 6.283, r = rand(7, 16);
    const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
    if (Math.abs(x) > CFG.bounds - 4 || Math.abs(z) > CFG.bounds - 4 || hitsWall(x, z, 1.6)) continue;
    dropPickup(tmpV.set(x, 1, z), kind);
    toast('WEAPON CRATE DROPPED NEARBY', PU[kind].col);
    sfx.ping(); sfx.ping();
    return;
  }
}
function dropModCrate() {
  const modId = nextModPreview();
  if (!modId) return;
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * 6.283, r = rand(7, 16);
    const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
    if (Math.abs(x) > CFG.bounds - 4 || Math.abs(z) > CFG.bounds - 4 || hitsWall(x, z, 1.6)) continue;
    dropPickup(tmpV.set(x, 1, z), 'modcrate', modId);
    toast('MOD CRATE · ' + MODS[modId].name.toUpperCase(), MODS[modId].col);
    sfx.ping(); sfx.ping();
    return;
  }
}
function collect(p) {
  const def = PU[p.kind];
  switch (p.kind) {
    case 'hp': P.hp = Math.min(P.maxHp, P.hp + 40 * P.charHeal); break;
    case 'ammo':
      P.ammo = P.mag; P.ammoIn[P.weapon] = P.ammo;
      for (const k in P.owned) P.ammoIn[k] = GUNS[k].mag;
      P.reloading = 0; hud.reload.style.opacity = 0; syncHUD.lastAmmo = -1; break;
    case 'overdrive': P.buffs.overdrive = 9; break;
    case 'barrier': P.shield = 80; break;
    case 'focus': P.buffs.focus = 7; break;
    case 'modcrate':
    case 'scope_reflex': case 'scope_tac': case 'scope_long': {
      const id = p.kind.slice(6);
      P.optics[id] = 1;
      P.lootOptics[id] = 1;               // yours for the run, survives weapon swaps
      P.scope = id;                       // auto-equip: it is a rare find, show it off
      syncScopeHUD();
      break;
    }
    case 'salvage': grantMod(null); break;
    case 'prototype':
      grantMod(null);
      P.shield = Math.max(P.shield, 60);
      P.buffs.overdrive = Math.max(P.buffs.overdrive, 6);
      break;
    default: grantWeapon(p.kind); break;
  }
  if (POWERS.indexOf(p.kind) >= 0 || p.kind === 'salvage' || p.kind === 'prototype' || p.kind === 'modcrate') sfx.power(); else sfx.pickup();
  if (p.kind !== 'salvage' && p.kind !== 'modcrate' && p.kind !== 'prototype') toast(def.label, def.col);
  spark(p.g.position, def.col, 18, tmpV.set(0, 1, 0), 6, 0.45, 0.055);
  p.life = 0;
}

/* ---------- waves ---------- */
/* Ten waves, shaped as peaks and valleys rather than one straight climb.

   Waves 5 and 10 are boss waves and get their spawn queue trimmed (see startWave), so
   their listed counts are the pre-trim figures. Wave 6 is deliberately LIGHTER than
   wave 5: it used to be generated by the open-ended formula below, which jumped from 19
   hostiles straight to 25 the moment the Warden died — the hardest wave in the run
   landed immediately after the boss, with no breather and no time to spend the drops.
   The dip gives the boss kill room to land before the climb to the wave-10 finale. */
const WAVES = [
  { seeker: 4 },                              //  1
  { seeker: 6,  gunner: 2 },                  //  2
  { seeker: 7,  gunner: 3, brute: 1 },        //  3
  { seeker: 9,  gunner: 4, brute: 2 },        //  4
  { seeker: 10, gunner: 5, brute: 2 },        //  5  WARDEN + extraction opens
  { seeker: 8,  gunner: 4, brute: 2 },        //  6  breather
  { seeker: 11, gunner: 5, brute: 3 },        //  7
  { seeker: 12, gunner: 6, brute: 3 },        //  8
  { seeker: 13, gunner: 7, brute: 4 },        //  9
  { seeker: 12, gunner: 6, brute: 4 }         // 10  SOVEREIGN
];
const EXTRACT_WAVE = 5;      // the pad opens here
const DEEP_WAVE = 10;        // clearing this is the full run
/* Advertised on the HUD and paid out in settleRun — one constant so the number the
   player is promised cannot drift from the number they actually get. */
const DEEP_BONUS = 1500;

/* ---- boss tiers ----
   One chassis, two fights. The Warden opens the door at wave 5 and is meant to be
   beatable with what you have by then; the Sovereign at wave 10 is the reason to stay.
   Numbers below are pre-difficulty-multiplier. */
const BOSS_MAX_CORES = 5;
const BOSS_TIERS = {
  warden: {
    name: 'WARDEN', cores: 3, coreHp: 16, hullHp: 80, scale: 1.0,
    accent: 0xff2f7a, coreCol: 0xffb347,
    volleyGap: 0.40, volleyShots: 5, spread: 0.20, restMin: 3.6, restMax: 5.2,
    shotDmg: 12, shotSpeed: 28, slamDmg: 18, enrage: 0,
    intro: 'WARDEN INBOUND — BREAK THE CORES'
  },
  sovereign: {
    name: 'SOVEREIGN', cores: 5, coreHp: 26, hullHp: 190, scale: 1.3,
    accent: 0xa46bff, coreCol: 0x7fe4ff,
    volleyGap: 0.26, volleyShots: 7, spread: 0.16, restMin: 2.2, restMax: 3.4,
    shotDmg: 16, shotSpeed: 34, slamDmg: 26,
    /* Below this fraction of hull it enrages: attacks tighten and it starts calling
       escorts. A second phase is what separates a boss from a big enemy. */
    enrage: 0.5,
    intro: 'SOVEREIGN INBOUND — FIVE CORES'
  }
};
function bossTierFor(n) { return n % (DEEP_WAVE) === 0 ? 'sovereign' : 'warden'; }

/* ============================================================
   THE WARDEN — wave boss
   Three exposed cores must be broken before the hull can be hurt.
   Cycles between a shielded orbit, a homing volley and a ground slam.
   ============================================================ */
const BOSS = { active: null };
let bossMesh = null;
function makeBoss() {
  /* The Warden is not a bigger drone — it is architecture. A stepped inverted
     hull under an armoured mantle, three core pods on extended booms, and two
     counter-rotating gyro hoops. Silhouette reads as a cathedral bell. */
  const g = new T.Group();
  const hull = new T.MeshStandardMaterial({ color: 0x141826, roughness: 0.3, metalness: 0.94, emissive: C(0xff2f7a), emissiveIntensity: 0.25, side: T.DoubleSide });
  const armour = new T.MeshStandardMaterial({ color: 0x2b3244, roughness: 0.44, metalness: 0.82, side: T.DoubleSide });
  const hot = new T.MeshBasicMaterial({ color: C(0xff2f7a) });
  const put = (geo, mat, x, y, z, rx, ry) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.rotation.set(rx || 0, ry || 0, 0);
    g.add(m); return m;
  };

  // stepped hull, widest at the shoulders and tapering to a point beneath
  const body = put(new T.CylinderGeometry(2.9, 0.55, 3.4, 8), hull, 0, -0.6, 0);
  put(new T.CylinderGeometry(3.3, 2.9, 0.55, 8), armour, 0, 1.25, 0);        // shoulder step
  put(new T.CylinderGeometry(2.5, 3.3, 0.5, 8), armour, 0, 1.75, 0);         // crown step
  put(new T.CylinderGeometry(1.1, 2.2, 1.1, 8), hull, 0, 2.5, 0);            // cap
  // mantle: eight armour fins hanging off the shoulders
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const fin = put(new T.BoxGeometry(0.5, 2.2, 0.22), armour, Math.cos(a) * 2.9, 0.1, Math.sin(a) * 2.9, 0.16);
    fin.rotation.y = -a;
  }
  // wide eye bar across the face
  const eye = put(new T.BoxGeometry(2.4, 0.34, 0.3), hot, 0, 0.95, -2.75);
  put(new T.BoxGeometry(3.0, 0.9, 0.5), armour, 0, 1.35, -2.6);              // brow
  // two gyro hoops on different axes
  const gyro1 = put(new T.TorusGeometry(4.4, 0.16, 6, 30), armour, 0, 0.2, 0, Math.PI / 2);
  const gyro2 = put(new T.TorusGeometry(3.9, 0.12, 6, 28), armour, 0, 0.2, 0, 0, 0);
  gyro2.rotation.z = 0.5;

  /* Core pods on booms. The mesh is built with the MOST any boss tier uses and the
     surplus is hidden — cheaper than rebuilding the model per tier, and it means a
     five-core Sovereign and a three-core Warden share one chassis. */
  const cores = [];
  for (let i = 0; i < BOSS_MAX_CORES; i++) {
    const a = i * Math.PI * 2 / BOSS_MAX_CORES;
    const arm = new T.Group();
    arm.position.set(Math.cos(a) * 4.2, 1.15, Math.sin(a) * 4.2);
    arm.rotation.y = -a;
    const boom = new T.Mesh(new T.BoxGeometry(1.9, 0.26, 0.26), armour);
    boom.position.x = -0.95;
    arm.add(boom);
    const cage = new T.Mesh(new T.TorusGeometry(0.95, 0.11, 6, 16), armour);
    cage.rotation.y = Math.PI / 2;
    arm.add(cage);
    const core = new T.Mesh(new T.OctahedronGeometry(0.72, 0), new T.MeshBasicMaterial({ color: C(0xffb347) }));
    arm.add(core);
    const plate = new T.Mesh(new T.SphereGeometry(1.05, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), armour);
    plate.rotation.z = -Math.PI / 2;
    plate.position.x = 0.15;
    arm.add(plate);
    g.add(arm);
    cores.push({ arm: arm, mesh: core, plate: plate, cage: cage, hp: 22, max: 22, alive: true });
  }

  const shield = new T.Mesh(new T.SphereGeometry(5.6, 24, 16),
    new T.MeshBasicMaterial({ color: C(0x7fe4ff), transparent: true, opacity: 0.13, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
  g.add(shield);
  const halo = new T.Mesh(new T.PlaneGeometry(16, 16),
    new T.MeshBasicMaterial({ map: decalTex, color: C(0xff2f7a), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  scene.add(g);
  const blob = makeBlob(13);
  scene.add(blob);
  return { g: g, hull: hull, hot: hot, body: body, cores: cores, shield: shield, eye: eye,
           halo: halo, blob: blob, collar: gyro1, collar2: gyro2 };
}

/* ============================================================
   THE SOVEREIGN — wave 10 boss
   A different MACHINE, not a repaint. The rule the two are built against is that any
   two bosses should be tellable apart by silhouette alone, before colour or health bar
   — and until now these differed only in tint, scale and pod count.

   Warden    wide and squat: a stepped bell, mantle fins, pods on horizontal booms.
   Sovereign tall and narrow: an obelisk spine under a spire, standing in a ring of
             five crown shards, with the cores carried at the TOP of the shards rather
             than out on booms. Read as a throne rather than a bell.

   Everything the update loop touches keeps the same field names as the Warden's, plus
   coreR/coreY (where this chassis carries its pods) and extras (its own idle motion),
   so one animation path drives both.
   ============================================================ */
function makeSovereignBoss() {
  const g = new T.Group();
  const hull = new T.MeshStandardMaterial({ color: 0x120f1e, roughness: 0.26, metalness: 0.95, emissive: C(0xa46bff), emissiveIntensity: 0.25, side: T.DoubleSide });
  const armour = new T.MeshStandardMaterial({ color: 0x241f3a, roughness: 0.38, metalness: 0.86, side: T.DoubleSide });
  const hot = new T.MeshBasicMaterial({ color: C(0xa46bff) });
  const put = (geo, mat, x, y, z, rx, ry) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.rotation.set(rx || 0, ry || 0, 0);
    g.add(m); return m;
  };

  /* --- the spine: an octagonal obelisk, the tall thing the whole read hangs on --- */
  const body = put(new T.CylinderGeometry(1.15, 1.5, 6.2, 8), hull, 0, 1.4, 0);
  put(new T.CylinderGeometry(1.5, 1.62, 0.5, 8), armour, 0, -1.5, 0);          // spine collar
  put(new T.CylinderGeometry(1.28, 1.4, 0.42, 8), armour, 0, 2.4, 0);
  // keystone: an inverted four-sided pyramid slung under the spine
  put(new T.ConeGeometry(2.3, 3.4, 4), hull, 0, -3.4, 0, Math.PI, Math.PI / 4);
  put(new T.ConeGeometry(2.45, 0.7, 4), armour, 0, -2.1, 0, Math.PI, Math.PI / 4);
  // spire above, so the silhouette finishes in a point instead of a cap
  put(new T.ConeGeometry(1.15, 4.4, 4), hull, 0, 6.9, 0, 0, Math.PI / 4);
  put(new T.ConeGeometry(1.3, 0.8, 4), armour, 0, 4.9, 0, 0, Math.PI / 4);
  const finial = put(new T.OctahedronGeometry(0.5, 0), hot, 0, 9.4, 0);

  /* --- the crown: five tall shards standing in a ring, each carrying a core --- */
  for (let i = 0; i < BOSS_MAX_CORES; i++) {
    const a = i * Math.PI * 2 / BOSS_MAX_CORES;
    const sx = Math.cos(a) * 3.2, sz = Math.sin(a) * 3.2;
    const shard = put(new T.CylinderGeometry(0.16, 0.52, 5.0, 4), armour, sx, 1.3, sz, 0, -a);
    shard.rotation.z = Math.cos(a) * 0.12;
    shard.rotation.x = -Math.sin(a) * 0.12;
    // buttress from the spine out to the foot of each shard
    const bl = 2.4;
    const br = put(new T.BoxGeometry(bl, 0.22, 0.3), armour, Math.cos(a) * 1.9, -0.8, Math.sin(a) * 1.9, 0, -a);
    br.rotation.z = 0.42;
  }

  /* --- a vertical eye slit, against the Warden's wide brow bar --- */
  const eye = put(new T.BoxGeometry(0.34, 2.6, 0.3), hot, 0, 1.9, -1.55);
  put(new T.BoxGeometry(1.0, 3.2, 0.5), armour, 0, 1.9, -1.35);
  put(new T.BoxGeometry(1.7, 0.42, 0.42), armour, 0, 3.5, -1.5);

  /* --- two polygonal halos, flat and stacked, not the Warden's crossed hoops --- */
  /* Clear of the pod ring (r 3.2 at y 3.4) in both axes — at pod height it cut straight
     through the cores, and the cores are the thing the player has to find and shoot. */
  const gyro1 = put(new T.TorusGeometry(3.7, 0.14, 4, 9), armour, 0, 6.0, 0, Math.PI / 2);
  const gyro2 = put(new T.TorusGeometry(3.4, 0.11, 4, 7), armour, 0, -1.9, 0, Math.PI / 2);

  /* --- core pods: mounted at the tops of the crown shards --- */
  const cores = [];
  for (let i = 0; i < BOSS_MAX_CORES; i++) {
    const a = i * Math.PI * 2 / BOSS_MAX_CORES;
    const arm = new T.Group();
    arm.position.set(Math.cos(a) * 3.2, 3.4, Math.sin(a) * 3.2);
    arm.rotation.y = -a;
    const cage = new T.Mesh(new T.TorusGeometry(0.9, 0.1, 4, 8), armour);
    cage.rotation.x = Math.PI / 2;
    arm.add(cage);
    const core = new T.Mesh(new T.OctahedronGeometry(0.78, 0), new T.MeshBasicMaterial({ color: C(0x7fe4ff) }));
    arm.add(core);
    // a claw of three prongs gripping the core, instead of the Warden's hemisphere plate
    const plate = new T.Group();
    for (let k = 0; k < 3; k++) {
      const pa = k * Math.PI * 2 / 3;
      const prong = new T.Mesh(new T.ConeGeometry(0.2, 1.25, 4), armour);
      prong.position.set(Math.cos(pa) * 0.62, -0.34, Math.sin(pa) * 0.62);
      prong.rotation.z = -Math.cos(pa) * 0.5;
      prong.rotation.x = Math.sin(pa) * 0.5;
      plate.add(prong);
    }
    arm.add(plate);
    g.add(arm);
    cores.push({ arm: arm, mesh: core, plate: plate, cage: cage, hp: 26, max: 26, alive: true });
  }

  const shield = new T.Mesh(new T.SphereGeometry(6.2, 24, 16),
    new T.MeshBasicMaterial({ color: C(0xa46bff), transparent: true, opacity: 0.13, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
  g.add(shield);
  const halo = new T.Mesh(new T.PlaneGeometry(18, 18),
    new T.MeshBasicMaterial({ map: decalTex, color: C(0xa46bff), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false }));
  g.add(halo);
  scene.add(g);
  const blob = makeBlob(14);
  scene.add(blob);
  return {
    g: g, hull: hull, hot: hot, body: body, cores: cores, shield: shield, eye: eye,
    halo: halo, blob: blob, collar: gyro1, collar2: gyro2,
    coreR: 3.2, coreY: 3.4, eyeAxis: 'y',            // the slit pulses vertically
    extras: [{ o: finial, ax: 'y', sp: 1.6 }]
  };
}

/* One cached chassis per tier — built on first sight of that boss and kept, the way the
   Warden's always was. Only the tier being fought is ever visible. */
const bossMeshes = {};
function bossMeshFor(kind) {
  if (!bossMeshes[kind]) bossMeshes[kind] = kind === 'sovereign' ? makeSovereignBoss() : makeBoss();
  for (const k in bossMeshes) {
    if (k === kind) continue;
    bossMeshes[k].g.visible = false;
    bossMeshes[k].blob.visible = false;
  }
  return bossMeshes[kind];
}

function spawnBoss(tierKey) {
  const d = diffMul();
  const kind = tierKey || bossTierFor(wave);
  const T_ = BOSS_TIERS[kind] || BOSS_TIERS.warden;
  const m = bossMeshFor(BOSS_TIERS[kind] ? kind : 'warden');
  bossMesh = m;
  m.g.visible = true; m.blob.visible = true;
  m.g.scale.setScalar(T_.scale);
  // recolour the chassis so the two tiers read as different machines at a glance
  m.halo.material.color.copy(C(T_.accent));
  m.hull.emissive.copy(C(T_.accent));
  // only this tier's cores exist; the spares stay hidden and are never targetable
  m.cores.forEach((c, i) => {
    const on = i < T_.cores;
    c.alive = on;
    c.max = Math.round(T_.coreHp * d.hp); c.hp = c.max;
    c.mesh.visible = on; c.plate.visible = on; c.cage.visible = on;
    c.arm.visible = on;
    c.arm.scale.setScalar(1);
    if (on) c.mesh.material.color.copy(C(T_.coreCol));
  });
  const a = rand(0, 6.28), r = 34;
  const x = clamp(camera.position.x + Math.cos(a) * r, -CFG.bounds + 12, CFG.bounds - 12);
  const z = clamp(camera.position.z + Math.sin(a) * r, -CFG.bounds + 12, CFG.bounds - 12);
  m.g.position.set(x, Math.max(floorAt(x, z), P.feetY) + 7.5, z);
  resolveWallPenetration(m.g.position, 3.2, m.g.position.y - 2);
  const bossHp = Math.round(T_.hullHp * d.hp);
  BOSS.active = {
    m: m, tier: T_, hp: bossHp, maxHp: bossHp, phase: 'orbit', t: 0, cool: 2.4, flash: 0,
    shielded: true, slamT: 0, volley: 0, enraged: false, addCool: 6,
    name: T_.name + '-0' + (1 + Math.floor(wave / DEEP_WAVE))
  };
  hudBoss.c = -1;
  sfx.alarm();
  toast(T_.intro, T_.accent);
  $('bossBar').style.display = 'block';
  $('bossName').textContent = BOSS.active.name;
}
function bossHit(t, point, crit) {
  const b = BOSS.active;
  if (!b) return false;
  // cores first: the hull only takes damage once every core is broken
  let closest = null, cd = 1e9;
  for (const c of b.m.cores) {
    if (!c.alive) continue;
    c.arm.getWorldPosition(tmpV3);
    const d = tmpV3.distanceTo(point);
    if (d < cd) { cd = d; closest = c; }
  }
  if (closest && cd < 2.4) {
    closest.hp -= t * (crit ? 2 : 1) * 1.6;
    b.flash = 1;
    spark(point, 0xffb347, 12, tmpV2.set(0, 1, 0), 7, 0.3, 0.06);
    damageNumber(point, Math.round(t * 16), crit);
    hitmarker(crit);
    sfx.hit();
    if (closest.hp <= 0) {
      closest.alive = false;
      closest.mesh.visible = false; closest.plate.visible = false; closest.cage.visible = false;
      closest.arm.getWorldPosition(tmpV3);
      spark(tmpV3, 0xffb347, 40, tmpV2.set(0, 2, 0), 14, 0.8, 0.11);
      boom(tmpV3, 8, 4);
      sfx.blast();
      const left = b.m.cores.filter(c => c.alive).length;
      toast(left ? 'CORE DOWN — ' + left + ' REMAINING' : 'HULL EXPOSED', 0xffb347);
      if (!left) { b.shielded = false; b.m.shield.visible = false; }
    }
    return true;
  }
  if (b.shielded) {
    spark(point, 0x7fe4ff, 8, tmpV2.set(0, 1, 0), 6, 0.25, 0.05);
    tone(1200, 700, 0.08, 'square', 0.07);
    return true;
  }
  b.hp -= t * (crit ? 2.4 : 1);
  b.flash = 1;
  spark(point, crit ? 0xffffff : 0xff2f7a, crit ? 16 : 9, tmpV2.set(0, 1, 0), 7, 0.3, 0.055);
  damageNumber(point, Math.round(t * 14), crit);
  hitmarker(crit);
  crit ? sfx.crit() : sfx.hit();
  if (b.hp <= 0) killBoss();
  return true;
}
function killBoss() {
  const b = BOSS.active;
  if (!b) return;
  const p = b.m.g.position.clone();
  for (let i = 0; i < 6; i++) {
    setTimeout(() => {
      const q = p.clone().add(new T.Vector3(rand(-3, 3), rand(-2, 2), rand(-3, 3)));
      spark(q, i % 2 ? 0xffb347 : 0xff2f7a, 40, tmpV2.set(0, 2, 0), 14, 0.9, 0.12);
      sfx.blast();
      shakeAmt = Math.min(shakeAmt + 0.5, 1);
    }, i * 140);
  }
  b.m.g.visible = false; b.m.blob.visible = false;
  $('bossBar').style.display = 'none';
  /* Pay for the fight you actually won: the Sovereign has more than twice the effective
     health of a Warden and a second phase on top, so a flat 4000 undersold it badly. */
  const T_ = b.tier || BOSS_TIERS.warden;
  const isSov = T_.name === 'SOVEREIGN';
  P.score += isSov ? 9000 : 4000;
  P.kills++;
  REC.boss++;
  bumpStat('wardens');                       // both tiers count as a boss kill
  if (isSov) bumpStat('sovereigns');
  toast(T_.name + ' DESTROYED · +' + (isSov ? '9000' : '4000'), 0x35ffc4);
  dropPickup(p, 'prototype');
  dropPickup(p.clone().add(new T.Vector3(3, 0, 0)), 'hp');
  // the harder fight leaves more behind
  if (isSov) dropPickup(p.clone().add(new T.Vector3(-3, 0, 0)), 'prototype');
  BOSS.active = null;
}
function updateBoss(dt) {
  const b = BOSS.active;
  if (!b) return;
  const m = b.m, g = m.g;
  b.t += dt;
  b.cool -= dt;
  b.flash = Math.max(0, b.flash - dt * 5);
  m.hull.emissiveIntensity = 0.25 + b.flash * 2.6;
  m.shield.visible = b.shielded;
  m.shield.material.opacity = 0.10 + Math.sin(b.t * 3) * 0.035;
  m.collar.rotation.z += dt * 0.55;
  m.collar2.rotation.y += dt * 0.9;
  m.eye.scale[m.eyeAxis || 'x'] = 1 + Math.sin(b.t * 2.2) * 0.06;
  if (m.extras) for (let i = 0; i < m.extras.length; i++) {
    const ex = m.extras[i];
    ex.o.rotation[ex.ax] += dt * ex.sp;
  }
  m.body.rotation.y += dt * 0.12;
  m.halo.quaternion.copy(camera.quaternion).premultiply(tmpQ.copy(g.quaternion).invert());
  m.halo.scale.setScalar(1 + Math.sin(b.t * 2.4) * 0.06);
  // The hull always turns to face you, so statically mounted cores meant the rear
  // one was never shootable. The whole boom ring now orbits, and surviving cores
  // re-space themselves so every one rotates into view on a short cycle.
  const alive = m.cores.filter(c => c.alive);
  b.ring = (b.ring || 0) + dt * 0.85;
  alive.forEach((c, n) => {
    const a = b.ring + n * (Math.PI * 2 / Math.max(alive.length, 1));
    c.targetA = a;
  });
  const CR = m.coreR || 4.2, CY = m.coreY === undefined ? 1.15 : m.coreY;
  m.cores.forEach((c, i) => {
    if (!c.alive) return;
    const a = c.targetA;
    c.arm.position.x = Math.cos(a) * CR;
    c.arm.position.z = Math.sin(a) * CR;
    c.arm.rotation.y = -a;
    c.mesh.rotation.y += dt * 2.4;
    c.mesh.rotation.z += dt * 1.3;
    c.cage.rotation.x += dt * 1.1;
    c.mesh.scale.setScalar(0.85 + Math.sin(b.t * 4 + i) * 0.12);
    c.arm.position.y = CY + Math.sin(b.t * 1.5 + i * 2.1) * 0.45;     // ride above the mantle
    c.arm.getWorldPosition(tmpV3);
    c.screen = tmpV3.clone();
  });
  g.lookAt(camera.position.x, g.position.y, camera.position.z);

  const to = tmpV.copy(camera.position).setY(g.position.y).sub(g.position);
  const dist = to.length();
  to.normalize();
  const surf = Math.max(floorAt(g.position.x, g.position.z), P.feetY);
  if (g.position.y < surf + 1) g.position.y = surf + 4;

  /* Second phase. Once the hull is far enough gone the fight changes rather than just
     continuing: everything tightens and it starts calling escorts, so the last stretch
     is the hardest part of the encounter instead of a formality. Only the Sovereign has
     one — tier.enrage is 0 for the Warden. */
  const T_ = b.tier || BOSS_TIERS.warden;
  if (T_.enrage && !b.enraged && !b.shielded && b.hp <= b.maxHp * T_.enrage) {
    b.enraged = true;
    b.addCool = 3;
    toast(b.name + ' — OVERDRIVE', T_.accent);
    sfx.alarm();
    shakeAmt = Math.min(shakeAmt + 0.8, 1);
  }
  const rage = b.enraged ? 0.62 : 1;         // scales every cooldown
  if (b.enraged) {
    // escorts, on a leash so they cannot stack up while you work the hull
    b.addCool -= dt;
    if (b.addCool <= 0 && enemies.length < 8) {
      b.addCool = 7;
      for (let k = 0; k < 2; k++) spawnEnemy(k ? 'gunner' : 'seeker', findSpawn());
      toast('ESCORTS INBOUND', T_.accent);
    }
  }

  if (b.phase === 'orbit') {
    const strafe = tmpV2.set(-to.z, 0, to.x);
    const push = dist > 26 ? 1 : dist < 15 ? -0.8 : 0;
    const sp = b.enraged ? 1.3 : 1;
    slideEntity(g.position, (to.x * 7 * push + strafe.x * 5.5 * sp) * dt, (to.z * 7 * push + strafe.z * 5.5 * sp) * dt, 3.2, g.position.y - 2);
    g.position.y = lerp(g.position.y, surf + 7.5 + Math.sin(b.t * 1.4) * 0.7, 1 - Math.pow(0.02, dt));
    if (b.cool <= 0) { b.phase = Math.random() < 0.55 ? 'volley' : 'slam'; b.cool = 0; b.volley = T_.volleyShots; b.slamT = 0; }
  } else if (b.phase === 'volley') {
    g.position.y = lerp(g.position.y, surf + 9, 1 - Math.pow(0.05, dt));
    if (b.cool <= 0 && b.volley > 0) {
      b.volley--;
      b.cool = T_.volleyGap * rage;
      // aim at the player's chest, not along the boss's own horizontal plane
      const arc = b.enraged ? 2 : 1;          // a five-wide fan once it is enraged
      for (let k = -arc; k <= arc; k++) {
        const aim = tmpV3.copy(camera.position).setY(camera.position.y - 0.35).sub(g.position).normalize();
        aim.applyAxisAngle(UP_AXIS, k * T_.spread);
        bossShot(g.position, aim, T_);
      }
      if (b.volley === 0) { b.phase = 'orbit'; b.cool = rand(T_.restMin, T_.restMax) * rage; }
    }
  } else {
    // slam: rise, then drive down and send a shockwave
    b.slamT += dt;
    if (b.slamT < 1.1) {
      g.position.y = lerp(g.position.y, surf + 15, 1 - Math.pow(0.04, dt));
      slideEntity(g.position, to.x * 9 * dt, to.z * 9 * dt, 3.2, g.position.y - 2);
      m.hull.emissiveIntensity = 0.25 + (b.slamT / 1.1) * 3;
    } else if (b.slamT < 1.45) {
      g.position.y = lerp(g.position.y, surf + 1.6, 1 - Math.pow(0.0001, dt));
    } else {
      const p = g.position.clone().setY(surf + 0.5);
      spark(p, 0xff2f7a, 46, tmpV2.set(0, 2, 0), 16, 0.8, 0.11);
      boom(p, 15, 6);
      if (camera.position.distanceTo(p) < 15) hurt(T_.slamDmg, p);
      sfx.blast();
      shakeAmt = 1;
      b.phase = 'orbit'; b.cool = rand(T_.restMin, T_.restMax) * rage;
    }
  }
  m.blob.position.set(g.position.x, surf + 0.05, g.position.z);
  m.blob.material.opacity = clamp(0.8 - (g.position.y - surf) * 0.05, 0.12, 0.8);
  hudBoss(b.hp / b.maxHp, b.m.cores.filter(c => c.alive).length);
}
function bossShot(from, dir, tier) {
  const T_ = tier || BOSS_TIERS.warden;
  const s = shotPool.pop() || makeShot();
  s.m.material.color.copy(C(T_.accent));
  s.halo.material.color.copy(C(T_.accent));
  s.m.position.copy(from);
  s.m.scale.setScalar(1.8);
  s.m.visible = true;
  s.v.copy(dir).normalize().multiplyScalar(T_.shotSpeed);
  s.life = 6; s.dmg = T_.shotDmg; s.hitR = 1.5; s.grav = 0; s.friendly = false;
  shots.push(s);
  tone(700, 260, 0.22, 'sawtooth', 0.09);
}

function waveComp(n) {
  if (n <= WAVES.length) return WAVES[n - 1];
  // past the scripted ten, keep climbing from where wave 10 left off
  const k = n - WAVES.length;
  return { seeker: 13 + k * 2, gunner: 7 + k, brute: 4 + Math.floor(k / 2) };
}
function isBossWave(n) { return n % EXTRACT_WAVE === 0; }
function startWave() {
  wave++;
  // a wave counts as clean if integrity never dropped below half during it
  if (wave > 1 && P.waveMinHp >= P.maxHp * 0.5) bumpStat('clean');
  P.waveMinHp = P.hp;
  RUNSTAT.wave = wave;
  checkContracts();
  const comp = waveComp(wave);
  const d = diffMul();
  spawnQueue = [];
  for (const k in comp) {
    const n = Math.max(1, Math.round(comp[k] * d.spawn));
    for (let i = 0; i < n; i++) spawnQueue.push(k);
  }
  for (let i = spawnQueue.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = spawnQueue[i]; spawnQueue[i] = spawnQueue[j]; spawnQueue[j] = t; }
  spawnCool = 0.4 * d.spawnInt;
  sfx.wave();
  // an event on every third wave, drawn from the pool (never the same one twice running)
  if (wave > 2 && wave % 3 === 0 && wave % 5 !== 0) startEvent();
  if (isBossWave(wave)) {
    /* Thin the wave out so the boss is the fight, not a distraction on top of a full
       spawn queue. The wave-10 tier is trimmed harder still: it brings its own escorts. */
    const tier = bossTierFor(wave);
    const cut = tier === 'sovereign' ? 12 : 8;
    spawnQueue = spawnQueue.slice(0, Math.max(4, spawnQueue.length - cut));
    setTimeout(() => { if (state === 'play') spawnBoss(tier); }, 2200);
  }
  toast('WAVE ' + wave + ' — ' + spawnQueue.length + ' HOSTILES', 0xff2f7a);
  if (wave === EXTRACT_WAVE + 1) toast('PRESSURE EASING — RESUPPLY', 0x35ffc4);   // the breather
  if (wave === DEEP_WAVE) toast('FINAL STAND — CLEAR IT FOR THE DEEP-RUN BONUS', 0xffb347);
  const stock = unlockedWeapons().filter(k => P.slots.indexOf(k) < 0);
  if (wave === 2 && stock.length) dropCrate(stock[0]);
  else if (wave === 4 && stock.length) dropCrate(stock[stock.length - 1]);
  else if (wave >= 6 && wave % 3 === 0 && stock.length) dropCrate(pick(stock));
  if (wave === 3 && Object.keys(P.mods).length < 5) dropModCrate();
  if (wave === EXTRACT_WAVE && Object.keys(P.mods).length < 5) dropModCrate();
  // something to spend the breather on, and a leg-up before the wave-10 fight
  if (wave === EXTRACT_WAVE + 1 && Object.keys(P.mods).length < 5) dropModCrate();
  if (wave === DEEP_WAVE - 1 && Object.keys(P.mods).length < 5) dropModCrate();
  if (wave >= 6 && wave % 4 === 0 && Object.keys(P.mods).length < 5) dropModCrate();
  $('waveNum').textContent = String(wave).padStart(2, '0');
}
function findSpawn() {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.283, r = rand(38, 66);
    const x = camera.position.x + Math.cos(a) * r, z = camera.position.z + Math.sin(a) * r;
    if (Math.abs(x) > CFG.bounds - 4 || Math.abs(z) > CFG.bounds - 4) continue;
    const surf = Math.max(floorAt(x, z), P.feetY);
    if (hitsWall(x, z, 2.8, surf)) continue;
    const pos = tmpV.set(x, surf + 2.0, z);
    resolveWallPenetration(pos, 2.8, surf);
    if (wallOverlapping(pos.x, pos.z, 2.8, surf)) continue;
    return pos.clone();
  }
  return new T.Vector3(camera.position.x + 30, P.feetY + 2, camera.position.z);
}
