// Thông báo (lời mời kết bạn, mời vào quiz / lớp, khiêu chiến, quà) + danh sách bạn bè ở cạnh phải màn hình.
// Hỏi máy chủ mỗi 45 giây (learn_me); khi có thông báo mới thì tải danh sách và rung chuông.
import { I } from './icons.js?v=14';
import { S } from './store.js?v=14';
import { acct, call } from './account.js?v=14';
import { sfx } from './sound.js?v=14';
import { esc, toast, sheet, vipAv, ago, online } from './ui.js?v=14';
import * as walls from './walls.js?v=14';

let C = null;
export const hub = { unread: 0, requests: 0, duels: 0, items: [], friends: null, me: null, fAt: 0 };
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} };
export const ui = { rail: pref('dcl_rail', true), hud: pref('dcl_hud', true), side: pref('dcl_side', true) };

export function init(ctx) {
  C = ctx;
  applyChrome(); start();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && acct && Date.now() - lastPoll > 30000) poll(); });
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(applyChrome, 150); });
}
let rz = 0, lastPoll = 0, ticking = 0;
// bắt đầu hỏi máy chủ (gọi lại sau khi đăng nhập)
export function start() {
  applyChrome();
  if (!acct) { hub.friends = null; hub.items = []; hub.unread = 0; const r = document.querySelector('.rail'); if (r) r.innerHTML = railInner(); return; }
  poll(true);
  if (!ticking) ticking = setInterval(() => { if (!document.hidden && acct) poll(); }, 45000);
}

/* ---------- ẩn / hiện menu trên và danh sách bạn ---------- */
const wide = () => innerWidth >= 1500;
export function applyChrome() {
  const b = document.body;
  b.classList.toggle('hud-off', !ui.hud);
  b.classList.toggle('has-acct', !!acct);
  b.classList.toggle('rail-on', !!acct && ui.rail && wide());
  b.classList.toggle('side-off', !ui.side);
  paintTabs();
}
// thẻ dọc ở mép phải để mở lại cột Today / danh sách bạn
function paintTabs() {
  const mk = (cls, html, fn) => { let t = document.querySelector('.' + cls); if (!t) { t = document.createElement('button'); t.type = 'button'; t.className = 'edge-tab ' + cls; t.addEventListener('click', fn); document.body.appendChild(t); } t.innerHTML = html; return t; };
  const on = ranked().filter((x) => !x.me && online(x.last_seen)).length;
  mk('rail-tab', `${I.users}<span>Friends${on ? ` · ${on}` : ''}</span>`, () => toggleRail(true));
  mk('side-tab', `${I.target}<span>Today</span>`, () => toggleSide(true));
  document.body.classList.toggle('has-side', !!document.querySelector('.layout > .side'));
}
export function toggleSide(v = !ui.side) { ui.side = v; setPref('dcl_side', v); applyChrome(); sfx('tap'); }
export function toggleHud(v = !ui.hud) { ui.hud = v; setPref('dcl_hud', v); applyChrome(); sfx('tap'); }
export function toggleRail(v) {
  if (!wide()) { railSheet(); return; }
  ui.rail = v === undefined ? !ui.rail : v; setPref('dcl_rail', ui.rail); applyChrome(); sfx('tap');
}

