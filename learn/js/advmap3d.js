// v26: bản đồ Adventure 3D thật (WebGL / three.js) theo ảnh mẫu "Bestie Map".
// Thế giới cong (shader uốn mặt đất theo khoảng cách → quả cầu), ánh nắng + bóng đổ mềm, mờ tilt-shift,
// đất sét pastel nhô cao với mép bo tròn, sông lõm, bệ boss kem 2 tầng, cầu ván, nhà gỗ mái ngói,
// cây "nỉ", đá nhiều mặt, và mô hình 3D cho từng boss. Có thể thay bằng mô hình .glb (models/manifest.json).
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';

const RH = 1150, WR = 68, DEEP = 30, TAU = Math.PI * 2;
const rng = (seed) => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hashStr = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
export function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }

// ---------- màu theo ảnh mẫu ----------
const K = {
  land: '#e8edbf', landSide: '#ecdcb6', landSide2: '#dcc79c', water: '#6d9fb2', path: '#ebe0bc',
  padEdge: '#e6d6b4', padTop: '#f6ead3', padRing: '#efe2c6', padSide: '#e2d0ad',
  tree: ['#a2c5b5', '#98bfae', '#aacbbb', '#94b9a9'], pine: '#6b968b', trunk: '#9b3f27',
  rock: ['#cbdde6', '#b9d1de', '#d6e5ec'], stone: '#5f6271', roof: '#3f4554', roofL: '#4d5466', ridge: '#2f3441',
  wood: '#7b4535', woodD: '#5d3529', win: '#a9d4e6', door: '#3b2a26', cream: '#efe1c4', awnA: '#f3e6c9', awnB: '#e5995f',
  tent: '#c47a52', tentD: '#9e5a3a', plank: '#ddb58b', plankD: '#c49a6e', log: '#a57552', kingRock: ['#dfe1dc', '#d3d7d2', '#e7e8e3', '#cdd2cd'],
  rim: '#f3e9cd', pagodaWall: '#8a4a34', pagodaRoof: '#4a5266', gold: '#e8b54a', sky1: '#cfe4e8', sky2: '#eef0db',
};

// ---------- tạo hình (đều có màu từng đỉnh để gộp thành ít lưới) ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function prep(g, hex, opt = {}) {
  let geo = g.index ? g.toNonIndexed() : g;
  if (opt.flat) { geo.deleteAttribute('normal'); geo.computeVertexNormals(); }
  const c = new THREE.Color(hex), n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}
