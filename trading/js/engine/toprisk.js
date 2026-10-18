// Rủi ro vùng đỉnh: nhận diện mã đã tăng quá nhiều và có dấu hiệu "cá mập" phân phối — để tránh đu đỉnh
// dù các chỉ báo xu hướng vẫn đẹp. Dựa trên:
//  - O'Neil (How to Make Money in Stocks): climax top — tăng 25–50% trong 1–3 tuần sau một đợt tăng dài, phiên tăng mạnh nhất,
//    gap kiệt sức, khối lượng lớn nhất nhưng giá không đi tiếp, nền giai đoạn muộn (nền thứ 3–4 trở đi).
//  - Wyckoff: vùng phân phối — Buying Climax (khối lượng cực đại, nến rút chân trên), Upthrust/UTAD (vượt đỉnh rồi đóng cửa thấp lại),
//    churning (khối lượng lớn nhưng giá đứng), các phiên giảm kèm khối lượng tăng.
//  - Weinstein Stage 3: MA30 tuần đi ngang sau đợt tăng, giá cắt qua lại MA.
//  - Hồi quy về trung bình: khoảng cách giá–MA ở mức cao bất thường so với lịch sử của chính mã đó.
import { highest, lowest, slopePct, sma } from './indicators.js?v=8e6ac8b1';

const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(x);

