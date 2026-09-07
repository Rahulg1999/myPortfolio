/* neon-runner · 10-ui.js
   view router, settings, loadout picker, roster, armoury, records
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ============================================================
   FRONT END — view router, live settings, loadout, bestiary, records
   ============================================================ */

/* ---- view router ---- */
const views = {};
document.querySelectorAll('.view').forEach(v => views[v.id.slice(2)] = v);
function showView(name) {
  // A paused run keeps its map and loadout — swapping mid-contract would desync the world.
  if (pausedRun && (name === 'deploy' || name === 'armoury')) {
    $('statusLine').textContent = 'Locked until the run ends';
    return;
  }
  for (const k in views) views[k].classList.toggle('on', k === name);
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  $('statusLine').textContent = name === 'deploy' ? 'Ready to drop'
    : name === 'settings' ? 'Adjusting rig'
    : name === 'manual' ? 'Reading manual'
    : name === 'records' ? 'Reviewing logs' : 'Standing by';
  if (name === 'records') refreshRecords();
  if (name === 'armoury') refreshArmoury();
  if (name === 'multiplayer') mpBuildScreen();
  if (name === 'roster') buildRoster();
  if (name === 'home') buildHomeSelects();
  menuBlip();
}
document.querySelectorAll('#nav button').forEach(b =>
  b.addEventListener('click', () => showView(b.dataset.view)));
document.querySelectorAll('[data-goto]').forEach(b =>
  b.addEventListener('click', () => showView(b.dataset.goto)));
function menuBlip() { if (AC) tone(880, 1180, 0.05, 'triangle', 0.05); }

/* ---- loadout perks ---- */
let perk = 'scavenger';
let loadout = ['pulse', null, null];
/* Weapons you may carry: always the starter, plus anything bought in the Armoury.
   In a PvP match the whole arsenal is issued regardless of credits — see mpCompetitive()
   in 11-multiplayer.js for why deathmatch deliberately ignores progression. */
function unlockedWeapons() {
  if (typeof mpCompetitive === 'function' && mpCompetitive()) return GUN_ORDER.slice();
  return GUN_ORDER.filter(k => k === 'pulse' || owned('wep_' + k));
}
/* ---------- loadout picker: three slots drawn from unlocked weapons ---------- */
let pickSlot = 0;
/* ---------- weapon wheel ----------
   GTA-style radial selector. TAB is the scoreboard (FPS convention), so the wheel lives
   on HOLD Q — a tap still does the old quick-swap, which keeps muscle memory intact.
   Time slows rather than stopping so it cannot be used as a free pause in PvP.

   Built as real annular pie slices rather than floating buttons: the whole angular
   sector is the target, which is the entire point of a radial menu (Fitts's law — the
   nearer and bigger the target, the faster and more accurately you hit it). A hollow
   centre gives the dead zone somewhere to live and doubles as "release here to cancel".
   The pointer is driven by accumulated mouse delta, not the OS cursor, because the game
   holds pointer lock and there is no cursor position to read. */
const WHEEL = { open: false, ax: 0, ay: 0, sel: -1, items: [], openedAt: 0 };
const WHEEL_HOLD = 0.18;          // hold longer than this and it is a wheel, not a tap
const WHEEL_DEAD = 30;            // dead zone radius: below this, no direction is chosen
const WHEEL_REACH = 104;          // pointer travel clamped to this

/* geometry, in the SVG's 0..400 viewBox */
const WH_C = 200, WH_IN = 78, WH_OUT = 178, WH_GAP = 1.6;

function wheelItems() {
  const list = [];
  const n = slotCount();
  for (let i = 0; i < n; i++) if (P.slots[i]) list.push({ slot: i, key: P.slots[i] });
  return list;
}
function openWheel() {
  if (state !== 'play' || WHEEL.open) return;
  const items = wheelItems();
  if (items.length < 2) return;             // nothing to choose between
  WHEEL.open = true;
  WHEEL.items = items;
  WHEEL.ax = 0; WHEEL.ay = 0;
  WHEEL.sel = items.findIndex(it => it.key === P.weapon);
  buildWheel();
  $('wheel').classList.add('on');
  document.body.classList.add('wheelOpen');
  sfx.swap && sfx.swap();
}
function closeWheel(commit) {
  if (!WHEEL.open) return;
  WHEEL.open = false;
  $('wheel').classList.remove('on');
  document.body.classList.remove('wheelOpen');
  if (commit && WHEEL.sel >= 0 && WHEEL.items[WHEEL.sel]) {
    const it = WHEEL.items[WHEEL.sel];
    if (it.key !== P.weapon) selectSlot(it.slot);
  }
}
/* Mouse movement while the wheel is open steers the pointer instead of the camera. */
function wheelAim(dx, dy) {
  if (!WHEEL.open) return;
  WHEEL.ax += dx; WHEEL.ay += dy;
  const mag = Math.hypot(WHEEL.ax, WHEEL.ay);
  if (mag > WHEEL_REACH) { const k = WHEEL_REACH / mag; WHEEL.ax *= k; WHEEL.ay *= k; }
  const n = WHEEL.items.length;
  if (mag > WHEEL_DEAD) {
    // slice 0 sits at the top, angles increase clockwise
    let a = Math.atan2(WHEEL.ax, -WHEEL.ay);
    if (a < 0) a += Math.PI * 2;
    const idx = Math.round(a / (Math.PI * 2 / n)) % n;
    if (idx !== WHEEL.sel) { WHEEL.sel = idx; paintWheel(); sfx.pickup && sfx.pickup(); }
  }
  paintWheelPointer();
}

