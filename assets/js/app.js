import { I18N, CATEGORIES, CONTACT, FAQ } from './i18n.js';

const state = {
  lang: localStorage.getItem('dc_lang') || 'vi',
  theme: localStorage.getItem('dc_theme') || 'light',
  view: localStorage.getItem('dc_view') || 'grid',
  category: 'all',
  search: '',
  page: 1,
  wallpapers: [],
  current: null,
};
const PER_PAGE = 48;   // số mẫu mỗi trang

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const t = (k) => (I18N[state.lang] && I18N[state.lang][k]) || I18N.vi[k] || k;

/* ---------------- i18n ---------------- */
function applyI18n() {
  document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach((el) => { const v = t(el.dataset.i18n); if (v) el.textContent = v; });
  $('#langCode').textContent = state.lang.toUpperCase();
  const si = $('#searchInput'); if (si) si.placeholder = t('filter.search');
  $$('#segLang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
}
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeIcon').textContent = state.theme === 'dark' ? '🌙' : '☀️';
  $$('#segTheme button').forEach((b) => b.classList.toggle('active', b.dataset.themeVal === state.theme));
}
function wireContacts() {
  $('#contactZalo').href = CONTACT.zaloUrl;
  $('#contactTiktok').href = CONTACT.tiktokUrl;
  $('#pricingZalo').href = CONTACT.zaloUrl;
  $('#footerZalo').href = CONTACT.zaloUrl;
  $('#footerTiktok').href = CONTACT.tiktokUrl;
  const fab = $('#floatingZalo'); if (fab) fab.href = CONTACT.zaloUrl;
  $('#zaloPhone').textContent = CONTACT.zaloPhone;
  $('#tiktokHandle').textContent = CONTACT.tiktokHandle;
  $('#year').textContent = new Date().getFullYear();
}

/* ---------------- HERO live preview ---------------- */
function featured() {
  const hot = state.wallpapers.filter((w) => w.hot);
  return (hot.length ? hot : state.wallpapers).slice(0, 9); // tất cả mẫu Hot, tối đa 9 (lưới 3x3)
}
function renderPreviewGallery() {
  const track = $('#pgTrack');
  const items = featured();
  track.innerHTML = items.map((w) => `
    <button class="pg-thumb" data-id="${w.id}" style="--thumb-color:${w.color}">
      <img src="${w.poster}" alt="Hình nền động ${w.title[state.lang] || w.title.vi} cho máy tính" loading="lazy" />
      <span class="pg-name">${w.title[state.lang] || w.title.vi}</span>
    </button>`).join('');
  $$('#pgTrack .pg-thumb').forEach((th) => th.addEventListener('click', () => selectHero(th.dataset.id)));
  if (items[0]) selectHero(items[0].id, true);
}
function selectHero(id, instant = false) {
  const w = state.wallpapers.find((x) => x.id === id);
  if (!w) return;
  state.current = id;
  const video = $('#heroVideo');
  const screen = $('#screen');
  // ambient + glow color
  document.documentElement.style.setProperty('--ambient', w.color);
  // active thumb
  $$('#pgTrack .pg-thumb').forEach((th) => th.classList.toggle('active', th.dataset.id === id));
  // label
  $('#liveName').textContent = w.title[state.lang] || w.title.vi;
  // swap video with fade
  screen.classList.remove('ready');
  const start = () => { screen.classList.add('ready'); video.play().catch(() => {}); };
  if (video.getAttribute('src') === w.preview) { start(); return; }
  video.setAttribute('src', w.preview);
  video.load();
  video.oncanplay = start;
  if (instant) setTimeout(start, 60);
}

