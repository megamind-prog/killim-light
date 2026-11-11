// A small 3D coconut-shell kava bowl, drawn with plain WebGL (no library).
// The kava inside follows the light: full for "kava ready", a little for "nearly finished", empty with a red X for "closed".
// Loaded only after the page is usable, and never on low-data phones. If anything fails, the flat picture underneath stays.
(() => {
if (window.KLShell) return;
const TAU = Math.PI * 2, SEG = 48;
const LEVEL = { green: 1, amber: .3, closed: 0, stale: .3, reported: .3, pending: 0 };
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

// ----- tiny matrix helpers (column-major 4x4) -----
const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3]; return o; };
const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; };
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lookAt = (e, c, u) => { const z = norm([e[0] - c[0], e[1] - c[1], e[2] - c[2]]), x = norm(cross(u, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1]); };
const rotY = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
const rotX = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
const rotZ = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
const trs = (x, y, z, k) => new Float32Array([k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, x, y, z, 1]);

// ----- shapes -----
const RO = 1, DO = .74, RI = .92, DI = .67;       // outer and inner radius and depth of the shell
function buildMesh() {
  const P = [];                                    // profile: [radius, height, material]
  for (let i = 0; i <= 14; i++) { const a = i / 14 * Math.PI / 2; P.push([RO * Math.sin(a), -DO * Math.cos(a), 0]); }
  P.push([RO - .012, .03, 1], [RI + .012, .03, 1]);
  for (let i = 0; i <= 12; i++) { const a = (1 - i / 12) * Math.PI / 2; P.push([RI * Math.sin(a), -DI * Math.cos(a), 2]); }
  const v = [], ix = [];
  const pn = P.map((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const dr = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dr, dy) || 1; return [dy / l, -dr / l]; });
  P.forEach((p, i) => { for (let s = 0; s <= SEG; s++) { const a = s / SEG * TAU, c = Math.cos(a), sn = Math.sin(a); v.push(p[0] * c, p[1], p[0] * sn, pn[i][0] * c, pn[i][1], pn[i][0] * sn, p[2]); } });
  for (let i = 0; i < P.length - 1; i++) for (let s = 0; s < SEG; s++) { const a = i * (SEG + 1) + s, b = a + SEG + 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
  const bowlCount = ix.length;
  // kava: a flat disc, sized and lifted in the shader
  let base = v.length / 7; v.push(0, 0, 0, 0, 1, 0, 3);
  for (let s = 0; s <= SEG; s++) { const a = s / SEG * TAU; v.push(Math.cos(a), 0, Math.sin(a), 0, 1, 0, 3); }
  for (let s = 0; s < SEG; s++) ix.push(base, base + 1 + s, base + 2 + s);
  const kavaCount = ix.length - bowlCount;
  // the red X: two bars
  const bar = ang => { const c = Math.cos(ang), s = Math.sin(ang), L = .78, W = .13, T = .07, b0 = v.length / 7;
    const pt = (x, y, z, nx, ny, nz) => v.push(x * c - y * s, x * s + y * c, z, nx * c - ny * s, nx * s + ny * c, nz, 4);
    [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]].forEach((n, f) => {
      const u = f < 2 ? [1, 0, 0] : f < 4 ? [1, 0, 0] : [0, 1, 0], w = cross(n, u), q = v.length / 7;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => pt((n[0] + u[0] * a + w[0] * b) * L, (n[1] + u[1] * a + w[1] * b) * W, (n[2] + u[2] * a + w[2] * b) * T, n[0], n[1], n[2]));
      ix.push(q, q + 1, q + 2, q, q + 2, q + 3);
    }); return b0; };
  bar(Math.PI / 4); bar(-Math.PI / 4);
  return { v: new Float32Array(v), ix: new Uint16Array(ix), bowlCount, kavaCount, xCount: ix.length - bowlCount - kavaCount };
}
let MESH = null;

const VS = `attribute vec3 aP; attribute vec3 aN; attribute float aM;
uniform mat4 uVP; uniform mat4 uM; uniform mediump float uY; uniform float uR;
varying vec3 vN; varying vec3 vO; varying vec3 vW; varying float vM;
void main(){ vec3 p = aP; if (aM > 2.5 && aM < 3.5) p = vec3(aP.x * uR, uY, aP.z * uR);
  vec4 w = uM * vec4(p, 1.0); vW = w.xyz; vO = p; vM = aM; vN = mat3(uM) * aN; gl_Position = uVP * w; }`;
