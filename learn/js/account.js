// Tài khoản đơn giản: tên + mã PIN. Tiến trình lưu lên máy chủ (Supabase) qua 3 hàm RPC.
import { S, onSave, replace } from './store.js?v=4';
const URL = 'https://phcmbgaozkaibqsttonc.supabase.co/rest/v1/rpc/';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY21iZ2FvemthaWJxc3R0b25jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzODk3NTgsImV4cCI6MjEwNDk2NTc1OH0.Hvs0Gxebog5gcKILnSdT3g6nz6-GI0CEepmMJM0gCxo';
const AKEY = 'dcl_account';
export let acct = null; // { name, pin }
try { acct = JSON.parse(localStorage.getItem(AKEY) || 'null'); } catch (e) {}
export const sync = { state: acct ? 'idle' : 'off', at: 0 };
const listeners = new Set();
export const onSync = (f) => listeners.add(f);
const emit = () => listeners.forEach((f) => { try { f(sync); } catch (e) {} });

async function rpc(fn, body) {
  const r = await fetch(URL + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify(body) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (r.status === 404) throw new Error('Máy chủ tài khoản chưa sẵn sàng. Tiến trình vẫn được lưu trên máy này.');
  if (!r.ok) throw new Error('Máy chủ đang bận, thử lại sau nhé');
  return j;
}
const clean = (n) => (n || '').trim().replace(/\s+/g, ' ');
export function validName(n) { n = clean(n); return n.length >= 3 && n.length <= 24 && /^[\p{L}\p{N} ._-]+$/u.test(n); }
export const validPin = (p) => /^\d{4,6}$/.test(p || '');

function setAcct(a) { acct = a; try { if (a) localStorage.setItem(AKEY, JSON.stringify(a)); else localStorage.removeItem(AKEY); } catch (e) {} sync.state = a ? 'idle' : 'off'; emit(); }

export async function register(name, pin) {
  name = clean(name);
  const j = await rpc('learn_register', { p_name: name, p_pin: pin, p_data: S });
  if (!j || !j.ok) throw new Error(j && j.error === 'taken' ? 'Tên này đã có người dùng, chọn tên khác nhé' : (j && j.error) || 'Chưa tạo được tài khoản');
  setAcct({ name, pin }); sync.at = Date.now(); sync.state = 'ok'; emit();
}
export async function login(name, pin) {
  name = clean(name);
  const j = await rpc('learn_login', { p_name: name, p_pin: pin });
  if (!j || !j.ok) {
    const m = { nouser: 'Không tìm thấy tên này', badpin: 'Mã PIN chưa đúng', locked: 'Nhập sai nhiều lần, thử lại sau 10 phút' };
    throw new Error(m[j && j.error] || 'Chưa đăng nhập được');
  }
  setAcct({ name: j.name || name, pin });
  // lấy bản mới hơn giữa máy này và máy chủ
  if (j.data && (!S.updated || (j.data.updated || 0) >= S.updated || !S.onboarded)) replace(j.data);
  else await push();
  sync.at = Date.now(); sync.state = 'ok'; emit();
}
export function logout() { setAcct(null); }

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
window.addEventListener('pagehide', () => { if (acct && sync.state !== 'ok') { try { navigator.sendBeacon && fetch(URL + 'learn_save', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: 'Bearer ' + ANON }, body: JSON.stringify({ p_name: acct.name, p_pin: acct.pin, p_data: S }) }); } catch (e) {} } });
