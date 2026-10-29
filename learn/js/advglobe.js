// v25b: bản đồ Adventure dạng "thế giới cong" (quả cầu 3D kiểu Candy Crush / Animal Crossing),
// vẽ theo đúng ảnh mẫu "Bestie Map": nhìn chéo từ trên xuống ~38°, ống kính dài, đất pastel nhô cao,
// sông lõm có vách đất kem, bệ boss kem 2 tầng, nhà gỗ mái ngói xám, cây "nỉ" xanh xám, đá xanh nhạt,
// cầu ván dày, mờ trên/dưới (tilt-shift). Cuộn lên để đi tiếp.
const RH = 1150; // chiều cao mỗi vùng (đơn vị thế giới)
const WR = 68; // nửa bề rộng sông
const DEEP = 24; // độ sâu lòng sông so với mặt đất
const TAU = Math.PI * 2;
const rng = (seed) => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function hex(c) { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); if (!m) return [224, 226, 170]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const mix = (c1, c2, t) => { const a = hex(c1), b = hex(c2); return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; };
// bảng màu lấy theo ảnh mẫu
const C = {
  land: '#e3e3ae', rim: '#f4ead0', wall: '#e3d0a6', wallD: '#ccb68a', water: '#6d9db0', waterD: '#5a8ba0', waterL: '#8cbac6',
  path: '#ece2bf', padTop: '#f7ecd6', padSide: '#e4d3b1', padRing: '#e9dcc0', padEdge: '#d9c7a2',
  tree: '#93b8a8', pine: '#5f8a80', pineD: '#4a7268', trunk: '#9c3e26',
  rock: '#cfe0e8', rockM: '#adc8d6', rockD: '#89a9bb', stone: '#5e6170', roof: '#3f4554',
  wood: '#7a4434', woodD: '#5a3229', win: '#a9d4e6', cream: '#efe0c2', awnA: '#f2e3c4', awnB: '#e39a62', tent: '#c47a52', tentD: '#a45f3e',
  plank: '#dcb48a', plankD: '#b98d64', plankL: '#ecc9a2', sky1: '#cfe3e6', sky2: '#eef0dc',
};

