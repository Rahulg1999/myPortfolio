/* neon-runner · 03b-nav.js
   Map navigation: a walkable grid built from the same blockers the player collides
   with, and a flow field over it toward whoever is being hunted.

   WHY THIS EXISTS
   Both AIs used to steer by pure bearing — enemies drove straight at the player and
   bots wandered to random points. Behind cover that reads as stupid: they press into
   the wall between you and slide along it, because nothing in the game knew the shape
   of the level. A flow field fixes that by construction. Dijkstra runs outward from
   the target across walkable cells, so following the downhill gradient goes AROUND
   obstacles and arrives from whatever side the geometry actually allows. Nobody has to
   reason about flanking; the field is the map's own knowledge of the way to you.

   One field is shared by every hunter, so the cost is one Dijkstra sweep every
   NAV.period seconds no matter how many things are chasing you.

   Loaded after 03-world.js — it reads blockers, floorAt() and hitsWall(). */

const NAV = {
  /* 1.5 m cells. At 2 m the grid was coarse next to the features it has to path
     through — a 3.2 m catwalk or a 3.6 m stair flight is barely two cells wide, and the
     clearance test then rejects most of them. */
  cell: 1.5,
  period: 0.25,       // seconds between field sweeps
  climb: 1.3,         // max step UP between cells (STEP in 06-player.js)
  drop: 4.5,          // max step DOWN — enemies commit to a fall this big, not more
  n: 0, x0: 0, z0: 0,
  solid: null, h: null, dist: null,
  heap: null, hn: 0,
  cool: 0, ready: false, ti: -1, tj: -1,
  sweeps: 0           // diagnostics, read by the tests
};

function navCell(x, z) {
  const i = Math.round((x - NAV.x0) / NAV.cell), j = Math.round((z - NAV.z0) / NAV.cell);
  if (i < 0 || j < 0 || i >= NAV.n || j >= NAV.n) return -1;
  return j * NAV.n + i;
}
function navX(k) { return NAV.x0 + (k % NAV.n) * NAV.cell; }
function navZ(k) { return NAV.z0 + ((k / NAV.n) | 0) * NAV.cell; }

/* Rebuild the grid for the current map. Called at the end of buildMapWorld(), once the
   blockers are final. */
function navBuild() {
  const B = CFG.bounds;
  NAV.x0 = -B; NAV.z0 = -B;
  NAV.n = Math.floor(2 * B / NAV.cell) + 1;
  const N = NAV.n, total = N * N;
  NAV.solid = new Uint8Array(total);
  NAV.h = new Float32Array(total);
  NAV.dist = new Float32Array(total);
  NAV.heap = new Int32Array(total + 1);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    const x = NAV.x0 + i * NAV.cell, z = NAV.z0 + j * NAV.cell;
    const y = floorAt(x, z);
    NAV.h[k] = y;
    /* 0.75 m of clearance: wide enough that the field never threads a gap a body
       cannot fit through, which is how you get an AI that walks confidently into a
       corner it can see past but not pass. */
    NAV.solid[k] = hitsWall(x, z, 0.75, y) ? 1 : 0;
  }
  NAV.ready = true;
  NAV.cool = 0; NAV.ti = -1; NAV.tj = -1;
  NAV.dist.fill(Infinity);
}

/* Can you get from cell a to cell b? Height rules only — walls are already `solid`. */
function navStepOk(a, b) {
  if (NAV.solid[b]) return false;
  const d = NAV.h[b] - NAV.h[a];
  return d <= NAV.climb && d >= -NAV.drop;
}

/* Binary heap keyed on NAV.dist, storing cell indices. */
function navPush(k) {
  const H = NAV.heap, d = NAV.dist;
  let c = ++NAV.hn;
  H[c] = k;
  while (c > 1) {
    const p = c >> 1;
    if (d[H[p]] <= d[H[c]]) break;
    const t = H[p]; H[p] = H[c]; H[c] = t;
    c = p;
  }
}
function navPop() {
  const H = NAV.heap, d = NAV.dist;
  const top = H[1];
  H[1] = H[NAV.hn--];
  let c = 1;
  for (;;) {
    const l = c << 1, r = l + 1;
    let m = c;
    if (l <= NAV.hn && d[H[l]] < d[H[m]]) m = l;
    if (r <= NAV.hn && d[H[r]] < d[H[m]]) m = r;
    if (m === c) break;
    const t = H[m]; H[m] = H[c]; H[c] = t;
    c = m;
  }
  return top;
}

const NAV_DX = [1, -1, 0, 0, 1, 1, -1, -1];
const NAV_DZ = [0, 0, 1, -1, 1, -1, 1, -1];
const NAV_COST = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];

/* Dijkstra outward from (tx, tz). Every walkable cell ends up holding its travel cost
   to the target, so any hunter anywhere can read its next step in O(8). */
