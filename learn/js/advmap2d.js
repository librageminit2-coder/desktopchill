// v27: bản đồ Adventure 2D — ảnh nền dựng sẵn bằng Blender (Cycles) theo ảnh mẫu "Bestie Map":
// sông ngọc uốn lượn, bờ kem bo tròn, cây nỉ, đá đất sét, nhà gỗ, cầu ván, chùa trên đá…
// Trang chỉ hiển thị ảnh (cắt thành nhiều ô, tải dần) + lớp tương tác: boss (ảnh 3D render sẵn), huy hiệu, sao,
// avatar, biển tên vùng, sương mù vùng khoá. Cuộn dọc tự nhiên (chuột, kéo, vuốt), mờ tilt-shift ở mép trên/dưới.
const BASE = 'media/advmap/';
let J0 = null;
async function meta() {
  if (!J0) J0 = fetch(BASE + 'map.json?v=1').then((r) => { if (!r.ok) throw new Error('map'); return r.json(); }).catch((e) => { J0 = null; throw e; });
  return J0;
}
export function supported() { return true; }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const av = (who) => { const a = who && who.avatar ? String(who.avatar) : ''; return /^data:image|^https?:/.test(a) ? `<img src="${a}" alt="">` : a ? `<span>${esc(a)}</span>` : `<b>${esc(((who && who.name) || 'You').trim().slice(0, 1).toUpperCase())}</b>`; };

