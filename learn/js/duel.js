// Khiêu chiến 1-1 không cần online cùng lúc: người A làm 10 câu (dễ → rất khó, 20 giây mỗi câu), kết quả lưu trên máy chủ,
// người B nhận thông báo và làm cùng đề. Người thắng chọn 1 hình nền trong bộ sưu tập của người thua (người thua không mất gì).
// v19: mỗi ngày 10 lượt khiêu chiến; chỉ trận thắng đầu tiên trong ngày có quà. Người nhận có 24 giờ, quá hạn bị xử thua và quà tự chuyển cho người thắng.
import { I } from './icons.js?v=28';
import { S, save } from './store.js?v=28';
import { acct, call } from './account.js?v=28';
import { sfx, unlockAudio } from './sound.js?v=28';
import { esc, shuffleArr, toast, sheet, confirmBox, burst, vipAv, ago } from './ui.js?v=28';
import * as walls from './walls.js?v=28';
import { hub, loadFriends } from './hub.js?v=28';
import * as bestie from './bestie.js?v=28';

let C = null;
export function init(ctx) { C = ctx; }
const app = document.getElementById('app');
const QMS = 20000;
const DIFF = ['Warm-up', 'Easy', 'Medium', 'Tricky', 'Hard'];
const ERR = { duel_today: 'You reached today’s duel limit. Come back tomorrow.', noprize: 'This win counts for the ranking only. You already took today’s prize.', noone: 'Nobody else has been online in the last 3 days. Challenge a friend instead.', notfriend: 'You can only pick a friend here, or choose a random opponent.', nouser: 'This learner is not available for duels.', duel_open: 'You already have an open duel with this friend. Finish it first.', noquestions: 'Could not build questions for this course.', self: 'You cannot duel yourself.', expired: 'This duel expired (3 days without an answer).', notyourturn: 'It is not your turn.', noduel: 'Duel not found.', pick_today: 'You already picked a prize today. This one waits for you until tomorrow.', picked: 'Prize already picked.', youhave: 'You already have that wallpaper.', notowned: 'They no longer have that wallpaper.', notwinner: 'Only the winner picks a prize.' };
addEventListener('hashchange', () => { const st = document.querySelector('.du-stage'); if (st && !location.hash.startsWith('#/duel')) { st.remove(); document.body.classList.remove('quizzing'); } });
const em = (j) => ERR[j && j.error] || (j && j.error) || 'Something went wrong.';