/* ---------------- GALLERY ---------------- */
function renderChips() {
  const box = $('#chips');
  const present = new Set(state.wallpapers.map((w) => w.category));
  const hasHot = state.wallpapers.some((w) => w.hot);
  const cats = ['all', ...(hasHot ? ['hot'] : []), ...CATEGORIES.filter((c) => present.has(c))];
  box.innerHTML = cats.map((c) => {
    const label = c === 'all' ? t('filter.all') : c === 'hot' ? t('filter.hot') : t('cat.' + c);
    return `<button class="chip ${c === 'hot' ? 'chip-hot ' : ''}${state.category === c ? 'active' : ''}" data-cat="${c}">${label}</button>`;
  }).join('');
  $$('#chips .chip').forEach((chip) => chip.addEventListener('click', () => {
    state.category = chip.dataset.cat;
    state.page = 1;
    $$('#chips .chip').forEach((c) => c.classList.toggle('active', c === chip));
    renderGallery();
  }));
}
function filtered() {
  const q = state.search.trim().toLowerCase();
  return state.wallpapers.filter((w) => {
    if (state.category === 'hot') { if (!w.hot) return false; }
    else if (state.category !== 'all' && w.category !== state.category) return false;
    if (q && !`${w.title.vi} ${w.title.en} ${w.id}`.toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderGallery() {
  const grid = $('#galleryGrid');
  grid.classList.toggle('view-one', state.view === 'one');
  const all = filtered();
  $('#galleryEmpty').hidden = all.length > 0;
  // phân trang: 48 mẫu / trang
  const totalPages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  if (state.page > totalPages) state.page = totalPages;
  if (state.page < 1) state.page = 1;
  const items = all.slice((state.page - 1) * PER_PAGE, state.page * PER_PAGE);
  renderPagination(totalPages);
  grid.innerHTML = items.map((w, i) => {
    const title = w.title[state.lang] || w.title.vi;
    const cat = t('cat.' + w.category);
    return `
      <article class="card" data-id="${w.id}" data-preview="${w.preview}" style="animation-delay:${Math.min(i, 12) * 0.03}s; --card-color:${w.color || '#6ea8ff'}">
        <div class="card-media">
          <img src="${w.poster}" alt="${title} — hình nền động ${cat} cho máy tính" loading="lazy" />
          <video class="card-vid" muted loop playsinline preload="none" data-src="${w.preview}"></video>
          ${w.hot ? `<span class="card-hot">${t('card.hot')}</span>` : ''}
          <div class="card-hover">
            <div class="card-hover-meta">
              <span class="card-hover-name">${title}</span>
              <span class="card-hover-tag">${cat}</span>
            </div>
            <div class="card-hover-actions">
              <button class="mini-btn mini-primary" data-act="screen">${t('card.toScreen')}</button>
              <button class="mini-btn" data-act="contact">${t('card.contact')}</button>
            </div>
          </div>
        </div>
      </article>`;
  }).join('');
  wireCards();
}
function gotoPage(p) {
  state.page = p;
  renderGallery();
  const g = $('#gallery'); if (g) g.scrollIntoView({ behavior: 'smooth' });
}
function renderPagination(totalPages) {
  const nav = $('#pagination'); if (!nav) return;
  if (totalPages <= 1) { nav.hidden = true; nav.innerHTML = ''; return; }
  nav.hidden = false;
  const cur = state.page;
  const nums = [];
  const push = (n) => { if (n >= 1 && n <= totalPages && !nums.includes(n)) nums.push(n); };
  push(1); push(totalPages);
  for (let i = cur - 1; i <= cur + 1; i++) push(i);
  nums.sort((a, b) => a - b);
  let html = `<button class="pg-btn pg-arrow" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} aria-label="Trang trước">←</button>`;
  let prev = 0;
  nums.forEach((n) => {
    if (n - prev > 1) html += '<span class="pg-ellipsis">…</span>';
    html += `<button class="pg-btn pg-num ${n === cur ? 'active' : ''}" data-page="${n}">${n}</button>`;
    prev = n;
  });
  html += `<button class="pg-btn pg-arrow" data-page="${cur + 1}" ${cur === totalPages ? 'disabled' : ''} aria-label="Trang sau">→</button>`;
  html += `<span class="pg-go"><input class="pg-go-input" type="number" min="1" max="${totalPages}" aria-label="Tới trang" /><button class="pg-btn pg-go-btn" data-go>${t('page.go')}</button></span>`;
  nav.innerHTML = html;
  nav.querySelectorAll('.pg-btn[data-page]').forEach((b) => b.addEventListener('click', () => {
    const p = parseInt(b.dataset.page, 10);
    if (!isNaN(p) && p >= 1 && p <= totalPages && p !== cur) gotoPage(p);
  }));
  const goBtn = nav.querySelector('[data-go]'), goInput = nav.querySelector('.pg-go-input');
  if (goBtn && goInput) {
    const go = () => { const p = parseInt(goInput.value, 10); if (p >= 1 && p <= totalPages && p !== cur) gotoPage(p); };
    goBtn.addEventListener('click', go);
    goInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }
}
function wireCards() {
  const cards = $$('#galleryGrid .card');
  const toScreen = (id) => { selectHero(id); $('#home').scrollIntoView({ behavior: 'smooth' }); };
  // auto-play videos as they scroll into view (pause when off-screen for performance)
  if (window._cardIO) window._cardIO.disconnect();
  window._cardIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const card = e.target, v = $('.card-vid', card);
      if (!v) return;
      if (e.isIntersecting) {
        if (!v.getAttribute('src')) v.setAttribute('src', v.dataset.src);
        v.play().then(() => card.classList.add('playing')).catch(() => {});
      } else { v.pause(); }
    });
  }, { rootMargin: '150px 0px', threshold: 0.1 });
  const tiltOK = window.matchMedia('(hover: hover) and (pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cards.forEach((card) => {
    window._cardIO.observe(card);
    $('.card-media', card).addEventListener('click', (ev) => {
      if (ev.target.closest('[data-act]')) return;
      toScreen(card.dataset.id);
    });
    const scr = $('[data-act="screen"]', card), con = $('[data-act="contact"]', card);
    if (scr) scr.addEventListener('click', (ev) => { ev.stopPropagation(); toScreen(card.dataset.id); });
    if (con) con.addEventListener('click', (ev) => { ev.stopPropagation(); openModal(card.dataset.id); });
    // 3D tilt theo con trỏ (chỉ trên thiết bị có chuột)
    if (tiltOK) {
      const MAXT = 10; // độ nghiêng tối đa
      card.addEventListener('mousemove', (ev) => {
        const r = card.getBoundingClientRect();
        const px = (ev.clientX - r.left) / r.width - 0.5;
        const py = (ev.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--ry', (px * MAXT).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-py * MAXT).toFixed(2) + 'deg');
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    }
  });
}

/* ---------------- FAQ ---------------- */
function renderFaq() {
  const list = $('#faqList'); if (!list) return;
  const items = FAQ[state.lang] || FAQ.vi;
  list.innerHTML = items.map((it) => `
    <div class="faq-item">
      <button class="faq-q" aria-expanded="false"><span>${it.q}</span><span class="faq-icon">+</span></button>
      <div class="faq-a"><p>${it.a}</p></div>
    </div>`).join('');
  $$('#faqList .faq-q').forEach((btn) => btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const open = item.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.querySelector('.faq-icon').textContent = open ? '–' : '+';
  }));
}

