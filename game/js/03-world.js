/* neon-runner · 03-world.js
   geometry merging, the three maps, barrels, extraction pad, world assembly
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- data noise texture (replaces per-pixel procedural noise) ---------- */
function noiseTexture() {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S);
  const fields = [16, 48, 112].map(n => {
    const a = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) a[i] = Math.random();
    return { n: n, a: a };
  });
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) {
      const f = fields[k], n = f.n;
      const fx = x / S * n, fy = y / S * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = sm(fx - x0), ty = sm(fy - y0);
      const xa = x0 % n, xb = (x0 + 1) % n, ya = (y0 % n) * n, yb = ((y0 + 1) % n) * n;
      const v = (f.a[ya + xa] * (1 - tx) + f.a[ya + xb] * tx) * (1 - ty)
              + (f.a[yb + xa] * (1 - tx) + f.a[yb + xb] * tx) * ty;
      img.data[p + k] = v * 255;
    }
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
const noiseTex = noiseTexture();

/* ---------- geometry merging (one draw call per material) ---------- */
function mergeGeos(items, withColor) {
  let total = 0;
  const parts = [];
  for (let i = 0; i < items.length; i++) {
    let geo = items[i].geo;
    if (geo.index) geo = geo.toNonIndexed();
    geo.applyMatrix4(items[i].matrix);
    parts.push({ g: geo, c: items[i].color });
    total += geo.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2), col = withColor ? new Float32Array(total * 3) : null;
  let o3 = 0, o2 = 0;
  for (let i = 0; i < parts.length; i++) {
    const gg = parts[i].g, n = gg.attributes.position.count;
    pos.set(gg.attributes.position.array, o3);
    if (gg.attributes.normal) nor.set(gg.attributes.normal.array, o3);
    if (gg.attributes.uv) uv.set(gg.attributes.uv.array, o2);
    if (col) { const c = parts[i].c; for (let v = 0; v < n; v++) { col[o3 + v * 3] = c.r; col[o3 + v * 3 + 1] = c.g; col[o3 + v * 3 + 2] = c.b; } }
    o3 += n * 3; o2 += n * 2;
    gg.dispose();
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
// pull a vertex range out of a non-indexed geometry (splits box sides from caps)
function sliceGeo(src, ranges) {
  let n = 0;
  for (const r of ranges) n += r[1] - r[0];
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const sp = src.attributes.position.array, sn = src.attributes.normal.array, su = src.attributes.uv.array;
  let o = 0;
  for (const r of ranges) {
    const c = r[1] - r[0];
    pos.set(sp.subarray(r[0] * 3, r[1] * 3), o * 3);
    nor.set(sn.subarray(r[0] * 3, r[1] * 3), o * 3);
    uv.set(su.subarray(r[0] * 2, r[1] * 2), o * 2);
    o += c;
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  return out;
}

/* ---------- wet street ---------- */
const groundMat = new T.ShaderMaterial({
  uniforms: {
    tRefl: { value: rtRefl.texture },
    tNoise: { value: noiseTex },
    time: { value: 0 },
    fogColor: { value: new T.Color(0x0a0d1c) },
    fogDensity: { value: 0.0105 },
    reflOn: { value: 1 },
    wetMul: { value: 1 }
  },
  fragmentShader: `
  varying vec3 vW; varying vec4 vC;
  uniform sampler2D tRefl, tNoise;
  uniform float time, fogDensity, reflOn, wetMul; uniform vec3 fogColor;
  void main(){
    vec2 uv = (vC.xy/vC.w)*0.5+0.5;
    vec3 vd = cameraPosition - vW;
    float dist = length(vd);
    vec3 V = vd/dist;
    vec4 nA = texture2D(tNoise, vW.xz*0.0135);
    vec4 nB = texture2D(tNoise, vW.xz*0.062 + 0.37);
    float wet = (smoothstep(0.40,0.66, nA.r)*0.85 + smoothstep(0.52,0.80, nB.g)*0.15) * wetMul;
    vec2 warp = texture2D(tNoise, vW.xz*0.05 + vec2(time*0.021,-time*0.017)).rg - 0.5;
    float rip = texture2D(tNoise, vW.xz*0.20 - time*0.035).b;
    vec2 ruv = clamp(uv + warp*0.012*wet + (rip-0.5)*0.0026, 0.002, 0.998);
    vec3 refl = texture2D(tRefl, ruv).rgb * reflOn;
    vec3 base = mix(vec3(0.008,0.010,0.017), vec3(0.021,0.023,0.031), nB.b*0.6 + nA.g*0.4);
    float lx = abs(mod(vW.x+13.0,26.0)-13.0);
    float lz = abs(mod(vW.z+13.0,26.0)-13.0);
    float line = smoothstep(0.22,0.0,lx)*step(0.5,fract(vW.z*0.11))
               + smoothstep(0.22,0.0,lz)*step(0.5,fract(vW.x*0.11));
    base += vec3(0.42,0.36,0.22)*line*0.5;
    float fres = pow(1.0 - clamp(V.y,0.0,1.0), 3.0);
    float amt = mix(0.10, 0.92, wet) * mix(0.25, 1.0, fres);
    vec3 col = base*(1.0 - 0.35*wet) + refl*amt;
    col += vec3(0.03,0.05,0.10) * smoothstep(0.75,0.15,rip) * wet * 0.35;
    float f = 1.0 - exp(-fogDensity*fogDensity*dist*dist);
    gl_FragColor = vec4(mix(col, fogColor, f), 1.0);
  }`,
  vertexShader: `
  varying vec3 vW; varying vec4 vC;
  void main(){
    vec4 wp = modelMatrix*vec4(position,1.0);
    vW = wp.xyz; vC = projectionMatrix*viewMatrix*wp; gl_Position = vC;
  }`
});
const ground = new T.Mesh(new T.PlaneGeometry(700, 700, 1, 1), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.renderOrder = -1;
scene.add(ground);

/* ---------- city ---------- */
const blockers = [];                  // {x,z,hw,hd,h} axis-aligned solids, used for collision AND bullets
function addBlocker(x, z, hw, hd, h, walk) {
  blockers.push({ x: x, z: z, hw: hw, hd: hd, h: h, walk: walk !== false });
}
/* Height of the walkable surface under a point — roof decks, platforms, train cars. */
function floorAt(x, z) {
  let best = MAPS[currentMap].floorY;
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    if (!b.walk || b.off) continue;
    if (x > b.x - b.hw && x < b.x + b.hw && z > b.z - b.hd && z < b.z + b.hd) {
      if (b.h > best) best = b.h;
    }
  }
  return best;
}

function windowTexture(tint) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#04060c'; x.fillRect(0, 0, 128, 128);
  const n = 8, s = 128 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const on = Math.random();
    if (on < 0.40) {
      const a = 0.35 + Math.random() * 0.65;
      x.fillStyle = 'rgba(' + tint[0] + ',' + tint[1] + ',' + tint[2] + ',' + a + ')';
    } else if (on < 0.46) {
      x.fillStyle = 'rgba(255,200,120,' + (0.5 + Math.random() * 0.5) + ')';
    } else {
      x.fillStyle = 'rgba(9,12,20,1)';
    }
    x.fillRect(i * s + s * 0.16, j * s + s * 0.20, s * 0.68, s * 0.50);
  }
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.encoding = T.sRGBEncoding;
  tex.anisotropy = 4;
  return tex;
}
const winTex = [
  windowTexture([180, 220, 255]),
  windowTexture([255, 190, 140]),
  windowTexture([160, 255, 230]),
  windowTexture([220, 170, 255])
];
const concrete = new T.MeshStandardMaterial({ color: 0x0b0e18, roughness: 0.9, metalness: 0.05, side: T.DoubleSide });

/* Glazed subway tile with grout lines and patches of grime. */
function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#20262e'; x.fillRect(0, 0, 128, 128);
  const cols = 4, rows = 8, tw = 128 / cols, th = 128 / rows;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * tw * 0.5;
    for (let i = -1; i < cols + 1; i++) {
      const v = 0.72 + Math.random() * 0.28;
      const g = Math.random() < 0.16 ? 0.45 : 1;
      x.fillStyle = 'rgb(' + Math.round(56 * v * g) + ',' + Math.round(66 * v * g) + ',' + Math.round(76 * v * g) + ')';
      x.fillRect(i * tw + off + 1.5, j * th + 1.5, tw - 3, th - 3);
      x.fillStyle = 'rgba(255,255,255,' + (0.05 * v) + ')';
      x.fillRect(i * tw + off + 1.5, j * th + 1.5, tw - 3, 2);
    }
  }
  for (let n = 0; n < 40; n++) {                       // grime wash
    x.fillStyle = 'rgba(8,10,14,' + (0.05 + Math.random() * 0.12) + ')';
    x.fillRect(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 26, 4 + Math.random() * 30);
  }
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.encoding = T.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
const tileTex = tileTexture();

/* ============================================================
   SURFACE TEXTURES
   Every prop on these maps was an untextured MeshStandardMaterial box, so a wall, a
   crate and a container were the same flat rectangle in three sizes — the reason the
   arenas read as "just blocks". These generate the surface detail instead: panel
   seams, rivets, corrugation, checker plate, form-board marks, weathering. Each one
   also yields a normal map (normalFromCanvas), which is what actually makes a merged,
   unlit-from-the-side box read as a three-dimensional surface.
   All of it is canvas work done once at load; nothing here runs per frame.
   ============================================================ */
