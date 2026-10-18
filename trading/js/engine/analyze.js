// Phân tích một mã: tính đặc trưng (features) rồi chấm điểm 3 khung thời gian.
import { computeAll, toWeekly, rsi, macd, sma, ema, slopePct, highest, lowest, roc } from './indicators.js?v=8e6ac8b1';
import { levels, fibonacci, divergences, candles, chartPatterns, trendStructure, fmtP } from './structure.js?v=c3bd6cc0';

const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const pct = (a, b) => (a / b - 1) * 100;
const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(x);

// ---------------- 1) Đặc trưng ----------------
export function features(bars, { foreignNet = null, sessionFrac = 1 } = {}) {
  const n = bars.length;
  if (n < 30) return null;
  const ind = computeAll(bars);
  const { c, h, l, v, va } = ind; const i = n - 1; const price = c[i];
  const f = { n, price, ind };
  f.chg = n > 1 ? pct(c[i], c[i - 1]) : 0;
  f.chg5 = n > 5 ? pct(c[i], c[i - 5]) : NaN;
  f.chg20 = n > 20 ? pct(c[i], c[i - 20]) : NaN;
  f.roc = { r20: roc(c, 20)[i], r63: roc(c, 63)[i], r126: roc(c, 126)[i], r189: roc(c, 189)[i], r252: roc(c, 252)[i] };
  // thanh khoản
  f.avgVal20 = ind.vama20[i - 1] || ind.vama20[i] || va[i];
  const frac = clamp(sessionFrac, 0.08, 1);
  f.rvol = f.avgVal20 ? va[i] / frac / f.avgVal20 : NaN;
  f.foreignNet = foreignNet;
  // xu hướng
  f.ema10 = ind.ema10[i]; f.ema20 = ind.ema20[i]; f.ma50 = ind.ma50[i]; f.ma200 = ind.ma200[i];
  f.ma50Slope = slopePct(ind.ma50, 15); f.ma200Slope = slopePct(ind.ma200, 30); f.ema20Slope = slopePct(ind.ema20, 8);
  f.cross = null;
  for (let k = Math.max(201, i - 25); k <= i; k++) {
    if (ind.ma50[k - 1] <= ind.ma200[k - 1] && ind.ma50[k] > ind.ma200[k]) f.cross = { kind: 'golden', ago: i - k };
    if (ind.ma50[k - 1] >= ind.ma200[k - 1] && ind.ma50[k] < ind.ma200[k]) f.cross = { kind: 'death', ago: i - k };
  }
  f.struct = trendStructure(h, l, 0.05);
  // động lượng
  f.rsi = ind.rsi[i]; f.rsiPrev = ind.rsi[i - 1]; f.rsi5 = ind.rsi[i - 5];
  f.hist = ind.macd.hist[i]; f.histPrev = ind.macd.hist[i - 1]; f.macdLine = ind.macd.line[i]; f.macdSig = ind.macd.signal[i];
  f.macdCross = null;
  for (let k = i - 3; k <= i; k++) {
    if (ind.macd.hist[k - 1] <= 0 && ind.macd.hist[k] > 0) f.macdCross = { kind: 'up', ago: i - k };
    if (ind.macd.hist[k - 1] >= 0 && ind.macd.hist[k] < 0) f.macdCross = { kind: 'down', ago: i - k };
  }
  f.stochK = ind.stoch.k[i]; f.stochD = ind.stoch.d[i]; f.stochKPrev = ind.stoch.k[i - 1]; f.stochDPrev = ind.stoch.d[i - 1];
  f.adx = ind.adx.adx[i]; f.pdi = ind.adx.pdi[i]; f.mdi = ind.adx.mdi[i];
  f.atrPct = (ind.atr[i] / price) * 100;
  f.bbWidth = ind.bb.width[i];
  { const w = ind.bb.width.slice(-120).filter(ok).sort((a, b) => a - b); f.bbSqueeze = w.length > 60 && f.bbWidth <= w[Math.floor(w.length * 0.15)]; }
  // dòng tiền
  f.cmf = ind.cmf[i]; f.mfi = ind.mfi[i];
  f.obvSlope = slopePct(ind.obv.map((x) => x + 1e12), 20); // dịch dương để chia được
  f.priceSlope20 = slopePct(c, 20);
  f.obvHigh = ind.obv[i] >= highest(ind.obv, 50);
  { let up = 0, dn = 0; for (let k = Math.max(1, n - 50); k < n; k++) { if (c[k] > c[k - 1]) up += v[k]; else if (c[k] < c[k - 1]) dn += v[k]; } f.udRatio = dn ? up / dn : 2; }
  // vị trí giá
  f.hi52 = highest(h, 250); f.lo52 = lowest(l, 250);
  f.fromHi = pct(price, f.hi52); f.fromLo = pct(price, f.lo52);
  f.newHigh = h[i] >= highest(h, 250, i - 1) && n > 120;
  f.newLow = l[i] <= lowest(l, 250, i - 1) && n > 120;
  // cấu trúc giá
  f.lv = levels(ind);
  f.sup = f.lv.support[0] || null; f.res = f.lv.resistance[0] || null;
  f.fib = fibonacci(ind);
  const priceHL = Object.assign(c.slice(), { highs: h, lows: l });
  f.div = [
    ...divergences(priceHL, ind.rsi, { name: 'RSI' }),
    ...divergences(priceHL, ind.macd.hist, { name: 'MACD', lowZone: 0, highZone: 0, macd: true, hidden: false }),
  ];
  f.candles = candles(ind);
  f.patterns = chartPatterns(ind);
  // khung tuần
  const wk = toWeekly(bars);
  if (wk.length >= 30) {
    const wc = wk.map((b) => b.c), wr = rsi(wc, 14), wm = macd(wc), w10 = sma(wc, 10), w40 = sma(wc, 40);
    const j = wk.length - 1;
    f.wk = { rsi: wr[j], hist: wm.hist[j], histPrev: wm.hist[j - 1], ma10: w10[j], ma40: w40[j], ma10Slope: slopePct(w10, 6), ma40Slope: slopePct(w40, 8),
      struct: trendStructure(wk.map((b) => b.h), wk.map((b) => b.l), 0.1),
      div: divergences(Object.assign(wc.slice(), { highs: wk.map((b) => b.h), lows: wk.map((b) => b.l) }), wr, { name: 'RSI tuần', look: 60, recent: 4, w: 2 }) };
  }
  return f;
}

