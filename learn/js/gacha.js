// v23: Vòng quay may mắn (kiểu mở hòm CS:GO). Rương chủ đề / boss, duel, quiz, xếp hạng tuần và Vượt ải Bestie cho VÉ QUAY.
// Vé lưu trong kho (máy chủ). Quay: dải hình chạy rồi dừng ngẫu nhiên; kết quả do máy chủ quyết định theo độ hiếm.
// Trùng hình đã có → đổi thành XP. Đôi khi ra hiệu ứng Bestie.
import { I } from './icons.js?v=35';
import { acct, call } from './account.js?v=35';
import { sfx } from './sound.js?v=35';
import { esc, toast, overlay, burst } from './ui.js?v=35';
import * as walls from './walls.js?v=35';
import { FX, fxBadge } from './bestie.js?v=35';

let C = null;
export function init(ctx) { C = ctx; }
export const G = { left: 0, odds: null, history: [], sources: [], spins: 0, at: 0, loaded: false };
const RAR = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const listeners = new Set();
export const onChange = (f) => listeners.add(f);
const emit = () => { listeners.forEach((f) => { try { f(G); } catch (e) {} }); paintChips(); };

export async function load(force = false) {
  if (!acct) { G.left = 0; G.loaded = false; emit(); return G; }
  if (!force && G.loaded && Date.now() - G.at < 20000) return G;
  try { const j = await call('learn_gacha_state'); if (j && j.ok) Object.assign(G, { left: j.left || 0, odds: j.odds || G.odds, history: j.history || [], sources: j.sources || [], spins: j.spins || 0, at: Date.now(), loaded: true }); } catch (e) {}
  emit(); return G;
}
export function setLeft(n) { if (typeof n === 'number') { G.left = n; emit(); } }
// chấm số vé trên các nút có data-tickets
export function paintChips() {
  document.querySelectorAll('[data-tickets]').forEach((el) => { const b = el.querySelector('.tk-n'); if (b) b.textContent = G.left; el.classList.toggle('has', G.left > 0); });
}
export const sourceLabel = (s) => {
  s = String(s || '');
  if (s === 'welcome') return 'Free welcome ticket';
  if (s.startsWith('chest:boss|')) return 'Level boss chest';
  if (s.startsWith('chest:')) return 'Unit chest';
  if (s.startsWith('duel:')) return `Duel win vs ${s.slice(5)}`;
  if (s.startsWith('quiz:')) return `Live quiz win · ${s.slice(5)}`;
  if (s.startsWith('week:')) { const [, b, d] = s.split(':'); return `Weekly top 10 · ${{ en: 'English', zh: '中文', ielts: 'IELTS', duel: 'Duel', col: 'Top collector', bestie: 'Bestie' }[b] || b} · ${d}`; }
  if (s.startsWith('adv:')) return 'Bestie Adventure king';
  if (s.startsWith('adv-first:')) return 'Adventure · first win';
  if (s === 'lesson') return 'Lucky lesson (10%)';
  return 'Ticket';
};

/* ---------- vật phẩm trên dải quay ---------- */
const itemHTML = (it, cls = '') => it.fx
  ? `<div class="gs-it fx r-${FX[it.fx] ? FX[it.fx].rarity : 'rare'} ${cls}"><span class="gs-fx">${FX[it.fx] ? FX[it.fx].icon : '✨'}</span><b>${esc(FX[it.fx] ? FX[it.fx].name : 'Bestie effect')}</b><small>Bestie effect</small></div>`
  : `<div class="gs-it r-${walls.wallOf(it.w).rarity} ${cls}"><img src="${walls.poster(it.w)}" alt="" loading="eager" decoding="async"><b>${esc(walls.wallOf(it.w).name)}</b><small>${RAR[walls.wallOf(it.w).rarity]}</small></div>`;
function pool() {
  const all = (walls.CAT ? walls.CAT.walls : []).filter((w) => !(walls.CAT.starters || []).includes(w.id));
  const by = {}; all.forEach((w) => { (by[w.rarity] = by[w.rarity] || []).push(w.id); });
  return by;
}
function randItem(by, odds) {
  const tot = odds.reduce((a, o) => a + +o.weight, 0); let r = Math.random() * tot;
  for (const o of odds) { r -= +o.weight; if (r <= 0) { const l = by[o.rarity] || []; return { w: l[Math.floor(Math.random() * l.length)] || 1 }; } }
  return { w: 1 };
}
const DEF_ODDS = [{ rarity: 'common', weight: 62, dup_xp: 60 }, { rarity: 'rare', weight: 26, dup_xp: 120 }, { rarity: 'epic', weight: 9, dup_xp: 240 }, { rarity: 'legendary', weight: 3, dup_xp: 480 }];

