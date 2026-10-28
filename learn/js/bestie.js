// v23: BESTIE · Learn Together
// • Chọn 1 người trong danh sách bạn làm Bestie (người kia đồng ý). Có thể xoá Bestie.
// • Tự chia sẻ bộ sưu tập hình nền cho nhau (dùng làm nền trang), có công tắc tắt chia sẻ.
// • Bestie cũng học hôm nay → XP mỗi bài +10%. Bestie offline quá 3 ngày → XP mỗi bài −10% và hiện hộp thoại nhắc "Bestie của bạn đâu rồi?".
// • Bị thách đấu: chuyển trận cho Bestie đấu thay (tối đa 5 lượt / ngày).
// • Hiệu ứng Bestie + slogan: hiện ~2 giây khi hai người cùng vào một live quiz hoặc lớp học. Hiệu ứng mới có trong rương quà.
import { I } from './icons.js?v=27';
import { S, save, today } from './store.js?v=27';
import { acct, call } from './account.js?v=27';
import { sfx } from './sound.js?v=27';
import { esc, toast, sheet, overlay, vipAv, ago, online, confirmBox } from './ui.js?v=27';
import * as walls from './walls.js?v=27';

let C = null;
export function init(ctx) { C = ctx; }
// hiệu ứng: tên, biểu tượng, độ hiếm (khớp bảng learn_fx_catalog)
export const FX = {
  highfive: { name: 'High five', icon: '🙌', rarity: 'common' }, hearts: { name: 'Floating hearts', icon: '💞', rarity: 'common' },
  confetti: { name: 'Confetti pop', icon: '🎉', rarity: 'common' }, stars: { name: 'Shooting stars', icon: '🌠', rarity: 'rare' },
  hug: { name: 'Big hug', icon: '🤗', rarity: 'rare' }, lantern: { name: 'Lantern night', icon: '🏮', rarity: 'rare' },
  sakura: { name: 'Sakura rain', icon: '🌸', rarity: 'epic' }, fireworks: { name: 'Fireworks', icon: '🎆', rarity: 'epic' },
  rainbow: { name: 'Rainbow bridge', icon: '🌈', rarity: 'epic' }, rocket: { name: 'Rocket duo', icon: '🚀', rarity: 'legendary' },
  dragon: { name: 'Twin dragons', icon: '🐉', rarity: 'legendary' }, crown: { name: 'Double crown', icon: '👑', rarity: 'legendary' },
};
export const fxBadge = (id) => `<span class="fxb r-${(FX[id] || {}).rarity || 'common'}"><i>${(FX[id] || {}).icon || '✨'}</i>${esc((FX[id] || {}).name || id)}</span>`;
export const B = { st: null, at: 0, brief: null, inc: 0 };
const ERR = { notfriend: 'You can only pick a friend as your Bestie.', youhave: 'You already have a Bestie. Remove them first.', theyhave: 'They already have a Bestie.', pending: 'Request already sent. Waiting for them.', limit: 'Too many open requests.', notowned: 'You do not own that effect yet. Find more in chests and the lucky spin.', norequest: 'This request is no longer open.', nobestie: 'Add a Bestie first.', notyours: 'This duel is no longer waiting for you.', fromthem: 'This duel comes from your Bestie.', passed: 'This duel was already passed once.', passlimit: 'You passed 5 duels today. Play this one yourself.', busy: 'Your Bestie already has an open duel with this person.', self: 'Pick someone else.' };
const em = (j) => ERR[j && j.error] || (j && j.error) || 'Something went wrong.';

