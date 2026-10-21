import { I, LOGO } from './icons.js?v=11';
import { sound, sfx, unlockAudio } from './sound.js?v=11';
import { tts, speak, listVoices, canListen, listen, stopListen, micMsg, micBlocked, MIC_HELP, watchMic, requestMic } from './speech.js?v=11';
import { S, save, streakNow, todayXP, unitProgress, due, grade, addXP, today, reset, daily, bump, LN, starsOf, unitStars, playerLevel } from './store.js?v=11';
import { acct, sync, onSync, register, login, logout, validName, validPin, push, nameAvailable, setAvatar, call } from './account.js?v=11';
import { esc, shuffleArr, toast, sheet, floatText, burst, overlay, initials, avatar, AVATARS } from './ui.js?v=11';
import * as social from './social.js?v=11';
import { setVideo } from './scene.js?v=11';
import { runLesson, LESSONS, lessonName, lessonDesc } from './lesson.js?v=11';
import { mascot } from './mascot.js?v=11';

const app = document.getElementById('app');
const strip = (s) => (s || '').replace(/\s+/g, '');
const COURSE = {}, WORDS = {};
let justBuilt = null;
const DATA_V = 8;

/* ---------- các khoá học ---------- */
const COURSES = {
  en: { id: 'en', name: 'English', short: 'EN', tag: 'A1 → C1', about: 'Work and everyday communication' },
  zh: { id: 'zh', name: '中文', short: '中文', tag: 'HSK1 → HSK6', about: 'From first words to professional fluency' },
  ielts: { id: 'ielts', name: 'IELTS', short: 'IELTS', tag: 'Band 4 → 8+', about: 'Four-skill path by band score' },
};
const AVAIL = ['en', 'zh', 'ielts'];
async function course(lang) {
  if (COURSE[lang]) return COURSE[lang];
  const r = await fetch(`data/${lang}.json?v=${DATA_V}`); if (!r.ok) throw new Error('no-course');
  const c = await r.json();
  c.levels.forEach((L) => L.units.forEach((u) => { u.level = L.id; u.words.forEach((w) => { WORDS[lang + '|' + w.w] = { ...w, unit: u.id }; }); }));
  COURSE[lang] = c; return c;
}
const findUnit = (c, id) => { for (const L of c.levels) for (const u of L.units) if (u.id === id) return { L, u }; return null; };
const curLevel = (c) => c.levels.find((x) => x.id === S.level[S.lang]) || c.levels[0];
const textOf = (lang, x) => (lang === 'zh' ? strip(x.t) : x.t);
const isZh = () => S.lang === 'zh';

/* màu từng chủ đề */
const UC = ['#14B8A6', '#3B82F6', '#8B5CF6', '#F97316', '#22C55E', '#EC4899', '#EAB308', '#06B6D4', '#EF4444', '#6366F1', '#10B981', '#F59E0B', '#A855F7', '#0EA5E9', '#E11D48'];
const ucol = (lang, i) => UC[(i + (lang === 'zh' ? 8 : lang === 'ielts' ? 2 : 0)) % UC.length];

/* ---------- tiện ích giao diện ---------- */
function applySettings() {
  sound.on = S.settings.sound; tts.rate = S.settings.rate; tts.pref = S.settings.voice || { en: '', zh: '' };
  document.documentElement.dataset.lang = S.lang;
}
/* ---------- huy hiệu ---------- */
const unitsDone = () => Object.values(S.done).filter((a) => Array.isArray(a) && a.filter(Boolean).length >= LN).length;
const BADGES = [
  ['first', 'First step', 'Finish your first lesson', 'play', () => (S.counts.lessons || 0) >= 1 || Object.keys(S.done).length > 0],
  ['streak3', 'Spark', 'Study 3 days in a row', 'flame', () => streakNow() >= 3],
  ['streak7', 'One solid week', 'Study 7 days in a row', 'flame', () => streakNow() >= 7],
  ['streak30', 'Month of fire', 'Study 30 days in a row', 'flame', () => streakNow() >= 30],
  ['words100', '100 words', '100 words in your review deck', 'book', () => Object.keys(S.srs).length >= 100],
  ['words500', '500 words', '500 words in your review deck', 'book', () => Object.keys(S.srs).length >= 500],
  ['words1000', 'Word hoard', '1,000 words in your review deck', 'crown', () => Object.keys(S.srs).length >= 1000],
  ['perfect5', 'Flawless', '5 lessons with zero mistakes', 'star', () => (S.counts.perfect || 0) >= 5],
  ['perfect25', 'Perfectionist', '25 lessons with zero mistakes', 'star', () => (S.counts.perfect || 0) >= 25],
  ['combo10', 'Combo 10', '10 correct answers in a row', 'bolt', () => (S.counts.combo || 0) >= 10],
  ['combo25', 'Combo 25', '25 correct answers in a row', 'bolt', () => (S.counts.combo || 0) >= 25],
  ['unit1', 'First unit', 'Finish all 8 lessons of a unit', 'shield', () => unitsDone() >= 1],
  ['unit10', '10 units', 'Finish 10 units', 'shield', () => unitsDone() >= 10],
  ['unit30', '30 units', 'Finish 30 units', 'medal', () => unitsDone() >= 30],
  ['chest5', 'Chest hunter', 'Open 5 unit chests', 'gem', () => Object.keys(S.chests).length >= 5],
  ['boss1', 'Boss slayer', 'Beat a level boss challenge', 'crown', () => Object.keys(S.boss).length >= 1],
  ['speak50', 'Brave speaker', 'Say 50 sentences correctly', 'mic', () => (S.counts.speakOk || 0) >= 50],
  ['speak300', 'Smooth talker', 'Say 300 sentences correctly', 'mic', () => (S.counts.speakOk || 0) >= 300],
  ['review100', 'Steady reviewer', 'Review 100 cards', 'cards', () => (S.counts.reviewed || 0) >= 100],
  ['speed20', 'Quick hands', 'Score 20 in the 60-second challenge', 'timer', () => Object.entries(S.best).some(([k, v]) => k.startsWith('speed') && v >= 20)],
  ['poly', 'Polyglot', 'Study in two or more courses', 'globe', () => new Set(Object.keys(S.done).map((k) => k.split('-')[0])).size >= 2],
];
function checkBadges() {
  const fresh = BADGES.filter(([id, , , , test]) => !S.badges[id] && test());
  if (!fresh.length) return;
  fresh.forEach(([id]) => { S.badges[id] = today(); }); save();
  fresh.forEach(([, t, d, ic], i) => setTimeout(() => {
    sfx('badge');
    const b = document.createElement('div'); b.className = 'badge-toast';
    b.innerHTML = `<span class="bt-ic">${I[ic]}</span><span><small>New badge</small><b>${esc(t)}</b><em>${esc(d)}</em></span>`;
    document.body.appendChild(b); setTimeout(() => b.classList.add('out'), 3600); setTimeout(() => b.remove(), 4000);
  }, 700 + i * 1200));
}

/* ---------- khung trang: thanh HUD, menu, cột phải ---------- */
const NAV = [['#/', 'Learn', 'home'], ['#/roadmap', 'Roadmap', 'list'], ['#/review', 'Review', 'cards'], ['#/practice', 'Practice', 'target'], ['#/classes', 'Classes', 'school'], ['#/quiz', 'Live quiz', 'zap'], ['#/friends', 'Friends', 'users']];
const TABS = [['#/', 'Learn', 'home'], ['#/practice', 'Practice', 'target'], ['#/classes', 'Classes', 'school'], ['#/quiz', 'Quiz', 'zap'], ['#/me', 'Me', 'user']];
function lvRing(size = 44, inner = '') {
  const p = playerLevel(), r = size / 2 - 3, C = 2 * Math.PI * r;
  return `<span class="lvr" title="Level ${p.lv}: ${p.cur}/${p.need} XP to next level" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p.cur / p.need)}"/></svg>${inner || `<b>${p.lv}</b>`}</span>`;
}
function courseTabs() {
  return `<div class="seg course-pick" role="group" aria-label="Course">${AVAIL.map((k) => `<button class="ctab" data-l="${k}" aria-pressed="${S.lang === k}"><span class="${k === 'zh' ? 'zh' : ''}">${esc(COURSES[k].short)}</span></button>`).join('')}</div>`;
}
const routeOf = (r) => r === '#/' ? '#/' : '#/' + (r.split('/')[1] || '');
function shell(route, inner, aside, opts = {}) {
  const dueN = due(S.lang).length, reqN = social.counts.requests || 0, cur = routeOf(route);
  const link = ([href, label, ic]) => `<a href="${href}" ${cur === href || (href === '#/classes' && cur === '#/class') ? 'aria-current="page"' : ''}>${I[ic]}<span>${label}</span>${href === '#/review' && dueN ? `<i class="badge">${dueN > 99 ? '99+' : dueN}</i>` : ''}${href === '#/friends' && reqN ? `<i class="badge">${reqN}</i>` : ''}${href === '#/me' && reqN ? `<i class="badge">${reqN}</i>` : ''}</a>`;
  const st = streakNow(), lit = todayXP() > 0;
  const left = opts.left || '', lay = left && aside ? 'three' : aside ? 'two' : 'one';
  const me = acct ? (acct.avatar ? `<span class="av-in">${esc(acct.avatar)}</span>` : `<span class="av-in" style="font-size:.78rem;font-weight:800">${esc(initials(acct.name))}</span>`) : '';
  app.innerHTML = `
  <header class="hud"><div class="hud-in">
    <a class="brand" href="#/" aria-label="desktopchill learn">${LOGO}<span>desktop<b>chill</b><small>learn</small></span></a>
    <nav class="nav" aria-label="Main">${NAV.map(link).join('')}</nav>
    <div class="hud-r">
      ${opts.noCourse ? '' : courseTabs()}
      <span class="chipx fire ${lit ? 'lit' : ''}" title="Day streak">${I.flame}<b>${st}</b></span>
      <span class="chipx gem" title="Total XP">${I.gem}<b class="xp-n">${S.xp}</b></span>
      <a class="hud-me" href="#/me" title="Profile">${lvRing(40, me)}${reqN ? `<i class="badge">${reqN}</i>` : ''}</a>
    </div>
  </div></header>
  <div class="layout ${lay}">
    ${left ? `<aside class="lcol" aria-label="Levels">${left}</aside>` : ''}
    <main class="main" id="main">${inner}</main>
    ${aside ? `<aside class="side" aria-label="Today">${aside}</aside>` : ''}
  </div>
  <nav class="tabbar" aria-label="Main">${TABS.map(link).join('')}</nav>`;
  app.querySelectorAll('.ctab').forEach((b) => b.addEventListener('click', () => switchCourse(b.dataset.l)));
  app.querySelectorAll('.nav a, .tabbar a').forEach((a) => a.addEventListener('click', () => sfx('tap')));
  if (aside) wireAside();
}
async function switchCourse(l) {
  if (S.lang === l) return; sfx('tap');
  try { await course(l); } catch (e) { toast('This course is still being written. Check back soon.'); return; }
  S.lang = l; save(); applySettings(); render();
}