/* An annular sector path: outer arc clockwise, inner arc back. */
function wedgePath(a0, a1, rIn, rOut) {
  const p = (r, a) => [(WH_C + Math.cos(a) * r).toFixed(2), (WH_C + Math.sin(a) * r).toFixed(2)];
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  const o0 = p(rOut, a0), o1 = p(rOut, a1), i1 = p(rIn, a1), i0 = p(rIn, a0);
  return 'M' + o0 + 'A' + rOut + ',' + rOut + ' 0 ' + large + ',1 ' + o1
       + 'L' + i1 + 'A' + rIn + ',' + rIn + ' 0 ' + large + ',0 ' + i0 + 'Z';
}

function buildWheel() {
  const svg = $('wheelSvg'), labels = $('wheelRing');
  if (!svg || !labels) return;
  svg.innerHTML = '';
  labels.innerHTML = '';
  const n = WHEEL.items.length;
  const step = (Math.PI * 2) / n;
  const gap = (WH_GAP * Math.PI) / 180;

  WHEEL.items.forEach((it, i) => {
    const g = GUNS[it.key];
    const col = '#' + new T.Color(g.tint).getHexString();
    // centred on the top for slice 0, so "straight up" is unambiguous
    const a0 = -Math.PI / 2 - step / 2 + i * step + gap;
    const a1 = a0 + step - gap * 2;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', wedgePath(a0, a1, WH_IN, WH_OUT));
    path.setAttribute('class', 'wWedge');
    path.style.setProperty('--wc', col);
    svg.appendChild(path);

    // label sits on the slice's mid-angle, in HTML so the display font stays crisp
    const mid = (a0 + a1) / 2;
    const R = (WH_IN + WH_OUT) / 2;
    const d = document.createElement('div');
    d.className = 'wLabel';
    d.style.left = (50 + (Math.cos(mid) * R) / 4) + '%';
    d.style.top = (50 + (Math.sin(mid) * R) / 4) + '%';
    d.style.setProperty('--wc', col);
    const ammo = g.melee ? '—' : (P.ammoIn[it.key] !== undefined ? P.ammoIn[it.key] : magSize(it.key));
    d.innerHTML = '<canvas class="wIcon wheelIcon"></canvas>'
      + '<i>' + slotLabel(it.slot).toUpperCase() + '</i>'
      + '<b>' + g.name + '</b>'
      + '<em>' + g.cls + '</em>'
      + '<u>' + (g.melee ? 'MELEE' : ammo + ' / ' + magSize(it.key)) + '</u>';
    labels.appendChild(d);
    requestAnimationFrame(() => drawWeaponIcon(d.querySelector('.wIcon'), it.key));
  });
  paintWheel();
}
function paintWheel() {
  const svg = $('wheelSvg'), labels = $('wheelRing');
  if (!svg) return;
  [...svg.children].forEach((el, i) => el.classList.toggle('sel', i === WHEEL.sel));
  [...labels.children].forEach((el, i) => el.classList.toggle('sel', i === WHEEL.sel));
  const it = WHEEL.items[WHEEL.sel];
  const name = $('wheelName'), sub = $('wheelSub'), hub = $('wheelHub');
  if (it) {
    const g = GUNS[it.key];
    if (name) name.textContent = g.name;
    if (sub) sub.textContent = g.sub;
    if (hub) hub.style.setProperty('--wc', '#' + new T.Color(g.tint).getHexString());
  } else {
    if (name) name.textContent = 'Keep current';
    if (sub) sub.textContent = 'release in the centre to cancel';
  }
}
function paintWheelPointer() {
  const p = $('wheelPtr');
  if (!p) return;
  const mag = Math.hypot(WHEEL.ax, WHEEL.ay);
  p.classList.toggle('live', mag > WHEEL_DEAD);
  p.style.transform = 'translate(calc(-50% + ' + WHEEL.ax + 'px), calc(-50% + ' + WHEEL.ay + 'px))';
}

