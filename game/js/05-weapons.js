/* neon-runner · 05-weapons.js
   arsenal stats, viewmodel, parametric gun builder, first-person hands
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- weapons ---------- */
const GUNS = {
  pulse:   { name: 'Pulse Rifle',  sub: '7.6mm · full auto',   mag: 30, rate: 0.085, dmg: 1, pellets: 1,
             spread: 0.0075, auto: true,  reload: 1.25, recoil: 0.028, kick: 0.16, range: 300,
             muzz: -1.12, tint: 0x7fe4ff, sound: 'shot', adsSpread:.55,
             gripZ: 0, foreY: 0, foreZ: 0, magY: -0.10, magZ: 0.045 },
  scatter: { name: 'Scatter-12',   sub: '12ga · 9 pellets',    mag: 8,  rate: 0.58,  dmg: 1, pellets: 9,
             spread: 0.052, auto: false, reload: 1.70, recoil: 0.090, kick: 0.46, range: 46,
             muzz: -0.90, tint: 0xffb347, sound: 'shotgun', adsSpread:.68,
             gripZ: 0.02, foreY: -0.03, foreZ: 0.10, magY: -0.08, magZ: 0.02 },
  rail:    { name: 'Rail Lance',   sub: 'coilgun · pierces',   mag: 5,  rate: 0.80,  dmg: 7, pellets: 1,
             spread: 0.0008, auto: false, reload: 1.95, recoil: 0.105, kick: 0.55, range: 300,
             pierce: true, muzz: -1.36, tint: 0xa46bff, sound: 'rail', adsSpread:.35,
             gripZ: 0.04, foreY: 0.03, foreZ: -0.14, magY: -0.09, magZ: 0.05 }
};
/* ---------- expanded arsenal ----------
   Ten additions across seven classes. Each carries its own ammo type, movement
   penalty, range falloff and a behaviour flag, so they are not stat reskins:
   burst fire, beams, arcing projectiles, piercing nails, melee arcs. */
const AMMO = {
  light:  { name: 'Light',  col: 0x7fe4ff },
  heavy:  { name: 'Heavy',  col: 0xffb347 },
  shell:  { name: 'Shell',  col: 0xff7a4a },
  energy: { name: 'Energy', col: 0xa46bff },
  none:   { name: '—',      col: 0x5c6b8c }
};

Object.assign(GUNS, {
  sidearm: { name: 'Vector-9', sub: '9mm sidearm · semi', cls: 'Pistol', ammo: 'light',
             mag: 15, rate: 0.16, dmg: 1.1, pellets: 1, spread: 0.006, auto: false,
             reload: 0.95, recoil: 0.030, kick: 0.14, range: 120, falloff: 55, move: 1.0,
             muzz: -0.62, tint: 0x9fd8ff, sound: 'shot', adsSpread: 0.45,
             build: { len: 0.30, bore: 0.020, receiver: [0.075, 0.115, 0.30], stock: 'none',
                      magLen: 0.16, rail: 0.14, accent: 0x9fd8ff, bulk: 0.8 } },

  smg:     { name: 'Wasp SMG', sub: '9mm · 900 rpm', cls: 'SMG', ammo: 'light',
             mag: 40, rate: 0.066, dmg: 0.72, pellets: 1, spread: 0.020, auto: true,
             reload: 1.35, recoil: 0.024, kick: 0.13, range: 90, falloff: 34, move: 1.06,
             muzz: -0.78, tint: 0x7fe4ff, sound: 'shot', adsSpread: 0.5,
             build: { len: 0.46, bore: 0.022, receiver: [0.085, 0.12, 0.42], stock: 'folding',
                      magLen: 0.26, rail: 0.24, accent: 0x7fe4ff, bulk: 0.9 } },

  carbine: { name: 'Kestrel AR', sub: '5.5mm · 3-round burst', cls: 'Assault', ammo: 'light',
             mag: 30, rate: 0.075, dmg: 1.25, pellets: 1, spread: 0.0045, auto: false,
             burst: 3, burstGap: 0.30, reload: 1.45, recoil: 0.030, kick: 0.18, range: 180,
             falloff: 90, move: 0.97, muzz: -1.06, tint: 0x35ffc4, sound: 'shot', adsSpread: 0.32,
             build: { len: 0.72, bore: 0.024, receiver: [0.095, 0.13, 0.56], stock: 'fixed',
                      magLen: 0.30, rail: 0.40, accent: 0x35ffc4, bulk: 1.0 } },

  lmg:     { name: 'Ogre LMG', sub: '7.6mm · belt fed', cls: 'Heavy', ammo: 'heavy',
             mag: 100, rate: 0.075, dmg: 1.15, pellets: 1, spread: 0.028, auto: true,
             reload: 3.4, recoil: 0.040, kick: 0.30, range: 160, falloff: 80, move: 0.72,
             spinUp: 0.35, muzz: -1.22, tint: 0xffb347, sound: 'shot', adsSpread: 0.55,
             build: { len: 0.86, bore: 0.034, receiver: [0.14, 0.17, 0.62], stock: 'fixed',
                      magLen: 0.0, drum: true, rail: 0.34, accent: 0xffb347, bulk: 1.5 } },

  dmr:     { name: 'Verdict DMR', sub: '7.6mm · marksman', cls: 'Marksman', ammo: 'heavy',
             mag: 12, rate: 0.34, dmg: 3.4, pellets: 1, spread: 0.0016, auto: false,
             reload: 1.75, recoil: 0.075, kick: 0.38, range: 300, falloff: 240, move: 0.90,
             muzz: -1.24, tint: 0xffd9a0, sound: 'rail', adsSpread: 0.2,
             build: { len: 0.90, bore: 0.026, receiver: [0.10, 0.14, 0.60], stock: 'skeleton',
                      magLen: 0.22, rail: 0.46, accent: 0xffd9a0, bulk: 1.1 } },

  autoshot:{ name: 'Ripsaw-A', sub: '12ga · full auto', cls: 'Shotgun', ammo: 'shell',
             mag: 12, rate: 0.24, dmg: 0.62, pellets: 7, spread: 0.070, auto: true,
             reload: 2.3, recoil: 0.070, kick: 0.42, range: 38, falloff: 18, move: 0.88,
             muzz: -0.84, tint: 0xff7a4a, sound: 'shotgun', adsSpread: 0.8,
             build: { len: 0.60, bore: 0.046, receiver: [0.13, 0.16, 0.48], stock: 'folding',
                      magLen: 0.0, drum: true, rail: 0.20, accent: 0xff7a4a, bulk: 1.3 } },

  flak:    { name: 'Cinder GL', sub: '40mm · arcing', cls: 'Heavy', ammo: 'shell',
             mag: 6, rate: 0.85, dmg: 2.2, pellets: 1, spread: 0.004, auto: false,
             reload: 2.6, recoil: 0.090, kick: 0.5, range: 200, move: 0.84,
             lob: true, blastR: 7.5, blastDmg: 5, muzz: -0.80, tint: 0xff9a3c,
             sound: 'shotgun', adsSpread: 0.6,
             build: { len: 0.52, bore: 0.058, receiver: [0.15, 0.16, 0.46], stock: 'folding',
                      magLen: 0.0, drum: true, rail: 0.18, accent: 0xff9a3c, bulk: 1.4 } },

  beam:    { name: 'Ion Lance', sub: 'sustained beam', cls: 'Energy', ammo: 'energy',
             mag: 100, rate: 0.04, dmg: 0.34, pellets: 1, spread: 0.0, auto: true,
             reload: 2.0, recoil: 0.004, kick: 0.03, range: 70, move: 0.92,
             beam: true, muzz: -1.10, tint: 0x7fe4ff, sound: 'rail', adsSpread: 0.9,
             build: { len: 0.80, bore: 0.030, receiver: [0.11, 0.15, 0.54], stock: 'skeleton',
                      magLen: 0.0, cells: true, rail: 0.30, accent: 0x7fe4ff, bulk: 1.15 } },

  nail:    { name: 'Rivet Gun', sub: 'nails · pierces 2', cls: 'SMG', ammo: 'heavy',
             mag: 24, rate: 0.11, dmg: 1.5, pellets: 1, spread: 0.010, auto: true,
             reload: 1.6, recoil: 0.036, kick: 0.22, range: 120, falloff: 60, move: 0.95,
             pierce: true, pierceMax: 2, muzz: -0.92, tint: 0xffb347, sound: 'shot', adsSpread: 0.4,
             build: { len: 0.58, bore: 0.028, receiver: [0.11, 0.14, 0.46], stock: 'none',
                      magLen: 0.24, rail: 0.22, accent: 0xffb347, bulk: 1.05 } },

  blade:   { name: 'Monoblade', sub: 'melee · fast arc', cls: 'Melee', ammo: 'none',
             mag: 0, rate: 0.38, dmg: 4.5, pellets: 1, spread: 0, auto: true,
             reload: 0, recoil: 0.02, kick: 0.18, range: 3.4, move: 1.14,
             melee: true, arc: 1.15, muzz: -0.5, tint: 0x35ffc4, sound: 'swap', adsSpread: 1,
             build: { blade: true, len: 0.92, accent: 0x35ffc4, bulk: 0.9 } },

  hammer:  { name: 'Breaker', sub: 'melee · heavy', cls: 'Melee', ammo: 'none',
             mag: 0, rate: 0.95, dmg: 11, pellets: 1, spread: 0, auto: false,
             reload: 0, recoil: 0.05, kick: 0.55, range: 4.0, move: 0.86,
             melee: true, arc: 1.5, knock: 14, muzz: -0.5, tint: 0xff7a4a, sound: 'swap', adsSpread: 1,
             build: { hammer: true, len: 0.86, accent: 0xff7a4a, bulk: 1.5 } }
});
// classes and ammo for the three originals
GUNS.pulse.cls = 'Assault';  GUNS.pulse.ammo = 'light';  GUNS.pulse.falloff = 110; GUNS.pulse.move = 1.0;
GUNS.scatter.cls = 'Shotgun'; GUNS.scatter.ammo = 'shell'; GUNS.scatter.falloff = 22;  GUNS.scatter.move = 0.9;
GUNS.rail.cls = 'Sniper';     GUNS.rail.ammo = 'energy';   GUNS.rail.falloff = 300; GUNS.rail.move = 0.86;