/* ---------- cột phải: nhiệm vụ + rương ngày, huy hiệu, câu hôm nay ---------- */
let phraseRef = null;
function quests() {
  const d = daily(), tx = todayXP();
  return [
    { ic: 'bolt', t: `Earn ${S.goal} XP`, v: tx, n: S.goal },
    { ic: 'book', t: 'Finish 2 lessons', v: d.lessons, n: 2 },
    canListen() ? { ic: 'mic', t: 'Say 5 sentences right', v: d.speak, n: 5 } : { ic: 'cards', t: 'Review 10 cards', v: d.review, n: 10 },
  ];
}
function phraseOfDay(c) {
  const L = curLevel(c);
  const pool = L.units.flatMap((u) => u.dlg.lines.filter((l) => l.tk && l.tk.length >= 4 && l.tk.length <= 12).map((l) => ({ l, u })));
  if (!pool.length) return null;
  const seed = today().split('-').reduce((a, x) => a * 31 + +x, 7);
  return pool[seed % pool.length];
}
function asideHTML(c) {
  const qs = quests(), dueN = due(S.lang).length, allDone = qs.every((q) => q.v >= q.n), opened = S.dchest === today();
  const ph = phraseOfDay(c); phraseRef = ph;
  const zh = isZh(), p = playerLevel();
  const got = BADGES.filter(([id]) => S.badges[id]), next = BADGES.filter(([id]) => !S.badges[id]).slice(0, 3);
  return `
  <div class="mic-slot"></div>
  <section class="panel lvcard">
    ${lvRing(64)}
    <div><small>Player level</small><b>Level ${p.lv}</b><span class="bar"><i style="width:${Math.round(p.cur / p.need * 100)}%"></i></span><em>${p.cur} / ${p.need} XP · today ${todayXP()} XP</em></div>
  </section>
  <section class="panel quests">
    <h3>${I.target} Daily quests</h3>
    ${qs.map((q) => { const pc = Math.min(1, q.v / q.n), ok = pc >= 1; return `<div class="quest ${ok ? 'ok' : ''}"><span class="qi">${ok ? I.check : I[q.ic]}</span><div class="qb"><b>${q.t}<em>${Math.min(q.v, q.n)}/${q.n}</em></b><span class="qbar"><i style="width:${Math.round(pc * 100)}%"></i></span></div></div>`; }).join('')}
    <button class="dchest ${allDone && !opened ? 'ready' : ''} ${opened ? 'opened' : ''}" type="button" ${allDone && !opened ? '' : 'disabled'}>${chestSVG(opened)}<span>${opened ? 'Chest opened today' : allDone ? 'Open your reward chest!' : 'Finish 3 quests to open the chest'}</span></button>
  </section>
  <section class="panel badges-mini">
    <h3>${I.medal} Badges <em>${got.length}/${BADGES.length}</em></h3>
    <div class="bm-row">${got.slice(-4).map(([, t, , ic]) => `<span class="bdg on" title="${esc(t)}">${I[ic]}</span>`).join('')}${next.map(([, t, d, ic]) => `<span class="bdg" title="${esc(t)}: ${esc(d)}">${I[ic]}</span>`).join('')}</div>
    <a class="more" href="#/me">See all</a>
  </section>
  ${ph ? `<section class="panel phrase">
    <h3>${I.chat} Phrase of the day</h3>
    <p class="ph-t ${zh ? 'zh' : ''}">${esc(textOf(S.lang, ph.l))}</p>
    ${zh && ph.l.py ? `<p class="py">${esc(ph.l.py.join(' '))}</p>` : ''}
    <p class="muted">${esc(ph.l.vi)}</p>
    <div class="ph-act"><button class="chip ph-say" type="button">${I.speaker} Listen</button><button class="chip ph-try" type="button">${I.mic} Say it</button></div>
  </section>` : ''}
  <a class="panel mini-link" href="#/review"><span class="ml-ic">${I.cards}</span><span><b>${dueN ? `${dueN} cards due` : 'Review cards'}</b><small>${dueN ? 'Review now to remember longer' : 'Cards come back right before you forget'}</small></span>${I.chev}</a>
  ${!acct ? `<a class="panel mini-link save" href="#/me"><span class="ml-ic">${I.cloud}</span><span><b>Save your progress</b><small>Name + PIN, continue on any device</small></span>${I.chev}</a>` : ''}`;
}
function micHelpSheet() {
  sheet(`<h2>Turn on the microphone</h2><p class="sub">Chrome is blocking the microphone for desktopchill.com, so speaking exercises can't hear you.</p>${MIC_HELP}<button class="btn acc wide mic-recheck" type="button" style="margin-top:14px">${I.redo} Check again</button><p class="muted mic-res" style="margin-top:8px;font-size:.88rem"></p>`, (el) => {
    el.querySelector('.mic-recheck').addEventListener('click', async () => {
      const r = await requestMic(), out = el.querySelector('.mic-res');
      out.innerHTML = r === 'granted' ? '<b style="color:var(--ok)">The microphone works. You can close this panel.</b>' : r === 'nodevice' ? 'No microphone was found on this device.' : 'Still blocked. Follow steps 1–2 above, then try again.';
      if (r === 'granted') { sfx('ok'); document.querySelectorAll('.mic-warn').forEach((x) => x.remove()); }
    });
  });
}
let micWatch = false, micNow = 'unknown';
function wireAside() {
  const place = () => {
    document.querySelectorAll('.mic-warn').forEach((x) => x.remove());
    if (micNow !== 'denied') return;
    const tgt = [app.querySelector('.side .mic-slot'), app.querySelector('.main')].find((x) => x && x.offsetParent !== null); if (!tgt) return;
    const c = document.createElement('button'); c.type = 'button'; c.className = 'panel mini-link mic-warn';
    c.innerHTML = `<span class="ml-ic">${I.mic}</span><span><b>Microphone blocked</b><small>Chrome is blocking the mic for this site. Tap to see how to fix it.</small></span>${I.chev}`;
    c.addEventListener('click', micHelpSheet);
    if (tgt.classList.contains('main')) tgt.insertBefore(c, tgt.firstChild); else tgt.appendChild(c);
  };
  if (!micWatch) { micWatch = true; watchMic((st) => { const was = micNow; micNow = st; place(); if (was === 'denied' && st === 'granted') { sfx('ok'); toast('Microphone is on. You can practise speaking now.'); } }); }
  else place();
  const say = app.querySelector('.ph-say'); if (say && phraseRef) say.addEventListener('click', () => speak(textOf(S.lang, phraseRef.l), S.lang, { btn: say }));
  const tr = app.querySelector('.ph-try'); if (tr && phraseRef) tr.addEventListener('click', () => { unlockAudio(); runQueue(phraseRef.u, [{ type: 'speak', s: phraseRef.l }], S.lang); });
  const dc = app.querySelector('.dchest.ready'); if (dc) dc.addEventListener('click', () => openDailyChest(dc));
}
function openDailyChest(btn) {
  const reward = 15 + Math.floor(Math.random() * 11);
  S.dchest = today(); addXP(reward); save(true);
  btn.classList.add('popping'); sfx('chest');
  const r = btn.getBoundingClientRect(); burst(r.left + 40, r.top + 30);
  setTimeout(() => { overlay(`<div class="rw">${chestSVG(true)}<h2>Quest chest</h2><p class="rw-x">+${reward} XP</p><p class="muted">Come back tomorrow for a new chest.</p><button class="btn acc ovl-ok" type="button">Claim</button></div>`, () => render(), 'reward'); }, 500);
}

/* ---------- rương & hình minh hoạ ---------- */
function chestSVG(open = false) {
  return `<svg class="chest ${open ? 'open' : ''}" viewBox="0 0 80 70" aria-hidden="true">
    <g class="rays"><path d="M40 34 34 -4h12zM40 34 78 18l4 12zM40 34 2 18l-4 12zM40 34l30-34 8 8zM40 34 10 0 2 8z"/></g>
    <rect x="8" y="32" width="64" height="32" rx="5" class="cb"/><rect x="8" y="44" width="64" height="5" class="cband"/><rect x="34" y="32" width="12" height="32" class="cm"/>
    <g class="lid"><path d="M8 34c0-14 10-22 32-22s32 8 32 22z" class="cl"/><rect x="34" y="12" width="12" height="22" class="cm"/></g>
    <rect x="33" y="38" width="14" height="12" rx="3" class="lock"/><circle cx="40" cy="43" r="2.2" class="kh"/></svg>`;
}

