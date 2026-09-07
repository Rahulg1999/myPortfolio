/* neon-runner · 08-hud.js
   HUD, radar, day/night cycle, environmental events
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- HUD ---------- */
const hud = {
  hp: $('hpVal'), hpFill: $('hpFill'), shFill: $('shFill'), ammo: $('ammoVal'), pips: $('pips'),
  vitals: $('vitals'), weapon: $('weapon'), radar: $('radarCluster'), objective: $('objective'),
  score: $('scoreVal'), kills: $('killVal'), remain: $('remainVal'),
  combo: $('combo'), toast: $('toast'), mark: $('hitmark'), cross: $('cross'),
  dash: $('dashFill'), reload: $('reloadRing'), dmg: $('dmgDir'), fx: $('fx'),
  wpn: $('wpnName'), wpnSub: $('wpnSub'), slots: $('slots'), chips: $('chips'),
  shield: $('shieldChip'), shieldVal: $('shieldVal')
};
const slotEls = {};
function buildSlotHUD() {
  hud.slots.innerHTML = '';
  const n = slotCount();
  for (let i = 0; i < n; i++) {
    const key = P.slots[i];
    const d = document.createElement('span');
    d.innerHTML = '<b>' + (i + 1) + '</b>' + (key ? GUNS[key].name : '—');
    hud.slots.appendChild(d);
    slotEls[i] = d;
  }
  hc.slotSig = '';
}
const buffEls = {
  overdrive: { el: $('bOver'), bar: $('bOverBar'), max: 9 },
  focus: { el: $('bFoc'), bar: $('bFocBar'), max: 7 }
};
let pipEls = [];
function buildPips() {
  hud.pips.innerHTML = '';
  pipEls = [];
  for (let i = 0; i < P.mag; i++) { const d = document.createElement('i'); hud.pips.appendChild(d); pipEls.push(d); }
}
/* Contextual HUD: clusters dim when their information is not actionable and
   snap back the instant it becomes relevant. Principle is progressive
   disclosure — show only what the player needs right now. */
let idleHp = 0, idleAmmo = 0, objTimer = 0, lastObjective = '';
function hudDynamic(dt) {
  if (!OPT.dynamicHud) {
    hud.vitals.classList.remove('idle');
    hud.weapon.classList.remove('idle');
    hud.radar.classList.remove('idle');
    return;
  }
  // vitals: quiet at full health with nothing running
  const vitalsQuiet = P.hp >= P.maxHp - 0.5 && P.shield <= 0
    && P.buffs.overdrive <= 0 && P.buffs.focus <= 0 && P.dashCool <= 0;
  idleHp = vitalsQuiet ? idleHp + dt : 0;
  hud.vitals.classList.toggle('idle', idleHp > 2.5);
  // weapon: quiet with a full magazine and no recent shot
  const weaponQuiet = P.ammo >= P.mag && P.reloading <= 0 && P.fireCool <= 0 && !P.ads;
  idleAmmo = weaponQuiet ? idleAmmo + dt : 0;
  hud.weapon.classList.toggle('idle', idleAmmo > 2.5);
  // radar: quiet with nothing on it
  hud.radar.classList.toggle('idle', !enemies.length && !BOSS.active && !extraction);
  // objective surfaces on change, then withdraws
  if (objTimer > 0) {
    objTimer -= dt;
    if (objTimer <= 0) hud.objective.classList.remove('show');
  }
}
/* `sticky` keeps the line on screen instead of fading after five seconds. The extraction
   choice has to stay readable for the whole four waves you are deciding across — a
   one-off flash when the pad opens is not telling the player anything. */
function setObjective(txt, sticky) {
  if (txt === lastObjective) return;
  lastObjective = txt;
  hud.objective.textContent = txt;
  hud.objective.classList.add('show');
  objTimer = sticky ? Infinity : 5;
}
function hudDamageFlash() {
  hud.vitals.classList.remove('hit');
  void hud.vitals.offsetWidth;
  hud.vitals.classList.add('hit');
  idleHp = 0;
}
/* The HUD is DOM, so every write is a potential layout pass. Everything below is
   diffed against the last committed value and only touched when it actually changes. */
const hc = {};
function txt(el, k, v) { if (hc[k] !== v) { hc[k] = v; el.textContent = v; } }
function sty(el, k, prop, v) { if (hc[k] !== v) { hc[k] = v; el.style[prop] = v; } }
function syncHUD() {
  const hpN = Math.ceil(P.hp);
  txt(hud.hp, 'hp', String(hpN).padStart(3, '0'));
  const f = clamp(P.hp / P.maxHp, 0, 1);
  sty(hud.hpFill, 'hpf', 'transform', 'scaleX(' + (Math.round(f * 100) / 100) + ')');
  sty(hud.hpFill, 'hpc', 'background', f > 0.6 ? '#7fe4ff' : f > 0.28 ? '#ffb347' : '#ff2f7a');
  sty(hud.shFill, 'shf', 'transform', 'scaleX(' + (Math.round(clamp(P.shield / 80, 0, 1) * 100) / 100) + ')');
  if (hc.crit !== (f <= 0.28)) { hc.crit = f <= 0.28; document.body.classList.toggle('critical', hc.crit); }

  txt(hud.ammo, 'ammo', W().melee ? '--' : String(P.ammo).padStart(2, '0'));
  const lowAmmo = !W().melee && P.ammo <= Math.max(3, P.mag * 0.25);
  const noAmmo = !W().melee && P.ammo === 0;
  if (hc.wlow !== lowAmmo) { hc.wlow = lowAmmo; hud.weapon.classList.toggle('low', lowAmmo); }
  if (hc.wempty !== noAmmo) { hc.wempty = noAmmo; hud.weapon.classList.toggle('empty', noAmmo); }
  if (hc.pips !== P.ammo) {
    hc.pips = P.ammo;
    for (let i = 0; i < pipEls.length; i++) {
      const on = i < P.ammo;
      if (pipEls[i]._on !== on) { pipEls[i]._on = on; pipEls[i].className = on ? 'on' : ''; }
    }
  }
  txt(hud.score, 'score', P.score.toLocaleString());
  txt(hud.kills, 'kills', String(P.kills).padStart(2, '0'));
  txt(hud.remain, 'remain', String(enemies.length + spawnQueue.length).padStart(2, '0'));
  sty(hud.dash, 'dash', 'transform', 'scaleX(' + (Math.round((1 - P.dashCool / P.dashMax) * 50) / 50) + ')');
  if (hc.ads !== P.ads) { hc.ads = P.ads; $('adsLabel').classList.toggle('on', P.ads); }
  txt(hud.wpn, 'wpn', W().name);
  txt(hud.wpnSub, 'wpnSub', W().melee ? W().sub : W().sub + ' · ' + AMMO[W().ammo || 'light'].name);
  const sig = P.slots.join(',') + '|' + P.weapon;
  if (hc.slotSig !== sig) {
    hc.slotSig = sig;
    for (let i = 0; i < 3; i++) {
      if (!slotEls[i]) continue;
      const key = i < slotCount() ? P.slots[i] : null;
      slotEls[i].className = (key ? 'own' : '') + (key && key === P.weapon ? ' on' : '');
      slotEls[i].innerHTML = '<b>' + (i + 1) + '</b>' + (key ? GUNS[key].name : '—');
    }
  }
  for (const k in buffEls) {
    const b = buffEls[k], v = P.buffs[k];
    sty(b.el, 'bd' + k, 'display', v > 0 ? 'block' : 'none');
    if (v > 0) sty(b.bar, 'bb' + k, 'transform', 'scaleX(' + (Math.round(v / b.max * 50) / 50) + ')');
  }
  txt($('nadeVal'), 'nade', String(P.nades));
  if (hc.noNades !== (P.nades <= 0)) { hc.noNades = P.nades <= 0; hud.weapon.classList.toggle('noNades', hc.noNades); }
  sty(hud.shield, 'shd', 'display', P.shield > 0 ? 'block' : 'none');
  txt(hud.shieldVal, 'shv', String(Math.ceil(P.shield)));
}
let kickAlt = false;
function hudFlash() { kickAlt = !kickAlt; hud.cross.className = kickAlt ? 'kick' : 'kick2'; }
function hitmarker(crit) {
  hud.mark.className = 'show' + (crit ? ' crit' : '');
  clearTimeout(hitmarker.t);
  hitmarker.t = setTimeout(() => hud.mark.className = '', 140);
}
function toast(txt, col) {
  const d = document.createElement('div');
  d.textContent = txt;
  d.style.color = '#' + new T.Color(col).getHexString();
  hud.toast.prepend(d);
  setTimeout(() => d.classList.add('out'), 1100);
  setTimeout(() => d.remove(), 1700);
  while (hud.toast.children.length > 4) hud.toast.lastChild.remove();
}
const dmgPool = [], projV = new T.Vector3();
let dmgIdx = 0;
for (let i = 0; i < 14; i++) {
  const d = document.createElement('div');
  d.className = 'dmg';
  hud.fx.appendChild(d);
  dmgPool.push({ el: d, alt: false });
}
function damageNumber(worldPos, amount, crit) {
  if (!OPT.dmgNums) return;
  projV.copy(worldPos).project(camera);
  if (projV.z > 1) return;
  const o = dmgPool[dmgIdx = (dmgIdx + 1) % dmgPool.length];
  o.alt = !o.alt;
  const n = Math.round(amount);
  o.el.textContent = crit ? n + '!' : String(n);
  o.el.style.left = ((projV.x * 0.5 + 0.5) * 100) + '%';
  o.el.style.top = ((-projV.y * 0.5 + 0.5) * 100) + '%';
  o.el.style.setProperty('--dx', rand(-30, 30) + 'px');
  o.el.className = 'dmg' + (crit ? ' crit' : '') + (o.alt ? ' a' : ' b');
}
function damageDirection(from) {
  const to = tmpV.copy(from).sub(camera.position);
  const a = Math.atan2(to.x, -to.z) - P.yaw;
  const d = document.createElement('div');
  d.className = 'dd';
  d.style.transform = 'rotate(' + (-a) + 'rad)';
  hud.dmg.appendChild(d);
  setTimeout(() => d.remove(), 1100);   // must outlast the .dd fade-out (1.05s)
}

