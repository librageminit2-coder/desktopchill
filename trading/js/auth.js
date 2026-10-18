// Tài khoản: gọi các hàm RPC trên Supabase (không dùng Supabase Auth để không phụ thuộc giới hạn email của Supabase).
import { SB_URL, SB_ANON, NOTIFY_URL, SITE_URL } from './config.js?v=1704ec5b';

const KEY = 'dct_session';
let session = null;
try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { session = null; }
export const getSession = () => session;
function setSession(s) { session = s; try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) {} }

export async function rpc(fn, body) {
  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON }, body: JSON.stringify(body) });
  } catch (e) { throw new Error('Không kết nối được máy chủ tài khoản. Kiểm tra mạng rồi thử lại.'); }
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 404) throw new Error('Máy chủ tài khoản chưa được cài đặt (thiếu bảng trading_* trên Supabase).');
  if (!r.ok) throw new Error((j && j.message) || 'Máy chủ đang bận, thử lại sau.');
  return j;
}

const MSG = {
  bademail: 'Email chưa đúng định dạng.', badname: 'Tên cần 2–60 ký tự.', badpass: 'Mật khẩu chưa đúng.', taken: 'Email này đã được đăng ký.',
  busy: 'Đang có nhiều yêu cầu đăng ký, thử lại sau ít phút.', nouser: 'Chưa có tài khoản với email này.', locked: 'Nhập sai nhiều lần — tài khoản tạm khóa 15 phút.',
  pending: 'Tài khoản đang chờ duyệt. Bạn sẽ đăng nhập được ngay khi quản trị viên chấp thuận.', rejected: 'Yêu cầu đăng ký chưa được chấp thuận.',
  blocked: 'Tài khoản đã bị khóa.', session: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.', weak: 'Mật khẩu mới cần ít nhất 8 ký tự.', forbidden: 'Chỉ quản trị viên mới thực hiện được.',
};
export const errText = (code) => MSG[code] || 'Có lỗi xảy ra (' + code + ').';

export async function register({ email, name, password, note }) {
  const j = await rpc('trading_register', { p_email: email, p_name: name, p_password: password, p_note: note || null });
  if (!j?.ok) throw new Error(j?.error === 'badpass' ? 'Mật khẩu cần ít nhất 8 ký tự.' : errText(j?.error));
  // báo cho quản trị viên qua email (không chặn nếu lỗi — trang Duyệt vẫn hiện yêu cầu)
  notifyAdmin({ email, name, note }).catch(() => {});
  return j;
}
async function notifyAdmin({ email, name, note }) {
  const when = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  await fetch(NOTIFY_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ _subject: `[Desktopchill Trading] Yêu cầu tài khoản mới: ${name}`, _template: 'table', _captcha: 'false',
      'Họ tên': name, Email: email, 'Lời nhắn': note || '(không có)', 'Thời gian': when, 'Duyệt tại': SITE_URL + '#/duyet' }),
  });
}

export async function login(email, password) {
  const j = await rpc('trading_login', { p_email: email, p_password: password });
  if (!j?.ok) throw new Error(errText(j?.error));
  setSession({ token: j.token, user: j.user, checked: Date.now() });
  return j.user;
}
export async function me() {
  if (!session) return null;
  let r;
  try {
    r = await fetch(`${SB_URL}/rest/v1/rpc/trading_me`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON }, body: JSON.stringify({ p_token: session.token }) });
  } catch (e) {
    // mất mạng: chỉ cho vào nếu phiên đã được máy chủ xác nhận trong 3 ngày gần đây
    return session.checked && Date.now() - session.checked < 3 * 86400000 ? session.user : null;
  }
  const j = r.ok ? await r.json().catch(() => null) : null;
  if (!j?.ok) { setSession(null); return null; }
  setSession({ ...session, user: j.user, checked: Date.now() }); return j.user;
}
export async function logout() { const s = session; setSession(null); if (s) try { await rpc('trading_logout', { p_token: s.token }); } catch (e) {} }
export async function changePassword(oldP, newP) {
  const j = await rpc('trading_change_password', { p_token: session.token, p_old: oldP, p_new: newP });
  if (!j?.ok) throw new Error(errText(j?.error)); return true;
}

async function authed(fn, body) {
  const j = await rpc(fn, { p_token: session?.token, ...body });
  if (!j?.ok) { if (j?.error === 'session') { setSession(null); location.reload(); } throw new Error(errText(j?.error)); }
  return j;
}
export const notes = {
  list: async () => (await authed('trading_notes_list', {})).notes,
  save: (n) => authed('trading_note_save', { p_symbol: n.symbol, p_price: n.price, p_idx_price: n.idxPrice, p_data: n.data, p_note: n.note || null }),
  update: (id, note) => authed('trading_note_update', { p_id: id, p_note: note }),
  remove: (id) => authed('trading_note_delete', { p_id: id }),
};
export const admin = {
  users: async () => (await authed('trading_admin_users', {})).users,
  set: (id, status) => authed('trading_admin_set', { p_user_id: id, p_status: status }),
  remove: (id) => authed('trading_admin_delete', { p_user_id: id }),
};