/* ---------------- MODAL ---------------- */
function openModal(id) {
  const w = state.wallpapers.find((x) => x.id === id); if (!w) return;
  const video = $('#modalVideo');
  video.src = w.preview; video.poster = w.poster; video.play().catch(() => {});
  $('#modalTitle').textContent = w.title[state.lang] || w.title.vi;
  $('#modalCat').textContent = t('cat.' + w.category);
  $('#modalZalo').href = CONTACT.zaloUrl;
  $('#modalTiktok').href = CONTACT.tiktokUrl;
  $('#modal').hidden = false; document.body.style.overflow = 'hidden';
}
function closeModal() {
  const video = $('#modalVideo'); video.pause(); video.removeAttribute('src'); video.load();
  $('#modal').hidden = true; document.body.style.overflow = '';
}
function openSettings() { $('#settingsPanel').hidden = false; }
function closeSettings() { $('#settingsPanel').hidden = true; }

/* ---------------- reviews (đánh giá khách hàng) ---------------- */
const REVIEWS = ['fb1', 'fb2', 'fb3', 'fb4', 'fb5', 'fb6', 'fb7', 'fb8', 'fb9'];
function renderReviews() {
  const box = $('#reviewsStack'); if (!box) return;
  box.innerHTML = REVIEWS.map((f, i) => `
    <figure class="stack-card" data-src="assets/img/feedback/${f}.jpg">
      <img src="assets/img/feedback/${f}.jpg" alt="Đánh giá khách hàng ${i + 1}" draggable="false" loading="lazy" />
      <button class="stack-full" data-full type="button" aria-label="Xem đầy đủ">⤢</button>
    </figure>`).join('');

  const cards = $$('#reviewsStack .stack-card');
  const N = cards.length; if (!N) return;
  const narrow = window.innerWidth <= 560;
  const SPREAD = narrow ? 3 : 5;              // xòe quạt: góc nghiêng
  const GAP_X = narrow ? 9 : 20;              // lệch ngang (nhỏ hơn trên mobile để không tràn)
  const GAP_Y = 4;                            // lệch dọc
  let order = cards.map((_, i) => i);         // order[0] = lá trên cùng
  let popped = false, timer = null;

  const layout = () => {
    order.forEach((cardIdx, pos) => {
      const el = cards[cardIdx];
      const top = pos === 0;
      if (top && popped) {
        el.style.transform = 'translate(-50%, -30%) rotate(0deg) scale(1.14)';
        el.style.zIndex = 100;
        el.classList.add('is-popped'); el.classList.remove('is-top');
      } else if (top) {
        el.style.transform = 'translate(-50%, 0) rotate(0deg) scale(1)';
        el.style.zIndex = N; el.classList.remove('is-popped'); el.classList.add('is-top');
      } else {
        // các lá sau xòe đối xứng hai bên phía sau lá trên cùng
        const side = pos % 2 === 1 ? 1 : -1;
        const mag = Math.ceil(pos / 2);
        const x = side * mag * GAP_X, y = mag * GAP_Y;
        el.style.transform = `translate(calc(-50% + ${x}px), ${y}px) rotate(${side * mag * SPREAD}deg) scale(${1 - pos * 0.015})`;
        el.style.zIndex = N - pos;
        el.classList.remove('is-popped', 'is-top');
      }
    });
  };
  const advance = () => { clearTimeout(timer); popped = false; order = [...order.slice(1), order[0]]; layout(); };
  const pop = () => { popped = true; layout(); clearTimeout(timer); timer = setTimeout(advance, 2600); };

  box.addEventListener('click', (e) => {
    const card = e.target.closest('.stack-card'); if (!card) return;
    if (order.indexOf(cards.indexOf(card)) !== 0) return;   // chỉ lá trên cùng bấm được
    if (e.target.closest('[data-full]')) { clearTimeout(timer); openLightbox(card.dataset.src); return; }
    if (popped) advance(); else pop();
  });
  layout();
}
function openLightbox(src) {
  const lb = $('#lightbox'), img = $('#lightboxImg'); if (!lb || !img) return;
  img.src = src; lb.hidden = false; document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  const lb = $('#lightbox'); if (!lb || lb.hidden) return;
  lb.hidden = true; $('#lightboxImg').src = ''; document.body.style.overflow = '';
}