// Sức mạnh giá kiểu IBD (dùng để xếp hạng RS toàn thị trường)
export function rsRaw(f) {
  const r = f.roc; const parts = [[r.r63, 0.4], [r.r126, 0.2], [r.r189, 0.2], [r.r252, 0.2]].filter(([x]) => ok(x));
  if (!parts.length) return ok(r.r20) ? r.r20 : NaN;
  const ws = parts.reduce((s, [, w]) => s + w, 0);
  return parts.reduce((s, [x, w]) => s + x * w, 0) / ws;
}

// ---------------- 2) Chấm điểm ----------------
// ctx: { rs (0-99), rsShort (0-99), market: {score, phase}, sector: {score, name, rank, total}, fund, sectorMed }
export function score(f, ctx = {}) {
  const S = { short: [], mid: [], long: [] };
  const add = (hz, k, w, s, text) => { if (!ok(s)) return; S[hz].push({ k, w, s: clamp(s), text }); };
  const p = f.price;

  // ===== NGẮN HẠN (1–2 tuần) =====
  {
    const aE20 = pct(p, f.ema20), sE = f.ema10 > f.ema20;
    add('short', 'trend', 14, (aE20 > 0 ? 0.5 : -0.5) + (sE ? 0.5 : -0.5),
      aE20 > 0 && sE ? `Giá trên EMA20 (${aE20 > 0 ? '+' : ''}${aE20.toFixed(1)}%), EMA10 nằm trên EMA20` : aE20 < 0 && !sE ? `Giá dưới EMA20 (${aE20.toFixed(1)}%), xu hướng ngắn đang yếu` : `Giá giằng co quanh EMA10/EMA20`);
    if (aE20 > 10) add('short', 'ext', 7, -clamp((aE20 - 10) / 12, 0, 1), `Giá cách EMA20 ${aE20.toFixed(0)}% — đã chạy xa, rủi ro mua đuổi`);
    // RSI
    let rs = 0, rt = '';
    if (f.rsi >= 78) { rs = -0.6; rt = `RSI ${f.rsi.toFixed(0)} — quá mua, dễ rung lắc ngắn hạn`; }
    else if (f.rsi >= 55) { rs = 0.7; rt = `RSI ${f.rsi.toFixed(0)} — động lượng tăng khỏe`; }
    else if (f.rsi >= 45) { rs = f.rsi > f.rsi5 ? 0.15 : -0.15; rt = `RSI ${f.rsi.toFixed(0)} — trung tính`; }
    else if (f.rsi >= 30) { rs = -0.5; rt = `RSI ${f.rsi.toFixed(0)} — động lượng yếu`; }
    else { rs = f.rsi > f.rsiPrev ? 0.3 : -0.3; rt = `RSI ${f.rsi.toFixed(0)} — quá bán${f.rsi > f.rsiPrev ? ', bắt đầu móc lên' : ''}`; }
    add('short', 'rsi', 12, rs, rt);
    // MACD
    if (f.macdCross) add('short', 'macd', 10, f.macdCross.kind === 'up' ? 0.9 : -0.9, f.macdCross.kind === 'up' ? `MACD vừa cắt lên đường tín hiệu (${f.macdCross.ago === 0 ? 'hôm nay' : f.macdCross.ago + ' phiên trước'})` : `MACD vừa cắt xuống đường tín hiệu`);
    else add('short', 'macd', 10, f.hist > 0 ? (f.hist > f.histPrev ? 0.6 : 0.2) : (f.hist < f.histPrev ? -0.6 : -0.2), f.hist > 0 ? (f.hist > f.histPrev ? 'Histogram MACD dương và mở rộng' : 'MACD dương nhưng đang thu hẹp') : (f.hist < f.histPrev ? 'Histogram MACD âm và mở rộng' : 'MACD âm nhưng đang thu hẹp'));
    // Stochastic
    if (f.stochKPrev <= f.stochDPrev && f.stochK > f.stochD && f.stochK < 30) add('short', 'stoch', 5, 0.8, 'Stochastic cắt lên từ vùng quá bán');
    else if (f.stochKPrev >= f.stochDPrev && f.stochK < f.stochD && f.stochK > 75) add('short', 'stoch', 5, -0.8, 'Stochastic cắt xuống từ vùng quá mua');
    // Dòng tiền ngắn
    if (ok(f.rvol)) {
      const up = f.chg > 0.3, dn = f.chg < -0.3;
      let s = 0, t = `Thanh khoản bằng ${f.rvol.toFixed(1)} lần trung bình 20 phiên`;
      if (f.rvol >= 1.5 && up) { s = Math.min(1, 0.5 + (f.rvol - 1.5) * 0.3); t = `Tiền vào mạnh: giá tăng với giá trị giao dịch ${f.rvol.toFixed(1)}× trung bình`; }
      else if (f.rvol >= 1.5 && dn) { s = -Math.min(1, 0.5 + (f.rvol - 1.5) * 0.3); t = `Bị bán mạnh: giá giảm với giá trị giao dịch ${f.rvol.toFixed(1)}× trung bình`; }
      else if (f.rvol < 0.6) { s = up ? -0.1 : 0.1; t = `Thanh khoản thấp (${f.rvol.toFixed(1)}× TB20) — tín hiệu chưa đáng tin`; }
      add('short', 'vol', 12, s, t);
    }
    add('short', 'cmf', 6, clamp(f.cmf * 4), `Chaikin Money Flow ${f.cmf >= 0 ? '+' : ''}${f.cmf.toFixed(2)}${f.cmf > 0.1 ? ' — tích lũy' : f.cmf < -0.1 ? ' — phân phối' : ''}`);
    if (ok(f.foreignNet) && f.avgVal20) { const r = f.foreignNet / f.avgVal20; if (Math.abs(r) > 0.03) add('short', 'foreign', 5, clamp(r * 6), `Khối ngoại ${r > 0 ? 'mua ròng' : 'bán ròng'} ${fmtTy(Math.abs(f.foreignNet))} hôm nay`); }
    // Nến
    for (const cd of f.candles) if (cd.kind !== 'neutral') add('short', 'candle', 7, cd.kind === 'bull' ? 0.8 : -0.8, cd.text);
    // Breakout / mẫu hình ngắn
    for (const pt of f.patterns.filter((x) => ['base-breakout', 'base-breakdown', 'flag'].includes(x.key))) add('short', 'pattern', 12, pt.kind === 'bull' ? (pt.confirmed ? 1 : 0.5) : -1, pt.text);
    // Phân kỳ
    for (const d of f.div) add('short', 'div', 10, (d.kind === 'bull' ? 1 : -1) * (d.hidden ? 0.5 : 0.85), d.text);
    // Rủi ro/lợi nhuận tới hỗ trợ – kháng cự
    if (f.sup && f.res) {
      const up = pct(f.res.p, p), dn = pct(p, f.sup.p); const rr = up / Math.max(dn, 0.3);
      add('short', 'rr', 8, clamp((rr - 1.3) / 1.5), `Kháng cự gần ${fmtP(f.res.p)} (+${up.toFixed(1)}%), hỗ trợ gần ${fmtP(f.sup.p)} (−${dn.toFixed(1)}%)`);
    } else if (!f.res && f.newHigh) add('short', 'rr', 8, 0.6, 'Giá ở vùng đỉnh 52 tuần — không còn kháng cự cũ phía trên');
    if (ctx.market) add('short', 'market', 7, (ctx.market.score - 50) / 40, `Thị trường chung: ${ctx.market.phase}`);
    if (ok(ctx.rsShort)) add('short', 'rs', 6, (ctx.rsShort - 50) / 45, `Mạnh hơn ${Math.round(ctx.rsShort)}% số mã trong 1 tháng qua`);
  }

  // ===== TRUNG HẠN (1–3 tháng) =====
  {
    const a50 = pct(p, f.ma50);
    if (ok(f.ma50)) add('mid', 'ma50', 16, (a50 > 0 ? 0.5 : -0.5) + clamp(f.ma50Slope * 2, -0.5, 0.5),
      `Giá ${a50 >= 0 ? 'trên' : 'dưới'} MA50 ${Math.abs(a50).toFixed(1)}%, MA50 ${f.ma50Slope > 0.05 ? 'đang dốc lên' : f.ma50Slope < -0.05 ? 'đang dốc xuống' : 'đi ngang'}`);
    add('mid', 'struct', 10, f.struct.score, `Cấu trúc sóng: ${f.struct.label}`);
    if (ok(f.ma50) && a50 > 18) add('mid', 'ext', 9, -clamp((a50 - 18) / 22, 0, 1), `Giá đã cách MA50 ${a50.toFixed(0)}% — tăng nóng, dư địa ngắn còn ít, dễ điều chỉnh về trung bình`);
    if (ok(f.adx)) {
      const dirn = f.pdi > f.mdi ? 1 : -1;
      add('mid', 'adx', 8, f.adx >= 22 ? dirn * Math.min(1, (f.adx - 15) / 20) : 0, f.adx >= 22 ? `ADX ${f.adx.toFixed(0)}: xu hướng ${dirn > 0 ? 'tăng' : 'giảm'} có lực (+DI ${dirn > 0 ? '>' : '<'} −DI)` : `ADX ${f.adx.toFixed(0)}: chưa có xu hướng rõ`);
    }
    if (ok(ctx.rs)) add('mid', 'rs', 15, (ctx.rs - 50) / 40, `Chỉ số sức mạnh giá (RS) ${Math.round(ctx.rs)}/99 so với toàn sàn HOSE`);
    for (const pt of f.patterns.filter((x) => !['flag'].includes(x.key))) add('mid', 'pattern', 12, (pt.kind === 'bull' ? 1 : -1) * (pt.confirmed ? 1 : 0.5), pt.text);
    if (f.fib && f.fib.up) {
      const r = f.fib.retr; const above50 = p > f.ma50;
      let s = 0; if (r >= 0.382 && r <= 0.618 && above50) s = 0.7; else if (r < 0.236) s = 0.5; else if (r > 0.786) s = -0.7; else if (r > 0.618) s = -0.3;
      add('mid', 'fib', 8, s, `Fibonacci sóng tăng ${fmtP(f.fib.lo)}→${fmtP(f.fib.hi)}: giá đang ở ${f.fib.zone}`);
    } else if (f.fib && !f.fib.up) {
      const r = f.fib.retr; add('mid', 'fib', 8, r > 0.618 ? 0.3 : r > 0.382 ? -0.2 : -0.5, `Fibonacci sóng giảm ${fmtP(f.fib.hi)}→${fmtP(f.fib.lo)}: giá mới hồi ${(r * 100).toFixed(0)}% (${f.fib.zone})`);
    }
    for (const d of f.div.filter((x) => !x.hidden)) add('mid', 'div', 8, d.kind === 'bull' ? 0.8 : -0.8, d.text);
    add('mid', 'accum', 12, clamp((f.udRatio - 1) * 1.2) * 0.6 + (f.obvSlope > f.priceSlope20 ? 0.25 : -0.25) + (f.obvHigh ? 0.15 : 0),
      `Khối lượng ngày tăng/ngày giảm 50 phiên: ${f.udRatio.toFixed(2)}${f.udRatio > 1.2 ? ' — đang được gom' : f.udRatio < 0.8 ? ' — đang bị xả' : ''}${f.obvHigh ? ', OBV lập đỉnh mới' : ''}`);
    if (f.wk) {
      add('mid', 'wk', 7, (f.wk.hist > 0 ? 0.4 : -0.4) + (f.wk.hist > f.wk.histPrev ? 0.3 : -0.3) + (f.wk.rsi > 50 ? 0.3 : -0.3), `Khung tuần: RSI ${f.wk.rsi.toFixed(0)}, MACD tuần ${f.wk.hist > 0 ? 'dương' : 'âm'} và ${f.wk.hist > f.wk.histPrev ? 'cải thiện' : 'suy yếu'}`);
    }
    if (f.bbSqueeze) add('mid', 'squeeze', 4, p > f.ma50 ? 0.4 : -0.2, 'Dải Bollinger co hẹp — sắp có biến động mạnh');
    if (ctx.sector) add('mid', 'sector', 7, (ctx.sector.score - 50) / 40, `Ngành ${ctx.sector.name} xếp ${ctx.sector.rank}/${ctx.sector.total} về sức mạnh`);
    if (ctx.market) add('mid', 'market', 5, (ctx.market.score - 50) / 40, `Thị trường chung: ${ctx.market.phase}`);
  }

  // ===== DÀI HẠN (6–12 tháng) =====
  {
    if (ok(f.ma200)) {
      const a200 = pct(p, f.ma200);
      if (a200 > 60) add('long', 'ext', 7, -clamp((a200 - 60) / 60, 0, 1), `Giá đã cao hơn MA200 ${a200.toFixed(0)}% — phần lớn tiềm năng đã được phản ánh vào giá`);
      add('long', 'ma200', 16, (a200 > 0 ? 0.5 : -0.5) + clamp(f.ma200Slope * 5, -0.5, 0.5), `Giá ${a200 >= 0 ? 'trên' : 'dưới'} MA200 ${Math.abs(a200).toFixed(1)}%, MA200 ${f.ma200Slope > 0.02 ? 'dốc lên' : f.ma200Slope < -0.02 ? 'dốc xuống' : 'đi ngang'}`);
    } else add('long', 'ma200', 6, 0, 'Lịch sử giao dịch chưa đủ 200 phiên');
    if (f.cross) add('long', 'cross', 8, f.cross.kind === 'golden' ? 0.9 : -0.9, f.cross.kind === 'golden' ? `Giao cắt vàng MA50/MA200 cách đây ${f.cross.ago} phiên` : `Giao cắt tử thần MA50/MA200 cách đây ${f.cross.ago} phiên`);
    if (f.wk) {
      add('long', 'wkstruct', 10, f.wk.struct.score * 0.6 + (f.wk.ma10 > f.wk.ma40 ? 0.4 : -0.4), `Khung tuần: ${f.wk.struct.label}, MA10 tuần ${f.wk.ma10 > f.wk.ma40 ? 'trên' : 'dưới'} MA40 tuần`);
      for (const d of f.wk.div.filter((x) => !x.hidden)) add('long', 'wkdiv', 8, d.kind === 'bull' ? 0.8 : -0.8, d.text);
    }
    if (ok(ctx.rs)) add('long', 'rs', 10, (ctx.rs - 50) / 45, `RS ${Math.round(ctx.rs)}/99 — ${ctx.rs >= 80 ? 'nhóm dẫn dắt' : ctx.rs <= 30 ? 'nhóm yếu' : 'trung bình'}`);
    add('long', 'hi52', 6, f.fromHi > -12 ? 0.6 : f.fromHi > -30 ? 0 : -0.5, `Cách đỉnh 52 tuần ${f.fromHi.toFixed(0)}%, cách đáy 52 tuần +${f.fromLo.toFixed(0)}%`);
    const F = ctx.fund; const M = ctx.sectorMed || {};
    if (F) {
      if (ok(F.roe)) add('long', 'roe', 10, clamp((F.roe - 12) / 10), `ROE ${F.roe.toFixed(1)}%${F.roe >= 20 ? ' — hiệu quả vốn cao' : F.roe < 8 ? ' — hiệu quả vốn thấp' : ''}`);
      const g = ok(F.niGrowth) ? F.niGrowth : null;
      if (g !== null) add('long', 'growth', 12, clamp(g / 30), `Lợi nhuận 12 tháng ${g >= 0 ? 'tăng' : 'giảm'} ${Math.abs(g).toFixed(0)}% so với cùng kỳ${ok(F.revGrowth) ? `, doanh thu ${F.revGrowth >= 0 ? '+' : ''}${F.revGrowth.toFixed(0)}%` : ''}`);
      if (ok(F.pe) && F.pe > 0 && ok(M.pe)) add('long', 'pe', 8, clamp((M.pe - F.pe) / M.pe * 1.5), `P/E ${F.pe.toFixed(1)} so với trung vị ngành ${M.pe.toFixed(1)}${F.pe < M.pe * 0.8 ? ' — rẻ hơn ngành' : F.pe > M.pe * 1.3 ? ' — đắt hơn ngành' : ''}`);
      else if (ok(F.pe) && F.pe <= 0) add('long', 'pe', 8, -0.7, 'Doanh nghiệp đang lỗ (P/E âm)');
      if (ok(F.pb) && ok(M.pb)) add('long', 'pb', 4, clamp((M.pb - F.pb) / M.pb), `P/B ${F.pb.toFixed(2)} (ngành ${M.pb.toFixed(2)})`);
      if (ok(F.health)) add('long', 'health', 5, (F.health - 3) / 2, `Sức khỏe tài chính ${F.health}/5 (Simplize)`);
    }
    const liq = f.avgVal20;
    if (ok(liq)) add('long', 'liq', 5, liq >= 20e9 ? 0.5 : liq >= 5e9 ? 0.2 : liq >= 1e9 ? -0.2 : -0.9, `Giá trị giao dịch TB20: ${fmtTy(liq)}/phiên`);
    if (ctx.market) add('long', 'market', 5, (ctx.market.longScore - 50) / 40, `VN-Index ${ctx.market.idxAbove200 ? 'trên' : 'dưới'} MA200`);
  }

  const out = {};
  for (const hz of ['short', 'mid', 'long']) {
    const arr = S[hz]; const W = arr.reduce((s, x) => s + x.w, 0) || 1;
    let sc = 50 + (50 * arr.reduce((s, x) => s + x.w * x.s, 0)) / W;
    // mã thanh khoản rất thấp: kéo về trung tính — tín hiệu kỹ thuật kém tin cậy
    if (ok(f.avgVal20) && f.avgVal20 < 1e9) sc = 50 + (sc - 50) * 0.6;
    sc = Math.round(clamp(sc, 0, 100) * 10) / 10;
    const reasons = arr.map((x) => ({ ...x, impact: (x.w * x.s * 50) / W })).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
    out[hz] = { score: sc, verdict: verdict(sc), reasons };
  }
  return out;
}

