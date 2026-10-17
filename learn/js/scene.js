// Nền động: ban ngày cánh hoa + bong bóng sáng bay lơ lửng, ban đêm sao lấp lánh + đom đóm + sao băng.
// Vẽ bằng một canvas, tự dừng khi tab ẩn, tôn trọng "giảm chuyển động".
const cv = document.querySelector('.scene canvas.fx');
const scene = document.querySelector('.scene');
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

let W = 0, H = 0, dpr = 1, ctx = null, parts = [], stars = [], shoot = null, nextShoot = 0, raf = 0, dark = false;
const rnd = (a, b) => a + Math.random() * (b - a);
const PETAL = ['#FFC2D1', '#FFD6E0', '#FFE7A8', '#FFFFFF', '#CDE8FF'];
const BOKEH = ['255,214,102', '255,170,190', '160,210,255', '190,240,215'];

function isDark() { return document.documentElement.dataset.theme === 'dark'; }
function size() {
  dpr = Math.min(1.5, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
  ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function seed() {
  dark = isDark();
  const area = W * H, small = W < 700;
  parts = []; stars = [];
  if (dark) {
    const ns = Math.round(Math.min(170, area / 9000));
    for (let i = 0; i < ns; i++) stars.push({ x: rnd(0, W), y: rnd(0, H * 0.72) ** 1.05, r: Math.random() < 0.12 ? rnd(1.2, 1.9) : rnd(0.4, 1.1), p: rnd(0, 6.3), s: rnd(0.4, 1.6) });
    const nf = small ? 10 : 22;
    for (let i = 0; i < nf; i++) parts.push({ k: 'fly', x: rnd(0, W), y: rnd(H * 0.35, H), a: rnd(0, 6.3), sp: rnd(0.15, 0.45), p: rnd(0, 6.3), r: rnd(1.6, 2.8) });
    nextShoot = performance.now() + rnd(3000, 7000);
  } else {
    const np = small ? 9 : 18, nb = small ? 7 : 14;
    for (let i = 0; i < np; i++) parts.push(petal(true));
    for (let i = 0; i < nb; i++) parts.push({ k: 'bokeh', x: rnd(0, W), y: rnd(0, H), r: rnd(3, 9), c: BOKEH[i % BOKEH.length], al: rnd(0.25, 0.5), vy: rnd(-0.12, -0.32), p: rnd(0, 6.3) });
  }
}
function petal(anywhere) {
  return { k: 'petal', x: rnd(-40, W), y: anywhere ? rnd(-20, H) : rnd(-60, -10), w: rnd(5, 9), vx: rnd(0.15, 0.5), vy: rnd(0.35, 0.8), rot: rnd(0, 6.3), vr: rnd(-0.02, 0.02), sw: rnd(0, 6.3), c: PETAL[Math.floor(Math.random() * PETAL.length)] };
}
function draw(t) {
  ctx.clearRect(0, 0, W, H);
  if (dark) {
    for (const s of stars) {
      const a = 0.45 + 0.55 * Math.sin(t * 0.001 * s.s + s.p) ** 2;
      ctx.globalAlpha = a; ctx.fillStyle = '#FFF6DE';
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
      if (s.r > 1.2) { ctx.globalAlpha = a * 0.35; ctx.fillRect(s.x - s.r * 3, s.y - 0.4, s.r * 6, 0.8); ctx.fillRect(s.x - 0.4, s.y - s.r * 3, 0.8, s.r * 6); }
    }
    for (const f of parts) {
      f.a += rnd(-0.05, 0.05); f.x += Math.cos(f.a) * f.sp; f.y += Math.sin(f.a) * f.sp * 0.7;
      if (f.x < -10) f.x = W + 10; if (f.x > W + 10) f.x = -10; if (f.y < H * 0.3) f.a = 1.4; if (f.y > H + 10) f.a = -1.6;
      const g = 0.25 + 0.75 * Math.max(0, Math.sin(t * 0.0016 + f.p)) ** 2;
      const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 6);
      grd.addColorStop(0, `rgba(255,236,140,${0.7 * g})`); grd.addColorStop(1, 'rgba(255,236,140,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 6, 0, 7); ctx.fill();
      ctx.fillStyle = `rgba(255,250,210,${0.5 + 0.5 * g})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 0.7, 0, 7); ctx.fill();
    }
    if (!shoot && t > nextShoot) shoot = { x: rnd(W * 0.2, W * 0.95), y: rnd(10, H * 0.3), vx: -rnd(7, 10), vy: rnd(2.5, 4), life: 1 };
    if (shoot) {
      const s = shoot, tx = s.x - s.vx * 9, ty = s.y - s.vy * 9;
      const grd = ctx.createLinearGradient(s.x, s.y, tx, ty);
      grd.addColorStop(0, `rgba(255,255,240,${s.life})`); grd.addColorStop(1, 'rgba(255,255,240,0)');
      ctx.globalAlpha = 1; ctx.strokeStyle = grd; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty); ctx.stroke();
      s.x += s.vx; s.y += s.vy; s.life -= 0.018;
      if (s.life <= 0 || s.x < -50) { shoot = null; nextShoot = t + rnd(7000, 15000); }
    }
  } else {
    for (const p of parts) {
      if (p.k === 'bokeh') {
        p.y += p.vy; p.x += Math.sin(t * 0.0006 + p.p) * 0.15;
        if (p.y < -20) { p.y = H + 20; p.x = rnd(0, W); }
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
        grd.addColorStop(0, `rgba(${p.c},${p.al})`); grd.addColorStop(0.55, `rgba(${p.c},${p.al * 0.5})`); grd.addColorStop(1, `rgba(${p.c},0)`);
        ctx.globalAlpha = 1; ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.2, 0, 7); ctx.fill();
      } else {
        p.sw += 0.02; p.x += p.vx + Math.sin(p.sw) * 0.5; p.y += p.vy; p.rot += p.vr + Math.sin(p.sw) * 0.01;
        if (p.y > H + 20 || p.x > W + 40) Object.assign(p, petal(false));
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(p.sw * 1.3)));
        ctx.globalAlpha = 0.85; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.moveTo(0, -p.w); ctx.bezierCurveTo(p.w * 0.9, -p.w * 0.6, p.w * 0.7, p.w * 0.7, 0, p.w); ctx.bezierCurveTo(-p.w * 0.7, p.w * 0.7, -p.w * 0.9, -p.w * 0.6, 0, -p.w); ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.globalAlpha = 1;
}
function loop(t) { draw(t); raf = requestAnimationFrame(loop); }
function start() { cancelAnimationFrame(raf); if (still) { draw(0); return; } raf = requestAnimationFrame(loop); }

if (cv) {
  size(); seed(); start();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { size(); seed(); start(); }, 200); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  new MutationObserver(() => { if (isDark() !== dark) { seed(); start(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // đồi núi trôi nhẹ theo cuộn trang
  let tick = false;
  addEventListener('scroll', () => { if (tick) return; tick = true; requestAnimationFrame(() => { scene.style.setProperty('--sy', Math.min(scrollY, 1200)); tick = false; }); }, { passive: true });
}
