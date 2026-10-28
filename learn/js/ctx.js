// v23: menu chuột phải (máy tính) / chạm giữ hoặc chạm (điện thoại) cho một người: xem hồ sơ, nhắn tin, duel, kết bạn, Bestie, tặng hình.
// Thay cho các nút nhỏ trên từng dòng. Hồ sơ công khai không có email / số điện thoại.
import { I } from './icons.js?v=26';
import { acct, call } from './account.js?v=26';
import { sfx } from './sound.js?v=26';
import { esc, toast, sheet, vipAv, ago, online } from './ui.js?v=26';
import * as walls from './walls.js?v=26';
import * as bestie from './bestie.js?v=26';

let C = null;
export function init(ctx) { C = ctx; }
let menuEl = null;
export function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener('pointerdown', offMenu, true); removeEventListener('scroll', closeMenu, true); removeEventListener('resize', closeMenu); } }
const offMenu = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
// mở menu tại vị trí x, y
export function menu(x, y, head, items) {
  closeMenu(); sfx('tap');
  menuEl = document.createElement('div'); menuEl.className = 'cmenu panel solid'; menuEl.setAttribute('role', 'menu');
  menuEl.innerHTML = `${head ? `<div class="cm-h">${head}</div>` : ''}${items.filter(Boolean).map((it, i) => `<button type="button" role="menuitem" class="cm-i ${it.danger ? 'danger' : ''}" data-i="${i}" ${it.disabled ? 'disabled' : ''}>${I[it.ic] || ''}<span>${esc(it.label)}</span>${it.note ? `<small>${esc(it.note)}</small>` : ''}</button>`).join('')}`;
  document.body.appendChild(menuEl);
  const list = items.filter(Boolean), r = menuEl.getBoundingClientRect();
  menuEl.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + 'px';
  menuEl.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + 'px';
  menuEl.querySelectorAll('.cm-i').forEach((b) => b.addEventListener('click', () => { const it = list[+b.dataset.i]; closeMenu(); if (it && it.fn) it.fn(); }));
  setTimeout(() => { document.addEventListener('pointerdown', offMenu, true); addEventListener('scroll', closeMenu, true); addEventListener('resize', closeMenu); }, 0);
  const f = menuEl.querySelector('.cm-i:not([disabled])'); if (f) f.focus({ preventScroll: true });
}
// các mục cho một người (u: { uid, name, avatar, vip, rel?, last_seen? })
export function userItems(u) {
  if (!acct || !u || !u.uid) return [];
  const me = String(u.uid) === String(acct.uid), rel = u.rel || (isFriend(u.uid) ? 'friend' : 'none');
  if (me) return [{ ic: 'user', label: 'View my public profile', fn: () => profile(u.uid) }, { ic: 'gear', label: 'Profile & settings', fn: () => { location.hash = '#/me'; } }];
  const bf = bestie.B.brief, isB = bf && String(bf.uid) === String(u.uid);
  return [
    { ic: 'user', label: 'View profile', fn: () => profile(u.uid) },
    rel === 'friend' ? { ic: 'chat', label: 'Send a message', fn: () => C.openDM({ uid: u.uid, name: u.name, avatar: u.avatar, vip: u.vip, last_seen: u.last_seen }) } : null,
    { ic: 'swords', label: 'Challenge to a duel', fn: () => { try { sessionStorage.setItem('dcl_duel_target', JSON.stringify({ uid: u.uid, name: u.name, avatar: u.avatar, vip: u.vip, rel })); } catch (e) {} document.getElementById('sheet-root').innerHTML = ''; location.hash = '#/duel/new/' + u.uid; } },
    rel === 'none' ? { ic: 'plus', label: 'Add friend', fn: () => addFriend(u) } : rel === 'sent' ? { ic: 'timer', label: 'Friend request sent', disabled: true } : rel === 'incoming' ? { ic: 'users', label: 'Accept friend request', fn: () => { location.hash = '#/friends'; } } : null,
    rel === 'friend' && !isB ? { ic: 'heart', label: bf ? 'Make Bestie' : 'Make Bestie', note: bf ? `you already have ${bf.name}` : '', disabled: !!bf, fn: () => makeBestie(u) } : null,
    isB ? { ic: 'heart', label: 'Bestie settings', fn: () => bestie.openSheet() } : null,
    rel === 'friend' ? { ic: 'gift', label: 'Share a wallpaper', fn: () => walls.shareSheet() } : null,
  ];
}
const isFriend = (uid) => { const f = C.friends ? C.friends() : []; return f.some((x) => String(x.uid) === String(uid) && x.status === 'accepted'); };
async function addFriend(u) {
  try { const j = await call('learn_friend_request', { p_who: u.name }); if (j && j.ok) { sfx('ok'); toast(j.accepted ? `You and ${u.name} are friends now` : `Friend request sent to ${u.name}`); if (C.loadFriends) C.loadFriends(); } else toast({ pending: 'Request already sent.', already: 'You are already friends.', limit: 'Friend list is full.' }[j && j.error] || 'Could not send the request.'); } catch (e) { toast(e.message); }
}
async function makeBestie(u) {
  try { const j = await call('learn_bestie_request', { p_uid: +u.uid }); if (!j.ok) { toast({ youhave: 'You already have a Bestie.', theyhave: `${u.name} already has a Bestie.`, pending: 'Request already sent.', notfriend: 'Only friends can be your Bestie.' }[j.error] || j.error); return; } sfx(j.accepted ? 'levelup' : 'ok'); toast(j.accepted ? `You and ${u.name} are Besties now!` : `Bestie request sent to ${u.name}`); bestie.load(true); } catch (e) { toast(e.message); }
}
// gắn menu cho các dòng trong root: getUser(rowEl) → user
export function attach(root, sel, getUser) {
  root.querySelectorAll(sel).forEach((row) => {
    if (row.dataset.ctx) return; row.dataset.ctx = '1';
    const open = (x, y) => { const u = getUser(row); if (!u) return; const items = userItems(u); if (!items.filter(Boolean).length) return; menu(x, y, `${vipAv(u.name, u.avatar, u.vip || 0)}<span><b>${esc(u.name)}</b><small>${String(u.uid) === String(acct && acct.uid) ? 'You' : 'Right-click or tap a name for options'}</small></span>`, items); };
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); open(e.clientX, e.clientY); });
    row.addEventListener('click', (e) => { if (e.target.closest('a, button:not(.ctx-row)')) return; const r = row.getBoundingClientRect(); open(Math.min(e.clientX || r.left + 20, r.right - 10), (e.clientY || r.bottom) + 4); });
    let lt = 0; row.addEventListener('touchstart', (e) => { const t = e.touches[0]; lt = setTimeout(() => open(t.clientX, t.clientY), 520); }, { passive: true });
    ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => row.addEventListener(ev, () => clearTimeout(lt), { passive: true }));
    row.classList.add('has-ctx'); row.setAttribute('title', row.getAttribute('title') || 'Right-click for options');
  });
}

