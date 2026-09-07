/* neon-runner · 01-core.js
   strict mode, config, seeded RNG, profile persistence, catalogue tables
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
'use strict';
/* ============================================================
   NEON RUNNER — RAIN DISTRICT
   single-file WebGL shooter · three.js r128
   ============================================================ */
const T = THREE;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
let SEED = 1;
function srand() {                       // xorshift32 — deterministic per run seed
  SEED ^= SEED << 13; SEED |= 0;
  SEED ^= SEED >>> 17;
  SEED ^= SEED << 5; SEED |= 0;
  return ((SEED >>> 0) % 100000) / 100000;
}
function reseed(s) { SEED = (s | 0) || 1; }
const rand = (a, b) => a + srand() * (b - a);
const rint = (a, b) => Math.floor(rand(a, b + 1));
const chance = p => srand() < p;
const pick = a => a[(srand() * a.length) | 0];
const $ = id => document.getElementById(id);

/* ---- movement feel ----
   Exponential-approach rates: vel moves toward the target by 1 - rate^dt each frame, so a
   SMALLER number is a faster response. Ground stays snappy; air is deliberately sluggish
   so a jump commits you to its arc rather than letting you fly by tapping keys. */
const GROUND_ACCEL = 0.0002;   // ~0.1s to reach full speed
const AIR_ACCEL = 0.12;        // ~0.4s: slow steering, momentum is preserved
const COYOTE_TIME = 0.12;      // grace period to jump after stepping off an edge
const JUMP_BUFFER = 0.15;      // a jump pressed this early still fires on landing

/* ---- stance ----
   Crouching is a real stance, not a camera tween: it lowers the eye, roughly halves the
   walk speed, squashes the hitbox other clients shoot at, and tightens the aim cone. */
const EYE_STAND = 1.75;        // metres from feet to eye, standing
const EYE_CROUCH = 1.12;
const CROUCH_MOVE = 0.46;      // fraction of walk speed while fully crouched
const CROUCH_SQ = 0.70;        // vertical squash applied to a crouching figure + its hitbox

/* ---- weapon handling: inaccuracy and recoil ----
   Modelled on the Counter-Strike split, which is the one worth copying: INACCURACY is a
   random cone that grows with what you are doing (moving, airborne, holding the trigger)
   and cannot be compensated for by skill; RECOIL is a fixed, learnable pattern that kicks
   the view and CAN be pulled against. Keeping them separate is what makes a spray
   controllable at all — a single random cone (what this game had) reads as either a laser
   or a slot machine. All cone values are radians of HALF-angle. */
const INACC_MOVE = 0.030;      // added at full sprint, scaled by (speed/max)^2
const INACC_AIR = 0.055;       // jumping is the worst thing you can do to your aim
const INACC_CROUCH = 0.55;     // multiplier on the weapon's own base spread
const BLOOM_HOLD = 0.12;       // seconds after the last shot before bloom/recoil settle
const BLOOM_DECAY = 0.004;     // exponential-approach rate once settling (~95% in 0.55s)
const RECOIL_RESET = 0.32;     // trigger off this long and the spray pattern starts over

/* ---- the same model, pointed the other way ----
   Everything above describes what it costs YOU to shoot while moving. Drones and bots
   have to pay the equivalent, or the handling model is just a tax on the player.

   For anything shooting AT the player the geometry is inverted: the shooter has a cone,
   the player is a disc of a certain angular size inside it, and the chance of connecting
   is the ratio of the two areas. That single formula is what makes range, stance and
   your own movement all matter to incoming fire without a table of special cases. */
const AI_TRACK_ERR = 0.022;    // cone a shooter adds when tracking a sprinting target
const BOT_BLOOM = 0.006;       // cone a bot adds per shot it takes
const BOT_BLOOM_MAX = 0.030;
const BOT_HIT_FLOOR = 0.10;    // a bot at extreme range is still a reason to take cover
const CROUCH_HIT_R = 0.85;     // incoming splash/projectile radius vs a crouched player

/* ============================================================
   PROFILE — persisted to localStorage, degrades silently when the
   page is sandboxed (some embeds block storage entirely).
   ============================================================ */
