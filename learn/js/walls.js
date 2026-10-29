// Kho hình nền: phần thưởng trong rương chủ đề và boss, bộ sưu tập, VIP, chia sẻ cho bạn bè, đặt làm nền trang.
// v23: rương không còn trao hình cố định mà trao VÉ QUAY (gacha.js). Bestie chia sẻ bộ sưu tập để dùng làm nền trang.
// Quy tắc: rương chủ đề 2★ = 1 hình, 3★ = 2 hình; boss 1★/2★/3★ = 1/2/3 hình. Mỗi khoá (English, 中文, IELTS) chứa đủ 70 hình,
// vị trí khác nhau giữa các khoá (xem learnbuild/walls.js). Máy chủ (learn_wall_claim) là nơi quyết định cuối cùng khi đã đăng nhập.
import { I } from './icons.js?v=29';
import { S, save, LN, unitProgress, unitStars } from './store.js?v=29';
import { acct, call, push } from './account.js?v=29';
import { sfx } from './sound.js?v=29';
import { esc, toast, sheet, overlay, burst, vipAv, avatar, floatText, confirmBox } from './ui.js?v=29';

let C = null; // ngữ cảnh từ app.js
export function init(ctx) { C = ctx; }
export let CAT = null;
const BYID = {};
export async function loadCat() {
  if (CAT) return CAT;
  const r = await fetch('data/walls.json?v=5'); CAT = await r.json();
  CAT.walls.forEach((w) => { BYID[w.id] = w; });
  ensureStarters();
  return CAT;
}
export const total = () => (CAT ? CAT.walls.length : 71);
// 3 hình mặc định ai cũng có (5, 41, 71) để đổi nền ngay từ đầu
export function ensureStarters() {
  if (!CAT) return; let ch = false;
  (CAT.starters || []).forEach((w, i) => { if (!S.walls[w]) { S.walls[w] = { at: i, src: 'starter' }; ch = true; } });
  if (ch) save();
}
export const wallOf = (id) => BYID[id] || { id, name: 'Wallpaper ' + id, rarity: 'common' };
export const owned = (id) => !!S.walls[id];
export const ownedCount = () => Object.keys(S.walls).length;
export const poster = (id) => `media/walls/${id}.jpg`;
export const video = (id) => `media/walls/${id}.mp4`;
const RAR = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const RORD = ['legendary', 'epic', 'rare', 'common'];
const pad = (n) => String(n).padStart(2, '0');
const COURSE_N = { en: 'English', zh: '中文', ielts: 'IELTS' };

/* ---------- sao của rương / boss ---------- */
export const chestStars = (uid) => { const s = unitStars(uid); return s >= 22 ? 3 : s >= 16 ? 2 : 1; };
export const bossStarsOf = (acc) => (acc >= 0.95 ? 3 : acc >= 0.88 ? 2 : acc >= 0.8 ? 1 : 0);
const isBoss = (slot) => slot.startsWith('boss|');
const langOf = (slot) => (isBoss(slot) ? slot.split('|')[1] : slot.split('-')[0]);
const nWalls = (slot, st) => (isBoss(slot) ? st : st >= 3 ? 2 : st >= 2 ? 1 : 0);
const needFor = (slot, i) => (isBoss(slot) ? i + 1 : i + 2); // số sao cần cho ô thứ i
export const slotWalls = (slot) => (CAT && CAT.slots[langOf(slot)] && CAT.slots[langOf(slot)][slot]) || [];
// trạng thái từng ô trong một rương: got (đã có), missed (đã mở rương nhưng thiếu sao), locked (chưa tới)
export function slotView(slot, reached) {
  const claimed = S.wclaims[slot] || 0;
  return slotWalls(slot).map((w, i) => {
    const need = needFor(slot, i), mine = claimed >= need;
    return { w, need, state: mine ? 'got' : reached ? 'missed' : 'locked', have: owned(w) };
  });
}
// v23: các ô VÉ trong một rương (chủ đề 2 vé: 2★, 3★; boss 3 vé: 1★, 2★, 3★)
export function ticketView(slot, reached) {
  const claimed = S.wclaims[slot] || 0, n = isBoss(slot) ? 3 : 2;
  return Array.from({ length: n }, (_, i) => { const need = needFor(slot, i); return { need, state: claimed >= need ? 'got' : reached ? 'missed' : 'locked' }; });
}
export const ticketCard = (t, label = '') => `<span class="tkc s-${t.state}" title="${t.state === 'got' ? 'Ticket collected' : `Needs a ${t.need}★ chest`}"><i>${I.gift}</i><b>${t.state === 'got' ? 'Ticket' : label || t.need + '★'}</b>${t.state === 'got' ? `<em>${I.check}</em>` : ''}</span>`;
export const ticketsLeftIn = (slot, reached) => ticketView(slot, reached).filter((t) => t.state !== 'got').length;
// có thể nhận thêm không (sao hiện tại > sao đã nhận)
export const canUpgrade = (slot, stars) => stars > (S.wclaims[slot] || 0) && nWalls(slot, stars) > nWalls(slot, S.wclaims[slot] || 0);

/* ---------- v23: mở rương → vé quay (2★ = 1 vé, 3★ = 2 vé; boss 1★/2★/3★ = 1/2/3 vé) ---------- */
// lưu sao đã nhận trên máy ngay; đã đăng nhập thì gửi tiến trình lên rồi nhận vé từ máy chủ (máy chủ kiểm tra sao thật)
export const ticketsFor = (slot, stars) => nWalls(slot, stars);
export function claim(slot, stars) {
  const prev = S.wclaims[slot] || 0;
  const out = { slot, stars: Math.max(prev, stars), prev, tickets: Math.max(0, ticketsFor(slot, stars) - ticketsFor(slot, prev)), fresh: [], dup: [] };
  if (stars <= prev) { out.server = Promise.resolve(null); return out; }
  S.wclaims[slot] = stars; save(true);
  out.server = acct ? (async () => { try { await push(); const j = await call('learn_wall_claim', { p_slot: slot, p_stars: stars }); return j; } catch (e) { return null; } })() : Promise.resolve(null);
  return out;
}
// thêm hình vào bộ sưu tập trên máy (sau khi quay ra hình mới)
export function addLocal(id, src) { if (!S.walls[id]) { S.walls[id] = { at: Date.now(), src }; save(true); } }

