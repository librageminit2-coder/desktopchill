// Trang Đã lưu: nhận định đã lưu, so với diễn biến giá thực tế và VN-Index cùng kỳ.
import * as store from '../data/store.js';
import * as auth from '../auth.js';
import { $, esc, ico, fmtP, fmtPct, cls, avatar, toast, modal, HZ, HZ_SUB } from '../ui/util.js';

const WIN = { short: 10, mid: 60, long: 250 };
let root = null, notes = null, err = null, open = {};

function render(main) {
  root = main; notes = null; err = null;
  main.innerHTML = `<div class="page-title"><div><h1>Nhận định đã lưu</h1><p>Mỗi nhận định được chấm đúng/sai khi đủ thời gian của khung: ngắn hạn 10 phiên, trung hạn 60 phiên, dài hạn 250 phiên. Nhận định tích cực được tính là đúng khi mã tăng và vượt VN-Index cùng kỳ; tiêu cực là đúng khi mã giảm và kém VN-Index.</p></div></div>
    <div id="sum"></div><div id="list"><div class="glass loading"><span class="spin"></span>Đang tải nhận định của bạn…</div></div>`;
  main.addEventListener('click', onClick);
  load();
}
async function load() {
  try { notes = await auth.notes.list(); err = null; } catch (e) { err = e.message; }
  // tải lịch sử cho các mã đã lưu (nếu chưa có) để chấm điểm chính xác
  if (notes) for (const s of [...new Set(notes.map((n) => n.symbol))]) if (!store.state.bars[s]) store.barsOf(s).then(draw).catch(() => {});
  draw();
}

function evalNote(n) {
  const S = store.state; const bars = S.bars[n.symbol]; const idx = S.index;
  const savedT = Math.floor(new Date(n.created_at).getTime() / 1000 + 7 * 3600) / 86400 | 0; // ngày VN
  const savedDay = savedT * 86400;
  const now = bars?.length ? bars[bars.length - 1].c : S.board[n.symbol]?.price;
  const after = bars ? bars.filter((b) => b.t > savedDay) : [];
  const idxAfter = idx.filter((b) => b.t > savedDay);
  const idxNow = S.idxLive?.price || idx[idx.length - 1]?.c;
  const out = { now, ret: now ? (now / n.price - 1) * 100 : NaN, idxRet: idxNow && n.idx_price ? (idxNow / n.idx_price - 1) * 100 : NaN, elapsed: after.length, hz: {} };
  for (const hz of ['short', 'mid', 'long']) {
    const d = n.data?.[hz]; if (!d) continue; const w = WIN[hz];
    if (after.length >= w) {
      const end = after[w - 1].c; const r = (end / n.price - 1) * 100;
      const ie = idxAfter[Math.min(w, idxAfter.length) - 1]?.c; const ri = ie && n.idx_price ? (ie / n.idx_price - 1) * 100 : 0;
      let res = 'neutral';
      if (d.score >= 60) res = r > 0 && r > ri ? 'right' : 'wrong';
      else if (d.score <= 45) res = r < 0 && r < ri ? 'right' : 'wrong';
      out.hz[hz] = { done: true, r, ri, res };
    } else out.hz[hz] = { done: false, k: after.length, w };
  }
  return out;
}

