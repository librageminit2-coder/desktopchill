// Sức khỏe thị trường, độ rộng, ngày phân phối, luân chuyển ngành.
import { computeAll, slopePct } from './indicators.js?v=8e6ac8b1';
import { trendStructure } from './structure.js?v=c3bd6cc0';

const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(x);
const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const pct = (a, b) => (a / b - 1) * 100;
const median = (a) => { const s = a.filter(ok).sort((x, y) => x - y); if (!s.length) return NaN; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function distributionDays(ind, look = 25) {
  const { c, v } = ind; const n = c.length; const days = [];
  for (let i = Math.max(1, n - look); i < n; i++) {
    const ch = pct(c[i], c[i - 1]);
    if (ch <= -0.2 && v[i] > v[i - 1]) days.push({ i, ch });
  }
  return days;
}

// Ngày bùng nổ xác nhận (follow-through): sau đáy điều chỉnh, phiên thứ 4+ của nhịp hồi tăng ≥1,2% với KL cao hơn phiên trước
export function followThrough(ind) {
  const { c, l, v } = ind; const n = c.length; if (n < 30) return null;
  let lowI = n - 25; for (let i = n - 25; i < n; i++) if (l[i] < l[lowI]) lowI = i;
  for (let i = lowI + 4; i < n; i++) {
    if (pct(c[i], c[i - 1]) >= 1.2 && v[i] > v[i - 1] && l.slice(lowI + 1, i + 1).every((x) => x > l[lowI])) return { i, ago: n - 1 - i };
  }
  return null;
}

export function marketHealth(idxBars, feats, { advDec = null, sessionFrac = 1 } = {}) {
  if (!idxBars || idxBars.length < 60) return null;
  const ind = computeAll(idxBars); const n = idxBars.length; const i = n - 1; const c = ind.c[i];
  const m = { price: c, chg: pct(c, ind.c[i - 1]), chgPts: c - ind.c[i - 1], ind };
  m.ma20 = ind.ma20[i]; m.ma50 = ind.ma50[i]; m.ma200 = ind.ma200[i];
  m.s20 = slopePct(ind.ma20, 5); m.s50 = slopePct(ind.ma50, 10); m.s200 = slopePct(ind.ma200, 20);
  m.rsi = ind.rsi[i]; m.hist = ind.macd.hist[i]; m.histPrev = ind.macd.hist[i - 1];
  m.struct = trendStructure(ind.h, ind.l, 0.04);
  m.dist = distributionDays(ind); m.ftd = followThrough(ind);
  m.idxAbove200 = c > m.ma200;
  m.fromHi = pct(c, Math.max(...ind.h.slice(-250)));

  // độ rộng
  const F = Object.values(feats).filter(Boolean);
  const share = (fn) => { const a = F.filter((f) => ok(fn(f))); return a.length ? (100 * a.filter((f) => fn(f) > 0).length) / a.length : NaN; };
  m.above20 = share((f) => f.price - f.ind.ma20[f.n - 1]);
  m.above50 = share((f) => f.price - f.ma50);
  m.above200 = share((f) => f.price - f.ma200);
  m.newHighs = F.filter((f) => f.newHigh).length; m.newLows = F.filter((f) => f.newLow).length;
  m.adv = advDec ? advDec.up : F.filter((f) => f.chg > 0).length;
  m.dec = advDec ? advDec.down : F.filter((f) => f.chg < 0).length;
  m.unch = advDec ? advDec.flat : F.filter((f) => f.chg === 0).length;
  // lịch sử % mã trên MA50 trong 60 phiên
  m.breadthHist = [];
  for (let k = 59; k >= 0; k--) {
    let a = 0, t = 0;
    for (const f of F) { const j = f.n - 1 - k; if (j < 50) continue; const ma = f.ind.ma50[j]; if (!ok(ma)) continue; t++; if (f.ind.c[j] > ma) a++; }
    m.breadthHist.push(t ? (100 * a) / t : NaN);
  }
  // thanh khoản toàn thị trường (tổng giá trị các mã)
  let today = 0; const hist = new Array(20).fill(0);
  for (const f of F) { today += f.ind.va[f.n - 1] || 0; for (let k = 1; k <= 20; k++) hist[k - 1] += f.ind.va[f.n - 1 - k] || 0; }
  m.valueToday = today; m.valueAvg20 = hist.reduce((s, x) => s + x, 0) / 20;
  m.valueRatio = m.valueAvg20 ? today / Math.max(0.08, sessionFrac) / m.valueAvg20 : NaN;

  // ---- điểm sức khỏe ----
  const parts = [];
  const P = (k, w, s, text) => { if (ok(s)) parts.push({ k, w, s: clamp(s), text }); };
  P('trend', 22, (c > m.ma20 ? 0.3 : -0.3) + (c > m.ma50 ? 0.35 : -0.35) + (m.ma20 > m.ma50 ? 0.35 : -0.35), `VN-Index ${c > m.ma20 ? 'trên' : 'dưới'} MA20, ${c > m.ma50 ? 'trên' : 'dưới'} MA50`);
  P('long', 10, (c > m.ma200 ? 0.5 : -0.5) + clamp(m.s200 * 8, -0.5, 0.5), `VN-Index ${c > m.ma200 ? 'trên' : 'dưới'} MA200, MA200 ${m.s200 > 0.01 ? 'vẫn dốc lên' : m.s200 < -0.01 ? 'dốc xuống' : 'đi ngang'}`);
  P('struct', 8, m.struct.score, `Cấu trúc sóng chỉ số: ${m.struct.label}`);
  P('breadth', 18, (m.above50 - 50) / 30, `${m.above50.toFixed(0)}% cổ phiếu HOSE nằm trên MA50`);
  P('breadth200', 6, (m.above200 - 50) / 30, `${m.above200.toFixed(0)}% cổ phiếu nằm trên MA200`);
  const dd = m.dist.length; P('dist', 14, dd <= 2 ? 0.6 : dd <= 4 ? 0 : dd <= 6 ? -0.6 : -1, `${dd} ngày phân phối trong 25 phiên${dd >= 5 ? ' — áp lực bán của tổ chức lớn' : ''}`);
  P('mom', 10, (m.rsi > 50 ? 0.4 : -0.4) + (m.hist > 0 ? 0.3 : -0.3) + (m.hist > m.histPrev ? 0.3 : -0.3), `RSI chỉ số ${m.rsi.toFixed(0)}, MACD ${m.hist > 0 ? 'dương' : 'âm'}`);
  if (ok(m.valueRatio)) P('liq', 6, m.chg >= 0 ? clamp((m.valueRatio - 0.9) * 1.5) : -clamp((m.valueRatio - 0.9) * 1.5, 0, 1), `Chỉ số ${m.chg >= 0 ? 'tăng' : 'giảm'} với thanh khoản ${m.valueRatio >= 1 ? 'cao' : 'thấp'} hơn trung bình 20 phiên (${(m.valueRatio * 100).toFixed(0)}%)`);
  if (m.newHighs + m.newLows > 3) P('hl', 6, (m.newHighs - m.newLows) / (m.newHighs + m.newLows), `${m.newHighs} mã lập đỉnh 52 tuần, ${m.newLows} mã lập đáy`);
  const W = parts.reduce((s, x) => s + x.w, 0);
  m.score = Math.round(50 + (50 * parts.reduce((s, x) => s + x.w * x.s, 0)) / W);
  m.parts = parts.map((x) => ({ ...x, impact: (x.w * x.s * 50) / W })).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  m.longScore = Math.round(50 + 50 * clamp((c > m.ma200 ? 0.5 : -0.5) + clamp(m.s200 * 8, -0.5, 0.5)) * 0.7 + 50 * clamp((m.above200 - 50) / 30) * 0.3);

  // ---- giai đoạn & câu nhận định ----
  const s = m.score;
  if (s >= 70) m.phase = 'Xu hướng tăng xác nhận';
  else if (s >= 57) m.phase = dd >= 5 ? 'Xu hướng tăng chịu áp lực' : 'Xu hướng tăng';
  else if (s >= 44) m.phase = 'Đi ngang, phân hóa';
  else if (s >= 30) m.phase = 'Điều chỉnh';
  else m.phase = 'Xu hướng giảm';
  m.tone = s >= 57 ? 'pos' : s >= 44 ? 'neu' : 'neg';
  m.headline = headline(m);
  return m;
}

function headline(m) {
  const breadth = m.above50 >= 60 ? 'dòng tiền lan tỏa rộng' : m.above50 >= 40 ? 'dòng tiền phân hóa' : 'đa số cổ phiếu nằm dưới MA50';
  const liq = ok(m.valueRatio) ? (m.valueRatio >= 1.15 ? ', thanh khoản sôi động' : m.valueRatio <= 0.75 ? ', thanh khoản thấp' : '') : '';
  const map = {
    'Xu hướng tăng xác nhận': `Thị trường khỏe, ${breadth}${liq}.`,
    'Xu hướng tăng': `Thị trường đang đi lên, ${breadth}${liq}.`,
    'Xu hướng tăng chịu áp lực': `Thị trường còn đi lên nhưng áp lực bán đang tăng${liq}.`,
    'Đi ngang, phân hóa': `Thị trường lưỡng lự, ${breadth}${liq}.`,
    'Điều chỉnh': `Thị trường đang điều chỉnh, ${breadth}${liq}.`,
    'Xu hướng giảm': `Thị trường yếu, ${breadth}${liq}.`,
  };
  return map[m.phase];
}

// ---- Ngành ----
export function sectorStats(feats, secOf, secNames, scores = {}) {
  const groups = {};
  for (const [sym, f] of Object.entries(feats)) {
    if (!f) continue; const code = secOf[sym]; if (code === undefined) continue;
    (groups[code] = groups[code] || []).push([sym, f]);
  }
  const out = [];
  for (const [code, arr] of Object.entries(groups)) {
    if (arr.length < 2) continue;
    let vT = 0, vA = 0, wchg = 0; const chg5 = [], chg20 = [], rs = [];
    let above50 = 0, cnt50 = 0;
    for (const [sym, f] of arr) {
      const va = f.ind.va[f.n - 1] || 0; vT += va; vA += f.avgVal20 || 0; wchg += f.chg * va;
      chg5.push(f.chg5); chg20.push(f.chg20); if (ok(scores[sym]?.rs)) rs.push(scores[sym].rs);
      if (ok(f.ma50)) { cnt50++; if (f.price > f.ma50) above50++; }
    }
    const leaders = arr.filter(([s]) => scores[s] && scores[s].mid).sort((a, b) => (scores[b[0]].mid.score * Math.log10(10 + b[1].avgVal20 / 1e9)) - (scores[a[0]].mid.score * Math.log10(10 + a[1].avgVal20 / 1e9))).slice(0, 3).map(([s]) => s);
    out.push({ code: +code, name: secNames[code] || 'Khác', count: arr.length, chg: vT ? wchg / vT : 0, chg5: median(chg5), chg20: median(chg20),
      value: vT, valueAvg: vA, flow: vA ? vT / vA : NaN, above50: cnt50 ? (100 * above50) / cnt50 : NaN, rs: median(rs), leaders });
  }
  // điểm ngành: RS + độ rộng + hiệu suất 20 phiên + dòng tiền
  const rk = (key) => { const s = out.map((x) => x[key]).filter(ok).sort((a, b) => a - b); return (v) => (ok(v) && s.length ? (100 * s.filter((x) => x <= v).length) / s.length : 50); };
  const rRS = rk('rs'), rB = rk('above50'), r20 = rk('chg20'), rF = rk('flow');
  for (const x of out) { const raw = 0.35 * rRS(x.rs) + 0.25 * rB(x.above50) + 0.25 * r20(x.chg20) + 0.15 * rF(x.flow); x.score = 50 + (raw - 50) * Math.min(1, x.count / 5); }
  out.sort((a, b) => b.score - a.score); out.forEach((x, k) => { x.rank = k + 1; });
  return out;
}

export { median };
