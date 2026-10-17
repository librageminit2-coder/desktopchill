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
let rec = null;
export function listen(lang, { onPartial } = {}) {
  return new Promise((res, rej) => {
    if (!SR) return rej(new Error('unsupported'));
    try { if (rec) rec.abort(); } catch (e) {}
    rec = new SR(); rec.lang = LANG[lang]; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = false;
    let best = '', alts = [];
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      best = Array.from(e.results).map((x) => x[0].transcript).join(' ');
      alts = Array.from(r).map((a) => a.transcript);
      if (onPartial) onPartial(best);
    };
    rec.onerror = (e) => rej(new Error(e.error || 'error'));
    rec.onend = () => res({ text: best, alts });
    try { rec.start(); } catch (e) { rej(e); }
  });
}
export function stopListen() { try { if (rec) rec.stop(); } catch (e) {} }

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
