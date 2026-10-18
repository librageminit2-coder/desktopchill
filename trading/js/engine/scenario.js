// Kịch bản thị trường: dựa trên chính các nhịp tăng/giảm của VN-Index trong ~2 năm qua để biết
// mã/ngành nào thường tăng trước khi thị trường hồi và giảm trước khi thị trường điều chỉnh,
// rồi kết hợp với tín hiệu kỹ thuật hiện tại để chọn ứng viên.
import { zigzag } from './structure.js?v=c3bd6cc0';
import { median } from './market.js?v=8023da8a';

const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(x);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const H = 10; // số phiên đầu của mỗi nhịp

function rankMap(obj) {
  const e = Object.entries(obj).filter(([, v]) => ok(v)).sort((a, b) => a[1] - b[1]); const n = e.length; const out = {};
  e.forEach(([k], i) => { out[k] = n > 1 ? (100 * i) / (n - 1) : 50; }); return out;
}

export function scenarios({ bars, index, secOf, secNames, feats, scores, sectors, market }) {
  if (!index || index.length < 200) return null;
  const idxT = index.map((b) => b.t);
  const ic = index.map((b) => b.c);
  // nhịp của chỉ số
  const piv = zigzag(index.map((b) => b.h), index.map((b) => b.l), 0.06).filter((x) => !x.open && x.i <= index.length - 1 - H);
  const eps = piv.map((p) => ({ type: p.t === 'L' ? 'up' : 'down', i: p.i, t: index[p.i].t, idxRet: (ic[p.i + H] / ic[p.i] - 1) * 100,
    move: null })).slice(-8);
  // biên độ cả nhịp (đến pivot kế tiếp)
  const allPiv = zigzag(index.map((b) => b.h), index.map((b) => b.l), 0.06);
  for (const e of eps) { const nx = allPiv.find((p) => p.i > e.i); if (nx) e.move = (nx.p / index[e.i].c - 1) * 100; e.endT = nx ? index[Math.min(nx.i, index.length - 1)].t : null; }
  // bỏ nhịp trùng ngày hoặc ngược chiều (thường là điểm đầu chuỗi của zigzag)
  const seen = new Set();
  for (let k = eps.length - 1; k >= 0; k--) { const e = eps[k]; if (seen.has(e.i) || (ok(e.move) && (e.type === 'up' ? e.move <= 0 : e.move >= 0))) eps.splice(k, 1); else seen.add(e.i); }

  const per = {}; const closeOf = {};
  for (const [sym, b] of Object.entries(bars)) {
    const f = feats[sym]; if (!f || b.length < 120) continue;
    const close = closeOf[sym] = new Map(b.map((x) => [x.t, x.c]));
    // up/down capture 250 phiên
    const ru = [], rmu = [], rd = [], rmd = [];
    const start = Math.max(1, index.length - 250);
    for (let k = start; k < index.length; k++) {
      const c0 = close.get(idxT[k - 1]), c1 = close.get(idxT[k]); if (!c0 || !c1) continue;
      const rm = ic[k] / ic[k - 1] - 1, rs = c1 / c0 - 1;
      if (rm > 0.002) { ru.push(rs); rmu.push(rm); } else if (rm < -0.002) { rd.push(rs); rmd.push(rm); }
    }
    const upCap = ru.length > 20 ? mean(ru) / mean(rmu) : NaN, downCap = rd.length > 20 ? mean(rd) / mean(rmd) : NaN;
    // 10 phiên đầu các nhịp
    const eu = [], ed = [];
    for (const e of eps) {
      const c0 = close.get(e.t), c1 = close.get(idxT[e.i + H]); if (!c0 || !c1) continue;
      const ex = (c1 / c0 - 1) * 100 - e.idxRet; (e.type === 'up' ? eu : ed).push(ex);
    }
    per[sym] = { upCap, downCap, earlyUp: eu.length ? mean(eu) : NaN, earlyDown: ed.length ? mean(ed) : NaN, nUp: eu.length, nDown: ed.length, liq: f.avgVal20 };
  }
  const liquid = Object.fromEntries(Object.entries(per).filter(([, x]) => x.liq >= 3e9));
  const rEU = rankMap(Object.fromEntries(Object.entries(liquid).map(([s, x]) => [s, x.earlyUp])));
  const rED = rankMap(Object.fromEntries(Object.entries(liquid).map(([s, x]) => [s, -x.earlyDown])));
  const rUC = rankMap(Object.fromEntries(Object.entries(liquid).map(([s, x]) => [s, x.upCap])));
  const rDC = rankMap(Object.fromEntries(Object.entries(liquid).map(([s, x]) => [s, x.downCap])));

  const readiness = (sym) => {
    const sc = scores[sym], f = feats[sym]; if (!sc || !f) return { up: 50, down: 50, upWhy: [], downWhy: [] };
    let up = 0.5 * sc.short.score + 0.5 * sc.mid.score, down = 100 - up; const upWhy = [], downWhy = [];
    const bullPat = f.patterns.filter((p) => p.kind === 'bull'); const bearPat = f.patterns.filter((p) => p.kind === 'bear');
    if (bullPat.length) { up += 6; upWhy.push(bullPat[0].name + (bullPat[0].confirmed ? '' : ' (đang hình thành)')); }
    if (f.udRatio > 1.2) { up += 4; upWhy.push('đang được gom (KL ngày tăng > ngày giảm)'); }
    if (f.price > f.ema20 && f.ema10 > f.ema20) { up += 3; upWhy.push('giá trên EMA20'); }
    if (f.div.some((d) => d.kind === 'bull' && !d.hidden)) { up += 4; upWhy.push('phân kỳ dương'); }
    if (sc.rsShort > 70) upWhy.push(`RS 1 tháng ${Math.round(sc.rsShort)}`);
    if (bearPat.length) { down += 6; downWhy.push(bearPat[0].name + (bearPat[0].confirmed ? '' : ' (đang hình thành)')); }
    if (f.udRatio < 0.85) { down += 4; downWhy.push('đang bị xả (KL ngày giảm > ngày tăng)'); }
    if (f.price < f.ma50) { down += 3; downWhy.push('giá dưới MA50'); }
    if (f.div.some((d) => d.kind === 'bear' && !d.hidden)) { down += 4; downWhy.push('phân kỳ âm'); }
    if (f.ind.ma50 && f.price / f.ma50 > 1.2) { down += 3; downWhy.push('đã tăng nóng, xa MA50'); }
    return { up: Math.min(100, up), down: Math.min(100, down), upWhy, downWhy };
  };

  const stockUp = [], stockDown = [];
  for (const [sym, x] of Object.entries(liquid)) {
    const rd = readiness(sym);
    const hasHist = x.nUp > 0;
    const su = 0.4 * (hasHist ? (rEU[sym] ?? 50) : 50) + 0.25 * (rUC[sym] ?? 50) + 0.35 * rd.up;
    const sd = 0.4 * (x.nDown > 0 ? (rED[sym] ?? 50) : 50) + 0.25 * (rDC[sym] ?? 50) + 0.35 * rd.down;
    const why = (good) => {
      const w = [];
      if (good && ok(x.earlyUp) && x.nUp) w.push(`${x.earlyUp >= 0 ? 'vượt' : 'kém'} VN-Index ${Math.abs(x.earlyUp).toFixed(1)}% trong ${H} phiên đầu của ${x.nUp} nhịp hồi gần đây`);
      if (!good && ok(x.earlyDown) && x.nDown) w.push(`${x.earlyDown <= 0 ? 'giảm sâu hơn' : 'giữ giá tốt hơn'} VN-Index ${Math.abs(x.earlyDown).toFixed(1)}% trong ${H} phiên đầu của ${x.nDown} nhịp giảm`);
      if (good && ok(x.upCap)) w.push(`ngày thị trường tăng, mã tăng ${x.upCap.toFixed(1)}× chỉ số`);
      if (!good && ok(x.downCap)) w.push(`ngày thị trường giảm, mã giảm ${x.downCap.toFixed(1)}× chỉ số`);
      return w.concat(good ? rd.upWhy : rd.downWhy).slice(0, 4);
    };
    stockUp.push({ sym, score: su, sec: secOf[sym], why: why(true), ready: rd.up, earlyUp: x.earlyUp, upCap: x.upCap });
    stockDown.push({ sym, score: sd, sec: secOf[sym], why: why(false), weak: rd.down, earlyDown: x.earlyDown, downCap: x.downCap });
  }
  stockUp.sort((a, b) => b.score - a.score); stockDown.sort((a, b) => b.score - a.score);

  // ngành
  const secCur = Object.fromEntries((sectors || []).map((s) => [s.code, s]));
  const secAgg = {};
  for (const [sym, x] of Object.entries(liquid)) { const c = secOf[sym]; if (c === undefined) continue; (secAgg[c] = secAgg[c] || []).push(x); }
  const secRows = Object.entries(secAgg).filter(([, a]) => a.length >= 3).map(([c, a]) => ({ code: +c, name: secNames[c] || 'Khác', n: a.length,
    earlyUp: median(a.map((x) => x.earlyUp)), earlyDown: median(a.map((x) => x.earlyDown)), upCap: median(a.map((x) => x.upCap)), downCap: median(a.map((x) => x.downCap)), cur: secCur[c]?.score ?? 50 }));
  const sEU = rankMap(Object.fromEntries(secRows.map((s) => [s.code, s.earlyUp]))), sED = rankMap(Object.fromEntries(secRows.map((s) => [s.code, -s.earlyDown])));
  const sUC = rankMap(Object.fromEntries(secRows.map((s) => [s.code, s.upCap]))), sDC = rankMap(Object.fromEntries(secRows.map((s) => [s.code, s.downCap])));
  for (const s of secRows) {
    s.upScore = 0.45 * (sEU[s.code] ?? 50) + 0.25 * (sUC[s.code] ?? 50) + 0.3 * s.cur;
    s.downScore = 0.45 * (sED[s.code] ?? 50) + 0.25 * (sDC[s.code] ?? 50) + 0.3 * (100 - s.cur);
    s.upPicks = stockUp.filter((x) => x.sec === s.code).slice(0, 3).map((x) => x.sym);
    s.downPicks = stockDown.filter((x) => x.sec === s.code).slice(0, 3).map((x) => x.sym);
  }
  const secUp = [...secRows].sort((a, b) => b.upScore - a.upScore), secDown = [...secRows].sort((a, b) => b.downScore - a.downScore);

  // nhịp lịch sử + ngành dẫn dắt mỗi nhịp
  const history = eps.map((e) => {
    const bySec = {};
    for (const sym of Object.keys(bars)) {
      if (!liquid[sym]) continue; const c = secOf[sym]; if (c === undefined) continue;
      const close = closeOf[sym]; if (!close) continue; const c0 = close.get(e.t), c1 = close.get(idxT[e.i + H]); if (!c0 || !c1) continue;
      (bySec[c] = bySec[c] || []).push((c1 / c0 - 1) * 100);
    }
    const ranked = Object.entries(bySec).filter(([, a]) => a.length >= 3).map(([c, a]) => ({ name: secNames[c], r: median(a) })).sort((a, b) => (e.type === 'up' ? b.r - a.r : a.r - b.r));
    return { type: e.type, t: e.t, endT: e.endT, idxRet: e.idxRet, move: e.move, leaders: ranked.slice(0, 3) };
  }).reverse();

  // mốc kích hoạt kịch bản
  const last = index[index.length - 1].c;
  const hs = allPiv.filter((p) => p.t === 'H' && p.p > last).map((p) => p.p), ls = allPiv.filter((p) => p.t === 'L' && p.p < last).map((p) => p.p);
  const recentLow = Math.min(...index.slice(-20).map((b) => b.l));
  const uniq = (arr) => arr.filter((x, k) => arr.findIndex((y) => Math.abs(y.p / x.p - 1) < 0.003) === k);
  const triggers = { up: [market?.ma20 > last ? { label: 'MA20', p: market.ma20 } : null, market?.ma50 > last ? { label: 'MA50', p: market.ma50 } : null, hs.length ? { label: 'đỉnh gần nhất', p: Math.min(...hs) } : null].filter(Boolean).sort((a, b) => a.p - b.p),
    down: [{ label: 'đáy 20 phiên', p: recentLow }, ls.length ? { label: 'đáy sóng trước', p: Math.max(...ls) } : null, market?.ma200 < last ? { label: 'MA200', p: market.ma200 } : null].filter(Boolean).sort((a, b) => b.p - a.p) };
  triggers.up = uniq(triggers.up); triggers.down = uniq(triggers.down);
  return { stockUp: stockUp.slice(0, 15), stockDown: stockDown.slice(0, 15), secUp: secUp.slice(0, 8), secDown: secDown.slice(0, 8), history, triggers, nEp: { up: eps.filter((e) => e.type === 'up').length, down: eps.filter((e) => e.type === 'down').length }, H };
}
