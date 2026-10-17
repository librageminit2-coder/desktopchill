/* desktopchill — bảng Đặt lịch trên trang chủ.
   Không có máy chủ: bấm "Chốt đơn" sẽ copy nội dung đơn để khách dán vào Zalo của shop. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  if (!$('#bkForm')) return;
  var LINK = 'https://desktopchill.com/#dat-lich';
  var WP = {}, NWP = 0;
  var ZALO = 'https://zalo.me/0339903166';
  var IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || window.matchMedia('(pointer: coarse)').matches;
  var st = { when: '', date: '', slot: '', device: [], picks: [] }; // chưa chọn gì = Trao đổi
  var DOW = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

  var tT;
  function toast(m) { var el = $('#bkToast'); el.textContent = m; el.classList.add('show'); clearTimeout(tT); tT = setTimeout(function () { el.classList.remove('show'); }, 2400); }
  function copyText(txt) {
    return new Promise(function (res) {
      function fb() { var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { ta.setSelectionRange(0, txt.length); } catch (e) {} var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); res(ok); }
      try { if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(function () { res(true); }, fb); else fb(); } catch (e) { fb(); }
    });
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function fromIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function niceDate(s) { var d = fromIso(s); return DOW[d.getDay()] + ', ' + d.getDate() + '/' + (d.getMonth() + 1); }
  function whenText() {
    var day = st.when === 'today' ? 'Hôm nay' : st.when === 'other' ? (st.date ? niceDate(st.date) : 'Hôm khác') : 'Trao đổi';
    if (!st.slot) return day;
    return st.slot === 'Giờ nào cũng được' ? day + ' (giờ nào cũng được)' : day + ', buổi ' + st.slot.toLowerCase();
  }
  function pickText() { return st.picks.length ? 'Tất cả mẫu, cài sẵn mẫu ' + st.picks.join(', ') : 'Tất cả mẫu'; }

  /* nháp lưu trên máy khách, mở lại trang không phải điền lại */
  function save() { try { localStorage.setItem('dc_booking', JSON.stringify({ n: $('#bkName').value, p: $('#bkPhone').value, k: $('#bkPicks').value, o: $('#bkNote').value, slot: st.slot, device: st.device })); } catch (e) {} }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem('dc_booking') || 'null'); if (!d) return;
      $('#bkName').value = d.n || ''; $('#bkPhone').value = d.p || ''; $('#bkPicks').value = d.k || ''; $('#bkNote').value = d.o || '';
      if (typeof d.slot === 'string') st.slot = d.slot; if (Array.isArray(d.device)) st.device = d.device;
    } catch (e) {}
  }

  function setPressed(box, fn) { box.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', fn(b.dataset.v) ? 'true' : 'false'); }); }
  function sync() {
    setPressed($('#bkWhen'), function (v) { return v === st.when; });
    setPressed($('#bkSlot'), function (v) { return v === st.slot; });
    setPressed($('#bkDevice'), function (v) { return st.device.indexOf(v) > -1; });
    setPressed($('#bkQuick'), function (v) { return v === st.date; });
    $('#bkDateBox').hidden = st.when !== 'other';
    $('#bkSWhen').textContent = whenText();
    $('#bkSPick').textContent = st.picks.length ? 'Tất cả + mẫu ' + st.picks.join(', ') : 'Tất cả mẫu';
    save(); refreshSoon();
  }
  $('#bkWhen').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; st.when = st.when === b.dataset.v ? '' : b.dataset.v;
    if (st.when === 'other' && !st.date) { var t = new Date(); t.setDate(t.getDate() + 1); st.date = iso(t); $('#bkDate').value = st.date; }
    sync();
  });
  $('#bkSlot').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.slot = st.slot === b.dataset.v ? '' : b.dataset.v; sync(); });
  $('#bkDevice').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var i = st.device.indexOf(b.dataset.v); if (i > -1) st.device.splice(i, 1); else st.device.push(b.dataset.v); sync(); });
  (function () { // ngày nhanh: ngày mai + cuối tuần gần nhất
    var now = new Date(), out = [], seen = {};
    var t = new Date(now); t.setDate(now.getDate() + 1); out.push(['Ngày mai', iso(t)]); seen[iso(t)] = 1;
    for (var i = 2; i <= 8 && out.length < 4; i++) { var d = new Date(now); d.setDate(now.getDate() + i); if ((d.getDay() === 6 || d.getDay() === 0) && !seen[iso(d)]) { out.push([DOW[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1), iso(d)]); seen[iso(d)] = 1; } }
    $('#bkQuick').innerHTML = out.map(function (o) { return '<button type="button" data-v="' + o[1] + '" aria-pressed="false">' + o[0] + '</button>'; }).join('');
    $('#bkDate').min = iso(t);
  })();
  $('#bkQuick').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.date = b.dataset.v; $('#bkDate').value = st.date; sync(); });
  $('#bkDate').addEventListener('change', function () { st.date = this.value; sync(); });

  /* mẫu cụ thể: chỉ nhận số */
  function parsePicks() {
    var el = $('#bkPicks'), raw = el.value, clean = raw.replace(/[^\d,\s]/g, '');
    if (clean !== raw) el.value = clean;
    var nums = (clean.match(/\d+/g) || []).map(function (n) { return parseInt(n, 10); }), ok = [], bad = [];
    nums.forEach(function (n) { if (ok.indexOf(n) > -1 || bad.indexOf(n) > -1) return; if (!NWP || WP[n]) ok.push(n); else bad.push(n); });
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
  $('#bkPicks').addEventListener('input', parsePicks);
  $('#bkPicksView').addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; var n = +b.dataset.rm; $('#bkPicks').value = st.picks.filter(function (x) { return x !== n; }).join(', '); parsePicks(); });
  ['#bkName', '#bkPhone', '#bkNote'].forEach(function (s) { $(s).addEventListener('input', function () { this.classList.remove('bad'); save(); refreshSoon(); }); });
  fetch('data/wallpapers.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (d) {
    (d.wallpapers || []).forEach(function (w) { WP[parseInt(w.id, 10)] = w; }); NWP = (d.wallpapers || []).length; parsePicks();
  }).catch(function () {});

  /* nội dung đơn */
  function orderText() {
    var L = ['Chào shop, mình muốn đặt lịch cài hình nền động:'];
    var nm = $('#bkName').value.trim(); if (nm) L.push('• Tên: ' + nm);
    var ph = $('#bkPhone').value.trim(); if (ph) L.push('• SĐT Zalo: ' + ph);
    if (st.device.length) L.push('• Máy: ' + st.device.join(', '));
    L.push('• Thời gian: ' + whenText());
    L.push('• Mẫu: ' + pickText());
    var no = $('#bkNote').value.trim(); if (no) L.push('• Ghi chú: ' + no);
    L.push('Gói trọn gói 175k (giảm từ 300k).');
    return L.join('\n');
  }
  function valid() {
    if (st.when === 'other' && !st.date) { toast('Bạn chọn ngày cài giúp shop nha'); return false; }
    return true;
  }
  $('#bkDoneCopy').addEventListener('click', function () {
    if (doneMode === 'img' && cur.blob) { try { navigator.clipboard.write([new ClipboardItem({ 'image/png': cur.blob })]).then(function () { toast('Đã copy lại ảnh, dán vào Zalo nhé'); }, function () { toast('Chưa copy được, bạn thử lại nha'); }); return; } catch (e) {} }
    copyText($('#bkDoneText').textContent).then(function (ok) { toast(ok ? 'Đã copy, dán vào Zalo nhé' : 'Giữ vào khung chữ để copy'); });
  });
  $('#bkDoneClose').addEventListener('click', function () { $('#bkDone').hidden = true; });
  $('#bkDone').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
  $('#bkLink').addEventListener('click', function () { copyText(LINK).then(function (ok) { toast(ok ? 'Đã copy link đặt lịch' : LINK); }); });

  /* ảnh đơn: vẽ bằng canvas rồi copy (không được thì chia sẻ hoặc tải về) */
  function loadImg(src) { return new Promise(function (res) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = function () { res(null); }; i.src = src; }); }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function wrap(x, text, X, Y, maxW, lh) {
    var words = text.split(' '), line = '', lines = [];
    words.forEach(function (w) { var t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line);
    lines.forEach(function (l, i) { x.fillText(l, X, Y + i * lh); });
    return lines.length * lh;
  }
  function makeImage() {
    var W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H; var x = c.getContext('2d');
    var F = '"Plus Jakarta Sans", system-ui, sans-serif';
    var src = st.picks.slice(0, 4).map(function (n) { return WP[n] && WP[n].poster; }).filter(Boolean);
    if (!src.length) { var hot = Object.keys(WP).map(function (k) { return WP[k]; }).filter(function (w) { return w.hot; }); src = (hot.length >= 4 ? hot : Object.keys(WP).map(function (k) { return WP[k]; })).slice(0, 4).map(function (w) { return w.poster; }); }
    return (document.fonts ? document.fonts.ready : Promise.resolve()).then(function () { return Promise.all(src.map(loadImg)); }).then(function (imgs) {
      var g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1d1517'); g.addColorStop(1, '#0c0c11'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      var rg = x.createRadialGradient(W, 0, 0, W, 0, 720); rg.addColorStop(0, 'rgba(255,106,88,.45)'); rg.addColorStop(1, 'rgba(255,106,88,0)'); x.fillStyle = rg; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.font = '800 44px ' + F; x.fillText('desktop', 72, 112); var dw = x.measureText('desktop').width; x.fillStyle = '#ff7a64'; x.fillText('chill', 72 + dw, 112);
      x.fillStyle = 'rgba(255,255,255,.6)'; x.font = '700 26px ' + F; x.fillText('ĐƠN ĐẶT LỊCH CÀI HÌNH NỀN ĐỘNG', 72, 172);
      var gw = (W - 144 - 18 * 3) / 4, gh = gw * 9 / 16;
      imgs.forEach(function (im, i) { if (!im) return; var X = 72 + i * (gw + 18); x.save(); rr(x, X, 210, gw, gh, 14); x.clip(); x.drawImage(im, X, 210, gw, gh); x.restore(); });
      var y = 210 + gh + 72;
      function row(k, v) { x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '600 28px ' + F; x.fillText(k, 72, y); x.fillStyle = '#fff'; x.font = '700 34px ' + F; var h = wrap(x, v, 330, y, W - 330 - 72, 44); y += Math.max(44, h) + 26; }
      var nm = $('#bkName').value.trim(); if (nm) row('Tên', nm);
      var ph = $('#bkPhone').value.trim(); if (ph) row('SĐT Zalo', ph);
      if (st.device.length) row('Máy', st.device.join(', '));
      row('Thời gian', whenText());
      row('Mẫu', pickText());
      row('Cài đặt', 'Online qua Ultraview');
      var no = $('#bkNote').value.trim(); if (no) row('Ghi chú', no.length > 90 ? no.slice(0, 88) + '…' : no);
      var INC = ['App hình nền động bản quyền, dùng vĩnh viễn', 'Trọn kho hình nền động, khỏi đi đâu tải', 'Layout ngày giờ, nhạc vừa màn hình', 'Cập nhật mẫu mới trọn đời'];
      var fy = y + 18;
      if (fy + 60 < H - 340) {
        x.fillStyle = 'rgba(255,255,255,.55)'; x.font = '600 28px ' + F; x.fillText('Gói gồm', 72, fy); fy += 52;
        INC.forEach(function (t) {
          if (fy > H - 360) return;
          x.fillStyle = 'rgba(255,122,100,.22)'; x.beginPath(); x.arc(88, fy - 11, 16, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#ff9c86'; x.font = '800 20px ' + F; x.fillText('✓', 80, fy - 3);
          x.fillStyle = 'rgba(255,255,255,.9)'; x.font = '600 31px ' + F; x.fillText(t, 122, fy); fy += 54;
        });
        y = fy;
      }
      var py = Math.max(y + 10, H - 330);
      x.strokeStyle = 'rgba(255,255,255,.2)'; x.setLineDash([14, 12]); x.lineWidth = 3; x.beginPath(); x.moveTo(72, py); x.lineTo(W - 72, py); x.stroke(); x.setLineDash([]);
      var pg = x.createLinearGradient(72, 0, 420, 0); pg.addColorStop(0, '#ff8a75'); pg.addColorStop(1, '#ffc58f'); x.fillStyle = pg; x.font = '800 150px ' + F; x.fillText('175k', 66, py + 170);
      var pw = x.measureText('175k').width; x.fillStyle = 'rgba(255,255,255,.5)'; x.font = '700 48px ' + F; x.fillText('300k', 66 + pw + 26, py + 160);
      var ow = x.measureText('300k').width; x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 4; x.beginPath(); x.moveTo(66 + pw + 22, py + 144); x.lineTo(66 + pw + 30 + ow, py + 144); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '600 30px ' + F; x.fillText('Trọn gói, không phát sinh · Cài online qua Ultraview', 72, py + 230);
      x.fillStyle = '#0068ff'; x.fillRect(0, H - 64, W, 64); x.fillStyle = '#fff'; x.font = '700 28px ' + F; x.fillText('Zalo 0339903166  ·  desktopchill.com', 72, H - 22);
      return new Promise(function (res) { c.toBlob(res, 'image/png'); });
    });
  }
  /* ảnh đơn dựng sẵn (cập nhật khi khách sửa form) để bấm là gửi được ngay */
  var cur = { blob: null, file: null, url: '' }, rT = null, NAME = 'don-dat-lich-desktopchill.png';
  function refresh() {
    return makeImage().then(function (blob) {
      if (!blob) return null;
      cur.blob = blob; try { cur.file = new File([blob], NAME, { type: 'image/png' }); } catch (e) { cur.file = null; }
      if (cur.url) URL.revokeObjectURL(cur.url); cur.url = URL.createObjectURL(blob);
      return blob;
    }).catch(function () { return null; });
  }
  function refreshSoon() { clearTimeout(rT); rT = setTimeout(refresh, 450); }
  function ready() { return cur.blob ? Promise.resolve(cur.blob) : refresh(); }

  var doneMode = '';
  function showDone(kind) {
    doneMode = kind; $('#bkDoneCopy').textContent = kind === 'img' ? 'Copy lại ảnh' : 'Copy lại nội dung';
    var img = $('#bkDoneImg'), pre = $('#bkDoneText');
    pre.textContent = orderText();
    if (kind === 'img') {
      $('#bkDoneT').textContent = 'Đã copy ảnh đơn!';
      $('#bkDone').querySelector('ol').innerHTML = '<li>Mở Zalo của shop (đã mở sẵn ở tab mới)</li><li>Bấm <b>Ctrl + V</b> (hoặc giữ ô chat, chọn Dán) rồi gửi</li>';
      img.src = cur.url; img.hidden = false; pre.hidden = true;
    } else {
      $('#bkDoneT').textContent = kind === 'text' ? 'Đã copy đơn của bạn!' : 'Đơn của bạn đã sẵn sàng';
      $('#bkDone').querySelector('ol').innerHTML = '<li>Mở Zalo của shop (nút bên dưới)</li><li>Giữ vào ô chat, chọn <b>Dán</b> rồi gửi</li>';
      img.hidden = true; pre.hidden = false;
    }
    $('#bkDone').hidden = false;
  }
  function textFallback() { copyText(orderText()).then(function (ok) { showDone(ok ? 'text' : 'none'); }); }

  /* Gửi đơn: điện thoại mở bảng chia sẻ (chọn Zalo là gửi ảnh), máy tính copy ảnh + mở Zalo */
  function sendOrder(ev) {
    if (ev) ev.preventDefault();
    if (!valid()) return;
    var file = cur.file;
    if (IS_MOBILE && file && navigator.canShare && navigator.share) {
      var can = false; try { can = navigator.canShare({ files: [file] }); } catch (e) {}
      if (can) {
        navigator.share({ files: [file], title: 'Đặt lịch cài hình nền động', text: 'Shop ơi, mình muốn đặt lịch cài hình nền động nha.' })
          .then(function () { toast('Đã gửi đơn, shop sẽ nhắn lại bạn sớm nha'); })
          .catch(function (err) { if (!err || err.name !== 'AbortError') textFallback(); });
        return;
      }
    }
    if (!IS_MOBILE && navigator.clipboard && window.ClipboardItem && window.isSecureContext) {
      var item;
      try { item = new ClipboardItem({ 'image/png': ready().then(function (b) { if (!b) throw new Error('no-image'); return b; }) }); } catch (e) { item = null; }
      if (item) {
        try { window.open(ZALO, '_blank', 'noopener'); } catch (e) {}
        navigator.clipboard.write([item]).then(function () { showDone('img'); }, textFallback);
        return;
      }
    }
    textFallback();
  }
  $('#bkGo').addEventListener('click', sendOrder);
  ['#floatingZalo', '#mctaZalo'].forEach(function (id) { var el = $(id); if (el) el.addEventListener('click', sendOrder); });

  /* nút Copy ảnh đơn: chỉ copy / lưu ảnh, không mở Zalo */
  $('#bkImg').addEventListener('click', function () {
    if (!valid()) return;
    var btn = this; btn.disabled = true;
    ready().then(function (blob) {
      btn.disabled = false; if (!blob) { toast('Chưa tạo được ảnh, bạn thử lại nha'); return; }
      var p;
      try { p = (navigator.clipboard && window.ClipboardItem && window.isSecureContext) ? navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]) : Promise.reject(new Error('no-clipboard')); } catch (e) { p = Promise.reject(e); }
      p.then(function () { toast('Đã copy ảnh đơn, dán vào Zalo nhé'); }).catch(function () {
        if (cur.file && navigator.canShare && navigator.canShare({ files: [cur.file] })) { navigator.share({ files: [cur.file], title: 'Đơn đặt lịch desktopchill' }).catch(function () {}); return; }
        var a = document.createElement('a'); a.href = cur.url || URL.createObjectURL(blob); a.download = NAME; document.body.appendChild(a); a.click(); a.remove(); toast('Đã lưu ảnh đơn về máy');
      });
    });
  });

  load(); sync();
})();