/* ---------- đề: 10 câu, dễ → khó dần, bám giáo trình đã học ---------- */
// v21b: 8 câu từ chính các chủ đề người thách đã học (chưa học đủ thì lấy level đang học và các level trước),
// chủ đề học trước ra trước (dễ), chủ đề mới học ra sau; dạng câu: nghĩa của từ → chọn từ → ngữ pháp.
// 2 câu kiến thức chung (20%), mức dễ: quizbank.json và mức 1 của duelbank.json.
let BANKS = null;
async function banks() {
  if (BANKS) return BANKS;
  const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [duel, quiz] = await Promise.all([get('data/duelbank.json?v=1'), get('data/quizbank.json?v=1')]);
  BANKS = { duel: duel ? duel.cats : [], quiz: quiz ? quiz.topics : [] };
  return BANKS;
}
async function makeQuestions(lang) {
  const [c, B] = await Promise.all([C.course(lang), banks()]);
  const zh = lang === 'zh';
  const shuf = (opts, a) => { const idx = shuffleArr(opts.map((_, i) => i)); return { opts: idx.map((i) => opts[i]), a: idx.indexOf(a) }; };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // giáo trình: chủ đề đã học (có ít nhất 1 bài xong), theo thứ tự khoá học
  const all = c.levels.flatMap((L) => L.units.map((u) => ({ u, L })));
  let pool = all.filter(({ u }) => (S.done[u.id] || []).some(Boolean));
  if (pool.length < 4) { // học chưa đủ: dùng level đang học và các level trước
    const cur = c.levels.find((L) => L.id === (S.level || {})[lang]) || c.levels[0], tl = c.levels.filter((L) => (L.topic || 'eng') === (cur.topic || 'eng')); // v24: cùng chủ đề
    const li = Math.max(0, tl.indexOf(cur));
    const ids = new Set(tl.slice(0, li + 1).map((L) => L.id));
    pool = all.filter(({ L }) => ids.has(L.id));
  }
  // 5 nhóm theo thứ tự học: nhóm đầu = chủ đề học sớm nhất (dễ nhất)
  const seg = (t) => { const n = pool.length, a0 = Math.floor((t * n) / 5), a1 = Math.max(a0 + 1, Math.floor(((t + 1) * n) / 5)); return pool.slice(a0, Math.min(n, a1)); };
  const allWords = pool.flatMap(({ u, L }) => u.words.map((w) => ({ w, L })));
  const usedQ = new Set(), usedCat = new Set();
  const course = (kind, t) => {
    const units = seg(t), words = units.flatMap(({ u, L }) => u.words.map((w) => ({ w, L })));
    if (kind === 'gram') {
      const drills = units.flatMap(({ u }) => [u.gram, u.gram2].filter(Boolean).flatMap((g) => g.drill.filter((x) => x.opts && x.opts.length >= 2 && !usedQ.has(x.t)).map((x) => ({ x, g }))));
      if (drills.length) { const p = pick(drills); usedQ.add(p.x.t); return { q: p.x.t.replace(/_{2,}/g, '_____'), ...shuf(p.x.opts.slice(0, 3), p.x.a), d: t, zh, note: p.g.title }; }
      kind = 'rev';
    }
    const free = words.filter((x) => !usedQ.has(x.w.w)), w = pick(free.length ? free : words); usedQ.add(w.w.w);
    // đáp án nhiễu lấy từ toàn bộ phần đã học (khác hẳn nhau → dễ phân biệt hơn)
    const others = shuffleArr(allWords.filter((x) => x.w.vi !== w.w.vi && x.w.w !== w.w.w)).slice(0, 3).map((x) => x.w);
    const note = `Vocabulary · ${w.L.name}`;
    if (kind === 'rev') return { q: `Which ${zh ? 'word' : 'word or phrase'} means “${w.w.vi}”?`, ...shuf([w.w.w, ...others.map((x) => x.w)], 0), d: t, zh, note };
    return { q: `What does “${w.w.w}”${zh ? ` (${w.w.py})` : ''} mean?`, ...shuf([w.w.vi, ...others.map((x) => x.vi)], 0), d: t, zh, note };
  };
  const general = (src, t) => {
    const cats = shuffleArr((src === 'quiz' ? B.quiz.map((x) => ({ id: x.id, name: x.name, q: x.q })) : B.duel.map((x) => ({ id: x.id, name: x.name, q: x.q.filter((y) => y.d === 1) }))).filter((x) => x.q.length && !usedCat.has(x.id)));
    for (const k of cats) { const x = pick(k.q); if (usedQ.has(x.q)) continue; usedQ.add(x.q); usedCat.add(k.id); return { q: x.q, ...shuf(x.opts.slice(0, 4), 0), d: t, zh: false, note: k.name }; }
    return null;
  };
  const plan = [['mean', 0], ['mean', 0], ['rev', 1], ['G', 1, 'quiz'], ['mean', 2], ['rev', 2], ['gram', 3], ['rev', 3], ['G', 4, 'duel'], ['gram', 4]];
  return plan.map(([k, t, src]) => (k === 'G' ? general(src, t) || course('mean', t) : course(k, t)));
}