function texCanvas(S) {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}
function wrapTex(c) {
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.encoding = T.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
/* Tangent-space normal map derived from a canvas's luminance (Sobel on the height
   read out of brightness). Painted seams and rivets become real shading that moves
   with the light, which is the difference between a "textured box" and a surface. */
function normalFromCanvas(c, strength) {
  const S = c.width;
  const src = c.getContext('2d').getImageData(0, 0, S, S).data;
  const out = texCanvas(S), octx = out.getContext('2d'), img = octx.createImageData(S, S);
  const lum = (x, y) => {
    const i = ((((y % S) + S) % S) * S + (((x % S) + S) % S)) * 4;
    return (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (lum(x + 1, y) - lum(x - 1, y)) * strength;
    const dy = (lum(x, y + 1) - lum(x, y - 1)) * strength;
    const nx = -dx, ny = -dy, nz = 1, l = Math.sqrt(nx * nx + ny * ny + 1) || 1;
    const p = (y * S + x) * 4;
    img.data[p] = (nx / l * 0.5 + 0.5) * 255;
    img.data[p + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[p + 2] = (nz / l * 0.5 + 0.5) * 255;
    img.data[p + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  const t = new T.CanvasTexture(out);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
/* Build once, hand back {map, normalMap} — materials below share these. */
function surface(draw, S, bump) {
  const c = texCanvas(S || 256);
  draw(c.getContext('2d'), c.width);
  return { map: wrapTex(c), normalMap: normalFromCanvas(c, bump === undefined ? 2.2 : bump) };
}
const rnd = Math.random;   // textures are decoration, not geometry: seeded RNG not required

/* Painted steel plate: welded seams on a half-tile grid, rivet rows down every seam,
   drip streaks under the horizontals, scuffs where things get dragged past. */
const SURF_PANEL = surface((x, S) => {
  const h = S / 2;
  x.fillStyle = '#39445c'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {          // plate-to-plate variation
    const v = 0.84 + rnd() * 0.3;
    x.fillStyle = 'rgb(' + (57 * v | 0) + ',' + (68 * v | 0) + ',' + (92 * v | 0) + ')';
    x.fillRect(i * h, j * h, h, h);
  }
  for (let n = 0; n < 90; n++) {                                     // mottling
    x.fillStyle = 'rgba(' + (rnd() < 0.5 ? '18,22,32,' : '96,108,134,') + (0.03 + rnd() * 0.07) + ')';
    x.fillRect(rnd() * S, rnd() * S, 8 + rnd() * 40, 6 + rnd() * 34);
  }
  for (let n = 0; n < 26; n++) {                                     // drip streaks
    const sx = rnd() * S, sy = (rnd() < 0.5 ? 0 : h);
    x.fillStyle = 'rgba(14,17,26,' + (0.06 + rnd() * 0.14) + ')';
    x.fillRect(sx, sy, 1 + rnd() * 3, 12 + rnd() * 46);
  }
  x.strokeStyle = 'rgba(9,12,20,0.95)'; x.lineWidth = 3;             // seams
  for (let i = 0; i <= 2; i++) {
    x.beginPath(); x.moveTo(i * h, 0); x.lineTo(i * h, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * h); x.lineTo(S, i * h); x.stroke();
  }
  x.strokeStyle = 'rgba(126,140,170,0.5)'; x.lineWidth = 1;          // lit lip beside each seam
  for (let i = 0; i <= 2; i++) {
    x.beginPath(); x.moveTo(i * h + 2.5, 0); x.lineTo(i * h + 2.5, S); x.stroke();
    x.beginPath(); x.moveTo(0, i * h + 2.5); x.lineTo(S, i * h + 2.5); x.stroke();
  }
  for (let i = 0; i <= 2; i++) for (let k = 0; k < S; k += 16) {     // rivets along the seams
    for (const p of [[i * h, k], [k, i * h]]) {
      x.fillStyle = 'rgba(150,164,196,0.55)';
      x.beginPath(); x.arc(p[0], p[1], 2.1, 0, 6.3); x.fill();
      x.fillStyle = 'rgba(10,13,20,0.5)';
      x.beginPath(); x.arc(p[0] + 0.7, p[1] + 0.9, 1.5, 0, 6.3); x.fill();
    }
  }
}, 256, 2.6);

/* Poured concrete: form-board seams, tie-rod holes, water staining, hairline cracks. */
const SURF_CONCRETE = surface((x, S) => {
  x.fillStyle = '#333b4d'; x.fillRect(0, 0, S, S);
  for (let n = 0; n < 320; n++) {                                    // aggregate speckle
    const v = rnd();
    x.fillStyle = 'rgba(' + (v < 0.5 ? '22,26,36,' : '112,122,148,') + (0.05 + rnd() * 0.16) + ')';
    x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  for (let n = 0; n < 40; n++) {                                     // damp patches
    x.fillStyle = 'rgba(16,20,30,' + (0.04 + rnd() * 0.1) + ')';
    x.fillRect(rnd() * S, rnd() * S, 20 + rnd() * 80, 16 + rnd() * 70);
  }
  x.strokeStyle = 'rgba(16,20,30,0.75)'; x.lineWidth = 2;            // form-board seams
  for (let j = 0; j <= 4; j++) {
    const y = j * S / 4;
    x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke();
  }
  x.strokeStyle = 'rgba(120,132,158,0.28)'; x.lineWidth = 1;
  for (let j = 0; j <= 4; j++) {
    const y = j * S / 4 + 2;
    x.beginPath(); x.moveTo(0, y); x.lineTo(S, y); x.stroke();
  }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 3; i++) {          // tie-rod holes
    const cx = 40 + i * 88 + rnd() * 8, cy = j * S / 4 + S / 8;
    x.fillStyle = 'rgba(12,15,23,0.8)';
    x.beginPath(); x.arc(cx, cy, 3.2, 0, 6.3); x.fill();
    x.fillStyle = 'rgba(120,132,158,0.22)';
    x.beginPath(); x.arc(cx, cy - 1.2, 3.4, 3.4, 6.0); x.fill();
  }
  x.strokeStyle = 'rgba(14,18,26,0.5)'; x.lineWidth = 1.2;           // cracks
  for (let n = 0; n < 7; n++) {
    let px = rnd() * S, py = rnd() * S;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (rnd() - 0.5) * 34; py += (rnd() - 0.5) * 34; x.lineTo(px, py); }
    x.stroke();
  }
}, 256, 1.5);

/* Container skin: the vertical trapezoidal corrugation every shipping container has,
   ISO 1161 profile — about a 0.30 m pitch once the tile is mapped to world units.
   Kept near-white so the material colour tints it per container. */
const SURF_CORRUGATED = surface((x, S) => {
  const per = S / 8;
  for (let i = 0; i < S; i++) {
    const t = (i % per) / per;
    let sh;
    if (t < 0.20) sh = 0.62 + (t / 0.20) * 0.46;                     // rising web, catches light
    else if (t < 0.48) sh = 1.08;                                    // crest
    else if (t < 0.68) sh = 1.08 - ((t - 0.48) / 0.20) * 0.5;        // falling web
    else sh = 0.56;                                                  // valley, in shadow
    x.fillStyle = 'rgb(' + Math.min(255, 205 * sh | 0) + ',' + Math.min(255, 208 * sh | 0) + ',' + Math.min(255, 212 * sh | 0) + ')';
    x.fillRect(i, 0, 1, S);
  }
  for (let n = 0; n < 70; n++) {                                     // weathering, rust bloom
    const r = rnd();
    x.fillStyle = r < 0.55 ? 'rgba(60,52,44,' + (0.05 + rnd() * 0.16) + ')'
                           : 'rgba(126,68,34,' + (0.04 + rnd() * 0.14) + ')';
    x.fillRect(rnd() * S, rnd() * S, 4 + rnd() * 22, 8 + rnd() * 52);
  }
  for (let n = 0; n < 26; n++) {                                     // scratches down the ribs
    x.fillStyle = 'rgba(240,240,240,' + (0.05 + rnd() * 0.12) + ')';
    x.fillRect(rnd() * S, rnd() * S, 1, 10 + rnd() * 50);
  }
  x.fillStyle = 'rgba(30,26,22,0.30)'; x.fillRect(0, S - 10, S, 10); // grime at the sill
}, 256, 3.4);

/* Checker plate — stair treads, catwalks, deck tops. */
const SURF_TREAD = surface((x, S) => {
  x.fillStyle = '#454f66'; x.fillRect(0, 0, S, S);
  for (let n = 0; n < 60; n++) {
    x.fillStyle = 'rgba(' + (rnd() < 0.5 ? '24,29,40,' : '110,122,150,') + (0.04 + rnd() * 0.1) + ')';
    x.fillRect(rnd() * S, rnd() * S, 6 + rnd() * 24, 6 + rnd() * 24);
  }
  const cell = S / 8;
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const cx = i * cell + cell / 2, cy = j * cell + cell / 2, dir = (i + j) % 2 ? 1 : -1;
    x.save(); x.translate(cx, cy); x.rotate(dir * 0.72);
    x.fillStyle = 'rgba(9,12,19,0.55)'; x.fillRect(-cell * 0.34 + 1.5, -cell * 0.1 + 1.5, cell * 0.68, cell * 0.2);
    x.fillStyle = 'rgba(150,163,192,0.6)'; x.fillRect(-cell * 0.34, -cell * 0.1, cell * 0.68, cell * 0.2);
    x.restore();
  }
}, 256, 3.0);

/* Weathered rust — crane gantries, foundry structure. */
const SURF_RUST = surface((x, S) => {
  x.fillStyle = '#5d4030'; x.fillRect(0, 0, S, S);
  for (let n = 0; n < 900; n++) {                                    // fine corrosion grain
    const r = rnd();
    x.fillStyle = r < 0.42 ? 'rgba(44,30,22,' + (0.05 + rnd() * 0.13) + ')'
                : r < 0.78 ? 'rgba(122,74,42,' + (0.04 + rnd() * 0.12) + ')'
                           : 'rgba(96,98,102,' + (0.03 + rnd() * 0.09) + ')';
    x.beginPath(); x.arc(rnd() * S, rnd() * S, 1 + rnd() * 5, 0, 6.3); x.fill();
  }
  for (let n = 0; n < 60; n++) {                                     // rust runs down the plate
    x.fillStyle = 'rgba(52,32,20,' + (0.05 + rnd() * 0.1) + ')';
    x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 16 + rnd() * 70);
  }
  x.strokeStyle = 'rgba(30,20,14,0.55)'; x.lineWidth = 2;            // plate seams
  for (let i = 0; i <= 2; i++) {
    x.beginPath(); x.moveTo(i * S / 2, 0); x.lineTo(i * S / 2, S); x.stroke();
  }
  for (let k = 0; k < S; k += 18) {                                  // rivets
    x.fillStyle = 'rgba(150,126,104,0.28)';
    x.beginPath(); x.arc(S / 2, k, 2.2, 0, 6.3); x.fill();
  }
}, 256, 2.0);

/* Hazard chevrons — stair feet, platform edges, anywhere a drop wants marking. */
const hazardTex = (function () {
  const S = 64, c = texCanvas(S), x = c.getContext('2d');
  x.fillStyle = '#14161c'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#f2b13a'; x.lineWidth = 12;
  for (let i = -1; i < 3; i++) {
    x.beginPath(); x.moveTo(i * S / 2, 0); x.lineTo(i * S / 2 + S, S); x.stroke();
  }
  for (let n = 0; n < 40; n++) {                                     // worn paint
    x.fillStyle = 'rgba(20,22,28,' + (0.06 + rnd() * 0.2) + ')';
    x.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 10, 2 + rnd() * 10);
  }
  return wrapTex(c);
})();
const facadeMats = winTex.map(t => new T.MeshStandardMaterial({
  color: 0x090c14, roughness: 0.55, metalness: 0.25,
  emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.25, side: T.DoubleSide
}));

function facadeUV(geo, w, h, d) {
  const uv = geo.attributes.uv, K = 19.2;
  const sc = [[d / K, h / K], [d / K, h / K], [w / K, d / K], [w / K, d / K], [w / K, h / K], [w / K, h / K]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * sc[f][0], uv.getY(i) * sc[f][1]);
  }
  uv.needsUpdate = true;
}

/* one atlas for every neon sign — 16 variants, a single texture, a single draw call */
const SIGN_WORDS = ['RAMEN', 'VOLT', 'KIRA', 'HOTEL 88', 'DATA BAR', 'SYNTH-9', 'FUEL', 'NOODLE'];
const SIGN_HEX = ['#ff2f7a', '#7fe4ff', '#ffb347', '#a46bff', '#35ffc4'];
const SIGN_COLS = 4, SIGN_CELL = 256;
const signAtlas = (function () {
  const c = document.createElement('canvas');
  c.width = c.height = SIGN_COLS * SIGN_CELL;
  const x = c.getContext('2d');
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let i = 0; i < 16; i++) {
    const cx = (i % SIGN_COLS) * SIGN_CELL, cy = ((i / SIGN_COLS) | 0) * SIGN_CELL;
    const word = SIGN_WORDS[i % SIGN_WORDS.length];
    x.fillStyle = SIGN_HEX[i % SIGN_HEX.length];
    if (i < 8) {                                  // horizontal lockup
      x.font = '900 74px Impact, Haettenschweiler, "Arial Black", sans-serif';
      x.fillText(word, cx + SIGN_CELL / 2, cy + SIGN_CELL / 2);
    } else {                                      // vertical stack
      x.font = '700 46px Menlo, Consolas, monospace';
      const ch = word.replace(/[^A-Z0-9]/g, '').split('');
      const step = Math.min(48, (SIGN_CELL - 30) / ch.length);
      ch.forEach((s, k) => x.fillText(s, cx + SIGN_CELL / 2, cy + 26 + k * step));
    }
  }
  const t = new T.CanvasTexture(c);
  t.encoding = T.sRGBEncoding;
  return t;
})();
function signUV(geo, cell) {
  const u0 = (cell % SIGN_COLS) / SIGN_COLS, v0 = 1 - (((cell / SIGN_COLS) | 0) + 1) / SIGN_COLS;
  const uv = geo.attributes.uv, s = 1 / SIGN_COLS;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * s, v0 + uv.getY(i) * s);
  uv.needsUpdate = true;
  return geo;
}

const M4 = new T.Matrix4(), QT = new T.Quaternion(), V3 = new T.Vector3(), S3 = new T.Vector3(1, 1, 1);
function xform(x, y, z, ry) {
  QT.setFromAxisAngle(new T.Vector3(0, 1, 0), ry || 0);
  return new T.Matrix4().compose(V3.set(x, y, z), QT, S3);
}

/* ============================================================
   WORLD BUILDER
   Every static prop is funnelled into per-material buckets and merged into a
   single BufferGeometry, so a map with 3000 boxes still costs ~15 draw calls.
   ============================================================ */
const mapWorld = new T.Group();
scene.add(mapWorld);
const mapFx = new T.Group();
scene.add(mapFx);
const IDENT = new T.Matrix4();

function Builder() { this.groups = new Map(); }
Builder.prototype.add = function (mat, geo, mtx) {
  let a = this.groups.get(mat);
  if (!a) { a = []; this.groups.set(mat, a); }
  a.push({ geo: geo, matrix: mtx || IDENT.clone() });
};
Builder.prototype.box = function (mat, x, y, z, w, h, d, ry) {
  this.add(mat, new T.BoxGeometry(w, h, d), xform(x, y, z, ry));
};
Builder.prototype.cyl = function (mat, x, y, z, r, h, seg, ry) {
  this.add(mat, new T.CylinderGeometry(r, r, h, seg || 10), xform(x, y, z, ry));
};
Builder.prototype.quad = function (mat, x, y, z, w, h, ry, flat) {
  const q = new T.PlaneGeometry(w, h);
  if (flat) q.rotateX(-Math.PI / 2);
  this.add(mat, q, xform(x, y, z, ry));
};
Builder.prototype.sign = function (x, y, z, w, h, ry, cell) {
  this.add(signMat, signUV(new T.PlaneGeometry(w, h), cell), xform(x, y, z, ry));
};
Builder.prototype.flush = function (parent) {
  this.groups.forEach((list, mat) => {
    const m = new T.Mesh(mergeGeos(list), mat);
    m.matrixAutoUpdate = false;
    parent.add(m);
  });
  this.groups.clear();
};

/* shared, cached materials — never disposed between map loads */
const signMat = new T.MeshBasicMaterial({ map: signAtlas, alphaTest: 0.42, side: T.DoubleSide });
const MATC = {};
function M(key, opts) {
  if (MATC[key]) return MATC[key];
  return (MATC[key] = new T.MeshStandardMaterial(opts));
}
function neonMat(hex) {
  const k = 'neon' + hex;
  if (MATC[k]) return MATC[k];
  return (MATC[k] = new T.MeshBasicMaterial({ color: C(hex) }));
}
function glowMat(hex, op) {
  const k = 'glow' + hex + (op || 0);
  if (MATC[k]) return MATC[k];
  return (MATC[k] = new T.MeshBasicMaterial({
    color: C(hex), transparent: true, opacity: op || 0.06,
    blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
  }));
}
/* Materials now carry a map + normal map, and are tinted through `color` rather than
   being a flat colour on their own. `S()` caches exactly like M() does. */
function SMAT(key, surf, opts) {
  if (MATC[key]) return MATC[key];
  const o = Object.assign({ map: surf.map, normalMap: surf.normalMap, side: T.DoubleSide }, opts);
  if (o.normalScale === undefined) o.normalScale = new T.Vector2(1, 1);
  else o.normalScale = new T.Vector2(o.normalScale, o.normalScale);
  return (MATC[key] = new T.MeshStandardMaterial(o));
}
const MAT = {
  get concrete() { return SMAT('concrete', SURF_CONCRETE, { color: 0x656c7a, roughness: 0.95, metalness: 0.03 }); },
  get steel() { return SMAT('steel', SURF_PANEL, { color: 0x6e7789, roughness: 0.52, metalness: 0.30 }); },
  get deck() { return SMAT('deck', SURF_TREAD, { color: 0x646d80, roughness: 0.58, metalness: 0.26 }); },
  get tread() { return SMAT('tread', SURF_TREAD, { color: 0x737d92, roughness: 0.48, metalness: 0.34 }); },
  get tile() { return M('tile', { color: 0xffffff, map: tileTex, roughness: 0.34, metalness: 0.16, side: T.DoubleSide }); },
  get grime() { return SMAT('grime', SURF_PANEL, { color: 0x474d59, roughness: 0.95, metalness: 0.10, normalScale: 0.7 }); },
  get rust() { return SMAT('rust', SURF_RUST, { color: 0x5d5246, roughness: 0.9, metalness: 0.16 }); },
  get train() { return M('train', { color: 0x2b3a4a, roughness: 0.4, metalness: 0.7, side: T.DoubleSide }); },
  /* Painted floor hazard chevrons. Basic, unlit and laid just off the deck, so it reads
     the same at any time of day — it is a marking, not a surface. */
  get hazard() {
    if (MATC.hazard) return MATC.hazard;
    return (MATC.hazard = new T.MeshBasicMaterial({
      map: hazardTex, transparent: true, opacity: 0.62, depthWrite: false, side: T.DoubleSide
    }));
  }
};
/* Container skins: one cached material per livery colour, corrugated + normal-mapped.
   Five colours means five draw calls for every container on the map, merged. */
function containerMat(hex) {
  const k = 'cont' + hex;
  if (MATC[k]) return MATC[k];
  return (MATC[k] = new T.MeshStandardMaterial({
    color: C(hex), map: SURF_CORRUGATED.map, normalMap: SURF_CORRUGATED.normalMap,
    roughness: 0.68, metalness: 0.20, side: T.DoubleSide
  }));
}

function clearMapWorld() {
  const wipe = root => {
    while (root.children.length) {
      const o = root.children.pop();
      o.traverse(n => { if (n.geometry) n.geometry.dispose(); });   // materials are shared, keep them
    }
  };
  wipe(mapWorld); wipe(mapFx);
  stairTops.length = 0;
  blockers.length = 0;
  barrels.length = 0;
  landmarks.length = 0;
}

/* Box whose UVs repeat every `k` world units, so tiled textures do not stretch. */
function tiledBox(bd, mat, x, y, z, w, h, d, k, ry) {
  const geo = new T.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const sc = [[d / k, h / k], [d / k, h / k], [w / k, d / k], [w / k, d / k], [w / k, h / k], [w / k, h / k]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * sc[f][0], uv.getY(i) * sc[f][1]);
  }
  uv.needsUpdate = true;
  bd.add(mat, geo, xform(x, y, z, ry || 0));
}

/* ============================================================
   PROP KIT
   Shared pieces the maps are assembled from. Everything here is builder geometry that
   merges into the same handful of draw calls as the rest of the map — a container with
   corner castings and lock rods costs no more draw calls than the bare box it replaces,
   only vertices.
   ============================================================ */
const EUL = new T.Euler();
/* xform() only rotates about Y, which is all a box needs — but a stair stringer, a
   handrail and a diagonal brace all lie on a slope, so they need a full Euler. */
function xformE(x, y, z, rx, ry, rz) {
  EUL.set(rx || 0, ry || 0, rz || 0);
  QT.setFromEuler(EUL);
  return new T.Matrix4().compose(V3.set(x, y, z), QT, S3.set(1, 1, 1));
}
Builder.prototype.rbox = function (mat, x, y, z, w, h, d, rx, ry, rz) {
  this.add(mat, new T.BoxGeometry(w, h, d), xformE(x, y, z, rx, ry, rz));
};
/* Box whose texture repeats every `k` world units, so a 12 m wall and a 2 m crate
   show the same size seams and rivets instead of the texture stretching to fit. */
Builder.prototype.tbox = function (mat, x, y, z, w, h, d, k, ry) {
  tiledBox(this, mat, x, y, z, w, h, d, k || 2.4, ry);
};
/* A cylinder lying along an arbitrary tilt — rails, pipes, braces. */
Builder.prototype.tube = function (mat, x, y, z, r, len, rx, ry, rz, seg) {
  this.add(mat, new T.CylinderGeometry(r, r, len, seg || 8), xformE(x, y, z, rx, ry, rz));
};

