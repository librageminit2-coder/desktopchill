import { I, LOGO } from './icons.js';
import { sound, sfx, unlockAudio } from './sound.js';
import { tts, speak, listVoices, canListen, canSpeak } from './speech.js';
import { S, save, streakNow, todayXP, unitProgress, due, grade, addXP, today, reset } from './store.js';
import { acct, sync, onSync, register, login, logout, validName, validPin, push } from './account.js';
import { runLesson, LESSONS } from './lesson.js';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = (s) => (s || '').replace(/\s+/g, '');
const COURSE = {}, WORDS = {};
let justBuilt = null;

/* ---------- dữ liệu khoá học ---------- */
async function course(lang) {
  if (COURSE[lang]) return COURSE[lang];
  const r = await fetch(`data/${lang}.json?v=1`); const c = await r.json();
  c.levels.forEach((L) => L.units.forEach((u) => { u.level = L.id; u.words.forEach((w) => { WORDS[lang + '|' + w.w] = { ...w, unit: u.id }; }); }));
  COURSE[lang] = c; return c;
}
const findUnit = (c, id) => { for (const L of c.levels) for (const u of L.units) if (u.id === id) return { L, u }; return null; };

/* ---------- tiện ích giao diện ---------- */
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2400); }
function applySettings() {
  sound.on = S.settings.sound; tts.rate = S.settings.rate; tts.pref = S.settings.voice || { en: '', zh: '' };
  document.documentElement.dataset.lang = S.lang;
}
function sheet(html, onMount) {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-bg"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onEsc); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  root.querySelector('.sheet-bg').addEventListener('click', close);
  if (onMount) onMount(root.querySelector('.sheet'), close);
  return close;
}
const NAV = [['#/', 'Học', 'home'], ['#/review', 'Ôn tập', 'cards'], ['#/practice', 'Luyện', 'target'], ['#/me', 'Tôi', 'user']];
function shell(route, inner) {
  const dueN = due(S.lang).length;
  app.innerHTML = `
  <header class="top">
    <a class="brand" href="#/" aria-label="Trang học">${LOGO}<span>learn<br><small>desktopchill</small></span></a>
    <span class="pill streak" title="Chuỗi ngày học">${I.flame}${streakNow()}</span>
    <span class="pill xp" title="Tổng XP">${I.bolt}${S.xp}</span>
    <div class="langsw" role="group" aria-label="Ngôn ngữ đang học"><button data-l="en" aria-pressed="${S.lang === 'en'}">EN</button><button data-l="zh" aria-pressed="${S.lang === 'zh'}">中文</button></div>
  </header>
  <nav class="nav">${NAV.map(([href, label, ic]) => `<a href="${href}" ${route === href ? 'aria-current="page"' : ''}>${I[ic]}<span>${label}</span>${href === '#/review' && dueN ? `<i class="badge">${dueN > 99 ? '99+' : dueN}</i>` : ''}</a>`).join('')}</nav>
  <main class="main">${inner}</main>`;
  app.querySelectorAll('.langsw button').forEach((b) => b.addEventListener('click', () => { if (S.lang === b.dataset.l) return; sfx('tap'); S.lang = b.dataset.l; save(); applySettings(); render(); }));
  app.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', () => sfx('tap')));
}