export function topRisk(f) {
  const { o, h, l, c, v, vma20, ma50, ma200, atr } = f.ind; const n = f.n, i = n - 1, p = f.price;
  const S = []; const add = (k, pts, text) => S.push({ k, pts, text });
  if (n < 80) return { score: 0, level: lvl(0), signals: [] };

  // 1) Khoảng cách tới MA50 so với lịch sử của chính mã
  const d50 = []; for (let k = Math.max(50, n - 500); k < n; k++) if (ok(ma50[k])) d50.push(c[k] / ma50[k] - 1);
  const cur50 = p / ma50[i] - 1; const sorted = [...d50].sort((a, b) => a - b); const pr = sorted.filter((x) => x <= cur50).length / Math.max(1, sorted.length);
  if (cur50 > 0.15 && pr >= 0.95) add('ext50', 20, `Cách MA50 ${(cur50 * 100).toFixed(0)}% — cao hơn ${(pr * 100).toFixed(0)}% các phiên trong 2 năm của chính mã, dễ hồi quy về trung bình`);
  else if (cur50 > 0.12 && pr >= 0.9) add('ext50', 12, `Cách MA50 ${(cur50 * 100).toFixed(0)}% — vùng kéo giãn hiếm gặp (top ${(100 - pr * 100).toFixed(0)}%)`);
  // 2) Khoảng cách tới MA200 & mức tăng từ đáy
  if (ok(ma200[i])) { const d = p / ma200[i] - 1; if (d > 0.8) add('ext200', 18, `Cao hơn MA200 ${(d * 100).toFixed(0)}%`); else if (d > 0.5) add('ext200', 10, `Cao hơn MA200 ${(d * 100).toFixed(0)}%`); }
  if (f.fromLo > 200) add('run', 15, `Đã tăng ${f.fromLo.toFixed(0)}% từ đáy 52 tuần`); else if (f.fromLo > 100) add('run', 10, `Đã tăng ${f.fromLo.toFixed(0)}% từ đáy 52 tuần`);

  // 3) Climax run (O'Neil): tăng ≥25% trong 15 phiên sau đợt tăng dài + phiên tăng mạnh nhất của cả đợt
  const g15 = c[i] / lowest(l, 15) - 1;
  let maxUp = 0, maxUpI = -1; for (let k = Math.max(1, n - 120); k < n; k++) { const r = c[k] / c[k - 1] - 1; if (r > maxUp) { maxUp = r; maxUpI = k; } }
  let ups = 0; for (let k = n - 10; k < n; k++) if (c[k] > c[k - 1]) ups++;
  if (g15 >= 0.25 && f.fromLo > 50) add('climax', 20, `Tăng tốc ${(g15 * 100).toFixed(0)}% trong 3 tuần sau đợt tăng dài${maxUpI >= n - 15 ? ', kèm phiên tăng mạnh nhất cả đợt' : ''} — dấu hiệu "climax top" của O'Neil`);
  else if (ups >= 8 && cur50 > 0.1) add('climax', 10, `${ups}/10 phiên gần nhất đều tăng — đà tăng dốc đứng, dễ kiệt sức`);

  // 4) Gap kiệt sức
  for (let k = n - 5; k < n; k++) if (o[k] > h[k - 1] + 1.2 * (atr[k - 1] || 0) && cur50 > 0.15) { add('gap', 10, 'Gap tăng mạnh khi đã kéo giãn xa MA50 — có thể là gap kiệt sức'); break; }

  // 5) Buying Climax (Wyckoff): khối lượng lớn nhất 6 tháng trong 10 phiên gần đây, nến rút chân trên hoặc đóng cửa yếu
  let vMaxI = n - 120; for (let k = Math.max(0, n - 120); k < n; k++) if (v[k] > v[vMaxI]) vMaxI = k;
  if (vMaxI >= n - 10 && f.fromHi > -10) {
    const rng = Math.max(h[vMaxI] - l[vMaxI], 1e-9), upper = h[vMaxI] - Math.max(o[vMaxI], c[vMaxI]);
    if (upper / rng >= 0.45 || (c[vMaxI] - l[vMaxI]) / rng < 0.4 || c[vMaxI] < o[vMaxI]) add('bc', 18, 'Khối lượng lớn nhất 6 tháng nhưng nến rút chân/đóng cửa yếu — "Buying Climax": tổ chức bán ra cho số đông');
    else add('bc', 6, 'Khối lượng lớn nhất 6 tháng ở vùng giá cao — cần theo dõi phiên kế tiếp');
  }
  // 6) Churning: khối lượng lớn mà giá đứng yên gần đỉnh
  let churn = 0; const hi20 = highest(h, 20);
  for (let k = n - 15; k < n; k++) if (v[k] > 1.5 * (vma20[k] || Infinity) && Math.abs(c[k] / c[k - 1] - 1) < 0.008 && c[k] > hi20 * 0.95) churn++;
  if (churn) add('churn', Math.min(18, churn * 6), `${churn} phiên khối lượng lớn nhưng giá gần như đứng yên ở vùng đỉnh — "churning", hàng đang được phân phối`);
  // 7) Ngày phân phối của riêng mã (giảm ≥1% với khối lượng tăng và trên trung bình)
  let dd = 0; for (let k = n - 25; k < n; k++) if (c[k] / c[k - 1] - 1 <= -0.01 && v[k] > v[k - 1] && v[k] > (vma20[k] || 0)) dd++;
  if (dd >= 6) add('dist', 20, `${dd} phiên giảm kèm khối lượng lớn trong 25 phiên — bị phân phối mạnh`); else if (dd >= 4) add('dist', 12, `${dd} phiên giảm kèm khối lượng lớn trong 25 phiên`);
  // 8) Upthrust / UTAD: vượt đỉnh cũ trong phiên rồi đóng cửa dưới đỉnh cũ, khối lượng lớn
  for (let k = n - 10; k < n; k++) {
    const prevHi = highest(h, 60, k - 1);
    if (h[k] > prevHi && c[k] < prevHi && v[k] > (vma20[k] || Infinity)) { add('ut', 14, 'Vượt đỉnh cũ trong phiên rồi đóng cửa thấp lại với khối lượng lớn — "Upthrust" (bẫy tăng giá) theo Wyckoff'); break; }
  }
  // 9) Phân kỳ âm ở vùng đỉnh
  if (f.fromHi > -8 && f.div.some((d) => d.kind === 'bear' && !d.hidden)) add('div', 12, 'Phân kỳ âm RSI/MACD ở vùng đỉnh — động lượng yếu dần');
  // 10) Quá mua cực độ
  if (f.wk && f.wk.rsi >= 80) add('rsiw', 8, `RSI tuần ${f.wk.rsi.toFixed(0)} — quá mua cực độ khung tuần`);
  if (f.rsi >= 80) add('rsid', 6, `RSI ngày ${f.rsi.toFixed(0)}`);
  // 11) Dòng tiền rút khi giá còn tăng
  if (f.fromHi > -6 && f.obvSlope < f.priceSlope20 - 0.15 && f.priceSlope20 > 0) add('obv', 10, 'Giá tăng nhưng OBV đi xuống — tiền thông minh đang rút');
  // 12) Nền giai đoạn muộn: số lần bứt khỏi nền kể từ đáy 52 tuần
  { const loI = (() => { const m = lowest(l, 250); for (let k = i; k >= Math.max(0, n - 250); k--) if (l[k] === m) return k; return n - 250; })();
    let bases = 0, last = -999;
    for (let k = loI + 25; k < n; k++) { const top = highest(h, 20, k - 1), bot = lowest(l, 20, k - 1); if (top / bot - 1 < 0.15 && c[k] > top && k - last > 20) { bases++; last = k; } }
    if (bases >= 4) add('late', 12, `Đã bứt khỏi ${bases} nền giá kể từ đáy — nền giai đoạn muộn, xác suất thất bại cao (O'Neil)`);
    else if (bases === 3) add('late', 6, 'Đang ở nền thứ 3 kể từ đáy — bắt đầu giai đoạn muộn'); }
  // 13) Weinstein Stage 3: MA150 (≈ MA30 tuần) đi ngang sau đợt tăng, giá cắt qua lại
  { const m150 = sma(c, 150); const sl = slopePct(m150, 20); let cross = 0;
    for (let k = n - 40; k < n; k++) if (ok(m150[k]) && ok(m150[k - 1]) && (c[k] - m150[k]) * (c[k - 1] - m150[k - 1]) < 0) cross++;
    if (ok(sl) && Math.abs(sl) < 0.03 && cross >= 3 && f.fromLo > 30) add('stage3', 12, `MA30 tuần đi ngang, giá cắt qua lại ${cross} lần — giai đoạn 3 (tạo đỉnh) theo Weinstein`); }

  const score = Math.min(100, S.reduce((s, x) => s + x.pts, 0));
  return { score, level: lvl(score), signals: S.sort((a, b) => b.pts - a.pts) };
}

function lvl(s) {
  if (s >= 60) return { key: 'high', label: 'Rủi ro đỉnh cao' };
  if (s >= 40) return { key: 'dist', label: 'Dấu hiệu phân phối' };
  if (s >= 20) return { key: 'hot', label: 'Tăng nóng' };
  return { key: 'ok', label: 'Bình thường' };
}