/* ---------- bản đồ hành trình ---------- */
const JOINTS = LN + 1;
const WAVE = [0, .55, .92, .55, 0, -.55, -.92, -.55, 0];
function unitGeom(W, flip) {
  const A = Math.min(120, W * 0.26), cx = W / 2, gap = 104, top = 96;
  const pts = WAVE.map((o, k) => { const oo = o * (flip ? -1 : 1); return { x: cx + oo * A, y: top + k * gap, o: oo }; });
  return { pts, H: top + (JOINTS - 1) * gap + 96, A, cx };
}
function currentPos(c) {
  const L = curLevel(c);
  const u = L.units.find((x) => unitProgress(x.id) < LN);
  if (!u) return { L, u: null, k: 0 };
  const d = S.done[u.id] || []; let k = LESSONS.map((x) => x.k).find((i) => !d[i]); if (k === undefined) k = 0;
  return { L, u, k };
}
function curveSegs(Q) {
  const f = (n) => Math.round(n * 10) / 10, out = [];
  for (let i = 0; i < Q.length - 1; i++) {
    const p0 = Q[Math.max(0, i - 1)], p1 = Q[i], p2 = Q[i + 1], p3 = Q[Math.min(Q.length - 1, i + 2)];
    out.push(`M${f(p1.x)} ${f(p1.y)} C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`);
  }
  return out;
}
const starRow = (n, max = 3) => `<span class="srow">${[1, 2, 3].slice(0, max).map((i) => `<i class="${i <= n ? 'on' : ''}">${I.star}</i>`).join('')}</span>`;
function pathHTML(c, W) {
  const L = curLevel(c), lang = S.lang, cur = currentPos(c);
  return L.units.map((u, i) => {
    const d = S.done[u.id] || [], p = unitProgress(u.id), flip = i % 2 === 1;
    const g = unitGeom(W, flip), P = g.pts;
    const Q = [{ x: g.cx, y: 0 }, ...P, { x: g.cx, y: g.H }];
    const segs = curveSegs(Q);
    const isOn = (j) => j === 0 ? p > 0 : j === Q.length - 2 ? p === LN : !!d[j - 1];
    const full = segs.join(' ');
    const done = segs.map((sd, j) => {
      if (!isOn(j)) return '';
      const anim = justBuilt && justBuilt.unit === u.id && (j === justBuilt.k + 1 || (justBuilt.k === 0 && j === 0 && p === 1) || (p === LN && j === Q.length - 2));
      return `<path class="seg ${anim ? 'anim' : ''}" d="${sd}"/>`;
    }).join('');
    const nodes = LESSONS.map((ls) => {
      const pt = P[ls.k], dn = !!d[ls.k], isCur = cur.u === u && cur.k === ls.k, stars = starsOf(u.id, ls.k);
      const pop = justBuilt && justBuilt.unit === u.id && justBuilt.k === ls.k;
      return `<button class="node ${dn ? 'done' : isCur ? 'cur' : 'todo'} ${pop ? 'pop-in' : ''} ${ls.k === 7 ? 'test' : ''}" style="left:${pt.x}px;top:${pt.y}px" data-u="${u.id}" data-k="${ls.k}" aria-label="${esc(u.title)}: ${esc(lessonName(lang, ls.k))}${dn ? `, ${stars} stars` : ''}">
        ${isCur ? '<span class="tip">Start</span>' : ''}<span class="face">${I[ls.icon]}</span>${dn ? starRow(stars) : ''}</button>`;
    }).join('');
    const cp = P[LN], opened = !!S.chests[u.id], ready = p === LN && !opened;
    const cpBtn = `<button class="cp ${ready ? 'ready' : ''} ${opened ? 'opened' : ''}" style="left:${cp.x}px;top:${cp.y}px" data-u="${u.id}" aria-label="${ready ? 'Open reward chest' : 'Unit review'}: ${esc(u.title)}">${chestSVG(opened)}${ready ? '<span class="tip gold">Open me!</span>' : ''}</button>`;
    const us = unitStars(u.id);
    return `<section class="unit ${p === LN ? 'complete' : p ? 'started' : ''}" data-u="${u.id}" style="--uc:${ucol(lang, i)}">
      <header class="unit-head panel">
        <span class="uh-n">${p === LN ? I.check.replace('<svg', '<svg style="width:22px;height:22px;stroke-width:3"') : i + 1}</span>
        <div class="uh-t"><span class="uh-k">${esc(L.name)} · Unit ${i + 1}</span><h3>${esc(u.title)}</h3><p>${esc(u.goal || u.sub || '')}</p>
          <span class="uh-meta"><span class="uh-bar"><i style="width:${Math.round(p / LN * 100)}%"></i></span><span class="uh-st">${I.star}${us}/${LN * 3}</span></span></div>
        <button class="guide" type="button" data-u="${u.id}">${I.read}<span>Guide</span></button>
      </header>
      <div class="span" style="height:${g.H}px"><svg class="road" width="${W}" height="${g.H}" viewBox="0 0 ${W} ${g.H}" aria-hidden="true"><path class="edge" d="${full}"/><path class="bed" d="${full}"/>${done}</svg>${nodes}${cpBtn}</div>
    </section>`;
  }).join('') + bossHTML(c, L);
}
function bossHTML(c, L) {
  const all = L.units.every((u) => unitProgress(u.id) === LN), beat = !!S.boss[S.lang + '|' + L.id];
  const idx = c.levels.indexOf(L), nx = c.levels[idx + 1], started = L.units.some((u) => unitProgress(u.id) > 0);
  return `<div class="boss panel ${beat ? 'beat' : all ? 'ready' : ''}">
    <span class="boss-ic">${beat ? I.crown : I.shield}</span>
    <div><small>End of ${esc(L.name)}</small><h3>${beat ? `${esc(L.name)} boss defeated` : `${esc(L.name)} boss challenge`}</h3>
    <p class="muted">${beat ? 'You passed the final test of this level.' : `20 mixed questions from every unit. Score 80% or more to win the crown${all ? '' : '. Best tried after finishing the units'}.`}</p></div>
    <div class="boss-act"><button class="btn ${all && !beat ? 'gold' : 'ghost'} boss-go" type="button" ${started ? '' : 'disabled'}>${beat ? 'Try again' : 'Fight'}</button>
    ${nx ? `<button class="btn ${beat ? 'acc' : 'ghost'} next-lv" type="button" data-lv="${nx.id}">${beat ? 'Go to ' : 'Preview '}${esc(nx.name)}</button>` : ''}</div>
  </div>`;
}
let popClose = null;
function openPop(c, btn) {
  if (popClose) popClose();
  const { L, u } = findUnit(c, btn.dataset.u), k = +btn.dataset.k, d = S.done[u.id] || [];
  const span = btn.closest('.span'), x = parseFloat(btn.style.left), y = parseFloat(btn.style.top), W = span.clientWidth;
  const pw = Math.min(300, W - 16), left = Math.max(8, Math.min(W - pw - 8, x - pw / 2));
  const pop = document.createElement('div'), st = starsOf(u.id, k);
  pop.className = 'pop'; pop.style.cssText = `left:${left}px;top:${y + 50}px;width:${pw}px;--ax:${x - left}px`;
  pop.innerHTML = `<span class="pk">${esc(L.name)} · ${esc(u.title)}</span><b>${esc(lessonName(S.lang, k))}</b><p>${esc(lessonDesc(S.lang, k))}</p>
    ${d[k] ? `<div class="pop-st">${starRow(st)}<small>${st < 3 ? 'Score 95% for 3 stars' : 'Max stars'}</small></div>` : ''}
    <button class="btn pop-go" type="button">${d[k] ? `${I.redo} Replay` : `${I.play} Start · +10 XP`}</button>`;
  span.appendChild(pop); sfx('open');
  btn.classList.add('open');
  const off = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) popClose(); };
  popClose = () => { pop.classList.add('out'); btn.classList.remove('open'); setTimeout(() => pop.remove(), 160); document.removeEventListener('pointerdown', off); popClose = null; };
  setTimeout(() => document.addEventListener('pointerdown', off), 0);
  pop.querySelector('.pop-go').addEventListener('click', () => { popClose(); start(c, u.id, k); });
  const r = pop.getBoundingClientRect(); if (r.bottom > innerHeight - 80) window.scrollBy({ top: r.bottom - innerHeight + 100, behavior: 'smooth' });
}
function guidebook(c, uid) {
  const { L, u } = findUnit(c, uid), zh = isZh(), gs = [u.gram, u.gram2].filter(Boolean);
  sheet(`<span class="muted sk">${esc(L.name)} · Unit guide</span><h2>${esc(u.title)}</h2><p class="sub">${esc(u.goal || '')}</p>
    <h3 class="gh">Vocabulary (${u.words.length})</h3>
    <div class="gwords">${u.words.map((w, i) => `<button class="gw" type="button" data-i="${i}"><b class="${zh ? 'zh' : ''}">${esc(w.w)}</b><small>${esc(zh ? w.py : w.ipa || '')}</small><span>${esc(w.vi)}</span></button>`).join('')}</div>
    ${gs.map((g, gi) => `<h3 class="gh">Grammar ${gs.length > 1 ? gi + 1 : ''}: ${esc(g.title)}</h3>
    <p class="rule">${esc(g.rule)}</p><p class="gnote">${esc(g.note || '')}</p>
    <ul class="gex">${g.ex.map((x, i) => `<li><button class="mini-say" type="button" data-g="${gi}" data-e="${i}" aria-label="Listen">${I.speaker}</button><span><span class="${zh ? 'zh' : ''}">${esc(textOf(S.lang, x))}</span><small>${esc(x.vi)}</small></span></li>`).join('')}</ul>`).join('')}
    <h3 class="gh">Dialogue lines</h3>
    <ul class="gex">${u.dlg.lines.slice(0, 7).map((x, i) => `<li><button class="mini-say" type="button" data-l="${i}" aria-label="Listen">${I.speaker}</button><span><span class="${zh ? 'zh' : ''}">${esc(textOf(S.lang, x))}</span><small>${esc(x.vi)}</small></span></li>`).join('')}</ul>`,
  (el) => {
    el.querySelectorAll('.gw').forEach((b) => b.addEventListener('click', () => speak(u.words[+b.dataset.i].w, S.lang)));
    el.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => speak(textOf(S.lang, gs[+b.dataset.g].ex[+b.dataset.e]), S.lang, { btn: b })));
    el.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => speak(textOf(S.lang, u.dlg.lines[+b.dataset.l]), S.lang, { btn: b })));
  }, 'wide');
}
function unitReview(c, uid) {
  const { u } = findUnit(c, uid), zh = isZh();
  const sents = [...u.dlg.lines, ...u.gram.ex].filter((s) => s.tk && s.tk.length >= 3 && s.tk.length <= 12);
  const q = shuffleArr(u.words).slice(0, 6).map((w, i) => ({ type: ['meaning', 'listenWord', 'wordFromVi'][i % 3], w }));
  shuffleArr(sents).slice(0, 2).forEach((s) => q.splice(2 + Math.floor(Math.random() * 4), 0, { type: 'order', s }));
  shuffleArr(u.gram.drill).slice(0, 2).forEach((d) => q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: u.gram.title, vi: d.vi }));
  if (sents.length) q.push({ type: zh ? 'listenOrder' : 'speak', s: shuffleArr(sents)[0] });
  runQueue(u, q, S.lang);
}
function openUnitChest(c, uid, btn) {
  const { u } = findUnit(c, uid), reward = 20 + unitStars(uid);
  S.chests[uid] = today(); addXP(reward); save(true);
  btn.classList.add('popping'); sfx('chest');
  const r = btn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 34);
  setTimeout(() => overlay(`<div class="rw">${chestSVG(true)}<h2>${esc(u.title)}</h2><p class="rw-x">+${reward} XP</p><p class="muted">20 XP for finishing the unit + ${unitStars(uid)} XP for your stars. Want more? Replay any lesson below 3 stars.</p><button class="btn acc ovl-ok" type="button">Awesome</button></div>`, () => { checkLevel(); checkBadges(); home(); }, 'reward'), 550);
}
// thử thách trùm: 20 câu trộn từ mọi chủ đề của level
function bossFight(c, L) {
  const zh = isZh(), units = L.units.filter((u) => unitProgress(u.id) > 0), src = units.length ? units : L.units;
  const words = src.flatMap((u) => u.words), q = [];
  shuffleArr(words).slice(0, 8).forEach((w, i) => q.push({ type: ['meaning', 'listenWord', 'wordFromVi', 'meaning'][i % 4], w }));
  shuffleArr(src).slice(0, 4).forEach((u) => { const s = shuffleArr(u.dlg.lines.filter((l) => l.tk && l.tk.length >= 3 && l.tk.length <= 12))[0]; if (s) q.push({ type: 'order', s }); });
  shuffleArr(src).slice(0, 5).forEach((u) => { const g = shuffleArr([u.gram, u.gram2].filter(Boolean))[0]; const d = shuffleArr(g.drill)[0]; q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: g.title, vi: d.vi }); });
  shuffleArr(src).slice(0, 3).forEach((u) => { const x = shuffleArr(u.read.q)[0]; if (x) q.push({ type: 'mcq', q: x.q, opts: x.opts, a: x.a, note: 'From the reading: ' + u.read.title }); });
  const unit = { id: 'boss-' + L.id, title: L.name + ' boss challenge', words, dlg: { lines: [] }, read: src[0].read, gram: src[0].gram };
  const before = playerLevel().lv;
  import('./lesson.js?v=11').then((m) => m.runCustom({ unit, queue: shuffleArr(q), lang: S.lang, onExit: (r) => {
    if (r && r.done && r.acc >= 0.8 && !S.boss[S.lang + '|' + L.id]) { S.boss[S.lang + '|' + L.id] = today(); addXP(50); save(true); sfx('levelup'); overlay(`<div class="rw boss-win"><span class="boss-ic big">${I.crown}</span><h2>${esc(L.name)} boss defeated!</h2><p class="rw-x">+50 XP</p><p class="muted">You scored ${Math.round(r.acc * 100)}% on the final test.</p><button class="btn acc ovl-ok" type="button">Claim the crown</button></div>`, () => { checkLevel(before); checkBadges(); render(); }, 'reward'); return; }
    if (r && r.done && r.acc < 0.8) toast(`You scored ${Math.round(r.acc * 100)}%. You need 80% to win. Review and try again.`);
    checkLevel(before); checkBadges(); render();
  } }));
}
let lvBefore = null;
function checkLevel(before = lvBefore) {
  const now = playerLevel().lv; if (before && now > before) {
    sfx('levelup'); setTimeout(() => burst(innerWidth / 2, innerHeight / 2.4, 40), 150);
    overlay(`<div class="rw lvup"><span class="lvup-n">${now}</span><h2>Level ${now}!</h2><p class="muted">Each new level needs a bit more XP. Keep your streak to level up faster.</p><button class="btn acc ovl-ok" type="button">Continue</button></div>`, null, 'reward');
  }
  lvBefore = now;
}