/* ---------- hỏi máy chủ ---------- */
export async function poll(first = false) {
  if (!acct) return; lastPoll = Date.now();
  try {
    const j = await call('learn_me'); if (!j || !j.ok) return;
    const before = hub.unread;
    hub.unread = j.unread || 0; hub.requests = j.requests || 0; hub.duels = j.duels || 0; hub.me = j;
    if (j.avatar !== undefined && acct) acct.avatar = j.avatar;
    Object.assign(walls.vipState, { vip: j.vip || 0, pts: j.vip_pts || 0, bonus: j.bonus || 0, server: true });
    paintBadges();
    if (first || hub.unread > before) await loadNotifs(!first);
    if (first || !hub.friends || Date.now() - hub.fAt > 120000) loadFriends();
    walls.checkVip();
  } catch (e) {}
}
function paintBadges() {
  document.querySelectorAll('.bell').forEach((b) => { let x = b.querySelector('.badge'); if (hub.unread) { if (!x) { x = document.createElement('i'); x.className = 'badge'; b.appendChild(x); } x.textContent = hub.unread > 99 ? '99+' : hub.unread; } else if (x) x.remove(); });
}
async function loadNotifs(fresh) {
  try {
    const j = await call('learn_notifs'); if (!j || !j.ok) return;
    const old = new Set(hub.items.map((x) => x.id));
    hub.items = j.items || []; hub.unread = j.unread || 0; paintBadges();
    if (!fresh) return;
    const nw = hub.items.filter((x) => !x.read && !old.has(x.id) && !(x.payload && x.payload.silent));
    if (!nw.length) return;
    sfx('quest');
    document.querySelectorAll('.bell').forEach((b) => { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); });
    toast(text(nw[0]).t);
    // nhận được hình nền (quà, thắng quiz) → đồng bộ bộ sưu tập ngay
    if (nw.some((x) => x.kind === 'gift' || (x.kind === 'quiz_win' && x.payload && x.payload.wall))) walls.syncWalls();
    const panel = document.querySelector('.np'); if (panel) drawPanel(panel);
  } catch (e) {}
}