/* ---------- dữ liệu ---------- */
// gọi từ hub.poll (learn_me có bestie tóm tắt)
export function fromMe(me) { B.brief = me ? me.bestie || null : null; B.inc = me ? me.bestie_in || 0 : 0; if (!B.brief) walls.bestieWalls.clear(); }
export async function load(force = false) {
  if (!acct) { B.st = null; return null; }
  if (!force && B.st && Date.now() - B.at < 30000) return B.st;
  try {
    const j = await call('learn_bestie_state');
    if (j && j.ok) {
      B.st = j; B.at = Date.now(); B.brief = j.bestie;
      walls.bestieWalls.clear(); (j.their_walls || []).forEach((w) => walls.bestieWalls.add(+w));
      // nền trang đang dùng hình của Bestie mà Bestie tắt chia sẻ → về nền mặc định
      if (S.bg && !walls.owned(S.bg) && !walls.bestieWalls.has(S.bg)) walls.setBg(0);
    }
  } catch (e) {}
  return B.st;
}
export const has = () => !!(B.brief && B.brief.uid);
// hệ số XP bài học (1.1 / 1.0 / 0.9)
export function mult() { const m = B.brief ? +B.brief.mult : 1; return m > 0 ? m : 1; }
export function multNote() {
  const m = mult(); if (!has()) return '';
  return m > 1 ? `+10% Bestie bonus: ${B.brief.name} studied today too` : m < 1 ? `−10%: ${B.brief.name} has been away for ${B.brief.offline_days} days` : `Study on the same day as ${B.brief.name} for +10% XP`;
}

/* ---------- hiệu ứng ~2 giây khi gặp nhau ---------- */
export function playFx(fx, o = {}) {
  const f = FX[fx] || FX.highfive, me = o.me || (acct ? { name: acct.name, avatar: acct.avatar } : { name: 'You' }), them = o.them || { name: 'Bestie' };
  document.querySelectorAll('.bfx').forEach((x) => x.remove());
  const el = document.createElement('div'); el.className = `bfx fx-${fx}`; el.setAttribute('role', 'status');
  const parts = Array.from({ length: 18 }, (_, i) => `<i class="bp" style="--i:${i};--x:${Math.round(Math.random() * 100)};--d:${(Math.random() * 0.6).toFixed(2)}s">${f.icon}</i>`).join('');
  el.innerHTML = `<div class="bfx-in"><div class="bfx-pair"><span class="bfx-a">${vipAv(me.name, me.avatar, 0, 'lg')}</span><span class="bfx-mid">${f.icon}</span><span class="bfx-b">${vipAv(them.name, them.avatar, 0, 'lg')}</span></div>
    <b class="bfx-t">${esc(o.title || 'Besties together!')}</b>${o.slogans && o.slogans.filter(Boolean).length ? `<small class="bfx-s">“${esc(o.slogans.filter(Boolean).join(' · '))}”</small>` : ''}</div><div class="bfx-parts">${parts}</div>`;
  document.body.appendChild(el); sfx('combo');
  requestAnimationFrame(() => el.classList.add('on'));
  setTimeout(() => el.classList.add('out'), o.ms || 2200);
  setTimeout(() => el.remove(), (o.ms || 2200) + 450);
}
// hỏi máy chủ Bestie có ở cùng quiz / lớp không; hiện hiệu ứng 1 lần mỗi quiz / lớp mỗi ngày
const seenKey = (k) => 'dcl_bfx_' + k;
export async function checkHere(kind, ref) {
  if (!acct || !has()) return false;
  const key = seenKey(kind + ':' + ref + ':' + (kind === 'room' ? today() : ''));
  try { if (sessionStorage.getItem(key)) return true; } catch (e) {}
  let j; try { j = await call('learn_bestie_here', { p_kind: kind, p_ref: String(ref) }); } catch (e) { return false; }
  if (!j || !j.here || !j.bestie) return false;
  try { sessionStorage.setItem(key, '1'); } catch (e) {}
  const b = j.bestie;
  playFx(b.my_fx || 'highfive', { them: { name: b.name, avatar: b.avatar }, title: kind === 'quiz' ? `You and ${b.name} are in this quiz!` : `You and ${b.name} are in this class!`, slogans: [b.my_slogan, b.their_slogan] });
  return true;
}

