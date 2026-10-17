/* desktopchill — bảng Đặt lịch + nút "Đặt ngay".
   Bấm Đặt ngay: copy đơn (máy tính: ảnh đơn, điện thoại: nội dung chữ) rồi mở Zalo 0339903166 của shop. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var ZALO = 'https://zalo.me/0339903166';
  var IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || window.matchMedia('(pointer: coarse)').matches;
  var WP = {}, NWP = 0;
  var st = { when: '', picks: [] }; // chưa chọn = Trao đổi
  var hasForm = !!$('#bkWhen');

  var tT;
  function toast(m) { var el = $('#bkToast'); if (!el) return; el.textContent = m; el.classList.add('show'); clearTimeout(tT); tT = setTimeout(function () { el.classList.remove('show'); }, 2600); }
  function copyText(txt) {
    return new Promise(function (res) {
      function fb() { var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { ta.setSelectionRange(0, txt.length); } catch (e) {} var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); res(ok); }
      try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(function () { res(true); }, fb); else fb(); } catch (e) { fb(); }
    });
  }
  function whenText() { return st.when === 'today' ? 'Hôm nay' : st.when === 'other' ? 'Hôm khác (hẹn ngày sau)' : 'Trao đổi'; }
  function pickText() { return st.picks.length ? 'Tất cả mẫu, cài sẵn mẫu ' + st.picks.join(', ') : 'Tất cả mẫu'; }
  function orderText() {
    return ['Chào shop, mình muốn đặt lịch cài hình nền động:',
      '• Thời gian: ' + whenText(),
      '• Mẫu: ' + pickText(),
      '• Gói trọn gói 175k (giảm từ 300k)'].join('\n');
  }

  function sync() {
    if (!hasForm) return;
    $('#bkWhen').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === st.when ? 'true' : 'false'); });
    $('#bkSWhen').textContent = whenText();
    $('#bkSPick').textContent = st.picks.length ? 'Tất cả + mẫu ' + st.picks.join(', ') : 'Tất cả mẫu';
    refreshSoon();
  }
  if (hasForm) {
    $('#bkWhen').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.when = st.when === b.dataset.v ? '' : b.dataset.v; sync(); });
    $('#bkPicks').addEventListener('input', parsePicks);
    $('#bkPicksView').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var n = +b.dataset.rm; $('#bkPicks').value = st.picks.filter(function (x) { return x !== n; }).join(', '); parsePicks(); });
  }
  /* số mẫu: chỉ nhận số */
  function parsePicks() {
    var el = $('#bkPicks'); if (!el) return;
    var raw = el.value, clean = raw.replace(/[^\d,\s]/g, '');
    if (clean !== raw) el.value = clean;
    var ok = [], bad = [];
    (clean.match(/\d+/g) || []).forEach(function (t) { var n = parseInt(t, 10); if (ok.indexOf(n) > -1 || bad.indexOf(n) > -1) return; if (!NWP || WP[n]) ok.push(n); else bad.push(n); });
    st.picks = ok.slice(0, 12);
    var h = $('#bkPicksHint');
    if (bad.length) { h.className = 'bk-hint err'; h.textContent = 'Không có mẫu số ' + bad.join(', ') + '. Kho đang có mẫu 1 đến ' + NWP + '.'; }
    else { h.className = 'bk-hint'; h.innerHTML = 'Số mẫu ghi trên từng hình trong <a href="#gallery">bộ sưu tập</a>'; }
    $('#bkPicksView').innerHTML = st.picks.map(function (n) {
      var w = WP[n];
      return '<div class="bk-pick">' + (w ? '<img src="' + w.poster + '" alt="Mẫu ' + n + '" loading="lazy" />' : '') + '<span>Mẫu ' + n + '</span><button type="button" data-rm="' + n + '" aria-label="Bỏ mẫu ' + n + '">✕</button></div>';
    }).join('');
    sync();
  }

  /* ảnh đơn (dựng sẵn để bấm là copy được ngay trên máy tính) */
  function loadImg(src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function makeImage() {
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
    var F = '"Plus Jakarta Sans", system-ui, sans-serif';
    var src = st.picks.slice(0, 4).map(function (n) { return WP[n] && WP[n].poster; }).filter(Boolean);
    if (!src.length) { var all = Object.keys(WP).map(function (k) { return WP[k]; }), hot = all.filter(function (w) { return w.hot; }); src = (hot.length >= 4 ? hot : all).slice(0, 4).map(function (w) { return w.poster; }); }
    return (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { return Promise.all(src.map(loadImg)); }).then(function (imgs) {
      var g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1d1517'); g.addColorStop(1, '#0c0c11'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      var rg = x.createRadialGradient(W, 0, 0, W, 0, 720); rg.addColorStop(0, 'rgba(255,106,88,.45)'); rg.addColorStop(1, 'rgba(255,106,88,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.font = '800 44px ' + F; x.fillText('desktop', 72, 112); var dw = x.measureText('desktop').width; x.fillStyle = '#ff7a64'; x.fillText('chill', 72 + dw, 112);
      x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '700 26px ' + F; x.fillText('ĐƠN ĐẶT LỊCH CÀI HÌNH NỀN ĐỘNG', 72, 172);
      var gw = (W - 144 - 18 * 3) / 4, gh = gw * 9 / 16;
      imgs.forEach(function (im, i) { if (!im) return; var X = 72 + i * (gw + 18); x.save(); rr(x, X, 210, gw, gh, 14); x.clip(); x.drawImage(im, X, 210, gw, gh); x.restore(); });
      var y = 210 + gh + 72;
      function row(k, v) { x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '600 28px ' + F; x.fillText(k, 72, y); x.fillStyle = '#fff'; x.font = '700 34px ' + F; x.fillText(v, 330, y); y += 70; }
      row('Thời gian', whenText());
      row('Mẫu', st.picks.length ? 'Tất cả + mẫu ' + st.picks.join(', ') : 'Tất cả mẫu');
      row('Cài đặt', 'Online qua Ultraview');
      var fy = y + 18;
      x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '600 28px ' + F; x.fillText('Gói gồm', 72, fy); fy += 52;
      ['App hình nền động bản quyền, dùng vĩnh viễn', 'Trọn kho hình nền động, khỏi đi đâu tải', 'Layout ngày giờ, nhạc vừa màn hình', 'Cập nhật mẫu mới trọn đời'].forEach(function (t) {
        x.fillStyle = 'rgba(255,122,100,.22)'; x.beginPath(); x.arc(88, fy - 11, 16, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#ff9c86'; x.font = '800 20px ' + F; x.fillText('✓', 80, fy - 3);
        x.fillStyle = 'rgba(255,255,255,.9)'; x.font = '600 31px ' + F; x.fillText(t, 122, fy); fy += 54;
      });
      var py = H - 330;
      x.strokeStyle = 'rgba(255,255,255,.2)'; x.setLineDash([14, 12]); x.lineWidth = 3; x.beginPath(); x.moveTo(72, py); x.lineTo(W - 72, py); x.stroke(); x.setLineDash([]);
      var pg = x.createLinearGradient(72, 0, 420, 0); pg.addColorStop(0, '#ff8a75'); pg.addColorStop(1, '#ffc58f'); x.fillStyle = pg; x.font = '800 150px ' + F; x.fillText('175k', 66, py + 170);
      var pw = x.measureText('175k').width; x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '700 48px ' + F; x.fillText('300k', 66 + pw + 26, py + 160);
      var ow = x.measureText('300k').width; x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 4; x.beginPath(); x.moveTo(66 + pw + 22, py + 144); x.lineTo(66 + pw + 30 + ow, py + 144); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '600 30px ' + F; x.fillText('Trọn gói, không phát sinh · Cài online qua Ultraview', 72, py + 230);
      x.fillStyle = '#0068ff'; x.fillRect(0, H - 64, W, 64); x.fillStyle = '#fff'; x.font = '700 28px ' + F; x.fillText('Zalo 0339903166  ·  desktopchill.com', 72, H - 22);
      return new Promise(function (res) { c.toBlob(res, 'image/png'); });
    });
  }
  var blob = null, rT = null;
  function refresh() { if (IS_MOBILE) return; makeImage().then(function (b) { if (b) blob = b; }).catch(function () {}); }
  function refreshSoon() { clearTimeout(rT); rT = setTimeout(refresh, 400); }

  /* Đặt ngay = copy đơn + mở Zalo của shop */
  function goZalo(newTab) {
    if (newTab) { var w = null; try { w = window.open(ZALO, '_blank'); if (w) w.opener = null; } catch (e) {} if (w) return; }
    location.href = ZALO;
  }
  function order(ev) {
    if (ev) ev.preventDefault();
    var txt = orderText();
    if (!IS_MOBILE && blob && navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      // máy tính: copy ảnh đơn (Zalo PC/web dán được ảnh bằng Ctrl+V)
      var p; try { p = navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); } catch (e) { p = Promise.reject(e); }
      goZalo(true);
      p.then(function () { toast('Đã copy ảnh đơn, bấm Ctrl+V trong Zalo để gửi'); }, function () { copyText(txt).then(function () { toast('Đã copy đơn, bấm Ctrl+V trong Zalo để gửi'); }); });
      return;
    }
    // điện thoại: copy nội dung đơn rồi mở Zalo
    copyText(txt).then(function (ok) {
      toast(ok ? 'Đã copy đơn, dán vào Zalo rồi gửi nha' : 'Đang mở Zalo của shop…');
      setTimeout(function () { goZalo(!IS_MOBILE); }, 350);
    });
  }
  ['#bkGo', '#floatingZalo', '#mctaZalo'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('click', order); });

  fetch('data/wallpapers.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
    (d.wallpapers || []).forEach(function (w) { WP[parseInt(w.id, 10)] = w; }); NWP = (d.wallpapers || []).length;
    if (hasForm) parsePicks(); else refreshSoon();
  }).catch(function () {});
  sync();
})();
