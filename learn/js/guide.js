// Hướng dẫn bắt buộc 1 lần cho mỗi tài khoản: đổi hình nền trong Collection, rồi đổi ảnh đại diện.
// Sau đó là 2 gợi ý (Add friends, Duels): không chặn màn hình, chỉ tắt khi người dùng bấm đúng nút đó.
// Lưu trong tiến trình (S.guide) nên đồng bộ theo tài khoản: làm xong một lần thì máy khác cũng không hiện lại.
import { S, save } from './store.js?v=19';
import { acct } from './account.js?v=19';
import { sfx } from './sound.js?v=19';
import { toast } from './ui.js?v=19';

const g = () => { if (!S.guide || typeof S.guide !== 'object') S.guide = {}; return S.guide; };
const vis = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
const first = (sels) => { for (const s of sels) { const el = [...document.querySelectorAll(s)].find(vis); if (el) return el; } return null; };
const route = () => location.hash || '#/';
const blocked = () => !!document.querySelector('.player, .ovl, .qz-stage, .du-stage, .du-vs') || route().startsWith('#/play') || route().startsWith('#/host');

/* ---------- các bước ---------- */
const flags = { bg: false, av: false };
const STEPS = [
  { id: 'col', n: 1, title: 'Change your background', text: 'Every wallpaper you win lives in Collection. Open it.',
    el: () => first(['.side .col-mini .cm-go', '.nav .mt[href="#/collection"]', '.tabbar a[href="#/collection"]']), done: () => route().startsWith('#/collection') },
  { id: 'card', n: 2, title: 'Pick a wallpaper', text: 'Tap one you own (the bright ones) to open it.',
    el: () => [...document.querySelectorAll('.col-body .wcard.s-got')].find((c) => +c.dataset.w !== (S.bg || 71) && c.isConnected),
    done: () => !!document.querySelector('.ws-sheet .use-bg'), back: () => !route().startsWith('#/collection') && 'col' },
  { id: 'bg', n: 3, title: 'Use it as your background', text: 'Tap “Use as background”. The page behind your lessons changes right away.',
    el: () => first(['.ws-sheet .use-bg:not([disabled])']), done: () => flags.bg, back: () => !document.querySelector('.ws-sheet') && (route().startsWith('#/collection') ? 'card' : 'col') },
  { id: 'me', n: 4, title: 'Now your avatar', text: 'Friends, classmates and duel rivals see it. Open your profile.',
    el: () => first(['.hud-me', '.tabbar a[href="#/me"]']), done: () => route().startsWith('#/me') },
  { id: 'av', n: 5, title: 'Change your picture', text: 'Tap your picture.',
    el: () => first(['.av-pick']), done: () => !!document.querySelector('.sheet .up-btn'), back: () => !route().startsWith('#/me') && 'me' },
  { id: 'pick', n: 6, title: 'Choose one', text: 'Pick an emoji, or upload your own photo.',
    el: () => { const b = document.querySelector('.sheet .up-btn'); return b ? b.closest('.sheet') : null; }, done: () => flags.av, back: () => !document.querySelector('.sheet .up-btn') && (route().startsWith('#/me') ? 'av' : 'me') },
];
let cur = -1, tickT = 0, miss = 0, ui = null, startT = 0;