/* ---------- nhắc khi Bestie offline quá 3 ngày ---------- */
export function maybeMissYou() {
  if (!acct || !has() || (B.brief.offline_days || 0) < 3) return;
  const k = 'dcl_bmiss_' + today(); try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch (e) {}
  if (document.querySelector('.ovl, .player, .tour, .gate, .bfx')) { setTimeout(maybeMissYou, 4000); return; }
  const b = B.brief;
  const o = overlay(`<div class="rw bmiss"><div class="bm-scene"><span class="bm-cloud">${I.cloud}<i></i><i></i><i></i><i></i></span><span class="bm-me">${vipAv(acct.name, acct.avatar, walls.myVip(), 'lg')}</span><span class="bm-gap">?</span><span class="bm-them">${vipAv(b.name, b.avatar, b.vip || 0, 'lg')}</span></div>
    <h2>Where is your Bestie?</h2><p class="muted">${esc(b.name)} has not been here for ${b.offline_days} days. Until they come back, your lessons earn 10% less XP. Give them a little nudge to study together again.</p>
    <div class="foot-row"><button class="btn ghost bm-later" type="button">Later</button><button class="btn ghost bm-msg" type="button">${I.chat} Message</button><button class="btn acc bm-nudge" type="button">${I.heart} Send a nudge</button></div></div>`, null, 'reward bmiss-ovl');
  sfx('bad');
  o.el.querySelector('.bm-later').addEventListener('click', () => o.close());
  o.el.querySelector('.bm-msg').addEventListener('click', () => { o.close(); if (C.openDM) C.openDM({ uid: b.uid, name: b.name, avatar: b.avatar, vip: b.vip, last_seen: b.last_seen }); });
  o.el.querySelector('.bm-nudge').addEventListener('click', async () => { try { await call('learn_bestie_nudge'); sfx('ok'); toast(`Nudge sent to ${b.name}`); } catch (e) { toast(e.message); } o.close(); });
}

/* ---------- chuyển duel cho Bestie ---------- */
export async function passDuel(id, oppName) {
  if (!has()) { toast('Add a Bestie first (Friends › Bestie).'); return false; }
  const left = B.st ? B.st.passes_left : 5;
  if (!(await confirmBox(`Pass this duel to ${B.brief.name}?`, `${B.brief.name} plays it instead of you. ${oppName ? oppName + ' will be told. ' : ''}You can pass ${left} more today.`, `Pass to ${B.brief.name}`))) return false;
  try { const j = await call('learn_bestie_pass', { p_duel: id }); if (!j.ok) { toast(em(j)); return false; } if (B.st) B.st.passes_left = j.left; sfx('ok'); toast(`Passed to ${B.brief.name}. ${j.left} passes left today.`); return true; } catch (e) { toast(e.message); return false; }
}