/* ---------------- setters ---------------- */
function setLang(l) { state.lang = l; localStorage.setItem('dc_lang', l); applyI18n(); renderPreviewGallery(); renderChips(); renderGallery(); renderFaq(); }
function setTheme(t2) { state.theme = t2; localStorage.setItem('dc_theme', t2); applyTheme(); }
function setView(v) {
  state.view = v; localStorage.setItem('dc_view', v);
  $$('#viewToggle button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  renderGallery();
}

/* ---------------- perspective fit: warp the live wallpaper onto the angled monitor ---------------- */
// 4 góc màn hình (tỉ lệ theo ảnh hero-desk.jpg 768x890). Chỉnh ở đây để căn khít.
const MON = { tl: [0.1302, 0.0926], tr: [0.5000, 0.0741], br: [0.5000, 0.4259], bl: [0.1354, 0.5185] };
function adjugate(m) { return [
  m[4]*m[8]-m[5]*m[7], m[2]*m[7]-m[1]*m[8], m[1]*m[5]-m[2]*m[4],
  m[5]*m[6]-m[3]*m[8], m[0]*m[8]-m[2]*m[6], m[2]*m[3]-m[0]*m[5],
  m[3]*m[7]-m[4]*m[6], m[1]*m[6]-m[0]*m[7], m[0]*m[4]-m[1]*m[3] ]; }
function multmm(a, b) { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { let s = 0; for (let k = 0; k < 3; k++) s += a[3*i+k]*b[3*k+j]; r[3*i+j] = s; } return r; }
function multmv(m, v) { return [ m[0]*v[0]+m[1]*v[1]+m[2]*v[2], m[3]*v[0]+m[4]*v[1]+m[5]*v[2], m[6]*v[0]+m[7]*v[1]+m[8]*v[2] ]; }
function basisToPoints(p) {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1];
  const v = multmv(adjugate(m), [p[3][0], p[3][1], 1]);
  return multmm(m, [v[0],0,0, 0,v[1],0, 0,0,v[2]]);
}
function projection(src, dst) { return multmm(basisToPoints(dst), adjugate(basisToPoints(src))); }
function fitMonitor() {
  const frame = $('#heroStage'); const quad = $('#screenQuad');
  if (!frame || !quad) return;
  const W = frame.clientWidth, H = frame.clientHeight;
  if (!W || !H) return;
  const c = [MON.tl, MON.tr, MON.br, MON.bl].map(([fx, fy]) => [fx*W, fy*H]);
  const minX = Math.min(...c.map(p=>p[0])), minY = Math.min(...c.map(p=>p[1]));
  const maxX = Math.max(...c.map(p=>p[0])), maxY = Math.max(...c.map(p=>p[1]));
  const bw = maxX-minX, bh = maxY-minY;
  quad.style.left = minX+'px'; quad.style.top = minY+'px'; quad.style.width = bw+'px'; quad.style.height = bh+'px';
  const src = [[0,0],[bw,0],[bw,bh],[0,bh]];
  const dst = c.map(p => [p[0]-minX, p[1]-minY]);
  const t = projection(src, dst);
  for (let i = 0; i < 9; i++) t[i] /= t[8];
  quad.style.transform = 'matrix3d(' + [t[0],t[3],0,t[6], t[1],t[4],0,t[7], 0,0,1,0, t[2],t[5],0,t[8]].join(',') + ')';
  // on phones, pan the whole scene so the monitor (left of centre) is centred → "zoom into the computer"
  if (window.innerWidth <= 760) {
    const monCX = ((MON.tl[0] + MON.tr[0] + MON.br[0] + MON.bl[0]) / 4) * W;
    frame.style.transform = `translate(calc(-50% + ${Math.round(W / 2 - monCX)}px), -46%)`;
  } else {
    frame.style.transform = 'translate(-50%, -50%)';
  }
}
function initMonitorFit() {
  fitMonitor();
  window.addEventListener('resize', fitMonitor);
  const frame = $('#heroStage');
  if (frame && window.ResizeObserver) new ResizeObserver(fitMonitor).observe(frame);
  const bg = $('#heroBg'); if (bg) bg.addEventListener('loadeddata', fitMonitor);
  setTimeout(fitMonitor, 300); setTimeout(fitMonitor, 900);
  window.MON = MON; window.fitMonitor = fitMonitor; // để tinh chỉnh trực tiếp
}

