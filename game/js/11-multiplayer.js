/* neon-runner · 11-multiplayer.js
   LAN presence, PvP deathmatch/duel/TDM, scoreboard
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ============================================================
   MULTIPLAYER — LAN presence layer
   Connects to the same server this page was loaded from (server.js),
   so "host" simply means "the machine everyone points their browser at".
   This is a presence/relay layer: see other connected players moving
   around and talk to the same roster, but enemies/loot/waves are still
   simulated locally per client until the authoritative refactor lands
   (tracked in ROADMAP.md Phase 6). The UI is honest about this.
   ============================================================ */
const MP = {
  ws: null, id: null, connected: false, roster: [], ghosts: {},
  lastSend: 0, reconnectT: null, everConnected: false, heartT: null, retries: 0,
  /* PvP: deathmatch needs no synced enemies, so it works on the existing
     relay without the authoritative-simulation refactor co-op requires.
     Hit detection is shooter-authoritative — the client who fires decides
     it connected and tells the target. Fine on a trusted LAN. */
  mode: 'duel',            // 'duel' | 'dm' | 'tdm' — every mode is PvP; co-op was removed
  match: null,             // { active, limit, scores:{}, deaths:{}, assists:{}, duration, clock }
  respawnT: 0, deaths: 0,
  recentDamage: {},        // attackerId -> time last hit us, for assist credit (victim is authority)
  matchClock: 0            // seconds left in the current match, ticked locally; 0/absent = untimed
};
/* An assist goes to anyone who damaged the victim in the last few seconds but did not
   land the kill. The victim receives every hit (remote 'hit' events + local bot damage)
   so it is the one client that can see the whole list — it stamps the assists into the
   kill event it broadcasts, and every client credits the same names. */
const ASSIST_WINDOW = 6;
/* Netcode timing. Standard snapshot interpolation (Gambetta, "Fast-Paced Multiplayer"):
   remote players are drawn slightly IN THE PAST, between the two snapshots that bracket
   the render time, instead of being chased toward the newest one. Rendering behind the
   newest packet is what guarantees there is always a snapshot on each side to interpolate
   between, which is what actually removes rubberbanding — a late packet just extends the
   current slide instead of stalling the model.
   The delay must exceed one tick, or the buffer runs dry between packets. */
const MP_TICK = 0.05;            // state broadcast interval (20 Hz)
const MP_RENDER_DELAY = 0.12;    // ~2.4 ticks of slack for wifi jitter
const MP_TELEPORT = 8;           // a jump beyond this is a respawn, so cut instead of sliding
const MP_BUF_MAX = 24;           // hard cap on buffered snapshots (~1.2s at 20 Hz)
const MP_MODES = {
  /* Player counts below are TOTAL combatants — humans plus bots — so a solo player
     with 3 bots satisfies Deathmatch's 4. Co-op was removed: it was never more than
     position sync (each client fought its own drones), so it shipped as a promise the
     game could not keep. Survival waves remain the single-player mode, from the main menu. */
  duel: { name: '1v1 Duel',       sub: 'Head to head. Exactly two players.',  min: 2, max: 2, tag: '1v1' },
  dm:   { name: 'Deathmatch',     sub: 'Free-for-all. Everyone for themselves.', min: 3, max: 8, tag: 'FFA' },
  tdm:  { name: 'Team deathmatch', sub: 'Two teams, split by join order. No friendly fire.', min: 2, max: 8, tag: 'TDM' }
};
const mpPvP = () => MP.mode === 'dm' || MP.mode === 'tdm' || MP.mode === 'duel';
/* MP.mode is just the lobby's current pick and defaults to 'duel', so mpPvP() is true even
   for someone playing a solo PvE run. Anything that makes a client PARTICIPATE in PvP —
   drawing other players, shooting them, broadcasting position — must test this instead, or
   a solo run on a shared address has strangers walking through it and takes fire from them. */
const mpInMatch = () => !!(mpPvP() && MP.match && MP.match.active);
const mpTeamOf = id => (id % 2 === 0 ? 'B' : 'A');
/* Only TDM has teams — duel and FFA treat everyone as hostile. */
const mpTeamMode = () => MP.mode === 'tdm';
const mpSupported = typeof WebSocket !== 'undefined';

/* A per-tab token so the server can hand our player id (and therefore our score and
   TDM team) back after a reconnect instead of minting a new one. sessionStorage, not
   localStorage: two tabs on the same machine must be two different players. */
function mpToken() {
  let t = null;
  try { t = sessionStorage.getItem('nrTok'); } catch (err) {}
  if (!t) {
    t = (Math.random().toString(36).slice(2) + Date.now().toString(36));
    try { sessionStorage.setItem('nrTok', t); } catch (err) {}
  }
  return t;
}
function mpWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return proto + '//' + location.host + '/?tok=' + encodeURIComponent(mpToken());
}
function mpIsHostMachine() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname === '';
}
/* The server hangs up on a connection it has heard nothing from. While you sit on
   the lobby screen the game loop's state broadcast is not running (update() returns
   early unless state === 'play'), so without this the server would reap us and we
   would reconnect on a loop. Runs on its own timer, independent of the render loop. */
function mpStartHeartbeat() {
  clearInterval(MP.heartT);
  MP.heartT = setInterval(() => {
    if (MP.ws && MP.ws.readyState === 1) mpSend({ t: 'ping' });
  }, 6000);
}
function mpStopHeartbeat() { clearInterval(MP.heartT); MP.heartT = null; }

function mpConnect() {
  // readyState 0 is CONNECTING — treating that as "not connected" let a second
  // socket be opened over the first, and the orphan's onclose queued yet another retry.
  if (!mpSupported || MP.connected) return;
  if (MP.ws && (MP.ws.readyState === 0 || MP.ws.readyState === 1)) return;
  if (!location.host) { mpSetStatus('This page was opened as a local file, not served — multiplayer needs `node server.js`.', 'off'); return; }
  clearTimeout(MP.reconnectT);
  if (MP.ws) { MP.ws.onclose = MP.ws.onmessage = MP.ws.onopen = MP.ws.onerror = null; try { MP.ws.close(); } catch (err) {} MP.ws = null; }
  mpSetStatus('Connecting…', 'trying');
  try {
    MP.ws = new WebSocket(mpWsUrl());
  } catch (err) { mpSetStatus('Could not open a connection.', 'off'); return; }
  const sock = MP.ws;
  MP.ws.onopen = () => {
    if (MP.ws !== sock) return;                  // a superseded socket finally opened
    MP.connected = true; MP.everConnected = true; MP.retries = 0;
    mpSend({ t: 'hello', name: playerName, char: character });
    mpSetStatus('Connected', 'on');
    mpStartHeartbeat();
  };
  MP.ws.onmessage = e => {
    let data; try { data = JSON.parse(e.data); } catch (err) { return; }
    if (data.t === 'welcome') {
      // Reconnecting earns a fresh id, so anything we were tracking under the old
      // ids is stale. Drop the meshes too, or the map fills with frozen bodies.
      MP.id = data.id; MP.roster = data.roster || [];
      Object.keys(MP.ghosts).forEach(mpRemoveGhost);
      renderMpRoster();
      renderMpMaps();             // connection state decides whether the picker is ours
      renderBotControls();
    }
    else if (data.t === 'join') {
      if (!MP.roster.find(p => p.id === data.id)) MP.roster.push({ id: data.id, name: data.name });
      renderMpRoster();
      mpAnnounceArena();          // late joiner: show them the arena we are going to use
    }
    // mpRemoveGhost, not `delete` — the bare delete dropped our handle to the mesh
    // while leaving it parented to the scene, so every departure left a body behind.
    else if (data.t === 'leave') {
      MP.roster = MP.roster.filter(p => p.id !== data.id);
      mpRemoveGhost(data.id);
      renderMpRoster();
      mpCheckMatchViable(data.id);
    }
    else if (data.t === 'state') mpApplyGhost(data.id, data.s);
    else if (data.t === 'event') mpOnEvent(data.id, data.e);
    else if (data.t === 'match') mpOnMatch(data.m);
  };
  MP.ws.onclose = () => {
    if (MP.ws !== sock) return;                  // stale socket, not our current one
    MP.ws = null;
    MP.connected = false;
    mpStopHeartbeat();
    mpSetStatus(MP.everConnected ? 'Disconnected — retrying…' : 'Could not connect', MP.everConnected ? 'trying' : 'off');
    clearTimeout(MP.reconnectT);
    // Back off rather than hammering a server that is down: 2s, 3s, 4.5s … capped at 15s.
    const wait = Math.min(15000, 2000 * Math.pow(1.5, MP.retries++));
    MP.reconnectT = setTimeout(mpConnect, wait);
  };
  MP.ws.onerror = () => {};
}
function mpDisconnect() {
  clearTimeout(MP.reconnectT);
  mpStopHeartbeat();
  MP.everConnected = false; MP.retries = 0;
  if (MP.ws) { MP.ws.onclose = MP.ws.onmessage = MP.ws.onopen = MP.ws.onerror = null; try { MP.ws.close(); } catch (err) {} MP.ws = null; }
  MP.connected = false; MP.roster = [];
  Object.keys(MP.ghosts).forEach(mpRemoveGhost);   // snapshot: for..in while deleting can skip
  mpSetStatus('Not connected', 'off');
  renderMpRoster();
  renderMpMaps();                 // offline again: the arena picker is yours to use
  renderBotControls();
}
function mpSend(obj) { if (MP.ws && MP.ws.readyState === 1) { try { MP.ws.send(JSON.stringify(obj)); } catch (err) {} } }
function mpSetStatus(text, cls) {
  const el = $('mpStatus');
  if (!el) return;
  el.textContent = text;
  el.className = 'mpStatus ' + (cls || '');
  const dot = $('mpDot'); if (dot) dot.className = 'mpDot ' + (cls || '');
}

/* ---- PvP event handling ---- */
function mpOnEvent(from, e) {
  if (!e) return;
  if (e.k === 'hit' && e.target === MP.id && mpInMatch()) {
    if (P.respawning) return;
    MP.recentDamage[from] = time;         // remember who is shooting us, for kill + assist credit
    const gh = MP.ghosts[from];
    hurt(e.dmg, gh ? gh.mesh.position : null);   // hurt -> die() -> mpSelfDown when this is fatal
  } else if (e.k === 'kill') {
    mpKillCredit(e.by, e.victim, e.assists || []);
    const victim = mpName(e.victim);
    toast(e.by == null ? victim.toUpperCase() + ' WENT DOWN'
                       : mpName(e.by).toUpperCase() + ' ▸ ' + victim.toUpperCase(),
          e.by === MP.id ? 0x35ffc4 : 0xff2f7a);
    const gh = MP.ghosts[e.victim];
    if (gh) { gh.alive = false; gh.mesh.visible = false; }
    mpCheckWin();
  } else if (e.k === 'leftmatch') {
    // they walked out of the round but stayed connected; the match may no longer be viable
    mpCheckMatchViable(from);
  } else if (e.k === 'matchover') {
    // Host is the clock authority; adopt its verdict even if our local timer had drift.
    mpEndMatch(e.reason || 'time');
  } else if (e.k === 'fire') {
    const gh = MP.ghosts[from];
    if (gh) gh.lastFire = time;          // radar gunfire ping
  } else if (e.k === 'name') {
    /* Names were only ever sent in the 'hello' at connect, so renaming yourself left
       everyone else showing the old callsign until you reconnected. */
    const entry = MP.roster.find(r => r.id === from);
    if (entry) { entry.name = e.name; if (e.char) entry.char = e.char; }
    const gh = MP.ghosts[from];
    if (gh) { gh.name = e.name; mpDrawNameplate(gh, from); }
    renderMpRoster();
    renderScoreboard();
  } else if (e.k === 'arena') {
    // Lobby-only sync; the authoritative pick is the one stamped into the match payload.
    if (e.map && MAPS[e.map] && !mpIsHostMachine()) { setMap(e.map); renderMpMaps(); }
  } else if (e.k === 'spawn') {
    const gh = MP.ghosts[from];
    if (gh) { gh.alive = true; }
  }
}
function mpName(id) {
  if (id === MP.id) return playerName;
  const p = MP.roster.find(r => r.id === id);
  return p ? p.name : 'Player ' + id;
}
function mpScore(id, n) {
  if (!MP.match) return;
  MP.match.scores[id] = (MP.match.scores[id] || 0) + n;
  renderScoreboard();
}
/* The one place a kill is booked on every client: +1 kill for the shooter, +1 death for
   the victim, +1 assist for each helper. Called once per kill per client — the victim
   credits locally (it never receives its own broadcast) and everyone else via the 'kill'
   event, so the three tallies stay identical across the room. */
function mpKillCredit(by, victim, assists) {
  if (!MP.match) return;
  MP.match.deaths = MP.match.deaths || {};
  MP.match.assists = MP.match.assists || {};
  if (by != null) MP.match.scores[by] = (MP.match.scores[by] || 0) + 1;   // null = suicide, no kill awarded
  if (victim != null) MP.match.deaths[victim] = (MP.match.deaths[victim] || 0) + 1;
  (assists || []).forEach(a => { if (a !== by && a !== victim) MP.match.assists[a] = (MP.match.assists[a] || 0) + 1; });
  renderScoreboard();
}
/* The most recent attacker, if they shot us recently enough to be the plausible killer.
   die() can be reached from any damage source (bullet, splash, a bot) and does not carry
   an attacker, so we recover it from the damage log. null means nobody -> a suicide. */
function mpRecentAttacker() {
  let best = null, bestT = -1;
  for (const k in MP.recentDamage) {
    const t = MP.recentDamage[k];
    if (time - t <= ASSIST_WINDOW && t > bestT) { bestT = t; best = +k; }
  }
  return best;
}
/* Everyone who damaged the victim inside the assist window, minus the finisher. */
function mpCollectAssists(killerId) {
  const out = [];
  for (const k in MP.recentDamage) {
    const id = +k;
    if (id !== killerId && MP.id !== id && time - MP.recentDamage[k] <= ASSIST_WINDOW) out.push(id);
  }
  return out;
}
/* Our own death in PvP: respawn instead of ending the run. */
function mpSelfDown(killerId) {
  if (P.respawning) return;                 // one down per life
  P.respawning = true;
  P.hp = 0;
  MP.respawnT = 3;
  MP.deaths++;
  // No attacker on record (fall, splash from nobody) is a suicide: the death still counts
  // against us, but nobody is handed a kill for it.
  const suicide = killerId == null || killerId === MP.id;
  const by = suicide ? null : killerId;
  const assists = suicide ? [] : mpCollectAssists(killerId);
  mpSend({ t: 'event', e: { k: 'kill', by: by, victim: MP.id, assists: assists } });
  mpKillCredit(by, MP.id, assists);         // credit ourselves; the broadcast is not echoed back
  MP.recentDamage = {};                     // fresh slate for the next life
  toast(suicide ? 'YOU WENT DOWN' : mpName(killerId).toUpperCase() + ' ▸ YOU', 0xff2f7a);
  mpCheckWin();
  $('respawnBox').style.display = 'block';
}
/* Where a combatant starts the match.

   resetGame() drops everyone on one hard-coded point, so at the whistle every player
   materialised inside every other player.

   Free-for-all deals everyone around a ring by their position in the sorted id list,
   which every client computes identically, so nobody has to negotiate a spot.

   Team modes are different: a team has to arrive TOGETHER. Each side gets one anchor at
   opposite ends of the arena and its members line up shoulder to shoulder across it, so
   four players read as a squad holding one end rather than four strangers scattered
   around the edge. The search for clear ground only ever nudges along that line or pulls
   back toward the anchor, and never crosses the halfway line into the enemy's half. */
const TEAM_SPACING = 4.5;      // metres between team-mates on the spawn line

function mpSpawnRadius() { return Math.min(CFG.bounds * 0.62, 62); }