/* ---------- đồng bộ với máy chủ ---------- */
export const vipState = { vip: 0, pts: 0, bonus: 0, penalty: 0, share: null, server: false, tickets: 0 };
let syncing = null;
export function syncWalls() {
  if (!acct) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      await loadCat();
      let j = await call('learn_walls_mine'); if (!j || !j.ok) return;
      // gửi các rương đã mở trên máy này mà máy chủ chưa biết (ví dụ: học khi chưa đăng nhập)
      const todo = Object.entries(S.wclaims).filter(([k, v]) => v > ((j.claims || {})[k] || 0) && slotWalls(k).length).slice(0, 60);
      for (const [k, v] of todo) { try { await call('learn_wall_claim', { p_slot: k, p_stars: v }); } catch (e) { break; } }
      // hình đổi bằng XP khi chưa đăng nhập
      const srv = new Set((j.walls || []).map((x) => x.w));
      const buys = Object.entries(S.walls).filter(([w, x]) => !srv.has(+w) && /^xp:/.test(x.src || '')).slice(0, 20);
      for (const [w] of buys) { try { await push(); await call('learn_wall_buy', { p_wall: +w }); } catch (e) { break; } }
      if (todo.length || buys.length) j = await call('learn_walls_mine');
      (j.walls || []).forEach((x) => { if (!S.walls[x.w]) S.walls[x.w] = { at: new Date(x.at).getTime(), src: x.src }; else S.walls[x.w].src = x.src; });
      Object.entries(j.claims || {}).forEach(([k, v]) => { if ((S.wclaims[k] || 0) < v) S.wclaims[k] = v; });
      ensureStarters();
      Object.assign(vipState, { vip: j.vip || 0, pts: j.vip_pts || 0, bonus: j.bonus || 0, penalty: j.penalty || 0, share: j.share, server: true, tickets: j.tickets || 0 });
      save();
    } catch (e) { /* bỏ qua, thử lại lần sau */ } finally { syncing = null; }
  })();
  return syncing;
}

/* ---------- VIP: điểm từ chủ đề đã học xong (EN 600, 中文 1000, IELTS 1000, đạt tối đa khi xong số chủ đề mốc trong CAT.units) + điểm thưởng (tối đa 150) ---------- */
export const VIP_T = [20, 60, 120, 200, 300, 420, 560, 720, 860, 1000];
export const vipLevel = (p) => VIP_T.filter((t) => t <= p).length;
export function unitsFull() {
  const u = { en: 0, zh: 0, ielts: 0 };
  for (const [k, a] of Object.entries(S.done)) if (Array.isArray(a) && a.length >= LN && a.every((x) => x === 1 || x === true)) { const l = k.split('-')[0]; if (l in u) u[l]++; }
  return u;
}
export function vipPoints(bonus = vipState.bonus) {
  if (!CAT) return vipState.pts || 0;
  const u = unitsFull(), U = CAT.units;
  // v23: điểm bị trừ do thu hồi (vipState.penalty, từ máy chủ) được trừ vào phần điểm của các chủ đề
  return Math.max(0, Math.round(600 * Math.min(u.en, U.en) / U.en) + Math.round(1000 * Math.min(u.zh, U.zh) / U.zh) + Math.round(1000 * Math.min(u.ielts, U.ielts) / U.ielts) - (vipState.penalty || 0)) + Math.min(150, Math.max(0, bonus || 0));
}
// đã đăng nhập: máy chủ là nơi quyết định cấp VIP; khách: tính trên máy
export const myVip = () => (vipState.server ? vipState.vip || 0 : vipLevel(vipPoints()));
export const unitPts = () => (CAT ? { en: 600 / CAT.units.en, zh: 1000 / CAT.units.zh, ielts: 1000 / CAT.units.ielts } : { en: 10, zh: 16, ielts: 19 });
const VIP_STYLE = ['', 'Ember ring', 'Ember ring', 'Silver spin', 'Silver spin', 'Golden halo', 'Golden halo', 'Arcane twin rings', 'Arcane twin rings', 'Phoenix flame', 'Prism crown'];
// chúc mừng khi lên VIP
export function checkVip() {
  if (!CAT) return;
  const v = myVip();
  if (v <= (S.vipSeen || 0)) return;
  const from = S.vipSeen || 0; S.vipSeen = v; save(true);
  const name = acct ? acct.name : 'You';
  sfx('levelup');
  const o = overlay(`<div class="rw vipup v${v}">
    <div class="vip-stage"><span class="vip-burst"></span>${vipAv(name, acct && acct.avatar, v, 'xl')}</div>
    <small class="vip-k">${from ? `VIP ${from} → VIP ${v}` : 'New rank'}</small>
    <h2>VIP ${v}</h2>
    <p class="vip-style">${esc(VIP_STYLE[v])}</p>
    <ul class="vip-perks"><li>${I.gift}<span>Share up to <b>${v}</b> wallpaper${v > 1 ? 's' : ''} with friends at this rank: one per friend, one per day.</span></li><li>${I.sparkle}<span>Your avatar ring changes for everyone: friends list, duels, live quizzes.</span></li>${v < 10 ? `<li>${I.target}<span>Next: VIP ${v + 1} at ${VIP_T[v]} points.</span></li>` : `<li>${I.crown}<span>Top rank. Nothing left above you.</span></li>`}</ul>
    <button class="btn acc ovl-ok" type="button">Wear it</button></div>`, null, 'reward vip-ovl');
  setTimeout(() => { const r = o.el.querySelector('.vav'); if (r) { const b = r.getBoundingClientRect(); burst(b.left + b.width / 2, b.top + b.height / 2, 30 + v * 4); } }, 650);
}

