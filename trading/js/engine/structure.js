// Cấu trúc giá: đỉnh/đáy (zigzag), hỗ trợ/kháng cự, Fibonacci, phân kỳ, mô hình giá & mô hình nến.

// ---------- Zigzag: đảo chiều khi giá đi ngược ≥ thr (tỷ lệ, vd 0.05 = 5%) ----------
export function zigzag(h, l, thr) {
  const piv = []; if (h.length < 3) return piv;
  let dir = 0, extI = 0, extP = h[0], lowI = 0, lowP = l[0];
  for (let i = 1; i < h.length; i++) {
    if (dir >= 0) {
      if (h[i] >= extP) { extP = h[i]; extI = i; }
      if (dir === 0) { if (l[i] <= lowP) { lowP = l[i]; lowI = i; } }
      if (dir === 0 && extP / lowP - 1 >= thr) {
        if (lowI < extI) { piv.push({ i: lowI, p: lowP, t: 'L' }); dir = 1; }
        else { piv.push({ i: extI, p: extP, t: 'H' }); dir = -1; extP = l[i]; extI = i; continue; }
      }
      if (dir === 1 && l[i] <= extP * (1 - thr)) { piv.push({ i: extI, p: extP, t: 'H' }); dir = -1; extP = l[i]; extI = i; }
    } else {
      if (l[i] <= extP) { extP = l[i]; extI = i; }
      if (h[i] >= extP * (1 + thr)) { piv.push({ i: extI, p: extP, t: 'L' }); dir = 1; extP = h[i]; extI = i; }
    }
  }
  // điểm cực trị đang hình thành (chưa xác nhận)
  if (dir !== 0) piv.push({ i: extI, p: extP, t: dir === 1 ? 'H' : 'L', open: true });
  return piv;
}

// Đỉnh/đáy cục bộ theo cửa sổ (dùng cho phân kỳ — nhạy hơn zigzag)
export function fractals(a, w = 3, end = a.length) {
  const hi = [], lo = [];
  for (let i = w; i < end - w; i++) {
    let isH = true, isL = true;
    for (let j = i - w; j <= i + w; j++) { if (j === i) continue; if (a[j] >= a[i]) isH = false; if (a[j] <= a[i]) isL = false; }
    if (isH) hi.push(i); if (isL) lo.push(i);
  }
  return { hi, lo };
}

// ---------- Hỗ trợ / kháng cự: gom cụm các đỉnh đáy ----------
export function levels(ind, look = 250) {
  const { h, l, c, v, atr } = ind; const n = c.length; const start = Math.max(0, n - look);
  const a = atr[n - 1] || c[n - 1] * 0.02;
  const pts = [];
  const f = fractals(h, 4), g = fractals(l, 4);
  f.hi.filter((i) => i >= start).forEach((i) => pts.push({ p: h[i], i, w: 1 + (v[i] > (ind.vma20[i] || 0) ? 0.5 : 0) }));
  g.lo.filter((i) => i >= start).forEach((i) => pts.push({ p: l[i], i, w: 1 + (v[i] > (ind.vma20[i] || 0) ? 0.5 : 0) }));
  pts.sort((x, y) => x.p - y.p);
  const tol = a * 0.6; const clusters = [];
  for (const pt of pts) {
    const cl = clusters[clusters.length - 1];
    if (cl && pt.p - cl.hiP <= tol) { cl.items.push(pt); cl.hiP = pt.p; }
    else clusters.push({ items: [pt], hiP: pt.p });
  }
  const out = clusters.map((cl) => {
    const wsum = cl.items.reduce((s, x) => s + x.w, 0);
    const p = cl.items.reduce((s, x) => s + x.p * x.w, 0) / wsum;
    const lastI = Math.max(...cl.items.map((x) => x.i));
    const recency = 1 - (n - 1 - lastI) / look;
    return { p, touches: cl.items.length, strength: wsum * (0.6 + 0.4 * recency), lastI };
  }).filter((x) => x.touches >= 2 || x.strength >= 1.4);
  const price = c[n - 1];
  const sup = out.filter((x) => x.p < price * 0.998).sort((x, y) => y.p - x.p);
  const res = out.filter((x) => x.p > price * 1.002).sort((x, y) => x.p - y.p);
  // bổ sung đường trung bình làm hỗ trợ/kháng cự động
  return { support: sup.slice(0, 3), resistance: res.slice(0, 3), all: out };
}