/* ---------- trang chủ ---------- */
function moodLine() {
  const tx = todayXP(), st = streakNow(), any = Object.keys(S.done).length;
  if (!any) return 'Tap the glowing button on the map to start your first lesson.';
  if (tx >= S.goal) return 'Daily goal reached! One more lesson for extra stars?';
  if (st >= 2) return `${st}-day streak. One lesson keeps the fire going.`;
  const tips = ['Speaking out loud sticks better than reading silently.', '10 minutes a day beats 2 hours on the weekend.', 'Score 95% or more for 3 stars on a lesson.', 'Review cards on time to move words into long-term memory.'];
  return tips[new Date().getDate() % tips.length];
}
const NEW_LV = new Set(['zh|hsk1', 'zh|hsk2', 'zh|hsk3', 'ielts|b5', 'ielts|b6', 'ielts|b7', 'ielts|b8']);
function levelList(c, L) {
  const lang = S.lang, all = c.levels.reduce((a, x) => a + x.units.length, 0), doneU = c.levels.reduce((a, x) => a + x.units.filter((u) => unitProgress(u.id) === LN).length, 0);
  return `<div class="lc-label">LEVELS</div>
  <div class="lv-list" role="tablist" aria-label="Choose a level">${c.levels.map((x) => {
    const t = x.units.length * LN, d = x.units.reduce((a, u) => a + unitProgress(u.id), 0), st = x.units.reduce((a, u) => a + unitStars(u.id), 0), pc = Math.round(d / t * 100), beat = S.boss[lang + '|' + x.id];
    const isNew = NEW_LV.has(lang + '|' + x.id) && !d;
    return `<button role="tab" data-lv="${x.id}" aria-selected="${x.id === L.id}" style="--pc:${pc}"><span class="lv-ring"><b>${pc}%</b></span><span class="lv-t"><b>${esc(x.name)}${isNew ? '<em class="lv-new">NEW</em>' : ''}</b><small>${esc(x.short || '')} · ${I.star}${st}${beat ? ' ' + I.crown : ''}</small></span></button>`;
  }).join('')}</div>
  <div class="panel pad lc-extra" style="display:grid;gap:6px"><small class="muted">${esc(COURSES[lang].name)} · ${esc(COURSES[lang].tag)}</small><b style="font-size:1.05rem">${doneU} / ${all} units</b><span class="bar"><i style="width:${Math.round(doneU / all * 100)}%"></i></span><a class="more" href="#/roadmap" style="margin-top:4px">Open the roadmap</a></div>`;
}
async function home() {
  const c = await course(S.lang);
  const L = curLevel(c), cur = currentPos(c), lang = S.lang;
  const name = acct ? acct.name : '';
  const hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const ui = cur.u ? L.units.indexOf(cur.u) : -1, left = cur.u ? LN - unitProgress(cur.u.id) : 0;
  shell('#/', `
  <section class="hello"><div><h1>${hi}${name ? ', ' + esc(name) : ''}</h1><p>${esc(moodLine())}</p></div></section>
  ${cur.u ? `<section class="mission panel" style="--uc:${ucol(lang, ui)}">
    <div class="ms-ic">${I[LESSONS[cur.k].icon]}</div>
    <div class="ms-t"><small>${esc(L.name)} · Unit ${ui + 1} · ${esc(cur.u.title)}</small><b>${esc(lessonName(lang, cur.k))}</b>
      <span class="ms-steps">${LESSONS.map((x) => `<i class="${(S.done[cur.u.id] || [])[x.k] ? 'on' : x.k === cur.k ? 'cur' : ''}"></i>`).join('')}</span>
      <em>${left > 1 ? `${left} lessons to the reward chest` : 'Last lesson, then open the chest!'}</em></div>
    <button class="btn acc go" type="button">${I.play}<span>Continue</span></button>
  </section>` : `<section class="mission panel done"><div class="ms-ic">${I.crown}</div><div class="ms-t"><b>All ${esc(L.name)} units done</b><em>Fight the level boss or move on to the next level.</em></div></section>`}
  <div class="level-intro"><div><h2>${esc(L.title)}</h2><p>${esc(L.desc || '')} <a class="rm-link" href="#/roadmap">See the full roadmap</a></p></div></div>
  <div id="path" class="path"></div>`, asideHTML(c), { left: levelList(c, L) });
  const pEl = app.querySelector('#path');
  const draw = () => {
    const W = Math.min(pEl.clientWidth || 360, 640);
    pEl.innerHTML = pathHTML(c, W);
    pEl.querySelectorAll('.seg.anim').forEach((p) => { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); });
    if (pEl.querySelector('.seg.anim, .node.pop-in')) setTimeout(() => sfx('build'), 300);
    pEl.querySelectorAll('.node').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sfx('tap'); if (b.classList.contains('open') && popClose) popClose(); else openPop(c, b); }));
    pEl.querySelectorAll('.cp').forEach((b) => b.addEventListener('click', () => { if (b.classList.contains('ready')) openUnitChest(c, b.dataset.u, b); else { sfx('tap'); unitReview(c, b.dataset.u); } }));
    pEl.querySelectorAll('.guide').forEach((b) => b.addEventListener('click', () => { sfx('open'); guidebook(c, b.dataset.u); }));
    pEl.querySelectorAll('.boss-go').forEach((b) => b.addEventListener('click', () => { sfx('tap'); bossFight(c, L); }));
    pEl.querySelectorAll('.next-lv').forEach((b) => b.addEventListener('click', () => { sfx('tap'); S.level[S.lang] = b.dataset.lv; save(); home(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    justBuilt = null;
  };
  draw();
  let rt, lastW = pEl.clientWidth;
  window.onresize = () => { clearTimeout(rt); rt = setTimeout(() => { if ((location.hash === '' || location.hash === '#/') && pEl.isConnected && pEl.clientWidth !== lastW) { lastW = pEl.clientWidth; justBuilt = null; draw(); } }, 150); };
  if (scrollToUnit) { const t = pEl.querySelector(`.unit[data-u="${scrollToUnit}"]`); scrollToUnit = null; if (t) setTimeout(() => t.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); }
  const curBtn = pEl.querySelector('.node.cur, .cp.ready');
  if (curBtn && sessionStorage.getItem('dcl_scrolled') !== L.id + S.lang) { setTimeout(() => curBtn.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350); try { sessionStorage.setItem('dcl_scrolled', L.id + S.lang); } catch (e) {} }
  app.querySelectorAll('.lv-list button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); S.level[S.lang] = b.dataset.lv; save(); try { sessionStorage.removeItem('dcl_scrolled'); } catch (e) {} home(); }));
  const go = app.querySelector('.mission .go'); if (go) go.addEventListener('click', () => start(c, cur.u.id, cur.k));
  checkBadges();
}
function start(c, uid, k) {
  unlockAudio();
  const { u } = findUnit(c, uid);
  const before = questDone(), lv0 = playerLevel().lv;
  runLesson({ unit: u, k, lang: S.lang, onExit: (r) => {
    if (r && r.done) { justBuilt = { unit: u.id, k }; if (unitProgress(u.id) === LN && !S.chests[u.id]) setTimeout(() => toast('Unit complete! Tap the chest for your reward'), 900); }
    questCheer(before); checkLevel(lv0); checkBadges();
    const back = sessionStorage.getItem('dcl_back'); sessionStorage.removeItem('dcl_back');
    if (back) { if (location.hash === back) render(); else location.hash = back; }
    else if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; else home();
    setTimeout(() => { const g = document.querySelector('.hud .gem'); if (r && r.done && g) floatText(g, `+${r.xp} XP`); }, 400);
  } });
}
const questDone = () => quests().filter((q) => q.v >= q.n).length;
function questCheer(before) { const n = questDone(); if (n > before) { setTimeout(() => { sfx('quest'); toast(n === 3 ? 'All 3 quests done! Open the quest chest' : 'Daily quest complete'); }, 500); } }

/* ---------- lộ trình chi tiết ---------- */
let scrollToUnit = null;
async function roadmap() {
  const c = await course(S.lang), lang = S.lang, curL = curLevel(c);
  const totalU = c.levels.reduce((a, L) => a + L.units.length, 0), totalW = c.levels.reduce((a, L) => a + L.units.reduce((b, u) => b + u.words.length, 0), 0);
  const title = lang === 'zh' ? 'Chinese roadmap' : lang === 'ielts' ? 'IELTS roadmap' : 'English roadmap';
  shell('#/roadmap', `<div class="page-h"><h1>${title}</h1><p>${c.levels.length} levels · ${totalU} units · ${totalU * LN} lessons · ${totalW} words. Each unit has 8 lessons${lang === 'ielts' ? ': 2 academic vocabulary lessons, Speaking Part 1, Parts 2–3, Reading, grammar, Writing and a unit test.' : ': 2 vocabulary, 2 dialogues, reading, 2 grammar and a unit test.'}</p></div>
  ${c.plan ? `<section class="panel rm-plan"><h3>${I.chart} ${esc(c.plan.title)}</h3>${c.plan.paras.map((p) => `<p>${esc(p)}</p>`).join('')}${c.plan.weeks ? `<ol class="rm-weeks">${c.plan.weeks.map((w) => `<li><b>${esc(w[0])}</b><span>${esc(w[1])}</span></li>`).join('')}</ol>` : ''}</section>` : ''}
  <div class="rm">${c.levels.map((L, li) => {
    const tot = L.units.length * LN, dn = L.units.reduce((a, u) => a + unitProgress(u.id), 0), pct = Math.round(dn / tot * 100);
    return `<details class="rm-lv panel" ${L === curL ? 'open' : ''} style="--uc:${ucol(lang, li)}">
      <summary><span class="rm-badge">${esc(L.name)}</span><span class="rm-h"><b>${esc(L.title)}</b><small>${esc(L.short || '')} · ${L.units.length} units · ${tot} lessons${L.hours ? ' · about ' + esc(L.hours) : ''}</small></span><span class="rm-pct"><b>${pct}%</b><span class="qbar"><i style="width:${pct}%"></i></span></span>${I.chev}</summary>
      <div class="rm-body">
        <p class="rm-desc">${esc(L.desc || '')}</p>
        ${L.goals && L.goals.length ? `<div class="rm-goals"><b>After ${esc(L.name)}, you can:</b><ul>${L.goals.map((g) => `<li>${I.check}<span>${esc(g)}</span></li>`).join('')}</ul></div>` : ''}
        ${L.extra && L.extra.length ? `<div class="rm-goals rm-extra"><b>Also do outside this site:</b><ul>${L.extra.map((g) => `<li>${I.target}<span>${esc(g)}</span></li>`).join('')}</ul></div>` : ''}
        <ol class="rm-units">${L.units.map((u, i) => { const p = unitProgress(u.id); return `<li><button class="rm-u ${p === LN ? 'done' : p ? 'part' : ''}" type="button" data-lv="${L.id}" data-u="${u.id}" style="--uc:${ucol(lang, i)}">
          <span class="rm-n">${p === LN ? I.check : i + 1}</span>
          <span class="rm-t"><b>${esc(u.title)}</b><small>${esc(u.sub || '')} · ${u.words.length} words · ${esc(u.gram.title)}${u.gram2 ? ' / ' + esc(u.gram2.title) : ''}${u.write ? ' · Writing ' + esc(u.write.task) : ''}</small></span>
          <span class="rm-p">${I.star}${unitStars(u.id)}</span></button></li>`; }).join('')}</ol>
        <button class="btn ${L === curL ? 'ghost' : 'acc'} rm-go" type="button" data-lv="${L.id}">${L === curL ? 'Current level' : 'Study ' + esc(L.name)}</button>
      </div></details>`; }).join('')}</div>`, asideHTML(c));
  const go = (lv, uid) => { sfx('tap'); S.level[S.lang] = lv; save(); scrollToUnit = uid || null; try { sessionStorage.setItem('dcl_scrolled', lv + S.lang); } catch (e) {} location.hash = '#/'; };
  app.querySelectorAll('.rm-u').forEach((b) => b.addEventListener('click', () => go(b.dataset.lv, b.dataset.u)));
  app.querySelectorAll('.rm-go').forEach((b) => b.addEventListener('click', () => go(b.dataset.lv)));
  app.querySelectorAll('.rm-lv summary').forEach((sm) => sm.addEventListener('click', () => sfx('open')));
}

/* ---------- ôn tập ---------- */
async function review() {
  const c = await course(S.lang);
  const list = due(S.lang).filter((w) => WORDS[S.lang + '|' + w]);
  if (!list.length) {
    const learned = Object.keys(S.srs).filter((k) => k.startsWith(S.lang + '|')).length;
    shell('#/review', `<div class="page-h"><h1>Review</h1><p>Word cards come back right before you forget them.</p></div>
    <div class="panel empty">${mascot({ size: 84, mood: 'calm' })}<h2>${learned ? 'No cards due' : 'No cards yet'}</h2><p>${learned ? `You have ${learned} words in your deck. The next card will be due later.` : 'Finish a Vocabulary lesson and its words will appear here.'}</p>${learned >= 4 ? '<button class="btn acc quick">Quick 10-question drill</button>' : '<a class="btn acc" href="#/">Start a new lesson</a>'}</div>`, asideHTML(c));
    const q = app.querySelector('.quick'); if (q) q.addEventListener('click', () => quickPractice('mix'));
    return;
  }
  let i = 0, done = 0;
  const zh = isZh(), before = questDone();
  shell('#/review', `<div class="page-h"><h1>Review</h1><p><b class="left">${list.length}</b> cards due. Tap a card to flip it.</p></div><div class="rv"></div>`, asideHTML(c));
  const box = app.querySelector('.rv');
  const one = () => {
    if (i >= list.length) { box.innerHTML = `<div class="panel empty">${mascot({ size: 84, mood: 'wow' })}<h2>${done} cards reviewed</h2><p>These cards will be back at just the right time.</p><a class="btn acc" href="#/">Back to the map</a></div>`; sfx('done'); questCheer(before); checkBadges(); return; }
    const w = WORDS[S.lang + '|' + list[i]];
    box.innerHTML = `<div class="review-card"><div class="flip"><div class="face front"><h2 class="${zh ? 'zh' : ''}">${esc(w.w)}</h2><button class="say" type="button" aria-label="Listen">${I.speaker}</button><span class="muted">Do you remember the meaning?</span></div>
      <div class="face back"><h2 class="${zh ? 'zh' : ''}" style="font-size:${zh ? '2.4rem' : '1.7rem'}">${esc(w.w)}</h2><span class="muted">${esc(zh ? w.py : w.ipa || '')}</span><div style="font-size:1.3rem;font-weight:700">${esc(w.vi)}</div><div class="${zh ? 'zh' : ''}" style="font-size:${zh ? '1.15rem' : '.98rem'}">${esc(zh ? strip(w.ex) : w.ex)}</div><small class="muted">${esc(w.exVi || '')}</small></div></div></div>
      <div class="grade" hidden><button class="btn again" data-g="0">Forgot<small>10 min</small></button><button class="btn ghost" data-g="1">Unsure<small>a few days</small></button><button class="btn good" data-g="2">Got it<small>longer</small></button></div>
      <button class="btn ghost wide reveal" type="button">Flip card</button>`;
    const card = box.querySelector('.review-card'), g = box.querySelector('.grade'), rv = box.querySelector('.reveal');
    const flip = () => { if (card.classList.contains('on')) return; sfx('flip'); card.classList.add('on'); g.hidden = false; rv.hidden = true; speak(w.w, S.lang); };
    card.addEventListener('click', (e) => { if (e.target.closest('.say')) return; flip(); });
    rv.addEventListener('click', flip);
    const sb = box.querySelector('.say'); sb.addEventListener('click', () => speak(w.w, S.lang, { btn: sb }));
    speak(w.w, S.lang, { btn: sb });
    g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const gv = +b.dataset.g; grade(S.lang, list[i], gv); bump('review'); sfx(gv ? 'ok' : 'bad'); addXP(1); done++; i++; const l = app.querySelector('.left'); if (l) l.textContent = list.length - i; one(); }));
  };
  one();
}

