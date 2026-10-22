// Thông báo (lời mời kết bạn, mời vào quiz / lớp, khiêu chiến, quà) + danh sách bạn bè ở cạnh phải màn hình.
// Hỏi máy chủ mỗi 45 giây (learn_me); khi có thông báo mới thì tải danh sách và rung chuông.
import { I, LOGO } from './icons.js?v=21';
import { S, save } from './store.js?v=21';
import * as chat from './chat.js?v=21';
import * as acctui from './acctui.js?v=21';
import { acct, call } from './account.js?v=21';
import { sfx } from './sound.js?v=21';
import { esc, toast, sheet, vipAv, ago, online } from './ui.js?v=21';
import * as walls from './walls.js?v=21';

let C = null;
export const hub = { unread: 0, requests: 0, duels: 0, msgs: 0, items: [], friends: null, me: null, fAt: 0 };
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
    hub.unread = j.unread || 0; hub.requests = j.requests || 0; hub.duels = j.duels || 0; hub.msgs = j.msgs || 0; hub.me = j;
    if (j.avatar !== undefined && acct) acct.avatar = j.avatar;
    Object.assign(walls.vipState, { vip: j.vip || 0, pts: j.vip_pts || 0, bonus: j.bonus || 0, server: true });
    paintBadges();
    if (first || hub.unread > before) await loadNotifs(!first);
    if (first || !hub.friends || Date.now() - hub.fAt > 120000) loadFriends();
    walls.checkVip();
    tick();
    acctui.checkAccount(j);
  } catch (e) {}
}
// xử trận duel hết hạn, chốt bảng tuần và nhận XP thưởng từ máy chủ
async function tick() {
  try {
    const j = await call('learn_tick'); if (!j || !j.ok) return;
    const xp = (j.grants || []).reduce((a, g) => a + (g.xp || 0), 0);
    if (xp > 0) { S.xp += xp; save(true); toast(`+${xp} XP from ranking rewards`); sfx('levelup'); document.querySelectorAll('.xp-n').forEach((x) => { x.textContent = S.xp; }); }
  } catch (e) {}
}
export function paintChat() {
  document.querySelectorAll('.chat-btn').forEach((b) => { let x = b.querySelector('.badge'); if (hub.msgs) { if (!x) { x = document.createElement('i'); x.className = 'badge'; b.appendChild(x); } x.textContent = hub.msgs > 99 ? '99+' : hub.msgs; } else if (x) x.remove(); });
}
chat.setOnUnread(() => { setTimeout(async () => { try { const j = await call('learn_me'); if (j && j.ok) { hub.msgs = j.msgs || 0; paintChat(); } } catch (e) {} }, 300); });
function paintBadges() {
  paintChat();
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
    if (nw.some((x) => x.kind === 'gift' || x.kind === 'rank_reward' || (x.kind === 'duel_done' && x.payload && x.payload.wall) || (x.kind === 'quiz_win' && x.payload && x.payload.wall))) { walls.syncWalls(); tick(); }
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
    case 'duel_done': if (p.forfeit) return p.won ? { t: `${n.name} ran out of time. You win!`, h: `${who} did not answer your duel within 24 hours, so you win${w ? ` and <b>${esc(w)}</b> was added to your collection` : ''}.`, ic: 'swords', go: '#/duel/' + p.duel, wall: p.wall } : { t: `You lost a duel to ${n.name} on time`, h: `You did not answer ${who}’s duel within 24 hours, so it counts as a loss.`, ic: 'swords', go: '#/duel/' + p.duel };
      if (p.won && p.prize === false) return { t: `You beat ${n.name}!`, h: `You beat ${who}. You already took today’s duel prize, so this win counts for the ranking only.`, ic: 'swords', go: '#/duel/' + p.duel };
      return { t: p.draw ? `Duel with ${n.name}: draw` : p.won ? `You beat ${n.name}!` : `${n.name} won the duel`, h: p.draw ? `Your duel with ${who} ended in a draw. +2 VIP points each.` : p.won ? `You beat ${who}. Pick a wallpaper from their collection.` : `${who} won your duel. You keep everything; +1 VIP point.`, ic: 'swords', act: p.won ? [['Pick prize', 'go']] : null, go: '#/duel/' + p.duel };
    case 'duel_declined': return { t: `${n.name} declined your duel`, h: `${who} declined your duel`, ic: 'swords', go: '#/duel' };
    case 'duel_pick': return { t: `${n.name} picked ${w} as a duel prize`, h: `${who} won your duel and copied <b>${esc(w)}</b> into their collection. You still have it.`, ic: 'swords', go: '#/duel' };
    case 'gift': return { t: `${n.name} sent you ${w}`, h: `${who} sent you <b>${esc(w)}</b>`, ic: 'gift', act: [['View', 'go']], go: '#/collection', wall: p.wall };
    case 'quiz_win': return { t: p.rank === 1 ? `You won ${p.title}!` : `${p.rank === 2 ? '2nd' : '3rd'} place in ${p.title}`, h: p.rank === 1 ? `You won <b>${esc(p.title)}</b>. +${p.pts} VIP points${w ? ` and <b>${esc(w)}</b>` : ''}.` : `You finished ${p.rank === 2 ? '2nd' : '3rd'} in <b>${esc(p.title)}</b>. +${p.pts} VIP points.`, ic: 'trophy', go: w ? '#/collection' : '#/quiz', wall: p.wall };
    case 'update': return +p.v >= 21 ? { t: 'New: English B1+ and B2+', h: '<b>New update.</b> Two new English levels (24 units) for engineering and office life, 22 new wallpapers and cheaper XP prices. Your progress is safe.', ic: 'sparkle', act: [['See what’s new', 'new']], fn: () => whatsNew(true) }
      : { t: `New update: ${p.added || 'many'} new units`, h: `<b>New update.</b> ${p.added || 'Many'} new units with practical, everyday topics across English, 中文 and IELTS. Your progress is safe.`, ic: 'sparkle', act: [['See what’s new', 'new']], fn: () => whatsNew(true) };
    case 'rank_reward': {
      const ws = p.walls || [], wn = ws.map((x) => walls.wallOf(x).name), course = { en: 'English', zh: '中文', ielts: 'IELTS', duel: 'Duel' }[p.board] || '';
      const gift = [wn.length ? `<b>${wn.map(esc).join('</b> and <b>')}</b>` : '', p.xp ? `<b>${p.xp} XP</b>` : ''].filter(Boolean).join(' and ');
      return p.board === 'duel'
        ? { t: `Top ${p.rank} in last week’s duels!`, h: `You finished <b>#${p.rank}</b> in last week’s duel ranking. Reward: ${gift}.`, ic: 'trophy', go: ws.length ? '#/collection' : '#/duel', wall: ws[0] }
        : { t: `You reached #${p.rank} in ${course}!`, h: `You reached <b>#${p.rank}</b> in the ${esc(course)} ranking. Reward: ${gift}.`, ic: 'trophy', go: ws.length ? '#/collection' : '#/', wall: ws[0] };
    }
    case 'security': return p.what === 'pin' ? { t: 'Your PIN was changed', h: '<b>Your PIN was changed.</b> If this was not you, use “Forgot your PIN?” on the sign-in screen right away.', ic: 'lock' } : { t: 'Your email or phone was changed', h: '<b>Your email or phone number was changed.</b> If this was not you, use “Forgot your PIN?” on the sign-in screen right away.', ic: 'lock' };
    case 'msg': return { t: `${n.name} sent you a message`, h: `${who} sent you a message`, ic: 'chat' };
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
      <span class="np-av">${n.kind === 'update' ? `<span class="np-brand">${LOGO}</span>` : vipAv(n.name || '?', n.avatar, n.vip || 0)}<span class="np-k">${I[t.ic]}</span></span>
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
      if (a === 'new' && t.fn) { if (panelOff) panelOff(); t.fn(); return; }
      if (a === 'go' && t.go) { if (panelOff) panelOff(); document.getElementById('sheet-root').innerHTML = ''; location.hash = t.go; }
      else drawPanel(p);
    }));
    row.addEventListener('click', () => { if (t.act && !n.read) return; mark(); if (t.fn) { if (panelOff) panelOff(); t.fn(); return; } if (t.go) { if (panelOff) panelOff(); document.getElementById('sheet-root').innerHTML = ''; location.hash = t.go; } });
  });
}

