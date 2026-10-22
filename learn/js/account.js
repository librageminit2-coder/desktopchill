// Tài khoản đơn giản: tên + mã PIN. Tiến trình lưu lên Supabase qua các hàm RPC.
// Sau khi đăng nhập, máy chủ cấp một "token phiên" để dùng cho bạn bè, lớp học và quiz (không gửi PIN mỗi lần).
import { S, onSave, replace } from './store.js?v=18';
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

export async function register(name, pin, remember = true) {
  name = clean(name);
  const j = await rpc('learn_register', { p_name: name, p_pin: pin, p_data: S });
  if (!j || !j.ok) throw new Error(j && j.error === 'taken' ? `“${name}” is already taken. Try another name, or sign in if it’s yours.` : (j && j.error) || 'Could not create the account');
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
  // lấy bản mới hơn giữa máy này và máy chủ
  if (j.data && (!S.updated || (j.data.updated || 0) >= S.updated || !S.onboarded)) replace(j.data);
  else await push();
  sync.at = Date.now(); sync.state = 'ok'; emit();
  try { await auth(); } catch (e) {}
}
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
    const j = await rpc('learn_save', { p_name: acct.name, p_pin: acct.pin, p_data: S });
    if (j && j.ok) { sync.state = 'ok'; sync.at = Date.now(); } else sync.state = 'err';
  } catch (e) { sync.state = 'err'; }
  busy = false; emit();
  if (again) { again = false; push(); }
}
let t = null;
onSave(() => { if (!acct) return; clearTimeout(t); t = setTimeout(push, 4000); });