/* One team's spot: `idx` of `total` along the line, `team` picks the end. */
function mpTeamSpawn(team, idx, total) {
  const R = mpSpawnRadius();
  const dir = team === 'A' ? -1 : 1;          // A holds -X, B holds +X
  const along = (idx - (total - 1) / 2) * TEAM_SPACING;
  const lim = CFG.bounds - 8;
  for (let ring = 0; ring < 6; ring++) {
    const x = clamp(dir * (R - ring * 6), -lim, lim);
    // stay on our own half no matter how far the search has to back off
    if (dir < 0 ? x > -10 : x < 10) break;
    for (let step = 0; step < 9; step++) {
      const jitter = step === 0 ? 0 : (step % 2 ? 1 : -1) * Math.ceil(step / 2) * 3.2;
      const z = clamp(along + jitter, -lim, lim);
      if (!hitsWall(x, z, 1.2, floorAt(x, z))) return { x: x, z: z };
    }
  }
  return null;
}
function mpMatchSpawnPoint() {
  const me = MP.id || 1;
  const ids = [me].concat(MP.roster.map(r => r.id).filter(i => i !== me)).sort((a, b) => a - b);
  if (mpTeamMode()) {
    const mine = mpTeamOf(me);
    const mates = ids.filter(i => mpTeamOf(i) === mine);
    const sp = mpTeamSpawn(mine, Math.max(0, mates.indexOf(me)), Math.max(1, mates.length));
    if (sp) return sp;
  }
  const idx = Math.max(0, ids.indexOf(me)), total = Math.max(1, ids.length);
  const R = mpSpawnRadius();
  const baseA = (idx / total) * 6.283185307;
  for (let i = 0; i < 28; i++) {
    const a = baseA + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.19;
    const r = R * (1 - (i / 28) * 0.45);
    const x = clamp(Math.cos(a) * r, -CFG.bounds + 8, CFG.bounds - 8);
    const z = clamp(Math.sin(a) * r, -CFG.bounds + 8, CFG.bounds - 8);
    if (!hitsWall(x, z, 1.2, floorAt(x, z))) return { x: x, z: z };
  }
  return null;
}
function mpPlaceAtMatchSpawn() {
  const sp = mpMatchSpawnPoint();
  if (!sp) return;
  camera.position.x = sp.x; camera.position.z = sp.z;
  P.feetY = floorAt(sp.x, sp.z);
  camera.position.y = P.feetY + 1.75;
  P.vel.set(0, 0, 0); P.vy = 0;
  /* Face the middle of the arena, so everyone opens looking at the fight.
     Movement treats forward as (-sin yaw, -cos yaw), so pointing at the origin from
     (x, z) needs atan2(x, z). Negating both put everyone's back to the fight. */
  P.yaw = Math.atan2(sp.x, sp.z);
}
function mpRespawn() {
  P.respawning = false;
  P.hp = P.maxHp; P.shield = 0;
  P.vel.set(0, 0, 0); P.vy = 0;
  // pick a spawn well away from anyone still alive
  let best = null, bestD = -1;
  for (let i = 0; i < 12; i++) {
    const a = rand(0, 6.283), r = rand(18, CFG.bounds * 0.7);
    const x = clamp(Math.cos(a) * r, -CFG.bounds + 8, CFG.bounds - 8);
    const z = clamp(Math.sin(a) * r, -CFG.bounds + 8, CFG.bounds - 8);
    if (hitsWall(x, z, 1.2)) continue;
    let near = 1e9;
    for (const id in MP.ghosts) {
      const gh = MP.ghosts[id];
      if (gh.alive) near = Math.min(near, Math.hypot(gh.mesh.position.x - x, gh.mesh.position.z - z));
    }
    if (near > bestD) { bestD = near; best = { x: x, z: z }; }
  }
  if (best) {
    camera.position.x = best.x; camera.position.z = best.z;
    P.feetY = floorAt(best.x, best.z);
    camera.position.y = P.feetY + 1.75;
  }
  P.ammo = P.mag;
  P.nades = grenadeMax(); P.nadeCool = 0;
  mpSend({ t: 'event', e: { k: 'spawn' } });
  $('respawnBox').style.display = 'none';
  toast('RESPAWNED', 0x35ffc4);
}
function mpStartMatch(mode, limit) {
  /* Offline (no server) is a first-class case: you get a local id so scoring works,
     and mpSend is a no-op when there is no socket. Bots are the opposition. */
  if (!MP.id) MP.id = 1;
  /* The arena is frozen into the match itself, map AND layout seed, so every client —
     including someone who joins after the whistle — rebuilds the identical level.
     Without this each client fought on whatever map it had picked locally, and even
     agreeing on the map key was not enough (see mpApplyArena). */
  const dur = mpMatchDuration();
  /* Bots are simulated locally by every client, so the COUNT has to travel with the match.
     It used to be read from each client's own lobby setting: the host started a 1v1 with
     no bots while a joiner still had the default 3, so the joiner spawned three opponents
     that existed on nobody else's screen. */
  const m = { active: true, mode: mode, limit: limit, scores: {}, deaths: {}, assists: {},
              startedBy: MP.id, duration: dur, bots: botCount, botSkill: botSkill,
              map: currentMap, seed: (Date.now() ^ (Math.random() * 0xffffffff)) | 0 || 7 };
  mpSend({ t: 'match', m: m });
  mpOnMatch(m);
}
/* Adopt the match's arena. Returns whether the world we are currently rendering is the
   wrong one and has to be rebuilt.

   Comparing the seed as well as the map matters: buildMapWorld() lays the level out with
   reseed(runSeed), and both startGame() and setMap() roll runSeed at random. Two clients
   sitting on 'rain' therefore generated different building layouts, so players saw each
   other walking through walls and spawning inside geometry. */
function mpApplyArena(m) {
  if (!m || !m.map || !MAPS[m.map]) return false;
  const seed = (typeof m.seed === 'number' && m.seed) ? m.seed : runSeed;
  const changed = m.map !== currentMap || seed !== runSeed;
  currentMap = m.map;
  forcedSeed = seed;                 // startGame() consumes this on its buildMapWorld()
  renderMpMaps();
  const hm = $('homeMap'); if (hm) hm.textContent = MAPS[currentMap].name;
  const mb = $('mapBlurb'); if (mb) mb.textContent = MAPS[currentMap].blurb;
  return changed;
}
function mpOnMatch(m) {
  MP.mode = m.mode;
  m.scores = m.scores || {};
  m.deaths = m.deaths || {};
  m.assists = m.assists || {};
  MP.match = m;
  MP.deaths = 0;
  MP.recentDamage = {};
  // Local countdown, seeded from the host's chosen duration (0 = untimed). Each client
  // ticks its own copy; the host's matchover broadcast is the authoritative stop.
  MP.matchClock = (m.active && m.duration) ? m.duration : 0;
  mpShowTimer(!!MP.matchClock);
  const tEl = $('mpTimer');
  if (tEl) {
    tEl.classList.remove('low');
    if (MP.matchClock) tEl.textContent = mpFmtClock(MP.matchClock);
  }
  P.respawning = false;
  if (m.active) {
    const wrongArena = mpApplyArena(m);
    toast(MP_MODES[m.mode].name.toUpperCase() + ' — FIRST TO ' + m.limit, 0x7fe4ff);
    for (const id in MP.ghosts) MP.ghosts[id].alive = true;
    // Already mid-run on a different map (or a different layout of the same map) still
    // needs the full rebuild — respawning in place would leave us in the old world.
    if (state !== 'play' || wrongArena) startGame();
    else { forcedSeed = null; P.hp = P.maxHp; mpRespawn(); }
    if (MAPS[currentMap]) toast('ARENA · ' + MAPS[currentMap].name.toUpperCase(), 0x7fe4ff);
    // spawn after startGame so the world (and its floor/collision) exists to place them in
    // spread the humans out before bots pick their own spots around them
    mpPlaceAtMatchSpawn();
    /* Always the match's bot count, never the local lobby's — see mpStartMatch. */
    const nBots = (typeof m.bots === 'number') ? m.bots : 0;
    if (nBots > 0) spawnBots(nBots, m.botSkill || 'regular'); else clearBots();
    // no PvE bleed-through: startGame() queues a wave, which a PvP match must not run
    spawnQueue = []; waveTimer = 1e9;
    resetPvpDrops();
    enemies.slice().forEach(despawnEnemy); enemies.length = 0;
  } else {
    clearBots();
  }
  renderScoreboard();
  renderMpModes();
}
function mpCheckWin() {
  if (!MP.match || !MP.match.active) return;
  /* Team modes race to a shared team total; free-for-all races per player. Either way
     the first side to the limit ends it. */
  if (mpTeamMode()) {
    const t = mpTeamTotals();
    if (t.A >= MP.match.limit || t.B >= MP.match.limit) { mpEndMatch('frag'); return; }
  }
  for (const id in MP.match.scores) {
    if (MP.match.scores[id] >= MP.match.limit) { mpEndMatch('frag'); return; }
  }
}
/* Read the lobby's time-limit control, in seconds (0 = untimed). */
function mpMatchDuration() {
  const sel = $('mpTime');
  const v = sel ? parseInt(sel.value, 10) : 0;
  return isFinite(v) && v > 0 ? v : 0;
}
function mpTeamTotals() {
  /* Sum kills per side. Humans get their team from id parity (mpTeamOf); bots carry an
     explicit b.team from spawnBots. Build the id set once so nobody is counted twice. */
  const out = { A: 0, B: 0 };
  const me = MP.id || 1;
  const ids = new Set([me].concat(MP.roster.map(r => r.id)));
  ids.forEach(id => { const t = mpTeamOf(id); if (out[t] != null) out[t] += (MP.match.scores[id] || 0); });
  BOTS.forEach(b => { const t = b.team || mpTeamOf(b.id); if (out[t] != null) out[t] += (MP.match.scores[b.id] || 0); });
  return out;
}
/* End the match once, from any trigger (frag limit or clock). Freezes play, shows the
   K/D/A results card, and — if we are the clock authority — tells everyone else. */
function mpEndMatch(reason) {
  if (!MP.match || MP.match._ended) return;
  MP.match._ended = true;
  MP.match.active = false;
  MP.matchClock = 0;
  P.respawning = false;
  mpShowTimer(false);
  $('respawnBox').style.display = 'none';
  // Host announces the stop so late/paused clients converge; the room also drops the
  // match to inactive so nobody new is pulled into a finished round.
  /* The starter owns the match, and the host machine is the fallback authority when the
     starter is the one who vanished. Either announces the stop so nobody is left running
     a round the rest of the room has finished. */
  if (mpIsHostMachine() || MP.match.startedBy === MP.id || !MP.connected) {
    mpSend({ t: 'event', e: { k: 'matchover', reason: reason } });
    mpSend({ t: 'match', m: MP.match });
  }
  showMatchResult(reason);
}
/* A match cannot outlive the person running it, or its own player count.

   Whoever started the match owns it: when they abandon the contract or close the tab the
   round is over for everyone, rather than leaving the rest standing in an arena that can
   never end. A match that drops below its mode's minimum (a duel with one player left)
   ends the same way. */
function mpCheckMatchViable(leftId) {
  if (!mpInMatch()) return;
  if (leftId != null && leftId === MP.match.startedBy) { mpEndMatch('host-left'); return; }
  const humans = MP.roster.length;
  const total = humans + BOTS.length;
  const min = (MP_MODES[MP.mode] || {}).min || 1;
  if (total < min || humans < 1) mpEndMatch('abandoned');
}
/* Leave the match we are in. The starter ending it stops it for the whole room; anyone
   else simply drops out and the rest play on. */
function mpLeaveMatch() {
  if (!mpInMatch()) return false;
  const iOwnIt = MP.match.startedBy === MP.id;
  if (iOwnIt) {
    mpEndMatch('host-left');            // broadcasts matchover + clears the room's match
  } else {
    mpSend({ t: 'event', e: { k: 'leftmatch' } });
    MP.match.active = false;
    MP.matchClock = 0;
    mpShowTimer(false);
    $('respawnBox').style.display = 'none';
    P.respawning = false;
    clearBots();
    renderScoreboard();
  }
  return true;
}
/* Ticked every frame from the HUD update while a timed match is live. Any client that
   reaches zero ends locally (K/D/A is identical across the room, so the board agrees);
   the host also broadcasts matchover so a client whose clock lagged still converges. */
function mpTickMatch(dt) {
  if (!MP.match || !MP.match.active || !MP.matchClock) return;
  MP.matchClock = Math.max(0, MP.matchClock - dt);
  const el = $('mpTimer');
  if (el) {
    const t = Math.ceil(MP.matchClock);
    const mm = (t / 60) | 0, ss = t % 60;
    el.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
    el.classList.toggle('low', t <= 10);
  }
  if (MP.matchClock <= 0) mpEndMatch('time');
}
/* The clock is a unit inside the HUD strip, so its separator has to come and go with it. */
function mpShowTimer(on) {
  const u = $('mpTimerUnit'), sep = $('mpTimerSep'), t = $('mpTimer');
  if (u) u.style.display = on ? 'flex' : 'none';
  if (sep) sep.style.display = on ? 'block' : 'none';
  if (!on && t) t.classList.remove('low');
}
function mpFmtClock(sec) {
  const t = Math.max(0, Math.ceil(sec)), mm = (t / 60) | 0, ss = t % 60;
  return mm + ':' + (ss < 10 ? '0' : '') + ss;
}
/* Final standings card: one row per combatant with Kills / Deaths / Assists, sorted by
   kills. Winner headline is a team in TDM, otherwise the top fragger. Auto-returns to
   the multiplayer lobby after a short countdown; the button skips the wait. */
let mpResultTimer = null;
function showMatchResult(reason) {
  const box = $('mpResult');
  if (!box) return;
  $('scoreboard').style.display = 'none';
  document.body.classList.remove('pvpHud');
  if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (e) {} }

  const sc = MP.match.scores || {}, dth = MP.match.deaths || {}, ast = MP.match.assists || {};
  const me = MP.id || 1;
  const rows = [];
  const seen = new Set();
  const push = (id, name, bot, team) => {
    if (seen.has(id)) return; seen.add(id);
    rows.push({ id, name, bot: !!bot, team: team || mpTeamOf(id),
      k: sc[id] || 0, d: dth[id] || 0, a: ast[id] || 0 });
  };
  push(me, playerName, false);
  MP.roster.forEach(r => { if (r.id !== me) push(r.id, r.name, false); });
  BOTS.forEach(b => push(b.id, b.name, true, b.team));
  rows.sort((x, y) => y.k - x.k || x.d - y.d || y.a - x.a);

  let headline;
  if (mpTeamMode()) {
    const t = mpTeamTotals();
    headline = t.A === t.B ? 'DRAW' : (t.A > t.B ? 'TEAM ALPHA WINS' : 'TEAM BRAVO WINS');
    headline += '  ' + t.A + '–' + t.B;
  } else {
    const top = rows[0];
    headline = top ? (top.id === me ? 'YOU WIN' : top.name.toUpperCase() + ' WINS') : 'MATCH OVER';
  }
  $('mpResultTitle').textContent = headline;
  const why = reason === 'time' ? 'Time up · '
            : reason === 'host-left' ? 'Host left · '
            : reason === 'abandoned' ? 'Not enough players · '
            : 'Frag limit · ';
  $('mpResultSub').textContent = why
    + MP_MODES[MP.mode].name + (MP.match.duration ? ' · ' + mpFmtClock(MP.match.duration) : '');

  const host = $('mpResultRows');
  host.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'mrRow mrHead';
  head.innerHTML = '<span class="mrName">Player</span><i>K</i><i>D</i><i>A</i><i class="mrKd">K/D</i>';
  host.appendChild(head);
  rows.forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'mrRow' + (r.id === me ? ' me' : '') + (i === 0 && !mpTeamMode() ? ' lead' : '');
    const tm = mpTeamMode() ? '<em class="mrTeam ' + (r.team === 'A' ? 'a' : 'b') + '">' + r.team + '</em>' : '';
    const kd = r.d ? (r.k / r.d).toFixed(2) : (r.k ? r.k.toFixed(2) : '0.00');
    d.innerHTML = tm + '<span class="mrName">' + r.name + (r.bot ? ' <em class="mrBot">BOT</em>' : '')
      + '</span><i>' + r.k + '</i><i>' + r.d + '</i><i>' + r.a + '</i><i class="mrKd">' + kd + '</i>';
    host.appendChild(d);
  });

  box.style.display = 'flex';
  let left = 12;
  const cd = $('mpResultCount');
  if (cd) cd.textContent = left;
  if (mpResultTimer) clearInterval(mpResultTimer);
  mpResultTimer = setInterval(() => {
    left--;
    if (cd) cd.textContent = Math.max(0, left);
    if (left <= 0) mpReturnToLobby();
  }, 1000);
}
function mpReturnToLobby() {
  if (mpResultTimer) { clearInterval(mpResultTimer); mpResultTimer = null; }
  const box = $('mpResult');
  if (box) box.style.display = 'none';
  mpShowTimer(false);
  document.body.classList.remove('pvpHud');
  $('scoreboard').style.display = 'none';
  clearBots();
  $('menu').classList.add('show');
  showView('multiplayer');
  state = 'menu';
}

/* ---- other players: a readable humanoid, not a stack of boxes ----
   Rebuilt against low-poly character practice: silhouette and proportions carry a figure
   at distance, not surface detail. Three changes did the work:

     1. **Tapered limbs via LatheGeometry** instead of stretched boxes. A lathe sweeps a
        radius profile around Y, so arms and legs thin toward wrist and ankle with smooth
        normals — the single biggest cause of the boxy look was constant-width limbs.
     2. **Sphere joints** at shoulder, elbow, hip and knee. Butted box ends leave hard
        seams that break apart when the limb rotates; a ball joint hides the seam and
        reads as articulation.
     3. **Real proportions** — 1.85m over roughly 7.7 head-heights, with an elliptical
        torso (lathe scaled on Z) rather than a cube, so the figure reads as a person
        from the side as well as the front.

   Geometry is built ONCE and shared across every figure (PMG below); only materials are
   per-model, since those carry the operator's colours. */

/* radius profile swept around Y: from (0, 0) down to (0, -len), thickest in the middle */
function limbGeo(rTop, rBot, len, seg) {
  const pts = [];
  const N = 6;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = lerp(rTop, rBot, t) * (1 + Math.sin(t * Math.PI) * 0.07);   // slight taper bulge
    pts.push(new T.Vector2(Math.max(0.004, r), -len * t));
  }
  const g = new T.LatheGeometry(pts, seg || 10);
  g.computeVertexNormals();
  return g;
}
/* a lathe swept from a list of [radius, y] pairs — used for torso and helmet masses */
function massGeo(profile, seg, zScale) {
  const g = new T.LatheGeometry(profile.map(p => new T.Vector2(Math.max(0.004, p[0]), p[1])), seg || 12);
  if (zScale && zScale !== 1) g.scale(1, 1, zScale);       // ellipse, not a circle
  g.computeVertexNormals();
  return g;
}