/* ---------- có gì mới (hiện 1 lần mỗi bản cập nhật nội dung) ---------- */
const NEWS = { v: 21, levels: [
  { lv: 'b1p', name: 'English B1+', sub: 'English for our engineering office', topics: ['Reading construction drawings', 'Beams, columns and loads', 'Timber trusses and wall panels', 'QA and QC checks', 'Daily stand-up with an overseas team', 'Timesheets, overtime and leave', 'Showing visitors around Ho Chi Minh City', 'Vietnamese food and culture explained'] },
  { lv: 'b2p', name: 'English B2+', sub: 'Leading projects and people', topics: ['Steel moment connections', 'RFIs and design changes', 'Client kick-off meetings', 'Presenting your project to your boss', 'Recruitment and interviewing', 'Performance reviews and feedback', 'Pitching Vietnam to overseas clients', 'Cross-cultural communication'] },
] };
const NEWS_KEY = 'dcl_news_' + NEWS.v;
const seenNews = () => { try { return localStorage.getItem(NEWS_KEY) === '1'; } catch (e) { return true; } };
const markNews = () => { try { localStorage.setItem(NEWS_KEY, '1'); } catch (e) {} };
export function whatsNew(force) {
  if (!force && (seenNews() || !S.onboarded)) { if (!S.onboarded) markNews(); return; }
  if (!force && document.querySelector('.ovl, .player, .sheet')) return;
  markNews();
  if (acct) call('learn_notifs_read_kind', { p_kind: 'update' }).then(() => { hub.items.forEach((x) => { if (x.kind === 'update' && !x.read) { x.read = true; hub.unread = Math.max(0, hub.unread - 1); } }); paintBadges(); }).catch(() => {});
  sfx('quest');
  sheet(`<div class="wn">
    <div class="wn-h"><span class="wn-logo">${LOGO}</span><div><h2>Two new English levels</h2><p class="sub">B1+ and B2+: 24 units (192 lessons) built around an engineering office — drawings, steel and timber, client meetings, presenting to your boss, HR, and showing Vietnam to overseas visitors. Your progress and wallpapers are untouched.</p></div></div>
    <div class="wn-c">${NEWS.levels.map((c) => `<section class="wn-k" data-l="en">
      <div class="wn-kh"><b>${c.name}</b><span class="wn-n"><em>12</em> units</span></div>
      <p class="muted" style="margin:0 0 6px">${esc(c.sub)}</p>
      <ul>${c.topics.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <button class="btn sm ${S.lang === 'en' ? 'acc' : 'ghost'} wn-go" type="button" data-lv="${c.lv}">Open ${c.name.replace('English ', '')}</button>
    </section>`).join('')}</div>
    <p class="wn-note">${I.sparkle}<span>Also new: 22 wallpapers (72–93) in the B1+ and B2+ chests and bosses, wallpapers cost 40% less XP, duels now go from easy to expert with general-knowledge questions, and the phone layout is easier to use.</span></p>
  </div>`, (el, close) => {
    el.querySelectorAll('.wn-go').forEach((b) => b.addEventListener('click', () => { close(); C.goTo('en', b.dataset.lv); }));
  }, 'wide');
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
/* ---------- bảng xếp hạng toàn máy chủ (trên danh sách bạn) ---------- */
const RK_TABS = [['en', 'EN'], ['zh', '中文'], ['ielts', 'IELTS'], ['duel', 'Duel']];
const rk = { tab: (() => { try { return localStorage.getItem('dcl_rk') || ''; } catch (e) { return ''; } })(), data: {}, at: {}, open: pref('dcl_rk_open', true), busy: '' };
const rkTab = () => rk.tab || (['en', 'zh', 'ielts'].includes(S.lang) ? S.lang : 'en');
export async function loadRank(board = rkTab(), force = false) {
  if (rk.busy === board || (!force && rk.data[board] && Date.now() - rk.at[board] < 60000)) return;
  rk.busy = board;
  try { const j = await call('learn_rank_board', { p_board: board }); if (j && j.ok) { rk.data[board] = j; rk.at[board] = Date.now(); } } catch (e) {}
  rk.busy = '';
  document.querySelectorAll('.rk').forEach((el) => paintRank(el));
}
const medal = (n) => n <= 3 ? `<span class="rk-n m${n}">${n}</span>` : `<span class="rk-n">${n}</span>`;
function rankRows(board) {
  const d = rk.data[board];
  if (!d) return '<p class="rk-load">Loading…</p>';
  const duel = board === 'duel', unit = duel ? 'pts' : '★';
  const items = d.items || [];
  const rows = items.map((x) => `<div class="rk-i ${x.rel === 'me' ? 'me' : ''}" data-u="${x.uid}">${medal(x.rank)}<span class="rk-av">${vipAv(x.name, x.avatar, x.vip || 0)}</span>
      <span class="rk-t"><b>${esc(x.name)}${x.rel === 'me' ? ' (you)' : ''}</b><small>${x.score} ${unit}${duel ? ` · ${x.wins}W / ${x.played}` : ''}</small></span>
      ${x.rel !== 'me' ? `<button class="icon-btn sm rk-duel" type="button" title="Challenge ${esc(x.name)} to a duel" aria-label="Duel">${I.swords}</button>` : ''}${x.rel === 'none' ? `<button class="icon-btn sm rk-add" type="button" title="Add ${esc(x.name)} as a friend" aria-label="Add friend">${I.plus}</button>` : x.rel === 'sent' ? '<span class="rk-s">Sent</span>' : x.rel === 'incoming' ? '<a class="rk-s acc" href="#/friends">Accept</a>' : x.rel === 'friend' ? `<span class="rk-s ok" title="Friend">${I.check}</span>` : ''}</div>`).join('');
  const meIn = items.some((x) => x.rel === 'me');
  const me = d.me && !meIn ? `<div class="rk-i me out">${medal(d.me.rank)}<span class="rk-av">${vipAv(acct ? acct.name : 'You', acct && acct.avatar, walls.myVip())}</span><span class="rk-t"><b>You</b><small>${d.me.score} ${unit}</small></span></div>` : '';
  const empty = !items.length ? `<p class="rk-load">${duel ? 'No duels finished this week yet. Win one to take #1.' : 'Nobody has stars here yet. Finish a lesson to take #1.'}</p>` : '';
  const end = new Date(d.week_end + 'T00:00:00+07:00'), days = Math.max(0, Math.ceil((end - Date.now()) / 86400000));
  const got = (d.mine || []).length;
  const note = duel ? `Win 3 pts, draw 1. Resets in ${days} day${days === 1 ? '' : 's'}. The weekly top 10 get XP and a rare wallpaper.`
    : `Stars from every lesson in this course. Each rank you reach pays once: #1 two wallpapers, #2 a rare one, #3 a random one, #4–10 XP.${got ? ` You have collected ${got}/10.` : ''}`;
  return `<div class="rk-list">${rows}${empty}</div>${me}<p class="rk-note">${note}</p>`;
}
function paintRank(el) {
  const b = rkTab();
  el.classList.toggle('shut', !rk.open);
  el.querySelectorAll('.rk-tabs button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.b === b));
  const body = el.querySelector('.rk-body'); if (body) body.innerHTML = rankRows(b);
  el.querySelectorAll('.rk-duel').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation(); const row = btn.closest('.rk-i'), d = rk.data[b], x = d && d.items.find((i) => String(i.uid) === row.dataset.u); if (!x) return;
    try { sessionStorage.setItem('dcl_duel_target', JSON.stringify({ uid: x.uid, name: x.name, avatar: x.avatar, vip: x.vip, rel: x.rel })); } catch (er) {}
    sfx('tap'); document.getElementById('sheet-root').innerHTML = ''; location.hash = '#/duel/new/' + x.uid;
  }));
  el.querySelectorAll('.rk-add').forEach((btn) => btn.addEventListener('click', async (e) => {
    e.stopPropagation(); const row = btn.closest('.rk-i'), d = rk.data[b], x = d && d.items.find((i) => String(i.uid) === row.dataset.u); if (!x) return;
    btn.disabled = true;
    try {
      const j = await call('learn_friend_request', { p_who: x.name });
      if (j && j.ok) { x.rel = j.accepted ? 'friend' : 'sent'; sfx('ok'); toast(j.accepted ? `You and ${x.name} are friends now` : `Friend request sent to ${x.name}`); Object.values(rk.data).forEach((dd) => (dd.items || []).forEach((i) => { if (i.uid === x.uid) i.rel = x.rel; })); paintRank(el); if (j.accepted) loadFriends(); }
      else { toast({ pending: 'Request already sent.', already: 'You are already friends.', limit: 'Friend list is full.' }[j && j.error] || 'Could not send the request.'); btn.disabled = false; }
    } catch (er) { toast(er.message); btn.disabled = false; }
  }));
}
function rankHTML() {
  return `<section class="rk ${rk.open ? '' : 'shut'}"><button class="rk-h" type="button" aria-expanded="${rk.open}"><span class="rk-ic">${I.trophy}</span><b>Ranking</b><small>Top 10 · all learners</small>${I.chevDown}</button>
    <div class="rk-tabs seg" role="tablist">${RK_TABS.map(([k, l]) => `<button type="button" data-b="${k}" class="${k === 'zh' ? 'zh' : ''}" aria-pressed="${rkTab() === k}">${l}</button>`).join('')}</div>
    <div class="rk-body">${rankRows(rkTab())}</div></section>`;
}
function wireRank(r) {
  const el = r.querySelector('.rk'); if (!el) return;
  paintRank(el);
  el.querySelector('.rk-h').addEventListener('click', () => { rk.open = !rk.open; setPref('dcl_rk_open', rk.open); sfx('tap'); el.classList.toggle('shut', !rk.open); el.querySelector('.rk-h').setAttribute('aria-expanded', rk.open); });
  el.querySelectorAll('.rk-tabs button').forEach((b) => b.addEventListener('click', () => { rk.tab = b.dataset.b; try { localStorage.setItem('dcl_rk', rk.tab); } catch (e) {} sfx('tap'); paintRank(el); loadRank(rk.tab); }));
  loadRank(rkTab());
}
function railInner() {
  if (!acct) return `<div class="rl-h"><b>Friends</b></div><div class="rl-empty">${I.users}<p>Sign in to see friends, who is online and the weekly ranking.</p><button class="btn sm acc rl-in" type="button">Sign in</button></div>`;
  const d = hub.friends;
  if (!d) return `<div class="rl-h"><b>Friends</b></div><p class="muted" style="padding:14px">Loading…</p>`;
  const all = ranked(), on = all.filter((x) => !x.me && online(x.last_seen)), inc = (d.items || []).filter((x) => x.incoming);
  const sorted = [...all].sort((a, b) => (a.me ? -1 : b.me ? 1 : 0) || (online(b.last_seen) - online(a.last_seen)) || a.rank - b.rank);
  return `${rankHTML()}<div class="rl-h"><b>Friends</b><span class="rl-on"><i></i>${on.length} online</span><button class="icon-btn sm rl-msg" type="button" title="Messages" aria-label="Messages">${I.chat}</button><button class="icon-btn rl-x" type="button" title="Hide friends">${I.chev}</button></div>
    ${inc.length ? `<a class="rl-req" href="#/friends">${I.users}<span>${inc.length} friend request${inc.length > 1 ? 's' : ''}</span>${I.chev}</a>` : ''}
    <div class="rl-list">${sorted.map((x) => `<div class="rl-i ${x.me ? 'me' : ''} ${online(x.last_seen) ? 'on' : ''}" data-u="${x.uid}">
      <span class="rl-rk ${x.rank <= 3 ? 'top t' + x.rank : ''}">${x.rank}</span>
      <span class="rl-av">${vipAv(x.name, x.avatar, x.vip || 0)}${!x.me && online(x.last_seen) ? '<i class="dot"></i>' : ''}</span>
      <span class="rl-n"><b>${esc(x.name)}${x.me ? ' (you)' : ''}</b><small>${x.week_xp || 0} XP this week${x.me ? '' : online(x.last_seen) ? ' · online' : ` · ${ago(x.last_seen).replace(' ago', '')}`}</small></span>
      ${x.me ? '' : `<span class="rl-a"><button class="icon-btn sm rl-chat" type="button" title="Send a message">${I.chat}</button><button class="icon-btn sm rl-duel" type="button" title="Challenge to a duel">${I.swords}</button><button class="icon-btn sm rl-gift" type="button" title="Share a wallpaper">${I.gift}</button></span>`}</div>`).join('')}</div>
    ${all.length < 2 ? `<div class="rl-empty"><p>No friends yet. Share your code <b>${esc(d.me && d.me.code || '')}</b> or add someone.</p></div>` : ''}
    <div class="rl-f"><a class="btn sm ghost rl-addf" href="#/friends">${I.plus} Add friends</a><a class="btn sm ghost rl-duels" href="#/duel">${I.swords} Duels</a></div>`;
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
  r.querySelectorAll('.rl-chat').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); const f = ranked().find((x) => String(x.uid) === b.closest('.rl-i').dataset.u); if (f) { document.getElementById('sheet-root').innerHTML = ''; chat.openDM(f); } }));
  const rm = r.querySelector('.rl-msg'); if (rm) rm.addEventListener('click', () => { document.getElementById('sheet-root').innerHTML = ''; chat.openChats(); });
  wireRank(r);
}
export function railSheet() {
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
