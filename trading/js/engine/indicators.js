// Chỉ báo kỹ thuật thuần (không phụ thuộc DOM). Mọi hàm nhận mảng số, trả mảng cùng độ dài (NaN khi chưa đủ dữ liệu).

export const last = (a, k = 1) => a[a.length - k];
const nan = (n) => new Array(n).fill(NaN);

export function sma(src, n) {
  const out = nan(src.length); let s = 0, cnt = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    s += v; cnt++;
    if (cnt > n) { s -= src[i - n]; cnt = n; }
    if (cnt === n) out[i] = s / n;
  }
  return out;
}

export function ema(src, n) {
  const out = nan(src.length); const k = 2 / (n + 1);
  let prev = NaN, s = 0, c = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (Number.isNaN(v)) continue;
    if (Number.isNaN(prev)) { s += v; c++; if (c === n) { prev = s / n; out[i] = prev; } continue; }
    prev = v * k + prev * (1 - k); out[i] = prev;
  }
  return out;
}

// Wilder smoothing (RMA)
export function rma(src, n) {
  const out = nan(src.length); let prev = NaN, s = 0, c = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (Number.isNaN(v)) continue;
    if (Number.isNaN(prev)) { s += v; c++; if (c === n) { prev = s / n; out[i] = prev; } continue; }
    prev = (prev * (n - 1) + v) / n; out[i] = prev;
  }
  return out;
}

export function stdev(src, n) {
  const out = nan(src.length);
  for (let i = n - 1; i < src.length; i++) {
    let m = 0; for (let j = i - n + 1; j <= i; j++) m += src[j]; m /= n;
    let v = 0; for (let j = i - n + 1; j <= i; j++) v += (src[j] - m) ** 2;
    out[i] = Math.sqrt(v / n);
  }
  return out;
}

export function rsi(close, n = 14) {
  const g = [NaN], l = [NaN];
  for (let i = 1; i < close.length; i++) { const d = close[i] - close[i - 1]; g.push(Math.max(d, 0)); l.push(Math.max(-d, 0)); }
  const ag = rma(g.map((x, i) => (i === 0 ? NaN : x)), n), al = rma(l.map((x, i) => (i === 0 ? NaN : x)), n);
  return ag.map((a, i) => (Number.isNaN(a) ? NaN : al[i] === 0 ? 100 : 100 - 100 / (1 + a / al[i])));
}

export function macd(close, f = 12, s = 26, sig = 9) {
  const ef = ema(close, f), es = ema(close, s);
  const line = ef.map((v, i) => v - es[i]);
  const signal = ema(line, sig);
  const hist = line.map((v, i) => v - signal[i]);
  return { line, signal, hist };
}

export function bollinger(close, n = 20, k = 2) {
  const mid = sma(close, n), sd = stdev(close, n);
  return { mid, up: mid.map((m, i) => m + k * sd[i]), lo: mid.map((m, i) => m - k * sd[i]), width: mid.map((m, i) => (2 * k * sd[i]) / m) };
}

export function trueRange(h, l, c) {
  return h.map((x, i) => (i === 0 ? x - l[i] : Math.max(x - l[i], Math.abs(x - c[i - 1]), Math.abs(l[i] - c[i - 1]))));
}
export const atr = (h, l, c, n = 14) => rma(trueRange(h, l, c), n);

export function adx(h, l, c, n = 14) {
  const pdm = [NaN], mdm = [NaN];
  for (let i = 1; i < h.length; i++) {
    const up = h[i] - h[i - 1], dn = l[i - 1] - l[i];
    pdm.push(up > dn && up > 0 ? up : 0); mdm.push(dn > up && dn > 0 ? dn : 0);
  }
  const tr = trueRange(h, l, c).map((x, i) => (i === 0 ? NaN : x));
  const str = rma(tr, n), sp = rma(pdm, n), sm = rma(mdm, n);
  const pdi = sp.map((v, i) => (100 * v) / str[i]), mdi = sm.map((v, i) => (100 * v) / str[i]);
  const dx = pdi.map((p, i) => (p + mdi[i] === 0 ? 0 : (100 * Math.abs(p - mdi[i])) / (p + mdi[i])));
  return { adx: rma(dx, n), pdi, mdi };
}