/* ---------- damage to player ---------- */
function hurt(n, from) {
  if (state !== 'play' || P.iFrames > 0) return;
  if (ABIL.on('aegis')) n *= 0.45;
  // Reactive Plating (kit_plating). Progression perks are off in PvP by design.
  if (owned('kit_plating') && !(typeof mpCompetitive === 'function' && mpCompetitive())) n *= 0.88;
  if (P.shield > 0) {
    const absorbed = Math.min(P.shield, n);
    P.shield -= absorbed; n -= absorbed;
    tone(880, 620, 0.14, 'triangle', 0.10);
    if (P.shield <= 0) toast('BARRIER DOWN', 0xff2f7a);
  }
  P.hp = Math.max(0, P.hp - n);
  P.waveMinHp = Math.min(P.waveMinHp, P.hp);
  P.noDmg = 0;
  hurtFlash = Math.min(hurtFlash + 0.55, 1);
  shakeAmt = Math.min(shakeAmt + 0.35, 0.9);
  sfx.hurt();
  if (from) damageDirection(from);
  if (P.hp <= 0) die();
}
function die() {
  /* PvP deaths go through mpSelfDown: it books the death, credits the killer and any
     assists, and starts the respawn timer.

     This used to read `P.hp = 1; return;` — which made every player immortal. hurt()
     zeroed the HP, die() put it back to 1, and the caller's `if (P.hp <= 0)` test then
     failed, so the down was never registered. With out-of-combat regen ticking the
     victim straight back to full, nobody could ever be killed in a match. */
  if (mpInMatch()) {
    if (!P.respawning) mpSelfDown(mpRecentAttacker());
    return;
  }
  state = 'dead';
  exitLock();
  sfx.lose();
  $('endEyebrow').textContent = 'Contract failed';
  $('endTitle').textContent = 'SIGNAL LOST';
  $('endTitle').className = 'lose';
  $('endSub').textContent = playerName + ' went down in ' + MAPS[currentMap].name + ', wave ' + wave + '.';
  recordRun(false);
  showEnd(settleRun(false));
}
function win() {
  state = 'win';
  exitLock();
  sfx.win();
  $('endEyebrow').textContent = 'Contract closed';
  $('endTitle').textContent = 'EXTRACTED';
  $('endTitle').className = 'won';
  $('endSub').textContent = playerName + ' extracted from ' + MAPS[currentMap].name + '. Contract closed.';
  recordRun(true);
  showEnd(settleRun(true));
}
function showEnd(payout) {
  $('sKills').textContent = P.kills;
  $('sWave').textContent = wave;
  $('sScore').textContent = P.score.toLocaleString();
  /* Accuracy is per trigger pull, not per pellet, so a shotgun is not punished for
     spraying nine of them. Shown as "—" rather than 0% when nothing was fired. */
  const acc = RUNSTAT.shots > 0 ? Math.round(Math.min(100, RUNSTAT.hits / RUNSTAT.shots * 100)) : null;
  $('sAcc').textContent = acc === null ? '—' : acc + '%';

  $('endStampMap').textContent = MAPS[currentMap].name;
  $('endStampDiff').textContent = (payout && payout.diff) || DIFFICULTY[difficulty].name;

  if (payout) {
    $('sCred').textContent = '+' + payout.credits.toLocaleString();
    $('sXp').textContent = '+' + payout.xp.toLocaleString();

    /* Where the money came from. A bare total tells a player nothing about what to do
       differently; a breakdown makes extraction and Warden kills visibly worth chasing. */
    const host = $('payBreak');
    host.innerHTML = '';
    (payout.parts || []).forEach(part => {
      const row = document.createElement('div');
      row.className = 'payRow';
      row.innerHTML = '<span>' + part.k + '</span><em>+' + part.v.toLocaleString() + '</em>';
      host.appendChild(row);
    });
    const mult = payout.mult || 1;
    $('sMult').textContent = mult === 1 ? '' : '×' + mult.toFixed(2) + ' multiplier';

    // XP bar toward the next level — the payLine text version was easy to miss
    const need = payout.xpNeed || xpForLevel(PROFILE.level);
    const have = payout.xpHave === undefined ? PROFILE.xp : payout.xpHave;
    const capped = PROFILE.level >= LEVEL_CAP;
    $('endLvl').textContent = PROFILE.level;
    $('endXpText').textContent = capped ? 'MAX LEVEL'
      : have.toLocaleString() + ' / ' + need.toLocaleString() + ' XP';
    $('endXpFill').style.transform = 'scaleX(' + (capped ? 1 : clamp(have / need, 0, 1)) + ')';
    $('levelUp').style.display = payout.levels ? 'block' : 'none';
    if (payout.levels) {
      $('levelUp').textContent = payout.levels > 1
        ? 'LEVEL ' + PROFILE.level + ' REACHED · +' + payout.levels + ' LEVELS'
        : 'LEVEL ' + PROFILE.level + ' REACHED';
    }
  }
  $('end').classList.add('show');
}

function pause() {
  if (state !== 'play') return;
  state = 'pause';
  exitLock();
  refreshPause();
  $('pause').classList.add('show');
}
let lockAsk = 0;

function resume() {
  $('pause').classList.remove('show');
  state = 'play';
  requestLock();
}

/* ---------- minimap / day-night / map state ---------- */
const mini = $('minimap');
const mctx = mini.getContext('2d');
let RADAR_RANGE = 78;                 // world units shown from the centre outward

function blip(x, z, size, fill, shape) {
  const R = mini.width / 2;
  const dx = x - camera.position.x, dz = z - camera.position.z;
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  // rotate into view space so the radar always points where you are looking
  let rx = dx * c - dz * s, ry = dx * s + dz * c;
  const k = (R - 12) / (RADAR_RANGE * EV.mul.radar);
  rx *= k; ry *= k;
  const d = Math.hypot(rx, ry);
  let edge = false;
  if (d > R - 12) { const f = (R - 12) / d; rx *= f; ry *= f; edge = true; }
  mctx.fillStyle = fill;
  if (shape === 'tri' || edge) {
    const a = Math.atan2(ry, rx);
    mctx.save();
    mctx.translate(R + rx, R + ry); mctx.rotate(a + Math.PI / 2);
    mctx.beginPath(); mctx.moveTo(0, -size); mctx.lineTo(size * .8, size * .7); mctx.lineTo(-size * .8, size * .7);
    mctx.closePath(); mctx.fill(); mctx.restore();
  } else if (shape === 'square') {
    mctx.fillRect(R + rx - size, R + ry - size, size * 2, size * 2);
  } else if (shape === 'diamond') {
    mctx.save();
    mctx.translate(R + rx, R + ry); mctx.rotate(Math.PI / 4);
    mctx.fillRect(-size, -size, size * 2, size * 2);
    mctx.restore();
  } else {
    mctx.beginPath(); mctx.arc(R + rx, R + ry, size, 0, 6.283); mctx.fill();
  }
  return edge;
}

/* A team-mate marker: same projection as blip(), but oriented by the player's own heading
   instead of by their bearing from you, and outlined so it stays readable over the map
   geometry. Passing your own yaw draws it pointing straight up, like the player wedge. */
function teamBlip(x, z, yaw, fill) {
  const R = mini.width / 2;
  const dx = x - camera.position.x, dz = z - camera.position.z;
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  let rx = dx * c - dz * s, ry = dx * s + dz * c;
  const k = (R - 12) / (RADAR_RANGE * EV.mul.radar);
  rx *= k; ry *= k;
  const d = Math.hypot(rx, ry);
  let edge = false;
  if (d > R - 12) { const f = (R - 12) / d; rx *= f; ry *= f; edge = true; }
  mctx.save();
  mctx.translate(R + rx, R + ry);
  // the radar is already rotated into view space, so only the heading DIFFERENCE remains
  mctx.rotate(P.yaw - yaw);
  mctx.beginPath();
  mctx.moveTo(0, -5.4); mctx.lineTo(4.2, 4.4); mctx.lineTo(0, 2.2); mctx.lineTo(-4.2, 4.4);
  mctx.closePath();
  mctx.fillStyle = fill; mctx.fill();
  mctx.strokeStyle = 'rgba(4,8,14,.85)'; mctx.lineWidth = 1; mctx.stroke();
  mctx.restore();
  return edge;
}