/* ---------- luyện tập ---------- */
async function learnedUnits() {
  const c = await course(S.lang);
  const out = []; c.levels.forEach((L) => L.units.forEach((u) => { if (unitProgress(u.id) > 0) out.push(u); }));
  return out.length ? out : [curLevel(c).units[0]];
}
async function quickPractice(kind) {
  const us = await learnedUnits(), lang = S.lang, zh = lang === 'zh';
  const words = us.flatMap((u) => u.words), sents = us.flatMap((u) => [...u.dlg.lines, ...u.read.sents, ...u.gram.ex]).filter((s) => s.tk && s.tk.length >= 3 && s.tk.length <= 13);
  const unit = { id: 'practice', title: 'Practice', words, dlg: { lines: [] }, read: { sents: [], q: [] }, gram: { ex: [], drill: [] } };
  let queue = [];
  if (kind === 'roleplay') { const u = shuffleArr(us)[0]; return runQueue(u, [{ type: 'dialogue' }, { type: 'roleplay' }], lang); }
  if (kind === 'cue') { const u = shuffleArr(us.filter((x) => x.cue))[0]; if (!u) return toast('Do an IELTS Speaking lesson first'); return runQueue(u, [{ type: 'cue' }], lang); }
  if (kind === 'writing') { const u = shuffleArr(us.filter((x) => x.write))[0]; if (!u) return toast('Reach an IELTS Writing lesson first'); return runQueue(u, [{ type: 'writeTask' }], lang); }
  if (kind === 'listen') queue = shuffleArr(sents).slice(0, 8).map((s) => (zh ? { type: 'listenOrder', s } : { type: 'dictation', s }));
  else if (kind === 'speak') queue = shuffleArr(sents).slice(0, 6).map((s) => ({ type: 'speak', s }));
  else if (kind === 'write') queue = shuffleArr(words.filter((w) => strip(w.w).length <= 2)).slice(0, 6).map((w) => ({ type: 'write', w }));
  else queue = shuffleArr(words).slice(0, 10).map((w, i) => ({ type: ['meaning', 'listenWord', 'wordFromVi'][i % 3], w }));
  if (kind === 'mix' && sents.length) queue.splice(4, 0, { type: 'order', s: shuffleArr(sents)[0] });
  runQueue(unit, queue, lang);
}
// thử thách 60 giây: trả lời nhanh nghĩa của từ, sai trừ 2 giây
async function speedRound() {
  const us = await learnedUnits(), lang = S.lang, zh = lang === 'zh';
  const words = shuffleArr(us.flatMap((u) => u.words)); if (words.length < 6) return toast('Learn a few vocabulary lessons first');
  const key = 'speed|' + lang, best = S.best[key] || 0;
  const o = overlay(`<div class="speed"><div class="sp-top"><span class="sp-time"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" class="fg"/></svg><b>60</b></span><span class="sp-score"><small>Score</small><b>0</b></span><span class="sp-best"><small>Best</small><b>${best}</b></span><button class="icon-btn sp-x" type="button" aria-label="Quit">${I.x}</button></div><div class="sp-q"></div><div class="sp-opts"></div><p class="muted sp-hint">Pick the right meaning. Keys 1–4. A wrong answer costs 2 seconds.</p></div>`, null, 'speed-ovl');
  const el = o.el, qEl = el.querySelector('.sp-q'), opEl = el.querySelector('.sp-opts'), tEl = el.querySelector('.sp-time b'), fg = el.querySelector('.sp-time .fg'), scEl = el.querySelector('.sp-score b');
  const C = 2 * Math.PI * 19; fg.style.strokeDasharray = C;
  let left = 60, score = 0, i = 0, combo = 0, over = false, tid = 0, cur = null;
  const next = () => {
    const w = words[i % words.length]; i++; cur = w;
    const opts = shuffleArr([w, ...shuffleArr(words.filter((x) => x.vi !== w.vi)).slice(0, 3)]);
    qEl.innerHTML = `<b class="${zh ? 'zh' : ''}">${esc(w.w)}</b>${zh ? `<small>${esc(w.py)}</small>` : ''}`; qEl.classList.remove('in'); void qEl.offsetWidth; qEl.classList.add('in');
    opEl.innerHTML = opts.map((x, j) => `<button class="opt" type="button" data-ok="${x === w ? 1 : 0}"><span class="key">${j + 1}</span><span>${esc(x.vi)}</span></button>`).join('');
    opEl.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => pickOpt(b)));
  };
  const pickOpt = (b) => {
    if (over) return;
    if (b.dataset.ok === '1') { score++; combo++; sfx(combo % 5 === 0 ? 'combo' : 'ok'); b.classList.add('right'); scEl.textContent = score; floatText(scEl, '+1'); if (combo % 5 === 0) { left = Math.min(60, left + 3); floatText(tEl, '+3s', 'time'); } }
    else { combo = 0; sfx('bad'); b.classList.add('wrong'); left = Math.max(0, left - 2); floatText(tEl, '-2s', 'bad'); }
    setTimeout(next, 220);
  };
  const end = () => {
    over = true; clearInterval(tid); document.removeEventListener('keydown', onKey);
    const rec = score > best; if (rec) S.best[key] = score; addXP(Math.max(2, Math.round(score / 2))); save(true); sfx(rec ? 'levelup' : 'done');
    el.querySelector('.ovl-in').innerHTML = `<div class="rw"><span class="sp-big">${score}</span><h2>${rec ? 'New record!' : 'Time\'s up!'}</h2><p class="muted">${rec ? `You beat your old best of ${best}.` : `Your best: ${best}.`} +${Math.max(2, Math.round(score / 2))} XP</p><div class="foot-row"><button class="btn ghost ovl-ok" type="button">Close</button><button class="btn acc again" type="button">Play again</button></div></div>`;
    if (rec) { const r = el.querySelector('.sp-big').getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); }
    el.querySelector('.again').addEventListener('click', () => { o.close(); speedRound(); });
    checkBadges();
  };
  const onKey = (e) => { if (/^[1-4]$/.test(e.key)) { const b = opEl.querySelectorAll('.opt')[+e.key - 1]; if (b) pickOpt(b); } if (e.key === 'Escape') { over = true; clearInterval(tid); document.removeEventListener('keydown', onKey); o.close(); } };
  document.addEventListener('keydown', onKey);
  el.querySelector('.sp-x').addEventListener('click', () => { over = true; clearInterval(tid); document.removeEventListener('keydown', onKey); o.close(); });
  const tick = () => { tEl.textContent = left; fg.style.strokeDashoffset = C * (1 - left / 60); el.classList.toggle('hurry', left <= 10); };
  tick(); next();
  tid = setInterval(() => { left--; if (left <= 10 && left > 0) sfx('tick'); tick(); if (left <= 0) end(); }, 1000);
}
async function readingLibrary() {
  const c = await course(S.lang);
  const rows = []; c.levels.forEach((L) => L.units.forEach((u) => rows.push({ L, u })));
  sheet(`<h2>Reading library</h2><p class="sub">Read and listen again to every reading, by level.</p><div class="list">${rows.map(({ L, u }) => `<button class="row" data-u="${u.id}" style="text-align:left;width:100%"><span class="grow"><b>${esc(u.read.title)}</b><small>${esc(L.name)} · ${esc(u.title)}</small></span>${unitProgress(u.id) ? I.check.replace('<svg', '<svg style="width:20px;color:var(--acc)"') : ''}</button>`).join('')}</div>`,
    (el, close) => el.querySelectorAll('.row').forEach((b) => b.addEventListener('click', () => { close(); const { u } = findUnit(c, b.dataset.u); runQueue(u, [{ type: 'reading' }, ...u.read.q.map((x) => ({ type: 'mcq', q: x.q, opts: x.opts, a: x.a, note: 'From the reading' }))], S.lang); })));
}
async function wordList() {
  const us = await learnedUnits(), zh = isZh();
  const words = us.flatMap((u) => u.words);
  sheet(`<h2>My words</h2><p class="sub">${words.length} words. Tap to listen.</p><input class="input" placeholder="Search a word or meaning" style="margin-bottom:12px"/><div class="list wl">${words.map((w, i) => `<button class="row" data-i="${i}" style="text-align:left;width:100%"><span class="grow"><b class="${zh ? 'zh' : ''}" style="${zh ? 'font-size:1.25rem;font-weight:400' : ''}">${esc(w.w)} <span class="py">${esc(zh ? w.py : w.ipa || '')}</span></b><small>${esc(w.vi)}</small></span>${I.speaker.replace('<svg', '<svg style="width:20px;color:var(--muted)"')}</button>`).join('')}</div>`,
    (el) => {
      el.querySelectorAll('.wl .row').forEach((b) => b.addEventListener('click', () => speak(words[+b.dataset.i].w, S.lang)));
      el.querySelector('input').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.wl .row').forEach((b) => { const w = words[+b.dataset.i]; b.hidden = q && !(w.w.toLowerCase().includes(q) || w.vi.toLowerCase().includes(q) || (w.py || '').toLowerCase().includes(q)); }); });
    });
}
async function practice() {
  const c = await course(S.lang);
  const zh = isZh(), ie = S.lang === 'ielts', best = S.best['speed|' + S.lang] || 0;
  const tiles = [
    ['speed', 'timer', '60-second challenge', `Match words to meanings fast. Every 5-answer combo adds time. Best: ${best}.`, 1],
    ...(ie ? [['cue', 'mic', 'Speaking Part 2', 'Cue card, 1 minute to prepare, 2 minutes to talk. Counts words, pace and fillers.', 0], ['writing', 'pen', 'Timed writing', 'Write to a task you have studied. Word count, linkers and a model answer.', 0]] : []),
    ['roleplay', 'roleplay', 'Role-play', 'You speak one part, the app reads the other.', 0],
    ['speak', 'mic', 'Speaking drill', canListen() ? 'Read sentences aloud and get word-by-word scoring.' : 'This browser cannot recognise speech. Use Chrome or Edge.', 0],
    ['listen', 'ear', 'Dictation', zh ? 'Listen, then rebuild the sentence.' : 'Listen to a sentence and type it.', 0],
    ['mix', 'bolt', 'Quick vocab drill', '10 mixed questions from your lessons.', 0],
    ['read', 'read', 'Reading library', 'Re-read passages and tap words for meanings.', 0],
    ...(zh ? [['write', 'brush', 'Write characters', 'Stroke-order practice with guidance.', 0]] : []),
    ['words', 'book', 'My words', 'Look words up and hear them again.', 0],
  ];
  shell('#/practice', `<div class="page-h"><h1>Practice</h1><p>Pick a skill. A few minutes per round, using what you have already learned.</p></div>
  <div class="tiles4">${tiles.map(([k, ic, t, d, big], i) => `<button class="panel ptile ${big ? 'big' : ''}" data-k="${k}" style="--uc:${ucol(S.lang, i + 3)}"><span class="ic">${I[ic]}</span><b>${t}</b><small>${d}</small>${big ? `<span class="pt-best"><small>Best</small><b>${best}</b></span>` : ''}</button>`).join('')}</div>`, asideHTML(c));
  app.querySelectorAll('.ptile').forEach((b) => b.addEventListener('click', () => { sfx('tap'); const k = b.dataset.k; if (k === 'read') readingLibrary(); else if (k === 'words') wordList(); else if (k === 'speed') speedRound(); else quickPractice(k); }));
}