/* ---------- thẻ hình nền (kiểu thẻ sưu tập Steam: viền theo độ hiếm, lớp foil, nghiêng theo chuột) ---------- */
export function card(id, o = {}) {
  const w = wallOf(id), st = o.state || (owned(id) ? 'got' : 'locked');
  const tag = o.tag ? `<span class="wc-tag">${o.tag}</span>` : '';
  return `<button class="wcard r-${w.rarity} s-${st} ${o.cls || ''}" type="button" data-w="${id}" ${o.style ? `style="${o.style}"` : ''} aria-label="${esc(w.name)}, ${RAR[w.rarity]}${st === 'got' ? '' : ', not collected'}">
    <span class="wc-in"><span class="wc-media"><img src="${poster(id)}" alt="" loading="lazy" decoding="async"></span><span class="wc-foil"></span><span class="wc-glare"></span>
    ${st !== 'got' ? `<span class="wc-lock">${I.lock}${o.lockText ? `<small>${o.lockText}</small>` : ''}</span>` : ''}${o.starter ? '<span class="wc-tag st">Starter</span>' : ''}
    <span class="wc-cap"><b>${st === 'locked' && o.hideName ? '???' : esc(w.name)}</b><small><i class="rd"></i>${RAR[w.rarity]} · #${pad(id)}</small></span>${tag}</span></button>`;
}
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
// nghiêng 3D theo chuột; video tự phát khi thẻ hiện trên màn hình (giống bộ sưu tập ở desktopchill.com), dừng khi cuộn qua
let io = null;
const watched = new Set();
const vidOf = (c) => {
  let v = c.querySelector('video');
  if (!v) { v = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'none'; v.src = video(c.dataset.w); c.querySelector('.wc-media').appendChild(v); v.addEventListener('playing', () => v.classList.add('on')); }
  return v;
};
const playC = (c) => { const p = vidOf(c).play(); if (p && p.catch) p.catch(() => {}); };
const stopC = (c) => { const v = c.querySelector('video'); if (v) v.pause(); };
export function wireCards(root, onOpen, o = {}) {
  const auto = o.play !== false && !matchMedia('(prefers-reduced-motion: reduce)').matches && !(navigator.connection && navigator.connection.saveData);
  if (auto && !io && 'IntersectionObserver' in window) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) playC(e.target); else stopC(e.target); }), { rootMargin: '80px', threshold: 0.2 });
  if (io) watched.forEach((c) => { if (!c.isConnected) { io.unobserve(c); watched.delete(c); } });
  root.querySelectorAll('.wcard').forEach((c) => {
    if (onOpen) c.addEventListener('click', () => onOpen(+c.dataset.w, c));
    if (auto && io && !c.classList.contains('tiny') && c.dataset.w !== '0') { io.observe(c); watched.add(c); }
    if (!fine) return;
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      c.style.setProperty('--ry', ((px - 0.5) * 14).toFixed(2) + 'deg'); c.style.setProperty('--rx', ((0.5 - py) * 14).toFixed(2) + 'deg');
      c.style.setProperty('--mx', (px * 100).toFixed(1) + '%'); c.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    });
    if (!auto || c.classList.contains('tiny')) { c.addEventListener('pointerenter', () => { if (c.dataset.w !== '0') playC(c); }); c.addEventListener('pointerleave', () => stopC(c)); }
    c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
  });
}

/* ---------- rương 3D (CSS) ---------- */
const faces = (cls) => ['front', 'back', 'left', 'right', cls].map((f) => `<i class="f ${f}"></i>`).join('');
export const chest3D = (tier = 'wood') => `<div class="c3d t-${tier}" aria-hidden="true"><div class="c3-shadow"></div><div class="c3-rot"><div class="c3-box">${faces('bottom')}</div><div class="c3-lid">${faces('top')}</div><div class="c3-light"></div></div><div class="c3-beams"></div></div>`;