function mount() {
  if (ui) return ui;
  const root = document.createElement('div'); root.className = 'tour';
  root.innerHTML = `<div class="tr-b t"></div><div class="tr-b r"></div><div class="tr-b b"></div><div class="tr-b l"></div><div class="tr-ring"></div>
    <div class="tr-tip" role="dialog" aria-live="polite"><small class="tr-k"></small><b class="tr-t"></b><p class="tr-p"></p><span class="tr-dots">${STEPS.map(() => '<i></i>').join('')}</span></div>`;
  document.body.appendChild(root);
  // chặn mọi cú bấm ngoài vùng sáng (các tấm che nhận sự kiện); phím Esc không đóng được bảng
  ['pointerdown', 'click'].forEach((t) => root.querySelectorAll('.tr-b').forEach((b) => b.addEventListener(t, (e) => { e.stopPropagation(); e.preventDefault(); if (t === 'click') nudge(); })));
  ui = { root, ring: root.querySelector('.tr-ring'), tip: root.querySelector('.tr-tip'), bl: [...root.querySelectorAll('.tr-b')] };
  return ui;
}
function nudge() { if (!ui) return; ui.tip.classList.remove('shake'); void ui.tip.offsetWidth; ui.tip.classList.add('shake'); sfx('bad'); }
const onKey = (e) => { if (cur >= 0 && e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); nudge(); } };
const onClick = (e) => {
  if (cur < 0) return;
  if (e.target.closest('.ws-sheet .use-bg')) flags.bg = true;
  if (e.target.closest('.sheet [data-a]')) flags.av = true;
};
const onChange = (e) => { if (cur >= 0 && e.target.matches('.sheet input[type=file]') && e.target.files && e.target.files.length) flags.av = true; };

function place(el, s) {
  const u = mount(), r = el.getBoundingClientRect(), pad = 6;
  const x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), w = Math.min(innerWidth, r.right + pad) - x, h = Math.min(innerHeight, r.bottom + pad) - y;
  const [t, rt, b, l] = u.bl;
  t.style.cssText = `left:0;top:0;width:100%;height:${y}px`;
  b.style.cssText = `left:0;top:${y + h}px;width:100%;height:${Math.max(0, innerHeight - y - h)}px`;
  l.style.cssText = `left:0;top:${y}px;width:${x}px;height:${h}px`;
  rt.style.cssText = `left:${x + w}px;top:${y}px;width:${Math.max(0, innerWidth - x - w)}px;height:${h}px`;
  u.ring.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  u.tip.querySelector('.tr-k').textContent = `Step ${s.n} of ${STEPS.length}`;
  u.tip.querySelector('.tr-t').textContent = s.title;
  u.tip.querySelector('.tr-p').textContent = s.text;
  u.tip.querySelectorAll('.tr-dots i').forEach((d, i) => d.classList.toggle('on', i <= cur));
  // bong bóng: dưới vùng sáng nếu đủ chỗ, không thì ở trên; vùng sáng quá cao thì đặt ở mép trên
  const tw = Math.min(320, innerWidth - 24), th = u.tip.offsetHeight || 120;
  let tx = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), innerWidth - tw - 12), ty;
  if (y + h + 14 + th < innerHeight) ty = y + h + 14; else if (y - 14 - th > 0) ty = y - 14 - th; else { ty = 12; tx = innerWidth - tw - 12; }
  u.tip.style.cssText = `left:${tx}px;top:${ty}px;width:${tw}px`;
}
function step() {
  const s = STEPS[cur]; if (!s) return finish();
  if (s.done()) { cur++; miss = 0; sfx('ok'); if (cur >= STEPS.length) return finish(); return; }
  const el = s.el();
  if (el && vis(el)) {
    miss = 0;
    const r = el.getBoundingClientRect();
    if ((r.top < 70 || r.bottom > innerHeight - 80) && !el.closest('.sheet') && !el.closest('.hud') && !el.closest('.tabbar')) { el.scrollIntoView({ block: 'center' }); }
    place(el, s); ui.root.classList.remove('wait');
    return;
  }
  if (ui) ui.root.classList.add('wait');
  if (++miss > 6) { const to = s.back && s.back(); if (to) { cur = STEPS.findIndex((x) => x.id === to); miss = 0; } else if (miss > 40 && s.id === 'col' && !route().startsWith('#/collection')) { location.hash = '#/'; miss = 0; } }
}
function finish() {
  clearInterval(tickT); tickT = 0; cur = -1;
  document.removeEventListener('keydown', onKey, true); document.removeEventListener('click', onClick, true); document.removeEventListener('change', onChange, true);
  if (ui) { ui.root.remove(); ui = null; }
  g().tour = Date.now(); save(true);
  sfx('levelup'); toast('All set! Change your background and avatar any time.');
  setTimeout(hints, 1200);
}
export function maybeStart() {
  if (!acct || !S.onboarded || g().tour || cur >= 0 || startT) { if (g().tour) hints(); return; }
  startT = setTimeout(function check() {
    startT = 0;
    if (!acct || g().tour || cur >= 0) return;
    if (blocked() || document.querySelector('.sheet, .chat-dock:not(.inline)')) { startT = setTimeout(check, 2000); return; }
    cur = route().startsWith('#/collection') ? 1 : 0; miss = 0; flags.bg = false; flags.av = false;
    document.addEventListener('keydown', onKey, true); document.addEventListener('click', onClick, true); document.addEventListener('change', onChange, true);
    mount(); ui.root.classList.add('wait'); sfx('quest');
    tickT = setInterval(step, 220); step();
  }, 1800);
}
export const touring = () => cur >= 0;

