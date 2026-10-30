// Tài khoản đơn giản: tên + mã PIN. Tiến trình lưu lên Supabase qua các hàm RPC.
// Sau khi đăng nhập, máy chủ cấp một "token phiên" để dùng cho bạn bè, lớp học và quiz (không gửi PIN mỗi lần).
import { S, absorb, onSave, replace } from './store.js?v=40';
const URL = 'https://phcmbgaozkaibqsttonc.supabase.co/rest/v1/rpc/';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY21iZ2FvemthaWJxc3R0b25jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzODk3NTgsImV4cCI6MjEwNDk2NTc1OH0.Hvs0Gxebog5gcKILnSdT3g6nz6-GI0CEepmMJM0gCxo';
const AKEY = 'dcl_account';
export let acct = null; // { name, pin, token, uid, code, avatar }
// "Remember me": bật thì lưu trong localStorage (mở lại web là vào luôn), tắt thì chỉ giữ tới khi đóng trình duyệt
try { acct = JSON.parse(localStorage.getItem(AKEY) || sessionStorage.getItem(AKEY) || 'null'); } catch (e) {}
export const sync = { state: acct ? 'idle' : 'off', at: 0 };
const listeners = new Set();
export const onSync = (f) => listeners.add(f);
const emit = () => listeners.forEach((f) => { try { f(sync); } catch (e) {} });

export async function rpc(fn, body) {
  let r;
  try { r = await fetch(URL + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify(body || {}) }); }
  catch (e) { throw new Error('No connection. Check your internet and try again.'); }
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 404) throw new Error('This feature is not ready on the server yet.');
  if (j && j.message === 'auth') { const e = new Error('Please sign in again.'); e.auth = true; throw e; }
  if (!r.ok) throw new Error('The server is busy. Please try again later.');
  return j;
}
const clean = (n) => (n || '').trim().replace(/\s+/g, ' ');
export function validName(n) { n = clean(n); return n.length >= 3 && n.length <= 24 && /^[\p{L}\p{N} ._-]+$/u.test(n); }
export const validPin = (p) => /^\d{4,6}$/.test(p || '');

function store() {
  try {
    localStorage.removeItem(AKEY); sessionStorage.removeItem(AKEY);
    if (acct) (acct.remember === false ? sessionStorage : localStorage).setItem(AKEY, JSON.stringify(acct));
  } catch (e) {}
}
function setAcct(a) { acct = a; store(); sync.state = a ? 'idle' : 'off'; emit(); }

export async function nameAvailable(name) {
  const j = await rpc('learn_name_available', { p_name: clean(name) });
  return !!(j && j.available);
}
// lấy token phiên từ tên + PIN đã lưu
async function auth() {
  if (!acct) throw new Error('Sign in first');
  const j = await rpc('learn_auth', { p_name: acct.name, p_pin: acct.pin });
  if (!j || !j.ok) {
    const m = { nouser: 'This account no longer exists.', badpin: 'Your PIN has changed. Please sign in again.', locked: 'Too many attempts. Try again in 10 minutes.', banned: 'This account has been suspended.' };
    if (j && (j.error === 'nouser' || j.error === 'badpin' || j.error === 'banned')) setAcct(null);
    throw new Error(m[j && j.error] || 'Could not sign in');
  }
  acct = { ...acct, token: j.token, uid: j.uid, code: j.code, avatar: j.avatar || acct.avatar || '', name: j.name || acct.name }; store(); emit();
  return acct.token;
}
export async function ensureToken() { if (!acct) return null; return acct.token || auth(); }
// gọi một hàm cần đăng nhập; tự xin token mới nếu token cũ hết hạn
export async function call(fn, body = {}) {
  if (!acct) { const e = new Error('Create an account or sign in to use this.'); e.noacct = true; throw e; }
  const tok = await ensureToken();
  try { return await rpc(fn, { p_token: tok, ...body }); }
  catch (e) { if (!e.auth) throw e; acct.token = null; const t2 = await auth(); return rpc(fn, { p_token: t2, ...body }); }
}

