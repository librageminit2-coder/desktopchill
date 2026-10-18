// Trang Kịch bản: nếu thị trường tăng/giảm thì ngành & mã nào phản ứng trước — rút ra từ chính các nhịp của VN-Index
// trong ~2 năm qua, kết hợp tín hiệu kỹ thuật hiện tại và kinh nghiệm luân chuyển ngành ở Mỹ, Trung Quốc.
import * as store from '../data/store.js?v=569ff4be';
import { $, esc, ico, fmtIdx, fmtPct, avatar, dateVN, cls } from '../ui/util.js?v=70d78725';

let root = null, lastAt = 0;

const LESSONS = [
  { t: 'Mỹ — luân chuyển ngành theo chu kỳ', d: 'Ở giai đoạn đầu của chu kỳ phục hồi, nhóm tài chính, tiêu dùng không thiết yếu, công nghiệp, bất động sản và công nghệ thường dẫn dắt vì nhạy với lãi suất và kỳ vọng tăng trưởng. Khi thị trường suy yếu, tiện ích, y tế và tiêu dùng thiết yếu giữ giá tốt hơn nhờ dòng tiền ổn định.' },
  { t: 'Trung Quốc — chứng khoán đi trước', d: 'Trong các đợt tăng do chính sách nới lỏng (2014–2015, cuối 9/2024), cổ phiếu công ty chứng khoán thường tăng trần đầu tiên vì hưởng lợi trực tiếp từ thanh khoản và margin; ngân hàng, bất động sản theo sau. Khi thị trường đảo chiều, chính nhóm này và các mã dùng nhiều margin giảm mạnh nhất.' },
  { t: 'Việt Nam — beta cao dẫn sóng', d: 'Nhóm chứng khoán có độ nhạy với thị trường cao nhất, thường dẫn sóng hồi và cũng giảm trước. Ngân hàng, thép, bất động sản nhạy với lãi suất và tín dụng. Tiện ích (điện, nước, khí), dược và tiêu dùng thiết yếu thường là nơi trú ẩn khi thị trường xấu.' },
];

function secRow(s, good) {
  const v = good ? s.upScore : s.downScore; const er = good ? s.earlyUp : s.earlyDown; const cap = good ? s.upCap : s.downCap;
  const picks = good ? s.upPicks : s.downPicks;
  return `<div class="li"><div style="min-width:0"><div class="t">${esc(s.name)}</div>
    <div class="d">${Number.isFinite(er) ? `10 phiên đầu nhịp ${good ? 'hồi' : 'giảm'}: ${er >= 0 ? '+' : ''}${er.toFixed(1)}% so với VN-Index` : ''}${Number.isFinite(cap) ? ` · ${good ? 'tăng' : 'giảm'} ${cap.toFixed(1)}× chỉ số` : ''}</div>
    <div class="tags" style="margin-top:6px">${picks.map((p) => `<button class="pill ghost" data-sym="${p}">${p}</button>`).join('')}</div></div>
    <div class="v"><span class="score ${good ? 's-pos' : 's-neg'}"><span class="bar"><i style="width:${v}%"></i></span><b class="num">${Math.round(v)}</b></span></div></div>`;
}
function stockRow(x, good, S) {
  const row = S.result?.rows?.[x.sym];
  return `<div class="li click" data-sym="${x.sym}"><div style="display:flex;gap:10px;align-items:flex-start;min-width:0">${avatar(x.sym)}<div style="min-width:0">
      <div class="t">${x.sym} <span class="faint" style="font-weight:500;font-size:.76rem">${esc(S.secNames[x.sec] || '')}</span></div>
      <div class="d" style="white-space:normal">${esc(x.why.join(' · '))}</div></div></div>
    <div class="v"><span class="score ${good ? 's-pos' : 's-neg'}"><span class="bar"><i style="width:${x.score}%"></i></span><b class="num">${Math.round(x.score)}</b></span>${row ? `<small class="${cls(row.chg)}">${fmtPct(row.chg)}</small>` : ''}</div></div>`;
}

