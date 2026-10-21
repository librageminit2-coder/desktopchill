// Nền: video rừng sương lặp vô hạn. Chọn bản 720p cho màn hình nhỏ / mạng yếu, 1080p cho màn lớn.
// Tắt video (chỉ giữ ảnh tĩnh) khi bật "giảm chuyển động", khi tiết kiệm dữ liệu, hoặc người dùng tắt trong Hồ sơ.
const v = document.querySelector('.scene video');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const conn = navigator.connection || {};
let off = false; try { off = localStorage.getItem('dcl_video') === 'off'; } catch (e) {}
export function setVideo(on) {
  try { localStorage.setItem('dcl_video', on ? 'on' : 'off'); } catch (e) {}
  if (!v) return;
  off = !on;
  if (on) start(); else { v.pause(); v.classList.remove('ready'); }
}
function start() {
  if (!v) return;
  if (!v.src) {
    const big = Math.max(innerWidth, innerHeight) * (devicePixelRatio || 1) > 1500 && !conn.saveData && !/2g/.test(conn.effectiveType || '');
    v.src = big ? 'media/forest-1080.mp4' : 'media/forest-720.mp4';
  }
  v.addEventListener('playing', () => v.classList.add('ready'), { once: true });
  const p = v.play(); if (p && p.catch) p.catch(() => {});
}
if (v && !reduce && !off && !conn.saveData) {
  if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
  document.addEventListener('visibilitychange', () => { if (!v.src) return; if (document.hidden) v.pause(); else if (!off) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } });
}