/* Shared geometry, built on first use. Every bot and ghost reuses these. */
let PMG = null;
function playerGeoms() {
  if (PMG) return PMG;
  PMG = {
    upperArm: limbGeo(0.070, 0.055, 0.30, 10),
    foreArm:  limbGeo(0.058, 0.046, 0.26, 10),
    thigh:    limbGeo(0.105, 0.078, 0.40, 10),
    shin:     limbGeo(0.076, 0.052, 0.41, 10),
    // torso: waist -> chest -> shoulder line, flattened front-to-back
    torso: massGeo([[0.135, 0], [0.165, 0.14], [0.185, 0.28], [0.175, 0.40], [0.120, 0.46]], 14, 0.62),
    pelvis: massGeo([[0.115, 0], [0.145, 0.07], [0.135, 0.14]], 12, 0.68),
    helmet: massGeo([[0.020, 0.24], [0.105, 0.20], [0.128, 0.12], [0.125, 0.04], [0.100, 0], [0.020, -0.01]], 14, 0.92),
    joint:  new T.SphereGeometry(1, 10, 8),
    boot:   massGeo([[0.075, 0], [0.088, -0.05], [0.080, -0.10]], 10, 1.5),
    pack:   massGeo([[0.090, 0], [0.115, 0.10], [0.105, 0.22], [0.060, 0.26]], 10, 0.55)
  };
  return PMG;
}

function buildPlayerModel(accentHex, charId) {
  const g = new T.Group();
  const G = playerGeoms();
  /* Dress the figure in the operator the player actually selected. CHARACTERS[].hands is
     the same palette the first-person hands use, so the person you see across the map is
     wearing what you would see on your own arms if you picked them. accentHex still drives
     the team/hostile trim, which must stay readable regardless of operator. */
  const ch = (CHARACTERS[charId] || CHARACTERS.vanguard).hands;
  const suit  = new T.MeshStandardMaterial({ color: ch.sleeve, roughness: 0.74, metalness: 0.18 });
  const plate = new T.MeshStandardMaterial({ color: ch.glove,  roughness: 0.55, metalness: 0.35 });
  const dark  = new T.MeshStandardMaterial({ color: ch.pad,    roughness: 0.82, metalness: 0.32 });
  const trim  = new T.MeshBasicMaterial({ color: C(accentHex) });
  const visor = new T.MeshBasicMaterial({ color: C(accentHex) });
  const glow  = new T.MeshBasicMaterial({ color: C(accentHex), transparent: true, opacity: 0.32,
                                          blending: T.AdditiveBlending, depthWrite: false });

  const put = (geo, mat, x, y, z, parent, sx, sy, sz) => {
    const m = new T.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (sx !== undefined) m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    (parent || g).add(m);
    return m;
  };
  const ball = (mat, x, y, z, r, parent) => put(G.joint, mat, x, y, z, parent, r);

  /* ---- legs: hip -> knee -> boot ---- */
  const mkLeg = (side) => {
    const hip = new T.Group(); hip.position.set(side * 0.105, 0.92, 0); g.add(hip);
    ball(suit, 0, -0.01, 0, 0.088, hip);                    // sits inside the thigh, hides the seam
    put(G.thigh, suit, 0, 0, 0, hip);
    const knee = new T.Group(); knee.position.set(0, -0.40, 0); hip.add(knee);
    ball(suit, 0, -0.005, 0, 0.068, knee);                  // knee, inside the shin
    put(G.shin, suit, 0, 0, 0, knee);
    put(G.joint, trim, 0, -0.02, -0.075, knee, 0.055, 0.030, 0.020);   // shin accent
    put(G.boot, dark, 0, -0.41, 0.012, knee);
    hip.userData.knee = knee;
    return hip;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  /* ---- torso: pelvis, chest, harness, backpack ---- */
  put(G.pelvis, dark, 0, 0.90, 0);
  put(G.torso, suit, 0, 1.00, 0);
  put(G.torso, plate, 0, 1.005, 0, null, 1.04, 0.62, 1.06);            // chest rig over the suit
  const slab0 = new T.BoxGeometry(1, 1, 1);
  put(slab0, trim, 0, 1.30, -0.098, null, 0.20, 0.030, 0.055);         // chest band
  put(slab0, dark, 0.078, 1.20, -0.092, null, 0.042, 0.26, 0.040);     // harness straps
  put(slab0, dark, -0.078, 1.20, -0.092, null, 0.042, 0.26, 0.040);
  put(G.pack, dark, 0, 1.06, 0.135, null, 1, 1, 1);                    // backpack
  put(G.joint, trim, 0, 1.24, 0.205, null, 0.045, 0.016, 0.016);       // pack light
  const slab = new T.BoxGeometry(1, 1, 1);
  put(slab, plate, 0.150, 1.00, -0.045, null, 0.075, 0.115, 0.062);    // hip pouches
  put(slab, plate, -0.150, 1.00, -0.045, null, 0.075, 0.115, 0.062);

  /* ---- arms: shoulder -> elbow -> glove ---- */
  const mkArm = (side) => {
    const sh = new T.Group(); sh.position.set(side * 0.205, 1.40, 0); g.add(sh);
    put(G.joint, plate, 0, 0.012, 0, sh, 0.092, 0.062, 0.088);   // pauldron: a flattened cap, not a ball
    put(G.joint, trim, side * 0.055, 0.045, 0, sh, 0.045, 0.016, 0.055);   // shoulder accent
    put(G.upperArm, suit, 0, 0, 0, sh);
    const el = new T.Group(); el.position.set(0, -0.30, 0); sh.add(el);
    ball(suit, 0, -0.005, 0, 0.050, el);                    // elbow, inside the forearm
    put(G.foreArm, suit, 0, 0, 0, el);
    put(G.joint, dark, 0, -0.275, -0.012, el, 0.055, 0.062, 0.058);   // glove
    sh.userData.elbow = el;
    return sh;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  /* ---- head: helmet, visor, collar ---- */
  put(G.joint, dark, 0, 1.495, 0, null, 0.052, 0.045, 0.048);        // neck
  put(G.helmet, plate, 0, 1.53, 0);
  put(G.joint, visor, 0, 1.615, -0.098, null, 0.088, 0.030, 0.030);    // visor
  put(G.joint, glow,  0, 1.615, -0.104, null, 0.115, 0.048, 0.030);    // visor bloom
  put(G.joint, dark,  0, 1.665, -0.088, null, 0.098, 0.016, 0.028);    // brow
  put(G.joint, trim,  0.070, 1.72, 0.010, null, 0.012, 0.055, 0.012);  // antenna

  /* Yaw first, then lean and sway INSIDE it.

     three.js defaults to 'XYZ', which composes as Rx·Ry·Rz — the yaw is applied before
     the X tilt, so rotation.x tips the body about the WORLD x-axis rather than about its
     own left-right axis. A figure facing along +X then "leaned forward" tipped sideways
     instead, and the tilt swung around as it turned, which reads as the torso drifting
     loose from the legs. 'YXZ' applies the yaw outermost, so the lean and the weight sway
     stay relative to the body however it is facing. */
  g.rotation.order = 'YXZ';
  g.userData.limbs = { legL: legL, legR: legR, armL: armL, armR: armR };
  g.userData.trim = trim;
  g.userData.visor = visor;
  return g;
}

/* ---------- procedural locomotion for remote players and bots ----------

   The gait is driven by the DISTANCE the figure actually covers, never by wall-clock
   time. That one change is what stops the feet skating: a stride is a fixed length of
   ground, so the legs turn over exactly as fast as the body travels and the foot that is
   planted stays planted. Time-driven cycles cannot do this — they keep churning while a
   bot is jammed against a wall, and they jump phase whenever the speed (and so the
   frequency) changes, which is the little hitch you see when someone starts sprinting.

   Everything is measured from the model's own world position, so ghosts (whose motion
   comes from interpolated network snapshots) and bots (simulated locally) run through
   exactly the same code and neither can desync from what its body is doing. */
const STRIDE = 1.9;          // metres of ground per full two-step cycle
const GAIT_TELEPORT = 4;     // a jump this big is a respawn, not a step

function animatePlayerModel(model, speed, t, dt) {
  const L = model.userData.limbs;
  if (!L) return;
  const ud = model.userData;
  const p = model.position;
  if (!ud.gait) ud.gait = { px: p.x, py: p.y, pz: p.z, phase: 0, spd: 0, vy: 0, air: 0, fwd: 1, side: 0 };
  const G = ud.gait;
  const d = Math.max(dt || 0.0166, 1e-4);
  const ease = (cur, to, rate) => cur + (to - cur) * Math.min(1, d * rate);

  let dx = p.x - G.px, dy = p.y - G.py, dz = p.z - G.pz;
  G.px = p.x; G.py = p.y; G.pz = p.z;
  const ground = Math.hypot(dx, dz);
  // A respawn cuts the body across the arena; spinning the legs for it looks absurd.
  const teleported = ground > GAIT_TELEPORT;
  if (teleported) { dx = 0; dy = 0; dz = 0; }

  G.spd = ease(G.spd, teleported ? 0 : ground / d, 12);
  G.vy  = ease(G.vy,  teleported ? 0 : dy / d, 10);

  /* Which way are they travelling relative to the way they are FACING? Rotating the world
     delta back into model space answers it: the model is built facing -Z, so -localZ is
     how much of the movement is "forwards". Backpedalling then runs the cycle in reverse
     and strafing leans the legs, instead of everyone always jogging forwards on the spot. */
  const C = Math.cos(model.rotation.y), S = Math.sin(model.rotation.y);
  // world delta rotated by -rotation.y into model space; the model's front is -Z
  if (ground > 1e-5) {
    G.fwd  = ease(G.fwd,  -(dx * S + dz * C) / ground, 10);
    G.side = ease(G.side,  (dx * C - dz * S) / ground, 10);
  }

  // Sustained vertical motion with no stride under it reads as airborne.
  G.air = ease(G.air, Math.abs(G.vy) > 1.6 ? 1 : 0, 8);

  const run = Math.min(G.spd / 9, 1);           // 0 standing .. 1 sprinting
  if (!teleported) G.phase += (ground / STRIDE) * 6.283185307 * (G.fwd < -0.25 ? -1 : 1);
  const ph = G.phase, air = G.air;
  const swL = Math.sin(ph), swR = Math.sin(ph + Math.PI);
  const amp = run * 0.72;                       // at rest the limbs settle to neutral

  /* legs: stride on the ground, tuck in the air */
  L.legL.rotation.x = swL * amp * (1 - air) + 0.55 * air;
  L.legR.rotation.x = swR * amp * (1 - air) - 0.28 * air;
  L.legL.rotation.z = -G.side * 0.14 * run;
  L.legR.rotation.z = -G.side * 0.14 * run;

  /* Knees and elbows only ever bend one way, so drive them off a half-wave rather than
     the swing itself — a leg that hyperextends backwards reads as broken. The bend peaks
     just after the foot leaves the ground, which is what sells it as a step. */
  const knee = (0.2 + run * 0.95) * (1 - air);
  if (L.legL.userData.knee) L.legL.userData.knee.rotation.x = Math.max(0, -Math.sin(ph - 0.5)) * knee + 1.20 * air;
  if (L.legR.userData.knee) L.legR.userData.knee.rotation.x = Math.max(0, -Math.sin(ph + 2.64)) * knee + 0.60 * air;

  /* arms counter-swing against the legs; the right one is carrying a weapon, so it barely
     moves and never leaves the ready position */
  const armAmp = amp * 0.62 * (1 - 0.5 * Math.abs(G.side));
  L.armL.rotation.x = -swL * armAmp * (1 - air) - 0.35 * air;
  L.armR.rotation.x = -swR * armAmp * 0.22;
  L.armL.rotation.z = -0.06 - Math.abs(G.side) * 0.18;
  L.armR.rotation.z = 0.05;
  if (L.armL.userData.elbow) L.armL.userData.elbow.rotation.x = -0.25 - Math.max(0, swL) * 0.55 - air * 0.35;
  if (L.armR.userData.elbow) L.armR.userData.elbow.rotation.x = -0.55;   // weapon arm stays tucked

  /* If they are carrying a weapon, both hands belong ON it — the arm swing above is only
     the pose for someone running empty-handed. poseWeapon overwrites both arms. */
  G.dt = d;
  poseWeapon(model, G, run, air);

  /* Body: dip once per footfall (twice per cycle) and sway into the step. Safe to write
     straight onto the model because the caller sets its position fresh every frame, so
     these offsets replace rather than accumulate. */
  const idle = 1 - Math.min(1, G.spd / 1.2);
  p.y += -Math.abs(swL) * 0.045 * run * (1 - air)      // footfall dip
       + Math.sin(t * 1.6) * 0.018 * idle;             // breathing while stood still
  model.rotation.z = swL * 0.025 * run * (1 - air);    // weight shifting side to side
  // front is -Z, so leaning INTO the direction of travel is a negative x tilt
  model.rotation.x = -G.fwd * run * 0.05 * (1 - air);
}


/* ---------- the weapon in their hands ----------
   The figure used to carry a hard-coded box "gun". Everyone was visibly holding the same
   grey brick regardless of what they were actually shooting you with, which is bad in a
   deathmatch: the weapon someone is carrying is real tactical information.

   gunModels[] are the actual first-person viewmodels, already parented to the viewmodel
   rig, so they cannot be reparented — `.clone()` gives a fresh Object3D that shares the
   same geometry and materials, which is cheap. The clone is attached to the shoulder
   group so it swings with the arm. */
/* ---------- carrying a weapon ----------

   The weapon used to hang off the right FOREARM, which meant it swung with the walk
   cycle and the left arm swung freely beside it — nobody was actually holding the thing
   with two hands.

   It now hangs off an anchor on the body, positioned by STANCE, and both arms are solved
   onto it with two-bone inverse kinematics: the right hand takes the grip, the left hand
   takes the foregrip. That is the standard third-person rig (see the UE/Unity "left-hand
   weapon IK" technique) — the weapon leads and the arms follow it, rather than the arms
   leading and the weapon going along for the ride.

   Three stances, blended:
     aiming  — weapon up at eye level, tucked into the shoulder, steady
     ready   — weapon held at chest, pointing forward (the default while fighting)
     running — weapon dropped toward the chest and swaying with the stride */
const HELD_GUN_POSE = { x: 0.02, y: -0.05, z: -0.10, rx: 0.10, ry: 0.0 };
const ARM_UPPER = 0.30, ARM_FORE = 0.285;      // bone lengths from buildPlayerModel
const FOREGRIP = 0.20;                          // how far up the barrel the off hand sits
const CHEST_PIVOT_Y = 1.36;                     // the weapon swings around here when aiming up/down
const ARM_DOWN = new T.Vector3(0, -1, 0);       // arms hang along -Y in the rig
const _ik = {
  v: new T.Vector3(), pole: new T.Vector3(), axis: new T.Vector3(), upper: new T.Vector3(),
  elbowP: new T.Vector3(), reach: new T.Vector3(), fore: new T.Vector3(),
  grip: new T.Vector3(), fgrip: new T.Vector3(), inv: new T.Quaternion()
};

/* Two-bone IK: rotate `shoulder` and its elbow so the hand lands on `target`.
   Both are expressed in the model's own space. `poleSign` decides which way the elbow
   breaks (+1 right arm, -1 left) so they bend outward like real elbows instead of
   snapping to whichever side the maths happened to pick. */
function solveArmIK(shoulder, target, poleSign) {
  const elbow = shoulder.userData.elbow;
  if (!elbow) return;
  const S = shoulder.position;
  const v = _ik.v.subVectors(target, S);
  let d = v.length();
  if (d < 1e-4) return;
  v.divideScalar(d);
  // Clamp into the range the arm can actually cover; outside it there is no solution and
  // the limb would pop straight or fold through itself.
  d = Math.min((ARM_UPPER + ARM_FORE) * 0.995, Math.max(Math.abs(ARM_UPPER - ARM_FORE) + 0.02, d));
  const cosA = (ARM_UPPER * ARM_UPPER + d * d - ARM_FORE * ARM_FORE) / (2 * ARM_UPPER * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));   // upper arm vs the line to the target
  const pole = _ik.pole.set(poleSign, -0.15, 0.5).normalize();
  const axis = _ik.axis.crossVectors(v, pole);
  if (axis.lengthSq() < 1e-8) axis.set(poleSign, 0, 0); else axis.normalize();
  const upper = _ik.upper.copy(v).applyAxisAngle(axis, a);
  shoulder.quaternion.setFromUnitVectors(ARM_DOWN, upper);
  /* Aim the forearm straight at the (clamped) target from wherever the elbow ended up.
     Deriving it from the actual positions avoids sign errors in the bend angle. */
  const E = _ik.elbowP.copy(S).addScaledVector(upper, ARM_UPPER);
  const R = _ik.reach.copy(S).addScaledVector(v, d);
  const fore = _ik.fore.subVectors(R, E);
  if (fore.lengthSq() < 1e-8) return;
  fore.normalize().applyQuaternion(_ik.inv.copy(shoulder.quaternion).invert());
  elbow.quaternion.setFromUnitVectors(ARM_DOWN, fore);
}

/* Place the weapon for this frame and put both hands on it. */
function poseWeapon(model, G, run, air) {
  const held = model.userData.held, L = model.userData.limbs;
  if (!held || !L || !L.armR || !L.armL) return;
  const anchor = model.userData.gunAnchor;
  if (!anchor) return;

  // stance: 1 = shouldered and aiming, 0 = carried at the chest
  const want = model.userData.aiming ? 1 : 0;
  G.stance = G.stance === undefined ? want : G.stance + (want - G.stance) * Math.min(1, (G.dt || 0.016) * 9);
  const st = G.stance;
  const pitch = model.userData.aimPitch || 0;

  /* Sway. Running jostles the weapon in time with the stride; bringing it up to aim
     steadies it, which is what makes aiming read as deliberate. */
  const steady = 1 - st * 0.85;
  const swayX = Math.sin(G.phase) * 0.030 * run * steady;
  const swayY = -Math.abs(Math.sin(G.phase)) * 0.028 * run * steady;
  const swayZ = Math.cos(G.phase * 0.5) * 0.022 * run * steady;

  /* Right-hand grip, blended between chest-ready and shouldered. Held fairly close to the
     centreline on purpose: the off hand has to reach the foregrip 0.20 further down the
     barrel, and the arm is only ARM_UPPER+ARM_FORE long. Carry the weapon out at the far
     side of the body and the left arm cannot make it, so the IK clamps and the hand hangs
     off the gun instead of gripping it. */
  const gx = (0.085 + (0.030 - 0.085) * st) + swayX;
  let gy = (1.18 + (1.42 - 1.18) * st) + swayY - air * 0.05;
  let gz = (-0.22 + (-0.26 - -0.22) * st) + swayZ;
  // swing the whole weapon about the chest so the muzzle follows the look angle
  const dy = gy - CHEST_PIVOT_Y, dz = gz;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  gy = CHEST_PIVOT_Y + dy * cp - dz * sp;
  gz = dy * sp + dz * cp;
  const grip = _ik.grip.set(gx, gy, gz);

  // the off hand rides the barrel itself: same axis as the grip, just further forward
  const fgrip = _ik.fgrip.set(gx, gy + Math.sin(pitch) * FOREGRIP, gz - Math.cos(pitch) * FOREGRIP);

  anchor.position.copy(grip);
  anchor.rotation.set(pitch + HELD_GUN_POSE.rx, 0, (1 - st) * 0.10);

  solveArmIK(L.armR, grip, 1);
  solveArmIK(L.armL, fgrip, -1);
}

function setHeldWeapon(model, key) {
  if (!model || !model.userData.limbs) return;
  if (model.userData.heldKey === key) return;          // already holding it
  /* Anchored to the BODY, not the arm: the stance drives the weapon and the arms are
     solved onto it afterwards (see poseWeapon). */
  let anchor = model.userData.gunAnchor;
  if (!anchor) { anchor = new T.Group(); model.add(anchor); model.userData.gunAnchor = anchor; }
  if (model.userData.held) { anchor.remove(model.userData.held); model.userData.held = null; }
  model.userData.heldKey = key;
  const src = (typeof gunModels !== 'undefined') && key && gunModels[key];
  if (!src) return;
  const g = src.clone(true);
  g.visible = true;
  g.traverse(n => { n.visible = true; });               // the source may be hidden in the viewmodel
  g.position.set(HELD_GUN_POSE.x, HELD_GUN_POSE.y, HELD_GUN_POSE.z);
  g.rotation.set(0, HELD_GUN_POSE.ry, 0);
  g.scale.setScalar(1.0);
  anchor.add(g);
  model.userData.held = g;
}
/* Weapons a bot may be issued. Melee is excluded: bots have no melee behaviour, so
   carrying a blade they never swing would misrepresent the threat. */
const BOT_WEAPONS = ['carbine', 'smg', 'dmr', 'lmg', 'autoshot', 'nail', 'sidearm', 'beam'];

function mpApplyGhost(id, s) {
  let gh = MP.ghosts[id];
  if (!gh) {
    const hostile = mpPvP() && (!mpTeamMode() || mpTeamOf(id) !== mpTeamOf(MP.id));
    const entry = MP.roster.find(r => r.id === id);
    const mesh = buildPlayerModel(hostile ? 0xff2f7a : 0x35ffc4, entry && entry.char);
    scene.add(mesh);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const label = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthTest: false }));
    label.scale.set(2.4, 0.6, 1);
    label.position.y = 2.15;
    mesh.add(label);
    const halo = new T.Mesh(new T.PlaneGeometry(1.4, 1.4), new T.MeshBasicMaterial({
      map: decalTex, color: C(hostile ? 0xff2f7a : 0x35ffc4), transparent: true, opacity: 0.28,
      blending: T.AdditiveBlending, depthWrite: false }));
    halo.position.y = 0.05; halo.rotation.x = -Math.PI / 2;
    mesh.add(halo);
    gh = MP.ghosts[id] = { mesh: mesh, halo: halo, label: label, cv: cv,
                           alive: true, speed: 0, buf: [], lastPacket: -1,
                           name: (MP.roster.find(p => p.id === id) || {}).name || ('Player ' + id) };
    gh.mesh.position.set(s.x, s.y, s.z);
    mpDrawNameplate(gh, +id);
  }
  /* Stamp each snapshot with local arrival time and keep it. mpUpdateGhosts replays the
     buffer MP_RENDER_DELAY behind now, so it is always interpolating between two real
     positions the player actually occupied. */
  const last = gh.buf[gh.buf.length - 1];
  // A respawn jumps clear across the arena: mark the cut so we never slide through walls.
  const jump = last && Math.hypot(s.x - last.x, s.z - last.z) > MP_TELEPORT;
  gh.buf.push({ t: time, x: s.x, y: s.y, z: s.z, yaw: s.yaw, cut: !!jump });
  gh.mesh.userData.aiming = !!s.a;
  gh.mesh.userData.aimPitch = s.p || 0;
  gh.mesh.userData.crouch = !!s.c;
  gh.lastPacket = time;
  /* Keep a little more than the render delay; drop the rest. The hard length cap matters
     because `time` only advances in the render loop: a backgrounded tab still receives
     packets over the socket while its clock is frozen, so the age test alone never fires
     and the buffer grows without bound. */
  while (gh.buf.length > 2 && gh.buf[1].t < time - (MP_RENDER_DELAY + 0.5)) gh.buf.shift();
  while (gh.buf.length > MP_BUF_MAX) gh.buf.shift();
  if (s.w) setHeldWeapon(gh.mesh, s.w);            // show what they actually swapped to
}
function mpDrawNameplate(gh, id) {
  const x = gh.cv.getContext('2d');
  x.clearRect(0, 0, 256, 64);
  const hostile = mpPvP() && (!mpTeamMode() || mpTeamOf(id) !== mpTeamOf(MP.id));
  x.font = 'bold 30px ui-monospace, Menlo, monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.85)';
  x.strokeText(gh.name, 128, 32);
  x.fillStyle = hostile ? '#ff2f7a' : '#35ffc4';
  x.fillText(gh.name, 128, 32);
  gh.label.material.map.needsUpdate = true;
}
function mpRemoveGhost(id) {
  const gh = MP.ghosts[id];
  if (!gh) return;
  scene.remove(gh.mesh);
  delete MP.ghosts[id];
}
function mpUpdateGhosts(dt) {
  const renderT = time - MP_RENDER_DELAY;
  for (const id in MP.ghosts) {
    const gh = MP.ghosts[id];
    const buf = gh.buf;
    if (buf.length) {
      // find the pair of snapshots bracketing the render time
      let i = buf.length - 1;
      while (i > 0 && buf[i].t > renderT) i--;
      const a = buf[i], b = buf[i + 1];
      if (!b || a.t > renderT) {
        // buffer starved (or still filling): hold the oldest/newest we have, never guess
        gh.mesh.position.set(a.x, a.y, a.z);
        gh.yaw = a.yaw;
        gh.speed = 0;
      } else if (b.cut) {
        gh.mesh.position.set(b.x, b.y, b.z);   // a respawn is a cut, not a slide
        gh.yaw = b.yaw;
        gh.speed = 0;
      } else {
        const span = b.t - a.t;
        const f = span > 0 ? Math.min(1, Math.max(0, (renderT - a.t) / span)) : 1;
        gh.mesh.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
        gh.yaw = a.yaw + ((((b.yaw - a.yaw) % 6.283185307) + 9.42477796) % 6.283185307 - 3.14159265) * f;
        gh.speed = span > 0 ? Math.hypot(b.x - a.x, b.z - a.z) / span : 0;
      }
    }
    gh.mesh.visible = state === 'play' && gh.alive !== false && mpInMatch();
    // the model faces along -Z, and yaw is the camera's, so add PI to face outward
    if (gh.yaw !== undefined) gh.mesh.rotation.y = lerpAngle(gh.mesh.rotation.y, gh.yaw + Math.PI, 1 - Math.pow(0.01, dt));
    animatePlayerModel(gh.mesh, gh.speed || 0, time, dt);
    /* Crouch is rendered as a vertical squash of the whole figure, and castPlayers
       squashes the hitbox by the same CROUCH_SQ — so what you see is exactly what you can
       hit. The feet stay planted because the model's origin is at its feet. */
    gh.crouchF = lerp(gh.crouchF || 0, gh.mesh.userData.crouch ? 1 : 0, 1 - Math.pow(0.0005, dt));
    gh.mesh.scale.y = 1 + (CROUCH_SQ - 1) * gh.crouchF;
    if (gh.label) gh.label.visible = playerCanSee(gh.mesh.position, 1.9);
    if (time - gh.lastPacket > 0.5) gh.speed = 0;   // link went quiet: stop the walk cycle
  }
}
/* Shortest-way-round angle lerp. The plain lerp took the long way whenever a player's yaw
   crossed the +/-PI seam, spinning the model a full turn on the spot. */