/* ---------- railings ----------
   Stanchions, a top rail at 1.05 m and a knee rail, which is what an industrial
   guardrail actually is. Replaces the 0.5 m solid parapet strips the roof decks used —
   those read as a kerb, and hid the silhouette of anyone standing behind them. */
function railingRun(bd, x, z, len, horiz, y, accent, mat) {
  const m = mat || MAT.steel;
  const H = 1.05;
  const n = Math.max(2, Math.round(len / 2.2));
  for (let i = 0; i <= n; i++) {
    const f = (i / n - 0.5) * len;
    bd.box(m, x + (horiz ? f : 0), y + H / 2, z + (horiz ? 0 : f), 0.09, H, 0.09);
  }
  bd.box(m, x, y + H, z, horiz ? len : 0.1, 0.09, horiz ? 0.1 : len);          // top rail
  bd.box(m, x, y + H * 0.55, z, horiz ? len : 0.07, 0.06, horiz ? 0.07 : len); // knee rail
  bd.box(m, x, y + 0.06, z, horiz ? len : 0.12, 0.12, horiz ? 0.12 : len);     // toe board
  if (accent !== undefined && accent !== null) {
    bd.box(neonMat(accent), x, y + H + 0.07, z, horiz ? len * 0.98 : 0.05, 0.045, horiz ? 0.05 : len * 0.98);
  }
}

/* ---------- stairs ----------
   The old "ramps" were five slabs 0.68 m tall and 2.6 m deep — a staircase built for a
   giant, which is exactly the "stairs are too big" complaint: at that size the eye reads
   stacked crates, not steps. Commercial stairs are a 7 inch rise on an 11 inch tread
   (0.18 x 0.28 m); these use 0.26 m on 0.42 m, the game-legible exaggeration of the same
   ratio, so a 3.4 m platform gets 13 steps instead of 5 and climbs at about 32 degrees.
   Each step is its own blocker. A 0.26 m rise is far below STEP (1.3 m), so you walk up
   the flight smoothly rather than hopping ledges.
   `dir` is the direction the flight descends in; `horiz` runs it along x instead of z. */
function stairFlight(bd, o) {
  const top = o.top, wid = o.w, dir = o.dir, horiz = !!o.horiz;
  const base = o.base || 0, rise0 = 0.26;
  const n = Math.max(3, Math.round((top - base) / rise0));
  const rise = (top - base) / n, run = o.run || 0.42;
  const mat = o.mat || MAT.concrete, tread = o.tread || MAT.tread;
  const len = n * run;
  const along = (u) => horiz ? [o.x + dir * u, o.z] : [o.x, o.z + dir * u];

  for (let i = 0; i < n; i++) {
    const h = top - i * rise;                       // walking surface of this step
    const p = along((i + 0.5) * run);
    const bw = horiz ? run : wid, bd_ = horiz ? wid : run;
    bd.tbox(mat, p[0], (base + h) / 2, p[1], bw, h - base, bd_, 2.2);
    /* SEAM: collision volumes are padded past the geometry along the run. floorAt tests
       x > b.x - b.hw strictly, so two steps that abut EXACTLY leave their shared edge
       inside neither one, and it reads as floor height 0 — a crack at every riser. */
    // checker-plate tread, standing 25 mm proud of the riser: the nosing
    const np = along((i + 0.5) * run + run * 0.06);
    bd.tbox(tread, np[0], h - 0.024, np[1], horiz ? run * 1.12 : wid, 0.05, horiz ? wid : run * 1.12, 0.9);
    addBlocker(p[0], p[1], bw / 2 + (horiz ? 0.05 : 0), bd_ / 2 + (horiz ? 0 : 0.05), h);
    // lit nosing strip, so the flight reads as steps in the dark from across the map
    if (o.accent !== undefined && o.accent !== null) {
      const ep = along((i + 1) * run - 0.03);
      bd.box(neonMat(o.accent), ep[0], h - 0.04, ep[1],
             horiz ? 0.06 : wid * 0.94, 0.035, horiz ? wid * 0.94 : 0.06);
    }
  }
  // sloped stringers down both sides, and a handrail above them
  const slope = Math.atan2(top - base, len), hyp = Math.hypot(top - base, len);
  const mid = along(len / 2);
  for (const s of [1, -1]) {
    const ox = horiz ? 0 : s * (wid / 2 + 0.07), oz = horiz ? s * (wid / 2 + 0.07) : 0;
    const sy = base + (top - base) / 2 - 0.14;
    if (horiz) bd.rbox(MAT.steel, mid[0] + ox, sy, mid[1] + oz, hyp, 0.4, 0.14, 0, 0, -dir * slope);
    else bd.rbox(MAT.steel, mid[0] + ox, sy, mid[1] + oz, 0.14, 0.4, hyp, dir * slope, 0, 0);
    if (o.rail === false) continue;
    const ry = base + (top - base) / 2 + 0.98;
    if (horiz) bd.tube(MAT.steel, mid[0] + ox, ry, mid[1] + oz, 0.045, hyp, 0, 0, Math.PI / 2 + dir * slope, 7);
    else bd.tube(MAT.steel, mid[0] + ox, ry, mid[1] + oz, 0.045, hyp, Math.PI / 2 + dir * slope, 0, 0, 7);
    const posts = Math.max(2, Math.round(n / 4));
    for (let q = 0; q <= posts; q++) {
      const u = (q / posts) * len;
      const p = along(u);
      const stepTop = top - Math.min(n - 1, Math.floor(u / run)) * rise;
      bd.box(MAT.steel, p[0] + ox, stepTop + 0.5, p[1] + oz, 0.07, 1.0, 0.07);
    }
  }
  stairTops.push({ x: o.x, z: o.z, y: top, horiz: horiz, dir: dir });
  // hazard chevrons painted across the bottom tread
  const foot = along(len + 0.6);
  bd.quad(MAT.hazard, foot[0], base + 0.03, foot[1], horiz ? 1.1 : wid, horiz ? wid : 1.1, 0, true);
  return len;
}

/* ---------- ISO shipping container ----------
   Real proportions (ISO 668): 12.19 x 2.44 x 2.59 m for a 40 ft, 6.06 m for a 20 ft.
   The originals here were 12.2 x 6.0 x 5.2 flat-coloured boxes — twice the height and
   2.5x the width of the real thing, which is why a stack read as a pile of grey cubes
   rather than freight. Built from the parts a real one has: corrugated side walls set
   between top and bottom side rails, a corner post at each of the eight corners capped
   with an ISO 1161 cast fitting, and door gear (four lock rods on cam keepers, hinges)
   at one end only.
   Local coords are rotated into world by `ry`, so a stack can face any way. */
const CONTAINER_LIVERY = [0x7b3529, 0x25537c, 0x315f43, 0x8a6c29, 0x525863, 0x6c3156];
function containerProp(bd, x, y, z, ry, long, hue) {
  const L = long ? 12.19 : 6.06, W = 2.44, H = 2.59;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  // local (u along the length, v across) -> world
  const wx = (u, v) => x + u * cs + v * sn;
  const wz = (u, v) => z - u * sn + v * cs;
  const put = (mat, u, yy, v, w, h, d, k) => {
    if (k) bd.tbox(mat, wx(u, v), y + yy, wz(u, v), w, h, d, k, ry);
    else bd.box(mat, wx(u, v), y + yy, wz(u, v), w, h, d, ry);
  };
  const skin = containerMat(hue);
  // side walls and roof, inset so the rails and corner posts stand proud
  put(skin, 0, H / 2, 0, L - 0.14, H - 0.22, W - 0.05, 2.44);
  put(skin, 0, H - 0.09, 0, L - 0.16, 0.1, W - 0.16, 2.44);            // roof panel
  // top and bottom side rails
  put(MAT.steel, 0, 0.1, 0, L, 0.2, W, 2.4);
  put(MAT.steel, 0, H - 0.13, 0, L, 0.22, W, 2.4);
  // corner posts + ISO corner castings
  for (const su of [1, -1]) for (const sv of [1, -1]) {
    put(MAT.steel, su * (L / 2 - 0.08), H / 2, sv * (W / 2 - 0.06), 0.16, H, 0.16);
    for (const yy of [0.12, H - 0.13]) {
      put(MAT.steel, su * (L / 2 - 0.11), yy, sv * (W / 2 - 0.1), 0.26, 0.24, 0.22);
    }
  }
  // door end: four vertical lock rods on cam keepers, plus hinge blocks
  const de = L / 2 - 0.09;
  put(MAT.steel, de, H / 2, 0, 0.06, H - 0.3, W - 0.3);                 // door leaf plane
  for (let i = 0; i < 4; i++) {
    const v = (-1.5 + i) * (W / 5);
    bd.tube(MAT.steel, wx(de + 0.07, v), y + H / 2, wz(de + 0.07, v), 0.035, H - 0.5, 0, ry, 0, 6);
    for (const yy of [0.5, H - 0.5]) put(MAT.steel, de + 0.07, yy, v, 0.14, 0.16, 0.14);
    put(MAT.steel, de + 0.09, H * 0.52, v, 0.1, 0.3, 0.1);              // handle
  }
  for (const sv of [1, -1]) for (const yy of [0.45, H - 0.45]) {
    put(MAT.steel, de - 0.02, yy, sv * (W / 2 - 0.13), 0.2, 0.13, 0.13);
  }
  // fork pockets along the base of a 20 ft
  if (!long) for (const su of [1, -1]) for (const sv of [1, -1]) {
    put(MAT.grime, su * 0.9, 0.1, sv * (W / 2 - 0.02), 0.7, 0.14, 0.06);
  }
}

/* ---------- crate ----------
   Angle-iron at every corner, banded lid, a strip of hazard paint. Two lines of trim
   is the whole difference between "a cube" and "a thing in a warehouse". */
function crateProp(bd, x, y, z, w, h, d, mat, accent) {
  const m = mat || MAT.steel;
  bd.tbox(m, x, y + h / 2, z, w - 0.14, h - 0.12, d - 0.14, 1.6);
  bd.tbox(MAT.grime, x, y + h - 0.05, z, w, 0.12, d, 1.6);              // lid band
  bd.tbox(MAT.grime, x, y + 0.06, z, w, 0.14, d, 1.6);                  // base band
  for (const sx of [1, -1]) for (const sz of [1, -1]) {                 // corner angles
    bd.box(MAT.grime, x + sx * (w / 2 - 0.05), y + h / 2, z + sz * (d / 2 - 0.05), 0.12, h, 0.12);
  }
  if (accent !== undefined && accent !== null) {
    bd.box(neonMat(accent), x, y + h * 0.62, z + d / 2 + 0.02, w * 0.5, 0.07, 0.04);
    bd.box(neonMat(accent), x, y + h * 0.62, z - d / 2 - 0.02, w * 0.5, 0.07, 0.04);
  }
}

/* ---------- perimeter wall ----------
   Plinth, panelled body, coping cap, and a pilaster every few metres. A 2 m slab has no
   scale to it — you cannot tell whether it is five metres away or fifty. The pilasters
   are what give the eye a ruler. */
function wallRun(bd, cx, cz, len, horiz, h, mat, accent) {
  const t = 2.0;
  const dims = (w, hh, dd) => horiz ? [w, hh, dd] : [dd, hh, w];
  let a = dims(len, h - 1.0, t);
  bd.tbox(mat, cx, 0.55 + (h - 1.0) / 2, cz, a[0], a[1], a[2], 3.0);
  a = dims(len, 0.55, t + 0.34);
  bd.tbox(mat, cx, 0.28, cz, a[0], a[1], a[2], 3.0);                    // plinth
  a = dims(len, 0.34, t + 0.42);
  bd.tbox(mat, cx, h - 0.17, cz, a[0], a[1], a[2], 3.0);                // coping cap
  const n = Math.max(2, Math.round(len / 11));
  for (let i = 0; i <= n; i++) {
    const f = (i / n - 0.5) * len;
    a = dims(1.1, h - 0.34, t + 0.5);
    bd.tbox(mat, cx + (horiz ? f : 0), (h - 0.34) / 2 + 0.1, cz + (horiz ? 0 : f), a[0], a[1], a[2], 2.2);
  }
  if (accent !== undefined && accent !== null) {                        // datum line under the cap
    a = dims(len * 0.995, 0.08, 0.09);
    bd.box(neonMat(accent), cx, h - 0.52, cz, a[0], a[1], a[2]);
  }
}

/* ---------- pillar ----------
   A base, a shaft and a capital. A bare 1.6 m column is a pole; this is architecture. */
function pillarProp(bd, x, z, h, r, mat, accent) {
  const m = mat || MAT.concrete;
  bd.tbox(m, x, 0.3, z, r * 2.5, 0.6, r * 2.5, 1.6);                    // base
  bd.tbox(m, x, h / 2, z, r * 2, h, r * 2, 2.0);                        // shaft
  for (const s of [1, -1]) {                                            // flutes
    bd.box(MAT.grime, x + s * r, h / 2, z, 0.1, h * 0.94, r * 1.2);
    bd.box(MAT.grime, x, h / 2, z + s * r, r * 1.2, h * 0.94, 0.1);
  }
  bd.tbox(m, x, h - 0.28, z, r * 2.6, 0.56, r * 2.6, 1.6);              // capital
  if (accent !== undefined && accent !== null) {
    bd.box(neonMat(accent), x, h - 0.66, z, r * 2.1, 0.07, r * 2.1);
  }
}

/* ---------- lattice gantry ----------
   A crane leg is a truss, not a solid post: two chords with a zig-zag of web members
   between them. Reads as structure from any distance and costs a dozen thin boxes. */
function latticeBeam(bd, x, y, z, len, horiz, depth, mat) {
  const m = mat || MAT.rust;
  const dims = (w, hh, dd) => horiz ? [w, hh, dd] : [dd, hh, w];
  let a;
  for (const s of [1, -1]) {                                            // top and bottom chords
    a = dims(len, 0.22, 0.22);
    bd.box(m, x, y + s * depth / 2, z, a[0], a[1], a[2]);
    a = dims(len, 0.18, 0.18);                                          // side chords
    bd.box(m, x + (horiz ? 0 : s * depth / 2), y, z + (horiz ? s * depth / 2 : 0), a[0], a[1], a[2]);
  }
  const n = Math.max(3, Math.round(len / (depth * 1.15)));
  const seg = len / n, diag = Math.hypot(seg, depth), ang = Math.atan2(depth, seg);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) * seg - len / 2, up = i % 2 ? 1 : -1;
    if (horiz) {
      bd.rbox(m, x + f, y, z + depth / 2, diag, 0.14, 0.12, 0, 0, up * ang);
      bd.rbox(m, x + f, y, z - depth / 2, diag, 0.14, 0.12, 0, 0, -up * ang);
    } else {
      bd.rbox(m, x + depth / 2, y, z + f, 0.12, 0.14, diag, up * ang, 0, 0);
      bd.rbox(m, x - depth / 2, y, z + f, 0.12, 0.14, diag, -up * ang, 0, 0);
    }
  }
}

/* ---------- pipe run ----------
   Lagged pipework with flanged joints and hanger brackets. Industrial rooms are mostly
   pipe; a foundry with bare walls looks unbuilt. */
