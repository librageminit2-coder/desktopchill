// Tài khoản: số điện thoại (bắt buộc) + email (tuỳ chọn), đổi tên, đổi PIN, quên PIN. Đăng nhập bằng tên tài khoản hoặc số điện thoại.
// Tài khoản cũ chưa có số điện thoại: bắt buộc bổ sung trước khi học tiếp. PIN tạm do admin cấp: bắt buộc đổi.
import { I } from './icons.js?v=28';
import { acct, call, changePin, rename, forgot, acctErr, validEmail, validPhone, validName, validPin } from './account.js?v=28';
import { sfx } from './sound.js?v=28';
import { esc, toast, sheet } from './ui.js?v=28';

export const contactFields = (email = '', phone = '') => `
  <div class="field"><label for="ce">Email (optional)</label><input class="input" id="ce" type="email" autocomplete="email" maxlength="120" placeholder="name@example.com" value="${esc(email || '')}" /></div>
  <div class="field"><label for="cp">Phone number</label><input class="input" id="cp" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0912 345 678" value="${esc(phone)}" required /><small class="hintx">Used only to verify you if you forget your PIN.</small></div>`;
export function wireContact() {}
export function readContact(el) {
  const email = el.querySelector('#ce').value.trim(), phone = el.querySelector('#cp').value.trim();
  if (email && !validEmail(email)) return { err: 'Enter a valid email address, or leave it empty.' };
  if (!validPhone(phone)) return { err: 'Enter a valid phone number, e.g. 0912 345 678.' };
  return { email, phone };
}
const pinInput = (id, label, ac = 'current-password') => `<div class="field"><label for="${id}">${label}</label><input class="input pin" id="${id}" type="password" inputmode="numeric" autocomplete="${ac}" maxlength="6" placeholder="••••" required /></div>`;
const digitsOnly = (el) => el.querySelectorAll('input.pin').forEach((i) => i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, ''); }));

