import { I, LOGO } from './icons.js?v=38';
import { sound, sfx, unlockAudio } from './sound.js?v=38';
import { tts, speak, listVoices, canListen, listen, stopListen, micMsg, micBlocked, MIC_HELP, watchMic, requestMic, micPolicyBlocked } from './speech.js?v=38';
import { S, save, streakNow, todayXP, unitProgress, due, grade, addXP, today, reset, daily, bump, LN, starsOf, unitStars, playerLevel, setStars, markDone, addWords } from './store.js?v=38';
import { acct, sync, onSync, register, login, logout, validName, validPin, push, nameAvailable, setAvatar, call, pull, onPulled } from './account.js?v=38';
import { esc, shuffleArr, toast, sheet, floatText, burst, overlay, initials, avatar, vipAv, isImg, AVATARS } from './ui.js?v=38';
import * as social from './social.js?v=38';
import { setVideo, setBg } from './scene.js?v=38';
import * as walls from './walls.js?v=38';
import * as hub from './hub.js?v=38';
import * as duel from './duel.js?v=38';
import * as chat from './chat.js?v=38';
import * as guide from './guide.js?v=38';
import * as acctui from './acctui.js?v=38';
import * as gacha from './gacha.js?v=38';
import * as bestie from './bestie.js?v=38';
import * as ctxm from './ctx.js?v=38';
import * as adv from './adv.js?v=38';
import { runLesson, LESSONS, lessonName, lessonDesc } from './lesson.js?v=38';
import { mascot } from './mascot.js?v=38';

const app = document.getElementById('app');
const strip = (s) => (s || '').replace(/\s+/g, '');
const COURSE = {}, WORDS = {};
let justBuilt = null;
const DATA_V = 10; // nhớ đổi cùng số trong index.html (dòng preload data/…json?v=)
const TOPICS_V = 1; // data/en-topics.json (v24)