function lerpAngle(a, b, t) {
  let d = (b - a) % 6.283185307;
  if (d > 3.14159265) d -= 6.283185307;
  if (d < -3.14159265) d += 6.283185307;
  return a + d * t;
}
/* Broadcast our own position a few times a second — cheap, and enough for
   other clients to render where we are even though the sim isn't shared. */
function mpBroadcastState(dt) {
  if (!MP.connected || !mpInMatch()) return;   // a solo run is nobody else's business
  MP.lastSend += dt;
  if (MP.lastSend < MP_TICK) return;
  MP.lastSend = 0;
  // w = carried weapon, so other clients can render what you are actually holding
  // a = aiming down sights, p = look pitch: without these every remote player carries
  // their weapon at the chest and points it flat, whatever they are actually doing.
  // c = crouched: without it a crouching player still presents a standing hitbox on
  // every other client, so the stance would be a free camera trick rather than a trade.
  mpSend({ t: 'state', s: { x: camera.position.x, y: P.feetY, z: camera.position.z,
                            yaw: P.yaw, w: P.weapon, a: P.ads ? 1 : 0, p: +P.pitch.toFixed(3),
                            c: P.crouchF > 0.5 ? 1 : 0 } });
}

/* ============================================================
   BOTS
   PvP with nobody else connected is an empty map, so every PvP mode can be
   filled with AI opponents. They are simulated by whoever started the match
   (or locally when offline), use the same humanoid model, obey line of sight,
   and are scored exactly like human players.
   ============================================================ */
/* `aim` is the tier's hit chance against a stationary standing player at BOT_RANGE, the
   distance bots actually try to hold. `cone` is that same skill expressed as an aim cone
   in radians — derived below rather than typed in, so the two can never drift apart:
   solve target/(range*cone) = sqrt(aim) for cone. Everything else (distance, your speed,
   your stance, the bot's own sustained fire) then falls out of the geometry in botFire. */
const BOT_RANGE = 14;
const BOT_SKILL = {
  recruit: { name: 'Recruit', aim: 0.30, react: 0.85, rof: 1.7, dmg: 6,  hp: 100, speed: 5.6, view: 46 },
  regular: { name: 'Regular', aim: 0.52, react: 0.55, rof: 1.2, dmg: 8,  hp: 120, speed: 6.6, view: 58 },
  veteran: { name: 'Veteran', aim: 0.72, react: 0.34, rof: 0.85, dmg: 10, hp: 140, speed: 7.4, view: 70 },
  elite:   { name: 'Elite',   aim: 0.88, react: 0.20, rof: 0.62, dmg: 12, hp: 165, speed: 8.2, view: 84 }
};
/* Standing silhouette radius, computed once here rather than through playerTargetRadius()
   because the calibration reference is a STANDING player — crouching is the variable the
   model is meant to reward, so it must not be baked into the constant. */
for (const k in BOT_SKILL) {
  const sk = BOT_SKILL[k];
  const standR = Math.sqrt(2 * HB.bodyR * EYE_STAND / Math.PI);
  sk.cone = standR / (BOT_RANGE * Math.sqrt(sk.aim));
}

/* ---- bot marksmanship ----
   Bots used to resolve a shot with a flat coin flip against skill.aim: identical odds at
   4m and at 40m, whether you were sprinting or standing still, crouched or not — and the
   tracer was decorative scatter drawn near you with no relationship to the result. Now
   they shoot through the same geometry the player does.

   The bot has a cone (its skill, widened by its own sustained fire and by how fast you
   are moving). You are a disc inside it (playerTargetRadius, which shrinks when you
   crouch). The shot lands uniformly in the cone, so P(hit) is the ratio of the areas —
   which means closing distance makes them lethal, backing off makes them miss, and
   crouching behind a crate is worth roughly 30% of their accuracy at range.

   BOT_HIT_FLOOR keeps a distant bot worth taking cover from: pure geometry would have
   an Elite hitting 19% at 30m, and a threat you can safely ignore is not a threat. */
const botFrom = new T.Vector3(), botTo = new T.Vector3(), botDir = new T.Vector3();
function botFire(b, dist) {
  const d = Math.max(1.5, dist);
  const pSpd = Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 13);
  const cone = Math.max(0.004, b.skill.cone * (1 - (b.aimBonus || 0)))
             + (b.bloom || 0) + AI_TRACK_ERR * pSpd * pSpd;
  b.bloom = Math.min((b.bloom || 0) + BOT_BLOOM, BOT_BLOOM_MAX);
  const chance = Math.max(BOT_HIT_FLOOR * b.skill.aim,
                          Math.min(1, Math.pow(playerTargetRadius() / (d * cone), 2)));
  const hit = Math.random() < chance;
  if (hit) {
    MP.recentDamage[b.id] = time;
    hurt(b.skill.dmg * (b.dmgMul || 1) * (diffMul().dmg || 1), b.mesh.position);
  }
  /* Draw the tracer down the line actually rolled — a hit goes through you, a miss goes
     past you by a real offset inside the cone. A tracer that lies about where the round
     went is the reason AI fire reads as unfair even when the numbers are fine. */
  botFrom.copy(b.mesh.position).setY(b.mesh.position.y + 1.35);
  botDir.copy(camera.position).sub(botFrom).normalize();
  if (!hit) scatterDir(botDir, cone * (0.45 + Math.random() * 0.55));
  botTo.copy(botFrom).addScaledVector(botDir, d + 2);
  tracer(botFrom, botTo, C(0xff2f7a), 1);
  sfx.shot();
}
const BOT_NAMES = ['VIPER','ASH','KILO','NOMAD','ECHO','RAVEN','SPUR','JINX','ONYX','CINDER','HALO','DRIFT'];
const BOTS = [];
let botCount = 3, botSkill = 'regular';

/* In team modes a bot belongs to a side, so it starts on that side's line with its own
   team rather than dropped anywhere on the map. `slot`/`of` place it along the line
   alongside the humans; outside team modes this falls straight through to the free-form
   search below. */