let sweep = 0;
function drawMinimap(dt) {
  const S = mini.width, R = S / 2;
  sweep = (sweep + dt * 1.5) % 6.283;
  mctx.clearRect(0, 0, S, S);

  // dish
  mctx.save();
  mctx.beginPath(); mctx.arc(R, R, R - 3, 0, 6.283); mctx.clip();
  mctx.fillStyle = 'rgba(4,8,14,.82)'; mctx.fillRect(0, 0, S, S);

  // static geometry, rotated with the player
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw), k = (R - 12) / (RADAR_RANGE * EV.mul.radar);
  mctx.save();
  mctx.translate(R, R); mctx.rotate(P.yaw); mctx.scale(k, k);
  mctx.fillStyle = 'rgba(126,168,214,.20)';
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    if (b.h < 0) continue;
    const dx = b.x - camera.position.x, dz = b.z - camera.position.z;
    if (Math.abs(dx) > RADAR_RANGE + 20 || Math.abs(dz) > RADAR_RANGE + 20) continue;
    mctx.fillStyle = b.walk && b.h > 1 && b.h < 12 ? 'rgba(53,255,196,.22)' : 'rgba(126,168,214,.18)';
    mctx.fillRect(dx - b.hw, dz - b.hd, b.hw * 2, b.hd * 2);
  }
  mctx.restore();

  // range rings + crosshair
  mctx.strokeStyle = 'rgba(127,228,255,.13)'; mctx.lineWidth = 1;
  [0.33, 0.66, 1].forEach(f => { mctx.beginPath(); mctx.arc(R, R, (R - 12) * f, 0, 6.283); mctx.stroke(); });
  mctx.beginPath(); mctx.moveTo(R, 6); mctx.lineTo(R, S - 6); mctx.moveTo(6, R); mctx.lineTo(S - 6, R); mctx.stroke();

  // sweep wedge
  mctx.save();
  mctx.translate(R, R); mctx.rotate(sweep);
  mctx.fillStyle = 'rgba(127,228,255,.07)';
  mctx.beginPath(); mctx.moveTo(0, 0); mctx.arc(0, 0, R - 4, -0.5, 0); mctx.closePath(); mctx.fill();
  mctx.strokeStyle = 'rgba(127,228,255,.35)'; mctx.beginPath(); mctx.moveTo(0, 0); mctx.lineTo(R - 4, 0); mctx.stroke();
  mctx.restore();

  // objectives first so hostiles draw over them
  if (extraction) blip(padPos.x, padPos.z, 6, '#35ffc4', 'tri');
  for (const l of landmarks) blip(l.x, l.z, 2.5, 'rgba(255,255,255,.25)', 'square');
  for (const b of barrels) if (b.live) blip(b.x, b.z, 2, 'rgba(255,122,24,.75)', 'square');
  for (const p of pickups) {
    if (!p.g.visible) continue;
    const def = PU[p.kind];
    const col = p.kind === 'modcrate' && p.modId ? MODS[p.modId].col : def.col;
    const fill = '#' + new T.Color(col).getHexString();
    const rs = def.radarShape || 'circle', sz = def.radarSize || 3.2;
    if (p.pulseT > 0) {
      mctx.save(); mctx.globalAlpha = 0.5 + Math.sin(time * 14) * 0.5;
      blip(p.g.position.x, p.g.position.z, sz * 1.15, fill, rs);
      mctx.restore();
    }
    blip(p.g.position.x, p.g.position.z, sz, fill, rs);
  }
  for (const e of enemies) {
    const col = e.type === 'brute' ? '#ffb347' : e.type === 'gunner' ? '#a46bff' : '#ff2f7a';
    blip(e.g.position.x, e.g.position.z, e.type === 'brute' ? 4.5 : 3, col);
  }
  /* Other combatants. A deathmatch radar that shows every enemy at all times is a
     wallhack, and one that shows nothing (what this did before) is useless. Rule:
     teammates are always visible; hostiles appear only inside PROX_RADAR, or anywhere
     on the map for a moment after they fire. Gunfire gives away position — nothing else does. */
  if (mpInMatch()) {
    const PROX = 34, PING = 1.6;
    /* Team-mates are drawn as a wedge pointing the way they are actually FACING, in their
       team's colour, so the radar reads as your squad's positions and headings rather
       than anonymous dots. Hostiles stay a plain marker: which way an enemy is looking is
       information you have to earn by looking at them. */
    const myTeam = mpTeamOf(MP.id || 1);
    const teamCol = myTeam === 'A' ? '#7fe4ff' : '#ffb347';
    const drawCombatant = (x, z, friendly, firedAt, yaw) => {
      const near = Math.hypot(x - camera.position.x, z - camera.position.z) <= PROX;
      const pinged = firedAt !== undefined && (time - firedAt) < PING;
      if (!friendly && !near && !pinged) return;
      mctx.save();
      if (!friendly && pinged && !near) mctx.globalAlpha = 0.5 + Math.sin(time * 12) * 0.3;
      if (friendly && yaw !== undefined) teamBlip(x, z, yaw, teamCol);
      else blip(x, z, friendly ? 4 : 4.5, friendly ? teamCol : '#ff2f7a', 'tri');
      mctx.restore();
    };
    for (const id in MP.ghosts) {
      const gh = MP.ghosts[id];
      if (!gh.alive) continue;
      const friendly = mpTeamMode() && mpTeamOf(+id) === myTeam;
      drawCombatant(gh.mesh.position.x, gh.mesh.position.z, friendly, gh.lastFire, gh.yaw);
    }
    for (let i = 0; i < BOTS.length; i++) {
      const b = BOTS[i];
      if (!b.alive) continue;
      const friendly = mpTeamMode() && b.team === myTeam;
      drawCombatant(b.mesh.position.x, b.mesh.position.z, friendly, b.lastFire, b.yaw);
    }
  }
  if (BOSS.active) {
    const bp = BOSS.active.m.g.position;
    mctx.save(); mctx.globalAlpha = 0.55 + Math.sin(time * 6) * 0.3;
    blip(bp.x, bp.z, 8, '#ff2f7a', 'tri');
    mctx.restore();
  }
  mctx.restore();

  // player wedge, always dead centre pointing up
  mctx.fillStyle = '#ffffff';
  mctx.beginPath(); mctx.moveTo(R, R - 8); mctx.lineTo(R + 5.5, R + 6); mctx.lineTo(R, R + 3); mctx.lineTo(R - 5.5, R + 6);
  mctx.closePath(); mctx.fill();

  // bezel
  mctx.strokeStyle = 'rgba(127,228,255,.42)'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.arc(R, R, R - 3, 0, 6.283); mctx.stroke();
  for (let i = 0; i < 4; i++) {
    mctx.save(); mctx.translate(R, R); mctx.rotate(i * Math.PI / 2 + P.yaw);
    mctx.fillStyle = i === 0 ? '#7fe4ff' : 'rgba(127,228,255,.4)';
    mctx.fillRect(-1.5, -(R - 3), 3, 7);
    mctx.restore();
  }
}

/* ---------- HUD: clock, boss bar, mods ---------- */
const clockPhase = $('clockPhase'), clockTime = $('clockTime'), clockMap = $('clockMap');
function hudClock(phase, hhmm, theme) {
  if (hudClock.p !== phase) { hudClock.p = phase; clockPhase.textContent = phase; }
  if (hudClock.t !== hhmm) { hudClock.t = hhmm; clockTime.textContent = hhmm; }
  if (hudClock.m !== theme.name) { hudClock.m = theme.name; clockMap.textContent = theme.name; }
}
const bossFill = $('bossFill'), bossCores = $('bossCores');
function hudBoss(frac, cores) {
  bossFill.style.transform = 'scaleX(' + Math.max(0, frac) + ')';
  if (hudBoss.c !== cores) {
    hudBoss.c = cores;
    bossCores.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('i');
      if (i < cores) d.className = 'live';
      bossCores.appendChild(d);
    }
  }
}
const modRow = $('modRow');
function renderMods() {
  modRow.innerHTML = '';
  for (const k in P.mods) {
    if (!P.mods[k]) continue;
    const d = document.createElement('span');
    d.textContent = MODS[k].name;
    d.style.borderColor = '#' + new T.Color(MODS[k].col).getHexString() + '66';
    d.style.color = '#' + new T.Color(MODS[k].col).getHexString();
    modRow.appendChild(d);
  }
}

/* ---------- city power ----------
   Dimming the scene lights never darkened the city, because the city is not lit BY them:
   window blocks are `emissive` on their facade material and every neon strip/sign/glow is
   a MeshBasicMaterial. Both ignore scene lighting entirely, so a "district power failure"
   left every window in Rain District burning.

   This scales the emitters themselves. Base values are captured on first use so the level
   is absolute rather than compounding frame to frame. Enemy shells are deliberately NOT
   included — their glow running hot is the whole point of the event. */
let cityPower = 1, cityPowerApplied = -1;
const cityBase = new WeakMap();
function setCityPower(level) {
  if (Math.abs(level - cityPowerApplied) < 0.004) return;   // skip redundant material writes
  cityPowerApplied = level;
  // window lights
  for (let i = 0; i < facadeMats.length; i++) {
    const m = facadeMats[i];
    if (!cityBase.has(m)) cityBase.set(m, m.emissiveIntensity);
    m.emissiveIntensity = cityBase.get(m) * level;
  }
  // neon strips, signs and glow quads (cached in MATC by neonMat/glowMat)
  for (const k in MATC) {
    if (k.indexOf('neon') !== 0 && k.indexOf('glow') !== 0) continue;
    const m = MATC[k];
    if (!m || !m.color) continue;
    if (!cityBase.has(m)) cityBase.set(m, m.color.clone());
    m.color.copy(cityBase.get(m)).multiplyScalar(level);
  }
  // the sky glow is city light bouncing off cloud, so it goes too
  if (sky && sky.material && sky.material.uniforms && sky.material.uniforms.day) {
    sky.material.uniforms.dim = sky.material.uniforms.dim || { value: 1 };
  }
}
/* Eased so the grid dies over a beat instead of snapping — and comes back the same way. */
function updateCityPower(dt) {
  const want = EVENT.kind === 'blackout' ? 0.006 : 1;  // near-total: only hot shells read
  cityPower += (want - cityPower) * Math.min(1, dt * (want < cityPower ? 3.2 : 1.4));
  setCityPower(cityPower);
}

/* ---------- environmental events ----------
   The district used to have exactly one thing that could go wrong (a grid failure), so
   every third wave played out identically. This is a pool: one is drawn at random on an
   event wave, never the same one twice running.

   Each entry MUST change something the player can feel, and every knob below is read
   somewhere in the sim — EV.mul is consulted by enemy spawns, gravity, loot rolls and
   the radar. A purely cosmetic event would be worse than no event at all, and there is a
   test asserting each one actually moves a number.

   `risk` events make the wave harder and pay more; `boon` events are a gift. Mixing the
   two means an event banner is genuinely suspenseful rather than always bad news. */
