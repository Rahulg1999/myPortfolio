/* neon-runner · 02-render.js
   renderer, render targets, post-processing chain, sky, lighting
   Loaded as a classic script in the order listed in index.html.
   Top-level const/let are shared across these files via the global
   lexical scope, so ORDER MATTERS — do not reorder the script tags. */
/* ---------- renderer ---------- */
const renderer = new T.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
let basePR = Math.min(devicePixelRatio, 1.6);
let renderScale = 1;                 // driven by the adaptive resolution controller
renderer.setPixelRatio(basePR);
renderer.info.autoReset = false;
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);
renderer.domElement.id = 'view';

const scene = new T.Scene();
scene.fog = new T.FogExp2(0x0a0d1c, 0.0105);

const camera = new T.PerspectiveCamera(CFG.fov, innerWidth / innerHeight, 0.08, 1600);
camera.rotation.order = 'YXZ';
camera.position.set(0, 1.75, 26);

// weapon is drawn in its own pass so it never clips into geometry
const vmScene = new T.Scene();
const vmCam = new T.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 12);

/* ---------- render targets ---------- */
const rtOpt = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.HalfFloatType, depthBuffer: true, stencilBuffer: false };
let rtScene, rtRefl, rtA, rtB, rtC, rtD;
function makeTargets() {
  const w = Math.floor(innerWidth * renderer.getPixelRatio());
  const h = Math.floor(innerHeight * renderer.getPixelRatio());
  [rtScene, rtRefl, rtA, rtB, rtC, rtD].forEach(r => r && r.dispose());
  rtScene = new T.WebGLRenderTarget(w, h, rtOpt);
  rtRefl = new T.WebGLRenderTarget(Math.floor(w / 2.4), Math.floor(h / 2.4), rtOpt);
  rtA = new T.WebGLRenderTarget(Math.floor(w / 2), Math.floor(h / 2), rtOpt);
  rtB = new T.WebGLRenderTarget(Math.floor(w / 2), Math.floor(h / 2), rtOpt);
  rtC = new T.WebGLRenderTarget(Math.floor(w / 5), Math.floor(h / 5), rtOpt);
  rtD = new T.WebGLRenderTarget(Math.floor(w / 5), Math.floor(h / 5), rtOpt);
}
makeTargets();

