// v23: BESTIE ADVENTURE — vượt ải cùng Bestie (2 người cùng online)
// Bản đồ rộng (kéo / cuộn để phóng to) với các vùng theo cấp độ. Mỗi vùng có 5 boss + 1 vua vùng (chấm đỏ).
// Đề lấy từ toàn bộ bài học của cấp đó, 4 kiểu vòng phối hợp: Đồng tâm · Mảnh ghép · Tiếp sức · Nối đôi.
// v24c: người chưa có Bestie chơi chế độ LONELY (một mình, cùng đề; máy chủ learn_adv_* với solo = true).
import { I } from './icons.js?v=31';
import { S } from './store.js?v=31';
import { acct, call } from './account.js?v=31';
import { sfx } from './sound.js?v=31';
import { esc, toast, sheet, vipAv, online, shuffleArr, burst, confirmBox } from './ui.js?v=31';
import * as bestie from './bestie.js?v=31';
import * as gacha from './gacha.js?v=31';
import * as walls from './walls.js?v=31';

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
const TYPES_SOLO = {
  twin: { name: 'Quick answer', ic: '⚡', how: 'Answer the question. Right within 5 seconds = Quick! ×1.25 damage.' },
  split: { name: 'Clue hunt', ic: '🔎', how: 'Read the clue and pick the right answer.' },
  relay: { name: 'Sentence builder', ic: '🧱', how: 'You hold every word. Place them in the right order.' },
  link: { name: 'Match up', ic: '🔗', how: 'Tap a word, then its meaning. Match them all before time runs out.' },
};
const typeOf = (t, solo) => (solo ? TYPES_SOLO : TYPES)[t];
const isSolo = () => !!(acct && M && (M.solo || M.nobestie) && !M.guest);
const bossId = (map, r, n) => `${map}-${r}-${n}`;
const bossName = (map, r, n) => { const R = MAPS[map].regions[r - 1]; return n === 6 ? R.king : R.boss[n - 1]; };
const xpFor = (r, n, stars = 3, solo = false) => Math.round((8 + 4 * r) * stars * (n === 6 ? 1.5 : 1) * (solo ? 0.8 : 1));
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

