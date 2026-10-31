// Thông báo (lời mời kết bạn, mời vào quiz / lớp, khiêu chiến, quà) + danh sách bạn bè ở cạnh phải màn hình.
// Hỏi máy chủ mỗi 45 giây (learn_me); khi có thông báo mới thì tải danh sách và rung chuông.
import { I, LOGO } from './icons.js?v=43';
import { S, save, applyRevoke } from './store.js?v=43';
import * as chat from './chat.js?v=43';
import * as acctui from './acctui.js?v=43';
import { acct, call, onLucky } from './account.js?v=43';
import { sfx } from './sound.js?v=43';
import { esc, toast, sheet, vipAv, ago, online, confirmBox } from './ui.js?v=43';
import * as walls from './walls.js?v=43';
import * as bestie from './bestie.js?v=43';
import * as gacha from './gacha.js?v=43';
import * as ctx from './ctx.js?v=43';

let C = null;
export const hub = { unread: 0, requests: 0, duels: 0, msgs: 0, items: [], friends: null, me: null, fAt: 0 };
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch (e) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (e) {} };
export const ui = { rail: pref('dcl_rail', true), hud: pref('dcl_hud', true), side: pref('dcl_side', true), lcol: pref('dcl_lcol', true) };

export function init(ctx) {
  C = ctx;
  applyChrome(); start();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && acct && Date.now() - lastPoll > 30000) poll(); });
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(applyChrome, 150); });
}
let rz = 0, lastPoll = 0, ticking = 0, pinging = 0;
/* ---------- v23: thu hồi do máy chủ quyết định (áp lên tiến trình trên máy, báo 1 lần) ---------- */
function revokeCheck(rv) {
  if (!rv || !rv.id || ((S.fix && S.fix.rv) || 0) >= rv.id) return;
  if (!applyRevoke(rv)) return;
  if (C && C.render && (location.hash || '#/') === '#/' && !document.querySelector('.player, .ovl')) C.render();
  setTimeout(() => sheet(`<h2>Your progress was adjusted</h2><p class="sub">${rv.stars} English stars earned with the old Test out shortcut were removed, together with the matching VIP points (VIP ${rv.vip_before} → ${rv.vip_after}). Your XP and your wallpapers stay exactly as they were. Take the lessons again to win the stars back.</p><button class="btn acc wide rvk-ok" type="button">OK</button>`, (el, close) => el.querySelector('.rvk-ok').addEventListener('click', close)), 1500);
}
/* ---------- v23: lời mời quiz nhóm (tự vào phòng chờ) và Vượt ải Bestie ---------- */
const seenInv = new Set();
function pendingInvites(j) {
  const busy = () => !!document.querySelector('.player, .du-stage, .qz-stage, .adv-stage, .tour, .gate') || document.body.classList.contains('quizzing');
  if (j.gquiz && j.gquiz.pin && !seenInv.has('g' + j.gquiz.nid)) {
    seenInv.add('g' + j.gquiz.nid);
    if (busy()) toast(`${j.gquiz.host || 'A friend'} started a group quiz in ${j.gquiz.gname || 'your group'} · PIN ${j.gquiz.pin}`);
    else if (C.autoJoin) C.autoJoin(j.gquiz);
  }
  if (j.adv && j.adv.id && !seenInv.has('a' + j.adv.id) && C.advInvite) { seenInv.add('a' + j.adv.id); C.advInvite(j.adv); }
}
// bắt đầu hỏi máy chủ (gọi lại sau khi đăng nhập)
export function start() {
  applyChrome();
  if (!acct) { hub.friends = null; hub.items = []; hub.unread = 0; const r = document.querySelector('.rail'); if (r) r.innerHTML = railInner(); return; }
  poll(true);
  if (!ticking) ticking = setInterval(() => { if (!document.hidden && acct) poll(); }, 45000);
  // hỏi nhanh 12 giây/lần khi có nhóm hoặc Bestie: quiz nhóm và lời mời Vượt ải tới gần như ngay
  if (!pinging) pinging = setInterval(async () => {
    if (document.hidden || !acct || !hub.me || !((hub.me.groups || 0) > 0 || bestie.has())) return;
    try { const j = await call('learn_ping'); if (j && j.ok) pendingInvites(j); } catch (e) {}
  }, 12000);
}

/* ---------- ẩn / hiện menu trên và danh sách bạn ---------- */
const wide = () => innerWidth >= 1500;
export function applyChrome() {
  const b = document.body;
  b.classList.toggle('hud-off', !ui.hud);
  b.classList.toggle('has-acct', !!acct);
  b.classList.toggle('rail-on', !!acct && ui.rail && wide());
  b.classList.toggle('side-off', !ui.side);
  b.classList.toggle('lcol-off', !ui.lcol);
  paintTabs();
}
// thẻ dọc ở mép phải để mở lại cột Today / danh sách bạn
function paintTabs() {
  const mk = (cls, html, fn) => { let t = document.querySelector('.' + cls); if (!t) { t = document.createElement('button'); t.type = 'button'; t.className = 'edge-tab ' + cls; t.addEventListener('click', fn); document.body.appendChild(t); } t.innerHTML = html; return t; };
  const on = ranked().filter((x) => !x.me && online(x.last_seen)).length;
  mk('rail-tab', `${I.trophy}<span>Ranking · Friends${on ? ` · ${on}` : ''}</span>`, () => toggleRail(true));
  mk('side-tab', `${I.target}<span>Today</span>`, () => toggleSide(true));
  mk('lv-tab', `${I.list}<span>Levels</span>`, () => toggleLcol(true));
  document.body.classList.toggle('has-side', !!document.querySelector('.layout > .side'));
  document.body.classList.toggle('has-lcol', !!document.querySelector('.layout > .lcol'));
}
export function toggleLcol(v = !ui.lcol) { ui.lcol = v; setPref('dcl_lcol', v); applyChrome(); sfx('tap'); }
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
    Object.assign(walls.vipState, { vip: j.vip || 0, pts: j.vip_pts || 0, bonus: j.bonus || 0, penalty: j.penalty || 0, server: true }); walls.vipSaved();
    if (typeof j.tickets === 'number') gacha.setLeft(j.tickets);
    const hadB = bestie.has(); bestie.fromMe(j);
    if (bestie.has() && (first || !hadB)) bestie.load(true).then(() => bestie.maybeMissYou());
    revokeCheck(j.revoke);
    if (j.gift && C.giftTour) C.giftTour(j.gift);
    pendingInvites(j);
    paintBadges();
    if (first || hub.unread > before) await loadNotifs(!first);
    if (first || !hub.friends || Date.now() - hub.fAt > 120000) loadFriends();
    walls.checkVip();
    tick();
    acctui.checkAccount(j);
    duelWait(first);
    if (first) pendingRewards();
  } catch (e) {}
}
// xử trận duel hết hạn, chốt bảng tuần và nhận XP thưởng từ máy chủ
export async function tick(quiet = false) {
  try {
    const j = await call('learn_tick'); if (!j || !j.ok) return 0;
    const gs = j.grants || [], xp = gs.reduce((a, g) => a + (g.xp || 0), 0);
    if (xp > 0) {
      S.xp += xp; save(true); document.querySelectorAll('.xp-n').forEach((x) => { x.textContent = S.xp; });
      const other = gs.filter((g) => /^rank|^duel-week/.test(String(g.source || ''))).reduce((a, g) => a + (g.xp || 0), 0);
      const duelX = gs.filter((g) => g.source === 'duel-xp').reduce((a, g) => a + (g.xp || 0), 0), advX = gs.filter((g) => g.source === 'adv').reduce((a, g) => a + (g.xp || 0), 0);
      if (!quiet && other > 0) { toast(`+${other} XP from ranking rewards`); sfx('levelup'); }
      else if (!quiet && advX > 0) toast(`+${advX} XP from Adventure`);
      else if (!quiet && duelX > 0) toast(`+${duelX} XP from duels`);
    }
    return xp;
  } catch (e) { return 0; }
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
    if (nw.some((x) => x.kind === 'rank_ticket' || (x.payload && x.payload.ticket))) gacha.load(true);
    if (nw.some((x) => /^bestie/.test(x.kind))) { bestie.load(true).then(() => renderRail()); }
    nw.filter((x) => x.kind === 'duel_done' && x.payload && x.payload.won && (x.payload.wall || x.payload.ticket)).forEach((x) => duelReward({ id: x.payload.duel, wall: x.payload.wall, ticket: !!x.payload.ticket, xp: x.payload.xp, opp: x.name, forfeit: x.payload.forfeit }));
    if (nw.some((x) => x.kind === 'duel')) duelWait(false, true);
    const panel = document.querySelector('.np'); if (panel) drawPanel(panel);
  } catch (e) {}
}