/* ---------- fullscreen pass plumbing ---------- */
const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new T.Scene();
const quadMesh = new T.Mesh(new T.PlaneGeometry(2, 2), new T.MeshBasicMaterial());
quadMesh.frustumCulled = false;
quadScene.add(quadMesh);
function blit(mat, target) {
  quadMesh.material = mat;
  renderer.setRenderTarget(target || null);
  renderer.clear(true, true, false);
  renderer.render(quadScene, quadCam);
}
const VERT = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`;

const matBright = new T.ShaderMaterial({
  uniforms: { tD: { value: null }, cut: { value: 0.62 } },
  vertexShader: VERT,
  fragmentShader: `
  varying vec2 vUv; uniform sampler2D tD; uniform float cut;
  void main(){
    vec3 c = texture2D(tD, vUv).rgb;
    float l = dot(c, vec3(0.2126,0.7152,0.0722));
    float k = max(l - cut, 0.0) / max(l, 0.0001);
    gl_FragColor = vec4(c * k * 1.15, 1.0);
  }`
});
const matBlur = new T.ShaderMaterial({
  uniforms: { tD: { value: null }, dir: { value: new T.Vector2(1, 0) }, res: { value: new T.Vector2(1, 1) } },
  vertexShader: VERT,
  fragmentShader: `
  varying vec2 vUv; uniform sampler2D tD; uniform vec2 dir; uniform vec2 res;
  void main(){
    vec2 s = dir / res;
    vec3 c = texture2D(tD, vUv).rgb * 0.227027;
    c += (texture2D(tD, vUv + s*1.3846).rgb + texture2D(tD, vUv - s*1.3846).rgb) * 0.316216;
    c += (texture2D(tD, vUv + s*3.2307).rgb + texture2D(tD, vUv - s*3.2307).rgb) * 0.070270;
    gl_FragColor = vec4(c, 1.0);
  }`
});
const matDown = new T.ShaderMaterial({
  uniforms: { tD: { value: null } }, vertexShader: VERT,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tD; void main(){ gl_FragColor = texture2D(tD, vUv); }`
});
const matFinal = new T.ShaderMaterial({
  uniforms: {
    tD: { value: null }, tB: { value: null }, tW: { value: null },
    time: { value: 0 }, hurt: { value: 0 }, speed: { value: 0 },
    bloom: { value: 0.78 }, res: { value: new T.Vector2(1, 1) }, low: { value: 0 },
    /* Grade: the render was almost entirely black outside the neon itself. These lift the
       shadows and split-tone them (cool shadows / warm highlights, the standard neon-noir
       move) so unlit geometry still reads as coloured material instead of a silhouette.
       tintA is set per map from its accent colour, so each drop zone has its own cast. */
    sat: { value: 1.30 }, grade: { value: 1.0 }, blackout: { value: 0 },
    tintA: { value: new T.Vector3(0.055, 0.085, 0.16) },
    tintB: { value: new T.Vector3(0.045, 0.012, 0.028) }
  },
  vertexShader: VERT,
  fragmentShader: `
  varying vec2 vUv;
  uniform sampler2D tD, tB, tW;
  uniform float time, hurt, speed, bloom, low, sat, grade, blackout;
  uniform vec3 tintA, tintB;
  uniform vec2 res;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(41.7,289.3)))*43758.5453); }
  vec3 aces(vec3 x){
    const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14;
    return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0);
  }
  void main(){
    vec2 uv = vUv;
    vec2 d = uv - 0.5;
    float r2 = dot(d,d);
    // lens distortion grows with velocity + damage
    float k = 0.055 + speed*0.09 + hurt*0.10;
    uv = 0.5 + d * (1.0 + k*r2*0.35);
    // chromatic split, strongest at the edges
    float ca = (0.7 + speed*3.2 + hurt*4.0) / res.x;
    vec3 col;
    col.r = texture2D(tD, uv + d*ca*2.2).r;
    col.g = texture2D(tD, uv).g;
    col.b = texture2D(tD, uv - d*ca*2.2).b;
    vec3 b1 = texture2D(tB, uv).rgb;
    vec3 b2 = texture2D(tW, uv).rgb;
    /* Total blackout: crush the BASE image hard, but add bloom at full strength on top.
       Bloom comes from the bright-pass, i.e. from things that emit — so hot enemy shells,
       muzzle flash and tracers still punch through while everything merely lit by the
       scene goes black. Dimming after the bloom add would have killed both. */
    col *= (1.0 - blackout * 0.86);
    col += (b1*0.62 + b2*0.75) * bloom;
    // damage bleed from the frame edges
    col = mix(col, col + vec3(0.85,0.03,0.12)*r2*3.0, hurt);
    col = aces(col * 1.02);
    // --- grade ---
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(vec3(lum), col, sat);                         // vibrance
    // Band-limited shadow mask: skip the very darkest pixels so distant fog is not
    // lifted into a grey haze — only material that is genuinely in shadow gets tinted.
    float sh = smoothstep(0.02, 0.10, lum) * (1.0 - smoothstep(0.10, 0.44, lum));
    float hi = smoothstep(0.38, 1.0, lum);                  // highlight mask
    /* The shadow lift is what stops normal play reading as pure black — but during a
       grid failure darkness IS the mechanic, so it stands down and the vignette closes in.
       Without this the blackout was visibly brighter than before the colour pass. */
    col += tintA * sh * grade * (1.0 - blackout);           // cool, map-tinted shadows
    col += tintB * hi * grade * 0.65;                       // warm highlights
    col = clamp(col, 0.0, 1.0);
    // rain-streaked glass grain
    float g = hash(gl_FragCoord.xy + fract(time)*137.0);
    col += (g - 0.5) * 0.028;
    float scan = 1.0 - 0.022 * sin(gl_FragCoord.y * 1.6 + time*1.2);
    col *= scan;
    col *= smoothstep(mix(1.06, 0.62, blackout), 0.26, r2*1.15);   // vignette closes in during a blackout
    col = pow(max(col, 0.0), vec3(0.4545));            // linear -> sRGB
    gl_FragColor = vec4(col, 1.0);
  }`
});