// ---------- v24: bản đồ vẽ tay kiểu game: đảo nhiều lớp (bóng, bãi cát, đất, điểm sáng), địa hình theo vùng,
// đường mòn nối boss, cờ boss / pháo đài vua, mây che vùng chưa mở, biển có sóng, thuyền, la bàn ----------
const rng = (seed) => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };
function blobPts(cx, cy, rad, seed, n = 18, sx = 1.25) {
  const r = rng(seed), pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = rad * (0.84 + r() * 0.28); pts.push([cx + Math.cos(a) * k * sx, cy + Math.sin(a) * k]); }
  return pts;
}
function smooth(pts) {
  const n = pts.length; let d = `M${((pts[0][0] + pts[n - 1][0]) / 2).toFixed(1)},${((pts[0][1] + pts[n - 1][1]) / 2).toFixed(1)}`;
  for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; d += ` Q${p[0].toFixed(1)},${p[1].toFixed(1)} ${((p[0] + q[0]) / 2).toFixed(1)},${((p[1] + q[1]) / 2).toFixed(1)}`; }
  return d + 'Z';
}
const blob = (cx, cy, rad, seed, sx) => smooth(blobPts(cx, cy, rad, seed, 18, sx));
// bảng màu + kiểu địa hình cho từng vùng
const THEMES = {
  en: ['meadow', 'forest', 'peaks', 'isles', 'tundra', 'desert', 'citadel'],
  zh: ['paddy', 'tea', 'river', 'karst', 'dragon', 'jade'],
};
const PAL = {
  meadow: { a: '#9be07a', b: '#4fae5a', rim: '#f3e2a6', deco: ['tree', 'flower', 'tree', 'house'] },
  forest: { a: '#5fbf74', b: '#22744a', rim: '#e8d79a', deco: ['pine', 'pine', 'tree', 'pine'] },
  peaks: { a: '#b8c6c9', b: '#6f8a8f', rim: '#d9d3b8', deco: ['mount', 'mount', 'pine', 'mount'] },
  isles: { a: '#7fdc9b', b: '#2fa37a', rim: '#fff0b8', deco: ['palm', 'palm', 'hut', 'palm'] },
  tundra: { a: '#eef6fb', b: '#9cc3dc', rim: '#cfe7f2', deco: ['ice', 'snowpine', 'ice', 'snowpine'] },
  desert: { a: '#f7d58a', b: '#d79a4a', rim: '#fbe7b5', deco: ['dune', 'cactus', 'dune', 'rock'] },
  citadel: { a: '#a48bd6', b: '#5a3f8f', rim: '#d9c9ee', deco: ['spire', 'rock', 'spire', 'crystal'] },
  paddy: { a: '#b4e88a', b: '#5aa94f', rim: '#efe2a8', deco: ['paddy', 'tree', 'paddy', 'house'] },
  tea: { a: '#8fd68a', b: '#3d8f55', rim: '#e8dca0', deco: ['terrace', 'tree', 'terrace', 'pagoda'] },
  river: { a: '#9ee0b8', b: '#3c9a86', rim: '#e3e0b0', deco: ['bamboo', 'bamboo', 'tree', 'bamboo'] },
  karst: { a: '#a8d9a0', b: '#4f8a6a', rim: '#e0d6a8', deco: ['karst', 'karst', 'pine', 'karst'] },
  dragon: { a: '#f2a07a', b: '#b84a3a', rim: '#f6dcae', deco: ['pagoda', 'lantern', 'tree', 'pagoda'] },
  jade: { a: '#9fe3cc', b: '#2f8f7a', rim: '#dff3ea', deco: ['mount', 'crystal', 'pine', 'mount'] },
};
// các hình nhỏ trên đảo (vẽ bằng SVG, không dùng emoji để đều nét trên mọi máy)
function deco(kind, x, y, k = 1) {
  const t = (inner) => `<g class="dc" transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${k.toFixed(2)})">${inner}</g>`;
  switch (kind) {
    case 'tree': return t('<ellipse cx="0" cy="4" rx="11" ry="4" fill="rgba(0,0,0,.18)"/><rect x="-2" y="-6" width="4" height="10" fill="#7a5233"/><circle cx="0" cy="-14" r="11" fill="#2f8a43"/><circle cx="-4" cy="-17" r="5" fill="#4fb35c"/>');
    case 'pine': return t('<ellipse cx="0" cy="4" rx="10" ry="3.5" fill="rgba(0,0,0,.18)"/><rect x="-2" y="-4" width="4" height="8" fill="#6b4a2e"/><path d="M0,-30 L12,-4 L-12,-4Z" fill="#1f6a3e"/><path d="M0,-38 L9,-18 L-9,-18Z" fill="#2b8450"/>');
    case 'snowpine': return t('<ellipse cx="0" cy="4" rx="10" ry="3.5" fill="rgba(0,0,0,.14)"/><rect x="-2" y="-4" width="4" height="8" fill="#6b4a2e"/><path d="M0,-30 L12,-4 L-12,-4Z" fill="#3f7a6a"/><path d="M0,-38 L9,-18 L-9,-18Z" fill="#4f8e7c"/><path d="M0,-38 L5,-27 L-5,-27Z" fill="#fff"/><path d="M-8,-10 L8,-10 L5,-6 L-5,-6Z" fill="#fff" opacity=".8"/>');
    case 'flower': return t('<circle cx="-4" cy="0" r="3" fill="#ff8fb1"/><circle cx="3" cy="-2" r="3" fill="#ffd166"/><circle cx="0" cy="4" r="3" fill="#fff"/>');
    case 'house': return t('<ellipse cx="0" cy="6" rx="14" ry="4" fill="rgba(0,0,0,.18)"/><rect x="-10" y="-8" width="20" height="14" fill="#f4e6c8"/><path d="M-14,-8 L0,-20 L14,-8Z" fill="#d0543a"/><rect x="-3" y="-2" width="6" height="8" fill="#7a5233"/>');
    case 'mount': return t('<path d="M-34,6 L-6,-40 L22,6Z" fill="#7d8f96"/><path d="M-6,-40 L4,-24 L-2,-22 L-10,-26 L-16,-20Z" fill="#fff"/><path d="M-6,-40 L22,6 L4,6Z" fill="rgba(0,0,0,.18)"/><path d="M6,6 L24,-24 L42,6Z" fill="#91a3a9"/><path d="M24,-24 L30,-14 L20,-14Z" fill="#fff"/>');
    case 'palm': return t('<ellipse cx="0" cy="4" rx="10" ry="3" fill="rgba(0,0,0,.18)"/><path d="M0,4 Q-3,-14 2,-30" stroke="#8a5a2b" stroke-width="4" fill="none"/><path d="M2,-30 Q-14,-34 -22,-24 M2,-30 Q16,-36 24,-26 M2,-30 Q-4,-44 -14,-46 M2,-30 Q10,-44 20,-44" stroke="#2f9e5a" stroke-width="5" fill="none" stroke-linecap="round"/>');
    case 'hut': return t('<ellipse cx="0" cy="6" rx="14" ry="4" fill="rgba(0,0,0,.16)"/><rect x="-9" y="-6" width="18" height="12" fill="#c99a5b"/><path d="M-15,-6 L0,-20 L15,-6Z" fill="#e7c470"/>');
    case 'ice': return t('<path d="M-16,6 L-8,-18 L0,6Z" fill="#dff3ff" stroke="#9cc8e0"/><path d="M-4,6 L6,-26 L16,6Z" fill="#c7e8fb" stroke="#8fbfd9"/>');
    case 'dune': return t('<path d="M-30,6 Q-12,-14 6,6Z" fill="#e8b766"/><path d="M-6,6 Q14,-20 34,6Z" fill="#f2c97c"/><path d="M-6,6 Q14,-20 20,-6" stroke="#c98d40" fill="none"/>');
    case 'cactus': return t('<ellipse cx="0" cy="4" rx="8" ry="3" fill="rgba(0,0,0,.18)"/><rect x="-3" y="-24" width="6" height="28" rx="3" fill="#3e9a5a"/><path d="M-3,-10 h-6 v-8" stroke="#3e9a5a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M3,-14 h6 v-8" stroke="#3e9a5a" stroke-width="5" fill="none" stroke-linecap="round"/>');
    case 'rock': return t('<path d="M-14,6 L-10,-8 L2,-14 L14,-4 L12,6Z" fill="#8a7f78"/><path d="M2,-14 L14,-4 L12,6 L4,6Z" fill="rgba(0,0,0,.2)"/>');
    case 'spire': return t('<ellipse cx="0" cy="6" rx="12" ry="4" fill="rgba(0,0,0,.2)"/><rect x="-6" y="-26" width="12" height="32" fill="#3d2a63"/><path d="M-9,-26 L0,-44 L9,-26Z" fill="#c9a0ff"/><rect x="-2" y="-16" width="4" height="6" fill="#ffd46a"/>');
    case 'crystal': return t('<path d="M0,6 L-8,-6 L0,-26 L8,-6Z" fill="#8ef0d8" stroke="#3fb89c"/><path d="M10,6 L5,-2 L10,-14 L15,-2Z" fill="#b6fff0" stroke="#3fb89c"/>');
    case 'paddy': return t('<path d="M-26,0 Q0,-10 26,0 Q0,10 -26,0Z" fill="#7cc95c" stroke="#e8f5c8" stroke-width="2"/><path d="M-18,0 h36 M-12,-4 h24 M-12,4 h24" stroke="#a7e07c"/>');
    case 'terrace': return t('<path d="M-30,6 Q0,-4 30,6" stroke="#2f7d47" stroke-width="5" fill="none"/><path d="M-24,-2 Q0,-12 24,-2" stroke="#3f9a57" stroke-width="5" fill="none"/><path d="M-16,-10 Q0,-18 16,-10" stroke="#55b06a" stroke-width="5" fill="none"/>');
    case 'bamboo': return t('<path d="M-6,6 V-34 M2,6 V-40 M10,6 V-30" stroke="#5fb36a" stroke-width="4"/><path d="M-6,-20 l-8,-4 M2,-28 l8,-5 M10,-16 l7,-4" stroke="#3f9a57" stroke-width="3" stroke-linecap="round"/>');
    case 'karst': return t('<path d="M-22,6 Q-24,-30 -10,-36 Q0,-38 2,-20 Q4,-44 16,-42 Q28,-38 24,6Z" fill="#5f9c78"/><path d="M-10,-36 Q-2,-30 -4,-10" stroke="#8fd0a4" stroke-width="3" fill="none"/>');
    case 'pagoda': return t('<ellipse cx="0" cy="6" rx="14" ry="4" fill="rgba(0,0,0,.2)"/><rect x="-7" y="-10" width="14" height="16" fill="#b8332a"/><path d="M-15,-10 Q0,-16 15,-10 L10,-6 L-10,-6Z" fill="#3a2a2a"/><rect x="-5" y="-22" width="10" height="12" fill="#c8402f"/><path d="M-12,-22 Q0,-28 12,-22 L8,-18 L-8,-18Z" fill="#3a2a2a"/><path d="M0,-34 V-26" stroke="#ffd46a" stroke-width="2"/>');
    case 'lantern': return t('<path d="M0,-30 V-20" stroke="#5a3a1a"/><ellipse cx="0" cy="-12" rx="7" ry="9" fill="#ff4d3a"/><rect x="-4" y="-22" width="8" height="3" fill="#ffd46a"/><rect x="-4" y="-4" width="8" height="3" fill="#ffd46a"/>');
    default: return '';
  }
}
// ---------- v24b: bản đồ kiểu "diorama" pastel (theo mẫu Bestie Map): một vùng đất liền, sông uốn lượn, cầu gỗ,
// mỗi boss là một bệ tròn màu kem có ngôi nhà nhỏ, vua vùng là nhà trên tảng đá lớn; vùng chưa mở phủ sương ----------
const PASTEL = {
  meadow: { g: '#e7ecb4', roof: '#4b5a78', tree: '#8cc5ac' }, forest: { g: '#d6e8b0', roof: '#5a4a3a', tree: '#6fae96' },
  peaks: { g: '#e3e6d6', roof: '#4a5570', tree: '#9cc2bf' }, isles: { g: '#eef0be', roof: '#c27a4a', tree: '#7cc7a5' },
  tundra: { g: '#eef3f2', roof: '#5a6a8a', tree: '#a9cfd0' }, desert: { g: '#f3e3b0', roof: '#b8643f', tree: '#a6c79a' },
  citadel: { g: '#e8e0ea', roof: '#5b4a7a', tree: '#a7b8d6' },
  paddy: { g: '#e4efb2', roof: '#4b5a78', tree: '#8cc5ac' }, tea: { g: '#d9ecb2', roof: '#3e5f4a', tree: '#76b896' },
  river: { g: '#dcefc4', roof: '#4a6a78', tree: '#86c2b2' }, karst: { g: '#e2ecc6', roof: '#556b5a', tree: '#7fb7a0' },
  dragon: { g: '#f2e2bf', roof: '#b0473a', tree: '#93c3a6' }, jade: { g: '#dcefe6', roof: '#2f7a6a', tree: '#8fd0bf' },
};
const riverY = (x, ph) => 640 + 105 * Math.sin(x / 300 + ph) + 30 * Math.sin(x / 120 + ph * 2);
const riverPath = (ph) => { let d = ''; for (let x = -200; x <= W + 200; x += 40) d += `${d ? 'L' : 'M'}${x},${riverY(x, ph).toFixed(1)} `; return d; };
// đồ vật vẽ kiểu đồ chơi gỗ: mặt trên sáng, cạnh tối, bóng mềm
const pz = {
  tree: (c, k) => `<g transform="scale(${k})"><ellipse cx="4" cy="2" rx="16" ry="6" fill="rgba(60,70,40,.18)"/><rect x="-2.5" y="-10" width="5" height="12" rx="2" fill="#b2583f"/><path d="M0,-58 C14,-58 20,-30 18,-18 C16,-8 -16,-8 -18,-18 C-20,-30 -14,-58 0,-58Z" fill="${c}"/><path d="M0,-58 C14,-58 20,-30 18,-18 C14,-12 6,-11 2,-11 C8,-24 8,-46 0,-58Z" fill="rgba(0,40,40,.12)"/></g>`,
  pine: (c, k) => `<g transform="scale(${k})"><ellipse cx="3" cy="2" rx="12" ry="5" fill="rgba(60,70,40,.18)"/><rect x="-2" y="-8" width="4" height="10" fill="#b2583f"/><path d="M0,-50 L15,-10 Q0,-4 -15,-10Z" fill="${c}"/><path d="M0,-50 L15,-10 Q8,-7 3,-7Z" fill="rgba(0,40,40,.14)"/></g>`,
  rock: (c, k) => `<g transform="scale(${k})"><ellipse cx="4" cy="3" rx="20" ry="6" fill="rgba(60,70,40,.16)"/><path d="M-18,2 C-22,-14 -8,-24 4,-22 C18,-20 22,-6 18,2Z" fill="#b9cfd8"/><path d="M4,-22 C18,-20 22,-6 18,2 L6,2 C10,-8 10,-16 4,-22Z" fill="#94b0bf"/></g>`,
  bush: (c, k) => `<g transform="scale(${k})"><circle cx="-6" cy="-6" r="8" fill="${c}"/><circle cx="5" cy="-8" r="9" fill="${c}"/><circle cx="2" cy="-3" r="7" fill="rgba(0,40,40,.1)"/></g>`,
  grass: (c, k) => `<g transform="scale(${k})" stroke="#9fb878" stroke-width="2" stroke-linecap="round"><path d="M-6,0 q-2,-10 -6,-14 M0,0 q0,-12 2,-18 M6,0 q2,-9 7,-12"/></g>`,
  snowtree: (c, k) => `<g transform="scale(${k})"><ellipse cx="3" cy="2" rx="12" ry="5" fill="rgba(60,70,40,.14)"/><rect x="-2" y="-8" width="4" height="10" fill="#b2583f"/><path d="M0,-50 L15,-10 Q0,-4 -15,-10Z" fill="${c}"/><path d="M0,-50 L7,-32 Q0,-29 -7,-32Z" fill="#fff"/></g>`,
  cactus: (c, k) => `<g transform="scale(${k})"><ellipse cx="2" cy="2" rx="9" ry="4" fill="rgba(60,70,40,.16)"/><rect x="-4" y="-30" width="8" height="32" rx="4" fill="#7cae86"/><path d="M-4,-14 h-6 v-8 M4,-18 h6 v-8" stroke="#7cae86" stroke-width="6" stroke-linecap="round" fill="none"/></g>`,
};
const TREE_OF = { tundra: 'snowtree', peaks: 'pine', forest: 'pine', desert: 'cactus', karst: 'pine', jade: 'pine' };
// nhà nhỏ trên bệ boss (5 kiểu) — mái theo màu vùng
function hut(kind, roof) {
  const wall = '#f1e3c8', side = '#d8c3a0', door = '#7a4a32';
  if (kind === 0) return `<path d="M-16,0 L0,-26 L16,0Z" fill="#d9844f"/><path d="M0,-26 L16,0 L8,0Z" fill="#b8643f"/><path d="M-4,0 L0,-8 L4,0Z" fill="#6a3a22"/>`; // lều
  if (kind === 1) return `<rect x="-14" y="-20" width="28" height="20" fill="${wall}"/><rect x="6" y="-20" width="8" height="20" fill="${side}"/><path d="M-18,-20 L0,-34 L18,-20Z" fill="${roof}"/><rect x="-5" y="-11" width="8" height="11" fill="${door}"/><rect x="-12" y="-16" width="5" height="5" fill="#9fd0e8"/>`;
  if (kind === 2) return `<rect x="-10" y="-34" width="20" height="34" fill="${wall}"/><rect x="4" y="-34" width="6" height="34" fill="${side}"/><path d="M-14,-34 L0,-46 L14,-34Z" fill="${roof}"/><rect x="-4" y="-26" width="6" height="6" fill="#9fd0e8"/><rect x="-4" y="-12" width="6" height="12" fill="${door}"/>`; // tháp
  if (kind === 3) return `<rect x="-16" y="-18" width="32" height="18" fill="${wall}"/><rect x="8" y="-18" width="8" height="18" fill="${side}"/><path d="M-20,-18 h40 l-4,-12 h-32Z" fill="${roof}"/><path d="M-16,-18 h32 v5 h-32Z" fill="#e8a46a"/><path d="M-16,-13 h4 v-5 h4 v5 h4 v-5 h4 v5 h4 v-5 h4 v5 h4 v-5" fill="#fff" opacity=".7"/><rect x="-4" y="-10" width="8" height="10" fill="${door}"/>`; // quán
  return `<rect x="-12" y="-16" width="24" height="16" fill="${wall}"/><path d="M-16,-16 L0,-30 L16,-16Z" fill="${roof}"/><circle cx="0" cy="-8" r="3" fill="#ffd166"/><path d="M-20,0 h40" stroke="#c9b48e" stroke-width="3"/>`; // nhà nhỏ
}
function platform(r, inner) {
  return `<ellipse cx="6" cy="10" rx="${r + 4}" ry="${r * 0.55}" fill="rgba(70,70,40,.22)"/><ellipse cx="0" cy="6" rx="${r}" ry="${r * 0.55}" fill="#e3d2ae"/><ellipse cx="0" cy="0" rx="${r}" ry="${r * 0.55}" fill="#f7ecd4"/><ellipse cx="0" cy="-2" rx="${r * 0.62}" ry="${r * 0.34}" fill="#efe1c3"/>${inner}`;
}
function bossMark(n, st, ok, roof) {
  const col = st ? '#2fbf71' : ok ? '#e5484d' : '#9a9a9a';
  const flag = `<g class="adv-flag" transform="translate(${n === 6 ? 34 : 22},${n === 6 ? -40 : -22})"><path d="M0,0 V-26" stroke="#6a4a32" stroke-width="2.5"/><path d="M0,-26 l16,5 l-16,5Z" fill="${col}"/></g>`;
  const badge = `<g transform="translate(0,${n === 6 ? 30 : 22})"><circle r="9" fill="${col}" stroke="#fff" stroke-width="2.5"/>${st ? '<path d="M-3.5,0 l2.5,2.5 l5,-5.5" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/>' : ok ? '<path d="M-3,-3 l6,6 M3,-3 l-6,6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>' : '<rect x="-3" y="-1.5" width="6" height="5" rx="1" fill="#fff"/><path d="M-2,-1.5 v-1.5 a2,2 0 0 1 4,0 v1.5" stroke="#fff" stroke-width="1.4" fill="none"/>'}</g>`;
  if (n === 6) {
    // vua vùng: tảng đá lớn + bậc thang + nhà mái cong
    return `<circle r="62" class="adv-ring"/><g class="adv-dot k">${platform(58, `<g transform="translate(0,-4)"><path d="M-46,2 C-54,-26 -34,-48 -6,-50 C26,-52 50,-30 46,2Z" fill="#d7dde0"/><path d="M-6,-50 C26,-52 50,-30 46,2 L18,2 C26,-18 18,-40 -6,-50Z" fill="#b9c4ca"/><path d="M-14,2 h18 l-4,-22 h-10Z" fill="#c7cfd3"/><path d="M-12,-4 h14 M-11,-10 h12 M-10,-16 h10" stroke="#a9b3b8" stroke-width="2"/><g transform="translate(2,-44)"><rect x="-18" y="-24" width="36" height="24" fill="#c9875a"/><rect x="8" y="-24" width="10" height="24" fill="#a86a44"/><path d="M-26,-24 Q0,-38 26,-24 L20,-20 L-20,-20Z" fill="${roof}"/><rect x="-5" y="-14" width="10" height="14" fill="#5a3a24"/><rect x="-14" y="-18" width="6" height="6" fill="#ffe08a"/></g></g>`)}</g>${flag}${badge}`;
  }
  return `<circle r="40" class="adv-ring"/><g class="adv-dot">${platform(38, `<g transform="translate(0,-2)">${hut((n - 1) % 5, roof)}</g>`)}</g>${flag}${badge}`;
}
function mapSVG(map) {
  const D = MAPS[map], R = D.regions, th = THEMES[map], ph = map === 'zh' ? 1.7 : 0.4;
  let front = 1; for (let r = 1; r <= R.length; r++) if (regionOpen(map, r)) front = r;
  // vị trí vùng theo dòng sông: cách sông ~320, phía còn nhiều chỗ
  const n = R.length, pos = R.map((_, i) => { const x = 200 + i * ((W - 400) / (n - 1)); const ry = riverY(x, ph); const up = i % 2 === 0; return [x, Math.max(235, Math.min(1015, up ? ry - 315 : ry + 315))]; });
  const river = riverPath(ph);
  // cầu: nơi đường nối 2 vùng cắt qua sông
  const bridges = [];
  let route = `M${pos[0][0]},${pos[0][1]}`;
  for (let i = 1; i < n; i++) {
    const a = pos[i - 1], b = pos[i]; route += ` C${a[0] + 120},${a[1]} ${b[0] - 120},${b[1]} ${b[0]},${b[1]}`;
    const sa = Math.sign(a[1] - riverY(a[0], ph)), sb = Math.sign(b[1] - riverY(b[0], ph));
    if (sa !== sb) { let lo = 0, hi = 1; for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2, x = a[0] + (b[0] - a[0]) * m, y = a[1] + (b[1] - a[1]) * m; if (Math.sign(y - riverY(x, ph)) === sa) lo = m; else hi = m; } const x = a[0] + (b[0] - a[0]) * lo; const ang = Math.atan2(riverY(x + 5, ph) - riverY(x - 5, ph), 10) * 180 / Math.PI + 90; bridges.push([x, riverY(x, ph), ang]); }
  }
  // cây, đá, bụi rải khắp đất liền (tránh sông, bệ boss, đường)
  const rr = rng(map === 'zh' ? 91 : 37), items = [];
  const bossXY = []; pos.forEach(([cx, cy]) => { BOSS_POS.forEach((p) => bossXY.push([cx + p[0], cy + p[1]])); bossXY.push([cx, cy]); });
  for (let t = 0; t < 2600 && items.length < 230; t++) {
    const x = rr() * W, y = rr() * H, ry = riverY(x, ph);
    if (Math.abs(y - ry) < 95) continue;
    if (bossXY.some(([bx, by]) => Math.hypot(bx - x, (by - y) * 1.3) < 62)) continue;
    if (items.some(([ix, iy]) => Math.hypot(ix - x, iy - y) < 34)) continue;
    const reg = pos.reduce((best, p, i) => (Math.hypot(p[0] - x, p[1] - y) < Math.hypot(pos[best][0] - x, pos[best][1] - y) ? i : best), 0);
    const pal = PASTEL[th[reg]] || PASTEL.meadow, roll = rr();
    const kind = roll < 0.5 ? (TREE_OF[th[reg]] || 'tree') : roll < 0.68 ? 'rock' : roll < 0.84 ? 'bush' : 'grass';
    items.push([x, y, kind, pal.tree, 0.8 + rr() * 0.7, reg]);
  }
  items.sort((p, q) => p[1] - q[1]);
  const deco = items.map(([x, y, k, c, s]) => `<g class="dc" transform="translate(${x.toFixed(0)},${y.toFixed(0)})">${pz[k](c, s.toFixed(2))}</g>`).join('');
  const zones = pos.map(([cx, cy], i) => { const pal = PASTEL[th[i]] || PASTEL.meadow; return `<path d="${blob(cx, cy, 250, i * 13 + 5, 1.15)}" fill="${pal.g}" class="adv-zone"/>`; }).join('');
  const regs = R.map((g, i) => {
    const r = i + 1, open = regionOpen(map, r), [cx, cy] = pos[i], pal = PASTEL[th[i]] || PASTEL.meadow;
    const order = [1, 2, 3, 4, 5].map((k) => [cx + BOSS_POS[k - 1][0], cy + BOSS_POS[k - 1][1]]);
    let trail = `M${order[0][0]},${order[0][1]}`; for (let k = 1; k < 5; k++) { const a = order[k - 1], b = order[k]; trail += ` Q${(a[0] + b[0]) / 2 + 14},${(a[1] + b[1]) / 2 - 12} ${b[0]},${b[1]}`; }
    trail += ` Q${(order[4][0] + cx) / 2 - 16},${(order[4][1] + cy) / 2 + 8} ${cx},${cy}`;
    return `<g class="adv-reg ${open ? 'open' : 'locked'} th-${th[i]}" data-r="${r}">
      <path d="${trail}" class="adv-trail"/>
      ${[1, 2, 3, 4, 5, 6].map((k) => { const p = k === 6 ? [0, 0] : BOSS_POS[k - 1], x = cx + p[0], y = cy + p[1], st = starsOf(map, r, k), ok = bossOpen(map, r, k);
        return `<g class="adv-boss ${k === 6 ? 'king' : ''} ${st ? 'beat' : ''} ${ok ? '' : 'shut'}" data-b="${r}-${k}" transform="translate(${x},${y})" tabindex="0" role="button" aria-label="${esc(bossName(map, r, k))}">${bossMark(k, st, ok, pal.roof)}${st ? `<text y="${k === 6 ? 62 : 48}" class="adv-st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</text>` : ''}</g>`; }).join('')}
      <g class="adv-sign" transform="translate(${cx},${cy + 186})"><path d="M-4,0 V34 M4,0 V34" stroke="#8a5a3a" stroke-width="5"/><rect x="-118" y="-30" width="236" height="50" rx="12" fill="#fbf3e2" stroke="#b9875a" stroke-width="3"/><text y="-6" class="adv-rn">${esc(g.name)}</text><text y="12" class="adv-rl">${esc(g.lv)} · ${esc(g.diff)}</text></g>
      ${open ? '' : `<g class="adv-fog"><path d="${blob(cx, cy, 235, i * 13 + 5, 1.15)}"/>${[[-95, -70, 110], [95, 40, 120]].map(([dx, dy, w], q) => `<g class="adv-cloud" style="--q:${q}" transform="translate(${cx + dx},${cy + dy})"><circle cx="${-w * 0.42}" cy="${w * 0.06}" r="${w * 0.3}"/><circle cx="${-w * 0.08}" cy="${-w * 0.12}" r="${w * 0.42}"/><circle cx="${w * 0.36}" cy="${w * 0.02}" r="${w * 0.33}"/><rect x="${-w * 0.7}" y="0" width="${w * 1.4}" height="${w * 0.3}" rx="${w * 0.15}"/></g>`).join('')}<g transform="translate(${cx},${cy - 8})"><circle r="30" fill="#fbf3e2" stroke="#b9875a" stroke-width="3"/><rect x="-11" y="-3" width="22" height="16" rx="3" fill="#b9875a"/><path d="M-6,-3 v-6 a6,6 0 0 1 12,0 v6" stroke="#b9875a" stroke-width="4" fill="none"/></g></g>`}
    </g>`;
  }).join('');
  const boats = [0.14, 0.47, 0.8].map((f, k) => { const x = f * W, y = riverY(x, ph); return `<g class="adv-boat" style="--d:${k * 2.3}s" transform="translate(${x.toFixed(0)},${y.toFixed(0)}) rotate(${(Math.atan2(riverY(x + 5, ph) - riverY(x - 5, ph), 10) * 180 / Math.PI).toFixed(0)})"><ellipse cx="2" cy="6" rx="22" ry="6" fill="rgba(0,40,60,.2)"/><path d="M-20,-4 Q0,10 20,-4 Z" fill="#f4f1ea"/><path d="M-20,-4 Q0,2 20,-4" stroke="#d9514a" stroke-width="3" fill="none"/></g>`; }).join('');
  return `<svg class="adv-svg diorama" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-label="${esc(D.name)} adventure map">
    <defs><radialGradient id="advgr" cx="50%" cy="40%" r="85%"><stop offset="0" stop-color="#f2efc4"/><stop offset="1" stop-color="#d9d9a2"/></radialGradient>
      <linearGradient id="advwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb8c8"/><stop offset="1" stop-color="#4f8fa6"/></linearGradient>
      <filter id="advsoft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="18"/></filter></defs>
    <g class="adv-cam">
      <rect x="-600" y="-600" width="${W + 1200}" height="${H + 1200}" fill="url(#advgr)"/>
      <g class="adv-zones" filter="url(#advsoft)">${zones}</g>
      <path d="${route}" class="adv-road"/>
      <path d="${river}" class="adv-bank"/><path d="${river}" class="adv-bank2"/><path d="${river}" class="adv-water"/><path d="${river}" class="adv-shine"/>
      ${boats}
      ${bridges.map(([x, y, a]) => `<g class="adv-bridge" transform="translate(${x.toFixed(0)},${y.toFixed(0)}) rotate(${a.toFixed(0)})"><rect x="-90" y="-17" width="180" height="34" rx="4" fill="#c98a5c"/><rect x="-90" y="-17" width="180" height="8" fill="#e0a77a"/>${Array.from({ length: 9 }, (_, k) => `<path d="M${-80 + k * 20},-17 V17" stroke="#a96c44" stroke-width="2"/>`).join('')}<rect x="-90" y="13" width="180" height="6" fill="#8f5a38"/></g>`).join('')}
      <g class="adv-decs">${deco}</g>
      ${regs}
      <g class="adv-us" transform="translate(${pos[front - 1][0] - 150},${pos[front - 1][1] - 250}) scale(2)">
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
  const nb = !!M.nobestie, solo = isSolo(), bb = M.bestie, D = MAPS[curMap];
  const beaten = Object.values(M.progress).filter((x) => x.stars).length, total = D.regions.length * 6;
  const banner = solo
    ? `<div class="adv-note panel solo"><span class="lonely-ic">🌙</span><div class="grow"><b>Lonely Adventure</b><small>No Bestie yet, so you fight alone with the same questions. ${beaten}/${total} bosses · ${M.total || 0} ★${M.rank ? ` · Adventure rank #${M.rank.rank}` : ''} · ${M.today_wins || 0}/10 wins today. Pick a Bestie to play as a pair.</small></div><a class="btn ghost sm" href="${M.friends ? '#/bestie' : '#/friends'}">${I.heart} ${M.friends ? 'Choose a Bestie' : 'Add a friend'}</a></div>`
    : nb
    ? `<div class="adv-note panel">${I.heart}<div class="grow"><b>Bestie Adventure is played in pairs.</b><small>${!acct ? 'Create an account, add a friend and make them your Bestie to play. You can look around the map now.' : M.friends ? 'Pick one of your friends as your Bestie to start fighting bosses together. You can look around the map now.' : 'Add a friend first, then make them your Bestie. You can look around the map now.'}</small></div>${acct ? `<a class="btn acc sm" href="${M.friends ? '#/bestie' : '#/friends'}">${M.friends ? 'Choose a Bestie' : 'Add a friend'}</a>` : '<button class="btn acc sm adv-acc" type="button">Create account</button>'}</div>`
    : `<div class="adv-note panel ok">${vipAv(bb.name, bb.avatar, bb.vip || 0)}<div class="grow"><b>You ${I.heart} ${esc(bb.name)}</b><small>${online(bb.last_seen) ? '<b class="ok">Online now</b> · tap a red dot to fight together' : `Offline · both of you must be online to fight`} · ${beaten}/${total} bosses · ${M.total || 0} ★${M.rank ? ` · Adventure rank #${M.rank.rank}` : ''}</small></div>${online(bb.last_seen) ? '' : '<button class="btn sm ghost adv-nudge" type="button">Send a nudge</button>'}</div>`;
  const open = M.open;
  const openBar = !open ? '' : `<div class="adv-open panel">${I.swords}<div class="grow"><b>${open.state === 'invite' ? (open.mine ? 'Waiting for your Bestie to join…' : `${esc(bb ? bb.name : 'Your Bestie')} invited you!`) : (solo ? 'Your Lonely battle is in progress' : 'Your battle is in progress')}</b><small>${esc(bossName(open.map, +open.boss.split('-')[1], +open.boss.split('-')[2]))}</small></div>${!open.mine && open.state === 'invite' ? '<button class="btn acc sm adv-join" type="button">Join</button>' : '<button class="btn acc sm adv-back" type="button">Open</button>'}</div>`;
  C.shell(route, `<div class="page-h"><div><h1 class="serif">${solo ? 'Lonely Adventure' : 'Bestie Adventure'}</h1><p>${solo ? 'Explore the map on your own and beat the red-dot bosses. Same questions as Bestie Adventure: quick answers, clues, sentence building and word matching.' : 'Explore the map with your Bestie and beat the red-dot bosses together. Every boss needs teamwork: shared answers, split clues, relay sentences and double links.'}</p></div>
    <div class="seg adv-maps" role="tablist">${['en', 'zh'].map((m) => `<button type="button" data-m="${m}" aria-pressed="${curMap === m}" class="${m === 'zh' ? 'zh' : ''}">${MAPS[m].name}</button>`).join('')}</div></div>
    ${banner}${openBar}
    <div class="adv-wrap ${nb && !solo ? 'viewonly' : ''}"><div class="adv-map">${mapSVG(curMap)}</div>
      <div class="adv-tools"><button class="icon-btn adv-zi" type="button" title="Zoom in">${I.plus}</button><button class="icon-btn adv-zo" type="button" title="Zoom out">−</button><button class="icon-btn adv-zr" type="button" title="Fit map">⤢</button></div>