/* ---------- v22: quà duel tự động — hiện giữa màn hình rồi bay vào Collection / XP (mỗi trận 1 lần) ---------- */
const RW_KEY = 'dcl_duel_rw';
const rwSeen = () => { try { return JSON.parse(localStorage.getItem(RW_KEY) || '[]'); } catch (e) { return []; } };
const rwMark = (id) => { try { const a = rwSeen().filter((x) => x !== id); a.push(id); localStorage.setItem(RW_KEY, JSON.stringify(a.slice(-80))); } catch (e) {} };
const busyScreen = () => !!document.querySelector('.player, .du-stage, .du-vs, .qz-stage, .gate, .tour, .ovl, .pp') || document.body.classList.contains('quizzing');
const rwQueue = [];
// v24f: 10% mỗi bài học trên Journey map → vé quay (máy chủ quyết định), hiện khi đã rời màn học
let luckyN = 0, luckyT = 0;
function luckyPop() {
  if (!luckyN) return;
  if (busyScreen()) { clearTimeout(luckyT); luckyT = setTimeout(luckyPop, 2500); return; }
  const n = luckyN; luckyN = 0; gacha.load(true).catch(() => {});
  walls.prizePop({ ticket: true, kicker: 'Lucky lesson', title: n > 1 ? `${n} lucky spin tickets` : 'Lucky spin ticket', sub: 'Every lesson has a 10% chance of a spin ticket. Spin it in Collection › Lucky spin.' });
}
onLucky((n) => { luckyN += n; clearTimeout(luckyT); luckyT = setTimeout(luckyPop, 1200); });
export function duelReward(r) {
  if (!r || !r.id || rwSeen().includes(r.id) || rwQueue.some((x) => x.id === r.id)) return;
  rwQueue.push(r); runRewards();
}
let rwT = 0;
async function runRewards() {
  if (rwT || !rwQueue.length) return;
  if (busyScreen()) { rwT = setTimeout(() => { rwT = 0; runRewards(); }, 3000); return; }
  const r = rwQueue.shift(); rwMark(r.id);
  if (r.wall) { try { await walls.syncWalls(); } catch (e) {} await walls.loadCat(); }
  if (r.ticket) { gacha.load(true); walls.prizePop({ ticket: true, kicker: 'Duel prize', title: 'Lucky spin ticket', sub: `Your first duel win today${r.forfeit ? ` (${r.opp || 'they'} ran out of time)` : ''}. Spin it in Collection › Lucky spin.`, onDone: () => { tick(true); setTimeout(runRewards, 400); } }); return; }
  walls.prizePop({ wall: +r.wall || 0, xp: +r.xp || 0, kicker: 'Duel prize',
    sub: r.wall ? `Copied at random from ${r.opp || 'your opponent'}’s collection${r.forfeit ? ' (they ran out of time)' : ''}. They keep it too.` : `${r.opp || 'Your opponent'} had no wallpaper you are missing, so you get XP instead.`,
    onDone: () => { if (r.xp) tick(true); if (location.hash.startsWith('#/collection') && r.wall) walls.syncWalls(); setTimeout(runRewards, 400); } });
}
// lần đầu mở trang: quà của các trận thắng gần đây mà chưa xem (vd. thắng khi đối thủ hết giờ lúc mình offline)
function pendingRewards() {
  const cut = Date.now() - 3 * 86400000;
  hub.items.filter((x) => x.kind === 'duel_done' && x.payload && x.payload.won && (x.payload.wall || x.payload.ticket) && new Date(x.at).getTime() > cut)
    .forEach((x) => duelReward({ id: x.payload.duel, wall: x.payload.wall, ticket: !!x.payload.ticket, xp: x.payload.xp, opp: x.name, forfeit: x.payload.forfeit }));
}

