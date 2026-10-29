// Học cùng nhau: bạn bè, lớp học (giáo viên / trợ giảng / học viên), quiz trực tiếp kiểu “nhập PIN cùng chơi” và báo cáo.
// Mọi dữ liệu đi qua các hàm RPC trên Supabase (xem learn/setup/learn_social.sql).
import { I } from './icons.js?v=33';
import { S, save, LN, unitProgress } from './store.js?v=33';
import { acct, call, rpc, ensureToken } from './account.js?v=33';
import { sfx, unlockAudio } from './sound.js?v=33';
import { esc, shuffleArr, toast, sheet, confirmBox, burst, avatar, vipAv, ago, online, fmtDate, copyText, downloadCSV, SHAPES } from './ui.js?v=33';
import * as hub from './hub.js?v=33';
import * as chat from './chat.js?v=33';
import * as walls from './walls.js?v=33';
import * as bestie from './bestie.js?v=33';
import * as ctxm from './ctx.js?v=33';

let C = null; // ngữ cảnh từ app.js
export const counts = { get requests() { return hub.hub.requests || 0; }, set requests(v) { hub.hub.requests = v; }, rooms: 0 };
const app = document.getElementById('app');
const timers = new Set();
export function cleanup() { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); timers.clear(); document.body.classList.remove('quizzing'); document.removeEventListener('keydown', keyH); keyH = null; }
let keyH = null;
const every = (fn, ms) => { const t = setInterval(fn, ms); timers.add(t); return t; };
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.add(t); return t; };
const SITE = 'https://desktopchill.com/learn/';
const ROLE = { teacher: 'Teacher', assistant: 'Assistant', student: 'Student' };
const ERR = {
  nouser: 'No learner found with that code or name.', self: 'That is your own code.', already: 'You are already friends.', pending: 'Request already sent. Waiting for them to accept.', limit: 'Limit reached.',
  noroom: 'No class with that code. Check the code with your teacher.', closed: 'This class is not accepting new members right now.', full: 'This class is full.', notmember: 'You are not a member of this class.',
  forbidden: 'Only the teacher can do that.', owner: 'The class owner cannot do that. Hand the class to someone else first.', badname: 'Please enter a name.', empty: 'Write something first.',
  nogame: 'No live game with that PIN. Check the PIN on the host screen.', started: 'This game has already started and does not allow late joining.', locked: 'The host has locked this game.',
  nicktaken: 'That nickname is already in this game. Pick another one.', badnick: 'Nickname must be at least 2 characters.', kicked: 'The host removed you from this game.', classonly: 'Only members of this class can join.',
  noguests: 'This game is for signed-in learners only. Sign in first.', noquestions: 'Add at least one complete question.', closed_q: 'Time is up for this question.', late: 'Too late — time was up.', early: 'Wait for the question to start.',
};
const errMsg = (j) => ERR[j && j.error] || (j && j.error) || 'Something went wrong. Please try again.';

export function init(ctx) {
  C = ctx;
  // số lời mời kết bạn được cập nhật trong hub.js (learn_me mỗi 45 giây)
}
export async function refreshCounts() {
  if (!acct) return;
  try {
    const j = await call('learn_me'); if (!j || !j.ok) return;
    const before = counts.requests; counts.requests = j.requests || 0; counts.rooms = j.rooms || 0; hub.hub.unread = j.unread || 0;
    if (j.avatar !== undefined && acct) acct.avatar = j.avatar;
    if (before !== counts.requests) { const b = document.querySelector('.hud-me'); if (b) { let x = b.querySelector('.badge'); if (counts.requests) { if (!x) { x = document.createElement('i'); x.className = 'badge'; b.appendChild(x); } x.textContent = counts.requests; } else if (x) x.remove(); } }
  } catch (e) {}
}
// trang yêu cầu đăng nhập
function needAccount(route, title, text) {
  C.shell(route, `<div class="page-h"><div><h1 class="serif">${esc(title)}</h1><p>${esc(text)}</p></div></div>
  <div class="panel empty"><span class="e-ic">${I.users}</span><h2>Create a free account first</h2><p>Just a name and a 4–6 digit PIN. Your progress stays on this device too.</p><div class="foot-row" style="max-width:420px;width:100%"><button class="btn acc mk" type="button">Create account</button><button class="btn ghost lg" type="button">Sign in</button></div></div>`, null, { noCourse: true });
  app.querySelector('.mk').addEventListener('click', () => C.authSheet('new'));
  app.querySelector('.lg').addEventListener('click', () => C.authSheet('login'));
}
const loading = (route, title) => C.shell(route, `<div class="page-h"><div><h1 class="serif">${esc(title)}</h1><p class="muted">Loading…</p></div></div>`, null, { noCourse: true });
function failed(route, title, e) {
  C.shell(route, `<div class="page-h"><div><h1 class="serif">${esc(title)}</h1></div></div><div class="panel empty"><span class="e-ic">${I.cloud}</span><h2>Could not load</h2><p>${esc(e.message || e)}</p><button class="btn acc" type="button" onclick="location.reload()">${I.redo} Try again</button></div>`, null, { noCourse: true });
}

/* =========================================================
   FRIENDS
   ========================================================= */