export function stoch(h, l, c, n = 14, ks = 3, ds = 3) {
  const raw = nan(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - n + 1; j <= i; j++) { if (h[j] > hh) hh = h[j]; if (l[j] < ll) ll = l[j]; }
    raw[i] = hh === ll ? 50 : (100 * (c[i] - ll)) / (hh - ll);
  }
  const k = sma(raw.map((x) => (Number.isNaN(x) ? 0 : x)), ks).map((x, i) => (i < n - 1 + ks - 1 ? NaN : x));
  const d = sma(k.map((x) => (Number.isNaN(x) ? 0 : x)), ds).map((x, i) => (i < n - 1 + ks + ds - 2 ? NaN : x));
  return { k, d };
}

export function obv(c, v) {
  const out = [0];
  for (let i = 1; i < c.length; i++) out.push(out[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0));
  return out;
}

export function mfi(h, l, c, v, n = 14) {
  const tp = c.map((x, i) => (h[i] + l[i] + x) / 3);
  const out = nan(c.length);
  for (let i = n; i < c.length; i++) {
    let pos = 0, neg = 0;
    for (let j = i - n + 1; j <= i; j++) { const f = tp[j] * v[j]; if (tp[j] > tp[j - 1]) pos += f; else if (tp[j] < tp[j - 1]) neg += f; }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

// Chaikin Money Flow
export function cmf(h, l, c, v, n = 20) {
  const mfv = c.map((x, i) => (h[i] === l[i] ? 0 : ((x - l[i] - (h[i] - x)) / (h[i] - l[i])) * v[i]));
  const out = nan(c.length);
  for (let i = n - 1; i < c.length; i++) {
    let a = 0, b = 0; for (let j = i - n + 1; j <= i; j++) { a += mfv[j]; b += v[j]; }
    out[i] = b === 0 ? 0 : a / b;
  }
  return out;
}

export const roc = (c, n) => c.map((x, i) => (i < n ? NaN : (x / c[i - n] - 1) * 100));

export function highest(a, n, end = a.length - 1) { let m = -Infinity; for (let i = Math.max(0, end - n + 1); i <= end; i++) if (a[i] > m) m = a[i]; return m; }
export function lowest(a, n, end = a.length - 1) { let m = Infinity; for (let i = Math.max(0, end - n + 1); i <= end; i++) if (a[i] < m) m = a[i]; return m; }

// hệ số góc tương đối (%/phiên) của chuỗi trong n phiên gần nhất bằng hồi quy tuyến tính
export function slopePct(a, n) {
  const m = a.length; if (m < n) return NaN;
  let sx = 0, sy = 0, sxy = 0, sxx = 0, k = 0;
  for (let i = m - n; i < m; i++) { const x = k++, y = a[i]; if (Number.isNaN(y)) return NaN; sx += x; sy += y; sxy += x * y; sxx += x * x; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return (b / (sy / n)) * 100;
}

// Gom nến ngày thành nến tuần (theo tuần ISO, thứ 2 bắt đầu)
export function toWeekly(bars) {
  const out = [];
  for (const b of bars) {
    const d = new Date(b.t * 1000); const day = (d.getUTCDay() + 6) % 7; const wk = b.t - day * 86400 - (b.t % 86400);
    const cur = out[out.length - 1];
    if (cur && cur.wk === wk) { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v; cur.va = (cur.va || 0) + (b.va || 0); }
    else out.push({ wk, t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, va: b.va || 0 });
  }
  return out;
}

// Gói tất cả chỉ báo cần cho một mã — tính một lần, dùng cho cả chấm điểm và biểu đồ
export function computeAll(bars) {
  const o = bars.map((b) => b.o), h = bars.map((b) => b.h), l = bars.map((b) => b.l), c = bars.map((b) => b.c), v = bars.map((b) => b.v);
  const va = bars.map((b) => b.va || b.v * b.c);
  return {
    o, h, l, c, v, va,
    ema10: ema(c, 10), ema20: ema(c, 20), ma20: sma(c, 20), ma50: sma(c, 50), ma100: sma(c, 100), ma200: sma(c, 200),
    rsi: rsi(c, 14), macd: macd(c), bb: bollinger(c), atr: atr(h, l, c, 14), adx: adx(h, l, c, 14),
    stoch: stoch(h, l, c), obv: obv(c, v), mfi: mfi(h, l, c, v), cmf: cmf(h, l, c, v),
    vma20: sma(v, 20), vama20: sma(va, 20), vma50: sma(v, 50),
  };
}
