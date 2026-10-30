// Hướng dẫn bắt buộc 1 lần cho mỗi tài khoản: đổi hình nền trong Collection, rồi đổi ảnh đại diện.
// Sau đó là 2 gợi ý (Add friends, Duels): không chặn màn hình, chỉ tắt khi người dùng bấm đúng nút đó.
// Lưu trong tiến trình (S.guide) nên đồng bộ theo tài khoản: làm xong một lần thì máy khác cũng không hiện lại.
import { S, save } from './store.js?v=40';
import { sfx } from './sound.js?v=40';
import { toast, esc } from './ui.js?v=40';
import { acct, call } from './account.js?v=40';
import * as walls from './walls.js?v=40';

let C = null;
export function init(ctx) { C = ctx; }

const g = () => { if (!S.guide || typeof S.guide !== 'object') S.guide = {}; return S.guide; };
const vis = (el) => { if (!el || !el.isConnected) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
const first = (sels) => { for (const s of sels) { const el = [...document.querySelectorAll(s)].find(vis); if (el) return el; } return null; };
const route = () => location.hash || '#/';
const blocked = () => !!document.querySelector('.player, .ovl, .gate, .qz-stage, .du-stage, .du-vs') || route().startsWith('#/play') || route().startsWith('#/host');

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
  if (!acct || !S.onboarded || g().tour || cur >= 0 || startT) { if (g().tour) { hints(); v23(); } return; }
  startT = setTimeout(function check() {
    startT = 0;
    if (!acct || g().tour || cur >= 0) return;
    if (blocked() || document.querySelector('.sheet, .gate, .chat-dock:not(.inline)')) { startT = setTimeout(check, 2000); return; }
    cur = route().startsWith('#/collection') ? 1 : 0; miss = 0; flags.bg = false; flags.av = false;
    document.addEventListener('keydown', onKey, true); document.addEventListener('click', onClick, true); document.addEventListener('change', onChange, true);
    mount(); ui.root.classList.add('wait'); sfx('quest');
    tickT = setInterval(step, 220); step();
  }, 1800);
}
export const touring = () => cur >= 0;