const SAVE_KEY = 'neonrunner.profile.v3';
const DEFAULT_PROFILE = {
  name: '', level: 1, xp: 0, credits: 0, lifetime: 0,
  unlocks: { map_rain: 1, perk_scavenger: 1, wep_pulse: 1 },
  upgrades: { integrity: 0, reserve: 0, dash: 0, payout: 0, ordnance: 0, recovery: 0, handling: 0, salvor: 0 },
  stats: { runs: 0, kills: 0, wardens: 0, extractions: 0, bestWave: 0, bestScore: 0, byMap: {} },
  settings: {},
  contracts: null, contractDay: 0, savedAt: 0
};
let PROFILE = JSON.parse(JSON.stringify(DEFAULT_PROFILE));
let storageOK = true;
/* The savedAt that was actually READ from this origin's storage. saveProfile() stamps
   Date.now() and runs several times during boot, so PROFILE.savedAt is "now" long before
   the player has done anything — comparing against that made a brand new profile look
   newer than a real one and blocked the sync. */
let loadedSavedAt = 0;
function loadProfile() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      PROFILE = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE)), p);
      PROFILE.unlocks = Object.assign({ map_rain: 1, perk_scavenger: 1, wep_pulse: 1 }, p.unlocks || {});
      PROFILE.upgrades = Object.assign({ integrity: 0, reserve: 0, dash: 0, payout: 0, ordnance: 0, recovery: 0, handling: 0, salvor: 0 }, p.upgrades || {});
      PROFILE.stats = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE.stats)), p.stats || {});
      loadedSavedAt = p.savedAt || 0;
    }
  } catch (err) { storageOK = false; }
}
function saveProfile() {
  profileStamp();
  if (storageOK) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(PROFILE)); }
    catch (err) { storageOK = false; }
  }
  pushProfile();          // mirror to the host machine's profile.json when allowed
}

/* ---------------- cross-origin profile sync ----------------
   localStorage is scoped per ORIGIN, so `http://localhost:8080` and
   `http://192.168.0.74:8080` keep separate saves — opening the game the "other" way on
   your own machine looked like a brand new account with no credits or unlocks.

   The server holds one profile.json and only serves it to the machine it runs on (see
   handleProfile in server.js), so the host's progression follows them across both
   addresses. Remote players get a 403 and keep their own local save, which is what you
   want: nobody should inherit the host's account by joining their game.

   Conflict rule is last-write-wins on `savedAt`. The two origins are the same person on
   the same machine, so whichever they played most recently is the one they mean. */
let profileSyncOK = false;
/* Nothing may be PUT until the pull has resolved. saveProfile() runs several times during
   boot, so without this gate a freshly-opened origin uploads its EMPTY profile and wipes
   the real one off the server before the merge has even been considered. That is data
   loss, and it is the reason this flag exists. */
let profilePullDone = false;
let profilePushT = null;

function profileStamp() { PROFILE.savedAt = Date.now(); }

/* Merge the server's copy in if it is newer than what this origin has. */
function pullProfile() {
  if (typeof fetch !== 'function' || !location.host) return Promise.resolve(false);
  return fetch('/profile', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('not host'); return r.json(); })
    .then(remote => {
      profileSyncOK = true;                       // a 200 means this IS the host machine
      if (!remote || typeof remote !== 'object') { profilePullDone = true; return false; }
      const localAt = loadedSavedAt, remoteAt = remote.savedAt || 0;
      /* A brand new origin (nothing earned here yet) always takes the server copy — that
         IS the reported problem: opening the other address showed a fresh account. */
      const localEmpty = (PROFILE.level | 0) <= 1 && !(PROFILE.lifetime | 0) && !(PROFILE.credits | 0);
      const remoteHasProgress = (remote.level | 0) > 1 || (remote.lifetime | 0) > 0 || (remote.credits | 0) > 0;
      if (!(localEmpty && remoteHasProgress) && remoteAt <= localAt) { profilePullDone = true; return false; }   // ours is newer — keep it
      PROFILE = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE)), remote);
      PROFILE.unlocks = Object.assign({ map_rain: 1, perk_scavenger: 1, wep_pulse: 1 }, remote.unlocks || {});
      PROFILE.upgrades = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE.upgrades)), remote.upgrades || {});
      PROFILE.stats = Object.assign(JSON.parse(JSON.stringify(DEFAULT_PROFILE.stats)), remote.stats || {});
      loadedSavedAt = PROFILE.savedAt || 0;
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(PROFILE)); } catch (e) {}
      profilePullDone = true;
      return true;                                 // caller re-renders the menus
    })
    .catch(() => { profileSyncOK = false; profilePullDone = true; return false; });
}

