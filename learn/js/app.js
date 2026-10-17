import { I, LOGO } from './icons.js?v=6';
import { sound, sfx, unlockAudio } from './sound.js?v=6';
import { tts, speak, listVoices, canListen, listen, stopListen, micMsg, micBlocked, MIC_HELP, micState } from './speech.js?v=6';
import { S, save, streakNow, todayXP, unitProgress, due, grade, addXP, today, reset, daily, bump, LN } from './store.js?v=6';
import { acct, sync, onSync, register, login, logout, validName, validPin, push } from './account.js?v=6';
import { runLesson, LESSONS } from './lesson.js?v=6';
import { mascot } from './mascot.js?v=6';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const strip = (s) => (s || '').replace(/\s+/g, '');
const COURSE = {}, WORDS = {};
let justBuilt = null;
const DATA_V = 4;

/* ---------- dữ liệu khoá học ---------- */
async function course(lang) {
  if (COURSE[lang]) return COURSE[lang];
  const r = await fetch(`data/${lang}.json?v=${DATA_V}`); const c = await r.json();
  c.levels.forEach((L) => L.units.forEach((u) => { u.level = L.id; u.words.forEach((w) => { WORDS[lang + '|' + w.w] = { ...w, unit: u.id }; }); }));
  COURSE[lang] = c; return c;
}
const findUnit = (c, id) => { for (const L of c.levels) for (const u of L.units) if (u.id === id) return { L, u }; return null; };
const curLevel = (c) => c.levels.find((x) => x.id === S.level[S.lang]) || c.levels[0];
const textOf = (lang, x) => (lang === 'zh' ? strip(x.t) : x.t);

/* màu từng chủ đề — bảng màu kẹo ngọt, mỗi chủ đề một sắc */
const UC = {
  en: ['#10A39B', '#4C8DF6', '#9B6BEF', '#FF8A3D', '#2EB36A', '#F2588C', '#E9A800', '#1BAFD3', '#E8664E', '#6C77EE'],
  zh: ['#EF5660', '#FF8A3D', '#9B6BEF', '#1BAFD3', '#2EB36A', '#E9A800', '#F2588C', '#4C8DF6', '#10A39B', '#E8664E'],
};
const ucol = (lang, i) => UC[lang][i % UC[lang].length];

/* ---------- tiện ích giao diện ---------- */
function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2400); }
function applySettings() {
  sound.on = S.settings.sound; tts.rate = S.settings.rate; tts.pref = S.settings.voice || { en: '', zh: '' };
  document.documentElement.dataset.lang = S.lang;
}
function sheet(html, onMount, cls = '') {
  const root = document.getElementById('sheet-root');
  root.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${cls}" role="dialog" aria-modal="true"><button class="icon-btn sheet-x" type="button" aria-label="Đóng">${I.x}</button>${html}</div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onEsc); };
  const onEsc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  root.querySelector('.sheet-bg').addEventListener('click', close);
  root.querySelector('.sheet-x').addEventListener('click', close);
  if (onMount) onMount(root.querySelector('.sheet'), close);
  return close;
}
const NAV = [['#/', 'Học', 'home'], ['#/roadmap', 'Lộ trình', 'list'], ['#/review', 'Ôn tập', 'cards'], ['#/practice', 'Luyện', 'target'], ['#/me', 'Tôi', 'user']];
const initials = (n) => (n || '?').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
function langSwitch() { return `<div class="langsw" role="group" aria-label="Ngôn ngữ đang học"><button data-l="en" aria-pressed="${S.lang === 'en'}">EN</button><button data-l="zh" aria-pressed="${S.lang === 'zh'}">中文</button></div>`; }

function shell(route, inner, aside) {
  const dueN = due(S.lang).length;
  const navItems = (cls) => NAV.map(([href, label, ic]) => `<a class="${cls}" href="${href}" ${route === href ? 'aria-current="page"' : ''}><span class="ni">${I[ic]}</span><span class="nl">${label}</span>${href === '#/review' && dueN ? `<i class="badge">${dueN > 99 ? '99+' : dueN}</i>` : ''}</a>`).join('');
  app.innerHTML = `
  <header class="top">
    <a class="brand" href="#/" aria-label="Trang học">${LOGO}<span>learn<small>desktopchill</small></span></a>
    <span class="pill streak" title="Chuỗi ngày học">${I.flame}${streakNow()}</span>
    <span class="pill xp" title="Tổng XP">${I.bolt}${S.xp}</span>
    ${langSwitch()}
  </header>
  <div class="layout ${aside ? '' : 'noside'}">
    <aside class="rail" aria-label="Điều hướng">
      <a class="brand big" href="#/" aria-label="Trang học">${LOGO}<span>learn<small>desktopchill</small></span></a>
      <nav class="rnav">${navItems('ritem')}</nav>
      <div class="rail-foot">
        ${langSwitch()}
        <a class="me-mini" href="#/me"><span class="av">${acct ? esc(initials(acct.name)) : I.user}</span><span class="mm"><b>${acct ? esc(acct.name) : 'Khách'}</b><small>${acct ? 'Đã lưu tiến trình' : 'Chưa có tài khoản'}</small></span></a>
      </div>
    </aside>
    <main class="main" id="main">${inner}</main>
    ${aside ? `<aside class="side" aria-label="Tiến độ hôm nay">${aside}</aside>` : ''}
  </div>
  <nav class="tabbar">${navItems('titem')}</nav>`;
  app.querySelectorAll('.langsw button').forEach((b) => b.addEventListener('click', () => { if (S.lang === b.dataset.l) return; sfx('tap'); S.lang = b.dataset.l; save(); applySettings(); render(); }));
  app.querySelectorAll('.ritem, .titem').forEach((a) => a.addEventListener('click', () => sfx('tap')));
  wireAside();
}