/* ---------- giàn kèo cho một level ---------- */
function trussHTML(L, lang, W) {
  const n = L.units.length, narrow = W < 640, ph = narrow ? 118 : 132, tw = narrow ? 64 : 84;
  const cx = narrow ? 18 + tw / 2 : W / 2, xl = cx - tw / 2, xr = cx + tw / 2, top = 26, H = top + n * ph + 26;
  const cur = currentUnit(L);
  let m = '', j = '', cards = '';
  L.units.forEach((u, i) => {
    const y0 = top + i * ph, y1 = y0 + ph, d = S.done[u.id] || [];
    const diag = i % 2 ? `M${xl} ${y0} L${xr} ${y1}` : `M${xr} ${y0} L${xl} ${y1}`;
    const mem = [`M${xl} ${y0} L${xl} ${y1}`, `M${xr} ${y0} L${xr} ${y1}`, diag, `M${xl} ${y1} L${xr} ${y1}`];
    mem.forEach((p, k) => {
      const anim = justBuilt && justBuilt.unit === u.id && justBuilt.k === k;
      m += `<path class="m ${d[k] ? 'built' : ''} ${anim ? 'anim' : ''}" d="${p}" data-u="${u.id}" data-k="${k}"/>`;
    });
    const p = unitProgress(u.id), right = narrow || i % 2 === 0, yc = y0 + ph / 2;
    const style = narrow ? `left:${xr + 16}px;width:calc(100% - ${xr + 16}px);top:${yc}px` : right ? `left:${xr + 22}px;top:${yc}px` : `right:${W - xl + 22}px;top:${yc}px`;
    cards += `<button class="unit-btn ${p === 4 ? 'done' : ''} ${cur === u ? 'cur' : ''}" data-u="${u.id}" style="${style}">
      <span class="no">${p === 4 ? I.check.replace('<svg', '<svg style="width:22px;height:22px"') : i + 1}</span>
      <span><b class="${lang === 'zh' ? '' : ''}">${esc(u.title)}</b><small>${esc(u.sub || '')}</small><span class="pips">${[0, 1, 2, 3].map((k) => `<i class="${d[k] ? 'on' : ''}"></i>`).join('')}</span></span></button>`;
  });
  // nút giàn
  for (let i = 0; i <= n; i++) {
    const y = top + i * ph, built = i === 0 ? unitProgress(L.units[0].id) > 0 : unitProgress(L.units[i - 1].id) === 4;
    j += `<circle class="jt ${built ? 'built' : ''}" cx="${xl}" cy="${y}" r="7"/><circle class="jt ${built ? 'built' : ''}" cx="${xr}" cy="${y}" r="7"/>`;
  }
  // gối đỡ dưới cùng
  const base = `<path d="M${xl - 18} ${H - 14} L${xl} ${H - 26} L${xl + 18} ${H - 14} Z M${xr - 18} ${H - 14} L${xr} ${H - 26} L${xr + 18} ${H - 14} Z" fill="none" stroke="var(--graphite)" stroke-width="2"/><path d="M${xl - 26} ${H - 10} H${xr + 26}" stroke="var(--graphite)" stroke-width="2" stroke-dasharray="4 4"/>`;
  return `<div class="truss-wrap" style="height:${H}px"><svg class="truss" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">${m}${j}${base}</svg>${cards}</div>`;
}
function currentUnit(L) { return L.units.find((u) => unitProgress(u.id) < 4) || null; }
function nextLesson(c) {
  const L = c.levels.find((x) => x.id === S.level[S.lang]) || c.levels[0];
  const u = currentUnit(L); if (!u) return { L, u: null, k: 0 };
  const d = S.done[u.id] || []; let k = [0, 1, 2, 3].find((i) => !d[i]); if (k === undefined) k = 0;
  return { L, u, k };
}

