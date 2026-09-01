import { I18N, CATEGORIES, CONTACT, FAQ } from './i18n.js';

const state = {
  lang: localStorage.getItem('dc_lang') || 'vi',
  theme: localStorage.getItem('dc_theme') || 'dark',
  view: localStorage.getItem('dc_view') || 'grid',
  category: 'all',
  search: '',
  wallpapers: [],
  current: null,
};

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
  $('#zaloPhone').textContent = CONTACT.zaloPhone;
  $('#tiktokHandle').textContent = CONTACT.tiktokHandle;
  $('#year').textContent = new Date().getFullYear();
}

/* ---------------- HERO live preview ---------------- */
function featured() {
  const hot = state.wallpapers.filter((w) => w.hot);
  return (hot.length >= 4 ? hot : state.wallpapers.slice(0, 8));
}
function renderPreviewGallery() {
  const track = $('#pgTrack');
  const items = featured();
  track.innerHTML = items.map((w) => `
    <button class="pg-thumb" data-id="${w.id}" style="--thumb-color:${w.color}">
      <img src="${w.poster}" alt="${w.title[state.lang] || w.title.vi}" loading="lazy" />
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
  const items = filtered();
  $('#galleryEmpty').hidden = items.length > 0;
  grid.innerHTML = items.map((w, i) => {
    const title = w.title[state.lang] || w.title.vi;
    return `
      <article class="card" data-id="${w.id}" data-preview="${w.preview}" style="animation-delay:${Math.min(i, 12) * 0.03}s">
        <div class="card-media">
          <img src="${w.poster}" alt="${title}" loading="lazy" />
          ${w.hot ? `<span class="card-hot">${t('card.hot')}</span>` : ''}
        </div>
        <div class="card-info">
          <span class="card-title">${title}</span>
          <span class="card-tag">${t('cat.' + w.category)}</span>
        </div>
      </article>`;
  }).join('');
  wireCards();
}
function wireCards() {
  $$('#galleryGrid .card').forEach((card) => {
    const media = $('.card-media', card);
    const play = () => {
      if ($('video', media)) return;
      const v = document.createElement('video');
      v.src = card.dataset.preview; v.loop = v.muted = v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      media.appendChild(v);
      requestAnimationFrame(() => card.classList.add('playing'));
      v.play().catch(() => {});
    };
    const stop = () => { card.classList.remove('playing'); const v = $('video', media); if (v) v.remove(); };
    card.addEventListener('mouseenter', play);
    card.addEventListener('mouseleave', stop);
    card.addEventListener('click', () => openModal(card.dataset.id));
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

/* ---------------- setters ---------------- */
function setLang(l) { state.lang = l; localStorage.setItem('dc_lang', l); applyI18n(); renderChips(); renderGallery(); renderFaq(); }
function setTheme(t2) { state.theme = t2; localStorage.setItem('dc_theme', t2); applyTheme(); }
function setView(v) {
  state.view = v; localStorage.setItem('dc_view', v);
  $$('#viewToggle button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
  renderGallery();
}

/* ---------------- perspective fit: warp the live wallpaper onto the angled monitor ---------------- */
// 4 góc màn hình (tỉ lệ theo ảnh hero-desk.jpg 768x890). Chỉnh ở đây để căn khít.
const MON = { tl: [0.1406, 0.4371], tr: [0.5026, 0.4258], br: [0.5026, 0.5652], bl: [0.1406, 0.6180] };
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
  const frame = $('.stage-frame'); const quad = $('#screenQuad');
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
}
function initMonitorFit() {
  fitMonitor();
  window.addEventListener('resize', fitMonitor);
  const frame = $('.stage-frame');
  if (frame && window.ResizeObserver) new ResizeObserver(fitMonitor).observe(frame);
  const desk = $('.desk-img'); if (desk && !desk.complete) desk.addEventListener('load', fitMonitor);
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
  $('#searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderGallery(); });
  $$('#viewToggle button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  $$('[data-close-settings]').forEach((el) => el.addEventListener('click', closeSettings));
  $$('#segLang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $$('#segTheme button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeVal)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeSettings(); } });
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
  renderChips();
  renderGallery();
  renderFaq();
  initReveal();
}
init();