export function verdict(s) {
  if (s >= 75) return { key: 'vpos', label: 'Rất tích cực' };
  if (s >= 60) return { key: 'pos', label: 'Tích cực' };
  if (s > 45) return { key: 'neu', label: 'Trung tính' };
  if (s > 30) return { key: 'neg', label: 'Tiêu cực' };
  return { key: 'vneg', label: 'Rất tiêu cực' };
}

export function fmtTy(x) {
  const a = Math.abs(x);
  if (a >= 1e12) return (x / 1e12).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' nghìn tỷ';
  if (a >= 1e9) return (x / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: a >= 1e11 ? 0 : 1 }) + ' tỷ';
  if (a >= 1e6) return (x / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' triệu';
  return Math.round(x).toLocaleString('vi-VN');
}

// Tóm tắt "vùng giá đáng chú ý" cho trang chi tiết
export function keyZones(f) {
  const a = f.ind.atr[f.n - 1]; const z = [];
  f.lv.support.forEach((s, k) => z.push({ type: 'sup', label: k === 0 ? 'Hỗ trợ gần' : 'Hỗ trợ', p: s.p, touches: s.touches }));
  f.lv.resistance.forEach((s, k) => z.push({ type: 'res', label: k === 0 ? 'Kháng cự gần' : 'Kháng cự', p: s.p, touches: s.touches }));
  if (f.fib) f.fib.levels.forEach((x) => z.push({ type: 'fib', label: `Fibo ${(x.r * 100).toFixed(1)}%`, p: x.p }));
  if (f.fib && f.fib.up) f.fib.ext.forEach((x) => z.push({ type: 'ext', label: `Fibo mở rộng ${(x.r * 100).toFixed(1)}%`, p: x.p }));
  [['MA20', f.ind.ma20[f.n - 1]], ['MA50', f.ma50], ['MA200', f.ma200]].forEach(([k, p]) => ok(p) && z.push({ type: 'ma', label: k, p }));
  const inval = f.sup ? f.sup.p - 0.5 * a : null;
  return { zones: z.filter((x) => ok(x.p)).sort((x, y) => y.p - x.p), invalidation: inval };
}

export { ema };