/* ---------- v22: thẻ nổi "có duel đang chờ bạn" (ngoài chuông thông báo) ---------- */
const DW_MINI = 'dcl_dw_mini';
let dwItems = [], dwAt = 0, dwN = -1;
async function duelWait(first, force = false) {
  if (!acct) { paintDuelWait(); return; }
  const n = hub.duels || 0;
  if (!n) { dwItems = []; dwN = 0; paintDuelWait(); return; }
  if (!force && n === dwN && Date.now() - dwAt < 120000) { paintDuelWait(); return; }
  const grew = n > dwN && dwN >= 0; dwN = n; dwAt = Date.now();
  try { const j = await call('learn_duel_list'); if (j && j.ok) dwItems = (j.items || []).filter((d) => d.my_turn && d.role === 'b'); } catch (e) {}
  if (grew || force) { try { sessionStorage.removeItem(DW_MINI); } catch (e) {} }
  paintDuelWait();
}
const dwHidden = () => { const h = location.hash || '#/'; return h.startsWith('#/duel') || h.startsWith('#/play') || h.startsWith('#/host') || !!document.querySelector('.player, .tour, .gate'); };
export function paintDuelWait() {
  let el = document.querySelector('.dw');
  if (!acct || !dwItems.length || dwHidden()) { if (el) el.remove(); return; }
  const mini = (() => { try { return sessionStorage.getItem(DW_MINI) === '1'; } catch (e) { return false; } })();
  const left = (t) => { const h = Math.max(0, Math.round((new Date(t) - Date.now()) / 3600000)); return h >= 1 ? `${h}h left` : 'less than 1h left'; };
  const html = `<div class="dw-h"><span class="dw-ic">${I.swords}</span><span class="grow"><b>${dwItems.length === 1 ? 'A duel is waiting for you' : `${dwItems.length} duels are waiting for you`}</b><small>${mini ? 'Tap to see' : 'Play to beat their score, or decline'}</small></span><button class="icon-btn sm dw-x" type="button" title="Later" aria-label="Later">${I.x}</button></div>
    <div class="dw-list">${dwItems.map((d) => `<div class="dw-i" data-id="${d.id}">${vipAv(d.opp ? d.opp.name : '?', d.opp && d.opp.avatar, d.opp ? d.opp.vip : 0)}<span class="grow"><b>${esc(d.opp ? d.opp.name : 'Someone')}${d.random ? ' <small>· random</small>' : ''}</b><small>Beat ${d.them && d.them.score != null ? d.them.score : '?'} pts · ${left(d.expires_at)}</small></span>
      <button class="btn sm ghost dw-no" type="button">Decline</button>${bestie.has() && !d.passed && (!d.opp || d.opp.uid !== bestie.B.brief.uid) ? `<button class="btn sm ghost dw-pass" type="button" title="Let ${esc(bestie.B.brief.name)} play it">${I.pass} Bestie</button>` : ''}<button class="btn sm acc dw-go" type="button">${I.swords} Play</button></div>`).join('')}</div>`;
  if (!el) { el = document.createElement('section'); el.className = 'dw'; el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
  el.classList.toggle('mini', mini); el.innerHTML = html;
  el.onclick = (e) => {
    if (el.classList.contains('mini')) { try { sessionStorage.removeItem(DW_MINI); } catch (er) {} sfx('tap'); paintDuelWait(); return; }
    if (e.target.closest('.dw-x')) { try { sessionStorage.setItem(DW_MINI, '1'); } catch (er) {} sfx('tap'); paintDuelWait(); return; }
    const row = e.target.closest('.dw-i'); if (!row) return; const id = +row.dataset.id;
    if (e.target.closest('.dw-pass')) { const d = dwItems.find((x) => x.id === id); bestie.passDuel(id, d && d.opp ? d.opp.name : '').then((ok) => { if (ok) { dwItems = dwItems.filter((x) => x.id !== id); hub.duels = Math.max(0, (hub.duels || 1) - 1); dwN = hub.duels; paintDuelWait(); } }); return; }
    if (e.target.closest('.dw-go')) { sfx('tap'); try { sessionStorage.setItem('dcl_duel_autoplay', String(id)); } catch (er) {} el.remove(); location.hash = '#/duel/' + id; }
    else if (e.target.closest('.dw-no')) {
      const d = dwItems.find((x) => x.id === id); if (!d) return;
      (async () => {
        if (!(await confirmBox('Decline this duel?', `${d.opp ? d.opp.name : 'They'} will be told you declined. Nobody gets points.`, 'Decline', true))) return;
        try { await call('learn_duel_decline', { p_id: id }); } catch (er) {}
        dwItems = dwItems.filter((x) => x.id !== id); hub.duels = Math.max(0, (hub.duels || 1) - 1); dwN = hub.duels; paintDuelWait(); toast('Duel declined');
      })();
    }
  };
}
addEventListener('hashchange', () => setTimeout(paintDuelWait, 50));

/* ---------- nội dung từng loại thông báo ---------- */
function text(n) {
  const who = `<b>${esc(n.name || 'Someone')}</b>`, p = n.payload || {}, w = p.wall ? walls.wallOf(p.wall).name : '';
  switch (n.kind) {
    case 'friend_req': return { t: `${n.name} wants to be friends`, h: `${who} wants to be friends`, ic: 'users', act: [['Accept', 'fr-ok'], ['Decline', 'fr-no']] };
    case 'friend_ok': return { t: `${n.name} is now your friend`, h: `${who} accepted your friend request`, ic: 'users', go: '#/friends' };
    case 'quiz': return { t: `${n.name} invited you to a live quiz`, h: `${who} invited you to the live quiz <b>${esc(p.title || '')}</b>`, ic: 'zap', act: [['Join', 'go'], ['Later', 'read']], go: '#/play/' + p.pin };
    case 'class': return { t: `${n.name} invited you to a class`, h: `${who} invited you to the class <b>${esc(p.name || '')}</b>`, ic: 'school', act: [['Join', 'go'], ['Later', 'read']], go: '#/classes/join/' + p.code };
    case 'duel': return p.passed_by ? { t: `${p.passed_by} passed you a duel from ${n.name}`, h: `<b>${esc(p.passed_by)}</b> (your Bestie) passed you a duel from ${who}. Beat their score!`, ic: 'swords', act: [['Play', 'go']], go: '#/duel/' + p.duel }
      : { t: `${n.name} challenged you to a duel`, h: `${who} challenged you to a duel. Same 10 questions, beat their score.${p.scored === false ? ' (Over today’s 10 scored duels: just for fun.)' : ''}`, ic: 'swords', act: [['Play', 'go']], go: '#/duel/' + p.duel };
    case 'duel_passed': return { t: `${n.name} passed your duel to ${p.to}`, h: `${who} passed your duel to their Bestie <b>${esc(p.to || '')}</b>.`, ic: 'swords', go: '#/duel/' + p.duel };
    case 'bestie_req': return { t: `${n.name} wants to be your Bestie`, h: `${who} wants to be your <b>Bestie</b>: share wallpapers, +10% XP when you both study, Bestie Adventure.`, ic: 'heart', act: [['Accept', 'bs-ok'], ['Decline', 'bs-no']] };
    case 'bestie_ok': return { t: `${n.name} is now your Bestie!`, h: `${who} and you are now <b>Besties</b>. Try Bestie Adventure together!`, ic: 'heart', go: '#/adventure' };
    case 'bestie_removed': return { t: `${n.name} removed you as Bestie`, h: `${who} is no longer your Bestie. You are still friends.`, ic: 'heart' };
    case 'bestie_nudge': return { t: `${n.name} misses you!`, h: `${who} (your Bestie) misses you. Do one lesson today: you both get +10% XP.`, ic: 'heart', go: '#/' };
    case 'adv_invite': return { t: `${n.name} wants to fight a boss together`, h: `${who} invited you to <b>Bestie Adventure</b>. Join within 90 seconds!`, ic: 'map', go: '#/adventure' };
    case 'gquiz': return { t: `${n.name} started a group quiz`, h: `${who} started a quiz in your group <b>${esc(p.gname || '')}</b>. PIN ${esc(p.pin || '')}.`, ic: 'zap', act: [['Join', 'go']], go: '#/play/' + p.pin };
    case 'rank_ticket': return { t: `Top ${p.rank} this week: +1 lucky spin ticket`, h: `You finished <b>#${p.rank}</b> in the ${esc({ en: 'English', zh: '中文', ielts: 'IELTS', duel: 'Duel', col: 'Top collector', bestie: 'Bestie' }[p.board] || p.board)} ranking this week. Reward: <b>1 lucky spin ticket</b>.`, ic: 'gift', act: [['Spin', 'spin']], go: '#/collection' };
    case 'revoke': return { t: 'Your stars were adjusted', h: `${p.stars} ${p.lang === 'en' ? 'English' : ''} stars from the old Test out shortcut were removed (VIP ${p.vip_before} → ${p.vip_after}). XP and wallpapers are unchanged.`, ic: 'star' };
    case 'duel_done': {
      const prizeTxt = p.wall ? ` <b>${esc(w)}</b> was copied into your collection.` : p.xp ? ` +${p.xp} XP (they had no wallpaper you are missing).` : '';
      if (p.forfeit) return p.won ? { t: `${n.name} ran out of time. You win!`, h: `${who} did not answer your duel within 24 hours, so you win.${prizeTxt}`, ic: 'swords', go: '#/duel/' + p.duel, wall: p.wall } : { t: `You lost a duel to ${n.name} on time`, h: `You did not answer ${who}’s duel within 24 hours, so it counts as a loss. You keep all your wallpapers.`, ic: 'swords', go: '#/duel/' + p.duel };
      if (p.ticket) return { t: `You beat ${n.name}! +1 lucky spin ticket`, h: `You beat ${who}${p.forfeit ? ' (they ran out of time)' : ''}. Today’s duel prize: <b>1 lucky spin ticket</b>${p.xp ? ` and +${p.xp} XP` : ''}.`, ic: 'swords', go: '#/duel/' + p.duel };
      if (p.won && (p.prize === false || p.xp)) return { t: `You beat ${n.name}!`, h: `You beat ${who}.${p.xp ? ` +${p.xp} XP.` : ''} ${p.scored === false ? 'This one was over today’s 10 scored duels.' : 'You already took today’s ticket, so this win counts for XP and the weekly ranking.'}`, ic: 'swords', go: '#/duel/' + p.duel };
      return { t: p.draw ? `Duel with ${n.name}: draw` : p.won ? `You beat ${n.name}!` : `${n.name} won the duel`, h: p.draw ? `Your duel with ${who} ended in a draw. +2 VIP points each.` : p.won ? `You beat ${who}.${prizeTxt}` : `${who} won your duel. You keep everything; +1 VIP point.`, ic: 'swords', go: '#/duel/' + p.duel, wall: p.won ? p.wall : 0 };
    }
    case 'duel_declined': return { t: `${n.name} declined your duel`, h: `${who} declined your duel`, ic: 'swords', go: '#/duel' };
    case 'duel_pick': return { t: `${n.name} got a copy of ${w}`, h: `${who} won your duel and got a copy of <b>${esc(w)}</b> at random. You still have it.`, ic: 'swords', go: '#/duel' };
    case 'gift': return { t: `${n.name} sent you ${w}`, h: `${who} sent you <b>${esc(w)}</b>`, ic: 'gift', act: [['View', 'go']], go: '#/collection', wall: p.wall };
    case 'quiz_win': return { t: p.rank === 1 ? `You won ${p.title}!` : `${p.rank === 2 ? '2nd' : '3rd'} place in ${p.title}`, h: p.rank === 1 ? `You won <b>${esc(p.title)}</b>. +${p.pts} VIP points${w ? ` and <b>${esc(w)}</b>` : ''}${p.ticket ? ' and <b>1 lucky spin ticket</b>' : ''}.` : `You finished ${p.rank === 2 ? '2nd' : '3rd'} in <b>${esc(p.title)}</b>. +${p.pts} VIP points.`, ic: 'trophy', go: w ? '#/collection' : '#/quiz', wall: p.wall };
    case 'update': return +p.v >= 30 ? { t: 'New: VIP frames with wings, and a live ranking in quizzes', h: '<b>Every VIP rank now has its own frame:</b> copper glint, ember sparks, frost crystals, jade comet, golden stars, royal laurel, arcane rings, angel wings, phoenix wings and the prism crown. In Live quiz, the podium and the top 10 stay on screen from the first question to the last.', ic: 'sparkle', go: '#/collection' }
      : +p.v >= 29 ? { t: 'New: Live rooms, power-ups and a big podium', h: '<b>Quiz is now in the main menu.</b> Jump into any live room (some have a password), get random power-ups like ×2, First blood and Mystery box, hear the questions read aloud, and watch the podium with fireworks. Halloween, Christmas and Lunar New Year rooms too.', ic: 'zap', go: '#/quiz' }
      : +p.v >= 28 ? { t: 'New: B1 for Business, Travel and Everyday Life', h: '<b>60 new B1 units.</b> Business &amp; Office, Travel &amp; Hospitality and Everyday Life now go up to B1, with new chests, a boss for each topic and new wallpapers to win. Switch topics above the level list.', ic: 'sparkle', go: '#/' }
      : +p.v >= 27 ? { t: 'New: Lucky lessons', h: '<b>Every lesson can pay.</b> Each lesson you finish on the Journey map has a 10% chance of a lucky spin ticket. In Adventure, the first win on the first boss and on every region king gives a new wallpaper and a spin ticket; other bosses have a 10% chance of a spin ticket.', ic: 'gift', go: '#/' }
      : +p.v >= 26 ? { t: 'New: Adventure rewards', h: '<b>Adventure is now in the main menu.</b> The first win on the first boss and on every region king gives a random wallpaper and a lucky spin ticket, alone or with your Bestie. The Adventure ranking now counts everyone.', ic: 'map', go: '#/adventure' }
      : +p.v >= 25 ? { t: 'New: Lonely Adventure', h: '<b>No Bestie? You can still play.</b> Adventure now has a Lonely mode: fight the map bosses on your own with the same questions. On a phone, tap <b>Adventure</b> in the bottom bar.', ic: 'map', go: '#/adventure' }
      : +p.v >= 24 ? { t: 'New: 3 more English topics', h: '<b>New update.</b> English now has 4 topics: Engineering, Business &amp; Office, Travel &amp; Hospitality and Everyday Life. 120 new A1–A2 units with their own chests and wallpapers. Switch topics above the level list. Your progress is safe.', ic: 'sparkle', go: '#/' }
      : +p.v >= 23 ? { t: 'New: Bestie, Lucky spin and Adventure', h: '<b>Big update.</b> Pick a Bestie, spin chests for wallpapers, play Bestie Adventure together. Rankings now reset every Monday at 16:00.', ic: 'sparkle', act: [['See what’s new', 'new']], fn: () => whatsNew(true) }
      : +p.v >= 21 ? { t: 'New: English B1+ and B2+', h: '<b>New update.</b> Two new English levels (24 units) for engineering and office life, 22 new wallpapers and cheaper XP prices. Your progress is safe.', ic: 'sparkle', act: [['See what’s new', 'new']], fn: () => whatsNew(true) }
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
// v29: ô thông báo gọn hơn: lọc All / Unread, nhóm "Needs your reply" → Today → Yesterday → This week → Earlier,
// chỉ giữ thông báo cập nhật mới nhất, nút nhỏ "Mark all as read" (cả trên điện thoại)
let npFilter = 'all';
const npDay = (t) => { const d = new Date(t), n = new Date(); const a = new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate()); const days = Math.round(a / 86400000); return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : days < 7 ? 'This week' : 'Earlier'; };
function npItems() {
  let upd = null;
  hub.items.forEach((n) => { if (n.kind === 'update' && (!upd || +((n.payload || {}).v || 0) > +((upd.payload || {}).v || 0) || (+((n.payload || {}).v || 0) === +((upd.payload || {}).v || 0) && new Date(n.at) > new Date(upd.at)))) upd = n; });
  return hub.items.filter((n) => n.kind !== 'update' || n === upd);
}
const NP_SYS = new Set(['update', 'rank_ticket', 'rank_reward', 'revoke', 'security', 'quiz_win']);
function npRow(n) {
  const t = text(n);
  return `<div class="np-i ${n.read ? '' : 'new'}" data-id="${n.id}">
      <span class="np-av">${!n.name || NP_SYS.has(n.kind) ? `<span class="np-brand">${LOGO}</span>` : vipAv(n.name, n.avatar, n.vip || 0)}<span class="np-k">${I[t.ic] || I.bell}</span></span>
      <div class="np-b"><p class="${n.read ? 'clamp' : 'clamp4'}">${t.h}</p>${t.wall ? `<img class="np-w" src="${walls.poster(t.wall)}" alt="">` : ''}
      ${t.act && !n.read ? `<div class="np-a">${t.act.map(([l, a], k) => `<button class="btn sm ${k ? 'ghost' : 'acc'}" type="button" data-a="${a}">${l}</button>`).join('')}</div>` : ''}</div>
      <span class="np-meta"><small>${ago(n.at)}</small>${n.read ? '' : '<i class="np-dot" aria-label="Unread"></i>'}</span></div>`;
}
function drawPanel(p) {
  const shown = npItems(), list = npFilter === 'unread' ? shown.filter((n) => !n.read) : shown;
  const need = list.filter((n) => !n.read && text(n).act), rest = list.filter((n) => !need.includes(n));
  const groups = [];
  if (need.length) groups.push(['Needs your reply', need]);
  ['Today', 'Yesterday', 'This week', 'Earlier'].forEach((g) => { const xs = rest.filter((n) => npDay(n.at) === g); if (xs.length) groups.push([g, xs]); });
  const sc = p.querySelector('.np-list'), top = sc ? sc.scrollTop : 0;
  p.innerHTML = `<div class="np-h"><b>Notifications</b>${hub.unread ? `<em class="np-n">${hub.unread > 99 ? '99+' : hub.unread}</em>` : ''}
      <div class="np-tools"><div class="np-seg" role="group" aria-label="Show">${[['all', 'All'], ['unread', 'Unread']].map(([f, l]) => `<button type="button" data-f="${f}" aria-pressed="${npFilter === f}">${l}</button>`).join('')}</div>
      <button class="np-all" type="button" ${hub.unread ? '' : 'disabled'} title="Mark all as read">${I.check}<span>Mark all as read</span></button></div></div>
    <div class="np-list">${groups.length ? groups.map(([g, xs]) => `<section class="np-g"><h4>${g}${g === 'Needs your reply' ? ` <em>${xs.length}</em>` : ''}</h4>${xs.map(npRow).join('')}</section>`).join('')
      : `<div class="np-empty">${I.bell}<p>${npFilter === 'unread' && shown.length ? 'You are all caught up.' : 'Nothing new. Friend requests, invites, duels and gifts show up here.'}</p></div>`}</div>`;
  const sc2 = p.querySelector('.np-list'); if (sc2 && top) sc2.scrollTop = top;
  p.querySelectorAll('.np-seg [data-f]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); if (npFilter === b.dataset.f) return; npFilter = b.dataset.f; sfx('tap'); drawPanel(p); }));
  const all = p.querySelector('.np-all'); if (all) all.addEventListener('click', async (e) => { e.stopPropagation(); hub.items.forEach((x) => { x.read = true; }); hub.unread = 0; paintBadges(); drawPanel(p); try { await call('learn_notifs_read', { p_ids: null }); } catch (e) {} });
  p.querySelectorAll('.np-i').forEach((row) => {
    const n = hub.items.find((x) => x.id === +row.dataset.id), t = text(n);
    const mark = () => { if (n.read) return; n.read = true; hub.unread = Math.max(0, hub.unread - 1); paintBadges(); call('learn_notifs_read', { p_ids: [n.id] }).catch(() => {}); };
    row.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation(); const a = b.dataset.a;
      if (a === 'bs-ok' || a === 'bs-no') { try { const j = await call('learn_bestie_respond', { p_uid: n.actor, p_accept: a === 'bs-ok' }); toast(j.ok ? (j.accepted ? `You and ${n.name} are Besties now!` : 'Request declined') : ({ youhave: 'You already have a Bestie.', theyhave: `${n.name} already has a Bestie.`, norequest: 'This request is no longer open.' }[j.error] || j.error)); sfx(j.accepted ? 'levelup' : 'tap'); n.read = true; hub.unread = Math.max(0, hub.unread - 1); paintBadges(); drawPanel(p); bestie.load(true).then(() => { renderRail(); if (j.accepted && bestie.B.brief) bestie.playFx('hearts', { them: { name: bestie.B.brief.name, avatar: bestie.B.brief.avatar }, title: `You and ${bestie.B.brief.name} are Besties!` }); }); } catch (er) { toast(er.message); } return; }
      if (a === 'spin') { mark(); if (panelOff) panelOff(); gacha.spin(); return; }
      if (a === 'fr-ok' || a === 'fr-no') { try { await call('learn_friend_respond', { p_uid: n.actor, p_accept: a === 'fr-ok' }); toast(a === 'fr-ok' ? `You and ${n.name} are friends now` : 'Request declined'); sfx(a === 'fr-ok' ? 'ok' : 'tap'); n.read = true; hub.unread = Math.max(0, hub.unread - 1); paintBadges(); drawPanel(p); loadFriends(); } catch (er) { toast(er.message); } return; }
      mark();
      if (a === 'new' && t.fn) { if (panelOff) panelOff(); t.fn(); return; }
      if (a === 'go' && t.go) { if (panelOff) panelOff(); document.getElementById('sheet-root').innerHTML = ''; location.hash = t.go; }
      else drawPanel(p);
    }));
    row.addEventListener('click', () => { if (t.act && !n.read) return; mark(); if (t.fn) { if (panelOff) panelOff(); t.fn(); return; } if (t.go) { if (panelOff) panelOff(); document.getElementById('sheet-root').innerHTML = ''; location.hash = t.go; } });
  });
}