</div>
    <div class="adv-legend"><span><i class="lg-d"></i>Boss</span><span>👑 Region king</span><span>★ Your best</span><span>🔒 Beat the king to open the next region</span><span>Drag to move · scroll or +/− to zoom</span></div>
    <div class="adv-info">
      <section class="panel pad"><h3 class="sec-h">${I.sparkle} How a battle works</h3><div class="adv-types">${Object.values(solo ? TYPES_SOLO : TYPES).map((t) => `<div><b>${t.ic} ${t.name}</b><small>${t.how}</small></div>`).join('')}</div>
        <p class="muted" style="font-size:.85rem;margin-top:10px">The boss has 100 HP and ${solo ? 'you have' : 'your team has'} 3 hearts. Keep more hearts for more stars. Beat 3 bosses to wake the region king; beat the king to open the next region.</p></section>
      <section class="panel pad"><h3 class="sec-h">${I.gift} Chest rewards</h3><ul class="adv-rw">${solo ? '<li><b>First win on each boss: a random wallpaper + a lucky spin ticket</b> (kings: a rarer wallpaper)</li><li>XP: more in harder regions, ×stars, ×1.5 for kings (80% of a Bestie battle, first 10 wins a day)</li><li>Your stars count for the <a href="#" class="adv-rank">Adventure ranking</a> (top 10 get a spin ticket every Monday 16:00)</li><li>Play with a Bestie for Bestie effects and full XP</li>' : '<li><b>First win on each boss: a random wallpaper + a lucky spin ticket each</b> (kings: a rarer wallpaper)</li><li>XP for both of you: more in harder regions, ×stars, ×1.5 for kings (first 10 wins a day)</li><li>Bestie effects for your quiz and class high-fives (kings always drop one)</li><li>Stars count for the <a href="#" class="adv-rank">Adventure ranking</a> (top 10 get a spin ticket every Monday 16:00)</li>'}</ul></section>
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

