// Khung ứng dụng: đăng nhập, thanh điều hướng, định tuyến, trạng thái realtime.
import * as auth from './auth.js?v=5f446a77';
import * as store from './data/store.js?v=a69908ee';
import { $, $$, esc, ico, LOGO, toast, modal, timeVN } from './ui/util.js?v=70d78725';
import marketView from './views/market.js?v=e952e692';
import screenerView from './views/screener.js?v=48dfa71e';
import stockView from './views/stock.js?v=55978793';
import journalView from './views/journal.js?v=129676d1';
import methodView from './views/method.js?v=2165a2b8';
import scenarioView from './views/scenario.js?v=599257fc';
import adminView from './views/admin.js?v=57398de0';

const app = $('#app');
export const ctx = { user: null, notesCount: 0, pendingCount: 0 };

// ---------- nền video ----------
function startSky() {
  const v = $('#sky'); if (!v) return;
  const theme = document.documentElement.getAttribute('data-theme');
  const save = navigator.connection && (navigator.connection.saveData || /2g/.test(navigator.connection.effectiveType || ''));
  if (theme === 'light' || save || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!v.src) { v.src = 'assets/night.mp4'; v.addEventListener('canplay', () => v.classList.add('ready'), { once: true }); }
  v.play().catch(() => {});
}
function setTheme(t) { document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('dct_theme', t); } catch (e) {} if (t === 'dark') startSky(); else $('#sky')?.pause(); window.dispatchEvent(new Event('themechange')); }

// ---------- màn đăng nhập / đăng ký ----------
function showAuth(mode = 'login', notice = '') {
  app.innerHTML = `
  <div class="auth">
    <section class="auth-copy">
      <div class="logo">${LOGO}<span>desktop<b>chill</b></span><small>Trading</small></div>
      <h1>Đọc thị trường trước khi ra quyết định.</h1>
      <p>Mỗi phiên, hệ thống tự quét toàn bộ cổ phiếu sàn HOSE và tổng hợp xu hướng, dòng tiền, mô hình giá, phân kỳ, Fibonacci cùng chỉ số cơ bản thành một nhận định dễ đọc cho ba khung thời gian.</p>
      <ul>
        <li>${ico('check')}<span>Sức khỏe thị trường, độ rộng và ngày phân phối cập nhật theo phiên</span></li>
        <li>${ico('check')}<span>Xếp hạng mã tiềm năng và mã cần thận trọng, kèm lý do cụ thể</span></li>
        <li>${ico('check')}<span>Lưu nhận định để đối chiếu với diễn biến thực tế về sau</span></li>
      </ul>
    </section>
    <section class="auth-card glass">
      <div class="seg" role="tablist">
        <button role="tab" data-mode="login" class="${mode === 'login' ? 'on' : ''}">Đăng nhập</button>
        <button role="tab" data-mode="register" class="${mode === 'register' ? 'on' : ''}">Đăng ký</button>
      </div>
      ${mode === 'login' ? `
      <form id="fLogin" novalidate>
        <div class="field"><label for="le">Email</label><input class="input" id="le" type="email" autocomplete="email" required></div>
        <div class="field"><label for="lp">Mật khẩu</label><input class="input" id="lp" type="password" autocomplete="current-password" required></div>
        <div class="msg ${notice ? 'ok' : ''}" id="msg">${esc(notice)}</div>
        <button class="btn primary" type="submit">Đăng nhập</button>
        <p class="fine">Chưa có tài khoản? Chọn “Đăng ký” — tài khoản dùng được sau khi quản trị viên duyệt.</p>
      </form>` : `
      <form id="fReg" novalidate>
        <div class="field"><label for="rn">Họ tên</label><input class="input" id="rn" autocomplete="name" required maxlength="60"></div>
        <div class="field"><label for="re">Email</label><input class="input" id="re" type="email" autocomplete="email" required></div>
        <div class="field"><label for="rp">Mật khẩu (ít nhất 8 ký tự)</label><input class="input" id="rp" type="password" autocomplete="new-password" required minlength="8"></div>
        <div class="field"><label for="rp2">Nhập lại mật khẩu</label><input class="input" id="rp2" type="password" autocomplete="new-password" required></div>
        <div class="field"><label for="rnote">Lời nhắn cho quản trị viên (không bắt buộc)</label><textarea class="input" id="rnote" maxlength="300" placeholder="Bạn là ai, vì sao muốn dùng…"></textarea></div>
        <div class="msg" id="msg"></div>
        <button class="btn primary" type="submit">Gửi yêu cầu đăng ký</button>
      </form>`}
    </section>
  </div>`;
  $$('.seg button', app).forEach((b) => b.addEventListener('click', () => showAuth(b.dataset.mode)));
  const msg = $('#msg');
  const fail = (m) => { msg.className = 'msg err'; msg.textContent = m; };
  $('#fLogin')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type=submit]');
    const em = $('#le').value.trim(), pw = $('#lp').value;
    if (!em || !pw) return fail('Nhập email và mật khẩu.');
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Đang đăng nhập…';
    try { const u = await auth.login(em, pw); startApp(u); } catch (err) { fail(err.message); } finally { btn.disabled = false; }
  });
  $('#fReg')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = e.target.querySelector('button[type=submit]');
    const name = $('#rn').value.trim(), email = $('#re').value.trim(), pw = $('#rp').value, pw2 = $('#rp2').value, note = $('#rnote').value.trim();
    if (name.length < 2) return fail('Nhập họ tên.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Email chưa đúng định dạng.');
    if (pw.length < 8) return fail('Mật khẩu cần ít nhất 8 ký tự.');
    if (pw !== pw2) return fail('Hai lần nhập mật khẩu chưa khớp.');
    btn.disabled = true; msg.className = 'msg'; msg.textContent = 'Đang gửi…';
    try { await auth.register({ email, name, password: pw, note }); showAuth('login', 'Đã gửi yêu cầu. Bạn đăng nhập được ngay khi quản trị viên duyệt tài khoản.'); $('#le').value = email; }
    catch (err) { fail(err.message); } finally { btn.disabled = false; }
  });
  setTimeout(() => $('input', app)?.focus(), 60);
}