/* Debounced push — saveProfile() fires on every credit change, and a run ends with a
   burst of them. */
function pushProfile() {
  if (!profileSyncOK || !profilePullDone || typeof fetch !== 'function') return;
  clearTimeout(profilePushT);
  profilePushT = setTimeout(() => {
    fetch('/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(PROFILE)
    }).catch(() => {});
  }, 600);
}

/* Level cap is 100. The old curve (400·l^1.45) needed 12.8M XP to get there — roughly
   5,000 runs — so the cap was decorative. This one totals ~2.2M, about 870 runs at a
   typical payout: a genuine long tail that a committed player can actually finish.
   LEVEL_CAP is enforced in addXP so XP stops accruing rather than silently vanishing. */
const LEVEL_CAP = 100;
const xpForLevel = l => Math.round(210 * Math.pow(l, 1.18));
function addXP(n) {
  if (PROFILE.level >= LEVEL_CAP) { PROFILE.xp = 0; return 0; }   // capped: nothing left to bank
  PROFILE.xp += n;
  let up = 0;
  while (PROFILE.level < LEVEL_CAP && PROFILE.xp >= xpForLevel(PROFILE.level)) {
    PROFILE.xp -= xpForLevel(PROFILE.level); PROFILE.level++; up++;
  }
  if (PROFILE.level >= LEVEL_CAP) PROFILE.xp = 0;
  return up;
}
const owned = id => !!PROFILE.unlocks[id];
loadProfile();
const C = hex => new T.Color(hex).convertSRGBToLinear();  // authored sRGB -> linear pipeline

const CFG = {
  sens: 0.0020,
  fov: 76,
  cell: 26,
  span: 4,          // grid runs -span..span
  bounds: 112,
  quality: 'high'
};
const DIFFICULTY = {
  easy:      { name: 'Easy',      hp: 0.7,  speed: 0.85, dmg: 0.75, spawn: 0.75, spawnInt: 1.25, pay: 0.60, lvl: 1 },
  normal:    { name: 'Normal',    hp: 1,    speed: 1,    dmg: 1,    spawn: 1,    spawnInt: 1,    pay: 1.00, lvl: 1 },
  hard:      { name: 'Hard',      hp: 1.35, speed: 1.15, dmg: 1.25, spawn: 1.2,  spawnInt: 0.85, pay: 1.60, lvl: 3 },
  nightmare: { name: 'Nightmare', hp: 1.7,  speed: 1.3,  dmg: 1.5,  spawn: 1.4,  spawnInt: 0.7,  pay: 2.40, lvl: 6 }
};
/* A payout multiplier as a readable signed percentage. Easy pays 0.60, i.e. 40% LESS —
   blindly prefixing '+' printed "+-40%", so the sign is derived rather than assumed. */
function signedPct(mul) {
  const pct = Math.round((mul - 1) * 100);
  return pct === 0 ? 'Baseline payout' : (pct > 0 ? '+' : '−') + Math.abs(pct) + '%';
}
let difficulty = 'normal';
const diffMul = () => DIFFICULTY[difficulty] || DIFFICULTY.normal;
/* ---- live option state, read by systems that initialise early ---- */
const OPT = {
  invertY: false, adaptive: true, radar: true, dmgNums: true,
  shake: true, ambience: true, volume: 0.5, adsSens: 0.62, dayCycle: true
};