function pipeRun(bd, x, y, z, len, horiz, r, mat) {
  const m = mat || MAT.rust;
  bd.tube(m, x, y, z, r, len, horiz ? 0 : Math.PI / 2, 0, horiz ? Math.PI / 2 : 0, 10);
  const n = Math.max(2, Math.round(len / 7));
  for (let i = 0; i <= n; i++) {
    const f = (i / n - 0.5) * len;
    const px = x + (horiz ? f : 0), pz = z + (horiz ? 0 : f);
    bd.tube(m, px, y, pz, r * 1.35, 0.16, horiz ? 0 : Math.PI / 2, 0, horiz ? Math.PI / 2 : 0, 10);
    bd.box(MAT.steel, px, y + r + 0.16, pz, 0.12, 0.4, 0.12);           // hanger
  }
}

/* ---------- rooftop plant ----------
   A vent unit with a louvred face and a fan cowl, replacing the plain grey block that
   stood in for air conditioning on every roof deck. */
function ventProp(bd, x, y, z, w, h, d) {
  bd.tbox(MAT.grime, x, y + h / 2, z, w, h, d, 1.4);
  bd.tbox(MAT.steel, x, y + h + 0.06, z, w * 1.06, 0.12, d * 1.06, 1.4);
  for (let i = 0; i < 4; i++) {                                          // louvres
    bd.box(MAT.steel, x, y + 0.28 + i * 0.22, z + d / 2 + 0.03, w * 0.82, 0.1, 0.06);
  }
  bd.tube(MAT.steel, x + w * 0.22, y + h + 0.3, z, w * 0.22, 0.42, 0, 0, 0, 10);
  bd.tube(MAT.grime, x - w * 0.26, y + h + 0.5, z - d * 0.2, 0.09, 0.9, 0, 0, 0, 6);
}

/* A facade tower: window-lit sides + concrete cap, split out of one box, standing on a
   detailed street-level base. On a ground map you spend the whole round looking at the
   bottom four metres of these, and that was the one part with nothing on it — so it
   gets a plinth, a shopfront band, a canopy and a service riser. */
function tower(bd, x, z, w, d, h, capMat) {
  const box = new T.BoxGeometry(w, h, d);
  facadeUV(box, w, h, d);
  const nb = box.toNonIndexed();
  box.dispose();
  const m = xform(x, h / 2, z);
  bd.add(pick(facadeMats), sliceGeo(nb, [[0, 12], [24, 36]]), m.clone());
  bd.add(capMat || MAT.concrete, sliceGeo(nb, [[12, 24]]), m);
  nb.dispose();
  addBlocker(x, z, w / 2, d / 2, h);

  bd.tbox(MAT.concrete, x, 0.45, z, w + 0.5, 0.9, d + 0.5, 2.4);          // plinth
  bd.tbox(MAT.grime, x, 3.5, z, w + 0.16, 0.5, d + 0.16, 2.0);            // shopfront head
  bd.tbox(MAT.concrete, x, h - 0.4, z, w + 0.7, 0.8, d + 0.7, 2.6);       // cornice
  const face = chance(0.5) ? 1 : -1, axis = chance(0.5);
  const cx = x + (axis ? 0 : face * (w / 2 + 0.9)), cz = z + (axis ? face * (d / 2 + 0.9) : 0);
  bd.box(MAT.steel, cx, 3.15, cz, axis ? w * 0.7 : 1.8, 0.12, axis ? 1.8 : d * 0.7);   // canopy
  for (const s of [1, -1]) {                                              // canopy tie rods
    const tx = x + (axis ? s * w * 0.3 : face * (w / 2 + 0.1)), tz = z + (axis ? face * (d / 2 + 0.1) : s * d * 0.3);
    bd.rbox(MAT.steel, (tx + cx) / 2, 3.7, (tz + cz) / 2, axis ? 0.06 : 1.5, 0.06, axis ? 1.5 : 0.06,
            axis ? -face * 0.5 : 0, 0, axis ? 0 : face * 0.5);
  }
  // service riser and meter box down one corner
  const rx = x + (w / 2 + 0.12) * (chance(0.5) ? 1 : -1), rz = z + (d / 2 - 1.2) * (chance(0.5) ? 1 : -1);
  bd.tube(MAT.rust, rx, 4.5, rz, 0.16, 9, 0, 0, 0, 8);
  bd.tbox(MAT.grime, rx, 1.6, rz + 1.4, 0.7, 1.0, 0.5, 1.2);
  if (chance(0.5)) ventProp(bd, x + (w / 2 + 0.7) * face, 4.2, z, 1.6, 1.0, 1.2);
}

const NEONS = [CLR.ice, CLR.magenta, CLR.amber, CLR.violet, CLR.mint];
const landmarks = [];    // {x,z,label} drawn on the radar
/* Every flight built this run: {x,z,y} of its top landing. Nothing in the game reads
   this — test-traversal.js does, to assert each staircase actually reaches walkable
   ground, which is how the abutting-blocker seam (see SEAM in stairFlight) was caught. */
const stairTops = [];

/* ---------------- RAIN DISTRICT ---------------- */
function buildRainDistrict(bd) {
  const S = 26, span = 4;
  // carve a random plaza cluster plus a couple of scattered empty lots
  const clear = {};
  const cx0 = rint(-1, 1), cz0 = rint(-1, 1);
  clear[cx0 + ',' + cz0] = 1;
  clear[(cx0 + 1) + ',' + cz0] = 1;
  clear[cx0 + ',' + (cz0 + 1)] = 1;
  for (let n = 0; n < 4; n++) clear[rint(-span, span) + ',' + rint(-span, span)] = 1;
  const exI = rint(-span, span), exJ = chance(0.5) ? -span : span;
  clear[exI + ',' + exJ] = 1;
  MAPS.rain.spawn = [cx0 * S, cz0 * S];
  MAPS.rain.extraction = [exI * S, exJ * S];
  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      if (clear[i + ',' + j]) continue;
      const edge = Math.max(Math.abs(i), Math.abs(j));
      const w = rand(11, 15), d = rand(11, 15);
      const h = edge >= 3 ? rand(28, 62) : rand(12, 40);
      const x = i * S + rand(-1.4, 1.4), z = j * S + rand(-1.4, 1.4);
      tower(bd, x, z, w, d, h);

      /* Seeded RNG only, never Math.random(), anywhere that decides geometry. These
         coin flips gate blocks that go on to call the seeded rand() below, so an
         unseeded flip changed HOW MANY seeded draws happened and desynchronised the
         stream from that building onward. Two clients given the same runSeed still
         generated different cities — same map, different walls to walk into. */
      // pooled light at the base, neon band or hanging sign on one face
      bd.quad(glowMat(pick(NEONS), 0.055), x, 0.06, z + (d / 2 + 4) * (chance(0.5) ? 1 : -1), w * 1.6, 8, 0, true);
      const face = chance(0.5) ? 1 : -1, axis = chance(0.5);
      const y = rand(4, Math.min(h - 2, 30));
      if (chance(0.45)) {
        const bx2 = x + (axis ? 0 : face * (w / 2 + 0.2)), bz2 = z + (axis ? face * (d / 2 + 0.2) : 0);
        bd.box(MAT.steel, bx2 - (axis ? 0 : face * 0.12), y, bz2 - (axis ? face * 0.12 : 0),
          axis ? w * 0.95 : 0.5, 0.62, axis ? 0.5 : d * 0.95);        // housing
        bd.box(neonMat(pick(NEONS)), bx2, y, bz2,
          axis ? w * 0.9 : 0.3, 0.28, axis ? 0.3 : d * 0.9);          // tube
      } else {
        const vert = chance(0.55);
        const cell = vert ? 8 + rint(0, 7) : rint(0, 7);
        if (axis) bd.sign(x, y, z + face * (d / 2 + 0.35), vert ? 2 : 6.4, vert ? 8 : 1.6, 0, cell);
        else bd.sign(x + face * (w / 2 + 0.35), y, z, vert ? 2 : 6.4, vert ? 8 : 1.6, Math.PI / 2, cell);
      }
      if (chance(0.45)) bd.cyl(MAT.concrete, x + rand(-3, 3), h + 3, z + rand(-3, 3), 0.15, rand(3, 8), 5);
    }
  }
  /* Stacked containers give you something to climb and fight from. Real 20 ft boxes at
     ISO proportions, stepped back as they go up so the stack reads as freight someone
     parked rather than a tapered grey wedge. */
  const stacks = [];
  for (let n = 0; n < 5; n++) stacks.push([rint(-3, 3) * S + 13, rint(-3, 3) * S + 13]);
  const CH = 2.59;
  stacks.forEach((p, n) => {
    for (let k = 0; k < 2; k++) {
      const jog = k * 0.7;
      containerProp(bd, p[0] + jog, k * CH, p[1], 0, false,
                    CONTAINER_LIVERY[(n + k) % CONTAINER_LIVERY.length]);
      addBlocker(p[0] + jog, p[1], 3.03, 1.22, (k + 1) * CH);
      bd.box(neonMat(NEONS[(n + k) % 5]), p[0] + jog, k * CH + CH - 0.5, p[1] + 1.28, 3.6, 0.09, 0.06);
    }
    /* Pallet steps, so the pile is climbable: a container roof is 2.59 m and you can
       only step 1.3 m, so without these the stacks were cover you could never get on top
       of — which is not what "something to climb and fight from" means. */
    crateProp(bd, p[0] - 3.6, 0, p[1] + 2.05, 2.0, 1.15, 1.8, MAT.grime, null);
    addBlocker(p[0] - 3.6, p[1] + 2.05, 1.0, 0.95, 1.15, true);
    crateProp(bd, p[0] - 1.7, 0, p[1] + 2.05, 1.8, 2.25, 1.8, MAT.grime, null);
    addBlocker(p[0] - 1.7, p[1] + 2.05, 0.95, 0.95, 2.25, true);
    bd.tube(MAT.rust, p[0] + 4.2, 0.75, p[1] - 1.6, 0.55, 1.5, 0, 0, 0, 12);
    landmarks.push({ x: p[0], z: p[1], label: 'STACK' });
  });
  /* Boulevard gantries down the main streets. Latticed masts and a trussed crossbeam
     with a shrouded tube slung under it — the old version was four plain bars, which at
     street level is the most-seen silhouette on the map. */
  for (let k = -3; k <= 3; k++) {
    if (!k) continue;
    for (const s of [1, -1]) {
      latticeBeam(bd, s * 7.4, 4.6, k * 26, 9.2, false, 0.7, MAT.steel);
      bd.tbox(MAT.concrete, s * 7.4, 0.3, k * 26, 1.5, 0.6, 1.5, 1.2);       // mast footing
      bd.rbox(MAT.steel, s * 6.2, 8.4, k * 26, 2.4, 0.16, 0.16, 0, 0, -s * 0.5);  // knee brace
    }
    latticeBeam(bd, 0, 9.05, k * 26, 15.4, true, 0.7, MAT.steel);
    bd.tbox(MAT.grime, 0, 8.62, k * 26, 14, 0.3, 0.44, 1.6);                 // tube shroud
    bd.box(neonMat(CLR.ice), 0, 8.44, k * 26, 13.6, 0.12, 0.2);
    for (const s of [1, -1]) {
      latticeBeam(bd, k * 26, 4.6, s * 7.4, 9.2, false, 0.7, MAT.steel);
      bd.tbox(MAT.concrete, k * 26, 0.3, s * 7.4, 1.5, 0.6, 1.5, 1.2);
      bd.rbox(MAT.steel, k * 26, 8.4, s * 6.2, 0.16, 0.16, 2.4, s * 0.5, 0, 0);
    }
    latticeBeam(bd, k * 26, 9.05, 0, 15.4, false, 0.7, MAT.steel);
    bd.tbox(MAT.grime, k * 26, 8.62, 0, 0.44, 0.3, 14, 1.6);
    bd.box(neonMat(CLR.magenta), k * 26, 8.44, 0, 0.2, 0.12, 13.6);
  }
  scatterBarrels(bd, 16, 0);
}

/* ---------------- SUNKEN METRO ---------------- */
/* ---------------- CONTAINER YARD ----------------
   A three-lane map, the standard competitive FPS layout, and the replacement for the old
   Sunken Metro (a single enclosed trench where one held angle covered everything).

   Layout, running north-south:

       WEST LANE  |  MID LANE  |  EAST LANE
        containers |  the yard  |  containers
                   |   tower    |

   The design rules it follows:
   - **Three lanes, one chokepoint each.** No single position covers more than one lane —
     the two lane-divider walls see to that.
   - **Cross-links.** Gaps in the dividers at roughly a third and two thirds of the length
     let you rotate between lanes, which turns three corridors into two loops (the
     figure-of-eight that keeps players circulating instead of camping an end).
   - **A contested middle.** The tower in the mid lane is the strongest position and the
     most exposed, so holding it costs something.
   - **180-degree rotational symmetry**, like the other arenas, so Team Deathmatch cannot
     hand one side better ground. A test asserts this rather than trusting it. */
