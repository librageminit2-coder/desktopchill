// Điều phối dữ liệu: tải danh mục, lịch sử (có cache), bảng giá realtime, chỉ số cơ bản; đẩy sang worker để phân tích.
import * as src from './sources.js?v=b3442460';
import * as cache from './cache.js?v=0c2b413d';
import { POLL_LIVE, POLL_HIDDEN, POLL_IDLE, HISTORY_DAYS, FUND_TTL } from '../config.js?v=1704ec5b';

const listeners = new Set();
export const on = (fn) => (listeners.add(fn), () => listeners.delete(fn));
const emit = (what) => listeners.forEach((fn) => { try { fn(what, state); } catch (e) { console.error(e); } });

export const state = {
  syms: [], secOf: {}, secNames: {}, names: {}, board: {}, bars: {}, index: [], idxLive: null, fund: {},
  result: null, progress: { done: 0, total: 0, phase: 'Đang khởi động' }, session: null, lastTick: 0, errors: [], source: 'KBS',
};

// ---------- phiên giao dịch (giờ Việt Nam) ----------
export function sessionInfo(now = new Date()) {
  const vn = new Date(now.getTime() + 7 * 3600000); const d = vn.getUTCDay(); const m = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const weekday = d >= 1 && d <= 5; const total = 270;
  let phase = 'closed', elapsed = total;
  if (weekday) {
    if (m < 540) { phase = 'pre'; elapsed = 0; }
    else if (m < 690) { phase = 'morning'; elapsed = m - 540; }
    else if (m < 780) { phase = 'lunch'; elapsed = 150; }
    else if (m < 885) { phase = 'afternoon'; elapsed = 150 + (m - 780); }
    else if (m < 900) { phase = 'atc'; elapsed = 255 + (m - 885); }
    else { phase = 'closed'; elapsed = total; }
  }
  const live = ['morning', 'afternoon', 'atc'].includes(phase);
  const label = { pre: 'Chưa mở cửa', morning: 'Đang giao dịch', lunch: 'Nghỉ trưa', afternoon: 'Đang giao dịch', atc: 'Phiên ATC', closed: 'Đã đóng cửa' }[phase];
  return { phase, live, label, frac: phase === 'pre' ? 1 : Math.max(0.05, elapsed / total), weekday };
}