/* ---- catalogue tables: pure data, hoisted so init-time builders can read them ---- */
const SHOP = [
  { id: 'wep_sidearm',  cat: 'Weapons', name: 'Vector-9',   cost: 250,  lvl: 1, desc: 'Fast semi-auto sidearm. No movement penalty.' },
  { id: 'wep_smg',      cat: 'Weapons', name: 'Wasp SMG',   cost: 450,  lvl: 1, desc: '900rpm, low damage, punishing spread past 34m.' },
  { id: 'wep_scatter',  cat: 'Weapons', name: 'Scatter-12', cost: 600,  lvl: 1, desc: 'Pump shotgun. Nine pellets, brutal inside 22m.' },
  { id: 'wep_blade',    cat: 'Weapons', name: 'Monoblade',  cost: 700,  lvl: 2, desc: 'Melee arc. Silent, fast, +14% move speed.' },
  { id: 'wep_carbine',  cat: 'Weapons', name: 'Kestrel AR', cost: 800,  lvl: 2, desc: 'Three-round burst. Tight grouping at range.' },
  { id: 'wep_nail',     cat: 'Weapons', name: 'Rivet Gun',  cost: 950,  lvl: 2, desc: 'Nails that punch through two targets.' },
  { id: 'wep_autoshot', cat: 'Weapons', name: 'Ripsaw-A',   cost: 1100, lvl: 3, desc: 'Full-auto shotgun. Twelve shells, no mercy.' },
  { id: 'wep_dmr',      cat: 'Weapons', name: 'Verdict DMR', cost: 1200, lvl: 3, desc: 'Semi-auto marksman rifle. Pairs with a 4x.' },
  { id: 'wep_beam',     cat: 'Weapons', name: 'Ion Lance',  cost: 1350, lvl: 4, desc: 'Sustained beam. No travel time, short reach.' },
  { id: 'wep_rail',     cat: 'Weapons', name: 'Rail Lance', cost: 1400, lvl: 3, desc: 'Piercing coilgun. Lines enemies up and deletes them.' },
  { id: 'wep_hammer',   cat: 'Weapons', name: 'Breaker',    cost: 1500, lvl: 4, desc: 'Heavy melee with knockback. Slow, devastating.' },
  { id: 'wep_lmg',      cat: 'Weapons', name: 'Ogre LMG',   cost: 1700, lvl: 4, desc: '100-round belt. You will not be moving fast.' },
  { id: 'wep_flak',     cat: 'Weapons', name: 'Cinder GL',  cost: 1900, lvl: 5, desc: 'Arcing 40mm grenades with a 7.5m blast.' },
  { id: 'perk_gunslinger', cat: 'Loadouts', name: 'Gunslinger', cost: 500, lvl: 2, desc: 'Faster reloads, instant swaps, Scatter-12 from the start.' },
  { id: 'perk_bulwark', cat: 'Loadouts', name: 'Bulwark', cost: 900, lvl: 3, desc: '140 integrity and a standing barrier.' },
  { id: 'perk_phantom', cat: 'Loadouts', name: 'Phantom', cost: 1300, lvl: 4, desc: 'Double dash recharge and 15% more speed.' },
  { id: 'map_yard', cat: 'Drop zones', name: 'Container Yard', cost: 900, lvl: 2, desc: 'Three lanes through stacked freight. Cross-links keep the fight moving.' },
  { id: 'map_foundry', cat: 'Drop zones', name: 'Ironworks', cost: 1400, lvl: 3, desc: 'Roofed casting hall. Symmetric, close quarters — built for teams.' },
  { id: 'map_heights', cat: 'Drop zones', name: 'Neon Heights', cost: 1800, lvl: 4, desc: 'Rooftop terrace with real fall hazard.' },
  { id: 'map_spillway', cat: 'Drop zones', name: 'Spillway', cost: 2400, lvl: 6, desc: 'Drained basin under open sky. Long lanes, contested centre deck.' },
  /* --- Field kit: the level 20-100 tail ---
     Everything above is unlocked by about level 18, which left 80 levels of the cap with
     nothing behind them. These are deliberately convenience and sustain rather than raw
     damage, so a capped player is better equipped without simply out-statting a new one
     in PvP (where all of this is switched off anyway — see mpCompetitive()).
     Each id is read somewhere in the game; a test asserts that. */
  { id: 'kit_harness', cat: 'Field kit', name: 'Assault Harness', cost: 3200, lvl: 22,
    desc: 'Start every run with a 40-point barrier already up.' },
  { id: 'kit_bandolier', cat: 'Field kit', name: 'Bandolier', cost: 4500, lvl: 30,
    desc: 'Weapons you are not holding refill their magazine over time.' },
  { id: 'kit_scavenger', cat: 'Field kit', name: 'Deep Pockets', cost: 6000, lvl: 38,
    desc: 'Salvage and mod crates drop roughly twice as often.' },
  { id: 'kit_stim', cat: 'Field kit', name: 'Combat Stim', cost: 8000, lvl: 48,
    desc: 'A kill restores 8 integrity. Stacks with Siphon Core.' },
  { id: 'kit_plating', cat: 'Field kit', name: 'Reactive Plating', cost: 11000, lvl: 60,
    desc: 'Take 12% less damage from every source.' },
  { id: 'kit_cache', cat: 'Field kit', name: 'Forward Cache', cost: 15000, lvl: 75,
    desc: 'Drop in carrying a second grenade and a full reserve of every magazine.' },
  { id: 'kit_veteran', cat: 'Field kit', name: 'Veteran Contract', cost: 22000, lvl: 90,
    desc: '+25% credits and +25% XP from every run. The last thing to buy.' },
  /* --- Optics: normally found as loot mid-run. Buying one fits it from the drop, which
     is a real convenience rather than raw power, so these sit at high clearance and
     high cost as late-game credit sinks. Read by applyOwnedOptics() in 09-loop.js. --- */
  { id: 'opt_reflex', cat: 'Optics', name: 'Reflex 2x (issued)', cost: 2200, lvl: 8,
    desc: 'Drop in with the Reflex 2x already fitted instead of hoping one drops.' },
  { id: 'opt_tac', cat: 'Optics', name: 'Tactical 4x (issued)', cost: 4200, lvl: 12,
    desc: 'Drop in with the Tactical 4x fitted. Ranged builds stop depending on luck.' },
  { id: 'opt_long', cat: 'Optics', name: 'Longshot 8x (issued)', cost: 7500, lvl: 16,
    desc: 'Drop in with the Longshot 8x fitted. The full sniper kit from wave one.' }
];
/* Upgrade tracks are the long-tail credit sink. Everything in SHOP is unlocked by about
   level 6, so without deep tracks there is nothing to earn past that; these run to level
   10 with superlinear costs so credits stay meaningful for a long climb.
   Every track below is actually READ somewhere — grep the key before adding another. */