function botTeamSpawnPoint(team, slot, of, awayFrom) {
  if (mpTeamMode() && team && team !== 'X') {
    const sp = mpTeamSpawn(team, slot, of);
    if (sp) {
      const surf = floorAt(sp.x, sp.z);
      const theme = MAPS[currentMap];
      // reject the void on Heights; otherwise take it
      if (!(theme.floorY < -5 && surf <= theme.floorY + 1)) return { x: sp.x, z: sp.z, y: surf };
    }
  }
  return botSpawnPoint(awayFrom);
}
function botSpawnPoint(awayFrom) {
  /* The surface has to be resolved BEFORE the wall test. hitsWall() with no feet
     argument treats every blocker as a wall, including walkable roof decks — which on
     Neon Heights rejected every rooftop and left only the gaps between them, so bots
     spawned in the void 46m below the map. Resolve floorAt() first, then test with that
     as the feet height, exactly as the player does. */
  const theme = MAPS[currentMap];
  const isVoid = theme.floorY < -5;          // Heights: falling off the decks is fatal
  /* floorAt() reports the top of ANY walkable blocker, and tower() marks building roofs
     walkable — so a spawn point could legally land 36m up a skyscraper the player can
     never reach. Bound the surface to roughly the height the player drops in at: that
     allows container stacks and roof decks (Heights spawns high by design) while
     rejecting rooftops that are scenery. */
  const baseY = floorAt(theme.spawn[0], theme.spawn[1]);
  const ceilY = baseY + 12;
  let fallback = null;
  for (let i = 0; i < 48; i++) {
    const a = rand(0, 6.283), r = rand(12, CFG.bounds * 0.72);
    const x = clamp(Math.cos(a) * r, -CFG.bounds + 8, CFG.bounds - 8);
    const z = clamp(Math.sin(a) * r, -CFG.bounds + 8, CFG.bounds - 8);
    const surf = floorAt(x, z);
    if (isVoid && surf <= theme.floorY + 1) continue;   // that is open air, not ground
    if (surf > ceilY) continue;                         // scenery rooftop, not playable ground
    if (hitsWall(x, z, 1.2, surf)) continue;
    if (!fallback) fallback = { x: x, z: z, y: surf };
    if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < 22) continue;
    return { x: x, z: z, y: surf };
  }
  // nothing far enough away: a valid close spot still beats dropping into the void
  if (fallback) return fallback;
  const sp = theme.spawn;
  return { x: sp[0], z: sp[1], y: floorAt(sp[0], sp[1]) };
}
function spawnBots(n, skill) {
  clearBots();
  const S = BOT_SKILL[skill] || BOT_SKILL.regular;
  for (let i = 0; i < n; i++) {
    const id = -(i + 1);                                   // negative ids never collide with players
    const team = mpTeamMode() ? (i % 2 === 0 ? 'B' : 'A') : 'X';
    const hostile = !mpTeamMode() || team !== mpTeamOf(MP.id || 1);
    const botChar = CHAR_ORDER[i % CHAR_ORDER.length];
    const botWeapon = BOT_WEAPONS[(Math.random() * BOT_WEAPONS.length) | 0];
    const mesh = buildPlayerModel(hostile ? 0xff2f7a : 0x35ffc4, botChar);
    setHeldWeapon(mesh, botWeapon);
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const label = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthTest: false }));
    label.scale.set(2.4, 0.6, 1); label.position.y = 2.15;
    mesh.add(label);
    scene.add(mesh);
    /* Slot the bot in after the humans already holding this side, so a mixed squad of
       players and bots forms one continuous line instead of overlapping each other. */
    const humansOnTeam = mpTeamMode()
      ? [MP.id || 1].concat(MP.roster.map(r => r.id).filter(x => x !== (MP.id || 1)))
          .filter(x => mpTeamOf(x) === team).length
      : 0;
    const botsOnTeamSoFar = BOTS.filter(x => x.team === team).length;
    const slot = humansOnTeam + botsOnTeamSoFar;
    const sp = botTeamSpawnPoint(team, slot, slot + 1, camera.position);
    mesh.position.set(sp.x, sp.y, sp.z);
    const b = {
      id: id, name: BOT_NAMES[i % BOT_NAMES.length], team: team, skill: S, weapon: botWeapon,
      char: botChar, abilT: 0, abilCool: rand(2, 8), abilId: null,
      dmgMul: 1, rofMul: 1, spdMul: 1, dr: 1, aimBonus: 0,
      mesh: mesh, label: label, cv: cv, hp: S.hp, maxHp: S.hp, alive: true,
      target: null, fireCool: rand(0.4, 1.4), reactT: 0, respawnT: 0,
      wander: new T.Vector3(sp.x, sp.y, sp.z), wanderT: 0, speed: 0, yaw: 0
    };
    BOTS.push(b);
    botNameplate(b);
    if (MP.match) MP.match.scores[id] = 0;
  }
  renderScoreboard();
}
function clearBots() {
  BOTS.forEach(b => scene.remove(b.mesh));
  BOTS.length = 0;
}
function botNameplate(b) {
  const x = b.cv.getContext('2d');
  x.clearRect(0, 0, 256, 64);
  const hostile = !mpTeamMode() || b.team !== mpTeamOf(MP.id || 1);
  x.font = 'bold 28px ui-monospace, Menlo, monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 5; x.strokeStyle = 'rgba(0,0,0,.85)';
  const txt = b.name + '  [' + b.skill.name.slice(0, 3).toUpperCase() + ']';
  x.strokeText(txt, 128, 32);
  x.fillStyle = hostile ? '#ff2f7a' : '#35ffc4';
  x.fillText(txt, 128, 32);
  b.label.material.map.needsUpdate = true;
}
/* Can this bot actually see the player? Reuses the world's wall raycast so
   bots cannot shoot through buildings. */
/* Can the player actually see this point? Nameplates draw with depthTest:false so they
   are not clipped by the wearer's own head, but that also meant they hung in the air
   through solid walls — a free wallhack in PvP. Gate visibility on a real line of sight
   instead. Also fades out past NAMEPLATE_RANGE so the screen isn't a wall of labels. */
const NAMEPLATE_RANGE = 70;
function playerCanSee(pos, eyeOffset) {
  const eye = tmpV2.set(camera.position.x, camera.position.y, camera.position.z);
  tmpV.set(pos.x - eye.x, (pos.y + (eyeOffset || 1.4)) - eye.y, pos.z - eye.z);
  const dist = tmpV.length();
  if (dist > NAMEPLATE_RANGE) return false;
  if (dist < 0.001) return true;
  tmpV.normalize();
  const hit = castWall(eye, tmpV, dist);
  return !hit || wallHit.d >= dist - 0.6;
}


/* ---------- bot operator abilities ----------
   A bot wears an operator's colours, so it should fight like one — otherwise the skin is
   a lie and every bot plays identically. Each bot runs the ability belonging to the
   operator it is dressed as, on that operator's real cooldown from CHARACTERS.

   Only the effects that make sense for an AI are implemented: a bot has no scope, no
   dash input and no deployables, so those operators get the closest equivalent that
   changes how the bot behaves in a fight. Every branch below alters something the player
   can actually observe. */
function botAbilityTick(b, dt, sees, distToPlayer) {
  const c = CHARACTERS[b.char] || CHARACTERS.vanguard;
  const a = c.ability;
  if (b.abilT > 0) {
    b.abilT = Math.max(0, b.abilT - dt);
    if (b.abilT === 0) botAbilityEnd(b);
    return;
  }
  b.abilCool = Math.max(0, b.abilCool - dt);
  // fire it when it would actually matter: in contact, or hurt enough to need it
  const wants = (sees && distToPlayer < b.skill.view * 0.8) || b.hp < b.maxHp * 0.45;
  if (b.abilCool > 0 || !wants) return;
  b.abilCool = a.cd + a.dur;
  b.abilT = a.dur;
  b.abilId = a.id;
  spark(b.mesh.position, a.col, 16, tmpV2.set(0, 2, 0), 5, 0.5, 0.06);
  if (b.mesh.userData.visor) b.mesh.userData.visor.color.copy(C(a.col));
  switch (a.id) {
    case 'breach':    b.dmgMul = 1.25; b.rofMul = 0.65; break;            // faster, harder
    case 'triage':    b.hp = Math.min(b.maxHp, b.hp + 45); break;         // heal
    case 'aegis':     b.dr = 0.45; break;                                 // damage reduction
    case 'overclock': b.spdMul = 1.45; break;                             // speed
    case 'mark':      b.dmgMul = 1.35; break;                             // crit-equivalent
    case 'scan':      b.aimBonus = 0.22; break;                           // sees you better
    case 'phase':     b.spdMul = 1.25; b.dr = 0.75; break;                // hard to pin down
    case 'sentry':    b.rofMul = 0.55; break;                             // sustained output
  }
  botNameplate(b);
}
function botAbilityEnd(b) {
  b.dmgMul = 1; b.rofMul = 1; b.spdMul = 1; b.dr = 1; b.aimBonus = 0;
  b.abilId = null;
  const c = CHARACTERS[b.char] || CHARACTERS.vanguard;
  if (b.mesh.userData.visor) {
    const hostile = !mpTeamMode() || b.team !== mpTeamOf(MP.id || 1);
    b.mesh.userData.visor.color.copy(C(hostile ? 0xff2f7a : 0x35ffc4));
  }
  botNameplate(b);
}

function botHasLOS(b, tx, ty, tz) {
  tmpV.set(tx - b.mesh.position.x, ty - (b.mesh.position.y + 1.4), tz - b.mesh.position.z);
  const dist = tmpV.length();
  if (dist > b.skill.view) return false;
  tmpV.normalize();
  tmpV2.set(b.mesh.position.x, b.mesh.position.y + 1.4, b.mesh.position.z);
  const hit = castWall(tmpV2, tmpV, dist);
  return !hit || wallHit.d >= dist - 0.6;
}
function botDamage(b, dmg, point, crit) {
  if (!b.alive) return;
  b.hp -= dmg * (b.dr || 1);      // Aegis / Phase reduce incoming damage
  spark(point || b.mesh.position, crit ? 0xffffff : 0xff2f7a, crit ? 12 : 7, tmpV2.set(0, 1, 0), 6, 0.3, 0.05);
  hitmarker(!!crit);
  damageNumber(point || b.mesh.position, Math.round(dmg), !!crit);
  crit ? sfx.crit() : sfx.hit();
  if (b.hp <= 0) {
    b.alive = false;
    b.mesh.visible = false;
    b.respawnT = 4;
    spark(b.mesh.position, 0xff2f7a, 26, tmpV2.set(0, 2, 0), 9, 0.6, 0.07);
    sfx.kill();
    const me = MP.id || 1;
    mpKillCredit(me, b.id, []);
    toast(playerName.toUpperCase() + ' ▸ ' + b.name, 0x35ffc4);
    mpCheckWin();
  }
}
/* How long a bot keeps hunting your last known position after losing sight. Long
   enough to come round a corner, short enough that you can genuinely break contact. */
const BOT_HUNT = 7;
function updateBots(dt) {
  if (!BOTS.length) return;
  const matchLive = MP.match && MP.match.active;
  for (let i = 0; i < BOTS.length; i++) {
    const b = BOTS[i];
    if (!b.alive) {
      b.respawnT -= dt;
      if (b.respawnT <= 0 && matchLive) {
        // respawn on your own side, offset a little so a wiped squad does not stack up
        const mates = BOTS.filter(x => x.team === b.team);
        const sp = botTeamSpawnPoint(b.team, Math.max(0, mates.indexOf(b)), Math.max(1, mates.length), camera.position);
        b.mesh.position.set(sp.x, sp.y, sp.z);
        b.hp = b.maxHp; b.alive = true; b.mesh.visible = true;
      }
      continue;
    }
    b.mesh.visible = state === 'play';
    if (!matchLive || state !== 'play') continue;
    // trigger off long enough: the bot's weapon settles, exactly as the player's does
    if (time - (b.lastFire || -9) > BLOOM_HOLD)
      b.bloom = lerp(b.bloom || 0, 0, 1 - Math.pow(BLOOM_DECAY, dt));

    const hostileToMe = !mpTeamMode() || b.team !== mpTeamOf(MP.id || 1);
    const px = camera.position.x, py = camera.position.y, pz = camera.position.z;
    const distToPlayer = Math.hypot(px - b.mesh.position.x, pz - b.mesh.position.z);
    const sees = hostileToMe && !P.respawning && !ABIL.on('phase') && botHasLOS(b, px, py - 0.4, pz);
    if (sees) b.seenT = time;                      // remembered, and hunted on afterwards
    // operator ability: the skin it wears determines how it fights. Ticked AFTER the
    // line-of-sight test so it can fire on contact, not only when already hurt.
    botAbilityTick(b, dt, sees, distToPlayer);

    let tx, tz;
    if (sees) {
      b.reactT += dt;
      // close to a preferred range rather than walking into your face
      const want = 14;
      const dir = distToPlayer > want + 4 ? 1 : distToPlayer < want - 5 ? -1 : 0;
      const ang = Math.atan2(px - b.mesh.position.x, pz - b.mesh.position.z);
      // elevation to your chest, so a bot on a rooftop actually points its weapon down
      b.aimPitch = Math.atan2((py - 0.4) - (b.mesh.position.y + 1.45), Math.max(0.5, distToPlayer));
      const strafe = Math.sin(time * 1.3 + i) * 0.7;
      tx = b.mesh.position.x + (Math.sin(ang) * dir + Math.cos(ang) * strafe) * b.skill.speed * (b.spdMul || 1) * dt;
      tz = b.mesh.position.z + (Math.cos(ang) * dir - Math.sin(ang) * strafe) * b.skill.speed * (b.spdMul || 1) * dt;
      b.yaw = ang;
      // fire once reaction time has elapsed
      b.fireCool -= dt;
      if (b.reactT > b.skill.react && b.fireCool <= 0) {
        b.fireCool = b.skill.rof * (b.rofMul || 1) * rand(0.8, 1.25);
        b.lastFire = time;                  // radar gunfire ping
        botFire(b, distToPlayer);
      }
    } else {
      b.reactT = 0;
      /* Lost sight of you. Rather than resume wandering — which is what made bots feel
         blind — hunt along the navigation field for a while: it walks them round the
         cover you broke line behind, so breaking line buys you a few seconds, not the
         rest of the round. They give up after BOT_HUNT seconds and go back to roaming. */
      const hunting = hostileToMe && b.seenT !== undefined && time - b.seenT < BOT_HUNT;
      const dir = hunting && typeof navDir === 'function'
        ? navDir(b.mesh.position.x, b.mesh.position.z) : null;
      if (dir) {
        const sp = b.skill.speed * 0.85 * (b.spdMul || 1);
        tx = b.mesh.position.x + dir.x * sp * dt;
        tz = b.mesh.position.z + dir.z * sp * dt;
        b.yaw = Math.atan2(dir.x, dir.z);
        b.wanderT = 0;                            // re-pick a roam target when the hunt ends
      } else {
        b.wanderT -= dt;
        if (b.wanderT <= 0) {
          const sp = botSpawnPoint(null);
          b.wander.set(sp.x, sp.y, sp.z);
          b.wanderT = rand(3, 7);
        }
        const ang = Math.atan2(b.wander.x - b.mesh.position.x, b.wander.z - b.mesh.position.z);
        tx = b.mesh.position.x + Math.sin(ang) * b.skill.speed * 0.6 * dt;
        tz = b.mesh.position.z + Math.cos(ang) * b.skill.speed * 0.6 * dt;
        b.yaw = ang;
      }
    }
    // collide with the world exactly like the player does
    const feet = b.mesh.position.y;
    /* Bots have no jump or fall, they snap to floorAt() — so on a map with a real drop
       (Neon Heights) walking off a catwalk teleports them into the void. Treat any step
       down of more than BOT_LEDGE as a wall: they path around the edge instead. */
    const BOT_LEDGE = 2.0;
    const stepOk = (nx, nz) => {
      if (hitsWall(nx, nz, 0.7, feet)) return false;
      return floorAt(nx, nz) >= feet - BOT_LEDGE;
    };
    if (stepOk(tx, b.mesh.position.z)) b.mesh.position.x = tx;
    if (stepOk(b.mesh.position.x, tz)) b.mesh.position.z = tz;
    /* Same unstick the player gets (06-player.js). Bots never had one: anything that
       left one overlapping a solid — a spawn against cover, a destroyed barrel, walking
       into a corner the ledge guard would not let it leave — pinned it there for the
       rest of the round. Now they hunt rather than roam, they meet those corners far
       more often. */
    unstick(b.mesh.position, 0.7, feet);
    b.mesh.position.x = clamp(b.mesh.position.x, -CFG.bounds, CFG.bounds);
    b.mesh.position.z = clamp(b.mesh.position.z, -CFG.bounds, CFG.bounds);
    b.mesh.position.y = floorAt(b.mesh.position.x, b.mesh.position.z);
    b.speed = b.skill.speed * (sees ? 1 : 0.6);
    /* +PI because the model faces -Z while b.yaw is an atan2(dx,dz) heading. Without it
       bots sprint at you backwards, which is what made their weapons look reversed.
       mpApplyGhost already applied the same correction. */
    b.mesh.rotation.y = b.yaw + Math.PI;
    // a bot with eyes on you brings the weapon up; otherwise it carries it at the chest
    b.mesh.userData.aiming = !!sees;
    b.mesh.userData.aimPitch = b.aimPitch || 0;
    animatePlayerModel(b.mesh, b.speed, time, dt);
    // no nameplate through walls — it is the model that gives a target away, not the label
    if (b.label) b.label.visible = playerCanSee(b.mesh.position, 1.9);
  }
}
/* ---------- locational damage ----------
   A single sphere with a "head or not" flag threw away most of the figure. The model is
   1.85m with real proportions (see buildPlayerModel), so the same maths that places the
   geometry can classify a hit against it.

   Zones, measured from the feet:
     head      > 1.46   x2.6   — small and hard to hit, so it pays properly
     arms      lateral > 0.26  x0.80  — off the centre line at torso height
     chest     > 1.05   x1.00  — the reference: baseline damage
     abdomen   > 0.82   x0.90
     legs      else     x0.70  — the easiest part of a running target to hit

   Values are deliberately a spread rather than head-vs-everything: it rewards aiming up
   without making a leg hit feel like it did nothing. */
const BODY_ZONES = {
  head:    { mult: 2.60, label: 'HEADSHOT' },
  chest:   { mult: 1.00, label: '' },
  abdomen: { mult: 0.90, label: '' },
  arm:     { mult: 0.80, label: 'ARM' },
  legs:    { mult: 0.70, label: 'LEG' }
};
function bodyZone(relY, lateral) {
  if (relY > 1.46) return 'head';
  if (relY > 0.95 && lateral > 0.26) return 'arm';
  if (relY > 1.05) return 'chest';
  if (relY > 0.82) return 'abdomen';
  return 'legs';
}
/* Classify a hit on a figure standing at `basePos`, struck at `hitPt`. */
function classifyHit(basePos, hitPt, sq) {
  // undo the crouch squash before testing zones, so a crouching player's head is still
  // their head and not "chest height" for a shot that landed on it
  const relY = (hitPt.y - basePos.y) / (sq || 1);
  const lateral = Math.hypot(hitPt.x - basePos.x, hitPt.z - basePos.z);
  const zone = bodyZone(relY, lateral);
  return { zone: zone, mult: BODY_ZONES[zone].mult, head: zone === 'head' };
}

/* Bots are valid hitscan targets, same sphere test as players. */
function castBots(o, d, maxD) {
  let best = null, bestT = maxD;
  for (let i = 0; i < BOTS.length; i++) {
    const b = BOTS[i];
    if (!b.alive) continue;
    if (mpTeamMode() && b.team === mpTeamOf(MP.id || 1)) continue;
    const p = b.mesh.position;
    const cap = castHumanoid(o, d, p.x, p.y, p.z, bestT);
    if (!cap) continue;
    const t = cap.t;
    const hp = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    const z = classifyHit(p, hp);
    bestT = t; best = { t: t, b: b, head: z.head, zone: z.zone, mult: z.mult };
  }
  return best;
}