/* ---------- ability HUD ---------- */
const abilRing = $('abilRing'), abilBox = $('abilityBox');
const RING_LEN = 2 * Math.PI * 16;
function syncAbilityHUD() {
  const a = CH().ability;
  if (hc.abilName !== a.name) {
    hc.abilName = a.name;
    $('abilName').textContent = a.name;
    $('abilKey').textContent = a.key;
    abilRing.style.stroke = '#' + new T.Color(a.col).getHexString();
  }
  const active = P.abilityT > 0;
  const frac = active ? P.abilityT / a.dur
    : P.abilityCool > 0 ? 1 - P.abilityCool / (a.cd + a.dur) : 1;
  abilRing.style.strokeDasharray = RING_LEN;
  abilRing.style.strokeDashoffset = RING_LEN * (1 - clamp(frac, 0, 1));
  const st = active ? 'Active ' + P.abilityT.toFixed(1) + 's'
    : P.abilityCool > 0 ? Math.ceil(P.abilityCool) + 's' : 'Ready';
  if (hc.abilState !== st) { hc.abilState = st; $('abilState').textContent = st; }
  const cls = active ? 'active' : P.abilityCool > 0 ? '' : 'ready';
  if (hc.abilCls !== cls) { hc.abilCls = cls; abilBox.className = cls; }
}

/* ---------- roster ---------- */
function opPortrait(cv, c) {
  const x = cv.getContext('2d'), S = cv.width;
  const hex = n => '#' + new T.Color(n).getHexString();
  x.clearRect(0, 0, S, S);
  x.fillStyle = hex(c.hands.sleeve); x.fillRect(6, 30, S - 12, S - 30);      // sleeve
  x.fillStyle = hex(c.hands.cuff);   x.fillRect(10, 24, S - 20, 10);         // cuff
  x.fillStyle = hex(c.hands.glove);  x.fillRect(13, 8, S - 26, 20);          // glove back
  x.fillStyle = hex(c.hands.pad);    x.fillRect(17, 11, S - 34, 8);          // knuckle pad
  x.fillStyle = hex(c.hands.strap);  x.fillRect(10, 27, S - 20, 2);          // lit strap
  x.fillStyle = hex(c.hands.skin);
  for (let i = 0; i < 4; i++) x.fillRect(16 + i * 6, 4, 4, 6);               // fingertips
  x.strokeStyle = hex(c.ability.col); x.globalAlpha = .8; x.lineWidth = 1.5;
  x.beginPath(); x.arc(S - 12, S - 12, 6, 0, 6.283); x.stroke();
  x.globalAlpha = 1;
}
function buildRoster() {
  const host = $('rosterList');
  host.innerHTML = '';
  $('rosterCred').textContent = PROFILE.credits.toLocaleString();
  $('rosterSel').textContent = CH().name;
  $('rosterRole').textContent = CH().role;
  CHAR_ORDER.forEach(k => {
    const c = CHARACTERS[k];
    const have = c.cost === 0 || owned('char_' + k);
    const gated = PROFILE.level < c.lvl;
    const sel = character === k;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'opCard' + (sel ? ' sel' : '') + (have ? '' : ' locked');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 56;
    card.appendChild(cv);
    const body = document.createElement('div');
    body.innerHTML = '<span class="tag">' + (sel ? 'SELECTED' : have ? 'OWNED' : gated ? 'LEVEL ' + c.lvl : c.cost + ' CR') + '</span>'
      + '<div class="role">' + c.role + '</div><h4>' + c.name + '</h4>'
      + '<div class="abil"><b>' + c.ability.name + '</b> — ' + c.ability.desc + '</div>'
      + '<div class="pas">' + c.passive + '</div>';
    card.appendChild(body);
    card.addEventListener('click', () => {
      if (have) {
        character = k;
        PROFILE.settings.character = k;
        saveProfile();
        applyHandPreview();
        sfx.swap && AC && sfx.swap();
      } else if (!gated && PROFILE.credits >= c.cost) {
        PROFILE.credits -= c.cost;
        PROFILE.unlocks['char_' + k] = 1;
        character = k;
        PROFILE.settings.character = k;
        saveProfile();
        applyHandPreview();
        sfx.power && AC && sfx.power();
        creditLine();
      } else { tone(200, 140, 0.12, 'square', 0.09); return; }
      buildRoster();
    });
    host.appendChild(card);
    opPortrait(cv, c);
  });
}
/* Recolour the live hand rig so the choice is visible before you deploy. */
function applyHandPreview() {
  const h = CH().hands;
  gloveMat.color.copy(C(h.glove));
  glovePad.color.copy(C(h.pad));
  cuffMat.color.copy(C(h.cuff));
  sleeveMat.color.copy(C(h.sleeve));
  strapMat.color.copy(C(h.strap));
  skinMat.color.copy(C(h.skin));
  syncAbilityHUD();
  $('homeChar') && ($('homeChar').textContent = CH().name);
}

