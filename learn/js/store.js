// Trạng thái học: lưu trên máy (localStorage) và đồng bộ lên tài khoản nếu đã đăng nhập
const KEY = 'dcl_state_v1';
const DAY = 86400000;
export const today = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const yesterday = () => today(new Date(Date.now() - DAY));

function fresh() {
  return {
    v: 3, updated: 0, lang: 'en', level: { en: 'a1', zh: 'hsk4', ielts: 'b4' },
    daily: { d: '', lessons: 0, speak: 0, review: 0 }, // đếm cho nhiệm vụ hằng ngày
    done: {},          // "en-a1-1": [1,0,0,0]  (4 bài trong mỗi chủ đề)
    xp: 0, goal: 20,
    days: {},          // "2026-10-17": xp trong ngày
    streak: { n: 0, last: '' },
    srs: {},           // "en|colleague": { d: due(ms), i: ngày, e: ease, r: số lần }
    words: 0, minutes: 0,
    settings: { sound: true, rate: 0.95, pinyin: true, vi: false, voice: { en: '', zh: '' } },
    onboarded: false,
    stars: {},         // "en-a1-1": [3,2,0,…] sao tốt nhất của từng bài
    chests: {},        // rương cuối chủ đề đã mở
    boss: {},          // thử thách cuối level đã vượt qua
    badges: {},        // huy hiệu: id → ngày đạt
    best: {},          // kỷ lục: "speed|en" → điểm
    counts: { perfect: 0, combo: 0, speakOk: 0, reviewed: 0 },
    dchest: '',        // ngày đã mở rương nhiệm vụ
  };
}
function merge(base, add) {
  for (const k in add) {
    if (add[k] && typeof add[k] === 'object' && !Array.isArray(add[k]) && base[k] && typeof base[k] === 'object') merge(base[k], add[k]);
    else base[k] = add[k];
  }
  return base;
}
export let S = fresh();
try { const raw = localStorage.getItem(KEY); if (raw) S = merge(fresh(), JSON.parse(raw)); } catch (e) {}
// lộ trình tiếng Trung giờ bắt đầu từ HSK4
const fixLevel = () => {
  if (!S.level.ielts) S.level.ielts = 'b4';
  // v2: mỗi chủ đề có 8 bài (trước là 4: từ vựng, hội thoại, đọc, ngữ pháp)
  if ((S.v || 1) < 2) {
    Object.keys(S.done).forEach((k) => { const a = S.done[k]; if (Array.isArray(a) && a.length === 4) S.done[k] = [a[0], 0, a[1], 0, a[2], a[3], 0, 0]; });
    S.v = 2;
  }
  if (S.v < 3) S.v = 3;
};
fixLevel();

const subs = new Set();
export const onSave = (fn) => subs.add(fn);
let tSave = null;
export function save(now = false) {
  S.updated = Date.now();
  const w = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} subs.forEach((f) => { try { f(S); } catch (e) {} }); };
  clearTimeout(tSave); if (now) w(); else tSave = setTimeout(w, 250);
}
export function replace(obj) { S = merge(fresh(), obj || {}); fixLevel(); save(true); }
export function reset() { S = fresh(); save(true); }

/* ---------- XP, chuỗi ngày ---------- */
export function addXP(n) {
  const d = today();
  S.xp += n; S.days[d] = (S.days[d] || 0) + n;
  if (S.streak.last !== d) {
    S.streak.n = S.streak.last === yesterday() ? S.streak.n + 1 : 1;
    S.streak.last = d;
  }
  // giữ 120 ngày gần nhất
  const keys = Object.keys(S.days).sort(); while (keys.length > 120) delete S.days[keys.shift()];
  save();
}
export function streakNow() { return S.streak.last === today() || S.streak.last === yesterday() ? S.streak.n : 0; }
export const todayXP = () => S.days[today()] || 0;
/* ---------- đếm việc trong ngày (nhiệm vụ) ---------- */
export function daily() { if (S.daily.d !== today()) S.daily = { d: today(), lessons: 0, speak: 0, review: 0 }; return S.daily; }
export function bump(key, n = 1) {
  const d = daily(); d[key] = (d[key] || 0) + n;
  if (!S.counts) S.counts = {};
  if (key === 'speak') S.counts.speakOk = (S.counts.speakOk || 0) + n;
  if (key === 'review') S.counts.reviewed = (S.counts.reviewed || 0) + n;
  if (key === 'lessons') S.counts.lessons = (S.counts.lessons || 0) + n;
  save();
}

/* ---------- tiến độ bài học ---------- */
export function lessonDone(unitId, k) { return !!(S.done[unitId] && S.done[unitId][k]); }
export const LN = 8; // số bài mỗi chủ đề
export function markDone(unitId, k) { if (!S.done[unitId]) S.done[unitId] = new Array(LN).fill(0); S.done[unitId][k] = 1; save(); }
export function unitProgress(unitId) { const a = S.done[unitId] || []; return a.filter(Boolean).length; }
export function setStars(unitId, k, n) { if (!S.stars[unitId]) S.stars[unitId] = new Array(LN).fill(0); const prev = S.stars[unitId][k] || 0; if (n > prev) S.stars[unitId][k] = n; save(); return n > prev; }
export const starsOf = (unitId, k) => (S.stars[unitId] && S.stars[unitId][k]) || (lessonDone(unitId, k) ? 1 : 0);
export const unitStars = (unitId) => { let n = 0; for (let k = 0; k < LN; k++) n += starsOf(unitId, k); return n; };

/* ---------- cấp độ người chơi: mỗi cấp cần nhiều XP hơn cấp trước ---------- */
export function playerLevel(xp = S.xp) {
  let lv = 1, need = 60, left = xp;
  while (left >= need) { left -= need; lv++; need = 60 + (lv - 1) * 30; }
  return { lv, cur: left, need };
}

/* ---------- ôn tập ngắt quãng (SM-2 rút gọn) ---------- */
export const srsKey = (lang, w) => lang + '|' + w;
export function addWords(lang, words) {
  let added = 0;
  words.forEach((w) => { const k = srsKey(lang, w); if (!S.srs[k]) { S.srs[k] = { d: Date.now() + 8 * 3600000, i: 0, e: 2.4, r: 0 }; added++; } });
  S.words = Object.keys(S.srs).length; save();
  return added;
}
export function due(lang) {
  const now = Date.now();
  return Object.entries(S.srs).filter(([k, v]) => k.startsWith(lang + '|') && v.d <= now).sort((a, b) => a[1].d - b[1].d).map(([k]) => k.slice(lang.length + 1));
}
export function grade(lang, w, g) { // g: 0 quên, 1 mơ hồ, 2 nhớ
  const k = srsKey(lang, w), c = S.srs[k] || { i: 0, e: 2.4, r: 0 };
  if (g === 0) { c.r = 0; c.i = 0; c.e = Math.max(1.3, c.e - 0.2); c.d = Date.now() + 10 * 60000; }
  else {
    if (g === 1) { c.e = Math.max(1.3, c.e - 0.15); c.i = Math.max(1, Math.round((c.i || 1) * 1.2)); }
    else { c.i = c.r === 0 ? 1 : c.r === 1 ? 3 : Math.round(c.i * c.e); c.e = Math.min(3, c.e + 0.05); }
    c.r++; c.d = Date.now() + c.i * DAY;
  }
  S.srs[k] = c; save();
}