/* ---- UI ---- */
function renderMpRoster() {
  const host = $('mpRoster');
  if (!host) return;
  host.innerHTML = '';
  const me = document.createElement('div');
  me.className = 'mpRow me';
  me.innerHTML = '<b>' + playerName + '</b><span>you</span>';
  host.appendChild(me);
  MP.roster.forEach(p => {
    if (p.id === MP.id) return;
    const d = document.createElement('div');
    d.className = 'mpRow';
    d.innerHTML = '<b>' + p.name + '</b><span>connected</span>';
    host.appendChild(d);
  });
  $('mpCount').textContent = (MP.roster.length ? MP.roster.length : 1) + (MP.roster.length === 1 ? ' player' : ' players');
  renderMpModes();
}
/* Total combatants = connected humans (at least you) + bots you have configured.
   This is what the mode minimums are checked against, so a solo player with bots
   can start a real match with no server running at all. */
function mpCombatants() { return Math.max(MP.roster.length, 1) + botCount; }

function renderMpModes() {
  const host = $('mpModes');
  if (!host) return;
  const count = mpCombatants();
  host.innerHTML = '';
  Object.keys(MP_MODES).forEach(k => {
    const m = MP_MODES[k];
    const fits = count >= m.min && count <= m.max;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mpMode' + (MP.mode === k ? ' sel' : '') + (fits ? '' : ' unavail');
    const req = m.min === m.max ? m.min + ' combatants' : m.min + '+ combatants';
    const made = botCount ? count + ' (you + ' + botCount + ' bot' + (botCount === 1 ? '' : 's')
                            + (MP.roster.length > 1 ? ' + ' + (MP.roster.length - 1) + ' online' : '') + ')'
                          : count + ' connected';
    b.innerHTML = '<span class="mpTag">' + m.tag + '</span><b>' + m.name + '</b>'
      + '<span>' + m.sub + '</span>'
      + '<span class="mpReq' + (fits ? ' ok' : '') + '">'
      + (fits ? 'Ready · ' + made : 'Needs ' + req + ' · ' + made) + '</span>';
    b.addEventListener('click', () => { MP.mode = k; renderMpModes(); menuBlip(); });
    host.appendChild(b);
  });
  const m = MP_MODES[MP.mode];
  const fits = count >= m.min && count <= m.max;
  const btn = $('mpStart');
  btn.disabled = !fits;
  btn.textContent = !fits
    ? (MP.mode === 'duel' && count > 2 ? 'Duel is 2 combatants — reduce bots'
       : 'Add bots or wait for players…')
    : 'Start ' + m.name + (botCount ? ' vs ' + botCount + ' bot' + (botCount === 1 ? '' : 's') : '');
}

/* ---------- PvP arena pickups ----------
   Weapon crates used to be spawned only by startWave(), which is disabled during a
   match — so a deathmatch had no drops at all and everyone fought their spawn loadout
   forever. Arena pickups run on their own cycle instead: spawned away from every
   living combatant (so nobody camps their own spawn on top of one), capped so the
   floor never turns into a yard sale, and the whole arsenal is in the pool because
   PvP ignores what you have bought. Taking one still requires the T prompt. */
const PVP_DROP_EVERY = 22;      // seconds between spawns
const PVP_DROP_CAP = 4;         // live crates at once
const PVP_HEALTH_EVERY = 16;
let pvpDropT = 8, pvpHealthT = 10;

function pvpArenaSpot(minAway) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.283, r = rand(CFG.bounds * 0.18, CFG.bounds * 0.72);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > CFG.bounds - 6 || Math.abs(z) > CFG.bounds - 6) continue;
    const surf = floorAt(x, z);
    if (hitsWall(x, z, 1.6, surf)) continue;
    if (Math.hypot(x - camera.position.x, z - camera.position.z) < minAway) continue;
    let tooClose = false;
    for (let b = 0; b < BOTS.length; b++) {
      if (!BOTS[b].alive) continue;
      if (Math.hypot(x - BOTS[b].mesh.position.x, z - BOTS[b].mesh.position.z) < minAway) { tooClose = true; break; }
    }
    if (tooClose) continue;
    for (const id in MP.ghosts) {
      const gh = MP.ghosts[id];
      if (!gh.alive) continue;
      if (Math.hypot(x - gh.mesh.position.x, z - gh.mesh.position.z) < minAway) { tooClose = true; break; }
    }
    if (tooClose) continue;
    return tmpV.set(x, surf + 1, z);
  }
  return null;
}

function updatePvpDrops(dt) {
  if (!mpInMatch() || state !== 'play') return;
  pvpDropT -= dt;
  pvpHealthT -= dt;

  if (pvpDropT <= 0) {
    pvpDropT = PVP_DROP_EVERY;
    const live = pickups.filter(p => PU[p.kind] && PU[p.kind].cat === 'weapon').length;
    if (live < PVP_DROP_CAP) {
      // whole arsenal minus what you are already carrying, so a drop is always a choice
      const pool = GUN_ORDER.filter(k => k !== 'pulse' && P.slots.indexOf(k) < 0);
      const spot = pvpArenaSpot(14);
      if (pool.length && spot) {
        const kind = pool[(Math.random() * pool.length) | 0];
        dropPickup(spot, kind);
        toast('WEAPON DROP · ' + GUNS[kind].name.toUpperCase(), GUNS[kind].tint);
        sfx.ping();
      }
    }
  }

  if (pvpHealthT <= 0) {
    pvpHealthT = PVP_HEALTH_EVERY;
    const liveHp = pickups.filter(p => p.kind === 'hp' || p.kind === 'ammo').length;
    if (liveHp < 3) {
      const spot = pvpArenaSpot(10);
      if (spot) dropPickup(spot, Math.random() < 0.6 ? 'hp' : 'ammo');
    }
  }
}
function resetPvpDrops() { pvpDropT = 8; pvpHealthT = 10; }

/* Arena picker. Every drop zone is available here regardless of what has been bought —
   PvE progression decides what you grind toward, not which map a group is allowed to
   fight on. Symmetric arenas are flagged so TDM players can find them quickly. */
function renderMpMaps() {
  const host = $('mpMaps');
  if (!host) return;
  // Offline (or hosting) you choose freely; connected as a joiner the host decides.
  const locked = MP.connected && !mpIsHostMachine();
  host.innerHTML = '';
  Object.keys(MAPS).forEach(k => {
    const m = MAPS[k];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = k === currentMap ? 'on' : '';
    const sym = (m.tags || []).indexOf('Symmetric') >= 0;
    b.innerHTML = m.name + (sym ? ' <em class="symTag">SYM</em>' : '');
    b.title = m.blurb;
    b.addEventListener('click', () => { setMap(k); renderMpMaps(); menuBlip(); mpAnnounceArena(); });
    b.disabled = locked;
    if (locked) b.title = 'The host picks the arena for everyone in the match.';
    host.appendChild(b);
  });
  const hint = $('mpArenaHint');
  if (hint) hint.textContent = locked ? 'the host picks the arena' : 'every map is playable in multiplayer';
}
/* Keep every lobby showing the arena that the match will actually use. Only the host
   machine announces, so two people cannot fight over the picker; joiners' pickers are
   read-only for the same reason (their pick would be overridden at the whistle anyway). */
function mpAnnounceName() {
  if (!MP.connected) return;
  mpSend({ t: 'event', e: { k: 'name', name: playerName, char: typeof character !== 'undefined' ? character : null } });
}
function mpAnnounceArena() {
  if (MP.connected && mpIsHostMachine()) mpSend({ t: 'event', e: { k: 'arena', map: currentMap } });
}

/* Bot controls: count and skill. Offline these are the whole opposition; online they
   top a match up to a playable size. */
function renderBotControls() {
  const cHost = $('mpBotCount'), sHost = $('mpBotSkill');
  if (!cHost || !sHost) return;
  // Bots ship with the match, so only whoever hosts it gets to set them (see mpStartMatch).
  const locked = MP.connected && !mpIsHostMachine();
  cHost.innerHTML = '';
  [0, 1, 2, 3, 5, 7].forEach(n => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = n === 0 ? 'None' : String(n);
    b.className = n === botCount ? 'on' : '';
    b.disabled = locked;
    if (locked) b.title = 'The host sets the bots for everyone in the match.';
    b.addEventListener('click', () => { botCount = n; renderBotControls(); renderMpModes(); menuBlip(); });
    cHost.appendChild(b);
  });
  sHost.innerHTML = '';
  Object.keys(BOT_SKILL).forEach(k => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = BOT_SKILL[k].name;
    b.className = k === botSkill ? 'on' : '';
    b.disabled = locked || botCount === 0;
    b.addEventListener('click', () => { botSkill = k; renderBotControls(); menuBlip(); });
    sHost.appendChild(b);
  });
}

function renderScoreboard() {
  const host = $('sbRows');
  if (!host) return;
  const box = $('scoreboard');
  const live = mpInMatch();
  box.style.display = live ? 'block' : 'none';
  box.classList.toggle('full', !!MP.sbFull);
  if (!live) return;
  $('sbTitle').textContent = MP_MODES[MP.mode].name + ' · to ' + MP.match.limit;
  const me = MP.id || 1;
  const ids = [me].concat(MP.roster.map(r => r.id).filter(i => i !== me));
  const rows = ids.map(id => ({ id: id, name: mpName(id), score: (MP.match.scores || {})[id] || 0 }));
  /* Bots hold negative ids and score into the same map, so they belong on the board —
     without this a bot match shows only your own row. */
  /* Carry the bot's REAL team. mpTeamOf() derives a team from id parity, which is right
     for humans (teams are assigned by join order) but wrong for bots — spawnBots() assigns
     b.team explicitly. Using mpTeamOf here made the board disagree with who actually shoots
     whom. */
  BOTS.forEach(b => rows.push({ id: b.id, name: b.name, score: (MP.match.scores || {})[b.id] || 0, bot: true, team: b.team }));
  rows.sort((a, b) => b.score - a.score);
  host.innerHTML = '';
  /* Compact mode shows only the leader and you; TAB expands the rest. Everyone is
     rendered either way and .rest is hidden by CSS, so expanding costs no rebuild. */
  const meIdx = rows.findIndex(r => r.id === me);
  rows.forEach((r, i) => {
    const d = document.createElement('div');
    const key = (i === 0 || i === meIdx) ? '' : ' rest';
    d.className = 'sbRow' + (r.id === me ? ' me' : '') + key;
    const tm = r.team || mpTeamOf(r.id);
    const team = mpTeamMode() ? '<i class="sbTeam ' + (tm === 'A' ? 'a' : 'b') + '">' + tm + '</i>' : '';
    d.innerHTML = team + '<b>' + r.name + (r.bot ? ' <em class="sbBot">BOT</em>' : '') + '</b><span>' + r.score + '</span>';
    host.appendChild(d);
  });
  const hidden = rows.length - new Set([0, meIdx < 0 ? 0 : meIdx]).size;
  if (hidden > 0) {
    const more = document.createElement('div');
    more.className = 'sbMore';
    more.textContent = 'Hold TAB for all ' + rows.length;
    host.appendChild(more);
  }}
$('mpResultBtn') && $('mpResultBtn').addEventListener('click', () => { menuBlip(); mpReturnToLobby(); });
$('mpStart') && $('mpStart').addEventListener('click', () => {
  const m = MP_MODES[MP.mode], count = mpCombatants();
  if (count < m.min || count > m.max) return;
  mpStartMatch(MP.mode, parseInt($('mpLimit').value, 10) || 10);
});

function mpBuildScreen() {
  /* Bots and the mode picker come FIRST and unconditionally. Everything below this can
     bail early (no fetch, no WebSocket, opened as a file://), and offline bot play must
     survive every one of those paths — it needs no server at all. */
  renderBotControls();
  renderMpMaps();
  renderMpModes();
  const addrBox = $('mpAddr');
  if (mpIsHostMachine()) {
    $('mpRole').textContent = 'You are hosting';
    $('mpRoleSub').textContent = 'Share the address below with anyone on the same wifi.';
    if (typeof fetch !== 'function') { addrBox.textContent = 'Could not check the server address in this browser — see the terminal running server.js instead.'; return; }
    fetch(location.origin + '/net-info').then(r => r.json()).then(info => {
      addrBox.innerHTML = '';
      const ips = info.ips && info.ips.length ? info.ips : null;
      if (!ips) { addrBox.textContent = 'Could not auto-detect your network address — check the server terminal for it.'; return; }
      ips.forEach(ip => {
        const url = 'http://' + ip + ':' + info.port;
        const row = document.createElement('div');
        row.className = 'mpAddrRow';
        row.innerHTML = '<code>' + url + '</code>';
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'ghost sm'; btn.textContent = 'Copy';
        btn.addEventListener('click', () => {
          navigator.clipboard && navigator.clipboard.writeText(url).then(() => { btn.textContent = 'Copied'; setTimeout(() => btn.textContent = 'Copy', 1200); });
        });
        row.appendChild(btn);
        addrBox.appendChild(row);
      });
    }).catch(() => { addrBox.textContent = 'Could not reach the server for its address (is server.js running?).'; });
  } else {
    $('mpRole').textContent = 'Joined via ' + location.origin;
    $('mpRoleSub').textContent = 'You connected using an address someone shared with you.';
    addrBox.innerHTML = '<div class="mpAddrRow"><code>' + location.origin + '</code></div>';
  }
  if (!mpSupported) { mpSetStatus('No WebSocket support — you can still play bots offline.', 'off'); return; }
  if (!location.host) { mpSetStatus('Opened as a local file — you can still play bots offline. For LAN play, run `node server.js`.', 'off'); return; }
  mpConnect();
  renderMpRoster();
  renderMpModes();
}
$('mpConnect') && $('mpConnect').addEventListener('click', () => { if (MP.connected) mpDisconnect(); else mpConnect(); });

/* ---------- armoury ---------- */
function creditLine() {
  $('credBal').textContent = PROFILE.credits.toLocaleString();
  $('lvlBal').textContent = PROFILE.level;
  const need = xpForLevel(PROFILE.level);
  $('xpFill').style.transform = 'scaleX(' + clamp(PROFILE.xp / need, 0, 1) + ')';
  $('xpText').textContent = PROFILE.xp.toLocaleString() + ' / ' + need.toLocaleString() + ' XP';
  const r = $('railCred'); if (r) r.textContent = PROFILE.credits.toLocaleString() + ' cr · lv ' + PROFILE.level;
}
function buy(id, cost) {
  if (owned(id) || PROFILE.credits < cost) return false;
  PROFILE.credits -= cost;
  PROFILE.unlocks[id] = 1;
  saveProfile();
  return true;
}
/* ---------- Armoury: tabbed card storefront ----------
   One pane at a time so the screen is scannable, with every entry rendered as an
   .itemCard (same primitive Deploy uses). shopCard/upgradeCard build the individual
   cards; buildShop owns the tab bar and which pane is on. */
let shopTab = 'Weapons';
const SHOP_TABS = ['Weapons', 'Loadouts', 'Optics', 'Field kit', 'Drop zones', 'Upgrades', 'Contracts'];

/* One purchasable catalogue entry. */
function shopCard(it) {
  const have = owned(it.id);
  const gated = PROFILE.level < it.lvl;
  const afford = PROFILE.credits >= it.cost;
  const b = document.createElement('button');
  b.className = 'itemCard' + (have ? ' have' : gated ? ' locked' : afford ? '' : ' poor');
  b.type = 'button';
  b.disabled = have || gated;
  const g = it.id.indexOf('wep_') === 0 ? GUNS[it.id.slice(4)] : null;
  const kicker = g ? g.cls + (g.optic ? ' · ' + SCOPES[g.optic].name : '') : it.cat;
  b.innerHTML = (g ? '<canvas class="wIcon"></canvas>' : '')
    + '<div class="kicker">' + kicker + '</div>'
    + '<h4>' + it.name + '</h4>'
    + '<div class="desc">' + it.desc + '</div>'
    + '<div class="foot"><span>' + (gated ? 'Clearance ' + it.lvl : '') + '</span>'
    + '<span class="price">' + (have ? 'OWNED' : gated ? 'LEVEL ' + it.lvl : it.cost.toLocaleString() + ' cr') + '</span></div>';
  // icons draw after layout so the canvas has a measured size
  if (g) requestAnimationFrame(() => drawWeaponIcon(b.querySelector('.wIcon'), it.id.slice(4)));
  b.addEventListener('click', () => {
    if (buy(it.id, it.cost)) {
      sfx.power && AC && sfx.power();
      buildShop(); buildUpgrades(); creditLine();
      buildMapPicker(); buildPerks(); buildLoadout();
    } else { tone(200, 140, 0.12, 'square', 0.09); }
  });
  return b;
}

/* One permanent upgrade track, with its level pips. */
function upgradeCard(k) {
  const u = UPGRADES[k];
  const lvl = PROFILE.upgrades[k] || 0;
  const maxed = lvl >= u.max;
  const gated = PROFILE.level < (u.lvl || 1);
  const cost = u.cost(lvl);
  const b = document.createElement('button');
  b.className = 'itemCard' + (maxed ? ' have' : gated ? ' locked' : PROFILE.credits >= cost ? '' : ' poor');
  b.type = 'button';
  b.disabled = maxed || gated;
  const pips = Array.from({ length: u.max }, (_, i) => '<i class="' + (i < lvl ? 'on' : '') + '"></i>').join('');
  b.innerHTML = '<div class="kicker">Permanent upgrade</div>'
    + '<h4>' + u.name + '</h4>'
    + '<div class="pips">' + pips + '</div>'
    + '<div class="desc">' + (maxed ? 'Fully upgraded' : u.desc(lvl + 1)) + '</div>'
    + '<div class="foot"><span>' + lvl + ' / ' + u.max + '</span>'
    + '<span class="price">' + (maxed ? 'MAX' : gated ? 'LEVEL ' + u.lvl : cost.toLocaleString() + ' cr') + '</span></div>';
  b.addEventListener('click', () => {
    if (gated) { tone(200, 140, 0.12, 'square', 0.09); return; }
    if (!maxed && PROFILE.credits >= cost) {
      PROFILE.credits -= cost;
      PROFILE.upgrades[k]++;
      saveProfile();
      sfx.power && AC && sfx.power();
      buildUpgrades(); buildShop(); creditLine();
    } else { tone(200, 140, 0.12, 'square', 0.09); }
  });
  return b;
}

