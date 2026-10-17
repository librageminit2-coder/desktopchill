// Đọc (TTS) và nghe giọng nói (STT) bằng Web Speech API có sẵn trong trình duyệt
const LANG = { en: 'en-US', zh: 'zh-CN' };
let voices = [];
function loadVoices() { try { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
loadVoices();
try { if (window.speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices; } catch (e) {}
export const tts = { rate: 0.95, pref: { en: '', zh: '' } };
export function listVoices(lang) {
  loadVoices();
  const p = lang === 'zh' ? /^(zh|cmn)[-_](CN|Hans)/i : /^en[-_](US|GB|AU|CA|IN)/i;
  return voices.filter((v) => p.test(v.lang));
}
function pickVoice(lang) {
  const list = listVoices(lang);
  if (tts.pref[lang]) { const v = list.find((x) => x.name === tts.pref[lang]); if (v) return v; }
  const good = /Google|Natural|Neural|Premium|Enhanced|Samantha|Ava|Xiaoxiao|Ting-Ting|Tingting|Yunxi/i;
  return list.find((v) => good.test(v.name) && /US|CN/.test(v.lang)) || list.find((v) => good.test(v.name)) || list[0] || null;
}
export const canSpeak = () => !!window.speechSynthesis;
let curBtn = null;
export function speak(text, lang, { rate = 1, btn = null } = {}) {
  return new Promise((res) => {
    if (!window.speechSynthesis || !text) return res(false);
    try { speechSynthesis.cancel(); } catch (e) {}
    const u = new SpeechSynthesisUtterance(text.replace(/\s+/g, lang === 'zh' ? '' : ' '));
    u.lang = LANG[lang] || lang; const v = pickVoice(lang); if (v) u.voice = v;
    u.rate = Math.max(0.5, Math.min(1.4, tts.rate * rate));
    if (curBtn) curBtn.classList.remove('playing');
    curBtn = btn; if (btn) btn.classList.add('playing');
    const end = () => { if (btn) btn.classList.remove('playing'); res(true); };
    u.onend = end; u.onerror = end;
    // Safari đôi khi không gọi onend
    setTimeout(end, Math.min(20000, 1500 + text.length * 120 / u.rate));
    speechSynthesis.speak(u);
  });
}
export function stopSpeak() { try { speechSynthesis.cancel(); } catch (e) {} }

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => !!SR;
const ANDROID = /Android/i.test(navigator.userAgent);
let rec = null, stream = null, mctx = null, raf = 0;
// trạng thái quyền micro: granted | denied | prompt | unknown
export async function micState() {
  try { const p = await navigator.permissions.query({ name: 'microphone' }); return p.state; } catch (e) { return 'unknown'; }
}
async function openMic(onLevel) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { throw new Error(e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'not-allowed' : e.name === 'NotFoundError' || e.name === 'NotReadableError' ? 'audio-capture' : 'mic-error'); }
  // Android: giữ micro song song với nhận giọng nói dễ lỗi → chỉ xin quyền rồi nhả ra
  if (ANDROID || !onLevel) { closeMic(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext; mctx = new C();
    const src = mctx.createMediaStreamSource(stream), an = mctx.createAnalyser(); an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => { an.getByteTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) { const x = (buf[i] - 128) / 128; s += x * x; } onLevel(Math.min(1, Math.sqrt(s / buf.length) * 5)); raf = requestAnimationFrame(tick); };
    tick();
  } catch (e) { /* không có đồng hồ âm lượng cũng không sao */ }
}
function closeMic() {
  cancelAnimationFrame(raf); raf = 0;
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (mctx) { try { mctx.close(); } catch (e) {} mctx = null; }
}
export function listen(lang, { onPartial, onLevel } = {}) {
  return new Promise(async (res, rej) => {
    if (!SR) return rej(new Error('unsupported'));
    try { if (rec) rec.abort(); } catch (e) {}
    try { await openMic(onLevel); } catch (e) { return rej(e); }
    rec = new SR(); rec.lang = LANG[lang]; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = false;
    let best = '', alts = [], failed = null;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      best = Array.from(e.results).map((x) => x[0].transcript).join(' ');
      alts = Array.from(r).map((a) => a.transcript);
      if (onPartial) onPartial(best);
    };
    rec.onerror = (e) => { failed = e.error || 'error'; };
    rec.onend = () => { closeMic(); if (onLevel) onLevel(0); if (failed && failed !== 'aborted' && !best) rej(new Error(failed)); else res({ text: best, alts }); };
    try { rec.start(); } catch (e) { closeMic(); rej(e); }
  });
}
export function stopListen() { try { if (rec) rec.stop(); } catch (e) {} }
// Thông báo lỗi micro dễ hiểu
export function micMsg(code) {
  switch (code) {
    case 'not-allowed': case 'service-not-allowed': return 'Micro đang bị chặn cho trang này.';
    case 'audio-capture': return 'Không tìm thấy micro. Kiểm tra micro hoặc tai nghe đã cắm chưa.';
    case 'network': return 'Trình duyệt này không gửi được giọng nói để nhận dạng. Hãy dùng Chrome hoặc Edge bản mới và kiểm tra mạng.';
    case 'no-speech': return 'Chưa nghe thấy gì. Bấm micro rồi nói to, rõ hơn nhé.';
    case 'unsupported': return 'Trình duyệt này chưa hỗ trợ nhận giọng nói. Dùng Chrome hoặc Edge.';
    default: return 'Chưa nghe được, bấm micro và thử lại nhé.';
  }
}
export const micBlocked = (code) => code === 'not-allowed' || code === 'service-not-allowed';
export const MIC_HELP = `<div class="mic-help"><b>Bật micro cho desktopchill.com</b><ol><li>Bấm biểu tượng ổ khoá hoặc cài đặt ở bên trái thanh địa chỉ.</li><li>Ở mục <b>Micrô</b>, chọn <b>Cho phép</b>.</li><li>Tải lại trang rồi bấm micro lần nữa.</li></ol><small>Trên điện thoại: Cài đặt trình duyệt › Cài đặt trang web › Micrô › cho phép desktopchill.com.</small></div>`;

/* ---------- so khớp câu nói / câu gõ ---------- */
export function norm(s, lang) {
  s = (s || '').toLowerCase().normalize('NFKC');
  if (lang === 'zh') return s.replace(/[^㐀-鿿0-9a-z]/g, '');
  return s.replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const units = (s, lang) => (lang === 'zh' ? Array.from(s) : s.split(' ').filter(Boolean));
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) { let p = d[0]; d[0] = i; for (let j = 1; j <= n; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } }
  return d[n];
}
// So từng từ (tiếng Anh cho phép sai chính tả 1 ký tự với từ dài)
export function compare(target, said, lang) {
  const A = units(norm(target, lang), lang), B = units(norm(said, lang), lang);
  const eq = (x, y) => x === y || (lang !== 'zh' && x.length >= 5 && lev(x, y) <= 1);
  // LCS để đánh dấu từ nào khớp
  const m = A.length, n = B.length, L = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = eq(A[i], B[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hit = new Array(m).fill(false); let i = 0, j = 0;
  while (i < m && j < n) { if (eq(A[i], B[j])) { hit[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
  const score = m ? L[0][0] / Math.max(m, n * 0.85) : 0;
  return { score: Math.min(1, score), hit, tokens: A };
}