/* Integral optics: long guns ship with the glass they were designed around, so a sniper
   is scoped the moment you pick it up rather than waiting on a scope drop. Fitted
   automatically on equip (switchWeapon) and removed when you swap off the weapon. */
GUNS.rail.optic = 'long';   // Sniper — 8x
GUNS.dmr.optic  = 'tac';    // Marksman — 4x

/* Shotgun pattern corrections. Two things were off against a real 12ga:

   1. The cone was slightly too wide once the pellet distribution was fixed (see the
      disc sampling in shoot() — the old square sampling clustered pellets toward the
      centre, so the same number read tighter than it was).
   2. Damage fell off from 22m. 00 buck is still lethal out to 35-40m; 22m made the gun
      useless at ranges where it should absolutely still be a threat. Range follows. */
GUNS.scatter.spread = 0.045;  GUNS.scatter.falloff = 30; GUNS.scatter.range = 55;
GUNS.autoshot.spread = 0.060; GUNS.autoshot.falloff = 22; GUNS.autoshot.range = 44;

/* ---------- recoil & bloom ----------
   Every weapon needs four more numbers to drive the handling model in 06-player.js:

     bloom     radians of cone added per shot while the trigger is held
     bloomMax  where that stops growing
     hRecoil   horizontal amplitude of the spray pattern
     climb     how many shots the muzzle rises hard for before the pattern flattens

   The important one is bloomMax, and the trap is deriving it as a MULTIPLE of the
   weapon's base spread. Doing that punishes a wide-coned weapon twice: the Ogre LMG
   already has the widest base cone in the game (0.028) because it is a suppression
   weapon, and multiplying that again put its full-spray cone at 0.062 rad — it could not
   hit a drone at 18m, which is the one thing a belt-fed gun exists to do. Real sustained
   dispersion runs 6-8 mils (~0.007 rad) for an M249; the derivation was off by an order
   of magnitude, and in the wrong direction.

   So bloomMax is derived from a TOTAL target instead: `sprayCone` is where the whole
   cone (base + bloom) ends up at the bottom of a magazine, chosen per class from what
   that class is for. The tuning reference is a player silhouette at 25m — a full spray
   should land about half its rounds there, which works out around 0.035 rad for a rifle.
   Anything wider than its own base contributes no bloom at all rather than going
   negative, which is the correct answer for shotguns: their cone is the choke, not the
   cadence. */
const SPRAY_CONE = {
  Pistol: 0.016, SMG: 0.045, Assault: 0.035, Heavy: 0.042, Marksman: 0.008,
  Sniper: 0.002, Shotgun: 0.075, Energy: 0
};
for (const k in GUNS) {
  const g = GUNS[k];
  if (g.melee) { g.bloom = 0; g.bloomMax = 0; g.hRecoil = 0; g.climb = 1; continue; }
  if (g.bloomMax === undefined) {
    const target = SPRAY_CONE[g.cls] !== undefined ? SPRAY_CONE[g.cls] : 0.035;
    g.bloomMax = Math.max(0, target - g.spread);
  }
  // shots to reach the cap: an automatic gets there over about a third of a magazine,
  // a semi barely blooms at all because you are tapping it anyway
  if (g.bloom === undefined)   g.bloom   = g.bloomMax / (g.auto ? 7 : 4);
  if (g.hRecoil === undefined) g.hRecoil = g.recoil * 0.30;
  if (g.climb === undefined)   g.climb   = g.auto ? 4 : 2;
}
/* Overrides — the cases where the class target is wrong about the weapon:

   lmg      A 9kg belt-fed gun has LESS per-shot muzzle rise than a 3kg carbine firing the
            same round (mass absorbs impulse) but is fired in far longer bursts. The old
            0.040 kick had it backwards against pulse's 0.028; the kick moves down and the
            climb runs longer instead.
   beam     A continuous beam has no per-shot impulse at all. It stays a laser — that is
            its identity against every other weapon here.
   rail/dmr Fired deliberately, one aimed shot at a time: heavy single kick, near-zero
            bloom, because you are never spraying them.
   flak     Grenades arc; there is no barrel climb to learn, just one big shove — and it
            shares the Heavy class target with the LMG, which is wrong for a weapon you
            fire six of, slowly. A 40mm tube walks a little under rapid fire; it does not
            turn into a scattergun. */
GUNS.lmg.recoil = 0.030;  GUNS.lmg.climb = 6;
GUNS.beam.bloom = 0;      GUNS.beam.bloomMax = 0;  GUNS.beam.hRecoil = 0;  GUNS.beam.climb = 1;
GUNS.rail.hRecoil = 0.011; GUNS.rail.climb = 1;
GUNS.dmr.hRecoil  = 0.010; GUNS.dmr.climb  = 2;
GUNS.flak.climb = 1;      GUNS.flak.hRecoil = 0.006;
GUNS.flak.bloom = 0.002;  GUNS.flak.bloomMax = 0.008;
GUNS.sidearm.climb = 1;   // a pistol's first shot is its shot; there is no pattern to learn

/* One step of the spray pattern for shot number `idx` (0 = first shot of the burst).

   The shape is the one every real automatic weapon and every shooter that models them
   produces: a hard vertical climb for the first few rounds while the shooter has not yet
   loaded up against the gun, then the rise tails off and the muzzle starts walking
   sideways. It is DETERMINISTIC — that is the entire point. A pattern you can learn and
   pull against is a skill; a random walk is a coin toss. The caller adds a small jitter
   so it can be learned but not memorised to the pixel.

   Two overlaid sines (rather than a zigzag) give the long left-then-right tail instead of
   alternating every round. The first shot is exactly on the aim point: h is faded in over
   the first three rounds, so tap-firing never eats horizontal drift. */