/* ---------- cột phải: mục tiêu, nhiệm vụ, câu hôm nay ---------- */
let phraseRef = null;
function quests() {
  const d = daily(), tx = todayXP();
  return [
    { ic: 'bolt', t: `Đạt ${S.goal} XP`, v: tx, n: S.goal },
    { ic: 'book', t: 'Hoàn thành 2 bài học', v: d.lessons, n: 2 },
    canListen() ? { ic: 'mic', t: 'Nói đúng 5 câu', v: d.speak, n: 5 } : { ic: 'cards', t: 'Ôn 10 thẻ từ', v: d.review, n: 10 },
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
  const tx = todayXP(), goal = S.goal, frac = Math.min(1, tx / goal), circ = 2 * Math.PI * 30;
  const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 86400000); return { k: today(d), lab: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()] }; });
  const maxD = Math.max(goal, ...days.map((d) => S.days[d.k] || 0));
  const qs = quests(), dueN = due(S.lang).length;
  const ph = phraseOfDay(c); phraseRef = ph;
  const zh = S.lang === 'zh';
  return `
  <div class="stats3">
    <div class="st fire" title="Chuỗi ngày học">${I.flame}<b>${streakNow()}</b><small>ngày</small></div>
    <div class="st gold" title="Tổng XP">${I.bolt}<b>${S.xp}</b><small>XP</small></div>
    <div class="st teal" title="Từ đã học">${I.book}<b>${Object.keys(S.srs).filter((k) => k.startsWith(S.lang + '|')).length}</b><small>từ</small></div>
  </div>
  <section class="card goal-card">
    <div class="ring" data-frac="${frac}"><svg viewBox="0 0 72 72"><circle class="bgc" cx="36" cy="36" r="30" fill="none" stroke-width="8"/><circle class="fgc" cx="36" cy="36" r="30" fill="none" stroke-width="8" stroke-dasharray="${circ}" stroke-dashoffset="${circ}"/></svg><b>${tx}<small>/ ${goal}</small></b></div>
    <div><h3>Mục tiêu hôm nay</h3><p class="muted">${tx >= goal ? 'Xong rồi! Giữ nhịp này nhé.' : `Còn ${goal - tx} XP nữa.`}</p>
      <div class="week">${days.map((d) => { const v = S.days[d.k] || 0; return `<div class="${d.k === today() ? 'today' : ''}" title="${v} XP"><i class="${v >= goal ? 'on' : v ? 'part' : ''}" style="height:${Math.max(5, Math.round(v / maxD * 40))}px"></i>${d.lab}</div>`; }).join('')}</div></div>
  </section>
  <section class="card quests">
    <h3>${I.list} Nhiệm vụ hôm nay</h3>
    ${qs.map((q) => { const p = Math.min(1, q.v / q.n), ok = p >= 1; return `<div class="quest ${ok ? 'ok' : ''}"><span class="qi">${ok ? I.check : I[q.ic]}</span><div class="qb"><b>${q.t}<em>${Math.min(q.v, q.n)} / ${q.n}</em></b><span class="qbar"><i style="width:${Math.round(p * 100)}%"></i></span></div></div>`; }).join('')}
  </section>
  ${ph ? `<section class="card phrase">
    <h3>Câu nói hôm nay</h3>
    <p class="ph-t ${zh ? 'zh' : ''}">${esc(textOf(S.lang, ph.l))}</p>
    ${zh && ph.l.py ? `<p class="py">${esc(ph.l.py.join(' '))}</p>` : ''}
    <p class="muted">${esc(ph.l.vi)}</p>
    <div class="ph-act"><button class="chip ph-say" type="button">${I.speaker} Nghe</button><button class="chip ph-try" type="button">${I.mic} Nói thử</button></div>
  </section>` : ''}
  <a class="card mini-link" href="#/review"><span class="ml-ic">${I.cards}</span><span><b>${dueN ? `${dueN} thẻ đến hạn ôn` : 'Thẻ ôn tập'}</b><small>${dueN ? 'Ôn ngay để nhớ lâu hơn' : Object.keys(S.srs).some((k) => k.startsWith(S.lang + '|')) ? 'Thẻ sẽ quay lại đúng lúc sắp quên' : 'Học bài Từ vựng để có thẻ mới'}</small></span>${I.chev}</a>
  ${!acct ? `<a class="card mini-link save" href="#/me"><span class="ml-ic">${I.cloud}</span><span><b>Lưu tiến trình</b><small>Tên + mã PIN, học tiếp ở máy khác</small></span>${I.chev}</a>` : ''}`;
}
function wireAside() {
  const side = app.querySelector('.side, .main');
  micState().then((st) => {
    if (st !== 'denied' || !side || app.querySelector('.mic-warn')) return;
    const c = document.createElement('button'); c.type = 'button'; c.className = 'card mini-link mic-warn';
    c.innerHTML = `<span class="ml-ic">${I.mic}</span><span><b>Micro đang bị chặn</b><small>Bài nói cần micro. Bấm để xem cách bật.</small></span>${I.chev}`;
    c.addEventListener('click', () => sheet(`<h2>Bật micro</h2><p class="sub">Trình duyệt đang chặn micro cho desktopchill.com nên phần nói không nhận được giọng.</p>${MIC_HELP}`));
    const tgt = [app.querySelector('.side'), app.querySelector('.main')].find((x) => x && x.offsetParent !== null); if (!tgt) return; if (tgt.classList.contains('main')) c.style.marginBottom = '14px'; tgt.insertBefore(c, tgt.querySelector('.goal-card') || tgt.firstChild);
  });
  const f = app.querySelector('.goal-card .fgc');
  if (f) { const r = app.querySelector('.goal-card .ring'); const circ = 2 * Math.PI * 30; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.strokeDashoffset = circ * (1 - +r.dataset.frac); })); }
  const say = app.querySelector('.ph-say'); if (say && phraseRef) say.addEventListener('click', () => speak(textOf(S.lang, phraseRef.l), S.lang, { btn: say }));
  const tr = app.querySelector('.ph-try'); if (tr && phraseRef) tr.addEventListener('click', () => { unlockAudio(); runQueue(phraseRef.u, [{ type: 'speak', s: phraseRef.l }], S.lang); });
}