function buildContainerYard(bd) {
  const B = MAPS.yard.bounds;
  const wallH = 14;
  const accent = MAPS.yard.accent;
  const laneX = B * 0.36;              // the two lane dividers
  const linkZ = B * 0.34;              // where the dividers are cut for cross-links
  const linkHalf = B * 0.11;           // half-width of each cut

  // --- perimeter ---
  const t = 2.0;
  wallRun(bd, 0, B, B * 2, true, wallH, MAT.concrete, accent);
  wallRun(bd, 0, -B, B * 2, true, wallH, MAT.concrete, accent);
  wallRun(bd, B, 0, B * 2, false, wallH, MAT.concrete, accent);
  wallRun(bd, -B, 0, B * 2, false, wallH, MAT.concrete, accent);
  addBlocker(0, B, B, t / 2 + 0.4, wallH, false);
  addBlocker(0, -B, B, t / 2 + 0.4, wallH, false);
  addBlocker(B, 0, t / 2 + 0.4, B, wallH, false);
  addBlocker(-B, 0, t / 2 + 0.4, B, wallH, false);
  // floodlight masts on the perimeter, mirrored
  [1, -1].forEach(s => {
    [1, -1].forEach(sx => {
      const x = sx * B * 0.7, z = s * (B - 3);
      bd.tbox(MAT.steel, x, 8, z, 0.5, 16, 0.5, 2.4);
      bd.box(MAT.grime, x, 16.3, z, 2.6, 0.5, 1.0);
      bd.box(neonMat(0xfff0c0), x, 15.95, z - s * 0.15, 2.2, 0.24, 0.5);
      bd.quad(glowMat(0xffe6a0, 0.05), x, 0.06, z - s * 9, 16, 20, 0, true);
    });
  });

  /* Mirror every piece through the origin: place once, get both halves. */
  const place = (x, z, w, h, d, mat, walk) => {
    [[x, z], [-x, -z]].forEach(p => {
      bd.box(mat, p[0], h / 2, p[1], w, h, d);
      addBlocker(p[0], p[1], w / 2, d / 2, h, walk);
    });
  };

  /* --- lane dividers, cut for the cross-links ---
     Each divider is three segments: two long ends and a short middle, with the two gaps
     between them being the links. Built as a double-stacked run of containers rather
     than a steel slab — this is a freight yard, so the walls of it are freight, and a
     row of liveried boxes tells you far more about distance than a flat wall does.
     Two containers stack to 5.18 m, which is what sets the divider height. */
  const CH = 2.59;                                   // ISO container height
  const segH = CH * 2;
  const runContainers = (x, zc, zlen, seed) => {
    const step = 12.19 + 0.35;
    const n = Math.max(1, Math.round(zlen / step));
    const gap = zlen / n;
    for (let i = 0; i < n; i++) {
      const z = zc - zlen / 2 + gap * (i + 0.5);
      for (let k = 0; k < 2; k++) {
        // the upper tier is nudged along, the way a stack never lines up perfectly
        const jog = k ? (((i + seed) % 3) - 1) * 0.5 : 0;
        containerProp(bd, x + (k ? 0.06 : 0), k * CH, z + jog, Math.PI / 2, true,
                      CONTAINER_LIVERY[(i + k * 2 + seed) % CONTAINER_LIVERY.length]);
      }
    }
  };
  [1, -1].forEach(side => {
    const x = side * laneX;
    const aLen = B - linkZ - linkHalf;
    const aC = (B + linkZ + linkHalf) / 2;
    runContainers(x, aC, aLen, side > 0 ? 0 : 3);
    addBlocker(x, aC, 1.35, aLen / 2, segH);
    const mLen = (linkZ - linkHalf) * 2;
    runContainers(x, 0, mLen, side > 0 ? 1 : 4);
    addBlocker(x, 0, 1.35, mLen / 2, segH);
    runContainers(x, -aC, aLen, side > 0 ? 2 : 5);
    addBlocker(x, -aC, 1.35, aLen / 2, segH);
    // lit edge marking each cross-link mouth
    [linkZ, -linkZ].forEach(z => {
      bd.box(neonMat(accent), x, segH + 0.35, z, 1.7, 0.14, linkHalf * 2);
      bd.tbox(MAT.steel, x, segH + 0.16, z, 1.9, 0.3, linkHalf * 2, 2.0);
      bd.quad(MAT.hazard, x, 0.04, z, 2.6, linkHalf * 2, 0, true);
    });
  });

  /* --- mid lane: the tower ---
     Raised, climbable from two sides, and the only place with sight down all three lanes
     — which is exactly why it is also the most exposed. A checker-plate deck carried on
     legs and braces, with a guardrail instead of a solid lip. */
  const tw = 15, th = 4.2;
  bd.tbox(MAT.deck, 0, th - 0.2, 0, tw, 0.4, tw, 0.95);                  // deck slab
  bd.tbox(MAT.grime, 0, (th - 0.4) / 2, 0, tw * 0.62, th - 0.4, tw * 0.62, 2.4);  // core
  for (const sx of [1, -1]) for (const sz of [1, -1]) {                 // legs and knee braces
    bd.tbox(MAT.steel, sx * (tw / 2 - 0.5), (th - 0.4) / 2, sz * (tw / 2 - 0.5), 0.5, th - 0.4, 0.5, 2.0);
    bd.rbox(MAT.steel, sx * (tw / 2 - 1.5), th - 1.4, sz * (tw / 2 - 0.5), 2.4, 0.2, 0.2, 0, 0, sx * 0.7);
    bd.rbox(MAT.steel, sx * (tw / 2 - 0.5), th - 1.4, sz * (tw / 2 - 1.5), 0.2, 0.2, 2.4, -sz * 0.7, 0, 0);
  }
  addBlocker(0, 0, tw / 2, tw / 2, th);
  bd.quad(glowMat(accent, 0.11), 0, th + 0.06, 0, tw * 0.9, tw * 0.9, 0, true);
  // guardrail along the two flanks, cover along the two approach faces
  [1, -1].forEach(s => {
    railingRun(bd, s * tw / 2, 0, tw, false, th, accent);
    bd.tbox(MAT.steel, 0, th + 0.5, s * tw / 2, tw, 1.0, 0.5, 2.0);
    addBlocker(0, s * tw / 2, tw / 2, 0.35, th + 1.0);
    bd.box(neonMat(accent), 0, th + 1.02, s * (tw / 2 + 0.28), tw * 0.92, 0.06, 0.05);
  });
  // stairs up the mirrored axis, replacing the four 1 m slabs that used to stand here
  [1, -1].forEach(s => {
    stairFlight(bd, { x: 0, z: s * (tw / 2 + 0.3), top: th, w: 4.2, dir: s, accent: accent,
                      mat: MAT.grime });
  });

  /* --- shipping containers: the cover in every lane ---
     Real 40 ft and 20 ft boxes, in pairs where a lane needs a wide block of cover, and
     stacked two or three high where it needs a wall. Colour-coded liveries, because a
     yard of identical grey boxes is unreadable at speed. */
  const CL = CONTAINER_LIVERY;
  /* `across` puts two boxes side by side, which is how the yard gets deep cover now that
     a container is a realistic 2.44 m wide instead of the old 6 m. */
  const stack = (x, z, ry, tier, n, long, across) => {
    const L = long ? 12.19 : 6.06;
    [[x, z], [-x, -z]].forEach((p, mi) => {
      for (let k = 0; k < tier; k++) {
        for (let a = 0; a < (across ? 2 : 1); a++) {
          const off = across ? (a - 0.5) * 2.62 : 0;
          const ox = ry ? off : 0, oz = ry ? 0 : off;
          containerProp(bd, p[0] + ox + (k % 2) * 0.25, k * CH, p[1] + oz, ry ? Math.PI / 2 : 0,
                        long, CL[(n + k + a * 2 + mi) % CL.length]);
        }
      }
      const w = ry ? (across ? 5.3 : 2.6) : L / 2 * 2;
      const d = ry ? L : (across ? 5.3 : 2.6);
      addBlocker(p[0], p[1], (ry ? (across ? 2.65 : 1.3) : L / 2), (ry ? L / 2 : (across ? 2.65 : 1.3)), CH * tier);
    });
  };
  // west lane stacks
  stack(-B * 0.62, B * 0.55, false, 2, 0, true, true);
  stack(-B * 0.58, B * 0.10, true, 1, 1, true, true);
  stack(-B * 0.70, -B * 0.28, false, 2, 2, false, true);
  // mid lane: sightline breakers, single height so the tower still overlooks them
  stack(-B * 0.14, B * 0.46, true, 1, 3, true, false);
  stack(B * 0.16, B * 0.66, false, 1, 4, false, true);
  // east lane stacks
  stack(B * 0.64, B * 0.42, false, 3, 2, true, true);
  stack(B * 0.60, -B * 0.06, true, 1, 3, true, true);

  // crane gantries overhead: latticed, so they read as structure rather than a bar
  [1, -1].forEach(s => {
    const z = s * B * 0.5;
    latticeBeam(bd, 0, 11, z, B * 1.7, true, 1.5);
    [-1, 1].forEach(sx => {
      latticeBeam(bd, sx * B * 0.8, 5.5, z, 11, false, 1.5);
      addBlocker(sx * B * 0.8, z, 0.9, 0.9, 11);
      // rail the leg stands on
      bd.tbox(MAT.rust, sx * B * 0.8, 0.12, z, 3.2, 0.24, 3.2, 1.6);
    });
    bd.box(neonMat(accent), 0, 10.0, z, B * 1.6, 0.12, 0.12);
    // the trolley, parked off-centre
    bd.tbox(MAT.grime, s * 12, 10.4, z, 3.4, 1.6, 2.6, 2.0);
    bd.tube(MAT.steel, s * 12, 7.6, z, 0.05, 4.0, 0, 0, 0, 6);
    bd.tbox(MAT.rust, s * 12, 5.3, z, 1.6, 0.7, 1.2, 1.2);              // hook block
  });

  // floor guides toward each spawn
  [1, -1].forEach(s => bd.quad(glowMat(accent, 0.07), 0, 0.05, s * B * 0.82, B * 0.4, 5, 0, true));
  // painted lane numbers on the deck, and kerb markings at the lane mouths
  [1, -1].forEach(s => {
    [-1, 1].forEach(sx => bd.quad(MAT.hazard, sx * laneX * 0.55, 0.03, s * B * 0.72, 3, 14, 0, true));
  });

  landmarks.push({ x: 0, z: 0, label: 'TOWER' });
  landmarks.push({ x: -laneX - 8, z: 0, label: 'WEST' });
  landmarks.push({ x: laneX + 8, z: 0, label: 'EAST' });
}

/* ---------------- NEON HEIGHTS ---------------- */
function buildNeonHeights(bd) {
  const decks = [];
  const S = 30;
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (Math.abs(i) === 2 && Math.abs(j) === 2) continue;
      // punch out a couple of random plots for wider gaps, never the centre
      if ((i || j) && Math.abs(i) + Math.abs(j) > 1 && chance(0.16)) continue;
      const x = i * S, z = j * S;
      const w = rand(19, 25), d = rand(19, 25);
      // Terraced: every orthogonal neighbour differs by exactly one step height,
      // so bridges are walkable in both directions without stairs.
      const top = 18 - (Math.abs(i) + Math.abs(j)) * 1.2;
      decks.push({ x: x, z: z, w: w, d: d, top: top });
    }
  }
  // Random plot removal can strand a deck. Flood-fill from the centre and drop
  // anything that isn't orthogonally connected, so the terrace is always walkable.
  (function pruneIslands() {
    const key = k => Math.round(k.x / S) + ',' + Math.round(k.z / S);
    const bySlot = {};
    decks.forEach(k => bySlot[key(k)] = k);
    const root = bySlot['0,0'] || decks[0];
    if (!root) return;
    const seen = {}, q = [key(root)];
    seen[q[0]] = 1;
    while (q.length) {
      const p = q.pop().split(',').map(Number);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(d => {
        const nk = (p[0] + d[0]) + ',' + (p[1] + d[1]);
        if (bySlot[nk] && !seen[nk]) { seen[nk] = 1; q.push(nk); }
      });
    }
    for (let i = decks.length - 1; i >= 0; i--) if (!seen[key(decks[i])]) decks.splice(i, 1);
  })();

  decks.forEach((k, n) => {
    // tower shaft with lit windows, then a solid roof deck on top
    const box = new T.BoxGeometry(k.w, k.top + 34, k.d);
    facadeUV(box, k.w, k.top + 34, k.d);
    const nb = box.toNonIndexed(); box.dispose();
    const m = xform(k.x, (k.top + 34) / 2 - 34, k.z);
    bd.add(facadeMats[n % facadeMats.length], sliceGeo(nb, [[0, 12], [24, 36]]), m.clone());
    bd.add(MAT.deck, sliceGeo(nb, [[12, 24]]), m);
    nb.dispose();
    addBlocker(k.x, k.z, k.w / 2, k.d / 2, k.top);

    // guardrail, roof plant, and vaultable kit — a 0.52 m lip read as a kerb and hid
    // nobody; a stanchion rail reads as a roof edge and leaves silhouettes visible.
    railingRun(bd, k.x, k.z + k.d / 2, k.w, true, k.top, null);
    railingRun(bd, k.x, k.z - k.d / 2, k.w, true, k.top, null);
    railingRun(bd, k.x + k.w / 2, k.z, k.d, false, k.top, null);
    railingRun(bd, k.x - k.w / 2, k.z, k.d, false, k.top, null);
    bd.tbox(MAT.deck, k.x, k.top + 0.04, k.z, k.w * 0.98, 0.08, k.d * 0.98, 0.95);  // roof deck
    const ac = [[-4, -4], [5, 3]];
    ac.forEach(o => {
      ventProp(bd, k.x + o[0], k.top, k.z + o[1], 3.4, 1.2, 3.4);
      addBlocker(k.x + o[0], k.z + o[1], 1.7, 1.7, k.top + 1.2);
    });
    // a water tank and a stair head, the furniture every rooftop actually carries
    bd.tube(MAT.rust, k.x + k.w * 0.3, k.top + 2.4, k.z - k.d * 0.28, 1.5, 2.6, 0, 0, 0, 12);
    for (const s of [1, -1]) {
      bd.rbox(MAT.steel, k.x + k.w * 0.3 + s * 1.4, k.top + 0.6, k.z - k.d * 0.28, 0.14, 1.4, 0.14, 0, 0, s * 0.12);
    }
    bd.tbox(MAT.grime, k.x - k.w * 0.3, k.top + 1.1, k.z + k.d * 0.3, 3.0, 2.2, 2.6, 2.0);
    addBlocker(k.x - k.w * 0.3, k.z + k.d * 0.3, 1.5, 1.3, k.top + 2.2);
    const nc = NEONS[n % 5];
    bd.box(MAT.steel, k.x, k.top + 0.98, k.z + k.d / 2 - 0.05, k.w * 0.82, 0.2, 0.22);
    bd.box(neonMat(nc), k.x, k.top + 0.92, k.z + k.d / 2 - 0.16, k.w * 0.8, 0.09, 0.09);
    bd.quad(glowMat(nc, 0.09), k.x, k.top + 0.1, k.z, k.w * 0.9, k.d * 0.9, 0, true);
    if (n % 3 === 0) {
      bd.box(MAT.steel, k.x - k.w / 2 + 1, k.top + 5, k.z - k.d / 2 + 1, 0.4, 10, 0.4);
      bd.sign(k.x - k.w / 2 + 1, k.top + 8, k.z - k.d / 2 + 1, 2.4, 9, Math.PI / 4, 8 + (n % 8));
    }
  });
  /* Bridges: the only way across the gaps. A deck plate on a latticed spine, with a
     handrail down both sides — the old version was a 0.5 m slab and a neon line, which
     from below looked like a floating plank. */
  function bridge(a, b) {
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const top = Math.max(a.top, b.top);
    const horiz = Math.abs(a.x - b.x) > Math.abs(a.z - b.z);
    const len = horiz ? Math.abs(a.x - b.x) : Math.abs(a.z - b.z);
    bd.tbox(MAT.deck, mx, top - 0.12, mz, horiz ? len : 3.6, 0.24, horiz ? 3.6 : len, 0.95);
    latticeBeam(bd, mx, top - 0.62, mz, len, horiz, 0.8, MAT.steel);
    addBlocker(mx, mz, horiz ? len / 2 : 1.8, horiz ? 1.8 : len / 2, top);
    for (const s of [1, -1]) {
      const ox = horiz ? 0 : s * 1.8, oz = horiz ? s * 1.8 : 0;
      railingRun(bd, mx + ox, mz + oz, len, horiz, top, CLR.mint);
    }
  }
  const at = (x, z) => decks.find(k => k.x === x * S && k.z === z * S);
  // connect every orthogonally adjacent pair — the whole terrace is traversable
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const A = at(i, j);
      if (!A) continue;
      const R = at(i + 1, j), D = at(i, j + 1);
      if (R) bridge(A, R);
      if (D) bridge(A, D);
    }
  }

  // central spire above the middle deck
  const mid = at(0, 0);
  if (mid) {
    bd.cyl(MAT.steel, mid.x, mid.top + 16, mid.z, 1.2, 32, 12);
    for (let k = 0; k < 5; k++) bd.box(neonMat(CLR.magenta), mid.x, mid.top + 4 + k * 6, mid.z, 3.2, 0.16, 3.2);
    landmarks.push({ x: mid.x, z: mid.z, label: 'SPIRE' });
  }
  const sp = decks[(srand() * decks.length) | 0];
  MAPS.heights.spawn = [sp.x, sp.z];
  MAPS.heights.spawnY = sp.top;
  // extraction goes on the deck furthest from the drop point
  let ex = decks[0], far = -1;
  decks.forEach(k => {
    const d = Math.hypot(k.x - sp.x, k.z - sp.z);
    if (d > far) { far = d; ex = k; }
  });
  MAPS.heights.extraction = [ex.x, ex.z];
  MAPS.heights.padY = ex.top + 0.12;
  scatterBarrels(bd, 10, null);
}