/* ---------- hồ sơ công khai ---------- */
const CN = { en: 'English', zh: '中文', ielts: 'IELTS' };
export async function profile(uid) {
  if (!acct) { C.authSheet('login'); return; }
  let p; try { p = await call('learn_profile', { p_uid: +uid }); } catch (e) { toast(e.message); return; }
  if (!p || !p.ok) { toast('This learner is not available.'); return; }
  await walls.loadCat();
  const sm = p.sum || {}, bl = sm.by_lang || {}, lv = p.levels || {}, ws = p.walls || [];
  const courses = ['en', 'zh', 'ielts'].filter((l) => (p.stars || {})[l] > 0 || (bl[l] || 0) > 0);
  sheet(`<div class="pf">
    <div class="pf-h">${vipAv(p.name, p.avatar, p.vip || 0, 'xl')}<div><h2>${esc(p.name)}</h2><p class="sub">${online(p.last_seen) ? '<b class="ok">Online now</b>' : p.last_seen ? 'Seen ' + ago(p.last_seen) : ''} · joined ${new Date(p.joined).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}${p.bestie ? ` · ${I.heart} Bestie: <b>${esc(p.bestie.name)}</b>` : ''}</p>
      <div class="pf-tags"><span class="pf-vip">VIP ${p.vip || 0}</span><span>Level ${p.level}</span><span>${(p.xp || 0).toLocaleString('en-US')} XP</span>${p.streak ? `<span>${I.flame} ${p.streak} days</span>` : ''}</div></div></div>
    <div class="pf-stats"><div><b>${sm.lessons || 0}</b><small>lessons</small></div><div><b>${sm.units || 0}</b><small>units done</small></div><div><b>${sm.words || 0}</b><small>words</small></div><div><b>${ws.length}</b><small>wallpapers</small></div><div><b>${p.badges || 0}</b><small>badges</small></div><div><b>${p.duel ? p.duel.wins : 0}/${p.duel ? p.duel.played : 0}</b><small>duel wins</small></div></div>
    ${courses.length ? `<div class="pf-c">${courses.map((l) => `<div class="pf-ci"><b>${CN[l]}</b><small>${lv[l] ? String(lv[l]).toUpperCase().replace('B1P', 'B1+').replace('B2P', 'B2+') : ''} · ${I.star}${(p.stars || {})[l] || 0} stars</small></div>`).join('')}</div>` : ''}
    <h3 class="gh">Collection <em>${ws.length}/${walls.total()}</em></h3>
    <div class="wgrid sm pf-w">${ws.slice(0, 24).map((w) => walls.card(w, { state: 'got', cls: 'tiny' })).join('') || '<p class="muted">No wallpapers yet.</p>'}</div>
    <div class="pf-acts"></div></div>`, (el, close) => {
    const acts = userItems({ uid: p.uid, name: p.name, avatar: p.avatar, vip: p.vip, rel: p.rel, last_seen: p.last_seen }).filter((x) => x && x.ic !== 'user' && !x.disabled);
    const box = el.querySelector('.pf-acts');
    box.innerHTML = acts.map((a, i) => `<button class="btn sm ${i ? 'ghost' : 'acc'}" type="button" data-i="${i}">${I[a.ic]} ${esc(a.label)}</button>`).join('');
    box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { close(); acts[+b.dataset.i].fn(); }));
    walls.wireCards(el.querySelector('.pf-w'), null, { play: false });
  }, 'wide');
}