/* ---------- hồ sơ, huy hiệu & cài đặt ---------- */
function syncText() { return !acct ? 'Saved on this device only' : sync.state === 'saving' ? 'Saving…' : sync.state === 'err' ? 'Not saved yet, will retry' : 'Saved to your account'; }
async function me() {
  const voicesEn = listVoices('en'), voicesZh = listVoices('zh'), p = playerLevel();
  const days = [...Array(28)].map((_, i) => { const d = new Date(Date.now() - (27 - i) * 86400000); const k = today(d); return { k, v: S.days[k] || 0 }; });
  const vidOn = (() => { try { return localStorage.getItem('dcl_video') !== 'off'; } catch (e) { return true; } })(), dim = document.documentElement.dataset.dim || '0';
  shell('#/me', `<div class="page-h"><div class="me-head">${acct ? `<button class="av-pick" type="button" title="Change avatar" style="border-radius:50%">${avatar(acct.name, acct.avatar, 'lg')}</button>` : lvRing(64)}<div><h1>${acct ? esc(acct.name) : 'My profile'}</h1><p class="sync">Level ${p.lv} · ${syncText()}</p></div></div>
    <div class="acts"><a class="btn sm ghost" href="#/friends">${I.users} Friends${social.counts.requests ? ` <i class="tag-s acc">${social.counts.requests}</i>` : ''}</a><a class="btn sm ghost" href="#/classes">${I.school} Classes</a><a class="btn sm ghost" href="#/roadmap">${I.list} Roadmap</a><a class="btn sm ghost" href="#/review">${I.cards} Review</a></div></div>
  <div class="me-grid"><div class="list">
    <div class="panel me-stats">
      <div><b>${streakNow()}</b><small>day streak</small></div>
      <div><b>${S.xp}</b><small>XP</small></div>
      <div><b>${Object.keys(S.srs).length}</b><small>words learned</small></div>
      <div><b>${unitsDone()}</b><small>units done</small></div>
      <div><b>${S.counts.perfect || 0}</b><small>perfect lessons</small></div>
      <div><b>×${S.counts.combo || 0}</b><small>best combo</small></div>
    </div>
    <div class="panel heat"><h3>${I.flame} Last 4 weeks</h3><div class="hm">${days.map((d) => `<i class="${d.v >= S.goal ? 'l3' : d.v >= S.goal / 2 ? 'l2' : d.v ? 'l1' : ''} ${d.k === today() ? 'td' : ''}" title="${d.k}: ${d.v} XP"></i>`).join('')}</div></div>
    <div class="panel bwall"><h3>${I.medal} Badges <em>${Object.keys(S.badges).length}/${BADGES.length}</em></h3><div class="bw">${BADGES.map(([id, t, d, ic]) => `<div class="bw-i ${S.badges[id] ? 'on' : ''}"><span class="bdg ${S.badges[id] ? 'on' : ''}">${I[ic]}</span><b>${esc(t)}</b><small>${S.badges[id] ? 'Earned ' + esc(S.badges[id]) : esc(d)}</small></div>`).join('')}</div></div>
    <div class="row"><span class="grow"><b>Daily goal</b><small>XP needed to keep your streak</small></span><select class="input goal" style="width:auto;height:42px">${[10, 20, 30, 50].map((g) => `<option value="${g}" ${S.goal === g ? 'selected' : ''}>${g} XP</option>`).join('')}</select></div>
    <label class="row"><span class="grow"><b>Sound effects</b><small>Correct, wrong, combos, chests</small></span><span class="switch"><input type="checkbox" class="snd" ${S.settings.sound ? 'checked' : ''}><span></span></span></label>
    <div class="row"><span class="grow"><b>Voice speed</b><small>Model audio</small></span><select class="input rate" style="width:auto;height:42px">${[[0.8, 'Slow'], [0.95, 'Normal'], [1.1, 'Fast']].map(([v, l]) => `<option value="${v}" ${S.settings.rate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${voicesEn.length ? `<div class="row"><span class="grow"><b>English voice</b></span><select class="input vEn" style="width:auto;max-width:55%;height:42px"><option value="">Automatic</option>${voicesEn.map((v) => `<option ${S.settings.voice.en === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : ''}
    ${voicesZh.length ? `<div class="row"><span class="grow"><b>Chinese voice</b></span><select class="input vZh" style="width:auto;max-width:55%;height:42px"><option value="">Automatic</option>${voicesZh.map((v) => `<option ${S.settings.voice.zh === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : `<div class="row"><span class="grow"><b>Chinese voice</b><small>No Chinese voice on this device. On Windows: Settings › Time & language › Speech, add Chinese (Simplified).</small></span></div>`}
    <div class="row"><span class="grow"><b>Microphone & speech</b><small class="micst">Test your mic before studying</small></span><button class="btn ghost mtest" type="button" style="min-height:42px">${I.mic} Test</button></div>
    <label class="row"><span class="grow"><b>Show pinyin</b><small>Romanisation under Chinese characters</small></span><span class="switch"><input type="checkbox" class="pyx" ${S.settings.pinyin ? 'checked' : ''}><span></span></span></label>
    <label class="row"><span class="grow"><b>Moving background</b><small>The forest video. Turn off to save battery or data</small></span><span class="switch"><input type="checkbox" class="vid" ${vidOn ? 'checked' : ''}><span></span></span></label>
    <div class="row"><span class="grow"><b>Background brightness</b><small>Darker makes text easier to read</small></span><select class="input dim" style="width:auto;height:42px">${[['0', 'Bright'], ['1', 'Dim'], ['2', 'Dark']].map(([v, l]) => `<option value="${v}" ${dim === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  </div>
  <div class="list">
    ${acct ? `<div class="panel pad"><h3>Account</h3><p class="muted" style="margin:6px 0 12px">Sign in with <b>${esc(acct.name)}</b> and your PIN on another device to continue.${acct.code ? ` Your friend code is <b style="letter-spacing:.12em;color:var(--ink)">${esc(acct.code)}</b>.` : ''}</p><div class="foot-row"><button class="btn ghost syncnow">${I.cloud} Save now</button><button class="btn ghost out">${I.logout} Sign out</button></div></div>`
      : `<div class="panel pad"><h3>Save your progress</h3><p class="muted" style="margin:6px 0 12px">Just a name and a 4–6 digit PIN. No email or phone number.</p><button class="btn acc wide mk">Create account</button><button class="btn ghost wide lg" style="margin-top:10px">I already have an account</button></div>`}
    <div class="panel pad"><h3>About</h3><p class="muted" style="font-size:.9rem;margin-top:6px">English A1–C1, Chinese HSK1–HSK6 and an IELTS path by band. 8 lessons per unit. Voices and speech scoring use your browser's built-in features; character writing uses the open-source Hanzi Writer library. Content written by desktopchill and not yet reviewed by native speakers.</p><button class="btn ghost wide wipe" style="margin-top:12px">Erase progress on this device</button></div>
  </div></div>`, null);
  const q = (s) => app.querySelector(s);
  q('.goal').addEventListener('change', (e) => { S.goal = +e.target.value; save(); toast('Goal updated'); });
  q('.snd').addEventListener('change', (e) => { S.settings.sound = e.target.checked; save(); applySettings(); sfx('ok'); });
  q('.rate').addEventListener('change', (e) => { S.settings.rate = +e.target.value; save(); applySettings(); speak(S.lang === 'zh' ? '你好，我们开始吧。' : "Hello, let's get started.", S.lang); });
  const ve = q('.vEn'); if (ve) ve.addEventListener('change', (e) => { S.settings.voice.en = e.target.value; save(); applySettings(); speak('This is my voice.', 'en'); });
  const vz = q('.vZh'); if (vz) vz.addEventListener('change', (e) => { S.settings.voice.zh = e.target.value; save(); applySettings(); speak('这是我的声音。', 'zh'); });
  watchMic((st) => { const el = q('.micst'); if (!el) return; if (st === 'denied') el.innerHTML = '<span style="color:var(--bad);font-weight:700">Chrome is blocking the mic for this site.</span> <a href="#" class="mhelp">How to fix</a>'; else if (st === 'granted') el.textContent = 'Microphone allowed'; else el.textContent = 'Test your mic before studying'; const h = el.querySelector('.mhelp'); if (h) h.addEventListener('click', (e) => { e.preventDefault(); micHelpSheet(); }); });
  q('.mtest').addEventListener('click', micTest);
  q('.pyx').addEventListener('change', (e) => { S.settings.pinyin = e.target.checked; save(); });
  q('.vid').addEventListener('change', (e) => setVideo(e.target.checked));
  q('.dim').addEventListener('change', (e) => { const v = e.target.value; if (v === '0') delete document.documentElement.dataset.dim; else document.documentElement.dataset.dim = v; try { localStorage.setItem('dcl_dim', v === '0' ? '' : v); } catch (er) {} });
  const ap = q('.av-pick'); if (ap) ap.addEventListener('click', avatarSheet);
  q('.wipe').addEventListener('click', () => { if (confirm('Erase all progress on this device?' + (acct ? ' Your online account stays as it is.' : ''))) { logout(); reset(); location.hash = '#/'; render(); } });
  if (acct) {
    q('.syncnow').addEventListener('click', async () => { await push(); toast(sync.state === 'ok' ? 'Saved to your account' : 'Could not save. Check your connection.'); me(); });
    q('.out').addEventListener('click', () => { if (confirm('Sign out? Your progress stays on this device.')) { logout(); me(); } });
  } else {
    q('.mk').addEventListener('click', () => authSheet('new'));
    q('.lg').addEventListener('click', () => authSheet('login'));
  }
}
function avatarSheet() {
  sheet(`<h2>Pick an avatar</h2><p class="sub">Shown to your friends, classmates and in live quizzes.</p><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:8px">${['', ...AVATARS].map((a) => `<button class="chip" type="button" data-a="${esc(a)}" style="height:54px;justify-content:center;font-size:${a ? '1.6rem' : '.8rem'}" aria-pressed="${(acct.avatar || '') === a}">${a ? esc(a) : esc(initials(acct.name))}</button>`).join('')}</div>`, (el, close) => {
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => { sfx('tap'); close(); try { await setAvatar(b.dataset.a); toast('Avatar updated'); } catch (e) { toast(e.message); } me(); }));
  });
}
function micTest() {
  const lang = S.lang === 'zh' ? 'zh' : 'en', sample = lang === 'zh' ? '你好，我是新同事。' : 'Hello, nice to meet you.';
  sheet(`<h2>Microphone test</h2><p class="sub">Tap the mic and read: <b class="${lang === 'zh' ? 'zh' : ''}">${esc(sample)}</b></p>
    <div class="mictest"><button class="mic" type="button" aria-label="Tap to speak">${I.mic}</button><div class="heard">The red ring moves with your voice.</div></div>`, (el) => {
    const mic = el.querySelector('.mic'), heard = el.querySelector('.heard');
    mic.addEventListener('click', async () => {
      if (mic.classList.contains('rec')) { stopListen(); return; }
      unlockAudio(); sfx('rec'); mic.classList.add('rec'); heard.textContent = 'Listening…';
      try {
        const r = await listen(lang, { onPartial: (t) => { heard.textContent = t; }, onLevel: (v) => mic.style.setProperty('--lv', v.toFixed(3)) });
        mic.classList.remove('rec');
        if (r.text) { sfx('ok'); heard.innerHTML = `<b style="color:var(--ok)">Your microphone works.</b><br>We heard: “${esc(r.text)}”`; }
        else heard.textContent = 'Nothing heard. Try speaking louder.';
      } catch (e) { mic.classList.remove('rec'); sfx('bad'); heard.innerHTML = `<span class="mic-err">${esc(micMsg(e.message))}</span>${micBlocked(e.message) ? MIC_HELP : ''}`; }
    });
  });
}
function authForm(mode) {
  return `<div class="tabs2" role="group"><button data-m="new" aria-pressed="${mode === 'new'}">Create account</button><button data-m="login" aria-pressed="${mode === 'login'}">Sign in</button></div>
  <form class="authf" style="margin-top:14px" novalidate>
    <div class="field"><label for="an">Your name</label><input class="input" id="an" autocomplete="username" maxlength="24" placeholder="e.g. tuan.mitek" required /><small class="nchk" aria-live="polite"></small></div>
    <div class="field"><label for="ap">PIN (4–6 digits)</label><input class="input pin" id="ap" type="password" inputmode="numeric" autocomplete="${mode === 'new' ? 'new-password' : 'current-password'}" maxlength="6" placeholder="••••" required /></div>
    <p class="err" role="alert"></p>
    <button class="btn acc wide sub" type="submit">${mode === 'new' ? 'Create account' : 'Sign in'}</button>
    <p class="muted" style="font-size:.84rem;margin-top:10px">${mode === 'new' ? 'Remember your name and PIN to sign in again. The PIN is only used for this learning site.' : 'Your saved progress will be loaded onto this device.'}</p>
  </form>`;
}
function wireAuth(el, mode, done) {
  el.querySelectorAll('.tabs2 button').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.m; el.querySelector('.authwrap').innerHTML = authForm(m); wireAuth(el, m, done); }));
  const f = el.querySelector('.authf'), err = el.querySelector('.err'), sub = el.querySelector('.sub');
  el.querySelector('#ap').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  // kiểm tra trùng tên ngay khi gõ (chỉ khi tạo tài khoản)
  let taken = false, nt = 0;
  const nIn = el.querySelector('#an'), nChk = el.querySelector('.nchk');
  if (mode === 'new') nIn.addEventListener('input', () => {
    clearTimeout(nt); taken = false; nIn.classList.remove('bad', 'good'); nChk.className = 'nchk'; nChk.textContent = '';
    const v = nIn.value; if (!validName(v)) return;
    nt = setTimeout(async () => {
      try { const ok = await nameAvailable(v); if (nIn.value !== v) return; taken = !ok; nIn.classList.add(ok ? 'good' : 'bad'); nChk.className = 'nchk ' + (ok ? 'hint-ok' : 'hint-bad'); nChk.textContent = ok ? '✓ This name is available' : 'This name already exists. Pick another one, or sign in if it is yours.'; } catch (e) {}
    }, 400);
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const n = el.querySelector('#an').value, p = el.querySelector('#ap').value;
    if (!validName(n)) { err.textContent = 'Name must be 3–24 characters: letters, numbers, dots or dashes.'; return; }
    if (!validPin(p)) { err.textContent = 'PIN must be 4 to 6 digits.'; return; }
    if (mode === 'new' && taken) { err.textContent = 'This account name already exists. Choose another name or sign in.'; nIn.focus(); return; }
    sub.disabled = true; sub.textContent = 'Working…';
    try { if (mode === 'new') await register(n, p); else await login(n, p); sfx('ok'); done(mode); }
    catch (x) { err.textContent = x.message; sub.disabled = false; sub.textContent = mode === 'new' ? 'Create account' : 'Sign in'; sfx('bad'); }
  });
}
function authSheet(mode) {
  sheet(`<h2>Learning account</h2><p class="sub">Save your progress and continue on another device.</p><div class="authwrap">${authForm(mode)}</div>`, (el, close) => wireAuth(el, mode, (m) => { close(); toast(m === 'new' ? 'Account created, progress saved' : 'Signed in'); applySettings(); render(); }));
}