/* ---------- lộ trình: con đường uốn lượn, mỗi viên tròn là một bài, cuối chủ đề là rương quà ---------- */
const JOINTS = LN + 1; // 8 bài + 1 rương ôn tập
const WAVE = [0, .55, .92, .55, 0, -.55, -.92, -.55, 0];
function unitGeom(W, flip) {
  const A = Math.min(118, W * 0.25), cx = W / 2, gap = 98, top = 112;
  const pts = WAVE.map((o, k) => { const oo = o * (flip ? -1 : 1); return { x: cx + oo * A, y: top + k * gap, o: oo }; });
  return { pts, H: top + (JOINTS - 1) * gap + 84, A, cx };
}
function currentPos(c) {
  const L = curLevel(c);
  const u = L.units.find((x) => unitProgress(x.id) < LN);
  if (!u) return { L, u: null, k: 0 };
  const d = S.done[u.id] || []; let k = LESSONS.map((x) => x.k).find((i) => !d[i]); if (k === undefined) k = 0;
  return { L, u, k };
}
// đường cong mềm đi qua các điểm (Catmull-Rom → Bézier bậc ba), trả về từng đoạn
function curveSegs(Q) {
  const f = (n) => Math.round(n * 10) / 10, out = [];
  for (let i = 0; i < Q.length - 1; i++) {
    const p0 = Q[Math.max(0, i - 1)], p1 = Q[i], p2 = Q[i + 1], p3 = Q[Math.min(Q.length - 1, i + 2)];
    out.push(`M${f(p1.x)} ${f(p1.y)} C${f(p1.x + (p2.x - p0.x) / 6)} ${f(p1.y + (p2.y - p0.y) / 6)} ${f(p2.x - (p3.x - p1.x) / 6)} ${f(p2.y - (p3.y - p1.y) / 6)} ${f(p2.x)} ${f(p2.y)}`);
  }
  return out;
}
const DECO = [
  // chậu cây
  '<path d="M18 40h24l-3 16H21z" fill="#E9906A"/><path d="M16 38h28v5H16z" fill="#F2A983"/><path d="M30 38c0-10-8-14-13-22 9 1 14 8 13 22zm0 0c0-12 6-18 14-24-1 11-6 18-14 24zm0 0V18" fill="#5EB985" stroke="#46A673" stroke-width="1.5" stroke-linejoin="round"/>',
  // tách cà phê bốc khói
  '<g class="steam" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".45"><path d="M24 22c-3-4 3-6 0-10"/><path d="M32 22c-3-4 3-6 0-10"/></g><path d="M14 28h30v10a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12z" fill="#FFFFFF" stroke="#3A2E4D" stroke-width="2.4"/><path d="M44 31h3a5 5 0 0 1 0 10h-4" fill="none" stroke="#3A2E4D" stroke-width="2.4"/><path d="M18 34h22" stroke="#C98B5B" stroke-width="3" stroke-linecap="round"/><ellipse cx="29" cy="54" rx="18" ry="3" fill="#000" opacity=".08"/>',
  // hoa
  '<path d="M30 56V32" stroke="#46A673" stroke-width="3" stroke-linecap="round"/><path d="M30 46c-6-1-10-5-10-10 6 0 10 4 10 10z" fill="#5EB985"/><g fill="#FF9CB4"><circle cx="30" cy="16" r="7"/><circle cx="40" cy="23" r="7"/><circle cx="36" cy="34" r="7"/><circle cx="24" cy="34" r="7"/><circle cx="20" cy="23" r="7"/></g><circle cx="30" cy="25" r="5.5" fill="#FFC531"/>',
  // nấm
  '<path d="M24 36h12v14a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z" fill="#FFF3E2" stroke="#3A2E4D" stroke-width="2"/><path d="M8 36c0-14 10-22 22-22s22 8 22 22z" fill="#EF5660" stroke="#3A2E4D" stroke-width="2.2"/><circle cx="21" cy="26" r="3.5" fill="#fff"/><circle cx="35" cy="22" r="4.5" fill="#fff"/><circle cx="42" cy="31" r="2.6" fill="#fff"/>',
  // chồng sách
  '<rect x="10" y="42" width="40" height="9" rx="2" fill="#4C8DF6"/><rect x="14" y="33" width="34" height="9" rx="2" fill="#FFC531"/><rect x="8" y="24" width="38" height="9" rx="2" fill="#9B6BEF"/><path d="M12 28h28M16 37h26M14 46h30" stroke="#fff" stroke-width="1.4" opacity=".6"/><path d="M40 24l6-14 3 1-5 13z" fill="#EF5660"/>',
  // tai nghe
  '<path d="M14 38v-6a16 16 0 0 1 32 0v6" fill="none" stroke="#3A2E4D" stroke-width="4" stroke-linecap="round"/><rect x="9" y="34" width="10" height="17" rx="5" fill="var(--acc)" stroke="#3A2E4D" stroke-width="2"/><rect x="41" y="34" width="10" height="17" rx="5" fill="var(--acc)" stroke="#3A2E4D" stroke-width="2"/><g class="note" fill="#3A2E4D"><circle cx="31" cy="20" r="3"/><path d="M33.5 20V9l6 2" fill="none" stroke="#3A2E4D" stroke-width="2"/></g>',
  // xương rồng
  '<path d="M20 44h20l-2 12H22z" fill="#C98B5B"/><path d="M26 44V18a4 4 0 0 1 8 0v26zM26 34h-4a3 3 0 0 1-3-3v-7a2.5 2.5 0 0 1 5 0v5h2M34 30h4V22a2.5 2.5 0 0 1 5 0v7a3 3 0 0 1-3 3h-6" fill="#5EB985" stroke="#46A673" stroke-width="1.5"/><circle cx="30" cy="14" r="3" fill="#FF9CB4"/>',
  // đèn lồng / ngôi sao
  '<path d="M30 8l5.6 11.4 12.6 1.8-9.1 8.9 2.1 12.5L30 36.7l-11.2 5.9 2.1-12.5-9.1-8.9 12.6-1.8z" fill="#FFC531" stroke="#E9A800" stroke-width="2" stroke-linejoin="round"/><circle cx="25" cy="24" r="1.6" fill="#3A2E4D"/><circle cx="35" cy="24" r="1.6" fill="#3A2E4D"/><path d="M27 29q3 3 6 0" fill="none" stroke="#3A2E4D" stroke-width="1.6" stroke-linecap="round"/>',
];
const CHEST = `<svg class="chest" viewBox="0 0 72 64" aria-hidden="true"><g class="rays"><path d="M36 30 L30 -6 H42Z M36 30 L72 14 L76 26Z M36 30 L0 14 L-4 26Z M36 30 L62 -2 L70 6Z M36 30 L10 -2 L2 6Z"/></g>
  <rect x="7" y="30" width="58" height="28" rx="6" class="cb"/><path d="M7 40h58" class="cband"/><rect x="31" y="30" width="10" height="28" class="cgold"/>
  <g class="lid"><path d="M7 32 Q7 12 36 12 Q65 12 65 32Z" class="clid"/><rect x="31" y="12" width="10" height="20" class="cgold"/></g>
  <rect x="30" y="34" width="12" height="11" rx="3" class="lock"/><circle cx="36" cy="39" r="2" class="kh"/></svg>`;