function recoilStep(w, idx) {
  const climb = idx < w.climb ? 1 : 0.42;
  /* Amplitudes sum to 1.20 rather than 1.50. Together with the lower hRecoil coefficient
     above this puts the horizontal walk of a full spray at roughly 4-5 degrees wide
     instead of 9-12, which is the range a real spray pattern occupies against its own
     vertical climb — the old numbers had the muzzle wandering further sideways than it
     rose, which reads as the weapon swimming rather than climbing. */
  const h = Math.sin(idx * 0.55) * 0.55 + Math.sin(idx * 0.21 + 1.1) * 0.65;
  return { v: w.recoil * climb, h: w.hRecoil * h * Math.min(1, idx / 3) };
}

const GUN_ORDER = Object.keys(GUNS);


/* ---------- weapon icons ----------
   The menus were entirely type — every weapon was a name and a paragraph. These draw a
   side-profile silhouette per gun straight onto a canvas, derived from the SAME `build`
   parameters the 3D viewmodel is composed from (length, bore, receiver box, stock type,
   magazine, drum, cells, rail), so an icon can never drift out of sync with the weapon it
   depicts and no image files are needed. Melee weapons get a blade/hammer profile instead. */
const ICON_DEFAULT_BUILD = { len: 0.55, bore: 0.024, receiver: [0.09, 0.13, 0.44],
                             stock: 'fixed', magLen: 0.24, rail: 0.3, bulk: 1.0 };

function drawWeaponIcon(cv, key) {
  const g = GUNS[key];
  if (!g || !cv) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || cv.width || 120, H = cv.clientHeight || cv.height || 44;
  cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext('2d');
  if (!x) return;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, W, H);

  const hex = n => '#' + new T.Color(n).getHexString();
  const accent = hex(g.tint);
  const body = '#39435c', dark = '#232b3d', edge = 'rgba(255,255,255,.16)';

  // soft accent wash behind the piece so the card reads as lit, not flat
  const grad = x.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, accent + '22');
  x.fillStyle = grad; x.fillRect(0, 0, W, H);

  const cy = H * 0.56;
  const pad = W * 0.08;
  const span = W - pad * 2;

  x.save();
  x.translate(pad, 0);

  if (g.melee) {
    // blade or hammer, angled so it is unmistakably not a gun
    const isHammer = key === 'hammer';
    x.strokeStyle = dark; x.lineWidth = H * 0.13; x.lineCap = 'round';
    x.beginPath(); x.moveTo(span * 0.08, cy + H * 0.24); x.lineTo(span * 0.55, cy - H * 0.06); x.stroke();  // haft
    if (isHammer) {
      x.fillStyle = body;
      x.fillRect(span * 0.52, cy - H * 0.34, span * 0.34, H * 0.34);
      x.fillStyle = accent;
      x.fillRect(span * 0.52, cy - H * 0.34, span * 0.06, H * 0.34);
    } else {
      x.fillStyle = body;
      x.beginPath();
      x.moveTo(span * 0.50, cy - H * 0.02);
      x.lineTo(span * 0.94, cy - H * 0.30);
      x.lineTo(span * 0.98, cy - H * 0.20);
      x.lineTo(span * 0.56, cy + H * 0.10);
      x.closePath(); x.fill();
      x.strokeStyle = accent; x.lineWidth = 1.4;
      x.beginPath(); x.moveTo(span * 0.52, cy - H * 0.02); x.lineTo(span * 0.95, cy - H * 0.28); x.stroke();
    }
    x.restore();
    return;
  }

  const b = g.build || ICON_DEFAULT_BUILD;
  const bulk = b.bulk || 1;
  const recH = H * 0.20 * Math.max(0.7, bulk);
  const recW = span * 0.46;
  const recX = span * 0.20;

  // stock
  if (b.stock && b.stock !== 'none') {
    x.fillStyle = dark;
    if (b.stock === 'folding') x.fillRect(0, cy - recH * 0.30, recX, recH * 0.58);
    else if (b.stock === 'skeleton') {
      x.strokeStyle = dark; x.lineWidth = H * 0.06;
      x.beginPath();
      x.moveTo(recX, cy - recH * 0.3); x.lineTo(span * 0.03, cy - recH * 0.1);
      x.lineTo(span * 0.03, cy + recH * 0.5); x.lineTo(recX, cy + recH * 0.4);
      x.stroke();
    } else x.fillRect(span * 0.01, cy - recH * 0.42, recX, recH * 0.86);
  }

  // receiver
  x.fillStyle = body;
  x.fillRect(recX, cy - recH / 2, recW, recH);
  x.strokeStyle = edge; x.lineWidth = 1;
  x.strokeRect(recX + 0.5, cy - recH / 2 + 0.5, recW - 1, recH - 1);

  // barrel + shroud
  const barX = recX + recW;
  const barLen = span - barX - span * 0.02;
  const barH = Math.max(2.5, H * (b.bore || 0.022) * 7);
  x.fillStyle = dark;
  x.fillRect(barX, cy - barH / 2, barLen, barH);
  if (bulk > 1.1) x.fillRect(barX, cy - barH * 1.6, barLen * 0.55, barH * 3.2);   // heavy shroud

  // muzzle glow
  x.fillStyle = accent;
  x.fillRect(barX + barLen - span * 0.03, cy - barH * 0.9, span * 0.03, barH * 1.8);
  x.save();
  x.globalAlpha = 0.5; x.shadowColor = accent; x.shadowBlur = 8;
  x.fillRect(barX + barLen - span * 0.03, cy - barH * 0.9, span * 0.03, barH * 1.8);
  x.restore();

  // feed: drum, cells, or a box magazine
  if (b.drum) {
    x.fillStyle = body;
    x.beginPath(); x.arc(recX + recW * 0.55, cy + recH * 0.85, H * 0.17, 0, 6.283); x.fill();
    x.strokeStyle = accent; x.lineWidth = 1.2; x.stroke();
  } else if (b.cells) {
    x.fillStyle = accent;
    for (let i = 0; i < 3; i++) x.fillRect(recX + recW * (0.24 + i * 0.20), cy + recH * 0.5, span * 0.035, H * 0.16);
  } else if (b.magLen) {
    x.fillStyle = dark;
    const mw = span * 0.075, mh = H * (0.16 + (b.magLen || 0.2) * 0.42);
    x.fillRect(recX + recW * 0.46, cy + recH * 0.38, mw, mh);
  }

  // optic rail
  if (b.rail) {
    x.fillStyle = dark;
    x.fillRect(recX + recW * 0.12, cy - recH * 0.5 - H * 0.07, recW * (b.rail > 0.3 ? 0.7 : 0.42), H * 0.07);
  }
  // grip
  x.fillStyle = dark;
  x.beginPath();
  x.moveTo(recX + recW * 0.20, cy + recH * 0.42);
  x.lineTo(recX + recW * 0.40, cy + recH * 0.42);
  x.lineTo(recX + recW * 0.33, cy + recH * 0.42 + H * 0.26);
  x.lineTo(recX + recW * 0.12, cy + recH * 0.42 + H * 0.26);
  x.closePath(); x.fill();

  // accent stripe along the receiver
  x.fillStyle = accent;
  x.globalAlpha = 0.85;
  x.fillRect(recX + recW * 0.08, cy + recH * 0.18, recW * 0.7, Math.max(1.5, H * 0.035));
  x.globalAlpha = 1;

  x.restore();
}

/* ---------- viewmodel ---------- */
const gunPivot = new T.Group();
const gun = new T.Group();
gunPivot.add(gun);
vmScene.add(gunPivot);
vmScene.add(new T.HemisphereLight(0x6f8fd8, 0x0a0d16, 1.3));
const gl1 = new T.DirectionalLight(0xffffff, 1.1); gl1.position.set(-1, 2, 2); vmScene.add(gl1);
const gl2 = new T.PointLight(0x7fe4ff, 3.2, 3); gl2.position.set(0.3, -0.1, -0.4); vmScene.add(gl2);
const gl3 = new T.DirectionalLight(0x8ab4ff, 0.55); gl3.position.set(-0.8, -1.2, 0.6); vmScene.add(gl3);