/* ---------- gợi ý Add friends / Duels ---------- */
const HINTS = [
  { id: 'friend', sels: ['.rl-addf', '.rail-btn'], title: 'Add friends', text: 'Find people by name or friend code, or tap + next to anyone in the Ranking. Friends can chat, duel and send each other wallpapers.' },
  { id: 'duel', sels: ['.rl-duels', '.nav .mt[href="#/duel"]', '.dd a[href="#/duel"]'], title: 'Duels', text: 'You and a rival answer the same 10 questions. Up to 10 a day; your first win each day takes a wallpaper from their collection.' },
];
let hintT = 0, hintEl = null, hintOn = null;
const hintClick = (e) => {
  for (const h of HINTS) if (!g()[h.id] && h.sels.some((s) => e.target.closest(s))) { g()[h.id] = Date.now(); save(true); if (hintOn === h) { hintEl.remove(); hintEl = null; hintOn = null; } document.querySelectorAll('.hint-target').forEach((x) => x.classList.remove('hint-target')); }
};
document.addEventListener('click', hintClick, true);
function hints() {
  if (hintT || !acct || !g().tour) return;
  hintT = setInterval(() => {
    const h = HINTS.find((x) => !g()[x.id]);
    if (!h || !acct) { clearInterval(hintT); hintT = 0; if (hintEl) hintEl.remove(); hintEl = null; return; }
    const inView = (x) => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 4; };
    const el = cur >= 0 || blocked() ? null : h.sels.map((s) => [...document.querySelectorAll(s)].find((x) => vis(x) && inView(x))).find(Boolean);
    if (!el) { if (hintEl) hintEl.classList.add('gone'); return; }
    if (!hintEl || hintOn !== h) { if (hintEl) hintEl.remove(); hintEl = document.createElement('div'); hintEl.className = 'hint'; hintEl.setAttribute('role', 'note'); hintEl.innerHTML = `<b>${h.title}</b><p>${h.text}</p><small>Tap the highlighted button to continue</small>`; document.body.appendChild(hintEl); hintOn = h; }
    hintEl.classList.remove('gone');
    document.querySelectorAll('.hint-target').forEach((x) => { if (x !== el) x.classList.remove('hint-target'); });
    el.classList.add('hint-target');
    const r = el.getBoundingClientRect(), w = Math.min(260, innerWidth - 24), hh = hintEl.offsetHeight || 110;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
    const up = r.top - hh - 14 > 8, top = up ? r.top - hh - 14 : r.bottom + 14;
    hintEl.style.cssText = `left:${left}px;top:${top}px;width:${w}px;--ax:${Math.round(r.left + r.width / 2 - left)}px`;
    hintEl.classList.toggle('down', !up);
  }, 400);
}