function buildShop() {
  const tabHost = $('shopTabs');
  const shopHost = $('shopList');
  const upHost = $('upgradeList');
  const conHost = $('contractList');
  if (!tabHost || !shopHost) return;

  tabHost.innerHTML = '';
  SHOP_TABS.forEach(name => {
    const t = document.createElement('button');
    t.type = 'button';
    t.textContent = name;
    t.className = name === shopTab ? 'on' : '';
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', name === shopTab ? 'true' : 'false');
    t.addEventListener('click', () => { shopTab = name; buildShop(); buildUpgrades(); buildContracts(); menuBlip(); });
    tabHost.appendChild(t);
  });

  // only the selected pane is in the document flow
  const showCat = SHOP_TABS.indexOf(shopTab) < 5;   // first five tabs are SHOP categories
  shopHost.style.display = showCat ? 'grid' : 'none';
  upHost.style.display = shopTab === 'Upgrades' ? 'grid' : 'none';
  conHost.style.display = shopTab === 'Contracts' ? 'grid' : 'none';

  shopHost.innerHTML = '';
  if (showCat) SHOP.filter(it => it.cat === shopTab).forEach(it => shopHost.appendChild(shopCard(it)));
}
function buildUpgrades() {
  const host = $('upgradeList');
  if (!host) return;
  host.innerHTML = '';
  Object.keys(UPGRADES).forEach(k => host.appendChild(upgradeCard(k)));
}
function buildContracts() {
  const host = $('contractList');
  if (!host) return;
  host.innerHTML = '';
  const list = PROFILE.contracts || [];
  if (!list.length) {
    const d = document.createElement('div');
    d.className = 'itemCard';
    d.innerHTML = '<div class="kicker">Daily contracts</div><h4>None issued</h4>'
      + '<div class="desc">Contracts refresh once a day. Start a run to draw a new set.</div>';
    host.appendChild(d);
    return;
  }
  list.forEach(c => {
    const d = document.createElement('div');
    d.className = 'itemCard contract' + (c.done ? ' have' : '');
    d.innerHTML = '<div class="kicker">Daily contract</div>'
      + '<h4>' + c.t + '</h4>'
      + '<div class="desc">' + (c.done ? 'Complete' : 'Reward ' + c.reward + ' credits') + '</div>'
      + '<div class="foot"><span>' + (c.done ? 'Claimed' : 'Active') + '</span>'
      + '<span class="price">' + (c.done ? '✓' : c.reward + ' cr') + '</span></div>';
    host.appendChild(d);
  });
}
function refreshArmoury() { buildShop(); buildUpgrades(); buildContracts(); creditLine(); }

function buildDifficulties() {
  const list = $('diffList');
  list.innerHTML = '';
  Object.keys(DIFFICULTY).forEach(k => {
    const d = DIFFICULTY[k];
    const b = document.createElement('button');
    b.className = 'diffBtn itemCard' + (k === difficulty ? ' sel' : '');
    b.type = 'button';
    b.dataset.diff = k;
    const locked = PROFILE.level < d.lvl;
    b.disabled = locked;
    if (locked) b.classList.add('locked');
    b.innerHTML = '<div class="kicker">Difficulty</div><h4>' + d.name + '</h4>'
      + '<div class="desc">' + DIFF_BLURBS[k] + '</div>'
      + '<div class="foot"><span></span><span class="price">'
      + (locked ? 'LEVEL ' + d.lvl : signedPct(d.pay) + ' cr') + '</span></div>';
    b.addEventListener('click', () => {
      if (PROFILE.level < d.lvl) return;
      difficulty = k;
      PROFILE.settings.difficulty = k; saveProfile();
      document.querySelectorAll('.diffBtn').forEach(p => p.classList.toggle('sel', p.dataset.diff === k));
      $('homeDiff').textContent = d.name;
      menuBlip();
    });
    list.appendChild(b);
  });
  $('homeDiff').textContent = DIFFICULTY[difficulty].name;
}
/* PvP is a level playing field on purpose.
   In PvE your credits buying +60 integrity and +60% magazines is progression. In a
   deathmatch it is pay-to-win: whoever has ground more credits simply wins, and a new
   player cannot close that gap with skill. So inside a PvP match the permanent Armoury
   upgrades are neutralised, and every weapon is issued for free (see mpArsenal below).
   Operators and perks stay — those are sidegrades chosen per-run, not bought advantage. */
function mpCompetitive() { return mpInMatch(); }
function applyPerk() {
  const comp = mpCompetitive();
  const U = comp ? { integrity: 0, reserve: 0, dash: 0, payout: 0 } : PROFILE.upgrades;
  P.maxHp = 100 + U.integrity * 15;
  /* Multiplicative, not linear: at the deepened cap a linear -12%/level would make the
     cooldown negative. Each level shaves 6% off what is left. */
  P.dashMax = 2.6 * Math.pow(0.94, U.dash);
  P.magMul = 1 + U.reserve * 0.15;
  P.speedMul = 1; P.reloadMul = 1; P.lootMul = 1;
  if (perk === 'scavenger') { P.lootMul = 1.9; grantMod(null); }
  if (perk === 'gunslinger') { P.reloadMul = 0.65; grantWeapon('scatter'); switchWeapon('pulse'); }
  if (perk === 'bulwark') { P.maxHp += 40; P.shield = 40; }
  if (perk === 'phantom') { P.dashMax *= 0.5; P.speedMul = 1.15; }
  P.hp = P.maxHp;
  P.mag = magSize(P.weapon);
  P.ammo = P.mag;
  buildPips(); syncHUD.lastAmmo = -1;
}

/* ---- bestiary, drawn from the same silhouettes used in game ---- */
const BEASTS = [
  { k: 'seeker', n: 'Seeker', c: '#ff2f7a', d: 'Rushes, then stops and flares white before diving. Dash through the tell or shoot the core while it hangs.' },
  { k: 'gunner', n: 'Gunner', c: '#a46bff', d: 'Keeps its distance and lobs slow plasma. Strafe once and it misses; close the gap and it panics.' },
  { k: 'brute', n: 'Brute', c: '#ffb347', d: 'Slow, heavily armoured, hits like a truck. Rail Lance to the core, or lead it past a drum.' },
  { k: 'warden', n: 'Warden', c: '#ff2f7a', d: 'Wave 5 boss, and every fifth wave after. Three orbiting cores must break before the hull is vulnerable. Watch for the rise-and-slam.' },
  { k: 'sovereign', n: 'Sovereign', c: '#a46bff', d: 'Wave 10 boss, and a different machine from the Warden — a tall obelisk spine standing in a crown of five shards, each carrying a core. A far heavier hull, and a second phase: below half health it overdrives into faster volleys, a five-wide fan, and calls in escorts. Clear it and extract for the deep-run bonus.' }
];
function beastIcon(cv, kind, col) {
  const x = cv.getContext('2d'), S = cv.width, c = S / 2;
  x.clearRect(0, 0, S, S);
  x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1.8;
  x.globalAlpha = .15; x.beginPath(); x.arc(c, c, S * .42, 0, 6.283); x.fill();
  x.globalAlpha = 1;
  if (kind === 'seeker') {                       // dart: nose, delta wings, burners
    x.beginPath(); x.moveTo(c, c - 19); x.lineTo(c + 4, c + 4); x.lineTo(c - 4, c + 4); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(c - 4, c - 2); x.lineTo(c - 17, c + 11); x.lineTo(c - 4, c + 8); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(c + 4, c - 2); x.lineTo(c + 17, c + 11); x.lineTo(c + 4, c + 8); x.closePath(); x.stroke();
    x.fillRect(c - 6, c + 4, 3, 6); x.fillRect(c + 3, c + 4, 3, 6);
  } else if (kind === 'gunner') {                // platform: hex hull, drum, barrel
    x.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * 1.047; const px = c + Math.cos(a) * 16, py = c + 4 + Math.sin(a) * 8; i ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.closePath(); x.stroke();
    x.strokeRect(c - 6, c - 8, 12, 8);
    x.beginPath(); x.moveTo(c, c - 8); x.lineTo(c, c - 19); x.lineWidth = 3; x.stroke(); x.lineWidth = 1.8;
    x.beginPath(); x.arc(c, c - 19, 2.6, 0, 6.283); x.fill();
    x.fillRect(c - 15, c + 11, 4, 3); x.fillRect(c + 11, c + 11, 4, 3);
  } else if (kind === 'brute') {                 // frame: pauldrons, torso, skirt
    x.strokeRect(c - 8, c - 10, 16, 15);
    x.strokeRect(c - 17, c - 8, 8, 12); x.strokeRect(c + 9, c - 8, 8, 12);
    x.beginPath(); x.moveTo(c - 11, c + 5); x.lineTo(c + 11, c + 5); x.lineTo(c + 8, c + 14); x.lineTo(c - 8, c + 14); x.closePath(); x.stroke();
    x.fillRect(c - 6, c - 7, 12, 3);
  } else if (kind === 'sovereign') {             // obelisk spine, spire, crown of shards
    /* Drawn to match the chassis, not the Warden's: tall and narrow where that one is
       wide and squat, because the silhouette is the thing that has to tell them apart. */
    x.beginPath(); x.moveTo(c - 5, c - 6); x.lineTo(c + 5, c - 6); x.lineTo(c + 6, c + 9); x.lineTo(c - 6, c + 9); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(c, c - 21); x.lineTo(c + 5, c - 6); x.lineTo(c - 5, c - 6); x.closePath(); x.stroke();   // spire
    x.beginPath(); x.moveTo(c - 6, c + 9); x.lineTo(c + 6, c + 9); x.lineTo(c, c + 20); x.closePath(); x.stroke();   // keystone
    x.fillRect(c - 1.4, c - 4, 2.8, 9);                                                      // vertical eye slit
    // crown shards, each topped by a core — five of them, standing rather than on booms
    for (let i = 0; i < 5; i++) {
      const sx = c + (i - 2) * 8.4, base = c + 6 - Math.abs(i - 2) * 1.6;
      x.beginPath(); x.moveTo(sx - 2.4, base); x.lineTo(sx, base - 13); x.lineTo(sx + 2.4, base); x.closePath(); x.stroke();
      x.beginPath(); x.arc(sx, base - 15.5, 2.6, 0, 6.283); x.fill();
    }
  } else {                                       // warden: bell hull, boom pods
    x.beginPath(); x.moveTo(c - 15, c - 6); x.lineTo(c + 15, c - 6); x.lineTo(c + 5, c + 14); x.lineTo(c - 5, c + 14); x.closePath(); x.stroke();
    x.beginPath(); x.moveTo(c - 17, c - 10); x.lineTo(c + 17, c - 10); x.lineTo(c + 15, c - 6); x.lineTo(c - 15, c - 6); x.closePath(); x.stroke();
    x.fillRect(c - 8, c - 3, 16, 2.6);
    [-1, 1].forEach(s => { x.beginPath(); x.arc(c + s * 21, c - 1, 3.4, 0, 6.283); x.fill(); });
    x.beginPath(); x.arc(c, c + 19, 3.4, 0, 6.283); x.fill();
  }
}
function buildBestiary() {
  const host = $('bestiary');
  host.innerHTML = '';
  BEASTS.forEach(b => {
    const row = document.createElement('div');
    row.className = 'beast';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 56;
    row.appendChild(cv);
    const t = document.createElement('div');
    t.innerHTML = '<b style="color:' + b.c + '">' + b.n + '</b><span>' + b.d + '</span>';
    row.appendChild(t);
    host.appendChild(row);
    beastIcon(cv, b.k, b.c);
  });
}

/* ---- records (session only) ---- */
const REC = { wave: 0, score: 0, kills: 0, boss: 0, runs: 0, ext: 0, byMap: {} };
/* ---------- contracts: three rotating objectives, credits on completion ---------- */
const CONTRACT_POOL = [
  { id: 'kills40', t: 'Cull 40 hostiles in one run', goal: 40, reward: 350, track: 'kills' },
  { id: 'wave5', t: 'Reach wave 5', goal: 5, reward: 400, track: 'wave' },
  { id: 'warden', t: 'Destroy a Warden', goal: 1, reward: 700, track: 'wardens' },
  { id: 'sovereign', t: 'Destroy a Sovereign', goal: 1, reward: 1200, track: 'sovereigns' },
  { id: 'wave10', t: 'Reach wave 10', goal: 10, reward: 900, track: 'wave' },
  { id: 'extract', t: 'Extract successfully', goal: 1, reward: 600, track: 'extracted' },
  { id: 'brutes8', t: 'Break 8 Brutes', goal: 8, reward: 450, track: 'brutes' },
  { id: 'barrels6', t: 'Detonate 6 drums', goal: 6, reward: 300, track: 'barrels' },
  { id: 'score15k', t: 'Bank 15,000 score', goal: 15000, reward: 500, track: 'score' },
  { id: 'nodeath', t: 'Clear 3 waves without dropping below 50', goal: 3, reward: 550, track: 'clean' }
];
function rollContracts() {
  const day = Math.floor(Date.now() / 86400000);
  if (PROFILE.contracts && PROFILE.contractDay === day) return;
  const pool = CONTRACT_POOL.slice();
  const out = [];
  let s = day * 7919;
  for (let i = 0; i < 3 && pool.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out.push(Object.assign({ done: false }, pool.splice(s % pool.length, 1)[0]));
  }
  PROFILE.contracts = out;
  PROFILE.contractDay = day;
  saveProfile();
}
rollContracts();

const RUNSTAT = { kills: 0, wave: 0, wardens: 0, sovereigns: 0, extracted: 0, brutes: 0, barrels: 0, score: 0, clean: 0, bonus: 0,
                  shots: 0, hits: 0 };   // shots/hits drive the accuracy readout on the end screen
function resetRunStats() { for (const k in RUNSTAT) RUNSTAT[k] = 0; }

/* Evaluated the moment a tracked stat changes, so a contract completes while you
   are still playing rather than being discovered on the results screen. */
function checkContracts() {
  let changed = false;
  (PROFILE.contracts || []).forEach(c => {
    if (c.done) return;
    if ((RUNSTAT[c.track] || 0) >= c.goal) {
      c.done = true;
      RUNSTAT.bonus += c.reward;
      changed = true;
      toast('CONTRACT COMPLETE · +' + c.reward + ' CR', 0x35ffc4);
      sfx.power();
    }
  });
  if (changed) { saveProfile(); renderContractHUD(); }
}
/* Called whenever a tracked counter moves. */
function bumpStat(key, n) {
  RUNSTAT[key] = (RUNSTAT[key] || 0) + (n === undefined ? 1 : n);
  checkContracts();
  contractDirty = true;
}
let contractDirty = true, contractCool = 0;
/* Extraction helper: a marker that tracks the pad whether it is on screen or not,
   with live bearing and range. */
