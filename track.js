/* desktopchill — đếm lượt xem trang nhẹ, không cookie, không dữ liệu cá nhân.
   Lưu: đường dẫn, nguồn giới thiệu (tên miền), loại thiết bị, trình duyệt, hệ điều hành, ngôn ngữ, múi giờ, độ rộng màn hình.
   Mã khách ngẫu nhiên nằm trong localStorage của trình duyệt. Tôn trọng "Do Not Track". */
(function () {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
    if (/^\/admin/.test(location.pathname) || location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;
    var U = 'https://phcmbgaozkaibqsttonc.supabase.co/rest/v1/rpc/site_hit';
    var K = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoY21iZ2FvemthaWJxc3R0b25jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkzODk3NTgsImV4cCI6MjEwNDk2NTc1OH0.Hvs0Gxebog5gcKILnSdT3g6nz6-GI0CEepmMJM0gCxo';
    var rnd = function () { return Math.random().toString(36).slice(2) + Date.now().toString(36); };
    var vid, sid;
    try { vid = localStorage.getItem('dc_vid'); if (!vid) { vid = rnd(); localStorage.setItem('dc_vid', vid); } } catch (e) { vid = rnd(); }
    try { sid = sessionStorage.getItem('dc_sid'); if (!sid) { sid = rnd(); sessionStorage.setItem('dc_sid', sid); } } catch (e) { sid = rnd(); }
    var ua = navigator.userAgent || '';
    var device = /iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) ? 'tablet' : /Mobi|iPhone|Android/i.test(ua) ? 'mobile' : 'desktop';
    var browser = /FBAN|FBAV/i.test(ua) ? 'Facebook app' : /Zalo/i.test(ua) ? 'Zalo app' : /coc_coc/i.test(ua) ? 'Coc Coc' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Other';
    var os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : 'Other';
    var ref = '';
    try { if (document.referrer) { var h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h && h !== location.hostname.replace(/^www\./, '')) ref = h; } } catch (e) {}
    try { var q = new URLSearchParams(location.search); if (q.get('utm_source')) ref = q.get('utm_source'); } catch (e) {}
    var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var path = function () { var p = location.pathname; if (/^\/learn/.test(p) && location.hash) { var seg = location.hash.split('/')[1] || ''; p = p.replace(/\/$/, '') + '/' + (seg ? seg : ''); } return p; };
    var last = '';
    var send = function () {
      var p = path(); if (p === last) return; last = p;
      var body = JSON.stringify({ p: { vid: vid, sid: sid, path: p, ref: ref, device: device, browser: browser, os: os, lang: navigator.language || '', tz: tz, sw: String(screen.width || '') } });
      ref = '';
      try { fetch(U, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', apikey: K, Authorization: 'Bearer ' + K }, body: body }).catch(function () {}); } catch (e) {}
    };
    send();
    addEventListener('hashchange', function () { setTimeout(send, 300); });
  } catch (e) {}
})();
