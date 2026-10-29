// Nhắn tin: bạn bè (1-1), lớp học (nhóm) và ván live quiz (nhóm, cả khách chưa có tài khoản).
// Khung chat nổi ở góc phải dưới (màn nhỏ thì chiếm cả màn hình). Hỏi máy chủ 3,5 giây/lần khi đang mở.
import { I } from './icons.js?v=29';
import { acct, call, rpc } from './account.js?v=29';
import { sfx } from './sound.js?v=29';
import { esc, toast, vipAv, avatar, ago, online } from './ui.js?v=29';

const POLL = 3500;
let dock = null, timer = 0, view = null; // view: { kind: 'list' } | { kind: 'chan', chan, title, sub, av } | { kind: 'game', pin, pkey, host, title }
let msgs = [], lastId = 0, threads = [], onUnread = null;
export const setOnUnread = (f) => { onUnread = f; };
const ERR = { empty: 'Type a message first.', noaccess: 'You can only message friends and classmates.', slow: 'Slow down a little. Try again in a minute.', ended: 'This game has ended.', kicked: 'You were removed from this game.', nogame: 'This game was not found.' };

function ensureDock(host) {
  if (dock && dock.isConnected && dock.parentNode === (host || document.body)) return dock;
  if (dock) dock.remove();
  dock = document.createElement('section'); dock.className = 'chat-dock panel solid' + (host ? ' inline' : ''); dock.setAttribute('role', host ? 'region' : 'dialog'); dock.setAttribute('aria-label', 'Messages');
  (host || document.body).appendChild(dock);
  if (!host) document.body.classList.add('chat-open');
  return dock;
}
export function closeChat() { clearInterval(timer); timer = 0; view = null; if (dock) { dock.remove(); dock = null; } document.body.classList.remove('chat-open'); }
const fmtT = (t) => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

/* ---------- danh sách cuộc trò chuyện ---------- */
export async function openChats() {
  if (!acct) { toast('Sign in to send messages.'); return; }
  view = { kind: 'list' }; clearInterval(timer); timer = 0;
  const d = ensureDock();
  d.innerHTML = head('Messages', 'Friends and classes') + '<div class="ch-list"><p class="muted ch-pad">Loading…</p></div>';
  wireHead(d);
  try { const j = await call('learn_chat_threads'); threads = (j && j.items) || []; } catch (e) { d.querySelector('.ch-list').innerHTML = `<p class="muted ch-pad">${esc(e.message)}</p>`; return; }
  if (!view || view.kind !== 'list') return;
  const fr = threads.filter((t) => t.kind === 'dm'), rooms = threads.filter((t) => t.kind === 'room');
  const row = (t) => `<button class="ch-t ${t.unread ? 'new' : ''}" type="button" data-c="${esc(t.chan)}">
      <span class="ch-av">${t.kind === 'dm' ? vipAv(t.name, t.avatar, t.vip || 0) : `<span class="av ch-room">${I.school}</span>`}${t.kind === 'dm' && online(t.last_seen) ? '<i class="dot"></i>' : ''}</span>
      <span class="ch-tt"><b>${esc(t.name)}</b><small>${t.last ? esc(t.last) : t.kind === 'dm' ? 'Say hi' : 'Class group chat'}</small></span>
      <span class="ch-tm">${t.last_at ? `<small>${ago(t.last_at).replace(' ago', '')}</small>` : ''}${t.unread ? `<i class="badge">${t.unread > 99 ? '99+' : t.unread}</i>` : ''}</span></button>`;
  d.querySelector('.ch-list').innerHTML = (fr.length || rooms.length) ? `${rooms.length ? `<h4 class="ch-h">Classes</h4>${rooms.map(row).join('')}` : ''}${fr.length ? `<h4 class="ch-h">Friends</h4>${fr.map(row).join('')}` : ''}`
    : `<div class="ch-empty">${I.chat}<p>Add a friend or join a class to start chatting.</p><a class="btn sm acc" href="#/friends">${I.plus} Add friends</a></div>`;
  d.querySelectorAll('.ch-t').forEach((b) => b.addEventListener('click', () => { const t = threads.find((x) => x.chan === b.dataset.c); sfx('tap'); openChan(t.chan, t.name, t.kind === 'dm' ? 'Friend' : 'Class group', t.kind === 'dm' ? vipAv(t.name, t.avatar, t.vip || 0) : `<span class="av ch-room">${I.school}</span>`, true); }));
  d.querySelectorAll('.ch-list a').forEach((a) => a.addEventListener('click', () => closeChat()));
}
const dmChan = (x, y) => `dm:${Math.min(x, y)}:${Math.max(x, y)}`;
// mở chat 1-1 với một người bạn
export function openDM(f) { if (!acct || !acct.uid) { toast('Sign in to send messages.'); return; } openChan(dmChan(acct.uid, +f.uid), f.name, online(f.last_seen) ? 'Online now' : f.last_seen ? 'Seen ' + ago(f.last_seen) : 'Friend', vipAv(f.name, f.avatar, f.vip || 0)); }
export function openRoom(room, host = null) { openChan('room:' + room.id, room.name, 'Class group chat · everyone in this class can read it', `<span class="av ch-room">${I.school}</span>`, false, host); }