const bodyMat = new T.MeshStandardMaterial({ color: 0x14161e, roughness: 0.42, metalness: 0.85 });
const gripMat = new T.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.9, metalness: 0.1 });
const darkInsetMat = new T.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.55, metalness: 0.72 });
const trimMats = {
  pulse: new T.MeshBasicMaterial({ color: C(0x7fe4ff) }),
  scatter: new T.MeshBasicMaterial({ color: C(0xffb347) }),
  rail: new T.MeshBasicMaterial({ color: C(0xa46bff) })
};
function accentMat(hex) {
  return new T.MeshStandardMaterial({ color: C(hex), emissive: C(hex), emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.6 });
}
const accentPulse = accentMat(0x7fe4ff), accentScatter = accentMat(0xffb347), accentRail = accentMat(0xa46bff);
function gpart(host, geo, mat, x, y, z, rx) {
  const o = new T.Mesh(geo, mat); o.position.set(x, y, z);
  if (rx) o.rotation.x = rx; host.add(o); return o;
}
function gpartBox(host, w, h, d, mat, x, y, z, rx, ry, rz) {
  const o = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  o.position.set(x || 0, y || 0, z || 0);
  o.rotation.set(rx || 0, ry || 0, rz || 0);
  host.add(o); return o;
}
function gpartCyl(host, rt, rb, h, seg, mat, x, y, z, rx, ry, rz) {
  const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 10), mat);
  o.position.set(x || 0, y || 0, z || 0);
  o.rotation.set(rx || 0, ry || 0, rz || 0);
  host.add(o); return o;
}
function gpartWedge(host, w, h, d, mat, x, y, z, tiltX) {
  return gpartBox(host, w, h, d, mat, x, y, z, tiltX || 0, 0, 0);
}
function gpartChamfer(host, w, h, d, mat, x, y, z) {
  gpartBox(host, w, h, d, mat, x, y, z);
  const cw = w * 0.2, ch = h * 0.2, cd = d * 0.2;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    gpartBox(host, cw, ch, cd, mat, x + sx * (w * 0.38), y + sy * (h * 0.38), z + sz * (d * 0.38));
}
function gpartChannel(host, len, trim, x, y, z) {
  gpartBox(host, 0.058, 0.020, len, darkInsetMat, x, y, z);
  gpartBox(host, 0.042, 0.010, len * 0.96, trim, x, y + 0.007, z);
}
function gpartFacet(host, w, h, d, mat, x, y, z, ry) {
  return gpartBox(host, w, h, d, mat, x, y, z, 0, ry || 0, 0);
}
function gpartRail(host, len, trim, x, y, z) {
  gpartBox(host, 0.016, 0.024, len, trim, x, y, z);
  gpartBox(host, 0.010, 0.014, len * 0.94, trim, x + 0.034, y - 0.005, z);
  gpartBox(host, 0.010, 0.014, len * 0.94, trim, x - 0.034, y - 0.005, z);
}
function gpartRingSight(host, trim, x, y, z) {
  gpart(host, new T.TorusGeometry(0.030, 0.006, 6, 16), trim, x, y, z, Math.PI / 2);
  gpartBox(host, 0.007, 0.038, 0.007, trim, x, y + 0.020, z - 0.014);
}
function gpartVent(host, n, zStart, zStep, y) {
  for (let i = 0; i < n; i++)
    gpartBox(host, 0.058, 0.014, 0.020, darkInsetMat, 0, y || 0.034, zStart - i * zStep);
}
function gpartBarrelFacet(host, len, x, y, z) {
  for (let i = 0; i < 4; i++)
    gpartFacet(host, 0.048, 0.048, len, bodyMat, x, y, z, i * Math.PI / 4);
  gpartBox(host, 0.028, 0.028, len * 0.92, darkInsetMat, x, y, z);
}
const gunModels = {};
const railCoilGlows = [];
const magPropRef = { mesh: null };
const MAG_HOME = new T.Vector3(0, -0.145, -0.20);
/* Height of the iron sight line above the top of the optic rail. ~22mm is the standard
   AR-height sight, and it is the number the parametric builder and the ADS offset below
   both work from, so the geometry and the alignment cannot drift apart. */
const SIGHT_OVER_RAIL = 0.022;
/* Radius of the CLEAR CHANNEL around the sight line: no opaque part of a weapon may sit
   inside this cylinder behind its front sight, or you are aiming at your own hardware.
   Apertures, optic windows and scope tubes are all sized off it, so "can I see through
   this?" is a property of the build rather than something to eyeball per weapon. */
const SIGHT_CLEAR = 0.020;