/* ---------- nội dung từng loại thông báo ---------- */
function text(n) {
  const who = `<b>${esc(n.name || 'Someone')}</b>`, p = n.payload || {}, w = p.wall ? walls.wallOf(p.wall).name : '';
  switch (n.kind) {
    case 'friend_req': return { t: `${n.name} wants to be friends`, h: `${who} wants to be friends`, ic: 'users', act: [['Accept', 'fr-ok'], ['Decline', 'fr-no']] };
    case 'friend_ok': return { t: `${n.name} is now your friend`, h: `${who} accepted your friend request`, ic: 'users', go: '#/friends' };
    case 'quiz': return { t: `${n.name} invited you to a live quiz`, h: `${who} invited you to the live quiz <b>${esc(p.title || '')}</b>`, ic: 'zap', act: [['Join', 'go'], ['Later', 'read']], go: '#/play/' + p.pin };
    case 'class': return { t: `${n.name} invited you to a class`, h: `${who} invited you to the class <b>${esc(p.name || '')}</b>`, ic: 'school', act: [['Join', 'go'], ['Later', 'read']], go: '#/classes/join/' + p.code };
    case 'duel': return { t: `${n.name} challenged you to a duel`, h: `${who} challenged you to a duel. Same 10 questions, beat their score.`, ic: 'swords', act: [['Play', 'go']], go: '#/duel/' + p.duel };
    case 'duel_done': return { t: p.draw ? `Duel with ${n.name}: draw` : p.won ? `You beat ${n.name}!` : `${n.name} won the duel`, h: p.draw ? `Your duel with ${who} ended in a draw. +2 VIP points each.` : p.won ? `You beat ${who}. Pick a wallpaper from their collection.` : `${who} won your duel. You keep everything; +1 VIP point.`, ic: 'swords', act: p.won ? [['Pick prize', 'go']] : null, go: '#/duel/' + p.duel };
    case 'duel_declined': return { t: `${n.name} declined your duel`, h: `${who} declined your duel`, ic: 'swords', go: '#/duel' };
    case 'duel_pick': return { t: `${n.name} picked ${w} as a duel prize`, h: `${who} won your duel and copied <b>${esc(w)}</b> into their collection. You still have it.`, ic: 'swords', go: '#/duel' };
    case 'gift': return { t: `${n.name} sent you ${w}`, h: `${who} sent you <b>${esc(w)}</b>`, ic: 'gift', act: [['View', 'go']], go: '#/collection', wall: p.wall };
    case 'quiz_win': return { t: p.rank === 1 ? `You won ${p.title}!` : `${p.rank === 2 ? '2nd' : '3rd'} place in ${p.title}`, h: p.rank === 1 ? `You won <b>${esc(p.title)}</b>. +${p.pts} VIP points${w ? ` and <b>${esc(w)}</b>` : ''}.` : `You finished ${p.rank === 2 ? '2nd' : '3rd'} in <b>${esc(p.title)}</b>. +${p.pts} VIP points.`, ic: 'trophy', go: w ? '#/collection' : '#/quiz', wall: p.wall };
    default: return { t: 'New notification', h: 'New notification', ic: 'bell' };
  }
}
export function bellHTML() { return acct ? `<button class="icon-btn bell" type="button" title="Notifications" aria-label="Notifications">${I.bell}${hub.unread ? `<i class="badge">${hub.unread > 99 ? '99+' : hub.unread}</i>` : ''}</button>` : ''; }
export function wireBell(root) {
  root.querySelectorAll('.bell').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openPanel(b); }));
}
let panelOff = null;
function openPanel(btn) {
  if (panelOff) { panelOff(); return; }
  sfx('open');
  if (innerWidth < 700) { sheet('<h2>Notifications</h2><div class="np in-sheet"></div>', (el) => drawPanel(el.querySelector('.np'))); loadNotifs(false).then(() => { const p = document.querySelector('.np'); if (p) drawPanel(p); }); return; }
  const r = btn.getBoundingClientRect(), p = document.createElement('div');
  p.className = 'np panel solid'; p.style.cssText = `top:${r.bottom + 10}px;right:${Math.max(10, innerWidth - r.right - 10)}px`;
  document.body.appendChild(p); drawPanel(p);
  loadNotifs(false).then(() => { if (p.isConnected) drawPanel(p); });
  const off = (e) => { if (!p.contains(e.target) && !btn.contains(e.target)) panelOff(); };
  panelOff = () => { p.remove(); document.removeEventListener('pointerdown', off); panelOff = null; };
  setTimeout(() => document.addEventListener('pointerdown', off), 0);
}
function drawPanel(p) {
  const items = hub.items;
  p.innerHTML = `<div class="np-h"><b>Notifications</b>${hub.unread ? `<button class="np-all" type="button">Mark all read</button>` : ''}</div>
    <div class="np-list">${items.length ? items.map((n) => { const t = text(n); return `<div class="np-i ${n.read ? '' : 'new'}" data-id="${n.id}">
      <span class="np-av">${vipAv(n.name || '?', n.avatar, n.vip || 0)}<span class="np-k">${I[t.ic]}</span></span>
      <div class="np-b"><p>${t.h}</p>${t.wall ? `<img class="np-w" src="${walls.poster(t.wall)}" alt="">` : ''}<small>${ago(n.at)}</small>
      ${t.act && !n.read ? `<div class="np-a">${t.act.map(([l, a], k) => `<button class="btn sm ${k ? 'ghost' : 'acc'}" type="button" data-a="${a}">${l}</button>`).join('')}</div>` : ''}</div></div>`; }).join('') : `<div class="np-empty">${I.bell}<p>Nothing new. Friend requests, invites, duels and gifts show up here.</p></div>`}</div>`;
  const all = p.querySelector('.np-all'); if (all) all.addEventListener('click', async () => { hub.items.forEach((x) => { x.read = true; }); hub.unread = 0; paintBadges(); drawPanel(p); try { await call('learn_notifs_read', { p_ids: null }); } catch (e) {} });
  p.querySelectorAll('.np-i').forEach((row) => {
    const n = hub.items.find((x) => x.id === +row.dataset.id), t = text(n);
    const mark = () => { if (n.read) return; n.read = true; hub.unread = Math.max(0, hub.unread - 1); paintBadges(); call('learn_notifs_read', { p_ids: [n.id] }).catch(() => {}); };
    row.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation(); const a = b.dataset.a;
      if (a === 'fr-ok' || a === 'fr-no') { try { await call('learn_friend_respond', { p_uid: n.actor, p_accept: a === 'fr-ok' }); toast(a === 'fr-ok' ? `You and ${n.name} are friends now` : 'Request declined'); sfx(a === 'fr-ok' ? 'ok' : 'tap'); n.read = true; hub.unread = Math.max(0, hub.unread - 1); paintBadges(); drawPanel(p); loadFriends(); } catch (er) { toast(er.message); } return; }
      mark();
      if (a === 'go' && t.go) { if (panelOff) panelOff(); document.getElementById('sheet-root').innerHTML = ''; location.hash = t.go; }
      else drawPanel(p);
    }));
    row.addEventListener('click', () => { if (t.act && !n.read) return; mark(); if (t.go) { if (panelOff) panelOff(); document.getElementById('sheet-root').innerHTML = ''; location.hash = t.go; } });
  });
}