/* ---------- các khoá học ---------- */
const COURSES = {
  en: { id: 'en', name: 'English', short: 'EN', tag: 'A1 → C1', about: 'Work and everyday communication' },
  zh: { id: 'zh', name: '中文', short: '中文', tag: 'HSK1 → HSK6', about: 'From first words to professional fluency' },
  ielts: { id: 'ielts', name: 'IELTS', short: 'IELTS', tag: 'Band 4 → 8+', about: 'Four-skill path by band score' },
};
const AVAIL = ['en', 'zh', 'ielts'];
async function course(lang) {
  if (COURSE[lang]) return COURSE[lang];
  // v24: English có thêm 3 chủ đề (Business, Travel, Everyday) ở file riêng, tải song song; ngữ pháp dùng lại của Engineering cùng vị trí (gref)
  const [r, rt] = await Promise.all([fetch(`data/${lang}.json?v=${DATA_V}`), lang === 'en' ? fetch(`data/en-topics.json?v=${TOPICS_V}`).catch(() => null) : null]);
  if (!r.ok) throw new Error('no-course');
  const c = await r.json();
  if (rt && rt.ok) { try { const t = await rt.json(); const byId = {}; c.levels.forEach((L) => { L.topic = L.topic || 'eng'; L.units.forEach((u) => { byId[u.id] = u; }); });
    t.levels.forEach((L) => { L.units.forEach((u) => { const g = byId[u.gref]; if (g) { u.gram = g.gram; u.gram2 = g.gram2; } }); c.levels.push(L); }); c.topics = t.topics; } catch (e) {} }
  // English / IELTS: file không chứa token (để tải nhanh hơn) → tách lại theo dấu cách giống bản dựng
  if (lang !== 'zh') { const tk = (x) => { if (x && x.t && !x.tk) x.tk = x.t.split(/\s+/).filter(Boolean); };
    c.levels.forEach((L) => L.units.forEach((u) => { u.words.forEach((w) => { if (!w.exTk && w.ex) w.exTk = w.ex.split(/\s+/).filter(Boolean); });
      [u.dlg, u.dlg2].forEach((d) => d && d.lines.forEach(tk)); u.read && u.read.sents.forEach(tk); [u.gram, u.gram2].forEach((g) => g && g.ex.forEach(tk)); })); }
  c.levels.forEach((L) => L.units.forEach((u) => { u.level = L.id; u.words.forEach((w) => { const k = lang + '|' + w.w; if (!WORDS[k]) WORDS[k] = { ...w, unit: u.id }; }); }));
  COURSE[lang] = c; return c;
}
const findUnit = (c, id) => { for (const L of c.levels) for (const u of L.units) if (u.id === id) return { L, u }; return null; };
const curLevel = (c) => c.levels.find((x) => x.id === S.level[S.lang]) || c.levels[0];
// v24: chủ đề (English): Engineering = các level gốc; mỗi chủ đề có dãy level riêng
const topicOf = (L) => (L && L.topic) || 'eng';
const lvsOf = (c, L) => { const t = topicOf(L || curLevel(c)); return c.levels.filter((x) => topicOf(x) === t); };
const lvName = (L) => (L.tname ? `${L.tname} ${L.name}` : L.name);
const topicInfo = (c, L) => (c.topics || []).find((t) => t.id === topicOf(L)) || null;
function switchTopic(c, t) {
  const L = curLevel(c); S.level[S.lang + '~' + topicOf(L)] = L.id;
  const want = S.level[S.lang + '~' + t], ls = c.levels.filter((x) => topicOf(x) === t);
  if (!ls.length) return; S.level[S.lang] = (ls.find((x) => x.id === want) || ls[0]).id; save();
}
const TOPIC_IC = { eng: 'gear', biz: 'brief', trv: 'plane', life: 'home' };
// <option> cho ô chọn level: English gom theo chủ đề (optgroup)
function lvSelect(c, cur) {
  const opt = (L) => `<option value="${L.id}" ${cur === L.id ? 'selected' : ''}>${esc(L.name)} · ${esc(L.title)}</option>`;
  if (!c.topics || c.topics.length < 2) return c.levels.map(opt).join('');
  return c.topics.map((t) => `<optgroup label="${esc(t.name)}">${c.levels.filter((x) => topicOf(x) === t.id).map(opt).join('')}</optgroup>`).join('');
}
function topicSwitch(c, L, cls = '') {
  if (!c.topics || c.topics.length < 2) return '';
  const cur = topicOf(L);
  return `<div class="tp-sw ${cls}" role="tablist" aria-label="Choose a topic">${c.topics.map((t) => {
    const ls = c.levels.filter((x) => topicOf(x) === t.id), tot = ls.reduce((a, x) => a + x.units.length, 0), dn = ls.reduce((a, x) => a + x.units.filter((u) => unitProgress(u.id) === LN).length, 0);
    return `<button type="button" role="tab" data-tp="${t.id}" aria-selected="${t.id === cur}" title="${esc(t.name)} · ${esc(t.desc || '')}">${I[TOPIC_IC[t.id]] || I.book}<span>${esc(t.short || t.name)}</span><small>${dn}/${tot}</small></button>`;
  }).join('')}</div>`;
}
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
// menu kiểu Steam: mục chính, rê chuột thì hiện menu con
const MENU = [
  { label: 'Learn', href: '#/', ic: 'home', match: ['#/', '#/roadmap', '#/review', '#/practice'], items: [['#/', 'Journey map', 'home', 'Your lessons, chests and bosses'], ['#/roadmap', 'Roadmap', 'list', 'Every level and unit at a glance'], ['#/review', 'Review', 'cards', 'Word cards due today'], ['#/practice', 'Practice', 'target', 'Speed rounds, speaking, dictation']] },
  { label: 'Adventure', href: '#/adventure', ic: 'map', match: ['#/adventure'], items: [], hot: true },
  { label: 'Collection', href: '#/collection', ic: 'gallery', match: ['#/collection'], items: [['#/collection/all', 'All collection', 'gallery', 'Every wallpaper you own and can still win'], ['#/collection/spin', 'Lucky spin', 'gift', 'Spin your tickets for wallpapers'], ['#/collection/badges', 'Achievements', 'medal', 'Badges for streaks, words and more']] },
  { label: 'Play', href: '#/duel', ic: 'swords', match: ['#/duel', '#/quiz'], items: [['#/duel', 'Duels', 'swords', 'Same 10 questions, first win of the day: a spin ticket'], ['#/quiz', 'Live quiz', 'zap', 'Join with a PIN or host by topic'], ['#/friends/groups', 'Group quiz', 'users', 'Make a friend group and start a quick quiz together']] },
  { label: 'Classes', href: '#/classes', ic: 'school', match: ['#/classes', '#/class'], items: [['#/classes', 'My classes', 'school', 'Assignments, stream and reports'], ['#/classes', 'Join a class', 'plus', 'Enter the code from your teacher']] },
];
// thanh dưới (điện thoại): Ranking và Friends là 2 tab riêng; trang Me mở bằng ảnh đại diện ở góc phải trên
const TABS = [['#/', 'Learn', 'home'], ['#/adventure', 'Adventure', 'map'], ['rank', 'Ranking', 'trophy'], ['play', 'Play', 'swords'], ['friends', 'Friends', 'users'], ['#/collection', 'Collection', 'gallery']];
/* ---------- giao diện sáng / tối ---------- */
const theme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('dcl_theme', t); } catch (e) {}
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'light' ? '#e9f0ec' : '#07100d';
  document.querySelectorAll('.theme-t').forEach((b) => { b.innerHTML = t === 'light' ? I.moon : I.sun; b.title = t === 'light' ? 'Dark mode' : 'Light mode'; });
  const sw = document.querySelector('.thm'); if (sw) sw.checked = t === 'light';
}
// ảnh đại diện của mình (có vòng VIP nếu có)
function meAv(size = 40) {
  if (!acct) return lvRing(size);
  const v = walls.myVip();
  if (v) return vipAv(acct.name, acct.avatar, v, size >= 60 ? 'lg' : '');
  const inner = isImg(acct.avatar) ? `<span class="av-in"><img src="${acct.avatar}" alt=""></span>` : acct.avatar ? `<span class="av-in">${esc(acct.avatar)}</span>` : `<span class="av-in" style="font-size:.78rem;font-weight:800">${esc(initials(acct.name))}</span>`;
  return lvRing(size, inner);
}
function lvRing(size = 44, inner = '') {
  const p = playerLevel(), r = size / 2 - 3, C = 2 * Math.PI * r;
  return `<span class="lvr" title="Level ${p.lv}: ${p.cur}/${p.need} XP to next level" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="bg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p.cur / p.need)}"/></svg>${inner || `<b>${p.lv}</b>`}</span>`;
}
function courseTabs() {
  return `<div class="seg course-pick" role="group" aria-label="Course">${AVAIL.map((k) => `<button class="ctab" data-l="${k}" aria-pressed="${S.lang === k}"><span class="${k === 'zh' ? 'zh' : ''}">${esc(COURSES[k].short)}</span></button>`).join('')}</div>`;
}
const routeOf = (r) => r === '#/' ? '#/' : '#/' + (r.split('/')[1] || '');
// chip VIP: vòng tiến độ tới cấp VIP tiếp theo
function vipChip() {
  const v = walls.myVip(), pts = walls.vipPoints(), next = walls.VIP_T[v] || 1000, prev = v ? walls.VIP_T[v - 1] : 0;
  const p = v >= 10 ? 1 : Math.max(0, Math.min(1, (pts - prev) / (next - prev))), C = 2 * Math.PI * 17;
  return `<a class="vipc v${v}" href="#/collection" title="VIP ${v}: ${v >= 10 ? 'top rank' : `${pts} / ${next} points to VIP ${v + 1}`}"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="bg" cx="20" cy="20" r="17"/><circle class="fg" cx="20" cy="20" r="17" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p)).toFixed(1)}"/></svg><span class="vipc-t">VIP</span><b>${v}</b></a>`;
}
function shell(route, inner, aside, opts = {}) {
  const dueN = due(S.lang).length, reqN = social.counts.requests || 0, cur = routeOf(route);
  const duN = hub.hub.duels || 0;
  const playOn = ['#/duel', '#/quiz', '#/practice', '#/review'].includes(cur), rankN = (hub.hub.msgs || 0) + (reqN || 0);
  const tab = ([href, label, ic]) => href === 'play' ? `<button type="button" class="tb-play ${playOn ? 'on' : ''}" aria-label="Play">${I[ic]}<span>${label}</span>${duN ? `<i class="badge">${duN}</i>` : ''}</button>`
    : href === 'rank' || href === 'friends' ? `<button type="button" class="tb-rank tb-${href}" data-t="${href}" aria-label="${label}">${I[ic]}<span>${label}</span>${href === 'friends' && rankN ? `<i class="badge">${rankN > 99 ? '99+' : rankN}</i>` : ''}</button>`
    : `<a href="${href}" class="${href === '#/adventure' ? 'tb-adv' : ''}" ${cur === href || (href === '#/classes' && cur === '#/class') ? 'aria-current="page"' : ''}>${I[ic]}<span>${label}</span></a>`;
  const badgeOf = (href) => href === '#/review' && dueN ? dueN : href === '#/duel' && duN ? duN : 0;
  const menu = MENU.map((m) => {
    const on = m.match.includes(cur), n = m.items.reduce((a, it) => a + badgeOf(it[0]), 0);
    if (!m.items.length) return `<div class="mi solo ${m.hot ? 'hot' : ''} ${on ? 'on' : ''}"><a class="mt" href="${m.href}" ${on ? 'aria-current="page"' : ''}>${I[m.ic]}<span>${m.label}</span>${m.hot ? '<i class="mt-spark" aria-hidden="true"></i>' : ''}</a></div>`;
    return `<div class="mi ${on ? 'on' : ''}"><a class="mt" href="${m.href}" ${on ? 'aria-current="page"' : ''}>${I[m.ic]}<span>${m.label}</span>${n ? `<i class="badge">${n > 99 ? '99+' : n}</i>` : ''}${I.chevDown}</a>
      <div class="dd" role="menu"><div class="dd-in panel solid">${m.items.map(([h, l, ic, d]) => `<a href="${h}" role="menuitem" class="${l === 'Join a class' ? 'dd-join' : ''}">${I[ic]}<span><b class="${/中文/.test(l) ? 'zhl' : ''}">${l}</b><small>${d}</small></span>${badgeOf(h) && l !== 'Join a class' ? `<i class="badge">${badgeOf(h)}</i>` : ''}</a>`).join('')}</div></div></div>`;
  }).join('');
  const st = streakNow(), lit = todayXP() > 0;
  const left = opts.left || '', lay = left && aside ? 'three' : aside ? 'two' : 'one';
  app.innerHTML = `
  <header class="hud"><div class="hud-in">
    <a class="brand" href="#/" aria-label="desktopchill learn">${LOGO}<span>desktop<b>chill</b><small>learn</small></span></a>
    <nav class="nav menu" aria-label="Main">${menu}</nav>
    <div class="hud-r">
      ${opts.noCourse ? '' : courseTabs()}${opts.noCourse ? '' : `<button class="m-course" type="button" aria-label="Change course"><span class="${S.lang === 'zh' ? 'zh' : ''}">${esc(COURSES[S.lang].short)}</span>${I.chevDown}</button>`}
      <span class="chipx fire ${lit ? 'lit' : ''}" title="Day streak">${I.flame}<b>${st}</b></span>
      <span class="chipx gem" title="Total XP">${I.gem}<b class="xp-n">${S.xp}</b></span>${gacha.chipHTML()}
      ${vipChip()}
      ${acct ? `<button class="icon-btn chat-btn" type="button" title="Messages" aria-label="Messages">${I.chat}${hub.hub.msgs ? `<i class="badge">${hub.hub.msgs > 99 ? '99+' : hub.hub.msgs}</i>` : ''}</button>` : ''}${hub.bellHTML()}${acct ? `<button class="icon-btn rail-btn" type="button" title="Friends" aria-label="Friends">${I.users}${reqN ? `<i class="badge">${reqN}</i>` : ''}</button>` : ''}
      <div class="mi me-mi"><a class="hud-me" href="#/me" title="Profile and settings">${meAv(40)}${reqN ? `<i class="badge">${reqN}</i>` : ''}</a>
        <div class="dd right" role="menu"><div class="dd-in panel solid">
          <div class="dd-me">${acct ? `<b>${esc(acct.name)}</b><small>Level ${playerLevel().lv} · VIP ${walls.myVip()}</small>` : '<b>Guest</b><small>Progress is saved on this device</small>'}</div>
          <a href="#/me" role="menuitem">${I.gear}<span><b>Profile & settings</b><small>Avatar, theme, background, voice</small></span></a>
          <a href="#/friends" role="menuitem">${I.users}<span><b>Friends</b><small>Requests, codes, groups and leaderboard</small></span>${reqN ? `<i class="badge">${reqN}</i>` : ''}</a>
          ${acct ? `<a href="#/bestie" role="menuitem">${I.heart}<span><b>Bestie</b><small>${bestie.has() ? `${esc(bestie.B.brief.name)} · effects, sharing, slogan` : 'Learn together with one friend'}</small></span>${bestie.B.inc ? `<i class="badge">${bestie.B.inc}</i>` : ''}</a>` : ''}
          ${acct ? `<button type="button" class="dd-out" role="menuitem">${I.logout}<span><b>Sign out</b><small>Your progress stays on this device</small></span></button>` : `<button type="button" class="dd-in-btn" role="menuitem">${I.cloud}<span><b>Sign in or create account</b><small>Save progress to the cloud</small></span></button>`}
        </div></div></div>
    </div>
    <button class="hud-hide" type="button" title="Hide the menu" aria-label="Hide the menu">${I.chevUp}</button>
  </div></header>
  <button class="hud-show" type="button" title="Show the menu" aria-label="Show the menu">${I.chevDown}<span>Menu</span></button>
  <div class="layout ${lay}">
    ${left ? `<aside class="lcol" aria-label="Levels"><div class="col-h"><b>Levels</b><button class="icon-btn sm lcol-x" type="button" title="Hide this panel" aria-label="Hide this panel">${I.chev}</button></div>${left}</aside>` : ''}
    <main class="main" id="main">${inner}</main>
    ${aside ? `<button class="m-today" type="button" aria-label="Level, collection and phrase of the day">${I.target}<span>Today</span></button><div class="m-scrim"></div>` : ''}
    ${aside ? `<aside class="side" aria-label="Today"><div class="col-h"><b>Today</b><button class="icon-btn sm side-x" type="button" title="Hide this panel" aria-label="Hide this panel">${I.chev}</button></div>${aside}</aside>` : ''}
    ${acct ? `<aside class="rail-col" aria-label="Ranking and friends"><div class="col-h"><b>Ranking · Friends</b><button class="icon-btn sm rail-x" type="button" title="Hide this panel" aria-label="Hide this panel">${I.chev}</button></div><div class="rail panel solid"></div></aside>` : ''}
  </div>
  <nav class="tabbar" aria-label="Main">${TABS.map(tab).join('')}</nav>`;
  app.querySelectorAll('.ctab').forEach((b) => b.addEventListener('click', () => switchCourse(b.dataset.l)));
  app.querySelectorAll('.nav a, .tabbar a, .dd a').forEach((a) => a.addEventListener('click', () => { sfx('tap'); a.blur(); }));
  app.querySelector('.hud-hide').addEventListener('click', () => hub.toggleHud(false));
  app.querySelector('.hud-show').addEventListener('click', () => hub.toggleHud(true));
  const dj = app.querySelector('.dd-join'); if (dj) dj.addEventListener('click', () => setTimeout(() => { const i = document.querySelector('.jc'); if (i) i.focus(); }, 600));
  const out = app.querySelector('.dd-out'); if (out) out.addEventListener('click', () => { if (confirm('Sign out? Your progress stays on this device.')) { logout(); hub.start(); render(); } });
  const sin = app.querySelector('.dd-in-btn'); if (sin) sin.addEventListener('click', () => authSheet('login'));
  const sx = app.querySelector('.side-x'); if (sx) sx.addEventListener('click', () => hub.toggleSide(false));
  const lx = app.querySelector('.lcol-x'); if (lx) lx.addEventListener('click', () => hub.toggleLcol(false));
  gacha.wireChips(app);
  hub.wireBell(app);
  const rb = app.querySelector('.rail-btn'); if (rb) rb.addEventListener('click', () => hub.toggleRail());
  const cb = app.querySelector('.chat-btn'); if (cb) cb.addEventListener('click', () => { sfx('tap'); chat.openChats(); });
  const tp = app.querySelector('.tb-play'); if (tp) tp.addEventListener('click', playSheet);
  app.querySelectorAll('.tb-rank').forEach((tr) => tr.addEventListener('click', () => { sfx('tap'); if (!acct) { authSheet('new'); return; } hub.railSheet(tr.dataset.t); }));
  const mc = app.querySelector('.m-course'); if (mc) mc.addEventListener('click', courseSheet);
  const mt = app.querySelector('.m-today'); if (mt) mt.addEventListener('click', () => { sfx('open'); document.body.classList.add('side-sheet'); });
  const sc = app.querySelector('.m-scrim'); if (sc) sc.addEventListener('click', () => document.body.classList.remove('side-sheet'));
  document.body.classList.remove('side-sheet');
  hub.renderRail();
  if (aside) wireAside();
}
// điện thoại: chọn khoá học và bảng "Play"
function courseSheet() {
  sfx('tap');
  sheet(`<h2>Choose a course</h2><div class="list cs-list">${AVAIL.map((k) => `<button class="row cs-i ${S.lang === k ? 'sel' : ''}" type="button" data-l="${k}"><span class="cs-n ${k === 'zh' ? 'zh' : ''}">${esc(COURSES[k].short)}</span><span class="grow"><b class="${k === 'zh' ? 'zh' : ''}">${esc(COURSES[k].name)}</b><small>${esc(COURSES[k].tag || '')}</small></span>${S.lang === k ? I.check : ''}</button>`).join('')}</div>`, (el, close) => {
    el.querySelectorAll('.cs-i').forEach((b) => b.addEventListener('click', () => { close(); switchCourse(b.dataset.l); }));
  });
}
function playSheet() {
  sfx('open');
  const duN = hub.hub.duels || 0, dueN = due(S.lang).length;
  sheet(`<h2>Play</h2><div class="play-grid">
    <a class="pc pc-duel" href="#/duel">${I.swords}<b>Duels</b><small>Same 10 questions. Beat a rival.</small>${duN ? `<i class="badge">${duN}</i>` : ''}</a>
    <a class="pc pc-quiz" href="#/quiz">${I.zap}<b>Live quiz</b><small>Join with a PIN or host one.</small></a>
    <a class="pc pc-grp" href="#/friends/groups">${I.users}<b>Group quiz</b><small>Make a group, quiz your friends.</small></a>
    <a class="pc pc-prac" href="#/practice">${I.target}<b>Practice</b><small>Speed rounds and listening.</small></a>
    <a class="pc pc-rev" href="#/review">${I.cards}<b>Review</b><small>${dueN ? `${dueN} cards due` : 'Cards come back before you forget'}</small></a>
  </div>`, (el, close) => el.querySelectorAll('.pc').forEach((a) => a.addEventListener('click', () => close())));
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
  const ph = phraseOfDay(c); phraseRef = ph;
  const zh = isZh(), p = playerLevel();
  return `
  <div class="mic-slot"></div>
  <section class="panel lvcard">
    ${lvRing(64)}
    <div><small>Player level</small><b>Level ${p.lv}</b><span class="bar"><i style="width:${Math.round(p.cur / p.need * 100)}%"></i></span><em>${p.cur} / ${p.need} XP · today ${todayXP()} XP</em></div>
  </section>
  ${bestieMini()}
  ${walls.miniHTML()}
  ${ph ? `<section class="panel phrase">
    <h3>${I.chat} Phrase of the day</h3>
    <p class="ph-t ${zh ? 'zh' : ''}">${esc(textOf(S.lang, ph.l))}</p>
    ${zh && ph.l.py ? `<p class="py">${esc(ph.l.py.join(' '))}</p>` : ''}
    <p class="muted">${esc(ph.l.vi)}</p>
    <div class="ph-act"><button class="chip ph-say" type="button">${I.speaker} Listen</button><button class="chip ph-try" type="button">${I.mic} Say it</button></div>
  </section>` : ''}
`;
}
// v23: thẻ Bestie nhỏ ở cột Today
function bestieMini() {
  if (!acct) return '';
  const b = bestie.B.brief;
  if (!b) return `<a class="panel bmini none" href="#/bestie">${I.heart}<span class="bm-t"><b>Pick a Bestie</b><small>+10% XP when you both study, shared wallpapers, Adventure</small></span>${I.chev}</a>`;
  const m = +b.mult;
  return `<a class="panel bmini ${m > 1 ? 'up' : m < 1 ? 'down' : ''}" href="#/bestie">${vipAv(b.name, b.avatar, b.vip || 0)}<span class="bm-t"><b>${I.heart} ${esc(b.name)}</b><small>${m > 1 ? '+10% XP on lessons today' : m < 1 ? `Away ${b.offline_days} days · lessons −10% XP` : 'Study today together for +10% XP'}</small></span>${I.chev}</a>`;
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
  const cs = app.querySelector('.cm-spin'); if (cs) cs.addEventListener('click', () => { sfx('tap'); gacha.spin(); });
}
function openDailyChest(btn) {
  const reward = 15 + Math.floor(Math.random() * 11);
  S.dchest = today(); addXP(reward); save(true);
  btn.classList.add('popping'); sfx('chest');
  const r = btn.getBoundingClientRect(); burst(r.left + 40, r.top + 30);
  setTimeout(() => { overlay(`<div class="rw">${chestSVG(true)}<h2>Quest chest</h2><p class="rw-x">+${reward} XP</p><p class="muted">Come back tomorrow for a new chest.</p><button class="btn acc ovl-ok" type="button">Claim</button></div>`, () => render(), 'reward'); }, 500);
}