/* ---------- sky ---------- */
const sky = new T.Mesh(new T.SphereGeometry(900, 32, 24), new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false,
  uniforms: { time: { value: 0 }, day: { value: 0.12 } },
  vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
  varying vec3 vP; uniform float time, day;
  float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
  void main(){
    vec3 n = normalize(vP);
    float y = clamp(n.y*0.5+0.5, 0.0, 1.0);
    vec3 nightLow  = vec3(0.115,0.055,0.135);
    vec3 nightMid  = vec3(0.030,0.045,0.105);
    vec3 nightHigh = vec3(0.006,0.010,0.028);
    vec3 dayLow  = vec3(0.40,0.48,0.62);
    vec3 dayMid  = vec3(0.18,0.28,0.48);
    vec3 dayHigh = vec3(0.035,0.09,0.18);
    float daylight = smoothstep(0.12,0.55,day) * (1.0-smoothstep(0.72,0.96,day));
    vec3 low = mix(nightLow, dayLow, daylight);
    vec3 mid = mix(nightMid, dayMid, daylight);
    vec3 high = mix(nightHigh, dayHigh, daylight);
    vec3 c = mix(low, mid, smoothstep(0.46,0.60,y));
    c = mix(c, high, smoothstep(0.58,0.92,y));
    // cloud belt lit from beneath by the city
    float band = smoothstep(0.52,0.78,y) * (1.0-smoothstep(0.78,0.95,y));
    float f = h(floor(n.xz*14.0+vec2(time*0.02,0.0)));
    c += vec3(0.10,0.05,0.13) * band * (0.35+0.65*f) * 0.55;
    // stars, punched through only where the haze is thin
    vec2 g = floor(n.xz*260.0);
    float s = step(0.9975, h(g)) * smoothstep(0.62,0.95,y);
    c += vec3(0.8,0.88,1.0) * s * (0.5+0.5*sin(time*2.0+h(g)*40.0));
    gl_FragColor = vec4(c,1.0);
  }`
}));
sky.frustumCulled = false;
scene.add(sky);

/* ---------- lighting ---------- */
const hemi = new T.HemisphereLight(0x3b4d8c, 0x090a12, 0.75);
scene.add(hemi);
const moon = new T.DirectionalLight(0x8fa8ff, 0.55);
moon.position.set(-60, 90, -40);
scene.add(moon);
/* The neon fill rig. Positions used to be hardcoded for Rain District, which left the
   larger arenas unlit black voids — placeNeonLights() below re-spreads them to fit
   whatever map is being built. Intensity is driven per-frame by updateDayNight(). */
const NEON_TINTS = [CLR.mint, CLR.magenta, CLR.ice, CLR.amber, CLR.violet, CLR.mint];
const neonLights = [];
NEON_TINTS.forEach(tint => {
  const L = new T.PointLight(tint, 2.6, 62, 2);
  L.position.set(0, 7, 0);
  scene.add(L); neonLights.push(L);
});
/* Spread the rig over the current map: a ring inside the play area, plus one at the
   centre, with range scaled to the map so nothing is left in the dark. */
function placeNeonLights(theme) {
  const B = theme.bounds || 112;
  const y = (theme.floorY || 0) + (theme.ceiling || theme.sky === false ? 7 : 9);
  neonLights.forEach((L, i) => {
    if (i === 0) { L.position.set(0, y, 0); }
    else {
      const a = ((i - 1) / (neonLights.length - 1)) * Math.PI * 2;
      L.position.set(Math.cos(a) * B * 0.55, y, Math.sin(a) * B * 0.55);
    }
    L.distance = B * 1.25;
  });
}
const muzzleLight = new T.PointLight(0xffd9a0, 0, 22, 2);
scene.add(muzzleLight);