/* ---------- danh sách bạn (cạnh phải) ---------- */
export async function loadFriends() {
  if (!acct) return;
  try { const j = await call('learn_friends_list'); if (j && j.ok) { hub.friends = j; hub.fAt = Date.now(); renderRail(); } } catch (e) {}
}
function ranked() {
  const d = hub.friends; if (!d) return [];
  const fr = (d.items || []).filter((x) => x.status === 'accepted');
  const all = [...fr, { ...d.me, me: true, last_seen: new Date().toISOString() }].sort((a, b) => (b.week_xp || 0) - (a.week_xp || 0));
  all.forEach((x, i) => { x.rank = i + 1; });
  return all;
}
function railInner() {
  if (!acct) return `<div class="rl-h"><b>Friends</b></div><div class="rl-empty">${I.users}<p>Sign in to see friends, who is online and the weekly ranking.</p><button class="btn sm acc rl-in" type="button">Sign in</button></div>`;
  const d = hub.friends;
  if (!d) return `<div class="rl-h"><b>Friends</b></div><p class="muted" style="padding:14px">Loading…</p>`;
  const all = ranked(), on = all.filter((x) => !x.me && online(x.last_seen)), inc = (d.items || []).filter((x) => x.incoming);
  const sorted = [...all].sort((a, b) => (a.me ? -1 : b.me ? 1 : 0) || (online(b.last_seen) - online(a.last_seen)) || a.rank - b.rank);
  return `<div class="rl-h"><b>Friends</b><span class="rl-on"><i></i>${on.length} online</span><button class="icon-btn rl-x" type="button" title="Hide friends">${I.chev}</button></div>
    ${inc.length ? `<a class="rl-req" href="#/friends">${I.users}<span>${inc.length} friend request${inc.length > 1 ? 's' : ''}</span>${I.chev}</a>` : ''}
    <div class="rl-list">${sorted.map((x) => `<div class="rl-i ${x.me ? 'me' : ''} ${online(x.last_seen) ? 'on' : ''}" data-u="${x.uid}">
      <span class="rl-rk ${x.rank <= 3 ? 'top t' + x.rank : ''}">${x.rank}</span>
      <span class="rl-av">${vipAv(x.name, x.avatar, x.vip || 0)}${!x.me && online(x.last_seen) ? '<i class="dot"></i>' : ''}</span>
      <span class="rl-n"><b>${esc(x.name)}${x.me ? ' (you)' : ''}</b><small>${x.week_xp || 0} XP this week${x.me ? '' : online(x.last_seen) ? ' · online' : ` · ${ago(x.last_seen).replace(' ago', '')}`}</small></span>
      ${x.me ? '' : `<span class="rl-a"><button class="icon-btn sm rl-duel" type="button" title="Challenge to a duel">${I.swords}</button><button class="icon-btn sm rl-gift" type="button" title="Share a wallpaper">${I.gift}</button></span>`}</div>`).join('')}</div>
    ${all.length < 2 ? `<div class="rl-empty"><p>No friends yet. Share your code <b>${esc(d.me && d.me.code || '')}</b> or add someone.</p></div>` : ''}
    <div class="rl-f"><a class="btn sm ghost" href="#/friends">${I.plus} Add friends</a><a class="btn sm ghost" href="#/duel">${I.swords} Duels</a></div>`;
}
// cột bạn bè nằm trong bố cục trang (cùng khoảng cách với các cột khác)
export function renderRail() {
  document.querySelectorAll('.layout > .rail').forEach((r) => { r.innerHTML = railInner(); wireRail(r); });
  applyChrome();
}
function wireRail(r) {
  const x = r.querySelector('.rl-x'); if (x) x.addEventListener('click', () => toggleRail(false));
  const si = r.querySelector('.rl-in'); if (si) si.addEventListener('click', () => C.authSheet('login'));
  r.querySelectorAll('.rl-duel').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); document.getElementById('sheet-root').innerHTML = ''; location.hash = '#/duel/new/' + b.closest('.rl-i').dataset.u; }));
  r.querySelectorAll('.rl-gift').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); walls.shareSheet(); }));
}
function railSheet() {
  if (!acct) { C.authSheet('login'); return; }
  sheet('<div class="rail in-sheet"></div>', (el) => { const r = el.querySelector('.rail'); r.innerHTML = railInner(); wireRail(r); const x = r.querySelector('.rl-x'); if (x) x.remove(); });
  loadFriends();
}

