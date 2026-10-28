// v23: BESTIE ADVENTURE — vượt ải cùng Bestie (2 người cùng online)
// Bản đồ rộng (kéo / cuộn để phóng to) với các vùng theo cấp độ. Mỗi vùng có 5 boss + 1 vua vùng (chấm đỏ).
// Đề lấy từ toàn bộ bài học của cấp đó, 4 kiểu vòng phối hợp: Đồng tâm · Mảnh ghép · Tiếp sức · Nối đôi.
// Người chưa có Bestie vẫn xem được bản đồ, kèm lời nhắc thêm Bestie.
import { I } from './icons.js?v=26';
import { S } from './store.js?v=26';
import { acct, call } from './account.js?v=26';
import { sfx } from './sound.js?v=26';
import { esc, toast, sheet, vipAv, online, shuffleArr, burst, confirmBox } from './ui.js?v=26';
import * as bestie from './bestie.js?v=26';
import * as gacha from './gacha.js?v=26';

let C = null;
export function init(ctx) {
  C = ctx;
  addEventListener('hashchange', () => { if (live && !location.hash.startsWith('#/adventure')) stopStage(true); });
}

/* ---------- dữ liệu bản đồ ---------- */
const MAPS = {
  en: {
    name: 'English', lvls: ['a1', 'a2', 'b1', 'b1p', 'b2', 'b2p', 'c1'],
    regions: [
      { name: 'Hello Meadows', lv: 'A1', diff: 'Easy', c: [300, 960], col: '#7bc67b', boss: ['Typo Goblin', 'Mumble Moth', 'Article Imp', 'Plural Pup', 'Lost Comma'], king: 'Greeting Golem' },
      { name: 'Grammar Grove', lv: 'A2', diff: 'Easy', c: [760, 760], col: '#5fb39a', boss: ['Tense Sprite', 'Preposition Fox', 'Spelling Wasp', 'Question Owl', 'Past-Tense Crab'], king: 'Old Oak of Rules' },
      { name: 'Phrasal Peaks', lv: 'B1', diff: 'Normal', c: [470, 420], col: '#69a4d8', boss: ['Get-Up Yeti', 'Look-After Lynx', 'Give-In Goat', 'Turn-Down Troll', 'Run-Out Ram'], king: 'Avalanche of Verbs' },
      { name: 'Idiom Isles', lv: 'B1+', diff: 'Normal', c: [980, 300], col: '#5d8fd6', boss: ['Piece-of-Cake Kraken', 'Raining Cats Squid', 'Break-a-Leg Gull', 'Under-the-Weather Eel', 'Spill-the-Beans Crab'], king: 'Captain Cliché' },
      { name: 'Tense Tundra', lv: 'B2', diff: 'Hard', c: [1400, 560], col: '#8e8fe0', boss: ['Perfect Wolf', 'Conditional Bear', 'Passive Seal', 'Reported Raven', 'Modal Moose'], king: 'Frost Giant of Time' },
      { name: 'Debate Desert', lv: 'B2+', diff: 'Hard', c: [1840, 300], col: '#d8a35d', boss: ['Hedging Scorpion', 'Linker Lizard', 'Counterpoint Cobra', 'Nuance Nomad', 'Register Vulture'], king: 'Sphinx of Arguments' },
      { name: 'Fluency Citadel', lv: 'C1', diff: 'Legend', c: [2040, 820], col: '#d26a7a', boss: ['Collocation Knight', 'Inversion Mage', 'Cleft Sentinel', 'Ellipsis Wraith', 'Nominal Archer'], king: 'The Eloquent Dragon' },
    ],
  },
  zh: {
    name: '中文', lvls: ['hsk1', 'hsk2', 'hsk3', 'hsk4', 'hsk5', 'hsk6'],
    regions: [
      { name: 'Pinyin Plains', lv: 'HSK 1', diff: 'Easy', c: [320, 940], col: '#7bc67b', boss: ['Tone Gremlin', 'Measure-Word Mouse', '吗 Moth', 'Number Ninja', 'Pinyin Pixie'], king: 'Panda of Hello' },
      { name: 'Tea Garden', lv: 'HSK 2', diff: 'Easy', c: [820, 720], col: '#5fb39a', boss: ['了 Lantern', '过 Ghost', 'Time-Word Turtle', '比 Badger', 'Direction Crane'], king: 'Tea Master Wu' },
      { name: 'Radical River', lv: 'HSK 3', diff: 'Normal', c: [520, 380], col: '#69a4d8', boss: ['把 Carp', '被 Heron', 'Complement Koi', 'Radical Otter', '得 Frog'], king: 'River Dragon King' },
      { name: 'Chengyu Cliffs', lv: 'HSK 4', diff: 'Hard', c: [1080, 260], col: '#8e8fe0', boss: ['马马虎虎 Horse', '一石二鸟 Hawk', '画蛇添足 Snake', '守株待兔 Rabbit', '对牛弹琴 Ox'], king: 'Sage of Proverbs' },
      { name: 'Dragon Gate', lv: 'HSK 5', diff: 'Hard', c: [1560, 520], col: '#d8a35d', boss: ['Formal-Register Fox', 'Connector Crane', 'Classifier Qilin', 'Essay Phoenix', 'Idiom Tiger'], king: 'Gatekeeper Long' },
      { name: 'Jade Summit', lv: 'HSK 6', diff: 'Legend', c: [2020, 760], col: '#d26a7a', boss: ['Classical Crow', 'Literary Lion', 'Nuance Nine-Tail', 'Scholar Spirit', 'Calligraphy Shade'], king: 'Jade Emperor' },
    ],
  },
};
const W = 2400, H = 1240;
const BOSS_POS = [[-120, -70], [-30, -150], [100, -110], [130, 40], [10, 120]];
const TYPES = {
  twin: { name: 'Twin answer', ic: '🫶', how: 'Both of you answer the same question. Both right = full damage; within 3 seconds of each other = ×1.25 sync bonus.' },
  split: { name: 'Puzzle pieces', ic: '🧩', how: 'One of you sees the clue, the other sees the choices. Talk in the chat and pick together.' },
  relay: { name: 'Relay sentence', ic: '🏃', how: 'Each of you holds half the words. Take turns placing them in the right order.' },
  link: { name: 'Double link', ic: '🔗', how: 'One sees words, the other sees meanings. Tap matching pairs within 5 seconds of each other.' },
};
const bossId = (map, r, n) => `${map}-${r}-${n}`;
const bossName = (map, r, n) => { const R = MAPS[map].regions[r - 1]; return n === 6 ? R.king : R.boss[n - 1]; };
const xpFor = (r, n, stars = 3) => Math.round((8 + 4 * r) * stars * (n === 6 ? 1.5 : 1));
let curMap = (() => { try { return localStorage.getItem('dcl_adv_map') || ''; } catch (e) { return ''; } })();
let M = null; // learn_adv_map
let view = { x: 0, y: 0, k: 1 };

