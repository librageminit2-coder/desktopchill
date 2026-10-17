// Trạng thái học: lưu trên máy (localStorage) và đồng bộ lên tài khoản nếu đã đăng nhập
const KEY = 'dcl_state_v1';
const DAY = 86400000;
export const today = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const yesterday = () => today(new Date(Date.now() - DAY));

function fresh() {
  return {
    v: 1, updated: 0, lang: 'en', level: { en: 'a1', zh: 'hsk1' },
    done: {},          // "en-a1-1": [1,0,0,0]  (4 bài trong mỗi chủ đề)
    xp: 0, goal: 20,
    days: {},          // "2026-10-17": xp trong ngày
    streak: { n: 0, last: '' },
    srs: {},           // "en|colleague": { d: due(ms), i: ngày, e: ease, r: số lần }
    words: 0, minutes: 0,
    settings: { sound: true, rate: 0.95, pinyin: true, vi: false, voice: { en: '', zh: '' } },
    onboarded: false,
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

const subs = new Set();
export const onSave = (fn) => subs.add(fn);
let tSave = null;
export function save(now = false) {
  S.updated = Date.now();
  const w = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} subs.forEach((f) => { try { f(S); } catch (e) {} }); };
  clearTimeout(tSave); if (now) w(); else tSave = setTimeout(w, 250);
}
export function replace(obj) { S = merge(fresh(), obj || {}); save(true); }
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

/* ---------- tiến độ bài học ---------- */
export function lessonDone(unitId, k) { return !!(S.done[unitId] && S.done[unitId][k]); }
export function markDone(unitId, k) { if (!S.done[unitId]) S.done[unitId] = [0, 0, 0, 0]; S.done[unitId][k] = 1; save(); }
export function unitProgress(unitId) { const a = S.done[unitId] || []; return a.filter(Boolean).length; }

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