/* ---------- trang chủ ---------- */
async function home() {
  const c = await course(S.lang);
  const L = c.levels.find((x) => x.id === S.level[S.lang]) || c.levels[0];
  const nx = nextLesson(c), goal = S.goal, tx = todayXP(), circ = 2 * Math.PI * 32, frac = Math.min(1, tx / goal);
  const name = acct ? acct.name : '';
  const hour = new Date().getHours(), hi = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const dueN = due(S.lang).length;
  const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 86400000); return { k: today(d), lab: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()] }; });
  const maxD = Math.max(goal, ...days.map((d) => S.days[d.k] || 0));
  shell('#/', `
  <section class="hello">
    <div><h1>${hi}${name ? ', ' + esc(name) : ''}</h1><p>${tx >= goal ? 'Đã đạt mục tiêu hôm nay. Học thêm một bài nữa không?' : `Còn ${goal - tx} XP nữa là đủ mục tiêu hôm nay.`}</p></div>
    <div class="ring" title="Mục tiêu hôm nay"><svg viewBox="0 0 78 78"><circle class="bgc" cx="39" cy="39" r="32" fill="none" stroke-width="8"/><circle class="fgc" cx="39" cy="39" r="32" fill="none" stroke-width="8" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"/></svg><b>${tx}<small>/ ${goal} XP</small></b></div>
  </section>
  <div class="home-grid">
    <div>
      <div class="card next">
        ${nx.u ? `<span class="k">${esc(L.name)} · Chủ đề ${L.units.indexOf(nx.u) + 1} · ${LESSONS[nx.k].name}</span><h2>${esc(nx.u.title)}</h2><p>${esc(nx.u.goal || '')}</p><button class="btn acc wide go-next" type="button">${I.play} ${unitProgress(nx.u.id) || Object.keys(S.done).length ? 'Học tiếp' : 'Bắt đầu bài đầu tiên'}</button>`
          : `<span class="k">${esc(L.name)}</span><h2>Bạn đã dựng xong cả giàn ${esc(L.name)}</h2><p>Chuyển sang level kế tiếp hoặc ôn lại các bài đã học.</p>`}
      </div>
      <div class="levels" role="group" aria-label="Chọn level">${c.levels.map((x) => { const tot = x.units.length * 4, dn = x.units.reduce((a, u) => a + unitProgress(u.id), 0); return `<button data-lv="${x.id}" aria-pressed="${x.id === L.id}">${esc(x.name)}<span>${esc(x.short || '')}</span><span class="bar"><i style="width:${Math.round(dn / tot * 100)}%"></i></span></button>`; }).join('')}</div>
      <div class="level-head"><h2>${esc(L.title)}</h2><p>${esc(L.desc || '')}</p></div>
      <div id="truss"></div>
    </div>
    <aside class="side">
      <div class="card"><h3>7 ngày qua</h3><div class="week">${days.map((d) => { const v = S.days[d.k] || 0; return `<div class="${d.k === today() ? 'today' : ''}"><i class="${v >= goal ? 'on' : ''}" style="height:${Math.max(4, Math.round(v / maxD * 70))}px" title="${v} XP"></i>${d.lab}</div>`; }).join('')}</div></div>
      <a class="card" href="#/review" style="display:block;text-decoration:none"><h3>Thẻ ôn tập</h3><p class="muted">${dueN ? `${dueN} từ đến lượt ôn. Ôn ngay để nhớ lâu hơn.` : S.words ? 'Chưa có từ nào đến hạn ôn. Học thêm bài mới nhé.' : 'Học xong bài Từ vựng, từ mới sẽ vào đây.'}</p></a>
      ${!acct ? `<a class="card" href="#/me" style="display:block;text-decoration:none"><h3>Lưu tiến trình</h3><p class="muted">Tạo tài khoản bằng tên và mã PIN để học tiếp trên máy khác.</p></a>` : ''}
    </aside>
  </div>`);
  requestAnimationFrame(() => { const f = app.querySelector('.fgc'); if (f) f.style.strokeDashoffset = circ * (1 - frac); });
  const tEl = app.querySelector('#truss');
  const draw = () => {
    tEl.innerHTML = trussHTML(L, S.lang, tEl.clientWidth || 360);
    tEl.querySelectorAll('.m.anim').forEach((p) => { p.style.setProperty('--len', p.getTotalLength()); setTimeout(() => sfx('build'), 250); });
    tEl.querySelectorAll('.unit-btn').forEach((b) => b.addEventListener('click', () => { sfx('tap'); openUnit(c, b.dataset.u); }));
    justBuilt = null;
  };
  draw();
  let rt; window.onresize = () => { clearTimeout(rt); rt = setTimeout(() => { if (location.hash === '' || location.hash === '#/') { justBuilt = null; draw(); } }, 150); };
  const cur = tEl.querySelector('.unit-btn.cur'); if (cur && sessionStorage.getItem('dcl_scrolled') !== L.id) { cur.scrollIntoView({ block: 'center' }); try { sessionStorage.setItem('dcl_scrolled', L.id); } catch (e) {} }
  app.querySelectorAll('.levels button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); S.level[S.lang] = b.dataset.lv; save(); home(); }));
  const gn = app.querySelector('.go-next'); if (gn) gn.addEventListener('click', () => start(c, nx.u.id, nx.k));
}
function openUnit(c, uid) {
  const { L, u } = findUnit(c, uid); const d = S.done[u.id] || [];
  const firstOpen = [0, 1, 2, 3].find((k) => !d[k]);
  sheet(`<span class="muted" style="font-weight:700;font-size:.85rem">${esc(L.name)} · Chủ đề ${L.units.indexOf(u) + 1}</span><h2>${esc(u.title)}</h2><p class="sub">${esc(u.goal || '')}</p>
    <div class="lessons">${LESSONS.map((x) => `<button class="lesson-row ${d[x.k] ? 'done' : ''}" data-k="${x.k}"><span class="ic">${d[x.k] ? I.check : I[x.icon]}</span><span><b>${x.name}</b><small>${x.k === 0 ? u.words.length + ' từ · ' : ''}${x.desc}</small></span><span class="go">${x.k === firstOpen ? '<span class="btn acc" style="min-height:36px;padding:0 14px;font-size:.88rem">Bắt đầu</span>' : I.chev}</span></button>`).join('')}</div>`,
  (el, close) => el.querySelectorAll('.lesson-row').forEach((b) => b.addEventListener('click', () => { close(); start(c, u.id, +b.dataset.k); })));
}
function start(c, uid, k) {
  unlockAudio();
  const { u } = findUnit(c, uid);
  runLesson({ unit: u, k, lang: S.lang, onExit: (r) => {
    if (r && r.done) { justBuilt = { unit: u.id, k }; if (unitProgress(u.id) === 4) toast('Hoàn thành chủ đề! Một khoang giàn đã dựng xong.'); }
    if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; else home();
  } });
}