function pathHTML(c, W) {
  const L = curLevel(c), lang = S.lang, cur = currentPos(c), small = W < 420;
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
      return `<path class="seg ${anim ? 'anim' : ''}" d="${sd}"/><path class="seg-glow" d="${sd}"/>`;
    }).join('');
    const nodes = LESSONS.map((ls) => {
      const pt = P[ls.k], dn = !!d[ls.k], isCur = cur.u === u && cur.k === ls.k;
      const pop = justBuilt && justBuilt.unit === u.id && justBuilt.k === ls.k;
      return `<button class="node ${dn ? 'done' : isCur ? 'cur' : 'todo'} ${pop ? 'pop-in' : ''}" style="left:${pt.x}px;top:${pt.y}px" data-u="${u.id}" data-k="${ls.k}" aria-label="${esc(u.title)}: ${ls.name}${dn ? ', đã xong' : ''}">
        ${isCur ? '<span class="tip">Bắt đầu</span>' : ''}<span class="face">${I[ls.icon]}</span>${dn ? `<span class="ok">${I.star}</span>` : ''}</button>`;
    }).join('');
    const cp = P[LN];
    const cpBtn = `<button class="cp ${p === LN ? 'on' : p >= LN - 1 ? 'near' : ''}" style="left:${cp.x}px;top:${cp.y}px" data-u="${u.id}" aria-label="Rương ôn tập chủ đề ${esc(u.title)}">${CHEST}</button>`;
    let mas = '', masK = -9;
    if (cur.u === u) {
      const pt = P[cur.k]; masK = cur.k;
      const mx = pt.o > 0.01 ? g.cx - g.A * 0.86 : pt.o < -0.01 ? g.cx + g.A * 0.86 : g.cx + g.A * (small ? 0.9 : 1.05);
      mas = `<div class="oc-wrap ${mx > pt.x ? 'r' : 'l'}" style="left:${mx}px;top:${pt.y}px">${mascot({ size: small ? 60 : 78 })}</div>`;
    }
    const deco = [2, 6].filter((k) => Math.abs(k - masK) > 1).map((k, j) => {
      const pt = P[k], x = g.cx - Math.sign(pt.o) * g.A * (small ? 0.92 : 1.02), n = (i * 2 + (k === 6 ? 1 : 0)) % DECO.length;
      return `<span class="deco" style="left:${x}px;top:${pt.y}px;--dl:${-(i * 1.3 + j * 2.1).toFixed(1)}s"><svg viewBox="0 0 60 60" aria-hidden="true">${DECO[n]}</svg></span>`;
    }).join('');
    return `<section class="unit" data-u="${u.id}" style="--uc:${ucol(lang, i)}">
      <header class="unit-head">
        <div class="uh-t"><span class="uh-k">${esc(L.name)} · Chủ đề ${i + 1}</span><h3>${esc(u.title)}</h3><p>${esc(u.goal || u.sub || '')}</p></div>
        <div class="uh-r"><span class="uh-p">${p}/${LN}</span><button class="guide" type="button" data-u="${u.id}">${I.read}<span>Sổ tay</span></button></div>
      </header>
      <div class="span" style="height:${g.H}px"><svg class="road" width="${W}" height="${g.H}" viewBox="0 0 ${W} ${g.H}" aria-hidden="true"><path class="edge" d="${full}"/><path class="bed" d="${full}"/><path class="dots" d="${full}"/>${done}</svg>${deco}${nodes}${cpBtn}${mas}</div>
    </section>`;
  }).join('') + levelEnd(c, L);
}
function levelEnd(c, L) {
  const all = L.units.every((u) => unitProgress(u.id) === LN);
  const idx = c.levels.indexOf(L), nx = c.levels[idx + 1];
  return `<div class="lvl-end ${all ? 'on' : ''}">
    <svg viewBox="0 0 220 84" aria-hidden="true"><path d="M0 76 Q50 50 110 64 T220 60 V84 H0Z" fill="var(--h2)"/><path d="M0 84 Q70 66 140 76 T220 74 V84Z" fill="var(--h3)"/><path d="M110 64 V14" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/><path class="flag" d="M112 15 Q132 12 150 22 Q132 30 112 34Z" fill="var(--acc)"/><circle cx="110" cy="12" r="4" fill="var(--hl)"/></svg>
    <h3>${all ? `Bạn đã đi hết chặng ${esc(L.name)}!` : `Hết ${esc(L.name)} là tới ${nx ? esc(nx.name) : 'đích'}`}</h3>
    <p class="muted">${all ? 'Mọi rương quà đã mở. Sẵn sàng sang chặng tiếp theo.' : 'Hoàn thành mọi chủ đề để cắm cờ ở cuối chặng này.'}</p>
    ${nx ? `<button class="btn ${all ? 'acc' : 'ghost'} next-lv" type="button" data-lv="${nx.id}">${all ? 'Lên ' : 'Xem trước '}${esc(nx.name)}</button>` : ''}
  </div>`;
}
let popClose = null;
function openPop(c, btn) {
  if (popClose) popClose();
  const { L, u } = findUnit(c, btn.dataset.u), k = +btn.dataset.k, ls = LESSONS[k], d = S.done[u.id] || [];
  const span = btn.closest('.span'), x = parseFloat(btn.style.left), y = parseFloat(btn.style.top), W = span.clientWidth;
  const pw = Math.min(300, W - 16), left = Math.max(8, Math.min(W - pw - 8, x - pw / 2));
  const pop = document.createElement('div');
  pop.className = 'pop'; pop.style.cssText = `left:${left}px;top:${y + 52}px;width:${pw}px;--ax:${x - left}px`;
  pop.innerHTML = `<span class="pk">${esc(L.name)} · ${esc(u.title)}</span><b>${ls.name}</b><p>${ls.desc}</p>
    <button class="btn pop-go" type="button">${d[k] ? `${I.redo} Học lại · +6 XP` : `${I.play} Bắt đầu · +10 XP`}</button>`;
  span.appendChild(pop); sfx('open');
  btn.classList.add('open');
  const off = (e) => { if (!pop.contains(e.target) && e.target !== btn && !btn.contains(e.target)) popClose(); };
  popClose = () => { pop.classList.add('out'); btn.classList.remove('open'); setTimeout(() => pop.remove(), 160); document.removeEventListener('pointerdown', off); popClose = null; };
  setTimeout(() => document.addEventListener('pointerdown', off), 0);
  pop.querySelector('.pop-go').addEventListener('click', () => { popClose(); start(c, u.id, k); });
  const r = pop.getBoundingClientRect(); if (r.bottom > innerHeight - 80) window.scrollBy({ top: r.bottom - innerHeight + 100, behavior: 'smooth' });
}
function guidebook(c, uid) {
  const { L, u } = findUnit(c, uid), zh = S.lang === 'zh', g = u.gram;
  sheet(`<span class="muted sk">${esc(L.name)} · Sổ tay chủ đề</span><h2>${esc(u.title)}</h2><p class="sub">${esc(u.goal || '')}</p>
    <h3 class="gh">Từ vựng</h3>
    <div class="gwords">${u.words.map((w, i) => `<button class="gw" type="button" data-i="${i}"><b class="${zh ? 'zh' : ''}">${esc(w.w)}</b><small>${esc(zh ? w.py : w.ipa || '')}</small><span>${esc(w.vi)}</span></button>`).join('')}</div>
    <h3 class="gh">Ngữ pháp: ${esc(g.title)}</h3>
    <p class="rule">${esc(g.rule)}</p><p class="gnote">${esc(g.note || '')}</p>
    <ul class="gex">${g.ex.map((x, i) => `<li><button class="mini-say" type="button" data-e="${i}" aria-label="Nghe">${I.speaker}</button><span><span class="${zh ? 'zh' : ''}">${esc(textOf(S.lang, x))}</span><small>${esc(x.vi)}</small></span></li>`).join('')}</ul>
    <h3 class="gh">Mẫu câu hội thoại</h3>
    <ul class="gex">${u.dlg.lines.slice(0, 6).map((x, i) => `<li><button class="mini-say" type="button" data-l="${i}" aria-label="Nghe">${I.speaker}</button><span><span class="${zh ? 'zh' : ''}">${esc(textOf(S.lang, x))}</span><small>${esc(x.vi)}</small></span></li>`).join('')}</ul>`,
  (el) => {
    el.querySelectorAll('.gw').forEach((b) => b.addEventListener('click', () => speak(u.words[+b.dataset.i].w, S.lang)));
    el.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => speak(textOf(S.lang, g.ex[+b.dataset.e]), S.lang, { btn: b })));
    el.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => speak(textOf(S.lang, u.dlg.lines[+b.dataset.l]), S.lang, { btn: b })));
  }, 'wide');
}
const shuffleArr = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function unitReview(c, uid) {
  const { u } = findUnit(c, uid), zh = S.lang === 'zh';
  const sents = [...u.dlg.lines, ...u.gram.ex].filter((s) => s.tk && s.tk.length >= 3 && s.tk.length <= 12);
  const q = shuffleArr(u.words).slice(0, 6).map((w, i) => ({ type: ['meaning', 'listenWord', 'wordFromVi'][i % 3], w }));
  shuffleArr(sents).slice(0, 2).forEach((s) => q.splice(2 + Math.floor(Math.random() * 4), 0, { type: 'order', s }));
  shuffleArr(u.gram.drill).slice(0, 2).forEach((d) => q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: u.gram.title, vi: d.vi }));
  if (sents.length) q.push({ type: zh ? 'listenOrder' : 'speak', s: shuffleArr(sents)[0] });
  runQueue(u, q, S.lang);
}