function navSweep(tx, tz) {
  if (!NAV.ready) return false;
  let start = navCell(tx, tz);
  if (start < 0) return false;
  if (NAV.solid[start]) {                       // target inside geometry: use a neighbour
    let best = -1;
    for (let d = 0; d < 8; d++) {
      const k = navNeighbour(start, d);
      if (k >= 0 && !NAV.solid[k]) { best = k; break; }
    }
    if (best < 0) return false;
    start = best;
  }
  NAV.dist.fill(Infinity);
  NAV.hn = 0;
  NAV.dist[start] = 0;
  navPush(start);
  while (NAV.hn > 0) {
    const k = navPop();
    const dk = NAV.dist[k];
    const i = k % NAV.n, j = (k / NAV.n) | 0;
    for (let d = 0; d < 8; d++) {
      const ni = i + NAV_DX[d], nj = j + NAV_DZ[d];
      if (ni < 0 || nj < 0 || ni >= NAV.n || nj >= NAV.n) continue;
      const nk = nj * NAV.n + ni;
      if (!navStepOk(k, nk)) continue;
      if (d >= 4) {
        // no cutting a diagonal past a corner — both orthogonals must be open too
        const oa = j * NAV.n + ni, ob = nj * NAV.n + i;
        if (!navStepOk(k, oa) || !navStepOk(k, ob)) continue;
      }
      const nd = dk + NAV_COST[d];
      if (nd < NAV.dist[nk]) { NAV.dist[nk] = nd; navPush(nk); }
    }
  }
  NAV.ti = navCell(tx, tz);
  NAV.sweeps++;
  return true;
}
function navNeighbour(k, d) {
  const i = (k % NAV.n) + NAV_DX[d], j = ((k / NAV.n) | 0) + NAV_DZ[d];
  if (i < 0 || j < 0 || i >= NAV.n || j >= NAV.n) return -1;
  return j * NAV.n + i;
}

/* Re-sweep on a timer, or immediately if the target has moved to another cell. */
function navTick(dt, tx, tz) {
  if (!NAV.ready) return;
  NAV.cool -= dt;
  const cur = navCell(tx, tz);
  if (NAV.cool > 0 && cur === NAV.ti) return;
  NAV.cool = NAV.period;
  navSweep(tx, tz);
}

/* Unit direction a hunter at (x, z) should travel to close on the target, or null if
   this spot has no path (then the caller falls back to steering by bearing). */
const navOut = { x: 0, z: 0, cost: 0 };
function navDir(x, z) {
  if (!NAV.ready) return null;
  const k = navCell(x, z);
  if (k < 0) return null;
  let here = NAV.dist[k];
  if (!isFinite(here) || NAV.solid[k]) {
    /* Stranded: on a crate, wedged against a stair stringer, or dropped into a pocket
       the field never reached. Spiral outward for the cheapest cell that IS on the
       field and steer straight at it — slide() will scrape along whatever is in the
       way. Without this an AI that ends up somewhere unexpected stands there forever. */
    const i0 = k % NAV.n, j0 = (k / NAV.n) | 0;
    let best = Infinity, bx = 0, bz = 0;
    for (let r = 1; r <= 6 && !isFinite(best); r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= NAV.n || j >= NAV.n) continue;
        const nk = j * NAV.n + i;
        if (NAV.solid[nk] || !isFinite(NAV.dist[nk])) continue;
        if (NAV.dist[nk] < best) { best = NAV.dist[nk]; bx = navX(nk); bz = navZ(nk); }
      }
    }
    if (!isFinite(best)) return null;
    const ex = bx - x, ez = bz - z, el = Math.hypot(ex, ez) || 1;
    navOut.x = ex / el; navOut.z = ez / el; navOut.cost = best;
    return navOut;
  }
  let best = here, bk = -1;
  for (let d = 0; d < 8; d++) {
    const nk = navNeighbour(k, d);
    if (nk < 0 || !navStepOk(k, nk)) continue;
    if (NAV.dist[nk] < best) { best = NAV.dist[nk]; bk = nk; }
  }
  if (bk < 0) return null;
  /* Aim at the CENTRE of the winning cell rather than snapping to one of eight
     compass directions — that is what keeps the movement from looking gridded. */
  const dx = navX(bk) - x, dz = navZ(bk) - z;
  const len = Math.hypot(dx, dz) || 1;
  navOut.x = dx / len; navOut.z = dz / len; navOut.cost = best;
  return navOut;
}

/* Travel cost from a point to the target along the field, in metres. Infinity when
   there is no route. Used to tell "close" from "close but on the far side of a wall". */
function navCost(x, z) {
  if (!NAV.ready) return Infinity;
  const k = navCell(x, z);
  if (k < 0) return Infinity;
  const d = NAV.dist[k];
  return isFinite(d) ? d * NAV.cell : Infinity;
}

/* Clear line of fire between two points, tested against the same boxes bullets use. */
const navFrom = new T.Vector3(), navTo = new T.Vector3();
function navLOS(ax, ay, az, bx, by, bz) {
  navFrom.set(ax, ay, az);
  navTo.set(bx - ax, by - ay, bz - az);
  const len = navTo.length();
  if (len < 0.001) return true;
  navTo.multiplyScalar(1 / len);
  return !castWall(navFrom, navTo, len - 0.05);
}