/* ---------- ôn tập ---------- */
async function review() {
  await course(S.lang);
  const list = due(S.lang).filter((w) => WORDS[S.lang + '|' + w]);
  if (!list.length) {
    const learned = Object.keys(S.srs).filter((k) => k.startsWith(S.lang + '|')).length;
    shell('#/review', `<div class="page-h"><h1>Ôn tập</h1><p>Thẻ từ quay lại đúng lúc bạn sắp quên.</p></div>
    <div class="card empty">${emptyArt()}<h2 style="font-size:1.2rem">${learned ? 'Chưa có thẻ nào đến hạn' : 'Chưa có thẻ nào'}</h2><p style="margin:6px 0 16px">${learned ? `Bạn đang có ${learned} từ trong bộ thẻ. Thẻ tiếp theo sẽ đến hạn sau.` : 'Học xong một bài Từ vựng, các từ mới sẽ vào đây.'}</p>${learned >= 4 ? '<button class="btn acc quick">Luyện nhanh 10 câu</button>' : '<a class="btn acc" href="#/">Đi học bài mới</a>'}</div>`);
    const q = app.querySelector('.quick'); if (q) q.addEventListener('click', () => quickPractice('mix'));
    return;
  }
  let i = 0, done = 0;
  const zh = S.lang === 'zh';
  shell('#/review', `<div class="page-h"><h1>Ôn tập</h1><p><b class="left">${list.length}</b> thẻ đến lượt. Chạm thẻ để lật.</p></div><div class="rv"></div>`);
  const box = app.querySelector('.rv');
  const one = () => {
    if (i >= list.length) { box.innerHTML = `<div class="card empty">${emptyArt()}<h2 style="font-size:1.2rem">Ôn xong ${done} thẻ</h2><p style="margin:6px 0 16px">Hẹn gặp lại các thẻ này vào đúng lúc.</p><a class="btn acc" href="#/">Về trang học</a></div>`; sfx('done'); return; }
    const w = WORDS[S.lang + '|' + list[i]];
    box.innerHTML = `<div class="review-card"><div class="flip"><div class="face front"><h2 class="${zh ? 'zh' : ''}">${esc(w.w)}</h2><button class="say" type="button" aria-label="Nghe">${I.speaker}</button><span class="muted">Bạn có nhớ nghĩa không?</span></div>
      <div class="face back"><h2 class="${zh ? 'zh' : ''}" style="font-size:${zh ? '2.4rem' : '1.7rem'}">${esc(w.w)}</h2><span class="muted">${esc(zh ? w.py : w.ipa || '')}</span><div style="font-size:1.3rem;font-weight:700">${esc(w.vi)}</div><div class="${zh ? 'zh' : ''}" style="font-size:${zh ? '1.15rem' : '.98rem'}">${esc(zh ? strip(w.ex) : w.ex)}</div><small class="muted">${esc(w.exVi || '')}</small></div></div></div>
      <div class="grade" hidden><button class="btn again" data-g="0">Quên<small>10 phút</small></button><button class="btn ghost" data-g="1">Mơ hồ<small>vài ngày</small></button><button class="btn good" data-g="2">Nhớ rõ<small>lâu hơn</small></button></div>
      <button class="btn ghost wide reveal" type="button">Lật thẻ</button>`;
    const card = box.querySelector('.review-card'), g = box.querySelector('.grade'), rv = box.querySelector('.reveal');
    const flip = () => { if (card.classList.contains('on')) return; sfx('flip'); card.classList.add('on'); g.hidden = false; rv.hidden = true; speak(w.w, S.lang); };
    card.addEventListener('click', (e) => { if (e.target.closest('.say')) return; flip(); });
    rv.addEventListener('click', flip);
    const sb = box.querySelector('.say'); sb.addEventListener('click', () => speak(w.w, S.lang, { btn: sb }));
    speak(w.w, S.lang, { btn: sb });
    g.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const gv = +b.dataset.g; grade(S.lang, list[i], gv); sfx(gv ? 'ok' : 'bad'); addXP(1); done++; i++; const l = app.querySelector('.left'); if (l) l.textContent = list.length - i; one(); }));
  };
  one();
}
function emptyArt() { return `<svg viewBox="0 0 120 90" aria-hidden="true"><path d="M10 80h100L60 18z" fill="none" stroke="var(--line)" stroke-width="5" stroke-linejoin="round"/><path d="M60 18v62M35 80l25-33 25 33" fill="none" stroke="var(--graphite)" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 7"/><circle cx="60" cy="18" r="6" fill="var(--hl)"/></svg>`; }