/* ---------- có gì mới (hiện 1 lần mỗi bản cập nhật) ---------- */
const NEWS_V = 23, NEWS_KEY = 'dcl_news_' + NEWS_V;
const seenNews = () => { try { return localStorage.getItem(NEWS_KEY) === '1'; } catch (e) { return true; } };
const markNews = () => { try { localStorage.setItem(NEWS_KEY, '1'); } catch (e) {} };
export const newsSeen = seenNews;
export function whatsNew(force) {
  if (!force && (seenNews() || !S.onboarded)) { if (!S.onboarded) markNews(); return; }
  if (!force && document.querySelector('.ovl, .player, .sheet, .tour')) { setTimeout(() => whatsNew(false), 3000); return; }
  markNews();
  if (acct) call('learn_notifs_read_kind', { p_kind: 'update' }).then(() => { hub.items.forEach((x) => { if (x.kind === 'update' && !x.read) { x.read = true; hub.unread = Math.max(0, hub.unread - 1); } }); paintBadges(); }).catch(() => {});
  sfx('quest');
  const card = (ic, t, d) => `<section class="wn-k"><div class="wn-kh"><span class="wn-ic">${I[ic]}</span><b>${t}</b></div><p class="muted">${d}</p></section>`;
  sheet(`<div class="wn">
    <div class="wn-h"><span class="wn-logo">${LOGO}</span><div><h2>Bestie, Lucky spin &amp; Adventure</h2><p class="sub">Learn together with a Bestie, spin chests for wallpapers and fight bosses side by side. Your progress, XP and wallpapers are safe.</p></div></div>
    <div class="wn-c wn-6">
      ${card('heart', 'Bestie · Learn together', 'Pick one friend as your Bestie. You share wallpapers automatically, both earn <b>+10% XP</b> per lesson on days you both study, and can pass a duel to each other (5 a day). If one of you is away 3+ days, lessons earn 10% less, so keep each other going!')}
      ${card('map', 'Bestie Adventure', 'A big map for English and 中文 with regions and boss dots. You and your Bestie play live together: one sees the question, the other the answers; build sentences in relay; link words at the same time. Chests give XP, Bestie effects and spin tickets.')}
      ${card('gift', 'Lucky spin', 'Unit and boss chests now give <b>spin tickets</b> instead of fixed wallpapers. Keep them or spin right away: the strip stops on a random wallpaper by rarity. A duplicate turns into XP. <b>Everyone gets 1 free ticket.</b>')}
      ${card('trophy', 'Rankings', 'New <b>Top collector</b> and <b>Bestie</b> rankings. Every Friday at 16:00 (Hà Nội) all rankings pay out: the top 10 of each one get a spin ticket, plus the usual prizes.')}
      ${card('swords', 'Duels', 'Your first 10 sent and 10 received duels each day score points and XP; after that you can still play for fun. Your first win each day gives a spin ticket.')}
      ${card('users', 'Friends', 'Right-click (or tap) any name in Ranking and Friends for profile, message, duel, add friend or Bestie. Make friend groups and start a quick quiz: everyone in the group joins automatically.')}
    </div>
    <div class="foot-row wn-acts">${acct ? `<button class="btn ghost wn-spin" type="button">${I.zap} Spin my free ticket</button><button class="btn acc wn-bst" type="button">${I.heart} Pick a Bestie</button>` : '<button class="btn acc wn-ok" type="button">Got it</button>'}</div>
  </div>`, (el, close) => {
    const sp = el.querySelector('.wn-spin'); if (sp) sp.addEventListener('click', () => { close(); if (C.startTour) C.startTour('gacha', true); });
    const bs = el.querySelector('.wn-bst'); if (bs) bs.addEventListener('click', () => { close(); if (C.startTour) C.startTour('bestie', true); });
    const ok = el.querySelector('.wn-ok'); if (ok) ok.addEventListener('click', close);
  }, 'wide');
}

