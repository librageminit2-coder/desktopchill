// Tiện ích giao diện: định dạng số, biểu tượng, điểm số, vòng tròn, sparkline, toast, modal.
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(+x);

export const fmtP = (p) => (!ok(p) ? '—' : p >= 1000 ? Math.round(p).toLocaleString('vi-VN') : (+p).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fmtIdx = (p) => (!ok(p) ? '—' : (+p).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fmtChg = (ch, price) => (!ok(ch) ? '' : (ch > 0 ? '+' : ch < 0 ? '−' : '') + (price >= 1000 ? Math.round(Math.abs(ch)).toLocaleString('vi-VN') : Math.abs(ch).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
export const fmtPct = (x, d = 2, sign = true) => (!ok(x) ? '—' : (sign && x > 0 ? '+' : '') + x.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
export const fmtN = (x, d = 0) => (!ok(x) ? '—' : (+x).toLocaleString('vi-VN', { maximumFractionDigits: d }));
export function fmtTy(x, d) {
  if (!ok(x)) return '—'; const a = Math.abs(x);
  if (a >= 1e12) return (x / 1e12).toLocaleString('vi-VN', { maximumFractionDigits: d ?? 2 }) + ' nghìn tỷ';
  if (a >= 1e9) return (x / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: d ?? (a >= 1e11 ? 0 : 1) }) + ' tỷ';
  if (a >= 1e6) return (x / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + ' tr';
  return Math.round(x).toLocaleString('vi-VN');
}
export const cls = (x) => (!ok(x) || x === 0 ? 'ref' : x > 0 ? 'up' : 'down');
export function priceCls(b) { // màu theo quy ước bảng điện VN
  if (!b || !(b.price > 0)) return 'ref';
  if (b.price >= b.ceil) return 'ceil'; if (b.price <= b.floor) return 'floor';
  return b.price > b.ref ? 'up' : b.price < b.ref ? 'down' : 'ref';
}
export const vClass = (v) => 's-' + (v?.key || 'neu');
export const dateVN = (t) => new Date(t * 1000).toLocaleDateString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
export const timeVN = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const HZ = { short: 'Ngắn hạn', mid: 'Trung hạn', long: 'Dài hạn' };
export const HZ_SUB = { short: '1–2 tuần', mid: '1–3 tháng', long: '6–12 tháng' };

const P = {
  market: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  spark: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>',
  bookmark: '<path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  back: '<path d="m15 18-6-6 6-6"/>', trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>', alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>', arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
export const ico = (k, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${P[k] || ''}</svg>`;
export const LOGO = `<svg viewBox="551 166 280 276" fill="currentColor" aria-hidden="true"><path d="M728.48,408.08c-22.34,0.2-43.4-5.69-63.92-13.79c-4.25-1.68-6.22-1.18-8.5,2.94c-10.46,18.83-26.47,30.39-47.97,32.34c-22.59,2.05-41.91-15.19-44.5-38.13c-2.75-24.32,11.8-44.99,34.66-48.89c12.1-2.06,24.08-1.84,35.65,3.15c4.59,1.98,6.12,0.93,7.12-3.85c5.13-24.49,6.39-49.38,7.8-74.27c0.16-2.8-0.99-3.34-3.42-3.43c-9.48-0.37-18.92-1.19-28.1-3.83c-8.57-2.47-16.65-5.96-22.99-12.43c-15.54-15.84-12.43-39.16,6.84-52.88c13.49-9.6,28.81-13.66,45-14.28c32.26-1.22,62.68,6.15,91.28,21.03c2.4,1.25,4.11,1.14,6.37-0.21c8.48-5.05,16.03-11.29,23.26-17.92c5.14-4.71,10.83-7.04,17.79-4.93c11.74,3.56,15.49,17.44,7.11,26.97c-4.83,5.49-10.18,10.5-16.21,14.72c-4.91,3.44-4.75,3.32-0.66,7.36c22.49,22.17,38.13,48.03,42.79,79.79c8.28,56.42-29.83,100.52-86.92,100.54C730.15,408.08,729.31,408.08,728.48,408.08z M731.71,374.93c1.87-0.13,4.53-0.18,7.17-0.52c16.72-2.13,31.13-8.35,40.15-23.51c7.78-13.08,8.7-27.38,6.38-41.99c-4.57-28.73-21.88-49.21-43.77-66.63c-1.59-1.27-3.01-0.9-4.61-0.18c-16.26,7.31-33.26,12.32-50.62,16.18c-2.81,0.63-3.77,1.89-3.86,4.71c-0.27,8.13-0.7,16.26-1.28,24.38c-1.68,23.55-4.07,47-9.61,70.02c-0.49,2.04-0.41,3.38,1.87,4.32C691.94,369.27,710.76,374.98,731.71,374.93z M696.95,221.38c-1.19-0.88-1.53-1.3-1.97-1.43c-18.69-5.35-37.6-8.33-57.05-5.16c-5.96,0.97-11.61,2.83-16.62,6.33c-4.08,2.85-3.99,4.15,0.52,6.49c3.14,1.63,6.54,2.31,10.01,2.85c14.22,2.24,28.12-0.21,41.96-2.94C681.39,226.03,689.03,224.58,696.95,221.38z M596.41,386.32c0.08,8.48,5.49,12.26,13.58,9.79c8.21-2.5,13.15-8.58,17.6-15.31c0.93-1.41,0.75-2.6-0.92-3.1c-7.12-2.15-14.23-4.68-21.85-2.6C598.86,376.73,596.35,380.13,596.41,386.32z"/></svg>`;

export function scoreCell(x, dim = false) {
  if (!x) return '<span class="faint">—</span>';
  return `<span class="score ${vClass(x.verdict)}${dim ? ' dimmed' : ''}" title="${esc(x.verdict.label)}"><span class="bar"><i style="width:${x.score}%"></i></span><b class="num">${Math.round(x.score)}</b></span>`;
}
export function ring(score, size = 68, stroke = 7) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" role="img" aria-label="Điểm ${Math.round(score)}/100"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="color-mix(in srgb, var(--text) 10%, transparent)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--sc)" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="var(--text)" font-weight="800" font-size="${size * 0.3}" font-family="Plus Jakarta Sans">${Math.round(score)}</text></svg>`;
}
export function spark(vals, w = 96, h = 28) {
  const a = vals.filter(ok); if (a.length < 2) return '';
  const mn = Math.min(...a), mx = Math.max(...a), k = mx - mn || 1;
  const pts = a.map((v, i) => `${((i / (a.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / k) * (h - 4)).toFixed(1)}`).join(' ');
  const col = a[a.length - 1] >= a[0] ? 'var(--up)' : 'var(--down)';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
export const avatar = (sym) => `<span class="av">${esc(sym.slice(0, 3))}</span>`;

let toastT = null;
export function toast(msg, kind = 'ok') {
  document.querySelector('.toast')?.remove(); clearTimeout(toastT);
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.setAttribute('role', 'status');
  el.innerHTML = ico(kind === 'ok' ? 'check' : 'alert') + `<span>${esc(msg)}</span>`;
  document.body.appendChild(el); toastT = setTimeout(() => el.remove(), 3400);
}
export function modal({ title, body, actions = [] }) {
  return new Promise((resolve) => {
    const back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Đóng">${ico('x')}</button></div><div class="modal-b">${body}</div><div class="modal-f">${actions.map((a, i) => `<button class="btn ${a.kind || 'ghost'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
    const close = (v) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    back.addEventListener('click', async (e) => {
      if (e.target === back || e.target.closest('[data-x]')) return close(null);
      const b = e.target.closest('[data-i]'); if (!b) return;
      const a = actions[+b.dataset.i];
      if (a.run) { b.disabled = true; try { const v = await a.run(back); if (v !== false) close(v ?? a.value ?? true); } catch (err) { toast(err.message, 'err'); } finally { b.disabled = false; } }
      else close(a.value ?? true);
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(back);
    setTimeout(() => back.querySelector('input,textarea,button.primary')?.focus(), 50);
  });
}