/* ---------- luyện tập ---------- */
async function learnedUnits() {
  const c = await course(S.lang);
  const out = []; c.levels.forEach((L) => L.units.forEach((u) => { if (unitProgress(u.id) > 0) out.push(u); }));
  return out.length ? out : [c.levels.find((x) => x.id === S.level[S.lang]).units[0]];
}
const shuffleArr = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
async function quickPractice(kind) {
  const us = await learnedUnits(), lang = S.lang, zh = lang === 'zh';
  const words = us.flatMap((u) => u.words), sents = us.flatMap((u) => [...u.dlg.lines, ...u.read.sents, ...u.gram.ex]).filter((s) => s.tk && s.tk.length >= 3 && s.tk.length <= 13);
  const unit = { id: 'practice', title: 'Luyện tập', words, dlg: { lines: [] }, read: { sents: [], q: [] }, gram: { ex: [], drill: [] } };
  let queue = [];
  if (kind === 'listen') queue = shuffleArr(sents).slice(0, 8).map((s) => (zh ? { type: 'listenOrder', s } : { type: 'dictation', s }));
  else if (kind === 'speak') queue = shuffleArr(sents).slice(0, 6).map((s) => ({ type: 'speak', s }));
  else if (kind === 'write') queue = shuffleArr(words.filter((w) => strip(w.w).length <= 2)).slice(0, 6).map((w) => ({ type: 'write', w }));
  else queue = shuffleArr(words).slice(0, 10).map((w, i) => ({ type: ['meaning', 'listenWord', 'wordFromVi'][i % 3], w }));
  if (kind === 'mix' && sents.length) queue.splice(4, 0, { type: 'order', s: shuffleArr(sents)[0] });
  runPractice(unit, queue, lang);
}
function runPractice(unit, queue, lang) {
  unlockAudio();
  import('./lesson.js').then(({ runLesson: _ }) => {
    // dùng trình chạy bài với hàng đợi có sẵn
    runQueue(unit, queue, lang);
  });
}
async function readingLibrary() {
  const c = await course(S.lang);
  const rows = []; c.levels.forEach((L) => L.units.forEach((u, i) => rows.push({ L, u, i })));
  sheet(`<h2>Thư viện bài đọc</h2><p class="sub">Đọc lại, nghe lại các bài đọc theo level.</p><div class="list">${rows.map(({ L, u, i }) => `<button class="row" data-u="${u.id}" style="text-align:left;width:100%"><span class="grow"><b>${esc(u.read.title)}</b><small>${esc(L.name)} · ${esc(u.title)}</small></span>${unitProgress(u.id) ? I.check.replace('<svg', '<svg style="width:20px;color:var(--acc)"') : ''}</button>`).join('')}</div>`,
    (el, close) => el.querySelectorAll('.row').forEach((b) => b.addEventListener('click', () => { close(); const { u } = findUnit(c, b.dataset.u); runQueue(u, [{ type: 'reading' }, ...u.read.q.map((x) => ({ type: 'mcq', q: x.q, opts: x.opts, a: x.a, note: 'Theo bài đọc' }))], S.lang); })));
}
async function wordList() {
  const us = await learnedUnits(), zh = S.lang === 'zh';
  const words = us.flatMap((u) => u.words);
  sheet(`<h2>Từ đã học</h2><p class="sub">${words.length} từ. Chạm để nghe.</p><input class="input" placeholder="Tìm từ hoặc nghĩa" style="margin-bottom:12px"/><div class="list wl">${words.map((w, i) => `<button class="row" data-i="${i}" style="text-align:left;width:100%"><span class="grow"><b class="${zh ? 'zh' : ''}" style="${zh ? 'font-size:1.25rem;font-weight:400' : ''}">${esc(w.w)} <span class="py">${esc(zh ? w.py : w.ipa || '')}</span></b><small>${esc(w.vi)}</small></span>${I.speaker.replace('<svg', '<svg style="width:20px;color:var(--graphite)"')}</button>`).join('')}</div>`,
    (el) => {
      el.querySelectorAll('.wl .row').forEach((b) => b.addEventListener('click', () => speak(words[+b.dataset.i].w, S.lang)));
      el.querySelector('input').addEventListener('input', (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll('.wl .row').forEach((b) => { const w = words[+b.dataset.i]; b.hidden = q && !(w.w.toLowerCase().includes(q) || w.vi.toLowerCase().includes(q) || (w.py || '').toLowerCase().includes(q)); }); });
    });
}
async function practice() {
  const zh = S.lang === 'zh';
  const tiles = [
    ['listen', 'ear', 'Nghe chép', zh ? 'Nghe câu rồi xếp lại chữ.' : 'Nghe câu tiếng Anh rồi gõ lại.'],
    ['speak', 'mic', 'Luyện nói', canListen() ? 'Đọc to câu, máy chấm độ khớp.' : 'Trình duyệt này chưa hỗ trợ nghe giọng nói. Dùng Chrome hoặc Safari.'],
    ['read', 'read', 'Thư viện bài đọc', 'Đọc lại các bài, chạm từ để xem nghĩa.'],
    ['mix', 'bolt', 'Luyện nhanh từ vựng', '10 câu trộn từ các bài đã học.'],
    ...(zh ? [['write', 'brush', 'Viết chữ Hán', 'Viết theo thứ tự nét, có hướng dẫn.']] : []),
    ['words', 'book', 'Từ đã học', 'Tra lại và nghe phát âm.'],
  ];
  shell('#/practice', `<div class="page-h"><h1>Luyện tập</h1><p>Chọn một kỹ năng, mỗi lượt chỉ vài phút. Câu hỏi lấy từ các bài bạn đã học.</p></div>
  <div class="tiles4">${tiles.map(([k, ic, t, d]) => `<button class="card ptile" data-k="${k}"><span class="ic">${I[ic]}</span><b>${t}</b><small>${d}</small></button>`).join('')}</div>`);
  app.querySelectorAll('.ptile').forEach((b) => b.addEventListener('click', () => { sfx('tap'); const k = b.dataset.k; if (k === 'read') readingLibrary(); else if (k === 'words') wordList(); else quickPractice(k); }));
}