const FS = `precision mediump float;
varying vec3 vN; varying vec3 vO; varying vec3 vW; varying float vM;
uniform vec3 uEye; uniform float uT; uniform float uY; uniform float uGlow;
void main(){
  vec3 N = normalize(vN), V = normalize(uEye - vW), L = normalize(vec3(-.45, .85, .55));
  vec3 col; float spec = 0.0, shin = 18.0;
  if (vM < .5) {                               // husk: brown with fine fibres running round the shell
    float a = atan(vO.z, vO.x);
    float f = sin(a * 46.0 + sin(vO.y * 11.0) * 2.2) * .5 + .5;
    float g = sin(a * 9.0 + vO.y * 7.0) * .5 + .5;
    col = mix(vec3(.33, .2, .1), vec3(.5, .33, .18), f * .55 + g * .3);
    col *= .78 + .3 * smoothstep(-.74, 0.0, vO.y); spec = .12;
  } else if (vM < 1.5) { col = vec3(.78, .56, .31); spec = .2;      // cut rim
  } else if (vM < 2.5) {                       // inside: dark, a wet line just above the kava
    col = mix(vec3(.13, .08, .04), vec3(.26, .16, .08), smoothstep(-.67, 0.0, vO.y));
    col = mix(col, vec3(.36, .25, .15), smoothstep(.07, 0.0, vO.y - uY) * step(uY, vO.y) * .6);
  } else if (vM < 3.5) {                       // kava: muddy brown, gentle ripples, a soft shine
    float r = length(vO.xz);
    float w = sin(r * 15.0 - uT * 2.2) * .045 + sin(vO.x * 9.0 + uT * 1.4) * .03;
    N = normalize(vec3(w * vO.x / max(r, .01), 1.0, w * vO.z / max(r, .01)));
    col = mix(vec3(.66, .5, .32), vec3(.52, .38, .23), smoothstep(0.0, 1.0, r / .9)); spec = .5; shin = 42.0;
  } else { col = vec3(.74, .12, .1); spec = .3; shin = 24.0; }       // the red X
  float d = max(dot(N, L), 0.0);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 H = normalize(L + V);
  vec3 c = col * (.42 + .72 * d) + vec3(1.0, .93, .8) * (spec * pow(max(dot(N, H), 0.0), shin) + rim * .1);
  if (vM > 3.5) c += vec3(.1, .01, .01) * uGlow;
  gl_FragColor = vec4(c, 1.0);
}`;

function make(canvas) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return null;
  const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
  gl.useProgram(pr);
  MESH = MESH || buildMesh();
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, MESH.v, gl.STATIC_DRAW);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, MESH.ix, gl.STATIC_DRAW);
  [['aP', 3, 0], ['aN', 3, 12], ['aM', 1, 24]].forEach(([n, size, off]) => { const l = gl.getAttribLocation(pr, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 28, off); });
  const U = {}; ['uVP', 'uM', 'uY', 'uR', 'uEye', 'uT', 'uGlow'].forEach(n => U[n] = gl.getUniformLocation(pr, n));
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  return { gl, U };
}

const items = new Map();   // key -> instance
const MAX = 3;

