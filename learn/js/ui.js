// Tiện ích giao diện dùng chung (app.js và social.js)
import { I } from './icons.js?v=43';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const shuffleArr = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export function toast(m) { const t = document.getElementById('toast'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600); }

export function sheet(html, onMount, cls = '') {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><button class="icon-btn sheet-x" type="button" aria-label="Close">${I.x}</button>${html}</div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onEsc); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  root.querySelector('.sheet-bg').addEventListener('click', close);
  root.querySelector('.sheet-x').addEventListener('click', close);
  if (onMount) onMount(root.querySelector('.sheet'), close);
  return close;
}
// hộp xác nhận nhỏ, trả về Promise<boolean>
export function confirmBox(title, text, ok = 'Confirm', danger = false) {
  return new Promise((res) => {
    let done = false;
    const close = sheet(`<h2>${esc(title)}</h2><p class="sub">${esc(text)}</p><div class="foot-row"><button class="btn ghost cb-no" type="button">Cancel</button><button class="btn ${danger ? 'danger' : 'acc'} cb-yes" type="button">${esc(ok)}</button></div>`, (el, c) => {
      el.querySelector('.cb-no').addEventListener('click', () => { done = true; c(); res(false); });
      el.querySelector('.cb-yes').addEventListener('click', () => { done = true; c(); res(true); });
    });
    const root = document.getElementById('sheet-root');
    const obs = new MutationObserver(() => { if (!root.innerHTML && !done) { obs.disconnect(); res(false); } });
    obs.observe(root, { childList: true });
    void close;
  });
}
export function floatText(el, text, cls = '') {
  if (!el) return; const r = el.getBoundingClientRect();
  const f = document.createElement('div'); f.className = 'float-tx ' + cls; f.textContent = text;
  f.style.left = r.left + r.width / 2 + 'px'; f.style.top = r.top + 'px'; document.body.appendChild(f); setTimeout(() => f.remove(), 1400);
}
export function burst(x, y, n = 26) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'burst-fx'; box.style.left = x + 'px'; box.style.top = y + 'px';
  for (let i = 0; i < n; i++) { const p = document.createElement('i'); const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, d = 70 + Math.random() * 90; p.style.setProperty('--x', Math.cos(a) * d + 'px'); p.style.setProperty('--y', Math.sin(a) * d + 'px'); p.style.setProperty('--d', Math.random() * 0.15 + 's'); p.style.background = ['#FFC94A', '#FF8A3D', '#ff6a58', '#FFFFFF', '#5EEAD4'][i % 5]; box.appendChild(p); }
  document.body.appendChild(box); setTimeout(() => box.remove(), 1300);
}
export function overlay(html, onClose, cls = '') {
  const o = document.createElement('div'); o.className = 'ovl ' + cls; o.innerHTML = `<div class="ovl-in">${html}</div>`;
  document.body.appendChild(o);
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 250); if (onClose) onClose(); };
  o.addEventListener('click', (e) => { if (e.target === o || e.target.closest('.ovl-ok')) close(); });
  return { el: o, close };
}
export const initials = (n) => (n || '?').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
// ảnh đại diện: emoji nếu có, không thì chữ cái đầu
export const isImg = (a) => typeof a === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(a);
export const avatar = (name, emo, cls = '') => isImg(emo) ? `<span class="av img ${cls}"><img src="${emo}" alt="" loading="lazy" decoding="async"></span>` : emo ? `<span class="av emo ${cls}">${esc(emo)}</span>` : `<span class="av ${cls}">${esc(initials(name))}</span>`;
// ảnh đại diện có vòng VIP (1–10). Không có VIP thì trả về ảnh thường.
// v31: khung VIP — mỗi cấp một kiểu riêng: vòng, hạt lửa, pha lê, sao chổi, nguyệt quế, cánh, vương miện
const WING = '<svg viewBox="0 0 64 48" aria-hidden="true"><path class="w1" d="M2 30C10 12 30 2 62 4C54 9 56 12 60 15C50 17 52 21 56 24C46 25 46 29 50 33C38 33 34 36 33 41C22 40 10 37 2 30Z"/><path class="w2" d="M5 30C14 19 29 11 50 9C40 15 31 21 24 31C16 33 9 32 5 30Z"/></svg>';
const LAUREL = (() => { let d = ''; for (let i = 0; i < 6; i++) { const a = 116 + i * 19, r = a * Math.PI / 180, x = (50 + Math.cos(r) * 46).toFixed(1), y = (50 + Math.sin(r) * 46).toFixed(1); d += `<ellipse cx="${x}" cy="${y}" rx="7.5" ry="3.3" transform="rotate(${a + 90 - 28} ${x} ${y})"/>`; } return `<svg viewBox="0 0 100 100" aria-hidden="true"><g>${d}</g><g transform="matrix(-1 0 0 1 100 0)">${d}</g></svg>`; })();
const W2 = `<i class="vw l">${WING}</i><i class="vw r">${WING}</i>`;
const VX = ['', '', '<i class="vp"><b></b><b></b><b></b></i>', '<i class="vr2"></i><i class="vtw"><b></b><b></b><b></b><b></b></i>', '<i class="vo"><b></b></i>',
  '<i class="vry"></i><i class="vo"><b></b><b></b></i>', `<i class="vry"></i><i class="vl">${LAUREL}</i>`, '<i class="vr2"></i><i class="vr3"></i>',
  `${W2}<i class="vh"></i>`, `${W2}<i class="vp"><b></b><b></b><b></b><b></b></i>`, `${W2}<i class="vr2"></i><i class="vsp"><b></b><b></b><b></b></i>`];
export const vipAv = (name, emo, vip = 0, cls = '') => {
  const v = Math.max(0, Math.min(10, vip | 0));
  return `<span class="vav v${v} ${cls}" title="VIP ${v}"><i class="vr" aria-hidden="true"></i>${VX[v]}${avatar(name, emo, cls)}<b class="vb">V${v}</b></span>`;
};
export function ago(t) {
  if (!t) return 'never';
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
export const online = (t) => t && Date.now() - new Date(t).getTime() < 5 * 60000;
export const fmtDate = (t) => t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
export async function copyText(t, msg = 'Copied') { try { await navigator.clipboard.writeText(t); toast(msg); } catch (e) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); toast(msg); } catch (er) { toast(t); } a.remove(); } }
export function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const AVATARS = ['🦊', '🐼', '🐯', '🦉', '🐙', '🐳', '🦄', '🐸', '🐨', '🐧', '🦁', '🐝', '🌵', '🍀', '🌸', '🍄', '🌙', '⭐', '🔥', '⚡', '🎧', '📚', '🚀', '🎯'];
export const SHAPES = [I.tri, I.dia, I.cir, I.sqr];