const UPGRADES = {
  integrity: { name: 'Plating',   max: 20, lvl: 1, cost: l => Math.round(350 + l * 300 + l * l * 55), desc: l => '+' + (l * 15) + ' maximum integrity' },
  reserve:   { name: 'Magazines', max: 20, lvl: 1, cost: l => Math.round(300 + l * 250 + l * l * 50), desc: l => '+' + (l * 15) + '% magazine size' },
  dash:      { name: 'Thrusters', max: 12, lvl: 1, cost: l => Math.round(450 + l * 400 + l * l * 70), desc: l => '-' + Math.round((1 - Math.pow(0.94, l)) * 100) + '% dash cooldown' },
  payout:    { name: 'Broker',    max: 15, lvl: 1, cost: l => Math.round(500 + l * 450 + l * l * 80), desc: l => '+' + (l * 12) + '% credits earned' },
  /* --- higher-clearance tracks, unlocked as you level --- */
  ordnance:  { name: 'Ordnance',  max: 6,  lvl: 7,  cost: l => Math.round(900 + l * 700 + l * l * 120), desc: l => '+' + l + ' grenade' + (l === 1 ? '' : 's') + ' per life' },
  recovery:  { name: 'Field Aid', max: 12, lvl: 10, cost: l => Math.round(800 + l * 600 + l * l * 110), desc: l => 'Regen starts ' + (6 - Math.max(1.2, 6 - l * 0.4)).toFixed(1) + 's sooner, +' + (l * 8) + '% rate' },
  handling:  { name: 'Handling',  max: 12, lvl: 14, cost: l => Math.round(950 + l * 650 + l * l * 130), desc: l => '-' + Math.round((1 - Math.max(0.15, 1 - l * 0.07)) * 100) + '% scope sway, -' + Math.round((1 - Math.max(0.45, 1 - l * 0.035)) * 100) + '% recoil' },
  salvor:    { name: 'Salvor',    max: 10, lvl: 18, cost: l => Math.round(1200 + l * 800 + l * l * 160), desc: l => '+' + (l * 14) + '% XP earned' }
};

