// Kế hoạch giao dịch: điểm vào, dừng lỗ, mục tiêu và tỷ lệ R:R cho 3 khung thời gian.
// Nguyên tắc tham khảo:
//  - Dừng lỗ theo cấu trúc (dưới đáy sóng/hỗ trợ) nhưng không chặt hơn ~1 ATR (tránh nhiễu, và T+2,5 không bán ngay được)
//    và không xa hơn trần rủi ro của khung (O'Neil: cắt lỗ 7–8% cho giao dịch ngắn).
//  - Freqtrade/Chandelier: dừng lỗ theo ATR (2×ATR), dời dừng lỗ theo bậc khi có lãi, trailing = đỉnh 22 phiên − 3×ATR.
//  - Chỉ coi là "đạt chuẩn" khi R:R tới mục tiêu 1 ≥ 2 (ngắn), ≥ 2,5 (trung), ≥ 3 (dài).
import { highest, lowest, atr as atrFn } from './indicators.js?v=8e6ac8b1';
import { zigzag } from './structure.js?v=c3bd6cc0';

const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(x);
export function tick(p) { return p < 10000 ? 10 : p < 50000 ? 50 : 100; } // bước giá HOSE
const up = (p) => Math.ceil(p / tick(p)) * tick(p);
const dn = (p) => Math.floor(p / tick(p)) * tick(p);

const CFG = {
  short: { label: 'Ngắn hạn', minRR: 2, maxRisk: 0.08, minAtr: 1, stopAtr: 1.5, zz: 0.05, expiry: 10 },
  mid: { label: 'Trung hạn', minRR: 2.5, maxRisk: 0.12, minAtr: 1.5, stopAtr: 2, zz: 0.08, expiry: 30 },
  long: { label: 'Dài hạn', minRR: 3, maxRisk: 0.2, minAtr: 2, stopAtr: 3, zz: 0.12, expiry: 60 },
};

// Thị trường chung yếu → yêu cầu R:R cao hơn và cảnh báo (O'Neil: 3/4 cổ phiếu đi theo xu hướng chung)
function mktAdj(market, hz) {
  if (!market || !ok(market.score)) return { extra: 0, warn: null };
  const s = hz === 'long' ? (market.longScore ?? market.score) : market.score;
  if (s < 30) return { extra: hz === 'long' ? 0.5 : 1, warn: `Thị trường chung đang ${market.phase ? market.phase.toLowerCase() : 'yếu'} — tỷ lệ breakout thất bại cao, chỉ nên giải ngân thăm dò (≤ 1/3 vị thế).` };
  if (s < 44) return { extra: 0.5, warn: `Thị trường chung ${market.phase ? market.phase.toLowerCase() : 'chưa thuận lợi'} — giảm tỷ trọng, ưu tiên mã mạnh hơn thị trường.` };
  return { extra: 0, warn: null };
}

export function tradePlans(f, { bottom = null, market = null } = {}) {
  const out = {}; for (const hz of Object.keys(CFG)) { try { out[hz] = plan(f, hz, bottom, mktAdj(market, hz)); } catch (e) { out[hz] = { setup: 'none', label: 'Chưa lập được kế hoạch', note: String(e.message || e) }; } }
  return out;
}