export async function mount(host, o) {
  const J = await meta();
  const N = Math.min(o.regions.length, J.regions.length), R = J.regions.slice(0, N);
  const top = Math.max(0, Math.round(R[N - 1].y1 - 240)), bot = J.h;      // phần ảnh dùng cho bản đồ này (vùng 1 ở dưới)
  host.classList.add('is2d');
  host.innerHTML = `<div class="a2-vp" tabindex="0" aria-label="Adventure map. Scroll to travel up the map."><div class="a2-w"></div></div><div class="a2-tilt t1" aria-hidden="true"></div><div class="a2-tilt t2" aria-hidden="true"></div><div class="a2-tilt b1" aria-hidden="true"></div><div class="a2-tip" aria-hidden="true"></div>`;
  const vp = host.querySelector('.a2-vp'), W = host.querySelector('.a2-w'), tip = host.querySelector('.a2-tip');
  let s = 1, live = true;
  // ---- ảnh nền (ô cắt sẵn; điện thoại dùng bản 960px) ----
  const tiles = J.tiles.filter((t) => t.y + t.h > top).map((t) => {
    const im = new Image(); im.className = 'a2-t'; im.alt = ''; im.decoding = 'async'; im.loading = 'lazy'; im.draggable = false;
    W.appendChild(im); return { t, im };
  });
  // ---- boss, bệ, huy hiệu ----
  const nodes = J.nodes.filter((d) => d.r <= N);
  const els = nodes.map((d) => {
    const name = d.n === 6 ? o.regions[d.r - 1].king : o.regions[d.r - 1].boss[d.n - 1];
    const st = o.stars(d.r, d.n), ok = o.open(d.r, d.n), reg = o.regionOpen(d.r);
    const b = document.createElement('button'); b.type = 'button';
    b.className = `a2-n ${st ? 'beat' : ok ? 'open' : 'shut'} ${d.n === 6 ? 'king' : ''}`; b.setAttribute('aria-label', `${name}${st ? `, ${st} stars` : ok ? ', ready' : ', locked'}`);
    b.innerHTML = `<span class="a2-sh"></span><img class="a2-boss" alt="" loading="lazy" draggable="false" src="${BASE}boss/${o.map}-${d.r}-${d.n}.webp?v=1"><span class="a2-bd"><i class="a2-b">${st ? '✓' : ok ? '✕' : '🔒'}</i>${st ? `<em class="a2-st">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</em>` : ''}</span>`;
    b.addEventListener('click', () => { if (moved > 6) return; if (!reg) o.onLocked(d.r); else o.onBoss(d.r, d.n); });
    b.addEventListener('pointerenter', () => { tip.textContent = name; tip.dataset.k = `${d.r}-${d.n}`; place(); tip.classList.add('on'); });
    b.addEventListener('pointerleave', () => tip.classList.remove('on'));
    W.appendChild(b); return { d, b, name };
  });
  const signs = R.map((g, i) => { const el = document.createElement('div'); el.className = 'a2-sign'; el.innerHTML = `<b>${esc(o.regions[i].name)}</b><small>${esc(o.regions[i].lv)} · ${esc(o.regions[i].diff)}</small>`; W.appendChild(el); return el; });
  // sương mù phủ các vùng chưa mở (từ vùng khoá đầu tiên trở lên)
  let firstLocked = 0; for (let r = 1; r <= N; r++) if (!o.regionOpen(r)) { firstLocked = r; break; }
  let fog = null;
  if (firstLocked) {
    fog = document.createElement('div'); fog.className = 'a2-fog';
    const prev = o.regions[firstLocked - 2];
    fog.addEventListener('click', () => o.onLocked(firstLocked)); W.appendChild(fog);
    var lockEl = document.createElement('button'); lockEl.type = 'button'; lockEl.className = 'a2-lock'; lockEl.innerHTML = `<i>🔒</i><small>Beat ${esc(prev ? prev.king : '')} to open</small>`;
    lockEl.addEventListener('click', () => o.onLocked(firstLocked)); W.appendChild(lockEl);
  }
  const pin = document.createElement('div'); pin.className = 'a2-pin'; pin.innerHTML = `<span class="a2-av">${av(o.me)}</span>${o.mate ? `<i class="a2-heart">💗</i><span class="a2-av mate">${av(o.mate)}</span>` : ''}`; W.appendChild(pin);
  const cur = o.cur ? nodes.find((d) => d.r === o.cur[0] && d.n === o.cur[1]) : null;

  function place() {
    const w = Math.max(280, vp.clientWidth); s = w / J.w;
    const big = w * (devicePixelRatio || 1) > 1100;
    W.style.height = `${(bot - top) * s}px`;
    tiles.forEach(({ t, im }) => {
      const src = `${BASE}${big ? t.f : t.m}?v=1`; if (im.getAttribute('src') !== src) im.src = src;
      im.style.top = `${(t.y - top) * s}px`; im.style.height = `${t.h * s + 1}px`;
    });
    const P = (x, y) => `translate(${(x * s).toFixed(1)}px,${((y - top) * s).toFixed(1)}px)`;
    els.forEach(({ d, b }) => {
      const k = d.n === 6 ? 1.25 : 1; b.style.transform = P(d.boss[0], d.boss[1]); b.style.setProperty('--bw', `${(d.rx * 1.05 * k * s).toFixed(1)}px`);
      b.style.setProperty('--dy', `${((d.front[1] - d.boss[1]) * s).toFixed(1)}px`);
    });
    signs.forEach((el, i) => { const hw = el.offsetWidth / 2 + 10, x = Math.min(w - hw, Math.max(hw, R[i].sign[0] * s)); el.style.transform = `translate(${x.toFixed(1)}px,${((R[i].sign[1] - top) * s).toFixed(1)}px)`; });
    if (fog) { const yb = R[firstLocked - 1].y0 - 60; fog.style.top = '0px'; fog.style.height = `${Math.max(0, (yb - top) * s)}px`; lockEl.style.top = `${Math.max(0, (yb - top) * s - 140 - 420 * s)}px`; }
    if (cur) { pin.style.display = ''; pin.style.transform = P(cur.boss[0], cur.boss[1] - (cur.n === 6 ? 150 : 115)); } else pin.style.display = 'none';
    const k = tip.dataset.k && els.find((e) => `${e.d.r}-${e.d.n}` === tip.dataset.k); if (k) tip.style.transform = `translate(${(k.d.boss[0] * s).toFixed(1)}px,${((k.d.boss[1] - top) * s - vp.scrollTop - (k.d.n === 6 ? 120 : 92) * s).toFixed(1)}px)`;
  }
  const yOf = (d) => (d.boss[1] - top) * s;
  function glide(y, smooth = true) { vp.scrollTo({ top: Math.max(0, y - vp.clientHeight * 0.58), behavior: smooth ? 'smooth' : 'auto' }); }
  // ---- kéo bằng chuột (cảm ứng đã cuộn tự nhiên) ----
  let drag = null, moved = 0, vel = 0, raf = 0;
  vp.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' || e.button) return; drag = { y: e.clientY, st: vp.scrollTop, t: performance.now(), ly: e.clientY }; moved = 0; vel = 0; cancelAnimationFrame(raf); });
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp);
  function onMove(e) { if (!drag) return; const dy = e.clientY - drag.y; moved = Math.max(moved, Math.abs(dy)); if (moved > 6) { vp.scrollTop = drag.st - dy; vp.classList.add('drag'); const now = performance.now(); vel = (e.clientY - drag.ly) / Math.max(1, now - drag.t) * 16; drag.ly = e.clientY; drag.t = now; } }
  function onUp() { if (!drag) return; drag = null; vp.classList.remove('drag'); setTimeout(() => { moved = 0; }, 0); const step = () => { if (Math.abs(vel) < 0.4 || !live) return; vp.scrollTop -= vel; vel *= 0.93; raf = requestAnimationFrame(step); }; if (Math.abs(vel) > 2) raf = requestAnimationFrame(step); }
  vp.addEventListener('scroll', () => { if (tip.classList.contains('on')) place(); }, { passive: true });
  vp.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'PageUp') { e.preventDefault(); vp.scrollBy({ top: -vp.clientHeight * 0.6, behavior: 'smooth' }); } else if (e.key === 'ArrowDown' || e.key === 'PageDown') { e.preventDefault(); vp.scrollBy({ top: vp.clientHeight * 0.6, behavior: 'smooth' }); } });
  const ro = new ResizeObserver(() => { const f = vp.scrollTop / Math.max(1, W.offsetHeight); place(); vp.scrollTop = f * W.offsetHeight; }); ro.observe(host);
  place(); glide(cur ? yOf(cur) : W.offsetHeight, false);
  function destroy() { if (!live) return; live = false; ro.disconnect(); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); cancelAnimationFrame(raf); }
  return {
    up: () => vp.scrollBy({ top: -vp.clientHeight * 0.7, behavior: 'smooth' }),
    down: () => vp.scrollBy({ top: vp.clientHeight * 0.7, behavior: 'smooth' }),
    home: () => glide(cur ? yOf(cur) : W.offsetHeight),
    destroy,
  };
}