const regionOpen = (map, r) => r === 1 || !!(M && M.progress && (M.progress[bossId(map, r - 1, 6)] || {}).stars);
const bossOpen = (map, r, n) => {
  if (!regionOpen(map, r)) return false;
  if (n < 6) return true;
  let b = 0; for (let i = 1; i <= 5; i++) if (((M && M.progress[bossId(map, r, i)]) || {}).stars) b++;
  return b >= 3;
};
const starsOf = (map, r, n) => ((M && M.progress && M.progress[bossId(map, r, n)]) || {}).stars || 0;

// đường viền vùng: một "hòn đảo" mềm, cố định theo hạt giống
function blob(cx, cy, rad, seed) {
  let s = seed * 9301 + 49297; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const n = 14, pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, r = rad * (0.82 + rnd() * 0.32); pts.push([cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r]); }
  let d = `M${((pts[0][0] + pts[n - 1][0]) / 2).toFixed(1)},${((pts[0][1] + pts[n - 1][1]) / 2).toFixed(1)}`;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; d += ` Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)},${((p[1] + q[1]) / 2).toFixed(1)}`; }
  return d + 'Z';
}

function mapSVG(map) {
  const D = MAPS[map], R = D.regions;
  let path = `M${R[0].c[0]},${R[0].c[1]}`; for (let i = 1; i < R.length; i++) { const a = R[i - 1].c, b = R[i].c; path += ` Q${(a[0] + b[0]) / 2 + (i % 2 ? 90 : -90)},${(a[1] + b[1]) / 2 + (i % 2 ? -60 : 60)} ${b[0]},${b[1]}`; }
  let front = 1; for (let r = 1; r <= R.length; r++) if (regionOpen(map, r)) front = r;
  const deco = []; let s = map === 'zh' ? 7 : 3;
  for (let i = 0; i < 70; i++) { s = (s * 9301 + 49297) % 233280; const x = (s / 233280) * W; s = (s * 9301 + 49297) % 233280; const y = (s / 233280) * H; deco.push(`<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" class="adv-deco">${map === 'zh' ? ['🎋', '⛰️', '🏯', '🌊', '🍵'][i % 5] : ['🌲', '⛰️', '🏰', '🌊', '🌵'][i % 5]}</text>`); }
  return `<svg class="adv-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="${esc(D.name)} adventure map">
    <defs><radialGradient id="advsea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="var(--adv-sea1)"/><stop offset="1" stop-color="var(--adv-sea2)"/></radialGradient>
      <filter id="advsh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity=".25"/></filter></defs>
    <g class="adv-cam">
      <rect x="-600" y="-600" width="${W + 1200}" height="${H + 1200}" fill="url(#advsea)"/>
      <g class="adv-decos">${deco.join('')}</g>
      <path d="${path}" class="adv-road"/>
      ${R.map((g, i) => { const r = i + 1, open = regionOpen(map, r); return `<g class="adv-reg ${open ? 'open' : 'locked'}" data-r="${r}">
        <path d="${blob(g.c[0], g.c[1], 205, r * 7 + (map === 'zh' ? 3 : 0))}" fill="${g.col}" filter="url(#advsh)" class="adv-land"/>
        <text x="${g.c[0]}" y="${g.c[1] + 196}" class="adv-rn">${esc(g.name)}</text>
        <text x="${g.c[0]}" y="${g.c[1] + 226}" class="adv-rl">${esc(g.lv)} · ${esc(g.diff)}</text>
        ${[1, 2, 3, 4, 5, 6].map((n) => { const p = n === 6 ? [0, 0] : BOSS_POS[n - 1], x = g.c[0] + p[0], y = g.c[1] + p[1], st = starsOf(map, r, n), ok = bossOpen(map, r, n);
          return `<g class="adv-boss ${n === 6 ? 'king' : ''} ${st ? 'beat' : ''} ${ok ? '' : 'shut'}" data-b="${r}-${n}" transform="translate(${x},${y})" tabindex="0" role="button" aria-label="${esc(bossName(map, r, n))}">
            <circle r="${n === 6 ? 34 : 22}" class="adv-ring"/><circle r="${n === 6 ? 22 : 13}" class="adv-dot"/>
            ${n === 6 ? '<text y="-38" class="adv-crown">👑</text>' : ''}
            ${st ? `<text y="${n === 6 ? 54 : 40}" class="adv-st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</text>` : ''}
          </g>`; }).join('')}
        ${open ? '' : `<g class="adv-fog"><path d="${blob(g.c[0], g.c[1], 205, r * 7 + (map === 'zh' ? 3 : 0))}"/><text x="${g.c[0]}" y="${g.c[1] + 18}" class="adv-lock">🔒</text></g>`}
      </g>`; }).join('')}
      <g class="adv-us" transform="translate(${R[front - 1].c[0] - 150},${R[front - 1].c[1] - 250}) scale(2)">
        <foreignObject x="0" y="0" width="150" height="56"><div xmlns="http://www.w3.org/1999/xhtml" class="adv-pair">${acct ? vipAv(acct.name, acct.avatar, 0) : ''}${M && M.bestie ? `<i>${I.heart}</i>${vipAv(M.bestie.name, M.bestie.avatar, M.bestie.vip || 0)}` : ''}</div></foreignObject>
      </g>
    </g></svg>`;
}

/* ---------- trang ---------- */
export async function page(args = []) {
  const route = '#/adventure';
  if (args[0] === 'play' && args[1]) { if (!acct) return C.authSheet('login'); openStage(+args[1]); }
  if (!curMap) curMap = S.lang === 'zh' ? 'zh' : 'en';
  if (args[0] === 'en' || args[0] === 'zh') curMap = args[0];
  if (!acct) {
    M = { ok: true, nobestie: true, progress: {}, friends: 0, guest: true };
  } else {
    C.shell(route, '<div class="panel empty"><span class="spin"></span></div>');
    try { M = await call('learn_adv_map', { p_map: curMap }); } catch (e) { M = { ok: true, nobestie: true, progress: {}, err: e.message }; }
    if (!location.hash.startsWith('#/adventure')) return;
  }
  M.progress = M.progress || {};
  const nb = !!M.nobestie, bb = M.bestie, D = MAPS[curMap];
  const beaten = Object.values(M.progress).filter((x) => x.stars).length, total = D.regions.length * 6;
  const banner = nb
    ? `<div class="adv-note panel">${I.heart}<div class="grow"><b>Bestie Adventure is played in pairs.</b><small>${!acct ? 'Create an account, add a friend and make them your Bestie to play. You can look around the map now.' : M.friends ? 'Pick one of your friends as your Bestie to start fighting bosses together. You can look around the map now.' : 'Add a friend first, then make them your Bestie. You can look around the map now.'}</small></div>${acct ? `<a class="btn acc sm" href="${M.friends ? '#/bestie' : '#/friends'}">${M.friends ? 'Choose a Bestie' : 'Add a friend'}</a>` : '<button class="btn acc sm adv-acc" type="button">Create account</button>'}</div>`
    : `<div class="adv-note panel ok">${vipAv(bb.name, bb.avatar, bb.vip || 0)}<div class="grow"><b>You ${I.heart} ${esc(bb.name)}</b><small>${online(bb.last_seen) ? '<b class="ok">Online now</b> · tap a red dot to fight together' : `Offline · both of you must be online to fight`} · ${beaten}/${total} bosses · ${M.total || 0} ★${M.rank ? ` · #${M.rank.rank} this week` : ''}</small></div>${online(bb.last_seen) ? '' : '<button class="btn sm ghost adv-nudge" type="button">Send a nudge</button>'}</div>`;
  const open = M.open;
  const openBar = !open ? '' : `<div class="adv-open panel">${I.swords}<div class="grow"><b>${open.state === 'invite' ? (open.mine ? 'Waiting for your Bestie to join…' : `${esc(bb ? bb.name : 'Your Bestie')} invited you!`) : 'Your battle is in progress'}</b><small>${esc(bossName(open.map, +open.boss.split('-')[1], +open.boss.split('-')[2]))}</small></div>${!open.mine && open.state === 'invite' ? '<button class="btn acc sm adv-join" type="button">Join</button>' : '<button class="btn acc sm adv-back" type="button">Open</button>'}</div>`;
  C.shell(route, `<div class="page-h"><div><h1 class="serif">Bestie Adventure</h1><p>Explore the map with your Bestie and beat the red-dot bosses together. Every boss needs teamwork: shared answers, split clues, relay sentences and double links.</p></div>
    <div class="seg adv-maps" role="tablist">${['en', 'zh'].map((m) => `<button type="button" data-m="${m}" aria-pressed="${curMap === m}" class="${m === 'zh' ? 'zh' : ''}">${MAPS[m].name}</button>`).join('')}</div></div>
    ${banner}${openBar}
    <div class="adv-wrap ${nb ? 'viewonly' : ''}"><div class="adv-map">${mapSVG(curMap)}</div>
      <div class="adv-tools"><button class="icon-btn adv-zi" type="button" title="Zoom in">${I.plus}</button><button class="icon-btn adv-zo" type="button" title="Zoom out">−</button><button class="icon-btn adv-zr" type="button" title="Fit map">⤢</button></div>
</div>
    <div class="adv-legend"><span><i class="lg-d"></i>Boss</span><span>👑 Region king</span><span>★ Your best</span><span>🔒 Beat the king to open the next region</span><span>Drag to move · scroll or +/− to zoom</span></div>
    <div class="adv-info">
      <section class="panel pad"><h3 class="sec-h">${I.sparkle} How a battle works</h3><div class="adv-types">${Object.values(TYPES).map((t) => `<div><b>${t.ic} ${t.name}</b><small>${t.how}</small></div>`).join('')}</div>
        <p class="muted" style="font-size:.85rem;margin-top:10px">The boss has 100 HP and your team has 3 hearts. Keep more hearts for more stars. Beat 3 bosses to wake the region king; beat the king to open the next region.</p></section>
      <section class="panel pad"><h3 class="sec-h">${I.gift} Chest rewards</h3><ul class="adv-rw"><li>XP for both of you: more in harder regions, ×stars, ×1.5 for kings (first 10 wins a day)</li><li>Bestie effects for your quiz and class high-fives (kings always drop one)</li><li>A lucky spin ticket each the first time you beat a region king</li><li>Stars count for the weekly <a href="#" class="adv-rank">Bestie ranking</a> (top 10 pairs get a spin ticket every Monday 16:00)</li></ul></section>
    </div>`);
  const app = document.getElementById('app');
  app.querySelectorAll('.adv-maps button').forEach((b) => b.addEventListener('click', () => { curMap = b.dataset.m; view = { x: 0, y: 0, k: 1 }; try { localStorage.setItem('dcl_adv_map', curMap); } catch (e) {} sfx('tap'); page(); }));
  const ac = app.querySelector('.adv-acc'); if (ac) ac.addEventListener('click', () => C.authSheet('new'));
  const nu = app.querySelector('.adv-nudge'); if (nu) nu.addEventListener('click', async () => { try { await call('learn_bestie_nudge'); toast(`Nudge sent to ${bb.name}`); nu.disabled = true; } catch (e) { toast(e.message); } });
  const rkl = app.querySelector('.adv-rank'); if (rkl) rkl.addEventListener('click', (e) => { e.preventDefault(); if (C.showRank) C.showRank('bestie'); });
  const jb = app.querySelector('.adv-join'); if (jb) jb.addEventListener('click', () => join(open.id));
  const bk = app.querySelector('.adv-back'); if (bk) bk.addEventListener('click', () => openStage(open.id));
  wireMap(app.querySelector('.adv-map'));
}

function wireMap(box) {
  const svg = box.querySelector('svg'), cam = svg.querySelector('.adv-cam');
  const apply = () => { cam.setAttribute('transform', `translate(${view.x},${view.y}) scale(${view.k})`); };
  const fit = () => { view = { x: 0, y: 0, k: 1, set: 1 }; apply(); };
  if (!view.set) { const fr = svg.querySelector('.adv-us'); const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(fr ? fr.getAttribute('transform') : ''); const cx = m ? +m[1] + 150 : W / 2, cy = m ? +m[2] + 250 : H / 2; const k = innerWidth < 700 ? 1.8 : 1.25; view = { k, x: W / 2 - cx * k, y: H / 2 - cy * k, set: 1 }; view.x = Math.min(0, Math.max(W - W * k, view.x)); view.y = Math.min(0, Math.max(H - H * k, view.y)); }
  const zoom = (f, cx = W / 2, cy = H / 2) => { const k = Math.max(0.8, Math.min(3.2, view.k * f)); view.x = cx - (cx - view.x) * (k / view.k); view.y = cy - (cy - view.y) * (k / view.k); view.k = k; apply(); };
  const toSvg = (e) => { const r = svg.getBoundingClientRect(), s = Math.min(r.width / W, r.height / H), ox = (r.width - W * s) / 2, oy = (r.height - H * s) / 2; return [(e.clientX - r.left - ox) / s, (e.clientY - r.top - oy) / s, s]; };
  apply();
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = toSvg(e); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
  let drag = null, moved = 0;
  svg.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; moved = 0; });
  addEventListener('pointermove', (e) => { if (!drag || !svg.isConnected) return; const s = toSvg(e)[2]; const dx = (e.clientX - drag.x) / s, dy = (e.clientY - drag.y) / s; moved = Math.max(moved, Math.abs(dx) + Math.abs(dy)); if (moved > 6) { svg.classList.add('dragging'); view.x = drag.vx + dx; view.y = drag.vy + dy; apply(); } });
  addEventListener('pointerup', () => { drag = null; svg.classList.remove('dragging'); });
  box.parentElement.querySelector('.adv-zi').addEventListener('click', () => zoom(1.3));
  box.parentElement.querySelector('.adv-zo').addEventListener('click', () => zoom(1 / 1.3));
  box.parentElement.querySelector('.adv-zr').addEventListener('click', fit);
  svg.querySelectorAll('.adv-boss').forEach((g) => {
    const go = () => { if (moved > 6) return; const [r, n] = g.dataset.b.split('-').map(Number); bossSheet(r, n); };
    g.addEventListener('click', go); g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
  svg.querySelectorAll('.adv-fog').forEach((f) => f.addEventListener('click', () => { if (moved > 6) return; const r = +f.closest('.adv-reg').dataset.r; toast(`Beat the king of ${MAPS[curMap].regions[r - 2].name} to open ${MAPS[curMap].regions[r - 1].name}.`); }));
}

function bossSheet(r, n) {
  const map = curMap, R = MAPS[map].regions[r - 1], name = bossName(map, r, n), st = starsOf(map, r, n), ok = bossOpen(map, r, n), nb = !!M.nobestie, bb = M.bestie;
  const rounds = roundsFor(n), why = !regionOpen(map, r) ? `Beat ${MAPS[map].regions[r - 2].king} to open this region.` : !ok ? 'Beat any 3 bosses in this region to wake the king.' : '';
  sfx('open');
  sheet(`<div class="adv-bs"><div class="adv-bh"><span class="adv-bic ${n === 6 ? 'king' : ''}">${n === 6 ? '👑' : '👾'}</span><div><h2>${esc(name)}</h2><p class="sub">${esc(R.name)} · ${esc(R.lv)} · ${esc(R.diff)}${n === 6 ? ' · Region king' : ''}</p>
      <div class="pf-tags"><span>${rounds} rounds</span><span>100 HP</span><span>3 ${I.heart}</span>${st ? `<span>Best ${'★'.repeat(st)}</span>` : ''}</div></div></div>
    <div class="adv-chest"><b>${I.gift} Chest</b><span>Up to ${xpFor(r, n)} XP each</span>${n === 6 ? `<span>Bestie effect (${r >= 5 ? 'legendary' : r >= 3 ? 'epic' : 'rare'})</span>${st ? '' : '<span>Lucky spin ticket (first clear)</span>'}` : '<span>Chance of a Bestie effect</span>'}</div>
    ${why ? `<p class="adv-why">${I.lock || '🔒'} ${esc(why)}</p>` : ''}
    <div class="adv-bact"></div></div>`, (el, close) => {
    const box = el.querySelector('.adv-bact');
    if (nb) { box.innerHTML = acct ? `<p class="muted">You need a Bestie to fight. ${M.friends ? 'Pick one of your friends.' : 'Add a friend first, then make them your Bestie.'}</p><a class="btn acc wide" href="${M.friends ? '#/bestie' : '#/friends'}">${M.friends ? 'Choose a Bestie' : 'Add a friend'}</a>` : '<button class="btn acc wide" type="button">Create an account</button>'; const b = box.querySelector('button'); if (b) b.addEventListener('click', () => { close(); C.authSheet('new'); }); const a = box.querySelector('a'); if (a) a.addEventListener('click', close); return; }
    if (!ok) { box.innerHTML = '<button class="btn wide" type="button" disabled>Locked</button>'; return; }
    const on = online(bb.last_seen);
    box.innerHTML = `<button class="btn acc wide adv-go" type="button" ${on ? '' : 'disabled'}>${I.swords} Invite ${esc(bb.name)} &amp; fight</button>${on ? '' : `<p class="muted" style="margin-top:8px;font-size:.88rem">${esc(bb.name)} is offline. Both of you need to be online.</p><button class="btn ghost wide adv-nd" type="button">Send a nudge</button>`}`;
    const nd = box.querySelector('.adv-nd'); if (nd) nd.addEventListener('click', async () => { try { await call('learn_bestie_nudge'); toast('Nudge sent'); nd.disabled = true; } catch (e) { toast(e.message); } });
    const go = box.querySelector('.adv-go');
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = 'Preparing questions…';
      let rs; try { rs = await makeRounds(map, r, n); } catch (e) { toast('Could not load the lessons. Try again.'); go.disabled = false; return; }
      try {
        const j = await call('learn_adv_start', { p_boss: bossId(map, r, n), p_rounds: rs });
        if (!j.ok) { toast({ offline: `${bb.name} is not online right now.`, locked: 'This boss is still locked.', nobestie: 'You need a Bestie first.', noquestions: 'Not enough questions here yet.' }[j.error] || j.error); go.disabled = false; go.innerHTML = `${I.swords} Try again`; return; }
        close(); sfx('ok'); openStage(j.id);
      } catch (e) { toast(e.message); go.disabled = false; }
    });
  }, 'adv-sh');
}

/* ---------- tạo đề từ bài học ---------- */
const roundsFor = (n) => Math.min(12, 6 + Math.ceil(n / 2) + (n === 6 ? 1 : 0));
async function makeRounds(map, r, n) {
  const c = await C.course(map), L = c.levels.find((x) => x.id === MAPS[map].lvls[r - 1]) || c.levels[Math.min(r - 1, c.levels.length - 1)];
  const zh = map === 'zh', units = L.units, words = units.flatMap((u) => u.words || []).filter((w) => w && w.w && w.vi);
  const sents = units.flatMap((u) => [...((u.dlg && u.dlg.lines) || []), ...((u.dlg2 && u.dlg2.lines) || []), ...((u.read && u.read.sents) || [])])
    .map((s) => ({ vi: s.vi, tk: zh ? s.tk : String(s.t || '').split(/\s+/).filter(Boolean) })).filter((s) => s.vi && Array.isArray(s.tk) && s.tk.length >= (n >= 4 ? 5 : 4) && s.tk.length <= (n >= 4 ? 11 : 8));
  const drills = units.flatMap((u) => [u.gram, u.gram2].filter(Boolean).flatMap((g) => (g.drill || []).map((d) => ({ ...d, title: g.title })))).filter((d) => d.opts && d.opts.length >= 3);
  const reads = units.flatMap((u) => ((u.read && u.read.q) || []).map((q) => ({ ...q, title: u.read.title }))).filter((q) => q.opts && q.opts.length >= 3);
  const shuf = (opts, a) => { const o = opts.slice(0, 4); if (a >= o.length) { o[o.length - 1] = opts[a]; a = o.length - 1; } const idx = shuffleArr(o.map((_, i) => i)); return { opts: idx.map((i) => o[i]), a: idx.indexOf(a) }; };
  const pickW = (k, not = []) => shuffleArr(words.filter((w) => !not.includes(w.w))).slice(0, k);
  const total = roundsFor(n), types = [];
  const base = ['twin', 'split', 'relay', 'link'];
  while (types.length < total) types.push(...shuffleArr(base));
  types.length = total;
  const used = new Set(), out = [];
  for (const t of types) {
    if (t === 'twin') {
      const useG = drills.length && Math.random() < 0.45;
      if (useG) { const d = drills[Math.floor(Math.random() * drills.length)]; out.push({ type: 'twin', q: d.t.replace(/_{2,}/g, '_____'), ...shuf(d.opts, d.a), note: d.title, zh }); continue; }
      const w = pickW(1, [...used])[0]; if (!w) continue; used.add(w.w); const o = pickW(3, [w.w]).filter((x) => x.vi !== w.vi);
      if (Math.random() < 0.5) out.push({ type: 'twin', q: `What does “${w.w}”${zh && w.py ? ` (${w.py})` : ''} mean?`, ...shuf([w.vi, ...o.map((x) => x.vi)], 0), note: w.ex || '', zh });
      else out.push({ type: 'twin', q: `Which word means “${w.vi}”?`, ...shuf([w.w, ...o.map((x) => x.w)], 0), note: zh ? w.py || '' : w.ipa || '', zh });
    } else if (t === 'split') {
      const r2 = Math.random();
      if (drills.length && r2 < 0.4) { const d = drills[Math.floor(Math.random() * drills.length)]; out.push({ type: 'split', q: d.t.replace(/_{2,}/g, '_____'), ...shuf(d.opts, d.a), note: d.title, zh }); continue; }
      if (reads.length && n >= 3 && r2 < 0.6) { const q = reads[Math.floor(Math.random() * reads.length)]; out.push({ type: 'split', q: `${q.title}: ${q.q}`, ...shuf(q.opts, q.a), note: '', zh }); continue; }
      const w = pickW(1, [...used])[0]; if (!w) continue; used.add(w.w); const o = pickW(3, [w.w]);
      out.push({ type: 'split', q: `Meaning: “${w.vi}”${w.exVi ? ` — e.g. “${w.exVi}”` : ''}`, ...shuf([w.w, ...o.map((x) => x.w)], 0), note: 'Describe it to your Bestie', zh });
    } else if (t === 'relay') {
      if (!sents.length) continue; const s = sents[Math.floor(Math.random() * sents.length)]; out.push({ type: 'relay', vi: s.vi, tk: s.tk, zh });
    } else if (t === 'link') {
      const k = n >= 4 ? 5 : 4, ws = []; const seen = new Set();
      for (const w of shuffleArr(words)) { if (seen.has(w.vi) || seen.has(w.w)) continue; seen.add(w.vi); seen.add(w.w); ws.push(w); if (ws.length >= k) break; }
      if (ws.length < 3) continue;
      const order = shuffleArr(ws.map((_, i) => i)); // means[j] = ws[order[j]].vi
      out.push({ type: 'link', words: ws.map((w) => w.w), means: order.map((i) => ws[i].vi), a: ws.map((_, i) => order.indexOf(i)), zh });
    }
  }
  return out;
}

/* ---------- lời mời (người được mời) ---------- */
export function invite(a) {
  if (!a || !a.id || live) return;
  const until = Date.now() + 88000;
  sfx('quest');
  const el = document.createElement('div'); el.className = 'adv-inv panel solid'; el.setAttribute('role', 'alertdialog');
  const [m, r, n] = String(a.boss).split('-'); const nm = MAPS[m] ? bossName(m, +r, +n) : 'a boss';
  el.innerHTML = `<div class="adv-inv-h">${vipAv(a.host, a.host_avatar, 0)}<div class="grow"><b>${esc(a.host)} wants to fight together!</b><small>Bestie Adventure · ${esc(nm)} · <span class="adv-cd">90</span>s</small></div></div><div class="adv-inv-b"><button class="btn ghost sm adv-no" type="button">Not now</button><button class="btn acc sm adv-yes" type="button">${I.swords} Join</button></div>`;
  document.body.appendChild(el);
  const t = setInterval(() => { const s = Math.ceil((until - Date.now()) / 1000); const cd = el.querySelector('.adv-cd'); if (cd) cd.textContent = Math.max(0, s); if (s <= 0) done(); }, 500);
  const done = () => { clearInterval(t); el.classList.add('out'); setTimeout(() => el.remove(), 250); };
  el.querySelector('.adv-yes').addEventListener('click', () => { done(); join(a.id); });
  el.querySelector('.adv-no').addEventListener('click', async () => { done(); try { await call('learn_adv_join', { p_id: a.id, p_accept: false }); } catch (e) {} });
}
async function join(id) {
  try { const j = await call('learn_adv_join', { p_id: id, p_accept: true }); if (!j.ok) { toast(j.error === 'expired' ? 'This invitation has expired.' : 'Could not join.'); return; } sfx('levelup'); openStage(id); } catch (e) { toast(e.message); }
}

/* ---------- màn đánh boss ---------- */
let live = null; // { id, el, t, s, sig, chatN, busy }
const QUICK = ['Ready!', 'I think it’s…', 'Your turn!', 'Hurry!', 'Nice one! 🙌', 'Sorry! 😅', 'Wait…'];
function stopStage(leave) {
  if (!live) return;
  clearInterval(live.t); clearInterval(live.tt);
  if (leave && live.s && ['invite', 'play'].includes(live.s.state)) call('learn_adv_act', { p_id: live.id, p_act: { t: 'leave' } }).catch(() => {});
  live.el.remove(); document.body.classList.remove('adv-on'); live = null;
}
function openStage(id) {
  if (live && live.id === id) return; if (live) stopStage(false);
  document.getElementById('sheet-root').innerHTML = '';
  const el = document.createElement('div'); el.className = 'adv-stage';
  el.innerHTML = `<div class="as-top"><button class="icon-btn as-x" type="button" title="Leave battle">${I.x}</button><div class="as-boss"><b class="as-bn">Boss</b><div class="as-hp"><i style="width:100%"></i><span>100</span></div></div><div class="as-hearts"></div></div>
    <div class="as-mid"><div class="as-round"></div></div>
    <div class="as-chat"><div class="as-msgs"></div><div class="as-quick">${QUICK.map((q) => `<button type="button" class="chip">${esc(q)}</button>`).join('')}</div><form class="as-in"><input class="input" maxlength="140" placeholder="Message your Bestie…" aria-label="Message"><button class="btn acc sm" type="submit">Send</button></form></div>`;
  document.body.appendChild(el); document.body.classList.add('adv-on');
  live = { id, el, s: null, sig: '', chatN: -1, busy: false, t: 0, tt: 0 };
  if (!location.hash.startsWith('#/adventure')) history.replaceState(null, '', '#/adventure');
  el.querySelector('.as-x').addEventListener('click', async () => {
    if (live && live.s && ['won', 'lost', 'left', 'expired', 'declined'].includes(live.s.state)) { stopStage(false); page(); return; }
    if (!(await confirmBox('Leave this battle?', 'Your Bestie will be left alone and the battle ends.', 'Leave', true))) return; stopStage(true); page();
  });
  const send = (m) => { m = (m || '').trim(); if (!m || !live) return; call('learn_adv_act', { p_id: id, p_act: { t: 'chat', m } }).then(poll).catch(() => {}); };
  el.querySelectorAll('.as-quick .chip').forEach((b) => b.addEventListener('click', () => { sfx('tap'); send(b.textContent); }));
  el.querySelector('.as-in').addEventListener('submit', (e) => { e.preventDefault(); const i = e.currentTarget.querySelector('input'); send(i.value); i.value = ''; });
  const poll = async () => {
    if (!live || live.busy) return; live.busy = true;
    try { const j = await call('learn_adv_state', { p_id: id }); if (live && j && j.ok) draw(j.s); else if (j && !j.ok) { toast('This battle is no longer available.'); stopStage(false); } } catch (e) {}
    if (live) live.busy = false;
  };
  live.poll = poll;
  poll(); live.t = setInterval(poll, 700);
  live.tt = setInterval(timer, 200);
}
const act = (a) => { if (!live) return Promise.resolve(); return call('learn_adv_act', { p_id: live.id, p_act: a }).then((j) => { if (j && !j.ok && j.error === 'answered') toast('Already answered'); return live && live.poll && live.poll(); }).catch((e) => toast(e.message)); };

function timer() {
  if (!live || !live.s) return; const s = live.s, el = live.el, bar = el.querySelector('.as-time i'), lab = el.querySelector('.as-time span'), cd = el.querySelector('.as-cd');
  const now = Date.now(), st = live.startAt || now;
  if (cd) { const left = Math.ceil((st - now) / 1000); cd.textContent = left > 0 ? left : 'Go!'; }
  if (bar && s.round && s.state === 'play') { const tot = s.round.secs * 1000, rem = Math.max(0, tot - (now - st)); bar.style.width = (rem / tot * 100) + '%'; if (lab) lab.textContent = Math.ceil(rem / 1000) + 's'; bar.classList.toggle('low', rem < 6000); }
  if (s.state === 'invite') { const w = el.querySelector('.as-wt'); if (w) w.textContent = Math.max(0, Math.ceil((live.inviteUntil - now) / 1000)); }
}

function draw(s) {
  const prev = live.s; live.s = s; const el = live.el, me = s.role, mate = me === 'h' ? s.guest : s.host;
  const [m, r, n] = s.boss.split('-'); const R = MAPS[m].regions[+r - 1];
  if (s.starts_in_ms != null && (!prev || prev.ridx !== s.ridx || !live.startAt)) live.startAt = Date.now() + s.starts_in_ms;
  if (s.state === 'invite' && !live.inviteUntil) live.inviteUntil = Date.now() + 90000;
  el.style.setProperty('--reg', R.col);
  el.querySelector('.as-bn').innerHTML = `${+n === 6 ? '👑 ' : ''}${esc(bossName(m, +r, +n))} <small>${esc(R.name)} · ${esc(R.lv)}</small>`;
  const hp = el.querySelector('.as-hp'); hp.querySelector('i').style.width = s.hp + '%'; hp.querySelector('span').textContent = `${s.hp} HP`;
  el.querySelector('.as-hearts').innerHTML = [0, 1, 2].map((i) => `<i class="${i < s.hearts ? 'on' : ''}">${I.heart}</i>`).join('') + `<span class="as-mate">${vipAv(mate.name, mate.avatar, 0)}<small class="${s.other_seen_ms < 6000 ? 'ok' : 'warn'}">${esc(mate.name)}${s.other_seen_ms < 6000 ? '' : ' · reconnecting…'}</small></span>`;
  // hiệu ứng khi vòng trước được chấm
  if (prev && s.last && (!prev.last || prev.last.r !== s.last.r)) roundFx(s.last, prev.hp - s.hp);
  // chat
  const ch = s.chat || [];
  if (ch.length !== live.chatN) { live.chatN = ch.length; const box = el.querySelector('.as-msgs'); box.innerHTML = ch.slice(-30).map((x) => `<div class="am ${x.from === me ? 'me' : ''}"><b>${esc(x.from === me ? 'You' : x.name)}</b> ${esc(x.m)}</div>`).join('') || '<p class="muted am-e">Chat with your Bestie here. Puzzle-piece rounds need it!</p>'; box.scrollTop = box.scrollHeight; if (prev && ch.length && ch[ch.length - 1].from !== me) sfx('tap'); }
  // vòng
  const rd = s.round || {};
  const sig = JSON.stringify([s.state, s.ridx, rd.mine, rd.other_done, rd.picked, rd.line, rd.miss, rd.ok, rd.my_pick, rd.their_pick, rd.bad, live.startAt > Date.now() ? 'cd' : 'go']);
  if (sig === live.sig) return; live.sig = sig;
  const box = el.querySelector('.as-round');
  if (s.state === 'invite') { box.innerHTML = `<div class="as-wait">${vipAv(mate.name, mate.avatar, 0, 'xl')}<h2>Waiting for ${esc(mate.name)}…</h2><p class="muted">They got an invitation. <b class="as-wt">90</b>s left.</p><span class="spin"></span></div>`; return; }
  if (['won', 'lost', 'left', 'expired', 'declined'].includes(s.state)) { endScreen(s, box); return; }
  if (live.startAt > Date.now() + 150) { box.innerHTML = `<div class="as-next"><small>Round ${s.ridx + 1} of ${s.n}</small><h2>${TYPES[rd.type].ic} ${TYPES[rd.type].name}</h2><p>${esc(TYPES[rd.type].how)}</p><b class="as-cd">3</b></div>`; setTimeout(() => { if (live) { live.sig = ''; } }, Math.max(0, live.startAt - Date.now() + 50)); return; }
  const head = `<div class="as-rh"><span class="tag-s">${TYPES[rd.type].ic} ${TYPES[rd.type].name} · ${s.ridx + 1}/${s.n}</span><div class="as-time"><i></i><span></span></div></div>`;
  const zh = rd.zh ? 'zh' : '';
  if (rd.type === 'twin') {
    box.innerHTML = `${head}<h2 class="as-q ${zh}">${esc(rd.q)}</h2>${rd.note ? `<p class="muted as-note">${esc(rd.note)}</p>` : ''}<div class="as-opts">${rd.opts.map((o, i) => `<button type="button" class="as-o ${zh} ${rd.mine === i ? 'sel' : ''}" data-i="${i}" ${rd.mine != null ? 'disabled' : ''}><i>${'ABCD'[i]}</i>${esc(o)}</button>`).join('')}</div>
      <p class="as-st">${rd.mine != null ? (rd.other_done ? 'Both answered!' : `Waiting for ${esc(mate.name)}…`) : rd.other_done ? `${esc(mate.name)} has answered. Your turn — quick, for the sync bonus!` : 'Answer together: within 3 seconds = sync bonus ×1.25'}</p>`;
    box.querySelectorAll('.as-o').forEach((b) => b.addEventListener('click', () => { sfx('tap'); box.querySelectorAll('.as-o').forEach((x) => { x.disabled = true; }); b.classList.add('sel'); act({ t: 'ans', c: +b.dataset.i }); }));
  } else if (rd.type === 'split') {
    if (rd.role === 'clue') box.innerHTML = `${head}<p class="as-role">${I.eye || '👁'} You hold the <b>clue</b>. ${esc(mate.name)} holds the choices.</p><div class="as-clue ${zh}">${esc(rd.q)}</div>${rd.note ? `<p class="muted as-note">${esc(rd.note)}</p>` : ''}<p class="as-st">Explain it in the chat below (you can’t see the ${rd.n} choices). ${esc(mate.name)} picks.</p>`;
    else { box.innerHTML = `${head}<p class="as-role">🧩 You hold the <b>choices</b>. ${esc(mate.name)} sees the clue — ask in the chat!</p><div class="as-opts">${rd.opts.map((o, i) => `<button type="button" class="as-o ${zh} ${rd.picked === i ? 'sel' : ''}" data-i="${i}" ${rd.picked != null ? 'disabled' : ''}><i>${'ABCD'[i]}</i>${esc(o)}</button>`).join('')}</div><p class="as-st">One pick for the team. Choose when you agree.</p>`;
      box.querySelectorAll('.as-o').forEach((b) => b.addEventListener('click', () => { sfx('tap'); box.querySelectorAll('.as-o').forEach((x) => { x.disabled = true; }); b.classList.add('sel'); act({ t: 'ans', c: +b.dataset.i }); })); }
  } else if (rd.type === 'relay') {
    const placed = new Set(rd.line || []), mine = (rd.mine || []).filter((x) => !placed.has(x.i));
    box.innerHTML = `${head}<p class="as-role">🏃 Build the sentence together. You hold ${rd.mine ? rd.mine.length : 0} words, ${esc(mate.name)} holds ${rd.theirs}.</p><div class="as-vi">${esc(rd.vi)}</div>
      <div class="as-line ${zh}">${(rd.line_t || []).map((t) => `<span class="tile ${zh}">${esc(t)}</span>`).join('')}${[...Array(Math.max(0, rd.n - (rd.line || []).length))].map((_, k) => `<span class="slot ${k === 0 ? 'next' : ''}"></span>`).join('')}</div>
      <div class="as-bank">${mine.map((x) => `<button type="button" class="tile ${zh}" data-i="${x.i}">${esc(x.t)}</button>`).join('') || `<p class="muted">All your words are placed. ${(rd.line || []).length < rd.n ? `Waiting for ${esc(mate.name)}…` : ''}</p>`}</div>
      <p class="as-st">Tap your word when it comes next. Wrong taps: ${rd.miss || 0}</p>`;
    box.querySelectorAll('.as-bank .tile').forEach((b) => b.addEventListener('click', () => { sfx('tile'); b.disabled = true; act({ t: 'tile', i: +b.dataset.i }).then(() => { if (b.isConnected) b.disabled = false; }); }));
    if (prev && prev.round && prev.ridx === s.ridx && (rd.miss || 0) > (prev.round.miss || 0)) { box.querySelector('.as-line').classList.add('shake'); sfx('bad'); }
  } else if (rd.type === 'link') {
    const done = new Set(rd.role === 'words' ? rd.ok || [] : rd.okm || []);
    box.innerHTML = `${head}<p class="as-role">🔗 You see the <b>${rd.role === 'words' ? 'words' : 'meanings'}</b>, ${esc(mate.name)} sees the ${rd.role === 'words' ? 'meanings' : 'words'}. Tell each other, then tap matching items within 5 seconds.</p>
      <div class="as-link ${zh}">${rd.items.map((t, i) => `<button type="button" class="as-li ${done.has(i) ? 'done' : ''} ${rd.my_pick && rd.my_pick.i === i ? 'sel' : ''}" data-i="${i}" ${done.has(i) ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>
      <p class="as-st">${(rd.ok || []).length}/${rd.n} linked${rd.their_pick ? ` · <b>${esc(mate.name)} picked one — tap the match now!</b>` : rd.my_pick ? ` · waiting for ${esc(mate.name)}…` : ''}${rd.bad ? ` · misses ${rd.bad}` : ''}</p>`;
    box.querySelectorAll('.as-li').forEach((b) => b.addEventListener('click', () => { sfx('tap'); box.querySelectorAll('.as-li').forEach((x) => x.classList.remove('sel')); b.classList.add('sel'); act({ t: 'pick', i: +b.dataset.i }); }));
    if (prev && prev.round && prev.ridx === s.ridx && rd.last && (!prev.round.last || prev.round.last.at !== rd.last.at)) sfx(rd.last.ok ? 'ok' : 'wrong');
  }
  timer();
}

function roundFx(last, dmg) {
  const el = live.el, f = document.createElement('div'); f.className = 'as-fx ' + (last.lost ? 'bad' : 'good');
  const txt = { sync: 'Perfect sync! ×1.25', both: 'Both right!', one: 'Half hit', miss: 'Missed!', ok: 'Hit!', time: 'Time’s up!', weak: 'Too few links' }[last.note] || '';
  f.innerHTML = `<b>${dmg > 0 ? '−' + dmg : '0'}</b><span>${esc(txt)}${last.lost ? ` · −1 ${I.heart}` : ''}</span>`;
  el.appendChild(f); setTimeout(() => f.remove(), 1600);
  if (dmg > 0) { sfx(last.note === 'sync' ? 'levelup' : 'ok'); const hp = el.querySelector('.as-boss'); hp.classList.remove('hit'); void hp.offsetWidth; hp.classList.add('hit'); } else sfx('bad');
}

function endScreen(s, box) {
  const me = s.role, mate = me === 'h' ? s.guest : s.host, rw = s.reward || {}, fx = me === 'h' ? rw.fx_h : rw.fx_g;
  const [m, r, n] = s.boss.split('-');
  if (s.state === 'won') {
    box.innerHTML = `<div class="as-end won"><div class="as-chest">🎁</div><h2>Victory!</h2><p>You and ${esc(mate.name)} beat <b>${esc(bossName(m, +r, +n))}</b>${rw.first ? ' for the first time' : ''}.</p>
      <div class="as-stars">${[1, 2, 3].map((i) => `<i class="${i <= (rw.stars || 1) ? 'on' : ''}">★</i>`).join('')}</div>
      <div class="as-rw">${rw.xp ? `<span>+${rw.xp} XP</span>` : '<span class="muted">No XP (10 wins today already)</span>'}${fx ? `<span class="fxnew">${bestie.fxBadge(fx)}</span>` : ''}${rw.ticket ? '<span>🎟️ +1 lucky spin</span>' : ''}</div>
      <div class="as-acts">${fx ? '<button class="btn ghost as-try" type="button">Try the effect</button>' : ''}${rw.ticket ? '<button class="btn ghost as-spin" type="button">Spin now</button>' : ''}<button class="btn acc as-map" type="button">Back to map</button></div></div>`;
    if (!live.cele) { live.cele = 1; sfx('levelup'); const b = box.getBoundingClientRect(); burst(b.left + b.width / 2, b.top + 80, 40); if (rw.xp && C.tick) C.tick(true); if (rw.ticket) gacha.load(true).catch(() => {}); }
  } else {
    const msg = { lost: s.hearts <= 0 ? 'Out of hearts.' : 'The boss survived all rounds.', left: 'Someone left the battle.', expired: 'The invitation expired.', declined: `${esc(mate.name)} can’t play right now.` }[s.state];
    box.innerHTML = `<div class="as-end"><div class="as-chest">${s.state === 'lost' ? '💫' : '🕊️'}</div><h2>${s.state === 'lost' ? 'Defeated' : 'Battle over'}</h2><p>${msg}</p>${s.state === 'lost' ? `<p class="muted">Boss HP left: ${s.hp}. Try again — talking in the chat helps a lot!</p>` : ''}<div class="as-acts"><button class="btn acc as-map" type="button">Back to map</button></div></div>`;
  }
  const ans = s.answers || [];
  if (ans.length && s.state !== 'expired' && s.state !== 'declined') box.querySelector('.as-end').insertAdjacentHTML('beforeend', `<details class="as-rev"><summary>Review the answers</summary>${ans.map((a, i) => `<div><small>${i + 1}. ${TYPES[a.type].name}</small> ${a.type === 'relay' ? esc(a.tk.join(a.zh ? '' : ' ')) : a.type === 'link' ? a.words.map((w, k) => `${esc(w)} = ${esc(a.means[a.a[k]])}`).join(' · ') : `${esc(a.q)} → <b>${esc(a.opts[a.a])}</b>`}</div>`).join('')}</details>`);
  const t = box.querySelector('.as-try'); if (t) t.addEventListener('click', () => bestie.playFx(fx, { me: { name: acct.name, avatar: acct.avatar }, them: { name: mate.name, avatar: mate.avatar }, title: 'New Bestie effect!' }));
  const sb = box.querySelector('.as-chest'); if (sb && s.state === 'won') sb.classList.add('open');
  const sp = box.querySelector('.as-spin'); if (sp) sp.addEventListener('click', () => { stopStage(false); C.spin({}); });
  box.querySelector('.as-map').addEventListener('click', () => { stopStage(false); location.hash = '#/adventure'; page(); });
  clearInterval(live.t); live.t = 0;
}