/* ---------- optics: found as loot, never issued by default ----------
   Iron sights are always available (small 1.35x steady). Anything beyond that
   must be looted, and each tier trades field of view for reach. */
/* `ret` selects a distinct reticle drawing per optic (see RETICLES in 06-player.js):
   each tier gets its own sight picture rather than the same crosshair scaled up. */
/* `pip` optics keep the world outside the lens VISIBLE but blurred and dimmed, with a
   machined housing ring — the way a scope reads in a real game, rather than the screen
   turning into a black circle. `lens` is the lens diameter, `blur`/`dim` describe the
   out-of-lens treatment: higher magnification occludes more of your view. */
const SCOPES = {
  iron:   { id: 'iron',   name: 'Iron Sights', mag: 1.35, tube: false, sway: 0.0,   col: 0x7fe4ff, sens: 0.85, ret: 'none' },
  /* A reflex sight is NOT a tube. You look through a single piece of glass with both
     eyes open: the weapon stays in view, you see past the housing, and the only thing
     added to the picture is the illuminated dot. Marking it tube:true rendered a 2x red
     dot as a fully-occluding sniper scope with the viewmodel deleted — and, because
     paintReticle() gates the red-dot overlay on `!s.tube`, it also left #dotSight and
     the whole .dotoptic path as dead code that never once ran. Magnified glass (4x, 8x)
     does occlude, so those stay tube:true. */
  reflex: { id: 'reflex', name: 'Reflex 2x',   mag: 2.0,  tube: false, sway: 0.0,  col: 0x35ffc4, sens: 0.62, ret: 'dot' },
  tac:    { id: 'tac',    name: 'Tactical 4x', mag: 4.0,  tube: true,  pip: true, sway: 0.35, col: 0xffb347, sens: 0.38, ret: 'duplex',
            lens: 56, blur: 5, dim: 0.5 },
  long:   { id: 'long',   name: 'Longshot 8x', mag: 8.0,  tube: true,  pip: true, sway: 0.75, col: 0xff2f7a, sens: 0.20, ret: 'milmarks',
            lens: 50, blur: 7, dim: 0.72 }
};
const SCOPE_ORDER = ['iron', 'reflex', 'tac', 'long'];

/* ============================================================
   OPERATORS
   In first person the only readable identity is hands, sleeve and ability, so
   each character redresses the shared hand rig and brings one active power.
   Passives are deliberately mild — these are playstyles, not power tiers.
   ============================================================ */