function plan(f, hz, bottom, M = { extra: 0, warn: null }) {
  const C = { ...CFG[hz] }; const baseRR = C.minRR; C.minRR = baseRR + M.extra; const { h, l, c } = f.ind; const n = f.n, i = n - 1, p = f.price;
  const A = f.ind.atr[i] || p * 0.025;
  const top = f.top || { score: 0 };
  const piv = zigzag(h, l, Math.max(C.zz, (A / p) * 3)).filter((x) => !x.open);
  const lows = piv.filter((x) => x.t === 'L'), highs = piv.filter((x) => x.t === 'H');
  const lastLow = lows.length ? lows[lows.length - 1].p : lowest(l, 20);
  const swingHigh = Math.max(highest(h, hz === 'short' ? 20 : hz === 'mid' ? 60 : 250), ...highs.slice(-1).map((x) => x.p));
  const uptrend = p > f.ma50 && f.ma50Slope > 0 && (hz !== 'long' || !ok(f.ma200) || p > f.ma200);
  const downtrend = p < f.ma50 && f.ma50Slope < 0 && (!ok(f.ma200) || p < f.ma200);
  const res = f.lv.resistance.map((x) => x.p), sup = f.lv.support.map((x) => x.p);
  const chandelier = highest(h, 22) - 3 * (atrFn(h, l, c, 22)[i] || A);

  const finish = (o) => {
    const entry = o.entryHi ?? o.entry; const risk = entry - o.stop;
    if (!(risk > 0)) return { setup: 'none', label: 'Chưa có điểm vào đạt chuẩn', note: 'Không xác định được vùng dừng lỗ hợp lý dưới điểm vào.' };
    // dừng lỗ: không chặt hơn minAtr×ATR, không xa hơn maxRisk
    if (risk < C.minAtr * A) o.stop = dn(entry - C.minAtr * A);
    const r = entry - o.stop; const riskPct = r / entry;
    if (riskPct > C.maxRisk) o.tooWide = true;
    if (!o.t1 || o.t1 <= entry + r) o.t1 = up(Math.max(o.t1 || 0, entry + baseRR * r));
    if (!o.t2 || o.t2 <= o.t1) o.t2 = up(Math.max(o.t2 || 0, entry + (baseRR + 1) * r, o.t1 + r));
    const rr1 = (o.t1 - entry) / r, rr2 = (o.t2 - entry) / r;
    const valid = !o.tooWide && rr1 >= C.minRR - 1e-9 && !o.blocked;
    return { ...o, entry: o.entry, entryHi: o.entryHi ?? null, stop: o.stop, t1: o.t1, t2: o.t2, rr1, rr2, riskPct: riskPct * 100,
      breakeven: up(entry + r), chandelier: dn(chandelier), expiry: C.expiry, minRR: C.minRR, valid, mktWarn: M.warn,
      verdict: o.blocked ? o.blocked : o.tooWide ? `Dừng lỗ cách ${(riskPct * 100).toFixed(1)}% — vượt mức rủi ro tối đa ${C.maxRisk * 100}% của khung` : rr1 >= C.minRR ? `Đạt chuẩn R:R ≥ ${C.minRR}` : `R:R chỉ ${rr1.toFixed(1)} — chưa đạt ${C.minRR}${M.extra ? ' (nâng chuẩn vì thị trường yếu)' : ''}` };
  };

  // 0) Vùng đỉnh: không mua đuổi, chờ điều chỉnh về trung bình
  if (top.score >= 40) {
    const z = hz === 'short' ? f.ema20 : f.ma50; if (!ok(z)) return { setup: 'none', label: 'Đứng ngoài', note: 'Rủi ro vùng đỉnh cao.' };
    const lo = dn(z), hi = up(z + 0.3 * A);
    return finish({ setup: 'wait', label: `Không mua đuổi — chờ về ${hz === 'short' ? 'EMA20' : 'MA50'}`, entry: lo, entryHi: hi, stop: dn(Math.min(z - C.stopAtr * A, lastLow - 0.3 * A)), t1: up(swingHigh), t2: null,
      note: `${top.level.label} (điểm rủi ro ${top.score}/100). Chỉ cân nhắc khi giá điều chỉnh về vùng ${hz === 'short' ? 'EMA20' : 'MA50'} và giữ được.`, blocked: top.score >= 60 ? 'Rủi ro đỉnh cao — đứng ngoài, không mở vị thế mới' : null });
  }
  // 1) Đảo chiều từ vùng đáy
  if (bottom && bottom.inZone && bottom.score >= 55 && bottom.stage && bottom.stage.key !== 'falling' && !uptrend) {
    const trig = up(Math.max(p, f.ema20 || p) + 0.1 * A);
    return finish({ setup: 'reversal', label: bottom.stage.key === 'turning' ? 'Đảo chiều từ đáy — đã xác nhận' : 'Đảo chiều từ đáy — chờ xác nhận', entry: bottom.stage.key === 'turning' ? dn(p) : trig, entryHi: bottom.stage.key === 'turning' ? up(p + 0.3 * A) : null,
      stop: dn(Math.min(lastLow, bottom.stopRef || lastLow) - 0.5 * A), t1: dn(bottom.target382), t2: dn(bottom.target618), trigger: bottom.stage.key === 'turning' ? 'zone' : 'stop',
      note: bottom.stage.key === 'turning' ? 'Giá đã lấy lại EMA20 với đáy sau cao hơn. Mua trong vùng, dừng lỗ dưới đáy nền.' : `Chỉ vào khi giá vượt ${trig.toLocaleString('vi-VN')} (trên EMA20). Mục tiêu là các mức hồi Fibonacci của sóng giảm.` });
  }
  // 2) Xu hướng giảm: đứng ngoài
  if (downtrend && hz !== 'long') return { setup: 'none', label: 'Đứng ngoài — xu hướng giảm', note: `Giá dưới MA50 đang dốc xuống. Chờ tạo nền và lấy lại MA50 (${Math.round(f.ma50).toLocaleString('vi-VN')}).`, valid: false };

  // 3) Breakout: giá sát kháng cự/đỉnh nền
  const pivot = res.find((x) => x > p && x <= p * 1.05) || (p >= highest(h, 20, i - 1) * 0.97 && uptrend ? highest(h, 20, i - 1) : null);
  const basePat = f.patterns.some((x) => ['base', 'asc-tri', 'base-breakout', 'flag', 'double-bottom', 'ihs'].includes(x.key) && x.kind !== 'bear');
  if (pivot && (uptrend || (basePat && p > f.ma50 && (!ok(f.ma200) || p > f.ma200 * 0.97)))) {
    const entry = up(Math.max(pivot, p) + tick(pivot));
    const baseLow = lowest(l, hz === 'short' ? 10 : hz === 'mid' ? 25 : 60);
    const stop = dn(Math.max(baseLow - 0.3 * A, entry - C.stopAtr * A * (hz === 'long' ? 1.5 : 1)));
    const nextRes = res.find((x) => x > entry * 1.03);
    const height = pivot - lowest(l, 30);
    return finish({ setup: 'breakout', label: entry > p * 1.005 ? 'Mua khi vượt kháng cự (breakout)' : 'Vừa breakout — mua trong vùng', entry, entryHi: null, stop, t1: nextRes ? dn(nextRes) : up(entry + height), t2: up(pivot + height * (hz === 'long' ? 2 : 1.3)), trigger: entry > p * 1.005 ? 'stop' : 'zone',
      note: `Điểm vào là lệnh chờ trên ${entry.toLocaleString('vi-VN')}, cần khối lượng ≥ 1,5× trung bình phiên vượt. Mục tiêu theo chiều cao nền (measured move).` });
  }
  // 4) Pullback trong xu hướng tăng
  if (uptrend) {
    const anchors = (hz === 'short' ? [f.ema20, ...sup] : hz === 'mid' ? [f.ma50, ...sup] : [f.ma200, f.ma50, ...sup]).filter((x) => ok(x) && x < p);
    const s0 = anchors.sort((a, b) => b - a)[0];
    if (s0) {
      const inZone = p <= s0 + 1.2 * A;
      const fibExt = f.fib && f.fib.up ? f.fib.ext[0].p : null;
      return finish({ setup: 'pullback', label: inZone ? 'Mua khi điều chỉnh — giá đang trong vùng hỗ trợ' : 'Chờ điều chỉnh về hỗ trợ', entry: dn(s0), entryHi: up(s0 + 0.5 * A), trigger: 'zone',
        stop: dn(Math.min(s0 - C.stopAtr * A, lastLow - 0.3 * A)), t1: up(Math.max(swingHigh, p + A)), t2: fibExt ? up(fibExt) : null,
        note: inZone ? 'Giá đang nằm sát vùng hỗ trợ của xu hướng tăng — vùng mua có rủi ro thấp.' : `Giá đang cách vùng hỗ trợ ${((p / s0 - 1) * 100).toFixed(1)}%. Mua đuổi lúc này làm R:R xấu đi.` });
    }
  }
  return { setup: 'none', label: 'Chưa có điểm vào đạt chuẩn', note: 'Giá chưa ở vị trí có lợi (không sát hỗ trợ, không sát điểm breakout). Chờ thêm.', valid: false };
}