function put(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)); g.applyMatrix4(_m); return g;
}
const P = (g, hex, ...t) => put(prep(g, hex, t[9] || {}), ...t.slice(0, 9));
function jitter(g, amt, seed, flatY = 1) {
  const r = rng(seed), p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`; let d = seen.get(k); if (!d) { d = [(r() - 0.5) * amt, (r() - 0.5) * amt * flatY, (r() - 0.5) * amt]; seen.set(k, d); } p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]); }
  g.computeVertexNormals(); return g;
}
const merge = (list) => { const m = mergeGeometries(list.filter(Boolean), false); list.forEach((g) => g && g.dispose()); return m; };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);
function rbox(w, h, d, r = 2) { // khối bo cạnh (ván cầu, tường)
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d); s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.5, h - 2 * Math.min(r, h / 3)), bevelEnabled: true, bevelThickness: Math.min(r, h / 3), bevelSize: Math.min(r, h / 3) * 0.8, bevelSegments: 2, curveSegments: 3 });
  g.rotateX(-Math.PI / 2); g.translate(0, Math.min(r, h / 3), 0); return g;
}

// cây "nỉ": thân đỏ nâu + tán hình quả lê gợn nhẹ
function feltTree(seed, hgt, colorHex) {
  const r = rng(seed), H = hgt, W = H * 0.32, pts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; const rad = W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.78)), 0.85) * (1 - 0.32 * t) + (i === 14 ? 0 : 0.01); pts.push(new THREE.Vector2(Math.max(0.01, rad), t * H)); }
  const can = jitter(new THREE.LatheGeometry(pts, 18), H * 0.05, seed);
  return [P(cyl(H * 0.045, H * 0.055, H * 0.3, 8), K.trunk, 0, H * 0.15, 0), P(can, colorHex, 0, H * 0.2, 0, 0, r() * TAU)];
}
function pineTree(seed, hgt, snow) {
  const out = [P(cyl(hgt * 0.04, hgt * 0.05, hgt * 0.25, 8), K.trunk, 0, hgt * 0.12, 0)];
  const tiers = [[0.22, 0.34], [0.42, 0.28], [0.6, 0.21], [0.76, 0.13]];
  tiers.forEach(([y, rr], k) => { const g = jitter(sph(hgt * rr, 12, 8), hgt * 0.03, seed + k); out.push(P(g, k % 2 ? '#5a857a' : K.pine, 0, hgt * y, 0, 0, 0, 0, 1, 0.62, 1)); if (snow) out.push(P(sph(hgt * rr * 0.7, 10, 6), '#ffffff', 0, hgt * y + hgt * rr * 0.4, 0, 0, 0, 0, 1, 0.35, 1)); });
  return out;
}
function rocks(seed, sc = 1) {
  const r = rng(seed), out = [], n = 2 + Math.floor(r() * 2);
  for (let k = 0; k < n; k++) { const rr = (14 + r() * 14) * sc; const g = jitter(new THREE.IcosahedronGeometry(rr, 1), rr * 0.35, seed * 7 + k, 0.6); out.push(P(g, K.rock[k % 3], (k - 0.8) * 18 * sc, rr * 0.45, (r() - 0.5) * 16 * sc, 0, r() * TAU, 0, 1, 0.78, 1, { flat: true })); }
  return out;
}
function stone(seed) {
  const g = jitter(new THREE.DodecahedronGeometry(20, 1), 6, seed, 0.6), out = [P(g, K.stone, 0, 11, 0, 0, 0, 0, 1.2, 0.75, 1, { flat: true })];
  const r = rng(seed); for (let k = 0; k < 8; k++) { const a = r() * TAU, e = r() * 0.9; out.push(P(sph(2.4, 6, 4), '#d9dbe0', Math.cos(a) * 18 * Math.cos(e), 11 + 13 * Math.sin(e), Math.sin(a) * 15 * Math.cos(e))); }
  return out;
}
function bush(seed, c) { const r = rng(seed); return [[-9, 9, 11], [7, 10, 12], [0, 15, 9]].map(([x, y, s], k) => P(jitter(sph(s, 10, 8), 2, seed + k), c, x, y, (r() - 0.5) * 6)); }
function grass(seed) { const r = rng(seed); const out = []; for (let k = 0; k < 5; k++) out.push(P(cyl(0.2, 1.4, 14 + r() * 8, 4), '#a8bf7d', (k - 2) * 3, 8, (r() - 0.5) * 4, (r() - 0.5) * 0.6, 0, (k - 2) * 0.18)); return out; }
// nhà gỗ mái ngói (nhìn chéo thấy rõ mái), quán có mái hiên sọc, nhà kho mái vòm
function gableRoof(out, w, d, y0, rh, ov, cA, cB, ridge) {
  const half = d / 2 + ov, L = Math.hypot(half, rh), ang = Math.atan2(rh, half), rows = 4;
  for (const s of [1, -1]) for (let k = 0; k < rows; k++) {
    const t = (k + 0.5) / rows, zc = s * half * (1 - t), yc = y0 + rh * t;
    out.push(P(box(w + ov * 2, 2.6, L / rows + 3), k % 2 ? cA : cB, 0, yc + 1.2, zc, s * ang, 0, 0));
  }
  out.push(P(box(w + ov * 2 + 2, 4, 6), ridge, 0, y0 + rh + 2, 0));
}
function gableEnds(out, w, d, y0, rh, c) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, rh); s.closePath();
  for (const x of [-w / 2, w / 2 - 1]) { const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); out.push(P(g, c, x, y0, 0, 0, Math.PI / 2, 0)); }
}
function cabin(kind, roofHex, sc = 1) {
  const out = [], w = 58, d = 40, h = 30;
  const wall = kind === 'shop' ? K.cream : kind === 'shed' ? '#b8774a' : K.wood, wallS = kind === 'shop' ? '#d9c8a6' : kind === 'shed' ? '#96603c' : K.woodD;
  out.push(P(box(w, h, d), wall, 0, h / 2, 0));
  out.push(P(box(w + 2, 3, d + 2), wallS, 0, 1.5, 0));
  if (kind === 'shed') {
    out.push(P(new THREE.CylinderGeometry(d / 2 + 5, d / 2 + 5, w + 8, 16, 1, false, 0, Math.PI), '#b06a40', 0, h, 0, 0, 0, Math.PI / 2));
    out.push(P(box(18, 22, 1.5), '#efe6d2', 0, 11, d / 2 + 0.5)); out.push(P(box(10, 12, 1.6), '#7a5a44', 0, 13, d / 2 + 1));
  } else {
    const roofA = roofHex || K.roof, roofB = shade(roofA, 1.14);
    gableEnds(out, w, d, h, 20, wall);
    gableRoof(out, w, d, h, 20, 6, roofA, roofB, K.ridge);
    out.push(P(box(10, 9, 1.4), K.win, -17, 18, d / 2 + 0.5)); out.push(P(box(10, 9, 1.4), K.win, 17, 18, d / 2 + 0.5));
    out.push(P(box(12, 1.4, 2.5), shade(wall, 0.8), -17, 13, d / 2 + 1)); out.push(P(box(12, 1.4, 2.5), shade(wall, 0.8), 17, 13, d / 2 + 1));
    out.push(P(box(9, 17, 1.4), kind === 'shop' ? '#8a5a3a' : K.door, 0, 8.5, d / 2 + 0.6));
    out.push(P(box(7, 14, 7), '#6a5a52', 16, h + 18, -8));
    if (kind === 'shop') {
      for (let k = 0; k < 6; k++) out.push(P(box(w / 6 + 0.4, 1.4, 16), k % 2 ? K.awnB : K.awnA, -w / 2 + (k + 0.5) * w / 6, h * 0.66, d / 2 + 7, 0.42, 0, 0));
      out.push(P(box(w - 6, 9, 7), '#c9a67a', 0, 4.5, d / 2 + 7));
    }
  }
  return out.map((g) => (sc !== 1 ? g.scale(sc, sc, sc) : g));
}
function tent(sc = 1) {
  const s = new THREE.Shape(); s.moveTo(-30, 0); s.lineTo(30, 0); s.lineTo(0, 38); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 48, bevelEnabled: true, bevelThickness: 1.5, bevelSize: 1.5, bevelSegments: 1 }); g.translate(0, 0, -24);
  const out = [P(g, K.tent), P(new THREE.ShapeGeometry((() => { const q = new THREE.Shape(); q.moveTo(-8, 0); q.lineTo(8, 0); q.lineTo(0, 16); q.closePath(); return q; })()), '#5e3020', 0, 0.5, 25.8)];
  return out.map((x) => x.scale(sc, sc, sc));
}
function cart(sc = 1) {
  const out = [P(rbox(42, 24, 30, 3), '#9a5c3c', 0, 4, 0), P(new THREE.CylinderGeometry(19, 19, 50, 14, 1, false, 0, Math.PI), K.roof, 0, 28, 0, 0, 0, Math.PI / 2)];
  for (const x of [-16, 16]) { out.push(P(cyl(8, 8, 4, 14), '#4a3a30', x, 8, 16, Math.PI / 2, 0, 0)); out.push(P(cyl(3, 3, 5, 8), '#e9d6b4', x, 8, 16.5, Math.PI / 2, 0, 0)); }
  out.push(P(box(30, 8, 1.4), '#efe0bf', 0, 16, 15.6));
  return out.map((x) => x.scale(sc, sc, sc));
}
function picnic() {
  const out = [P(box(64, 1.4, 50), '#e7a07a', 0, 0.7, 0, 0, 0.18, 0), P(box(56, 1.6, 2), '#f6d2bc', 0, 1, 0, 0, 0.18, 0)];
  out.push(P(rbox(14, 9, 11, 2), '#b4472f', 4, 1.4, 8)); out.push(P(new THREE.TorusGeometry(5, 1, 6, 12, Math.PI), '#8a3322', 4, 10, 8));
  for (const [x, z, c] of [[-18, -2, '#2f3441'], [16, -8, '#d98a3a']]) { out.push(P(new THREE.CapsuleGeometry(6, 8, 4, 10), c, x, 9, z)); out.push(P(sph(5.5, 12, 10), '#f2d9c0', x, 22, z)); out.push(P(sph(6, 10, 6), c, x, 25, z, 0, 0, 0, 1, 0.5, 1)); }
  return out;
}
function shade(hex, f) { const c = new THREE.Color(hex); c.r = clamp(c.r * f, 0, 1); c.g = clamp(c.g * f, 0, 1); c.b = clamp(c.b * f, 0, 1); return '#' + c.getHexString(); }
// bệ boss: đế mỏng + vành bo tròn + bậc giữa cao
function pad(r) {
  return [
    P(cyl(r, r + 1.5, 4, 48), K.padEdge, 0, 2, 0), P(new THREE.TorusGeometry(r - 1, 2.6, 8, 48), K.padRing, 0, 4, 0, Math.PI / 2, 0, 0),
    P(new THREE.CircleGeometry(r - 1, 48), K.padRing, 0, 4.3, 0, -Math.PI / 2, 0, 0),
    P(cyl(r * 0.66, r * 0.68, 10, 40), K.padSide, 0, 9, 0), P(new THREE.TorusGeometry(r * 0.66 - 1.5, 2.2, 8, 40), K.padTop, 0, 14, 0, Math.PI / 2, 0, 0),
    P(new THREE.CircleGeometry(r * 0.66 - 1.5, 40), K.padTop, 0, 14.3, 0, -Math.PI / 2, 0, 0),
  ];
}
// vua vùng: khối đá tròn + bậc thang + nhà mái cong
function kingRock() {
  const out = [], lobes = [[-40, 26, 6, 42], [38, 24, 2, 44], [-6, 50, -14, 44], [-26, 72, -6, 28], [24, 68, -18, 30], [4, 30, 22, 30]];
  lobes.forEach(([x, y, z, r], k) => out.push(P(jitter(sph(r, 18, 14), r * 0.08, 50 + k), K.kingRock[k % 4], x, y, z, 0, k, 0, 1, 0.92, 1)));
  for (let k = 0; k < 8; k++) out.push(P(box(26 - k * 1.2, 4.5, 8), k % 2 ? '#c4c9c5' : '#cfd3cf', 18 - k * 0.6, 3 + k * 9.5, 42 - k * 6.2));
  const hy = 94, w = 48, d = 40, h = 36;
  out.push(P(box(w, h, d), K.pagodaWall, -4, hy + h / 2, -6));
  out.push(P(box(14, 14, 1.4), '#d9b46a', -16, hy + 20, 14.5)); out.push(P(box(16, 26, 1.4), '#2b2f3a', 8, hy + 13, 14.5));
  const s = new THREE.Shape(); s.moveTo(-40, 6); s.quadraticCurveTo(-30, 0, -18, 10); s.lineTo(0, 26); s.lineTo(18, 10); s.quadraticCurveTo(30, 0, 40, 6); s.lineTo(40, 2); s.lineTo(-40, 2); s.closePath();
  const roof = new THREE.ExtrudeGeometry(s, { depth: w + 18, bevelEnabled: false, curveSegments: 8 }); roof.translate(0, 0, -(w + 18) / 2);
  out.push(P(roof, K.pagodaRoof, -4, hy + h - 2, -6, 0, Math.PI / 2, 0));
  out.push(P(box(w + 22, 4, 5), K.ridge, -4, hy + h + 24, -6));
  return out;
}
function bridgeGeo(len, wdt) {
  const out = [], n = 5, pl = len / n;
  for (let k = 0; k < n; k++) out.push(P(rbox(pl - 2.5, 9, wdt, 2.5), k % 2 ? K.plank : shade(K.plank, 1.06), -len / 2 + (k + 0.5) * pl, -1, 0));
  for (const z of [-wdt * 0.32, wdt * 0.32]) out.push(P(cyl(3.2, 3.2, len + 6, 8), K.log, 0, -3, z, 0, 0, Math.PI / 2));
  return out;
}
function fence(seed) { // hàng rào gỗ chữ L sau nhà
  const out = [], r = rng(seed);
  for (let k = 0; k < 5; k++) out.push(P(box(3, 14, 3), '#a57552', -40 + k * 14, 7, -32));
  for (let k = 0; k < 3; k++) out.push(P(box(3, 14, 3), '#a57552', -44, 7, -18 + k * 14));
  out.push(P(box(58, 2.2, 2), '#c49a6e', -12, 10, -32), P(box(58, 2.2, 2), '#c49a6e', -12, 5, -32), P(box(2, 2.2, 32), '#c49a6e', -44, 10, -4), P(box(2, 2.2, 32), '#c49a6e', -44, 5, -4));
  void r; return out;
}
function lantern() { return [P(cyl(1.2, 1.4, 34, 6), '#5a3a24', 0, 17, 0), P(box(12, 2, 2), '#5a3a24', 5, 33, 0), P(sph(5, 10, 8), '#ff7a4a', 10, 26, 0, 0, 0, 0, 1, 1.25, 1), P(cyl(3, 3, 2, 8), '#3a2a20', 10, 32, 0), P(cyl(3, 3, 2, 8), '#3a2a20', 10, 20, 0)]; }
function flagGeo(col) { return [P(cyl(1.3, 1.3, 50, 6), '#6a4a32', 0, 25, 0), P(box(24, 15, 0.8), col, 12, 42, 0)]; }

// ---------- mô hình 3D các boss (dáng theo tên) ----------
const BOSS_COLORS = ['#7ccf8a', '#f2a65a', '#9b8cf0', '#f07a8a', '#6cc3e0', '#f2c94c', '#c78bd8', '#7fd1b9', '#ef8f6b', '#8fb0f2'];
function archOf(name) {
  const n = name.toLowerCase();
  const has = (...k) => k.some((x) => n.includes(x));
  if (has('dragon', 'qilin', 'phoenix')) return 'dragon';
  if (has('goblin', 'gremlin', 'imp', 'troll', 'pixie', 'sprite', 'nine-tail')) return has('troll') ? 'golem' : 'goblin';
  if (has('moth', 'wasp', 'scorpion', 'lantern')) return 'bug';
  if (has('owl', 'gull', 'raven', 'vulture', 'crane', 'heron', 'hawk', 'crow', '鸟')) return 'bird';
  if (has('crab', 'squid', 'kraken', 'eel', 'seal', 'carp', 'koi', 'otter', 'frog', 'turtle')) return 'sea';
  if (has('ghost', 'wraith', 'shade', 'spirit', '过')) return 'ghost';
  if (has('golem', 'oak', 'avalanche', 'giant', 'yeti', 'sentinel', 'frost')) return 'golem';
  if (has('snake', 'cobra', 'lizard', '蛇')) return 'snake';
  if (has('panda')) return 'panda';
  if (has('knight', 'mage', 'archer', 'nomad', 'captain', 'sage', 'master', 'emperor', 'ninja', 'gatekeeper', 'scholar', 'sphinx')) return 'hero';
  if (has('pup', 'fox', 'wolf', 'lynx', 'goat', 'ram', 'bear', 'moose', 'mouse', 'badger', 'rabbit', 'horse', 'ox', 'tiger', 'lion', 'cat', 'tea')) return 'beast';
  return 'blob';
}
function bossModel(name, seed, king, gray) {
  const r = rng(seed), arch = archOf(name);
  let base = BOSS_COLORS[seed % BOSS_COLORS.length];
  if (arch === 'ghost') base = '#eef0f6'; if (arch === 'panda') base = '#f7f7f4'; if (arch === 'golem') base = name.toLowerCase().includes('oak') ? '#8fae6a' : '#b8c4cc';
  if (gray) base = '#b7b9b6';
  const lite = shade(base, 1.18), dark = shade(base, 0.72), out = [];
  const eye = (x, y, z, s = 1) => { out.push(P(sph(5 * s, 12, 10), '#ffffff', x, y, z)); out.push(P(sph(2.6 * s, 10, 8), '#22252c', x * 1.04, y, z + 3.6 * s)); out.push(P(sph(0.9 * s, 6, 4), '#ffffff', x * 1.04 + 1, y + 1.2, z + 5.2 * s)); };
  if (arch === 'snake') {
    out.push(P(new THREE.TorusGeometry(14, 6, 10, 24), base, 0, 7, 0, Math.PI / 2, 0, 0)); out.push(P(new THREE.TorusGeometry(9, 5.5, 10, 20), lite, 0, 16, 0, Math.PI / 2, 0, 0));
    out.push(P(sph(10, 14, 12), base, 0, 30, 4, 0, 0, 0, 1, 0.9, 1.1)); eye(-4.5, 33, 11, 0.8); eye(4.5, 33, 11, 0.8); out.push(P(box(1.2, 1.2, 8), '#d2394a', 0, 26, 16));
  } else if (arch === 'ghost') {
    const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(Math.max(0.01, 16 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) * (1 - 0.15 * t) + (t < 0.15 ? 4 * Math.sin(t * 60) : 0)), 6 + t * 36)); }
    out.push(P(jitter(new THREE.LatheGeometry(pts, 18), 1.5, seed), base, 0, 0, 0)); eye(-6, 30, 12, 0.9); eye(6, 30, 12, 0.9); out.push(P(sph(3, 10, 8), '#3a3f4a', 0, 22, 15, 0, 0, 0, 1, 1.3, 0.6));
  } else {
    const body = arch === 'golem' ? jitter(new THREE.IcosahedronGeometry(20, 1), 4, seed, 0.8) : sph(18, 22, 18);
    out.push(P(body, base, 0, 21, 0, 0, 0, 0, 1, arch === 'hero' ? 1.15 : 1.02, 0.95, arch === 'golem' ? { flat: true } : {}));
    out.push(P(sph(11, 16, 12), lite, 0, 17, 7, 0, 0, 0, 1, 0.95, 0.75));
    for (const x of [-9, 9]) out.push(P(sph(6, 10, 8), dark, x, 4, 4, 0, 0, 0, 1, 0.6, 1.2));
    eye(-7, 26, 13); eye(7, 26, 13);
    out.push(P(new THREE.TorusGeometry(4, 1.1, 6, 12, Math.PI), '#3a2a2a', 0, 18.5, 16.5, Math.PI, 0, 0));
    for (const x of [-11, 11]) out.push(P(sph(3.4, 8, 6), '#ff9fa8', x, 20.5, 14, 0, 0, 0, 1, 0.6, 0.4));
    if (arch === 'goblin') for (const s of [-1, 1]) out.push(P(new THREE.ConeGeometry(5, 18, 8), base, s * 20, 30, 0, 0, 0, -s * 1.2));
    if (arch === 'beast') { for (const s of [-1, 1]) out.push(P(new THREE.ConeGeometry(6, 13, 8), dark, s * 11, 40, 0, 0, 0, -s * 0.35)); out.push(P(sph(7, 12, 10), lite, 0, 20, 16, 0, 0, 0, 1.1, 0.8, 0.8)); out.push(P(sph(2.4, 8, 6), '#2a2a30', 0, 22, 22)); }
    if (arch === 'panda') { for (const s of [-1, 1]) { out.push(P(sph(6, 10, 8), '#2a2a30', s * 12, 38, 0)); out.push(P(sph(5.5, 10, 8), '#2a2a30', s * 7, 26, 12, 0, 0, 0, 1, 1.2, 0.6)); } }
    if (arch === 'bug') { for (const s of [-1, 1]) { out.push(P(sph(16, 12, 8), 'rgba' === '' ? '' : shade(base, 1.3), s * 22, 28, -6, 0, s * 0.5, s * 0.5, 1, 0.12, 0.7)); out.push(P(cyl(0.8, 0.8, 14, 5), '#3a3a40', s * 5, 44, 4, 0, 0, -s * 0.3)); out.push(P(sph(2.4, 8, 6), '#3a3a40', s * 7.5, 51, 4)); } }
    if (arch === 'bird') { out.push(P(new THREE.ConeGeometry(4, 10, 8), '#f2a83a', 0, 21, 19, Math.PI / 2, 0, 0)); for (const s of [-1, 1]) out.push(P(sph(10, 12, 8), dark, s * 18, 20, -2, 0, 0, s * 0.6, 0.5, 1, 0.9)); for (const s of [-1, 1]) out.push(P(new THREE.ConeGeometry(4, 9, 6), dark, s * 8, 40, 0, 0, 0, -s * 0.3)); }
    if (arch === 'sea') { for (const s of [-1, 1]) { out.push(P(sph(7, 10, 8), dark, s * 22, 18, 6)); out.push(P(new THREE.ConeGeometry(3.5, 9, 6), dark, s * 26, 25, 8, 0, 0, -s * 0.5)); } out.push(P(new THREE.ConeGeometry(7, 12, 8), lite, 0, 40, -4)); }
    if (arch === 'dragon') { for (const s of [-1, 1]) { out.push(P(new THREE.ConeGeometry(3.5, 14, 8), '#f4e3b0', s * 8, 42, 0, 0, 0, -s * 0.3)); out.push(P(sph(14, 12, 8), shade(base, 0.85), s * 22, 28, -8, 0, s * 0.6, s * 0.6, 1, 0.12, 0.8)); } for (let k = 0; k < 4; k++) out.push(P(new THREE.ConeGeometry(3, 8, 6), '#f4e3b0', 0, 38 - k * 8, -14 - k * 1.5, -0.5, 0, 0)); }
    if (arch === 'hero') { out.push(P(new THREE.ConeGeometry(16, 22, 16), dark, 0, 50, 0)); out.push(P(cyl(19, 19, 2.5, 20), dark, 0, 39.5, 0)); out.push(P(sph(3, 8, 6), K.gold, 0, 62, 0)); }
    if (arch === 'golem') { out.push(P(jitter(sph(7, 8, 6), 2, seed + 3), shade(base, 0.85), -18, 26, 0, 0, 0, 0, 1, 1, 1, { flat: true })); out.push(P(jitter(sph(7, 8, 6), 2, seed + 4), shade(base, 0.85), 18, 26, 0, 0, 0, 0, 1, 1, 1, { flat: true })); }
    if (arch === 'blob') out.push(P(cyl(0.8, 0.8, 12, 5), '#3a3a40', 0, 44, 0), P(sph(3, 8, 6), K.gold, 0, 51, 0));
  }
  if (king) { out.push(P(cyl(11, 12, 7, 16, 1, true), K.gold, 0, arch === 'hero' ? 66 : 47, 0)); for (let k = 0; k < 5; k++) out.push(P(new THREE.ConeGeometry(2.6, 7, 6), K.gold, Math.cos(k / 5 * TAU) * 11, (arch === 'hero' ? 66 : 47) + 6, Math.sin(k / 5 * TAU) * 11)); }
  void r;
  return merge(out.filter(Boolean));
}

// ---------- thế giới cong: uốn đỉnh theo khoảng cách tới tâm nhìn ----------
const U = { uCamZ: { value: 0 }, uCurveR: { value: 3000 } };
function curve(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCamZ = U.uCamZ; sh.uniforms.uCurveR = U.uCurveR;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCamZ;\nuniform float uCurveR;')
      .replace('#include <project_vertex>', `vec4 bwp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  bwp = instanceMatrix * bwp;
#endif
bwp = modelMatrix * bwp;
float bdz = bwp.z - uCamZ;
bwp.y -= ( bdz * bdz + 0.55 * bwp.x * bwp.x ) / ( 2.0 * uCurveR );
vec4 mvPosition = viewMatrix * bwp;
gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'curved';
  return mat;
}
function noiseTex(seed) { // vân "nỉ / đất sét" rất nhẹ
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2600; i++) { const v = 225 + Math.floor(r() * 30); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function softDot() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; }
function pathTex() { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 64, 0); g.addColorStop(0, 'rgba(236,224,188,0)'); g.addColorStop(0.18, 'rgba(236,224,188,.95)'); g.addColorStop(0.82, 'rgba(236,224,188,.95)'); g.addColorStop(1, 'rgba(236,224,188,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); x.fillStyle = 'rgba(190,170,120,.55)'; for (const cx0 of [22, 42]) for (let y = 4; y < 64; y += 16) x.fillRect(cx0, y, 2.4, 7); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }
function skyTex() { const c = document.createElement('canvas'); c.width = 2; c.height = 256; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, K.sky1); g.addColorStop(0.5, K.sky2); g.addColorStop(1, '#f3efd6'); x.fillStyle = g; x.fillRect(0, 0, 2, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function mount(host, o) {
  const N = o.regions.length, ph = o.map === 'zh' ? 1.9 : 0.5;
  const xr = (y) => 500 + 150 * Math.sin(y / 480 + ph) + 40 * Math.sin(y / 160 + ph * 2);
  const X = (wx) => wx - 500, Z = (wy) => -wy;
  // ---------- bố cục (giống bản 2D) ----------
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const y0 = i * RH;
    for (let k = 1; k <= 5; k++) { const y = y0 + 150 + (k - 1) * 178, side = (k + i) % 2 ? 1 : -1; nodes.push({ r: i + 1, n: k, x: xr(y) + side * (205 + ((k * 37 + i * 11) % 26)), y, side }); }
    const s5 = nodes[nodes.length - 1].side, y = y0 + 1020; nodes.push({ r: i + 1, n: 6, x: xr(y) - s5 * 235, y, side: -s5 });
  }
  const nodeOf = (r, n) => nodes.find((d) => d.r === r && d.n === n);
  // đồi thấp lượn sóng (tránh sông, bệ, đường) — độ cao mặt đất tại (x, y)
  const hills = []; { const r = rng(o.map === 'zh' ? 17 : 41); for (let k = 0; k < N * 7; k++) { const x = r() < 0.5 ? -350 + r() * 520 : 830 + r() * 520, y = r() * N * RH; hills.push([x, y, 140 + r() * 160, 16 + r() * 22]); } }
  const hgtRaw = (x, y) => { let hh = 0; for (const [hx, hy, rr, a] of hills) { const d2 = ((x - hx) ** 2 + (y - hy) ** 2) / (rr * rr); if (d2 < 4) hh += a * Math.exp(-d2 * 1.6); } return hh; };
  const bridges = [], trail = [];
  for (let j = 1; j < nodes.length; j++) {
    const a = nodes[j - 1], b = nodes[j];
    if (a.side !== b.side) { const yb = (a.y + b.y) / 2, xb = xr(yb), e = WR + 30; bridges.push({ y: yb, x: xb }); trail.push([[a.x, a.y], [xb + a.side * (e + 40), yb - 8], [xb + a.side * (e - 6), yb], null, [xb - a.side * (e - 6), yb], [xb - a.side * (e + 40), yb + 8], [b.x, b.y]]); }
    else trail.push([[a.x, a.y], [(a.x + b.x) / 2 + a.side * 40, (a.y + b.y) / 2], [b.x, b.y]]);
  }
  const distSeg = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l, 0, 1); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
  const nearTrail = (x, y, d) => trail.some((seg) => seg.some((p, k) => k && p && seg[k - 1] && distSeg(x, y, seg[k - 1], p) < d));
  const nearNode = (x, y, d) => nodes.some((q) => Math.hypot(q.x - x, q.y - y) < (q.n === 6 ? d + 60 : d));
  const hgt = (x, y) => { const dr = Math.abs(x - xr(y)) - WR; if (dr < 90) return 0; let k = Math.min(1, (dr - 90) / 120); for (const q of nodes) { const d = Math.hypot(q.x - x, q.y - y); if (d < 230) k = Math.min(k, Math.max(0, (d - 150) / 80)); } return hgtRaw(x, y) * k; };

  // ---------- renderer ----------
  host.innerHTML = '<canvas class="a3-cv" tabindex="0" aria-label="Adventure map. Use the arrow keys or scroll to move."></canvas><div class="a3-ov" aria-hidden="true"></div>';
  const cv = host.querySelector('canvas'), ov = host.querySelector('.a3-ov');
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = skyTex();
  scene.fog = new THREE.Fog(new THREE.Color('#e3ece4'), 1800, 4200);
  const camera = new THREE.PerspectiveCamera(17, 1, 50, 14000);
  const hemi = new THREE.HemisphereLight('#f6fbf8', '#d8cca2', 1.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e2', 2.3); sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6; sun.shadow.radius = 4;
  const sc = sun.shadow.camera; sc.left = -900; sc.right = 900; sc.top = 900; sc.bottom = -900; sc.near = 10; sc.far = 3000;
  scene.add(sun, sun.target);
  const tex = noiseTex(9);
  const matV = curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, map: tex }));
  const disposables = [tex];

  // ---------- đất sét 2 bờ (khối đùn có mép bo tròn) ----------
  // địa hình: lưới dày (để uốn cong được) — mặt đất + mép bo tròn + vách đất xuống lòng sông
  const matT = curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: tex, side: THREE.DoubleSide }));
  function plate(side) {
    const hgtOf = (x, y) => (Math.abs(x - xr(y)) - WR > 60 ? hgt(x, y) : 0);
    const yA = -1600, yB = N * RH + 2400, step = 24;
    const offs = [3600, 3000, 2500, 2100, 1800, 1560, 1360, 1210, 1080, 970, 870, 780, 700, 625, 555, 490, 430, 375, 325, 280, 240, 205, 175, 148, 124, 102, 82, 64, 48, 32, 22];
    const RR = 20, rim = []; for (let k = 0; k <= 6; k++) { const a = (k / 6) * Math.PI / 2; rim.push([RR - RR * Math.sin(a), -RR + RR * Math.cos(a)]); } rim.push([0, -DEEP - 8]);
    const prof = [...offs.map((o) => [o, 0]), ...rim]; // [khoảng cách tới mép sông, độ cao]
    const cTop = new THREE.Color(K.land), cRim = new THREE.Color(K.rim || '#f2e8cc'), cW1 = new THREE.Color(K.landSide), cW2 = new THREE.Color(K.landSide2);
    const pos = [], col = [], uv = [], idx = [], P_ = prof.length; let rows = 0;
    for (let y = yA; y <= yB; y += step, rows++) {
      const xb = xr(y) + side * WR;
      prof.forEach(([o, hgt], k) => {
        const x = xb + side * o; pos.push(X(x), k < offs.length - 1 ? hgt + hgtOf(x, y) : hgt, Z(y)); uv.push(x / 160, y / 160);
        const c = k < offs.length - 1 ? cTop : hgt > -9 ? cRim : hgt > -22 ? cW1 : cW2; col.push(c.r, c.g, c.b);
      });
      if (rows) { const b0 = (rows - 1) * P_, b1 = rows * P_; for (let k = 0; k < P_ - 1; k++) { if (side < 0) idx.push(b0 + k, b1 + k, b0 + k + 1, b0 + k + 1, b1 + k, b1 + k + 1); else idx.push(b0 + k, b0 + k + 1, b1 + k, b0 + k + 1, b1 + k + 1, b1 + k); } }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, matT); m.receiveShadow = true; m.frustumCulled = false; return m;
  }
  scene.add(plate(-1), plate(1));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, N * RH + 4000, 28, Math.ceil((N * RH + 4000) / 40)), curve(new THREE.MeshStandardMaterial({ color: K.water, roughness: 0.38, metalness: 0.05 })));
  water.rotation.x = -Math.PI / 2; water.position.set(0, -DEEP + 2, -(N * RH) / 2 + 400); water.receiveShadow = true; water.frustumCulled = false; scene.add(water);
  // gợn nước trôi
  const ripG = new THREE.PlaneGeometry(22, 3.2), ripM = curve(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
  const ripN = Math.ceil((N * RH + 1400) / 70), rip = new THREE.InstancedMesh(ripG, ripM, ripN); rip.frustumCulled = false; scene.add(rip);
  const ripSeed = Array.from({ length: ripN }, (_, k) => [k * 70 - 400, Math.sin(k * 1.7) * 30]);
  // mảng màu mềm trên đất (giống vết loang trong ảnh mẫu)
  {
    const r = rng(5), dots = [], cnt = N * 26; const dt = softDot(); disposables.push(dt);
    const mt = curve(new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false, opacity: 0.13, vertexColors: false }));
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), mt, cnt); im.frustumCulled = false;
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let k = 0; k < cnt; k++) { let x, y, tries = 0; do { x = -300 + r() * 1600; y = -200 + r() * (N * RH + 200); tries++; } while (Math.abs(x - xr(y)) < WR + 60 && tries < 20); const s = 50 + r() * 120; m4.compose(_v.set(X(x), 0.6, Z(y)), _q.setFromEuler(_e.set(-Math.PI / 2, 0, r() * TAU)), _s.set(s, s * (0.6 + r() * 0.5), 1)); im.setMatrixAt(k, m4); im.setColorAt(k, c.set(r() < 0.6 ? '#a9c47a' : '#efe7b8')); dots.push(0); }
    scene.add(im);
  }
  // đường mòn: dải mềm có vệt bánh xe
  {
    const ptex = pathTex(); disposables.push(ptex);
    const mt = curve(new THREE.MeshStandardMaterial({ map: ptex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    for (const seg0 of trail) {
      const parts = []; let cur = []; seg0.forEach((p) => { if (!p) { if (cur.length > 1) parts.push(cur); cur = []; } else cur.push(p); }); if (cur.length > 1) parts.push(cur);
      for (const seg of parts) {
        const pts = []; for (let k = 1; k < seg.length; k++) { const a = seg[k - 1], b = seg[k], n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14)); for (let j = k > 1 ? 1 : 0; j <= n; j++) { const t = j / n; pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
        const pos = [], uv = [], idx = []; let acc = 0;
        pts.forEach((p, i) => { const q = pts[Math.min(i + 1, pts.length - 1)], pr = pts[Math.max(i - 1, 0)], dx = q[0] - pr[0], dy = q[1] - pr[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * 15, ny = dx / l * 15; if (i) acc += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); pos.push(X(p[0] + nx), 0.9, Z(p[1] + ny), X(p[0] - nx), 0.9, Z(p[1] - ny)); uv.push(0, acc / 60, 1, acc / 60); if (i) { const b0 = (i - 1) * 2; idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); } });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, mt); m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
      }
    }
  }
  // ---------- cảnh tĩnh theo vùng: gộp thành 1 lưới / vùng ----------
  const R0 = rng(o.map === 'zh' ? 71 : 23), placed = [], contacts = [];
  const slots = []; // {key, group, h, w, tint}: mô hình dựng sẵn → thay bằng .glb khi tải xong
  function slot(key, list, x, y, ry, opt = {}) {
    const g = new THREE.Group(), m = new THREE.Mesh(merge(list), matV); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    g.add(m); g.position.set(X(x), (opt.y || 0) + (opt.y ? 0 : hgt(x, y)), Z(y)); g.rotation.y = ry || 0; scene.add(g); slots.push({ key, g, m, ...opt }); return g;
  }
  const free = (x, y, d) => !placed.some((q) => Math.abs(q[1] - y) < d && Math.abs(q[0] - x) < d);
  for (let i = 0; i < N; i++) {
    const th = o.themes[i], pal = o.pal[th] || o.pal.meadow, treeKind = o.treeOf[th] || 'tree', roof = pal.roof === '#4b5a78' ? K.roof : pal.roof, geos = [];
    const add = (list, x, y, ry = 0, s = 1, cs = 0) => { const yy = hgt(x, y); list.forEach((g) => geos.push(put(g, X(x), yy, Z(y), 0, ry, 0, s))); if (cs) contacts.push([x, y, cs, yy]); };
    let cnt = 0;
    for (let t = 0; t < 1600 && cnt < 64; t++) {
      const x = -320 + R0() * 1640, y = i * RH + R0() * RH;
      if (Math.abs(x - xr(y)) < WR + 46 || nearNode(x, y, 128) || nearTrail(x, y, 30)) continue;
      const roll = R0();
      const kind = roll < 0.46 ? (treeKind === 'tree' && R0() < 0.22 ? 'pine' : treeKind) : roll < 0.58 ? 'rocks' : roll < 0.63 ? 'stone' : roll < 0.75 ? 'grass' : roll < 0.84 ? 'bush' : roll < 0.92 ? 'cabin' : roll < 0.96 ? 'shop' : 'shed';
      const big = ['cabin', 'shop', 'shed', 'rocks'].includes(kind);
      if (!free(x, y, big ? 90 : 50)) continue;
      if (big && (nearTrail(x, y, 58) || Math.abs(x - xr(y)) < WR + 85)) continue;
      const sd = Math.floor(R0() * 10000), sz = 0.85 + R0() * 0.45;
      if (kind === 'tree') add(feltTree(sd, 100 + R0() * 50, K.tree[sd % 4]), x, y, 0, 1, 34);
      else if (kind === 'pine' || kind === 'snowtree') add(pineTree(sd, 70 + R0() * 30, kind === 'snowtree'), x, y, 0, 1, 26);
      else if (kind === 'cactus') add([P(new THREE.CapsuleGeometry(6, 34, 4, 8), '#7cae86', 0, 22, 0), P(new THREE.CapsuleGeometry(4, 10, 4, 8), '#7cae86', -10, 26, 0, 0, 0, 0.9), P(new THREE.CapsuleGeometry(4, 12, 4, 8), '#7cae86', 10, 32, 0, 0, 0, -0.9)], x, y);
      else if (kind === 'rocks') add(rocks(sd, sz), x, y, 0, 1, 40 * sz);
      else if (kind === 'stone') add(stone(sd), x, y, R0() * TAU, 1, 28);
      else if (kind === 'grass') add(grass(sd), x, y, R0() * TAU);
      else if (kind === 'bush') add(bush(sd, K.tree[sd % 4]), x, y, 0, 1, 22);
      else { const sc2 = 0.9 + R0() * 0.2, ry2 = (R0() - 0.5) * 0.5; contacts.push([x, y, 56, hgt(x, y)]); if (R0() < 0.6) add(fence(sd), x, y, ry2); if (R0() < 0.55) slot(kind === 'shop' ? 'shop' : kind === 'shed' ? 'tractor' : 'treehouse', cabin(kind, roof, sc2), x, y, ry2, { size: kind === 'shed' ? 58 : 100 * sc2, by: 'w' }); else add(cabin(kind, roof, sc2), x, y, ry2); }
      placed.push([x, y]); cnt++;
    }
    // đèn lồng dọc đường mòn
    trail.filter((seg, j) => nodes[j] && nodes[j].r === i + 1).forEach((seg, j) => { const a = seg[0], b = seg[1]; if (!a || !b || j % 2) return; const t = 0.55, x = a[0] + (b[0] - a[0]) * t + 22, y = a[1] + (b[1] - a[1]) * t; if (Math.abs(x - xr(y)) > WR + 40) add(lantern(), x, y, 0, 1, 10); });
    // bệ boss + công trình trên bệ
    nodes.filter((nd) => nd.r === i + 1).forEach((nd) => {
      const king = nd.n === 6; add(pad(king ? 104 : 84), nd.x, nd.y, 0, 1, king ? 118 : 96);
      if (king) add(kingRock(), nd.x - 6, nd.y - 6, 0.25);
      else {
        const kd = (nd.n - 1) % 5, z0 = 14, ry2 = kd === 2 ? 0 : (nd.side > 0 ? -0.35 : 0.35); const lift = (l) => l.map((g) => g.translate(0, 0, -14));
        if (kd === 0 || kd === 2) add(lift(kd === 0 ? tent(0.78) : picnic()).map((g) => g.translate(0, z0, 0)), nd.x, nd.y, ry2);
        else slot(kd === 1 ? 'treehouse' : kd === 3 ? 'shop' : 'tractor', lift(kd === 1 ? cabin('cabin', roof, 0.85) : kd === 3 ? cabin('shop', roof, 0.85) : cart(1)), nd.x, nd.y + 14, ry2, { y: z0, size: kd === 4 ? 56 : 96, by: 'w' });
      }
    });
    // biển hiệu vùng (cột gỗ; chữ hiển thị bằng lớp HTML)
    const sy = i * RH + 25, sx = xr(sy) - ((1 + i) % 2 ? 1 : -1) * 200; add([P(box(5, 46, 5), '#8a5a3a', -12, 23, 0), P(box(5, 46, 5), '#8a5a3a', 12, 23, 0), P(rbox(70, 26, 6, 3), '#fbf3e2', 0, 34, 0, Math.PI / 2, 0, 0)], sx, sy);
    const g = merge(geos), m = new THREE.Mesh(g, matV); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.userData.region = i; scene.add(m);
  }
  // bóng tiếp xúc mềm dưới mọi vật (thay cho ambient occlusion)
  {
    const dt = softDot(); disposables.push(dt);
    const im = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), curve(new THREE.MeshBasicMaterial({ map: dt, color: '#3f4a2a', transparent: true, opacity: 0.32, depthWrite: false })), contacts.length || 1); im.frustumCulled = false;
    contacts.forEach(([x, y, rr, yy], k) => { _m.compose(_v.set(X(x) + rr * 0.15, yy + 0.8, Z(y) + rr * 0.1), _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0)), _s.set(rr, rr * 0.92, 1)); im.setMatrixAt(k, _m); });
    im.renderOrder = 1; scene.add(im);
  }
  // cầu
  { const geos = []; for (const b of bridges) bridgeGeo((WR + 40) * 2, 54).forEach((g) => geos.push(put(g, X(b.x), 0, Z(b.y)))); const m = new THREE.Mesh(merge(geos), matV); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
  // thuyền
  { const geos = []; const r = rng(3); for (let i = 0; i < N; i++) for (let k = 0; k < 2; k++) { const y = i * RH + 260 + k * 470 + r() * 120; if (bridges.some((b) => Math.abs(b.y - y) < 70)) continue; [P(sph(14, 16, 10), '#f4f0e8', 0, 0, 0, 0, 0, 0, 1.7, 0.45, 0.8), P(new THREE.TorusGeometry(15, 1.2, 6, 20), '#cf5a4a', 0, 3, 0, Math.PI / 2, 0, 0, 1.55, 0.75, 1), P(sph(6, 10, 8), '#3f4a66', 0, 5, 0, 0, 0, 0, 1, 0.5, 1)].forEach((g) => geos.push(put(g, X(xr(y) + (r() - 0.5) * 40), -DEEP + 4, Z(y), 0, r() * TAU))); } const m = new THREE.Mesh(merge(geos), matV); m.castShadow = true; m.frustumCulled = false; scene.add(m); }

  // ---------- boss 3D (mỗi boss một mô hình, nhún nhảy) ----------
  const bossObjs = [];
  for (const nd of nodes) {
    const name = nd.n === 6 ? o.regions[nd.r - 1].king : o.regions[nd.r - 1].boss[nd.n - 1];
    const st = o.stars(nd.r, nd.n), ok = o.open(nd.r, nd.n), king = nd.n === 6;
    const geo = bossModel(name, hashStr(name), king, !ok && !st);
    const m = new THREE.Group(), pm = new THREE.Mesh(geo, matV); pm.castShadow = true; pm.frustumCulled = false; m.add(pm);
    const sc0 = king ? 1.15 : 0.95, bx = X(nd.x) + (king ? 34 : 0), bz = Z(nd.y) + (king ? 56 : 34), by = king ? 15 : 15;
    m.scale.setScalar(sc0); m.position.set(bx, by, bz); scene.add(m);
    const fl = new THREE.Mesh(merge(flagGeo(st ? '#2fbf71' : ok ? '#e5484d' : '#9a9a9a')), matV); fl.castShadow = true; fl.frustumCulled = false; fl.position.set(X(nd.x) + (king ? 70 : 52), 14, Z(nd.y) - 20); scene.add(fl);
    // mô hình .glb cho boss: vua = chiến binh / robot đỏ / robot trắng (nhuộm màu theo vùng); boss nhỏ số 1, 3, 5 = rùa gai nhiều màu
    const tints = ['#ffffff', '#ffd6a8', '#c8dcff', '#ffc4cf', '#d8ffcf', '#f0d8ff', '#fff0b0'];
    const gk = king ? ['warrior', 'mech-red', 'mech-white'][(nd.r - 1) % 3] : nd.n % 2 ? 'turtle' : null;
    bossObjs.push({ nd, m, pm, fl, base: [bx, by, bz], sc0, st, ok, phase: hashStr(name) % 100 / 16, gk, tint: king ? tints[(nd.r + 2) % tints.length] : tints[(nd.r * 2 + nd.n) % tints.length], gray: !ok && !st });
  }
  // sương mù vùng chưa mở: mây trắng nổi trên vùng
  const fogObjs = [];
  {
    const r = rng(11);
    for (let i = 0; i < N; i++) {
      if (o.regionOpen(i + 1)) continue;
      const geos = [];
      for (let k = 0; k < 26; k++) { const x = -200 + r() * 1400, y = i * RH + 60 + r() * (RH - 60), s = 50 + r() * 70; for (let q = 0; q < 4; q++) geos.push(P(sph(s * (0.55 + r() * 0.5), 12, 8), '#ffffff', X(x) + (q - 1.5) * s * 0.7, 40 + r() * 30, Z(y) + (r() - 0.5) * s, 0, 0, 0, 1, 0.62, 1)); }
      const m = new THREE.Mesh(merge(geos), curve(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, transparent: true, opacity: 0.93, emissive: '#ffffff', emissiveIntensity: 0.35 }))); m.frustumCulled = false; scene.add(m);
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(3000, RH + 40, 40, 30), curve(new THREE.MeshBasicMaterial({ color: '#f6f7f1', transparent: true, opacity: 0.72, depthWrite: false })));
      veil.rotation.x = -Math.PI / 2; veil.position.set(0, 34, Z(i * RH + RH / 2 + 30)); veil.frustumCulled = false; scene.add(veil);
      fogObjs.push({ i, m });
    }
  }

  // ---------- hậu kỳ: tilt-shift + tông ấm ----------
  const isGL2 = renderer.capabilities.isWebGL2;
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: isGL2 ? (mobile ? 2 : 4) : 0, type: THREE.HalfFloatType });
  const post = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, res: { value: new THREE.Vector2(1, 1) }, blur: { value: 2.4 }, time: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; uniform float blur; uniform float time; varying vec2 vUv;
      const vec2 D[12] = vec2[12](vec2(-.326,-.406),vec2(-.840,-.074),vec2(-.696,.457),vec2(-.203,.621),vec2(.962,-.195),vec2(.473,-.480),vec2(.519,.767),vec2(.185,-.893),vec2(.507,.064),vec2(.896,.412),vec2(-.322,-.933),vec2(-.792,-.598));
      float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
      void main(){
        float f = smoothstep(0.17, 0.5, abs(vUv.y - 0.54)) * blur;
        vec4 c = texture2D(tDiffuse, vUv);
        if (f > 0.05) { vec4 acc = c; for (int i = 0; i < 12; i++) acc += texture2D(tDiffuse, vUv + D[i] * f / res); c = acc / 13.0; }
        float v = length(vUv - vec2(0.5, 0.55)); c.rgb *= mix(1.0, 0.9, smoothstep(0.35, 0.85, v));
        c.rgb = mix(c.rgb, c.rgb * vec3(1.03, 1.0, 0.95), 0.6);
        c.rgb += (rnd(vUv * res) - 0.5) * 0.012;
        gl_FragColor = vec4(c.rgb, 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false,
  });
  const pScene = new THREE.Scene(), pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1); pScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  let usePost = true;

  // ---------- camera + cuộn ----------
  let w = 1, h = 1, dpr = 1, D = 1800, hzD = 2000;
  const EL = 0.9; // góc nhìn xuống ~52° (như ảnh mẫu)
  const minY = 150 + 160, maxY = (N - 1) * RH + 1020 - 140;
  const st0 = o.cur ? nodeOf(o.cur[0], o.cur[1]) : nodes[0];
  let camY = clamp((st0 ? st0.y : 0) + 160, minY, maxY), vel = 0, dirty = true;
  function placeCam() {
    const tz = Z(camY);
    camera.position.set(0, D * Math.sin(EL), tz + D * Math.cos(EL)); camera.lookAt(0, 0, tz);
    U.uCamZ.value = tz;
    sun.position.set(-520, 900, tz + 420); sun.target.position.set(0, 0, tz - 120); sun.target.updateMatrixWorld();
  }
  // độ cong tự canh để chân trời nằm gần mép trên (~7% chiều cao)
  const _p = new THREE.Vector3();
  function bendPt(x, y, z) { const dz = z - U.uCamZ.value; return _p.set(x, y - (dz * dz + 0.55 * x * x) / (2 * U.uCurveR.value), z); }
  function toScreen(x, y, z) { bendPt(x, y, z).project(camera); return { x: (_p.x * 0.5 + 0.5) * w, y: (-_p.y * 0.5 + 0.5) * h, z: _p.z }; }
  function calibrate() {
    placeCam(); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    let lo = 600, hi = 40000;
    for (let it = 0; it < 22; it++) {
      const R = (lo + hi) / 2; U.uCurveR.value = R; let top = 1e9;
      for (let d = 0; d < 7000; d += 60) { const s = toScreen(0, 0, U.uCamZ.value - d); if (s.z < 1) top = Math.min(top, s.y); }
      if (top < h * 0.07) hi = R; else lo = R;
    }
    U.uCurveR.value = (lo + hi) / 2;
    let best = 1e9; hzD = 2000; for (let d = 0; d < 7000; d += 40) { const sy = toScreen(0, 0, U.uCamZ.value - d); if (sy.z < 1 && sy.y < best) { best = sy.y; hzD = d; } }
  }
  function size() {
    const r = host.getBoundingClientRect(); w = Math.max(280, r.width); h = Math.max(320, r.height);
    dpr = Math.min(mobile ? 1.5 : 2, devicePixelRatio || 1);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false); rt.setSize(Math.round(w * dpr), Math.round(h * dpr));
    post.uniforms.res.value.set(w * dpr, h * dpr); post.uniforms.blur.value = 2.6 * dpr;
    camera.aspect = w / h;
    const wantW = w < 600 ? 1060 : 1080, fovT = Math.tan((camera.fov * Math.PI) / 360);
    D = Math.max((wantW / camera.aspect) / 2 / fovT, 700 / 2 / fovT);
    scene.fog.near = D * 1.35; scene.fog.far = D * 3.4;
    camera.updateProjectionMatrix(); calibrate(); dirty = true;
  }

  // ---------- lớp HTML: huy hiệu, sao, ghim avatar, biển tên vùng, khoá ----------
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const av = (who) => { const a = who && who.avatar ? String(who.avatar) : ''; return /^data:image|^https?:/.test(a) ? `<img src="${a}" alt="">` : a ? `<span>${esc(a)}</span>` : `<b>${esc(((who && who.name) || 'You').trim().slice(0, 1).toUpperCase())}</b>`; };
  const nodeEls = nodes.map((nd) => {
    const st = o.stars(nd.r, nd.n), ok = o.open(nd.r, nd.n), el = document.createElement('div');
    el.className = `a3-n ${st ? 'beat' : ok ? 'open' : 'shut'}`;
    el.innerHTML = `<i class="a3-b">${st ? '✓' : ok ? '✕' : '🔒'}</i>${st ? `<em class="a3-st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</em>` : ''}`;
    ov.appendChild(el); return el;
  });
  const signEls = o.regions.map((g) => { const el = document.createElement('div'); el.className = 'a3-sign'; el.innerHTML = `<b>${esc(g.name)}</b><small>${esc(g.lv)} · ${esc(g.diff)}</small>`; ov.appendChild(el); return el; });
  const lockEls = fogObjs.map((f) => { const el = document.createElement('div'); el.className = 'a3-lock'; el.innerHTML = `<i>🔒</i><small>Beat ${esc(o.regions[f.i - 1] ? o.regions[f.i - 1].king : '')} to open</small>`; ov.appendChild(el); return { f, el }; });
  const pinEl = document.createElement('div'); pinEl.className = 'a3-pin'; pinEl.innerHTML = `<span class="a3-av">${av(o.me)}</span>${o.mate ? `<i class="a3-heart">💗</i><span class="a3-av mate">${av(o.mate)}</span>` : ''}`; ov.appendChild(pinEl);
  const tipEl = document.createElement('div'); tipEl.className = 'a3-tip'; ov.appendChild(tipEl);
  let hovered = null;
  function overlays(t) {
    const hits = [];
    nodes.forEach((nd, k) => {
      const el = nodeEls[k], king = nd.n === 6, rad = king ? 104 : 84;
      const c = toScreen(X(nd.x), 10, Z(nd.y)), f = toScreen(X(nd.x), 6, Z(nd.y) + rad), top = toScreen(X(nd.x), king ? 150 : 80, Z(nd.y));
      const ah = nd.y - camY, vis = c.z < 1 && c.y > -80 && c.y < h + 80 && ah < hzD * 0.86 && ah > -D;
      if (!vis) { el.style.display = 'none'; return; }
      el.style.display = ''; el.style.transform = `translate(${f.x.toFixed(1)}px,${f.y.toFixed(1)}px)`;
      const rr = Math.abs(toScreen(X(nd.x) + rad, 10, Z(nd.y)).x - c.x);
      hits.push({ nd, x: c.x, y: (c.y + top.y) / 2, rx: rr * 1.05, ry: Math.abs(c.y - top.y) / 2 + rr * 0.55 });
    });
    o.regions.forEach((g, i) => { const sy = i * RH + 25, sx = xr(sy) - ((1 + i) % 2 ? 1 : -1) * 200, s = toScreen(X(sx), 48, Z(sy)), el = signEls[i]; const ah = sy - camY, vis = s.z < 1 && s.y > -60 && s.y < h + 60 && ah < hzD * 0.8 && ah > -D; el.style.display = vis ? '' : 'none'; if (vis) el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`; });
    const firstLock = lockEls.length ? Math.min(...lockEls.map((q) => q.f.i)) : -1;
    lockEls.forEach(({ f, el }) => { const y = clamp(f.i * RH + RH * 0.4, camY - 200, camY + hzD * 0.7), s = toScreen(0, 70, Z(y)); const vis = f.i === firstLock && s.z < 1 && s.y > 20 && s.y < h - 20 && f.i * RH < camY + hzD * 0.85; el.style.display = vis ? '' : 'none'; if (vis) { el.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`; hits.push({ fog: f.i + 1, x: s.x, y: s.y, rx: 90, ry: 60 }); } });
    const cn = o.cur ? nodeOf(o.cur[0], o.cur[1]) : null;
    if (cn) { const s = toScreen(X(cn.x), cn.n === 6 ? 205 : 110, Z(cn.y)); const vis = s.z < 1 && s.y > -40 && s.y < h + 40; pinEl.style.display = vis ? '' : 'none'; if (vis) pinEl.style.transform = `translate(${s.x.toFixed(1)}px,${(s.y - Math.abs(Math.sin(t * 2.4)) * 10).toFixed(1)}px)`; } else pinEl.style.display = 'none';
    if (hovered) { const s = toScreen(X(hovered.x), hovered.n === 6 ? 170 : 95, Z(hovered.y)); tipEl.style.display = ''; tipEl.style.transform = `translate(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px)`; } else tipEl.style.display = 'none';
    return hits;
  }
  let hits = [];

  // ---------- vòng vẽ ----------
  const t0 = performance.now(); let raf = 0, last = 0, live = true;
  const m4 = new THREE.Matrix4();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!cv.isConnected) { destroy(); return; }
    if (document.hidden) return;
    if (Math.abs(vel) > 0.05 && !drag) { camY = clamp(camY + vel, minY, maxY); vel *= 0.92; if (camY <= minY || camY >= maxY) vel = 0; dirty = true; }
    if (!dirty && now - last < 40) return;
    last = now; dirty = false;
    const t = (now - t0) / 1000;
    placeCam();
    // boss nhún nhảy (chỉ boss gần tầm nhìn)
    for (const b of bossObjs) { const near = Math.abs(b.base[2] - U.uCamZ.value) < D * 2; b.m.visible = near; b.fl.visible = near; if (!near) continue; const cur = o.cur && o.cur[0] === b.nd.r && o.cur[1] === b.nd.n; const amp = !b.ok && !b.st ? 0 : cur ? 6 : 2.5; b.m.position.y = b.base[1] + Math.abs(Math.sin(t * (cur ? 3.2 : 2) + b.phase)) * amp; b.m.rotation.y = Math.sin(t * 0.8 + b.phase) * 0.35; const sq = 1 + Math.sin(t * (cur ? 6.4 : 4) + b.phase) * 0.03 * (amp ? 1 : 0); b.m.scale.set(b.sc0 / sq, b.sc0 * sq, b.sc0 / sq); b.fl.rotation.y = Math.sin(t * 2 + b.phase) * 0.12; }
    // gợn nước
    for (let k = 0; k < ripN; k++) { const [y0, off] = ripSeed[k], y = y0 + ((t * 26) % 70); m4.compose(_v.set(X(xr(y) + off), -DEEP + 2.6, Z(y)), _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0.25)), _s.set(1, 1, 1)); rip.setMatrixAt(k, m4); }
    rip.instanceMatrix.needsUpdate = true;
    for (const f of fogObjs) f.m.position.x = Math.sin(t * 0.15 + f.i) * 30;
    try {
      if (usePost) { renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); post.uniforms.time.value = t % 10; renderer.render(pScene, pCam); }
      else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
    } catch (e) { if (usePost) usePost = false; }
    hits = overlays(t);
  }
  // ---------- tương tác ----------
  let drag = null, moved = 0;
  const move = (dy) => { camY = clamp(camY + dy, minY, maxY); dirty = true; };
  const kWorld = () => D * Math.tan((camera.fov * Math.PI) / 360) * 2 / h; // đơn vị thế giới / px ở tâm
  cv.addEventListener('wheel', (e) => { e.preventDefault(); vel = 0; move(-e.deltaY * kWorld() * 0.9); }, { passive: false });
  cv.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, lastY: e.clientY }; moved = 0; vel = 0; try { cv.setPointerCapture(e.pointerId); } catch (er) {} });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) { const hh = hitAt(e); const nd = hh && hh.nd ? hh.nd : null; cv.style.cursor = hh ? 'pointer' : 'grab'; if (nd !== hovered) { hovered = nd; if (nd) tipEl.textContent = nd.n === 6 ? o.regions[nd.r - 1].king : o.regions[nd.r - 1].boss[nd.n - 1]; dirty = true; } return; }
    moved = Math.max(moved, Math.abs(e.clientY - drag.y));
    if (moved > 5) { const step = (e.clientY - drag.lastY) * kWorld() * 1.5; move(step); vel = step * 0.9; drag.lastY = e.clientY; cv.style.cursor = 'grabbing'; }
  });
  cv.addEventListener('pointerleave', () => { if (hovered) { hovered = null; dirty = true; } });
  cv.addEventListener('pointerup', (e) => { if (!drag) return; const was = moved > 5; drag = null; cv.style.cursor = 'grab'; if (!was) { vel = 0; const hh = hitAt(e); if (hh) { if (hh.fog) o.onLocked(hh.fog); else o.onBoss(hh.nd.r, hh.nd.n); } } });
  cv.addEventListener('pointercancel', () => { drag = null; });
  cv.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); vel = 18; } else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); vel = -18; } });
  function hitAt(e) { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; for (let k = hits.length - 1; k >= 0; k--) { const q = hits[k]; if (((x - q.x) / q.rx) ** 2 + ((y - q.y) / q.ry) ** 2 <= 1) return q; } return null; }
  function glide(target) { const from = camY, to = clamp(target, minY, maxY), t1 = performance.now(); vel = 0; const step = (now) => { const k = Math.min(1, (now - t1) / 700), e = 1 - Math.pow(1 - k, 3); camY = from + (to - from) * e; dirty = true; if (k < 1 && live) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  const ro = new ResizeObserver(() => size()); ro.observe(host); size();
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (o.onFail) o.onFail(); });
  raf = requestAnimationFrame(frame);
  // ---------- mô hình .glb (thư mục learn/models): thay dần mô hình dựng sẵn khi tải xong ----------
  // Có thể đổi / thêm qua models/manifest.json: { "boss:en-1-1": "models/x.glb", "treehouse": "models/y.glb" }
  (async () => {
    let man = {}; try { const r = await fetch('models/manifest.json', { cache: 'no-cache' }); if (r.ok) man = await r.json(); } catch (e) {}
    const lib = { treehouse: 'models/treehouse.glb', shop: 'models/shop.glb', tractor: 'models/tractor.glb', turtle: 'models/turtle.glb', warrior: 'models/warrior.glb', 'mech-red': 'models/mech-red.glb', 'mech-white': 'models/mech-white.glb', ...man };
    let GLTFLoader; try { ({ GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js')); } catch (e) { return; }
    if (!live) return;
    const ld = new GLTFLoader(), cache = new Map();
    const get = (k) => { const u = lib[k]; if (!u) return Promise.resolve(null); if (!cache.has(u)) cache.set(u, ld.loadAsync(u).then((g) => { g.scene.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.frustumCulled = false; c.material = curve(c.material); } }); return g.scene; }).catch(() => null)); return cache.get(u); };
    const tinted = new Map();
    const place = (src, size, by, tint, gray) => {
      const g = src.clone(true);
      if (tint || gray) g.traverse((c) => { if (c.isMesh) { const key = c.material.uuid + (gray ? 'g' : tint); if (!tinted.has(key)) { const mt = c.material.clone(); mt.color.set(gray ? '#9a9c99' : tint); tinted.set(key, curve(mt)); } c.material = tinted.get(key); } });
      const bb = new THREE.Box3().setFromObject(g), sz = new THREE.Vector3(); bb.getSize(sz);
      const k = size / Math.max(0.001, by === 'w' ? Math.max(sz.x, sz.z) : sz.y); g.scale.setScalar(k);
      g.position.set(-(bb.min.x + bb.max.x) / 2 * k, -bb.min.y * k, -(bb.min.z + bb.max.z) / 2 * k); return g;
    };
    for (const sl of slots) { const src = await get(sl.key); if (!src || !live) continue; sl.m.visible = false; sl.g.add(place(src, sl.size, sl.by)); dirty = true; }
    for (const b of bossObjs) {
      const key = man[`boss:${o.map}-${b.nd.r}-${b.nd.n}`] ? `boss:${o.map}-${b.nd.r}-${b.nd.n}` : b.gk; if (!key) continue;
      const src = await get(key); if (!src || !live) continue;
      const king = b.nd.n === 6, g = place(src, king ? 84 : 46, king ? 'h' : 'w', b.tint, b.gray);
      b.pm.visible = false; b.m.add(g); b.m.scale.setScalar(1); b.sc0 = 1; dirty = true;
    }
  })();
  function destroy() {
    if (!live) return; live = false; cancelAnimationFrame(raf); ro.disconnect();
    scene.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
    [matV, matT, ripM, post].forEach((m) => m.dispose()); disposables.forEach((t) => t.dispose()); rt.dispose(); renderer.dispose();
  }
  return {
    up: () => glide(camY + 650), down: () => glide(camY - 650),
    home: () => { const n = o.cur ? nodeOf(o.cur[0], o.cur[1]) : nodes[0]; if (n) glide(n.y + 160); },
    destroy,
  };
}