function draw() {
  if (!root) return;
  const S = store.state, R = S.result; const sc = R?.scenario, m = R?.market;
  if (!sc) { $('#scn').innerHTML = `<div class="glass loading"><span class="spin"></span>${S.progress.total && S.progress.done < S.progress.total ? `Đang tải lịch sử giá ${S.progress.done}/${S.progress.total} mã — kịch bản cần đủ dữ liệu để tính` : 'Đang tính kịch bản…'}</div>`; return; }
  if (R.at === lastAt) return; lastAt = R.at;
  const tilt = m ? (m.score >= 57 ? { t: 'tích cực', c: 'up' } : m.score >= 44 ? { t: 'trung tính — chờ xác nhận', c: 'ref' } : { t: 'tiêu cực', c: 'down' }) : null;
  const trig = (arr) => arr.slice(0, 2).map((x) => `<b class="num">${fmtIdx(x.p)}</b> (${esc(x.label)})`).join(' rồi ');
  $('#scn').innerHTML = `
    <section class="glass panel" style="margin-bottom:16px">
      <div class="panel-h"><h2>Thị trường đang nghiêng về: <span class="${tilt?.c}">${esc(tilt?.t || '—')}</span></h2><span class="sub">${m ? `Điểm sức khỏe ${m.score}/100 · ${esc(m.phase)}` : ''}</span></div>
      <div class="grid g-2" style="gap:12px 30px">
        <p class="dim" style="font-size:.9rem">${ico('arrowUp', 'style="display:inline;width:15px;height:15px;color:var(--up);vertical-align:-2px"')} <b>Kịch bản tốt</b> được xác nhận khi VN-Index đóng cửa vượt ${sc.triggers.up.length ? trig(sc.triggers.up) : 'các đỉnh gần nhất'} với thanh khoản cao hơn trung bình 20 phiên.</p>
        <p class="dim" style="font-size:.9rem">${ico('arrowDown', 'style="display:inline;width:15px;height:15px;color:var(--down);vertical-align:-2px"')} <b>Kịch bản xấu</b> được xác nhận khi VN-Index thủng ${trig(sc.triggers.down)}, nhất là khi số ngày phân phối tiếp tục tăng.</p>
      </div>
    </section>
    <div class="grid g-2">
      <section class="glass panel"><div class="panel-h"><h2 class="up">Nếu thị trường tăng</h2><span class="sub">Ngành và mã có xu hướng tăng trước</span></div>
        <h3 style="font-size:.86rem;font-weight:800;margin:4px 0 2px" class="dim">Ngành hưởng lợi đầu tiên</h3>
        <div class="list">${sc.secUp.slice(0, 6).map((s) => secRow(s, true)).join('')}</div>
        <h3 style="font-size:.86rem;font-weight:800;margin:18px 0 2px" class="dim">Mã có khả năng tăng trước</h3>
        <div class="list">${sc.stockUp.slice(0, 12).map((x) => stockRow(x, true, S)).join('')}</div></section>
      <section class="glass panel"><div class="panel-h"><h2 class="down">Nếu thị trường giảm</h2><span class="sub">Ngành và mã có xu hướng giảm trước</span></div>
        <h3 style="font-size:.86rem;font-weight:800;margin:4px 0 2px" class="dim">Ngành chịu áp lực đầu tiên</h3>
        <div class="list">${sc.secDown.slice(0, 6).map((s) => secRow(s, false)).join('')}</div>
        <h3 style="font-size:.86rem;font-weight:800;margin:18px 0 2px" class="dim">Mã có khả năng giảm trước</h3>
        <div class="list">${sc.stockDown.slice(0, 12).map((x) => stockRow(x, false, S)).join('')}</div></section>
    </div>
    <section class="mt"><div class="panel-h" style="padding:0 4px"><h2>Các nhịp gần đây của VN-Index</h2><span class="sub">Nhịp được nhận diện khi chỉ số đảo chiều ≥ 6% · ngành dẫn đầu tính theo ${sc.H} phiên đầu</span></div>
      <div class="table-wrap glass"><table><thead><tr><th>Nhịp</th><th>Bắt đầu</th><th class="r">VN-Index ${sc.H} phiên đầu</th><th class="r">Cả nhịp</th><th>Ngành dẫn đầu</th></tr></thead><tbody>
        ${sc.history.map((h) => `<tr><td><span class="pill ${h.type === 'up' ? 'bull' : 'bear'}">${h.type === 'up' ? 'Hồi phục' : 'Điều chỉnh'}</span></td><td class="num dim">${dateVN(h.t)}${h.endT ? ' → ' + dateVN(h.endT) : ''}</td>
          <td class="r num ${cls(h.idxRet)}">${fmtPct(h.idxRet, 1)}</td><td class="r num ${cls(h.move)}">${Number.isFinite(h.move) ? fmtPct(h.move, 1) : '—'}</td>
          <td style="white-space:normal">${h.leaders.map((l) => `<span class="pill ghost" style="margin:2px">${esc(l.name)} <b class="${cls(l.r)}">${fmtPct(l.r, 1)}</b></span>`).join('')}</td></tr>`).join('')}
      </tbody></table></div></section>
    <section class="mt"><div class="panel-h" style="padding:0 4px"><h2>Kinh nghiệm từ thị trường khác</h2><span class="sub">Dùng để đối chiếu, không thay cho dữ liệu của chính VN-Index</span></div>
      <div class="grid g-3">${LESSONS.map((x) => `<article class="glass panel"><h3 style="font-weight:800;margin-bottom:6px">${esc(x.t)}</h3><p class="dim" style="font-size:.88rem">${esc(x.d)}</p></article>`).join('')}</div></section>
    <p class="faint" style="font-size:.78rem;margin-top:16px">Cách tính: điểm “tăng trước” = 40% mức vượt VN-Index trong ${sc.H} phiên đầu của ${sc.nEp.up} nhịp hồi gần nhất + 25% độ nhạy khi thị trường tăng (up-capture 250 phiên) + 35% tín hiệu kỹ thuật hiện tại (điểm ngắn/trung hạn, mô hình, dòng tiền). Điểm “giảm trước” tính tương tự với ${sc.nEp.down} nhịp giảm. Chỉ xét mã có GTGD trung bình ≥ 3 tỷ/phiên.</p>`;
}

export default {
  render(main) {
    root = main; lastAt = 0;
    main.innerHTML = `<div class="page-title"><div><h1>Kịch bản</h1><p>Thị trường có hai hướng đi. Trang này chuẩn bị sẵn cho cả hai: nếu tăng thì ngành và mã nào thường đi trước, nếu giảm thì ngành và mã nào thường giảm trước — dựa trên cách chúng phản ứng trong các nhịp của VN-Index khoảng 2 năm qua, kết hợp tín hiệu hiện tại.</p></div></div><div id="scn"></div>`;
    main.addEventListener('click', (e) => { const r = e.target.closest('[data-sym]'); if (r) location.hash = '#/ma/' + r.dataset.sym; });
    draw();
  },
  update(what) { if (['result', 'progress'].includes(what)) draw(); },
  destroy() { root = null; },
};
