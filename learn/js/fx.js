// v30: hiệu ứng cho Live quiz: pháo hoa, mưa giấy màu, hạt theo chủ đề (dơi Halloween, tuyết Noel, hoa mai Tết, bóng bay tiệc)
import { sfx } from './sound.js?v=43';
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// 2 lớp: "front" (pháo hoa, giấy màu — nằm trên mọi thứ) và "back" (hạt theo chủ đề — nằm sau nội dung màn quiz)
const mk = (cls) => ({ cls, cv: null, cx: null, parts: [] });
const front = mk('fx-cv'), back = mk('fx-bg');
let raf = 0, until = 0, ambient = null, ambT = 0;
const W = () => innerWidth, H = () => innerHeight;
function ensure(L) {
  const host = L === back ? document.querySelector('.qz-stage') : document.body;
  if (L.cv && L.cv.isConnected && (L === front || L.cv.parentNode === host)) return true;
  if (!host) return false;
  if (L.cv) L.cv.remove();
  L.cv = document.createElement('canvas'); L.cv.className = L.cls; L.cv.setAttribute('aria-hidden', 'true');
  if (L === back) host.prepend(L.cv); else host.appendChild(L.cv);
  L.cx = L.cv.getContext('2d'); size(L); return true;
}
function size(L) { if (!L.cv) return; const d = Math.min(2, devicePixelRatio || 1); L.cv.width = W() * d; L.cv.height = H() * d; L.cx.setTransform(d, 0, 0, d, 0, 0); }
addEventListener('resize', () => { size(front); size(back); });
const COLORS = ['#FFD34D', '#FF6B6B', '#5EE7FF', '#B46BFF', '#7CFFB2', '#FF9F43', '#FF7BE0', '#FFFFFF'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
let parts = front.parts; // các hàm bên dưới đẩy hạt vào lớp trước
function draw(L) {
  const cx = L.cx; if (!cx) return;
  cx.clearRect(0, 0, W(), H());
  L.parts = L.parts.filter((p) => p.life > 0 && p.y < H() + 60 && p.y > -120);
  for (const p of L.parts) {
    p.life -= 1; p.vx *= p.drag ?? 0.985; p.vy = p.vy * (p.drag ?? 0.985) + (p.g ?? 0.06); p.x += p.vx; p.y += p.vy; if (p.spin) p.rot += p.spin;
    if (p.sway) p.x += Math.sin((p.life + p.seed) / 18) * p.sway;
    const a = Math.max(0, Math.min(1, p.life / (p.fade || 30))) * (p.alpha ?? 1);
    cx.globalAlpha = a;
    if (p.kind === 'spark') { cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 7); cx.fill(); if (p.trail) { cx.globalAlpha = a * 0.35; cx.beginPath(); cx.arc(p.x - p.vx * 2, p.y - p.vy * 2, p.r * 0.8, 0, 7); cx.fill(); } }
    else if (p.kind === 'rocket') { cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(p.x, p.y, 2.4, 0, 7); cx.fill(); cx.globalAlpha = 0.4; cx.fillStyle = p.c; cx.beginPath(); cx.arc(p.x, p.y + 6, 2, 0, 7); cx.fill(); if (p.vy >= -1.2 || p.life <= 1) { p.life = 0; explode(p.x, p.y, p.c); } }
    else if (p.kind === 'conf') { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2))); cx.restore(); }
    else if (p.kind === 'emo') { cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.font = `${p.s}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(p.e, 0, 0); cx.restore(); }
  }
  cx.globalAlpha = 1;
}
function loop(t) {
  raf = 0;
  if (ambient && t - ambT > ambient.every && back.parts.length < ambient.max) { ambT = t; if (ensure(back)) back.parts.push(ambient.make()); }
  draw(front); draw(back); parts = front.parts;
  if (front.parts.length || performance.now() < until) raf = requestAnimationFrame(loop);
  else { if (front.cv) { front.cv.remove(); front.cv = null; front.cx = null; } if (ambient || back.parts.length) raf = requestAnimationFrame(loop); }
  if (!ambient && !back.parts.length && back.cv) { back.cv.remove(); back.cv = null; back.cx = null; }
}
const run = () => { ensure(front); parts = front.parts; if (!raf) raf = requestAnimationFrame(loop); };
function explode(x, y, c) {
  const n = 46 + Math.floor(Math.random() * 30), c2 = pick(COLORS), ring = Math.random() < 0.35;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, sp = ring ? 4.2 : 1.5 + Math.random() * 4.2;
    front.parts.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.05, drag: 0.975, r: 1.6 + Math.random() * 1.6, c: Math.random() < 0.7 ? c : c2, life: 60 + Math.random() * 40, fade: 40, trail: true });
  }
  sfx('boom');
}
// pháo hoa: n quả, rải trong ms mili giây
export function fireworks(n = 8, ms = 4000) {
  if (reduce()) { confetti(80); return; }
  until = Math.max(until, performance.now() + ms + 2500); run();
  for (let i = 0; i < n; i++) setTimeout(() => {
    const x = W() * (0.15 + Math.random() * 0.7);
    front.parts.push({ kind: 'rocket', x, y: H() + 10, vx: (Math.random() - 0.5) * 1.5, vy: -(9 + Math.random() * 4.5) * Math.min(1.25, H() / 800 + 0.35), g: 0.12, drag: 0.995, c: pick(COLORS), life: 140 });
    sfx('whistle');
  }, i * (ms / n) + Math.random() * 200);
}
// mưa giấy màu từ trên xuống
export function confetti(n = 120, colors = COLORS) {
  run(); until = Math.max(until, performance.now() + 4000);
  for (let i = 0; i < n; i++) front.parts.push({ kind: 'conf', x: Math.random() * W(), y: -20 - Math.random() * H() * 0.4, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, g: 0.03, drag: 0.995, w: 6 + Math.random() * 6, h: 10 + Math.random() * 8, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.3, c: pick(colors), life: 260 + Math.random() * 120, fade: 50, sway: 0.6 + Math.random(), seed: Math.random() * 100 });
}
// bắn giấy màu từ một điểm (ví dụ trên đầu người thắng)
export function pop(x, y, n = 40, colors = COLORS) {
  run();
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 5 + Math.random() * 7; front.parts.push({ kind: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.18, drag: 0.97, w: 5 + Math.random() * 5, h: 8 + Math.random() * 6, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 0.4, c: pick(colors), life: 120 + Math.random() * 60, fade: 40 }); }
}
// một biểu tượng bay lên (ví dụ +500, 🎁)
export function emoji(e, x, y, n = 10) {
  run();
  for (let i = 0; i < n; i++) front.parts.push({ kind: 'emo', e, x: x + (Math.random() - 0.5) * 60, y, vx: (Math.random() - 0.5) * 4, vy: -4 - Math.random() * 5, g: 0.12, drag: 0.99, s: 22 + Math.random() * 16, rot: (Math.random() - 0.5) * 0.6, spin: (Math.random() - 0.5) * 0.05, life: 90 + Math.random() * 40, fade: 30 });
}
// hạt nền theo chủ đề (rơi nhẹ suốt ván)
const THEMES = {
  halloween: { every: 1300, max: 12, e: ['🦇', '🎃', '👻', '🕸️', '🍬'] },
  christmas: { every: 500, max: 28, e: ['❄', '❄', '❅', '❆', '⛄', '🎁'], snow: true },
  tet: { every: 1100, max: 14, e: ['🌸', '🏮', '🧧', '🌼', '✨'] },
  party: { every: 1300, max: 12, e: ['🎈', '🎉', '✨', '🎊', '⭐'] },
};
export function theme(name) {
  const t = THEMES[name];
  if (!t || reduce()) { ambient = null; return; }
  ambient = { every: t.every, max: t.max, make: () => {
    const e = pick(t.e), up = name === 'party' && e === '🎈';
    return { kind: 'emo', e, x: Math.random() * W(), y: up ? H() + 20 : -20, vx: (Math.random() - 0.5) * 0.6, vy: up ? -1.2 - Math.random() : 0.6 + Math.random() * 1.1, g: 0, drag: 1, s: (t.snow && e.length === 1 ? 10 : 16) + Math.random() * 12, alpha: 0.55, rot: 0, spin: (Math.random() - 0.5) * 0.02, sway: 0.5 + Math.random() * 0.8, seed: Math.random() * 100, life: Math.ceil(H() / 0.5) + 120, fade: 60 };
  } };
  if (!raf) raf = requestAnimationFrame(loop);
}
export function stop() { ambient = null; until = 0; [front, back].forEach((L) => { L.parts = []; if (L.cv) L.cv.remove(); L.cv = null; L.cx = null; }); parts = front.parts; if (raf) cancelAnimationFrame(raf); raf = 0; }