// ---------- khung ứng dụng ----------
const ROUTES = [
  { key: 'thi-truong', label: 'Thị trường', icon: 'market', view: marketView },
  { key: 'co-hoi', label: 'Cơ hội', icon: 'spark', view: screenerView },
  { key: 'kich-ban', label: 'Kịch bản', icon: 'trend', view: scenarioView },
  { key: 'da-luu', label: 'Đã lưu', icon: 'bookmark', view: journalView },
  { key: 'phuong-phap', label: 'Phương pháp', icon: 'book', view: methodView },
];
let current = null;

function shell() {
  const isAdmin = ctx.user?.role === 'admin';
  app.innerHTML = `
  <header class="site-header">
    <div class="header-inner">
      <a class="logo" href="#/thi-truong" aria-label="Desktopchill Trading">${LOGO}<span>desktop<b>chill</b></span><small>Trading</small></a>
      <nav class="nav" aria-label="Điều hướng chính">
        ${ROUTES.map((r) => `<a href="#/${r.key}" data-r="${r.key}">${ico(r.icon)}<span>${r.label}</span></a>`).join('')}
        ${isAdmin ? `<a href="#/duyet" data-r="duyet">${ico('shield')}<span>Duyệt</span><em class="badge-n" id="pendN" hidden></em></a>` : ''}
      </nav>
      <div class="hdr-actions">
        <div class="search">${ico('search')}<input id="q" placeholder="Tìm mã…" autocomplete="off" spellcheck="false" aria-label="Tìm mã cổ phiếu"><div class="suggest" id="sug" role="listbox"></div></div>
        <div class="live" id="live" title="Trạng thái dữ liệu"><i></i><span class="t">Đang kết nối…</span></div>
        <button class="icon-btn" id="theme" aria-label="Đổi giao diện sáng/tối">${ico(document.documentElement.getAttribute('data-theme') === 'light' ? 'moon' : 'sun')}</button>
        <div class="menu"><button class="icon-btn" id="me" aria-label="Tài khoản" aria-haspopup="true">${ico('user')}</button>
          <div class="menu-pop" id="mePop"><div class="who"><b>${esc(ctx.user.name)}</b><span>${esc(ctx.user.email)}</span></div>
            <button data-a="refresh">Làm mới dữ liệu</button><button data-a="pass">Đổi mật khẩu</button><button data-a="logout">Đăng xuất</button></div></div>
      </div>
    </div>
  </header>
  <main class="wrap" id="main"></main>
  <footer class="foot wrap">Thông tin chỉ mang tính tham khảo, không phải khuyến nghị đầu tư. Dữ liệu: KBS, VNDirect, VPS, Simplize · Biểu đồ: <a href="https://www.tradingview.com/" target="_blank" rel="noopener">TradingView Lightweight Charts™</a></footer>`;
  $('#theme').addEventListener('click', () => { const t = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'; setTheme(t); $('#theme').innerHTML = ico(t === 'light' ? 'moon' : 'sun'); });
  const pop = $('#mePop');
  $('#me').addEventListener('click', (e) => { e.stopPropagation(); pop.classList.toggle('open'); });
  document.addEventListener('click', () => pop.classList.remove('open'));
  pop.addEventListener('click', async (e) => {
    const a = e.target.closest('button')?.dataset.a; if (!a) return;
    if (a === 'logout') { await auth.logout(); location.hash = ''; location.reload(); }
    if (a === 'refresh') { toast('Đang làm mới dữ liệu…'); await store.refreshNow(); toast('Đã cập nhật bảng giá'); }
    if (a === 'pass') changePass();
  });
  setupSearch();
}

async function changePass() {
  await modal({ title: 'Đổi mật khẩu', body: `<div class="field"><label>Mật khẩu hiện tại</label><input class="input" id="op" type="password" autocomplete="current-password"></div><div class="field"><label>Mật khẩu mới (≥ 8 ký tự)</label><input class="input" id="np" type="password" autocomplete="new-password"></div>`,
    actions: [{ label: 'Hủy' }, { label: 'Đổi mật khẩu', kind: 'primary', run: async (el) => { await auth.changePassword($('#op', el).value, $('#np', el).value); toast('Đã đổi mật khẩu'); } }] });
}

function setupSearch() {
  const q = $('#q'), sug = $('#sug'); let sel = 0, items = [];
  const render = () => {
    const v = q.value.trim().toUpperCase(); const S = store.state;
    if (!v) { sug.classList.remove('open'); return; }
    items = S.syms.filter((s) => s.startsWith(v)).concat(S.syms.filter((s) => !s.startsWith(v) && ((S.names[s] || '').toUpperCase().includes(v) || s.includes(v)))).slice(0, 12);
    sel = 0;
    sug.innerHTML = items.length ? items.map((s, i) => `<button role="option" data-s="${s}" class="${i === 0 ? 'sel' : ''}"><b>${s}</b><span>${esc(S.names[s] || '')}</span></button>`).join('') : '<div class="empty" style="padding:14px">Không có mã phù hợp trên HOSE</div>';
    sug.classList.add('open');
  };
  q.addEventListener('input', render);
  q.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(1, items.length); $$('button', sug).forEach((b, i) => b.classList.toggle('sel', i === sel)); }
    if (e.key === 'Enter' && items[sel]) { go(items[sel]); }
    if (e.key === 'Escape') { q.value = ''; sug.classList.remove('open'); q.blur(); }
  });
  sug.addEventListener('click', (e) => { const b = e.target.closest('button[data-s]'); if (b) go(b.dataset.s); });
  q.addEventListener('blur', () => setTimeout(() => sug.classList.remove('open'), 150));
  const go = (s) => { location.hash = '#/ma/' + s; q.value = ''; sug.classList.remove('open'); q.blur(); };
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); } });
}