function buildLoadout() {
  const host = $('slotPick');
  host.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const key = loadout[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === pickSlot ? 'on' : '';
    b.innerHTML = '<i>Slot ' + (i + 1) + '</i><b>' + (key ? GUNS[key].name : 'Empty') + '</b>'
      + '<em>' + (key ? GUNS[key].cls : 'select') + '</em>';
    b.addEventListener('click', () => { pickSlot = i; buildLoadout(); });
    host.appendChild(b);
  }
  const pool = $('armoryPool');
  pool.innerHTML = '';
  GUN_ORDER.forEach(k => {
    const unlocked = k === 'pulse' || owned('wep_' + k);
    const item = SHOP.find(s => s.id === 'wep_' + k);
    const equipped = loadout.indexOf(k) >= 0;
    const g = GUNS[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'itemCard compactCard' + (unlocked ? '' : ' locked') + (equipped ? ' sel' : '');
    const optic = g.optic ? SCOPES[g.optic].name : '';
    b.innerHTML = '<canvas class="wIcon"></canvas>'
      + '<div class="kicker">' + g.cls + (optic ? ' · ' + optic : '') + '</div>'
      + '<h4>' + g.name + '</h4>'
      + '<div class="foot"><span>' + g.sub + '</span>'
      + (unlocked ? (equipped ? '<span class="badge">EQUIPPED</span>' : '')
                  : '<span class="price">' + (item ? item.cost.toLocaleString() + ' cr' : 'LOCKED') + '</span>')
      + '</div>';
    b.title = g.cls + ' · ' + g.sub;
    b.addEventListener('click', () => {
      if (!unlocked) { showView('armoury'); return; }
      const at = loadout.indexOf(k);
      if (at >= 0 && at !== pickSlot) loadout[at] = null;      // no duplicates across slots
      loadout[pickSlot] = loadout[pickSlot] === k ? null : k;
      if (!loadout.some(Boolean)) loadout[0] = 'pulse';
      PROFILE.settings.loadout = loadout.slice();
      saveProfile();
      pickSlot = (pickSlot + 1) % 3;
      buildLoadout();
      menuBlip();
    });
    pool.appendChild(b);
    requestAnimationFrame(() => drawWeaponIcon(b.querySelector('.wIcon'), k));
  });
}

function buildPerks() {
  const list = $('perkList');
  list.innerHTML = '';
  Object.keys(PERKS).forEach(k => {
    const lockedP = !owned(PERKS[k].id);
    const b = document.createElement('button');
    b.className = 'perk itemCard' + (k === perk ? ' sel' : '') + (lockedP ? ' locked' : '');
    b.type = 'button';
    b.disabled = lockedP;
    b.dataset.perk = k;
    const shopItem = SHOP.find(s => s.id === PERKS[k].id);
    b.innerHTML = '<div class="kicker">Loadout perk</div><h4>' + PERKS[k].name + '</h4>'
      + '<div class="desc">' + PERKS[k].desc + '</div>'
      + (lockedP && shopItem ? '<div class="foot"><span></span><span class="price">'
          + shopItem.cost.toLocaleString() + ' cr</span></div>' : '');
    b.addEventListener('click', () => {
      if (lockedP) return;
      perk = k;
      PROFILE.settings.perk = k; saveProfile();
      document.querySelectorAll('.perk').forEach(p => p.classList.toggle('sel', p.dataset.perk === k));
      $('homePerk').textContent = PERKS[k].name;
      menuBlip();
    });
    list.appendChild(b);
  });
}
const DIFF_BLURBS = {
  easy: 'Fewer hostiles, slower spawns, reduced damage.',
  normal: 'Baseline contract — as authored.',
  hard: 'More hostiles, faster and harder hitting.',
  nightmare: 'Maximum pressure. Not recommended solo.'
};