function draw() {
  if (!root) return;
  if (err) { $('#list').innerHTML = `<div class="note-bar err">${ico('alert')}<div>${esc(err)}</div></div>`; return; }
  if (!notes) return;
  if (!notes.length) { $('#sum').innerHTML = ''; $('#list').innerHTML = `<div class="glass"><div class="empty"><h3>Chưa có nhận định nào</h3><p>Mở một mã bất kỳ và bấm “Lưu nhận định” để ghi lại đánh giá lúc này, rồi quay lại đây để xem kết quả.</p><a class="btn primary" href="#/co-hoi">Xem danh sách cơ hội</a></div></div>`; return; }
  const E = notes.map((n) => ({ n, e: evalNote(n) }));
  // tổng kết
  const sum = {}; for (const hz of ['short', 'mid', 'long']) { const d = E.map((x) => x.e.hz[hz]).filter((x) => x?.done && x.res !== 'neutral'); sum[hz] = { n: d.length, ok: d.filter((x) => x.res === 'right').length, open: E.filter((x) => x.e.hz[hz] && !x.e.hz[hz].done).length }; }
  $('#sum').innerHTML = `<div class="kpis" style="margin-bottom:16px">${['short', 'mid', 'long'].map((hz) => `<div class="glass kpi"><div class="l">${HZ[hz]} · ${HZ_SUB[hz]}</div><div class="v num">${sum[hz].n ? Math.round((100 * sum[hz].ok) / sum[hz].n) + '%' : '—'}</div><div class="s">${sum[hz].n ? `${sum[hz].ok}/${sum[hz].n} nhận định đúng` : 'Chưa có nhận định đủ thời gian'} · ${sum[hz].open} đang theo dõi</div></div>`).join('')}<div class="glass kpi"><div class="l">Tổng số đã lưu</div><div class="v num">${notes.length}</div><div class="s">${new Set(notes.map((x) => x.symbol)).size} mã khác nhau</div></div></div>`;
  const badge = (h, d) => {
    if (!d) return '<span class="faint">—</span>';
    const sc = `<span class="score s-${d.key}" style="min-width:0"><b class="num">${Math.round(d.score)}</b></span>`;
    const wrap = (x) => `<div style="display:flex;align-items:center;gap:8px">${x}</div>`;
    if (!h) return sc;
    return wrap(inner());
    function inner() {
    if (!h.done) return `${sc} <span class="pill ghost" title="Đủ ${h.w} phiên sẽ chấm đúng/sai">${ico('clock', 'style="width:12px;height:12px"')}${h.k}/${h.w}</span>`;
    if (h.res === 'neutral') return `${sc} <span class="pill neutral" title="Nhận định trung tính không chấm đúng/sai">${fmtPct(h.r, 1)}</span>`;
    return `${sc} <span class="pill ${h.res === 'right' ? 'bull' : 'bear'}" title="Mã ${fmtPct(h.r, 1)} · VN-Index ${fmtPct(h.ri, 1)}">${h.res === 'right' ? 'Đúng' : 'Sai'} ${fmtPct(h.r, 1)}</span>`;
    }
  };
  $('#list').innerHTML = `<div class="table-wrap glass"><table><thead><tr><th>Mã</th><th>Ngày lưu</th><th class="r">Giá lúc lưu</th><th class="r">Giá nay</th><th class="r">Thay đổi</th><th class="r">VN-Index cùng kỳ</th><th>Ngắn hạn</th><th>Trung hạn</th><th>Dài hạn</th><th>Ghi chú</th><th></th></tr></thead><tbody>
    ${E.map(({ n, e }) => `<tr data-id="${n.id}" class="click" data-open="${n.id}">
      <td><div class="sym">${avatar(n.symbol)}<div><div class="tk">${n.symbol}</div><div class="nm">${esc(n.data?.name || store.state.names[n.symbol] || '')}</div></div></div></td>
      <td class="num dim">${new Date(n.created_at).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}<br><span class="faint" style="font-size:.74rem">${e.elapsed} phiên trước</span></td>
      <td class="r num">${fmtP(+n.price)}</td><td class="r num"><b>${fmtP(e.now)}</b></td><td class="r num ${cls(e.ret)}"><b>${fmtPct(e.ret, 1)}</b></td><td class="r num ${cls(e.idxRet)}">${fmtPct(e.idxRet, 1)}</td>
      <td>${badge(e.hz.short, n.data?.short)}</td><td>${badge(e.hz.mid, n.data?.mid)}</td><td>${badge(e.hz.long, n.data?.long)}</td>
      <td style="white-space:normal;min-width:180px;max-width:260px;font-size:.82rem" class="dim">${esc(n.note || '')}</td>
      <td class="r"><button class="icon-btn" data-edit="${n.id}" aria-label="Sửa ghi chú">${ico('edit')}</button> <button class="icon-btn" data-del="${n.id}" aria-label="Xóa nhận định">${ico('trash')}</button></td></tr>
      ${open[n.id] ? `<tr><td colspan="11" style="white-space:normal;background:color-mix(in srgb,var(--surface-solid) 30%,transparent)">${detail(n)}</td></tr>` : ''}`).join('')}
  </tbody></table></div>`;
}
function detail(n) {
  const cur = store.state.result?.rows?.[n.symbol];
  const col = (hz) => { const d = n.data?.[hz]; if (!d) return ''; const c = cur?.[hz];
    return `<div><div style="font-weight:800;margin-bottom:6px">${HZ[hz]}: <span class="s-${d.key}" style="color:var(--sc)">${esc(d.verdict)} (${Math.round(d.score)})</span>${c ? ` → nay <span class="${'s-' + c.verdict.key}" style="color:var(--sc)">${esc(c.verdict.label)} (${Math.round(c.score)})</span>` : ''}</div>
      <ul style="list-style:none;display:grid;gap:4px;font-size:.82rem" class="dim">${(d.reasons || []).map((r) => `<li><span class="${r.i > 0 ? 'up' : r.i < 0 ? 'down' : 'faint'}" style="font-weight:800">${r.i > 0 ? '+' : ''}${r.i}</span> ${esc(r.t)}</li>`).join('')}</ul></div>`; };
  return `<div class="grid g-3" style="padding:8px 4px">${col('short')}${col('mid')}${col('long')}</div>
    <p class="faint" style="font-size:.78rem;padding:0 4px 6px">Lúc lưu: thị trường ${esc(n.data?.market?.phase || '—')}${n.data?.sup ? ` · hỗ trợ ${fmtP(n.data.sup)}` : ''}${n.data?.res ? ` · kháng cự ${fmtP(n.data.res)}` : ''}${n.data?.patterns?.length ? ` · mô hình: ${esc(n.data.patterns.join(', '))}` : ''} · <a href="#/ma/${n.symbol}" style="color:var(--accent);font-weight:700">Mở trang ${n.symbol}</a></p>`;
}

