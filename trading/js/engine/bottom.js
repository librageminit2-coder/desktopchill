// Vùng đáy tiềm năng: tìm mã đã giảm sâu nhưng đang có dấu hiệu ngừng rơi, bên bán kiệt sức,
// dòng tiền bắt đầu gom, định giá rẻ và doanh nghiệp vẫn ổn — tức "giá thấp nhưng chưa chắc xấu".
import { highest, lowest, slopePct } from './indicators.js?v=8e6ac8b1';
import { zigzag, fmtP } from './structure.js?v=c3bd6cc0';

const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(x);
const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));
const pct = (a, b) => (a / b - 1) * 100;

export function bottomScore(f, ctx = {}) {
  const { c, h, l, v } = f.ind;
  const n = f.n, i = n - 1, p = f.price;
  const below200 = ok(f.ma200) && p < f.ma200;
  const drawdown = f.fromHi; // % so với đỉnh 52 tuần (âm)
  const inZone = drawdown <= -20 || (below200 && drawdown <= -12);
  const out = { inZone, drawdown, fromLow: f.fromLo, reasons: [], score: null, stage: null };
  if (!inZone || n < 60) return out;

  const R = [];
  const add = (k, w, s, text) => { if (ok(s)) R.push({ k, w, s: clamp(s), text }); };

  // 1) Vị trí giá
  const nearLow = f.fromLo <= 12;
  add('pos', 10, (drawdown <= -40 ? 0.8 : drawdown <= -30 ? 0.6 : 0.4) + (nearLow ? 0.2 : 0),
    `Đã giảm ${Math.abs(drawdown).toFixed(0)}% từ đỉnh 52 tuần${nearLow ? `, đang cách đáy 52 tuần ${f.fromLo.toFixed(0)}%` : ''}`);

  // 2) Ngừng rơi / tạo nền
  const lastLowAgo = (() => { const m = lowest(l, 60); for (let k = i; k >= n - 60; k--) if (l[k] === m) return i - k; return 60; })();
  const rng20 = highest(h, 20) / lowest(l, 20) - 1;
  const piv = zigzag(h, l, Math.max(0.05, Math.min(0.12, f.atrPct / 100 * 3))).filter((x) => !x.open);
  const Ls = piv.filter((x) => x.t === 'L'), Hs = piv.filter((x) => x.t === 'H');
  const higherLow = Ls.length >= 2 && Ls[Ls.length - 1].p > Ls[Ls.length - 2].p * 1.01 && Ls[Ls.length - 1].i > n - 70;
  let sBase = 0; const tB = [];
  if (lastLowAgo >= 15) { sBase += 0.45; tB.push(`không tạo đáy mới ${lastLowAgo} phiên`); } else if (lastLowAgo <= 3) { sBase -= 0.6; tB.push('vừa tạo đáy mới — chưa có điểm dừng'); }
  if (rng20 < 0.12 && lastLowAgo >= 8) { sBase += 0.3; tB.push(`biên độ 20 phiên chỉ ${(rng20 * 100).toFixed(0)}%`); }
  if (higherLow) { sBase += 0.35; tB.push('đã có đáy sau cao hơn đáy trước'); }
  add('base', 14, sBase, tB.length ? 'Nền giá: ' + tB.join(', ') : 'Chưa thấy dấu hiệu tạo nền');

  // 3) Bên bán kiệt sức: khối lượng gần đây so với lúc giảm mạnh
  let peakVol = 0; for (let k = Math.max(20, n - 80); k <= n - 10; k++) { let s = 0; for (let j = k - 9; j <= k; j++) s += v[j]; peakVol = Math.max(peakVol, s / 10); }
  let rec = 0; for (let j = n - 10; j < n; j++) rec += v[j]; rec /= 10;
  const dry = peakVol ? rec / peakVol : 1;
  add('dry', 9, dry < 0.5 && lastLowAgo >= 5 ? 0.8 : dry < 0.7 ? 0.4 : dry > 1.1 && f.chg < 0 ? -0.5 : 0,
    `Khối lượng 10 phiên gần nhất bằng ${(dry * 100).toFixed(0)}% lúc bán mạnh nhất${dry < 0.6 ? ' — lực bán đã cạn' : ''}`);

  // 4) Phân kỳ dương
  const bullDiv = f.div.filter((d) => d.kind === 'bull' && !d.hidden);
  const wkDiv = f.wk ? f.wk.div.filter((d) => d.kind === 'bull' && !d.hidden) : [];
  if (bullDiv.length || wkDiv.length) add('div', 12, wkDiv.length ? 1 : 0.8, [...wkDiv, ...bullDiv].map((d) => d.text).join('; '));
  else add('div', 6, 0, 'Chưa có phân kỳ dương giữa giá và RSI/MACD');

  // 5) Động lượng bắt đầu hồi
  const rsiMin = Math.min(...f.ind.rsi.slice(-20).filter(ok));
  let sMom = 0; const tM = [];
  if (rsiMin < 35 && f.rsi > rsiMin + 8) { sMom += 0.4; tM.push(`RSI hồi từ ${rsiMin.toFixed(0)} lên ${f.rsi.toFixed(0)}`); }
  if (f.hist < 0 && f.hist > f.histPrev) { sMom += 0.2; tM.push('histogram MACD âm nhưng thu hẹp'); }
  if (f.macdCross?.kind === 'up') { sMom += 0.3; tM.push('MACD vừa cắt lên'); }
  if (p > f.ema20) { sMom += 0.3; tM.push('giá lấy lại EMA20'); } else if (f.ema20Slope < -0.3) { sMom -= 0.3; tM.push('EMA20 còn dốc xuống'); }
  add('mom', 10, sMom, tM.length ? 'Động lượng: ' + tM.join(', ') : 'Động lượng chưa cải thiện');

  // 6) Dòng tiền gom
  const obv30 = slopePct(f.ind.obv.map((x) => x + 1e12), 30), px30 = slopePct(c, 30);
  let sAcc = 0; const tA = [];
  if (obv30 > px30 + 0.02 && Math.abs(px30) < 0.25) { sAcc += 0.45; tA.push('OBV đi lên trong khi giá đi ngang'); }
  if (f.cmf > 0.05) { sAcc += 0.3; tA.push(`CMF +${f.cmf.toFixed(2)}`); } else if (f.cmf < -0.1) { sAcc -= 0.3; tA.push(`CMF ${f.cmf.toFixed(2)}`); }
  if (f.udRatio > 1.1) { sAcc += 0.25; tA.push(`KL ngày tăng/giảm ${f.udRatio.toFixed(2)}`); }
  if (ok(f.foreignNet) && f.foreignNet > 0 && f.avgVal20 && f.foreignNet > f.avgVal20 * 0.03) { sAcc += 0.15; tA.push('khối ngoại mua ròng'); }
  add('acc', 12, sAcc, tA.length ? 'Dòng tiền: ' + tA.join(', ') : 'Chưa thấy dòng tiền gom rõ');

  // 7) Định giá & chất lượng doanh nghiệp
  const F = ctx.fund, M = ctx.sectorMed || {};
  if (F) {
    let sV = 0; const tV = [];
    if (ok(F.pe) && F.pe > 0 && ok(M.pe)) { const r = F.pe / M.pe; sV += r < 0.7 ? 0.5 : r < 0.95 ? 0.25 : r > 1.4 ? -0.3 : 0; tV.push(`P/E ${F.pe.toFixed(1)} (ngành ${M.pe.toFixed(1)})`); }
    else if (ok(F.pe) && F.pe <= 0) { sV -= 0.6; tV.push('đang lỗ'); }
    if (ok(F.pb)) { sV += F.pb < 1 ? 0.4 : ok(M.pb) && F.pb < M.pb * 0.8 ? 0.2 : 0; tV.push(`P/B ${F.pb.toFixed(2)}${F.pb < 1 ? ' — dưới giá trị sổ sách' : ''}`); }
    add('val', 13, sV, 'Định giá: ' + (tV.join(', ') || 'chưa đủ dữ liệu'));
    let sQ = 0; const tQ = [];
    if (ok(F.roe)) { sQ += F.roe >= 15 ? 0.4 : F.roe >= 10 ? 0.2 : F.roe < 5 ? -0.3 : 0; tQ.push(`ROE ${F.roe.toFixed(1)}%`); }
    if (ok(F.niGrowth)) { sQ += F.niGrowth > 15 ? 0.4 : F.niGrowth > 0 ? 0.2 : F.niGrowth < -30 ? -0.5 : -0.1; tQ.push(`LN 12 tháng ${F.niGrowth >= 0 ? '+' : ''}${F.niGrowth.toFixed(0)}%`); }
    if (ok(F.health)) { sQ += (F.health - 3) * 0.15; tQ.push(`sức khỏe tài chính ${F.health}/5`); }
    add('qual', 12, sQ, 'Doanh nghiệp: ' + (tQ.join(', ') || 'chưa đủ dữ liệu'));
  }

  // 8) Mô hình đảo chiều
  const rev = f.patterns.filter((x) => ['double-bottom', 'ihs', 'base-breakout', 'asc-tri'].includes(x.key) && x.kind === 'bull');
  if (rev.length) add('pat', 10, rev.some((x) => x.confirmed) ? 1 : 0.5, rev.map((x) => x.text).join('; '));

  // 9) Sức mạnh tương đối đang cải thiện
  if (ok(ctx.rsShort) && ok(ctx.rs)) add('rs', 6, clamp((ctx.rsShort - ctx.rs) / 40), ctx.rsShort > ctx.rs + 10 ? `Sức mạnh giá 1 tháng (${Math.round(ctx.rsShort)}) cải thiện so với dài hạn (${Math.round(ctx.rs)})` : `Sức mạnh giá 1 tháng ${Math.round(ctx.rsShort)}/99`);

  // 10) Xu hướng giảm còn mạnh → "dao rơi"
  if (ok(f.adx) && f.adx > 28 && f.mdi > f.pdi && lastLowAgo <= 5) add('knife', 12, -0.9, `ADX ${f.adx.toFixed(0)} với −DI áp đảo và vừa tạo đáy mới — xu hướng giảm còn mạnh, tránh bắt dao rơi`);

  const W = R.reduce((s, x) => s + x.w, 0) || 1;
  let score = 50 + (50 * R.reduce((s, x) => s + x.w * x.s, 0)) / W;
  if (ok(f.avgVal20) && f.avgVal20 < 1e9) score = 50 + (score - 50) * 0.6;
  out.score = Math.round(clamp(score, 0, 100) * 10) / 10;
  out.reasons = R.map((x) => ({ ...x, impact: (x.w * x.s * 50) / W })).sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

  // Giai đoạn
  const lastH = Hs.length ? Hs[Hs.length - 1] : null;
  if (lastLowAgo <= 5 || (p < f.ema20 && f.ema20Slope < -0.2 && !higherLow)) out.stage = { key: 'falling', label: 'Đang rơi' };
  else if (p > f.ema20 && (higherLow || f.macdCross?.kind === 'up') && (!lastH || p > lastH.p * 0.97 || p > f.ma50)) out.stage = { key: 'turning', label: 'Xác nhận đảo chiều' };
  else out.stage = { key: 'basing', label: 'Đang tạo đáy' };

  // Dư địa hồi phục: về Fibo 38,2% và 61,8% của con sóng giảm từ đỉnh 52 tuần
  const hi = f.hi52, lo = f.lo52;
  out.target382 = lo + (hi - lo) * 0.382; out.target618 = lo + (hi - lo) * 0.618;
  out.upside382 = pct(out.target382, p); out.upside618 = pct(out.target618, p);
  out.stopRef = Math.min(lo, ...Ls.slice(-1).map((x) => x.p)) * 0.97;
  out.summary = `${out.stage.label}. Hồi về Fibo 38,2% (${fmtP(out.target382)}) tương ứng +${Math.max(0, out.upside382).toFixed(0)}%`;
  return out;
}