/* ---------------- destructible barrels ---------------- */
const barrels = [];
function scatterBarrels(bd, n, forceY) {
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < 30; t++) {
      const x = rand(-CFG.bounds + 12, CFG.bounds - 12), z = rand(-CFG.bounds + 12, CFG.bounds - 12);
      if (hitsWall(x, z, 2.2)) continue;
      const y = forceY !== null && forceY !== undefined ? forceY : floorAt(x, z);
      if (y <= MAPS[currentMap].floorY + 0.5 && MAPS[currentMap].floorY < -5) continue;
      barrels.push({ x: x, y: y, z: z, live: true, idx: barrels.length });
      break;
    }
  }
}
/* ---------- extraction pad ---------- */
const padPos = new T.Vector3(0, 0, -78);
const padGroup = new T.Group();
padGroup.position.copy(padPos);
scene.add(padGroup);
const padMat = new T.MeshBasicMaterial({ color: C(0x35ffc4), transparent: true, opacity: 0.10, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
const padDisc = new T.Mesh(new T.CircleGeometry(7.5, 48), padMat);
padDisc.rotation.x = -Math.PI / 2; padDisc.position.y = 0.05;
padGroup.add(padDisc);
const padRing = new T.Mesh(new T.RingGeometry(7.0, 7.6, 64), new T.MeshBasicMaterial({ color: C(0x35ffc4), side: T.DoubleSide }));
padRing.rotation.x = -Math.PI / 2; padRing.position.y = 0.07;
padGroup.add(padRing);
const padBeam = new T.Mesh(new T.CylinderGeometry(6.4, 7.4, 60, 32, 1, true),
  new T.MeshBasicMaterial({ color: C(0x35ffc4), transparent: true, opacity: 0.05, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false }));
padBeam.position.y = 30;
padGroup.add(padBeam);
padGroup.visible = false;

/* ---------- destructible barrels ---------- */
const barrelGeo = new T.CylinderGeometry(0.52, 0.58, 1.5, 12);
const barrelBandGeo = new T.TorusGeometry(0.56, 0.055, 6, 14).rotateX(Math.PI / 2);
const barrelMat = new T.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.6, metalness: 0.55 });
const barrelHotMat = new T.MeshBasicMaterial({ color: C(0xff7a18) });
const barrelMeshes = [];
const flashLightPool = [];
for (let i = 0; i < 3; i++) {
  const L = new T.PointLight(0xffa040, 0, 26, 2);
  L.visible = false; scene.add(L); flashLightPool.push(L);
}
function buildBarrelMeshes() {
  barrelMeshes.forEach(m => { m.visible = false; });
  barrels.forEach((b, i) => {
    let g = barrelMeshes[i];
    if (!g) {
      g = new T.Group();
      g.add(new T.Mesh(barrelGeo, barrelMat));
      const band = new T.Mesh(barrelBandGeo, barrelHotMat); band.position.y = 0.28; g.add(band);
      const band2 = new T.Mesh(barrelBandGeo, barrelHotMat); band2.position.y = -0.28; g.add(band2);
      scene.add(g);
      barrelMeshes[i] = g;
    }
    g.position.set(b.x, b.y + 0.75, b.z);
    g.rotation.y = rand(0, 6.28);
    g.visible = true;
    b.mesh = g;
    b.live = true;
    if (!b.blocker) {
      addBlocker(b.x, b.z, 0.62, 0.62, b.y + 1.5, false);
      b.blocker = blockers[blockers.length - 1];
      b.blocker.barrel = b;
    }
    b.blocker.off = false;
  });
}
function boom(p, radius, dmg) {
  /* PvP shrinks the blast (see PVP_TUNE in 05-weapons.js) so explosives can't be spammed
     into a doorway as a substitute for aiming. */
  const tune = typeof pvpTune === 'function' ? pvpTune('flak') : { blast: 1, dmg: 1 };
  radius *= tune.blast;
  /* One aggregate hitmarker and one sound for the blast, not one per victim — see the
     `quiet` note on damageEnemy. This is what stopped multi-kill explosions stuttering. */
  boomNumbers = 0;
  let struck = 0;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const d = e.g.position.distanceTo(p);
    if (d < radius) { damageEnemy(e, dmg * (1 - d / radius), e.g.position, false, true); struck++; }
  }
  if (struck) { hitmarker(false); sfx.hit(); }
  /* Explosives previously did nothing to bots or other players, which made the grenade
     launcher inert in PvP. Splash now applies to every combatant, using the same
     distance falloff, at the PvP-tuned damage. */
  if (typeof BOTS !== 'undefined') {
    for (let i = 0; i < BOTS.length; i++) {
      const b = BOTS[i];
      if (!b.alive) continue;
      if (typeof mpTeamMode === 'function' && mpTeamMode() && b.team === mpTeamOf(MP.id || 1)) continue;
      const d = b.mesh.position.distanceTo(p);
      if (d < radius) botDamage(b, dmg * (1 - d / radius) * 9 * tune.dmg, b.mesh.position, false);
    }
  }
  if (typeof MP !== 'undefined' && typeof mpInMatch === 'function' && mpInMatch()) {
    for (const id in MP.ghosts) {
      const gh = MP.ghosts[id];
      if (!gh.alive) continue;
      if (mpTeamMode() && mpTeamOf(+id) === mpTeamOf(MP.id)) continue;   // no friendly fire
      const d = gh.mesh.position.distanceTo(p);
      if (d < radius) mpSend({ t: 'event', e: { k: 'hit', target: +id, dmg: dmg * (1 - d / radius) * 9 * tune.dmg, head: false } });
    }
  }
  if (camera.position.distanceTo(p) < radius * 0.85) hurt(15, p);
  const flash = flashLightPool.pop();
  if (flash) {
    flash.position.copy(p); flash.intensity = 40; flash.visible = true;
    setTimeout(() => { flash.visible = false; flashLightPool.push(flash); }, 280);
  }
}
const shockwavePool = [], debrisPool = [], groundPatchPool = [], burstFlashPool = [];
const activeBurstFx = [], activeDebris = [];
for (let i = 0; i < 6; i++) {
  const sw = new T.Mesh(new T.RingGeometry(0.4, 0.55, 32), new T.MeshBasicMaterial({
    color: C(0xffd080), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
  }));
  sw.rotation.x = -Math.PI / 2; sw.visible = false; scene.add(sw); shockwavePool.push(sw);
  const gp = new T.Mesh(new T.CircleGeometry(1, 24), new T.MeshBasicMaterial({
    color: C(0xff6a18), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide
  }));
  gp.rotation.x = -Math.PI / 2; gp.visible = false; scene.add(gp); groundPatchPool.push(gp);
  const bf = new T.Mesh(new T.SphereGeometry(0.5, 10, 8), new T.MeshBasicMaterial({
    color: C(0xfff0c0), transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false
  }));
  bf.visible = false; scene.add(bf); burstFlashPool.push(bf);
  const db = new T.Mesh(new T.BoxGeometry(0.18, 0.14, 0.22), barrelMat.clone());
  db.visible = false; scene.add(db); debrisPool.push(db);
}
function scorchDecal(p) {
  const o = decals[decalIdx = (decalIdx + 1) % decals.length];
  o.m.visible = true; o.t = 4;
  o.m.position.set(p.x, floorAt(p.x, p.z) + 0.04, p.z);
  o.m.rotation.x = -Math.PI / 2;
  o.m.material.color.setHex(0x1a0804);
  o.m.material.opacity = 0.55;
  o.m.scale.setScalar(rand(2.2, 3.4));
}
function barrelBurst(p, depth) {
  const sc = depth > 0 ? 0.62 : 1;
  const gy = floorAt(p.x, p.z);
  const flash = burstFlashPool.find(m => !m.visible) || burstFlashPool[0];
  flash.position.copy(p); flash.scale.setScalar(0.1); flash.visible = true;
  activeBurstFx.push({ m: flash, t: 0, max: 0.06, kind: 'flash', sc: sc * 4.2 });
  const sw = shockwavePool.find(m => !m.visible) || shockwavePool[0];
  sw.position.set(p.x, gy + 0.06, p.z); sw.scale.setScalar(0.3 * sc); sw.visible = true;
  sw.material.opacity = 0.85;
  activeBurstFx.push({ m: sw, t: 0, max: 0.18, kind: 'shock', sc: sc * 14 });
  const gp = groundPatchPool.find(m => !m.visible) || groundPatchPool[0];
  gp.position.set(p.x, gy + 0.05, p.z); gp.scale.setScalar(0.5 * sc); gp.visible = true;
  gp.material.opacity = 0.7;
  activeBurstFx.push({ m: gp, t: 0, max: 0.55, kind: 'ground', sc: sc * 3.2 });
  spark(p, 0xfff0c0, Math.round(28 * sc), tmpV2.set(0, 4, 0), 14 * sc, 0.55, 0.12);
  spark(p, 0xff8a28, Math.round(22 * sc), tmpV2.set(0, 1.5, 0), 10 * sc, 0.75, 0.14);
  spark(p, 0xff4010, Math.round(16 * sc), tmpV2.set(1, 0.2, 1), 8 * sc, 0.45, 0.10);
  spark(p, 0x333338, Math.round(20 * sc), tmpV2.set(0, 2.5, 0), 5 * sc, 1.4, 0.18);
  spark(p, 0x222228, Math.round(14 * sc), tmpV2.set(0, 1, 0), 3.5 * sc, 1.8, 0.22);
  const dn = Math.round(4 + sc * 2);
  for (let i = 0; i < dn; i++) {
    const d = debrisPool.find(m => !m.visible);
    if (!d) break;
    d.position.copy(p).addScaledVector(tmpV2.set(rand(-0.3, 0.3), rand(0, 0.4), rand(-0.3, 0.3)), 1);
    d.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    d.visible = true;
    activeDebris.push({
      m: d, life: 0.42 * sc,
      v: new T.Vector3(rand(-1, 1), rand(0.4, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(6, 14) * sc),
      rv: new T.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8))
    });
  }
  scorchDecal(p);
  boom(p, 9.5 * sc, 9);
  sfx.blast();
  shakeAmt = Math.min(shakeAmt + 0.5 * sc, 0.95);
}
function updateBurstFx(dt) {
  for (let i = activeBurstFx.length - 1; i >= 0; i--) {
    const fx = activeBurstFx[i];
    fx.t += dt;
    const f = 1 - fx.t / fx.max;
    if (f <= 0) { fx.m.visible = false; activeBurstFx.splice(i, 1); continue; }
    if (fx.kind === 'flash') {
      fx.m.material.opacity = f;
      fx.m.scale.setScalar(lerp(fx.sc, 0.2, 1 - f));
    } else if (fx.kind === 'shock') {
      fx.m.material.opacity = f * 0.85;
      fx.m.scale.setScalar(lerp(0.3, fx.sc, 1 - f));
    } else {
      fx.m.material.opacity = f * 0.65;
      fx.m.scale.setScalar(lerp(0.5, fx.sc, 1 - f * 0.85));
    }
  }
  for (let i = activeDebris.length - 1; i >= 0; i--) {
    const d = activeDebris[i];
    d.life -= dt;
    d.v.y -= 18 * dt;
    d.m.position.addScaledVector(d.v, dt);
    d.m.rotation.x += d.rv.x * dt; d.m.rotation.y += d.rv.y * dt; d.m.rotation.z += d.rv.z * dt;
    if (d.life <= 0) { d.m.visible = false; activeDebris.splice(i, 1); }
  }
}
function popBarrel(b, depth) {
  if (!b.live) return;
  b.live = false;
  bumpStat('barrels');
  b.mesh.visible = false;
  if (b.blocker) b.blocker.off = true;
  barrelBurst(new T.Vector3(b.x, b.y + 0.9, b.z), depth || 0);
  const d = depth || 0;
  if (d < 4) {
    for (let i = 0; i < barrels.length; i++) {
      const o = barrels[i];
      if (!o.live || o === b) continue;
      if (Math.hypot(o.x - b.x, o.z - b.z) < 9 && Math.abs(o.y - b.y) < 6) {
        setTimeout(() => popBarrel(o, d + 1), 90 + Math.random() * 150);
      }
    }
  }
}

/* ---------- world assembly ---------- */
const ceilingMesh = new T.Mesh(new T.PlaneGeometry(420, 420).rotateX(Math.PI / 2),
  new T.MeshStandardMaterial({ color: 0x05070b, roughness: 1, side: T.DoubleSide }));
ceilingMesh.position.y = 15.6;
ceilingMesh.visible = false;
scene.add(ceilingMesh);

let runSeed = 1;
/* When a multiplayer match dictates the arena layout, the host's seed lands here and
   the next startGame() uses it instead of rolling its own. buildMapWorld() reseeds the
   generator from runSeed, so matching seeds are what make two clients build the SAME
   level — the map key alone only agrees on which generator to run. */
let forcedSeed = null;

/* ---------------- SYMMETRIC ARENAS (Foundry, Spillway) ----------------
   Both new maps share one generator. They exist mainly for Team Deathmatch, where an
   asymmetric map hands one team the better ground, so every piece of cover placed at
   (x, z) is mirrored to (-x, -z) — 180-degree rotational symmetry. The two spawns sit
   at opposite ends of the long axis and are therefore provably equivalent.
   `opt` chooses the dressing: palette, whether it is roofed, and cover density. */
/* ---------------- ARENA SHELL ----------------
   Ironworks and Spillway used to be ONE generator with two palettes, which is why they
   played identically — same centre platform, same crate rows, same corner towers, in
   amber or in mint. Only the shell is shared now (perimeter, services, overhead
   lighting, spawn guides); the layouts are separate and belong to different archetypes.

   Across the five drop zones:
     rain      open branching city grid, ground level
     yard      three-lane, the standard competitive shape
     foundry   circular — one impassable central mass you orbit, small and dense
     spillway  tiered linear — a sunken channel between raised banks, large and open
     heights   vertical hub — terraced roof decks joined by bridges
   No two share a shape, a scale or a silhouette. */
function arenaShell(bd, opt) {
  const B = opt.bounds, wallH = opt.wallH, wallMat = opt.wallMat, trim = opt.accent;
  const t = 2.0;
  wallRun(bd, 0, B, B * 2, true, wallH, wallMat, trim);
  wallRun(bd, 0, -B, B * 2, true, wallH, wallMat, trim);
  wallRun(bd, B, 0, B * 2, false, wallH, wallMat, trim);
  wallRun(bd, -B, 0, B * 2, false, wallH, wallMat, trim);
  addBlocker(0, B, B, t / 2 + 0.4, wallH, false);
  addBlocker(0, -B, B, t / 2 + 0.4, wallH, false);
  addBlocker(B, 0, t / 2 + 0.4, B, wallH, false);
  addBlocker(-B, 0, t / 2 + 0.4, B, wallH, false);
  [[0, B - 1.2, 0], [0, -(B - 1.2), 0], [B - 1.2, 0, Math.PI / 2], [-(B - 1.2), 0, Math.PI / 2]]
    .forEach(w => bd.box(neonMat(trim), w[0], 3.4, w[1], B * 1.9, 0.10, 0.10, w[2]));
  /* Service run around the walls: pipework, a wall duct, hanger brackets. Bare
     perimeter walls are what make an arena feel like an empty box. */
  const pm = opt.pipeMat || MAT.rust;
  [1, -1].forEach(s => {
    pipeRun(bd, s * (B - 1.5), wallH * 0.62, 0, B * 1.9, false, 0.34, pm);
    pipeRun(bd, s * (B - 1.5), wallH * 0.62 - 1.0, 0, B * 1.9, false, 0.2, pm);
    pipeRun(bd, 0, wallH * 0.62, s * (B - 1.5), B * 1.9, true, 0.34, pm);
    bd.tbox(MAT.grime, s * (B - 1.7), wallH * 0.86, 0, 1.2, 1.4, B * 1.2, 2.2);
  });
  /* Overhead light bars. Emissive geometry, not lights — the four-point rig does the
     illumination — but they give the eye something to read height and distance against. */
  const barY = opt.roof ? wallH - 1.4 : wallH * 0.72;
  for (let i = -3; i <= 3; i++) {
    const z = i * B * 0.26;
    bd.tbox(MAT.grime, 0, barY + 0.3, z, B * 0.52, 0.34, 0.5, 1.6);
    for (const s of [1, -1]) bd.box(MAT.steel, s * B * 0.22, barY + 0.9, z, 0.07, 1.2, 0.07);
    bd.box(neonMat(trim), 0, barY, z, B * 0.5, 0.16, 0.16);
    bd.quad(glowMat(trim, 0.05), 0, barY - 0.4, z, B * 0.6, 3, 0, true);
  }
  if (opt.roof) {
    bd.tbox(wallMat, 0, wallH + 0.3, 0, B * 2, 0.6, B * 2, 4.0);
    for (let i = -2; i <= 2; i++) latticeBeam(bd, 0, wallH - 0.9, i * B * 0.42, B * 1.9, true, 1.1, MAT.rust);
  }
  // floor guides toward each spawn, so you always know which way is home
  [1, -1].forEach(s => {
    bd.quad(glowMat(trim, 0.07), 0, 0.05, s * B * 0.78, B * 0.5, 5, 0, true);
    bd.quad(MAT.hazard, 0, 0.03, s * B * 0.66, B * 0.36, 2.4, 0, true);
  });
  landmarks.push({ x: 0, z: -B * 0.8, label: 'NORTH' });
  landmarks.push({ x: 0, z: B * 0.8, label: 'SOUTH' });
}