/* ---------- trang Duels ---------- */
let pickLang = null;
export async function duelPage(args = []) {
  const route = '#/duel';
  if (!acct) {
    C.shell(route, `<div class="page-h"><div><h1>Duels</h1><p>Challenge a friend or a random learner. You both answer the same 10 questions, from easy to harder: 8 from the units the challenger has studied, 2 general knowledge. The winner of the day’s first duel picks one wallpaper from the loser’s collection, and the loser keeps it too.</p></div></div>
    <div class="panel empty"><span class="e-ic">${I.swords}</span><h2>Sign in to duel</h2><p>A name and a 4–6 digit PIN is all it takes.</p><div class="foot-row" style="max-width:420px;width:100%"><button class="btn acc mk" type="button">Create account</button><button class="btn ghost lg" type="button">Sign in</button></div></div>`, null, { noCourse: true });
    app.querySelector('.mk').addEventListener('click', () => C.authSheet('new')); app.querySelector('.lg').addEventListener('click', () => C.authSheet('login'));
    return;
  }
  if (args[0] && /^\d+$/.test(args[0])) return openDuel(+args[0]);
  const preFriend = args[0] === 'new' && args[1] ? +args[1] : null;
  if (preFriend) history.replaceState(null, '', '#/duel');
  C.shell(route, `<div class="page-h"><div><h1>Duels</h1><p class="muted">Loading…</p></div></div>`, null, { noCourse: true });
  let L, F;
  try { [L] = await Promise.all([call('learn_duel_list'), hub.friends ? null : loadFriends()]); } catch (e) { toast(e.message); return; }
  F = ((hub.friends && hub.friends.items) || []).filter((x) => x.status === 'accepted');
  // người được chọn từ bảng xếp hạng (có thể chưa là bạn)
  if (preFriend && !F.some((f) => f.uid === preFriend)) { try { const t = JSON.parse(sessionStorage.getItem('dcl_duel_target') || 'null'); if (t && t.uid === preFriend) F = [{ ...t, ranked: true }, ...F]; } catch (e) {} }
  if (!location.hash.startsWith('#/duel')) return;
  pickLang = pickLang || S.lang;
  const items = L.items || [];
  const mine = items.filter((d) => d.my_turn), wait = items.filter((d) => !d.my_turn && (d.state === 'a_play' || d.state === 'b_turn'));
  const prize = items.filter((d) => d.can_pick && d.state === 'done'), past = items.filter((d) => ['done', 'expired', 'declined'].includes(d.state));
  const row = (d) => {
    const pass = d.my_turn && d.role === 'b' && bestie.has() ? `<button class="icon-btn du-pass" type="button" data-d="${d.id}" data-n="${esc(d.opp ? d.opp.name : '')}" title="Pass this duel to your Bestie">${I.pass || I.heart}</button>` : '';
    const res = d.state === 'done' ? (d.winner == null ? '<span class="tag-s">Draw</span>' : d.won ? '<span class="tag-s acc">Won</span>' : '<span class="tag-s">Lost</span>') : d.state === 'expired' ? '<span class="tag-s">Expired</span>' : d.state === 'declined' ? '<span class="tag-s">Declined</span>' : d.my_turn ? '<span class="tag-s gold">Your turn</span>' : '<span class="tag-s">Waiting</span>';
    const sc = d.me && d.me.score != null ? `${d.me.score}${d.them && d.them.score != null ? ' – ' + d.them.score : ''}` : '';
    return `<div class="du-rw"><a class="row du-row" href="#/duel/${d.id}">${vipAv(d.opp ? d.opp.name : '?', d.opp && d.opp.avatar, d.opp ? d.opp.vip : 0)}<span class="grow"><b>${esc(d.opp ? d.opp.name : 'Opponent')}${d.random ? ' <small class="muted">· random</small>' : ''}</b><small>${esc(d.title)} · ${ago(d.created_at)}${sc ? ' · ' + sc : ''}</small></span>${d.passed_by ? `<span class="tag-s">${I.heart} from ${esc(d.passed_by)}</span>` : ''}${d.scored === false && d.state === 'done' ? '<span class="tag-s">unscored</span>' : ''}${res}</a>${pass}</div>`;
  };
  C.shell(route, `<div class="page-h"><div><h1>Duels</h1><p>You both answer the same 10 questions, from easy to harder: 8 from the units the challenger has studied, 2 general knowledge, 20 seconds each. Faster correct answers score more. Each day your first <b>10 challenges you send</b> and first <b>10 you receive</b> are scored: XP for both sides (win 10 · draw 6 · loss 3) and points on the weekly Duel ranking. After that you can still play for fun, without points. <b>Your first win each day</b> also earns a 🎟️ lucky spin ticket. Your opponent has 24 hours to answer, or they lose. Points reset every Monday at 16:00 (Hà Nội) and the top 10 get prizes.</p></div></div>
  <div class="du-grid">
    <section class="panel pad du-new">
      <h3 class="sec-h">${I.swords} New challenge <em>${L.sent_left ?? 10} scored left today</em></h3>
      ${(L.sent_left ?? 10) === 0 ? '<p class="du-used">Your 10 scored challenges for today are used. New challenges still work, but give no XP or ranking points.</p>' : ''}
      ${L.duel_today ? `<p class="du-used">You used all ${L.per_day || 10} challenges for today. Come back tomorrow, or answer challenges sent to you. Those are unlimited.</p>` : `
      <div class="field"><label>Course</label><div class="seg du-lang">${C.AVAIL.map((l) => `<button type="button" data-l="${l}" aria-pressed="${pickLang === l}" class="${l === 'zh' ? 'zh' : ''}">${esc(C.COURSES[l].short)}</button>`).join('')}</div></div>
      <div class="field"><label>Opponent</label><div class="du-opp">
        <button type="button" class="du-o rnd" data-u="" aria-pressed="${!preFriend}"><span class="du-dice">${I.dice}</span><b>Random</b><small>${L.pool || 0} learners active in the last 3 days, close to your VIP</small></button>
        ${F.map((f) => `<button type="button" class="du-o" data-u="${f.uid}" aria-pressed="${preFriend === f.uid}">${vipAv(f.name, f.avatar, f.vip || 0)}<b>${esc(f.name)}</b><small>${f.ranked ? 'From the ranking' : `${f.walls || 0}/${walls.total()} wallpapers`}</small></button>`).join('')}
      </div></div>
      <p class="err du-err"></p>
      <button class="btn acc wide du-go" type="button">${I.swords} Start the duel</button>`}
      <div class="du-stats"><span><b>${L.wins || 0}</b>wins</span><span><b>${L.played || 0}</b>finished</span><span><b>${L.ticket_today ? 0 : 1}</b>🎟️ ticket left today</span><span><b>${L.recv_left ?? 10}</b>scored replies left</span><span><b>${(L.week && L.week.pts) || 0}</b>pts this week</span></div>
    </section>
    <div class="du-lists">
      ${prize.length ? `<section class="panel pad"><h3 class="sec-h">${I.gift} Pick your prize <em>${prize.length}</em></h3><div class="list">${prize.map(row).join('')}</div></section>` : ''}
      <section class="panel pad"><h3 class="sec-h">${I.play} Your turn <em>${mine.length}</em></h3>${mine.length ? `<div class="list">${mine.map(row).join('')}</div>` : '<p class="muted">No challenges waiting for you.</p>'}</section>
      ${wait.length ? `<section class="panel pad"><h3 class="sec-h">${I.timer} Waiting for them <em>${wait.length}</em></h3><div class="list">${wait.map(row).join('')}</div><p class="muted" style="font-size:.84rem;margin-top:8px">They have 24 hours to answer. If they don’t, you win automatically.</p></section>` : ''}
      <section class="panel pad"><h3 class="sec-h">${I.trophy} History</h3>${past.length ? `<div class="list">${past.slice(0, 15).map(row).join('')}</div>` : '<p class="muted">No finished duels yet.</p>'}</section>
    </div>
  </div>`, null, { noCourse: true });
  app.querySelectorAll('.du-pass').forEach((b) => b.addEventListener('click', async (e) => { e.preventDefault(); if (await bestie.passDuel(+b.dataset.d, b.dataset.n)) duelPage(); }));
  let opp = preFriend;
  app.querySelectorAll('.du-lang button').forEach((b) => b.addEventListener('click', () => { pickLang = b.dataset.l; app.querySelectorAll('.du-lang button').forEach((x) => x.setAttribute('aria-pressed', x === b)); sfx('tap'); }));
  app.querySelectorAll('.du-o').forEach((b) => b.addEventListener('click', () => { opp = b.dataset.u ? +b.dataset.u : null; app.querySelectorAll('.du-o').forEach((x) => x.setAttribute('aria-pressed', x === b)); sfx('tap'); }));
  const go = app.querySelector('.du-go');
  if (go) go.addEventListener('click', async () => {
    unlockAudio(); go.disabled = true; const err = app.querySelector('.du-err'); err.textContent = '';
    try {
      const local = await makeQuestions(pickLang);
      const title = `${C.COURSES[pickLang].name} duel`;
      const j = await call('learn_duel_create', { p_to: opp, p_lang: pickLang, p_title: title, p_questions: local });
      if (!j.ok) { err.textContent = em(j); go.disabled = false; sfx('bad'); return; }
      sfx('levelup');
      await versus(j.opponent, title);
      play({ id: j.id, title, opp: j.opponent, role: 'a' }, local);
    } catch (e) { err.textContent = e.message; go.disabled = false; }
  });
}