/* ---------- bảng chặn (không đóng được) ---------- */
function gate(html, mount) {
  document.querySelectorAll('.gate').forEach((g) => g.remove());
  const g = document.createElement('div'); g.className = 'gate';
  g.innerHTML = `<div class="gate-card panel solid" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(g);
  const close = () => g.remove();
  mount(g.querySelector('.gate-card'), close);
  return close;
}
let gating = false;
// gọi sau mỗi lần learn_me: PIN tạm → bắt đổi PIN; thiếu liên hệ → bắt bổ sung
export function checkAccount(me) {
  if (!acct || !me || gating || document.querySelector('.gate')) return;
  if (me.must_pin) { gating = true; forcePin(() => { gating = false; checkAccount({ ...me, must_pin: false }); }); return; }
  if (me.contact === false) { gating = true; forceContact(() => { gating = false; }); }
}
function forcePin(done) {
  gate(`<span class="gate-ic">${I.lock}</span><h2>Choose a new PIN</h2><p class="sub">You signed in with a temporary PIN from desktopchill. Pick your own 4–6 digit PIN to continue.</p>
    <form class="gf" novalidate>${pinInput('np1', 'New PIN', 'new-password')}${pinInput('np2', 'Repeat the new PIN', 'new-password')}<p class="err" role="alert"></p><button class="btn acc wide" type="submit">Save my PIN</button></form>`, (el, close) => {
    digitsOnly(el);
    el.querySelector('.gf').addEventListener('submit', async (e) => {
      e.preventDefault(); const a = el.querySelector('#np1').value, b = el.querySelector('#np2').value, err = el.querySelector('.err');
      if (!validPin(a)) { err.textContent = 'PIN must be 4 to 6 digits.'; return; }
      if (a !== b) { err.textContent = 'The two PINs do not match.'; return; }
      try { const j = await changePin(acct.pin, a); if (!j || !j.ok) { err.textContent = acctErr(j && j.error); return; } sfx('ok'); toast('New PIN saved'); close(); done(); }
      catch (x) { err.textContent = x.message; }
    });
  });
}
function forceContact(done) {
  gate(`<span class="gate-ic">${I.users}</span><h2>Add your phone number</h2><p class="sub">Every account needs a phone number. You can sign in with it, and desktopchill can verify you if you forget your PIN.</p>
    <form class="gf" novalidate>${contactFields()}<p class="err" role="alert"></p><button class="btn acc wide" type="submit">Save and continue</button></form>
    <p class="muted gate-f">Signed in as <b>${esc(acct.name)}</b>. You can change these later in Profile &amp; settings.</p>`, (el, close) => {
    wireContact(el);
    el.querySelector('.gf').addEventListener('submit', async (e) => {
      e.preventDefault(); const c = readContact(el), err = el.querySelector('.err');
      if (c.err) { err.textContent = c.err; return; }
      try { const j = await call('learn_contact_set', { p_pin: null, p_email: c.email, p_phone: c.phone }); if (!j || !j.ok) { err.textContent = acctErr(j && j.error); return; } sfx('ok'); toast('Saved. Thank you!'); close(); done(); }
      catch (x) { err.textContent = x.message; }
    });
  });
}

/* ---------- Profile & settings: khối tài khoản ---------- */
export function accountPanelHTML() {
  return `<div class="panel pad acct-p"><h3>Account</h3><p class="muted" style="margin:6px 0 10px">Sign in on any device with your account name or phone number and your PIN.${acct.code ? ` Friend code <b style="letter-spacing:.12em;color:var(--ink)">${esc(acct.code)}</b>.` : ''}</p>
    <div class="acct-rows">
      <div class="row"><span class="grow"><b>Account name</b><small class="an-v">${esc(acct.name)}</small></span><button class="btn sm ghost a-name" type="button">${I.edit} Change</button></div>
      <div class="row"><span class="grow"><b>Phone and email</b><small class="ac-v">Loading…</small></span><button class="btn sm ghost a-contact" type="button">${I.edit} Change</button></div>
      <div class="row"><span class="grow"><b>PIN</b><small>4–6 digits. Changing it signs out your other devices.</small></span><button class="btn sm ghost a-pin" type="button">${I.lock} Change</button></div>
    </div></div>`;
}
let contact = null;
export async function wireAccountPanel(root, onChange) {
  const v = root.querySelector('.ac-v'); if (!v) return;
  const paint = () => { v.innerHTML = contact && contact.has ? `${esc(contact.phone || '')}${contact.email ? ' · ' + esc(contact.email) : ''}` : '<span style="color:var(--warn);font-weight:700">Missing. Please add them.</span>'; };
  try { contact = await call('learn_contact_get'); paint(); } catch (e) { v.textContent = e.message; }
  root.querySelector('.a-name').addEventListener('click', () => nameSheet(onChange));
  root.querySelector('.a-contact').addEventListener('click', () => contactSheet(() => { paint(); }));
  root.querySelector('.a-pin').addEventListener('click', pinSheet);
}
function nameSheet(onChange) {
  sheet(`<h2>Change your account name</h2><p class="sub">This is the name friends, classmates and the ranking see, and you can sign in with it. Up to 3 changes in 30 days.</p>
    <form class="gf" novalidate><div class="field"><label for="nn">New name</label><input class="input" id="nn" maxlength="24" value="${esc(acct.name)}" autocomplete="username" /></div>${pinInput('npin', 'Your PIN')}<p class="err" role="alert"></p><button class="btn acc wide" type="submit">Save name</button></form>`, (el, close) => {
    digitsOnly(el);
    el.querySelector('.gf').addEventListener('submit', async (e) => {
      e.preventDefault(); const n = el.querySelector('#nn').value.trim(), p = el.querySelector('#npin').value, err = el.querySelector('.err');
      if (!validName(n) || /^[\d ._-]+$/.test(n)) { err.textContent = 'Name must be 3–24 characters with at least one letter.'; return; }
      try { const j = await rename(p, n); if (!j || !j.ok) { err.textContent = acctErr(j && j.error); return; } sfx('ok'); toast('Name changed'); close(); if (onChange) onChange(); }
      catch (x) { err.textContent = x.message; }
    });
  });
}
function contactSheet(after) {
  const has = contact && contact.has;
  sheet(`<h2>${has ? 'Change phone and email' : 'Add phone and email'}</h2><p class="sub">Sign in with your account name or phone number. desktopchill uses these only to verify you if you forget your PIN.</p>
    <form class="gf" novalidate>${contactFields(has ? contact.email : '', has ? contact.phone : '')}${has ? pinInput('cpin', 'Your PIN') : ''}<p class="err" role="alert"></p><button class="btn acc wide" type="submit">Save</button></form>`, (el, close) => {
    digitsOnly(el); wireContact(el);
    el.querySelector('.gf').addEventListener('submit', async (e) => {
      e.preventDefault(); const c = readContact(el), err = el.querySelector('.err');
      if (c.err) { err.textContent = c.err; return; }
      const pin = has ? el.querySelector('#cpin').value : null;
      try { const j = await call('learn_contact_set', { p_pin: pin, p_email: c.email, p_phone: c.phone }); if (!j || !j.ok) { err.textContent = acctErr(j && j.error); return; } contact = { has: true, email: c.email, phone: c.phone }; sfx('ok'); toast('Saved'); close(); after(); }
      catch (x) { err.textContent = x.message; }
    });
  });
}
function pinSheet() {
  sheet(`<h2>Change your PIN</h2><p class="sub">Your other devices will be signed out.</p>
    <form class="gf" novalidate>${pinInput('op', 'Current PIN')}${pinInput('np1', 'New PIN', 'new-password')}${pinInput('np2', 'Repeat the new PIN', 'new-password')}<p class="err" role="alert"></p><button class="btn acc wide" type="submit">Change PIN</button></form>`, (el, close) => {
    digitsOnly(el);
    el.querySelector('.gf').addEventListener('submit', async (e) => {
      e.preventDefault(); const o = el.querySelector('#op').value, a = el.querySelector('#np1').value, b = el.querySelector('#np2').value, err = el.querySelector('.err');
      if (!validPin(a)) { err.textContent = 'PIN must be 4 to 6 digits.'; return; }
      if (a !== b) { err.textContent = 'The two new PINs do not match.'; return; }
      try { const j = await changePin(o, a); if (!j || !j.ok) { err.textContent = acctErr(j && j.error); return; } sfx('ok'); toast('PIN changed'); close(); }
      catch (x) { err.textContent = x.message; }
    });
  });
}

/* ---------- quên PIN ---------- */
export function forgotSheet(prefill = '') {
  sheet(`<h2>Forgot your PIN?</h2><p class="sub">Send a request to desktopchill. We check it by hand, confirm it is really you using the phone number saved on the account, then send you a temporary PIN.</p>
    <form class="gf" novalidate>
      <div class="field"><label for="fi">Account name or phone number</label><input class="input" id="fi" maxlength="120" value="${esc(prefill)}" autocomplete="username" required /></div>
      <div class="field"><label for="fc">How should we reach you?</label><input class="input" id="fc" maxlength="120" placeholder="Zalo / phone number or email" required /></div>
      <div class="field"><label for="fn">Anything else? <span class="muted">(optional)</span></label><textarea class="input" id="fn" rows="2" maxlength="300" placeholder="e.g. best time to call"></textarea></div>
      <p class="err" role="alert"></p><button class="btn acc wide" type="submit">${I.send} Send request</button></form>`, (el, close) => {
    el.querySelector('.gf').addEventListener('submit', async (e) => {
      e.preventDefault(); const i = el.querySelector('#fi').value.trim(), c = el.querySelector('#fc').value.trim(), n = el.querySelector('#fn').value.trim(), err = el.querySelector('.err');
      if (i.length < 3) { err.textContent = 'Enter your account name or phone number.'; return; }
      if (c.length < 6) { err.textContent = 'Tell us how to reach you.'; return; }
      try {
        const j = await forgot(i, c, n);
        if (!j || !j.ok) { err.textContent = 'Could not send. Try again.'; return; }
        sfx('ok');
        el.innerHTML = `<span class="gate-ic ok">${I.check}</span><h2>Request sent</h2><p class="sub">If the details match an account, desktopchill will contact you to confirm it is you and then send a temporary PIN. You will choose your own PIN right after signing in with it.</p><p class="muted" style="font-size:.86rem">desktopchill never asks for your PIN. Do not share it with anyone.</p><button class="btn acc wide fx" type="button">OK</button>`;
        el.querySelector('.fx').addEventListener('click', close);
      } catch (x) { err.textContent = x.message; }
    });
  });
}