function liveStatus() {
  const el = $('#live'); if (!el) return; const S = store.state; const ss = S.session || store.sessionInfo();
  el.classList.toggle('on', !!ss.live && !S.boardError); el.classList.toggle('warn', !!S.boardError);
  const t = S.boardError ? 'Mất kết nối dữ liệu' : `${ss.label}${S.lastTick ? ' · ' + timeVN(S.lastTick) : ''}`;
  el.querySelector('.t').textContent = t; el.title = S.boardError || `Bảng giá cập nhật lúc ${S.lastTick ? timeVN(S.lastTick) : '—'}${ss.live ? ' · tự làm mới mỗi 4 giây' : ''}`;
}

function route() {
  const h = location.hash.replace(/^#\/?/, '') || 'thi-truong';
  const [key, arg] = h.split('/');
  let view = ROUTES.find((r) => r.key === key)?.view;
  if (key === 'ma' && arg) view = stockView;
  if (key === 'duyet') view = ctx.user?.role === 'admin' ? adminView : null;
  if (!view) { location.hash = '#/thi-truong'; return; }
  $$('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === (key === 'ma' ? '' : key)));
  current?.destroy?.();
  const main = $('#main'); main.innerHTML = ''; main.className = 'wrap';
  current = view; view.render(main, { arg: arg ? decodeURIComponent(arg).toUpperCase() : null, ctx });
  window.scrollTo({ top: 0 });
}

async function startApp(user) {
  ctx.user = user; shell(); startSky();
  window.addEventListener('hashchange', route);
  store.on((what) => { if (what === 'board' || what === 'session' || what === 'error') liveStatus(); current?.update?.(what); });
  route(); liveStatus();
  setInterval(liveStatus, 30000);
  store.init().catch((e) => { console.error(e); store.state.errors.push(e.message); current?.update?.('error'); toast(e.message, 'err'); });
  if (user.role === 'admin') { refreshPending(); window.addEventListener('pending-changed', refreshPending); }
}
export async function refreshPending() {
  try { const u = await auth.admin.users(); const n = u.filter((x) => x.status === 'pending').length; const el = $('#pendN'); if (el) { el.hidden = !n; el.textContent = n; } return u; } catch (e) { return null; }
}

// ---------- khởi động ----------
(async () => {
  if (document.documentElement.getAttribute('data-theme') !== 'light') startSky();
  if (!auth.getSession()) return showAuth();
  app.innerHTML = '<div class="loading" style="justify-content:center;min-height:60vh"><span class="spin"></span>Đang mở phiên làm việc…</div>';
  const u = await auth.me();
  if (u) startApp(u); else showAuth('login', '');
})();