// ---------- Fibonacci từ con sóng chính gần nhất ----------
export const FIB = [0.236, 0.382, 0.5, 0.618, 0.786];
export function fibonacci(ind, look = 160) {
  const { h, l, c } = ind; const n = c.length; if (n < 30) return null;
  const s = Math.max(0, n - look);
  let hiI = s, loI = s;
  for (let i = s; i < n; i++) { if (h[i] > h[hiI]) hiI = i; if (l[i] < l[loI]) loI = i; }
  const hi = h[hiI], lo = l[loI]; if (hi / lo - 1 < 0.08) return null;
  const up = loI < hiI; // sóng tăng: đáy trước đỉnh sau
  const range = hi - lo; const price = c[n - 1];
  const lv = FIB.map((r) => ({ r, p: up ? hi - range * r : lo + range * r }));
  const ext = [1.272, 1.618].map((r) => ({ r, p: up ? lo + range * r : hi - range * r }));
  const retr = up ? (hi - price) / range : (price - lo) / range; // mức đã hồi lại
  let zone = 'ngoài vùng';
  if (retr < 0.236) zone = up ? 'gần đỉnh sóng' : 'gần đáy sóng';
  else if (retr < 0.382) zone = 'điều chỉnh nông (23.6–38.2%)';
  else if (retr <= 0.618) zone = 'vùng vàng (38.2–61.8%)';
  else if (retr <= 0.786) zone = 'điều chỉnh sâu (61.8–78.6%)';
  else zone = 'gần như mất cả sóng';
  return { up, hi, lo, hiI, loI, levels: lv, ext, retr, zone };
}

// ---------- Phân kỳ giữa giá và một dao động (RSI/MACD hist) ----------
// trả các phân kỳ có điểm thứ hai trong `recent` phiên gần nhất
export function divergences(price, osc, { look = 70, recent = 8, w = 3, name = 'RSI', lowZone = 42, highZone = 58 } = {}) {
  const n = price.length; const out = [];
  const start = Math.max(0, n - look);
  const sub = (arr) => arr.slice(start);
  const pl = fractals(sub(price.lows || price), w, n - start + 0);
  const ph = fractals(sub(price.highs || price), w, n - start + 0);
  const lows = price.lows || price, highs = price.highs || price;
  // cho phép đáy/đỉnh cuối cùng chỉ cần w/2 phiên bên phải (để bắt tín hiệu sớm)
  const tail = (arr, isLow) => {
    const i = n - 1 - 1; const ok = [];
    for (let k = n - 1 - Math.ceil(w / 2); k < n - 1; k++) {
      let good = true; for (let j = k - w; j <= Math.min(n - 1, k + Math.ceil(w / 2)); j++) { if (j === k) continue; if (isLow ? arr[j] <= arr[k] : arr[j] >= arr[k]) good = false; }
      if (good) ok.push(k - start);
    }
    return ok; void i;
  };
  const L = [...pl.lo, ...tail(lows, true)].map((i) => i + start).filter((v, i, a) => a.indexOf(v) === i);
  const H = [...ph.hi, ...tail(highs, false)].map((i) => i + start).filter((v, i, a) => a.indexOf(v) === i);
  const pair = (arr) => (arr.length >= 2 ? [arr[arr.length - 2], arr[arr.length - 1]] : null);
  const pL = pair(L), pH = pair(H);
  if (pL) {
    const [a, b] = pL;
    if (n - 1 - b <= recent && b - a >= 5 && !Number.isNaN(osc[a]) && !Number.isNaN(osc[b])) {
      if (lows[b] < lows[a] && osc[b] > osc[a] + 1e-9 && osc[a] < lowZone) out.push({ kind: 'bull', hidden: false, a, b, name, text: `Phân kỳ dương ${name}: giá tạo đáy thấp hơn nhưng ${name} tạo đáy cao hơn` });
      else if (lows[b] > lows[a] && osc[b] < osc[a] - 1e-9 && osc[b] < lowZone + 5) out.push({ kind: 'bull', hidden: true, a, b, name, text: `Phân kỳ ẩn tăng ${name}: giá giữ đáy cao hơn, ${name} hạ nhiệt — xu hướng tăng có thể tiếp diễn` });
    }
  }
  if (pH) {
    const [a, b] = pH;
    if (n - 1 - b <= recent && b - a >= 5 && !Number.isNaN(osc[a]) && !Number.isNaN(osc[b])) {
      if (highs[b] > highs[a] && osc[b] < osc[a] - 1e-9 && osc[a] > highZone) out.push({ kind: 'bear', hidden: false, a, b, name, text: `Phân kỳ âm ${name}: giá tạo đỉnh cao hơn nhưng ${name} yếu đi` });
      else if (highs[b] < highs[a] && osc[b] > osc[a] + 1e-9 && osc[b] > highZone - 5) out.push({ kind: 'bear', hidden: true, a, b, name, text: `Phân kỳ ẩn giảm ${name}: giá đỉnh thấp hơn trong khi ${name} hồi — áp lực giảm có thể tiếp diễn` });
    }
  }
  return out;
}