/* ---------------- living-scene dust particles ---------------- */
function initDust() {
  const box = $('#dust'); if (!box) return;
  const N = 16;
  let html = '';
  for (let i = 0; i < N; i++) {
    const left = Math.random() * 100;
    const bottom = 20 + Math.random() * 60;      // start in the mid/lower scene
    const dur = 6 + Math.random() * 9;
    const delay = -Math.random() * dur;
    const size = 1.5 + Math.random() * 2.5;
    html += `<span class="dust" style="left:${left}%;top:${bottom}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s"></span>`;
  }
  box.innerHTML = html;
}

/* ---------------- reveal on scroll ---------------- */
function initReveal() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  $$('.reveal').forEach((el) => io.observe(el));
  // subtle parallax on hero glow follows mouse
  const glow = $('.hero-bg-glow');
  window.addEventListener('mousemove', (e) => {
    if (!glow) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 24;
    const y = (e.clientY / window.innerHeight - 0.5) * 16;
    glow.style.transform = `translate(calc(-50% + ${x}px), ${y}px)`;
  });
}

/* ---------------- events ---------------- */
function wireEvents() {
  $('#langBtn').addEventListener('click', () => setLang(state.lang === 'vi' ? 'en' : 'vi'));
  $('#themeBtn').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  $('#settingsBtn').addEventListener('click', openSettings);
  const sq = $('#screenQuad'); if (sq) sq.addEventListener('click', () => { if (state.current) openModal(state.current); });
  $('#searchInput').addEventListener('input', (e) => { state.search = e.target.value; state.page = 1; renderGallery(); });
  $$('#viewToggle button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  $$('[data-close-settings]').forEach((el) => el.addEventListener('click', closeSettings));
  const lb = $('#lightbox');
  if (lb) lb.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('[data-lb-close]')) closeLightbox(); });
  $$('#segLang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $$('#segTheme button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeVal)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSettings(); closeLightbox(); } });
}