function create(key, light) {
  const canvas = document.createElement('canvas'); canvas.className = 'shell3d'; canvas.setAttribute('aria-hidden', 'true');
  const ctx = make(canvas); if (!ctx) return null;
  const { gl, U } = ctx, eye = [0, 1.7, 3.55];
  const it = { key, canvas, light, level: LEVEL[light] ?? 0, from: LEVEL[light] ?? 0, to: LEVEL[light] ?? 0, t0: 0, x: light === 'closed' ? 1 : 0, spin: -.5, vel: 0, drag: null, raf: 0, seen: true, dead: false, last: 0, slow: 0, frames: 0, still: false };
  const size = () => { const r = canvas.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1), w = Math.max(2, Math.round(r.width * d)), h = Math.max(2, Math.round(r.height * d));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; } gl.viewport(0, 0, w, h); return w / h; };
  const draw = now => {
    const asp = size(), tt = now / 1000;
    const k = Math.min(1, (now - it.t0) / 900), e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
    it.level = it.from + (it.to - it.from) * e;
    const wantX = it.light === 'closed' ? 1 : 0; it.x += (wantX - it.x) * .18;
    const y = -DI + .05 + it.level * (DI - .13), r = RI * Math.sqrt(Math.max(0, 1 - (y / DI) * (y / DI))) * .995;
    const VP = mul(persp(.5, asp, .1, 20), lookAt(eye, [0, -.1, 0], [0, 1, 0]));
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uVP, false, VP); gl.uniform3fv(U.uEye, eye); gl.uniform1f(U.uT, it.still ? 0 : tt); gl.uniform1f(U.uY, y); gl.uniform1f(U.uR, it.level > .02 ? r : 0);
    gl.uniform1f(U.uGlow, .5 + .5 * Math.sin(tt * 2.4));
    const M = mul(rotZ(it.still ? 0 : Math.sin(tt * .8) * .025), rotY(it.spin));
    gl.uniformMatrix4fv(U.uM, false, M);
    gl.drawElements(gl.TRIANGLES, MESH.bowlCount + MESH.kavaCount, gl.UNSIGNED_SHORT, 0);
    if (it.x > .02) {
      const s = it.x * (1 + (it.still ? 0 : Math.sin(tt * 2.4) * .03));
      gl.uniformMatrix4fv(U.uM, false, mul(trs(0, .16, .12, s * .8), rotX(-.5)));
      gl.drawElements(gl.TRIANGLES, MESH.xCount, gl.UNSIGNED_SHORT, (MESH.bowlCount + MESH.kavaCount) * 2);
    }
  };
  const settled = now => now - it.t0 > 950 && Math.abs((it.light === 'closed' ? 1 : 0) - it.x) < .02;
  const loop = now => {
    it.raf = 0; if (it.dead) return;
    if (now - it.last < 30) { it.raf = requestAnimationFrame(loop); return; }      // about 30 pictures a second is plenty
    const dt = now - it.last; it.last = now;
    if (it.frames++ > 10 && it.frames < 70 && dt > 60) it.slow++;
    if (it.slow > 25) it.still = true;                                             // phone can't keep up: stop moving, keep the picture
    if (!it.drag) { it.spin += it.vel + (it.still ? 0 : .0065); it.vel *= .93; }
    draw(now);
    if (!canvas.classList.contains('on')) { canvas.classList.add('on'); canvas.parentNode && canvas.parentNode.classList.add('has3d'); }
    if (it.seen && !document.hidden && !(it.still || reduced()) || !settled(now) || Math.abs(it.vel) > .002) it.raf = requestAnimationFrame(loop);
  };
  it.kick = () => { if (!it.raf && !it.dead) it.raf = requestAnimationFrame(loop); };
  it.set = l => { if (l === it.light) return; it.light = l; it.from = it.level; it.to = LEVEL[l] ?? 0; it.t0 = performance.now(); it.kick(); };
  // drag (or swipe) to turn the shell
  canvas.addEventListener('pointerdown', e => { it.drag = { x: e.clientX }; it.vel = 0; try { canvas.setPointerCapture(e.pointerId); } catch (er) {} it.kick(); });
  canvas.addEventListener('pointermove', e => { if (!it.drag) return; const dx = e.clientX - it.drag.x; it.drag.x = e.clientX; it.spin += dx * .012; it.vel = dx * .012; it.kick(); });
  const up = () => { it.drag = null; it.kick(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); it.dead = true; canvas.classList.remove('on'); canvas.parentNode && canvas.parentNode.classList.remove('has3d'); items.delete(key); });
  if ('IntersectionObserver' in window) new IntersectionObserver(en => { it.seen = en[0].isIntersecting; if (it.seen) it.kick(); }).observe(canvas);
  return it;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) items.forEach(it => it.kick()); });

// Put the 3D shell for `key` inside `el` (the same canvas is moved along when the page redraws itself).
function attach(el, key, light, opts = {}) {
  let it = items.get(key);
  if (!it) {
    if (items.size >= MAX) return null;
    it = create(key, opts.from || light); if (!it) return null;
    items.set(key, it);
  }
  if (it.canvas.parentNode !== el) { it.canvas.parentNode && it.canvas.parentNode.classList.remove('has3d'); el.appendChild(it.canvas); if (it.canvas.classList.contains('on')) el.classList.add('has3d'); }
  it.t0 = it.t0 || performance.now() - 2000;
  if (opts.from && opts.from !== light) { it.light = opts.from; it.level = it.from = it.to = LEVEL[opts.from] ?? 0; it.x = opts.from === 'closed' ? 1 : 0; }
  it.set(light); it.kick();
  return it;
}
window.KLShell = { attach, count: () => items.size };
})();