/* ---------- danh sách bạn (cạnh phải) ---------- */
export async function loadFriends() {
  if (!acct) return;
  try {
    const [j, g] = await Promise.all([call('learn_friends_list'), call('learn_group_list').catch(() => null)]);
    if (g && g.ok !== false) hub.groups = g.items || [];
    if (j && j.ok) { hub.friends = j; hub.fAt = Date.now(); renderRail(); }
  } catch (e) {}
}
// v25: nhóm bạn bè ngay trong cột Friends: tạo nhóm, quiz nhanh với cả nhóm
function groupsRail() {
  const gs = hub.groups || [], fr = ((hub.friends && hub.friends.items) || []).filter((x) => x.status === 'accepted');
  return `<div class="rl-grp"><div class="rl-gh"><b>${I.users} Groups</b><small>${gs.length ? `${gs.length} group${gs.length === 1 ? '' : 's'}` : 'Quiz your friends together'}</small><button class="btn sm ghost rl-gnew" type="button" ${fr.length ? '' : 'disabled title="Add friends first"'}>${I.plus} New</button></div>
    ${gs.length ? gs.map((g) => { const on = g.members.filter((m) => online(m.last_seen)).length; return `<div class="rl-gi" data-g="${g.id}"><span class="rl-gav">${g.members.slice(0, 4).map((m) => vipAv(m.name, m.avatar, m.vip || 0)).join('')}</span><span class="rl-gn"><b>${esc(g.name)}</b><small>${g.members.length} member${g.members.length === 1 ? '' : 's'}${on ? ` · <i class="ok">${on} online</i>` : ''}</small></span><button class="btn sm acc rl-gq" type="button" title="Start a quick quiz: online members join automatically">${I.zap} Quiz</button>${g.mine ? `<button class="icon-btn sm rl-ge" type="button" title="Edit group" aria-label="Edit group">${I.edit}</button>` : ''}</div>`; }).join('')
      : `<p class="rl-gempty">${fr.length ? 'Put friends in a group, then start a quick quiz: everyone online joins automatically.' : 'Add friends first, then make a group.'}</p>`}</div>`;
}
function wireGroupsRail(r) {
  const fr = () => ((hub.friends && hub.friends.items) || []).filter((x) => x.status === 'accepted');
  const done = () => { hub.fAt = 0; loadFriends(); };
  const nb = r.querySelector('.rl-gnew'); if (nb) nb.addEventListener('click', () => { sfx('open'); if (C.groups) C.groups.sheet(null, fr(), done); });
  r.querySelectorAll('.rl-gi').forEach((el) => {
    const g = (hub.groups || []).find((x) => String(x.id) === el.dataset.g); if (!g) return;
    el.querySelector('.rl-gq').addEventListener('click', (e) => { e.currentTarget.disabled = true; sfx('tap'); document.getElementById('sheet-root').innerHTML = ''; if (C.groups) C.groups.quiz(g); });
    const ge = el.querySelector('.rl-ge'); if (ge) ge.addEventListener('click', () => { sfx('open'); if (C.groups) C.groups.sheet(g, fr(), done); });
  });
}
function ranked() {
  const d = hub.friends; if (!d) return [];
  const fr = (d.items || []).filter((x) => x.status === 'accepted');
  const all = [...fr, { ...d.me, me: true, last_seen: new Date().toISOString() }].sort((a, b) => (b.week_xp || 0) - (a.week_xp || 0));
  all.forEach((x, i) => { x.rank = i + 1; });
  return all;
}
/* ---------- bảng xếp hạng toàn máy chủ (trên danh sách bạn) ---------- */
// v23: thêm Top collector (số hình nền) và Bestie (cặp Bestie theo sao Vượt ải). v28: mọi bảng phát quà 16:00 thứ Sáu giờ Hà Nội; Duel tính điểm 05:00 thứ Hai → 16:00 thứ Sáu.
const RK_TABS = [['en', 'EN'], ['zh', '中文'], ['ielts', 'IELTS'], ['duel', 'Duel'], ['col', 'Collector'], ['bestie', 'Adventure']];
const rk = { err: {}, tab: (() => { try { return localStorage.getItem('dcl_rk') || ''; } catch (e) { return ''; } })(), data: {}, at: {}, busy: '' };
const rkTab = () => (RK_TABS.some((t) => t[0] === rk.tab) ? rk.tab : (['en', 'zh', 'ielts'].includes(S.lang) ? S.lang : 'en'));
export async function loadRank(board = rkTab(), force = false) {
  if (rk.busy === board || (!force && rk.data[board] && Date.now() - rk.at[board] < 60000)) return;
  rk.busy = board;
  // v23: lỗi / máy chủ chưa có bảng này → hiện thông báo + nút thử lại, không quay "Loading…" mãi
  try { const j = await call('learn_rank_board', { p_board: board }); if (j && j.ok) { rk.data[board] = j; rk.at[board] = Date.now(); delete rk.err[board]; } else rk.err[board] = (j && j.error) || 'fail'; } catch (e) { rk.err[board] = e.message || 'fail'; }
  rk.busy = '';
  document.querySelectorAll('.rk').forEach((el) => paintRank(el));
}
const medal = (n) => n <= 3 ? `<span class="rk-n m${n}">${n}</span>` : `<span class="rk-n">${n}</span>`;
// thời điểm chốt tuần kế tiếp: 16:00 thứ Sáu (giờ Hà Nội) = week_end + 16:00
export function resetIn(d) {
  const end = new Date((d && d.week_end ? d.week_end : '') + 'T16:00:00+07:00'); const ms = end - Date.now();
  if (!(ms > 0)) return 'soon';
  const dd = Math.floor(ms / 864e5), hh = Math.floor((ms % 864e5) / 36e5);
  return dd ? `${dd}d ${hh}h` : `${hh}h ${Math.floor((ms % 36e5) / 6e4)}m`;
}
function rankRows(board) {
  const d = rk.data[board];
  if (!d && rk.err[board]) return `<div class="rk-load rk-err"><p>${rk.err[board] === 'board' || /not ready/i.test(rk.err[board]) ? 'This ranking opens with the new update. Check back soon.' : 'Could not load this ranking.'}</p><button type="button" class="btn sm ghost rk-retry" data-b="${board}">Try again</button></div>`;
  if (!d) return '<p class="rk-load">Loading…</p>';
  const items = d.items || [], unit = { duel: 'pts', col: 'wallpapers', bestie: '★ Adventure' }[board] || '★';
  let rows;
  if (board === 'bestie' && items.some((x) => x.pair)) rows = items.map((x) => `<div class="rk-i pair ${x.rel === 'me' ? 'me' : ''}">${medal(x.rank)}<span class="rk-av2">${(x.pair || []).map((p) => vipAv(p.name, p.avatar, p.vip || 0)).join('')}</span>
      <span class="rk-t"><b>${(x.pair || []).map((p) => `<span class="rk-pn" data-u="${p.uid}">${esc(p.name)}</span>`).join(' <i class="rk-amp">&amp;</i> ')}</b><small>${x.score} ${unit}</small></span></div>`).join('');
  else rows = items.map((x) => `<div class="rk-i ${x.rel === 'me' ? 'me' : ''}" data-u="${x.uid}">${medal(x.rank)}<span class="rk-av">${vipAv(x.name, x.avatar, x.vip || 0)}</span>
      <span class="rk-t"><b>${esc(x.name)}${x.rel === 'me' ? ' (you)' : ''}</b><small>${x.score} ${unit}${board === 'duel' ? ` · ${x.wins}W / ${x.played}` : ''}</small></span>${x.rel === 'friend' ? `<span class="rk-s ok" title="Friend">${I.check}</span>` : x.rel === 'sent' ? '<span class="rk-s">Sent</span>' : ''}</div>`).join('');
  const meIn = items.some((x) => x.rel === 'me');
  const me = d.me && !meIn ? `<div class="rk-i me out">${medal(d.me.rank)}<span class="rk-av">${vipAv(acct ? acct.name : 'You', acct && acct.avatar, walls.myVip())}</span><span class="rk-t"><b>You</b><small>${d.me.score} ${unit}</small></span></div>` : '';
  const empty = !items.length ? `<p class="rk-load">${{ duel: 'No duels finished this week yet. Win one to take #1.', col: 'Nobody has wallpapers yet.', bestie: 'Nobody has beaten an Adventure boss yet. Your first win gives a wallpaper and a spin ticket!' }[board] || 'Nobody has stars here yet. Finish a lesson to take #1.'}</p>` : '';
  const got = (d.mine || []).length, when = `Prizes every Friday 16:00 (Hà Nội) · next in ${resetIn(d)}.`;
  const note = { duel: `Win 3 pts, draw 1. Points count from Monday 05:00 to Friday 16:00 (Hà Nội)${d.duel_from && Date.now() < new Date(d.duel_from).getTime() ? ', so duels right now do not add points yet' : ''}. Only your first 10 sent and 10 received duels each day count. ${when} Top 10: XP, a rare wallpaper and a lucky spin ticket.`,
    col: `Number of wallpapers you own. ${when} Top 10: a lucky spin ticket.`, bestie: `Stars from Adventure bosses, alone or with your Bestie. ${when} Top 10: a lucky spin ticket.` }[board]
    || `Stars from every lesson in this course. ${when} Top 10 get a lucky spin ticket; each rank also pays once: #1 two wallpapers, #2 a rare one, #3 a random one, #4–10 XP.${got ? ` You have collected ${got}/10.` : ''}`;
  const go = board === 'bestie' ? `<a class="rk-adv" href="#/adventure">${I.map}<span><b>Open Adventure map</b><small>First boss and every king: a new wallpaper + a spin ticket</small></span>${I.chev}</a>` : '';
  return `${go}<div class="rk-list">${rows}${empty}</div>${me}`;
}
function paintRank(el) {
  const b = rkTab();
  el.querySelectorAll('.rk-tabs button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.b === b));
  const body = el.querySelector('.rk-body'); if (body) body.innerHTML = rankRows(b);
  const ga = el.querySelector('.rk-adv'); if (ga) ga.addEventListener('click', () => { sfx('tap'); const sr = document.getElementById('sheet-root'); if (sr && el.closest('.in-sheet')) sr.innerHTML = ''; });
  const rt = el.querySelector('.rk-retry'); if (rt) rt.addEventListener('click', () => { delete rk.err[b]; paintRank(el); loadRank(b, true); });
  const d = rk.data[b]; if (!d) return;
  ctx.attach(el, '.rk-i[data-u]', (row) => { const x = d.items.find((i) => String(i.uid) === row.dataset.u); return x ? { uid: x.uid, name: x.name, avatar: x.avatar, vip: x.vip, rel: x.rel } : null; });
  ctx.attach(el, '.rk-pn', (sp) => { for (const it of d.items) { const p = (it.pair || []).find((q) => String(q.uid) === sp.dataset.u); if (p) return { uid: p.uid, name: p.name, avatar: p.avatar, vip: p.vip }; } return null; });
}
function rankHTML() {
  return `<section class="rk"><p class="rk-sub">Top 10 of all learners · pays out every Friday 16:00</p>
    <div class="rk-tabs seg wrap" role="tablist">${RK_TABS.map(([k, l]) => `<button type="button" data-b="${k}" class="${k === 'zh' ? 'zh' : ''}" aria-pressed="${rkTab() === k}">${l}</button>`).join('')}</div>
    <div class="rk-body">${rankRows(rkTab())}</div></section>`;
}
function wireRank(r) {
  const el = r.querySelector('.rk'); if (!el) return;
  paintRank(el);
  el.querySelectorAll('.rk-tabs button').forEach((b) => b.addEventListener('click', () => { rk.tab = b.dataset.b; try { localStorage.setItem('dcl_rk', rk.tab); } catch (e) {} sfx('tap'); paintRank(el); loadRank(rk.tab); }));
  loadRank(rkTab());
}
// v21b: cột phải tách 2 tab riêng: Ranking (bảng xếp hạng toàn máy chủ) và Friends (bạn bè, online, lời mời)
let railTab = (() => { try { return localStorage.getItem('dcl_rail_tab') === 'friends' ? 'friends' : 'rank'; } catch (e) { return 'rank'; } })();
function railHead(onN, incN) {
  const msgN = hub.msgs || 0;
  return `<div class="rl-tabs" role="tablist">
    <button type="button" role="tab" class="rl-t" data-t="rank" aria-selected="${railTab === 'rank'}">${I.trophy}<span>Ranking</span></button>
    <button type="button" role="tab" class="rl-t" data-t="friends" aria-selected="${railTab === 'friends'}">${I.users}<span>Friends</span>${incN ? `<i class="badge">${incN}</i>` : onN ? `<em class="rl-tn">${onN}</em>` : ''}</button>
    ${acct ? `<button class="icon-btn sm rl-msg" type="button" title="Messages" aria-label="Messages">${I.chat}${msgN ? `<i class="badge">${msgN > 99 ? '99+' : msgN}</i>` : ''}</button>` : ''}</div>`;
}
function railInner() {
  if (!acct) return `${railHead(0, 0)}<div class="rl-empty">${I.users}<p>Sign in to see the ranking, your friends and who is online.</p><button class="btn sm acc rl-in" type="button">Sign in</button></div>`;
  const d = hub.friends;
  const all = d ? ranked() : [], on = all.filter((x) => !x.me && online(x.last_seen)), inc = d ? (d.items || []).filter((x) => x.incoming) : [];
  const sorted = [...all].sort((a, b) => (a.me ? -1 : b.me ? 1 : 0) || (online(b.last_seen) - online(a.last_seen)) || a.rank - b.rank);
  const bb = bestie.B.brief;
  const bcard = !d ? '' : bb ? `<button type="button" class="rl-bst" title="Bestie settings">${vipAv(bb.name, bb.avatar, bb.vip || 0)}<span class="grow"><b>${I.heart} ${esc(bb.name)}</b><small>${+bb.mult > 1 ? '+10% XP today' : +bb.mult < 1 ? `away ${bb.offline_days} days · −10% XP` : 'Bestie · study together for +10%'}</small></span><a class="btn sm acc rl-adv" href="#/adventure">${I.map}</a></button>`
    : `<button type="button" class="rl-bst none">${I.heart}<span class="grow"><b>Pick a Bestie</b><small>${(d.items || []).some((x) => x.status === 'accepted') ? 'Share wallpapers, +10% XP, Adventure' : 'Add a friend first, then make them your Bestie'}</small></span>${I.chev}</button>`;
  const friends = !d ? '<p class="muted" style="padding:14px">Loading…</p>' : `${bcard}<div class="rl-sub"><span class="rl-on"><i></i>${on.length} online</span><small>${all.length - 1} friend${all.length === 2 ? '' : 's'} · weekly XP · right-click a name</small></div>
    ${inc.length ? `<a class="rl-req" href="#/friends">${I.users}<span>${inc.length} friend request${inc.length > 1 ? 's' : ''}</span>${I.chev}</a>` : ''}
    <div class="rl-list">${sorted.map((x) => `<div class="rl-i ${x.me ? 'me' : ''} ${online(x.last_seen) ? 'on' : ''}" data-u="${x.uid}">
      <span class="rl-rk ${x.rank <= 3 ? 'top t' + x.rank : ''}">${x.rank}</span>
      <span class="rl-av">${vipAv(x.name, x.avatar, x.vip || 0)}${!x.me && online(x.last_seen) ? '<i class="dot"></i>' : ''}</span>
      <span class="rl-n"><b>${esc(x.name)}${x.me ? ' (you)' : ''}</b><small>${x.week_xp || 0} XP this week${x.me ? '' : online(x.last_seen) ? ' · online' : ` · ${ago(x.last_seen).replace(' ago', '')}`}</small></span>
      ${bestie.B.brief && String(bestie.B.brief.uid) === String(x.uid) ? `<span class="rl-bf" title="Your Bestie">${I.heart}</span>` : ''}</div>`).join('')}</div>
    ${groupsRail()}
    ${all.length < 2 ? `<div class="rl-empty"><p>No friends yet. ${d.me && d.me.code ? `Share your code <b>${esc(d.me.code)}</b>, or tap` : 'Tap'} + next to anyone in the Ranking.</p></div>` : ''}`;
  return `${railHead(on.length, inc.length)}
    <div class="rl-p" data-p="rank" ${railTab === 'rank' ? '' : 'hidden'}>${rankHTML()}<div class="rl-f"><a class="btn sm ghost rl-duels" href="#/duel">${I.swords} Duels</a><button class="btn sm ghost rl-gof" type="button">${I.users} My friends</button></div></div>
    <div class="rl-p" data-p="friends" ${railTab === 'friends' ? '' : 'hidden'}>${friends}<div class="rl-f"><a class="btn sm ghost rl-addf" href="#/friends">${I.plus} Add friends</a><a class="btn sm ghost rl-duels" href="#/duel">${I.swords} Duels</a></div></div>`;
}
function setRailTab(r, t) {
  railTab = t; try { localStorage.setItem('dcl_rail_tab', t); } catch (e) {}
  r.querySelectorAll('.rl-t').forEach((b) => b.setAttribute('aria-selected', b.dataset.t === t));
  r.querySelectorAll('.rl-p').forEach((p) => { p.hidden = p.dataset.p !== t; });
  r.scrollTop = 0;
  if (t === 'rank') loadRank(rkTab());
}
// cột bạn bè nằm trong bố cục trang (cùng khoảng cách với các cột khác)
export function renderRail() {
  document.querySelectorAll('.layout > .rail-col > .rail').forEach((r) => { r.innerHTML = railInner(); wireRail(r); });
  document.querySelectorAll('.layout > .rail-col .rail-x').forEach((b) => { if (!b.dataset.w) { b.dataset.w = 1; b.addEventListener('click', () => toggleRail(false)); } });
  applyChrome();
}
function wireRail(r) {
  r.querySelectorAll('.rl-t').forEach((b) => b.addEventListener('click', () => { if (railTab !== b.dataset.t) { sfx('tap'); setRailTab(r, b.dataset.t); } }));
  const gf = r.querySelector('.rl-gof'); if (gf) gf.addEventListener('click', () => { sfx('tap'); setRailTab(r, 'friends'); });
  const si = r.querySelector('.rl-in'); if (si) si.addEventListener('click', () => C.authSheet('login'));
  ctx.attach(r, '.rl-i[data-u]', (row) => { const f = ranked().find((x) => String(x.uid) === row.dataset.u); return f ? { uid: f.uid, name: f.name, avatar: f.avatar, vip: f.vip, rel: f.me ? 'me' : 'friend', last_seen: f.last_seen } : null; });
  const bst = r.querySelector('.rl-bst'); if (bst) bst.addEventListener('click', (e) => { if (e.target.closest('.rl-adv')) return; sfx('open'); if (bst.classList.contains('none') && !(hub.friends && (hub.friends.items || []).some((x) => x.status === 'accepted'))) { document.getElementById('sheet-root').innerHTML = ''; location.hash = '#/friends'; return; } bestie.openSheet(); });
  const rm = r.querySelector('.rl-msg'); if (rm) rm.addEventListener('click', () => { document.getElementById('sheet-root').innerHTML = ''; chat.openChats(); });
  wireGroupsRail(r);
  if (railTab === 'rank' || r.querySelector('.rk')) wireRank(r);
}
export function railSheet(tab) {
  if (!acct) { C.authSheet('login'); return; }
  if (tab === 'rank' || tab === 'friends') { railTab = tab; try { localStorage.setItem('dcl_rail_tab', tab); } catch (e) {} }
  sheet('<div class="rail in-sheet"></div>', (el) => { const r = el.querySelector('.rail'); r.innerHTML = railInner(); wireRail(r); const x = r.querySelector('.rl-x'); if (x) x.remove(); });
  loadFriends();
}

// mở bảng xếp hạng ở một tab (vd. 'bestie')
export function showRank(board) {
  if (!acct) { C.authSheet('login'); return; }
  rk.tab = board; try { localStorage.setItem('dcl_rk', board); } catch (e) {}
  railTab = 'rank'; try { localStorage.setItem('dcl_rail_tab', 'rank'); } catch (e) {}
  loadRank(board, true).then(() => renderRail()).catch(() => {});
  if (!wide()) railSheet('rank'); else { ui.rail = true; setPref('dcl_rail', true); applyChrome(); renderRail(); }
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