const wpV = new T.Vector3();
function updateWaypoint() {
  const el = $('waypoint');
  if (!el) return;
  if (!extraction || state !== 'play') { if (el.style.display !== 'none') el.style.display = 'none'; return; }
  el.style.display = 'block';
  const dist = Math.hypot(camera.position.x - padPos.x, camera.position.z - padPos.z);
  $('wpDist').textContent = Math.round(dist) + 'm';
  wpV.set(padPos.x, padPos.y + 3, padPos.z).project(camera);
  const behind = wpV.z > 1;
  const w = innerWidth, h = innerHeight;
  let x = (wpV.x * 0.5 + 0.5) * w, y = (-wpV.y * 0.5 + 0.5) * h;
  if (behind) { x = w - x; y = h - y; }
  const m = 74;                                  // keep clear of the screen edge
  const onScreen = !behind && x > m && x < w - m && y > m && y < h - m;
  if (!onScreen) {
    // clamp to the edge and point the chevron along the bearing from centre
    const cx = w / 2, cy = h / 2;
    let dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const scale = Math.min((w / 2 - m) / Math.abs(dx || 1), (h / 2 - m) / Math.abs(dy || 1));
    dx *= scale; dy *= scale;
    x = cx + dx; y = cy + dy;
    el.classList.add('edge');
    $('wpArrow').style.transform = 'rotate(' + (Math.atan2(dy, dx) + Math.PI / 2) + 'rad)';
  } else {
    el.classList.remove('edge');
    $('wpArrow').style.transform = 'rotate(0rad)';
  }
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

/* The radar cluster's height varies with responsive scaling and its own live content,
   so a hardcoded top: for the panel below it drifts out of sync and overlaps — position
   it from the radar's actual rendered bottom instead. */
function positionContractHud() {
  const host = $('contractHud'), radar = $('radarCluster');
  if (!host || !radar) return;
  host.style.top = Math.round(radar.getBoundingClientRect().bottom + 18) + 'px';
}
function renderContractHUD() {
  const host = $('contractHud');
  if (!host) return;
  const live = (PROFILE.contracts || []).filter(c => !c.done);
  host.innerHTML = '';
  if (!live.length || state !== 'play') return;
  live.forEach(c => {
    const have = Math.min(RUNSTAT[c.track] || 0, c.goal);
    const d = document.createElement('div');
    d.innerHTML = '<b>' + c.t + '</b><span>' + have + '/' + c.goal + '</span>'
      + '<i style="transform:scaleX(' + (have / c.goal) + ')"></i>';
    host.appendChild(d);
  });
  positionContractHud();
}

function settleRun(extracted) {
  RUNSTAT.extracted = extracted ? 1 : 0;
  checkContracts();
  const d = diffMul();
  // Veteran Contract (kit_veteran) is the last purchase in the game: +25% of both
  const vet = owned('kit_veteran') ? 1.25 : 1;
  const payMul = d.pay * (1 + PROFILE.upgrades.payout * 0.12) * vet;
  /* Deep-run bonus: extraction opens at wave 5, so staying for the wave-10 Sovereign is
     a choice to give up a guaranteed payout for a bigger one. It has to be worth real
     money or nobody would ever take the risk. */
  const deep = extracted && wave > DEEP_WAVE ? DEEP_BONUS : 0;
  let credits = Math.round((P.score / 16 + P.kills * 2 + wave * 30 + RUNSTAT.wardens * 200
                            + (extracted ? 500 : 0) + deep) * payMul);
  const bonus = RUNSTAT.bonus;
  credits += bonus;
  // Salvor upgrade accelerates levelling, the long-tail progression track
  const xp = Math.round((P.score / 20 + wave * 55 + RUNSTAT.wardens * 200 + (deep ? 600 : 0)) * d.pay * (1 + (PROFILE.upgrades.salvor || 0) * 0.14) * vet);
  const levelsGained = addXP(xp);
  PROFILE.credits += credits;
  PROFILE.lifetime += credits;
  const st = PROFILE.stats;
  st.runs++; st.kills += P.kills; st.wardens += RUNSTAT.wardens;
  if (extracted) st.extractions++;
  st.bestWave = Math.max(st.bestWave, wave);
  st.bestScore = Math.max(st.bestScore, P.score);
  const bm = st.byMap[currentMap] = st.byMap[currentMap] || { wave: 0, score: 0 };
  bm.wave = Math.max(bm.wave, wave); bm.score = Math.max(bm.score, P.score);
  saveProfile();
  /* The end screen shows a breakdown, so return the parts rather than just the total —
     "+2,107 cr" tells a player nothing about what to do differently next run. */
  return {
    credits: credits, bonus: bonus, xp: xp, levels: levelsGained,
    parts: [
      { k: 'Score', v: Math.round(P.score / 16 * payMul) },
      { k: 'Kills', v: Math.round(P.kills * 2 * payMul) },
      { k: 'Waves cleared', v: Math.round(wave * 30 * payMul) },
      { k: 'Wardens', v: Math.round(RUNSTAT.wardens * 200 * payMul) },
      { k: 'Extraction', v: extracted ? Math.round(500 * payMul) : 0 },
      { k: 'Deep run (wave ' + DEEP_WAVE + ')', v: Math.round(deep * payMul) },
      { k: 'Contracts', v: bonus }
    ].filter(x => x.v > 0),
    mult: payMul, diff: d.name,
    xpNeed: xpForLevel(PROFILE.level), xpHave: PROFILE.xp, level: PROFILE.level
  };
}

function recordRun(extracted) {
  REC.runs++;
  REC.kills += P.kills;
  if (extracted) REC.ext++;
  REC.wave = Math.max(REC.wave, wave);
  REC.score = Math.max(REC.score, P.score);
  const m = REC.byMap[currentMap] = REC.byMap[currentMap] || { wave: 0, score: 0 };
  m.wave = Math.max(m.wave, wave);
  m.score = Math.max(m.score, P.score);
  $('homeBest').textContent = REC.wave || '—';
}
function refreshRecords() {
  $('rWave').textContent = REC.wave || '—';
  $('rScore').textContent = REC.score ? REC.score.toLocaleString() : '—';
  $('rKills').textContent = REC.kills;
  $('rBoss').textContent = REC.boss;
  $('rRuns').textContent = REC.runs;
  $('rExt').textContent = REC.ext;
  const host = $('mapRecords');
  host.innerHTML = '';
  Object.keys(MAPS).forEach(k => {
    const m = REC.byMap[k];
    const d = document.createElement('div');
    d.innerHTML = '<span>' + MAPS[k].name + '</span><b>' + (m ? 'W' + m.wave : '—') + '</b>';
    host.appendChild(d);
  });
}

/* ---- settings, all live ---- */
function sw(id, init, fn) {
  const el = $(id);
  el.classList.toggle('on', !!init);
  el.addEventListener('click', () => {
    const on = !el.classList.contains('on');
    el.classList.toggle('on', on);
    fn(on);
    PROFILE.settings[id] = on;
    saveProfile();
    menuBlip();
  });
}
function slider(id, labelId, fn, fmt) {
  const el = $(id);
  const set = () => {
    const v = parseFloat(el.value);
    $(labelId).textContent = fmt ? fmt(v) : v;
    fn(v);
    const key = { sens: 'sens', fovR: 'fov', adsR: 'ads', volR: 'vol', bloomR: 'bloom', vibR: 'vib' }[id];
    if (key) { PROFILE.settings[key] = v; saveProfile(); }
  };
  el.addEventListener('input', set);
  set();
}
slider('sens', 'sensVal', v => { CFG.sens = 0.0006 + v * 0.00006; });
slider('fovR', 'fovVal', v => { CFG.fov = v; });
slider('adsR', 'adsVal', v => { OPT.adsSens = v / 100; }, v => v + '%');
slider('volR', 'volVal', v => { OPT.volume = v / 100; if (master) master.gain.value = OPT.volume; });
slider('bloomR', 'bloomVal', v => { matFinal.uniforms.bloom.value = v / 100; });
/* Colour: scales the split-tone grade and vibrance together, so a player who wants the
   original near-monochrome look can dial it to 0. */
slider('vibR', 'vibVal', v => {
  matFinal.uniforms.grade.value = v / 100;
  matFinal.uniforms.sat.value = 1 + (v / 100) * 0.22;
});
sw('invertY', false, v => OPT.invertY = v);
sw('ambT', true, v => { OPT.ambience = v; if (rainGain) rainGain.gain.value = v ? 0.05 : 0; if (musicGain) musicGain.gain.value = v ? 0.7 : 0; });
sw('adaptT', true, v => { OPT.adaptive = v; if (!v) { renderScale = 1; applyScale(); } });
sw('radarT', true, v => { OPT.radar = v; $('radarCluster').style.display = v ? 'block' : 'none'; });
sw('dmgT', true, v => OPT.dmgNums = v);
sw('shakeT', true, v => OPT.shake = v);
sw('perfT', false, v => { perfOn = v; perfEl.style.display = v ? 'block' : 'none'; });
sw('dayCycleT', true, v => { OPT.dayCycle = v; if (!v) updateDayNight(0); });
sw('qual', true, v => {
  CFG.quality = v ? 'high' : 'low';
  groundMat.uniforms.reflOn.value = v ? 1 : 0;
  basePR = v ? Math.min(devicePixelRatio, 1.6) : 1;
  renderScale = 1;
  applyScale();
});

/* ---- home screen selectors ---- */
function buildHomeSelects() {
  const ms = $('homeMapSel');
  ms.innerHTML = '';
  Object.keys(MAPS).forEach(k => {
    const o = document.createElement('option');
    const lock = !owned('map_' + k);
    o.value = k;
    o.textContent = MAPS[k].name + (lock ? ' — locked' : '');
    o.disabled = lock;
    ms.appendChild(o);
  });
  ms.value = currentMap;
  ms.disabled = pausedRun;
  const ds = $('homeDiffSel');
  ds.innerHTML = '';
  Object.keys(DIFFICULTY).forEach(k => {
    const d = DIFFICULTY[k];
    const lock = PROFILE.level < d.lvl;
    const o = document.createElement('option');
    o.value = k;
    o.textContent = d.name + (lock ? ' — level ' + d.lvl : d.pay !== 1 ? '  x' + d.pay.toFixed(2) + ' cr' : '');
    o.disabled = lock;
    ds.appendChild(o);
  });
  ds.value = difficulty;
  ds.disabled = pausedRun;
  $('homeNameInput').disabled = pausedRun;
  $('homeNameInput').value = playerName;
}
$('homeMapSel').addEventListener('change', e => {
  if (pausedRun) { buildHomeSelects(); $('statusLine').textContent = 'Locked until the run ends'; return; }
  selectMap(e.target.value);
  buildHomeSelects();
});
$('homeDiffSel').addEventListener('change', e => {
  if (pausedRun) { buildHomeSelects(); $('statusLine').textContent = 'Locked until the run ends'; return; }
  difficulty = e.target.value;
  PROFILE.settings.difficulty = difficulty; saveProfile();
  $('homeDiff').textContent = DIFFICULTY[difficulty].name;
  document.querySelectorAll('.diffBtn').forEach(p => p.classList.toggle('sel', p.dataset.diff === difficulty));
  menuBlip();
});
$('homeNameInput').addEventListener('change', e => setPlayerName(e.target.value));
$('homeNameInput').addEventListener('blur', e => setPlayerName(e.target.value));

/* ---------- soundtrack ----------
   There is no track-management UI any more: the folders under music/ ARE the playlists
   (see scanMusicLibrary in 04-fx-audio.js). What is left is volume, source, and skip. */
$('musicPrev').addEventListener('click', () => musicNext(-1));
$('musicRescan') && $('musicRescan').addEventListener('click', () => {
  musicScanned = false;
  $('musicStatus').textContent = 'Scanning…';
  scanMusicLibrary();
  menuBlip();
});
$('musicNext').addEventListener('click', () => musicNext(1));
slider('musicVol', 'musicVolVal', v => setMusicVol(v / 100));

/* ---- HUD customisation ---- */
const hudRoot = $('hud');
function setHudScale(v) { hudRoot.style.setProperty('--hs', v); OPT.hudScale = v; PROFILE.settings.hudScale = v; saveProfile(); }
function setHudOpacity(v) { hudRoot.style.setProperty('--ho', v); OPT.hudOpacity = v; PROFILE.settings.hudOpacity = v; saveProfile(); }
slider('hudScale', 'hudScaleVal', v => setHudScale(v / 100));
slider('hudOpacity', 'hudOpacityVal', v => setHudOpacity(v / 100));
sw('dynT', true, v => { OPT.dynamicHud = v; hudDynamic(0); });

/* ---- pause screen ---- */
function refreshPause() {
  $('pWave').textContent = wave;
  $('pKills').textContent = P.kills;
  $('pScore').textContent = P.score.toLocaleString();
  const d = diffMul();
  const payMul = d.pay * (1 + PROFILE.upgrades.payout * 0.12);
  const pending = Math.round((P.score / 16 + P.kills * 2 + wave * 30 + RUNSTAT.wardens * 200) * payMul);
  $('pCred').textContent = pending.toLocaleString();
  $('pauseSub').textContent = 'Holding in ' + MAPS[currentMap].name + ' on ' + DIFFICULTY[difficulty].name + '.';
  const host = $('pauseContracts');
  host.innerHTML = '';
  (PROFILE.contracts || []).forEach(c => {
    const have = Math.min(RUNSTAT[c.track] || 0, c.goal);
    const dv = document.createElement('div');
    dv.className = 'contract' + (c.done ? ' done' : '');
    dv.innerHTML = '<div><b>' + c.t + '</b><span>' + (c.done ? 'Complete' : have + ' / ' + c.goal) + '</span></div>'
      + '<em>' + (c.done ? '&#10003;' : c.reward + ' cr') + '</em>';
    host.appendChild(dv);
  });
  $('pSens').value = Math.round((CFG.sens - 0.0006) / 0.00006);
  $('pSensVal').textContent = $('pSens').value;
  $('pVol').value = Math.round(OPT.volume * 100);
  $('pVolVal').textContent = $('pVol').value;
  $('pRadar').classList.toggle('on', OPT.radar);
  $('pShake').classList.toggle('on', OPT.shake);
}
// quick-adjust mirrors the real settings controls so both stay in sync
$('pSens').addEventListener('input', e => {
  $('pSensVal').textContent = e.target.value;
  $('sens').value = e.target.value;
  $('sens').dispatchEvent(new Event('input'));
});
$('pVol').addEventListener('input', e => {
  $('pVolVal').textContent = e.target.value;
  $('volR').value = e.target.value;
  $('volR').dispatchEvent(new Event('input'));
});
$('pRadar').addEventListener('click', () => { $('radarT').click(); $('pRadar').classList.toggle('on', OPT.radar); });
$('pShake').addEventListener('click', () => { $('shakeT').click(); $('pShake').classList.toggle('on', OPT.shake); });

function restoreSettings() {
  const s = PROFILE.settings || {};
  if (s.difficulty && DIFFICULTY[s.difficulty] && PROFILE.level >= DIFFICULTY[s.difficulty].lvl) difficulty = s.difficulty;
  if (s.perk && PERKS[s.perk] && owned(PERKS[s.perk].id)) perk = s.perk;
  if (s.character && CHARACTERS[s.character] &&
      (CHARACTERS[s.character].cost === 0 || owned('char_' + s.character))) character = s.character;
  if (Array.isArray(s.loadout)) {
    loadout = s.loadout.map(k => (k && (k === 'pulse' || owned('wep_' + k))) ? k : null);
    if (!loadout.some(Boolean)) loadout = ['pulse', null, null];
  }
  if (s.map && MAPS[s.map] && owned('map_' + s.map)) currentMap = s.map;
  [['sens', 'sens'], ['fov', 'fovR'], ['ads', 'adsR'], ['vol', 'volR'], ['bloom', 'bloomR'], ['vib', 'vibR']].forEach(p => {
    if (s[p[0]] !== undefined && $(p[1])) { $(p[1]).value = s[p[0]]; $(p[1]).dispatchEvent(new Event('input')); }
  });
  if (s.hudScale !== undefined) { $('hudScale').value = Math.round(s.hudScale * 100); $('hudScale').dispatchEvent(new Event('input')); }
  if (s.hudOpacity !== undefined) { $('hudOpacity').value = Math.round(s.hudOpacity * 100); $('hudOpacity').dispatchEvent(new Event('input')); }
  if (s.musicVol !== undefined) { $('musicVol').value = Math.round(s.musicVol * 100); $('musicVol').dispatchEvent(new Event('input')); }
  // musicMode is no longer a saved preference — the source follows whether files exist
  ['invertY', 'ambT', 'adaptT', 'radarT', 'dmgT', 'shakeT', 'qual', 'dayCycleT', 'perfT', 'dynT'].forEach(id => {
    if (s[id] !== undefined && $(id) && $(id).classList.contains('on') !== !!s[id]) $(id).click();
  });
}
restoreSettings();
/* Pull the host machine's shared profile before the menus draw their numbers, so a run
   opened on localhost and one opened on the LAN address are the same account. Remote
   players get a 403 here and simply keep their own local save. */
pullProfile().then(changed => {
  if (!changed) return;
  restoreSettings();
  creditLine();
  buildMapPicker(); buildPerks(); buildLoadout(); buildHomeSelects();
  if (typeof refreshRecords === 'function') refreshRecords();
  toast('PROGRESS SYNCED · LV ' + PROFILE.level + ' · ' + PROFILE.credits.toLocaleString() + ' CR', 0x35ffc4);
});
// folders are the playlist — find whatever the player dropped in music/
scanMusicLibrary();
buildLoadout();
buildRoster();
applyHandPreview();
buildPerks();
buildDifficulties();
buildBestiary();
buildHomeSelects();
refreshArmoury();
syncPlayerNameUI();
$('homePerk').textContent = PERKS[perk].name;
$('homeBest').textContent = PROFILE.stats.bestWave || '—';
$('deployBtn').addEventListener('click', () => $('play').click());

function exitLock() {
  if (document.exitPointerLock) { try { document.exitPointerLock(); } catch (err) {} }
}
function requestLock() {
  if (embedded || !document.body.requestPointerLock) return;
  const now = performance.now();
  if (now - lockAsk < 600) return;
  lockAsk = now;
  try {
    const result = document.body.requestPointerLock();
    if (result && result.catch) result.catch(() => { locked = false; });
  } catch (err) { locked = false; }
}
document.addEventListener('click', () => {
  if (state === 'play' && !locked && !embedded) requestLock();
});

/* Autoplay unlock. Browsers refuse audio until the page has seen a real user gesture, so
   the boot-time scan can find every track, set the source to custom, call play() — and
   still be silently rejected. To the player that reads as "my music does not work".
   Retry on the first gesture of any kind. */
let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  initAudio();
  if (AC && AC.state === 'suspended') AC.resume();
  autoMusicSource();
  musicWatchContext();
  if (MUSIC.mode === 'custom' && MUSIC.el && MUSIC.el.paused && MUSIC.el.src) {
    const pr = MUSIC.el.play();
    if (pr && pr.catch) pr.catch(() => {});
  }
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  document.addEventListener(ev, unlockAudio, { passive: true }));

buildMapWorld();
buildPips();
syncHUD();
applyScale();
$('menu').classList.add('show');
$('play').disabled = true;
$('play').textContent = 'Compiling shaders…';
requestAnimationFrame(() => {
  try { warmUp(); }
  catch (err) { console.error('Shader warm-up failed (continuing):', err); }
  $('play').disabled = false;
  $('play').textContent = 'Deploy';
  loop();
});
