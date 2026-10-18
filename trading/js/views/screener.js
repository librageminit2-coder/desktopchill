// Trang Cơ hội: xếp hạng toàn bộ mã HOSE theo khung thời gian, lọc theo ngành, thanh khoản, tín hiệu.
import * as store from '../data/store.js?v=b827dab1';
import { $, $$, esc, fmtP, fmtPct, fmtTy, cls, scoreCell, spark, avatar, HZ, HZ_SUB } from '../ui/util.js?v=70d78725';

const LS = 'dct_screener';
let st = { hz: 'mid', list: 'top', sec: '', liq: 1e9, chips: [], q: '', sort: null, dir: -1, limit: 60 };
try { Object.assign(st, JSON.parse(localStorage.getItem(LS) || '{}'), { limit: 60, q: '' }); } catch (e) {}
const save = () => { try { localStorage.setItem(LS, JSON.stringify({ hz: st.hz, list: st.list, sec: st.sec, liq: st.liq, chips: st.chips })); } catch (e) {} };

const phz = () => (st.hz === 'bottom' ? 'mid' : st.hz);
const CHIPS = [
  { k: 'plan', label: 'Có điểm vào đạt chuẩn R:R', test: (r) => r.plan?.[phz()]?.valid },
  { k: 'notop', label: 'Ẩn mã rủi ro vùng đỉnh', test: (r) => !(r.top && r.top.score >= 40) },
  { k: 'breakout', label: 'Breakout', test: (r) => r.tags.some((t) => ['base-breakout', 'asc-tri', 'flag'].includes(t.k) && t.kind === 'bull' && t.confirmed) },
  { k: 'reversal', label: 'Mô hình đảo chiều tăng', test: (r) => r.tags.some((t) => ['double-bottom', 'ihs'].includes(t.k)) },
  { k: 'div', label: 'Phân kỳ dương', test: (r) => r.tags.some((t) => t.k === 'div' && t.kind === 'bull') },
  { k: 'hi52', label: 'Đỉnh 52 tuần', test: (r) => r.tags.some((t) => t.k === 'hi52') || r.fromHi > -3 },
  { k: 'flow', label: 'Tiền vào đột biến', test: (r) => r.rvol >= 1.8 && r.chg > 0 },
  { k: 'foreign', label: 'Khối ngoại mua ròng', test: (r) => r.foreignNet > 0 && r.foreignNet > r.avgVal20 * 0.03 },
  { k: 'rs', label: 'RS ≥ 80', test: (r) => r.rs >= 80 },
  { k: 'ma200', label: 'Trên MA200', test: (r) => r.above200 },
];