// ---------- Mô hình nến (1–3 phiên cuối) ----------
export function candles(ind) {
  const { o, h, l, c } = ind; const n = c.length; if (n < 5) return [];
  const out = []; const i = n - 1;
  const body = (k) => Math.abs(c[k] - o[k]), rng = (k) => Math.max(h[k] - l[k], 1e-9);
  const up = (k) => c[k] > o[k], dn = (k) => c[k] < o[k];
  const upper = (k) => h[k] - Math.max(o[k], c[k]), lower = (k) => Math.min(o[k], c[k]) - l[k];
  const priorDown = c[i - 1] < c[Math.max(0, i - 6)] * 0.98, priorUp = c[i - 1] > c[Math.max(0, i - 6)] * 1.02;
  if (lower(i) >= 2 * body(i) && upper(i) <= body(i) * 0.6 + rng(i) * 0.05 && priorDown) out.push({ kind: 'bull', name: 'Búa (Hammer)', text: 'Nến búa sau nhịp giảm: lực mua bật lại từ vùng thấp' });
  if (upper(i) >= 2 * body(i) && lower(i) <= body(i) * 0.6 + rng(i) * 0.05 && priorUp) out.push({ kind: 'bear', name: 'Sao băng', text: 'Nến sao băng sau nhịp tăng: bị bán mạnh ở vùng cao' });
  if (up(i) && dn(i - 1) && c[i] >= o[i - 1] && o[i] <= c[i - 1] && body(i) > body(i - 1)) out.push({ kind: 'bull', name: 'Nhấn chìm tăng', text: 'Nến nhấn chìm tăng: phe mua lấn át hoàn toàn phiên trước' });
  if (dn(i) && up(i - 1) && o[i] >= c[i - 1] && c[i] <= o[i - 1] && body(i) > body(i - 1)) out.push({ kind: 'bear', name: 'Nhấn chìm giảm', text: 'Nến nhấn chìm giảm: phe bán lấn át hoàn toàn phiên trước' });
  if (dn(i - 2) && body(i - 1) < rng(i - 1) * 0.3 && up(i) && c[i] > (o[i - 2] + c[i - 2]) / 2 && priorDown) out.push({ kind: 'bull', name: 'Sao mai', text: 'Mô hình sao mai: tín hiệu đảo chiều tăng 3 nến' });
  if (up(i - 2) && body(i - 1) < rng(i - 1) * 0.3 && dn(i) && c[i] < (o[i - 2] + c[i - 2]) / 2 && priorUp) out.push({ kind: 'bear', name: 'Sao hôm', text: 'Mô hình sao hôm: tín hiệu đảo chiều giảm 3 nến' });
  if (up(i) && body(i) >= rng(i) * 0.85 && rng(i) > (ind.atr[i] || 0) * 1.2) out.push({ kind: 'bull', name: 'Marubozu tăng', text: 'Nến tăng thân dài gần như không bóng: lực mua áp đảo' });
  if (dn(i) && body(i) >= rng(i) * 0.85 && rng(i) > (ind.atr[i] || 0) * 1.2) out.push({ kind: 'bear', name: 'Marubozu giảm', text: 'Nến giảm thân dài gần như không bóng: lực bán áp đảo' });
  if (body(i) <= rng(i) * 0.1 && rng(i) > 0) out.push({ kind: 'neutral', name: 'Doji', text: 'Nến doji: thị trường lưỡng lự, chờ xác nhận' });
  return out;
}