/* ---------- mở một trận ---------- */
async function openDuel(id) {
  C.shell('#/duel', `<div class="page-h"><div><h1>Duel</h1><p class="muted">Loading…</p></div></div>`, null, { noCourse: true });
  let j; try { j = await call('learn_duel_get', { p_id: id }); } catch (e) { toast(e.message); return; }
  if (!j.ok) { toast(em(j)); location.hash = '#/duel'; return; }
  const d = j.duel;
  if (d.my_turn && j.questions) {
    C.shell('#/duel', `<div class="panel empty du-ready">${vipAv(d.opp.name, d.opp.avatar, d.opp.vip, 'xl')}<h2>${d.role === 'b' ? `${esc(d.opp.name)} challenged you` : 'Finish your duel'}</h2>
      <p>${d.passed_by ? `Your Bestie <b>${esc(d.passed_by)}</b> passed this duel to you. ` : ''}${d.role === 'b' ? `They already played. Beat <b>${d.them ? d.them.score : '?'}</b> points. ` : ''}${d.scored === false ? 'This one is <b>unscored</b> (daily limit reached). ' : ''}10 questions, 20 seconds each: 8 from the units the challenger has studied, 2 general knowledge. Once you start, leaving counts the remaining answers as wrong.</p>
      <div class="foot-row" style="max-width:440px;width:100%">${d.role === 'b' ? `<button class="btn ghost du-no" type="button">Decline</button>${bestie.has() && !d.passed ? `<button class="btn ghost du-bp" type="button">${I.heart} Pass to Bestie</button>` : ''}` : '<a class="btn ghost" href="#/duel">Later</a>'}<button class="btn acc du-play" type="button">${I.swords} Play now</button></div>
      <small class="muted">Answer before ${new Date(d.expires_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>`, null, { noCourse: true });
    const startPlay = async () => { unlockAudio(); await versus(d.opp, d.title); play(d, j.questions); };
    app.querySelector('.du-play').addEventListener('click', startPlay);
    let auto = false; try { auto = sessionStorage.getItem('dcl_duel_autoplay') === String(id); sessionStorage.removeItem('dcl_duel_autoplay'); } catch (e) {}
    if (auto) setTimeout(startPlay, 250);
    const bp = app.querySelector('.du-bp'); if (bp) bp.addEventListener('click', async () => { if (await bestie.passDuel(id, d.opp.name)) location.hash = '#/duel'; });
    const no = app.querySelector('.du-no'); if (no) no.addEventListener('click', async () => { if (!(await confirmBox('Decline this duel?', `${d.opp.name} will be told you declined. Nobody gets points.`, 'Decline', true))) return; await call('learn_duel_decline', { p_id: id }); location.hash = '#/duel'; });
    return;
  }
  result(d, j.questions, j.my_det, j.their_det);
}