/* ---------- trang chủ ---------- */
function moodLine(c) {
  const tx = todayXP(), st = streakNow(), any = Object.keys(S.done).length;
  if (!any) return 'Chào bạn! Mình là Mochi. Bấm vào viên tròn đang nhấp nháy để học bài đầu tiên nhé.';
  if (tx >= S.goal) return 'Đủ mục tiêu hôm nay rồi! Thêm một bài nữa để nhớ lâu hơn?';
  if (st >= 2) return `Chuỗi ${st} ngày rồi đó. Hôm nay mình đi tiếp nhé!`;
  const tips = ['Nói to thành tiếng giúp nhớ lâu gấp đôi đọc thầm.', 'Mỗi ngày 10 phút hiệu quả hơn 2 tiếng mỗi cuối tuần.', 'Bí kíp: nghe câu mẫu rồi nhại lại đúng nhịp.', 'Ôn thẻ đúng hạn giúp từ vựng vào trí nhớ dài hạn.'];
  return tips[new Date().getDate() % tips.length];
}
async function home() {
  const c = await course(S.lang);
  const L = curLevel(c), cur = currentPos(c);
  const name = acct ? acct.name : '';
  const hour = new Date().getHours(), hi = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const tot = L.units.length * LN, dn = L.units.reduce((a, u) => a + unitProgress(u.id), 0);
  shell('#/', `
  <section class="hello">
    <div class="oc-hero">${mascot({ size: 78, wave: !Object.keys(S.done).length })}</div>
    <div class="hl-t">
      <h1>${hi}${name ? ', ' + esc(name) : ''}</h1>
      <p class="say-bub">${esc(moodLine(c))}</p>
    </div>
  </section>
  ${cur.u ? `<button class="card cont" type="button"><span class="cont-ic" style="--uc:${ucol(S.lang, L.units.indexOf(cur.u))}">${I[LESSONS[cur.k].icon]}</span><span class="cont-t"><small>Học tiếp · ${esc(L.name)} · Chủ đề ${L.units.indexOf(cur.u) + 1}</small><b>${esc(cur.u.title)}: ${LESSONS[cur.k].name}</b></span><span class="btn acc">${I.play}<span>Học</span></span></button>` : ''}
  <div class="levels" role="tablist" aria-label="Chọn level">${c.levels.map((x) => { const t = x.units.length * LN, d = x.units.reduce((a, u) => a + unitProgress(u.id), 0); return `<button role="tab" data-lv="${x.id}" aria-selected="${x.id === L.id}"><b>${esc(x.name)}</b><span>${esc(x.short || '')}</span><span class="bar"><i style="width:${Math.round(d / t * 100)}%"></i></span></button>`; }).join('')}</div>
  <div class="level-intro"><div><h2>${esc(L.title)}</h2><p>${esc(L.desc || '')} <a class="rm-link" href="#/roadmap">Xem lộ trình chi tiết</a></p></div><div class="lv-pct"><b>${Math.round(dn / tot * 100)}%</b><small>${dn}/${tot} bài</small></div></div>
  <div id="path" class="path"></div>`, asideHTML(c));
  const pEl = app.querySelector('#path');
  const draw = () => {
    const W = Math.min(pEl.clientWidth || 360, 640);
    pEl.innerHTML = pathHTML(c, W);
    pEl.querySelectorAll('.seg.anim').forEach((p) => { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); });
    if (pEl.querySelector('.seg.anim, .node.pop-in')) setTimeout(() => sfx('build'), 300);
    pEl.querySelectorAll('.node').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sfx('tap'); if (b.classList.contains('open') && popClose) popClose(); else openPop(c, b); }));
    pEl.querySelectorAll('.cp').forEach((b) => b.addEventListener('click', () => { sfx('tap'); unitReview(c, b.dataset.u); }));
    pEl.querySelectorAll('.guide').forEach((b) => b.addEventListener('click', () => { sfx('open'); guidebook(c, b.dataset.u); }));
    pEl.querySelectorAll('.next-lv').forEach((b) => b.addEventListener('click', () => { sfx('tap'); S.level[S.lang] = b.dataset.lv; save(); home(); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    justBuilt = null;
  };
  draw();
  let rt, lastW = pEl.clientWidth;
  window.onresize = () => { clearTimeout(rt); rt = setTimeout(() => { if ((location.hash === '' || location.hash === '#/') && pEl.isConnected && pEl.clientWidth !== lastW) { lastW = pEl.clientWidth; justBuilt = null; draw(); } }, 150); };
  if (scrollToUnit) { const t = pEl.querySelector(`.unit[data-u="${scrollToUnit}"]`); scrollToUnit = null; if (t) setTimeout(() => t.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); }
  const curBtn = pEl.querySelector('.node.cur');
  if (curBtn && sessionStorage.getItem('dcl_scrolled') !== L.id + S.lang) { setTimeout(() => curBtn.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350); try { sessionStorage.setItem('dcl_scrolled', L.id + S.lang); } catch (e) {} }
  app.querySelectorAll('.levels button').forEach((b) => b.addEventListener('click', () => { sfx('tap'); S.level[S.lang] = b.dataset.lv; save(); home(); }));
  const cn = app.querySelector('.cont'); if (cn) cn.addEventListener('click', () => start(c, cur.u.id, cur.k));
}
function start(c, uid, k) {
  unlockAudio();
  const { u } = findUnit(c, uid);
  const before = questDone();
  runLesson({ unit: u, k, lang: S.lang, onExit: (r) => {
    if (r && r.done) { justBuilt = { unit: u.id, k }; if (unitProgress(u.id) === LN) toast('Hoàn thành chủ đề! Rương quà đã mở.'); }
    questCheer(before);
    if (location.hash !== '#/' && location.hash !== '') location.hash = '#/'; else home();
  } });
}
const questDone = () => quests().filter((q) => q.v >= q.n).length;
function questCheer(before) { const n = questDone(); if (n > before) { setTimeout(() => { sfx('quest'); toast(n === 3 ? 'Xong cả 3 nhiệm vụ hôm nay!' : 'Hoàn thành một nhiệm vụ hôm nay'); }, 500); } }

/* ---------- lộ trình chi tiết ---------- */
let scrollToUnit = null;
async function roadmap() {
  const c = await course(S.lang), zh = S.lang === 'zh', curL = curLevel(c);
  const totalU = c.levels.reduce((a, L) => a + L.units.length, 0), totalW = c.levels.reduce((a, L) => a + L.units.reduce((b, u) => b + u.words.length, 0), 0);
  shell('#/roadmap', `<div class="page-h"><h1>Lộ trình ${zh ? 'tiếng Trung' : 'tiếng Anh'}</h1><p>${c.levels.length} level · ${totalU} chủ đề · ${totalU * LN} bài · ${totalW} từ vựng. Mỗi chủ đề gồm 8 bài: 2 bài từ vựng, 2 bài hội thoại, đọc hiểu, 2 bài ngữ pháp và kiểm tra.</p></div>
  <div class="rm">${c.levels.map((L, li) => {
    const tot = L.units.length * LN, dn = L.units.reduce((a, u) => a + unitProgress(u.id), 0), pct = Math.round(dn / tot * 100);
    return `<details class="rm-lv card" ${L === curL ? 'open' : ''} style="--uc:${ucol(S.lang, li)}">
      <summary><span class="rm-badge">${esc(L.name)}</span><span class="rm-h"><b>${esc(L.title)}</b><small>${esc(L.short || '')} · ${L.units.length} chủ đề · ${tot} bài</small></span><span class="rm-pct"><b>${pct}%</b><span class="qbar"><i style="width:${pct}%"></i></span></span>${I.chev}</summary>
      <div class="rm-body">
        <p class="rm-desc">${esc(L.desc || '')}</p>
        ${L.goals && L.goals.length ? `<div class="rm-goals"><b>Học xong ${esc(L.name)}, bạn có thể:</b><ul>${L.goals.map((g) => `<li>${I.check}<span>${esc(g)}</span></li>`).join('')}</ul></div>` : ''}
        <ol class="rm-units">${L.units.map((u, i) => { const p = unitProgress(u.id); return `<li><button class="rm-u ${p === LN ? 'done' : p ? 'part' : ''}" type="button" data-lv="${L.id}" data-u="${u.id}">
          <span class="rm-n" style="--uc:${ucol(S.lang, i)}">${p === LN ? I.check : i + 1}</span>
          <span class="rm-t"><b>${esc(u.title)}</b><small>${esc(u.sub || '')} · ${u.words.length} từ · Ngữ pháp: ${esc(u.gram.title)}${u.gram2 ? ' / ' + esc(u.gram2.title) : ''}</small></span>
          <span class="rm-p">${p}/${LN}</span></button></li>`; }).join('')}</ol>
        <button class="btn ${L === curL ? 'ghost' : 'acc'} rm-go" type="button" data-lv="${L.id}">${L === curL ? 'Đang học level này' : 'Học ' + esc(L.name)}</button>
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
    shell('#/review', `<div class="page-h"><h1>Ôn tập</h1><p>Thẻ từ quay lại đúng lúc bạn sắp quên.</p></div>
    <div class="card empty">${mascot({ size: 92, mood: 'calm' })}<h2>${learned ? 'Chưa có thẻ nào đến hạn' : 'Chưa có thẻ nào'}</h2><p>${learned ? `Bạn đang có ${learned} từ trong bộ thẻ. Thẻ tiếp theo sẽ đến hạn sau.` : 'Học xong một bài Từ vựng, các từ mới sẽ vào đây.'}</p>${learned >= 4 ? '<button class="btn acc quick">Luyện nhanh 10 câu</button>' : '<a class="btn acc" href="#/">Đi học bài mới</a>'}</div>`, asideHTML(c));
    const q = app.querySelector('.quick'); if (q) q.addEventListener('click', () => quickPractice('mix'));
    return;
  }
  let i = 0, done = 0;
  const zh = S.lang === 'zh', before = questDone();
  shell('#/review', `<div class="page-h"><h1>Ôn tập</h1><p><b class="left">${list.length}</b> thẻ đến lượt. Chạm thẻ để lật.</p></div><div class="rv"></div>`, asideHTML(c));
  const box = app.querySelector('.rv');
  const one = () => {
    if (i >= list.length) { box.innerHTML = `<div class="card empty">${mascot({ size: 92, mood: 'wow' })}<h2>Ôn xong ${done} thẻ</h2><p>Hẹn gặp lại các thẻ này vào đúng lúc.</p><a class="btn acc" href="#/">Về trang học</a></div>`; sfx('done'); questCheer(before); return; }
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
  const unit = { id: 'practice', title: 'Luyện tập', words, dlg: { lines: [] }, read: { sents: [], q: [] }, gram: { ex: [], drill: [] } };
  let queue = [];
  if (kind === 'roleplay') { const u = shuffleArr(us)[0]; return runQueue(u, [{ type: 'dialogue' }, { type: 'roleplay' }], lang); }
  if (kind === 'listen') queue = shuffleArr(sents).slice(0, 8).map((s) => (zh ? { type: 'listenOrder', s } : { type: 'dictation', s }));
  else if (kind === 'speak') queue = shuffleArr(sents).slice(0, 6).map((s) => ({ type: 'speak', s }));
  else if (kind === 'write') queue = shuffleArr(words.filter((w) => strip(w.w).length <= 2)).slice(0, 6).map((w) => ({ type: 'write', w }));
  else queue = shuffleArr(words).slice(0, 10).map((w, i) => ({ type: ['meaning', 'listenWord', 'wordFromVi'][i % 3], w }));
  if (kind === 'mix' && sents.length) queue.splice(4, 0, { type: 'order', s: shuffleArr(sents)[0] });
  runQueue(unit, queue, lang);
}
async function readingLibrary() {
  const c = await course(S.lang);
  const rows = []; c.levels.forEach((L) => L.units.forEach((u) => rows.push({ L, u })));
  sheet(`<h2>Thư viện bài đọc</h2><p class="sub">Đọc lại, nghe lại các bài đọc theo level.</p><div class="list">${rows.map(({ L, u }) => `<button class="row" data-u="${u.id}" style="text-align:left;width:100%"><span class="grow"><b>${esc(u.read.title)}</b><small>${esc(L.name)} · ${esc(u.title)}</small></span>${unitProgress(u.id) ? I.check.replace('<svg', '<svg style="width:20px;color:var(--acc)"') : ''}</button>`).join('')}</div>`,
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
  const c = await course(S.lang);
  const zh = S.lang === 'zh';
  const tiles = [
    ['roleplay', 'roleplay', 'Đóng vai hội thoại', 'Bạn nói phần của một nhân vật, máy đọc phần còn lại. Luyện phản xạ như nói chuyện thật.', 1],
    ['speak', 'mic', 'Luyện nói', canListen() ? 'Đọc to câu, máy chấm độ khớp từng từ.' : 'Trình duyệt này chưa nghe được giọng nói. Dùng Chrome hoặc Edge.', 0],
    ['listen', 'ear', 'Nghe chép', zh ? 'Nghe câu rồi xếp lại chữ.' : 'Nghe câu tiếng Anh rồi gõ lại.', 0],
    ['mix', 'bolt', 'Luyện nhanh từ vựng', '10 câu trộn từ các bài đã học.', 0],
    ['read', 'read', 'Thư viện bài đọc', 'Đọc lại các bài, chạm từ để xem nghĩa.', 0],
    ...(zh ? [['write', 'brush', 'Viết chữ Hán', 'Viết theo thứ tự nét, có hướng dẫn.', 0]] : []),
    ['words', 'book', 'Từ đã học', 'Tra lại và nghe phát âm.', 0],
  ];
  shell('#/practice', `<div class="page-h"><h1>Luyện tập</h1><p>Chọn một kỹ năng, mỗi lượt vài phút. Câu hỏi lấy từ các bài bạn đã học.</p></div>
  <div class="tiles4">${tiles.map(([k, ic, t, d, big], i) => `<button class="card ptile ${big ? 'big' : ''}" data-k="${k}" style="--uc:${ucol(S.lang, i)}"><span class="ic">${I[ic]}</span><b>${t}</b><small>${d}</small>${big ? mascot({ size: 70, cls: 'pt-oc' }) : ''}</button>`).join('')}</div>`, asideHTML(c));
  app.querySelectorAll('.ptile').forEach((b) => b.addEventListener('click', () => { sfx('tap'); const k = b.dataset.k; if (k === 'read') readingLibrary(); else if (k === 'words') wordList(); else quickPractice(k); }));
}

/* ---------- tài khoản & cài đặt ---------- */
function syncText() { return !acct ? 'Chỉ lưu trên máy này' : sync.state === 'saving' ? 'Đang lưu…' : sync.state === 'err' ? 'Chưa lưu được, sẽ thử lại' : 'Đã lưu vào tài khoản'; }
async function me() {
  const voicesEn = listVoices('en'), voicesZh = listVoices('zh');
  shell('#/me', `<div class="page-h me-h"><span class="av big">${acct ? esc(initials(acct.name)) : I.user}</span><div><h1>${acct ? esc(acct.name) : 'Hồ sơ học'}</h1><p class="sync">${syncText()}</p></div></div>
  <div class="me-grid"><div class="list">
    <div class="card me-stats">
      <div><b>${streakNow()}</b><small>ngày liên tiếp</small></div>
      <div><b>${S.xp}</b><small>XP</small></div>
      <div><b>${Object.keys(S.srs).length}</b><small>từ đã học</small></div>
      <div><b>${S.minutes}′</b><small>thời gian</small></div>
    </div>
    <div class="row"><span class="grow"><b>Mục tiêu mỗi ngày</b><small>XP cần đạt để giữ chuỗi</small></span><select class="input goal" style="width:auto;height:42px">${[10, 20, 30, 50].map((g) => `<option value="${g}" ${S.goal === g ? 'selected' : ''}>${g} XP</option>`).join('')}</select></div>
    <label class="row"><span class="grow"><b>Âm thanh hiệu ứng</b><small>Tiếng đúng, sai, hoàn thành</small></span><span class="switch"><input type="checkbox" class="snd" ${S.settings.sound ? 'checked' : ''}><span></span></span></label>
    <div class="row"><span class="grow"><b>Tốc độ đọc</b><small>Giọng đọc mẫu</small></span><select class="input rate" style="width:auto;height:42px">${[[0.8, 'Chậm'], [0.95, 'Vừa'], [1.1, 'Nhanh']].map(([v, l]) => `<option value="${v}" ${S.settings.rate === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${voicesEn.length ? `<div class="row"><span class="grow"><b>Giọng tiếng Anh</b></span><select class="input vEn" style="width:auto;max-width:55%;height:42px"><option value="">Tự chọn</option>${voicesEn.map((v) => `<option ${S.settings.voice.en === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : ''}
    ${voicesZh.length ? `<div class="row"><span class="grow"><b>Giọng tiếng Trung</b></span><select class="input vZh" style="width:auto;max-width:55%;height:42px"><option value="">Tự chọn</option>${voicesZh.map((v) => `<option ${S.settings.voice.zh === v.name ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>` : `<div class="row"><span class="grow"><b>Giọng tiếng Trung</b><small>Máy này chưa có giọng đọc tiếng Trung. Trên Windows: Cài đặt › Thời gian và ngôn ngữ › Giọng nói, thêm Chinese (Simplified).</small></span></div>`}
    <div class="row"><span class="grow"><b>Micro & nhận giọng nói</b><small class="micst">Bấm để kiểm tra micro trước khi học</small></span><button class="btn ghost mtest" type="button" style="min-height:42px">${I.mic} Kiểm tra</button></div>
    <label class="row"><span class="grow"><b>Hiện pinyin</b><small>Phiên âm dưới chữ Hán</small></span><span class="switch"><input type="checkbox" class="pyx" ${S.settings.pinyin ? 'checked' : ''}><span></span></span></label>
    <label class="row"><span class="grow"><b>Giao diện tối</b><small>Dịu mắt khi học buổi tối</small></span><span class="switch"><input type="checkbox" class="dark" ${document.documentElement.dataset.theme === 'dark' ? 'checked' : ''}><span></span></span></label>
  </div>
  <div class="list">
    ${acct ? `<div class="card pad"><h3>Tài khoản</h3><p class="muted" style="margin:6px 0 12px">Đăng nhập tên <b>${esc(acct.name)}</b> và mã PIN trên máy khác để học tiếp.</p><div class="foot-row"><button class="btn ghost syncnow">${I.cloud} Lưu ngay</button><button class="btn ghost out">${I.logout} Đăng xuất</button></div></div>`
      : `<div class="card pad"><h3>Lưu tiến trình</h3><p class="muted" style="margin:6px 0 12px">Chỉ cần một cái tên và mã PIN 4–6 số. Không cần email hay số điện thoại.</p><button class="btn acc wide mk">Tạo tài khoản</button><button class="btn ghost wide lg" style="margin-top:10px">Tôi đã có tài khoản</button></div>`}
    <div class="card pad"><h3>Về khoá học</h3><p class="muted" style="font-size:.9rem;margin-top:6px">Tiếng Anh A1–C1 (50 chủ đề) và tiếng Trung HSK4–HSK6 (30 chủ đề), mỗi chủ đề 8 bài, xoay quanh giao tiếp công việc, nói chuyện với sếp, khách hàng và đời sống hằng ngày. Giọng đọc và chấm phát âm dùng tính năng có sẵn của trình duyệt; viết chữ Hán dùng thư viện mã nguồn mở Hanzi Writer.</p><button class="btn ghost wide wipe" style="margin-top:12px">Xoá tiến trình trên máy này</button></div>
  </div></div>`, null);
  const q = (s) => app.querySelector(s);
  q('.goal').addEventListener('change', (e) => { S.goal = +e.target.value; save(); toast('Đã đổi mục tiêu'); });
  q('.snd').addEventListener('change', (e) => { S.settings.sound = e.target.checked; save(); applySettings(); sfx('ok'); });
  q('.rate').addEventListener('change', (e) => { S.settings.rate = +e.target.value; save(); applySettings(); speak(S.lang === 'zh' ? '你好，我们开始吧。' : "Hello, let's get started.", S.lang); });
  const ve = q('.vEn'); if (ve) ve.addEventListener('change', (e) => { S.settings.voice.en = e.target.value; save(); applySettings(); speak('This is my voice.', 'en'); });
  const vz = q('.vZh'); if (vz) vz.addEventListener('change', (e) => { S.settings.voice.zh = e.target.value; save(); applySettings(); speak('这是我的声音。', 'zh'); });
  micState().then((st) => { const el = q('.micst'); if (el && st === 'denied') el.innerHTML = '<span style="color:var(--bad);font-weight:700">Micro đang bị chặn cho trang này</span>'; else if (el && st === 'granted') el.textContent = 'Đã cho phép micro'; });
  q('.mtest').addEventListener('click', micTest);
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
function micTest() {
  const lang = S.lang, sample = lang === 'zh' ? '你好，我是新同事。' : 'Hello, nice to meet you.';
  sheet(`<h2>Kiểm tra micro</h2><p class="sub">Bấm micro rồi đọc: <b class="${lang === 'zh' ? 'zh' : ''}">${esc(sample)}</b></p>
    <div class="mictest"><button class="mic" type="button" aria-label="Bấm để nói">${I.mic}</button><div class="heard">Vòng đỏ sẽ dao động theo giọng bạn.</div></div>`, (el) => {
    const mic = el.querySelector('.mic'), heard = el.querySelector('.heard');
    mic.addEventListener('click', async () => {
      if (mic.classList.contains('rec')) { stopListen(); return; }
      unlockAudio(); sfx('rec'); mic.classList.add('rec'); heard.textContent = 'Đang nghe…';
      try {
        const r = await listen(lang, { onPartial: (t) => { heard.textContent = t; }, onLevel: (v) => mic.style.setProperty('--lv', v.toFixed(3)) });
        mic.classList.remove('rec');
        if (r.text) { sfx('ok'); heard.innerHTML = `<b style="color:var(--ok)">Micro hoạt động tốt.</b><br>Máy nghe được: “${esc(r.text)}”`; }
        else heard.textContent = 'Chưa nghe thấy gì, thử nói to hơn.';
      } catch (e) { mic.classList.remove('rec'); sfx('bad'); heard.innerHTML = `<span class="mic-err">${esc(micMsg(e.message))}</span>${micBlocked(e.message) ? MIC_HELP : ''}`; }
    });
  });
}
function authForm(mode) {
  return `<div class="tabs2" role="group"><button data-m="new" aria-pressed="${mode === 'new'}">Tạo tài khoản</button><button data-m="login" aria-pressed="${mode === 'login'}">Đăng nhập</button></div>
  <form class="authf" style="margin-top:14px" novalidate>
    <div class="field"><label for="an">Tên của bạn</label><input class="input" id="an" autocomplete="username" maxlength="24" placeholder="Ví dụ: tuan.mitek" required /></div>
    <div class="field"><label for="ap">Mã PIN (4–6 số)</label><input class="input pin" id="ap" type="password" inputmode="numeric" autocomplete="${mode === 'new' ? 'new-password' : 'current-password'}" maxlength="6" placeholder="••••" required /></div>
    <p class="err" role="alert"></p>
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
function heroArt() {
  const P = [{ x: 30, y: 196 }, { x: 120, y: 176 }, { x: 210, y: 140 }, { x: 300, y: 128 }, { x: 390, y: 92 }, { x: 476, y: 58 }];
  const d = curveSegs(P).join(' '), col = ['var(--acc)', '#4C8DF6', '#9B6BEF', '#FF8A3D', '#2EB36A'];
  return `<svg class="hero-road" viewBox="0 0 520 230" aria-hidden="true">
    <path d="M0 200 Q130 150 260 178 T520 150 V230 H0Z" fill="var(--h2)" opacity=".8"/><path d="M0 222 Q160 190 320 210 T520 200 V230 H0Z" fill="var(--h3)" opacity=".8"/>
    <path d="${d}" fill="none" stroke="var(--road-edge)" stroke-width="30" stroke-linecap="round"/><path d="${d}" fill="none" stroke="var(--road)" stroke-width="26" stroke-linecap="round"/>
    <path class="wt" d="${d}" fill="none" stroke="var(--acc)" stroke-width="10" stroke-linecap="round"/>
    ${P.slice(1, 5).map((p, i) => `<g class="hn" style="--d:${0.5 + i * 0.25}s"><circle cx="${p.x}" cy="${p.y + 5}" r="19" fill="#000" opacity=".12"/><circle cx="${p.x}" cy="${p.y}" r="19" fill="${col[i]}"/><circle cx="${p.x - 6}" cy="${p.y - 7}" r="6" fill="#fff" opacity=".45"/><path d="M${p.x - 6} ${p.y} l4 4 8-9" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></g>`).join('')}
    <g class="hn" style="--d:1.6s">${CHEST.replace('<svg class="chest"', `<svg class="chest open" x="${P[5].x - 28}" y="${P[5].y - 44}" width="56" height="50"`)}</g>
  </svg>`;
}
async function welcome() {
  const [en, zh] = await Promise.all([course('en'), course('zh')]);
  let lang = S.lang || 'en';
  const lv = { en: S.level.en, zh: zh.levels.some((x) => x.id === S.level.zh) ? S.level.zh : zh.levels[0].id };
  const draw = () => {
    const c = lang === 'en' ? en : zh;
    document.documentElement.dataset.lang = lang;
    app.innerHTML = `<div class="welcome"><div class="w-hero">
      <div class="w-art">
        <div class="w-oc">${mascot({ size: 110, wave: true })}<span class="w-bub">Xin chào! Mình là Mochi. Mỗi ngày mình cùng đi thêm một đoạn đường nhé.</span></div>
        ${heroArt()}
        
      </div>
      <h1>Học tiếng Anh, tiếng Trung để nói được ở chỗ làm.</h1>
      <p class="lead">Lộ trình theo level, mỗi bài 5 phút: từ vựng, hội thoại với sếp và khách hàng, đọc hiểu, ngữ pháp, rồi đóng vai để luyện nói thành phản xạ.</p>
      <ul class="w-feat"><li>${I.roleplay}<span>Đóng vai hội thoại, máy chấm phát âm</span></li><li>${I.cards}<span>Thẻ ôn quay lại đúng lúc sắp quên</span></li><li>${I.flame}<span>Chuỗi ngày, nhiệm vụ, XP mỗi ngày</span></li></ul>
    </div>
    <div class="w-card card" data-lang="${lang}">
      <div class="pick" role="group" aria-label="Chọn ngôn ngữ"><button data-l="en" aria-pressed="${lang === 'en'}"><span class="big">English</span><small>A1 → C1 · 50 chủ đề</small></button><button data-l="zh" aria-pressed="${lang === 'zh'}"><span class="big zh">中文</span><small>HSK4 → HSK6 · 30 chủ đề</small></button></div>
      <div class="field"><label>Trình độ bắt đầu</label><div class="list">${c.levels.map((L) => `<button class="row lvp ${lv[lang] === L.id ? 'sel' : ''}" data-lv="${L.id}"><span class="lvn">${esc(L.name)}</span><span class="grow"><b>${esc(L.title)}</b><small>${esc(L.desc)}</small></span>${lv[lang] === L.id ? I.check : ''}</button>`).join('')}</div></div>
      <button class="btn acc wide go" type="button">Bắt đầu học</button>
      <button class="btn ghost wide have" type="button">Tôi đã có tài khoản</button>
    </div></div>`;
    app.querySelectorAll('.wt').forEach((p, i) => { const Ln = p.getTotalLength(); p.style.strokeDasharray = p.getAttribute('stroke-dasharray') ? '' : Ln; if (!p.getAttribute('stroke-dasharray')) { p.style.strokeDashoffset = Ln; p.animate([{ strokeDashoffset: Ln }, { strokeDashoffset: 0 }], { duration: 1300, delay: i * 180, easing: 'cubic-bezier(.6,.05,.3,1)', fill: 'forwards' }); } });
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
  const before = questDone();
  import('./lesson.js?v=6').then((m) => m.runCustom({ unit, queue, lang, onExit: () => { questCheer(before); render(); } }));
}

/* ---------- router ---------- */
async function render() {
  applySettings();
  document.getElementById('sheet-root').innerHTML = '';
  if (popClose) popClose();
  if (!S.onboarded) return welcome();
  const r = location.hash || '#/';
  try {
    if (r.startsWith('#/review')) await review();
    else if (r.startsWith('#/practice')) await practice();
    else if (r.startsWith('#/me')) await me();
    else if (r.startsWith('#/roadmap')) await roadmap();
    else await home();
  } catch (e) { console.error(e); app.innerHTML = `<div class="welcome"><div class="w-card card"><h1>Chưa tải được bài học</h1><p class="lead">Kiểm tra kết nối mạng rồi tải lại trang.</p><button class="btn acc" onclick="location.reload()">Tải lại</button></div></div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
onSync(() => { const el = document.querySelector('.sync'); if (el) el.textContent = syncText(); });
document.addEventListener('pointerdown', unlockAudio, { once: true });
render();