/* ---------- quay ---------- */
let spinning = false;
export async function spin(opts = {}) {
  if (!acct) { C.authSheet('new'); return null; }
  if (spinning) return null;
  await walls.loadCat();
  if (!G.loaded) await load(true);
  if (G.left <= 0) { toast('No tickets yet. Finish a unit chest, win a duel or a live quiz to get one.'); return null; }
  spinning = true;
  const odds = (G.odds && G.odds.length ? G.odds : DEF_ODDS), by = pool();
  const N = 56, WIN = 48, items = Array.from({ length: N }, () => (Math.random() < 0.05 ? { fx: Object.keys(FX)[2 + Math.floor(Math.random() * (Object.keys(FX).length - 2))] } : randItem(by, odds)));
  const o = overlay(`<div class="gs" role="dialog" aria-label="Lucky spin">
    <div class="gs-h"><small>${I.gift} Lucky spin</small><h2>${opts.title ? esc(opts.title) : 'Spin for a wallpaper'}</h2><p class="muted gs-sub">${G.left} ticket${G.left === 1 ? '' : 's'} in your inventory</p></div>
    <div class="gs-win"><div class="gs-strip">${items.map((it) => itemHTML(it)).join('')}</div><i class="gs-mark" aria-hidden="true"></i><i class="gs-fade l"></i><i class="gs-fade r"></i></div>
    <div class="gs-res" aria-live="polite"></div>
    <div class="gs-act"><button class="btn ghost gs-close" type="button" disabled>Close</button><button class="btn acc gs-go" type="button">${I.zap} Spin · 1 ticket</button></div>
    <p class="gs-odds">${odds.map((x) => `<span class="r-${x.rarity}"><i class="rd"></i>${RAR[x.rarity]} ${x.weight}%</span>`).join('')}<span>Duplicate → XP</span></p></div>`, null, 'reward gs-ovl');
  const el = o.el, strip = el.querySelector('.gs-strip'), res = el.querySelector('.gs-res'), go = el.querySelector('.gs-go'), close = el.querySelector('.gs-close');
  o.el.addEventListener('click', (e) => { if (e.target === o.el) e.stopPropagation(); }, true);
  let result = null, busy = false;
  const doSpin = async () => {
    if (busy) return; busy = true; go.disabled = true; close.disabled = true; res.innerHTML = '';
    let j; try { j = await call('learn_gacha_spin'); } catch (e) { toast(e.message); busy = false; go.disabled = false; close.disabled = false; return; }
    if (!j || !j.ok) { toast(j && j.error === 'noticket' ? 'No tickets left.' : 'The spin did not work. Try again.'); busy = false; close.disabled = false; load(true); return; }
    result = j; G.left = j.left; emit();
    // dựng lại dải với kết quả ở vị trí WIN
    const fresh = Array.from({ length: N }, () => (Math.random() < 0.05 ? { fx: Object.keys(FX)[2 + Math.floor(Math.random() * (Object.keys(FX).length - 2))] } : randItem(by, odds)));
    fresh[WIN] = j.fx ? { fx: j.fx } : { w: j.wall };
    strip.style.transition = 'none'; strip.style.transform = 'translateX(0)';
    strip.innerHTML = fresh.map((it, i) => itemHTML(it, i === WIN ? 'win' : '')).join('');
    void strip.offsetWidth;
    const itW = strip.firstElementChild.getBoundingClientRect().width + 10, box = el.querySelector('.gs-win').getBoundingClientRect().width;
    const jitter = (Math.random() - 0.5) * itW * 0.7, target = WIN * itW + itW / 2 - box / 2 + jitter;
    const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 400 : 6200;
    strip.style.transition = `transform ${dur}ms cubic-bezier(.08,.62,.12,1)`;
    strip.style.transform = `translateX(${-target}px)`;
    sfx('open');
    // tiếng tích khi từng ô đi qua vạch giữa
    let last = -1; const t0 = performance.now();
    const tick = () => { const m = new DOMMatrix(getComputedStyle(strip).transform), x = -m.m41 + box / 2, idx = Math.floor(x / itW); if (idx !== last) { last = idx; sfx('tick'); } if (performance.now() - t0 < dur) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => {
      const win = strip.children[WIN]; win.classList.add('got');
      const r = win.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, j.rarity === 'legendary' ? 70 : j.rarity === 'epic' ? 50 : 30);
      sfx(j.dup ? 'ok' : 'levelup');
      if (j.fx) res.innerHTML = `<b class="gs-new">New Bestie effect: ${esc(FX[j.fx] ? FX[j.fx].name : j.fx)}</b><small>Pick it in Friends › Bestie. It plays when you and your Bestie meet in a quiz or class.</small>`;
      else if (j.dup) res.innerHTML = `<b>${esc(walls.wallOf(j.wall).name)}</b><small>You already have it, so it turned into <b class="gs-xp">${I.gem} +${fmt(j.xp)} XP</b></small>`;
      else { res.innerHTML = `<b class="gs-new">New wallpaper: ${esc(walls.wallOf(j.wall).name)}</b><small>${RAR[j.rarity]} · added to your collection</small><button class="btn sm ghost gs-bg" type="button">${I.sparkle} Use as background</button>`; walls.addLocal(j.wall, 'gacha'); }
      const bg = res.querySelector('.gs-bg'); if (bg) bg.addEventListener('click', () => { walls.setBg(j.wall); toast('Background changed'); });
      if (j.xp && C.tick) C.tick(true);
      el.querySelector('.gs-sub').textContent = `${G.left} ticket${G.left === 1 ? '' : 's'} left`;
      go.innerHTML = G.left > 0 ? `${I.redo} Spin again` : 'No tickets left';
      go.disabled = G.left <= 0; close.disabled = false; busy = false;
      if (opts.onResult) opts.onResult(j);
    }, dur + 120);
  };
  go.addEventListener('click', doSpin);
  close.addEventListener('click', () => { o.close(); spinning = false; if (opts.onClose) opts.onClose(result); if (location.hash.startsWith('#/collection') && C.render) C.render(); });
  el.querySelector('.ovl-in').addEventListener('click', (e) => e.stopPropagation());
  if (opts.auto !== false) setTimeout(doSpin, 500);
  return o;
}