async function onClick(e) {
  const del = e.target.closest('[data-del]'), ed = e.target.closest('[data-edit]');
  if (del) {
    e.stopPropagation(); const id = +del.dataset.del; const n = notes.find((x) => x.id === id);
    const okk = await modal({ title: 'Xóa nhận định?', body: `<p class="dim">Nhận định ${n.symbol} lưu ngày ${new Date(n.created_at).toLocaleDateString('vi-VN')} sẽ bị xóa vĩnh viễn.</p>`, actions: [{ label: 'Giữ lại' }, { label: 'Xóa', kind: 'no', run: async () => { await auth.notes.remove(id); } }] });
    if (okk) { notes = notes.filter((x) => x.id !== id); draw(); toast('Đã xóa nhận định'); }
    return;
  }
  if (ed) {
    e.stopPropagation(); const id = +ed.dataset.edit; const n = notes.find((x) => x.id === id);
    const okk = await modal({ title: `Ghi chú cho ${n.symbol}`, body: `<textarea class="input" id="en" maxlength="1000">${esc(n.note || '')}</textarea>`, actions: [{ label: 'Hủy' }, { label: 'Lưu ghi chú', kind: 'primary', run: async (el) => { const v = $('#en', el).value.trim(); await auth.notes.update(id, v); n.note = v; } }] });
    if (okk) { draw(); toast('Đã lưu ghi chú'); }
    return;
  }
  const tr = e.target.closest('[data-open]'); if (tr) { const id = tr.dataset.open; open[id] = !open[id]; draw(); }
}

export default {
  render,
  update(what) { if (['result', 'board', 'index'].includes(what) && notes) draw(); },
  destroy() { root?.removeEventListener('click', onClick); root = null; },
};