/* Place a piece and its 180-degree rotation, so both halves of an arena are identical
   and neither team is handed the better ground. */
function mirrored(fn) { [[1], [-1]].forEach(s => fn(s[0])); }

/* ---------------- IRONWORKS — a CIRCULAR map ----------------
   Archetype: circular. One impassable mass in the middle (the furnace, floor to roof),
   so there is no crossing the centre and no angle that holds the whole map — you orbit
   it, and every fight is a rotation. The counterpart to it is the gallery: a raised
   catwalk hugging the walls, reached by two stair flights at opposite corners, which
   overlooks the loop and is itself exposed from it.
   Deliberately the SMALLEST arena — dense and close-quarters, where Spillway is the
   largest and most open. Scale is half of what makes two maps feel different. */
function buildFoundry(bd) {
  const B = MAPS.foundry.bounds;
  const wallH = 13, accent = CLR.amber;
  arenaShell(bd, { bounds: B, wallH: wallH, roof: true, wallMat: MAT.rust,
                   accent: accent, pipeMat: MAT.rust });

  /* --- the furnace: the whole reason this map is a loop --- */
  const F = B * 0.29;                                   // half-extent of the mass
  bd.tbox(MAT.rust, 0, wallH / 2, 0, F * 2, wallH, F * 2, 3.4);
  addBlocker(0, 0, F, F, wallH, false);
  bd.tbox(MAT.grime, 0, 0.6, 0, F * 2.2, 1.2, F * 2.2, 2.4);          // hearth plinth
  for (let k = 1; k < 4; k++) {                                       // binding bands
    bd.tbox(MAT.grime, 0, wallH * k / 4, 0, F * 2.1, 0.5, F * 2.1, 2.0);
  }
  bd.tbox(MAT.steel, 0, wallH + 0.4, 0, F * 1.7, 0.8, F * 1.7, 2.4);  // charging deck
  for (const sx of [1, -1]) for (const sz of [1, -1]) {               // buttress legs
    bd.rbox(MAT.rust, sx * (F + 1.1), 2.4, sz * (F + 1.1), 0.5, 5.2, 0.5, 0, 0, 0);
    bd.rbox(MAT.rust, sx * (F + 1.9), 4.6, sz * F * 0.5, 3.0, 0.4, 0.4, 0, 0, sx * 0.5);
  }
  /* Tap holes and runners on all four faces: the glow that tells you which side of the
     furnace you are on, which is the one thing a circular map has to communicate. */
  const TAP = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  TAP.forEach((t2, i) => {
    const x = t2[0] * F, z = t2[1] * F;
    bd.tbox(MAT.grime, x * 1.06, 2.2, z * 1.06, t2[0] ? 1.6 : 5.0, 3.0, t2[0] ? 5.0 : 1.6, 2.0);
    bd.box(neonMat(0xff7a18), x * 1.12, 2.0, z * 1.12, t2[0] ? 0.3 : 3.2, 1.1, t2[0] ? 3.2 : 0.3);
    // runner channel out to the bay, kerbed both sides
    bd.quad(glowMat(0xff7a18, 0.16), x * 1.7, 0.05, z * 1.7, t2[0] ? F * 0.9 : 4, t2[0] ? 4 : F * 0.9, 0, true);
    for (const s of [1, -1]) {
      bd.tbox(MAT.rust, x * 1.7 + (t2[0] ? 0 : s * 2.2), 0.22, z * 1.7 + (t2[0] ? s * 2.2 : 0),
              t2[0] ? F * 0.9 : 0.7, 0.44, t2[0] ? 0.7 : F * 0.9, 1.6);
    }
  });

  /* --- the gallery: a catwalk ring against the walls ---
     Set hard against the perimeter so the loop below is never roofed over — it thickens
     the wall rather than bridging the floor. Two stair flights, at opposite corners. */
  const gy = 5.6, gw = 3.2, go = B - 1.0 - gw / 2;
  const gallery = (x, z, horiz) => {
    bd.tbox(MAT.deck, x, gy - 0.16, z, horiz ? B * 2 : gw, 0.32, horiz ? gw : B * 2, 0.95);
    bd.tbox(MAT.grime, x, gy / 2, z, horiz ? B * 2 : gw * 0.5, gy - 0.32, horiz ? gw * 0.5 : B * 2, 2.6);
    addBlocker(x, z, horiz ? B : gw / 2, horiz ? gw / 2 : B, gy, true);
    railingRun(bd, x + (horiz ? 0 : -Math.sign(x) * gw / 2), z + (horiz ? -Math.sign(z) * gw / 2 : 0),
               B * 2, horiz, gy, accent);
    // brackets under the walkway
    for (let i = -6; i <= 6; i++) {
      const f = i * B * 0.3;
      bd.rbox(MAT.steel, horiz ? f : x - Math.sign(x) * 1.2, gy - 1.1, horiz ? z - Math.sign(z) * 1.2 : f,
              horiz ? 0.16 : 2.2, 0.16, horiz ? 2.2 : 0.16,
              horiz ? Math.sign(z) * 0.7 : 0, 0, horiz ? 0 : -Math.sign(x) * 0.7);
    }
  };
  gallery(0, go, true); gallery(0, -go, true);
  gallery(go, 0, false); gallery(-go, 0, false);
  mirrored(s => {
    stairFlight(bd, { x: s * B * 0.55, z: s * (go - gw / 2 - 0.3), top: gy, w: 3.6, dir: -s,
                      accent: accent, mat: MAT.grime });
  });

  /* --- the four bays around the loop ---
     Each corner of the orbit gets its own furniture, so "which side am I on" is
     answerable at a glance: ingot stacks, a slag pit, ladle stands, a scrap pile. */
  mirrored(s => {
    // ingot stacks, stepped — cover you can climb
    for (let k = 0; k < 3; k++) {
      crateProp(bd, s * (F + 7 + k * 2.2), k * 0.9, s * (F + 5), 2.0, 0.9, 4.4, MAT.steel, k === 1 ? accent : null);
      addBlocker(s * (F + 7 + k * 2.2), s * (F + 5), 1.0, 2.2, (k + 1) * 0.9, true);
    }
    // slag pit with a kerb, on the opposite diagonal
    bd.quad(glowMat(0xff5a10, 0.18), -s * (F + 9), 0.05, s * (F + 9), 9, 9, 0, true);
    for (const sx of [1, -1]) {
      bd.tbox(MAT.rust, -s * (F + 9) + sx * 4.6, 0.4, s * (F + 9), 0.8, 0.8, 9.2, 1.6);
      bd.tbox(MAT.rust, -s * (F + 9), 0.4, s * (F + 9) + sx * 4.6, 9.2, 0.8, 0.8, 1.6);
    }
    // ladle stands on the long approach
    bd.tube(MAT.rust, s * (B * 0.62), 1.6, -s * (B * 0.3), 1.9, 3.2, 0, 0, 0, 14);
    addBlocker(s * (B * 0.62), -s * (B * 0.3), 1.9, 1.9, 3.2, true);
    bd.box(neonMat(0xff9a3a), s * (B * 0.62), 3.3, -s * (B * 0.3), 3.0, 0.14, 3.0);
    // scrap heap, low cover
    crateProp(bd, -s * (B * 0.6), 0, -s * (B * 0.5), 5.4, 1.6, 5.4, MAT.grime, null);
    addBlocker(-s * (B * 0.6), -s * (B * 0.5), 2.7, 2.7, 1.6, true);
  });

  /* --- charging crane: runs the long axis over the furnace --- */
  mirrored(s => {
    latticeBeam(bd, s * B * 0.5, wallH - 2.6, 0, B * 1.8, false, 1.3, MAT.rust);
    bd.tbox(MAT.grime, s * B * 0.5, wallH - 3.6, B * 0.3, 3.6, 1.8, 2.8, 2.0);
    bd.tube(MAT.steel, s * B * 0.5, wallH - 6.2, B * 0.3, 0.06, 4.2, 0, 0, 0, 6);
    bd.tube(MAT.rust, s * B * 0.5, wallH - 8.8, B * 0.3, 1.7, 2.4, 0, 0, 0, 12);
    bd.box(neonMat(0xff7a18), s * B * 0.5, wallH - 10.0, B * 0.3, 2.2, 0.16, 2.2);
  });

  landmarks.push({ x: 0, z: 0, label: 'FURNACE' });
  landmarks.push({ x: B * 0.62, z: -B * 0.3, label: 'LADLE' });
  landmarks.push({ x: -B * 0.62, z: B * 0.3, label: 'SLAG' });
}

/* ---------------- SPILLWAY — a TIERED LINEAR map ----------------
   Archetype: linear, layered vertically. A drained overflow channel runs the length of
   the map with raised banks either side, so the arena is three parallel worlds at three
   heights: the channel floor (fast, exposed, the shortest line between spawns), the
   stepped chute (transitional cover), and the bank aprons (slow, safe, overlooking).
   Two weirs cross the channel. Each has ONE gate in it, and the two gates sit on
   opposite sides — 180-degree rotational symmetry — so a runner in the channel is
   funnelled through a known chokepoint that the banks look down onto, and has to cross
   the map to use the second one.
   The LARGEST arena, and the only open-sky one, against Ironworks' small roofed loop. */
function buildSpillway(bd) {
  const B = MAPS.spillway.bounds;
  const wallH = 15, accent = CLR.mint;
  arenaShell(bd, { bounds: B, wallH: wallH, roof: false, wallMat: MAT.concrete,
                   accent: accent, pipeMat: MAT.concrete });

  const chan = B * 0.30;                 // half-width of the channel floor
  /* Tier rise is 1.2 m, deliberately just under STEP (1.3 m in 06-player.js): the chute
     is meant to be scrambled up anywhere along its length, so the channel is a commitment
     you can always bail out of. At the 1.5 m it started at, nothing could climb out of the
     channel at all and the bottom tier was a trap. */
  const stepW = 3.6, stepH = 1.2, TIERS = 3;
  const apronY = TIERS * stepH;          // 4.5
  const apronIn = chan + TIERS * stepW;  // where the flat bank starts

  /* --- stepped chute up each bank ---
     A real spillway is a stepped chute, and the steps happen to be the best cover
     gradient a shooter can ask for: three walkable ledges between two elevations. */
  [1, -1].forEach(sx => {
    for (let i = 0; i < TIERS; i++) {
      const x = sx * (chan + i * stepW + stepW / 2), h = (i + 1) * stepH;
      bd.tbox(MAT.concrete, x, h / 2, 0, stepW, h, B * 2, 3.2);
      addBlocker(x, 0, stepW / 2 + 0.06, B, h, true);          // overlap: see SEAM in stairFlight
      bd.box(neonMat(accent), x - sx * (stepW / 2 - 0.12), h - 0.05, 0, 0.1, 0.05, B * 1.96);
    }
    // the flat bank apron above the chute
    const aw = B - apronIn;
    bd.tbox(MAT.concrete, sx * (apronIn + aw / 2), apronY / 2, 0, aw, apronY, B * 2, 3.4);
    addBlocker(sx * (apronIn + aw / 2), 0, aw / 2 + 0.06, B, apronY, true);
    bd.tbox(MAT.deck, sx * (apronIn + aw / 2), apronY + 0.04, 0, aw * 0.98, 0.08, B * 1.98, 0.95);
  });

  /* --- the weirs ---
     Each spans the channel with a single gate in it; the gates are on opposite sides so
     the two halves stay equivalent. Walkable on top, so the banks get a crossing and a
     firing position over the gate at the same time. */
  const weirH = 3.2, gateHalf = 6.5;
  [1, -1].forEach(s => {
    const z = s * B * 0.36, gx = s * B * 0.17;        // gate offset, mirrored
    const spans = [[-chan, gx - gateHalf], [gx + gateHalf, chan]];
    spans.forEach(sp => {
      const w = sp[1] - sp[0];
      if (w <= 0.5) return;
      const cx = (sp[0] + sp[1]) / 2;
      bd.tbox(MAT.concrete, cx, weirH / 2, z, w, weirH, 4.4, 3.0);
      addBlocker(cx, z, w / 2, 2.2, weirH, true);
      bd.box(neonMat(accent), cx, weirH + 0.06, z, w * 0.98, 0.07, 4.2);
    });
    // gate piers and the lifting gear over the opening
    [-1, 1].forEach(sg => {
      bd.tbox(MAT.concrete, gx + sg * gateHalf, 4.2, z, 1.6, 8.4, 4.8, 2.6);
      addBlocker(gx + sg * gateHalf, z, 0.8, 2.4, 8.4, false);
    });
    bd.tbox(MAT.steel, gx, 8.8, z, gateHalf * 2 + 3, 0.9, 2.2, 2.4);
    bd.tbox(MAT.grime, gx, 7.4, z, gateHalf * 1.7, 1.8, 1.4, 2.0);   // the raised gate leaf
    bd.box(neonMat(accent), gx, 6.4, z, gateHalf * 1.7, 0.1, 1.5);
    bd.quad(MAT.hazard, gx, 0.04, z, gateHalf * 2, 4.6, 0, true);
    /* No stairs onto the weir: at 3.2 m its top sits one 0.8 m step above tier 2 and
       0.4 m below tier 3, so both banks already walk straight onto it. */
  });

  /* --- channel floor: water sheet, drain line, baffle teeth --- */
  bd.quad(glowMat(0x35ffc4, 0.018), 0, 0.04, 0, chan * 2, B * 1.96, 0, true);
  bd.quad(glowMat(0x35ffc4, 0.05), 0, 0.05, 0, 4.4, B * 1.96, 0, true);
  for (const s of [1, -1]) bd.tbox(MAT.concrete, s * 2.9, 0.2, 0, 0.9, 0.4, B * 1.96, 2.2);
  for (let i = -7; i <= 7; i++) bd.tbox(MAT.deck, 0, 0.24, i * B * 0.13, 5.2, 0.1, 2.2, 0.8);
  /* Stilling-basin baffle blocks — the concrete teeth every spillway has, and the only
     cover on the channel floor. Staggered, so the long lane is broken but never closed. */
  [1, -1].forEach(s => {
    for (let i = 0; i < 4; i++) {
      const x = s * (chan * 0.2 + i * chan * 0.22), z = s * (B * 0.1 + i * B * 0.13);
      bd.tbox(MAT.concrete, x, 0.8, z, 2.6, 1.6, 2.2, 1.8);
      addBlocker(x, z, 1.3, 1.1, 1.6, true);
      bd.box(neonMat(accent), x, 1.63, z, 2.4, 0.05, 2.0);
    }
  });

  /* --- bank furniture: control house, sluice gear, guardrails along the lip --- */
  [1, -1].forEach(s => {
    railingRun(bd, s * (apronIn + 0.4), 0, B * 1.9, false, apronY, accent);
    // control house, the strong position on each bank
    const hx = s * (B * 0.74), hz = -s * (B * 0.42);
    bd.tbox(MAT.concrete, hx, apronY + 2.1, hz, 11, 4.2, 9, 3.0);
    addBlocker(hx, hz, 5.5, 4.5, apronY + 4.2, true);          // the roof is a firing position
    railingRun(bd, hx, hz + 4.5, 11, true, apronY + 4.2, accent);
    railingRun(bd, hx, hz - 4.5, 11, true, apronY + 4.2, accent);
    railingRun(bd, hx - s * 5.5, hz, 9, false, apronY + 4.2, accent);
    /* Offsets on a mirrored piece must carry the mirror sign too — hx + 5.5 put both
       flights on the same side of the map and broke the 180-degree symmetry. */
    stairFlight(bd, { x: hx + s * 5.5, z: hz, top: apronY + 4.2, base: apronY, w: 3.4,
                      dir: s, horiz: true, accent: accent, mat: MAT.concrete });
    bd.tbox(MAT.steel, hx, apronY + 4.35, hz, 11.8, 0.5, 9.8, 2.2);
    bd.box(neonMat(accent), hx, apronY + 2.6, hz - s * 4.6, 7.4, 1.4, 0.2);   // lit window band
    ventProp(bd, hx + s * 3, apronY + 4.6, hz + s * 2.4, 2.6, 1.1, 2.2);
    /* Cover on the open bank. The apron is the safe route, so it needs enough furniture
       that walking it is not a straight line — sluice gear, spare stoplogs, a switch
       cabinet — spaced to break the long bank sightline without closing it. */
    crateProp(bd, s * (B * 0.6), apronY, s * (B * 0.2), 4.6, 2.4, 4.6, MAT.steel, accent);
    addBlocker(s * (B * 0.6), s * (B * 0.2), 2.3, 2.3, apronY + 2.4);
    crateProp(bd, s * (B * 0.55), apronY, -s * (B * 0.12), 5.6, 1.4, 3.0, MAT.grime, null);
    addBlocker(s * (B * 0.55), -s * (B * 0.12), 2.8, 1.5, apronY + 1.4, true);
    crateProp(bd, s * (B * 0.78), apronY, s * (B * 0.05), 3.2, 2.2, 6.4, MAT.steel, null);
    addBlocker(s * (B * 0.78), s * (B * 0.05), 1.6, 3.2, apronY + 2.2);
    crateProp(bd, s * (B * 0.66), apronY, -s * (B * 0.62), 4.0, 2.4, 4.0, MAT.steel, accent);
    addBlocker(s * (B * 0.66), -s * (B * 0.62), 2.0, 2.0, apronY + 2.4);
    ventProp(bd, s * (B * 0.85), apronY, -s * (B * 0.3), 2.8, 1.6, 2.4);
    addBlocker(s * (B * 0.85), -s * (B * 0.3), 1.4, 1.2, apronY + 1.6, true);
    // stoplog racks along the lip: low cover you shoot over into the channel
    for (let i = -2; i <= 2; i++) {
      const z = i * B * 0.3 + s * B * 0.06;
      bd.tbox(MAT.steel, s * (apronIn + 3.4), apronY + 0.55, z, 1.4, 1.1, 7.0, 1.8);
      addBlocker(s * (apronIn + 3.4), z, 0.7, 3.5, apronY + 1.1, true);
      bd.box(neonMat(accent), s * (apronIn + 3.4), apronY + 1.14, z, 1.2, 0.05, 6.6);
    }
    pillarProp(bd, s * (B * 0.82), s * (B * 0.62), 6.5, 0.9, MAT.concrete, accent);
    addBlocker(s * (B * 0.82), s * (B * 0.62), 0.9, 0.9, apronY + 6.5);
    // outfall culverts in the end walls
    for (const sx of [-1, 0, 1]) {
      bd.tube(MAT.concrete, sx * B * 0.22, 2.6, s * (B - 1.4), 2.6, 1.6, Math.PI / 2, 0, 0, 16);
      bd.tube(MAT.grime, sx * B * 0.22, 2.6, s * (B - 1.9), 2.2, 1.0, Math.PI / 2, 0, 0, 16);
      bd.box(neonMat(accent), sx * B * 0.22, 5.3, s * (B - 1.5), 4.4, 0.1, 0.3);
    }
  });

  landmarks.push({ x: 0, z: 0, label: 'CHANNEL' });
  landmarks.push({ x: B * 0.74, z: -B * 0.42, label: 'CONTROL' });
  landmarks.push({ x: -B * 0.74, z: B * 0.42, label: 'CONTROL' });
}