const EV = {
  /* live multipliers, reset between events; read across the sim */
  mul: { enemySpeed: 1, gravity: 1, jump: 1, loot: 1, pay: 1, radar: 1, fog: 1 }
};
function evReset() {
  EV.mul.enemySpeed = 1; EV.mul.gravity = 1; EV.mul.jump = 1;
  EV.mul.loot = 1; EV.mul.pay = 1; EV.mul.radar = 1; EV.mul.fog = 1;
}
const EVENTS = {
  blackout: {
    name: 'GRID FAILURE', sub: 'DISTRICT POWER LOST', col: 0xff2f7a, kind: 'risk', dur: 24,
    hint: 'Their shells run hot — the glow is all you get.',
    apply() { document.body.classList.add('blackout'); EV.mul.radar = 0.75; },
    clear() { document.body.classList.remove('blackout'); }
  },
  surge: {
    name: 'POWER SURGE', sub: 'GRID OVERLOADED', col: 0xffb347, kind: 'risk', dur: 22,
    hint: 'Everything is faster. Everything pays more.',
    apply() { EV.mul.enemySpeed = 1.28; EV.mul.pay = 1.6; EV.mul.loot = 1.5; }
  },
  smog: {
    name: 'SMOG BANK', sub: 'VISIBILITY COLLAPSING', col: 0x8fa0c0, kind: 'risk', dur: 26,
    hint: 'They will be close before you see them. Watch the radar.',
    apply() { EV.mul.fog = 3.2; EV.mul.radar = 1.35; }   // radar compensates for the eyes
  },
  lowgrav: {
    name: 'GRAV FLUX', sub: 'PLATE STABILISERS OFFLINE', col: 0xa46bff, kind: 'boon', dur: 26,
    hint: 'Light on your feet. Use the height.',
    apply() { EV.mul.gravity = 0.55; EV.mul.jump = 1.55; }
  },
  cache: {
    name: 'SUPPLY CACHE', sub: 'PALLET INBOUND', col: 0x35ffc4, kind: 'boon', dur: 14,
    hint: 'Salvage dropped nearby.',
    apply() {
      EV.mul.loot = 2.2;
      // an actual airdrop, not just a better drop rate
      for (let i = 0; i < 3; i++) dropCrate(pick(GUN_ORDER.filter(k => k !== 'pulse')));
      dropModCrate();
    }
  },
  overclock: {
    name: 'ION WIND', sub: 'SHELLS DESTABILISING', col: 0x7fe4ff, kind: 'boon', dur: 20,
    hint: 'Their armour is brittle. Push.',
    apply() { EV.mul.pay = 1.25; P.buffs.overdrive = Math.max(P.buffs.overdrive, 12); }
  }
};
const EVENT_ORDER = Object.keys(EVENTS);
const EVENT = { kind: null, t: 0, dur: 0 };
let lastEventKind = null;

function startEvent(kind) {
  // draw one at random, never repeating the previous event
  if (!kind || !EVENTS[kind]) {
    const pool = EVENT_ORDER.filter(k => k !== lastEventKind);
    kind = pick(pool.length ? pool : EVENT_ORDER);
  }
  const e = EVENTS[kind];
  evReset();
  EVENT.kind = kind; EVENT.dur = e.dur; EVENT.t = e.dur;
  lastEventKind = kind;
  sfx.alarm();
  if (e.apply) e.apply();
  showEventBanner(e);
  toast(e.name + ' — ' + e.sub, e.col);
}
function updateEvent(dt) {
  if (!EVENT.kind) return;
  EVENT.t -= dt;
  const e = EVENTS[EVENT.kind];
  if (e && e.tick) e.tick(dt);
  const bar = $('evFill');
  if (bar) bar.style.transform = 'scaleX(' + clamp(EVENT.t / (EVENT.dur || 1), 0, 1) + ')';
  if (EVENT.t <= 0) {
    if (e && e.clear) e.clear();
    evReset();
    EVENT.kind = null;
    hideEventBanner();
    toast('CONDITIONS NORMAL', 0x35ffc4);
  }
}
function showEventBanner(e) {
  const box = $('eventBox');
  if (!box) return;
  box.style.setProperty('--ec', '#' + new T.Color(e.col).getHexString());
  $('evName').textContent = e.name;
  $('evHint').textContent = e.hint;
  $('evTag').textContent = e.kind === 'boon' ? 'OPPORTUNITY' : 'HAZARD';
  box.classList.add('on');
  box.classList.toggle('boon', e.kind === 'boon');
}
function hideEventBanner() {
  const box = $('eventBox');
  if (box) box.classList.remove('on');
}

let sunLevel = 0;
let lastDayPhase = '';
function updateDayNight(dt) {
  const theme = MAPS[currentMap];
  if (OPT.dayCycle && (theme.daySpeed || 0) > 0) {
    dayClock = (dayClock + dt / 110 * theme.daySpeed) % 1;
  } else if (!OPT.dayCycle) {
    dayClock = theme.dayStart;
  }
  sunLevel = theme.sky ? Math.max(0, Math.sin(dayClock * Math.PI * 2 - Math.PI / 2)) : 0;
  // during a grid failure the sky loses the city glow bouncing off the cloud deck
  sky.material.uniforms.day.value = sunLevel * (EVENT.kind === 'blackout' ? 0.15 : 1);
  // ambient floor raised: at 0.16 every unlit surface read as pure black
  hemi.intensity = (theme.sky ? 0.33 : 0.19) + sunLevel * 0.78;
  moon.intensity = (theme.sky ? 0.16 : 0.06) + sunLevel * 0.76;
  const dark = EVENT.kind === 'blackout' ? 0.10 : 1;
  for (const L of neonLights) {
    let neonMul = (2.0 + 2.4 * (1 - sunLevel)) * theme.neon * dark;
    if (!theme.sky && OPT.dayCycle) neonMul *= 0.82 + Math.sin(time * 2.8) * 0.12;
    L.intensity = neonMul;
  }
  /* Blackout darkness. The ambient floor was raised during the colour pass, so the old
     multipliers left a grid failure BRIGHTER than it used to be — these are tuned against
     the new base to land at roughly hemi 0.05 / moon 0.03, darker than the original.
     The grade uniform is driven here too so the shadow lift stands down (02-render.js). */
  if (dark < 1) { hemi.intensity *= 0.06; moon.intensity *= 0.07; }
  updateCityPower(dt);   // the city's own emitters — see setCityPower
  if (matFinal && matFinal.uniforms.blackout) {
    const want = EVENT.kind === 'blackout' ? 1 : 0;
    const u = matFinal.uniforms.blackout;
    u.value += (want - u.value) * Math.min(1, dt * 2.5);   // ease in and out, no hard cut
  }
  // smog thickens the fog; eases so the bank rolls in rather than snapping
  const fogWant = theme.fogD * EV.mul.fog;
  scene.fog.density += (fogWant - scene.fog.density) * Math.min(1, dt * 1.5);
  groundMat.uniforms.fogDensity.value = scene.fog.density;
  rainMat.uniforms.uOpacity.value = theme.rain ? (0.42 + 0.25 * (1 - sunLevel)) : 0;
  const mins = Math.floor(dayClock * 24 * 60);
  const hh = String(Math.floor(mins / 60) % 24).padStart(2, '0'), mm = String(mins % 60).padStart(2, '0');
  const phase = !theme.sky ? 'SUBLEVEL' : sunLevel > 0.62 ? 'DAY' : sunLevel > 0.22 ? 'DUSK' : 'NIGHT';
  hudClock(phase, hh + ':' + mm, theme);
  if (theme.sky && OPT.dayCycle && state === 'play' && phase !== lastDayPhase) {
    if (lastDayPhase) toast(phase + ' CYCLE', phase === 'DAY' ? 0xffb347 : phase === 'DUSK' ? 0xa46bff : 0x7fe4ff);
    lastDayPhase = phase;
  }
  if (!theme.sky) lastDayPhase = 'SUBLEVEL';
  document.body.classList.toggle('bright', sunLevel > 0.55);
}
function setMap(key) {
  if (!MAPS[key] || key === currentMap) return;
  currentMap = key;
  runSeed = (Date.now() ^ (Math.random() * 0xffffffff)) | 0 || 7;
  buildMapWorld();
  lastDayPhase = '';
  dayClock = MAPS[key].dayStart;
  updateDayNight(0);
  const sp = MAPS[key].spawn;
  camera.position.set(sp[0], floorAt(sp[0], sp[1]) + 1.75, sp[1]);
}