const CHARACTERS = {
  vanguard: {
    id: 'vanguard', name: 'Vanguard', cost: 0, lvl: 1, role: 'Assault',
    blurb: 'Front-line contractor. Reliable, unfussy, hits harder when it counts.',
    hands: { glove: 0x232935, pad: 0x151a24, cuff: 0x0d1119, sleeve: 0x1d2531, strap: 0x7fe4ff, skin: 0x8a5b45 },
    passive: 'Weapon damage +5%', mods: { dmg: 1.05 },
    ability: { id: 'breach', name: 'Breach', key: 'F', cd: 26, dur: 6, col: 0xff2f7a,
               desc: '+35% fire rate and +25% damage for 6s.' }
  },
  medic: {
    id: 'medic', name: 'Corpsman', cost: 700, lvl: 2, role: 'Support',
    blurb: 'Field medic. Trades raw output for the ability to simply not die.',
    hands: { glove: 0x1b2a26, pad: 0x122019, cuff: 0x0b1512, sleeve: 0xe8eef0, strap: 0x35ffc4, skin: 0x6f4636 },
    passive: 'Health pickups +50%', mods: { heal: 1.5 },
    ability: { id: 'triage', name: 'Triage', key: 'F', cd: 30, dur: 6, col: 0x35ffc4,
               desc: 'Restore 45 integrity, then regenerate rapidly for 6s.' }
  },
  scout: {
    id: 'scout', name: 'Scout', cost: 850, lvl: 2, role: 'Recon',
    blurb: 'Runs light and reads the field before it reads them.',
    hands: { glove: 0x21313a, pad: 0x16232a, cuff: 0x0e1a20, sleeve: 0x2c4250, strap: 0x9fd8ff, skin: 0x93634a },
    passive: 'Move speed +7%', mods: { speed: 1.07 },
    ability: { id: 'scan', name: 'Pulse Scan', key: 'F', cd: 24, dur: 8, col: 0x9fd8ff,
               desc: 'Light up every hostile and double radar range for 8s.' }
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', cost: 1000, lvl: 3, role: 'Tank',
    blurb: 'Walks into rooms other operators back out of.',
    hands: { glove: 0x2e2a22, pad: 0x1d1a14, cuff: 0x14120d, sleeve: 0x3a3428, strap: 0xffb347, skin: 0x7d5238 },
    passive: 'Max integrity +25', mods: { hp: 25 },
    ability: { id: 'aegis', name: 'Aegis', key: 'F', cd: 32, dur: 8, col: 0xffb347,
               desc: 'Take 55% less damage and gain a 60-point barrier for 8s.' }
  },
  blur: {
    id: 'blur', name: 'Blur', cost: 1150, lvl: 3, role: 'Skirmisher',
    blurb: 'Never where the shot was aimed.',
    hands: { glove: 0x2a2136, pad: 0x1b1526, cuff: 0x120e1a, sleeve: 0x3b2d4d, strap: 0xa46bff, skin: 0x8a5b45 },
    passive: 'Dash cooldown -20%', mods: { dash: 0.8 },
    ability: { id: 'overclock', name: 'Overclock', key: 'F', cd: 22, dur: 7, col: 0xa46bff,
               desc: '+45% move speed and dash recharges instantly for 7s.' }
  },
  wraith: {
    id: 'wraith', name: 'Wraith', cost: 1400, lvl: 4, role: 'Stealth',
    blurb: 'Drones lose the lock. Everything else is up to you.',
    hands: { glove: 0x181c22, pad: 0x0f1216, cuff: 0x090b0f, sleeve: 0x14181e, strap: 0x35ffc4, skin: 0x5f4030 },
    passive: 'Enemies react 20% slower', mods: { aggro: 1.2 },
    ability: { id: 'phase', name: 'Phase', key: 'F', cd: 28, dur: 5, col: 0x7fe4ff,
               desc: 'Hostiles lose track of you for 5s. Firing breaks it early.' }
  },
  engineer: {
    id: 'engineer', name: 'Engineer', cost: 1600, lvl: 4, role: 'Deployables',
    blurb: 'Brings a friend. The friend does not miss.',
    hands: { glove: 0x2b2620, pad: 0x1c1813, cuff: 0x13100c, sleeve: 0x40391f, strap: 0xffd9a0, skin: 0x8a5b45 },
    passive: 'Reload 15% faster', mods: { reload: 0.85 },
    ability: { id: 'sentry', name: 'Sentry', key: 'F', cd: 36, dur: 15, col: 0xffd9a0,
               desc: 'Deploy an auto-turret that fires for 15s.' }
  },
  hunter: {
    id: 'hunter', name: 'Hunter', cost: 1800, lvl: 5, role: 'Marksman',
    blurb: 'Patient. Precise. Prefers a scope and a long sightline.',
    hands: { glove: 0x2b1f24, pad: 0x1c1418, cuff: 0x120c10, sleeve: 0x3a2730, strap: 0xff2f7a, skin: 0x6f4636 },
    passive: 'Critical damage +25%', mods: { crit: 1.25 },
    ability: { id: 'mark', name: 'Mark', key: 'F', cd: 28, dur: 10, col: 0xff2f7a,
               desc: 'Every hit counts as a critical for 10s.' }
  }
};
const CHAR_ORDER = Object.keys(CHARACTERS);
let character = 'vanguard';
const CH = () => CHARACTERS[character] || CHARACTERS.vanguard;