// Đánh giá kế hoạch đã lưu theo dữ liệu thực tế sau ngày lưu
export function evalPlan(plan, bars, savedT) {
  if (!plan || plan.setup === 'none' || !ok(plan.stop)) return { status: 'none', label: 'Không có kế hoạch' };
  const after = bars.filter((b) => b.t > savedT);
  const lo = plan.entry, hi = plan.entryHi ?? plan.entry;
  let filled = null, k0 = -1;
  for (let k = 0; k < after.length && k < (plan.expiry || 30); k++) {
    const b = after[k];
    if (plan.trigger === 'stop' ? b.h >= lo : b.l <= hi && b.h >= lo) { filled = plan.trigger === 'stop' ? Math.max(lo, b.o) : Math.min(hi, Math.max(lo, b.o)); k0 = k; break; }
  }
  if (filled === null) return after.length >= (plan.expiry || 30) ? { status: 'expired', label: 'Hết hiệu lực — chưa khớp điểm vào' } : { status: 'waiting', label: `Chờ khớp (${after.length}/${plan.expiry || 30} phiên)` };
  const r = filled - plan.stop;
  for (let k = k0; k < after.length; k++) {
    const b = after[k];
    const stopHit = k === k0 ? b.c <= plan.stop : b.l <= plan.stop;
    if (stopHit) { const px = k > k0 && b.o < plan.stop ? b.o : plan.stop; return { status: 'loss', label: px < plan.stop ? 'Dính dừng lỗ (mở cửa giảm sâu qua điểm dừng)' : 'Dính dừng lỗ', R: (px - filled) / r, filled, days: k - k0 + 1 }; }
    if (b.h >= plan.t1) {
      // chốt phần lớn ở mục tiêu 1, dời dừng lỗ về hòa vốn cho phần còn lại (dừng lỗ theo bậc)
      for (let m = k; m < after.length; m++) { if (after[m].h >= plan.t2) return { status: 'win2', label: 'Chạm mục tiêu 2', R: (plan.t2 - filled) / r, filled, days: m - k0 + 1 }; if (m > k && after[m].l <= filled) break; }
      return { status: 'win1', label: 'Chạm mục tiêu 1', R: (plan.t1 - filled) / r, filled, days: k - k0 + 1 };
    }
  }
  const last = after[after.length - 1].c;
  return { status: 'open', label: 'Đang mở', R: (last - filled) / r, filled };
}