/* ---------- update ---------- */
const camDir = new T.Vector3();
function update(dt) {
  time += dt;
  sky.material.uniforms.time.value = time;
  updateDayNight(dt);
  groundMat.uniforms.time.value = time;

  rainMat.uniforms.uTime.value = time;
  rainMat.uniforms.uCam.value.copy(camera.position);

  padGroup.rotation.y += dt * 0.4;
  padRing.material.color.setHSL(0.44, 1, 0.55 + Math.sin(time * 3) * 0.15);
  if (extraction) padBeam.material.opacity = 0.045 + Math.sin(time * 2.4) * 0.02;

  if (state === 'menu') {                     // slow drift behind the title card
    P.yaw += dt * 0.05;
    camera.rotation.set(-0.05, P.yaw, 0);
    camera.position.y = floorAt(camera.position.x, camera.position.z) + 1.75;
  }
  // music and the contextual HUD run in every state, not just during a run
  musicIntensity(dt);
  musicWatchContext();
  hudDynamic(dt);
  if (state !== 'play') { updateParticles(dt); return; }

  /* --- timers --- */
  P.fireCool = Math.max(0, P.fireCool - dt);
  P.dashCool = ABIL.on('overclock') ? 0 : Math.max(0, P.dashCool - dt);
  P.dashT = Math.max(0, P.dashT - dt);
  P.iFrames = Math.max(0, P.iFrames - dt);
  P.comboT = Math.max(0, P.comboT - dt);
  if (P.comboT === 0) P.combo = 1;
  for (const b in P.buffs) {
    if (P.buffs[b] > 0) {
      P.buffs[b] = Math.max(0, P.buffs[b] - dt);
      if (P.buffs[b] === 0) toast(b.toUpperCase() + ' EXPIRED', 0x5c6b8c);
    }
  }
  hud.combo.textContent = P.combo > 1 ? 'x' + P.combo : '';
  hud.combo.style.opacity = P.combo > 1 ? 1 : 0;

  if (P.reloading > 0) {
    P.reloading -= dt; P.reloadPhase = 1 - P.reloading / P.reloadMax;
    hud.reload.style.opacity = 1;
    hud.reload.style.transform = 'rotate(' + P.reloadPhase * 360 + 'deg)';
    const rp = P.reloadPhase;
    const drop = Math.min(rp / 0.35, 1);
    const seat = clamp((rp - 0.35) / 0.35, 0, 1);
    const back = clamp((rp - 0.7) / 0.3, 0, 1);
    handsRig.position.y = -0.12 * Math.sin(Math.min(rp * 1.6, 1) * Math.PI);
    handsRig.position.x = -0.04 * drop + 0.04 * back;
    leftHand.position.set(
      LH_HOME.p.x - 0.06 * drop + 0.05 * back,
      LH_HOME.p.y - 0.18 * drop * (1 - seat * 0.55) + 0.02 * back,
      LH_HOME.p.z + 0.42 * drop * (1 - back) - 0.08 * seat * (1 - back));
    leftHand.rotation.set(LH_HOME.r.x + 0.80 * drop - 0.5 * back, LH_HOME.r.y, LH_HOME.r.z - 0.5 * drop);
    LH.fingers.forEach((f, i) => { f.j1.rotation.x = f.curl + 0.55 * seat - 0.35 * drop; });
    rightHand.rotation.x = RH_HOME.r.x - 0.28 * drop + 0.12 * back;
    rightHand.rotation.z = RH_HOME.r.z + 0.08 * drop;
    RH.fingers.forEach((f, i) => { f.j1.rotation.x = f.curl - 0.40 * drop + 0.15 * back; });
    magProp.visible = true;
    if (seat <= 0) {
      magProp.position.set(MAG_HOME.x + 0.05 * drop, MAG_HOME.y - 0.24 * drop, MAG_HOME.z + 0.08 * drop);
      magProp.rotation.set(0.55 * drop, 0.15 * drop, 0.45 * drop);
    } else if (back <= 0) {
      magProp.position.set(MAG_HOME.x, MAG_HOME.y - 0.20 * (1 - seat), MAG_HOME.z + 0.05 * (1 - seat));
      magProp.rotation.set(0.35 * (1 - seat), 0, 0.15 * (1 - seat));
    } else {
      magProp.position.set(
        lerp(MAG_HOME.x + 0.05, MAG_HOME.x, back),
        lerp(MAG_HOME.y - 0.20, MAG_HOME.y, back),
        lerp(MAG_HOME.z + 0.05, MAG_HOME.z, back));
      magProp.rotation.set(lerp(0.35, 0, back), 0, lerp(0.15, 0, back));
    }
    gunPivot.rotation.x = lerp(gunPivot.rotation.x, -0.72 + rp * 0.98, 1 - Math.pow(0.0005, dt));
    gunPivot.rotation.y = lerp(gunPivot.rotation.y, 0.38 - rp * 0.25, 1 - Math.pow(0.001, dt));
    gunPivot.rotation.z = lerp(gunPivot.rotation.z, 0.62 - rp * 0.75, 1 - Math.pow(0.001, dt));
    if (P.reloading <= 0) {
      P.ammo = P.mag; P.ammoIn[P.weapon] = P.ammo; P.reloading = 0; P.reloadPhase = 0;
      handsRig.position.set(0, 0, 0);
      poseHands();
      LH.fingers.forEach(f => { f.j1.rotation.x = f.curl; });
      RH.fingers.forEach(f => { f.j1.rotation.x = f.curl; });
      magProp.visible = false;
      magProp.position.copy(MAG_HOME);
      magProp.rotation.set(0, 0, 0);
      hud.reload.style.opacity = 0; toast('MAGAZINE SET', W().tint);
    }
  } else {
    const k = 1 - Math.pow(0.002, dt);
    handsRig.position.y = lerp(handsRig.position.y, 0, k);
    handsRig.position.x = lerp(handsRig.position.x, 0, k);
    leftHand.position.lerp(tmpV.copy(LH_HOME.p).add(tmpV2.set(0, W().foreY || 0, W().foreZ || 0)), k);
    leftHand.rotation.x = lerp(leftHand.rotation.x, LH_HOME.r.x, k);
    leftHand.rotation.z = lerp(leftHand.rotation.z, LH_HOME.r.z, k);
    rightHand.rotation.x = lerp(rightHand.rotation.x, RH_HOME.r.x, k);
    // trigger finger squeezes with the shot, then relaxes
    trigger.j1.rotation.x = lerp(trigger.j1.rotation.x, trigger.curl + (P.fireCool > 0 ? 0.42 : 0), 1 - Math.pow(0.0005, dt));
  }
  P.noDmg += dt;
  // Field Aid upgrade: regen kicks in sooner and ticks harder
  const rec = PROFILE.upgrades.recovery || 0;
  // floor the delay at 1.2s — instant regen would remove the cost of being shot
  if (P.noDmg > Math.max(1.2, 6 - rec * 0.4) && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + 11 * (1 + rec * 0.08) * dt);

  if (P.burstLeft > 0 && P.fireCool <= 0) { P.burstLeft--; shootOnce(); }
  else if (keys.fire && (W().auto || keys.fireEdge)) shoot();
  keys.fireEdge = false;
  P.meleeT = Math.max(0, P.meleeT - dt);
  P.nadeCool = Math.max(0, P.nadeCool - dt);
  /* Bandolier (kit_bandolier): magazines you are NOT holding trickle back, so swapping
     weapons stops meaning "swap to an empty gun". */
  if (owned('kit_bandolier') && state === 'play') {
    P.bandoT = (P.bandoT || 0) + dt;
    if (P.bandoT >= 1.5) {
      P.bandoT = 0;
      P.slots.forEach(k => {
        if (!k || k === P.weapon || GUNS[k].melee) return;
        const cap = magSize(k);
        if ((P.ammoIn[k] || 0) < cap) P.ammoIn[k] = Math.min(cap, (P.ammoIn[k] || 0) + Math.max(1, Math.round(cap * 0.08)));
      });
    }
  }

  /* --- look ---
     Recoil and bloom both recover, but only once the trigger has actually been off for
     BLOOM_HOLD. That gate is the whole trick: with a single fast recovery rate (what this
     used to have) the view snapped back between every round of an 85ms fire cycle, so a
     30-round spray climbed nowhere and every gun in the game shot like a laser. While the
     trigger is held recovery is slow, so the pattern accumulates and has to be pulled
     against; the moment you release, the weapon settles fast. */
  P.sprayT += dt;
  const settling = P.sprayT > BLOOM_HOLD;
  if (P.sprayT > RECOIL_RESET) P.sprayIdx = 0;          // burst over: pattern starts again
  P.recoil = lerp(P.recoil, 0, 1 - Math.pow(settling ? 0.001 : 0.55, dt));
  P.recoilY = lerp(P.recoilY, 0, 1 - Math.pow(settling ? 0.004 : 0.75, dt));
  if (settling) P.bloom = lerp(P.bloom, 0, 1 - Math.pow(BLOOM_DECAY, dt));
  shakeAmt = Math.max(0, shakeAmt - dt * 2.4);
  hurtFlash = Math.max(0, hurtFlash - dt * 1.6);

  /* --- movement ---
     A downed player waits for the respawn timer where they fell: walking around as a
     corpse let you reposition for free and kept broadcasting a body nobody could shoot. */
  if (P.respawning) { P.vel.set(0, 0, 0); P.dashT = 0; }
  /* --- stance ---
     Held on Ctrl or toggled on C. Sprinting overrides it (nobody sprints in a squat) and
     dashing cancels it outright, so the two never fight over the same frame. */
  const crouchKey = keys.ControlLeft || keys.ControlRight || P.crouchLock;
  const sprintKey = (keys.ShiftLeft || keys.ShiftRight) ? 1 : 0;
  const wantCrouch = crouchKey && !sprintKey && !P.respawning && P.dashT <= 0;
  if (sprintKey || P.dashT > 0) P.crouchLock = false;
  P.crouchF = lerp(P.crouchF, wantCrouch ? 1 : 0, 1 - Math.pow(0.0005, dt));
  if (P.crouchF < 0.002) P.crouchF = 0;
  const sprint = sprintKey && P.crouchF < 0.35 ? 1 : 0;
  const base = (sprint ? 13.0 : 8.4) * (1 + (CROUCH_MOVE - 1) * P.crouchF)
    * P.speedMul * (P.ads ? 0.62 : 1) * (W().move || 1) * (ABIL.on('overclock') ? 1.45 : 1);
  let ix = 0, iz = 0;
  if (!P.respawning) {
    if (keys.KeyW) iz -= 1; if (keys.KeyS) iz += 1;
    if (keys.KeyA) ix -= 1; if (keys.KeyD) ix += 1;
  }
  const len = Math.hypot(ix, iz);
  if (len > 0) { ix /= len; iz /= len; }
  // camera basis at this yaw: forward = (-sin, -cos), right = (cos, -sin)
  const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
  let wx = ix * cy + iz * sy;
  let wz = iz * cy - ix * sy;
  let spd = base;
  if (P.dashT > 0) {
    if (len === 0) { wx = -sy; wz = -cy; }
    spd = 46;
  }
  /* Ground and air are different regimes.

     Both used to share one snappy rate, which meant you could turn on a dime in mid-air
     and — worse — releasing the keys while airborne braked you to a dead stop, so a jump
     had no momentum and every leap felt like it hit an invisible wall. Now the ground
     keeps the crisp response, the air steers slowly, and letting go in the air preserves
     your velocity instead of cancelling it. */
  const airborne = !P.grounded && P.dashT <= 0;
  const accel = airborne ? AIR_ACCEL : GROUND_ACCEL;
  if (airborne && len === 0) {
    // no input in the air: coast. Gravity owns the arc, not the movement keys.
  } else {
    P.vel.x = lerp(P.vel.x, wx * spd, 1 - Math.pow(accel, dt));
    P.vel.z = lerp(P.vel.z, wz * spd, 1 - Math.pow(accel, dt));
  }
  slide(camera.position, P.vel.x * dt, P.vel.z * dt, 0.7, P.feetY);
  unstick(camera.position, 0.7, P.feetY);

  /* --- vertical: step up ledges, walk off edges, jump, fall --- */
  const theme = MAPS[currentMap];
  const fh = floorAt(camera.position.x, camera.position.z);
  // (COYOTE_TIME / JUMP_BUFFER / accel rates live in 01-core.js with the other tunables)
  P.jumpBuf = Math.max(0, P.jumpBuf - dt);
  if (P.grounded) {
    const dy = fh - P.feetY;
    if (dy > 0 && dy <= STEP) P.feetY = fh;          // vault a low ledge
    else if (dy > STEP) { P.feetY = fh; unstick(camera.position, 0.7, P.feetY); }  // never end up inside it
    else if (dy <= 0 && dy > -0.65) P.feetY = fh;    // small drop, stay planted
    else if (dy < -0.65) { P.grounded = false; P.vy = 0; }
    P.coyote = COYOTE_TIME;                          // recharge while our feet are down
  } else {
    P.coyote = Math.max(0, P.coyote - dt);
  }
  /* Coyote time: a jump entered just after walking off a ledge still counts. Players
     press jump a frame or two late constantly, and without this the game reads it as
     "you missed" — the single cheapest fix for movement feeling unresponsive.
     Holding the key still auto-hops on landing, which is the arena-shooter convention. */
  if ((P.grounded || P.coyote > 0) && (P.jumpBuf > 0 || keys.Space)) {
    P.vy = 9.4 * EV.mul.jump;
    P.grounded = false;
    P.coyote = 0; P.jumpBuf = 0;
    P.jumpHeld = true;
    sfx.jump();
  }
  if (!P.grounded) {
    /* Variable jump height: releasing the key early cuts the rise short, so a tap is a
       hop and a hold is a full leap. Costs one extra gravity term and gives the jump a
       range of expression instead of one fixed arc. */
    if (P.jumpHeld && !keys.Space && P.vy > 0) { P.vy *= 0.45; P.jumpHeld = false; }
    if (P.vy <= 0) P.jumpHeld = false;
    P.vy -= 27 * EV.mul.gravity * dt;
    P.feetY += P.vy * dt;
    if (P.feetY <= fh && P.vy <= 0) {
      const impact = P.vy;
      P.feetY = fh; P.vy = 0; P.grounded = true;
      if (impact < -18) {
        hurt(Math.min(45, (-impact - 18) * 3.4), null);
        shakeAmt = Math.min(shakeAmt + 0.5, 0.9);
      }
      if (impact < -8) spark(tmpV.set(camera.position.x, P.feetY + 0.1, camera.position.z), 0x9fc4ff, 8, tmpV2.set(0, 1, 0), 4, 0.3, 0.05);
    }
  }
  // the void below Neon Heights throws you back onto the spawn deck
  if (theme.floorY < -5 && P.feetY <= theme.floorY + 30) {
    const sp = theme.spawn;
    camera.position.x = sp[0]; camera.position.z = sp[1];
    P.feetY = floorAt(sp[0], sp[1]); P.vy = 0; P.grounded = true;
    P.vel.set(0, 0, 0);
    hurt(22, null);
    toast('RECOVERED — MIND THE GAP', 0xff2f7a);
  }

  const moving = Math.hypot(P.vel.x, P.vel.z);
  P.bob += dt * moving * 1.15;
  const bobY = Math.sin(P.bob) * 0.035 * Math.min(moving / 8, 1.3) * (P.grounded ? 1 : 0);
  const bobX = Math.cos(P.bob * 0.5) * 0.030 * Math.min(moving / 8, 1.3);
  // eye height follows the stance; the crouch lerp above is what makes it a movement
  // option rather than a camera toggle
  camera.position.y = P.feetY + EYE_STAND + (EYE_CROUCH - EYE_STAND) * P.crouchF + bobY;
  // magnification is a real FOV ratio: tan(half-fov)/mag
  const sc = SC();
  let fovTarget = CFG.fov + sprint * 7 + (P.dashT > 0 ? 16 : 0);
  if (P.ads) {
    const halfRad = CFG.fov * 0.5 * Math.PI / 180;
    fovTarget = 2 * Math.atan(Math.tan(halfRad) / sc.mag) * 180 / Math.PI;
  }
  camera.fov = lerp(camera.fov, fovTarget, 1 - Math.pow(sc.tube ? 0.0006 : 0.005, dt));
  camera.updateProjectionMatrix();
  /* --- dynamic crosshair ---
     The arms sit exactly on the edge of the cone the next round can land in, converted
     from radians to pixels through the live projection (half-screen / tan(half-fov)), so
     it stays honest at any FOV and while zoomed. A static crosshair over a cone that
     changes with your stance, your speed and your trigger discipline is the single most
     misleading thing a shooter can draw — this is the feedback that teaches the model. */
  const coneNow = aimCone(W());
  const tanHalf = Math.tan(camera.fov * 0.5 * Math.PI / 180);
  const gapPx = tanHalf > 0 ? clamp(Math.tan(coneNow) * innerHeight * 0.5 / tanHalf, 0, 110) : 0;
  if (Math.abs(gapPx - (hc.gap || 0)) > 0.4) {
    hc.gap = gapPx;
    hud.cross.style.setProperty('--gap', gapPx.toFixed(1) + 'px');
  }
  const crouched = P.crouchF > 0.5;
  if (hc.crouch !== crouched) { hc.crouch = crouched; $('stanceChip').classList.toggle('on', crouched); }
  // aim-in ramp: 0 when hip-fired, eases to 1 as the weapon settles into ADS —
  // gates the scope-tube overlay so it fades in with the raise, not on a hard cut.
  P.aim = lerp(P.aim, P.ads ? 1 : 0, 1 - Math.pow(0.001, dt));
  // tube optics: viewmodel goes away and the overlay takes over
  const inTube = P.ads && sc.tube && P.aim > 0.55;
  if (hc.tube !== inTube || hc.tubeScope !== P.scope) {
    hc.tube = inTube;
    hc.tubeScope = P.scope;
    /* Your eye is at the ocular lens, so the weapon and hands are behind the sight
       picture, not in it — both go away for any tube optic. The blurred surround plus
       the housing ring is what sells "looking through glass"; a floating viewmodel
       alongside it just reads as clutter. */
    gun.visible = !inTube;
    handsRig.visible = !inTube;
    document.body.classList.toggle('tube', inTube);
    if (inTube) paintReticle();
  }
  // held breath drifts at high magnification — steadies while stationary
  // Handling upgrade steadies the glass
  const hand = PROFILE.upgrades.handling || 0;
  const swayAmt = P.ads ? sc.sway * (1 - 0.55 * (Math.hypot(P.vel.x, P.vel.z) < 0.5 ? 1 : 0)) * Math.max(0.15, 1 - hand * 0.07) : 0;   // never inverts
  P.scopeSway = swayAmt;
  const sway = swayAmt * 0.0016;
  const sh = OPT.shake ? shakeAmt : 0;
  camera.rotation.y = P.yaw + P.recoilY + Math.sin(time * 31) * sh * 0.010 + Math.sin(time * 0.9) * sway;
  camera.rotation.x = P.pitch + P.recoil + Math.cos(time * 27) * sh * 0.010 + Math.cos(time * 1.3) * sway * 0.7;
  camera.rotation.z = bobX * 0.35 + Math.sin(time * 19) * sh * 0.012;

  /* --- viewmodel --- */
  const adsPos = W().adsPos || [GUN_HOME.x,GUN_HOME.y,GUN_HOME.z];
  const targetGX = P.ads ? adsPos[0] : GUN_HOME.x - bobX * 0.5;
  const targetGY = P.ads ? adsPos[1] : GUN_HOME.y + bobY * 0.6 - (P.reloading > 0 ? 0.14 : 0);
  const targetGZ = P.ads ? adsPos[2] : GUN_HOME.z;
  gun.position.x = lerp(gun.position.x, targetGX, 1 - Math.pow(0.001, dt));
  gun.position.y = lerp(gun.position.y, targetGY, 1 - Math.pow(0.001, dt));
  gun.position.z = lerp(gun.position.z, targetGZ, 1 - Math.pow(0.0001, dt));
  if (P.meleeT > 0 && W().melee) {
    /* Melee swing, three phases over MELEE_DUR (matches P.meleeT set in meleeSwing()):
       0.00-0.25 wind up and back, 0.25-0.55 fast diagonal arc across the view,
       0.55-1.00 recover to rest. Driving it off the same timer the hit test uses keeps
       the visual and the damage window in sync. */
    const k = 1 - P.meleeT / MELEE_DUR;              // 0 at the start of the swing, 1 at the end
    let sw, rise, twist;
    if (k < 0.25) {                                   // wind-up
      const t = k / 0.25;
      sw = -0.55 * t; rise = 0.30 * t; twist = -0.40 * t;
    } else if (k < 0.55) {                            // arc
      const t = (k - 0.25) / 0.30;
      const e = t * t * (3 - 2 * t);                  // smoothstep for a snappy sweep
      sw = lerp(-0.55, 1.65, e); rise = lerp(0.30, -0.34, e); twist = lerp(-0.40, 0.95, e);
    } else {                                          // recover
      const t = (k - 0.55) / 0.45;
      const e = 1 - Math.pow(1 - t, 3);
      sw = lerp(1.65, 0, e); rise = lerp(-0.34, 0, e); twist = lerp(0.95, 0, e);
    }
    gunPivot.rotation.y = -sw;
    gunPivot.rotation.x = rise;
    gunPivot.rotation.z = twist;
    gun.position.x = GUN_HOME.x - sw * 0.22;
    gun.position.y = GUN_HOME.y + rise * 0.18;
    gun.position.z = GUN_HOME.z + Math.sin(k * Math.PI) * 0.16;
  } else if (P.reloading <= 0) {
    gunPivot.rotation.x = lerp(gunPivot.rotation.x, -P.recoil * 2.4, 1 - Math.pow(0.002, dt));
    gunPivot.rotation.y = lerp(gunPivot.rotation.y, -P.recoilY * 3, 1 - Math.pow(0.01, dt));
    gunPivot.rotation.z = lerp(gunPivot.rotation.z, bobX * 0.9, 1 - Math.pow(0.01, dt));
  }
  if (P.weapon === 'rail' && gunModels.rail.visible) {
    for (let i = 0; i < railCoilGlows.length; i++)
      railCoilGlows[i].scale.setScalar(0.82 + Math.sin(time * 5.5 + i * 1.35) * 0.18);
  }
  muzzleFlash.material.opacity = Math.max(0, muzzleFlash.material.opacity - dt * 18);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 60);
  camera.getWorldDirection(camDir);
  muzzleLight.position.copy(camera.position).addScaledVector(camDir, 1.4);
  gl2.color.copy(C(P.hp < 30 ? 0xff2f7a : (P.buffs.overdrive > 0 ? 0xffb347 : W().tint)));
  gl2.intensity = 3.2 + (P.weapon === 'rail' ? 0.6 : 0);
  gl3.color.copy(C(W().tint));

  /* --- waves --- */
  if (mpInMatch()) { /* deathmatch: no PvE waves */ }
  else if (spawnQueue.length) {
    spawnCool -= dt;
    if (spawnCool <= 0 && enemies.length < Math.min(5 + wave * 2, 13)) {
      spawnEnemy(spawnQueue.pop(), findSpawn());
      spawnCool = Math.max(0.4, 1.5 - wave * 0.08) * diffMul().spawnInt;
    }
  } else if (enemies.length === 0 && !BOSS.active) {
    waveTimer -= dt;
    if (waveTimer <= 0) {
      if (wave >= EXTRACT_WAVE && !extraction) {
        extraction = true;
        padGroup.visible = true;
        sfx.ping();
        toast('EXTRACTION OPEN — HEAD NORTH', 0x35ffc4);
        toast('OR HOLD TO WAVE ' + DEEP_WAVE + ' FOR +' + DEEP_BONUS.toLocaleString() + ' CR', 0xffb347);
      }
      waveTimer = 7;
      startWave();
    }
  }

  updateEvent(dt);
  updateAbility(dt);
  /* PvE furniture is meaningless in a deathmatch — wave counters, the extraction
     objective, daily contracts and the drone legend all describe a mode you are not
     playing. One body class drives the whole set (see .pvpHud in styles.css). */
  const inPvp = mpInMatch();
  if (hc.pvpHud !== inPvp) { hc.pvpHud = inPvp; document.body.classList.toggle('pvpHud', !!inPvp); }
  mpUpdateGhosts(dt);
  updateBots(dt);
  updatePvpDrops(dt);
  // hold Q past the threshold opens the weapon wheel (tap still quick-swaps)
  if (qWheelArmed && !WHEEL.open && keys.KeyQ && time - qHeldAt >= WHEEL_HOLD) openWheel();
  if (WHEEL.open && (state !== 'play' || !keys.KeyQ)) closeWheel(true);
  mpBroadcastState(dt);
  mpTickMatch(dt);
  if (P.respawning) {
    MP.respawnT -= dt;
    const el = $('respawnCount');
    if (el) el.textContent = Math.max(0, MP.respawnT).toFixed(1);
    if (MP.respawnT <= 0) mpRespawn();
  }
  RADAR_RANGE = ABIL.on('scan') ? 150 : 78;
  contractCool -= dt;
  if (contractCool <= 0) {
    contractCool = 0.25;
    if (RUNSTAT.score !== P.score) { RUNSTAT.score = P.score; checkContracts(); contractDirty = true; }
    if (contractDirty) { contractDirty = false; renderContractHUD(); }
  }
  updateBoss(dt);
  updateWaypoint();

  /* --- enemies ---
     Steering is by bearing only while an enemy can SEE you. The moment cover breaks the
     line it switches to the navigation field (03b-nav.js), which routes it around the
     geometry instead of grinding along the wall between you — so it comes through the
     doorway or round the end of the container, from whichever side is actually shorter. */
  const edt = dt * (P.buffs.focus > 0 ? 0.35 : 1);
  /* One sweep serves every hunter, but it still costs ~3 ms on the biggest map, so it
     only runs when something is actually chasing — never in a menu or an empty lobby. */
  if (typeof navTick === 'function' && (enemies.length || (typeof BOTS !== 'undefined' && BOTS.length))) {
    navTick(dt, camera.position.x, camera.position.z);
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const g = e.g;
    const toP = tmpV.copy(camera.position).setY(g.position.y).sub(g.position);
    const dist = toP.length();
    toP.normalize();

    // keep drones off each other so they can't stack into one blob
    let px = 0, pz = 0;
    for (let j = 0; j < enemies.length; j++) {
      if (j === i) continue;
      const o = enemies[j].g.position;
      const dx = g.position.x - o.x, dz = g.position.z - o.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 9 && d2 > 0.0001) { const inv = 1 / Math.sqrt(d2); px += dx * inv; pz += dz * inv; }
    }
    /* Eye line from the drone's core to your chest. Everything below keys off it:
       whether to charge the bearing or path around, whether to wind up a lunge, and
       whether a gunner may fire — it used to shoot you through solid walls. */
    e.losT = (e.losT || 0) - dt;
    if (e.losT <= 0) {
      e.losT = 0.12;                       // 8 Hz is plenty, and keeps the raycasts cheap
      e.los = typeof navLOS !== 'function' || navLOS(
        g.position.x, g.position.y, g.position.z,
        camera.position.x, camera.position.y - 0.3, camera.position.z);
      if (e.los) { e.lkx = camera.position.x; e.lkz = camera.position.z; }
    }
    let nav = null;
    if (!e.los && typeof navDir === 'function') nav = navDir(g.position.x, g.position.z);
    const sx = -toP.z, sz = toP.x;
    const sw = Math.sin(time * 1.3 + e.phase) * 0.55;

    if (e.lunge > 0) {
      // committed dive — fast, but short and readable
      e.lunge -= edt;
      slideEntity(g.position, e.lungeDir.x * e.lungeSpeed * edt, e.lungeDir.z * e.lungeSpeed * edt, e.hitR * 0.85, g.position.y - 0.5);
      if (!e.struck && dist < e.range) {
        hurt(e.dmg, g.position); e.struck = true;
        spark(g.position, e.color, 12, tmpV.set(0, 0, 0), 7, 0.3, 0.06);
      }
      if (e.lunge <= 0) e.cool = rand(1.5, 2.4);
    } else if (e.windup > 0) {
      // wind-up: it stops and flares so you can dash or shoot it out
      e.windup -= edt;
      slideEntity(g.position, (-toP.x * 2.4 + px * 3.0) * edt, (-toP.z * 2.4 + pz * 3.0) * edt, e.hitR * 0.85, g.position.y - 0.5);
      if (e.windup <= 0) {
        e.lunge = 0.34; e.struck = false;
        e.lungeDir.copy(toP);
      }
    } else {
      let mv = ABIL.on('phase') ? -e.speed * 0.35 : e.speed;
      let hx = toP.x, hz = toP.z;
      if (nav) {
        /* No line of sight: follow the field at full pace and skip the standoff logic.
           Standoff is a FIRING range, and holding it against a straight-line distance
           that runs through a wall is what used to park them on the far side of cover. */
        hx = nav.x; hz = nav.z;
      } else {
        if (dist < e.standoff) mv = -e.speed * 0.5;        // back off instead of merging
        else if (dist < e.standoff * 1.5) mv = e.speed * 0.2;
        if (e.type === 'gunner' && dist < 24 && dist > e.standoff) mv = e.speed * 0.15;
      }
      const swm = nav ? 0.15 : 1;                          // less weaving while pathing
      slideEntity(g.position,
        (hx * mv + sx * sw * e.speed * swm + px * 3.2) * edt,
        (hz * mv + sz * sw * e.speed * swm + pz * 3.2) * edt, e.hitR * 0.85, g.position.y - 0.5);
      if (e.tellMax > 0 && e.los && dist < e.standoff * 2.1 && e.cool <= 0 && !ABIL.on('phase')) {
        e.windup = e.tellMax * P.charAggro; sfx.windup();
      }
    }
    g.position.y = Math.max(floorAt(g.position.x, g.position.z), P.feetY) + e.y + Math.sin(time * 2.2 + e.phase) * 0.28;
    const tell = e.windup > 0 ? 1 - e.windup / e.tellMax : 0;

    g.lookAt(camera.position.x, g.position.y, camera.position.z);
    for (let s = 0; s < e.spin.length; s++) {
      const sp = e.spin[s];
      sp.m.rotation[sp.ax] += dt * sp.sp;
    }
    // each chassis idles differently: the dart banks, the platform sways, the frame heaves
    if (e.type === 'seeker') {
      e.body.rotation.z = Math.sin(time * 3.4 + e.phase) * 0.34 + (e.lunge > 0 ? 0.5 : 0);
      e.body.rotation.x = -0.12 + (e.windup > 0 ? -0.35 * tell : 0);
      e.body.position.z = e.lunge > 0 ? -0.25 : 0;
    } else if (e.type === 'gunner') {
      e.body.rotation.z = Math.sin(time * 1.1 + e.phase) * 0.10;
      e.body.rotation.x = Math.cos(time * 0.9 + e.phase) * 0.08;
      e.body.position.y = Math.sin(time * 1.6 + e.phase) * 0.06;
    } else {
      const heave = Math.sin(time * 2.6 + e.phase);
      e.body.position.y = heave * 0.09;
      e.body.rotation.x = 0.10 + heave * 0.05 - tell * 0.30;
      e.body.rotation.z = Math.sin(time * 1.3 + e.phase) * 0.06;
    }
    // billboard the halo against the parent's own rotation
    e.halo.quaternion.copy(camera.quaternion).premultiply(tmpQ.copy(g.quaternion).invert());
    e.halo.scale.setScalar(1 + Math.sin(time * 4 + e.phase) * 0.08 + tell * 1.1);
    e.blob.position.set(g.position.x, floorAt(g.position.x, g.position.z) + 0.04, g.position.z);
    e.blob.material.opacity = clamp(0.75 - g.position.y * 0.08, 0.1, 0.75);

    e.flash = Math.max(0, e.flash - dt * 6);
    const em = (EVENT.kind === 'blackout' ? 2.2 : 0.35) + e.flash * 3.5 + tell * 4.0 + (ABIL.on('scan') ? 3.2 : 0);
    e.shellMat.emissiveIntensity = em;
    e.plateMat.emissive = e.colL;
    e.plateMat.emissiveIntensity = em * 0.35;
    e.glowMat.color.copy(e.flash > 0.4 || tell > 0.5 ? WHITE : e.colL);
    const hpf = e.hp / e.maxHp;
    e.core.scale.setScalar(0.7 + hpf * 0.5 + e.flash * 0.35 + tell * 0.8);

    e.cool -= edt;
    if (e.type === 'gunner' && dist < 46 && e.los && e.cool <= 0 && !ABIL.on('phase')) {
      enemyShoot(e); e.cool = rand(2.1, 3.2) * P.charAggro;
    }
  }

  /* --- enemy projectiles --- */
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i];
    s.life -= dt;
    shotPrev.copy(s.m.position);
    if (s.grav) s.v.y -= s.grav * edt;
    s.m.position.addScaledVector(s.v, edt);
    s.halo.quaternion.copy(camera.quaternion);
    s.halo.scale.setScalar(1 + Math.sin(time * 18) * 0.15);
    // swept test: closest approach of this frame's travel segment to the player capsule
    if (s.friendly) {                                  // player ordnance
      let hitSomething = hitsWall(s.m.position.x, s.m.position.z, 0.3) || s.m.position.y < floorAt(s.m.position.x, s.m.position.z) + 0.2;
      for (let k = 0; k < enemies.length && !hitSomething; k++) {
        if (enemies[k].g.position.distanceTo(s.m.position) < enemies[k].hitR + 0.5) hitSomething = true;
      }
      if (hitSomething || s.life <= 0) {
        spark(s.m.position, 0xff9a3c, 30, tmpV.set(0, 2, 0), 11, 0.6, 0.09);
        boom(s.m.position, s.blastR, s.blastDmg);
        sfx.blast();
        despawnShot(s); shots.splice(i, 1);
      }
      continue;
    }
    /* The player's own hitbox against incoming fire is a sphere on the eye, so it rides
       down with the stance for free — but a crouched figure is also NARROWER than a
       standing one, and the sphere has to shrink to say so. Without this, crouching
       lowers your head and nothing else, which is the half-measure worth avoiding. */
    const d = segPointDist(shotPrev, s.m.position, camera.position);
    if (d < (s.hitR || 1.15) * (1 + (CROUCH_HIT_R - 1) * P.crouchF)) {
      hurt(s.dmg, s.m.position);
      spark(s.m.position, 0xa46bff, 14, tmpV.set(0, 0, 0), 7, 0.3, 0.06);
      s.life = 0;
    } else if (hitsWall(s.m.position.x, s.m.position.z, 0.2) || s.m.position.y < 0.2) {
      spark(s.m.position, 0xa46bff, 8, tmpV.set(0, 0, 0), 5, 0.25, 0.05);
      s.life = 0;
    }
    if (s.life <= 0) { despawnShot(s); shots.splice(i, 1); }
  }

  /* --- pickups --- */
  let proxText = '', proxBest = 8;
  let takeTarget = null, takeBestD = 1e9;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt; p.life -= dt;
    if (p.pulseT > 0) p.pulseT -= dt;
    p.g.rotation.y += dt * 1.8;
    p.g.position.y = floorAt(p.g.position.x, p.g.position.z) + 1.0 + Math.sin(p.t * 2.6) * 0.18;
    p.halo.quaternion.copy(camera.quaternion);
    if (p.life < 4) p.g.visible = Math.sin(p.life * 18) > -0.3;
    if (p.g.userData.ring) p.g.userData.ring.rotation.z += dt * 2.4;
    if (p.g.userData.icon) p.g.userData.icon.rotation.y += dt * 2.8;
    if (p.g.userData.beam) p.g.userData.beam.material.opacity = 0.12 + Math.sin(p.t * 4) * 0.06;
    const pd = p.g.position.distanceTo(camera.position);
    if (pd < proxBest && (p.kind === 'modcrate' || p.kind === 'scatter' || p.kind === 'rail' || p.kind === 'salvage' || p.kind === 'prototype')) {
      proxBest = pd;
      if (p.kind === 'modcrate') proxText = 'MOD CRATE · ' + (p.modId ? MODS[p.modId].name.toUpperCase() : 'ATTACHMENT');
      else if (p.kind === 'scatter') proxText = 'WEAPON CRATE · SCATTER-12';
      else if (p.kind === 'rail') proxText = 'WEAPON CRATE · RAIL LANCE';
      else if (p.kind === 'prototype') proxText = 'PROTOTYPE MOD';
      else proxText = 'MOD SALVAGE';
    }
    /* Weapon crates are opt-in rather than walk-over: swapping your gun by accident
       mid-fight is far worse than having to ask for it. In PvP that is always true;
       in PvE it applies only once the slot you'd overwrite already holds something. */
    if (pd < 2.6 && PU[p.kind] && PU[p.kind].cat === 'weapon' && wantsPrompt(p.kind)) {
      if (pd < takeBestD) { takeBestD = pd; takeTarget = p; }
      continue;
    }
    if (pd < 2.1) collect(p);
    if (p.life <= 0) { despawnPickup(p); pickups.splice(i, 1); }
  }
  // offer the pickup, and take it only when asked
  pickupOffer = takeTarget;
  const takeEl = $('takePrompt');
  if (takeEl) {
    if (takeTarget) {
      const g = GUNS[takeTarget.kind];
      takeEl.innerHTML = '<b>' + TAKE_KEY + '</b> Take ' + g.name
        + '<em>' + g.cls + ' · ' + g.sub + '</em>';
      takeEl.style.display = 'flex';
    } else takeEl.style.display = 'none';
  }
  const proxEl = $('proxLabel');
  if (proxEl) { proxEl.textContent = proxText; proxEl.style.opacity = proxText ? '0.92' : '0'; }

  /* --- extraction --- */
  if (extraction) {
    const short = wave <= DEEP_WAVE;            // the deep-run bonus is still on the table
    const d = Math.hypot(camera.position.x - padPos.x, camera.position.z - padPos.z);
    if (d < 7) {
      P.extracting += dt;
      // Five seconds on the pad is the window to change your mind, so spend it telling
      // them what walking off now is worth.
      setObjective('EXTRACTING… ' + (5 - P.extracting).toFixed(1) + 's'
        + (short ? '  ·  leaving now forfeits +' + DEEP_BONUS.toLocaleString() + ' cr' : ''));
      if (Math.floor(P.extracting * 2) !== Math.floor((P.extracting - dt) * 2)) sfx.ping();
      if (P.extracting >= 5) win();
    } else {
      if (P.extracting > 0) P.extracting = Math.max(0, P.extracting - dt * 2);
      /* Standing objective while the choice is live. This used to read "Reach the
         extraction pad", which pushed you toward leaving and never mentioned the
         alternative again. */
      if (short) {
        const togo = DEEP_WAVE - wave + 1;
        setObjective(togo > 1
          ? 'Extract at the pad  ·  or survive ' + togo + ' more waves for +' + DEEP_BONUS.toLocaleString() + ' cr'
          : 'Clear the Sovereign, then extract for +' + DEEP_BONUS.toLocaleString() + ' cr', true);
      } else {
        setObjective('Deep run banked  ·  reach the extraction pad', true);
      }
    }
  }

  /* --- fx cleanup --- */
  for (const t of tracers) {
    if (t.t > 0) { t.t -= dt; t.m.material.opacity = Math.max(0, t.t / (t.dur || 0.075)); if (t.t <= 0) t.m.visible = false; }
  }
  for (const d of decals) {
    if (d.t > 0) { d.t -= dt; d.m.material.opacity = Math.max(0, d.t / 0.25); if (d.t <= 0) d.m.visible = false; }
  }
  updateParticles(dt);
  updateBurstFx(dt);
  syncHUD();
  if (OPT.radar) drawMinimap(dt);
}