/* ---------- màn đối đầu ---------- */
function versus(opp, title) {
  return new Promise((res) => {
    const el = document.createElement('div'); el.className = 'du-vs';
    el.innerHTML = `<div class="vs-l">${vipAv(acct.name, acct.avatar, walls.myVip(), 'xl')}<b>${esc(acct.name)}</b></div><div class="vs-m"><span>VS</span><small>${esc(title)}</small></div><div class="vs-r">${vipAv(opp.name, opp.avatar, opp.vip || 0, 'xl')}<b>${esc(opp.name)}</b></div>`;
    document.body.appendChild(el); sfx('combo');
    setTimeout(() => { el.classList.add('out'); setTimeout(() => { el.remove(); res(); }, 350); }, 1900);
  });
}

/* ---------- chơi ---------- */
function play(d, questions) {
  document.body.classList.add('quizzing');
  const st = document.createElement('div'); st.className = 'du-stage'; document.body.appendChild(st);
  const ans = []; let i = 0, t0 = 0, tid = 0, raf = 0, locked = false;
  const quit = async () => {
    if (!(await confirmBox('Leave the duel?', 'Unanswered questions count as wrong and your score is saved.', 'Leave', true))) return;
    while (ans.length < questions.length) ans.push({ c: null, ms: QMS });
    submit();
  };
  const show = () => {
    if (i >= questions.length) return submit();
    const q = questions[i], zh = q.zh || /[㐀-鿿]/.test(q.q);
    locked = false;
    st.innerHTML = `<div class="du-top"><button class="icon-btn du-x" type="button" aria-label="Leave">${I.x}</button><span class="du-prog">${questions.map((_, k) => `<i class="${k < i ? 'done' : k === i ? 'cur' : ''}"></i>`).join('')}</span><span class="tag-s d${q.d}">${DIFF[q.d] || ''}</span></div>
      <div class="du-q"><small>Question ${i + 1} of ${questions.length}${q.note ? ' · ' + esc(q.note) : ''}</small><h2 class="${zh ? 'zh' : ''}">${esc(q.q)}</h2></div>
      <div class="du-time"><i></i></div>
      <div class="du-opts">${q.opts.map((o, k) => `<button class="opt du-op" type="button" data-k="${k}"><span class="key">${k + 1}</span><span class="${/[㐀-鿿]/.test(o) ? 'zh' : ''}">${esc(o)}</span></button>`).join('')}</div>`;
    st.querySelector('.du-x').addEventListener('click', quit);
    st.querySelectorAll('.du-op').forEach((b) => b.addEventListener('click', () => pick(+b.dataset.k, b)));
    t0 = performance.now(); sfx('open');
    const bar = st.querySelector('.du-time i');
    const tick = () => { const left = Math.max(0, QMS - (performance.now() - t0)); bar.style.transform = `scaleX(${left / QMS})`; st.classList.toggle('hurry', left < 5000); if (left <= 0) { pick(null); return; } raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  };
  const pick = (k, b) => {
    if (locked) return; locked = true; cancelAnimationFrame(raf);
    const ms = Math.min(QMS, Math.round(performance.now() - t0));
    ans.push({ c: k, ms });
    if (b) { b.classList.add('chosen'); sfx('tap'); } else sfx('bad');
    st.querySelectorAll('.du-op').forEach((x) => { x.disabled = true; });
    clearTimeout(tid); tid = setTimeout(() => { i++; show(); }, b ? 380 : 700);
  };
  const onKey = (e) => { if (/^[1-4]$/.test(e.key)) { const b = st.querySelectorAll('.du-op')[+e.key - 1]; if (b && !b.disabled) b.click(); } };
  document.addEventListener('keydown', onKey);
  const submit = async () => {
    cancelAnimationFrame(raf); clearTimeout(tid); document.removeEventListener('keydown', onKey);
    st.innerHTML = '<div class="du-q"><h2>Scoring…</h2></div>';
    try {
      const j = await call('learn_duel_submit', { p_id: d.id, p_answers: ans });
      st.remove(); document.body.classList.remove('quizzing');
      if (!j.ok) { toast(em(j)); location.hash = '#/duel'; return; }
      if (j.duel.state === 'done') { history.replaceState(null, '', '#/duel/' + d.id); result(j.duel, j.questions, j.det, j.their_det, true); }
      else { history.replaceState(null, '', '#/duel/' + d.id); sentScreen(j.duel, questions, j.det); }
    } catch (e) { toast(e.message); st.innerHTML = `<div class="du-q"><h2>Could not send your answers</h2><p>${esc(e.message)}</p><button class="btn acc du-retry" type="button">Try again</button></div>`; st.querySelector('.du-retry').addEventListener('click', submit); }
  };
  show();
}

/* ---------- A xong: chờ đối thủ ---------- */
function sentScreen(d, questions, det) {
  const me = d.me || {};
  C.shell('#/duel', `<div class="panel du-res">
    <div class="du-banner wait"><small>Challenge sent</small><h2>${me.score || 0} points</h2><p>${me.correct || 0}/${me.n || questions.length} correct in ${Math.round((me.ms || 0) / 1000)} s. ${esc(d.opp.name)} has 24 hours to beat it, or they lose. You will get a notification.</p></div>
    ${review(questions, det, null)}
    <div class="foot-row"><a class="btn ghost" href="#/duel">All duels</a><a class="btn acc" href="#/">Back to learning</a></div></div>`, null, { noCourse: true });
}

/* ---------- kết quả ---------- */
function result(d, questions, myDet, theirDet, fresh = false) {
  const me = d.me || {}, them = d.them || {}, draw = d.state === 'done' && d.winner == null;
  const ban = d.state === 'done' ? (draw ? 'draw' : d.won ? 'win' : 'lose') : d.state;
  const head = { win: 'You win!', lose: `${d.opp.name} wins`, draw: 'Draw', expired: 'Expired', declined: 'Declined', a_play: 'Not finished', b_turn: `Waiting for ${d.opp.name}` }[ban];
  const xpT = d.scored === false ? 'Unscored duel (daily limit reached): no XP or ranking points.' : d.xp ? `+${d.xp} XP.` : '';
  const sub = { win: `${d.forfeit ? 'They did not answer within 24 hours. ' : ''}${xpT} ${d.ticket ? 'Today’s duel prize: a lucky spin ticket!' : d.scored === false ? '' : 'You already won today’s ticket, so this win gives XP and ranking points.'}`, lose: d.forfeit ? 'You did not answer within 24 hours, so this counts as a loss.' : `${xpT} Ask for a rematch!`, draw: `Same score and same time. ${xpT}`, expired: 'This duel was never finished.', declined: 'Your opponent declined this duel.', a_play: '', b_turn: 'They have 24 hours to answer, or they lose.' }[ban];
  C.shell('#/duel', `<div class="panel du-res">
    <div class="du-banner ${ban}"><div class="du-face">${vipAv(acct.name, acct.avatar, walls.myVip(), 'lg')}<b>${me.score ?? '–'}</b><small>You · ${me.correct ?? 0}/${me.n ?? 10} · ${Math.round((me.ms || 0) / 1000)} s</small></div>
      <div class="du-mid"><h2>${esc(head)}</h2><p>${esc(sub)}</p></div>
      <div class="du-face">${vipAv(d.opp.name, d.opp.avatar, d.opp.vip || 0, 'lg')}<b>${them.score ?? '–'}</b><small>${esc(d.opp.name)}${them.n ? ` · ${them.correct}/${them.n} · ${Math.round((them.ms || 0) / 1000)} s` : ''}</small></div></div>
    ${d.state === 'done' && (d.ticket || d.xp) ? `<div class="du-prize">${d.xp ? `<span class="du-xp">${I.gem}<b>+${d.xp}</b> XP</span>` : ''}${d.ticket ? `<span class="du-xp">🎟️<b>+1</b> spin</span><button class="btn acc sm du-spin" type="button">Spin now</button>` : ''}</div>` : ''}${d.passed_by ? `<p class="muted" style="text-align:center">${I.heart} Passed to you by your Bestie ${esc(d.passed_by)}</p>` : ''}
    ${questions ? review(questions, myDet, theirDet) : ''}
    <div class="foot-row"><a class="btn ghost" href="#/duel">All duels</a>${d.state === 'done' ? `<a class="btn acc" href="#/duel/new/${d.opp.uid}">${I.swords} Rematch</a>` : '<a class="btn acc" href="#/">Back to learning</a>'}</div></div>`, null, { noCourse: true });
  if (fresh && ban === 'win') { sfx('levelup'); setTimeout(() => burst(innerWidth / 2, innerHeight / 3, 50), 200); }
  else if (fresh && ban === 'lose') sfx('bad');
  // quà tự động: hiện giữa màn hình rồi bay vào Collection / XP (mỗi trận 1 lần)
  const sp = app.querySelector('.du-spin'); if (sp) sp.addEventListener('click', () => C.spin({}));
  if (fresh && (d.xp || d.ticket) && C.tick) C.tick(true);
}
function review(questions, mine, theirs) {
  if (!questions || !mine) return '';
  return `<details class="du-rev"><summary>${I.list} Review the questions</summary><ol>${questions.map((q, k) => {
    const m = mine[k] || {}, t = theirs ? theirs[k] || {} : null, a = q.a;
    return `<li><span class="tag-s d${q.d}">${DIFF[q.d] || ''}</span><b class="${q.zh ? 'zh' : ''}">${esc(q.q)}</b>
      <span class="du-ans">${a != null ? `Answer: <b class="${/[㐀-鿿]/.test(q.opts[a]) ? 'zh' : ''}">${esc(q.opts[a])}</b>` : ''}</span>
      <span class="du-mk"><i class="${m.ok ? 'ok' : 'bad'}">${m.ok ? I.check : I.x} You ${m.p || 0}</i>${t ? `<i class="${t.ok ? 'ok' : 'bad'}">${t.ok ? I.check : I.x} Them ${t.p || 0}</i>` : ''}</span></li>`;
  }).join('')}</ol></details>`;
}