// v24d: thưởng lần đầu (hình nền + vé quay) — mỗi người mỗi boss 1 lần
const firstGot = (map, r, n) => ((M && M.firsts) || []).includes(`${map}-${r}-${n}`);
function bossSheet(r, n) {
  const map = curMap, R = MAPS[map].regions[r - 1], name = bossName(map, r, n), st = starsOf(map, r, n), ok = bossOpen(map, r, n), solo = isSolo(), nb = !!M.nobestie && !solo, bb = M.bestie;
  const rounds = roundsFor(n), why = !regionOpen(map, r) ? `Beat ${MAPS[map].regions[r - 2].king} to open this region.` : !ok ? 'Beat any 3 bosses in this region to wake the king.' : '';
  sfx('open');
  sheet(`<div class="adv-bs"><div class="adv-bh"><span class="adv-bic ${n === 6 ? 'king' : ''}">${n === 6 ? '👑' : '👾'}</span><div><h2>${esc(name)}</h2><p class="sub">${esc(R.name)} · ${esc(R.lv)} · ${esc(R.diff)}${n === 6 ? ' · Region king' : ''}</p>
      <div class="pf-tags"><span>${rounds} rounds</span><span>100 HP</span><span>3 ${I.heart}</span>${st ? `<span>Best ${'★'.repeat(st)}</span>` : ''}</div></div></div>
    ${acct && !firstGot(map, r, n) ? `<div class="adv-first"><span class="af-ic">🖼️</span><span class="grow"><b>First win reward</b><small>A random ${n === 6 ? 'rare ' : ''}wallpaper + 1 lucky spin ticket${solo ? '' : ' for each of you'}</small></span><span class="af-tk">🎟️</span></div>` : ''}
    <div class="adv-chest"><b>${I.gift} Chest</b>${solo ? `<span>Up to ${xpFor(r, n, 3, true)} XP</span>` : `<span>Up to ${xpFor(r, n)} XP each</span>${n === 6 ? `<span>Bestie effect (${r >= 5 ? 'legendary' : r >= 3 ? 'epic' : 'rare'})</span>` : '<span>Chance of a Bestie effect</span>'}`}${acct && firstGot(map, r, n) ? '<span class="muted">First win reward collected</span>' : ''}</div>
    ${why ? `<p class="adv-why">${I.lock || '🔒'} ${esc(why)}</p>` : ''}
    <div class="adv-bact"></div></div>`, (el, close) => {
    const box = el.querySelector('.adv-bact');
    if (nb) { box.innerHTML = acct ? `<p class="muted">You need a Bestie to fight. ${M.friends ? 'Pick one of your friends.' : 'Add a friend first, then make them your Bestie.'}</p><a class="btn acc wide" href="${M.friends ? '#/bestie' : '#/friends'}">${M.friends ? 'Choose a Bestie' : 'Add a friend'}</a>` : '<button class="btn acc wide" type="button">Create an account</button>'; const b = box.querySelector('button'); if (b) b.addEventListener('click', () => { close(); C.authSheet('new'); }); const a = box.querySelector('a'); if (a) a.addEventListener('click', close); return; }
    if (!ok) { box.innerHTML = '<button class="btn wide" type="button" disabled>Locked</button>'; return; }
    if (solo) {
      box.innerHTML = `<button class="btn acc wide adv-go" type="button">${I.swords} Fight alone</button><p class="muted" style="margin-top:8px;font-size:.85rem">Lonely mode: you hold every clue and every word. Get a Bestie to fight as a pair.</p>`;
      const go = box.querySelector('.adv-go');
      go.addEventListener('click', async () => {
        go.disabled = true; go.textContent = 'Preparing questions…';
        let rs; try { rs = await makeRounds(map, r, n, true); } catch (e) { toast('Could not load the lessons. Try again.'); go.disabled = false; return; }
        try {
          const j = await call('learn_adv_start', { p_boss: bossId(map, r, n), p_rounds: rs });
          if (!j.ok) { toast({ locked: 'This boss is still locked.', noquestions: 'Not enough questions here yet.', toomany: 'Too many battles this hour. Take a short break.' }[j.error] || j.error); go.disabled = false; go.innerHTML = `${I.swords} Try again`; return; }
          close(); sfx('ok'); openStage(j.id);
        } catch (e) { toast(e.message); go.disabled = false; }
      });
      return;
    }
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
async function makeRounds(map, r, n, solo = false) {
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
      out.push({ type: 'split', q: `Meaning: “${w.vi}”${w.exVi ? ` — e.g. “${w.exVi}”` : ''}`, ...shuf([w.w, ...o.map((x) => x.w)], 0), note: solo ? 'Pick the matching word' : 'Describe it to your Bestie', zh });
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
    const so = live && live.s && live.s.solo;
    if (!(await confirmBox('Leave this battle?', so ? 'The battle ends and the boss keeps its HP.' : 'Your Bestie will be left alone and the battle ends.', 'Leave', true))) return; stopStage(true); page();
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
  const prev = live.s; live.s = s; const el = live.el, me = s.role, mate = me === 'h' ? s.guest : s.host, solo = !!s.solo, TY = solo ? TYPES_SOLO : TYPES;
  el.classList.toggle('solo', solo);
  const [m, r, n] = s.boss.split('-'); const R = MAPS[m].regions[+r - 1];
  if (s.starts_in_ms != null && (!prev || prev.ridx !== s.ridx || !live.startAt)) live.startAt = Date.now() + s.starts_in_ms;
  if (s.state === 'invite' && !live.inviteUntil) live.inviteUntil = Date.now() + 90000;
  el.style.setProperty('--reg', R.col);
  el.querySelector('.as-bn').innerHTML = `${+n === 6 ? '👑 ' : ''}${esc(bossName(m, +r, +n))} <small>${esc(R.name)} · ${esc(R.lv)}</small>`;
  const hp = el.querySelector('.as-hp'); hp.querySelector('i').style.width = s.hp + '%'; hp.querySelector('span').textContent = `${s.hp} HP`;
  el.querySelector('.as-hearts').innerHTML = [0, 1, 2].map((i) => `<i class="${i < s.hearts ? 'on' : ''}">${I.heart}</i>`).join('') + (solo ? '<span class="as-solo-tag">🌙 Lonely</span>' : `<span class="as-mate">${vipAv(mate.name, mate.avatar, 0)}<small class="${s.other_seen_ms < 6000 ? 'ok' : 'warn'}">${esc(mate.name)}${s.other_seen_ms < 6000 ? '' : ' · reconnecting…'}</small></span>`);
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
  if (live.startAt > Date.now() + 150) { box.innerHTML = `<div class="as-next"><small>Round ${s.ridx + 1} of ${s.n}</small><h2>${TY[rd.type].ic} ${TY[rd.type].name}</h2><p>${esc(TY[rd.type].how)}</p><b class="as-cd">3</b></div>`; setTimeout(() => { if (live) { live.sig = ''; } }, Math.max(0, live.startAt - Date.now() + 50)); return; }
  const head = `<div class="as-rh"><span class="tag-s">${TY[rd.type].ic} ${TY[rd.type].name} · ${s.ridx + 1}/${s.n}</span><div class="as-time"><i></i><span></span></div></div>`;
  const zh = rd.zh ? 'zh' : '';
  if (rd.type === 'twin') {
    box.innerHTML = `${head}<h2 class="as-q ${zh}">${esc(rd.q)}</h2>${rd.note ? `<p class="muted as-note">${esc(rd.note)}</p>` : ''}<div class="as-opts">${rd.opts.map((o, i) => `<button type="button" class="as-o ${zh} ${rd.mine === i ? 'sel' : ''}" data-i="${i}" ${rd.mine != null ? 'disabled' : ''}><i>${'ABCD'[i]}</i>${esc(o)}</button>`).join('')}</div>
      <p class="as-st">${solo ? (rd.mine != null ? 'Answered!' : 'Right within 5 seconds = Quick! ×1.25') : rd.mine != null ? (rd.other_done ? 'Both answered!' : `Waiting for ${esc(mate.name)}…`) : rd.other_done ? `${esc(mate.name)} has answered. Your turn — quick, for the sync bonus!` : 'Answer together: within 3 seconds = sync bonus ×1.25'}</p>`;
    box.querySelectorAll('.as-o').forEach((b) => b.addEventListener('click', () => { sfx('tap'); box.querySelectorAll('.as-o').forEach((x) => { x.disabled = true; }); b.classList.add('sel'); act({ t: 'ans', c: +b.dataset.i }); }));
  } else if (rd.type === 'split' && rd.role === 'solo') {
    box.innerHTML = `${head}<div class="as-clue ${zh}">${esc(rd.q)}</div>${rd.note ? `<p class="muted as-note">${esc(rd.note)}</p>` : ''}<div class="as-opts">${rd.opts.map((o, i) => `<button type="button" class="as-o ${zh} ${rd.picked === i ? 'sel' : ''}" data-i="${i}" ${rd.picked != null ? 'disabled' : ''}><i>${'ABCD'[i]}</i>${esc(o)}</button>`).join('')}</div><p class="as-st">Pick the answer that fits the clue.</p>`;
    box.querySelectorAll('.as-o').forEach((b) => b.addEventListener('click', () => { sfx('tap'); box.querySelectorAll('.as-o').forEach((x) => { x.disabled = true; }); b.classList.add('sel'); act({ t: 'ans', c: +b.dataset.i }); }));
  } else if (rd.type === 'split') {
    if (rd.role === 'clue') box.innerHTML = `${head}<p class="as-role">${I.eye || '👁'} You hold the <b>clue</b>. ${esc(mate.name)} holds the choices.</p><div class="as-clue ${zh}">${esc(rd.q)}</div>${rd.note ? `<p class="muted as-note">${esc(rd.note)}</p>` : ''}<p class="as-st">Explain it in the chat below (you can’t see the ${rd.n} choices). ${esc(mate.name)} picks.</p>`;
    else { box.innerHTML = `${head}<p class="as-role">🧩 You hold the <b>choices</b>. ${esc(mate.name)} sees the clue — ask in the chat!</p><div class="as-opts">${rd.opts.map((o, i) => `<button type="button" class="as-o ${zh} ${rd.picked === i ? 'sel' : ''}" data-i="${i}" ${rd.picked != null ? 'disabled' : ''}><i>${'ABCD'[i]}</i>${esc(o)}</button>`).join('')}</div><p class="as-st">One pick for the team. Choose when you agree.</p>`;
      box.querySelectorAll('.as-o').forEach((b) => b.addEventListener('click', () => { sfx('tap'); box.querySelectorAll('.as-o').forEach((x) => { x.disabled = true; }); b.classList.add('sel'); act({ t: 'ans', c: +b.dataset.i }); })); }
  } else if (rd.type === 'relay') {
    const placed = new Set(rd.line || []), mine = (rd.mine || []).filter((x) => !placed.has(x.i));
    box.innerHTML = `${head}<p class="as-role">${solo ? '🧱 Build the sentence. Tap the words in the right order.' : `🏃 Build the sentence together. You hold ${rd.mine ? rd.mine.length : 0} words, ${esc(mate.name)} holds ${rd.theirs}.`}</p><div class="as-vi">${esc(rd.vi)}</div>
      <div class="as-line ${zh}">${(rd.line_t || []).map((t) => `<span class="tile ${zh}">${esc(t)}</span>`).join('')}${[...Array(Math.max(0, rd.n - (rd.line || []).length))].map((_, k) => `<span class="slot ${k === 0 ? 'next' : ''}"></span>`).join('')}</div>
      <div class="as-bank">${mine.map((x) => `<button type="button" class="tile ${zh}" data-i="${x.i}">${esc(x.t)}</button>`).join('') || `<p class="muted">All your words are placed. ${(rd.line || []).length < rd.n ? `Waiting for ${esc(mate.name)}…` : ''}</p>`}</div>
      <p class="as-st">Tap your word when it comes next. Wrong taps: ${rd.miss || 0}</p>`;
    box.querySelectorAll('.as-bank .tile').forEach((b) => b.addEventListener('click', () => { sfx('tile'); b.disabled = true; act({ t: 'tile', i: +b.dataset.i }).then(() => { if (b.isConnected) b.disabled = false; }); }));
    if (prev && prev.round && prev.ridx === s.ridx && (rd.miss || 0) > (prev.round.miss || 0)) { box.querySelector('.as-line').classList.add('shake'); sfx('bad'); }
  } else if (rd.type === 'link' && rd.role === 'solo') {
    const okW = new Set(rd.ok || []), okM = new Set(rd.okm || []), sel = live.lsel && live.lsel.r === s.ridx ? live.lsel : (live.lsel = { r: s.ridx, w: null, m: null });
    box.innerHTML = `${head}<p class="as-role">🔗 Tap a word, then its meaning.</p>
      <div class="as-link solo ${zh}"><div class="as-col"><small>Words</small>${rd.words.map((t, i) => `<button type="button" class="as-li ${okW.has(i) ? 'done' : ''} ${sel.w === i ? 'sel' : ''}" data-w="${i}" ${okW.has(i) ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>
      <div class="as-col"><small>Meanings</small>${rd.means.map((t, i) => `<button type="button" class="as-li ${okM.has(i) ? 'done' : ''} ${sel.m === i ? 'sel' : ''}" data-m="${i}" ${okM.has(i) ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div></div>
      <p class="as-st">${okW.size}/${rd.n} matched${rd.bad ? ` · misses ${rd.bad}` : ''}</p>`;
    const tryPair = () => { if (sel.w == null || sel.m == null) return; const w = sel.w, m = sel.m; sel.w = null; sel.m = null; act({ t: 'pair', w, m }); };
    box.querySelectorAll('.as-li').forEach((b) => b.addEventListener('click', () => {
      sfx('tap'); const col = b.dataset.w != null ? 'w' : 'm';
      b.parentElement.querySelectorAll('.as-li').forEach((x) => x.classList.remove('sel')); b.classList.add('sel');
      sel[col] = +(b.dataset.w != null ? b.dataset.w : b.dataset.m); tryPair();
    }));
    if (prev && prev.round && prev.ridx === s.ridx && rd.last && (!prev.round.last || prev.round.last.at !== rd.last.at)) sfx(rd.last.ok ? 'ok' : 'wrong');
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
  const txt = { quick: 'Quick! ×1.25', sync: 'Perfect sync! ×1.25', both: 'Both right!', one: 'Half hit', miss: 'Missed!', ok: 'Hit!', time: 'Time’s up!', weak: 'Too few links' }[last.note] || '';
  f.innerHTML = `<b>${dmg > 0 ? '−' + dmg : '0'}</b><span>${esc(txt)}${last.lost ? ` · −1 ${I.heart}` : ''}</span>`;
  el.appendChild(f); setTimeout(() => f.remove(), 1600);
  if (dmg > 0) { sfx(last.note === 'sync' || last.note === 'quick' ? 'levelup' : 'ok'); const hp = el.querySelector('.as-boss'); hp.classList.remove('hit'); void hp.offsetWidth; hp.classList.add('hit'); } else sfx('bad');
}

function endScreen(s, box) {
  const me = s.role, mate = me === 'h' ? s.guest : s.host, rw = s.reward || {}, fx = me === 'h' ? rw.fx_h : rw.fx_g;
  const fw = me === 'h' ? rw.first_h : rw.first_g, wl = +(me === 'h' ? rw.wall_h : rw.wall_g) || 0, tk = me === 'h' ? (rw.tk_h ?? rw.ticket) : (rw.tk_g ?? rw.ticket);
  const [m, r, n] = s.boss.split('-');
  if (s.state === 'won') {
    box.innerHTML = `<div class="as-end won"><div class="as-chest">🎁</div><h2>Victory!</h2><p>${s.solo ? 'You beat' : `You and ${esc(mate.name)} beat`} <b>${esc(bossName(m, +r, +n))}</b>${s.solo ? ' alone' : ''}${rw.first ? ' for the first time' : ''}.</p>
      <div class="as-stars">${[1, 2, 3].map((i) => `<i class="${i <= (rw.stars || 1) ? 'on' : ''}">★</i>`).join('')}</div>
      <div class="as-rw">${rw.xp ? `<span>+${rw.xp} XP</span>` : '<span class="muted">No XP (10 wins today already)</span>'}${fx ? `<span class="fxnew">${bestie.fxBadge(fx)}</span>` : ''}${tk ? '<span>🎟️ +1 lucky spin</span>' : ''}${fw && !wl ? '<span>+300 XP (you own every wallpaper)</span>' : ''}</div>
      ${fw && wl ? `<div class="as-first"><small>${I.gift} First win reward</small>${walls.card(wl, { state: 'got', cls: 'as-wc' })}<span>New wallpaper in your collection</span></div>` : ''}
      <div class="as-acts">${fx ? '<button class="btn ghost as-try" type="button">Try the effect</button>' : ''}${tk ? `<button class="btn ${fw ? 'acc' : 'ghost'} as-spin" type="button">🎟️ Spin now</button>` : ''}${wl ? '<button class="btn ghost as-bg" type="button">Use as background</button>' : ''}<button class="btn ${tk ? 'ghost' : 'acc'} as-map" type="button">Back to map</button></div></div>`;
    if (!live.cele) { live.cele = 1; sfx('levelup'); const b = box.getBoundingClientRect(); burst(b.left + b.width / 2, b.top + 80, 40); if (rw.xp && C.tick) C.tick(true); if (tk) gacha.load(true).catch(() => {}); if (wl) { walls.addLocal(wl, 'adv-first'); walls.syncWalls().catch(() => {}); } if (fw && M) { M.firsts = [...(M.firsts || []), s.boss]; } }
  } else {
    const msg = { lost: s.hearts <= 0 ? 'Out of hearts.' : 'The boss survived all rounds.', left: 'Someone left the battle.', expired: 'The invitation expired.', declined: `${esc(mate.name)} can’t play right now.` }[s.state];
    const tip = s.solo ? 'Read each clue carefully and answer fast for Quick damage.' : 'Try again — talking in the chat helps a lot!';
    box.innerHTML = `<div class="as-end"><div class="as-chest">${s.state === 'lost' ? '💫' : '🕊️'}</div><h2>${s.state === 'lost' ? 'Defeated' : 'Battle over'}</h2><p>${msg}</p>${s.state === 'lost' ? `<p class="muted">Boss HP left: ${s.hp}. ${tip}</p>` : ''}<div class="as-acts"><button class="btn acc as-map" type="button">Back to map</button></div></div>`;
  }
  const ans = s.answers || [];
  if (ans.length && s.state !== 'expired' && s.state !== 'declined') box.querySelector('.as-end').insertAdjacentHTML('beforeend', `<details class="as-rev"><summary>Review the answers</summary>${ans.map((a, i) => `<div><small>${i + 1}. ${typeOf(a.type, s.solo).name}</small> ${a.type === 'relay' ? esc(a.tk.join(a.zh ? '' : ' ')) : a.type === 'link' ? a.words.map((w, k) => `${esc(w)} = ${esc(a.means[a.a[k]])}`).join(' · ') : `${esc(a.q)} → <b>${esc(a.opts[a.a])}</b>`}</div>`).join('')}</details>`);
  const t = box.querySelector('.as-try'); if (t) t.addEventListener('click', () => bestie.playFx(fx, { me: { name: acct.name, avatar: acct.avatar }, them: { name: mate.name, avatar: mate.avatar }, title: 'New Bestie effect!' }));
  const sb = box.querySelector('.as-chest'); if (sb && s.state === 'won') sb.classList.add('open');
  const ub = box.querySelector('.as-bg'); if (ub) ub.addEventListener('click', () => { walls.setBg(wl); sfx('ok'); toast('Background set'); ub.disabled = true; });
  const sp = box.querySelector('.as-spin'); if (sp) sp.addEventListener('click', () => { stopStage(false); C.spin({}); });
  box.querySelector('.as-map').addEventListener('click', () => { stopStage(false); location.hash = '#/adventure'; page(); });
  clearInterval(live.t); live.t = 0;
}