/* ---------------- visit counter (free hosted counter, no backend) ---------------- */
async function initVisits() {
  const box = $('#footerVisits'), el = $('#visitCount');
  if (!box || !el) return;
  const base = 'https://abacus.jasoncameron.dev';
  const key = 'desktopchill/visits';
  let counted = false;
  try { counted = !!sessionStorage.getItem('dc_counted'); } catch {}
  try {
    const res = await fetch(`${base}/${counted ? 'get' : 'hit'}/${key}`, { cache: 'no-store' });
    const data = await res.json();
    const n = data.value ?? data.count ?? data.Count;
    if (typeof n === 'number' && isFinite(n)) {
      el.textContent = n.toLocaleString('vi-VN');
      box.hidden = false;
      if (!counted) { try { sessionStorage.setItem('dc_counted', '1'); } catch {} }
    }
  } catch { /* dịch vụ đếm lỗi → ẩn, không ảnh hưởng trang */ }
}

/* ---------------- UI enhancements (học từ React Bits / Aceternity / Lenis) ---------------- */
// Thanh tiến trình cuộn ở đỉnh trang
function initScrollProgress() {
  const bar = $('#scrollProgress'); if (!bar) return;
  let ticking = false;
  const update = () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(window.scrollY / h, 1) : 0})`;
    ticking = false;
  };
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}
// Số đếm tăng dần khi dải thông số lọt vào màn hình
function initCountUp() {
  const nums = $$('.stat-num[data-to]'); if (!nums.length) return;
  const run = (el) => {
    const to = parseInt(el.dataset.to, 10) || 0, suffix = el.dataset.suffix || '', dur = 1100, t0 = performance.now();
    const step = (t) => {
      const k = Math.min((t - t0) / dur, 1), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * eased) + suffix;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: 0.6 });
  nums.forEach((n) => io.observe(n));
}
// Marquee dải vibe chạy ngang (nhân đôi để lặp liền mạch)
function initMarquee() {
  const box = $('#marquee'); if (!box) return;
  const items = ['Anime', 'Phong cảnh', 'Game', 'Girl', 'Lofi · Chill', 'Cyberpunk', 'Trừu tượng', 'Thú cưng', 'Minimal', 'Đồng hồ · Lịch', 'Nhạc nền', 'Custom theo yêu cầu'];
  const one = items.map((t) => `<span class="mq-item">${t}</span>`).join('<span class="mq-dot">✦</span>');
  box.innerHTML = `<div class="marquee-track">${one}<span class="mq-dot">✦</span>${one}<span class="mq-dot">✦</span></div>`;
}
// Text reveal: tách chữ theo từ, hiện dần khi cuộn tới (chạy 1 lần)
function initTextReveal() {
  const targets = $$('.section-title'); if (!targets.length) return;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target; io.unobserve(el);
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w, i) => `<span class="rw" style="transition-delay:${i * 55}ms">${w}</span>`).join(' ');
    requestAnimationFrame(() => el.classList.add('rw-in'));
  }, { threshold: 0.4 }));
  targets.forEach((t) => io.observe(t));
}
// Spotlight sáng theo con trỏ trên thẻ giá
function initCardSpotlight() {
  const card = $('.pricing-card'); if (!card) return;
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  });
}
/* ---------------- init ---------------- */
async function init() {
  applyTheme(); wireContacts(); wireEvents();
  $$('#viewToggle button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));
  try {
    const res = await fetch('data/wallpapers.json', { cache: 'no-cache' });
    state.wallpapers = (await res.json()).wallpapers || [];
  } catch (err) { console.error('Không tải được danh sách:', err); state.wallpapers = []; }
  applyI18n();
  const sc = $('#statCount'); if (sc && state.wallpapers.length) sc.dataset.to = state.wallpapers.length;
  renderPreviewGallery();
  renderChips();
  renderGallery();
  renderReviews();
  renderFaq();
  initMonitorFit();
  initReveal();
  initVisits();
  initScrollProgress();
  initCountUp();
  initCardSpotlight();
  initMarquee();
  initTextReveal();
}
init();
