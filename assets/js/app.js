import { I18N, CATEGORIES, CONTACT } from './i18n.js';

/* ---------------- STATE ---------------- */
const state = {
  lang: localStorage.getItem('dc_lang') || 'vi',
  theme: localStorage.getItem('dc_theme') || 'dark',
  category: 'all',
  search: '',
  wallpapers: [],
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------- I18N ---------------- */
function t(key) {
  return (I18N[state.lang] && I18N[state.lang][key]) || I18N.vi[key] || key;
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach((el) => {
    const val = t(el.dataset.i18n);
    if (val) el.textContent = val;
  });
  $('#langCode').textContent = state.lang.toUpperCase();
  // update segmented controls
  $$('#segLang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
}

/* ---------------- THEME ---------------- */
function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeIcon').textContent = state.theme === 'dark' ? '🌙' : '☀️';
  $$('#segTheme button').forEach((b) => b.classList.toggle('active', b.dataset.themeVal === state.theme));
}

/* ---------------- CONTACT LINKS ---------------- */
function wireContacts() {
  const zalo = CONTACT.zaloUrl;
  const tiktok = CONTACT.tiktokUrl;
  $('#contactZalo').href = zalo;
  $('#contactTiktok').href = tiktok;
  $('#pricingZalo').href = zalo;
  $('#zaloPhone').textContent = CONTACT.zaloPhone;
  $('#tiktokHandle').textContent = CONTACT.tiktokHandle;
  $('#year').textContent = new Date().getFullYear();
}

/* ---------------- FILTER BAR ---------------- */
function renderFilterBar() {
  const bar = $('#filterBar');
  const present = new Set(state.wallpapers.map((w) => w.category));
  const cats = ['all', ...CATEGORIES.filter((c) => present.has(c))];

  bar.innerHTML = `
    <label class="filter-search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
      <input id="searchInput" type="search" placeholder="${t('filter.search')}" value="${state.search}" />
    </label>` +
    cats.map((c) => {
      const label = c === 'all' ? t('filter.all') : t('cat.' + c);
      return `<button class="chip ${state.category === c ? 'active' : ''}" data-cat="${c}">${label}</button>`;
    }).join('');

  $('#searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderGallery();
  });
  $$('#filterBar .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      state.category = chip.dataset.cat;
      $$('#filterBar .chip').forEach((c) => c.classList.toggle('active', c === chip));
      renderGallery();
    });
  });
}

/* ---------------- GALLERY ---------------- */
function filtered() {
  const q = state.search.trim().toLowerCase();
  return state.wallpapers.filter((w) => {
    if (state.category !== 'all' && w.category !== state.category) return false;
    if (q) {
      const hay = `${w.title.vi} ${w.title.en} ${w.id}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderGallery() {
  const grid = $('#galleryGrid');
  const items = filtered();
  $('#galleryEmpty').hidden = items.length > 0;

  grid.innerHTML = items.map((w, i) => {
    const ratio = (w.h / w.w) * 100;
    const title = w.title[state.lang] || w.title.vi;
    const cat = t('cat.' + w.category);
    return `
      <article class="card" data-id="${w.id}" data-preview="${w.preview}" style="animation-delay:${Math.min(i, 12) * 0.03}s">
        <div class="card-media" style="aspect-ratio:${w.w}/${w.h}">
          <img src="${w.poster}" alt="${title}" loading="lazy" />
          <div class="card-play">▶</div>
        </div>
        <div class="card-overlay">
          <span class="card-badge">${cat}</span>
          <span class="card-title">${title}</span>
        </div>
      </article>`;
  }).join('');

  wireCards();
}

/* ---------------- CARD HOVER VIDEO ---------------- */
function wireCards() {
  $$('#galleryGrid .card').forEach((card) => {
    const media = $('.card-media', card);

    const play = () => {
      if ($('video', media)) return;
      const video = document.createElement('video');
      video.src = card.dataset.preview;
      video.loop = video.muted = video.playsInline = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      media.appendChild(video);
      requestAnimationFrame(() => card.classList.add('playing'));
      video.play().catch(() => {});
    };
    const stop = () => {
      card.classList.remove('playing');
      const video = $('video', media);
      if (video) video.remove();
    };

    card.addEventListener('mouseenter', play);
    card.addEventListener('mouseleave', stop);
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

/* ---------------- MODAL ---------------- */
function openModal(id) {
  const w = state.wallpapers.find((x) => x.id === id);
  if (!w) return;
  const modal = $('#modal');
  const video = $('#modalVideo');
  video.src = w.preview;
  video.poster = w.poster;
  video.play().catch(() => {});
  $('#modalTitle').textContent = w.title[state.lang] || w.title.vi;
  $('#modalCat').textContent = t('cat.' + w.category);
  $('#modalZalo').href = CONTACT.zaloUrl;
  $('#modalTiktok').href = CONTACT.tiktokUrl;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  const modal = $('#modal');
  const video = $('#modalVideo');
  video.pause();
  video.removeAttribute('src');
  video.load();
  modal.hidden = true;
  document.body.style.overflow = '';
}

/* ---------------- SETTINGS PANEL ---------------- */
function openSettings() { $('#settingsPanel').hidden = false; }
function closeSettings() { $('#settingsPanel').hidden = true; }

function setLang(lang) {
  state.lang = lang;
  localStorage.setItem('dc_lang', lang);
  applyI18n();
  renderFilterBar();
  renderGallery();
}
function setTheme(theme) {
  state.theme = theme;
  localStorage.setItem('dc_theme', theme);
  applyTheme();
}

/* ---------------- EVENTS ---------------- */
function wireGlobalEvents() {
  $('#langBtn').addEventListener('click', () => setLang(state.lang === 'vi' ? 'en' : 'vi'));
  $('#themeBtn').addEventListener('click', () => setTheme(state.theme === 'dark' ? 'light' : 'dark'));
  $('#settingsBtn').addEventListener('click', openSettings);

  $$('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  $$('[data-close-settings]').forEach((el) => el.addEventListener('click', closeSettings));
  $$('#segLang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $$('#segTheme button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeVal)));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); closeSettings(); }
  });
}

/* ---------------- INIT ---------------- */
async function init() {
  applyTheme();
  wireContacts();
  wireGlobalEvents();

  try {
    const res = await fetch('data/wallpapers.json', { cache: 'no-cache' });
    const data = await res.json();
    state.wallpapers = data.wallpapers || [];
  } catch (err) {
    console.error('Không tải được danh sách hình nền:', err);
    state.wallpapers = [];
  }

  applyI18n();
  renderFilterBar();
  renderGallery();
}

init();