/* ---------- tài khoản & cài đặt ---------- */
function syncText() { return !acct ? 'Chỉ lưu trên máy này' : sync.state === 'saving' ? 'Đang lưu…' : sync.state === 'err' ? 'Chưa lưu được, sẽ thử lại' : 'Đã lưu vào tài khoản'; }
async function me() {
  const voicesEn = listVoices('en'), voicesZh = listVoices('zh');
  shell('#/me', `<div class="page-h"><h1>${acct ? esc(acct.name) : 'Hồ sơ học'}</h1><p class="sync">${syncText()}</p></div>
  <div class="home-grid"><div class="list">
    <div class="card" style="padding:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">
      <div><b style="font-family:var(--f-head);font-size:1.4rem">${streakNow()}</b><br><small class="muted">ngày liên tiếp</small></div>
      <div><b style="font-family:var(--f-head);font-size:1.4rem">${S.xp}</b><br><small class="muted">XP</small></div>
      <div><b style="font-family:var(--f-head);font-size:1.4rem">${Object.keys(S.srs).length}</b><br><small class="muted">từ đã học</small></div>
      <div><b style="font-family:var(--f-head);font-size:1.4rem">${S.minutes}′</b><br><small class="muted">thời gian</small></div>
    </div>
    <div class="row"><span class="grow"><b>Mục tiêu mỗi ngày</b><small>XP cần đạt để giữ chuỗi</small></span><select class="input goal" style="width:auto;height:42px">${[10, 20, 30, 50].map((g) => `<option value="${g}" ${S.goal === g ? 'selected' : ''}>${g} XP</option>`).join('')}</select></div>
    <label class="row"><span class="grow"><b>Âm thanh hiệu ứng</b><small>Tiếng đúng, sai, hoàn thành</small></span><span class="switch"><input type="checkbox" class="snd" ${S.settings.sound ? 'checked' : ''}><span></span></span></label>
    <div class="row"><span class="grow"><b>Tốc độ đọc</b><small>Giọng đọc mẫu</small></span><select class="input rate" style="width:auto;height:42px">${[[0.8, 'Chậm'], [0.95, 'Vừa'], [1.1, 'Nhanh']].map(([v, l]) => `<option value="${v}" ${S.settings.rate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${voicesEn.length ? `<div class="row"><span class="grow"><b>Giọng tiếng Anh</b></span><select class="input vEn" style="width:auto;max-width:55%;height:42px"><option value="">Tự chọn</option>${voicesEn.map((v) => `<option ${S.settings.voice.en === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : ''}
    ${voicesZh.length ? `<div class="row"><span class="grow"><b>Giọng tiếng Trung</b></span><select class="input vZh" style="width:auto;max-width:55%;height:42px"><option value="">Tự chọn</option>${voicesZh.map((v) => `<option ${S.settings.voice.zh === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : `<div class="row"><span class="grow"><b>Giọng tiếng Trung</b><small>Máy này chưa có giọng đọc tiếng Trung. Trên Windows: Cài đặt › Thời gian và ngôn ngữ › Giọng nói, thêm Chinese (Simplified).</small></span></div>`}
    <label class="row"><span class="grow"><b>Hiện pinyin</b><small>Phiên âm dưới chữ Hán</small></span><span class="switch"><input type="checkbox" class="pyx" ${S.settings.pinyin ? 'checked' : ''}><span></span></span></label>
    <label class="row"><span class="grow"><b>Giao diện tối</b><small>Dịu mắt khi học buổi tối</small></span><span class="switch"><input type="checkbox" class="dark" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''}><span></span></span></label>
  </div>
  <aside class="side">
    ${acct ? `<div class="card"><h3>Tài khoản</h3><p class="muted" style="margin-bottom:12px">Đăng nhập tên <b>${esc(acct.name)}</b> và mã PIN trên máy khác để học tiếp.</p><div class="foot-row"><button class="btn ghost syncnow">${I.cloud} Lưu ngay</button><button class="btn ghost out">${I.logout} Đăng xuất</button></div></div>`
      : `<div class="card"><h3>Lưu tiến trình</h3><p class="muted" style="margin-bottom:12px">Chỉ cần một cái tên và mã PIN 4–6 số. Không cần email hay số điện thoại.</p><button class="btn acc wide mk">Tạo tài khoản</button><button class="btn ghost wide lg" style="margin-top:10px">Tôi đã có tài khoản</button></div>`}
    <div class="card"><h3>Về khoá học</h3><p class="muted" style="font-size:.9rem">Tiếng Anh A1–C1 và tiếng Trung HSK1–HSK5, nội dung xoay quanh công việc văn phòng kỹ thuật. Giọng đọc và chấm phát âm dùng tính năng có sẵn của trình duyệt; viết chữ Hán dùng thư viện mã nguồn mở Hanzi Writer.</p><button class="btn ghost wide wipe" style="margin-top:12px">Xoá tiến trình trên máy này</button></div>
  </aside></div>`);
  const q = (s) => app.querySelector(s);
  q('.goal').addEventListener('change', (e) => { S.goal = +e.target.value; save(); toast('Đã đổi mục tiêu'); });
  q('.snd').addEventListener('change', (e) => { S.settings.sound = e.target.checked; save(); applySettings(); sfx('ok'); });
  q('.rate').addEventListener('change', (e) => { S.settings.rate = +e.target.value; save(); applySettings(); speak(S.lang === 'zh' ? '你好，我们开始吧。' : "Hello, let's get started.", S.lang); });
  const ve = q('.vEn'); if (ve) ve.addEventListener('change', (e) => { S.settings.voice.en = e.target.value; save(); applySettings(); speak('This is my voice.', 'en'); });
  const vz = q('.vZh'); if (vz) vz.addEventListener('change', (e) => { S.settings.voice.zh = e.target.value; save(); applySettings(); speak('这是我的声音。', 'zh'); });
  q('.pyx').addEventListener('change', (e) => { S.settings.pinyin = e.target.checked; save(); });
  q('.dark').addEventListener('change', (e) => { const t = e.target.checked ? 'dark' : 'light'; document.documentElement.dataset.theme = t; try { localStorage.setItem('dcl_theme', t); } catch (er) {} });
  q('.wipe').addEventListener('click', () => { if (confirm('Xoá toàn bộ tiến trình trên máy này?' + (acct ? ' Tài khoản trên máy chủ vẫn giữ nguyên.' : ''))) { logout(); reset(); location.hash = '#/'; render(); } });
  if (acct) {
    q('.syncnow').addEventListener('click', async () => { await push(); toast(sync.state === 'ok' ? 'Đã lưu vào tài khoản' : 'Chưa lưu được, kiểm tra mạng'); me(); });
    q('.out').addEventListener('click', () => { if (confirm('Đăng xuất? Tiến trình vẫn giữ trên máy này.')) { logout(); me(); } });
  } else {
    q('.mk').addEventListener('click', () => authSheet('new'));
    q('.lg').addEventListener('click', () => authSheet('login'));
  }
}
function authForm(mode) {
  return `<div class="tabs2" role="group"><button data-m="new" aria-pressed="${mode === 'new'}">Tạo tài khoản</button><button data-m="login" aria-pressed="${mode === 'login'}">Đăng nhập</button></div>
  <form class="authf" style="margin-top:14px" novalidate>
    <div class="field"><label for="an">Tên của bạn</label><input class="input" id="an" autocomplete="username" maxlength="24" placeholder="Ví dụ: tuan.mitek" required /></div>
    <div class="field"><label for="ap">Mã PIN (4–6 số)</label><input class="input pin" id="ap" type="password" inputmode="numeric" autocomplete="${mode === 'new' ? 'new-password' : 'current-password'}" maxlength="6" placeholder="••••" required /></div>
    <p class="err"></p>
    <button class="btn acc wide sub" type="submit">${mode === 'new' ? 'Tạo tài khoản' : 'Đăng nhập'}</button>
    <p class="muted" style="font-size:.84rem;margin-top:10px">${mode === 'new' ? 'Nhớ tên và mã PIN để đăng nhập lại. Mã PIN chỉ dùng cho trang học này.' : 'Tiến trình trên tài khoản sẽ được tải về máy này.'}</p>
  </form>`;
}
function wireAuth(el, mode, done) {
  el.querySelectorAll('.tabs2 button').forEach((b) => b.addEventListener('click', () => { const m = b.dataset.m; el.querySelector('.authwrap').innerHTML = authForm(m); wireAuth(el, m, done); }));
  const f = el.querySelector('.authf'), err = el.querySelector('.err'), sub = el.querySelector('.sub');
  el.querySelector('#ap').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    const n = el.querySelector('#an').value, p = el.querySelector('#ap').value;
    if (!validName(n)) { err.textContent = 'Tên cần 3–24 ký tự: chữ, số, dấu chấm hoặc gạch.'; return; }
    if (!validPin(p)) { err.textContent = 'Mã PIN gồm 4 đến 6 chữ số.'; return; }
    sub.disabled = true; sub.textContent = 'Đang xử lý…';
    try { if (mode === 'new') await register(n, p); else await login(n, p); sfx('ok'); done(mode); }
    catch (x) { err.textContent = x.message; sub.disabled = false; sub.textContent = mode === 'new' ? 'Tạo tài khoản' : 'Đăng nhập'; sfx('bad'); }
  });
}
function authSheet(mode) {
  sheet(`<h2>Tài khoản học</h2><p class="sub">Lưu tiến trình để học tiếp ở máy khác.</p><div class="authwrap">${authForm(mode)}</div>`, (el, close) => wireAuth(el, mode, (m) => { close(); toast(m === 'new' ? 'Đã tạo tài khoản, tiến trình đã được lưu' : 'Đã đăng nhập'); applySettings(); render(); }));
}

/* ---------- chào mừng ---------- */
async function welcome() {
  const [en, zh] = await Promise.all([course('en'), course('zh')]);
  let lang = S.lang || 'en', lv = { en: S.level.en, zh: S.level.zh };
  const draw = () => {
    const c = lang === 'en' ? en : zh;
    app.innerHTML = `<div class="welcome" data-lang="${lang}"><div class="box">
      <svg class="hero-truss" viewBox="0 0 460 150" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path class="wt" d="M20 130 H440 L230 22 Z" stroke="var(--ink)" stroke-width="5"/><path class="wt" d="M230 22 V130 M125 130 L230 76 L335 130 M125 130 V76 M335 130 V76 M75 130 L125 104 M385 130 L335 104" stroke="var(--acc)" stroke-width="4"/></g><g fill="var(--hl)"><circle cx="230" cy="22" r="8"/></g><g fill="var(--ink)"><circle cx="20" cy="130" r="7"/><circle cx="440" cy="130" r="7"/><circle cx="230" cy="130" r="6"/></g></svg>
      <h1>Mỗi ngày dựng thêm một thanh.</h1>
      <p class="lead">Học tiếng Anh và tiếng Trung theo từng level, bằng những câu bạn dùng ở văn phòng: họp, email, bản vẽ, phần mềm. Mỗi bài 5 phút, có nghe, nói, đọc và bài tập.</p>
      <div class="pick" role="group" aria-label="Chọn ngôn ngữ"><button data-l="en" aria-pressed="${lang === 'en'}"><span class="big">English</span><small>A1 đến C1</small></button><button data-l="zh" aria-pressed="${lang === 'zh'}"><span class="big zh">中文</span><small>HSK1 đến HSK5</small></button></div>
      <div class="field"><label>Trình độ bắt đầu</label><div class="list">${c.levels.map((L) => `<button class="row lvp" data-lv="${L.id}" style="text-align:left;width:100%;${lv[lang] === L.id ? 'border-color:var(--acc);box-shadow:inset 0 0 0 1px var(--acc)' : ''}"><span class="grow"><b>${esc(L.name)} · ${esc(L.title)}</b><small>${esc(L.desc)}</small></span>${lv[lang] === L.id ? I.check.replace('<svg', '<svg style="width:22px;color:var(--acc)"') : ''}</button>`).join('')}</div></div>
      <button class="btn acc wide go" type="button">Bắt đầu học</button>
      <button class="btn ghost wide have" type="button">Tôi đã có tài khoản</button>
    </div></div>`;
    app.querySelectorAll('.wt').forEach((p) => { const Ln = p.getTotalLength(); p.style.strokeDasharray = Ln; p.style.strokeDashoffset = Ln; p.animate([{ strokeDashoffset: Ln }, { strokeDashoffset: 0 }], { duration: 1400, easing: 'cubic-bezier(.6,.05,.3,1)', fill: 'forwards' }); });
    app.querySelectorAll('.pick button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); lang = b.dataset.l; draw(); }));
    app.querySelectorAll('.lvp').forEach((b) => b.addEventListener('click', () => { sfx('tap'); lv[lang] = b.dataset.lv; draw(); }));
    app.querySelector('.go').addEventListener('click', () => {
      unlockAudio(); sfx('ok');
      S.lang = lang; S.level = lv; save();
      sheet(`<h2>Lưu tiến trình?</h2><p class="sub">Tạo tài khoản bằng tên và mã PIN để lần sau đăng nhập là học tiếp. Không cần email.</p><div class="authwrap">${authForm('new')}</div><button class="btn ghost wide later" style="margin-top:10px">Để sau, học thử trước</button>`, (el, close) => {
        const finish = () => { close(); S.onboarded = true; save(true); applySettings(); location.hash = '#/'; render(); };
        wireAuth(el, 'new', (m) => { toast(m === 'new' ? 'Đã tạo tài khoản' : 'Đã đăng nhập'); finish(); });
        el.querySelector('.later').addEventListener('click', finish);
      });
    });
    app.querySelector('.have').addEventListener('click', () => sheet(`<h2>Đăng nhập</h2><p class="sub">Nhập tên và mã PIN bạn đã tạo.</p><div class="authwrap">${authForm('login')}</div>`, (el, close) => wireAuth(el, 'login', () => { close(); S.onboarded = true; save(true); applySettings(); location.hash = '#/'; render(); })));
  };
  draw();
}

/* ---------- chạy hàng đợi luyện tập ---------- */
function runQueue(unit, queue, lang) {
  import('./lesson.js').then((m) => m.runCustom({ unit, queue, lang, onExit: () => render() }));
}

/* ---------- router ---------- */
async function render() {
  applySettings();
  document.getElementById('sheet-root').innerHTML = '';
  if (!S.onboarded) return welcome();
  const r = location.hash || '#/';
  try {
    if (r.startsWith('#/review')) await review();
    else if (r.startsWith('#/practice')) await practice();
    else if (r.startsWith('#/me')) await me();
    else await home();
  } catch (e) { console.error(e); app.innerHTML = `<div class="welcome"><div class="box"><h1>Chưa tải được bài học</h1><p class="lead">Kiểm tra kết nối mạng rồi tải lại trang.</p><button class="btn acc" onclick="location.reload()">Tải lại</button></div></div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
onSync(() => { const el = document.querySelector('.sync'); if (el) el.textContent = syncText(); });
document.addEventListener('pointerdown', unlockAudio, { once: true });
render();