const PERKS = {
  scavenger: { id: 'perk_scavenger', name: 'Scavenger', desc: 'Drops appear far more often and linger. Start each run with a salvaged mod.' },
  gunslinger: { id: 'perk_gunslinger', name: 'Gunslinger', desc: 'Reloads 35% faster, weapon swaps are instant, and the Scatter-12 is already in your rack.' },
  bulwark:   { id: 'perk_bulwark', name: 'Bulwark',   desc: '+40 maximum integrity, a standing 40-point barrier, and quicker out-of-combat regen.' },
  phantom:   { id: 'perk_phantom', name: 'Phantom',   desc: 'Dash recharges twice as fast with longer immunity, and you move 15% quicker.' }
};

const CLR = {
  ice: 0x7fe4ff, magenta: 0xff2f7a, amber: 0xffb347,
  mint: 0x35ffc4, violet: 0xa46bff
};
const MAPS = {
  rain: {
    name: 'Rain District', code: 'SECTOR 12', threat: 1,
    blurb: 'Street-level grid, nine days of rain. Tight alleys, long sightlines down the boulevards.',
    tags: ['Ground level', 'Dense cover', 'Wet reflections'],
    fog: 0x0a0d1c, fogD: 0.0105, rain: 1, neon: 1.0, sky: true, ceiling: false,
    floorY: 0, wet: 1.0, bounds: 112, spawn: [0, 26], extraction: [0, -78], padY: 0,
    accent: 0x7fe4ff, dayStart: 0.72, daySpeed: 1
  },
  /* Replaced Sunken Metro. That map was one enclosed trench: a single held angle covered
     the whole playable width, so fights were decided by who looked down it first. This is
     a three-lane layout instead — the standard competitive shape — with cross-links so
     players circulate rather than hold an end. */
  yard: {
    name: 'Container Yard', code: 'DOCK 7', threat: 2,
    blurb: 'Three lanes through a stacked freight yard, linked by cut-throughs. The tower sees everything and hides nothing.',
    tags: ['Three lanes', 'Symmetric', 'Stacked cover'],
    fog: 0x0a1018, fogD: 0.011, rain: 1, neon: 1.0, sky: true, ceiling: false,
    floorY: 0, wet: 0.7, bounds: 96, spawn: [0, 78], extraction: [0, -78], padY: 0,
    accent: 0xffb347, dayStart: 0.12, daySpeed: 1
  },
  /* The two arenas are built for Team Deathmatch: 180-degree rotationally symmetric, so
     neither team gets the better ground, with spawns at opposite ends of the long axis.
     They work for survival waves too, but symmetry is why they exist. */
  foundry: {
    name: 'Ironworks', code: 'FOUNDRY 3', threat: 2,
    blurb: 'A roofed casting hall built round a furnace you cannot shoot through. Tight, fast, all rotation.',
    tags: ['Circular', 'Enclosed', 'Close quarters'],
    fog: 0x140b06, fogD: 0.016, rain: 0, neon: 0.95, sky: false, ceiling: false,
    floorY: 0, wet: 0.35, bounds: 62, spawn: [0, 50], extraction: [0, -50], padY: 0,
    accent: 0xffb347, dayStart: 0.0, daySpeed: 0
  },
  spillway: {
    name: 'Spillway', code: 'BASIN 9', threat: 2,
    blurb: 'A drained overflow channel between raised banks. Three heights, two weir gates, open sky.',
    tags: ['Tiered', 'Open sky', 'Long lanes'],
    fog: 0x08131a, fogD: 0.0085, rain: 1, neon: 1.0, sky: true, ceiling: false,
    floorY: 0, wet: 0.85, bounds: 94, spawn: [0, 76], extraction: [0, -76], padY: 0,
    accent: 0x35ffc4, dayStart: 0.55, daySpeed: 1
  },
  heights: {
    name: 'Neon Heights', code: 'UPPER TERRACE', threat: 3,
    blurb: 'Rooftop decks four hundred metres up, joined by catwalks. Miss a bridge and the city takes you.',
    tags: ['Vertical', 'Fall hazard', 'Open sightlines'],
    fog: 0x140c22, fogD: 0.0075, rain: 0, neon: 1.15, sky: true, ceiling: false,
    floorY: -46, wet: 0.3, bounds: 96, spawn: [0, 30], extraction: [-30, -30], padY: 14,
    accent: 0xffb347, dayStart: 0.34, daySpeed: 1
  }
};
let currentMap = 'rain';
let dayClock = 0.18;

