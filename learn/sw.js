// desktopchill learn — service worker (v21): mở lại trang gần như tức thì.
// • Tệp có số phiên bản (?v=…: js, css, dữ liệu khoá học) và ảnh / font: lấy từ bộ nhớ đệm trước, chỉ tải mạng khi chưa có.
// • Trang HTML: thử mạng trước (tối đa 3 giây) để luôn nhận bản mới; mất mạng thì dùng bản đã lưu.
// • Video hình nền (.mp4) và máy chủ dữ liệu (Supabase) đi thẳng mạng, không qua đây → chất lượng hình nền giữ nguyên.
const CACHE = 'dcl-learn-v27';
const KEEP = [CACHE, 'dcl-fonts'];

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const fromCache = async (req, name = CACHE) => {
  const c = await caches.open(name), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) c.put(req, res.clone()).catch(() => {}); // không lưu phản hồi opaque (tốn bộ nhớ)
  return res;
};
const networkFirst = async (req) => {
  const c = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 3000))]);
    if (res && res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  }
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  // font Google / font chữ Hán: lưu lâu dài
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(u.hostname)) { e.respondWith(fromCache(req, 'dcl-fonts')); return; }
  if (u.origin !== location.origin || !u.pathname.startsWith('/learn/')) return;
  if (/\.(mp4|webm)$/i.test(u.pathname) || req.headers.has('range')) return; // video: để trình duyệt tự xử lý (hỗ trợ tua / Range)
  if (req.mode === 'navigate' || /\/learn\/(index\.html)?$/.test(u.pathname)) { e.respondWith(networkFirst(req)); return; }
  if (u.search.includes('v=') || /\.(jpg|jpeg|png|webp|svg|ico|woff2?)$/i.test(u.pathname) || /\/vendor\//.test(u.pathname)) { e.respondWith(fromCache(req)); return; }
});