const REG_ERR = { toomany: 'Too many new accounts from this network in the last hour. Please try again later.', badname: 'Name must be 3–24 characters with at least one letter: letters, numbers, dots or dashes.', badpin: 'PIN must be 4 to 6 digits.', bademail: 'Enter a valid email address, or leave it empty.', emailnotallowed: 'Please use a personal email address, or leave it empty.', badphone: 'Enter a valid phone number, e.g. 0912 345 678.', emailtaken: 'This email is already used by another account. Sign in, or use Forgot PIN.', phonetaken: 'This phone number is already used by another account. Sign in, or use Forgot PIN.', toobig: 'Your progress is too large to save. Please contact desktopchill.' };
export const acctErr = (e, fallback = 'Something went wrong.') => REG_ERR[e] || { badpin: 'Wrong PIN.', locked: 'Too many wrong PINs. Try again in 10 minutes.', taken: 'That name is already taken.', renamelimit: 'You can change your name 3 times in 30 days.', samepin: 'Choose a PIN different from the current one.' }[e] || fallback;
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test((e || '').trim());
export const validPhone = (p) => { const d = (p || '').replace(/\D/g, ''); return d.length >= 9 && d.length <= 15; };
export async function register(name, pin, remember = true, email = '', phone = '') {
  name = clean(name);
  const j = await rpc('learn_register2', { p_name: name, p_pin: pin, p_data: S, p_email: email.trim(), p_phone: phone.trim() });
  if (!j || !j.ok) throw new Error(j && j.error === 'taken' ? `“${name}” is already taken. Try another name, or sign in if it’s yours.` : acctErr(j && j.error, 'Could not create the account'));
  setAcct({ name, pin, remember }); sync.at = Date.now(); sync.state = 'ok'; emit();
  try { await auth(); } catch (e) {}
}
export async function login(name, pin, remember = true) {
  name = clean(name);
  const j = await rpc('learn_login', { p_name: name, p_pin: pin });
  if (!j || !j.ok) {
    const m = { nouser: 'No account with that name. Check the spelling or create one.', badpin: 'Wrong PIN', locked: 'Too many attempts. Try again in 10 minutes.' };
    throw new Error(m[j && j.error] || 'Could not sign in');
  }
  setAcct({ name: j.name || name, pin, remember });
  // v23: gộp dữ liệu máy này với máy chủ (không ghi đè bên nào), rồi lưu bản gộp lên
  if (j.data && !S.onboarded) replace(j.data);
  else if (j.data) absorb(j.data);
  await push();
  sync.at = Date.now(); sync.state = 'ok'; emit();
  try { await auth(); } catch (e) {}
}
// đổi PIN (cần PIN hiện tại); máy này giữ phiên, các máy khác bị đăng xuất
export async function changePin(oldPin, newPin) {
  const j = await call('learn_change_pin', { p_old: oldPin, p_new: newPin });
  if (j && j.ok) { acct.pin = newPin; store(); emit(); }
  return j;
}
// đổi tên tài khoản (tên đăng nhập + tên hiển thị)
export async function rename(pin, name) {
  const j = await call('learn_rename', { p_pin: pin, p_name: clean(name) });
  if (j && j.ok) { acct.name = j.name; store(); emit(); }
  return j;
}
export const forgot = (ident, contact, note) => rpc('learn_forgot', { p_ident: clean(ident), p_contact: (contact || '').trim(), p_note: (note || '').trim() });
export function logout() { if (acct && acct.token) rpc('learn_logout', { p_token: acct.token }).catch(() => {}); setAcct(null); }
export async function setAvatar(a) {
  if (!acct) return;
  const old = acct.avatar; acct.avatar = a; store(); emit();
  const j = await call('learn_set_avatar', { p_avatar: a });
  if (j && j.ok === false) { acct.avatar = old; store(); emit(); }
  return j;
}

let busy = false, again = false;
export async function push() {
  if (!acct) return;
  if (busy) { again = true; return; }
  busy = true; sync.state = 'saving'; emit();
  try {
    // v23: lưu bằng token phiên (nhẹ cho máy chủ); máy chủ cũ chưa có learn_save2 thì dùng cách cũ
    let j = null;
    try { j = await call('learn_save2', { p_data: S }); } catch (e) { if (/not ready/.test(e.message)) j = await rpc('learn_save', { p_name: acct.name, p_pin: acct.pin, p_data: S }); else throw e; }
    if (j && j.ok && +j.lucky > 0) lucky.forEach((f) => { try { f(+j.lucky); } catch (e) {} });
    if (j && j.ok) { sync.state = 'ok'; sync.at = Date.now(); if (j.data && absorb(j.data)) pulled.forEach((f) => { try { f(); } catch (e) {} }); } else sync.state = 'err';
  } catch (e) { sync.state = 'err'; }
  busy = false; emit();
  if (again) { again = false; push(); }
}
// v23: lấy bản mới nhất từ máy chủ (gộp) khi mở trang, khi quay lại tab và vài phút một lần
const pulled = new Set();
// v24f: máy chủ báo vé quay may mắn (10% mỗi bài học mới)
const lucky = new Set();
export const onLucky = (f) => lucky.add(f);
export const onPulled = (f) => pulled.add(f);
let lastPull = 0;
export function pull(force = false) {
  if (!acct || (!force && Date.now() - lastPull < 20000)) return;
  lastPull = Date.now(); push();
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
  addEventListener('focus', () => pull());
  addEventListener('pageshow', (e) => { if (e.persisted) pull(true); });
  setInterval(() => { if (!document.hidden) pull(); }, 180000);
}
let t = null;
onSave(() => { if (!acct) return; clearTimeout(t); t = setTimeout(push, 4000); });