/* ---------- chào mừng ---------- */
async function welcome() {
  const all = {}; for (const k of AVAIL) { try { all[k] = await course(k); } catch (e) {} }
  const avail = AVAIL.filter((k) => all[k]);
  let lang = avail.includes(S.lang) ? S.lang : 'en';
  const lv = { ...S.level }; avail.forEach((k) => { if (!all[k].levels.some((x) => x.id === lv[k])) lv[k] = all[k].levels[0].id; });
  const draw = () => {
    const c = all[lang];
    document.documentElement.dataset.lang = lang;
    app.innerHTML = `<div class="welcome">
    <div class="w-hero">
      <span class="w-logo">${LOGO}<span>desktop<b>chill</b> learn</span></span>
      <h1>Learn a language the way you <em>walk in a forest</em> — a little every day.</h1>
      <p class="lead">English, Chinese and IELTS on one journey map. Five-minute lessons, role-play with pronunciation scoring, classes with your teacher and live quizzes with friends.</p>
      <div class="w-stats"><span><b>${avail.reduce((a, k) => a + all[k].levels.reduce((b, L) => b + L.units.length, 0), 0)}</b><small>units</small></span><span><b>${avail.reduce((a, k) => a + all[k].levels.reduce((b, L) => b + L.units.length, 0), 0) * LN}</b><small>lessons</small></span><span><b>${BADGES.length}</b><small>badges</small></span></div>
      <form class="w-join" novalidate><span class="muted" style="font-weight:600">Got a game PIN?</span><input class="input wpin" inputmode="numeric" maxlength="6" placeholder="PIN" aria-label="Game PIN" /><button class="btn sm acc" type="submit">${I.zap} Join game</button></form>
    </div>
    <div class="w-card panel" data-lang="${lang}">
      <div class="pick" role="group" aria-label="Choose a course">${avail.map((k) => `<button data-l="${k}" aria-pressed="${lang === k}"><span class="big ${k === 'zh' ? 'zh' : ''}">${esc(COURSES[k].name)}</span><small>${esc(COURSES[k].tag)}</small></button>`).join('')}</div>
      <div class="field"><label>Start at</label><div class="list">${c.levels.map((L) => `<button class="row lvp ${lv[lang] === L.id ? 'sel' : ''}" data-lv="${L.id}"><span class="lvn">${esc(L.name)}</span><span class="grow"><b>${esc(L.title)}</b><small>${esc(L.desc)}</small></span>${lv[lang] === L.id ? I.check : ''}</button>`).join('')}</div></div>
      <button class="btn acc wide go" type="button">Enter the map</button>
      <button class="btn ghost wide have" type="button">I already have an account</button>
    </div></div>`;
    app.querySelectorAll('.pick button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); lang = b.dataset.l; draw(); }));
    app.querySelectorAll('.lvp').forEach((b) => b.addEventListener('click', () => { sfx('tap'); lv[lang] = b.dataset.lv; draw(); }));
    app.querySelector('.go').addEventListener('click', () => {
      unlockAudio(); sfx('ok');
      S.lang = lang; S.level = lv; save();
      sheet(`<h2>Save your progress?</h2><p class="sub">Create an account with a name and PIN so you can pick up where you left off. No email needed.</p><div class="authwrap">${authForm('new')}</div><button class="btn ghost wide later" style="margin-top:10px">Later, let me try first</button>`, (el, close) => {
        const finish = () => { close(); S.onboarded = true; save(true); applySettings(); location.hash = '#/'; render(); };
        wireAuth(el, 'new', (m) => { toast(m === 'new' ? 'Account created' : 'Signed in'); finish(); });
        el.querySelector('.later').addEventListener('click', finish);
      });
    });
    app.querySelector('.w-join').addEventListener('submit', (e) => { e.preventDefault(); const v = app.querySelector('.wpin').value.replace(/\D/g, ''); if (v.length === 6) location.hash = '#/play/' + v; else toast('Enter the 6-digit game PIN'); });
    app.querySelector('.have').addEventListener('click', () => sheet(`<h2>Sign in</h2><p class="sub">Enter the name and PIN you created.</p><div class="authwrap">${authForm('login')}</div>`, (el, close) => wireAuth(el, 'login', () => { close(); S.onboarded = true; save(true); applySettings(); location.hash = '#/'; render(); })));
  };
  draw();
}

/* ---------- chạy hàng đợi luyện tập ---------- */
function runQueue(unit, queue, lang) {
  const before = questDone(), lv0 = playerLevel().lv;
  import('./lesson.js?v=11').then((m) => m.runCustom({ unit, queue, lang, onExit: () => { questCheer(before); checkLevel(lv0); checkBadges(); render(); } }));
}

/* ---------- router ---------- */
async function render() {
  applySettings();
  document.getElementById('sheet-root').innerHTML = '';
  if (popClose) popClose();
  if (!AVAIL.includes(S.lang)) S.lang = 'en';
  social.cleanup();
  const r = location.hash || '#/';
  // trang chơi quiz mở được cả khi chưa có tài khoản / chưa chọn khoá học
  if (r.startsWith('#/play')) return social.playPage(r.split('/')[2] || '');
  if (r.startsWith('#/host/')) return social.hostPage(r.split('/')[2] || '');
  if (!S.onboarded) return welcome();
  try {
    if (r.startsWith('#/quizreport')) await social.reportPage(r.split('/').slice(2));
    else if (r.startsWith('#/quiz')) await social.quizHub();
    else if (r.startsWith('#/classes')) await social.classesPage(r.split('/').slice(2));
    else if (r.startsWith('#/class/')) await social.classPage(r.split('/')[2], r.split('/')[3]);
    else if (r.startsWith('#/friends')) await social.friendsPage(r.split('/').slice(2));
    else if (r.startsWith('#/review')) await review();
    else if (r.startsWith('#/practice')) await practice();
    else if (r.startsWith('#/me')) await me();
    else if (r.startsWith('#/roadmap')) await roadmap();
    else await home();
  } catch (e) {
    console.error(e);
    if (e.message === 'no-course' && S.lang !== 'en') { S.lang = 'en'; save(); return render(); }
    app.innerHTML = `<div class="welcome"><div class="w-card panel"><h1>Lessons could not load</h1><p class="lead">Check your internet connection and reload the page.</p><button class="btn acc" onclick="location.reload()">Reload</button></div></div>`;
  }
  window.scrollTo(0, 0);
}
lvBefore = playerLevel().lv;
social.init({ shell, render, authSheet, course, findUnit, curLevel, startLesson: (c, uid, k) => start(c, uid, k), COURSES, AVAIL, LN, lessonName, asideHTML, lvRing });
window.addEventListener('hashchange', render);
onSync(() => { const el = document.querySelector('.sync'); if (el) el.textContent = `Level ${playerLevel().lv} · ${syncText()}`; });
document.addEventListener('pointerdown', unlockAudio, { once: true });
render();