function head(title, sub, back = false, av = '') {
  return `<header class="ch-head">${back ? `<button class="icon-btn sm ch-back" type="button" aria-label="All chats">${I.back}</button>` : ''}${av ? `<span class="ch-hav">${av}</span>` : `<span class="ch-hav ic">${I.chat}</span>`}
    <span class="ch-ht"><b>${esc(title)}</b><small>${esc(sub || '')}</small></span><button class="icon-btn sm ch-x" type="button" aria-label="Close">${I.x}</button></header>`;
}
function wireHead(d) {
  const x = d.querySelector('.ch-x'); if (d.classList.contains('inline')) x.remove(); else x.addEventListener('click', () => { sfx('tap'); closeChat(); });
  const b = d.querySelector('.ch-back'); if (b) b.addEventListener('click', () => { sfx('tap'); openChats(); });
}

/* ---------- một cuộc trò chuyện ---------- */
function openChan(chan, title, sub, av, back = false, host = null) {
  view = { kind: 'chan', chan, title, inline: !!host }; msgs = []; lastId = 0;
  const d = ensureDock(host);
  d.innerHTML = head(title, sub, !host, av) + `<div class="ch-msgs" aria-live="polite"><p class="muted ch-pad">Loading…</p></div>${composer()}`;
  wireHead(d); wireComposer(d, (body) => call('learn_chat_send', { p_chan: chan, p_body: body }));
  load(true); clearInterval(timer); timer = setInterval(() => { if (!document.hidden) load(); }, POLL);
}
// chat trong ván quiz (người chơi dùng pkey, chủ phòng dùng host key)
export function openGame(o) {
  view = { kind: 'game', ...o }; msgs = []; lastId = 0;
  const d = ensureDock(); d.classList.add('in-game');
  d.innerHTML = head(o.title || 'Game chat', 'Everyone in this game can read it', false) + `<div class="ch-msgs"><p class="muted ch-pad">Loading…</p></div>${composer()}`;
  wireHead(d); wireComposer(d, (body) => rpc('learn_game_chat', { p_pin: o.pin || null, p_pkey: o.pkey || null, p_host: o.host || null, p_body: body, p_after: lastId }));
  load(true); clearInterval(timer); timer = setInterval(() => { if (!document.hidden) load(); }, POLL);
}
export const chatOpen = () => !!(view && dock && dock.isConnected);

const composer = () => `<form class="ch-form" novalidate><textarea class="ch-in" rows="1" maxlength="500" placeholder="Write a message…" aria-label="Message"></textarea><button class="btn acc ch-send" type="submit" aria-label="Send">${I.send}</button></form>`;
function wireComposer(d, send) {
  const f = d.querySelector('.ch-form'), ta = f.querySelector('.ch-in'), btn = f.querySelector('.ch-send');
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); f.requestSubmit(); } });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const body = ta.value.trim(); if (!body) return;
    btn.disabled = true;
    try {
      const j = await send(body);
      if (!j || !j.ok) { toast(ERR[j && j.error] || 'Could not send.'); btn.disabled = false; return; }
      ta.value = ''; grow(); sfx('pop'); await load();
    } catch (er) { toast(er.message); }
    btn.disabled = false; ta.focus();
  });
  setTimeout(() => ta.focus({ preventScroll: true }), 50);
}
async function load(first = false) {
  const v = view; if (!v || v.kind === 'list') return;
  if (!dock || !dock.isConnected) { closeChat(); return; }
  let j;
  try {
    j = v.kind === 'game' ? await rpc('learn_game_chat', { p_pin: v.pin || null, p_pkey: v.pkey || null, p_host: v.host || null, p_body: '', p_after: lastId })
      : await call('learn_chat_get', { p_chan: v.chan, p_after: lastId });
  } catch (e) { if (first) paint(e.message); return; }
  if (view !== v) return;
  if (!j || !j.ok) { paint(ERR[j && j.error] || 'Could not load messages.'); return; }
  if (v.kind === 'game') v.me = j.me;
  const add = (j.items || []).filter((m) => m.id > lastId);
  if (!add.length && !first) return;
  const fresh = !first && add.some((m) => !mine(m));
  msgs = msgs.concat(add); if (msgs.length) lastId = msgs[msgs.length - 1].id;
  paint(); if (fresh) sfx('pop');
  if (onUnread && v.kind === 'chan') onUnread();
}
const mine = (m) => view && (view.kind === 'game' ? m.name === view.me && (!acct || !m.from || m.from === acct.uid) : acct && m.from === acct.uid);
function paint(err) {
  const box = dock && dock.querySelector('.ch-msgs'); if (!box) return;
  if (err) { box.innerHTML = `<p class="muted ch-pad">${esc(err)}</p>`; return; }
  const atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.innerHTML = msgs.length ? msgs.map((m, i) => {
    const me = mine(m), prev = msgs[i - 1], grouped = prev && prev.name === m.name && new Date(m.at) - new Date(prev.at) < 5 * 60000;
    return `<div class="ch-m ${me ? 'me' : ''} ${grouped ? 'g' : ''}">${me || grouped ? '' : `<span class="ch-mav">${m.from ? vipAv(m.name, m.avatar, m.vip || 0) : avatar(m.name, '')}</span>`}
      <div class="ch-mb">${me || grouped ? '' : `<small class="ch-mn">${esc(m.name)}</small>`}<p>${linkify(m.body)}</p><time>${fmtT(m.at)}</time></div></div>`;
  }).join('') : `<div class="ch-empty">${I.chat}<p>No messages yet. Say hello!</p></div>`;
  if (atEnd || msgs.length <= 80) box.scrollTop = box.scrollHeight;
}
addEventListener('hashchange', () => { if (view && ((view.kind === 'game' && !location.hash.startsWith('#/play') && !location.hash.startsWith('#/host')) || view.inline)) closeChat(); });