(function buildGuns() {
  /* Each weapon is assembled from ~40 primitives, then merged per material so the
     whole viewmodel costs four draw calls instead of forty. Shapes lean on
     chamfered receivers, vented handguards, real optics and exposed power cells. */
  const trimA = new T.MeshBasicMaterial({ color: C(0x7fe4ff) });
  const trimB = new T.MeshBasicMaterial({ color: C(0xffb347) });
  const trimC = new T.MeshBasicMaterial({ color: C(0xa46bff) });
  /* Sight glass. This was fully opaque, which was survivable only because ADS used to
     park the weapon off to the side so you never looked through the optic — you looked
     PAST it. Once the sight is aligned to the crosshair the lens is dead centre, so it
     has to behave like glass: tinted, transparent, and not writing depth (otherwise it
     would occlude the world behind it even at 25% opacity). */
  const lensM = new T.MeshBasicMaterial({ color: C(0xff2f7a), transparent: true,
                                          opacity: 0.22, depthWrite: false });
  const polyMat = new T.MeshStandardMaterial({ color: 0x191d26, roughness: 0.78, metalness: 0.12 });
  const AX = new T.Vector3();
  function gx(x, y, z, rx, ry, rz) {
    const q = new T.Quaternion().setFromEuler(new T.Euler(rx || 0, ry || 0, rz || 0, 'XYZ'));
    return new T.Matrix4().compose(AX.set(x, y, z), q, new T.Vector3(1, 1, 1));
  }
  const B = (bd, m, x, y, z, w, h, d, rx, ry, rz) => bd.add(m, new T.BoxGeometry(w, h, d), gx(x, y, z, rx, ry, rz));
  const CY = (bd, m, x, y, z, r1, r2, len, seg, rx, ry, rz) =>
    bd.add(m, new T.CylinderGeometry(r1, r2, len, seg || 12), gx(x, y, z, rx === undefined ? Math.PI / 2 : rx, ry, rz));
  // open-ended cylinder: no end caps, so a scope tube is a tube and not a capped rod
  const CYO = (bd, m, x, y, z, r1, r2, len, seg, rx, ry, rz) =>
    bd.add(m, new T.CylinderGeometry(r1, r2, len, seg || 12, 1, true),
           gx(x, y, z, rx === undefined ? Math.PI / 2 : rx, ry, rz));
  const TOR = (bd, m, x, y, z, r, t, rx) =>
    bd.add(m, new T.TorusGeometry(r, t, 8, 18), gx(x, y, z, rx === undefined ? 0 : rx));
  // picatinny rail: a row of teeth
  function railTeeth(bd, m, x, y, z, len, n) {
    B(bd, m, x, y - 0.008, z, 0.036, 0.016, len);
    for (let i = 0; i < n; i++) B(bd, m, x, y + 0.008, z - len / 2 + 0.012 + i * (len / n), 0.030, 0.018, len / n * 0.55);
  }
  // vent slots down a handguard
  function vents(bd, m, x, y, z, n, step, len) {
    for (let i = 0; i < n; i++) {
      B(bd, m, x + 0.041, y, z + i * step, 0.008, 0.026, len);
      B(bd, m, x - 0.041, y, z + i * step, 0.008, 0.026, len);
      B(bd, m, x, y + 0.036, z + i * step, 0.030, 0.008, len);
    }
  }
  function build(fn) {
    const bd = new Builder();
    fn(bd);
    const grp = new T.Group();
    bd.flush(grp);
    return grp;
  }

  /* ---------------- PULSE RIFLE — bullpup carbine ---------------- */
  gunModels.pulse = build(bd => {
    const M0 = bodyMat, P0 = polyMat, G0 = gripMat, T0 = trimA;
    B(bd, M0, 0, 0, -0.06, 0.098, 0.125, 0.60);                    // lower receiver
    B(bd, M0, 0, 0.012, -0.30, 0.086, 0.088, 0.30);                // upper, chamfered nose
    B(bd, P0, 0, -0.062, -0.06, 0.104, 0.030, 0.56);               // lower shroud
    B(bd, M0, 0.052, 0.006, -0.02, 0.014, 0.070, 0.20, 0, 0, 0.18); // ejection port bevel
    B(bd, M0, -0.052, 0.006, -0.02, 0.014, 0.070, 0.20, 0, 0, -0.18);
    railTeeth(bd, M0, 0, 0.070, -0.24, 0.46, 12);                  // top rail
    /* optic: housing, hood, lens, mount. The housing is a FRAME — four bars around an
       open window — not the solid box it used to be. A holographic sight you cannot see
       through is just a brick bolted to the crosshair. */
    B(bd, M0, 0, 0.108 + 0.028, -0.20, 0.068, 0.007, 0.13);        // housing: top bar
    B(bd, M0, 0, 0.108 - 0.028, -0.20, 0.068, 0.007, 0.13);        // bottom bar
    B(bd, M0, 0.031, 0.108, -0.20, 0.007, 0.063, 0.13);            // side posts
    B(bd, M0, -0.031, 0.108, -0.20, 0.007, 0.063, 0.13);
    B(bd, M0, 0, 0.132, -0.20, 0.040, 0.020, 0.15);                // hood
    TOR(bd, M0, 0, 0.108, -0.266, 0.030, 0.006);                   // hood ring, inner 0.024
    bd.add(lensM, new T.CircleGeometry(0.026, 14), gx(0, 0.108, -0.272, 0, 0, 0));
    B(bd, M0, 0, 0.073, -0.20, 0.034, 0.026, 0.09);                // mount, clear of the window
    // handguard: octagon body + vents + barrel + brake
    CY(bd, M0, 0, 0.012, -0.60, 0.052, 0.052, 0.40, 8);
    vents(bd, P0, 0, 0.012, -0.72, 5, 0.062, 0.030);
    CY(bd, M0, 0, 0.012, -0.86, 0.019, 0.019, 0.24, 10);           // barrel
    CY(bd, M0, 0, 0.012, -1.02, 0.031, 0.034, 0.11, 10);           // muzzle brake
    for (let i = 0; i < 3; i++) B(bd, P0, 0, 0.012, -1.00 + i * 0.032, 0.070, 0.010, 0.012);
    TOR(bd, T0, 0, 0.012, -1.07, 0.026, 0.005, 0);
    // magazine: two-piece curve with a witness strip
    B(bd, P0, 0, -0.145, -0.20, 0.046, 0.19, 0.115, 0.10);
    B(bd, P0, 0, -0.235, -0.222, 0.044, 0.06, 0.108, 0.22);
    B(bd, T0, 0.024, -0.150, -0.20, 0.004, 0.11, 0.070, 0.10);
    // grip, trigger guard, stock
    B(bd, G0, 0, -0.135, 0.055, 0.056, 0.185, 0.098, -0.24);
    B(bd, G0, 0, -0.205, 0.082, 0.052, 0.052, 0.086, -0.24);       // palm swell
    B(bd, M0, 0, -0.062, -0.012, 0.020, 0.050, 0.012);             // trigger guard front
    B(bd, M0, 0, -0.086, 0.026, 0.020, 0.012, 0.088);
    B(bd, M0, 0, -0.052, 0.056, 0.020, 0.044, 0.012);
    B(bd, G0, 0, 0.006, 0.29, 0.086, 0.098, 0.20);                 // stock body
    B(bd, P0, 0, 0.062, 0.30, 0.078, 0.020, 0.16);                 // cheek riser
    B(bd, P0, 0, -0.030, 0.395, 0.082, 0.090, 0.030);              // butt pad
    B(bd, M0, 0.038, 0.030, 0.10, 0.028, 0.016, 0.075, 0, 0, 0.3); // charging handle
    // power cell
    CY(bd, M0, 0, -0.030, 0.20, 0.028, 0.028, 0.13, 10);
    for (let i = 0; i < 3; i++) TOR(bd, T0, 0, -0.030, 0.16 + i * 0.038, 0.029, 0.005, Math.PI / 2);
    B(bd, T0, 0.049, 0.030, -0.30, 0.005, 0.020, 0.26);            // side glow strips
    B(bd, T0, -0.049, 0.030, -0.30, 0.005, 0.020, 0.26);
  });

  /* ---------------- SCATTER-12 — over-under combat shotgun ---------------- */
  gunModels.scatter = build(bd => {
    const M0 = bodyMat, P0 = polyMat, G0 = gripMat, T0 = trimB;
    B(bd, M0, 0, -0.005, 0.02, 0.128, 0.140, 0.44);                // receiver
    B(bd, M0, 0, 0.070, 0.02, 0.100, 0.030, 0.42, 0, 0, 0);        // top flat
    railTeeth(bd, M0, 0, 0.092, -0.06, 0.26, 7);
    /* Raised onto a riser: the shroud around the stacked barrels tops out at 0.138, so a
       sight at 0.128 was mounted BEHIND its own barrel. */
    B(bd, M0, 0, 0.165 + 0.024, -0.10, 0.058, 0.006, 0.09);        // compact holo: frame
    B(bd, M0, 0, 0.165 - 0.024, -0.10, 0.058, 0.006, 0.09);
    B(bd, M0, 0.026, 0.165, -0.10, 0.006, 0.054, 0.09);
    B(bd, M0, -0.026, 0.165, -0.10, 0.006, 0.054, 0.09);
    B(bd, M0, 0, 0.120, -0.10, 0.030, 0.036, 0.05);                // riser
    bd.add(lensM, new T.CircleGeometry(0.021, 12), gx(0, 0.165, -0.146, 0, 0, 0));
    // stacked barrels inside a perforated shroud
    CY(bd, M0, 0.048, 0.040, -0.44, 0.040, 0.040, 0.66, 12);
    CY(bd, M0, -0.048, 0.040, -0.44, 0.040, 0.040, 0.66, 12);
    CY(bd, P0, 0, 0.040, -0.40, 0.098, 0.098, 0.42, 10);           // shroud
    for (let i = 0; i < 6; i++) {
      const a = i * 0.9;
      B(bd, M0, Math.cos(a) * 0.098, 0.040 + Math.sin(a) * 0.098, -0.40, 0.016, 0.016, 0.34);
    }
    CY(bd, M0, 0.048, 0.040, -0.80, 0.046, 0.042, 0.10, 12);       // chokes
    CY(bd, M0, -0.048, 0.040, -0.80, 0.046, 0.042, 0.10, 12);
    TOR(bd, T0, 0.048, 0.040, -0.845, 0.038, 0.006, 0);
    TOR(bd, T0, -0.048, 0.040, -0.845, 0.038, 0.006, 0);
    // pump with finger ridges
    B(bd, G0, 0, -0.052, -0.36, 0.118, 0.062, 0.19);
    for (let i = 0; i < 5; i++) B(bd, M0, 0, -0.084, -0.43 + i * 0.035, 0.104, 0.012, 0.014);
    B(bd, M0, 0, -0.052, -0.20, 0.030, 0.030, 0.20);               // action bar
    // shell carrier down the side
    B(bd, P0, 0.070, -0.030, 0.10, 0.030, 0.070, 0.26);
    for (let i = 0; i < 4; i++) CY(bd, T0, 0.070, -0.030, 0.02 + i * 0.062, 0.018, 0.018, 0.030, 8);
    // grip + stock
    B(bd, G0, 0, -0.150, 0.130, 0.060, 0.195, 0.105, -0.26);
    B(bd, G0, 0, -0.220, 0.160, 0.056, 0.056, 0.092, -0.26);
    B(bd, M0, 0, -0.070, 0.045, 0.022, 0.052, 0.014);
    B(bd, G0, 0, -0.010, 0.310, 0.100, 0.115, 0.22);
    B(bd, P0, 0, -0.040, 0.425, 0.096, 0.105, 0.032);
    B(bd, T0, 0, 0.086, 0.16, 0.070, 0.010, 0.14);
  });

  /* ---------------- RAIL LANCE — coilgun with exposed accelerator ---------------- */
  gunModels.rail = build(bd => {
    const M0 = bodyMat, P0 = polyMat, G0 = gripMat, T0 = trimC;
    B(bd, M0, 0, 0, 0.02, 0.104, 0.135, 0.54);                     // receiver
    B(bd, P0, 0, -0.070, 0.02, 0.110, 0.030, 0.50);
    railTeeth(bd, M0, 0, 0.078, -0.10, 0.34, 9);
    // long-range scope: tube, bells, turrets, lens
    CYO(bd, M0, 0, 0.128, -0.24, 0.030, 0.030, 0.46, 12);          // tube (open: you look down it)
    CYO(bd, M0, 0, 0.128, -0.48, 0.044, 0.034, 0.10, 12);          // objective bell
    CYO(bd, M0, 0, 0.128, -0.02, 0.038, 0.030, 0.08, 12);          // ocular
    bd.add(lensM, new T.CircleGeometry(0.038, 14), gx(0, 0.128, -0.532, 0, 0, 0));
    CY(bd, M0, 0, 0.166, -0.22, 0.020, 0.020, 0.030, 8, 0, 0, 0);
    B(bd, M0, 0, 0.098, -0.36, 0.036, 0.036, 0.05);                // rings
    B(bd, M0, 0, 0.098, -0.10, 0.036, 0.036, 0.05);
    // accelerator: twin rails with five coils, brightening toward the muzzle
    B(bd, M0, 0.030, 0.014, -0.72, 0.016, 0.030, 0.90);
    B(bd, M0, -0.030, 0.014, -0.72, 0.016, 0.030, 0.90);
    B(bd, T0, 0, 0.014, -0.72, 0.030, 0.006, 0.86);                // energy line
    for (let i = 0; i < 5; i++) {
      const z = -0.36 - i * 0.19;
      TOR(bd, M0, 0, 0.014, z, 0.062, 0.017, 0);
      TOR(bd, T0, 0, 0.014, z, 0.062, 0.008, 0);
      B(bd, P0, 0, -0.046, z, 0.058, 0.026, 0.030);
    }
    CY(bd, M0, 0, 0.014, -1.24, 0.048, 0.040, 0.10, 12);           // muzzle collar
    TOR(bd, T0, 0, 0.014, -1.30, 0.040, 0.007, 0);
    // capacitor pack + heat fins
    CY(bd, M0, 0, -0.030, 0.24, 0.048, 0.048, 0.22, 12);
    for (let i = 0; i < 4; i++) TOR(bd, T0, 0, -0.030, 0.16 + i * 0.045, 0.050, 0.006, Math.PI / 2);
    for (let i = 0; i < 5; i++) B(bd, P0, 0, 0.062, 0.10 + i * 0.036, 0.084, 0.030, 0.012);
    // folded bipod
    B(bd, M0, 0.034, -0.048, -0.68, 0.014, 0.014, 0.22, 0.35);
    B(bd, M0, -0.034, -0.048, -0.68, 0.014, 0.014, 0.22, 0.35);
    // grip + skeleton stock
    B(bd, G0, 0, -0.140, 0.100, 0.056, 0.190, 0.100, -0.22);
    B(bd, G0, 0, -0.212, 0.128, 0.052, 0.052, 0.088, -0.22);
    B(bd, M0, 0, -0.068, 0.030, 0.020, 0.050, 0.012);
    B(bd, M0, 0.036, 0.020, 0.30, 0.016, 0.016, 0.24);
    B(bd, M0, -0.036, 0.020, 0.30, 0.016, 0.016, 0.24);
    B(bd, M0, 0, 0.078, 0.30, 0.088, 0.016, 0.22);
    B(bd, P0, 0, 0.020, 0.415, 0.090, 0.120, 0.030);
    B(bd, P0, 0, 0.086, 0.28, 0.080, 0.022, 0.16);                 // cheek rest
  });

  // Detachable magazine: animated during reload, so it is not merged into the hull.
  const magGrp = new T.Group();
  const magBody = new T.Mesh(new T.BoxGeometry(0.046, 0.19, 0.115), polyMat);
  magBody.rotation.x = 0.10;
  magGrp.add(magBody);
  const magToe = new T.Mesh(new T.BoxGeometry(0.044, 0.06, 0.108), polyMat);
  magToe.position.set(0, -0.09, -0.022); magToe.rotation.x = 0.22;
  magGrp.add(magToe);
  const magWit = new T.Mesh(new T.BoxGeometry(0.004, 0.11, 0.07), trimA);
  magWit.position.set(0.024, 0.005, 0);
  magGrp.add(magWit);
  gun.add(magGrp);
  magPropRef.mesh = magGrp;

  // The rail's coils pulse, so they stay as separate meshes on top of the merged hull.
  const coilGeo = new T.TorusGeometry(0.068, 0.009, 8, 20);
  for (let i = 0; i < 5; i++) {
    const m = new T.Mesh(coilGeo, new T.MeshBasicMaterial({ color: C(0xa46bff) }));
    m.position.set(0, 0.014, -0.36 - i * 0.19);
    gunModels.rail.add(m);
    railCoilGlows.push(m);
  }
  /* ---------- parametric builder for the expanded arsenal ----------
     Ten bespoke model functions would be unmaintainable, so new weapons are
     composed from a shared parts library driven by their `build` spec. */
  function partsModel(spec) {
    return build(bd => {
      const M0 = bodyMat, P0 = polyMat, G0 = gripMat;
      const T0 = new T.MeshBasicMaterial({ color: C(spec.accent) });
      const b = spec.bulk || 1;

      if (spec.blade) {                                  // monoblade
        B(bd, M0, 0, -0.06, 0.10, 0.05, 0.05, 0.24);     // handle
        for (let i = 0; i < 4; i++) B(bd, G0, 0, -0.06, 0.02 + i * 0.05, 0.056, 0.056, 0.03);
        B(bd, M0, 0, -0.04, -0.05, 0.13, 0.03, 0.06);    // guard
        bd.add(M0, new T.BoxGeometry(0.016, 0.10, spec.len), gx(0, 0.02, -0.55, 0, 0, 0.06));
        bd.add(T0, new T.BoxGeometry(0.006, 0.055, spec.len * 0.92), gx(0.008, 0.02, -0.55, 0, 0, 0.06));
        bd.add(M0, new T.ConeGeometry(0.05, 0.20, 4), gx(0, 0.02, -1.02, -Math.PI / 2, 0, 0.06));
        return;
      }
      if (spec.hammer) {                                 // breaker
        B(bd, M0, 0, -0.05, 0.10, 0.045, 0.045, 0.30);
        for (let i = 0; i < 5; i++) B(bd, G0, 0, -0.05, 0.00 + i * 0.05, 0.052, 0.052, 0.03);
        B(bd, M0, 0, 0.00, -0.42, 0.055, 0.055, 0.70);   // shaft
        B(bd, M0, 0, 0.00, -0.80, 0.26, 0.20, 0.22);     // head
        B(bd, P0, 0, 0.00, -0.90, 0.22, 0.17, 0.06);
        B(bd, T0, 0.135, 0.00, -0.80, 0.012, 0.13, 0.16);
        B(bd, T0, -0.135, 0.00, -0.80, 0.012, 0.13, 0.16);
        return;
      }

      const r = spec.receiver;
      B(bd, M0, 0, 0, -0.02, r[0], r[1], r[2]);                            // receiver
      B(bd, P0, 0, -r[1] * 0.52, -0.02, r[0] * 1.04, 0.03, r[2] * 0.92);   // underside
      B(bd, M0, 0.5 * r[0], 0.01, 0.02, 0.012, r[1] * 0.5, r[2] * 0.5, 0, 0, 0.2);
      if (spec.rail) railTeeth(bd, M0, 0, r[1] * 0.55, -0.16, spec.rail, Math.round(spec.rail / 0.038));
      /* Iron sights. These weapons carried a bare picatinny rail and nothing on it, so
         aiming down them meant staring over a flat receiver with no sight picture at all
         — there was literally nothing to line up. A rear aperture and a front post fix
         that, and give ADS a real reference to align to.

         SIGHT_OVER_RAIL is height-over-bore expressed above the rail top: ~22mm is the
         standard AR-height sight line, and it is what `sightY` (recorded on the spec
         below) hands to the ADS offset so the aperture lands dead on the crosshair. */
      const railTop = r[1] * 0.55 + 0.017;
      /* Height over the rail is only half the constraint: a fat shroud (the 40mm Cinder,
         the autoshotgun) can reach ABOVE a rail-height sight, which buries the sight
         behind the barrel and puts hardware straight across the aim point. Take whichever
         is higher and let the front post ride a taller riser — which is exactly what real
         shotguns and grenade launchers do for the same reason. */
      const shroudTop = 0.012 + spec.bore * 1.9;
      const sy = Math.max(railTop + SIGHT_OVER_RAIL, shroudTop + SIGHT_CLEAR + 0.004);
      spec.sightY = sy;                 // single source of truth for the ADS offset below
      const frontZ = -r[2] * 0.5 - spec.len * 0.72;      // out near the muzzle
      const apZ = -0.16 + spec.rail * 0.5 - 0.01;
      // ghost ring: inner radius clears SIGHT_CLEAR, so it reads as a hole and not a blob
      TOR(bd, M0, 0, sy, apZ, SIGHT_CLEAR + 0.008, 0.004, 0);      // rear aperture ring
      /* The base hangs BELOW the ring's opening. Centring it on sy - 0.012 put its top
         edge exactly on the sight line, so it filled the bottom half of the very hole
         you are supposed to look through. */
      B(bd, M0, 0, sy - 0.030, apZ, 0.030, 0.024, 0.014);
      B(bd, M0, 0, sy - 0.014, frontZ, 0.008, 0.028, 0.010);                 // front post
      B(bd, T0, 0, sy + 0.001, frontZ, 0.005, 0.006, 0.008);                 // post bead
      B(bd, M0, 0.014, sy - 0.010, frontZ, 0.006, 0.022, 0.010);             // post ears
      B(bd, M0, -0.014, sy - 0.010, frontZ, 0.006, 0.022, 0.010);

      // barrel, shroud, muzzle
      const bz = -r[2] * 0.5 - spec.len * 0.5;
      CY(bd, M0, 0, 0.012, bz, spec.bore, spec.bore, spec.len, 10);
      CY(bd, P0, 0, 0.012, bz + spec.len * 0.22, spec.bore * 1.9, spec.bore * 1.9, spec.len * 0.5, 8);
      for (let i = 0; i < 4; i++) {
        const vz = bz + spec.len * 0.34 - i * spec.len * 0.14;
        B(bd, M0, spec.bore * 1.9, 0.012, vz, 0.008, 0.024, spec.len * 0.07);
        B(bd, M0, -spec.bore * 1.9, 0.012, vz, 0.008, 0.024, spec.len * 0.07);
      }
      CY(bd, M0, 0, 0.012, bz - spec.len * 0.5 - 0.05, spec.bore * 1.5, spec.bore * 1.35, 0.10, 10);
      TOR(bd, T0, 0, 0.012, bz - spec.len * 0.5 - 0.10, spec.bore * 1.3, 0.005, 0);

      // feed device
      if (spec.drum) {
        CY(bd, P0, 0, -0.14 * b, 0.02, 0.13 * b, 0.13 * b, 0.075, 14, 0, 0, 0);
        TOR(bd, T0, 0, -0.14 * b, 0.05, 0.10 * b, 0.006, 0);
      } else if (spec.magLen > 0) {
        B(bd, P0, 0, -0.055 - spec.magLen * 0.5, -0.04, 0.046, spec.magLen, 0.108, 0.10);
        B(bd, T0, 0.025, -0.055 - spec.magLen * 0.45, -0.04, 0.004, spec.magLen * 0.5, 0.062, 0.10);
      }
      if (spec.cells) {                                   // energy cells
        for (let i = 0; i < 3; i++) {
          CY(bd, P0, 0.048, -0.03, 0.12 + i * 0.075, 0.024, 0.024, 0.065, 8, Math.PI / 2);
          CY(bd, T0, -0.048, -0.03, 0.12 + i * 0.075, 0.019, 0.019, 0.070, 8, Math.PI / 2);
        }
      }

      // grip, guard, stock
      B(bd, G0, 0, -0.135, 0.055, 0.056, 0.185, 0.098, -0.24);
      B(bd, G0, 0, -0.205, 0.082, 0.052, 0.052, 0.086, -0.24);
      B(bd, M0, 0, -0.062, -0.012, 0.020, 0.050, 0.012);
      B(bd, M0, 0, -0.086, 0.026, 0.020, 0.012, 0.088);
      if (spec.stock === 'fixed') {
        B(bd, G0, 0, 0.006, 0.28, r[0] * 0.9, r[1] * 0.8, 0.22);
        B(bd, P0, 0, -0.030, 0.385, r[0] * 0.95, 0.085, 0.030);
      } else if (spec.stock === 'skeleton') {
        B(bd, M0, 0.032, 0.020, 0.28, 0.014, 0.014, 0.22);
        B(bd, M0, -0.032, 0.020, 0.28, 0.014, 0.014, 0.22);
        B(bd, M0, 0, 0.072, 0.28, r[0] * 0.8, 0.014, 0.20);
        B(bd, P0, 0, 0.020, 0.395, r[0] * 0.9, 0.105, 0.028);
      } else if (spec.stock === 'folding') {
        B(bd, M0, 0.042, 0.030, 0.22, 0.016, 0.016, 0.20, 0, 0.18);
        B(bd, P0, 0.052, 0.030, 0.33, 0.020, 0.075, 0.030);
      }
      B(bd, T0, 0.5 * r[0] + 0.004, 0.03, -0.14, 0.005, 0.018, r[2] * 0.6);
      B(bd, T0, -0.5 * r[0] - 0.004, 0.03, -0.14, 0.005, 0.018, r[2] * 0.6);
    });
  }
  for (const k in GUNS) {
    if (!gunModels[k] && GUNS[k].build) gunModels[k] = partsModel(GUNS[k].build);
  }

  /* ---------- ADS alignment ----------
     The viewmodel is drawn by vmCam, which sits at the origin of vmScene looking down
     -Z. So a sight appears exactly on the crosshair when its world position has x = 0
     and y = 0 — and since the models sit at the origin of `gun` unrotated, that means
     the aimed position of `gun` is simply the NEGATIVE of the sight's local offset.
     This is the standard "aim part offset" technique: measure where the sight is on the
     weapon, translate the viewmodel by minus that, and the sight lands on the axis.

     It was previously three hand-typed adsPos triples and nothing at all for the other
     eleven weapons — so ADS on the whole expanded arsenal moved the gun nowhere and
     only changed FOV, and even the three that were set sat off-centre: the Pulse Rifle's
     optic aimed 0.060 right and 0.042 low, which on a 1080p screen is the sight sitting
     ~83px right and ~58px below the crosshair you are actually shooting at.

     sightY for the three hand-built models is read off their optic geometry above; the
     parametric weapons compute theirs from the rail they were built with. */
  GUNS.pulse.sightY   = 0.108;   // holographic optic lens
  GUNS.scatter.sightY = 0.165;   // compact holo, on its riser
  GUNS.rail.sightY    = 0.128;   // scope tube centreline
  for (const k in GUNS) {
    const g = GUNS[k];
    if (g.melee) continue;
    if (g.sightY === undefined) g.sightY = (g.build && g.build.sightY) || 0.11;
    /* z is eye relief, not alignment — it only decides how close the weapon is pulled in,
       so it stays a feel value. Longer weapons sit slightly further out so the front post
       does not end up past the far edge of the sight picture. */
    const len = (g.build && g.build.len) || 0.62;
    g.adsPos = [0, -g.sightY, -0.30 - len * 0.26];
  }

  for (const k in gunModels) { gunModels[k].visible = (k === 'pulse'); gun.add(gunModels[k]); }
})();