/* ---------- v23: mở rương → vé quay; quay ngay hoặc để dành trong kho ---------- */
// o: { slot, res (kết quả claim), title, kicker, xp, xpNote, onClose }
export function reveal(o) {
  const slot = o.slot, boss = isBoss(slot), claimed = S.wclaims[slot] || 0, tv = ticketView(slot, true), got = o.res.tickets || 0;
  const tier = boss ? 'boss' : claimed >= 3 ? 'gold' : claimed >= 2 ? 'silver' : 'wood';
  const nGot = tv.filter((x) => x.state === 'got').length;
  const cards = tv.map((t, i) => { const fresh = t.state === 'got' && i >= nGot - got; return `<span class="rv-tk ${fresh ? 'is-new' : ''} s-${t.state}" style="--d:${0.9 + i * 0.3}s">${ticketCard(t)}${fresh ? '<small>New</small>' : t.state === 'got' ? '<small>Collected</small>' : `<small>Needs ${t.need}★</small>`}</span>`; }).join('');
  const missed = tv.filter((t) => t.state !== 'got').length;
  const hint = missed > 0 ? (boss ? `Score ${claimed >= 2 ? '95%' : claimed >= 1 ? '88%' : '80%'} or more on the boss for ${missed > 1 ? 'more tickets' : 'the last ticket'}.` : `Get ${claimed >= 2 ? 22 : 16} or more stars in this unit (replay lessons below 3★) and the chest gives ${missed > 1 ? 'more tickets' : 'one more ticket'}.`) : 'Every ticket in this chest is yours.';
  sfx('chest');
  const ov = overlay(`<div class="rv-wrap ${boss ? 'boss' : ''}">
    <div class="rv-chest">${chest3D(tier)}</div>
    <div class="rv-head"><small>${esc(o.kicker || (boss ? 'Boss chest' : 'Unit chest'))}</small><h2>${esc(o.title)}</h2><p class="rv-stars">${[1, 2, 3].map((i) => `<i class="${i <= claimed ? 'on' : ''}">${I.star}</i>`).join('')}</p></div>
    <div class="rv-tks">${cards}</div>
    <p class="rv-gain">${got ? `<b>+${got} lucky spin ticket${got > 1 ? 's' : ''}</b>` : 'No new tickets this time'}</p>
    <p class="rv-hint ${missed ? 'miss' : ''}">${esc(hint)}</p>
    ${o.xp ? `<p class="rv-xp">+${o.xp} XP${o.xpNote ? ` <small>${esc(o.xpNote)}</small>` : ''}</p>` : ''}
    <div class="rv-act">${got && acct ? `<button class="btn ghost rv-keep" type="button">Keep in inventory</button><button class="btn gold rv-spin" type="button">${I.zap} Spin now</button>` : got && !acct ? `<button class="btn ghost rv-keep" type="button">Later</button><button class="btn acc rv-acct" type="button">Create an account to spin</button>` : '<button class="btn acc rv-keep" type="button">Continue</button>'}</div></div>`, null, 'reward rv-ovl');
  const el = ov.el;
  setTimeout(() => el.querySelector('.c3d').classList.add('open'), 420);
  setTimeout(() => { const c = el.querySelector('.c3d').getBoundingClientRect(); burst(c.left + c.width / 2, c.top + c.height * 0.4, 30); sfx('star'); }, 760);
  el.querySelectorAll('.rv-tk').forEach((c, i) => setTimeout(() => sfx(c.classList.contains('s-got') ? 'pop' : 'bad'), 1000 + i * 300));
  let done = false;
  const finish = (then) => { if (done) return; done = true; ov.close(); if (o.onClose) setTimeout(o.onClose, 50); if (then) setTimeout(then, 300); };
  if (o.res.server) o.res.server.then((j) => { if (j && j.ok && C.setTickets) C.setTickets(j.left); });
  const keep = el.querySelector('.rv-keep'); if (keep) keep.addEventListener('click', (e) => { e.stopPropagation(); finish(); if (got && acct) toast(`Saved ${got} ticket${got > 1 ? 's' : ''} in your inventory (Collection › Lucky spin)`); });
  const sp = el.querySelector('.rv-spin'); if (sp) sp.addEventListener('click', async (e) => { e.stopPropagation(); sp.disabled = true; await o.res.server; finish(() => C.spin && C.spin()); });
  const ac = el.querySelector('.rv-acct'); if (ac) ac.addEventListener('click', (e) => { e.stopPropagation(); finish(() => C.authSheet('new')); });
  el.addEventListener('click', (e) => { if (e.target === el) e.stopPropagation(); }, true);
}
// đích bay tới: mục Collection trên menu (máy tính) hoặc thanh dưới (điện thoại)
function target() {
  const sels = ['.nav a[href="#/collection"]', '.tabbar a[href="#/collection"]', '.hud-me', '.hud-show'];
  for (const s of sels) { const t = document.querySelector(s); if (t && t.offsetParent !== null) { const r = t.getBoundingClientRect(); if (r.width) return { el: t, r }; } }
  return { el: null, r: { left: innerWidth / 2, top: 20, width: 0, height: 0 } };
}
// v22: quà duel hiện giữa màn hình rồi thu nhỏ bay vào Collection (hình nền) hoặc ô XP
function xpTarget() {
  for (const s of ['.chipx.gem', '.hud-me', '.tabbar a[href="#/collection"]']) { const t = document.querySelector(s); if (t && t.offsetParent !== null) { const r = t.getBoundingClientRect(); if (r.width) return { el: t, r }; } }
  return { el: null, r: { left: innerWidth - 40, top: 20, width: 0, height: 0 } };
}
function tkTarget() {
  for (const s of ['.tk-chip', '.nav a[href="#/collection"]', '.hud-me', '.tabbar a[href="#/collection"]']) { const t = document.querySelector(s); if (t && t.offsetParent !== null) { const r = t.getBoundingClientRect(); if (r.width) return { el: t, r }; } }
  return { el: null, r: { left: innerWidth - 40, top: 20, width: 0, height: 0 } };
}
export function prizePop({ wall = 0, xp = 0, ticket = false, kicker = 'Duel prize', title = '', sub = '', onDone = null } = {}) {
  document.querySelectorAll('.pp').forEach((x) => x.remove());
  const el = document.createElement('div'); el.className = 'pp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', kicker);
  el.innerHTML = `<div class="pp-in"><small class="pp-k">${I.gift} ${esc(kicker)}</small>
    <div class="pp-item">${ticket ? `<span class="pp-tk">${I.gift}<b>1</b><small>spin ticket</small></span>` : wall ? card(wall, { state: 'got', cls: 'pp-card' }) : `<span class="pp-xp">${I.gem}<b>+${xp}</b><small>XP</small></span>`}</div>
    <h2>${esc(title || (ticket ? 'Lucky spin ticket' : wall ? wallOf(wall).name : `+${xp} XP`))}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}<small class="pp-tap">Tap to collect</small></div>`;
  document.body.appendChild(el);
  sfx('levelup'); requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => { const r = el.querySelector('.pp-item').getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 40); }, 350);
  let gone = false;
  const go = () => {
    if (gone) return; gone = true; clearTimeout(tid);
    const item = el.querySelector('.pp-item > *'); el.classList.add('fly');
    const done = () => { el.remove(); if (onDone) onDone(); };
    if (!item || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); toast(ticket ? '+1 lucky spin ticket' : wall ? `${wallOf(wall).name} added to your collection` : `+${xp} XP`); return; }
    if (wall) { flyToCollection([item]); item.style.visibility = 'hidden'; setTimeout(done, 950); return; }
    const t = ticket ? tkTarget() : xpTarget(), r = item.getBoundingClientRect(), f = item.cloneNode(true);
    f.classList.add('pp-flying'); f.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`; document.body.appendChild(f); item.style.visibility = 'hidden';
    const dx = t.r.left + t.r.width / 2 - (r.left + r.width / 2), dy = t.r.top + t.r.height / 2 - (r.top + r.height / 2);
    const a = f.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 60}px) scale(.7)`, opacity: 1, offset: 0.4 }, { transform: `translate(${dx}px, ${dy}px) scale(.12)`, opacity: 0.3 }], { duration: 850, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
    a.onfinish = () => { f.remove(); sfx('tile'); if (t.el) { t.el.classList.remove('catch'); void t.el.offsetWidth; t.el.classList.add('catch'); floatText(t.el, ticket ? '+1' : `+${xp}`); setTimeout(() => t.el.classList.remove('catch'), 700); } burst(t.r.left + t.r.width / 2, t.r.top + t.r.height / 2, 16); };
    setTimeout(done, 300);
  };
  const tid = setTimeout(go, 2200);
  el.addEventListener('click', go);
}
export function flyToCollection(cards) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { toast(`${cards.length} new wallpaper${cards.length > 1 ? 's' : ''} in your collection`); return; }
  const t = target(), tx = t.r.left + t.r.width / 2, ty = t.r.top + t.r.height / 2;
  cards.forEach((c, i) => {
    const r = c.getBoundingClientRect(), f = c.cloneNode(true);
    f.classList.add('wc-fly'); f.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    document.body.appendChild(f);
    const dx = tx - (r.left + r.width / 2), dy = ty - (r.top + r.height / 2);
    const a = f.animate([
      { transform: 'translate(0,0) scale(1) rotate(0)', opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 80}px) scale(.8) rotate(${i % 2 ? 8 : -8}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(.08) rotate(${i % 2 ? 20 : -20}deg)`, opacity: 0.2 },
    ], { duration: 900, delay: i * 140, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
    a.onfinish = () => {
      f.remove(); sfx('tile');
      if (t.el) { t.el.classList.remove('catch'); void t.el.offsetWidth; t.el.classList.add('catch'); floatText(t.el, '+1'); }
      if (i === cards.length - 1) { burst(tx, ty, 18); setTimeout(() => t.el && t.el.classList.remove('catch'), 700); }
    };
  });
}

/* ---------- vị trí của từng hình trong 3 khoá ---------- */
function whereIndex() {
  const idx = {};
  Object.entries(CAT.slots).forEach(([lang, m]) => Object.entries(m).forEach(([slot, ws]) => ws.forEach((w, i) => { (idx[w] = idx[w] || []).push({ lang, slot, i, need: needFor(slot, i) }); })));
  return idx;
}
let WHERE = null;
export const whereOf = (w) => { if (!WHERE) WHERE = whereIndex(); return WHERE[w] || []; };
async function slotLabel(e) {
  let c = null; try { c = await C.course(e.lang); } catch (er) {}
  if (isBoss(e.slot)) { const lv = e.slot.split('|')[2], L = c && c.levels.find((x) => x.id === lv); return { t: `${COURSE_N[e.lang]} · ${L ? (L.tname ? L.tname + ' ' : '') + L.name : lv.toUpperCase()} boss`, s: `${e.need}★ boss chest`, lv }; }
  if (c) for (const L of c.levels) { const i = L.units.findIndex((u) => u.id === e.slot); if (i >= 0) return { t: `${COURSE_N[e.lang]} · ${L.tname ? L.tname + ' ' : ''}${L.name} · Unit ${i + 1}`, s: `${L.units[i].title} · ${e.need}★ chest`, lv: L.id, unit: e.slot }; }
  return { t: COURSE_N[e.lang], s: `${e.need}★ chest` };
}

/* ---------- xem chi tiết một hình ---------- */
export async function wallSheet(id) {
  const w = wallOf(id), mine = owned(id), src = mine && S.walls[id].src || '';
  const bestieHas = !mine && bestieWalls.has(id);
  const from = src === 'gacha' ? 'Won with a lucky spin' : src.startsWith('gift:') ? `Gift from ${src.slice(5)}` : src.startsWith('duel:') ? `Won in a duel against ${src.slice(5)}` : src.startsWith('quiz:') ? `Won in the live quiz “${src.slice(5)}”` : src.startsWith('chest:') ? 'From a chest' : src.startsWith('rank:') ? `Ranking reward · ${src.slice(5)}` : src.startsWith('xp:') ? `Unlocked with ${fmt(src.slice(3))} XP` : src === 'starter' ? 'Starter wallpaper' : '';
  sheet(`<div class="ws-media r-${w.rarity}"><video src="${video(id)}" poster="${poster(id)}" muted loop playsinline autoplay ${mine ? '' : 'class="dim"'}></video>${mine ? '' : `<span class="ws-lock">${I.lock}<b>Not in your collection yet</b></span>`}</div>
    <div class="ws-h"><h2>${esc(w.name)}</h2><span class="rpill r-${w.rarity}">${RAR[w.rarity]} · #${pad(id)}</span></div>
    ${mine ? `<p class="sub">${esc(from)}${from ? ' · ' : ''}collected ${new Date(S.walls[id].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>` : '<p class="sub">Win it from the chests below, a friend’s gift, a duel or a live quiz, or unlock it with XP.</p>'}
    ${mine ? '' : (() => { const cost = priceOf(id), left = xpLeft(); return `<div class="ws-buy"><span class="wb-ic">${I.gem}</span><div class="wb-t"><b>Unlock with XP</b><small>${fmt(cost)} XP for a ${RAR[w.rarity].toLowerCase()} wallpaper · you have ${fmt(left)} XP to spend</small><span class="bar"><i style="width:${Math.min(100, Math.round((left / cost) * 100))}%"></i></span></div><button class="btn ${left >= cost ? 'gold' : 'ghost'} ws-buy-go" type="button" ${left >= cost ? '' : 'disabled'}>${left >= cost ? `Unlock · ${fmt(cost)} XP` : `${fmt(cost - left)} XP to go`}</button></div>`; })()}
    ${mine || bestieHas ? `<div class="foot-row ws-acts"><button class="btn ${isBg(id) ? 'ghost' : 'acc'} use-bg" type="button" ${isBg(id) ? 'disabled' : ''}>${I.sparkle} ${isBg(id) ? 'Current background' : bestieHas ? 'Use your Bestie’s wallpaper' : 'Use as background'}</button>${mine ? `<button class="btn ghost share" type="button">${I.gift} Share</button>` : ''}</div>` : ''}
    <h3 class="gh">How to get it</h3>
    <div class="list ws-where"><div class="row"><span class="ws-c c-en">${I.gift}</span><span class="grow"><b>Lucky spin</b><small>Each ticket rolls a ${RAR[w.rarity].toLowerCase()} wallpaper ${({ common: '62', rare: '26', epic: '9', legendary: '3' })[w.rarity] || ''}% of the time. Tickets come from unit and boss chests, duels, live quizzes, weekly rankings and Bestie Adventure.</small></span><button class="btn sm ghost ws-spin" type="button">Spin</button></div>
      ${bestieHas ? `<div class="row"><span class="ws-c c-zh">${I.users}</span><span class="grow"><b>Shared by your Bestie</b><small>You can already use it as your page background.</small></span></div>` : ''}</div>`, (el, close) => {
    const u = el.querySelector('.use-bg'); if (u) u.addEventListener('click', () => { setBg(id); close(); toast('Background changed'); });
    const sh = el.querySelector('.share'); if (sh) sh.addEventListener('click', () => { close(); shareSheet(id); });
    const bg = el.querySelector('.ws-buy-go'); if (bg) bg.addEventListener('click', async () => {
      close();
      if (!(await confirmBox(`Unlock ${wallOf(id).name}?`, `This spends ${fmt(priceOf(id))} XP from your ${fmt(xpLeft())} XP to spend. Your level and streak stay the same.`, `Unlock · ${fmt(priceOf(id))} XP`))) return;
      if (await buyWall(id)) unlockedFx(id);
    });
    const wsp = el.querySelector('.ws-spin'); if (wsp) wsp.addEventListener('click', () => { close(); if (C.spin) C.spin(); });
  }, 'wide ws-sheet');
}

/* ---------- đổi XP lấy hình nền ---------- */
// XP dùng được = tổng XP − XP đã đổi (hình có nguồn "xp:<giá>"). Cấp độ người chơi không bị giảm.
export const PRICE = { common: 576, rare: 1152, epic: 2304, legendary: 4608 };
export const priceOf = (id) => PRICE[wallOf(id).rarity] || 4608;
export const xpSpent = () => Object.values(S.walls).reduce((a, x) => a + (/^xp:\d+$/.test((x && x.src) || '') ? +x.src.slice(3) : 0), 0);
export const xpLeft = () => Math.max(0, (S.xp || 0) - xpSpent());
const fmt = (n) => Number(n).toLocaleString('en-US');
export async function buyWall(id) {
  if (owned(id)) return false;
  const cost = priceOf(id);
  if (xpLeft() < cost) { toast(`You need ${fmt(cost - xpLeft())} more XP`); return false; }
  if (acct) {
    try {
      await push();
      const j = await call('learn_wall_buy', { p_wall: id });
      if (!j || !j.ok) { toast(j && j.error === 'notenough' ? `The server sees ${fmt(j.have)} XP to spend. Finish a lesson and try again.` : j && j.error === 'owned' ? 'Already in your collection' : 'Could not unlock right now'); if (j && j.error === 'owned') syncWalls(); return false; }
    } catch (e) { toast(e.message); return false; }
  }
  S.walls[id] = { at: Date.now(), src: 'xp:' + cost }; save(true);
  return true;
}
function unlockedFx(id) {
  sfx('levelup');
  const o = overlay(`<div class="rw xp-unlock">${card(id, { cls: 'aw is-new', tag: 'Unlocked' })}<h2>${esc(wallOf(id).name)}</h2><p class="muted">${fmt(priceOf(id))} XP spent · ${fmt(xpLeft())} XP left to spend</p><button class="btn acc xu-ok" type="button">${I.gallery} Add to collection</button></div>`, null, 'reward');
  wireCards(o.el);
  setTimeout(() => { const c = o.el.querySelector('.wcard'); if (c) { const r = c.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 30); } }, 300);
  o.el.querySelector('.xu-ok').addEventListener('click', (e) => { e.stopPropagation(); const c = o.el.querySelector('.wcard'); o.close(); if (c) flyToCollection([c]); setTimeout(() => { if (location.hash.startsWith('#/collection') && C.render) C.render(); }, 1000); });
}

/* ---------- nền trang bằng hình đã sưu tập ---------- */
export const isBg = (id) => S.bg === id || (id === 71 && !S.bg);
// v23: hình Bestie chia sẻ (không vào bộ sưu tập, chỉ dùng làm nền trang)
export const bestieWalls = new Set();
export const usable = (id) => owned(id) || bestieWalls.has(id);
export function setBg(id) {
  S.bg = id && id !== 71 && usable(id) ? id : 0; save();
  try { localStorage.setItem('dcl_bg', S.bg ? String(S.bg) : ''); } catch (e) {}
  if (C && C.applyBg) C.applyBg(S.bg);
}

/* ---------- chia sẻ hình cho bạn bè (theo VIP) ---------- */
const SHARE_ERR = { novip: 'Sharing starts at VIP 1.', notfriend: 'You can only share with friends.', notowned: 'That wallpaper is not in your collection.', theyhave: 'They already have this wallpaper.', sharetoday: 'You already shared a wallpaper today. One share per day.', quota: 'You used every share for this VIP rank. Reach the next rank to share again.', samelevel: 'This friend already got a wallpaper from you at this VIP rank.' };
export async function shareSheet(pre = 0) {
  if (!acct) { C.authSheet('new'); return; }
  let mineJ, fr;
  try { [mineJ, fr] = await Promise.all([call('learn_walls_mine'), call('learn_friends_list')]); } catch (e) { toast(e.message); return; }
  const v = mineJ.vip || 0, sh = mineJ.share || { quota: 0, used: 0, today: false, sent: [] };
  const friends = (fr.items || []).filter((x) => x.status === 'accepted');
  const gotAtLv = new Set((sh.sent || []).filter((x) => x.vip === v).map((x) => x.to));
  const left = Math.max(0, sh.quota - sh.used);
  const block = !v ? 'Reach VIP 1 to start sharing. Finish two English units (or one Chinese / IELTS unit plus a little bonus) to get there.' : sh.today ? 'You already shared a wallpaper today. Come back tomorrow.' : !left ? `All ${v} share${v > 1 ? 's' : ''} for VIP ${v} are used. Each new VIP rank gives you fresh shares.` : !friends.length ? 'Add a friend first. Sharing only works between friends.' : '';
  sheet(`<h2>Share a wallpaper</h2>
    <div class="sh-quota">${vipAv(acct.name, acct.avatar, v, 'lg')}<div><b>VIP ${v}</b><small>${v ? `${sh.used} of ${sh.quota} shares used at this rank · 1 per day · 1 per friend per rank` : 'Sharing unlocks at VIP 1'}</small><span class="qdots">${[...Array(Math.max(1, v))].map((_, i) => `<i class="${i < sh.used ? 'on' : ''}"></i>`).join('')}</span></div></div>
    ${block ? `<p class="sh-block">${esc(block)}</p>` : `
    <h3 class="gh">1 · Pick a friend</h3>
    <div class="sh-fr">${friends.map((f) => `<button type="button" class="sh-f" data-u="${f.uid}" ${gotAtLv.has(f.uid) ? 'disabled title="Already got one from you at this rank"' : ''}>${vipAv(f.name, f.avatar, f.vip)}<b>${esc(f.name)}</b><small>${gotAtLv.has(f.uid) ? 'Shared this rank' : `${f.walls || 0}/${total()}`}</small></button>`).join('')}</div>
    <h3 class="gh">2 · Pick a wallpaper they don’t have</h3>
    <div class="sh-walls"><p class="muted">Pick a friend first.</p></div>
    <p class="err sh-err"></p>
    <button class="btn acc wide sh-go" type="button" disabled>${I.gift} Send gift</button>`}
    ${(sh.sent || []).length ? `<h3 class="gh">Sent</h3><div class="list">${sh.sent.slice(0, 8).map((x) => `<div class="row"><img class="sh-th" src="${poster(x.wall)}" alt=""><span class="grow"><b>${esc(wallOf(x.wall).name)}</b><small>to ${esc(x.name)} · VIP ${x.vip}</small></span></div>`).join('')}</div>` : ''}`, (el, close) => {
    if (block) return;
    let to = null, wall = pre || 0;
    const box = el.querySelector('.sh-walls'), go = el.querySelector('.sh-go'), err = el.querySelector('.sh-err');
    const upd = () => { go.disabled = !(to && wall); };
    el.querySelectorAll('.sh-f').forEach((b) => b.addEventListener('click', async () => {
      el.querySelectorAll('.sh-f').forEach((x) => x.setAttribute('aria-pressed', x === b)); to = +b.dataset.u; sfx('tap'); err.textContent = '';
      box.innerHTML = '<p class="muted">Loading their collection…</p>';
      let theirs = []; try { const j = await call('learn_walls_of', { p_uid: to }); theirs = j.walls || []; } catch (e) {}
      const can = Object.keys(S.walls).map(Number).filter((x) => !theirs.includes(x)).sort((a, b) => RORD.indexOf(wallOf(a).rarity) - RORD.indexOf(wallOf(b).rarity));
      if (wall && !can.includes(wall)) wall = 0;
      box.innerHTML = can.length ? `<div class="wgrid sm">${can.map((x) => card(x, { cls: wall === x ? 'picked' : '' })).join('')}</div>` : '<p class="muted">They already have every wallpaper you own.</p>';
      wireCards(box, (x, c) => { wall = x; box.querySelectorAll('.wcard').forEach((k) => k.classList.toggle('picked', k === c)); sfx('tap'); upd(); });
      upd();
    }));
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        const j = await call('learn_share', { p_to: to, p_wall: wall });
        if (!j.ok) { err.textContent = SHARE_ERR[j.error] || j.error; go.disabled = false; sfx('bad'); return; }
        sfx('levelup'); const c = box.querySelector('.wcard.picked'), f = el.querySelector(`.sh-f[data-u="${to}"]`);
        if (c && f) { const a = c.getBoundingClientRect(), b = f.getBoundingClientRect(); const k = c.cloneNode(true); k.classList.add('wc-fly'); k.style.cssText = `left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px`; document.body.appendChild(k); k.animate([{ transform: 'none' }, { transform: `translate(${b.left + b.width / 2 - a.left - a.width / 2}px,${b.top + b.height / 2 - a.top - a.height / 2}px) scale(.1)`, opacity: 0.2 }], { duration: 700, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' }).onfinish = () => { k.remove(); burst(b.left + b.width / 2, b.top + b.height / 2, 20); }; }
        setTimeout(() => { close(); toast(`Sent “${wallOf(wall).name}”`); }, 760);
      } catch (e) { err.textContent = e.message; go.disabled = false; }
    });
    if (pre) { const b = friends.find((f) => !gotAtLv.has(f.uid)); if (b) el.querySelector(`.sh-f[data-u="${b.uid}"]`).click(); }
  }, 'wide');
}

/* ---------- trang Collection ---------- */
let colTab = null, colFilter = 'all';
export async function collectionPage(args = []) {
  await loadCat();
  if (acct) syncWalls().then(() => { if (location.hash.startsWith('#/collection') && !document.querySelector('.ovl')) draw(); });
  const tabs = [['all', 'All'], ['en', 'English'], ['zh', '中文'], ['ielts', 'IELTS'], ['badges', 'Badges']];
  const wantSpin = args[0] === 'spin';
  colTab = args[0] && tabs.some((t) => t[0] === args[0]) ? args[0] : colTab || 'all';
  if (acct && C.gachaLoad) C.gachaLoad().then(() => { const gp = document.querySelector('.col-gp'); if (gp && location.hash.startsWith('#/collection')) { gp.innerHTML = C.gachaPanel(); C.wireGacha(gp); } });
  const draw = async () => {
    const n = ownedCount(), pts = vipPoints(), v = myVip(), next = VIP_T[v] || 1000, prevT = v ? VIP_T[v - 1] : 0;
    const byR = RORD.map((r) => { const all = CAT.walls.filter((w) => w.rarity === r); return { r, n: all.filter((w) => owned(w.id)).length, t: all.length }; });
    const up = unitPts();
    let body = '';
    try { const cc = await C.course(S.lang); UL = {}; cc.levels.forEach((L) => { L.units.forEach((u, i) => { const nm = (L.tname ? L.tname + ' ' : '') + L.name; UL[u.id] = `${nm} · Unit ${i + 1}`; }); UL[`boss|${S.lang}|${L.id}`] = `${(L.tname ? L.tname + ' ' : '') + L.name} boss`; }); } catch (e) {}
    if (colTab === 'badges') body = C.badgesHTML();
    else if (colTab === 'all') body = allTab();
    else body = await courseTab(colTab);
    C.shell('#/collection', `<div class="page-h"><div><h1>Collection</h1><p>${total()} animated wallpapers. You start with ${(CAT.starters || []).length}; win the rest with the lucky spin (tickets from chests, duels, quizzes, rankings and Bestie Adventure) or unlock any wallpaper with XP.</p></div></div>
    <div class="col-gp">${C.gachaPanel ? C.gachaPanel() : ''}</div>
    <section class="col-top">
      <div class="panel col-count"><div class="cc-n"><b>${n}</b><span>/ ${CAT.walls.length}</span></div><small>wallpapers collected</small>
        <div class="cc-xp">${I.gem}<span><b>${fmt(xpLeft())} XP to spend</b><small>Tap any wallpaper to unlock it with XP: common ${fmt(PRICE.common)}, rare ${fmt(PRICE.rare)}, epic ${fmt(PRICE.epic)}, legendary ${fmt(PRICE.legendary)}.</small></span></div>
        <div class="cc-r">${byR.map((x) => `<span class="r-${x.r}"><i class="rd"></i>${RAR[x.r]}<b>${x.n}/${x.t}</b></span>`).join('')}</div></div>
      <div class="panel col-vip">${vipAv(acct ? acct.name : 'You', acct && acct.avatar, v, 'lg')}<div class="cv-t"><b>${v ? `VIP ${v}` : 'No VIP yet'}</b><small>${v >= 10 ? 'Top rank' : `${pts} / ${next} points to VIP ${v + 1}`}</small><span class="bar"><i style="width:${v >= 10 ? 100 : Math.round(((pts - prevT) / (next - prevT)) * 100)}%"></i></span>
        <em>Finished unit: English +${Math.round(up.en)}, 中文 +${Math.round(up.zh)}, IELTS +${Math.round(up.ielts)}. Duels, quizzes and duplicates add bonus points (max 150).</em></div>
        <button class="btn sm ${v ? 'acc' : 'ghost'} col-share" type="button">${I.gift} Share</button></div>
    </section>
    <div class="col-tabs seg" role="tablist">${tabs.map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${colTab === k}" class="${k === 'zh' ? 'zh' : ''}">${l}</button>`).join('')}</div>
    <div class="col-body">${body}</div>`, null, { noCourse: true });
    const app = document.getElementById('app');
    app.querySelectorAll('.col-tabs button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); colTab = b.dataset.t; history.replaceState(null, '', '#/collection/' + colTab); draw(); }));
    app.querySelectorAll('.col-flt button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); colFilter = b.dataset.f; draw(); }));
    app.querySelector('.col-share').addEventListener('click', () => shareSheet());
    const gp = app.querySelector('.col-gp'); if (gp && C.wireGacha) C.wireGacha(gp);
    if (wantSpin && gp) { gp.scrollIntoView({ block: 'center' }); }
    wireCards(app.querySelector('.col-body'), (id) => { sfx('open'); wallSheet(id); });
    app.querySelectorAll('.col-go').forEach((b) => b.addEventListener('click', () => C.goTo(b.dataset.l, b.dataset.lv, b.dataset.u)));
  };
  await draw();
}
let UL = {};
function allTab() {
  const list = CAT.walls.slice().sort((a, b) => RORD.indexOf(a.rarity) - RORD.indexOf(b.rarity) || a.id - b.id).filter((w) => colFilter === 'all' || (colFilter === 'got') === owned(w.id));
  const flt = `<div class="col-flt">${[['all', `All ${total()}`], ['got', 'Collected'], ['miss', 'Still hidden']].map(([k, l]) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${colFilter === k}">${l}</button>`).join('')}</div>`;
  return flt + `<div class="wgrid">${list.map((w) => {
    if (owned(w.id)) return card(w.id);
    return card(w.id, { lockText: bestieWalls.has(w.id) ? 'Bestie shares it' : 'Lucky spin', tag: bestieWalls.has(w.id) ? 'Bestie' : '' });
  }).join('') || '<p class="muted">Nothing here yet.</p>'}</div>`;
}
async function courseTab(lang) {
  let c; try { c = await C.course(lang); } catch (e) { return '<p class="muted">This course could not load.</p>'; }
  const S2 = CAT.slots[lang];
  const inCourse = new Set(Object.values(S2).flat()), mine = [...inCourse].filter(owned).length;
  void inCourse; void mine;
  return `<p class="col-note">Each finished unit opens a chest with lucky spin tickets: 2★ = 1 ticket, 3★ = 2 tickets. Level bosses give 1–3. Missed tickets stay visible so you know where to go back.</p>` + c.levels.map((L) => {
    const rows = L.units.map((u, i) => {
      const done = unitProgress(u.id) === LN, opened = !!S.chests[u.id];
      const sub = !done ? (unitProgress(u.id) ? `${unitProgress(u.id)}/8 lessons` : 'Not started') : !opened ? 'Chest waiting on the map!' : `${unitStars(u.id)}/24 stars · ${chestStars(u.id)}★ chest${canUpgrade(u.id, chestStars(u.id)) ? ' · refilled!' : ''}`;
      return `<div class="drop ${done ? 'done' : ''}"><div class="dr-t"><span class="dr-n">${i + 1}</span><span><b>${esc(u.title)}</b><small>${sub}</small></span></div>
        <div class="dr-c tks">${ticketView(u.id, opened).map((t) => ticketCard(t)).join('')}</div>
        <button class="icon-btn col-go" type="button" data-l="${lang}" data-lv="${L.id}" data-u="${u.id}" title="Go to this unit">${I.chev}</button></div>`;
    }).join('');
    const bk = `boss|${lang}|${L.id}`, beat = !!S.boss[lang + '|' + L.id] || (S.bossStars[lang + '|' + L.id] || 0) > 0;
    const tks = [...L.units.map((u) => u.id), bk], gotT = tks.reduce((a, k) => a + ticketView(k, true).filter((t) => t.state === 'got').length, 0), allT = tks.reduce((a, k) => a + ticketView(k, true).length, 0);
    return `<section class="panel col-lv"><h3>${esc((L.tname ? L.tname + ' ' : '') + L.name)} <span class="muted">· ${esc(L.title)}</span><em>${gotT}/${allT} tickets</em></h3>${rows}
      <div class="drop boss"><div class="dr-t"><span class="dr-n">${I.crown}</span><span><b>${esc((L.tname ? L.tname + ' ' : '') + L.name)} boss</b><small>${beat ? `Best ${S.bossStars[lang + '|' + L.id] || 1}★ · 80% / 88% / 95% for 1 / 2 / 3 wallpapers` : '80% / 88% / 95% for 1 / 2 / 3 wallpapers'}</small></span></div>
        <div class="dr-c tks">${ticketView(bk, beat).map((t, i) => ticketCard(t, ['80%', '88%', '95%'][i])).join('')}</div>
        <button class="icon-btn col-go" type="button" data-l="${lang}" data-lv="${L.id}" data-u="" title="Go to this level">${I.chev}</button></div></section>`;
  }).join('');
}
// khối nhỏ ở cột phải trang Learn và trong trang Me
export function miniHTML() {
  if (!CAT) return '';
  const n = ownedCount(), last = Object.entries(S.walls).sort((a, b) => b[1].at - a[1].at).slice(0, 3).map(([k]) => +k), tk = C && C.tickets ? C.tickets() : 0;
  return `<section class="panel col-mini"><h3>${I.gallery} Collection <em>${n}/${CAT.walls.length}</em></h3>
    <a class="cm-row" href="#/collection">${last.length ? last.map((w) => `<span class="cm-th r-${wallOf(w).rarity}"><img src="${poster(w)}" alt="" loading="lazy"></span>`).join('') : [0, 1, 2].map(() => `<span class="cm-th empty">${I.lock}</span>`).join('')}</a>
    <p class="muted cm-tx">Open a wallpaper to set it as the background of this page. Chests give lucky spin tickets.</p>
    <div class="cm-acts"><a class="btn sm ghost cm-go" href="#/collection">${I.gallery} Background</a>${acct ? `<button class="btn sm ${tk ? 'gold has' : 'ghost'} cm-spin" type="button" data-tickets>${I.zap} Spin <b class="tk-n">${tk}</b></button>` : ''}</div></section>`;
}
// trạng thái nhỏ cho rương trên bản đồ
export function chestBadge(uid, complete) {
  if (!CAT || !complete) return '';
  const cl = S.wclaims[uid] || 0, st = chestStars(uid);
  if (S.chests[uid] && canUpgrade(uid, st)) return '<span class="cp-tag up">+1</span>';
  if (S.chests[uid] && cl < 3) return `<span class="cp-tag miss" title="Missed wallpaper">${I.lock}</span>`;
  return '';
}
// bảng nhỏ khi bấm rương đã mở
export function chestInfo(uid, title, onReview) {
  const st = chestStars(uid), stars = unitStars(uid);
  sheet(`<span class="muted sk">Unit chest</span><h2>${esc(title)}</h2>
    <p class="sub">${stars}/24 stars in this unit → ${st}★ chest. ${st < 3 ? `Reach ${st < 2 ? 16 : 22} stars for ${st < 2 ? 'the first' : 'one more'} lucky spin ticket.` : 'Both tickets collected.'}</p>
    <div class="ci-tks">${ticketView(uid, true).map((t) => ticketCard(t)).join('')}</div>
    <div class="foot-row" style="margin-top:16px"><a class="btn ghost" href="#/collection">${I.gift} Lucky spin</a><button class="btn acc ci-rv" type="button">${I.redo} Review this unit</button></div>`, (el, close) => {
    el.querySelector('.ci-rv').addEventListener('click', () => { close(); onReview(); });
  });
}
// xem trước rương chưa tới
export function chestPreview(uid, title, done) {
  sheet(`<span class="muted sk">Unit chest · locked</span><h2>${esc(title)}</h2>
    <p class="sub">${done ? `${done}/8 lessons done.` : 'Not started yet.'} Lessons are open in any order. Finish all 8 lessons of this unit to open its chest. Score well: a 2★ chest gives 1 lucky spin ticket, a 3★ chest gives 2.</p>
    <div class="ci-tks">${ticketView(uid, false).map((t) => ticketCard(t)).join('')}</div>`);
}