/* ---------- gợi ý Add friends / Duels ---------- */
const HINTS = [
  { id: 'friend', sels: ['.rl-addf', '.rl-t[data-t="friends"]', '.tb-friends', '.rail-btn'], title: 'Add friends', text: 'Find people by name or friend code, or tap + next to anyone in the Ranking. Friends can chat, duel and send each other wallpapers.' },
  { id: 'duel', sels: ['.rl-duels', '.nav .mt[href="#/duel"]', '.dd a[href="#/duel"]'], title: 'Duels', text: 'You and a rival answer the same 10 questions. Your first 10 sent and 10 received duels a day score XP; your first win each day gives a lucky spin ticket.' },
];
let hintT = 0, hintEl = null, hintOn = null;
const hintClick = (e) => {
  for (const h of HINTS) if (!g()[h.id] && h.sels.some((s) => e.target.closest(s))) { g()[h.id] = Date.now(); save(true); if (hintOn === h) { hintEl.remove(); hintEl = null; hintOn = null; } document.querySelectorAll('.hint-target').forEach((x) => x.classList.remove('hint-target')); }
};
document.addEventListener('click', hintClick, true);
function hints() {
  if (hintT || !acct || !g().tour || coach || G.on) return;
  hintT = setInterval(() => {
    const h = HINTS.find((x) => !g()[x.id]);
    if (!h || !acct) { clearInterval(hintT); hintT = 0; if (hintEl) hintEl.remove(); hintEl = null; return; }
    const inView = (x) => { const r = x.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 4; };
    const el = cur >= 0 || coach || G.on || blocked() ? null : h.sels.map((s) => [...document.querySelectorAll(s)].find((x) => vis(x) && inView(x))).find(Boolean);
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

/* ---------- v23: hướng dẫn lần đầu sau cập nhật (Lucky spin → Bạn bè / Bestie) ----------
   Không chặn màn hình: vùng sáng + bong bóng có nút "Đưa tôi tới" và "Bỏ qua". Lưu vào S.guide nên chỉ hiện một lần. */
let coach = null;
const friendsN = () => { try { return (C && C.friends ? C.friends() : []).filter((f) => f.status === 'accepted').length; } catch (e) { return 0; } };
const TOURS = {
  gacha: () => [
    { title: 'You have a free lucky spin!', text: 'Chests now give spin tickets instead of fixed wallpapers. Everyone got 1 free ticket. Your tickets live in Collection.',
      el: () => first(['.hud .tk-chip', '.col-gp .gp-go', '.side .col-mini .cm-go', '.nav .mt[href="#/collection"]', '.tabbar a[href="#/collection"]']), go: '#/collection', done: () => route().startsWith('#/collection') && !!document.querySelector('.col-gp .gp-go') },
    { title: 'Spin it', text: 'Tap “Spin now”. The strip stops on a random wallpaper; rarer ones are less likely. A duplicate becomes XP.',
      el: () => first(['.col-gp .gp-go']), go: '#/collection', click: true, done: () => !!document.querySelector('.gs') || (C && C.tickets && C.tickets() === 0 && !!document.querySelector('.col-gp')) },
  ],
  bestie: () => friendsN() ? [
    { title: 'Pick a Bestie', text: 'Choose one friend as your Bestie: shared wallpapers, +10% XP on days you both study, duel passes, effects and Bestie Adventure.',
      el: () => first(['[data-bst]']), go: '#/bestie', done: () => /^#\/(friends|bestie)/.test(route()) && !!document.querySelector('[data-bst]') },
    { title: 'Your Bestie panel', text: 'Tap “Make Bestie” next to a friend. They get a request; once they accept you are Besties. You can change effects, slogan and sharing here later, or remove your Bestie.',
      el: () => first(['[data-bst]']), go: '#/bestie', done: () => false, last: true },
  ] : [
    { title: 'Start with a friend', text: 'A Bestie is picked from your friends, and you have none yet. Open Friends to add someone.',
      el: () => first(['.rl-addf', '.nav .mt[href="#/friends"]', '.dd a[href="#/friends"]', '.tabbar a[href="#/friends"]']), go: '#/friends', done: () => route().startsWith('#/friends') && !!document.querySelector('.addf') },
    { title: 'Add a friend here', text: 'Type their account name or friend code and send a request, or share your own code. You can also right-click (or tap) anyone in the Ranking › Add friend. When they accept, come back to Friends to make them your Bestie.',
      el: () => first(['.addf']), go: '#/friends', done: () => false, last: true },
  ],
};
function coachUI() {
  if (coach && coach.root) return coach.root;
  const root = document.createElement('div'); root.className = 'coach';
  root.innerHTML = '<div class="co-ring"></div><div class="co-tip" role="dialog" aria-live="polite"><small class="co-k"></small><b class="co-t"></b><p class="co-p"></p><div class="co-b"><button type="button" class="btn ghost sm co-skip">Skip</button><button type="button" class="btn acc sm co-go"></button></div></div>';
  document.body.appendChild(root);
  root.querySelector('.co-skip').addEventListener('click', () => endCoach(true));
  root.querySelector('.co-go').addEventListener('click', () => { const st = coach && coach.steps[coach.i]; if (!st) return; sfx('tap'); if (st.last) { endCoach(false); return; } if (!route().startsWith(st.go)) location.hash = st.go; else { const el = st.el(); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (st.click) el.click(); } } });
  coach.root = root; return root;
}
function endCoach(skipped) {
  if (!coach) return; const k = coach.kind;
  clearInterval(coach.t); if (coach.root) coach.root.remove(); coach = null;
  g()['v23_' + k] = Date.now(); save(true);
  if (!skipped) sfx('levelup');
  if (k === 'gacha' && !g().v23_bestie) setTimeout(() => startTour('bestie'), 1500);
}
function coachTick() {
  if (!coach) return; const st = coach.steps[coach.i]; if (!st) { endCoach(false); return; }
  if (st.done()) { coach.i++; coach.seen = 0; sfx('ok'); if (coach.i >= coach.steps.length) { endCoach(false); return; } return; }
  const root = coachUI(), el = blocked() ? null : st.el(), ring = root.querySelector('.co-ring'), tip = root.querySelector('.co-tip');
  root.querySelector('.co-k').textContent = `${coach.kind === 'gacha' ? 'Lucky spin' : 'Bestie'} · step ${coach.i + 1} of ${coach.steps.length}`;
  root.querySelector('.co-t').textContent = st.title; root.querySelector('.co-p').textContent = st.text;
  const go = root.querySelector('.co-go'); go.textContent = st.last ? 'Got it' : route().startsWith(st.go) ? 'Show me' : 'Take me there';
  root.classList.toggle('hide', !!document.querySelector('.gs, .player, .qz-stage, .du-stage, .adv-stage'));
  if (el && vis(el)) {
    coach.seen = (coach.seen || 0) + 1;
    const r = el.getBoundingClientRect(), pad = 6;
    ring.style.cssText = `display:block;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
    const tw = Math.min(330, innerWidth - 24), th = tip.offsetHeight || 150;
    let tx = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), innerWidth - tw - 12), ty = r.bottom + 14;
    if (ty + th > innerHeight - 8) ty = r.top - th - 14; if (ty < 8) { ty = innerHeight - th - 16; }
    tip.style.cssText = `left:${tx}px;top:${ty}px;width:${tw}px`;
  } else {
    ring.style.display = 'none';
    const tw = Math.min(330, innerWidth - 24); tip.style.cssText = `left:${innerWidth - tw - 16}px;top:${innerHeight - (tip.offsetHeight || 150) - 16}px;width:${tw}px`;
  }
}
// kind: 'gacha' | 'bestie'; force = true khi người dùng tự bấm (vd. từ bảng "What's new")
export function startTour(kind, force) {
  if (!acct || !TOURS[kind]) return;
  if (kind === 'gacha' && G.gift && !g().gift1) { giftTour(G.gift); return; }
  if (G.on) return;
  if (!force && g()['v23_' + kind]) return;
  if (cur >= 0) return;
  if (coach) { if (coach.kind === kind) return; clearInterval(coach.t); if (coach.root) coach.root.remove(); coach = null; }
  if (hintEl) { hintEl.remove(); hintEl = null; hintOn = null; }
  coach = { kind, steps: TOURS[kind](), i: 0, t: 0, root: null, seen: 0 };
  coach.t = setInterval(coachTick, 300); coachTick();
}
// tự chạy một lần sau cập nhật, khi không có bảng nào đang mở
let v23T = 0;
function v23() {
  if (v23T || coach || !acct) return;
  v23T = setTimeout(function chk() {
    v23T = 0; if (!acct || coach || cur >= 0) return;
    if (g().v23_gacha && g().v23_bestie) return;
    if (!g().gift1 || G.on) { v23T = setTimeout(chk, 6000); return; }
    const newsOk = (() => { try { return localStorage.getItem('dcl_news_23') === '1'; } catch (e) { return true; } })();
    if (!newsOk || blocked() || document.querySelector('.sheet, .ovl, .gs, .bmiss')) { v23T = setTimeout(chk, 4000); return; }
    startTour(g().v23_gacha ? 'bestie' : 'gacha');
  }, 3500);
}

/* ---------- v23: quà cho mọi người (1 vé quay + 1 hình rare) — hướng dẫn BẮT BUỘC nhận và quay vé ----------
   Che cả màn hình, chỉ bấm được vào vùng sáng; không có nút bỏ qua. Xong thì báo máy chủ (learn_gift_seen). */
const G = { gift: null, on: false, i: 0, t: 0, ui: null, miss: 0, startT: 0 };
const vis2 = (el) => vis(el) && (() => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })();
const pick = (sels) => { for (const s of sels) { const el = [...document.querySelectorAll(s)].find(vis); if (el) return el; } return null; };
const tk = () => { try { return C && C.tickets ? C.tickets() : 1; } catch (e) { return 1; } };
function giftSteps(gift) {
  const wid = gift.wall, wname = wid ? (walls.wallOf(wid) || {}).name || 'a rare wallpaper' : '';
  return [
    { id: 'intro', center: true, k: 'A gift for you', title: 'Free lucky spin + a rare wallpaper', btn: 'Claim my gifts',
      html: () => `<div class="gt-gifts">${wid ? `<div class="gt-w">${walls.card(wid, { state: 'got', cls: 'mini' })}<small>Rare wallpaper<br><b>${esc(wname)}</b></small></div>` : ''}<div class="gt-t"><span>🎟️</span><small>1 free<br><b>lucky spin</b></small></div></div><p>Everyone gets these. Follow the steps to open your ticket and spin it. It takes 20 seconds.</p>` },
    { id: 'chip', k: 'Step 1 of 4', title: 'Open your ticket', text: 'Your spin tickets live here. Tap it to open the Lucky spin.',
      el: () => pick(['.hud .tk-chip.has', '.tk-chip.has', '.col-gp .gp-go', '.hud .tk-chip', '.tk-chip']), done: () => !!document.querySelector('.gs'), skip: () => tk() === 0 && !document.querySelector('.gs'), go: '#/collection' },
    { id: 'spin', k: 'Step 2 of 4', title: 'Spinning…', text: 'The strip stops on a random wallpaper. Rarer ones are less likely, and a duplicate turns into XP.',
      el: () => pick(['.gs-go:not([disabled])']), done: () => !document.querySelector('.gs') || !!document.querySelector('.gs-close:not([disabled])'), bottom: true },
    { id: 'close', k: 'Step 3 of 4', title: 'Your prize is saved', text: 'It is already in your collection. Tap Close.',
      el: () => pick(['.gs-close:not([disabled])']), done: () => !document.querySelector('.gs') },
    { id: 'col', k: 'Step 4 of 4', title: 'Open Collection', text: 'Your rare gift and your new prize are in Collection.',
      el: () => pick(['.nav .mt[href="#/collection"]', '.tabbar a[href="#/collection"]', '.side .col-mini .cm-go']), done: () => route().startsWith('#/collection') && !!document.querySelector('.col-body'), go: '#/collection' },
    { id: 'see', k: 'All done', title: wid ? `${wname} is yours` : 'All done!', text: 'Tap any wallpaper you own and choose “Use as background” to put it behind your lessons. Chests, duels, quizzes and weekly rankings give more tickets.', btn: 'Finish', last: true,
      el: () => (wid ? [...document.querySelectorAll(`.col-body .wcard[data-w="${wid}"]`)].find(vis) : null) || pick(['.col-gp']) },
  ];
}
function gMount() {
  if (G.ui) return G.ui;
  const root = document.createElement('div'); root.className = 'tour gtour';
  root.innerHTML = `<div class="tr-b t"></div><div class="tr-b r"></div><div class="tr-b b"></div><div class="tr-b l"></div><div class="tr-ring"></div><div class="tr-tip gt-tip" role="dialog" aria-live="polite"><small class="tr-k"></small><b class="tr-t"></b><div class="gt-body"></div><div class="gt-b"><button type="button" class="btn acc sm gt-go"></button></div></div>`;
  document.body.appendChild(root);
  ['pointerdown', 'click'].forEach((t) => root.querySelectorAll('.tr-b').forEach((b) => b.addEventListener(t, (e) => { e.stopPropagation(); e.preventDefault(); if (t === 'click') { const tip = root.querySelector('.tr-tip'); tip.classList.remove('shake'); void tip.offsetWidth; tip.classList.add('shake'); sfx('bad'); } })));
  root.querySelector('.gt-go').addEventListener('click', () => { const st = G.steps[G.i]; if (!st) return; sfx('tap'); if (st.btn) { if (st.last) return gFinish(); G.i++; G.drawn = ''; gTick(); return; } if (st.go && !route().startsWith(st.go)) { document.getElementById('sheet-root').innerHTML = ''; location.hash = st.go; } else { const el = st.el && st.el(); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } });
  G.ui = { root, ring: root.querySelector('.tr-ring'), tip: root.querySelector('.tr-tip'), bl: [...root.querySelectorAll('.tr-b')] };
  return G.ui;
}
function gPlace(r) {
  const u = G.ui, [t, rt, b, l] = u.bl;
  if (!r) { t.style.cssText = 'left:0;top:0;width:100%;height:100%'; [rt, b, l].forEach((x) => { x.style.cssText = 'display:none'; }); u.ring.style.cssText = 'display:none'; return; }
  const pad = 6, x = Math.max(0, r.left - pad), y = Math.max(0, r.top - pad), w = Math.min(innerWidth, r.right + pad) - x, h = Math.min(innerHeight, r.bottom + pad) - y;
  t.style.cssText = `left:0;top:0;width:100%;height:${y}px`;
  b.style.cssText = `left:0;top:${y + h}px;width:100%;height:${Math.max(0, innerHeight - y - h)}px`;
  l.style.cssText = `left:0;top:${y}px;width:${x}px;height:${h}px`;
  rt.style.cssText = `left:${x + w}px;top:${y}px;width:${Math.max(0, innerWidth - x - w)}px;height:${h}px`;
  u.ring.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
}
function gTick() {
  const st = G.steps[G.i]; if (!st) return gFinish();
  if (st.skip && st.skip()) { G.i = G.steps.findIndex((x) => x.id === 'col'); G.drawn = ''; return; }
  if (st.done && st.done()) { G.i++; G.miss = 0; G.drawn = ''; sfx('ok'); return; }
  const u = gMount(), tip = u.tip;
  if (G.drawn !== st.id) {
    G.drawn = st.id;
    tip.querySelector('.tr-k').textContent = st.k; tip.querySelector('.tr-t').textContent = st.title;
    tip.querySelector('.gt-body').innerHTML = st.html ? st.html() : `<p>${esc(st.text)}</p>`;
    const go = tip.querySelector('.gt-go'); go.textContent = st.btn || 'Show me'; go.hidden = !st.btn && !st.go;
    tip.classList.toggle('center', !!st.center);
  }
  const go = tip.querySelector('.gt-go');
  if (!st.btn) go.hidden = !st.go || route().startsWith(st.go);
  if (st.center) { gPlace(null); const tw = Math.min(380, innerWidth - 24); tip.style.cssText = `left:${(innerWidth - tw) / 2}px;top:${Math.max(16, (innerHeight - (tip.offsetHeight || 300)) / 2)}px;width:${tw}px`; return; }
  const el = st.el && st.el();
  if (el && vis(el)) {
    G.miss = 0;
    if (!vis2(el) || (el.getBoundingClientRect().top < 70 && !el.closest('.hud, .tabbar, .ovl'))) el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); gPlace(r);
    const tw = Math.min(330, innerWidth - 24), th = tip.offsetHeight || 140;
    let tx = Math.min(Math.max(12, r.left + r.width / 2 - tw / 2), innerWidth - tw - 12), ty = r.bottom + 16;
    if (st.bottom || ty + th > innerHeight - 8) ty = r.top - th - 16; if (ty < 8) ty = Math.min(innerHeight - th - 12, r.bottom + 16);
    tip.style.cssText = `left:${tx}px;top:${ty}px;width:${tw}px`;
  } else {
    gPlace(null); const tw = Math.min(330, innerWidth - 24);
    tip.style.cssText = `left:${(innerWidth - tw) / 2}px;top:${innerHeight - (tip.offsetHeight || 140) - 24}px;width:${tw}px`;
    // không thấy nút (vd. HUD bị ẩn trên trang này) → tự mở Collection, nơi luôn có nút Spin
    if (++G.miss > 12 && st.go && !route().startsWith(st.go)) { document.getElementById('sheet-root').innerHTML = ''; location.hash = st.go; G.miss = 0; }
  }
}
function gFinish() {
  clearInterval(G.t); G.t = 0; G.on = false; if (G.ui) { G.ui.root.remove(); G.ui = null; }
  g().gift1 = Date.now(); g().v23_gacha = g().v23_gacha || Date.now(); save(true);
  call('learn_gift_seen').catch(() => {});
  sfx('levelup'); toast('Enjoy your new wallpapers!');
  if (!g().v23_bestie) setTimeout(() => startTour('bestie'), 2500);
}
// gọi từ hub.poll (learn_me.gift). Chờ hướng dẫn đầu tiên (đổi nền + ảnh đại diện) và các bảng đang mở xong rồi mới chạy.
export function giftTour(gift) {
  if (!gift || !acct) return;
  G.gift = gift;
  if (gift.seen || g().gift1 || G.on || G.startT) return;
  G.startT = setTimeout(function chk() {
    G.startT = 0;
    if (!acct || g().gift1 || G.on) return;
    if (!S.onboarded || !g().tour || cur >= 0 || document.querySelector('.player, .qz-stage, .du-stage, .adv-stage, .du-vs, .gate, .sheet, .ovl') || route().startsWith('#/play') || route().startsWith('#/host')) { G.startT = setTimeout(chk, 2500); return; }
    if (coach) { clearInterval(coach.t); if (coach.root) coach.root.remove(); coach = null; }
    if (hintEl) { hintEl.remove(); hintEl = null; hintOn = null; }
    walls.loadCat().catch(() => {}).then(() => {
      G.on = true; G.i = 0; G.miss = 0; G.drawn = ''; G.steps = giftSteps(gift);
      sfx('quest'); gMount(); G.t = setInterval(gTick, 250); gTick();
    });
  }, 1500);
}