const muzzleFlash = new T.Mesh(new T.PlaneGeometry(0.44, 0.44),
  new T.MeshBasicMaterial({ map: decalTex, color: C(0xffd9a0), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
muzzleFlash.position.set(0, 0.020, -1.18);
gun.add(muzzleFlash);
const magProp = magPropRef.mesh;

/* ---------- muzzle world position ----------
   The viewmodel lives in its OWN scene, drawn by vmCam (55 degrees, parked at the origin),
   while the world is drawn by  at CFG.fov. A point on the gun therefore has no
   meaningful world position — tracers used a fixed 0.62m offset down the aim vector, which
   is why rounds visibly left somewhere near the crosshair instead of the barrel.

   Project the muzzle through vmCam to find where it actually APPEARS on screen, then
   unproject that same screen point through the world camera. The tracer then leaves the
   barrel the player can see, at any FOV, ADS or hip. */
const _mz = new T.Vector3();
function muzzleWorldPos(out) {
  muzzleFlash.getWorldPosition(_mz);
  _mz.project(vmCam);                       // -> normalised screen coords of the barrel tip
  if (!isFinite(_mz.x) || !isFinite(_mz.y)) { // scoped: viewmodel hidden, fall back to centre
    return out.copy(camera.position).addScaledVector(baseDir, 0.62);
  }
  _mz.z = -1;
  _mz.unproject(camera);                    // -> world point along that screen ray
  out.copy(_mz).sub(camera.position).normalize().multiplyScalar(0.9).add(camera.position);
  return out;
}
/* ---------- PvP-only weapon tuning ----------
   PvE balance assumes durable enemies in groups. Against players — who die fast and are
   single targets — the same numbers make a few weapons oppressive, and explosives in
   particular reward blind spam into a doorway over aim. These multipliers apply ONLY
   inside an active PvP match (mpCompetitive()); PvE is untouched.
     dmg   < 1  → less damage per hit
     rate  > 1  → longer gap between shots
     blast < 1  → smaller explosion radius and falloff damage */
const PVP_TUNE = {
  flak:     { dmg: 0.55, rate: 1.60, blast: 0.60 },  // grenade spam is THE deathmatch problem
  beam:     { dmg: 0.70, rate: 1.00 },               // no-travel-time hitscan beam
  autoshot: { dmg: 0.82, rate: 1.15 },               // full-auto shotgun in corridors
  lmg:      { dmg: 0.85, rate: 1.10 },               // 100-round suppression
  rail:     { dmg: 0.90, rate: 1.15 },               // piercing one-shot potential
  nail:     { dmg: 0.88, rate: 1.10 }
};
const NO_TUNE = { dmg: 1, rate: 1, blast: 1 };
function pvpTune(key) {
  if (typeof mpCompetitive !== 'function' || !mpCompetitive()) return NO_TUNE;
  const t = PVP_TUNE[key];
  return t ? { dmg: t.dmg || 1, rate: t.rate || 1, blast: t.blast || 1 } : NO_TUNE;
}

/* Length of a melee swing. meleeSwing() (06-player.js) starts the timer at this value and
   the viewmodel animation (08-hud.js) maps it to 0..1, so both stay in step from one constant. */
const MELEE_DUR = 0.26;
const GUN_HOME = new T.Vector3(0.20, -0.17, -0.42);
gun.position.copy(GUN_HOME);
// First-person hands: attached to the weapon so they stay on the grips during sway/recoil/reload.
/* ---------- first-person hands ----------
   Articulated gloves: palm, four curled fingers with two joints each, an opposed
   thumb, wrist cuff and sleeve. The rig hangs off the weapon group so recoil,
   sway and ADS carry through without extra bookkeeping. */
const handsRig = new T.Group();
gun.add(handsRig);
const skinMat = new T.MeshStandardMaterial({ color: 0x8a5b45, roughness: 0.88, metalness: 0.02 });
const gloveMat = new T.MeshStandardMaterial({ color: 0x1c2029, roughness: 0.62, metalness: 0.22 });
const glovePad = new T.MeshStandardMaterial({ color: 0x11141b, roughness: 0.45, metalness: 0.42 });
const cuffMat = new T.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.7, metalness: 0.36 });
const sleeveMat = new T.MeshStandardMaterial({ color: 0x161a24, roughness: 0.82, metalness: 0.12 });
const strapMat = new T.MeshBasicMaterial({ color: C(0x7fe4ff) });

const segGeo = new T.BoxGeometry(1, 1, 1);
function seg(parent, w, l, d, mat, y) {
  const m = new T.Mesh(segGeo, mat);
  m.scale.set(w, l, d);
  m.position.y = y;
  parent.add(m);
  return m;
}
function finger(host, x, y, z, len, curl, splay, mirror) {
  const j1 = new T.Group();
  j1.position.set(x, y, z);
  j1.rotation.x = -curl;
  j1.rotation.z = splay * (mirror ? -1 : 1);
  seg(j1, 0.026, len, 0.030, gloveMat, -len / 2);
  const j2 = new T.Group();
  j2.position.y = -len;
  j2.rotation.x = -curl * 1.15;
  j1.add(j2);
  seg(j2, 0.024, len * 0.78, 0.028, gloveMat, -len * 0.39);
  const tip = new T.Mesh(new T.SphereGeometry(0.013, 8, 6), skinMat);
  tip.position.y = -len * 0.78;
  j2.add(tip);
  host.add(j1);
  return { j1: j1, j2: j2, curl: -curl };
}
function makeHand(mirror) {
  const h = new T.Group();
  const palm = new T.Mesh(segGeo, gloveMat);
  palm.scale.set(0.100, 0.115, 0.062);
  h.add(palm);
  const knuckles = new T.Mesh(new T.SphereGeometry(0.055, 10, 8), glovePad);
  knuckles.scale.set(1.02, 0.5, 0.62);
  knuckles.position.y = -0.052;
  h.add(knuckles);
  const back = new T.Mesh(segGeo, glovePad);
  back.scale.set(0.084, 0.09, 0.016);
  back.position.set(0, 0.005, -0.034);
  h.add(back);
  const wrist = new T.Mesh(new T.CylinderGeometry(0.05, 0.056, 0.075, 10), cuffMat);
  wrist.position.y = 0.082;
  h.add(wrist);
  const strap = new T.Mesh(new T.TorusGeometry(0.057, 0.009, 6, 14), strapMat);
  strap.rotation.x = Math.PI / 2;
  strap.position.y = 0.108;
  h.add(strap);
  const sleeve = new T.Mesh(new T.CylinderGeometry(0.062, 0.085, 0.34, 10), sleeveMat);
  sleeve.position.y = 0.29;
  h.add(sleeve);
  const fingers = [];
  for (let i = 0; i < 4; i++) {
    const x = (-0.033 + i * 0.023) * (mirror ? -1 : 1);
    fingers.push(finger(h, x, -0.072, 0.014, 0.046 - Math.abs(i - 1.5) * 0.004,
      0.95 + i * 0.06, 0.05 * (i - 1.5), mirror));
  }
  const thumb = finger(h, 0.049 * (mirror ? -1 : 1), -0.028, 0.030, 0.044, 0.55, 1.05, mirror);
  h.scale.y = -1;
  return { g: h, fingers: fingers, thumb: thumb };
}

const RH = makeHand(true), LH = makeHand(false);   // right hand mirrors, left does not
handsRig.add(RH.g); handsRig.add(LH.g);
const rightHand = RH.g, leftHand = LH.g;
// trigger hand wraps the pistol grip; support hand rides the handguard
const RH_HOME = { p: new T.Vector3(0.012, -0.175, 0.048), r: new T.Vector3(-0.30, 0.10, -0.06) };
const LH_HOME = { p: new T.Vector3(-0.028, -0.150, -0.470), r: new T.Vector3(-0.62, -0.16, 0.30) };
function poseHands() {
  const w = GUNS[P.weapon];
  rightHand.position.copy(RH_HOME.p).add(new T.Vector3(0, 0, w.gripZ || 0));
  rightHand.rotation.set(RH_HOME.r.x, RH_HOME.r.y, RH_HOME.r.z);
  leftHand.position.copy(LH_HOME.p).add(new T.Vector3(0, w.foreY || 0, w.foreZ || 0));
  leftHand.rotation.set(LH_HOME.r.x, LH_HOME.r.y, LH_HOME.r.z);
}
// index finger rests on the trigger and squeezes when you fire
const trigger = RH.fingers[0];