/* ---------- rương & hình minh hoạ ---------- */
// v26: rương 3D (ảnh render sẵn từ mô hình three.js): t1 gỗ–đồng, t2 bạc, t3 tím–vàng; có ảnh đóng và mở
function chestSVG(open = false, tier = '') {
  const t = /t([123])/.exec(tier || '') ? /t([123])/.exec(tier)[1] : '1';
  return `<span class="chest ch2 ch3d ${open ? 'open' : ''} ${tier}" aria-hidden="true"><i class="rays"></i><img class="c-cl" src="media/ui3d/chest-t${t}-closed.webp" alt="" draggable="false"><img class="c-op" src="media/ui3d/chest-t${t}-open.webp" alt="" draggable="false"></span>`;
}

/* ---------- bản đồ hành trình ---------- */
const JOINTS = LN + 1;
// v26: đường hình sin 1 chu kỳ (chữ S); 9 điểm (8 bài + rương) đặt cách đều nhau theo độ dài đường cong
function unitGeom(W, flip) {
  const A = Math.min(160, W * 0.3), cx = W / 2, top = 70, d = W < 500 ? 90 : 102, sg = flip ? -1 : 1, per = 1;
  const curve = (Hs, n) => { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n; pts.push({ x: cx + sg * A * Math.sin(Math.PI * 2 * per * t), y: top + t * Hs }); } return pts; };
  const len = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
  let lo = 120, hi = 1400; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (len(curve(m, 240)) > (JOINTS - 1) * d) hi = m; else lo = m; }
  const Hs = (lo + hi) / 2, dense = curve(Hs, 600), total = len(dense), pts = [];
  let acc = 0, j = 0;
  for (let k = 0; k < JOINTS; k++) {
    const want = (total * k) / (JOINTS - 1);
    while (j < dense.length - 1 && acc + Math.hypot(dense[j + 1].x - dense[j].x, dense[j + 1].y - dense[j].y) < want) { acc += Math.hypot(dense[j + 1].x - dense[j].x, dense[j + 1].y - dense[j].y); j++; }
    const p = dense[Math.min(j, dense.length - 1)], q = dense[Math.min(j + 1, dense.length - 1)], seg = Math.hypot(q.x - p.x, q.y - p.y) || 1, f = Math.max(0, Math.min(1, (want - acc) / seg));
    pts.push({ x: Math.round(p.x + (q.x - p.x) * f), y: Math.round(p.y + (q.y - p.y) * f), o: 0 });
  }
  return { pts, H: top + Hs + 80, A, cx };
}
function currentPos(c) {
  const L = curLevel(c);
  const u = L.units.find((x) => unitProgress(x.id) < LN);
  if (!u) return { L, u: null, k: 0 };
  const d = S.done[u.id] || []; let k = LESSONS.map((x) => x.k).find((i) => !d[i]); if (k === undefined) k = 0;
  return { L, u, k };
}
// học tuần tự: chỉ mở bài đã học hoặc bài kế tiếp (không học vượt để mở rương)
// v19: mọi bài và mọi chủ đề đều mở; rương chỉ mở khi xong cả 8 bài của chủ đề
function canStart() { return true; }
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
    const upg = opened && p === LN && walls.CAT && walls.canUpgrade(u.id, walls.chestStars(u.id));
    const cpBtn = `<button class="cp ${ready || upg ? 'ready' : ''} ${opened ? 'opened' : ''} ${upg ? 'upg' : ''}" style="left:${cp.x}px;top:${cp.y}px" data-u="${u.id}" aria-label="${ready ? 'Open reward chest' : upg ? 'Chest refilled' : 'Chest contents'}: ${esc(u.title)}">${chestSVG(opened && !upg, p === LN ? 't' + walls.chestStars(u.id) : '')}${ready ? '<span class="tip gold">Open me!</span>' : upg ? '<span class="tip gold">Refilled!</span>' : ''}${walls.chestBadge(u.id, p === LN)}</button>`;
    const us = unitStars(u.id);
    return `<section class="unit ${p === LN ? 'complete' : p ? 'started' : ''}" data-u="${u.id}" style="--uc:${ucol(lang, i)}">
      <header class="unit-head panel">
        <span class="uh-n">${p === LN ? I.check.replace('<svg', '<svg style="width:22px;height:22px;stroke-width:3"') : i + 1}</span>
        <div class="uh-t"><span class="uh-k">${esc(L.name)} · Unit ${i + 1}</span><h3>${esc(u.title)}</h3><p>${esc(u.goal || u.sub || '')}</p>
          <span class="uh-meta"><span class="uh-bar"><i style="width:${Math.round(p / LN * 100)}%"></i></span><span class="uh-st">${I.star}${us}/${LN * 3}</span></span></div>
        <div class="uh-acts"><button class="guide" type="button" data-u="${u.id}">${I.read}<span>Guide</span></button></div>
      </header>
      <div class="span" style="height:${g.H}px"><svg class="road" width="${W}" height="${g.H}" viewBox="0 0 ${W} ${g.H}" aria-hidden="true"><path class="edge" d="${full}"/><path class="bed" d="${full}"/>${done}</svg>${nodes}${cpBtn}</div>
    </section>`;
  }).join('') + bossHTML(c, L);
}
function bossHTML(c, L) {
  const all = L.units.every((u) => unitProgress(u.id) === LN), beat = !!S.boss[S.lang + '|' + L.id];
  const ls = lvsOf(c, L), idx = ls.indexOf(L), nx = ls[idx + 1], started = L.units.some((u) => unitProgress(u.id) > 0);
  return `<div class="boss panel ${beat ? 'beat' : all ? 'ready' : ''}">
    <span class="boss-ic">${beat ? I.crown : I.shield}</span>
    <div><small>End of ${esc(L.name)}</small><h3>${beat ? `${esc(L.name)} boss defeated` : `${esc(L.name)} boss challenge`}</h3>
    <p class="muted">${beat ? `You passed the final test of this level. Best: ${S.bossStars[S.lang + '|' + L.id] || 1}★.` : `20 mixed questions from every unit. Score 80% or more to win the crown${all ? '' : '. Opens when every unit in this level is done'}.`} Boss chest: 80% / 88% / 95% for 1 / 2 / 3 spin tickets.</p>
    <div class="boss-tks">${walls.ticketView(`boss|${S.lang}|${L.id}`, beat).map((t, i) => walls.ticketCard(t, ['80%', '88%', '95%'][i])).join('')}</div></div>
    <div class="boss-act"><button class="btn ${all && !beat ? 'gold' : 'ghost'} boss-go" type="button" ${all || beat ? '' : 'disabled'}>${beat ? 'Try again' : all ? 'Fight' : `${I.lock} Finish every unit first`}</button>
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
    ${canStart(c, u.id, k) ? `<button class="btn pop-go" type="button">${d[k] ? `${I.redo} Replay` : `${I.play} Start · +10 XP`}</button>` : `<p class="pop-lock">${I.lock} Locked. Lessons open one by one: finish the glowing lesson first.</p><button class="btn ghost pop-cur" type="button">Show me the next lesson</button>`}`;
  span.appendChild(pop); sfx('open');
  btn.classList.add('open');
  const off = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) popClose(); };
  popClose = () => { pop.classList.add('out'); btn.classList.remove('open'); setTimeout(() => pop.remove(), 160); document.removeEventListener('pointerdown', off); popClose = null; };
  setTimeout(() => document.addEventListener('pointerdown', off), 0);
  const pg = pop.querySelector('.pop-go'); if (pg) pg.addEventListener('click', () => { popClose(); start(c, u.id, k); });
  const pc = pop.querySelector('.pop-cur'); if (pc) pc.addEventListener('click', () => { popClose(); const n = document.querySelector('.node.cur'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
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
  const { L, u } = findUnit(c, uid), first = !S.chests[uid], reward = first ? 20 + unitStars(uid) : 0;
  const lv0 = playerLevel().lv;
  if (first) { S.chests[uid] = today(); addXP(reward); }
  save(true);
  btn.classList.add('popping'); sfx('tap');
  const r = btn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 24);
  const res = walls.claim(uid, walls.chestStars(uid)), i = L.units.indexOf(u);
  if (res.server) res.server.then((j) => { if (j && j.ok) gacha.setLeft(j.left); });
  setTimeout(() => walls.reveal({ slot: uid, res, title: u.title, kicker: `${L.name} · Unit ${i + 1} chest`, xp: reward, xpNote: reward ? `20 for the unit + ${unitStars(uid)} for your stars` : '', onClose: () => { checkLevel(lv0); checkBadges(); walls.checkVip(); home(); } }), 380);
}
// kiểm tra vượt chủ đề: 12 câu khó hơn, đạt 85% thì xong cả 8 bài với 2 sao (rương 2 sao = 1 hình nền; 3 sao vẫn phải học thật)
const TOUT_PASS = 0.85;
function testOut(c, uid) {
  const { L, u } = findUnit(c, uid), i = L.units.indexOf(u);
  if (unitProgress(uid) >= LN) return;
  if (S.tout[uid] === today()) { toast('You tried this test today. Take the lessons, or test out again tomorrow.'); return; }
  sheet(`<span class="muted sk">${esc(L.name)} · Unit ${i + 1}</span><h2>Test out of ${esc(u.title)}</h2>
    <p class="sub">Already know this unit? Answer 12 mixed questions: words, sentence order, grammar and reading. Score ${Math.round(TOUT_PASS * 100)}% or more and all 8 lessons count as done with 2 stars, so the unit chest opens with 1 wallpaper.</p>
    <ul class="tout-list"><li>${I.check}<span>One try per unit per day</span></li><li>${I.check}<span>The second wallpaper still needs 3 stars from the real lessons</span></li><li>${I.check}<span>All 20 words go into your review deck</span></li></ul>
    <div class="foot-row" style="margin-top:14px"><button class="btn ghost tout-no" type="button">Take the lessons</button><button class="btn acc tout-go" type="button">${I.bolt} Start the test</button></div>`, (el, close) => {
    el.querySelector('.tout-no').addEventListener('click', () => { close(); start(c, uid, currentPos(c).k); });
    el.querySelector('.tout-go').addEventListener('click', () => { close(); runTestOut(c, L, u); });
  });
}
function runTestOut(c, L, u) {
  unlockAudio();
  const zh = isZh(), q = [], gs = [u.gram, u.gram2].filter(Boolean);
  shuffleArr(u.words).slice(0, 5).forEach((w, i) => q.push({ type: ['wordFromVi', 'meaning', 'listenWord', 'wordFromVi', 'meaning'][i], w }));
  shuffleArr([...u.dlg.lines, ...gs.flatMap((g) => g.ex)].filter((s) => s.tk && s.tk.length >= 4 && s.tk.length <= 13)).slice(0, 3).forEach((s) => q.push({ type: 'order', s }));
  const drills = shuffleArr(gs.flatMap((g) => (g.drill || []).map((d) => ({ d, g }))));
  drills.slice(0, 3).forEach(({ d, g }) => q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: g.title, vi: d.vi }));
  const rq = u.read && u.read.q ? shuffleArr(u.read.q)[0] : null;
  if (rq) q.push({ type: 'mcq', q: rq.q, opts: rq.opts, a: rq.a, note: 'From the reading: ' + u.read.title });
  while (q.length < 12) { const w = shuffleArr(u.words)[0]; q.push({ type: zh ? 'meaning' : 'wordFromVi', w }); }
  const unit = { id: 'tout-' + u.id, title: 'Test out: ' + u.title, words: u.words, dlg: u.dlg, read: u.read, gram: u.gram };
  const before = playerLevel().lv;
  import('./lesson.js?v=38').then((m) => m.runCustom({ unit, queue: shuffleArr(q), lang: S.lang, onExit: (r) => {
    if (r && r.done && r.acc >= TOUT_PASS) {
      for (let k = 0; k < LN; k++) { setStars(u.id, k, 2); markDone(u.id, k); }
      addWords(S.lang, u.words.map((w) => w.w)); addXP(20); delete S.tout[u.id]; save(true);
      justBuilt = { unit: u.id, k: LN - 1 };
      sfx('levelup'); setTimeout(() => toast(`Passed with ${Math.round(r.acc * 100)}%! Tap the chest for your wallpaper`), 600);
    } else if (r && r.done) {
      S.tout[u.id] = today(); save(true);
      toast(`You scored ${Math.round(r.acc * 100)}%. You need ${Math.round(TOUT_PASS * 100)}%. Take the lessons, or try again tomorrow.`);
    }
    checkLevel(before); checkBadges(); render();
  } }));
}
// số vé quay còn chờ trong một level (rương chủ đề + rương trùm)
function wallsLeft(L, lang = S.lang) {
  if (!walls.CAT) return 0;
  return L.units.reduce((a, u) => a + walls.ticketsLeftIn(u.id, false), 0) + walls.ticketsLeftIn(`boss|${lang}|${L.id}`, false);
}
const lvRange = (ls) => ls.length === 1 ? ls[0].name : ls.length === 2 ? `${ls[0].name} and ${ls[1].name}` : `${ls[0].name} to ${ls[ls.length - 1].name}`;
function basicsNudge(c, L) {
  const ls = lvsOf(c, L), idx = ls.indexOf(L); if (idx <= 0) return '';
  const lower = ls.slice(0, idx).filter((x) => x.units.some((u) => unitProgress(u.id) < LN)); if (!lower.length) return '';
  let hid = ''; try { hid = localStorage.getItem('dcl_nudge_' + S.lang) || ''; } catch (e) {}
  if (hid && Date.now() - +hid < 3 * 864e5) return '';
  const nW = lower.reduce((a, x) => a + wallsLeft(x), 0), nU = lower.reduce((a, x) => a + x.units.filter((u) => unitProgress(u.id) < LN).length, 0);
  return `<section class="nudge panel" data-lv="${lower[0].id}">
    <div class="ng-cards tks" aria-hidden="true">${[0, 1, 2].map(() => walls.ticketCard({ state: 'locked', need: 2 }, '?')).join('')}</div>
    <div class="ng-t"><b>${esc(lvRange(lower))} still ${nW ? `hold${lower.length === 1 ? 's' : ''} ${nW} spin ticket${nW === 1 ? '' : 's'}` : `ha${lower.length === 1 ? 's' : 've'} ${nU} unit${nU === 1 ? '' : 's'} to finish`}</b>
      <p>Skipped the basics? Go back and finish those units: every finished unit opens a chest and adds VIP points.</p>
      <div class="ng-acts"><button class="btn sm acc ng-go" type="button">${I.bolt} Review ${esc(lower[0].name)}</button><button class="btn sm ghost ng-x" type="button">Not now</button></div></div>
  </section>`;
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
  import('./lesson.js?v=38').then((m) => m.runCustom({ unit, queue: shuffleArr(q), lang: S.lang, onExit: (r) => {
    const key = S.lang + '|' + L.id, st = r && r.done ? walls.bossStarsOf(r.acc) : 0;
    if (st > 0) {
      const first = !S.boss[key]; if (first) { S.boss[key] = today(); addXP(50); }
      if (st > (S.bossStars[key] || 0)) S.bossStars[key] = st;
      save(true);
      const res = walls.claim(`boss|${S.lang}|${L.id}`, st);
      if (res.server) res.server.then((j) => { if (j && j.ok) gacha.setLeft(j.left); });
      if (first || res.tickets) { sfx('levelup'); walls.reveal({ slot: `boss|${S.lang}|${L.id}`, res, title: first ? `${L.name} boss defeated!` : `${L.name} boss: ${Math.round(r.acc * 100)}%`, kicker: `You scored ${Math.round(r.acc * 100)}%`, xp: first ? 50 : 0, onClose: () => { checkLevel(before); checkBadges(); walls.checkVip(); render(); } }); return; }
      toast(`You scored ${Math.round(r.acc * 100)}%. ${st < 3 ? `Score ${st < 2 ? '88' : '95'}% for the next boss ticket.` : 'Boss chest already empty.'}`);
    }
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
const NEW_LV = new Set(['en|b1p', 'en|b2p', 'zh|hsk1', 'zh|hsk2', 'zh|hsk3', 'ielts|b5', 'ielts|b6', 'ielts|b7', 'ielts|b8']);
function levelList(c, L) {
  const lang = S.lang, ls = lvsOf(c, L), all = ls.reduce((a, x) => a + x.units.length, 0), doneU = ls.reduce((a, x) => a + x.units.filter((u) => unitProgress(u.id) === LN).length, 0), tp = topicInfo(c, L);
  return `${topicSwitch(c, L)}
  <div class="lv-list" role="tablist" aria-label="Choose a level">${ls.map((x) => {
    const t = x.units.length * LN, d = x.units.reduce((a, u) => a + unitProgress(u.id), 0), st = x.units.reduce((a, u) => a + unitStars(u.id), 0), pc = Math.round(d / t * 100), beat = S.boss[lang + '|' + x.id];
    const isNew = NEW_LV.has(lang + '|' + x.id) && !d, wl = wallsLeft(x, lang);
    return `<button role="tab" data-lv="${x.id}" aria-selected="${x.id === L.id}" style="--pc:${pc}"><span class="lv-ring"><b>${pc}%</b></span><span class="lv-t"><b>${esc(x.name)}${isNew ? '<em class="lv-new">NEW</em>' : ''}</b><small>${esc(x.short || '')} · ${I.star}${st}${beat ? ' ' + I.crown : ''}</small>${wl ? `<small class="lv-wl" title="Spin tickets still waiting in this level">${I.gift}${wl} ticket${wl === 1 ? '' : 's'} left</small>` : ''}</span></button>`;
  }).join('')}</div>`;
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
    <div class="ms-t"><small>${esc(lvName(L))} · Unit ${ui + 1} · ${esc(cur.u.title)}</small><b>${esc(lessonName(lang, cur.k))}</b>
      <span class="ms-steps">${LESSONS.map((x) => `<i class="${(S.done[cur.u.id] || [])[x.k] ? 'on' : x.k === cur.k ? 'cur' : ''}"></i>`).join('')}</span>
      <em>${left > 1 ? `${left} lessons to the reward chest` : 'Last lesson, then open the chest!'}</em></div>
    <button class="btn acc go" type="button">${I.play}<span>Continue</span></button>
  </section>` : `<section class="mission panel done"><div class="ms-ic">${I.crown}</div><div class="ms-t"><b>All ${esc(L.name)} units done</b><em>Fight the level boss or move on to the next level.</em></div></section>`}
  ${basicsNudge(c, L)}
  <div class="level-intro"><div><h2>${esc(L.title)}</h2><p>${esc(L.desc || '')} <a class="rm-link" href="#/roadmap">See the full roadmap</a></p></div></div>
  <div id="path" class="path"></div>`, asideHTML(c), { left: levelList(c, L) });
  const pEl = app.querySelector('#path');
  const draw = () => {
    const W = Math.min(pEl.clientWidth || 360, 640);
    pEl.innerHTML = pathHTML(c, W);
    pEl.querySelectorAll('.seg.anim').forEach((p) => { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); });
    if (pEl.querySelector('.seg.anim, .node.pop-in')) setTimeout(() => sfx('build'), 300);
    pEl.querySelectorAll('.node').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sfx('tap'); if (b.classList.contains('open') && popClose) popClose(); else openPop(c, b); }));
    pEl.querySelectorAll('.cp').forEach((b) => b.addEventListener('click', () => {
      const uid = b.dataset.u;
      if (b.classList.contains('ready')) openUnitChest(c, uid, b);
      else if (S.chests[uid] && walls.CAT) { sfx('open'); walls.chestInfo(uid, findUnit(c, uid).u.title, () => unitReview(c, uid)); }
      else if (walls.CAT) { sfx('open'); walls.chestPreview(uid, findUnit(c, uid).u.title, unitProgress(uid)); }
      else { sfx('tap'); unitReview(c, uid); }
    }));
    pEl.querySelectorAll('.guide').forEach((b) => b.addEventListener('click', () => { sfx('open'); guidebook(c, b.dataset.u); }));
    pEl.querySelectorAll('.tout').forEach((b) => b.addEventListener('click', () => { sfx('open'); testOut(c, b.dataset.u); }));
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
  { // dải level cuộn ngang (điện thoại): đưa level đang chọn vào giữa
    const ll = app.querySelector('.lv-list'), sel = ll && ll.querySelector('[aria-selected="true"]');
    if (sel && ll.scrollWidth > ll.clientWidth + 4) ll.scrollLeft += sel.getBoundingClientRect().left - ll.getBoundingClientRect().left - (ll.clientWidth - sel.offsetWidth) / 2;
  }
  app.querySelectorAll('.tp-sw button').forEach((b) => b.addEventListener('click', () => { if (b.getAttribute('aria-selected') === 'true') return; sfx('tap'); switchTopic(c, b.dataset.tp); try { sessionStorage.removeItem('dcl_scrolled'); } catch (e) {} home(); }));
  app.querySelectorAll('.lv-list button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); S.level[S.lang] = b.dataset.lv; save(); try { sessionStorage.removeItem('dcl_scrolled'); } catch (e) {} home(); }));
  const go = app.querySelector('.mission .go'); if (go) go.addEventListener('click', () => start(c, cur.u.id, cur.k));
  const ng = app.querySelector('.nudge');
  if (ng) {
    ng.querySelector('.ng-go').addEventListener('click', () => { sfx('tap'); S.level[S.lang] = ng.dataset.lv; save(); try { sessionStorage.removeItem('dcl_scrolled'); } catch (e) {} home(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    ng.querySelector('.ng-x').addEventListener('click', () => { try { localStorage.setItem('dcl_nudge_' + S.lang, String(Date.now())); } catch (e) {} ng.remove(); });
  }
  checkBadges();
}
function start(c, uid, k) {
  pull(); // v23: lấy tiến độ mới nhất từ máy khác trước khi học
  if (!canStart(c, uid, k)) { toast('Lessons open one by one. Finish the glowing lesson first.'); return; }
  unlockAudio();
  const { u } = findUnit(c, uid);
  const before = questDone(), lv0 = playerLevel().lv;
  runLesson({ unit: u, k, lang: S.lang, onExit: (r) => {
    if (r && r.done) { justBuilt = { unit: u.id, k }; if (unitProgress(u.id) === LN && !S.chests[u.id]) setTimeout(() => toast('Unit complete! Tap the chest for your reward'), 900); else if (unitProgress(u.id) === LN && walls.canUpgrade(u.id, walls.chestStars(u.id))) setTimeout(() => toast('More stars! The unit chest refilled with a new wallpaper'), 900); }
    questCheer(before); checkLevel(lv0); checkBadges(); setTimeout(() => walls.checkVip(), 1200);
    const back = sessionStorage.getItem('dcl_back'); sessionStorage.removeItem('dcl_back');
    if (back) { if (location.hash === back) render(); else location.hash = back; }
    else if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; else home();
    setTimeout(() => { const g = document.querySelector('.hud .gem'); if (r && r.done && g) floatText(g, `+${r.xp} XP`); }, 400);
  } });
}
const questDone = () => quests().filter((q) => q.v >= q.n).length;
function questCheer() { /* v25: bỏ Daily quests */ }

/* ---------- lộ trình chi tiết ---------- */
let scrollToUnit = null;
async function roadmap() {
  const c = await course(S.lang), lang = S.lang, curL = curLevel(c), lvs = lvsOf(c, curL), tp = topicInfo(c, curL);
  const totalU = lvs.reduce((a, L) => a + L.units.length, 0), totalW = lvs.reduce((a, L) => a + L.units.reduce((b, u) => b + u.words.length, 0), 0);
  const title = lang === 'zh' ? 'Chinese roadmap' : lang === 'ielts' ? 'IELTS roadmap' : tp ? `English roadmap · ${tp.name}` : 'English roadmap';
  shell('#/roadmap', `<div class="page-h"><h1>${title}</h1><p>${lvs.length} levels · ${totalU} units · ${totalU * LN} lessons · ${totalW} words. Each unit has 8 lessons${lang === 'ielts' ? ': 2 academic vocabulary lessons, Speaking Part 1, Parts 2–3, Reading, grammar, Writing and a unit test.' : ': 2 vocabulary, 2 dialogues, reading, 2 grammar and a unit test.'}</p></div>
  ${c.plan ? `<section class="panel rm-plan"><h3>${I.chart} ${esc(c.plan.title)}</h3>${c.plan.paras.map((p) => `<p>${esc(p)}</p>`).join('')}${c.plan.weeks ? `<ol class="rm-weeks">${c.plan.weeks.map((w) => `<li><b>${esc(w[0])}</b><span>${esc(w[1])}</span></li>`).join('')}</ol>` : ''}</section>` : ''}
  ${topicSwitch(c, curL, 'rm-tp')}
  <div class="rm">${lvs.map((L, li) => {
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
  app.querySelectorAll('.tp-sw button').forEach((b) => b.addEventListener('click', () => { if (b.getAttribute('aria-selected') === 'true') return; sfx('tap'); switchTopic(c, b.dataset.tp); roadmap(); }));
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
  sheet(`<h2>Reading library</h2><p class="sub">Read and listen again to every reading, by level.</p><div class="list">${rows.map(({ L, u }) => `<button class="row" data-u="${u.id}" style="text-align:left;width:100%"><span class="grow"><b>${esc(u.read.title)}</b><small>${esc(lvName(L))} · ${esc(u.title)}</small></span>${unitProgress(u.id) ? I.check.replace('<svg', '<svg style="width:20px;color:var(--acc)"') : ''}</button>`).join('')}</div>`,
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
  shell('#/me', `<div class="page-h"><div class="me-head">${acct ? `<button class="av-pick" type="button" title="Change avatar">${meAv(64)}<span class="av-edit">${I.edit}</span></button>` : lvRing(64)}<div><h1>${acct ? esc(acct.name) : 'My profile'}</h1><p class="sync">Level ${p.lv} · ${syncText()}</p></div></div>
    <div class="acts">${acct ? `<a class="btn sm ghost" href="#/bestie">${I.heart} Bestie</a>` : ''}<a class="btn sm ghost" href="#/friends">${I.users} Friends${social.counts.requests ? ` <i class="tag-s acc">${social.counts.requests}</i>` : ''}</a><a class="btn sm ghost" href="#/classes">${I.school} Classes</a><a class="btn sm ghost" href="#/roadmap">${I.list} Roadmap</a><a class="btn sm ghost" href="#/review">${I.cards} Review</a></div></div>
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
    ${meCollection()}
    <div class="row"><span class="grow"><b>Daily goal</b><small>XP needed to keep your streak</small></span><select class="input goal" style="width:auto;height:42px">${[10, 20, 30, 50].map((g) => `<option value="${g}" ${S.goal === g ? 'selected' : ''}>${g} XP</option>`).join('')}</select></div>
    <label class="row"><span class="grow"><b>Sound effects</b><small>Correct, wrong, combos, chests</small></span><span class="switch"><input type="checkbox" class="snd" ${S.settings.sound ? 'checked' : ''}><span></span></span></label>
    <div class="row"><span class="grow"><b>Voice speed</b><small>Model audio</small></span><select class="input rate" style="width:auto;height:42px">${[[0.8, 'Slow'], [0.95, 'Normal'], [1.1, 'Fast']].map(([v, l]) => `<option value="${v}" ${S.settings.rate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${voicesEn.length ? `<div class="row"><span class="grow"><b>English voice</b></span><select class="input vEn" style="width:auto;max-width:55%;height:42px"><option value="">Automatic</option>${voicesEn.map((v) => `<option ${S.settings.voice.en === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : ''}
    ${voicesZh.length ? `<div class="row"><span class="grow"><b>Chinese voice</b></span><select class="input vZh" style="width:auto;max-width:55%;height:42px"><option value="">Automatic</option>${voicesZh.map((v) => `<option ${S.settings.voice.zh === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : `<div class="row"><span class="grow"><b>Chinese voice</b><small>No Chinese voice on this device. On Windows: Settings › Time & language › Speech, add Chinese (Simplified).</small></span></div>`}
    <div class="row"><span class="grow"><b>Microphone & speech</b><small class="micst">Test your mic before studying</small></span><button class="btn ghost mtest" type="button" style="min-height:42px">${I.mic} Test</button></div>
    <label class="row"><span class="grow"><b>Show pinyin</b><small>Romanisation under Chinese characters</small></span><span class="switch"><input type="checkbox" class="pyx" ${S.settings.pinyin ? 'checked' : ''}><span></span></span></label>
    <label class="row"><span class="grow"><b>Light mode</b><small>Bright glass over the forest. Dark mode is easier at night</small></span><span class="switch"><input type="checkbox" class="thm" ${theme() === 'light' ? 'checked' : ''}><span></span></span></label>
    <div class="row"><span class="grow"><b>Background</b><small>${esc(walls.wallOf(S.bg || 71).name)} · use any wallpaper you collected</small></span><button class="btn ghost bgpick" type="button" style="min-height:42px">${I.gallery} Choose</button></div>
    <label class="row"><span class="grow"><b>Moving background</b><small>The forest video. Turn off to save battery or data</small></span><span class="switch"><input type="checkbox" class="vid" ${vidOn ? 'checked' : ''}><span></span></span></label>
    <div class="row"><span class="grow"><b>Background brightness</b><small>Darker makes text easier to read</small></span><select class="input dim" style="width:auto;height:42px">${[['0', 'Bright'], ['1', 'Dim'], ['2', 'Dark']].map(([v, l]) => `<option value="${v}" ${dim === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  </div>
  <div class="list">
    ${acct ? `${acctui.accountPanelHTML()}<div class="foot-row"><button class="btn ghost syncnow">${I.cloud} Save now</button><button class="btn ghost out">${I.logout} Sign out</button></div>`
      : `<div class="panel pad"><h3>Save your progress</h3><p class="muted" style="margin:6px 0 12px">A name, your phone number and a 4–6 digit PIN. Sign in on any device with your name or phone number.</p><button class="btn acc wide mk">Create account</button><button class="btn ghost wide lg" style="margin-top:10px">I already have an account</button></div>`}
    ${badgesHTML(true)}
    <div class="panel pad"><h3>About</h3><p class="muted" style="font-size:.9rem;margin-top:6px">English A1–C1, Chinese HSK1–HSK6 and an IELTS path by band. 8 lessons per unit. Voices and speech scoring use your browser's built-in features; character writing uses the open-source Hanzi Writer library. Content written by desktopchill and not yet reviewed by native speakers.</p><button class="btn ghost wide wipe" style="margin-top:12px">Erase progress on this device</button></div>
  </div></div>`, null);
  const q = (s) => app.querySelector(s);
  q('.goal').addEventListener('change', (e) => { S.goal = +e.target.value; save(); toast('Goal updated'); });
  q('.snd').addEventListener('change', (e) => { S.settings.sound = e.target.checked; save(); applySettings(); sfx('ok'); });
  q('.rate').addEventListener('change', (e) => { S.settings.rate = +e.target.value; save(); applySettings(); speak(S.lang === 'zh' ? '你好，我们开始吧。' : "Hello, let's get started.", S.lang); });
  const ve = q('.vEn'); if (ve) ve.addEventListener('change', (e) => { S.settings.voice.en = e.target.value; save(); applySettings(); speak('This is my voice.', 'en'); });
  const vz = q('.vZh'); if (vz) vz.addEventListener('change', (e) => { S.settings.voice.zh = e.target.value; save(); applySettings(); speak('这是我的声音。', 'zh'); });
  watchMic((st) => { const el = q('.micst'); if (!el) return; if (st === 'policy') el.innerHTML = '<span style="color:var(--warn);font-weight:700">Speaking practice is paused on this website.</span> Lessons swap speaking for listening until it is back.'; else if (st === 'denied') el.innerHTML = '<span style="color:var(--bad);font-weight:700">Chrome is blocking the mic for this site.</span> <a href="#" class="mhelp">How to fix</a>'; else if (st === 'granted') el.textContent = 'Microphone allowed'; else el.textContent = 'Test your mic before studying'; const h = el.querySelector('.mhelp'); if (h) h.addEventListener('click', (e) => { e.preventDefault(); micHelpSheet(); }); });
  q('.mtest').addEventListener('click', micTest);
  q('.pyx').addEventListener('change', (e) => { S.settings.pinyin = e.target.checked; save(); });
  q('.vid').addEventListener('change', (e) => setVideo(e.target.checked));
  q('.thm').addEventListener('change', (e) => setTheme(e.target.checked ? 'light' : 'dark'));
  q('.bgpick').addEventListener('click', bgSheet);
  app.querySelectorAll('.mc-grid').forEach((g) => walls.wireCards(g, (id) => { sfx('open'); walls.wallSheet(id); }));
  q('.dim').addEventListener('change', (e) => { const v = e.target.value; if (v === '0') delete document.documentElement.dataset.dim; else document.documentElement.dataset.dim = v; try { localStorage.setItem('dcl_dim', v === '0' ? '' : v); } catch (er) {} });
  const ap = q('.av-pick'); if (ap) ap.addEventListener('click', avatarSheet);
  if (acct) acctui.wireAccountPanel(app, () => me());
  q('.wipe').addEventListener('click', () => { if (confirm('Erase all progress on this device?' + (acct ? ' Your online account stays as it is.' : ''))) { logout(); reset(); location.hash = '#/'; render(); } });
  if (acct) {
    q('.syncnow').addEventListener('click', async () => { await push(); toast(sync.state === 'ok' ? 'Saved to your account' : 'Could not save. Check your connection.'); me(); });
    q('.out').addEventListener('click', () => { if (confirm('Sign out? Your progress stays on this device.')) { logout(); hub.start(); me(); } });
  } else {
    q('.mk').addEventListener('click', () => authSheet('new'));
    q('.lg').addEventListener('click', () => authSheet('login'));
  }
}
function avatarSheet() {
  sheet(`<h2>Change your avatar</h2><p class="sub">Shown to friends, classmates, duel opponents and in live quizzes.</p>
    <div class="av-up"><span class="av-prev">${avatar(acct.name, acct.avatar, 'lg')}</span><div><button class="btn acc up-btn" type="button">${I.upload} Upload a picture</button><small class="muted">JPG, PNG or WebP. It is cropped to a square and shrunk to 128 px.</small></div><input type="file" accept="image/png,image/jpeg,image/webp" hidden></div>
    <h3 class="gh">Or pick one</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:8px">${['', ...AVATARS].map((a) => `<button class="chip" type="button" data-a="${esc(a)}" style="height:54px;justify-content:center;font-size:${a ? '1.6rem' : '.8rem'}" aria-pressed="${(acct.avatar || '') === a}">${a ? esc(a) : esc(initials(acct.name))}</button>`).join('')}</div>`, (el, close) => {
    const set = async (a) => { try { const j = await setAvatar(a); if (j && j.ok === false) throw new Error('That picture could not be used. Try a smaller one.'); sfx('ok'); toast('Avatar updated'); hub.loadFriends(); } catch (e) { toast(e.message); } close(); me(); };
    el.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => { sfx('tap'); set(b.dataset.a); }));
    const inp = el.querySelector('input[type=file]');
    el.querySelector('.up-btn').addEventListener('click', () => inp.click());
    inp.addEventListener('change', async () => {
      const f = inp.files && inp.files[0]; if (!f) return;
      if (f.size > 15 * 1024 * 1024) { toast('That file is too big (max 15 MB).'); return; }
      try { const url = await squareImage(f, 128); el.querySelector('.av-prev').innerHTML = avatar(acct.name, url, 'lg'); set(url); } catch (e) { toast('Could not read that picture.'); }
    });
  });
}
// cắt ảnh vuông ở giữa, thu nhỏ, nén JPEG (dưới 60 KB để lưu trên máy chủ)
function squareImage(file, size) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
      g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let q = 0.86, out = cv.toDataURL('image/jpeg', q);
      while (out.length > 58000 && q > 0.4) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
      res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}
// thành tích (huy hiệu) — dùng ở trang Me và tab Badges của Collection
function badgesHTML(compact = false) {
  return `<div class="panel bwall ${compact ? 'compact' : ''}"><h3>${I.medal} Achievements <em>${Object.keys(S.badges).length}/${BADGES.length}</em></h3><div class="bw">${BADGES.map(([id, t, d, ic]) => `<div class="bw-i ${S.badges[id] ? 'on' : ''}"><span class="bdg ${S.badges[id] ? 'on' : ''}">${I[ic]}</span><b>${esc(t)}</b><small>${S.badges[id] ? 'Earned ' + esc(S.badges[id]) : esc(d)}</small></div>`).join('')}</div></div>`;
}
function meCollection() {
  if (!walls.CAT) return '';
  const n = walls.ownedCount();
  return `<div class="panel me-col"><h3>${I.gallery} Wallpaper collection <em>${n}/${walls.CAT.walls.length}</em></h3>
    <div class="mc-grid">${walls.CAT.walls.map((w) => walls.card(w.id, { cls: 'tiny', hideName: true })).join('')}</div>
    <div class="foot-row" style="margin-top:12px"><a class="btn ghost" href="#/collection">${I.gallery} Open collection</a><button class="btn ghost" type="button" onclick="location.hash='#/collection/badges'">${I.medal} Achievements</button></div></div>`;
}
function bgSheet() {
  const mine = Object.keys(S.walls).map(Number), shared = [...walls.bestieWalls].filter((w) => !S.walls[w]);
  sheet(`<h2>Page background</h2><p class="sub">Play any wallpaper you collected behind the lessons. ${mine.length ? '' : 'Spin a ticket to get your first one.'}</p>
    <div class="wgrid sm bgs">${mine.map((w) => walls.card(w, { cls: walls.isBg(w) ? 'picked' : '' })).join('')}</div>
    ${shared.length ? `<h3 class="gh">${I.heart} Shared by your Bestie <em>${shared.length}</em></h3><div class="wgrid sm bgs">${shared.map((w) => walls.card(w, { state: 'got', cls: walls.isBg(w) ? 'picked' : '', tag: 'Bestie' })).join('')}</div>` : ''}`, (el, close) => {
    el.querySelectorAll('.bgs').forEach((g) => walls.wireCards(g, (id) => { walls.setBg(id); sfx('ok'); close(); toast('Background changed'); if (location.hash.startsWith('#/me')) me(); }));
  }, 'wide');
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
    <div class="field"><label for="an">${mode === 'new' ? 'Your name' : 'Account name or phone number'}</label><input class="input" id="an" autocomplete="username" maxlength="${mode === 'new' ? 24 : 120}" placeholder="${mode === 'new' ? 'e.g. tuan.nguyen' : 'tuan.nguyen or 0912 345 678'}" required /><small class="nchk" aria-live="polite"></small></div>
    ${mode === 'new' ? acctui.contactFields() : ''}
    <div class="field"><label for="ap">PIN (4–6 digits)</label><input class="input pin" id="ap" type="password" inputmode="numeric" autocomplete="${mode === 'new' ? 'new-password' : 'current-password'}" maxlength="6" placeholder="••••" required />${mode === 'login' ? '<button class="linkb fgt" type="button">Forgot your PIN?</button>' : ''}</div>
    <label class="remember"><input type="checkbox" class="rem" checked><span>Remember me on this device</span></label>
    <p class="err" role="alert"></p>
    <button class="btn acc wide sub" type="submit">${mode === 'new' ? 'Create account' : 'Sign in'}</button>
    <p class="muted" style="font-size:.84rem;margin-top:10px">${mode === 'new' ? 'Sign in later with your account name or phone number and your PIN. The PIN is only used for this learning site.' : 'Your saved progress will be loaded onto this device.'}</p>
  </form>`;
}
function wireAuth(el, mode, done) {
  el.querySelectorAll('.tabs2 button').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.m; el.querySelector('.authwrap').innerHTML = authForm(m); wireAuth(el, m, done); }));
  const f = el.querySelector('.authf'), err = el.querySelector('.err'), sub = el.querySelector('.sub');
  el.querySelector('#ap').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  if (mode === 'new') acctui.wireContact(el);
  const fg = el.querySelector('.fgt'); if (fg) fg.addEventListener('click', () => acctui.forgotSheet(el.querySelector('#an').value.trim()));
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
    if (mode === 'new' && (!validName(n) || /^[\d ._-]+$/.test(n.trim()))) { err.textContent = 'Name must be 3–24 characters with at least one letter: letters, numbers, dots or dashes.'; return; }
    if (mode === 'login' && n.trim().length < 3) { err.textContent = 'Enter your account name or phone number.'; return; }
    const ct = mode === 'new' ? acctui.readContact(el) : {};
    if (ct.err) { err.textContent = ct.err; return; }
    if (!validPin(p)) { err.textContent = 'PIN must be 4 to 6 digits.'; return; }
    if (mode === 'new' && taken) { err.textContent = 'This account name already exists. Choose another name or sign in.'; nIn.focus(); return; }
    sub.disabled = true; sub.textContent = 'Working…';
    const rem = el.querySelector('.rem') ? el.querySelector('.rem').checked : true;
    try { if (mode === 'new') await register(n, p, rem, ct.email, ct.phone); else await login(n, p, rem); sfx('ok'); hub.start(); walls.syncWalls().then(() => walls.checkVip()); done(mode); }
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
  let mode = 'new';
  const draw = () => {
    const c = all[lang];
    document.documentElement.dataset.lang = lang;
    const total = avail.reduce((a, k) => a + all[k].levels.reduce((b, L) => b + L.units.length, 0), 0);
    // v24: một màn hình gọn, không phải cuộn: tạo tài khoản / đăng nhập ngay trên trang đầu
    app.innerHTML = `<div class="welcome w2">
    <div class="w-hero">
      <span class="w-logo">${LOGO}<span>desktop<b>chill</b> learn</span></span>
      <h1>Learn a language the way you <em>walk in a forest</em>.</h1>
      <p class="lead">English, 中文 and IELTS on one journey map: five-minute lessons, speaking practice, live quizzes and Bestie adventures.</p>
      <div class="w-stats"><span><b>${total}</b><small>units</small></span><span><b>${total * LN}</b><small>lessons</small></span><span><b>${BADGES.length}</b><small>badges</small></span></div>
      <form class="w-join" novalidate><span class="muted" style="font-weight:600">Game PIN?</span><input class="input wpin" inputmode="numeric" maxlength="6" placeholder="PIN" aria-label="Game PIN" /><button class="btn sm acc" type="submit">${I.zap} Join</button></form>
    </div>
    <div class="w-card w-auth panel" data-lang="${lang}">
      <div class="w-course"><div class="pick sm" role="group" aria-label="Choose a course">${avail.map((k) => `<button data-l="${k}" aria-pressed="${lang === k}" type="button"><span class="${k === 'zh' ? 'zh' : ''}">${esc(COURSES[k].name)}</span></button>`).join('')}</div>
        <label class="w-lvl"><span>Start at</span><select class="input w-lv">${lvSelect(c, lv[lang])}</select></label></div>
      <div class="authwrap compact">${authForm(mode)}</div>
      <div class="w-foot"><button class="linkb w-later" type="button">Try it first without an account</button><button class="linkb w-pin" type="button">${I.zap} Join a game</button></div>
    </div></div>`;
    const setCourse = () => { S.lang = lang; S.level = { ...S.level, ...lv }; save(); };
    setCourse();
    app.querySelectorAll('.pick button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); lang = b.dataset.l; draw(); }));
    app.querySelector('.w-lv').addEventListener('change', (e) => { lv[lang] = e.target.value; setCourse(); sfx('tap'); });
    const finish = (keep) => { if (!keep) setCourse(); S.onboarded = true; save(true); applySettings(); location.hash = '#/'; render(); };
    const card = app.querySelector('.w-auth');
    wireAuth(card, mode, (m) => { toast(m === 'new' ? 'Account created, progress saved' : 'Signed in'); unlockAudio(); finish(m !== 'new'); });
    card.addEventListener('click', (e) => { const t = e.target.closest('.tabs2 button'); if (t) { mode = t.dataset.m; card.classList.toggle('is-login', mode === 'login'); } });
    card.classList.toggle('is-login', mode === 'login');
    app.querySelector('.w-later').addEventListener('click', () => { unlockAudio(); sfx('ok'); finish(false); });
    app.querySelector('.w-pin').addEventListener('click', () => sheet(`<h2>Join a live game</h2><p class="sub">Enter the 6-digit PIN on the host’s screen.</p><form class="w-join2" novalidate><input class="input wpin2" inputmode="numeric" maxlength="6" placeholder="PIN" aria-label="Game PIN" style="text-align:center;letter-spacing:.3em;font-weight:800;height:52px;font-size:1.2rem" /><button class="btn acc wide" type="submit" style="margin-top:12px">Join game</button></form>`, (el, close) => { const i = el.querySelector('.wpin2'); setTimeout(() => i.focus(), 100); el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const v = i.value.replace(/\D/g, ''); if (v.length === 6) { close(); location.hash = '#/play/' + v; } else toast('Enter the 6-digit game PIN'); }); }));
    app.querySelector('.w-join').addEventListener('submit', (e) => { e.preventDefault(); const v = app.querySelector('.wpin').value.replace(/\D/g, ''); if (v.length === 6) location.hash = '#/play/' + v; else toast('Enter the 6-digit game PIN'); });
  };
  draw();
}

/* ---------- chạy hàng đợi luyện tập ---------- */
function runQueue(unit, queue, lang) {
  pull();
  const before = questDone(), lv0 = playerLevel().lv;
  import('./lesson.js?v=38').then((m) => m.runCustom({ unit, queue, lang, onExit: () => { questCheer(before); checkLevel(lv0); checkBadges(); render(); } }));
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
    else if (r.startsWith('#/collection')) await walls.collectionPage(r.split('/').slice(2));
    else if (r.startsWith('#/duel')) await duel.duelPage(r.split('/').slice(2));
    else if (r.startsWith('#/adventure')) await adv.page(r.split('/').slice(2));
    else if (r.startsWith('#/bestie')) { await social.friendsPage(['bestie']); }
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
  hub.applyChrome();
  guide.maybeStart();
  if (!document.body.classList.contains('booted')) setTimeout(() => document.body.classList.add('booted'), 700);
}
lvBefore = playerLevel().lv;
// đi tới một chủ đề / level (từ bộ sưu tập)
async function goTo(lang, lv, uid) {
  try { await course(lang); } catch (e) { return; }
  document.getElementById('sheet-root').innerHTML = '';
  S.lang = lang; if (lv) S.level[lang] = lv; save(); applySettings();
  scrollToUnit = uid || null; try { sessionStorage.setItem('dcl_scrolled', (lv || '') + lang); } catch (e) {}
  if (location.hash === '#/' || location.hash === '') render(); else location.hash = '#/';
}
const ctx = { groups: { sheet: social.groupSheet, quiz: social.quickQuiz }, shell, render, authSheet, course, findUnit, curLevel, startLesson: (c, uid, k) => start(c, uid, k), COURSES, AVAIL, LN, lessonName, asideHTML, lvRing, goTo, badgesHTML, applyBg: setBg,
  spin: (o) => gacha.spin(o), setTickets: (n) => gacha.setLeft(n), tickets: () => gacha.G.left, tick: (q) => hub.tick(q), openDM: (f) => chat.openDM(f),
  friends: () => ((hub.hub.friends && hub.hub.friends.items) || []), loadFriends: () => hub.loadFriends(), autoJoin: (g) => social.autoJoin(g), advInvite: (a) => adv.invite(a),
  startTour: (k, force) => guide.startTour(k, force), giftTour: (gf) => guide.giftTour(gf), showRank: (b) => hub.showRank(b), gachaPanel: () => gacha.panelHTML(), wireGacha: (r) => gacha.wirePanel(r), gachaLoad: () => gacha.load(true) };
social.init(ctx); walls.init(ctx); hub.init(ctx); duel.init(ctx); gacha.init(ctx); bestie.init(ctx); ctxm.init(ctx); adv.init(ctx); guide.init(ctx);
const boot = walls.loadCat().catch(() => {});
window.addEventListener('hashchange', render);
onSync(() => { const el = document.querySelector('.sync'); if (el) el.textContent = `Level ${playerLevel().lv} · ${syncText()}`; });
document.addEventListener('pointerdown', unlockAudio, { once: true });
// v23: dữ liệu học từ máy khác vừa được gộp vào → vẽ lại trang (trừ khi đang học / chơi / mở bảng)
onPulled(() => {
  applySettings();
  if (document.querySelector('.player, .qz-stage, .du-stage, .adv-stage, .ovl, .sheet, .gs') || document.body.classList.contains('quizzing')) return;
  render();
});
if (acct) pull(true);
boot.then(() => {
  render();
  setTimeout(() => { const r = location.hash || '#/'; if (!r.startsWith('#/play') && !r.startsWith('#/host')) hub.whatsNew(); }, 1400);
  const sig = () => JSON.stringify(S.wclaims) + walls.ownedCount(), s0 = sig();
  if (acct) walls.syncWalls().then(() => { walls.checkVip(); if (sig() !== s0 && (location.hash || '#/') === '#/' && !document.querySelector('.ovl, .player, .sheet')) home(); }); else setTimeout(() => walls.checkVip(), 800);
});