// ---------- worker ----------
let worker = null;
function startWorker() {
  worker = new Worker(new URL('../engine/worker.js?v=e51b4ebb', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    if (ev.data.type === 'result') { state.result = ev.data.data; emit('result'); }
    else if (ev.data.type === 'error') { console.error('worker', ev.data.error); state.errors.push(ev.data.error); emit('error'); }
  };
  worker.onerror = (e) => { console.error('worker error', e); state.errors.push(String(e.message || e)); emit('error'); };
}
const post = (type, data) => worker && worker.postMessage({ type, data });

// ---------- lịch sử giá ----------
function merge(old, fresh) {
  if (!old || !old.length) return fresh;
  const lastOld = old[old.length - 1].t; const firstNew = fresh[0]?.t ?? Infinity;
  // kiểm tra điều chỉnh giá (chia cổ tức/cổ phiếu): so phần trùng nhau
  const byT = new Map(old.map((b) => [b.t, b]));
  for (const b of fresh) { const o = byT.get(b.t); if (o && Math.abs(o.c / b.c - 1) > 0.004) return null; }
  if (firstNew > lastOld + 6 * 86400) return null; // thiếu đoạn giữa → tải lại toàn bộ
  return [...old.filter((b) => b.t < firstNew), ...fresh];
}
async function loadHistory(sym, cached, isIndex = false) {
  const fetchFull = async () => {
    try { return await src.dailyKBS(sym, HISTORY_DAYS, isIndex); }
    catch (e) { state.source = 'VNDirect (dự phòng)'; return await src.dailyVND(sym, HISTORY_DAYS); }
  };
  const td = boardTD(); const lastT = cached?.bars?.length ? cached.bars[cached.bars.length - 1].t : 0;
  if (cached && cached.bars?.length && Date.now() - cached.at < 18 * 3600000 && (!td || lastT >= prevDay(td))) return { bars: cached.bars, fromCache: true };
  let bars = null;
  if (cached && cached.bars?.length > 100) {
    try { const delta = await src.dailyKBS(sym, 21, isIndex); bars = merge(cached.bars, delta); } catch (e) { bars = null; }
  }
  if (!bars) bars = await fetchFull();
  const cut = Date.now() / 1000 - HISTORY_DAYS * 86400;
  bars = bars.filter((b) => b.t >= cut);
  return { bars, fromCache: false };
}

function boardTD() { for (const b of Object.values(state.board)) if (b.td) return b.td; return null; }
function prevDay(t) { let d = t - 86400; while ([0, 6].includes(new Date(d * 1000).getUTCDay())) d -= 86400; return d; }

// nến hôm nay từ bảng giá
function todayBar(b) {
  if (!b || !b.td || !(b.price > 0) || !(b.vol > 0)) return null;
  return { t: b.td, o: b.open || b.price, h: Math.max(b.high || b.price, b.price), l: Math.min(b.low || b.price, b.price), c: b.price, v: b.vol, va: b.val || b.vol * b.price };
}
function applyToday(sym) {
  const tb = todayBar(state.board[sym]); const arr = state.bars[sym]; if (!tb || !arr) return null;
  const last = arr[arr.length - 1];
  if (!last || tb.t > last.t) arr.push(tb); else if (tb.t === last.t) arr[arr.length - 1] = tb; else return null;
  return tb;
}

// ---------- khởi động ----------
export async function init() {
  state.session = sessionInfo(); emit('session');
  startWorker();
  // 1) danh mục
  state.progress = { done: 0, total: 0, phase: 'Đang tải danh mục mã HOSE' }; emit('progress');
  let meta = await cache.get('meta', 'catalog');
  if (!meta || Date.now() - meta.at > 3 * 86400000) {
    const retry = async (fn) => { try { return await fn(); } catch (e) { await new Promise((r) => setTimeout(r, 1500)); return fn(); } };
    try {
      const [syms, sm] = await Promise.all([retry(src.hoseSymbols), retry(src.sectorMap).catch(() => meta || { secOf: {}, secNames: {}, names: {} })]);
      meta = { syms, secOf: sm.secOf, secNames: sm.secNames, names: sm.names, at: Object.keys(sm.secOf).length ? Date.now() : 0 }; cache.put('meta', 'catalog', meta);
    } catch (e) { if (!meta) throw new Error('Không tải được danh mục mã từ KBS. Kiểm tra kết nối mạng rồi tải lại trang.'); }
  }
  Object.assign(state, { syms: meta.syms, secOf: meta.secOf, secNames: meta.secNames, names: meta.names });
  emit('meta');
  // 2) bảng giá + chỉ số
  await refreshBoard(true);
  const idxCached = await cache.get('bars', '#VNINDEX');
  try { const r = await loadHistory('VNINDEX', idxCached, true); state.index = r.bars; if (!r.fromCache) cache.put('bars', '#VNINDEX', { bars: r.bars, at: Date.now() }); }
  catch (e) { state.errors.push('Chỉ số: ' + e.message); }
  applyIndexLive();
  emit('index');
  // 3) lịch sử từng mã
  const cachedAll = await cache.getAll('bars');
  const fundAll = await cache.getAll('fund'); state.fund = fundAll;
  const syms = state.syms.filter((s) => state.board[s] ? true : true);
  let batch = {}; let lastFlush = Date.now(); let started = false;
  const flush = (force) => {
    if (!Object.keys(batch).length) return;
    if (!started) { post('init', { bars: batch, index: state.index, secOf: state.secOf, secNames: state.secNames, board: boardLite(), fund: fundLite(), advDec: advDec(), sessionFrac: state.session.frac }); started = true; }
    else post('bars', batch);
    batch = {}; lastFlush = Date.now(); void force;
  };
  // mã có cache dùng ngay để hiện kết quả sớm
  for (const s of syms) { const c = cachedAll[s]; if (c?.bars?.length) { state.bars[s] = c.bars.slice(); applyToday(s); batch[s] = state.bars[s]; } }
  flush(true);
  state.progress = { done: 0, total: syms.length, phase: 'Đang cập nhật lịch sử giá' }; emit('progress');
  await src.pool(syms, 6, async (s) => {
    const r = await loadHistory(s, cachedAll[s]);
    if (!r.fromCache) cache.put('bars', s, { bars: r.bars, at: Date.now() });
    state.bars[s] = r.bars.slice(); applyToday(s); return r;
  }, (done, total, s, r) => {
    state.progress = { done, total, phase: 'Đang cập nhật lịch sử giá' };
    if (!(r instanceof Error)) batch[s] = state.bars[s];
    if (Date.now() - lastFlush > 1500 || done === total) { flush(); emit('progress'); }
  });
  flush(true);
  state.progress = { done: syms.length, total: syms.length, phase: 'Sẵn sàng' }; emit('progress');
  schedulePoll();
  loadFundamentals();
}

function boardLite() { const o = {}; for (const [s, b] of Object.entries(state.board)) o[s] = { fNet: b.fNet }; return o; }
function fundLite() { const o = {}; for (const [s, f] of Object.entries(state.fund)) o[s] = { pe: f.pe, pb: f.pb, roe: f.roe, niGrowth: f.niGrowth, revGrowth: f.revGrowth, health: f.health }; return o; }
function advDec() {
  if (state.idxLive && state.idxLive.up >= 0) return { up: state.idxLive.up, down: state.idxLive.down, flat: state.idxLive.flat };
  let up = 0, down = 0, flat = 0; for (const b of Object.values(state.board)) { if (!(b.price > 0)) continue; if (b.price > b.ref) up++; else if (b.price < b.ref) down++; else flat++; }
  return { up, down, flat };
}

function applyIndexLive() {
  const L = state.idxLive; const arr = state.index; if (!L || !arr.length || !(L.price > 0)) return null;
  const td = Object.values(state.board).find((b) => b.td)?.td; if (!td) return null;
  const last = arr[arr.length - 1];
  const bar = td > last.t ? { t: td, o: L.ref, h: Math.max(L.ref, L.price), l: Math.min(L.ref, L.price), c: L.price, v: L.vol, va: L.value }
    : td === last.t ? { ...last, c: L.price, h: Math.max(last.h, L.price), l: Math.min(last.l, L.price), v: Math.max(last.v, L.vol || 0), va: L.value || last.va } : null;
  if (!bar) return null;
  if (td > last.t) arr.push(bar); else arr[arr.length - 1] = bar;
  return bar;
}

export async function refreshBoard(first = false) {
  try {
    const [b, idx] = await Promise.all([src.boardKBS(state.syms), src.indexVPS().catch(() => null)]);
    state.board = b; if (idx) { state.idxLive = idx.VNINDEX; state.vn30 = idx.VN30; }
    state.lastTick = Date.now(); state.boardError = null;
  } catch (e) { state.boardError = 'Không lấy được bảng giá: ' + e.message; if (first) state.errors.push(state.boardError); }
  emit('board');
}

let pollT = null;
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.session?.live && pollT) schedulePoll(); });
function schedulePoll() {
  clearTimeout(pollT);
  state.session = sessionInfo();
  const ms = state.session.live ? (document.hidden ? POLL_HIDDEN : POLL_LIVE) : POLL_IDLE;
  pollT = setTimeout(async () => {
    if (document.hidden && !state.session.live) { schedulePoll(); return; }
    await refreshBoard();
    const today = {}; for (const s of state.syms) { const tb = applyToday(s); if (tb) today[s] = tb; }
    const it = applyIndexLive();
    post('tick', { today, idxToday: it, board: boardLite(), advDec: advDec(), sessionFrac: state.session.frac });
    emit('session');
    schedulePoll();
  }, ms);
}
export function refreshNow() { clearTimeout(pollT); state.session = sessionInfo(); pollT = null; return (async () => { await refreshBoard(); const today = {}; for (const s of state.syms) { const tb = applyToday(s); if (tb) today[s] = tb; } post('tick', { today, idxToday: applyIndexLive(), board: boardLite(), advDec: advDec(), sessionFrac: state.session.frac }); schedulePoll(); })(); }