/* ---------- khối "Lucky spin" trong Collection ---------- */
export function panelHTML() {
  const odds = G.odds && G.odds.length ? G.odds : DEF_ODDS;
  return `<section class="panel gp" data-tickets>
    <div class="gp-h"><span class="gp-ic">${I.gift}</span><div><small>Lucky spin</small><b><span class="tk-n">${G.left}</span> ticket${G.left === 1 ? '' : 's'}</b></div>
      <button class="btn ${G.left ? 'gold' : 'ghost'} gp-go" type="button" ${acct ? '' : 'disabled'}>${I.zap} ${G.left ? 'Spin now' : 'Spin'}</button></div>
    <p class="muted gp-t">${acct ? 'Chests no longer hand out fixed wallpapers: each one gives spin tickets (2★ unit chest = 1, 3★ = 2, boss = 1–3). Keep tickets in your inventory and spin whenever you like. A duplicate turns into XP.' : 'Create an account to keep spin tickets and spin for wallpapers.'}</p>
    <div class="gp-odds">${odds.map((x) => `<span class="r-${x.rarity}"><i class="rd"></i><b>${RAR[x.rarity]}</b> ${x.weight}%<small>dup +${x.dup_xp} XP</small></span>`).join('')}</div>
    ${G.sources.length ? `<div class="gp-src"><small>In your inventory</small>${G.sources.map((s) => `<span>${esc(sourceLabel(s.source))}<b>×${s.n}</b></span>`).join('')}</div>` : ''}
    ${G.history.length ? `<details class="gp-hist"><summary>Last spins (${G.spins})</summary><div class="gp-hl">${G.history.slice(0, 12).map((h) => h.wall ? `<span class="r-${h.rarity}" title="${esc(walls.wallOf(h.wall).name)}"><img src="${walls.poster(h.wall)}" alt=""><small>${h.dup ? `+${h.xp} XP` : 'New'}</small></span>` : `<span class="fxh"><em>${FX[String(h.rarity).slice(3)] ? FX[String(h.rarity).slice(3)].icon : '✨'}</em><small>Effect</small></span>`).join('')}</div></details>` : ''}
  </section>`;
}
export function wirePanel(root) {
  const b = root.querySelector('.gp-go'); if (b) b.addEventListener('click', () => { sfx('tap'); spin(); });
}
// nút nhỏ trên HUD / cột Today
export const chipHTML = () => (acct ? `<button class="tk-chip ${G.left ? 'has' : ''}" type="button" data-tickets title="Lucky spin tickets" aria-label="Lucky spin tickets">${I.gift}<b class="tk-n">${G.left}</b></button>` : '');
export function wireChips(root) { root.querySelectorAll('.tk-chip').forEach((b) => b.addEventListener('click', () => { sfx('tap'); if (G.left) spin(); else location.hash = '#/collection'; })); }
export { fxBadge };