/* ---------- mời bạn: quiz (PIN) hoặc lớp học ---------- */
const INV_ERR = { notfriend: 'Only friends can be invited.', limit: 'Too many invites this hour. Try again later.', nogame: 'This game has ended.', notmember: 'You are not in this class.' };
export async function inviteSheet(kind, payload, title) {
  if (!acct) return;
  if (!hub.friends || Date.now() - hub.fAt > 60000) await loadFriends();
  const fr = ((hub.friends && hub.friends.items) || []).filter((x) => x.status === 'accepted').sort((a, b) => online(b.last_seen) - online(a.last_seen));
  sheet(`<h2>Invite friends</h2><p class="sub">${kind === 'quiz' ? `They get a notification with the PIN for <b>${esc(title)}</b>.` : `They get a notification to join <b>${esc(title)}</b>.`}</p>
    ${fr.length ? `<div class="list inv-l">${fr.map((f) => `<div class="row"><span class="rl-av">${vipAv(f.name, f.avatar, f.vip || 0)}${online(f.last_seen) ? '<i class="dot"></i>' : ''}</span><span class="grow"><b>${esc(f.name)}</b><small>${online(f.last_seen) ? 'online now' : 'seen ' + ago(f.last_seen)}</small></span><button class="btn sm acc inv" type="button" data-u="${f.uid}">Invite</button></div>`).join('')}</div>
    <button class="btn ghost wide inv-all" type="button" style="margin-top:12px">Invite everyone online</button>` : '<p class="muted">Add friends first. They appear here.</p>'}`, (el) => {
    const send = async (b) => {
      b.disabled = true;
      try { const j = await call('learn_invite', { p_to: +b.dataset.u, p_kind: kind, p_payload: payload }); if (!j.ok) { toast(INV_ERR[j.error] || j.error); b.disabled = false; return; } b.textContent = 'Invited'; b.classList.remove('acc'); b.classList.add('ghost'); sfx('ok'); }
      catch (e) { toast(e.message); b.disabled = false; }
    };
    el.querySelectorAll('.inv').forEach((b) => b.addEventListener('click', () => send(b)));
    const all = el.querySelector('.inv-all'); if (all) all.addEventListener('click', () => { const on = fr.filter((f) => online(f.last_seen)).map((f) => String(f.uid)); if (!on.length) { toast('Nobody is online right now'); return; } el.querySelectorAll('.inv').forEach((b) => { if (on.includes(b.dataset.u) && !b.disabled) send(b); }); });
  });
}