// ---------- chỉ số cơ bản (nền) ----------
async function loadFundamentals() {
  const need = state.syms.filter((s) => !state.fund[s] || Date.now() - state.fund[s].at > FUND_TTL);
  if (!need.length) return;
  // ưu tiên mã thanh khoản cao
  need.sort((a, b) => (state.board[b]?.val || 0) - (state.board[a]?.val || 0));
  let batch = {}; let last = Date.now();
  await src.pool(need, 3, async (s) => { const f = await src.fundamentals(s); state.fund[s] = f; cache.put('fund', s, f); batch[s] = f; return f; }, (done, total) => {
    if (Date.now() - last > 8000 || done === total) { const lite = {}; for (const s of Object.keys(batch)) { const f = batch[s]; lite[s] = { pe: f.pe, pb: f.pb, roe: f.roe, niGrowth: f.niGrowth, revGrowth: f.revGrowth, health: f.health }; } post('fund', lite); batch = {}; last = Date.now(); emit('fund'); }
  });
}
export async function fundOf(sym) {
  if (state.fund[sym] && Date.now() - state.fund[sym].at < FUND_TTL) return state.fund[sym];
  try { const f = await src.fundamentals(sym); state.fund[sym] = f; cache.put('fund', sym, f); return f; } catch (e) { return state.fund[sym] || null; }
}
export async function resetCache() { await cache.clearAll(); }

// Lịch sử một mã (dùng khi mở trang chi tiết trước khi tải xong toàn bộ)
export async function barsOf(sym) {
  if (state.bars[sym]?.length) return state.bars[sym];
  const cached = await cache.get('bars', sym);
  const r = await loadHistory(sym, cached);
  if (!r.fromCache) cache.put('bars', sym, { bars: r.bars, at: Date.now() });
  state.bars[sym] = r.bars.slice(); applyToday(sym);
  return state.bars[sym];
}
export { src };
