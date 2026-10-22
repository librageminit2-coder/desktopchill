// Nền: video rừng sương lặp vô hạn (hoặc một hình nền đã sưu tập). Chọn bản 720p cho màn hình nhỏ / mạng yếu, 1080p cho màn lớn.
// Tắt video (chỉ giữ ảnh tĩnh) khi bật "giảm chuyển động", khi tiết kiệm dữ liệu, hoặc người dùng tắt trong Hồ sơ.
const sc = document.querySelector('.scene'), v = document.querySelector('.scene video');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const conn = navigator.connection || {};
let off = false; try { off = localStorage.getItem('dcl_video') === 'off'; } catch (e) {}
let bg = 0; try { bg = +(localStorage.getItem('dcl_bg') || 0) || 0; } catch (e) {}
if (bg === 71) bg = 0; // 71 = rừng sương (nền mặc định, bản 1080p)
// màn lớn dùng bản 1080p (rõ nét), màn nhỏ / mạng yếu dùng bản 720p
const big = () => Math.max(innerWidth, innerHeight) * (devicePixelRatio || 1) > 1500 && !conn.saveData && !/2g/.test(conn.effectiveType || '');
const posterOf = () => (bg ? `media/walls/hd/${bg}.jpg` : 'media/forest-poster.jpg');
function srcOf() {
  if (bg) return big() ? `media/walls/hd/${bg}.mp4` : `media/walls/${bg}.mp4`;
  return big() ? 'media/forest-1080.mp4' : 'media/forest-720.mp4';
}
function paintPoster() { if (sc) sc.style.backgroundImage = `url("${posterOf()}")`; if (v) v.poster = posterOf(); }
export function setVideo(on) {
  try { localStorage.setItem('dcl_video', on ? 'on' : 'off'); } catch (e) {}
  if (!v) return;
  off = !on;
  if (on) start(); else { v.pause(); v.classList.remove('ready'); }
}
// đổi nền sang hình nền đã sưu tập (id) hoặc về rừng (0)
export function setBg(id) {
  bg = +id === 71 ? 0 : +id || 0;
  try { localStorage.setItem('dcl_bg', bg ? String(bg) : ''); } catch (e) {}
  paintPoster();
  if (!v) return;
  v.classList.remove('ready'); v.removeAttribute('src'); v.load();
  if (!off && !reduce && !conn.saveData) start();
}
function start() {
  if (!v) return;
  if (!v.getAttribute('src')) v.src = srcOf();
  v.addEventListener('playing', () => v.classList.add('ready'), { once: true });
  const p = v.play(); if (p && p.catch) p.catch(() => {});
}
paintPoster();
if (v && !reduce && !off && !conn.saveData) {
  if (document.readyState === 'complete') start(); else addEventListener('load', start, { once: true });
  document.addEventListener('visibilitychange', () => { if (!v.getAttribute('src')) return; if (document.hidden) v.pause(); else if (!off) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } });
}