let lbMode = 'week';
export async function friendsPage(args = []) {
  const route = '#/friends';
  if (!acct) return needAccount(route, 'Friends', 'Add friends with their code, see who is studying and compete on a weekly leaderboard.');
  if (args[0] === 'add' && args[1]) {
    const code = decodeURIComponent(args[1]);
    history.replaceState(null, '', '#/friends');
    try { const j = await call('learn_friend_request', { p_who: code }); toast(j.ok ? (j.accepted ? 'You are now friends!' : 'Friend request sent') : errMsg(j)); } catch (e) { toast(e.message); }
  }
  loading(route, 'Friends');
  let d, G; try { [d, G] = await Promise.all([call('learn_friends_list'), call('learn_group_list').catch(() => ({ items: [] })), bestie.load(true)]); } catch (e) { return failed(route, 'Friends', e); }
  const groups = (G && G.items) || [];
  if (!/^(friends|bestie)/.test(location.hash.split('/')[1] || '')) return;
  const items = d.items || [], me = d.me || {};
  const fr = items.filter((x) => x.status === 'accepted'), inc = items.filter((x) => x.incoming), out = items.filter((x) => x.status === 'pending' && !x.incoming);
  counts.requests = inc.length;
  const link = `${SITE}#/friends/add/${me.code}`;
  const val = (x) => lbMode === 'week' ? x.week_xp || 0 : lbMode === 'xp' ? (x.sum && x.sum.xp) || 0 : lbMode === 'streak' ? (x.sum && x.sum.streak) || 0 : (x.sum && x.sum.units) || 0;
  const unitLbl = { week: 'XP this week', xp: 'XP total', streak: 'day streak', units: 'units done' }[lbMode];
  const board = [...fr.map((x) => ({ ...x })), { ...me, me: true }].sort((a, b) => val(b) - val(a));
  C.shell(route, `<div class="page-h"><div><h1 class="serif">Friends</h1><p>Study together. Friends see each other’s streak, XP and level — nothing else. Right-click (or tap) a name for profile, message, duel and more.</p></div></div>
  ${bestie.sectionHTML(items.filter((x) => x.status === 'accepted'))}
  <section class="panel fr-me">${vipAv(me.name, me.avatar, me.vip || 0, 'lg')}<div class="grow"><b style="font-size:1.1rem">${esc(me.name)}</b><small class="muted" style="display:block">Share your code or link so friends can add you</small></div>
    <span class="fr-code"><b>${esc(me.code || '')}</b><button class="icon-btn cp-code" type="button" title="Copy code">${I.copy}</button></span><button class="btn sm ghost cp-link" type="button">${I.link} Copy invite link</button></section>
  <div class="layout-in" style="display:grid;gap:14px;margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <section class="panel pad">
      <h3 class="sec-h">${I.chart} Leaderboard <em>${unitLbl}</em></h3>
      <div class="seg lb-mode" style="margin-bottom:12px">${[['week', 'This week'], ['xp', 'Total XP'], ['streak', 'Streak'], ['units', 'Units']].map(([k, l]) => `<button type="button" data-m="${k}" aria-pressed="${lbMode === k}">${l}</button>`).join('')}</div>
      <div class="lb">${board.map((x, i) => `<div class="lb-row ${x.me ? 'me' : ''}" data-u="${x.uid}"><span class="lb-rank ${i < 3 ? 'top t' + (i + 1) : ''}">${i + 1}</span>${vipAv(x.name, x.avatar, x.vip || 0)}<span class="lb-n"><b>${esc(x.name)}${x.me ? ' (you)' : ''}${!x.me && online(x.last_seen) ? '<i class="online" title="Online now"></i>' : ''}</b><small>${x.sum ? `${esc(levelLabel(x.sum))} · ${x.me ? 'now' : 'seen ' + ago(x.last_seen)}` : ''}</small></span><span class="lb-v">${val(x)}<small>${esc(unitLbl)}</small></span></div>`).join('')}</div>
      ${fr.length ? '' : '<p class="muted" style="margin-top:12px;font-size:.88rem">Add a friend to start a friendly race. The board resets every Monday.</p>'}
    </section>
    <div style="display:grid;gap:14px;align-content:start">
      <section class="panel pad">
        <h3 class="sec-h">${I.plus} Add a friend</h3>
        <form class="addf" style="display:flex;gap:8px" novalidate><input class="input who" placeholder="Friend code or exact name" maxlength="24" autocomplete="off" /><button class="btn acc" type="submit">Add</button></form>
        <p class="err addf-err" style="margin-top:6px"></p>
      </section>
      ${groupsHTML(groups, fr)}
      ${inc.length ? `<section class="panel pad"><h3 class="sec-h">${I.users} Requests <em>${inc.length}</em></h3><div class="list">${inc.map((x) => `<div class="req-row">${avatar(x.name, x.avatar)}<span class="grow"><b>${esc(x.name)}</b><small class="muted">wants to be friends · ${ago(x.since)}</small></span><button class="btn sm acc fr-ok" data-u="${x.uid}" type="button">Accept</button><button class="icon-btn fr-no" data-u="${x.uid}" type="button" title="Decline">${I.x}</button></div>`).join('')}</div></section>` : ''}
      <section class="panel pad"><h3 class="sec-h">${I.users} Friends <em>${fr.length}</em></h3>
        ${fr.length ? `<div class="list">${fr.map((x) => `<div class="row fr-row" data-u="${x.uid}">${vipAv(x.name, x.avatar, x.vip || 0)}<span class="grow"><b>${esc(x.name)}${online(x.last_seen) ? '<i class="online"></i>' : ''}${bestie.B.brief && bestie.B.brief.uid === x.uid ? ` <span class="tag-s bf">${I.heart} Bestie</span>` : ''}</b><small>${x.vip ? `VIP ${x.vip} · ` : ''}${esc(levelLabel(x.sum))} · ${x.sum.streak} day streak · ${x.walls || 0}/${walls.total()} wallpapers</small></span><button class="icon-btn fr-more" type="button" title="More: profile, message, duel, Bestie">${I.more}</button><button class="icon-btn fr-rm" data-u="${x.uid}" data-n="${esc(x.name)}" type="button" title="Remove friend">${I.trash}</button></div>`).join('')}</div>` : '<p class="muted" style="font-size:.9rem">No friends yet. Share your code above, or tap a name in the Ranking.</p>'}
        ${out.length ? `<h3 class="sec-h" style="margin-top:14px">Sent requests</h3><div class="list">${out.map((x) => `<div class="row">${avatar(x.name, x.avatar)}<span class="grow"><b>${esc(x.name)}</b><small>waiting · ${ago(x.since)}</small></span><button class="btn sm ghost fr-no" data-u="${x.uid}" type="button">Cancel</button></div>`).join('')}</div>` : ''}
      </section>
    </div>
  </div>`, null, { noCourse: true });
  const q = (s) => app.querySelector(s);
  q('.cp-code').addEventListener('click', () => copyText(me.code, 'Friend code copied'));
  q('.cp-link').addEventListener('click', () => copyText(link, 'Invite link copied'));
  app.querySelectorAll('.lb-mode button').forEach((b) => b.addEventListener('click', () => { lbMode = b.dataset.m; sfx('tap'); friendsPage(); }));
  q('.addf').addEventListener('submit', async (e) => {
    e.preventDefault(); const v = q('.who').value.trim(); if (!v) return;
    try { const j = await call('learn_friend_request', { p_who: v }); if (!j.ok) { q('.addf-err').textContent = errMsg(j); sfx('bad'); return; } sfx('ok'); toast(j.accepted ? 'You are now friends!' : 'Friend request sent'); friendsPage(); } catch (er) { q('.addf-err').textContent = er.message; }
  });
  app.querySelectorAll('.fr-ok').forEach((b) => b.addEventListener('click', async () => { try { await call('learn_friend_respond', { p_uid: +b.dataset.u, p_accept: true }); sfx('ok'); toast('Friend added'); hub.poll(); friendsPage(); } catch (e) { toast(e.message); } }));
  app.querySelectorAll('.fr-no').forEach((b) => b.addEventListener('click', async () => { try { await call('learn_friend_respond', { p_uid: +b.dataset.u, p_accept: false }); hub.poll(); friendsPage(); } catch (e) { toast(e.message); } }));
  ctxm.attach(app, '.fr-row', (row) => { const x = fr.find((f) => String(f.uid) === row.dataset.u); return x ? { uid: x.uid, name: x.name, avatar: x.avatar, vip: x.vip, rel: 'friend', last_seen: x.last_seen } : null; });
  ctxm.attach(app, '.lb-row[data-u]', (row) => { const x = board.find((f) => String(f.uid) === row.dataset.u); return x ? { uid: x.uid, name: x.name, avatar: x.avatar, vip: x.vip, rel: x.me ? 'me' : 'friend', last_seen: x.last_seen } : null; });
  bestie.wireSection(app, () => friendsPage(['bestie']));
  wireGroups(app, groups, fr);
  if (args[0] === 'bestie' || location.hash.startsWith('#/bestie')) { const b = app.querySelector('[data-bst]'); if (b) setTimeout(() => b.scrollIntoView({ block: 'start', behavior: 'smooth' }), 150); }
  hub.hub.friends = d; hub.hub.fAt = Date.now(); hub.renderRail();
  app.querySelectorAll('.fr-rm').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox('Remove friend?', `${b.dataset.n} will no longer see your progress.`, 'Remove', true))) return; try { await call('learn_friend_respond', { p_uid: +b.dataset.u, p_accept: false }); friendsPage(); } catch (e) { toast(e.message); } }));
}
/* ---------- v23: nhóm bạn bè + quiz nhanh (thành viên tự vào phòng chờ) ---------- */
function groupsHTML(groups, fr) {
  return `<section class="panel pad grp"><h3 class="sec-h">${I.users} Groups <em>${groups.length}</em><button class="btn sm ghost grp-new" type="button" ${fr.length ? '' : 'disabled title="Add friends first"'}>${I.plus} New group</button></h3>
    ${groups.length ? `<div class="list">${groups.map((g) => `<div class="grp-i" data-g="${g.id}"><div class="grp-h"><b>${esc(g.name)}</b><small>${g.members.length} member${g.members.length === 1 ? '' : 's'} · ${g.members.filter((m) => online(m.last_seen)).length} online</small></div>
      <div class="grp-av">${g.members.slice(0, 10).map((m) => `<span title="${esc(m.name)}" class="${online(m.last_seen) ? 'on' : ''}">${vipAv(m.name, m.avatar, m.vip || 0)}</span>`).join('')}</div>
      <div class="grp-acts"><button class="btn sm acc grp-quiz" type="button">${I.zap} Quick quiz</button>${g.mine ? `<button class="btn sm ghost grp-edit" type="button">${I.edit} Edit</button>` : ''}<button class="btn sm ghost grp-leave" type="button">${g.mine ? 'Delete' : 'Leave'}</button></div></div>`).join('')}</div>`
      : `<p class="muted" style="font-size:.9rem">${fr.length ? 'Put friends in a group, then start a quick quiz: everyone in the group who is online joins automatically.' : 'Add friends first, then put them in groups.'}</p>`}</section>`;
}
function groupSheet(g, fr, done) {
  const on = new Set(g ? g.members.map((m) => m.uid) : []);
  sheet(`<h2>${g ? 'Edit group' : 'New group'}</h2><p class="sub">Pick friends for this group (up to 29).</p>
    <div class="field"><label for="gn">Group name</label><input class="input" id="gn" maxlength="40" value="${esc(g ? g.name : '')}" placeholder="e.g. Office English club"></div>
    <div class="list grp-pick">${fr.map((f) => `<label class="row"><input type="checkbox" value="${f.uid}" ${on.has(f.uid) ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--acc)">${vipAv(f.name, f.avatar, f.vip || 0)}<span class="grow"><b>${esc(f.name)}</b></span></label>`).join('')}</div>
    <p class="err"></p><button class="btn acc wide grp-save" type="button">Save group</button>`, (el, close) => {
    el.querySelector('.grp-save').addEventListener('click', async () => {
      const name = el.querySelector('#gn').value.trim(), ids = [...el.querySelectorAll('.grp-pick input:checked')].map((x) => +x.value), err = el.querySelector('.err');
      if (!name) { err.textContent = 'Give the group a name.'; return; }
      try { const j = await call('learn_group_save', { p_id: g ? g.id : null, p_name: name, p_members: ids }); if (!j.ok) { err.textContent = { toomany: 'Up to 29 friends per group.', limit: 'You can own up to 20 groups.', notowner: 'Only the group owner can edit it.' }[j.error] || j.error; return; } sfx('ok'); close(); done(); } catch (e) { err.textContent = e.message; }
    });
  });
}
async function quickQuiz(g) {
  try { await bank(); } catch (e) { toast('Could not load questions'); return; }
  const ids = shuffleArr(BANK.topics.map((t) => t.id)).slice(0, 3);
  let questions = fromTopics(ids, 10);
  try { const c = await C.course(S.lang), L = c.levels.find((x) => x.id === S.level[S.lang]) || c.levels[0]; const us = L.units.filter((u) => unitProgress(u.id) > 0); questions = shuffleArr([...questions.slice(0, 6), ...buildQuestions(S.lang, us.length ? us : L.units.slice(0, 3), { words: true, grammar: true, reading: false }, 4)]); } catch (e) {}
  const settings = { ...lastSetup, time: 20, points: 'standard', speed: true, streak: true, show_q: true, shuffle: false, guests: false, late: true };
  try {
    const j = await call('learn_group_quiz', { p_id: g.id, p_title: `${g.name} quick quiz`, p_questions: questions, p_settings: settings });
    if (!j.ok) { toast(errMsg(j)); return; }
    sfx('levelup'); toast(`${j.invited} member${j.invited === 1 ? '' : 's'} invited. Online members join automatically.`);
    location.hash = '#/host/' + j.host_key;
  } catch (e) { toast(e.message); }
}
function wireGroups(root, groups, fr) {
  const nb = root.querySelector('.grp-new'); if (nb) nb.addEventListener('click', () => groupSheet(null, fr, () => friendsPage()));
  root.querySelectorAll('.grp-i').forEach((el) => {
    const g = groups.find((x) => x.id === +el.dataset.g); if (!g) return;
    el.querySelector('.grp-quiz').addEventListener('click', (e) => { e.currentTarget.disabled = true; quickQuiz(g); });
    const ed = el.querySelector('.grp-edit'); if (ed) ed.addEventListener('click', () => groupSheet(g, fr, () => friendsPage()));
    el.querySelector('.grp-leave').addEventListener('click', async () => { if (!(await confirmBox(g.mine ? `Delete “${g.name}”?` : `Leave “${g.name}”?`, g.mine ? 'The group is removed for everyone.' : 'You can be added again later.', g.mine ? 'Delete' : 'Leave', true))) return; try { await call('learn_group_leave', { p_id: g.id }); friendsPage(); } catch (e) { toast(e.message); } });
  });
}
// quiz nhóm: tự vào phòng chờ với tên tài khoản
export async function autoJoin(gq) {
  if (!acct || !gq || !gq.pin) return;
  let tok = null; try { tok = await ensureToken(); } catch (e) {}
  let nick = acct.name.slice(0, 20), j = null;
  for (let k = 0; k < 3; k++) { try { j = await rpc('learn_quiz_join', { p_pin: gq.pin, p_nick: nick, p_token: tok }); } catch (e) { break; } if (j && j.ok) break; if (j && j.error === 'nicktaken') nick = (acct.name.slice(0, 17) + ' ' + (k + 2)); else break; }
  if (!j || !j.ok) { toast(`${gq.host || 'A friend'} started a group quiz · PIN ${gq.pin}`); return; }
  setPKey(gq.pin, { pkey: j.pkey, nick: j.nick }); sfx('levelup');
  toast(`Joining ${gq.host || 'your group'}’s quiz in ${gq.gname || 'your group'}…`);
  document.getElementById('sheet-root').innerHTML = '';
  location.hash = '#/play/' + gq.pin;
}
function levelLabel(sum) {
  if (!sum) return '';
  const l = sum.lang || 'en', lv = sum.level && sum.level[l];
  const nm = { en: 'English', zh: 'Chinese', ielts: 'IELTS' }[l] || l;
  return `${nm}${lv ? ' ' + String(lv).toUpperCase().replace('HSK', 'HSK ') : ''}`;
}

/* =========================================================
   CLASSES
   ========================================================= */
export async function classesPage(args = []) {
  const route = '#/classes';
  if (!acct) return needAccount(route, 'Classes', 'Join your teacher’s class with a code, or create your own class and invite learners.');
  if (args[0] === 'join' && args[1]) {
    const code = decodeURIComponent(args[1]); history.replaceState(null, '', '#/classes');
    try { const j = await call('learn_room_join', { p_code: code }); if (j.ok) { toast(j.already ? 'You are already in this class' : 'Welcome to the class!'); location.hash = '#/class/' + j.id; return; } toast(errMsg(j)); } catch (e) { toast(e.message); }
  }
  loading(route, 'Classes');
  let d; try { d = await call('learn_rooms_mine'); } catch (e) { return failed(route, 'Classes', e); }
  if (!location.hash.startsWith('#/classes')) return;
  const items = d.items || [];
  const act = items.filter((x) => !x.archived), arc = items.filter((x) => x.archived);
  const card = (x) => `<a class="panel cl-card" href="#/class/${x.id}" style="text-decoration:none"><div class="cl-meta"><span class="tag-s ${x.role === 'teacher' ? 'acc' : x.role === 'assistant' ? 'vio' : ''}">${ROLE[x.role]}</span><span class="tag-s">${esc(C.COURSES[x.lang] ? C.COURSES[x.lang].name : x.lang)}${x.level ? ' · ' + esc(x.level.toUpperCase()) : ''}</span>${x.archived ? '<span class="tag-s">Archived</span>' : ''}</div><h3>${esc(x.name)}</h3><div class="cl-foot">${I.users}<span>${x.members} member${x.members === 1 ? '' : 's'}</span>${I.flag}<span>${x.tasks} assignment${x.tasks === 1 ? '' : 's'}</span><span style="margin-left:auto">${x.last_post ? ago(x.last_post) : ''}</span></div></a>`;
  C.shell(route, `<div class="page-h"><div><h1 class="serif">Classes</h1><p>A class has a teacher, assignments from the course, a class stream, live quizzes and a progress report.</p></div><div class="acts"><button class="btn acc mk" type="button">${I.plus} Create a class</button></div></div>
  <section class="panel pad" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px"><span class="ml-ic">${I.school}</span><span style="flex:1;min-width:200px"><b>Join a class</b><small class="muted" style="display:block">Enter the 6-character code from your teacher</small></span><form class="joinf" style="display:flex;gap:8px" novalidate><input class="input jc" maxlength="6" placeholder="ABC123" style="width:150px;text-transform:uppercase;letter-spacing:.2em;font-weight:800;text-align:center" /><button class="btn acc" type="submit">Join</button></form></section>
  ${act.length ? `<div class="cl-grid">${act.map(card).join('')}</div>` : `<div class="panel empty"><span class="e-ic">${I.school}</span><h2>No classes yet</h2><p>Join with a code from your teacher, or create a class to teach friends or colleagues.</p></div>`}
  ${arc.length ? `<h3 class="sec-h" style="margin-top:22px">Archived</h3><div class="cl-grid">${arc.map(card).join('')}</div>` : ''}`, null, { noCourse: true });
  app.querySelector('.mk').addEventListener('click', createClassSheet);
  app.querySelector('.joinf').addEventListener('submit', async (e) => {
    e.preventDefault(); const v = app.querySelector('.jc').value.trim().toUpperCase(); if (v.length < 6) return toast('The class code has 6 characters');
    try { const j = await call('learn_room_join', { p_code: v }); if (!j.ok) { sfx('bad'); return toast(errMsg(j)); } sfx('ok'); location.hash = '#/class/' + j.id; } catch (er) { toast(er.message); }
  });
}
async function levelsOf(lang) { try { const c = await C.course(lang); return c.levels; } catch (e) { return []; } }
async function createClassSheet() {
  const langs = C.AVAIL;
  const lv = {}; for (const l of langs) lv[l] = await levelsOf(l);
  sheet(`<h2>Create a class</h2><p class="sub">You become the teacher. Learners join with the class code. You can hand the teacher role to someone else later.</p>
    <form class="ccf" novalidate>
      <div class="field"><label>Class name</label><input class="input cn" maxlength="60" placeholder="e.g. Office English — Monday group" /></div>
      <div class="field"><label>Course</label><select class="input cl">${langs.map((l) => `<option value="${l}" ${S.lang === l ? 'selected' : ''}>${esc(C.COURSES[l].name)}</option>`).join('')}</select></div>
      <div class="field"><label>Level</label><select class="input clv"></select></div>
      <div class="field"><label>Description (optional)</label><textarea class="input cd" maxlength="400" placeholder="What this class is about, when you meet…"></textarea></div>
      <p class="err"></p><button class="btn acc wide" type="submit">Create class</button></form>`, (el, close) => {
    const sel = el.querySelector('.cl'), lsel = el.querySelector('.clv');
    const fill = () => { lsel.innerHTML = lv[sel.value].map((L) => `<option value="${L.id}" ${S.level[sel.value] === L.id ? 'selected' : ''}>${esc(L.name)} · ${esc(L.title)}</option>`).join(''); };
    fill(); sel.addEventListener('change', fill);
    el.querySelector('.ccf').addEventListener('submit', async (e) => {
      e.preventDefault(); const n = el.querySelector('.cn').value.trim(); if (n.length < 2) { el.querySelector('.err').textContent = 'Give the class a name'; return; }
      try { const j = await call('learn_room_create', { p_name: n, p_lang: sel.value, p_level: lsel.value, p_desc: el.querySelector('.cd').value }); if (!j.ok) { el.querySelector('.err').textContent = errMsg(j); return; } close(); sfx('levelup'); toast('Class created. Share the code with your learners.'); location.hash = '#/class/' + j.id; }
      catch (er) { el.querySelector('.err').textContent = er.message; }
    });
  });
}

let roomCache = null;
export async function classPage(id, tab = 'stream') {
  const route = '#/class';
  if (!acct) return needAccount(route, 'Class', 'Sign in to open this class.');
  if (!roomCache || roomCache.room.id !== +id) loading(route, 'Class');
  let d; try { d = await call('learn_room_get', { p_room: +id }); } catch (e) { return failed(route, 'Class', e); }
  if (!location.hash.startsWith('#/class/' + id)) return;
  if (!d.ok) { C.shell(route, `<div class="panel empty"><span class="e-ic">${I.lock}</span><h2>${esc(errMsg(d))}</h2><a class="btn acc" href="#/classes">Back to classes</a></div>`, null, { noCourse: true }); return; }
  roomCache = d;
  bestie.checkHere('room', id).catch(() => {});
  const r = d.room, role = d.role, staff = role !== 'student', isOwner = r.owner === d.me;
  const students = d.members.filter((m) => m.role === 'student');
  const tabs = [['stream', 'Stream', 'flag'], ['chat', 'Chat', 'chat'], ['tasks', 'Assignments', 'list'], ['members', 'People', 'users'], ['quizzes', 'Quizzes', 'zap'], ...(staff ? [['report', 'Report', 'chart']] : [])];
  if (!tabs.some((t) => t[0] === tab)) tab = 'stream';
  const link = `${SITE}#/classes/join/${r.code}`;
  C.shell(route, `<section class="panel cl-hero">
    <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag-s ${role === 'teacher' ? 'acc' : role === 'assistant' ? 'vio' : ''}">${ROLE[role]}${isOwner ? ' · owner' : ''}</span><span class="tag-s">${esc(C.COURSES[r.lang] ? C.COURSES[r.lang].name : r.lang)}${r.level ? ' · ' + esc(r.level.toUpperCase()) : ''}</span><span class="tag-s">${I.users} ${d.members.length}</span>${r.archived ? '<span class="tag-s gold">Archived</span>' : ''}${r.settings && r.settings.open === false ? '<span class="tag-s">Closed to new members</span>' : ''}</div>
    <h1>${esc(r.name)}</h1>${r.description ? `<p>${esc(r.description)}</p>` : ''}
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="fr-code cl-code"><small class="muted">Class code</small><b>${esc(r.code)}</b><button class="icon-btn cp-code" type="button" title="Copy code">${I.copy}</button></span><button class="btn sm ghost cp-link" type="button">${I.link} Invite link</button><button class="btn sm ghost inv-fr" type="button">${I.users} Invite friends</button>
      <span style="flex:1"></span>${staff ? `<button class="btn sm acc live" type="button">${I.zap} Start a live quiz</button>` : ''}${role === 'teacher' ? `<button class="icon-btn set" type="button" title="Class settings">${I.gear}</button>` : ''}<button class="icon-btn leave" type="button" title="Leave class">${I.door}</button></div>
  </section>
  <div class="cl-tabs" role="tablist">${tabs.map(([k, l, ic]) => `<button type="button" data-t="${k}" aria-pressed="${k === tab}">${I[ic]}${l}</button>`).join('')}</div>
  <div class="cl-body"></div>`, null, { noCourse: true });
  app.querySelector('.cp-code').addEventListener('click', () => copyText(r.code, 'Class code copied'));
  app.querySelector('.cp-link').addEventListener('click', () => copyText(link, 'Invite link copied'));
  app.querySelector('.inv-fr').addEventListener('click', () => hub.inviteSheet('class', { room: r.id }, r.name));
  app.querySelectorAll('.cl-tabs button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); history.replaceState(null, '', `#/class/${id}/${b.dataset.t}`); classPage(id, b.dataset.t); }));
  const lv = app.querySelector('.live'); if (lv) lv.addEventListener('click', () => quizSetupSheet({ room: r }));
  const st = app.querySelector('.set'); if (st) st.addEventListener('click', () => classSettings(d));
  app.querySelector('.leave').addEventListener('click', async () => {
    if (isOwner && d.members.length > 1) return toast('You own this class. Hand it to another teacher in People first, or delete it in Settings.');
    if (!(await confirmBox('Leave this class?', 'You can rejoin later with the class code.', 'Leave', true))) return;
    const j = await act(id, 'leave'); if (j) location.hash = '#/classes';
  });
  const body = app.querySelector('.cl-body');
  if (tab === 'stream') return classStream(d, body, id);
  if (tab === 'chat') { body.innerHTML = '<div class="cl-chat"></div>'; return chat.openRoom(r, body.querySelector('.cl-chat')); }
  if (tab === 'tasks') return classTasks(d, body, id);
  if (tab === 'members') return classPeople(d, body, id);
  if (tab === 'quizzes') return classQuizzes(d, body);
  if (tab === 'report') return classReport(d, body, students);
}
async function act(id, action, arg = {}) {
  try { const j = await call('learn_room_admin', { p_room: +id, p_action: action, p_arg: arg }); if (!j.ok) { toast(errMsg(j)); sfx('bad'); return null; } return j; } catch (e) { toast(e.message); return null; }
}
function classStream(d, body, id) {
  const staff = d.role !== 'student', canPost = staff || !d.room.settings || d.room.settings.student_posts !== false;
  body.innerHTML = `${canPost ? `<form class="panel composer" novalidate>${avatar(acct.name, acct.avatar)}<textarea class="input pb" maxlength="1000" placeholder="Share something with the class…"></textarea><button class="btn acc" type="submit" aria-label="Post">${I.send}</button></form>` : ''}
  <div class="list" style="margin-top:12px">${d.posts.length ? d.posts.map((p) => p.kind === 'system' ? `<div class="post sys">${I.flag.replace('<svg', '<svg style="width:13px;height:13px;display:inline;vertical-align:-2px;margin-right:6px"')}<b>${esc(p.name || 'Someone')}</b> ${esc(p.body)} · ${ago(p.created_at)}</div>`
    : `<article class="post ${p.pinned ? 'pinned' : ''}">${avatar(p.name, p.avatar)}<div><div class="post-h"><b>${esc(p.name || 'Former member')}</b><small>${ago(p.created_at)}</small>${p.pinned ? `<span class="tag-s gold">${I.pin} Pinned</span>` : ''}<span class="post-a">${staff ? `<button class="pin-p" data-p="${p.id}" type="button" title="${p.pinned ? 'Unpin' : 'Pin'}">${I.pin}</button>` : ''}${staff || p.uid === d.me ? `<button class="del-p" data-p="${p.id}" type="button" title="Delete">${I.trash}</button>` : ''}</span></div><div class="post-b">${esc(p.body)}</div></div></article>`).join('') : '<div class="panel empty"><p>No posts yet.</p></div>'}</div>`;
  const f = body.querySelector('.composer');
  if (f) {
    const ta = f.querySelector('.pb');
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(200, ta.scrollHeight) + 'px'; });
    f.addEventListener('submit', async (e) => { e.preventDefault(); if (!ta.value.trim()) return; const j = await act(id, 'post', { body: ta.value }); if (j) { sfx('pop'); classPage(id, 'stream'); } });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); });
  }
  body.querySelectorAll('.pin-p').forEach((b) => b.addEventListener('click', async () => { if (await act(id, 'pin_post', { id: +b.dataset.p })) classPage(id, 'stream'); }));
  body.querySelectorAll('.del-p').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox('Delete this post?', 'This cannot be undone.', 'Delete', true))) return; if (await act(id, 'delete_post', { id: +b.dataset.p })) classPage(id, 'stream'); }));
}
// tình trạng một bài tập của chính mình (từ tiến độ trên máy)
function myTaskState(t) {
  const d = S.done[t.unit_id] || [];
  if (t.lesson == null) return d.filter(Boolean).length >= LN ? 'done' : d.some(Boolean) ? 'part' : 'todo';
  return d[t.lesson] ? 'done' : 'todo';
}
async function classTasks(d, body, id) {
  const staff = d.role !== 'student', nStu = d.members.filter((m) => m.role === 'student').length;
  const units = {}; // tên chủ đề
  for (const t of d.tasks) { if (units[t.unit_id]) continue; try { const c = await C.course(t.lang); const f = C.findUnit(c, t.unit_id); if (f) units[t.unit_id] = { L: f.L, u: f.u, c }; } catch (e) {} }
  const now = Date.now();
  body.innerHTML = `${staff ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn acc add-t" type="button">${I.plus} New assignment</button></div>` : ''}
  ${d.tasks.length ? `<div class="list">${d.tasks.map((t) => {
    const info = units[t.unit_id], st = myTaskState(t), late = t.due_at && new Date(t.due_at).getTime() < now && st !== 'done';
    const what = info ? `${info.L.name} · ${info.u.title}${t.lesson != null ? ' · ' + C.lessonName(t.lang, t.lesson) : ' · whole unit (8 lessons)'}` : t.unit_id;
    return `<div class="task panel ${st === 'done' ? 'done' : late ? 'late' : ''}"><span class="t-ic">${st === 'done' ? I.check : I.flag}</span><span><b>${esc(t.title)}</b><small>${esc(what)}</small><small>${t.due_at ? `Due ${fmtDate(t.due_at)}${late ? ' · overdue' : ''}` : 'No due date'}${staff ? ` · ${t.done_by}/${nStu} students done` : ''}</small></span>
      <span style="display:flex;gap:6px;align-items:center">${staff ? `<span class="pbar" title="${t.done_by}/${nStu}"><i style="width:${nStu ? Math.round(t.done_by / nStu * 100) : 0}%"></i></span>` : ''}${info ? `<button class="btn sm ${st === 'done' ? 'ghost' : 'acc'} go-t" data-t="${t.id}" type="button">${st === 'done' ? 'Review' : st === 'part' ? 'Continue' : 'Start'}</button>` : ''}${staff ? `<button class="icon-btn del-t" data-t="${t.id}" type="button" title="Delete">${I.trash}</button>` : ''}</span></div>`;
  }).join('')}</div>` : `<div class="panel empty"><span class="e-ic">${I.flag}</span><h2>No assignments</h2><p>${staff ? 'Set a unit or a single lesson from the course. Students see it here and you see who finished it.' : 'Your teacher has not set any assignments yet.'}</p></div>`}`;
  const a = body.querySelector('.add-t'); if (a) a.addEventListener('click', () => taskSheet(d, id));
  body.querySelectorAll('.del-t').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox('Delete assignment?', 'Students will no longer see it.', 'Delete', true))) return; if (await act(id, 'task_del', { id: +b.dataset.t })) classPage(id, 'tasks'); }));
  body.querySelectorAll('.go-t').forEach((b) => b.addEventListener('click', () => {
    const t = d.tasks.find((x) => x.id === +b.dataset.t), info = units[t.unit_id]; if (!info) return;
    unlockAudio();
    S.lang = t.lang; S.level[t.lang] = info.L.id; save();
    let k = t.lesson; if (k == null) { const dn = S.done[t.unit_id] || []; k = [0, 1, 2, 3, 4, 5, 6, 7].find((i) => !dn[i]); if (k === undefined) k = 7; }
    sessionStorage.setItem('dcl_back', `#/class/${id}/tasks`);
    C.startLesson(info.c, t.unit_id, k);
  }));
}
async function taskSheet(d, id) {
  const r = d.room, lang = r.lang, c = await C.course(lang);
  sheet(`<h2>New assignment</h2><p class="sub">Pick a unit, or one lesson inside it. Completion is tracked automatically from each student’s progress.</p>
    <form class="tf" novalidate>
      <div class="field"><label>Level</label><select class="input tl">${c.levels.map((L) => `<option value="${L.id}" ${(r.level || S.level[lang]) === L.id ? 'selected' : ''}>${esc(L.name)} · ${esc(L.title)}</option>`).join('')}</select></div>
      <div class="field"><label>Unit</label><select class="input tu"></select></div>
      <div class="field"><label>What to do</label><select class="input tk"><option value="">Whole unit (all 8 lessons)</option>${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<option value="${k}">Lesson ${k + 1}: ${esc(C.lessonName(lang, k))}</option>`).join('')}</select></div>
      <div class="field"><label>Title</label><input class="input tt" maxlength="120" /></div>
      <div class="field"><label>Due date (optional)</label><input class="input td" type="datetime-local" /></div>
      <p class="err"></p><button class="btn acc wide" type="submit">Set assignment</button></form>`, (el, close) => {
    const tl = el.querySelector('.tl'), tu = el.querySelector('.tu'), tk = el.querySelector('.tk'), tt = el.querySelector('.tt');
    let edited = false; tt.addEventListener('input', () => { edited = true; });
    const title = () => { if (edited) return; const L = c.levels.find((x) => x.id === tl.value), u = L && L.units.find((x) => x.id === tu.value); if (!u) return; tt.value = tk.value === '' ? `${L.name} · ${u.title}` : `${u.title} — ${C.lessonName(lang, +tk.value)}`; };
    const fillU = () => { const L = c.levels.find((x) => x.id === tl.value); tu.innerHTML = L.units.map((u, i) => `<option value="${u.id}">Unit ${i + 1}: ${esc(u.title)}</option>`).join(''); title(); };
    fillU(); tl.addEventListener('change', fillU); tu.addEventListener('change', title); tk.addEventListener('change', title);
    el.querySelector('.tf').addEventListener('submit', async (e) => {
      e.preventDefault(); const dv = el.querySelector('.td').value;
      const j = await act(id, 'task_add', { title: tt.value, lang, unit_id: tu.value, lesson: tk.value, due_at: dv ? new Date(dv).toISOString() : '' });
      if (j) { close(); sfx('ok'); toast('Assignment set'); classPage(id, 'tasks'); }
    });
  });
}
function classPeople(d, body, id) {
  const staff = d.role !== 'student', teacher = d.role === 'teacher', owner = d.room.owner === d.me;
  const nT = d.tasks.length;
  const sorted = [...d.members].sort((a, b) => (b.week_xp || 0) - (a.week_xp || 0));
  body.innerHTML = `<section class="panel pad" style="margin-bottom:14px"><h3 class="sec-h">${I.chart} This week’s leaderboard <em>XP earned in the last 7 days</em></h3>
    <div class="lb">${sorted.slice(0, 10).map((m, i) => `<div class="lb-row ${m.uid === d.me ? 'me' : ''}"><span class="lb-rank">${i + 1}</span>${avatar(m.name, m.avatar)}<span class="lb-n"><b>${esc(m.name)}${online(m.last_seen) ? '<i class="online"></i>' : ''}</b><small>${ROLE[m.role]} · ${m.sum.streak} day streak</small></span><span class="lb-v">${m.week_xp || 0}<small>XP</small></span></div>`).join('')}</div></section>
  <section class="panel"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Member</th><th>Role</th>${staff ? '<th class="num">Units</th><th class="num">Assignments</th><th class="num">Quiz avg</th>' : ''}<th>Last seen</th>${staff ? '<th></th>' : ''}</tr></thead><tbody>
  ${d.members.map((m) => `<tr><td><span class="who">${avatar(m.name, m.avatar)}<span><b>${esc(m.name)}</b>${m.uid === d.room.owner ? '<small class="muted" style="display:block">Owner</small>' : ''}</span></span></td>
    <td>${teacher && m.uid !== d.room.owner && m.uid !== d.me ? `<select class="input role" data-u="${m.uid}" style="height:34px;width:auto;padding:0 10px;font-size:.84rem">${['student', 'assistant', 'teacher'].map((x) => `<option value="${x}" ${m.role === x ? 'selected' : ''}>${ROLE[x]}</option>`).join('')}</select>` : `<span class="tag-s ${m.role === 'teacher' ? 'acc' : m.role === 'assistant' ? 'vio' : ''}">${ROLE[m.role]}</span>`}</td>
    ${staff ? `<td class="num">${m.sum.units}</td><td class="num">${m.tasks_done}/${nT}</td><td class="num">${m.quiz_avg == null ? '–' : m.quiz_avg + '%'}</td>` : ''}
    <td>${online(m.last_seen) ? '<span style="color:var(--ok);font-weight:700">Online</span>' : ago(m.last_seen)}</td>
    ${staff ? `<td style="white-space:nowrap">${owner && m.uid !== d.me ? `<button class="icon-btn xfer" data-u="${m.uid}" data-n="${esc(m.name)}" type="button" title="Hand the class to ${esc(m.name)}">${I.crown}</button>` : ''}${m.uid !== d.room.owner && m.uid !== d.me && (teacher || m.role === 'student') ? `<button class="icon-btn kick" data-u="${m.uid}" data-n="${esc(m.name)}" type="button" title="Remove from class">${I.x}</button>` : ''}</td>` : ''}</tr>`).join('')}
  </tbody></table></div></section>
  ${teacher ? '<p class="muted" style="font-size:.84rem;margin-top:10px">Teachers can set assignments, start quizzes, see the report and change roles. Assistants can do the same except change roles. The crown button hands the whole class (ownership) to another member.</p>' : ''}`;
  body.querySelectorAll('.role').forEach((s) => s.addEventListener('change', async () => { if (await act(id, 'set_role', { uid: +s.dataset.u, role: s.value })) { sfx('ok'); toast('Role updated'); classPage(id, 'members'); } }));
  body.querySelectorAll('.kick').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox(`Remove ${b.dataset.n}?`, 'They can rejoin with the class code unless you change it.', 'Remove', true))) return; if (await act(id, 'kick', { uid: +b.dataset.u })) classPage(id, 'members'); }));
  body.querySelectorAll('.xfer').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox(`Hand the class to ${b.dataset.n}?`, `${b.dataset.n} becomes the owner and a teacher. You stay in the class as a teacher.`, 'Hand over'))) return; if (await act(id, 'transfer', { uid: +b.dataset.u })) { toast('Class handed over'); classPage(id, 'members'); } }));
}
function classQuizzes(d, body) {
  const staff = d.role !== 'student';
  body.innerHTML = `${staff ? `<div style="display:flex;justify-content:flex-end;margin-bottom:12px"><button class="btn acc nq" type="button">${I.zap} Start a live quiz</button></div>` : ''}
  ${d.quizzes.length ? `<div class="list">${d.quizzes.map((g) => `<div class="row"><span class="ml-ic">${I.zap}</span><span class="grow"><b>${esc(g.title)}</b><small>${fmtDate(g.created_at)} · ${g.questions} questions · ${g.players} players${g.winner ? ' · winner ' + esc(g.winner) : ''}</small></span>${g.state !== 'ended' ? `<a class="btn sm acc" href="#/play/${g.pin}">Join · PIN ${g.pin}</a>` : `<a class="btn sm ghost" href="#/quizreport/${g.id}">Report</a>`}</div>`).join('')}</div>` : `<div class="panel empty"><span class="e-ic">${I.zap}</span><h2>No quizzes yet</h2><p>${staff ? 'Start a live quiz from this class’s course. Everyone joins with the PIN on their own phone.' : 'When your teacher starts a live quiz, join with the PIN.'}</p></div>`}`;
  const n = body.querySelector('.nq'); if (n) n.addEventListener('click', () => quizSetupSheet({ room: d.room }));
}
function classReport(d, body, students) {
  const nT = d.tasks.length, wk = 7 * 86400000;
  const active = students.filter((m) => (m.week_xp || 0) > 0 || (m.last_seen && Date.now() - new Date(m.last_seen).getTime() < wk)).length;
  const taskPct = students.length && nT ? Math.round(students.reduce((a, m) => a + m.tasks_done, 0) / (students.length * nT) * 100) : null;
  const qs = students.filter((m) => m.quiz_avg != null), qAvg = qs.length ? Math.round(qs.reduce((a, m) => a + m.quiz_avg, 0) / qs.length) : null;
  const xpW = students.reduce((a, m) => a + (m.week_xp || 0), 0);
  body.innerHTML = `<div class="kpis" style="margin-bottom:14px">
    <div class="panel kpi"><small>Students</small><b>${students.length}</b><em>${d.members.length - students.length} staff</em></div>
    <div class="panel kpi"><small>Active this week</small><b>${active}</b><em>${students.length ? Math.round(active / students.length * 100) : 0}% of students</em></div>
    <div class="panel kpi"><small>Assignments done</small><b>${taskPct == null ? '–' : taskPct + '%'}</b><em>${nT} assignment${nT === 1 ? '' : 's'}</em></div>
    <div class="panel kpi"><small>Average quiz score</small><b>${qAvg == null ? '–' : qAvg + '%'}</b><em>${d.quizzes.filter((g) => g.state === 'ended').length} quizzes played</em></div>
    <div class="panel kpi"><small>XP this week</small><b>${xpW}</b><em>whole class</em></div></div>
  <section class="panel" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:10px;padding:14px 16px 4px"><h3 class="sec-h" style="margin:0">${I.users} Students</h3><span style="flex:1"></span><button class="btn sm ghost csv" type="button">${I.download} Export CSV</button></div>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Student</th><th class="num">XP week</th><th class="num">XP total</th><th class="num">Streak</th><th class="num">Lessons</th><th class="num">Units</th><th class="num">Assignments</th><th class="num">Quiz avg</th><th>Last seen</th></tr></thead><tbody>
  ${[...students].sort((a, b) => (b.week_xp || 0) - (a.week_xp || 0)).map((m, i) => `<tr><td>${i + 1}</td><td><span class="who">${avatar(m.name, m.avatar)}<b>${esc(m.name)}</b></span></td><td class="num">${m.week_xp || 0}</td><td class="num">${m.sum.xp}</td><td class="num">${m.sum.streak}</td><td class="num">${m.sum.lessons}</td><td class="num">${m.sum.units}</td><td class="num">${m.tasks_done}/${nT} <span class="pbar"><i style="width:${nT ? Math.round(m.tasks_done / nT * 100) : 0}%"></i></span></td><td class="num">${m.quiz_avg == null ? '–' : m.quiz_avg + '%'}</td><td>${ago(m.last_seen)}</td></tr>`).join('') || '<tr><td colspan="10" class="muted">No students yet. Share the class code.</td></tr>'}
  </tbody></table></div></section>
  ${nT ? `<section class="panel pad" style="margin-bottom:14px"><h3 class="sec-h">${I.flag} Assignments</h3><div class="list">${d.tasks.map((t) => `<div style="display:grid;grid-template-columns:minmax(0,1fr) 160px 60px;gap:12px;align-items:center;font-size:.9rem"><span>${esc(t.title)}<small class="muted" style="display:block">${t.due_at ? 'Due ' + fmtDate(t.due_at) : 'No due date'}</small></span><span class="pbar" style="width:100%"><i style="width:${students.length ? Math.round(t.done_by / students.length * 100) : 0}%"></i></span><b class="num" style="text-align:right">${t.done_by}/${students.length}</b></div>`).join('')}</div></section>` : ''}
  <section class="panel pad"><h3 class="sec-h">${I.zap} Quizzes</h3>${d.quizzes.length ? `<div class="list">${d.quizzes.map((g) => `<div class="row"><span class="grow"><b>${esc(g.title)}</b><small>${fmtDate(g.created_at)} · ${g.players} players${g.winner ? ' · winner ' + esc(g.winner) : ''}</small></span>${g.state === 'ended' ? `<a class="btn sm ghost" href="#/quizreport/${g.id}">Open report</a>` : '<span class="tag-s acc">Live</span>'}</div>`).join('')}</div>` : '<p class="muted">No quizzes yet.</p>'}</section>`;
  body.querySelector('.csv').addEventListener('click', () => downloadCSV(`class-${d.room.code}-report.csv`, [['Student', 'XP this week', 'XP total', 'Streak', 'Lessons', 'Units', 'Assignments done', 'Assignments total', 'Quiz average %', 'Last seen'], ...students.map((m) => [m.name, m.week_xp || 0, m.sum.xp, m.sum.streak, m.sum.lessons, m.sum.units, m.tasks_done, nT, m.quiz_avg ?? '', m.last_seen || ''])]));
}
async function classSettings(d) {
  const r = d.room, owner = r.owner === d.me, levels = await levelsOf(r.lang), set = r.settings || {};
  sheet(`<h2>Class settings</h2><form class="sf" novalidate>
    <div class="field"><label>Name</label><input class="input sn" maxlength="60" value="${esc(r.name)}" /></div>
    <div class="field"><label>Description</label><textarea class="input sd" maxlength="400">${esc(r.description || '')}</textarea></div>
    <div class="field"><label>Level</label><select class="input sl">${levels.map((L) => `<option value="${L.id}" ${r.level === L.id ? 'selected' : ''}>${esc(L.name)} · ${esc(L.title)}</option>`).join('')}</select></div>
    <label class="row"><span class="grow"><b>Open for new members</b><small>Anyone with the code can join</small></span><span class="switch"><input type="checkbox" class="so" ${set.open !== false ? 'checked' : ''}><span></span></span></label>
    <label class="row" style="margin-top:8px"><span class="grow"><b>Students can post</b><small>Otherwise only staff can write in the stream</small></span><span class="switch"><input type="checkbox" class="sp" ${set.student_posts !== false ? 'checked' : ''}><span></span></span></label>
    <p class="err"></p><button class="btn acc wide" type="submit">Save</button></form>
    <div class="list" style="margin-top:16px"><button class="btn ghost wide nc" type="button">${I.redo} Make a new class code</button><button class="btn ghost wide ar" type="button">${r.archived ? 'Restore class' : 'Archive class'}</button>${owner ? `<button class="btn danger wide dl" type="button">${I.trash} Delete class</button>` : ''}</div>`, (el, close) => {
    el.querySelector('.sf').addEventListener('submit', async (e) => {
      e.preventDefault();
      const j = await act(r.id, 'update', { name: el.querySelector('.sn').value, description: el.querySelector('.sd').value, level: el.querySelector('.sl').value, settings: { open: el.querySelector('.so').checked, student_posts: el.querySelector('.sp').checked } });
      if (j) { close(); toast('Saved'); classPage(r.id, 'stream'); }
    });
    el.querySelector('.nc').addEventListener('click', async () => { if (!(await confirmBox('Make a new code?', 'The old code and invite link will stop working.', 'New code'))) return; const j = await act(r.id, 'new_code'); if (j) { toast('New code: ' + j.code); classPage(r.id, 'stream'); } });
    el.querySelector('.ar').addEventListener('click', async () => { const j = await act(r.id, 'update', { archived: !r.archived }); if (j) { close(); classPage(r.id, 'stream'); } });
    const dl = el.querySelector('.dl'); if (dl) dl.addEventListener('click', async () => { if (!(await confirmBox('Delete this class?', 'Posts, assignments and membership are deleted for everyone. Quiz reports stay with their hosts.', 'Delete class', true))) return; const j = await act(r.id, 'delete'); if (j) { close(); location.hash = '#/classes'; } });
  });
}

/* =========================================================
   LIVE QUIZ — hub, setup, host stage, player stage, report
   ========================================================= */
const QDEF = { time: 20, points: 'standard', speed: true, streak: true, show_q: true, guests: true, late: true, class_only: false, shuffle: true, max: 100 };
let lastSetup = (() => { try { return { ...QDEF, ...JSON.parse(localStorage.getItem('dcl_qset') || '{}') }; } catch (e) { return { ...QDEF }; } })();
export async function quizHub() {
  const route = '#/quiz';
  let mine = null;
  if (acct) { try { const j = await call('learn_quiz_mine'); if (j && j.ok) mine = j; } catch (e) {} }
  if (!location.hash.startsWith('#/quiz')) return;
  C.shell(route, `<div class="page-h"><div><h1 class="serif">Live quiz</h1><p>Everyone answers on their own phone. Faster correct answers score more, streaks add a bonus, and the podium appears at the end.</p></div></div>
  <div class="qz-hub">
    <section class="panel qz-join"><h3 class="sec-h">${I.zap} Join a game</h3><p class="muted" style="font-size:.9rem">Enter the PIN shown on the host’s screen.</p>
      <form class="jf" novalidate><input class="input pin-in" inputmode="numeric" maxlength="6" placeholder="000000" aria-label="Game PIN" /><button class="btn acc wide" type="submit" style="margin-top:10px">Enter</button></form></section>
    <section class="panel qz-join"><h3 class="sec-h">${I.play} Host a game</h3><p class="muted" style="font-size:.9rem">Build questions from any course unit, or write your own. Show the host screen on a TV or projector.</p>
      <button class="btn acc wide host" type="button">${I.zap} Create a live quiz</button><button class="btn ghost wide sets" type="button">${I.edit} My question sets${mine && mine.sets.length ? ` (${mine.sets.length})` : ''}</button>
      ${acct ? '' : '<p class="muted" style="font-size:.84rem">Hosting needs a free account so you can see reports later. Joining does not.</p>'}</section>
  </div>
  ${mine ? `<div style="display:grid;gap:14px;margin-top:14px;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
    <section class="panel pad"><h3 class="sec-h">${I.chart} Games you hosted</h3>${mine.hosted.length ? `<div class="list">${mine.hosted.slice(0, 12).map((g) => `<div class="row"><span class="grow"><b>${esc(g.title)}</b><small>${fmtDate(g.created_at)} · ${g.questions} questions · ${g.players} players</small></span>${g.state !== 'ended' && g.host_key ? `<a class="btn sm acc" href="#/host/${g.host_key}">Resume</a>` : `<a class="btn sm ghost" href="#/quizreport/${g.id}">Report</a>`}</div>`).join('')}</div>` : '<p class="muted">None yet.</p>'}</section>
    <section class="panel pad"><h3 class="sec-h">${I.trophy} Games you played</h3>${mine.played.length ? `<div class="list">${mine.played.slice(0, 12).map((g) => `<div class="row"><span class="grow"><b>${esc(g.title)}</b><small>${fmtDate(g.created_at)} · ${g.correct}/${g.questions} correct · rank ${g.rank} of ${g.players}</small></span><b style="color:var(--gold)">${g.score}</b><a class="btn sm ghost" href="#/quizreport/${g.id}">Details</a></div>`).join('')}</div>` : '<p class="muted">None yet. Ask a friend or your teacher for a PIN.</p>'}</section></div>` : ''}`, null, { noCourse: true });
  app.querySelector('.jf').addEventListener('submit', (e) => { e.preventDefault(); const v = app.querySelector('.pin-in').value.replace(/\D/g, ''); if (v.length !== 6) return toast('The PIN has 6 digits'); location.hash = '#/play/' + v; });
  app.querySelector('.host').addEventListener('click', () => { if (!acct) return C.authSheet('new'); quizSetupSheet({ sets: mine ? mine.sets : [] }); });
  app.querySelector('.sets').addEventListener('click', () => { if (!acct) return C.authSheet('new'); setsSheet(mine ? mine.sets : []); });
}
// ngân hàng câu hỏi theo chủ đề (data/quizbank.json): đáp án đúng luôn ở vị trí đầu, xáo khi tạo ván
let BANK = null;
async function bank() { if (!BANK) { const r = await fetch('data/quizbank.json?v=1'); BANK = await r.json(); } return BANK; }
function fromTopics(ids, n) {
  const pool = BANK.topics.filter((t) => ids.includes(t.id)).flatMap((t) => t.q.map((q) => ({ ...q, topic: t.name })));
  return shuffleArr(pool).slice(0, n).map((x) => { const idx = shuffleArr([0, 1, 2, 3]); return { q: x.q, opts: idx.map((i) => x.opts[i]), a: idx.indexOf(0), note: x.topic, fun: x.fun }; });
}
// câu đùa chung cho câu hỏi tạo từ bài học
const FUN = ['Why did the student eat his homework? The teacher said it was a piece of cake.', 'I told my dictionary a joke. It did not get it, but it knew the meaning.', 'Learning English: “read” and “read” are spelled the same and pronounced differently. Just read that again.',
  'Why is “abbreviation” such a long word? Nobody knows.', 'My grammar teacher said I used too many commas, but I disagree, you know, honestly, mostly.', 'The past, present and future walked into a bar. It was tense.',
  'A comma and an apostrophe walk into a bar. The apostrophe says: it’s mine.', 'I used to hate maths, but then I realised decimals have a point.', 'Why do Chinese learners love tones? Because 妈 and 马 are not the same, and your mum knows it.',
  'Studying vocabulary is like dating: you meet 20 new words, remember 3, and one of them ghosts you.', 'The word “queue” is just a q followed by four letters waiting in line.', 'Why did the verb break up with the noun? It needed more action.',
  'Silent letters are like that one friend in the group chat. Present, but saying nothing.', 'I tried to learn sign language. It was handy.', 'Pronunciation tip: English spelling is a suggestion, not a rule.',
  'My phone autocorrected “homework” to “home wok”. Now I cook instead.', 'Never trust a dictionary. It is full of words it can’t explain without other words.', 'Why do teachers wear sunglasses? Their students are so bright.'];
// câu hỏi tự sinh từ bài học
function buildQuestions(lang, units, kinds, n) {
  const zh = lang === 'zh', pool = [], words = units.flatMap((u) => u.words);
  units.forEach((u) => {
    if (kinds.words) u.words.forEach((w) => pool.push({ k: 'w', w }));
    if (kinds.grammar) [u.gram, u.gram2].filter(Boolean).forEach((g) => g.drill.forEach((d) => pool.push({ k: 'g', g, d })));
    if (kinds.reading) u.read.q.forEach((x) => pool.push({ k: 'r', u, x }));
  });
  const shufOpts = (opts, a) => { const idx = shuffleArr(opts.map((_, i) => i)); return { opts: idx.map((i) => opts[i]), a: idx.indexOf(a) }; };
  return shuffleArr(pool).slice(0, n).map((p, i) => {
    if (p.k === 'w') {
      const others = shuffleArr(words.filter((x) => x.vi !== p.w.vi && x.w !== p.w.w)).slice(0, 3);
      if (i % 2 === 0) { const o = shufOpts([p.w.vi, ...others.map((x) => x.vi)], 0); return { q: `What does “${p.w.w}”${zh ? ` (${p.w.py})` : ''} mean?`, ...o, note: p.w.ex || '' }; }
      const o = shufOpts([p.w.w, ...others.map((x) => x.w)], 0); return { q: `Which ${zh ? 'word' : 'word or phrase'} means “${p.w.vi}”?`, ...o, note: zh ? p.w.py : p.w.ipa || '' };
    }
    if (p.k === 'g') { const o = shufOpts(p.d.opts.slice(0, 4), p.d.a); return { q: p.d.t.replace(/_{2,}/g, '_____'), ...o, note: p.g.title }; }
    const o = shufOpts(p.x.opts.slice(0, 4), p.x.a); return { q: `${p.u.read.title}: ${p.x.q}`, ...o, note: '' };
  }).filter((q) => q.opts.length >= 2).map((q) => ({ ...q, fun: FUN[Math.floor(Math.random() * FUN.length)] }));
}
async function quizSetupSheet(o = {}) {
  if (!acct) return C.authSheet('new');
  const room = o.room || null, lang0 = room ? room.lang : S.lang;
  let sets = o.sets; if (!sets) { try { const j = await call('learn_quiz_mine'); sets = (j && j.sets) || []; } catch (e) { sets = []; } }
  let staffRooms = [];
  if (!room) { try { const j = await call('learn_rooms_mine'); staffRooms = (j.items || []).filter((x) => x.role !== 'student' && !x.archived); } catch (e) {} }
  const st = { ...lastSetup };
  try { await bank(); } catch (e) {}
  const topics = BANK ? BANK.topics : [];
  sheet(`<h2>${room ? `Live quiz · ${esc(room.name)}` : 'Create a live quiz'}</h2><p class="sub">Choose the questions and the rules. You get a PIN to show on screen.</p>
  <form class="qs" novalidate>
    <div class="field"><label>Questions from</label><div class="qz-src three">
      <button type="button" data-s="topic" aria-pressed="${topics.length ? 'true' : 'false'}" ${topics.length ? '' : 'disabled style="opacity:.5"'}><span class="ic">${I.sparkle}</span><span><b>Topics</b><small>${topics.reduce((a, t) => a + t.q.length, 0)} questions in ${topics.length} topics, each with a joke</small></span></button>
      <button type="button" data-s="course" aria-pressed="${topics.length ? 'false' : 'true'}"><span class="ic">${I.book}</span><span><b>A course</b><small>Words, grammar and reading from units you pick</small></span></button>
      <button type="button" data-s="set" aria-pressed="false" ${sets.length ? '' : 'disabled style="opacity:.5"'}><span class="ic">${I.edit}</span><span><b>My question set</b><small>${sets.length ? sets.length + ' saved set' + (sets.length === 1 ? '' : 's') : 'Create one in “My question sets” first'}</small></span></button></div></div>
    <div class="src-topic" ${topics.length ? '' : 'hidden'}><div class="field"><label>Pick one or more topics</label><div class="tp-grid">${topics.map((t, i) => `<button type="button" class="tp" data-t="${t.id}" aria-pressed="${i === 0 ? 'true' : 'false'}"><span class="tp-ic">${t.icon}</span><b>${esc(t.name)}</b><small>${esc(t.desc)} · ${t.q.length}</small></button>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><button type="button" class="chip tp-all">Select all</button><button type="button" class="chip tp-rnd">${I.dice} Surprise me</button></div></div>
      <div class="field"><label>Number of questions</label><select class="input tp-n">${[5, 10, 15, 20, 30].map((n) => `<option ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="src-course" ${topics.length ? 'hidden' : ''}><div class="field"><label>Course</label><select class="input q-lang">${C.AVAIL.map((l) => `<option value="${l}" ${lang0 === l ? 'selected' : ''}>${esc(C.COURSES[l].name)}</option>`).join('')}</select></div>
      <div class="field"><label>Level</label><select class="input q-lv"></select></div>
      <div class="field"><label>Units</label><div class="q-units list" style="max-height:220px;overflow:auto"></div></div>
      <div class="field"><label>Question types</label><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="chip q-kind" data-k="words" aria-pressed="true">Vocabulary</button><button type="button" class="chip q-kind" data-k="grammar" aria-pressed="true">Grammar</button><button type="button" class="chip q-kind" data-k="reading" aria-pressed="false">Reading</button></div></div>
      <div class="field"><label>Number of questions</label><select class="input q-n">${[5, 10, 15, 20, 30].map((n) => `<option ${n === 10 ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="src-set" hidden><div class="field"><label>Question set</label><select class="input q-set">${sets.map((x) => `<option value="${x.id}">${esc(x.title)} (${x.questions.length})</option>`).join('')}</select></div></div>
    <div class="field"><label>Title</label><input class="input q-title" maxlength="80" /></div>
    ${!room && staffRooms.length ? `<div class="field"><label>Link to a class (optional)</label><select class="input q-room"><option value="">No class</option>${staffRooms.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>` : ''}
    <h3 class="gh">Game settings</h3>
    <div class="set-grid">
      <div class="row"><span class="grow"><b>Time per question</b></span><select class="input s-time" style="width:auto;height:38px">${[10, 20, 30, 45, 60, 90].map((t) => `<option value="${t}" ${st.time === t ? 'selected' : ''}>${t}s</option>`).join('')}</select></div>
      <div class="row"><span class="grow"><b>Points</b></span><select class="input s-points" style="width:auto;height:38px">${[['standard', 'Standard'], ['double', 'Double'], ['none', 'No points']].map(([v, l]) => `<option value="${v}" ${st.points === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${[['speed', 'Speed bonus', 'Faster correct answers score more'], ['streak', 'Answer streak bonus', '+100 per correct answer in a row (max +500)'], ['show_q', 'Questions on players’ phones', 'Off = players look at the big screen'], ['shuffle', 'Shuffle question order', ''], ['guests', 'Allow guests', 'People without an account can join'], ['late', 'Allow late joining', 'Join after the game started'], ...(room ? [['class_only', 'Class members only', 'Only people in this class can join']] : [])].map(([k, t, d]) => `<label class="row"><span class="grow"><b>${t}</b>${d ? `<small>${d}</small>` : ''}</span><span class="switch"><input type="checkbox" class="s-${k}" ${st[k] ? 'checked' : ''}><span></span></span></label>`).join('')}
    </div>
    <p class="err" style="margin-top:10px"></p><button class="btn acc wide" type="submit">${I.zap} Create game</button>
  </form>`, async (el, close) => {
    let src = topics.length ? 'topic' : 'course';
    const tpTitle = () => { const on = [...el.querySelectorAll('.tp[aria-pressed="true"]')].map((b) => topics.find((t) => t.id === b.dataset.t)); if (!title.dataset.ed) title.value = on.length === 1 ? `${on[0].name} quiz` : on.length ? 'Mixed topics quiz' : ''; };
    el.querySelectorAll('.tp').forEach((b) => b.addEventListener('click', () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); sfx('tap'); tpTitle(); }));
    el.querySelector('.tp-all') && el.querySelector('.tp-all').addEventListener('click', () => { el.querySelectorAll('.tp').forEach((b) => b.setAttribute('aria-pressed', 'true')); tpTitle(); });
    el.querySelector('.tp-rnd') && el.querySelector('.tp-rnd').addEventListener('click', () => { const bs = shuffleArr([...el.querySelectorAll('.tp')]); el.querySelectorAll('.tp').forEach((b) => b.setAttribute('aria-pressed', 'false')); bs.slice(0, 3).forEach((b) => b.setAttribute('aria-pressed', 'true')); sfx('pop'); tpTitle(); });
    const lsel = el.querySelector('.q-lang'), lvsel = el.querySelector('.q-lv'), ubox = el.querySelector('.q-units'), title = el.querySelector('.q-title');
    let cur = null;
    const fillUnits = () => { const L = cur.levels.find((x) => x.id === lvsel.value); ubox.innerHTML = L.units.map((u, i) => `<label class="row" style="cursor:pointer"><input type="checkbox" value="${u.id}" ${unitProgress(u.id) > 0 || i === 0 ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--acc)"><span class="grow"><b style="font-size:.9rem">Unit ${i + 1}: ${esc(u.title)}</b></span></label>`).join(''); if (!title.dataset.ed) title.value = `${L.name} quiz`; };
    const fillLv = async () => { cur = await C.course(lsel.value); lvsel.innerHTML = cur.levels.map((L) => `<option value="${L.id}" ${((room && room.lang === lsel.value && room.level) || S.level[lsel.value]) === L.id ? 'selected' : ''}>${esc(L.name)} · ${esc(L.title)}</option>`).join(''); fillUnits(); };
    await fillLv(); lsel.addEventListener('change', fillLv); lvsel.addEventListener('change', fillUnits);
    if (src === 'topic') { delete title.dataset.ed; tpTitle(); }
    title.addEventListener('input', () => { title.dataset.ed = 1; });
    el.querySelectorAll('.q-kind').forEach((b) => b.addEventListener('click', () => b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true')));
    el.querySelectorAll('.qz-src button').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; src = b.dataset.s; el.querySelectorAll('.qz-src button').forEach((x) => x.setAttribute('aria-pressed', x === b)); el.querySelector('.src-course').hidden = src !== 'course'; el.querySelector('.src-set').hidden = src !== 'set'; el.querySelector('.src-topic').hidden = src !== 'topic'; if (src === 'topic') tpTitle(); if (src === 'set' && !title.dataset.ed) { const s = sets.find((x) => x.id === +el.querySelector('.q-set').value); if (s) title.value = s.title; } }));
    const qset = el.querySelector('.q-set'); if (qset) qset.addEventListener('change', () => { const s = sets.find((x) => x.id === +qset.value); if (s && !title.dataset.ed) title.value = s.title; });
    el.querySelector('.qs').addEventListener('submit', async (e) => {
      e.preventDefault(); const err = el.querySelector('.err'); err.textContent = '';
      const settings = { time: +el.querySelector('.s-time').value, points: el.querySelector('.s-points').value };
      ['speed', 'streak', 'show_q', 'shuffle', 'guests', 'late', 'class_only'].forEach((k) => { const x = el.querySelector('.s-' + k); settings[k] = x ? x.checked : false; });
      lastSetup = { ...lastSetup, ...settings }; try { localStorage.setItem('dcl_qset', JSON.stringify(lastSetup)); } catch (er) {}
      let questions = [];
      if (src === 'topic') {
        const ids = [...el.querySelectorAll('.tp[aria-pressed="true"]')].map((b) => b.dataset.t); if (!ids.length) { err.textContent = 'Pick at least one topic'; return; }
        questions = fromTopics(ids, +el.querySelector('.tp-n').value);
      } else if (src === 'course') {
        const ids = [...ubox.querySelectorAll('input:checked')].map((x) => x.value); if (!ids.length) { err.textContent = 'Pick at least one unit'; return; }
        const kinds = {}; el.querySelectorAll('.q-kind').forEach((b) => { kinds[b.dataset.k] = b.getAttribute('aria-pressed') === 'true'; }); if (!kinds.words && !kinds.grammar && !kinds.reading) { err.textContent = 'Pick at least one question type'; return; }
        const L = cur.levels.find((x) => x.id === lvsel.value);
        questions = buildQuestions(lsel.value, L.units.filter((u) => ids.includes(u.id)), kinds, +el.querySelector('.q-n').value);
      } else { const s = sets.find((x) => x.id === +qset.value); questions = s ? s.questions.slice() : []; }
      if (settings.shuffle) questions = shuffleArr(questions);
      if (!questions.length) { err.textContent = 'No questions could be made from that choice'; return; }
      const rsel = el.querySelector('.q-room'), roomId = room ? room.id : rsel && rsel.value ? +rsel.value : null;
      try {
        const j = await call('learn_quiz_create', { p_title: title.value, p_questions: questions, p_settings: settings, p_room: roomId });
        if (!j.ok) { err.textContent = errMsg(j); return; }
        close(); sfx('levelup'); location.hash = '#/host/' + j.host_key;
      } catch (er) { err.textContent = er.message; }
    });
  }, 'wide');
}
// trình soạn bộ câu hỏi riêng
function setsSheet(sets) {
  sheet(`<h2>My question sets</h2><p class="sub">Write your own questions once, then host them any time.</p>
    <button class="btn acc wide new-set" type="button" style="margin-bottom:12px">${I.plus} New set</button>
    <div class="list">${sets.map((s) => `<div class="row"><span class="grow"><b>${esc(s.title)}</b><small>${s.questions.length} questions · edited ${ago(s.updated_at)}</small></span><button class="btn sm ghost ed" data-i="${s.id}" type="button">${I.edit} Edit</button><button class="icon-btn rm" data-i="${s.id}" type="button" title="Delete">${I.trash}</button></div>`).join('') || '<p class="muted">No sets yet.</p>'}</div>`, (el, close) => {
    el.querySelector('.new-set').addEventListener('click', () => { close(); setEditor(null); });
    el.querySelectorAll('.ed').forEach((b) => b.addEventListener('click', () => { close(); setEditor(sets.find((s) => s.id === +b.dataset.i)); }));
    el.querySelectorAll('.rm').forEach((b) => b.addEventListener('click', async () => { if (!(await confirmBox('Delete this set?', 'Games already played keep their reports.', 'Delete', true))) return; try { await call('learn_quiz_set_delete', { p_id: +b.dataset.i }); const j = await call('learn_quiz_mine'); setsSheet(j.sets || []); } catch (e) { toast(e.message); } }));
  });
}
function setEditor(set) {
  let qs = set ? set.questions.map((q) => ({ ...q, opts: [...q.opts] })) : [{ q: '', opts: ['', '', '', ''], a: 0, t: 0 }];
  const draw = (el) => {
    el.querySelector('.qe-list').innerHTML = qs.map((q, i) => `<div class="qe-q" data-i="${i}"><div class="qe-h"><b>Question ${i + 1}</b><span style="flex:1"></span><select class="input qe-t" style="width:auto;height:32px;font-size:.8rem;padding:0 8px"><option value="0">Game timer</option>${[10, 20, 30, 60, 90].map((t) => `<option value="${t}" ${q.t === t ? 'selected' : ''}>${t}s</option>`).join('')}</select><button class="icon-btn qe-del" type="button" title="Delete question">${I.trash}</button></div>
      <input class="input qe-text" maxlength="300" placeholder="Type the question" value="${esc(q.q)}" />
      <div class="qe-opts">${[0, 1, 2, 3].map((k) => `<label class="qe-opt"><input type="radio" name="qa${i}" value="${k}" ${q.a === k ? 'checked' : ''} title="Correct answer"><input class="input qe-o" data-k="${k}" maxlength="120" placeholder="Answer ${k + 1}${k > 1 ? ' (optional)' : ''}" value="${esc(q.opts[k] || '')}" /></label>`).join('')}</div></div>`).join('');
    el.querySelectorAll('.qe-q').forEach((box) => {
      const i = +box.dataset.i;
      box.querySelector('.qe-text').addEventListener('input', (e) => { qs[i].q = e.target.value; });
      box.querySelectorAll('.qe-o').forEach((x) => x.addEventListener('input', () => { qs[i].opts[+x.dataset.k] = x.value; }));
      box.querySelectorAll('input[type=radio]').forEach((x) => x.addEventListener('change', () => { qs[i].a = +x.value; }));
      box.querySelector('.qe-t').addEventListener('change', (e) => { qs[i].t = +e.target.value; });
      box.querySelector('.qe-del').addEventListener('click', () => { qs.splice(i, 1); if (!qs.length) qs.push({ q: '', opts: ['', '', '', ''], a: 0, t: 0 }); draw(el); });
    });
  };
  sheet(`<h2>${set ? 'Edit question set' : 'New question set'}</h2><p class="sub">2–4 answers per question. Tick the correct one. Tip: paste many questions at once with “Import”.</p>
    <div class="field"><label>Title</label><input class="input qe-title" maxlength="80" value="${esc(set ? set.title : '')}" placeholder="e.g. Week 3 vocabulary" /></div>
    <div class="list qe-list"></div>
    <div class="foot-row" style="margin-top:12px"><button class="btn ghost qe-add" type="button">${I.plus} Add question</button><button class="btn ghost qe-imp" type="button">${I.download} Import</button></div>
    <p class="err" style="margin-top:8px"></p><button class="btn acc wide qe-save" type="button">Save set</button>`, (el, close) => {
    draw(el);
    el.querySelector('.qe-add').addEventListener('click', () => { qs.push({ q: '', opts: ['', '', '', ''], a: 0, t: 0 }); draw(el); el.querySelector('.qe-list').lastElementChild.scrollIntoView({ block: 'center' }); });
    el.querySelector('.qe-imp').addEventListener('click', () => {
      const txt = prompt('One question per line:\nQuestion | answer | *correct answer | answer\n(The answer starting with * is correct.)');
      if (!txt) return;
      const add = txt.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length >= 3 && p[0]).map((p) => { const opts = p.slice(1, 5); let a = opts.findIndex((x) => x.startsWith('*')); if (a < 0) a = 0; return { q: p[0], opts: [...opts.map((x) => x.replace(/^\*/, '')), '', '', ''].slice(0, 4), a, t: 0 }; });
      if (!add.length) return toast('Nothing to import. Use: Question | answer | *correct');
      qs = [...qs.filter((q) => q.q.trim()), ...add]; draw(el); toast(add.length + ' questions imported');
    });
    el.querySelector('.qe-save').addEventListener('click', async () => {
      const clean = qs.map((q) => { const filled = q.opts.map((o, k) => ({ o: o.trim(), k })).filter((x) => x.o); const a = filled.findIndex((x) => x.k === q.a); return { q: q.q.trim(), opts: filled.map((x) => x.o), a: a < 0 ? 0 : a, t: q.t || 0 }; }).filter((q) => q.q && q.opts.length >= 2);
      const err = el.querySelector('.err'); if (!clean.length) { err.textContent = 'Add at least one question with 2 answers'; return; }
      try { const j = await call('learn_quiz_set_save', { p_id: set ? set.id : null, p_title: el.querySelector('.qe-title').value, p_questions: clean, p_settings: {} }); if (!j.ok) { err.textContent = errMsg(j); return; } close(); sfx('ok'); toast(`Saved ${clean.length} questions`); const m = await call('learn_quiz_mine'); setsSheet(m.sets || []); }
      catch (er) { err.textContent = er.message; }
    });
  }, 'wide');
}

const shp = (i) => `<span class="shp">${SHAPES[i]}</span>`;
const timerSVG = '<svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="38" class="bg"/><circle cx="42" cy="42" r="38" class="fg"/></svg>';
const TC = 2 * Math.PI * 38;
function stage(html) {
  cleanup(); document.body.classList.add('quizzing'); document.getElementById('sheet-root').innerHTML = '';
  let el = document.querySelector('.qz-stage'); if (!el) { el = document.createElement('div'); el.className = 'qz-stage'; document.body.appendChild(el); }
  el.innerHTML = html; return el;
}
function closeStage() { const el = document.querySelector('.qz-stage'); if (el) el.remove(); document.body.classList.remove('quizzing'); }
addEventListener('hashchange', () => { const h = location.hash; if (!h.startsWith('#/host/') && !h.startsWith('#/play')) closeStage(); });

/* ---------- host ---------- */
export async function hostPage(key) {
  if (!key) { location.hash = '#/quiz'; return; }
  const el = stage(`<div class="qz-top"><span class="ttl">Loading…</span></div><div class="qz-body"><div class="qz-in"></div></div><div class="qz-bot"></div>`);
  let g = null, lastState = '', lastQ = -2, revealing = false, base = 0, baseAt = 0, prevPlayers = 0;
  const top = el.querySelector('.qz-top'), inner = el.querySelector('.qz-in'), bot = el.querySelector('.qz-bot');
  const doAct = async (a, arg = {}) => { try { const j = await rpc('learn_quiz_host_action', { p_key: key, p_action: a, p_arg: arg }); if (j && j.ok) { apply(j); } else toast(errMsg(j)); } catch (e) { toast(e.message); } };
  const leftMs = () => g && g.time ? g.time * 1000 - (base + (performance.now() - baseAt)) : 0;
  const drawTop = () => {
    top.innerHTML = `<span class="ttl">${esc(g.title)}</span>${g.state !== 'lobby' && g.state !== 'ended' ? `<span class="tag-s">Question ${g.q_index + 1} / ${g.total}</span>` : ''}<span class="pl-count">${I.users}${g.players.length}</span><span class="tag-s acc">PIN ${g.pin}</span><button class="icon-btn q-chat" type="button" title="Game chat" aria-label="Game chat">${I.chat}</button><button class="icon-btn q-x" type="button" title="Close">${I.x}</button>`;
    top.querySelector('.q-chat').addEventListener('click', () => { sfx('tap'); chat.openGame({ host: key, title: g.title + ' · chat' }); });
    top.querySelector('.q-x').addEventListener('click', async () => {
      if (g.state !== 'ended' && !(await confirmBox('End this game?', 'Players will see the final results. You can open the report afterwards.', 'End game', true))) return;
      if (g.state !== 'ended') await doAct('end');
      closeStage(); location.hash = g.room ? `#/class/${g.room}/quizzes` : '#/quiz';
    });
  };
  let qrMod = null;
  const qrSVG = (txt) => {
    if (!qrMod) return '';
    const q = qrMod(0, 'M'); q.addData(txt); q.make(); const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code for the join link"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#0d1412"/></svg>`;
  };
  let lobbySig = '', seenP = new Set();
  const drawLobby = () => {
    const sig = g.players.map((p) => p.id + ':' + p.nick).join(',') + '|' + g.locked + '|' + g.total;
    if (sig === lobbySig && inner.querySelector('.lb')) return;
    lobbySig = sig;
    const link = `${SITE}#/play/${g.pin}`;
    const n = g.players.length;
    inner.innerHTML = `<div class="lb">
      <section class="lb-join">
        <div class="lb-steps">
          <p class="lb-k">Join on any phone or laptop</p>
          <p class="lb-url">Go to <b>desktopchill.com/learn</b> and tap <b>Live quiz</b></p>
          <p class="lb-k lb-k2">Game PIN</p>
          <div class="big-pin" aria-label="Game PIN ${g.pin}">${g.pin.slice(0, 3)}<i></i>${g.pin.slice(3)}</div>
          <div class="lb-acts">
            <button class="btn sm lb-copy" type="button">${I.link}<span>Copy join link</span></button>
            <button class="btn sm ghost lb-lock${g.locked ? ' on' : ''}" type="button" aria-pressed="${g.locked}">${I.lock}<span>${g.locked ? 'Unlock game' : 'Lock game'}</span></button>
            ${acct ? `<button class="btn sm ghost lb-inv" type="button">${I.users}<span>Invite friends</span></button>` : ''}
          </div>
        </div>
        <div class="lb-qr">${qrSVG(link)}<span>Scan to join</span></div>
      </section>
      <section class="lb-room">
        <div class="lb-room-h"><h3>${I.users}<span>${n ? `${n} player${n === 1 ? '' : 's'} ready` : 'Waiting for players'}</span></h3>${g.locked ? `<span class="lb-locked">${I.lock} New players can't join</span>` : ''}</div>
        ${n ? `<ul class="lb-pl">${g.players.map((p, i) => `<li class="${seenP.has(p.id) ? '' : 'new'}" style="--d:${seenP.size ? 0 : Math.min(i, 12) * 30}ms">${avatar(p.nick, '', 'sm')}<b>${esc(p.nick)}</b><button type="button" data-p="${p.id}" title="Remove ${esc(p.nick)}" aria-label="Remove ${esc(p.nick)}">${I.x}</button></li>`).join('')}</ul>`
        : `<div class="lb-empty"><span class="lb-dots"><i></i><i></i><i></i></span><p>Players appear here as soon as they enter the PIN.</p></div>`}
      </section>
    </div>`;
    if (!qrMod) import('./qr.js?v=33').then((m) => { qrMod = m.default; const box = inner.querySelector('.lb-qr'); if (box) box.insertAdjacentHTML('afterbegin', qrSVG(link)); }).catch(() => { const box = inner.querySelector('.lb-qr'); if (box) box.remove(); });
    const cp = inner.querySelector('.lb-copy');
    cp.addEventListener('click', async () => { await copyText(link, 'Join link copied'); cp.classList.add('done'); cp.querySelector('span').textContent = 'Copied'; setTimeout(() => { cp.classList.remove('done'); cp.querySelector('span').textContent = 'Copy join link'; }, 1600); });
    inner.querySelector('.lb-lock').addEventListener('click', () => doAct('lock'));
    const iv = inner.querySelector('.lb-inv'); if (iv) iv.addEventListener('click', () => hub.inviteSheet('quiz', { pin: g.pin, title: g.title }, g.title));
    inner.querySelectorAll('.lb-pl button').forEach((b) => b.addEventListener('click', () => doAct('kick', { id: +b.dataset.p })));
    bot.innerHTML = `<button class="btn acc go lb-go" type="button" ${n ? '' : 'disabled'}>${I.play} ${n ? `Start game (${g.total} question${g.total === 1 ? '' : 's'})` : 'Start game'}</button>`;
    bot.querySelector('.go').addEventListener('click', () => { unlockAudio(); sfx('levelup'); doAct('start'); });
    if (n > prevPlayers) sfx('pop'); prevPlayers = n;
    seenP = new Set(g.players.map((p) => p.id));
  };
  const drawQuestion = () => {
    const q = g.question, zh = /[㐀-鿿]/.test(q.q);
    inner.innerHTML = `<div class="qz-q"><h2 class="${zh ? 'zh' : ''}">${esc(q.q)}</h2><div class="qz-meta"><span class="qz-timer">${timerSVG}<b>${g.time}</b></span><span class="pl-count"><b class="ans-n">${g.answered}</b>&nbsp;/ ${g.players.length} answered</span></div></div>
      <div class="qz-ans">${q.opts.map((o, i) => `<div class="qa c${i} ${/[㐀-鿿]/.test(o) ? 'zh' : ''}">${shp(i)}<span>${esc(o)}</span></div>`).join('')}</div>`;
    bot.innerHTML = `<button class="btn ghost skip" type="button">Show answer now</button>`;
    bot.querySelector('.skip').addEventListener('click', () => reveal());
  };
  const drawCountdown = () => { inner.innerHTML = `<div class="countdown">3</div><p style="text-align:center;color:var(--ink-2);font-weight:700">Question ${g.q_index + 1} of ${g.total}</p>`; bot.innerHTML = ''; };
  const reveal = async () => { if (revealing || g.state !== 'question') return; revealing = true; await doAct('reveal'); revealing = false; };
  const drawReveal = () => {
    const q = g.question, max = Math.max(1, ...(g.counts || [0]));
    inner.innerHTML = `<div class="qz-q"><h2 class="${/[㐀-鿿]/.test(q.q) ? 'zh' : ''}">${esc(q.q)}</h2></div>
      <div class="qz-bars">${q.opts.map((_, i) => `<div class="b c${i}"><b>${(g.counts || [])[i] || 0}</b><i style="height:${Math.round(((g.counts || [])[i] || 0) / max * 120) + 6}px"></i><span class="shp">${SHAPES[i]}</span></div>`).join('')}</div>
      <div class="qz-ans">${q.opts.map((o, i) => `<div class="qa c${i} ${i === q.a ? 'right' : 'dim'}">${shp(i)}<span>${esc(o)}</span>${i === q.a ? `<span class="tick">${I.check}</span>` : ''}</div>`).join('')}</div>${q.note && !q.fun ? `<p style="text-align:center;color:var(--ink-2)">${esc(q.note)}</p>` : ''}${q.fun ? `<p class="qz-fun"><span>😄</span>${esc(q.fun)}</p>` : ''}`;
    bot.innerHTML = `<button class="btn acc nx" type="button" style="min-width:220px">Leaderboard ${I.chev}</button>`;
    bot.querySelector('.nx').addEventListener('click', () => doAct('board'));
  };
  const drawBoard = () => {
    const last = g.q_index + 1 >= g.total;
    inner.innerHTML = `<h2 style="text-align:center;font-family:var(--f-display);font-weight:400;font-size:clamp(2.2rem,5vw,3.4rem)">${last ? 'Final scores' : 'Leaderboard'}</h2><div class="board">${(g.board || []).slice(0, 5).map((p, i) => `<div class="board-row" style="animation-delay:${i * 0.08}s"><span class="r">${i + 1}</span><span>${esc(p.nick)}${p.streak >= 2 ? `<span class="stk">${p.streak} in a row</span>` : ''}</span><span class="s">${p.score}</span></div>`).join('')}</div>`;
    bot.innerHTML = `<button class="btn acc nx" type="button" style="min-width:220px">${last ? `${I.trophy} Show the podium` : `Next question ${I.chev}`}</button>`;
    bot.querySelector('.nx').addEventListener('click', () => doAct('next'));
  };
  const drawEnd = () => {
    const b = g.board || [], p = [b[1], b[0], b[2]];
    inner.innerHTML = `<h2 style="text-align:center;font-family:var(--f-display);font-weight:400;font-size:clamp(2.4rem,6vw,3.8rem)">${esc(g.title)}</h2>
      <div class="podium">${p.map((x, i) => x ? `<div class="pd p${[2, 1, 3][i]}"><b>${esc(x.nick)}</b><small>${x.score} pts · ${x.correct}/${g.total}</small><div class="blk">${[2, 1, 3][i]}</div></div>` : '<div class="pd"></div>').join('')}</div>
      <div class="board" style="margin-top:18px">${b.slice(3, 10).map((x, i) => `<div class="board-row"><span class="r">${i + 4}</span><span>${esc(x.nick)}</span><span class="s">${x.score}</span></div>`).join('')}</div>`;
    bot.innerHTML = `<a class="btn acc" href="#/quizreport/k/${key}">${I.chart} Open the report</a><button class="btn ghost again" type="button">${I.redo} New game</button><button class="btn ghost out" type="button">Exit</button>`;
    bot.querySelector('.again').addEventListener('click', () => { closeStage(); location.hash = '#/quiz'; setTimeout(() => quizSetupSheet({}), 300); });
    bot.querySelector('.out').addEventListener('click', () => { closeStage(); location.hash = g.room ? `#/class/${g.room}/quizzes` : '#/quiz'; });
    later(() => { sfx('levelup'); const r = inner.querySelector('.p1 .blk'); if (r) { const rc = r.getBoundingClientRect(); burst(rc.left + rc.width / 2, rc.top, 44); } }, 1500);
  };
  const apply = (j) => {
    if (!j || !j.ok) { inner.innerHTML = `<div class="pl-wait"><h2>Game not found</h2><p>This host link is not valid any more.</p><a class="btn acc" href="#/quiz">Back</a></div>`; top.innerHTML = ''; bot.innerHTML = ''; cleanup(); document.body.classList.add('quizzing'); return; }
    const prev = g; g = j;
    if (g.elapsed_ms != null) { base = g.elapsed_ms; baseAt = performance.now(); }
    drawTop();
    const phase = g.state === 'question' && base < 0 ? 'count' : g.state;
    const changed = phase !== lastState || g.q_index !== lastQ;
    if (g.state !== 'lobby') lobbySig = '';
    if (g.state === 'lobby') { drawLobby(); }
    else if (changed) {
      if (phase === 'count') drawCountdown(); else if (phase === 'question') { drawQuestion(); sfx('open'); } else if (phase === 'reveal') { drawReveal(); sfx('star'); } else if (phase === 'board') drawBoard(); else if (phase === 'ended') drawEnd();
    } else if (phase === 'question') { const n = inner.querySelector('.ans-n'); if (n) n.textContent = g.answered; if (g.answered > (prev ? prev.answered : 0)) sfx('tap'); }
    lastState = phase; lastQ = g.q_index;
    if (phase === 'question' && g.players.length && g.answered >= g.players.length) reveal();
  };
  const poll = async () => { try { const j = await rpc('learn_quiz_host_state', { p_key: key }); if (document.querySelector('.qz-stage')) apply(j); } catch (e) {} };
  await poll();
  every(poll, 1000);
  // đồng hồ đếm giờ mượt
  let lastSec = -1;
  every(() => {
    if (!g) return;
    if (lastState === 'count') { const s = Math.ceil(-(base + (performance.now() - baseAt)) / 1000); const cd = inner.querySelector('.countdown'); if (cd && s > 0 && cd.textContent !== String(s)) { cd.textContent = s; cd.style.animation = 'none'; void cd.offsetWidth; cd.style.animation = ''; sfx('tick'); } if (s <= 0) poll(); return; }
    if (lastState !== 'question') return;
    const left = leftMs(), t = inner.querySelector('.qz-timer'); if (!t) return;
    const s = Math.max(0, Math.ceil(left / 1000)); t.querySelector('b').textContent = s; t.querySelector('.fg').style.strokeDasharray = TC; t.querySelector('.fg').style.strokeDashoffset = TC * (1 - Math.max(0, left) / (g.time * 1000)); t.classList.toggle('low', s <= 5);
    if (s !== lastSec && s <= 5 && s > 0) sfx('tick'); lastSec = s;
    if (left <= 0) reveal();
  }, 200);
  keyH = (e) => { if (e.key === ' ' || e.key === 'Enter') { const b = bot.querySelector('.btn.acc, .btn.ghost.skip'); if (b && !b.disabled && document.activeElement === document.body) { e.preventDefault(); b.click(); } } };
  document.addEventListener('keydown', keyH);
}

/* ---------- player ---------- */
const pKey = (pin) => { try { return JSON.parse(sessionStorage.getItem('dcl_play_' + pin) || localStorage.getItem('dcl_play_' + pin) || 'null'); } catch (e) { return null; } };
const setPKey = (pin, v) => { try { const s = JSON.stringify(v); sessionStorage.setItem('dcl_play_' + pin, s); localStorage.setItem('dcl_play_' + pin, s); } catch (e) {} };
export async function playPage(pin) {
  pin = (pin || '').replace(/\D/g, '');
  const saved = pin && pKey(pin);
  if (!pin || !saved) return joinForm(pin);
  playStage(pin, saved);
}
function joinForm(pin) {
  const el = stage(`<div class="qz-top"><a class="brand" href="#/quiz" style="pointer-events:auto"><span style="font-weight:800">desktop<b style="color:var(--acc)">chill</b> quiz</span></a><span style="flex:1"></span><a class="icon-btn" href="${S.onboarded ? '#/quiz' : '#/'}" title="Close">${I.x}</a></div>
    <div class="qz-body"><div class="qz-in" style="max-width:420px"><form class="panel qz-join jf" novalidate style="margin-top:8vh"><h2 style="font-family:var(--f-display);font-weight:400;font-size:2.4rem;line-height:1">Join a live quiz</h2>
      <div class="field"><label>Game PIN</label><input class="input pin-in" inputmode="numeric" maxlength="6" value="${esc(pin)}" placeholder="000000" /></div>
      <div class="field"><label>Nickname</label><input class="input nk" maxlength="20" value="${esc(acct ? acct.name : '')}" placeholder="Your name on the big screen" /></div>
      <p class="err"></p><button class="btn acc wide" type="submit">${I.zap} Join</button>
      <p class="muted" style="font-size:.82rem">${acct ? `Playing as <b>${esc(acct.name)}</b>. Your score is saved to your account.` : 'No account needed. Sign in on the Learn page if you want your scores saved.'}</p></form></div></div><div></div>`);
  const f = el.querySelector('.jf');
  if (!pin) el.querySelector('.pin-in').focus(); else el.querySelector('.nk').focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); unlockAudio();
    const p = el.querySelector('.pin-in').value.replace(/\D/g, ''), nk = el.querySelector('.nk').value.trim(), err = el.querySelector('.err'); err.textContent = '';
    if (p.length !== 6) { err.textContent = 'The PIN has 6 digits'; return; }
    if (nk.length < 2) { err.textContent = 'Nickname must be at least 2 characters'; return; }
    let tok = null; if (acct) { try { tok = await ensureToken(); } catch (er) {} }
    try {
      const j = await rpc('learn_quiz_join', { p_pin: p, p_nick: nk, p_token: tok });
      if (!j || !j.ok) { err.textContent = errMsg(j); sfx('bad'); return; }
      setPKey(p, { pkey: j.pkey, nick: j.nick }); sfx('ok');
      if (location.hash !== '#/play/' + p) location.hash = '#/play/' + p; else playStage(p, { pkey: j.pkey, nick: j.nick });
    } catch (er) { err.textContent = er.message; }
  });
}
function playStage(pin, me) {
  const el = stage(`<div class="qz-top"><span class="ttl">Joining…</span><span class="tag-s">PIN ${esc(pin)}</span></div><div class="qz-body"><div class="qz-in"></div></div><div class="pl-bar"><button class="icon-btn pl-chat" type="button" title="Game chat" aria-label="Game chat">${I.chat}</button><b class="grow nkn">${esc(me.nick)}</b><span class="sc">0</span></div>`);
  el.querySelector('.pl-chat').addEventListener('click', () => { sfx('tap'); chat.openGame({ pin, pkey: me.pkey, title: 'Game chat' }); });
  const top = el.querySelector('.ttl'), inner = el.querySelector('.qz-in'), sc = el.querySelector('.sc');
  let st = null, phase = '', qi = -2, sent = null, base = 0, baseAt = 0, prevScore = 0, endPolls = 0;
  const pads = (n, showText) => `<div class="pl-pads ${n === 2 ? 'n2' : ''} ${showText ? 'txt' : ''}">${[...Array(n)].map((_, i) => `<button class="qa c${i} ${showText && /[㐀-鿿]/.test(st.opts[i]) ? 'zh' : ''}" data-i="${i}" type="button">${shp(i)}${showText ? `<span>${esc(st.opts[i])}</span>` : ''}</button>`).join('')}</div>`;
  const drawQ = () => {
    const showText = !!st.opts;
    inner.innerHTML = `${st.q ? `<div class="qz-q"><h2 class="${/[㐀-鿿]/.test(st.q) ? 'zh' : ''}" style="font-size:clamp(1.1rem,4vw,1.6rem)">${esc(st.q)}</h2></div>` : `<p style="text-align:center;color:var(--ink-2);font-weight:700">Question ${st.q_index + 1} of ${st.total} · look at the big screen</p>`}
      <div class="qz-meta"><span class="qz-timer" style="width:64px;height:64px">${timerSVG}<b style="font-size:1.3rem">${st.time}</b></span></div>${pads(st.n_opts, showText)}`;
    inner.querySelectorAll('.pl-pads .qa').forEach((b) => b.addEventListener('click', () => answer(+b.dataset.i)));
  };
  const answer = async (i) => {
    if (sent !== null) return; sent = i; sfx('tap');
    inner.innerHTML = `<div class="pl-wait"><span class="qa c${i}" style="width:110px;height:110px;padding:0;justify-content:center;border-radius:28px">${shp(i).replace('class="shp"', 'class="shp" style="position:static;transform:none;width:54px;height:54px"')}</span><h2>Answer locked in</h2><p>Waiting for the others…</p></div>`;
    try { const j = await rpc('learn_quiz_answer', { p_pkey: me.pkey, p_q: st.q_index, p_choice: i }); if (!j.ok && j.error !== 'already') { inner.innerHTML = `<div class="pl-wait"><h2>${esc(errMsg({ error: j.error === 'closed' ? 'late' : j.error }))}</h2></div>`; } }
    catch (e) { sent = null; toast(e.message); drawQ(); }
  };
  const drawResult = () => {
    const r = st.result || {};
    if (!r.answered) inner.innerHTML = `<div class="pl-res bad"><span class="mk">${I.timer}</span><h2>Time’s up</h2><p class="note">No answer this time. Your streak resets.</p><p class="muted">You are ${ordinal(st.rank)} of ${st.players}</p></div>`;
    else inner.innerHTML = `<div class="pl-res ${r.correct ? 'ok' : 'bad'}"><span class="mk">${r.correct ? I.check : I.x}</span><h2>${r.correct ? 'Correct!' : 'Not this time'}</h2><span class="pts">+${r.points}</span>${r.correct && st.streak >= 2 ? `<p style="color:var(--fire);font-weight:800">${st.streak} correct in a row</p>` : ''}${!r.correct && st.opts ? `<p class="note">Answer: <b>${esc(st.opts[r.a])}</b></p>` : ''}${r.note && !r.fun ? `<p class="note">${esc(r.note)}</p>` : ''}${r.fun ? `<p class="qz-fun sm"><span>😄</span>${esc(r.fun)}</p>` : ''}<p class="muted">You are ${ordinal(st.rank)} of ${st.players}</p></div>`;
    sfx(r.correct ? 'ok' : 'bad');
    if (r.correct) { const m = inner.querySelector('.mk').getBoundingClientRect(); burst(m.left + m.width / 2, m.top + m.height / 2, 22); }
  };
  const drawBoard = () => { inner.innerHTML = `<div class="pl-wait" style="padding-top:4vh"><h2>${ordinal(st.rank)} place</h2><p>${st.score} points</p></div><div class="board">${(st.board || []).map((p, i) => `<div class="board-row" style="animation-delay:${i * 0.06}s"><span class="r">${i + 1}</span><span>${esc(p.nick)}</span><span class="s">${p.score}</span></div>`).join('')}</div>`; };
  const drawEnd = () => {
    inner.innerHTML = `<div class="pl-res ok"><span class="mk" style="background:linear-gradient(140deg,#FFF1C2,var(--gold))">${I.trophy.replace('<svg', '<svg style="color:#2A1C00"')}</span><h2>${st.rank <= 3 ? `You finished ${ordinal(st.rank)}!` : `${ordinal(st.rank)} of ${st.players}`}</h2><span class="pts">${st.score} points</span><p class="muted">${esc(st.title)}</p>
      ${st.award ? `<div class="qz-award">${st.award.wall ? walls.card(st.award.wall, { state: 'got', cls: 'aw', tag: 'Prize' }) : ''}<p><b>${st.award.rank === 1 ? 'Winner’s prize' : 'Podium bonus'}</b>${st.award.wall ? ` · ${esc(walls.wallOf(st.award.wall).name)} is in your collection` : ''} · +${st.award.pts} VIP points</p></div>` : st.rank === 1 && !acct ? '<p class="muted">Sign in next time: winners of games with 3+ players get a wallpaper and VIP points.</p>' : ''}
      <div class="foot-row" style="max-width:420px;width:100%">${acct ? '<a class="btn ghost" href="#/quiz">My games</a>' : ''}<a class="btn acc" href="${S.onboarded ? '#/' : '#/'}">${S.onboarded ? 'Back to learning' : 'Try desktopchill learn'}</a></div></div>`;
    if (st.rank <= 3) { sfx('levelup'); later(() => burst(innerWidth / 2, innerHeight / 3, 50), 300); }
    if (st.award) { walls.loadCat().then(() => { const c = inner.querySelector('.qz-award .wcard'); if (c) { c.outerHTML = walls.card(st.award.wall, { state: 'got', cls: 'aw', tag: 'Prize' }); } walls.syncWalls(); }); later(() => { const c = inner.querySelector('.qz-award .wcard'); if (c) walls.flyToCollection([c]); }, 2600); }
    try { sessionStorage.removeItem('dcl_play_' + pin); localStorage.removeItem('dcl_play_' + pin); } catch (e) {}
  };
  const apply = (j) => {
    if (!j || !j.ok) {
      try { sessionStorage.removeItem('dcl_play_' + pin); localStorage.removeItem('dcl_play_' + pin); } catch (e) {}
      inner.innerHTML = `<div class="pl-wait"><h2>${esc(j && j.error === 'kicked' ? 'Removed by the host' : 'Game not found')}</h2><p>${esc(errMsg(j))}</p><a class="btn acc" href="#/play">Join another game</a></div>`; cleanup(); document.body.classList.add('quizzing'); return;
    }
    st = j; top.textContent = st.title;
    if (st.elapsed_ms != null) { base = st.elapsed_ms; baseAt = performance.now(); }
    sc.textContent = st.score; if (st.score > prevScore) { sc.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 400 }); } prevScore = st.score;
    const ph = st.state === 'question' && base < 0 ? 'count' : st.state;
    if (st.q_index !== qi) sent = null;
    if (ph === 'ended' && phase === 'ended' && st.award && !inner.querySelector('.qz-award')) drawEnd();
    if (ph !== phase || st.q_index !== qi) {
      if (ph === 'lobby') inner.innerHTML = `<div class="pl-wait"><h2>You’re in!</h2><p>See your nickname on the big screen?</p><p class="pl-count">${I.users} ${st.players} players</p><p class="muted">The game starts when the host is ready.</p></div>`;
      else if (ph === 'count') inner.innerHTML = `<div class="countdown">${Math.max(1, Math.ceil(-base / 1000))}</div><p style="text-align:center;color:var(--ink-2);font-weight:700">Question ${st.q_index + 1} of ${st.total}</p>`;
      else if (ph === 'question') { if (st.answered) { sent = st.choice; inner.innerHTML = '<div class="pl-wait"><h2>Answer locked in</h2><p>Waiting for the others…</p></div>'; } else drawQ(); }
      else if (ph === 'reveal') drawResult();
      else if (ph === 'board') drawBoard();
      else if (ph === 'ended') drawEnd();
    } else if (ph === 'lobby') { const c = inner.querySelector('.pl-count'); if (c) c.innerHTML = `${I.users} ${st.players} players`; }
    phase = ph; qi = st.q_index;
    if (ph === 'ended' && (st.award || ++endPolls > 3 || !acct)) cleanupPolls();
  };
  const cleanupPolls = () => { timers.forEach((t) => { clearInterval(t); clearTimeout(t); }); timers.clear(); };
  const poll = async () => { try { const j = await rpc('learn_quiz_play_state', { p_pin: pin, p_pkey: me.pkey }); if (document.querySelector('.qz-stage')) apply(j); } catch (e) {} };
  poll(); every(poll, 1000);
  // v23: Bestie cùng ở trong quiz → hiệu ứng ~2 giây (hỏi lại vài lần trong phòng chờ)
  if (acct) { let tries = 0; const bq = async () => { if (!document.querySelector('.qz-stage') || tries++ > 24) return; if (await bestie.checkHere('quiz', pin)) return; if (phase === 'lobby' || !phase) later(bq, 5000); }; later(bq, 1500); }
  every(() => {
    if (!st) return;
    if (phase === 'count') { const s = Math.ceil(-(base + (performance.now() - baseAt)) / 1000); const cd = inner.querySelector('.countdown'); if (cd && s > 0 && cd.textContent !== String(s)) { cd.textContent = s; cd.style.animation = 'none'; void cd.offsetWidth; cd.style.animation = ''; } if (s <= 0) poll(); return; }
    if (phase !== 'question') return;
    const t = inner.querySelector('.qz-timer'); if (!t) return;
    const left = st.time * 1000 - (base + (performance.now() - baseAt)), s = Math.max(0, Math.ceil(left / 1000));
    t.querySelector('b').textContent = s; t.querySelector('.fg').style.strokeDasharray = TC; t.querySelector('.fg').style.strokeDashoffset = TC * (1 - Math.max(0, left) / (st.time * 1000)); t.classList.toggle('low', s <= 5);
  }, 200);
  keyH = (e) => { if (/^[1-4]$/.test(e.key) && phase === 'question') { const b = inner.querySelectorAll('.pl-pads .qa')[+e.key - 1]; if (b) b.click(); } };
  document.addEventListener('keydown', keyH);
}
const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/* ---------- report ---------- */
export async function reportPage(args) {
  const route = '#/quiz';
  const byKey = args[0] === 'k', key = byKey ? args[1] : null, id = byKey ? null : +args[0];
  loading(route, 'Quiz report');
  let tok = null; if (acct) { try { tok = await ensureToken(); } catch (e) {} }
  let d; try { d = await rpc('learn_quiz_report', { p_key: key, p_token: tok, p_game: id }); } catch (e) { return failed(route, 'Quiz report', e); }
  if (!d || !d.ok) return C.shell(route, `<div class="panel empty"><span class="e-ic">${I.lock}</span><h2>Report not available</h2><p>Only the host, the class teachers and the players can see this report.</p><a class="btn acc" href="#/quiz">Back</a></div>`, null, { noCourse: true });
  const P = d.players, Q = d.questions, n = Q.length;
  const acc = P.length && n ? Math.round(P.reduce((a, p) => a + p.correct, 0) / (P.length * n) * 100) : 0;
  const avgMs = (() => { const xs = P.filter((p) => p.avg_ms != null); return xs.length ? Math.round(xs.reduce((a, p) => a + +p.avg_ms, 0) / xs.length / 100) / 10 : 0; })();
  const np = Math.max(1, P.length);
  const hard = Q.map((q, i) => ({ i, pct: q.correct / np })).sort((a, b) => a.pct - b.pct).slice(0, 3);
  C.shell(route, `<div class="page-h"><div><h1 class="serif">${esc(d.title)}</h1><p>${fmtDate(d.created_at)} · ${n} questions · ${P.length} players${d.state !== 'ended' ? ' · still running' : ''}</p></div><div class="acts"><button class="btn sm ghost csv" type="button">${I.download} Export CSV</button><a class="btn sm ghost" href="#/quiz">${I.back} Live quiz</a></div></div>
  <div class="kpis" style="margin-bottom:14px"><div class="panel kpi"><small>Players</small><b>${P.length}</b><em>${P.filter((p) => !p.member).length} guests</em></div><div class="panel kpi"><small>Average accuracy</small><b>${acc}%</b><em>correct answers</em></div><div class="panel kpi"><small>Average answer time</small><b>${avgMs}s</b><em>per question</em></div><div class="panel kpi"><small>Winner</small><b style="font-size:1.2rem">${P[0] ? esc(P[0].nick) : '–'}</b><em>${P[0] ? P[0].score + ' points' : ''}</em></div></div>
  <section class="panel" style="margin-bottom:14px"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Player</th><th class="num">Score</th><th class="num">Correct</th><th class="num">Accuracy</th><th class="num">Best streak</th><th class="num">Avg time</th><th>Answers</th></tr></thead><tbody>
  ${P.map((p, i) => `<tr><td>${i + 1}</td><td><b>${esc(p.nick)}</b>${p.member ? '' : ' <span class="tag-s">guest</span>'}</td><td class="num"><b>${p.score}</b></td><td class="num">${p.correct}/${n}</td><td class="num">${n ? Math.round(p.correct / n * 100) : 0}%</td><td class="num">${p.best_streak}</td><td class="num">${p.avg_ms != null ? (Math.round(p.avg_ms / 100) / 10) + 's' : '–'}</td><td><span style="display:inline-flex;gap:3px">${Q.map((_, k) => { const a = p.answers && p.answers[k]; return `<i title="Q${k + 1}" style="width:10px;height:10px;border-radius:3px;display:inline-block;background:${!a ? 'rgba(255,255,255,.15)' : a[1] ? 'var(--ok)' : 'var(--bad)'}"></i>`; }).join('')}</span></td></tr>`).join('')}
  </tbody></table></div></section>
  ${hard.length && P.length ? `<section class="panel pad" style="margin-bottom:14px"><h3 class="sec-h">${I.flag} Hardest questions</h3><div class="list">${hard.map((h) => `<div class="row"><b style="width:44px">Q${h.i + 1}</b><span class="grow">${esc(Q[h.i].q)}</span><b style="color:${h.pct < 0.5 ? 'var(--bad)' : 'var(--ink)'}">${Math.round(h.pct * 100)}%</b></div>`).join('')}</div></section>` : ''}
  <section class="panel pad"><h3 class="sec-h">${I.list} Question by question</h3><div class="list">${Q.map((q, i) => { const tot = Math.max(1, q.answers); return `<div class="rep-q"><div class="rq-h"><span class="tag-s">Q${i + 1}</span><b>${esc(q.q)}</b><small class="muted">${Math.round(q.correct / np * 100)}% correct · ${q.answers}/${P.length} answered${q.avg_ms ? ' · ' + Math.round(q.avg_ms / 100) / 10 + 's' : ''}</small></div><div class="rep-opts">${q.opts.map((o, k) => `<div class="rep-opt ${k === q.a ? 'ok' : ''}"><span>${k === q.a ? '✓ ' : ''}${esc(o)}</span><span class="pbar"><i style="width:${Math.round(((q.counts || [])[k] || 0) / tot * 100)}%;background:${k === q.a ? 'var(--ok)' : 'rgba(255,255,255,.35)'}"></i></span><b class="num">${(q.counts || [])[k] || 0}</b></div>`).join('')}</div></div>`; }).join('')}</div></section>`, null, { noCourse: true });
  app.querySelector('.csv').addEventListener('click', () => downloadCSV(`quiz-${d.id}.csv`, [['Rank', 'Player', 'Guest', 'Score', 'Correct', 'Questions', 'Best streak', 'Avg time (s)', ...Q.map((_, k) => 'Q' + (k + 1))], ...P.map((p, i) => [i + 1, p.nick, p.member ? '' : 'yes', p.score, p.correct, n, p.best_streak, p.avg_ms != null ? Math.round(p.avg_ms / 100) / 10 : '', ...Q.map((q, k) => { const a = p.answers && p.answers[k]; return a ? (a[1] ? 'correct' : 'wrong: ' + q.opts[a[0]]) : ''; })])]));
}