export function mount(box, o) {
  const N = o.regions.length, ph = o.map === 'zh' ? 1.9 : 0.5;
  const xr = (y) => 500 + 150 * Math.sin(y / 480 + ph) + 40 * Math.sin(y / 160 + ph * 2);
  // ---------- dựng thế giới ----------
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const y0 = i * RH;
    for (let k = 1; k <= 5; k++) { const y = y0 + 150 + (k - 1) * 178, side = (k + i) % 2 ? 1 : -1; nodes.push({ r: i + 1, n: k, x: xr(y) + side * (205 + ((k * 37 + i * 11) % 26)), y, side }); }
    const s5 = nodes[nodes.length - 1].side, y = y0 + 1020; nodes.push({ r: i + 1, n: 6, x: xr(y) - s5 * 235, y, side: -s5 });
  }
  const nodeOf = (r, n) => nodes.find((d) => d.r === r && d.n === n);
  const bridges = [], trail = [];
  for (let j = 1; j < nodes.length; j++) {
    const a = nodes[j - 1], b = nodes[j];
    if (a.side !== b.side) {
      const yb = (a.y + b.y) / 2, xb = xr(yb), e = WR + 30;
      bridges.push({ y: yb, x: xb });
      trail.push([[a.x, a.y], [xb + a.side * (e + 40), yb - 8], [xb + a.side * e, yb], [xb - a.side * e, yb], [xb - a.side * (e + 40), yb + 8], [b.x, b.y]]);
    } else trail.push([[a.x, a.y], [(a.x + b.x) / 2 + a.side * 40, (a.y + b.y) / 2], [b.x, b.y]]);
  }
  function distSeg(x, y, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l, 0, 1); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); }
  const R0 = rng(o.map === 'zh' ? 71 : 23), deco = [];
  const nearNode = (x, y, d) => nodes.some((q) => Math.hypot(q.x - x, (q.y - y) * 1.15) < (q.n === 6 ? d + 60 : d));
  const nearTrail = (x, y, d) => trail.some((seg) => seg.some((p, k) => k && distSeg(x, y, seg[k - 1], p) < d));
  const free = (x, y, d) => !deco.some((q) => Math.abs(q.y - y) < d && Math.abs(q.x - x) < d);
  for (let i = 0; i < N; i++) {
    const th = o.themes[i], pal = o.pal[th] || o.pal.meadow, tk = o.treeOf[th] || 'tree';
    let placed = 0;
    for (let t = 0; t < 1400 && placed < 70; t++) {
      const x = -300 + R0() * 1600, y = i * RH + R0() * RH;
      if (Math.abs(x - xr(y)) < WR + 44 || nearNode(x, y, 125) || nearTrail(x, y, 30)) continue;
      const roll = R0();
      const kind = roll < 0.44 ? (tk === 'tree' && R0() < 0.25 ? 'pine' : tk) : roll < 0.56 ? 'rocks' : roll < 0.62 ? 'stone' : roll < 0.74 ? 'grass' : roll < 0.86 ? 'bush' : roll < 0.93 ? 'cabin' : roll < 0.965 ? 'shop' : 'shed';
      const big = kind === 'cabin' || kind === 'shop' || kind === 'shed' || kind === 'rocks';
      if (!free(x, y, big ? 90 : 52)) continue;
      if (big && (nearTrail(x, y, 55) || Math.abs(x - xr(y)) < WR + 80)) continue;
      deco.push({ x, y, kind, c: pal.tree, roof: pal.roof, sz: 0.85 + R0() * 0.45, seed: Math.floor(R0() * 1000) });
      placed++;
    }
    for (let k = 0; k < 2; k++) { const y = i * RH + 260 + k * 470 + R0() * 120; if (!bridges.some((b) => Math.abs(b.y - y) < 70)) deco.push({ x: xr(y) + (R0() - 0.5) * 50, y, kind: 'boat', sz: 1, seed: k }); }
  }

  // ---------- canvas + camera ----------
  box.innerHTML = '<canvas class="advg" tabindex="0" aria-label="Adventure map. Use the arrow keys or scroll to move."></canvas>';
  const cv = box.querySelector('canvas'), cx = cv.getContext('2d');
  const tmp = document.createElement('canvas'), tx = tmp.getContext('2d');
  let w = 0, h = 0, dpr = 1, k0 = 1, ay = 0, xs = 1, blurOK = 'filter' in cx;
  const E = 0.66, sinE = Math.sin(E), cosE = Math.cos(E), DC = 6000, RC = 2200; // góc nhìn ~38°, ống kính dài, bán kính "thế giới"
  let F = DC;
  const DH = -DC * cosE + Math.sqrt(DC * DC * cosE * cosE + 2 * RC * DC * sinE); // khoảng nhìn thấy tới chân trời
  const minY = 150 + 200, maxY = (N - 1) * RH + 1020 - 120;
  const startNode = o.cur ? nodeOf(o.cur[0], o.cur[1]) : nodes[0];
  let camY = clamp((startNode ? startNode.y : 0) + 200, minY, maxY), vel = 0;
  const t0 = performance.now();
  function P(x, y, z = 0) {
    const dx = (x - 500) * xs, dy = y - camY, drop = (dy * dy + dx * dx * 0.55) / (2 * RC);
    const ry = dy + DC * cosE, rz = z - drop - DC * sinE;
    const depth = ry * cosE - rz * sinE, up = ry * sinE + rz * cosE;
    const vis = -(0.55 * dx / RC) * dx - (dy / RC) * ry - rz; // mặt đất còn hướng về máy quay?
    return { x: w / 2 + F * dx / depth, y: ay - F * up / depth, s: F / depth, d: depth, v: clamp(vis / 420, 0, 1) };
  }
  function size() {
    const r = box.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    w = Math.max(280, r.width); h = Math.max(320, r.height);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
    k0 = clamp(w / (w < 600 ? 760 : 1000), 0.42, 1.15); xs = w < 600 ? 0.74 : w < 900 ? 0.88 : 1; F = DC * k0;
    // đặt đường chân trời cách mép trên ~7% chiều cao
    ay = 0; const hz = P(500, camY + DH).y; ay = clamp(h * 0.07 - hz, h * 0.4, h * 0.7);
    tmp.width = cv.width; tmp.height = cv.height;
  }
  const yTop = () => camY + DH - 6;
  const yBot = () => camY - 760 / k0;

  // ---------- vẽ ----------
  const img = new Map();
  function avatarImg(src) { if (!img.has(src)) { const im = new Image(); im.onload = () => { dirty = true; }; im.src = src; img.set(src, im); } return img.get(src); }
  let hits = [];
  const poly = (pts) => { cx.beginPath(); pts.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.closePath(); };
  function ell(x, y, rx, ry) { cx.beginPath(); cx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU); }
  function rrect(x, y, ww, hh, r) { cx.beginPath(); if (cx.roundRect) cx.roundRect(x, y, ww, hh, r); else cx.rect(x, y, ww, hh); }
  function draw() {
    if (!cv.isConnected) return;
    const tt = (performance.now() - t0) / 1000;
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // trời (chỉ một dải mỏng phía trên chân trời cong)
    const sky = cx.createLinearGradient(0, 0, 0, h * 0.25); sky.addColorStop(0, C.sky1); sky.addColorStop(1, C.sky2);
    cx.fillStyle = sky; cx.fillRect(0, 0, w, h);
    const yT = yTop(), yB = yBot();
    // mặt đất: đa giác từ chân trời cong xuống đáy
    const hzn = []; for (let x = -1400; x <= 2400; x += 80) hzn.push(P(x, camY + DH * 0.995));
    cx.beginPath(); hzn.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.lineTo(w + 50, h + 50); cx.lineTo(-50, h + 50); cx.closePath();
    cx.save(); cx.clip();
    const regAt = (y) => clamp(Math.floor(y / RH), 0, N - 1);
    cx.fillStyle = landCol(regAt(camY)); cx.fillRect(0, 0, w, h);
    for (let i = 0; i < N; i++) { const a = Math.max(yB, i * RH - 80), b = Math.min(yT, (i + 1) * RH + 80); if (a < b) band(a, b, landCol(i)); }
    mottles(yB, yT);
    riverDraw(yB, yT, tt);
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    for (const seg of trail) { if (seg[seg.length - 1][1] < yB - 100 || seg[0][1] > yT) continue; pathDraw(seg); }
    for (const b of bridges) if (b.y > yB && b.y < yT) bridgeDraw(b);
    // vật thể: xa vẽ trước
    const items = [];
    for (const d of deco) { if (d.y < yB || d.y > yT) continue; const p = P(d.x, d.y, d.kind === 'boat' ? -DEEP : 0); if (p.v <= 0 || p.y < -150 || p.y > h + 160 || p.x < -160 || p.x > w + 160) continue; items.push({ d, p }); }
    for (const nd of nodes) { if (nd.y < yB - 200 || nd.y > yT) continue; const p = P(nd.x, nd.y); if (p.v <= 0 || p.y < -200 || p.y > h + 220) continue; items.push({ nd, p }); }
    for (let i = 0; i < N; i++) { const y = i * RH + 25, x = xr(y) - ((1 + i) % 2 ? 1 : -1) * 200; if (y < yB || y > yT) continue; const p = P(x, y); if (p.v > 0 && p.y > -60 && p.y < h + 80) items.push({ sign: o.regions[i], p, x, y }); }
    for (let i = 0; i < N; i++) { if (o.regionOpen(i + 1)) continue; const a = Math.max(yB, i * RH + 40); if (a >= yT) continue; items.push({ fog: i, p: { d: P(500, a).d + 0.01, v: 1 } }); }
    items.sort((a, b) => b.p.d - a.p.d);
    hits = [];
    for (const it of items) { cx.globalAlpha = it.p.v; if (it.d) spriteDraw(it.d, it.p, tt); else if (it.nd) bossDraw(it.nd, it.p, tt); else if (it.fog !== undefined) { cx.globalAlpha = 1; fogDraw(it.fog, yB, yT); } else signDraw(it); }
    cx.globalAlpha = 1;
    // không khí xa: nhạt dần về chân trời
    const hzY = P(500, yT).y, haze = cx.createLinearGradient(0, hzY, 0, hzY + h * 0.3);
    haze.addColorStop(0, 'rgba(232,240,232,.85)'); haze.addColorStop(1, 'rgba(232,240,232,0)');
    cx.fillStyle = haze; cx.fillRect(0, hzY - 4, w, h * 0.3 + 4);
    cx.restore();
    cx.strokeStyle = 'rgba(255,255,255,.7)'; cx.lineWidth = 2; cx.beginPath(); hzn.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke();
    tiltShift();
    // thanh vị trí bên phải
    const pr = (camY - minY) / (maxY - minY);
    cx.fillStyle = 'rgba(60,70,50,.16)'; rrect(w - 9, 18, 4, h - 36, 2); cx.fill();
    cx.fillStyle = 'rgba(60,70,50,.5)'; rrect(w - 10, 18 + (h - 36) * (1 - pr) - 16, 6, 32, 3); cx.fill();
  }
  function fogDraw(i, yB, yT) {
    const a = Math.max(yB, i * RH + 40), b = Math.min(yT, (N) * RH + 200); if (a >= b) return;
    band(a, b, 'rgba(250,250,244,.74)', true);
    const cy = clamp(i * RH + RH * 0.45, a + 80, yT - 20), pc = P(500, cy);
    if (pc.v > 0.05) {
      cx.globalAlpha = pc.v; cx.fillStyle = 'rgba(255,255,255,.92)';
      for (let k = 0; k < 4; k++) { const q = P(120 + k * 250, cy + ((k % 2) - 0.5) * 300); if (q.v > 0) puff(q.x, q.y, 80 * q.s + 8); }
      lockBadge(pc.x, pc.y, pc.s, o.regions[i - 1] ? o.regions[i - 1].king : '');
      hits.push({ fog: i + 1, x: pc.x, y: pc.y, r: 130 * pc.s + 30 });
      cx.globalAlpha = 1;
    }
  }
  function landCol(i) { const pal = o.pal[o.themes[i]] || o.pal.meadow; return mix(C.land, pal.g, 0.45); }
  function band(a, b, col, flat) {
    cx.beginPath(); let first = true;
    for (let x = -700; x <= 1700; x += 100) { const p = P(x, a); first ? cx.moveTo(p.x, p.y) : cx.lineTo(p.x, p.y); first = false; }
    for (let y = a; y <= b; y += 50) { const p = P(1700, y); cx.lineTo(p.x, p.y); }
    for (let x = 1700; x >= -700; x -= 100) { const p = P(x, b); cx.lineTo(p.x, p.y); }
    for (let y = b; y >= a; y -= 50) { const p = P(-700, y); cx.lineTo(p.x, p.y); }
    cx.closePath(); cx.fillStyle = col;
    if (!flat && blurOK) { cx.save(); cx.filter = 'blur(14px)'; cx.fill(); cx.restore(); } else cx.fill();
  }
  // mảng cỏ đậm nhạt mềm trên mặt đất (như ảnh mẫu)
  const motts = []; { const r = rng(5); for (let k = 0; k < N * 16; k++) motts.push([-300 + r() * 1600, r() * N * RH, 60 + r() * 110, r()]); }
  function mottles(yB, yT) {
    for (const [x, y, rr, t] of motts) {
      if (y < yB || y > yT || Math.abs(x - xr(y)) < WR + rr * 0.6) continue;
      const p = P(x, y); if (p.v <= 0) continue;
      const q = groundQ(x, y);
      cx.globalAlpha = 0.22 * p.v; cx.fillStyle = t < 0.5 ? '#b9cf8e' : '#f2ecc2'; ell(p.x, p.y, rr * p.s, rr * p.s * q); cx.fill();
    }
    cx.globalAlpha = 1;
  }
  const groundQ = (x, y) => { const a = P(x, y), b = P(x, y + 10); return clamp(Math.abs(b.y - a.y) / (10 * a.s), 0.1, 1); };
  // sông lõm: vách đất kem + mặt nước thấp hơn mặt đất; chỉ phần vách hướng về máy quay lộ ra
  function riverDraw(yB, yT, tt) {
    const L0 = [], R0_ = [], L1 = [], R1 = [];
    for (let y = yB; ; y += 20) { const yy = Math.min(y, yT); const c = xr(yy); L0.push(P(c - WR, yy)); R0_.push(P(c + WR, yy)); L1.push(P(c - WR + 6, yy, -DEEP)); R1.push(P(c + WR - 6, yy, -DEEP)); if (yy >= yT) break; }
    const outline = [...L0, ...R0_.slice().reverse()];
    cx.save(); poly(outline); cx.clip();
    const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, C.wall); g.addColorStop(1, C.wallD);
    cx.fillStyle = g; poly(outline); cx.fill();
    const wg = cx.createLinearGradient(0, 0, 0, h); wg.addColorStop(0, C.waterL); wg.addColorStop(0.5, C.water); wg.addColorStop(1, C.waterD);
    cx.fillStyle = wg; poly([...L1, ...R1.slice().reverse()]); cx.fill();
    cx.strokeStyle = 'rgba(40,80,100,.22)'; cx.lineWidth = 6 * k0; cx.beginPath(); L1.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke(); cx.beginPath(); R1.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke();
    cx.strokeStyle = 'rgba(255,255,255,.55)'; cx.lineCap = 'round';
    for (let y = Math.floor(yB / 80) * 80; y < yT; y += 80) { const yy = y + ((tt * 18) % 80), off = Math.sin(y * 0.37) * 28; const a = P(xr(yy) + off - 10, yy, -DEEP), b = P(xr(yy) + off + 10, yy + 3, -DEEP); if (a.v <= 0) continue; cx.globalAlpha = a.v * 0.7; cx.lineWidth = Math.max(1, 3.5 * a.s); cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
    cx.globalAlpha = 1; cx.restore();
    cx.strokeStyle = C.rim; cx.lineWidth = Math.max(1.5, 5 * k0); cx.lineJoin = 'round';
    for (const E_ of [L0, R0_]) { cx.beginPath(); E_.forEach((p, i) => (i ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y))); cx.stroke(); }
  }
  function pathDraw(seg) {
    const pts = [];
    for (let k = 1; k < seg.length; k++) { const a = seg[k - 1], b = seg[k], n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 26)); for (let j = k > 1 ? 1 : 0; j <= n; j++) { const t = j / n; const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; if (y > yTop()) continue; if (Math.abs(x - xr(y)) < WR + 2) { pts.push(null); continue; } pts.push(P(x, y)); } }
    const run = (wd, col, dash) => {
      cx.strokeStyle = col; cx.setLineDash(dash || []);
      for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k]; if (!a || !b || a.v <= 0 || b.v <= 0) continue; cx.globalAlpha = Math.min(a.v, b.v); cx.lineWidth = Math.max(1, wd * (a.s + b.s) / 2); cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke(); }
      cx.setLineDash([]); cx.globalAlpha = 1;
    };
    run(30, 'rgba(214,199,155,.55)'); run(24, C.path); run(3, 'rgba(190,170,120,.6)', [6 * k0, 9 * k0]);
  }
  function bridgeDraw(b) {
    const e = WR + 34, half = 26, th = 9;
    const top = [P(b.x - e, b.y - half, 3), P(b.x + e, b.y - half, 3), P(b.x + e, b.y + half, 3), P(b.x - e, b.y + half, 3)];
    if (top.some((p) => p.v <= 0)) return;
    const bot = [P(b.x - e, b.y + half, 3 - th), P(b.x + e, b.y + half, 3 - th)];
    cx.globalAlpha = top[0].v;
    cx.fillStyle = 'rgba(30,70,90,.22)'; poly([P(b.x - e + 10, b.y - half + 14, -DEEP), P(b.x + e - 10, b.y - half + 14, -DEEP), P(b.x + e - 10, b.y + half + 18, -DEEP), P(b.x - e + 10, b.y + half + 18, -DEEP)]); cx.fill();
    cx.fillStyle = C.plankD; poly([top[3], top[2], bot[1], bot[0]]); cx.fill();
    const n = 5;
    for (let k = 0; k < n; k++) {
      const a = (k + 0.04) / n, c = (k + 0.96) / n;
      const p = [lerpP(top[0], top[1], a), lerpP(top[0], top[1], c), lerpP(top[3], top[2], c), lerpP(top[3], top[2], a)];
      cx.fillStyle = k % 2 ? C.plank : mix(C.plank, C.plankL, 0.4); poly(p); cx.fill();
      cx.fillStyle = 'rgba(255,255,255,.18)'; poly([p[0], p[1], lerpP(p[1], p[2], 0.25), lerpP(p[0], p[3], 0.25)]); cx.fill();
    }
    cx.globalAlpha = 1;
  }
  const lerpP = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  function puff(x, y, r) { cx.beginPath(); cx.arc(x - r * 0.6, y + r * 0.1, r * 0.55, 0, TAU); cx.arc(x, y - r * 0.2, r * 0.75, 0, TAU); cx.arc(x + r * 0.65, y + r * 0.05, r * 0.5, 0, TAU); cx.rect(x - r * 1.1, y, r * 2.2, r * 0.45); cx.fill(); }
  // ---------- hình khối 3D (chiếu từng đỉnh → đúng góc nhìn) ----------
  const area = (f) => { let s = 0; for (let i = 0; i < f.length; i++) { const a = f[i], c = f[(i + 1) % f.length]; s += a.x * c.y - c.x * a.y; } return -s; };
  function box3(x, y, z, bw, bd, hh, col) {
    const v = (dx, dy, dz) => P(x + dx, y + dy, z + dz);
    const b = [v(-bw / 2, -bd / 2, 0), v(bw / 2, -bd / 2, 0), v(bw / 2, bd / 2, 0), v(-bw / 2, bd / 2, 0)];
    const t = [v(-bw / 2, -bd / 2, hh), v(bw / 2, -bd / 2, hh), v(bw / 2, bd / 2, hh), v(-bw / 2, bd / 2, hh)];
    const faces = [[[b[2], b[3], t[3], t[2]], col.back || col.side], [[b[1], b[2], t[2], t[1]], col.side], [[b[3], b[0], t[0], t[3]], col.side], [[b[0], b[1], t[1], t[0]], col.front], [[t[0], t[1], t[2], t[3]], col.top]];
    for (const [f, c] of faces) { if (!c || area(f) <= 0) continue; cx.fillStyle = c; poly(f); cx.fill(); }
    return { b, t };
  }
  // mái hai mái dốc, sống mái chạy theo trục x
  function gable(x, y, z, bw, bd, rh, ov, col, curve) {
    const v = (dx, dy, dz) => P(x + dx, y + dy, z + dz);
    const W2 = bw / 2 + ov, D2 = bd / 2 + ov;
    const e0 = v(-W2, -D2, -2), e1 = v(W2, -D2, -2), e2 = v(W2, D2, -2), e3 = v(-W2, D2, -2), r0 = v(-W2 * 0.96, 0, rh), r1 = v(W2 * 0.96, 0, rh);
    const gw = [v(-bw / 2, -bd / 2, -2), v(-bw / 2, bd / 2, -2), v(-bw / 2, 0, rh * 0.92)], ge = [v(bw / 2, -bd / 2, -2), v(bw / 2, bd / 2, -2), v(bw / 2, 0, rh * 0.92)];
    for (const g of [gw, ge]) { cx.fillStyle = col.gable || col.wallS; poly(g); cx.fill(); }
    cx.fillStyle = col.roofD; poly([e3, e2, r1, r0]); cx.fill();
    cx.fillStyle = col.roof; poly([e0, e1, r1, r0]); cx.fill();
    if (curve) { cx.fillStyle = col.roofD; for (const s of [-1, 1]) { const tip = v(s * (W2 + 7), -D2 - 5, 5), base = v(s * W2, -D2, -2), up2 = v(s * W2, -D2 + 12, 7); poly([base, tip, up2]); cx.fill(); } }
    cx.strokeStyle = col.roofL; cx.lineWidth = Math.max(0.8, 1.6 * k0);
    for (let k = 1; k < 6; k++) { const t = k / 6; const a = lerpP(e0, e1, t), c = lerpP(r0, r1, t); cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(c.x, c.y); cx.stroke(); }
    cx.strokeStyle = col.roofD; cx.lineWidth = Math.max(1, 3 * k0); cx.beginPath(); cx.moveTo(r0.x, r0.y); cx.lineTo(r1.x, r1.y); cx.stroke();
  }
  function winOn(face, u0, u1, v0, v1, col) {
    const [a, b, c, d] = face; const at = (u, vv) => { const p = lerpP(a, b, u), q = lerpP(d, c, u); return lerpP(p, q, vv); };
    cx.fillStyle = col; poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]); cx.fill();
  }
  function cabin(x, y, sc, roofCol, kind) {
    const bw = 58 * sc, bd = 40 * sc, hh = 30 * sc;
    const pal = { front: C.wood, side: C.woodD, back: C.woodD, top: null };
    if (kind === 'shop') { pal.front = C.cream; pal.side = mix(C.cream, '#8a6a4a', 0.25); }
    if (kind === 'shed') { pal.front = '#b8774a'; pal.side = '#96603c'; }
    const { b, t } = box3(x, y, 0, bw, bd, hh, pal);
    const front = [b[0], b[1], t[1], t[0]];
    if (area(front) > 0) {
      if (kind === 'shed') { winOn(front, 0.32, 0.68, 0, 0.75, '#efe6d2'); winOn(front, 0.4, 0.6, 0.2, 0.55, '#7a5a44'); }
      else { winOn(front, 0.12, 0.3, 0.42, 0.75, C.win); winOn(front, 0.42, 0.58, 0, 0.7, kind === 'shop' ? '#8a5a3a' : '#3b2a26'); winOn(front, 0.7, 0.88, 0.42, 0.75, C.win); }
    }
    const rr = roofCol || C.roof;
    const rc = { roof: rr, roofD: mix(rr, '#000000', 0.25), roofL: mix(rr, '#ffffff', 0.18), wallS: pal.side, gable: pal.front };
    if (kind === 'shed') { rc.roof = '#b06a40'; rc.roofD = '#8e5432'; rc.roofL = '#c98656'; }
    gable(x, y, hh, bw, bd, 20 * sc, 6 * sc, rc, false);
    if (kind === 'shop') {
      const a0 = P(x - bw / 2, y - bd / 2, hh * 0.72), a1 = P(x + bw / 2, y - bd / 2, hh * 0.72), a2 = P(x + bw / 2, y - bd / 2 - 16 * sc, hh * 0.42), a3 = P(x - bw / 2, y - bd / 2 - 16 * sc, hh * 0.42);
      for (let k = 0; k < 6; k++) { cx.fillStyle = k % 2 ? C.awnB : C.awnA; poly([lerpP(a0, a1, k / 6), lerpP(a0, a1, (k + 1) / 6), lerpP(a3, a2, (k + 1) / 6), lerpP(a3, a2, k / 6)]); cx.fill(); }
    }
  }
  function tent(x, y, sc) {
    const v = (dx, dy, dz) => P(x + dx, y + dy, dz);
    const W2 = 30 * sc, D2 = 24 * sc, H = 36 * sc, z0 = 14;
    const a = v(-W2, -D2, z0), b = v(W2, -D2, z0), c = v(W2, D2, z0), d = v(-W2, D2, z0), r0 = v(-W2, 0, z0 + H), r1 = v(W2, 0, z0 + H);
    cx.fillStyle = C.tentD; poly([d, c, r1, r0]); cx.fill();
    cx.fillStyle = mix(C.tent, '#000000', 0.12); poly([b, c, r1]); cx.fill();
    cx.fillStyle = C.tent; poly([a, b, r1, r0]); cx.fill();
    const m = lerpP(a, b, 0.5), mt = lerpP(r0, r1, 0.5);
    cx.fillStyle = '#6e3a24'; poly([lerpP(m, a, 0.18), lerpP(m, b, 0.18), lerpP(m, mt, 0.45)]); cx.fill();
  }
  function cart(x, y, sc) {
    const z0 = 14;
    box3(x, y, z0, 40 * sc, 30 * sc, 24 * sc, { front: '#9a5c3c', side: '#7a4630', top: '#b8774a' });
    const v = (dx, dy, dz) => P(x + dx, y + dy, z0 + dz);
    cx.fillStyle = '#3f4554'; poly([v(-26 * sc, -20 * sc, 26 * sc), v(26 * sc, -20 * sc, 26 * sc), v(26 * sc, 20 * sc, 30 * sc), v(-26 * sc, 20 * sc, 30 * sc)]); cx.fill();
    const wl = P(x - 20 * sc, y - 15 * sc, z0), wr = P(x + 20 * sc, y - 15 * sc, z0);
    cx.fillStyle = '#4a3a30'; for (const p of [wl, wr]) { ell(p.x, p.y - 4 * p.s, 7 * p.s, 7 * p.s); cx.fill(); }
    cx.fillStyle = '#e9d6b4'; for (const p of [wl, wr]) { ell(p.x, p.y - 4 * p.s, 3 * p.s, 3 * p.s); cx.fill(); }
  }
  function picnic(x, y, sc) {
    const z0 = 14.5, v = (dx, dy) => P(x + dx, y + dy, z0);
    cx.fillStyle = '#e7a07a'; poly([v(-34 * sc, -22 * sc), v(30 * sc, -28 * sc), v(36 * sc, 22 * sc), v(-28 * sc, 28 * sc)]); cx.fill();
    cx.strokeStyle = 'rgba(255,255,255,.5)'; cx.lineWidth = Math.max(1, 2 * k0); poly([v(-28 * sc, -16 * sc), v(26 * sc, -22 * sc), v(30 * sc, 16 * sc), v(-22 * sc, 22 * sc)]); cx.stroke();
    const p1 = P(x - 18 * sc, y, z0), p2 = P(x + 14 * sc, y - 6 * sc, z0), bk = P(x + 2 * sc, y + 6 * sc, z0);
    cx.fillStyle = '#b4472f'; ell(bk.x, bk.y - 6 * bk.s, 9 * bk.s, 7 * bk.s); cx.fill();
    for (const [p, c] of [[p1, '#2f3441'], [p2, '#d98a3a']]) { cx.fillStyle = c; ell(p.x, p.y - 12 * p.s, 7 * p.s, 10 * p.s); cx.fill(); cx.fillStyle = '#f2d9c0'; ell(p.x, p.y - 26 * p.s, 5.5 * p.s, 5.5 * p.s); cx.fill(); cx.fillStyle = c; ell(p.x, p.y - 30 * p.s, 6 * p.s, 3.5 * p.s); cx.fill(); }
  }
  // ---------- cây, đá, cỏ (hình đứng, thu ngắn theo góc nhìn) ----------
  function standScale(x, y, p) { const t = P(x, y + 100 * (y - camY) / RC, 100); return clamp((p.y - t.y) / (100 * p.s), 0.3, 1); }
  function shadow(p, x, y, rx) { const q = groundQ(x, y); cx.fillStyle = 'rgba(80,90,50,.2)'; ell(p.x + rx * 0.35 * p.s, p.y + 2 * p.s, rx * p.s, rx * p.s * q * 0.6); cx.fill(); }
  function spriteDraw(d, p, tt) {
    const u = p.s * d.sz, vy = standScale(d.x, d.y, p);
    if (d.kind === 'cabin' || d.kind === 'shop' || d.kind === 'shed') { shadow(p, d.x, d.y, 46 * d.sz); cabin(d.x, d.y, d.sz, d.roof === '#4b5a78' ? C.roof : d.roof, d.kind); return; }
    if (d.kind === 'boat') { boatDraw(p, u, tt, d.seed); return; }
    if (d.kind === 'rocks' || d.kind === 'stone') shadow(p, d.x, d.y, 34 * d.sz); else if (d.kind !== 'grass') shadow(p, d.x, d.y, 26 * d.sz);
    cx.save(); cx.translate(p.x, p.y); cx.scale(1, vy);
    switch (d.kind) {
      case 'tree': feltTree(u, d.c); break;
      case 'pine': case 'snowtree': pineTree(u, d.kind === 'snowtree'); break;
      case 'cactus': cx.fillStyle = '#7cae86'; rrect(-6 * u, -46 * u, 12 * u, 48 * u, 6 * u); cx.fill(); cx.lineWidth = 9 * u; cx.strokeStyle = '#7cae86'; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(-6 * u, -20 * u); cx.lineTo(-15 * u, -20 * u); cx.lineTo(-15 * u, -32 * u); cx.moveTo(6 * u, -28 * u); cx.lineTo(15 * u, -28 * u); cx.lineTo(15 * u, -40 * u); cx.stroke(); break;
      case 'rocks': rockCluster(u, d.seed); break;
      case 'stone': cx.fillStyle = C.stone; cx.beginPath(); cx.moveTo(-26 * u, 0); cx.bezierCurveTo(-30 * u, -22 * u, -10 * u, -34 * u, 6 * u, -32 * u); cx.bezierCurveTo(26 * u, -30 * u, 30 * u, -10 * u, 26 * u, 0); cx.closePath(); cx.fill(); cx.fillStyle = 'rgba(255,255,255,.28)'; for (let k = 0; k < 7; k++) { ell((-16 + ((k * 13) % 32)) * u, (-6 - ((k * 7) % 22)) * u, 3.4 * u, 2.4 * u); cx.fill(); } break;
      case 'bush': cx.fillStyle = C.tree; for (const [bx, by, br] of [[-10, -9, 12], [7, -11, 13], [0, -18, 10]]) { ell(bx * u, by * u, br * u, br * u * 0.9); cx.fill(); } cx.fillStyle = 'rgba(0,50,40,.12)'; ell(6 * u, -6 * u, 12 * u, 7 * u); cx.fill(); break;
      case 'grass': cx.strokeStyle = '#a9bf7e'; cx.lineWidth = Math.max(1, 2.2 * u); cx.lineCap = 'round'; cx.beginPath(); for (const [gx, gh, gb] of [[-8, 13, -6], [-3, 18, -2], [2, 20, 3], [7, 15, 7]]) { cx.moveTo(gx * u, 0); cx.quadraticCurveTo(gx * u, -gh * 0.6 * u, (gx + gb) * u, -gh * u); } cx.stroke(); break;
      default: break;
    }
    cx.restore();
  }
  function feltTree(u, c) {
    cx.fillStyle = C.trunk; rrect(-4.5 * u, -24 * u, 9 * u, 26 * u, 3 * u); cx.fill();
    const base = c || C.tree, H = 112, Wd = 34;
    // tán hình quả lê, mép gợn nhẹ như len nỉ
    const outline = []; for (let k = 0; k <= 40; k++) { const t = k / 40, a = t * TAU; const yy = -18 - (1 - Math.cos(a / 2 * 1)) * 0; void yy; }
    cx.fillStyle = base; cx.beginPath();
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * TAU, sx = Math.sin(a), cy0 = Math.cos(a);
      const prof = Math.pow((1 - cy0) / 2, 0.85) * (0.55 + 0.45 * (1 + cy0) / 2); // rộng ở dưới, thon ở trên
      const lump = 1 + 0.05 * Math.sin(a * 7) + 0.03 * Math.sin(a * 13);
      const x = sx * Wd * (0.35 + prof) * lump, y = -20 - (1 + cy0) / 2 * H;
      k ? cx.lineTo(x * u, y * u) : cx.moveTo(x * u, y * u);
    }
    cx.closePath(); cx.fill();
    // bóng phía phải
    cx.save(); cx.clip();
    cx.fillStyle = mix(base, '#1f4a40', 0.3); ell(22 * u, -44 * u, 26 * u, 60 * u); cx.fill();
    cx.fillStyle = mix(base, '#1f4a40', 0.18); ell(10 * u, -24 * u, 40 * u, 14 * u); cx.fill();
    cx.fillStyle = 'rgba(255,255,255,.16)'; ell(-14 * u, -78 * u, 9 * u, 22 * u); cx.fill();
    // chấm "nỉ"
    cx.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 14; k++) { ell((((k * 37) % 50) - 25) * u, (-30 - ((k * 23) % 80)) * u, 3 * u, 2.4 * u); cx.fill(); }
    cx.restore();
    void outline;
  }
  function pineTree(u, snow) {
    cx.fillStyle = C.trunk; rrect(-3 * u, -14 * u, 6 * u, 16 * u, 2 * u); cx.fill();
    const tiers = [[-22, 19, 13], [-38, 15, 12], [-52, 11, 10], [-63, 6, 7]];
    for (const [ty, rx, ry] of tiers) { cx.fillStyle = C.pine; ell(0, ty * u, rx * u, ry * u); cx.fill(); cx.fillStyle = C.pineD; cx.beginPath(); cx.ellipse(rx * 0.3 * u, ty * u + ry * 0.2 * u, rx * 0.65 * u, ry * 0.7 * u, 0, -0.5, Math.PI * 0.8); cx.fill(); if (snow) { cx.fillStyle = '#fff'; ell(-rx * 0.15 * u, (ty - ry * 0.45) * u, rx * 0.55 * u, ry * 0.35 * u); cx.fill(); } }
  }
  function rockCluster(u, seed) {
    const parts = seed % 2 ? [[-14, 0, 24, 30], [16, 2, 20, 24], [2, 6, 14, 14]] : [[0, 0, 28, 34], [24, 4, 15, 18]];
    for (const [rx0, ry0, rw, rh] of parts) {
      const x0 = rx0 * u, y0 = ry0 * u;
      cx.fillStyle = C.rockM; cx.beginPath(); cx.moveTo(x0 - rw * u, y0); cx.lineTo(x0 - rw * 0.85 * u, y0 - rh * 0.6 * u); cx.lineTo(x0 - rw * 0.3 * u, y0 - rh * u); cx.lineTo(x0 + rw * 0.45 * u, y0 - rh * 0.88 * u); cx.lineTo(x0 + rw * u, y0 - rh * 0.35 * u); cx.lineTo(x0 + rw * 0.9 * u, y0); cx.closePath(); cx.fill();
      cx.fillStyle = C.rock; cx.beginPath(); cx.moveTo(x0 - rw * 0.85 * u, y0 - rh * 0.6 * u); cx.lineTo(x0 - rw * 0.3 * u, y0 - rh * u); cx.lineTo(x0 + rw * 0.1 * u, y0 - rh * 0.5 * u); cx.lineTo(x0 - rw * 0.4 * u, y0 - rh * 0.3 * u); cx.closePath(); cx.fill();
      cx.fillStyle = C.rockD; cx.beginPath(); cx.moveTo(x0 + rw * 0.45 * u, y0 - rh * 0.88 * u); cx.lineTo(x0 + rw * u, y0 - rh * 0.35 * u); cx.lineTo(x0 + rw * 0.9 * u, y0); cx.lineTo(x0 + rw * 0.2 * u, y0); cx.lineTo(x0 + rw * 0.1 * u, y0 - rh * 0.5 * u); cx.closePath(); cx.fill();
    }
  }
  function boatDraw(p, u, tt, seed) {
    const bob = Math.sin(tt * 1.8 + seed * 2) * 1.5 * u;
    cx.save(); cx.translate(p.x, p.y + bob);
    cx.fillStyle = 'rgba(20,60,80,.22)'; ell(4 * u, 7 * u, 26 * u, 7 * u); cx.fill();
    cx.fillStyle = '#f4f0e8'; cx.beginPath(); cx.moveTo(-24 * u, -4 * u); cx.quadraticCurveTo(-6 * u, 12 * u, 24 * u, -2 * u); cx.quadraticCurveTo(4 * u, -12 * u, -24 * u, -4 * u); cx.fill();
    cx.strokeStyle = '#cf5a4a'; cx.lineWidth = 2.6 * u; cx.beginPath(); cx.moveTo(-20 * u, -3 * u); cx.quadraticCurveTo(0, 5 * u, 20 * u, -2 * u); cx.stroke();
    cx.fillStyle = '#3f4a66'; ell(0, -3 * u, 8 * u, 3 * u); cx.fill();
    cx.restore();
  }
  // ---------- bệ boss (kem 2 tầng như ảnh mẫu) ----------
  function padDraw(x, y, r) {
    const ring = (rad, z) => { const pts = []; for (let k = 0; k < 28; k++) { const a = (k / 28) * TAU; pts.push(P(x + Math.cos(a) * rad, y + Math.sin(a) * rad, z)); } return pts; };
    const o0 = ring(r, 0.5), o1 = ring(r, 4), i0 = ring(r * 0.66, 4), i1 = ring(r * 0.66, 14);
    cx.fillStyle = 'rgba(90,90,50,.18)'; poly(ring(r + 6, 0).map((p) => ({ x: p.x + 4 * p.s, y: p.y + 3 * p.s }))); cx.fill();
    cx.fillStyle = C.padEdge; poly(o0); cx.fill();
    cx.fillStyle = C.padRing; poly(o1); cx.fill();
    cx.strokeStyle = 'rgba(200,180,140,.5)'; cx.lineWidth = Math.max(1, 1.6 * k0); poly(o1); cx.stroke();
    cx.fillStyle = C.padSide;
    for (let k = 0; k < i0.length; k++) { const f = [i0[k], i0[(k + 1) % i0.length], i1[(k + 1) % i0.length], i1[k]]; if (area(f) > 0) { poly(f); cx.fill(); } }
    cx.fillStyle = C.padTop; poly(i1); cx.fill();
  }
  function bossDraw(nd, p, tt) {
    const king = nd.n === 6, st = o.stars(nd.r, nd.n), ok = o.open(nd.r, nd.n), isCur = o.cur && o.cur[0] === nd.r && o.cur[1] === nd.n;
    const pal = o.pal[o.themes[nd.r - 1]] || o.pal.meadow, rad = king ? 104 : 84, roof = pal.roof === '#4b5a78' ? C.roof : pal.roof;
    if (ok && !st) { const pulse = 1 + 0.06 * Math.sin(tt * 4 + nd.n), q = groundQ(nd.x, nd.y); cx.strokeStyle = 'rgba(229,72,77,.5)'; cx.lineWidth = Math.max(2, 5 * p.s); ell(p.x, p.y, (rad + 12) * p.s * pulse, (rad + 12) * p.s * q * pulse); cx.stroke(); }
    padDraw(nd.x, nd.y, rad);
    if (king) kingRock(nd.x, nd.y, p);
    else { const kind = (nd.n - 1) % 5; if (kind === 0) tent(nd.x, nd.y, 1.15); else if (kind === 1) cabinOn(nd.x, nd.y, roof, 'cabin'); else if (kind === 2) picnic(nd.x, nd.y, 1); else if (kind === 3) cabinOn(nd.x, nd.y, roof, 'shop'); else cart(nd.x, nd.y, 1.1); }
    // cờ + huy hiệu + sao
    const col = st ? '#2fbf71' : ok ? '#e5484d' : '#9a9a9a', fp = P(nd.x + rad * 0.58, nd.y + rad * 0.2, 14), u = fp.s, wv = Math.sin(tt * 3 + nd.n) * 2 * u, vy = standScale(nd.x, nd.y, p);
    cx.strokeStyle = '#6a4a32'; cx.lineWidth = Math.max(1.2, 3 * u); cx.beginPath(); cx.moveTo(fp.x, fp.y); cx.lineTo(fp.x, fp.y - 52 * u * vy); cx.stroke();
    cx.fillStyle = col; cx.beginPath(); cx.moveTo(fp.x, fp.y - 52 * u * vy); cx.lineTo(fp.x + 26 * u, fp.y - 44 * u * vy + wv); cx.lineTo(fp.x, fp.y - 36 * u * vy); cx.closePath(); cx.fill();
    const bp = P(nd.x, nd.y - rad * 0.96), br = Math.max(8, 13 * bp.s), by = bp.y + 2;
    cx.fillStyle = col; cx.strokeStyle = '#fff'; cx.lineWidth = Math.max(1.5, 3 * bp.s); cx.beginPath(); cx.arc(bp.x, by, br, 0, TAU); cx.fill(); cx.stroke();
    cx.strokeStyle = '#fff'; cx.lineWidth = Math.max(1.4, 2.6 * bp.s); cx.lineCap = 'round'; cx.beginPath();
    if (st) { cx.moveTo(bp.x - br * 0.4, by); cx.lineTo(bp.x - br * 0.1, by + br * 0.32); cx.lineTo(bp.x + br * 0.45, by - br * 0.35); }
    else if (ok) { cx.moveTo(bp.x - br * 0.35, by - br * 0.35); cx.lineTo(bp.x + br * 0.35, by + br * 0.35); cx.moveTo(bp.x + br * 0.35, by - br * 0.35); cx.lineTo(bp.x - br * 0.35, by + br * 0.35); }
    else { cx.rect(bp.x - br * 0.35, by - br * 0.1, br * 0.7, br * 0.55); cx.moveTo(bp.x - br * 0.22, by - br * 0.1); cx.arc(bp.x, by - br * 0.12, br * 0.22, Math.PI, 0); }
    cx.stroke();
    if (st) { cx.font = `800 ${Math.max(11, Math.round(18 * bp.s))}px "Plus Jakarta Sans", system-ui, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'top'; cx.lineWidth = Math.max(2, 4 * bp.s); cx.strokeStyle = 'rgba(255,255,255,.95)'; const s = '★'.repeat(st) + '☆'.repeat(3 - st); cx.strokeText(s, bp.x, by + br + 2); cx.fillStyle = '#e3a008'; cx.fillText(s, bp.x, by + br + 2); }
    if (isCur) {
      const top = P(nd.x, nd.y, king ? 180 : 115), ar = Math.max(17, 30 * p.s), hy = top.y - 8 - Math.abs(Math.sin(tt * 2.4)) * 10;
      pin(top.x, hy, ar, o.me);
      if (o.mate) { pin(top.x + ar * 1.75, hy + 6, ar * 0.85, o.mate); cx.font = `${Math.round(ar * 0.7)}px system-ui`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('💗', top.x + ar * 0.88, hy - ar * 0.2); }
    }
    const pTop = P(nd.x, nd.y, 90);
    hits.push({ r: nd.r, n: nd.n, x: p.x, y: (p.y + pTop.y) / 2, rx: rad * p.s * 1.05, ry: Math.abs(p.y - pTop.y) / 2 + rad * p.s * 0.7 });
  }
  function cabinOn(x, y, roof, kind) { cx.save(); const sc = 0.95; // dựng trên bậc giữa của bệ (cao 14)
    const bw = 58 * sc, bd = 40 * sc, hh = 30 * sc, z0 = 14;
    const pal = { front: kind === 'shop' ? C.cream : C.wood, side: kind === 'shop' ? mix(C.cream, '#8a6a4a', 0.25) : C.woodD, top: null };
    const { b, t } = box3(x, y - 4, z0, bw, bd, hh, pal); const front = [b[0], b[1], t[1], t[0]];
    if (area(front) > 0) { winOn(front, 0.12, 0.3, 0.42, 0.75, C.win); winOn(front, 0.42, 0.58, 0, 0.7, kind === 'shop' ? '#8a5a3a' : '#3b2a26'); winOn(front, 0.7, 0.88, 0.42, 0.75, C.win); }
    gable(x, y - 4, z0 + hh, bw, bd, 20 * sc, 6 * sc, { roof, roofD: mix(roof, '#000000', 0.25), roofL: mix(roof, '#ffffff', 0.18), wallS: pal.side, gable: pal.front }, false);
    if (kind === 'shop') { const a0 = P(x - bw / 2, y - 4 - bd / 2, z0 + hh * 0.72), a1 = P(x + bw / 2, y - 4 - bd / 2, z0 + hh * 0.72), a2 = P(x + bw / 2, y - 4 - bd / 2 - 16 * sc, z0 + hh * 0.42), a3 = P(x - bw / 2, y - 4 - bd / 2 - 16 * sc, z0 + hh * 0.42); for (let k = 0; k < 6; k++) { cx.fillStyle = k % 2 ? C.awnB : C.awnA; poly([lerpP(a0, a1, k / 6), lerpP(a0, a1, (k + 1) / 6), lerpP(a3, a2, (k + 1) / 6), lerpP(a3, a2, k / 6)]); cx.fill(); } }
    cx.restore(); }
  // vua vùng: khối đá lớn bo tròn + bậc thang + nhà mái cong trên đỉnh (như ảnh mẫu)
  function kingRock(x, y, p) {
    const base = P(x, y, 14), u = base.s, vy = standScale(x, y, p);
    cx.save(); cx.translate(base.x, base.y); cx.scale(1, vy);
    const lobes = [[-46, -14, 44, 50, '#d9dcd8'], [40, -16, 46, 52, '#cdd2cf'], [-6, -44, 48, 48, '#e2e4df'], [-30, -66, 30, 28, '#e6e7e2'], [26, -62, 32, 32, '#d6dad6']];
    for (const [lx, ly, rx, ry, c] of lobes) { cx.fillStyle = c; ell(lx * u, ly * u, rx * u, ry * u); cx.fill(); }
    cx.strokeStyle = 'rgba(150,158,152,.55)'; cx.lineWidth = Math.max(1, 1.8 * u);
    for (const [lx, ly, rx, ry] of lobes) { cx.beginPath(); cx.ellipse(lx * u, ly * u, rx * u, ry * u, 0, 0.2, 1.6); cx.stroke(); }
    cx.fillStyle = 'rgba(80,90,85,.16)'; ell(36 * u, -10 * u, 40 * u, 42 * u); cx.fill();
    cx.fillStyle = '#c9cdc9'; cx.beginPath(); cx.moveTo(4 * u, 8 * u); cx.lineTo(40 * u, 8 * u); cx.lineTo(30 * u, -48 * u); cx.lineTo(8 * u, -48 * u); cx.closePath(); cx.fill();
    cx.strokeStyle = '#a9afab'; cx.lineWidth = Math.max(1, 2 * u); for (let k = 1; k < 7; k++) { const yy = 8 - k * 8; cx.beginPath(); cx.moveTo((4 + k * 0.6) * u, yy * u); cx.lineTo((40 - k * 1.4) * u, yy * u); cx.stroke(); }
    cx.restore();
    // nhà mái cong trên đỉnh: khối 3D thật
    const hx = x - 8, hy = y + 4, z0 = 14 + 76; // đỉnh khối đá (cao ~90)
    const pal = { front: '#8a4a34', side: '#6a382a', back: '#6a382a', top: null };
    const bw = 46, bd = 40, hh = 38;
    const bb = box3(hx, hy, z0, bw, bd, hh, pal);
    const front = [bb.b[0], bb.b[1], bb.t[1], bb.t[0]];
    if (area(front) > 0) { winOn(front, 0.12, 0.38, 0.3, 0.7, '#d9b46a'); winOn(front, 0.55, 0.85, 0, 0.8, '#2b2f3a'); winOn(front, 0.62, 0.68, 0, 0.8, '#5a6a9a'); }
    gable(hx, hy, z0 + hh, bw, bd, 22, 10, { roof: '#4a5266', roofD: '#323848', roofL: '#69728a', wallS: pal.side, gable: pal.front }, true);
  }
  function pin(x, y, r, who) {
    cx.save(); cx.translate(x, y);
    cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(0, 0, r + 3, 0, TAU); cx.fill();
    cx.beginPath(); cx.moveTo(-r * 0.45, r * 0.8); cx.lineTo(0, r * 1.45); cx.lineTo(r * 0.45, r * 0.8); cx.closePath(); cx.fill();
    cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fillStyle = '#ff8a5c'; cx.fill();
    cx.save(); cx.beginPath(); cx.arc(0, 0, r - 1, 0, TAU); cx.clip();
    const a = who && who.avatar ? String(who.avatar) : '';
    if (/^data:image|^https?:/.test(a)) { const im = avatarImg(a); if (im.complete && im.naturalWidth) cx.drawImage(im, -r, -r, r * 2, r * 2); }
    else { cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; if (a) { cx.font = `${Math.round(r * 1.15)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji"`; cx.fillText(a, 0, r * 0.06); } else { cx.font = `800 ${Math.round(r * 0.8)}px "Plus Jakarta Sans", system-ui`; cx.fillText(((who && who.name) || 'You').trim().slice(0, 1).toUpperCase(), 0, 1); } }
    cx.restore(); cx.restore();
  }
  function signDraw(it) {
    const { p, sign: g } = it, u = Math.max(0.5, p.s), vy = standScale(it.x, it.y, p);
    cx.save(); cx.translate(p.x, p.y);
    cx.fillStyle = 'rgba(80,90,50,.2)'; ell(6 * u, 2 * u, 40 * u, 10 * u); cx.fill();
    cx.fillStyle = '#8a5a3a'; cx.fillRect(-7 * u, -40 * u * vy, 5 * u, 40 * u * vy); cx.fillRect(3 * u, -40 * u * vy, 5 * u, 40 * u * vy);
    cx.font = `800 ${Math.round(20 * u)}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const tw = Math.max(cx.measureText(g.name).width + 34 * u, 150 * u), bh = 56 * u, top = -40 * u * vy - bh;
    cx.fillStyle = '#fbf3e2'; cx.strokeStyle = '#b9875a'; cx.lineWidth = 3 * u; rrect(-tw / 2, top, tw, bh, 12 * u); cx.fill(); cx.stroke();
    cx.fillStyle = '#5a3a24'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(g.name, 0, top + bh * 0.38);
    cx.font = `700 ${Math.round(13 * u)}px "Plus Jakarta Sans", system-ui, sans-serif`; cx.fillStyle = '#9a7a5a'; cx.fillText(`${g.lv} · ${g.diff}`, 0, top + bh * 0.74);
    cx.restore();
  }
  function lockBadge(x, y, s, king) {
    const r = Math.max(22, 40 * s);
    cx.save(); cx.translate(x, y);
    cx.fillStyle = '#fbf3e2'; cx.strokeStyle = '#b9875a'; cx.lineWidth = 3; cx.beginPath(); cx.arc(0, 0, r, 0, TAU); cx.fill(); cx.stroke();
    cx.fillStyle = '#b9875a'; rrect(-r * 0.38, -r * 0.08, r * 0.76, r * 0.56, r * 0.1); cx.fill();
    cx.strokeStyle = '#b9875a'; cx.lineWidth = r * 0.14; cx.beginPath(); cx.arc(0, -r * 0.1, r * 0.24, Math.PI, 0); cx.stroke();
    if (king) { cx.font = `700 ${Math.max(11, Math.round(15 * s))}px "Plus Jakarta Sans", system-ui, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'top'; cx.lineWidth = 4; cx.strokeStyle = 'rgba(255,255,255,.95)'; const t = `Beat ${king} to open`; cx.strokeText(t, 0, r + 8); cx.fillStyle = '#5a3a24'; cx.fillText(t, 0, r + 8); }
    cx.restore();
  }
  // mờ phía trên và phía dưới (tilt-shift) như ảnh mẫu
  function tiltShift() {
    if (!blurOK) return;
    try {
      const W = cv.width, H = cv.height;
      for (const [y0, y1, fadeDown] of [[0, Math.round(H * 0.26), true], [Math.round(H * 0.84), H, false]]) {
        const hh = y1 - y0; if (hh <= 0) continue;
        tx.setTransform(1, 0, 0, 1, 0, 0); tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, W, hh + 20);
        tx.filter = `blur(${Math.round(2.6 * dpr)}px)`; tx.drawImage(cv, 0, y0, W, hh, 0, 0, W, hh); tx.filter = 'none';
        tx.globalCompositeOperation = 'destination-in';
        const g = tx.createLinearGradient(0, 0, 0, hh); if (fadeDown) { g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); } else { g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); }
        tx.fillStyle = g; tx.fillRect(0, 0, W, hh); tx.globalCompositeOperation = 'source-over';
        cx.setTransform(1, 0, 0, 1, 0, 0); cx.drawImage(tmp, 0, 0, W, hh, 0, y0, W, hh); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    } catch (e) { blurOK = false; }
  }

  // ---------- tương tác ----------
  let raf = 0, dirty = true, drag = null, moved = 0, last = 0;
  const move = (dy) => { camY = clamp(camY + dy, minY, maxY); dirty = true; };
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
    if (document.hidden) return;
    if (Math.abs(vel) > 0.05 && !drag) { move(vel); vel *= 0.92; if (camY <= minY || camY >= maxY) vel = 0; }
    if (now - last < 40 && !dirty) return; // ~25 khung/giây khi đứng yên (nước, cờ)
    last = now; dirty = false; draw();
  }
  const ro = new ResizeObserver(() => { size(); dirty = true; });
  ro.observe(box); size(); draw(); raf = requestAnimationFrame(loop);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); vel = 0; move(-e.deltaY / k0 * 0.9); }, { passive: false });
  cv.addEventListener('pointerdown', (e) => { drag = { y: e.clientY, lastY: e.clientY }; moved = 0; vel = 0; try { cv.setPointerCapture(e.pointerId); } catch (er) {} });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) { cv.style.cursor = hitAt(e) ? 'pointer' : 'grab'; return; }
    moved = Math.max(moved, Math.abs(e.clientY - drag.y));
    if (moved > 5) { const step = (e.clientY - drag.lastY) / k0 * 1.6; move(step); vel = step * 0.9; drag.lastY = e.clientY; cv.style.cursor = 'grabbing'; }
  });
  cv.addEventListener('pointerup', (e) => { if (!drag) return; const wasMove = moved > 5; drag = null; cv.style.cursor = 'grab'; if (!wasMove) { vel = 0; const hit = hitAt(e); if (hit) { if (hit.fog) o.onLocked(hit.fog); else o.onBoss(hit.r, hit.n); } } });
  cv.addEventListener('pointercancel', () => { drag = null; });
  cv.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); vel = 16; } else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); vel = -16; } });
  function hitAt(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (let k = hits.length - 1; k >= 0; k--) { const hh = hits[k]; if (hh.fog) { if (Math.hypot(x - hh.x, y - hh.y) < hh.r) return hh; continue; } if (((x - hh.x) / hh.rx) ** 2 + ((y - hh.y) / hh.ry) ** 2 <= 1) return hh; }
    return null;
  }
  function glide(target) { const from = camY, to = clamp(target, minY, maxY), t1 = performance.now(), D = 700; vel = 0; const step = (now) => { const t = Math.min(1, (now - t1) / D), e = 1 - Math.pow(1 - t, 3); camY = from + (to - from) * e; dirty = true; if (t < 1 && cv.isConnected) requestAnimationFrame(step); }; requestAnimationFrame(step); }
  return {
    up: () => glide(camY + 650), down: () => glide(camY - 650),
    home: () => { const n = o.cur ? nodeOf(o.cur[0], o.cur[1]) : nodes[0]; if (n) glide(n.y + 200); },
    destroy: () => { cancelAnimationFrame(raf); ro.disconnect(); },
  };
}