function buildMapWorld() {
  const theme = MAPS[currentMap];
  reseed(runSeed);
  CFG.bounds = theme.bounds;
  clearMapWorld();
  const bd = new Builder();
  if (currentMap === 'rain') buildRainDistrict(bd);
  else if (currentMap === 'yard') buildContainerYard(bd);
  else if (currentMap === 'foundry') buildFoundry(bd);
  else if (currentMap === 'spillway') buildSpillway(bd);
  else buildNeonHeights(bd);
  bd.flush(mapWorld);
  buildBarrelMeshes();
  /* Navigation grid last: it reads the finished blocker list, barrels included. */
  if (typeof navBuild === 'function') navBuild();

  placeNeonLights(theme);
  /* Tint the shadow grade with this map's accent so each drop zone has its own colour
     cast rather than every map grading to the same blue-black. */
  if (matFinal && matFinal.uniforms.tintA) {
    const a = new T.Color(theme.accent || 0x7fe4ff);
    matFinal.uniforms.tintA.value.set(a.r * 0.045 + 0.006, a.g * 0.045 + 0.010, a.b * 0.045 + 0.022);
  }
  ground.position.y = theme.floorY;
  groundMat.uniforms.wetMul.value = theme.wet;
  groundMat.uniforms.fogColor.value.set(theme.fog);
  groundMat.uniforms.fogDensity.value = theme.fogD;
  scene.fog.color.set(theme.fog);
  scene.fog.density = theme.fogD;
  sky.visible = theme.sky;
  ceilingMesh.visible = !!theme.ceiling;
  rain.visible = !!theme.rain;
  padPos.set(theme.extraction[0], theme.padY || 0, theme.extraction[1]);
  padGroup.position.copy(padPos);
  if (typeof renderer !== 'undefined' && renderer.compile && window.__warmed) renderer.compile(scene, camera);
  dayClock = theme.dayStart;
}
// first build is deferred to boot: it touches `rain`, declared further down

/* ---------- blob shadow (shared) ---------- */
const blobTex = (function () {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
})();
const blobGeo = new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const blobMatShared = new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.7 });
function makeBlob(size) {
  const m = new T.Mesh(blobGeo, blobMatShared.clone());
  m.scale.setScalar(size);
  m.position.y = 0.03;
  return m;
}
/* ============================================================
   PART II — play
   ============================================================ */

/* Bullets test analytic boxes instead of triangle meshes — the merged city has ~50k
   triangles, but only ~85 collision volumes, so this is orders of magnitude cheaper. */
const wallHit = { d: 0, nx: 0, ny: 0, nz: 0, hit: false, b: null };
function castWall(o, d, maxD) {
  let best = maxD, bax = -1, bsg = 1;
  wallHit.hit = false; wallHit.b = null;
  if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0.02 && t < best) { best = t; bax = 1; bsg = 1; wallHit.hit = true; } }
  const ix = 1 / (d.x || 1e-9), iy = 1 / (d.y || 1e-9), iz = 1 / (d.z || 1e-9);
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    if (b.off) continue;
    let t0 = 0.02, t1 = best, ax = -1, sg = 1, lo, hi, u, v;
    u = (b.x - b.hw - o.x) * ix; v = (b.x + b.hw - o.x) * ix;
    lo = u < v ? u : v; hi = u < v ? v : u;
    if (lo > t0) { t0 = lo; ax = 0; sg = d.x > 0 ? -1 : 1; }
    if (hi < t1) t1 = hi;
    if (t0 > t1) continue;
    u = (0 - o.y) * iy; v = (b.h - o.y) * iy;
    lo = u < v ? u : v; hi = u < v ? v : u;
    if (lo > t0) { t0 = lo; ax = 1; sg = d.y > 0 ? -1 : 1; }
    if (hi < t1) t1 = hi;
    if (t0 > t1) continue;
    u = (b.z - b.hd - o.z) * iz; v = (b.z + b.hd - o.z) * iz;
    lo = u < v ? u : v; hi = u < v ? v : u;
    if (lo > t0) { t0 = lo; ax = 2; sg = d.z > 0 ? -1 : 1; }
    if (hi < t1) t1 = hi;
    if (t0 > t1 || ax < 0 || t0 >= best) continue;
    best = t0; bax = ax; bsg = sg; wallHit.hit = true; wallHit.b = b;
  }
  if (!wallHit.hit) return false;
  wallHit.d = best;
  wallHit.nx = bax === 0 ? bsg : 0;
  wallHit.ny = bax === 1 ? bsg : 0;
  wallHit.nz = bax === 2 ? bsg : 0;
  return true;
}
const eHitBuf = [];
function castEnemies(o, d, maxD) {
  eHitBuf.length = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i], p = e.g.position;
    const ex = p.x - o.x, ey = p.y - o.y, ez = p.z - o.z;
    const proj = ex * d.x + ey * d.y + ez * d.z;
    if (proj <= 0 || proj > maxD) continue;
    const perp2 = ex * ex + ey * ey + ez * ez - proj * proj;
    const r = e.hitR;
    if (perp2 > r * r) continue;
    const t = proj - Math.sqrt(r * r - perp2);
    if (t < 0 || t > maxD) continue;
    eHitBuf.push({ t: t, e: e, perp: Math.sqrt(perp2 > 0 ? perp2 : 0) });
  }
  if (eHitBuf.length > 1) eHitBuf.sort((a, b) => a.t - b.t);
  return eHitBuf;
}

/* Ray vs other players, same maths as castEnemies. Returns the nearest ghost. */
/* ---------- humanoid hitbox ----------
   Players and bots used ONE sphere of radius 0.95 centred at chest height — a 1.9m ball
   around a figure that is about 0.5m wide. Shots that visibly missed by a metre still
   registered, and the "head" test was a guess at where in that ball you landed.

   Replaced with the shape the model actually is: a vertical capsule for the body plus a
   small sphere for the head. Numbers come from buildPlayerModel — feet at 0, head centred
   at 1.63, shoulders at 1.40 — so the hitbox and the geometry cannot drift apart.

   Deliberately still slightly generous (0.34 vs a ~0.25 torso half-width): this is a LAN
   shooter with shooter-authoritative hits and no lag compensation, so a little padding
   absorbs the interpolation error rather than making opponents feel bulletproof. */
const HB = { footY: 0.42, headY: 1.52, bodyR: 0.34, headC: 1.635, headR: 0.17 };

/* How big a target the player currently is, as the radius of the disc with the same
   area as their silhouette — roughly 2*bodyR wide by eye-height tall. This is the number
   every AI shooter tests its cone against, which is what makes crouching a real
   defensive trade: CROUCH_SQ off the height is ~16% off the radius and, because hit
   chance goes with the square, close to 30% off the chance of being hit at range. */
function playerTargetRadius() {
  const h = EYE_STAND * (1 + (CROUCH_SQ - 1) * (P.crouchF || 0));
  return Math.sqrt(2 * HB.bodyR * h / Math.PI);
}

/* Scatter a normalized direction by up to `cone` radians, uniformly over the disc.
   The player's shots use coneDir() in 06-player.js instead, which reuses the camera
   basis it already has rather than rebuilding one per pellet — same rule, same uniform
   sqrt() radius sampling, so drones, bots and the player all miss by the same maths. */
const scatterR = new T.Vector3(), scatterU = new T.Vector3();
function scatterDir(dir, cone) {
  if (!(cone > 0)) return dir;
  scatterR.set(-dir.z, 0, dir.x);
  if (scatterR.lengthSq() < 1e-8) scatterR.set(1, 0, 0);
  scatterR.normalize();
  scatterU.crossVectors(scatterR, dir).normalize();
  const a = Math.random() * 6.283185307, r = Math.sqrt(Math.random()) * cone;
  return dir.addScaledVector(scatterR, Math.cos(a) * r)
            .addScaledVector(scatterU, Math.sin(a) * r).normalize();
}

/* Ray vs a Y-aligned capsule. Returns distance along the ray, or -1. */
function rayCapsuleT(o, d, cx, cz, y0, y1, r) {
  let best = -1;
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  if (a > 1e-9) {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc), inv = 1 / (2 * a);
      const t0 = (-b - sq) * inv, t1 = (-b + sq) * inv;
      for (let i = 0; i < 2; i++) {
        const t = i === 0 ? t0 : t1;
        if (t < 0) continue;
        const y = o.y + d.y * t;
        if (y < y0 || y > y1) continue;               // above or below the barrel section
        if (best < 0 || t < best) best = t;
      }
    }
  }
  // rounded ends
  for (let i = 0; i < 2; i++) {
    const cy = i === 0 ? y0 : y1;
    const ex = cx - o.x, ey = cy - o.y, ez = cz - o.z;
    const proj = ex * d.x + ey * d.y + ez * d.z;
    if (proj <= 0) continue;
    const perp2 = ex * ex + ey * ey + ez * ez - proj * proj;
    if (perp2 > r * r) continue;
    const t = proj - Math.sqrt(r * r - perp2);
    if (t >= 0 && (best < 0 || t < best)) best = t;
  }
  return best;
}

/* Body + head against a figure whose FEET are at (px, py, pz). Returns { t } or null.
   `sq` vertically squashes the box for a crouching figure (1 = standing); the caller
   passes the same factor its model is drawn with, so the hitbox and the silhouette can
   never disagree. */
function castHumanoid(o, d, px, py, pz, maxD, sq) {
  const k = sq || 1;
  const body = rayCapsuleT(o, d, px, pz, py + HB.footY * k, py + HB.headY * k, HB.bodyR);
  // head sphere
  let head = -1;
  const ex = px - o.x, ey = (py + HB.headC * k) - o.y, ez = pz - o.z;
  const proj = ex * d.x + ey * d.y + ez * d.z;
  if (proj > 0) {
    const perp2 = ex * ex + ey * ey + ez * ez - proj * proj;
    if (perp2 <= HB.headR * HB.headR) head = proj - Math.sqrt(HB.headR * HB.headR - perp2);
  }
  let t = -1;
  if (body >= 0) t = body;
  if (head >= 0 && (t < 0 || head < t)) t = head;
  if (t < 0 || t > maxD) return null;
  return { t: t };
}

function castPlayers(o, d, maxD) {
  let best = null, bestT = maxD;
  if (!MP.connected || !mpInMatch()) return null;   // never shoot strangers during a solo run
  for (const id in MP.ghosts) {
    const gh = MP.ghosts[id];
    if (!gh.alive) continue;
    if (mpTeamMode() && mpTeamOf(+id) === mpTeamOf(MP.id)) continue;   // no friendly fire
    const p = gh.mesh.position;
    const sq = 1 + (CROUCH_SQ - 1) * (gh.crouchF || 0);
    const hit = castHumanoid(o, d, p.x, p.y, p.z, bestT, sq);
    if (!hit) continue;
    const t = hit.t;
    const hp = { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t };
    const z = classifyHit(p, hp, sq);
    bestT = t; best = { t: t, id: +id, gh: gh, head: z.head, zone: z.zone, mult: z.mult };
  }
  return best;
}
