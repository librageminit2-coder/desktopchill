// Trang Duyệt (chỉ quản trị viên): chấp thuận / từ chối / khóa tài khoản.
import * as auth from '../auth.js?v=5f446a77';
import { $, esc, ico, toast, modal } from '../ui/util.js?v=70d78725';

let root = null, users = null, err = null, filter = 'pending';
const ST = { pending: ['Chờ duyệt', 'neutral'], approved: ['Đã duyệt', 'bull'], rejected: ['Từ chối', 'bear'], blocked: ['Đã khóa', 'bear'] };

async function load() {
  try { users = await auth.admin.users(); err = null; } catch (e) { err = e.message; }
  draw(); window.dispatchEvent(new Event('pending-changed'));
}
function draw() {
  if (!root) return;
  const el = $('#ul');
  if (err) { el.innerHTML = `<div class="note-bar err">${ico('alert')}<div>${esc(err)}</div></div>`; return; }
  if (!users) return;
  const counts = Object.fromEntries(Object.keys(ST).map((k) => [k, users.filter((u) => u.status === k).length]));
  $('#flt').innerHTML = [['pending', 'Chờ duyệt'], ['approved', 'Đã duyệt'], ['all', 'Tất cả']].map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l}${k !== 'all' ? ` (${counts[k] || 0})` : ` (${users.length})`}</button>`).join('');
  const list = users.filter((u) => filter === 'all' || u.status === filter);
  const d = (x) => (x ? new Date(x).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }) : '—');
  el.innerHTML = list.length ? `<div class="table-wrap glass"><table><thead><tr><th>Người đăng ký</th><th>Lời nhắn</th><th>Đăng ký lúc</th><th>Trạng thái</th><th>Đăng nhập gần nhất</th><th class="r">Nhận định</th><th class="r">Thao tác</th></tr></thead><tbody>
    ${list.map((u) => `<tr><td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="pill ghost">Quản trị</span>' : ''}<br><span class="faint" style="font-size:.8rem">${esc(u.email)}</span></td>
      <td style="white-space:normal;max-width:280px" class="dim">${esc(u.note || '—')}</td><td class="dim num">${d(u.created_at)}</td>
      <td><span class="pill ${ST[u.status][1]}">${ST[u.status][0]}</span></td><td class="dim num">${d(u.last_login)}</td><td class="r num">${u.notes}</td>
      <td class="r">${u.role === 'admin' ? '' : `<div style="display:inline-flex;gap:6px">
        ${u.status !== 'approved' ? `<button class="btn ok sm" data-set="approved" data-id="${u.id}">${ico('check')}Duyệt</button>` : ''}
        ${u.status === 'pending' ? `<button class="btn no sm" data-set="rejected" data-id="${u.id}">Từ chối</button>` : ''}
        ${u.status === 'approved' ? `<button class="btn ghost sm" data-set="blocked" data-id="${u.id}">Khóa</button>` : ''}
        ${u.status !== 'pending' && u.status !== 'approved' ? `<button class="btn ghost sm" data-delu="${u.id}">${ico('trash')}Xóa</button>` : ''}</div>`}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="glass"><div class="empty"><h3>${filter === 'pending' ? 'Không có yêu cầu nào đang chờ' : 'Chưa có tài khoản'}</h3><p>Khi có người đăng ký, email thông báo sẽ gửi tới hộp thư quản trị và yêu cầu hiện ở đây.</p></div></div>`;
}

export default {
  render(main) {
    root = main;
    main.innerHTML = `<div class="page-title"><div><h1>Duyệt tài khoản</h1><p>Người đăng ký chỉ đăng nhập được sau khi bạn bấm Duyệt. Khóa hoặc từ chối sẽ đăng xuất họ khỏi mọi thiết bị.</p></div>
      <div style="display:flex;gap:10px;align-items:center"><div class="seg sm" id="flt"></div><button class="icon-btn" id="rl" aria-label="Tải lại">${ico('refresh')}</button></div></div><div id="ul"><div class="glass loading"><span class="spin"></span>Đang tải danh sách…</div></div>`;
    $('#flt').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { filter = b.dataset.f; draw(); } });
    $('#rl').addEventListener('click', load);
    main.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-set]');
      if (b) {
        b.disabled = true;
        try { await auth.admin.set(+b.dataset.id, b.dataset.set); toast(b.dataset.set === 'approved' ? 'Đã duyệt tài khoản' : b.dataset.set === 'blocked' ? 'Đã khóa tài khoản' : 'Đã từ chối yêu cầu'); await load(); }
        catch (er) { toast(er.message, 'err'); b.disabled = false; }
      }
      const dlt = e.target.closest('[data-delu]');
      if (dlt) {
        const u = users.find((x) => x.id === +dlt.dataset.delu);
        const okk = await modal({ title: 'Xóa tài khoản?', body: `<p class="dim">Xóa vĩnh viễn ${esc(u.email)} và ${u.notes} nhận định đã lưu của họ.</p>`, actions: [{ label: 'Giữ lại' }, { label: 'Xóa', kind: 'no', run: () => auth.admin.remove(u.id) }] });
        if (okk) { toast('Đã xóa tài khoản'); load(); }
      }
    });
    load();
  },
  destroy() { root = null; },
};