/* ---------- khối Bestie (trang Friends và bảng riêng) ---------- */
export function sectionHTML(fr = []) {
  const st = B.st || {}, b = st.bestie;
  if (!acct) return '';
  if (b) {
    const on = online(b.last_seen), mlt = +b.mult;
    return `<section class="panel pad bst" data-bst>
      <h3 class="sec-h">${I.heart} Your Bestie <em>since ${b.since ? new Date(b.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'today'}</em></h3>
      <div class="bst-pair"><span>${vipAv(acct.name, acct.avatar, walls.myVip(), 'lg')}<b>You</b></span><span class="bst-h">${I.heart}</span><span>${vipAv(b.name, b.avatar, b.vip || 0, 'lg')}<b>${esc(b.name)}</b><small class="${on ? 'ok' : ''}">${on ? 'online now' : b.last_seen ? 'seen ' + ago(b.last_seen) : 'not seen yet'}</small></span></div>
      <div class="bst-mult ${mlt > 1 ? 'up' : mlt < 1 ? 'down' : ''}">${mlt > 1 ? `${I.bolt}<span><b>+10% XP on every lesson today</b><small>${esc(b.name)} studied today too.</small></span>` : mlt < 1 ? `${I.sad}<span><b>−10% XP on every lesson</b><small>${esc(b.name)} has been away ${b.offline_days} days. Nudge them back!</small></span>` : `${I.target}<span><b>Study on the same day for +10% XP</b><small>Once ${esc(b.name)} finishes a lesson today, your lessons earn 10% more.</small></span>`}</div>
      <div class="bst-acts"><button class="btn sm ghost bst-msg" type="button">${I.chat} Message</button><a class="btn sm ghost" href="#/duel/new/${b.uid}">${I.swords} Duel</a><a class="btn sm acc" href="#/adventure">${I.map} Adventure</a>${mlt < 1 || !on ? `<button class="btn sm ghost bst-nudge" type="button">${I.heart} Nudge</button>` : ''}</div>
      <div class="bst-set">
        <label class="row"><span class="grow"><b>Share my wallpapers</b><small>${esc(b.name)} can use your collection as their page background${b.their_share ? `, and you can use theirs (${(st.their_walls || []).length})` : `. They turned their sharing off`}.</small></span><span class="switch"><input type="checkbox" class="bst-share" ${b.my_share ? 'checked' : ''}><span></span></span></label>
        <div class="field"><label>Bestie effect <small class="muted">plays when you meet in a live quiz or class</small></label><div class="bst-fx">${(st.fx || []).map((f) => `<button type="button" class="fxo r-${f.rarity}" data-fx="${f.id}" aria-pressed="${b.my_fx === f.id}" ${f.owned ? '' : 'disabled'} title="${f.owned ? esc(f.name) : 'Find it in chests and the lucky spin'}"><i>${(FX[f.id] || {}).icon || '✨'}</i><small>${esc(f.name)}</small>${f.owned ? '' : `<em>${I.lock}</em>`}</button>`).join('')}</div></div>
        <div class="field"><label for="bsl">Your slogan</label><div class="bst-sl"><input class="input" id="bsl" maxlength="60" placeholder="e.g. Học cùng nhau, giỏi cùng nhau" value="${esc(b.my_slogan || '')}"><button class="btn sm acc bst-sl-go" type="button">Save</button><button class="btn sm ghost bst-try" type="button">${I.play} Preview</button></div></div>
        <p class="muted bst-pass">Got a duel you don’t want? Open it and tap <b>Pass to ${esc(b.name)}</b>. ${st.passes_left ?? 5} of 5 passes left today.</p>
      </div>
      <button class="linkb bst-rm" type="button">Remove Bestie</button>
    </section>`;
  }
  const inc = st.incoming || [], out = st.outgoing || [];
  const friends = fr.filter((x) => x.status === 'accepted');
  return `<section class="panel pad bst none" data-bst>
    <h3 class="sec-h">${I.heart} Bestie <em>Learn together</em></h3>
    <p class="muted bst-why">Pick one friend as your Bestie: you share wallpapers, earn <b>+10% XP</b> when you both study on the same day, can pass duels to each other and play <b>Bestie Adventure</b> together.</p>
    ${inc.length ? `<div class="list">${inc.map((x) => `<div class="row">${vipAv(x.name, x.avatar, x.vip || 0)}<span class="grow"><b>${esc(x.name)}</b><small>wants you as their Bestie</small></span><button class="btn sm acc bst-ok" data-u="${x.uid}" type="button">${I.heart} Accept</button><button class="icon-btn bst-no" data-u="${x.uid}" type="button" title="Decline">${I.x}</button></div>`).join('')}</div>` : ''}
    ${friends.length ? `<div class="bst-pick">${friends.map((f) => { const sent = out.some((o) => o.uid === f.uid); return `<button type="button" class="bst-f" data-u="${f.uid}" ${sent ? 'disabled' : ''}>${vipAv(f.name, f.avatar, f.vip || 0)}<b>${esc(f.name)}</b><small>${sent ? 'Request sent' : 'Make Bestie'}</small></button>`; }).join('')}</div>`
      : `<div class="bst-empty">${I.users}<p><b>Add a friend first.</b> A Bestie is chosen from your friends. Enter a friend code or name in <b>Add a friend</b>, or tap a name in the Ranking.</p><button class="btn sm acc bst-addf" type="button">${I.plus} Add a friend</button></div>`}
  </section>`;
}
export function wireSection(root, refresh) {
  const el = root.querySelector('[data-bst]'); if (!el) return;
  const st = B.st || {}, b = st.bestie;
  const again = async () => { await load(true); if (refresh) refresh(); };
  el.querySelectorAll('.bst-f').forEach((x) => x.addEventListener('click', async () => {
    x.disabled = true;
    try { const j = await call('learn_bestie_request', { p_uid: +x.dataset.u }); if (!j.ok) { toast(em(j)); x.disabled = false; return; } sfx(j.accepted ? 'levelup' : 'ok'); toast(j.accepted ? 'You are Besties now!' : 'Bestie request sent'); if (j.accepted) celebrate(); again(); } catch (e) { toast(e.message); x.disabled = false; }
  }));
  el.querySelectorAll('.bst-ok, .bst-no').forEach((x) => x.addEventListener('click', async () => {
    try { const j = await call('learn_bestie_respond', { p_uid: +x.dataset.u, p_accept: x.classList.contains('bst-ok') }); if (!j.ok) { toast(em(j)); return; } if (j.accepted) { sfx('levelup'); celebrate(); } again(); } catch (e) { toast(e.message); }
  }));
  const af = el.querySelector('.bst-addf'); if (af) af.addEventListener('click', () => { const i = document.querySelector('.addf .who'); if (i) { i.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => i.focus(), 300); } else location.hash = '#/friends'; });
  if (!b) return;
  el.querySelector('.bst-msg').addEventListener('click', () => { if (C.openDM) C.openDM({ uid: b.uid, name: b.name, avatar: b.avatar, vip: b.vip, last_seen: b.last_seen }); });
  const nd = el.querySelector('.bst-nudge'); if (nd) nd.addEventListener('click', async () => { try { const j = await call('learn_bestie_nudge'); toast(j.again ? 'You already nudged them recently' : `Nudge sent to ${b.name}`); sfx('ok'); } catch (e) { toast(e.message); } });
  el.querySelector('.bst-share').addEventListener('change', async (e) => { try { await call('learn_bestie_set', { p_share: e.target.checked, p_fx: null, p_slogan: null }); toast(e.target.checked ? 'Your wallpapers are shared with your Bestie' : 'Sharing turned off'); again(); } catch (er) { toast(er.message); } });
  el.querySelectorAll('.fxo:not([disabled])').forEach((x) => x.addEventListener('click', async () => {
    try { const j = await call('learn_bestie_set', { p_share: null, p_fx: x.dataset.fx, p_slogan: null }); if (!j.ok) { toast(em(j)); return; } el.querySelectorAll('.fxo').forEach((y) => y.setAttribute('aria-pressed', y === x)); b.my_fx = x.dataset.fx; sfx('tap'); playFx(x.dataset.fx, { them: { name: b.name, avatar: b.avatar }, slogans: [b.my_slogan, b.their_slogan], title: 'Preview' }); } catch (e) { toast(e.message); }
  }));
  el.querySelector('.bst-sl-go').addEventListener('click', async () => { const v = el.querySelector('#bsl').value; try { await call('learn_bestie_set', { p_share: null, p_fx: null, p_slogan: v }); b.my_slogan = v.trim(); sfx('ok'); toast('Slogan saved'); } catch (e) { toast(e.message); } });
  el.querySelector('.bst-try').addEventListener('click', () => playFx(b.my_fx || 'highfive', { them: { name: b.name, avatar: b.avatar }, slogans: [el.querySelector('#bsl').value.trim(), b.their_slogan], title: 'Preview' }));
  el.querySelector('.bst-rm').addEventListener('click', async () => {
    if (!(await confirmBox(`Remove ${b.name} as your Bestie?`, 'Shared wallpapers, the XP bonus and Bestie Adventure stop. Your Adventure stars stay saved if you team up again later.', 'Remove', true))) return;
    try { await call('learn_bestie_remove'); toast('Bestie removed'); walls.bestieWalls.clear(); B.brief = null; again(); } catch (e) { toast(e.message); }
  });
}
function celebrate() { const b = B.brief || (B.st && B.st.bestie); setTimeout(() => load(true).then(() => { const x = B.brief; if (x) playFx('hearts', { them: { name: x.name, avatar: x.avatar }, title: `You and ${x.name} are Besties!` }); }), 200); void b; }
// bảng Bestie riêng (mở từ menu / thông báo)
export async function openSheet() {
  if (!acct) { C.authSheet('new'); return; }
  await load(true);
  let fr = []; try { const j = await call('learn_friends_list'); fr = (j && j.items) || []; } catch (e) {}
  sheet(`<div class="bst-sheet">${sectionHTML(fr)}</div>`, (el, close) => { wireSection(el, () => { close(); openSheet(); }); }, 'wide');
}
