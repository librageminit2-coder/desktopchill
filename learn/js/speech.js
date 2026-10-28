// Đọc (TTS) và nghe giọng nói (STT) bằng Web Speech API có sẵn trong trình duyệt
const LANG = { en: 'en-US', zh: 'zh-CN', ielts: 'en-GB' };
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
    if (!window.speechSynthesis || !text || Date.now() - hardStop < 1000) return res(false);
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
// hard = true khi thoát bài học: chặn các câu đang xếp hàng (đọc hội thoại liên tiếp) trong 1 giây và huỷ lại vài lần cho chắc
let hardStop = 0;
export function stopSpeak(hard = false) {
  try { speechSynthesis.cancel(); } catch (e) {}
  if (hard) { hardStop = Date.now(); [150, 450, 900].forEach((t) => setTimeout(() => { try { speechSynthesis.cancel(); } catch (e) {} }, t)); if (curBtn) curBtn.classList.remove('playing'); }
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = () => !!SR;
const ANDROID = /Android/i.test(navigator.userAgent);
let rec = null, stream = null, mctx = null, raf = 0;
// trạng thái quyền micro: granted | denied | prompt | unknown
export async function micState() {
  if (micPolicyBlocked()) return 'policy';
  try { const p = await navigator.permissions.query({ name: 'microphone' }); return p.state; } catch (e) { return 'unknown'; }
}
// theo dõi quyền micro: báo ngay khi người dùng đổi trong cài đặt trình duyệt (không cần tải lại trang)
// máy chủ web có thể chặn micro bằng header Permissions-Policy (vd. Cloudflare "microphone=()"): khi đó cài đặt Chrome không giúp được gì
export function micPolicyBlocked() { try { const p = document.permissionsPolicy || document.featurePolicy; return !!(p && p.allowsFeature && !p.allowsFeature('microphone')); } catch (e) { return false; } }
export async function watchMic(cb) {
  if (micPolicyBlocked()) { cb('policy'); return null; }
  try { const p = await navigator.permissions.query({ name: 'microphone' }); cb(p.state); p.addEventListener('change', () => cb(p.state)); return p; } catch (e) { cb('unknown'); return null; }
}
// thử xin quyền trực tiếp (nếu trình duyệt còn cho hỏi thì sẽ hiện hộp thoại)
export async function requestMic() {
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); return 'granted'; }
  catch (e) { return e.name === 'NotAllowedError' || e.name === 'SecurityError' ? 'denied' : e.name === 'NotFoundError' ? 'nodevice' : 'error'; }
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
// Nghe một câu. Tự dừng khi: có kết quả cuối, im lặng ~1,5 giây sau khi nói, hoặc quá 15 giây.
// Nếu trình duyệt không báo "end" sau khi dừng (lỗi hay gặp trên Chrome), vẫn trả kết quả sau 1,2 giây.
let curStop = null;
export function listen(lang, { onPartial, onLevel } = {}) {
  return new Promise(async (res, rej) => {
    if (!SR) return rej(new Error('unsupported'));
    try { if (rec) rec.abort(); } catch (e) {}
    let best = '', alts = [], failed = null, done = false, spoke = false, lastLoud = 0;
    const T = { sil: 0, max: 0, none: 0, kill: 0 };
    const clear = () => Object.values(T).forEach((t) => clearTimeout(t));
    const finish = () => {
      if (done) return; done = true; clear(); curStop = null; closeMic(); if (onLevel) onLevel(0);
      const r = rec; try { if (r) { r.onend = null; r.onresult = null; r.onerror = null; r.abort(); } } catch (e) {}
      if (failed && failed !== 'aborted' && failed !== 'no-speech' && !best) rej(new Error(failed));
      else if (!best && failed === 'no-speech') rej(new Error('no-speech'));
      else res({ text: best, alts });
    };
    const stopSoon = () => { if (done) return; try { rec.stop(); } catch (e) {} clearTimeout(T.kill); T.kill = setTimeout(finish, 1200); };
    curStop = stopSoon;
    // đồng hồ âm lượng + phát hiện im lặng sau khi đã nói
    const level = (v) => {
      if (onLevel) onLevel(v);
      const now = performance.now();
      if (v > 0.16) { spoke = true; lastLoud = now; } else if (spoke && best && now - lastLoud > 1500) stopSoon();
    };
    try { await openMic(level); } catch (e) { curStop = null; return rej(e); }
    rec = new SR(); rec.lang = LANG[lang]; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = false;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      best = Array.from(e.results).map((x) => x[0].transcript).join(' ');
      alts = Array.from(r).map((a) => a.transcript);
      if (onPartial) onPartial(best);
      clearTimeout(T.sil);
      if (r.isFinal) stopSoon(); else T.sil = setTimeout(stopSoon, 1500);
    };
    rec.onerror = (e) => { failed = e.error || 'error'; if (failed !== 'aborted') stopSoon(); };
    rec.onend = finish;
    T.max = setTimeout(stopSoon, 15000);
    T.none = setTimeout(() => { if (!best) { failed = failed || 'no-speech'; stopSoon(); } }, 8000);
    try { rec.start(); } catch (e) { done = true; clear(); curStop = null; closeMic(); rej(e); }
  });
}
// nghe dài (Speaking Part 2): ghép các đoạn nhận dạng, tự khởi động lại nếu trình duyệt ngắt giữa chừng
let longStop = false;
export function listenLong(lang, { onText, onLevel, maxMs = 120000 } = {}) {
  return new Promise(async (res, rej) => {
    if (!SR) return rej(new Error('unsupported'));
    try { await openMic(onLevel); } catch (e) { return rej(e); }
    longStop = false; let finals = '', t0 = Date.now(), fatal = null;
    const startOne = () => {
      rec = new SR(); rec.lang = LANG[lang]; rec.interimResults = true; rec.continuous = true;
      rec.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) finals += ' ' + r[0].transcript; else interim += r[0].transcript; } if (onText) onText((finals + ' ' + interim).trim()); };
      rec.onerror = (e) => { if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(e.error)) fatal = e.error; };
      rec.onend = () => { if (!fatal && !longStop && Date.now() - t0 < maxMs) { try { startOne(); return; } catch (e) {} } closeMic(); if (onLevel) onLevel(0); if (fatal && !finals) rej(new Error(fatal)); else res({ text: finals.trim(), ms: Date.now() - t0 }); };
      try { rec.start(); } catch (e) { closeMic(); rej(e); }
    };
    startOne();
    setTimeout(() => { longStop = true; try { rec.stop(); } catch (e) {} }, maxMs);
  });
}
export function stopLong() { longStop = true; try { if (rec) rec.stop(); } catch (e) {} }
export function stopListen() { if (curStop) { curStop(); return; } try { if (rec) rec.stop(); } catch (e) {} }
// Thông báo lỗi micro dễ hiểu
export function micMsg(code) {
  switch (code) {
    case 'not-allowed': case 'service-not-allowed': return 'The microphone is blocked for this site.';
    case 'audio-capture': return 'No microphone found. Check that your mic or headset is plugged in.';
    case 'network': return 'This browser could not send your voice for recognition. Use an up-to-date Chrome or Edge and check your connection.';
    case 'no-speech': return 'Nothing heard. Tap the mic and speak a little louder.';
    case 'unsupported': return 'This browser does not support speech recognition. Use Chrome or Edge.';
    default: return 'Didn\'t catch that. Tap the mic and try again.';
  }
}
export const micBlocked = (code) => code === 'not-allowed' || code === 'service-not-allowed';
export const MIC_SETTINGS = 'chrome://settings/content/siteDetails?site=https%3A%2F%2Fdesktopchill.com';
export const MIC_HELP = `<div class="mic-help"><b>Chrome is blocking the microphone for this site</b>
<p>Allowing the mic in Windows is not enough: Chrome also keeps a separate block list for each website.</p>
<ol><li>Copy this line, paste it into the address bar and press Enter:<div class="cp-row"><code>chrome://settings/content/siteDetails?site=https%3A%2F%2Fdesktopchill.com</code><button class="chip cp-mic" type="button">Copy</button></div></li>
<li>Next to <b>Microphone</b>, choose <b>Allow</b> (or click <b>Reset permissions</b>).</li>
<li>Come back to this tab: the site picks up the change without reloading.</li></ol>
<small>Edge: use edge://settings/content/siteDetails?site=https%3A%2F%2Fdesktopchill.com instead. On a phone: browser settings › Site settings › Microphone.</small></div>`;
// nút Copy trong hướng dẫn: bắt sự kiện chung cho cả trang (hướng dẫn có thể nằm trong bài học hoặc bảng nổi)
document.addEventListener('click', async (e) => {
  const b = e.target.closest && e.target.closest('.cp-mic'); if (!b) return;
  try { await navigator.clipboard.writeText(MIC_SETTINGS); b.textContent = 'Copied'; }
  catch (er) { const code = b.previousElementSibling; const r = document.createRange(); r.selectNodeContents(code); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); b.textContent = 'Press Ctrl+C'; }
});

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
// đổi trang / rời trang → tắt giọng đọc đang phát
addEventListener('hashchange', () => stopSpeak());
addEventListener('pagehide', () => stopSpeak(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeak(); });