// ---------- Mô hình giá ----------
export function chartPatterns(ind) {
  const { h, l, c, v, vma20, atr } = ind; const n = c.length; if (n < 60) return [];
  const out = []; const price = c[n - 1]; const a = atr[n - 1] || price * 0.02;
  const piv = zigzag(h, l, Math.max(0.04, Math.min(0.12, (a / price) * 3)));
  const conf = piv.filter((p) => !p.open);
  const volUp = v[n - 1] > (vma20[n - 1] || Infinity) * 1.4;
  const near = (x, y, t = 0.035) => Math.abs(x / y - 1) <= t;

  // Hai đáy (W)
  const lows = conf.filter((p) => p.t === 'L'), highs = conf.filter((p) => p.t === 'H');
  if (lows.length >= 2) {
    const L2 = lows[lows.length - 1], L1 = lows[lows.length - 2];
    const mid = highs.filter((p) => p.i > L1.i && p.i < L2.i).sort((x, y) => y.p - x.p)[0];
    if (mid && near(L1.p, L2.p) && mid.p / Math.max(L1.p, L2.p) - 1 > 0.06 && L2.i > n - 45 && L2.i - L1.i >= 10) {
      const broke = price > mid.p;
      out.push({ kind: 'bull', key: 'double-bottom', name: 'Hai đáy (W)', neckline: mid.p, a: L1.i, b: L2.i, confirmed: broke,
        text: broke ? `Mô hình hai đáy đã vượt đường viền cổ ${fmtP(mid.p)}${volUp ? ' kèm khối lượng lớn' : ''}` : `Đang hình thành hai đáy quanh ${fmtP((L1.p + L2.p) / 2)}, cần vượt ${fmtP(mid.p)} để xác nhận`,
        target: broke ? mid.p + (mid.p - Math.min(L1.p, L2.p)) : null });
    }
  }
  // Hai đỉnh (M)
  if (highs.length >= 2) {
    const H2 = highs[highs.length - 1], H1 = highs[highs.length - 2];
    const mid = lows.filter((p) => p.i > H1.i && p.i < H2.i).sort((x, y) => x.p - y.p)[0];
    if (mid && near(H1.p, H2.p) && Math.min(H1.p, H2.p) / mid.p - 1 > 0.06 && H2.i > n - 45 && H2.i - H1.i >= 10) {
      const broke = price < mid.p;
      out.push({ kind: 'bear', key: 'double-top', name: 'Hai đỉnh (M)', neckline: mid.p, a: H1.i, b: H2.i, confirmed: broke,
        text: broke ? `Mô hình hai đỉnh đã thủng đường viền cổ ${fmtP(mid.p)}` : `Có dấu hiệu hai đỉnh quanh ${fmtP((H1.p + H2.p) / 2)}, mốc cần giữ là ${fmtP(mid.p)}` });
    }
  }
  // Vai-đầu-vai & đảo ngược
  if (conf.length >= 5) {
    const s = conf.slice(-5);
    if (s[0].t === 'H' && s[1].t === 'L' && s[2].t === 'H' && s[3].t === 'L' && s[4].t === 'H') {
      const [ls, n1, hd, n2, rs] = s;
      if (hd.p > ls.p * 1.03 && hd.p > rs.p * 1.03 && near(ls.p, rs.p, 0.06) && rs.i > n - 40) {
        const neck = (n1.p + n2.p) / 2; const broke = price < neck;
        out.push({ kind: 'bear', key: 'hs', name: 'Vai – đầu – vai', neckline: neck, a: ls.i, b: rs.i, confirmed: broke, text: broke ? `Vai–đầu–vai đã thủng viền cổ ${fmtP(neck)}: rủi ro đảo chiều giảm` : `Đang hình thành vai–đầu–vai, viền cổ ${fmtP(neck)}` });
      }
    }
    if (s[0].t === 'L' && s[1].t === 'H' && s[2].t === 'L' && s[3].t === 'H' && s[4].t === 'L') {
      const [ls, n1, hd, n2, rs] = s;
      if (hd.p < ls.p * 0.97 && hd.p < rs.p * 0.97 && near(ls.p, rs.p, 0.06) && rs.i > n - 40) {
        const neck = (n1.p + n2.p) / 2; const broke = price > neck;
        out.push({ kind: 'bull', key: 'ihs', name: 'Vai – đầu – vai ngược', neckline: neck, a: ls.i, b: rs.i, confirmed: broke, text: broke ? `Vai–đầu–vai ngược đã vượt viền cổ ${fmtP(neck)}: tín hiệu đảo chiều tăng` : `Đang hình thành vai–đầu–vai ngược, viền cổ ${fmtP(neck)}` });
      }
    }
  }
  // Tam giác tăng/giảm trong 40 phiên
  {
    const W = 40, s = n - W; const f = fractals(h.slice(s), 3), g = fractals(l.slice(s), 3);
    const hs = f.hi.map((i) => h[s + i]), ls = g.lo.map((i) => l[s + i]);
    if (hs.length >= 2 && ls.length >= 2) {
      const flatTop = Math.max(...hs) / Math.min(...hs) - 1 < 0.025, risingLows = ls[ls.length - 1] > ls[0] * 1.03;
      const flatBot = Math.max(...ls) / Math.min(...ls) - 1 < 0.025, fallingHighs = hs[hs.length - 1] < hs[0] * 0.97;
      const top = Math.max(...hs), bot = Math.min(...ls);
      if (flatTop && risingLows) out.push({ kind: 'bull', key: 'asc-tri', name: 'Tam giác tăng', level: top, confirmed: price > top, text: price > top ? `Thoát khỏi tam giác tăng tại ${fmtP(top)}${volUp ? ' với khối lượng lớn' : ''}` : `Tam giác tăng: đáy nâng dần, kháng cự phẳng ${fmtP(top)}` });
      if (flatBot && fallingHighs) out.push({ kind: 'bear', key: 'desc-tri', name: 'Tam giác giảm', level: bot, confirmed: price < bot, text: price < bot ? `Thủng tam giác giảm tại ${fmtP(bot)}` : `Tam giác giảm: đỉnh hạ dần, hỗ trợ phẳng ${fmtP(bot)}` });
    }
  }
  // Nền tích lũy chặt & breakout (kiểu Darvas/VCP rút gọn)
  for (const W of [20, 35, 55]) {
    if (n < W + 5) continue;
    const top = Math.max(...h.slice(n - 1 - W, n - 1)), bot = Math.min(...l.slice(n - 1 - W, n - 1));
    const depth = top / bot - 1;
    if (depth < 0.16 && depth > 0.03) {
      if (c[n - 1] > top && volUp) { out.push({ kind: 'bull', key: 'base-breakout', name: `Breakout nền ${W} phiên`, level: top, confirmed: true, text: `Vượt nền tích lũy ${W} phiên (biên độ ${(depth * 100).toFixed(0)}%) tại ${fmtP(top)} với khối lượng gấp ${(v[n - 1] / vma20[n - 1]).toFixed(1)} lần trung bình` }); break; }
      if (c[n - 1] < bot && v[n - 1] > (vma20[n - 1] || Infinity) * 1.2) { out.push({ kind: 'bear', key: 'base-breakdown', name: `Thủng nền ${W} phiên`, level: bot, confirmed: true, text: `Thủng nền ${W} phiên tại ${fmtP(bot)}` }); break; }
      if (W >= 35 && c[n - 1] > bot + (top - bot) * 0.6) { out.push({ kind: 'bull', key: 'base', name: `Tích lũy ${W} phiên`, level: top, confirmed: false, text: `Đang tích lũy chặt ${W} phiên (biên độ ${(depth * 100).toFixed(0)}%), sát cạnh trên ${fmtP(top)}` }); break; }
    }
  }
  // Cờ tăng: cán cờ ≥15% trong ≤12 phiên, sau đó điều chỉnh nông
  {
    for (let p = n - 6; p >= n - 25 && p > 15; p--) {
      const poleLow = Math.min(...l.slice(p - 12, p)); const poleHigh = h[p];
      if (poleHigh / poleLow - 1 >= 0.15 && poleHigh >= Math.max(...h.slice(p - 12, n))) {
        const pull = (poleHigh - Math.min(...l.slice(p, n))) / (poleHigh - poleLow);
        if (pull > 0.1 && pull < 0.5) { out.push({ kind: 'bull', key: 'flag', name: 'Cờ tăng', level: poleHigh, confirmed: price > poleHigh, text: `Mô hình cờ tăng: cán cờ +${((poleHigh / poleLow - 1) * 100).toFixed(0)}%, điều chỉnh ${(pull * 100).toFixed(0)}% chiều cao cán` }); }
        break;
      }
    }
  }
  return out;
}

export function trendStructure(h, l, thr = 0.05) {
  const piv = zigzag(h, l, thr).filter((p) => !p.open);
  const H = piv.filter((p) => p.t === 'H').slice(-2), L = piv.filter((p) => p.t === 'L').slice(-2);
  if (H.length < 2 || L.length < 2) return { label: 'chưa rõ', score: 0, piv };
  const hh = H[1].p > H[0].p, hl = L[1].p > L[0].p;
  if (hh && hl) return { label: 'đỉnh và đáy sau cao hơn', score: 1, piv };
  if (!hh && !hl) return { label: 'đỉnh và đáy sau thấp hơn', score: -1, piv };
  if (hl) return { label: 'đáy nâng, đỉnh chưa vượt', score: 0.3, piv };
  return { label: 'đỉnh nâng nhưng đáy hạ (biến động mạnh)', score: -0.2, piv };
}

export function fmtP(p) { return p >= 1000 ? Math.round(p).toLocaleString('vi-VN') : p.toFixed(2); }