let root = null;
function render(main) {
  root = main; st.q = ''; st.limit = 60;
  const S = store.state;
  main.innerHTML = `
  <div class="page-title"><div><h1>Cơ hội</h1><p id="intro"></p></div>
    <div class="seg" id="hz">${[...Object.keys(HZ), 'bottom'].map((k) => `<button data-v="${k}" class="${st.hz === k ? 'on' : ''}">${k === 'bottom' ? 'Vùng đáy' : HZ[k]} <span style="opacity:.7;font-weight:600">· ${k === 'bottom' ? 'tiềm năng hồi phục' : HZ_SUB[k]}</span></button>`).join('')}</div></div>
  <div class="toolbar">
    <div class="seg sm" id="lst"></div>
    <label class="sel"><span class="sr">Ngành</span><select id="sec"><option value="">Tất cả ngành</option></select></label>
    <label class="sel"><span class="sr">Thanh khoản</span><select id="liq">${[[0, 'Mọi thanh khoản'], [1e9, 'GTGD ≥ 1 tỷ/phiên'], [5e9, 'GTGD ≥ 5 tỷ/phiên'], [20e9, 'GTGD ≥ 20 tỷ/phiên'], [100e9, 'GTGD ≥ 100 tỷ/phiên']].map(([v, l]) => `<option value="${v}" ${+st.liq === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <input class="input" id="flt" placeholder="Lọc theo mã…" style="width:150px;height:40px;text-transform:uppercase" autocomplete="off">
  </div>
  <div class="toolbar" id="chips">${CHIPS.map((c) => `<button class="chip ${st.chips.includes(c.k) ? 'on' : ''}" data-k="${c.k}" aria-pressed="${st.chips.includes(c.k)}">${c.label}</button>`).join('')}</div>
  <div id="status"></div>
  <div class="table-wrap glass" id="tbl"></div>
  <div style="text-align:center;margin-top:14px" id="more"></div>`;
  fillSectors(); drawLst();
  $('#hz').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.hz = b.dataset.v; st.sort = null; $$('#hz button').forEach((x) => x.classList.toggle('on', x === b)); save(); drawLst(); draw(); });
  $('#lst').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; st.list = b.dataset.v; st.sort = null; drawLst(); save(); draw(); });
  $('#sec').addEventListener('change', (e) => { st.sec = e.target.value; save(); draw(); });
  $('#liq').addEventListener('change', (e) => { st.liq = +e.target.value; save(); draw(); });
  $('#flt').addEventListener('input', (e) => { st.q = e.target.value.trim().toUpperCase(); draw(); });
  $('#chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; const k = b.dataset.k; st.chips = st.chips.includes(k) ? st.chips.filter((x) => x !== k) : [...st.chips, k]; b.classList.toggle('on'); b.setAttribute('aria-pressed', st.chips.includes(k)); save(); draw(); });
  $('#tbl').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-k]'); if (th) { const k = th.dataset.k; st.dir = st.sort === k ? -st.dir : -1; st.sort = k; draw(); return; }
    const tr = e.target.closest('tr[data-sym]'); if (tr) location.hash = '#/ma/' + tr.dataset.sym;
  });
  $('#tbl').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const tr = e.target.closest('tr[data-sym]'); if (tr) location.hash = '#/ma/' + tr.dataset.sym; } });
  $('#more').addEventListener('click', (e) => { if (e.target.closest('button')) { st.limit += 60; draw(); } });
  draw();
}

function drawLst() {
  const el = $('#lst'); if (!el) return; const B = st.hz === 'bottom';
  el.innerHTML = [['top', B ? 'Đang tạo đáy / đảo chiều' : 'Tiềm năng'], ['bottom', B ? 'Còn đang rơi' : 'Cần thận trọng'], ['all', 'Tất cả']].map(([v, l]) => `<button data-v="${v}" class="${st.list === v ? 'on' : ''}">${l}</button>`).join('');
  $('#intro').textContent = B
    ? 'Những mã đã giảm sâu (cách đỉnh 52 tuần từ 20% trở lên, hoặc nằm dưới MA200). Điểm cao nghĩa là bên bán đã cạn, dòng tiền bắt đầu gom, định giá rẻ và doanh nghiệp vẫn ổn. Dư địa tính tới mức hồi Fibonacci 38,2% của con sóng giảm.'
    : 'Toàn bộ cổ phiếu HOSE được chấm điểm 0–100 cho từng khung thời gian. Trên 60 là tích cực, dưới 45 là tiêu cực. Mã đã tăng quá nóng bị trừ điểm vì dư địa còn ít. Bấm vào một mã để xem lý do chi tiết.';
}

function fillSectors() {
  const S = store.state; const el = $('#sec'); if (!el) return;
  const opts = Object.entries(S.secNames).sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  el.innerHTML = '<option value="">Tất cả ngành</option>' + opts.map(([c, n]) => `<option value="${c}" ${String(st.sec) === c ? 'selected' : ''}>${esc(n)}</option>`).join('');
}

function rowsFiltered() {
  const S = store.state; const R = S.result; if (!R) return [];
  let rows = Object.values(R.rows);
  if (st.sec) rows = rows.filter((r) => String(S.secOf[r.sym]) === String(st.sec));
  if (st.liq) rows = rows.filter((r) => r.avgVal20 >= st.liq);
  if (st.q) rows = rows.filter((r) => r.sym.includes(st.q));
  for (const k of st.chips) { const c = CHIPS.find((x) => x.k === k); if (c) rows = rows.filter(c.test); }
  if (st.hz === 'bottom') {
    rows = rows.filter((r) => r.bottom);
    if (st.list === 'top') rows = rows.filter((r) => r.bottom.stage.key !== 'falling' && r.bottom.score >= 55);
    if (st.list === 'bottom') rows = rows.filter((r) => r.bottom.stage.key === 'falling');
  } else {
    if (st.list === 'top') rows = rows.filter((r) => r[st.hz].score >= 55);
    if (st.list === 'bottom') rows = rows.filter((r) => r[st.hz].score <= 45);
  }
  const key = st.sort || (st.hz === 'bottom' ? 'bscore' : st.hz); const dir = st.sort ? st.dir : st.list === 'bottom' && st.hz !== 'bottom' ? 1 : -1;
  const val = (r) => (['short', 'mid', 'long'].includes(key) ? r[key].score : key === 'bscore' ? r.bottom?.score ?? -1 : key === 'dd' ? -(r.bottom?.drawdown ?? 0) : key === 'up382' ? r.bottom?.upside382 ?? -1 : key === 'fromLow' ? -(r.bottom?.fromLow ?? 0) : key === 'rr' ? (r.plan?.[phz()]?.stop ? r.plan[phz()].rr1 + (r.plan[phz()].valid ? 100 : 0) : -1) : key === 'toprisk' ? r.top?.score ?? 0 : key === 'sym' ? r.sym : r[key] ?? -Infinity);
  rows.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir; });
  return rows;
}

function draw() {
  if (!root) return;
  const S = store.state; const R = S.result;
  const p = S.progress;
  $('#status').innerHTML = !R ? `<div class="glass loading" style="margin-bottom:14px"><span class="spin"></span><span>${esc(p.phase)}${p.total ? `: ${p.done}/${p.total} mã` : '…'}</span>${p.total ? `<span class="track"><i style="width:${(100 * p.done) / p.total}%"></i></span>` : ''}</div>`
    : p.total && p.done < p.total ? `<div class="glass loading" style="margin-bottom:14px"><span class="spin"></span><span>Đang tải thêm lịch sử giá: ${p.done}/${p.total} mã — bảng sẽ tự cập nhật</span><span class="track"><i style="width:${(100 * p.done) / p.total}%"></i></span></div>` : '';
  if (!R) { $('#tbl').innerHTML = '<div class="skeleton" style="height:420px;margin:14px"></div>'; return; }
  const rows = rowsFiltered(); const shown = rows.slice(0, st.limit);
  const th = (k, l, r = true, title = '') => `<th class="sort ${r ? 'r' : ''} ${(st.sort || st.hz) === k ? 'sorted' : ''}" data-k="${k}" ${title ? `title="${title}"` : ''}>${l}</th>`;
  const tagHTML = (r) => r.tags.filter((t) => t.kind !== 'neutral' || t.k === 'top').slice(0, 3).map((t) => `<span class="pill ${t.kind}">${esc(t.label)}</span>`).join('');
  const planTd = (r) => { const P = r.plan?.[phz()]; if (!P || !P.stop) return `<td class="faint" style="font-size:.78rem">${esc(P?.setup === 'none' && /giảm/.test(P.label) ? 'Đứng ngoài' : 'Chờ')}</td>`;
    return `<td title="${esc(P.label)} · vào ${fmtP(P.entryHi || P.entry)} · dừng lỗ ${fmtP(P.stop)} (−${P.riskPct.toFixed(1)}%) · mục tiêu ${fmtP(P.t1)}"><div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><span class="pill ${P.valid ? 'bull' : P.setup === 'wait' ? 'bear' : 'ghost'}">${P.rr1.toFixed(1)}R</span><span class="faint" style="font-size:.74rem">${esc({ breakout: 'Breakout', pullback: 'Điều chỉnh', reversal: 'Đảo chiều', wait: 'Chờ về TB' }[P.setup] || '')}</span></div></td>`; };
  const symCell = (r) => `<td><div class="sym">${avatar(r.sym)}<div style="min-width:0"><div class="tk">${r.sym}</div><div class="nm">${esc(S.names[r.sym] || S.secNames[S.secOf[r.sym]] || '')}</div></div></div></td>`;
  if (st.hz === 'bottom') {
    const stageCls = { falling: 'bear', basing: 'neutral', turning: 'bull' };
    const bcell = (b) => scoreCell({ score: b.score, verdict: { key: b.score >= 75 ? 'vpos' : b.score >= 60 ? 'pos' : b.score > 45 ? 'neu' : b.score > 30 ? 'neg' : 'vneg', label: '' } });
    $('#tbl').innerHTML = rows.length ? `<table><thead><tr><th class="r">#</th>${th('sym', 'Mã', false)}${th('price', 'Giá')}${th('chg', '% hôm nay')}<th>60 phiên</th>${th('bscore', 'Điểm vùng đáy')}<th>Giai đoạn</th>${th('dd', 'Từ đỉnh 52T')}${th('fromLow', 'Từ đáy 52T')}${th('up382', 'Dư địa hồi', true, 'Tới mức Fibonacci 38,2% của con sóng giảm')}${th('mid', 'Trung hạn')}${th('rr', 'Kế hoạch', false, 'R:R tới mục tiêu 1 của kế hoạch trung hạn')}${th('avgVal20', 'GTGD TB20')}<th>Lý do chính</th></tr></thead>
      <tbody>${shown.map((r, i) => `<tr class="click" data-sym="${r.sym}" tabindex="0"><td class="r faint num">${i + 1}</td>${symCell(r)}
        <td class="r num"><b>${fmtP(r.price)}</b></td><td class="r num ${cls(r.chg)}">${fmtPct(r.chg)}</td><td>${spark(r.spark)}</td>
        <td class="r">${bcell(r.bottom)}</td><td><span class="pill ${stageCls[r.bottom.stage.key]}">${esc(r.bottom.stage.label)}</span></td>
        <td class="r num down">${fmtPct(r.bottom.drawdown, 0)}</td><td class="r num">+${Math.round(r.bottom.fromLow)}%</td><td class="r num up">${r.bottom.upside382 > 0 ? '+' + Math.round(r.bottom.upside382) + '%' : '—'}</td>
        <td class="r">${scoreCell(r.mid, true)}</td>${planTd(r)}<td class="r num dim">${fmtTy(r.avgVal20)}</td>
        <td style="white-space:normal;min-width:220px;max-width:300px;font-size:.8rem" class="dim">${esc(r.bottom.top.filter((x) => x.impact > 0)[0]?.text || r.bottom.top[0]?.text || '')}</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty"><h3>Không có mã nào khớp bộ lọc</h3><p>Thử chọn “Tất cả”, bỏ bớt tín hiệu hoặc hạ ngưỡng thanh khoản.</p></div>`;
    $('#more').innerHTML = rows.length > st.limit ? `<button class="btn ghost">Xem thêm ${Math.min(60, rows.length - st.limit)} mã (còn ${rows.length - st.limit})</button>` : rows.length ? `<span class="faint" style="font-size:.8rem">${rows.length} mã trong vùng đáy</span>` : '';
    return;
  }
  $('#tbl').innerHTML = rows.length ? `<table><thead><tr><th class="r">#</th>${th('sym', 'Mã', false)}${th('price', 'Giá')}${th('chg', '% hôm nay')}<th>60 phiên</th>${th('short', 'Ngắn hạn')}${th('mid', 'Trung hạn')}${th('long', 'Dài hạn')}${th('rs', 'RS', true, 'Sức mạnh giá so với toàn sàn, 1–99')}${th('rr', 'Kế hoạch', false, 'R:R tới mục tiêu 1 của kế hoạch theo khung đang chọn · xanh = đạt chuẩn')}${th('avgVal20', 'GTGD TB20')}<th>Tín hiệu</th></tr></thead>
    <tbody>${shown.map((r, i) => `<tr class="click" data-sym="${r.sym}" tabindex="0"><td class="r faint num">${i + 1}</td>
      <td><div class="sym">${avatar(r.sym)}<div style="min-width:0"><div class="tk">${r.sym}</div><div class="nm">${esc(S.names[r.sym] || S.secNames[S.secOf[r.sym]] || '')}</div></div></div></td>
      <td class="r num"><b>${fmtP(r.price)}</b></td><td class="r num ${cls(r.chg)}">${fmtPct(r.chg)}</td><td>${spark(r.spark)}</td>
      <td class="r">${scoreCell(r.short, st.hz !== 'short')}</td><td class="r">${scoreCell(r.mid, st.hz !== 'mid')}</td><td class="r">${scoreCell(r.long, st.hz !== 'long')}</td>
      <td class="r num">${Math.round(r.rs)}</td>${planTd(r)}<td class="r num dim">${fmtTy(r.avgVal20)}</td><td><div class="tags">${tagHTML(r)}</div></td></tr>`).join('')}</tbody></table>`
    : `<div class="empty"><h3>Không có mã nào khớp bộ lọc</h3><p>Thử bỏ bớt tín hiệu đã chọn, hạ ngưỡng thanh khoản hoặc chọn “Tất cả”.</p></div>`;
  $('#more').innerHTML = rows.length > st.limit ? `<button class="btn ghost">Xem thêm ${Math.min(60, rows.length - st.limit)} mã (còn ${rows.length - st.limit})</button>` : rows.length ? `<span class="faint" style="font-size:.8rem">${rows.length} mã · cập nhật ${new Date(R.at).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' })}</span>` : '';
}

export default {
  render,
  update(what) { if (what === 'meta') fillSectors(); if (['result', 'progress', 'error', 'meta'].includes(what)) draw(); },
  destroy() { root = null; },
};
