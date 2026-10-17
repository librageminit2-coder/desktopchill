// Bộ máy bài học: tạo bài tập từ nội dung chủ đề và chạy từng bước
import { I } from './icons.js?v=5';
import { mascot } from './mascot.js?v=5';
import { sfx } from './sound.js?v=5';
import { speak, stopSpeak, listen, stopListen, canListen, canSpeak, compare, norm } from './speech.js?v=5';
import { S, addXP, markDone, addWords, save, bump } from './store.js?v=5';

const $ = (s, r = document) => r.querySelector(s);
const h = (str) => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle(a).slice(0, n);
const strip = (s) => s.replace(/\s+/g, '');
export const LESSONS = [
  { k: 0, name: 'Từ vựng', desc: 'Học từ mới, nghe và ghép nghĩa', icon: 'book' },
  { k: 1, name: 'Hội thoại', desc: 'Nghe, ghép câu rồi đóng vai nói', icon: 'chat' },
  { k: 2, name: 'Đọc hiểu', desc: 'Đọc bài, trả lời và nghe chép', icon: 'read' },
  { k: 3, name: 'Ngữ pháp & tổng ôn', desc: 'Mẫu câu, điền từ, nói lại', icon: 'ruler' },
];
// tạm tắt bài nói / nghe khi người học đang ở nơi không tiện
const pause = { mic: 0, audio: 0 };
const micOff = () => Date.now() < pause.mic || !canListen();
const audioOff = () => Date.now() < pause.audio || !canSpeak();

/* ---------------- dựng hàng đợi bài tập ---------------- */
function textOf(lang, x) { return lang === 'zh' ? strip(x.t) : x.t; }
export function buildQueue(unit, k, lang) {
  const W = unit.words, q = [];
  const sentences = [...unit.dlg.lines, ...unit.read.sents, ...unit.gram.ex, ...W.map((w) => ({ t: w.ex, vi: w.exVi, tk: w.exTk, py: w.exPy }))].filter((x) => x && x.t && x.tk && x.tk.length >= 3 && x.tk.length <= 12);
  if (k === 0) {
    const groups = [W.slice(0, 3), W.slice(3, 6), W.slice(6, 8), W.slice(8, 10)].filter((g) => g.length);
    groups.forEach((g) => {
      g.forEach((w) => q.push({ type: 'learn', w }));
      shuffle(g).forEach((w, i) => q.push(i % 2 ? { type: 'listenWord', w } : { type: 'meaning', w }));
    });
    q.push({ type: 'match', words: pick(W, 5) });
    pick(W, 2).forEach((w) => q.push({ type: 'wordFromVi', w }));
    if (lang === 'zh') pick(W.filter((w) => strip(w.w).length <= 2), 2).forEach((w) => q.push({ type: 'write', w }));
    else pick(W, 1).forEach((w) => q.push({ type: 'spell', w }));
  } else if (k === 1) {
    const L = unit.dlg.lines;
    q.push({ type: 'dialogue' });
    pick(L.filter((l) => l.tk.length >= 3 && l.tk.length <= 12), 3).forEach((l) => q.push({ type: 'order', s: l }));
    pick(L, 2).forEach((l) => q.push({ type: 'listenLine', s: l, pool: L }));
    pick(L.filter((l) => l.tk.length <= 12), 2).forEach((l) => q.push({ type: 'speak', s: l }));
    pick(W, 2).forEach((w) => q.push({ type: 'meaning', w }));
    q.push({ type: 'roleplay' });
  } else if (k === 2) {
    q.push({ type: 'reading' });
    unit.read.q.forEach((x) => q.push({ type: 'mcq', q: x.q, opts: x.opts, a: x.a, note: 'Theo bài đọc' }));
    pick(unit.read.sents.filter((s) => s.tk.length >= 4 && s.tk.length <= 14), 2).forEach((s) => q.push(lang === 'zh' ? { type: 'listenOrder', s } : { type: 'dictation', s }));
    const withWord = unit.read.sents.map((s) => ({ s, w: W.find((w) => textOf(lang, s).toLowerCase().includes((lang === 'zh' ? w.w : w.w.toLowerCase()))) })).filter((x) => x.w);
    pick(withWord, 2).forEach((x) => q.push({ type: 'blank', s: x.s, w: x.w }));
  } else {
    q.push({ type: 'grammar' });
    unit.gram.drill.forEach((d) => q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: unit.gram.title, vi: d.vi }));
    pick(unit.gram.ex.filter((x) => x.tk.length >= 3), 2).forEach((s) => q.push({ type: 'order', s }));
    pick(sentences, 1).forEach((s) => q.push({ type: 'speak', s }));
    pick(W, 3).forEach((w, i) => q.push(i === 1 ? { type: 'listenWord', w } : { type: 'wordFromVi', w }));
  }
  return q;
}

/* ---------------- các dạng bài ---------------- */
const sayBtn = (cls = '') => `<button class="say ${cls}" type="button" aria-label="${cls ? 'Nghe chậm' : 'Nghe'}">${cls ? I.turtle : I.speaker}</button>`;
function wireSay(el, text, lang) {
  el.querySelectorAll('.say').forEach((b) => b.addEventListener('click', () => { sfx('tap'); speak(text, lang, { rate: b.classList.contains('slow') ? 0.62 : 1, btn: b }); }));
}
function zhWord(w, cls = '') { return `<span class="zh ${cls}">${esc(w.w)}</span>`; }
function wordHTML(w, lang) { return lang === 'zh' ? `${zhWord(w)}${S.settings.pinyin ? `<span class="py"> ${esc(w.py)}</span>` : ''}` : esc(w.w); }
function optsHTML(list, lang, zhOpts = false) {
  return `<div class="opts">${list.map((o, i) => `<button class="opt ${zhOpts ? 'zh' : ''}" type="button" data-i="${i}"><span class="key">${i + 1}</span><span>${o}</span></button>`).join('')}</div>`;
}
function single(el, api, correctIdx, onPick) {
  let sel = -1;
  const btns = [...el.querySelectorAll('.opt')];
  btns.forEach((b) => b.addEventListener('click', () => { sfx('tap'); sel = +b.dataset.i; btns.forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false')); api.ready(true); if (onPick) onPick(sel); }));
  api.keys = (n) => { if (btns[n]) btns[n].click(); };
  return () => {
    btns.forEach((b) => b.disabled = true);
    const ok = sel === correctIdx;
    btns[correctIdx].classList.add('right'); if (!ok && btns[sel]) btns[sel].classList.add('wrong');
    return ok;
  };
}
function distract(unit, w, field, n = 3, allWords) {
  const pool = (allWords || unit.words).filter((x) => x !== w && x[field] !== w[field]);
  return pick(pool, n);
}

const R = {};
R.learn = (el, it, api) => {
  const { w } = it, zh = api.lang === 'zh';
  el.innerHTML = `<p class="q">Từ mới</p>
  <div class="learn-card">
    <span class="tag">${esc(w.pos || '')}</span>
    <div class="word">${sayBtn()}<div><h2 class="${zh ? 'zh' : ''}">${esc(w.w)}</h2><div class="ipa">${esc(zh ? w.py : w.ipa || '')}</div></div>${sayBtn('slow')}</div>
    <div class="mean">${esc(w.vi)}</div>
    ${w.ex ? `<div class="ex"><div class="t ${zh ? 'zh' : ''}"><button class="mini-say" type="button" aria-label="Nghe câu ví dụ">${I.speaker}</button><span>${esc(zh ? strip(w.ex) : w.ex)}</span></div>${zh && w.exPy ? `<small>${esc(w.exPy.join(' '))}</small>` : ''}<small>${esc(w.exVi || '')}</small></div>` : ''}
  </div>`;
  wireSay(el, w.w, api.lang);
  const ms = el.querySelector('.mini-say'); if (ms) ms.addEventListener('click', () => speak(w.ex, api.lang, { btn: ms }));
  if (!audioOff()) setTimeout(() => speak(w.w, api.lang, { btn: el.querySelector('.say') }), 250);
  return { info: true };
};
R.meaning = (el, it, api) => {
  const { w } = it, opts = shuffle([w, ...distract(api.unit, w, 'vi')]);
  el.innerHTML = `<p class="q">Từ này nghĩa là gì?</p><div class="prompt">${sayBtn()}<div class="big ${api.lang === 'zh' ? 'zh' : ''}">${esc(w.w)}${api.lang === 'zh' && S.settings.pinyin ? `<div class="py">${esc(w.py)}</div>` : ''}</div></div>${optsHTML(opts.map((o) => esc(o.vi)), api.lang)}`;
  wireSay(el, w.w, api.lang); if (!audioOff()) setTimeout(() => speak(w.w, api.lang), 200);
  const done = single(el, api, opts.indexOf(w));
  return { check: () => ({ ok: done(), answer: `${w.w} = ${w.vi}` }) };
};
R.wordFromVi = (el, it, api) => {
  const { w } = it, zh = api.lang === 'zh', opts = shuffle([w, ...distract(api.unit, w, 'w')]);
  el.innerHTML = `<p class="q">Chọn từ có nghĩa “${esc(w.vi)}”</p>${optsHTML(opts.map((o) => zh ? `${esc(o.w)}${S.settings.pinyin ? `<span class="py">${esc(o.py)}</span>` : ''}` : esc(o.w)), api.lang, zh)}`;
  const done = single(el, api, opts.indexOf(w), (i) => speak(opts[i].w, api.lang));
  return { check: () => ({ ok: done(), answer: w.w }) };
};
R.listenWord = (el, it, api) => {
  if (audioOff()) return R.meaning(el, it, api);
  const { w } = it, zh = api.lang === 'zh', opts = shuffle([w, ...distract(api.unit, w, 'w')]);
  el.innerHTML = `<p class="q">Nghe và chọn từ đúng</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div>${optsHTML(opts.map((o) => zh ? esc(o.w) : esc(o.w)), api.lang, zh)}`;
  wireSay(el, w.w, api.lang); setTimeout(() => speak(w.w, api.lang, { btn: el.querySelector('.say') }), 250);
  const done = single(el, api, opts.indexOf(w));
  return { check: () => ({ ok: done(), answer: `${w.w}${zh ? ' (' + w.py + ')' : ''} = ${w.vi}` }) };
};
R.match = (el, it, api) => {
  const zh = api.lang === 'zh', L = shuffle(it.words), Rr = shuffle(it.words);
  el.innerHTML = `<p class="q">Ghép từ với nghĩa</p><div class="match">${L.map((w, i) => `<button class="opt ${zh ? 'zh' : ''}" data-side="l" data-w="${i}" style="grid-column:1;grid-row:${i + 1}">${esc(w.w)}</button>`).join('')}${Rr.map((w, i) => `<button class="opt" data-side="r" data-w="${i}" style="grid-column:2;grid-row:${i + 1}">${esc(w.vi)}</button>`).join('')}</div>`;
  let selL = null, selR = null, left = it.words.length, miss = 0;
  const tryPair = () => {
    if (!selL || !selR) return;
    const a = L[+selL.dataset.w], b = Rr[+selR.dataset.w];
    if (a === b) { sfx('ok'); [selL, selR].forEach((x) => { x.classList.add('right'); setTimeout(() => x.classList.add('gone'), 260); }); left--; if (!left) { api.ready(true); api.autoOk(); } }
    else { sfx('bad'); miss++; [selL, selR].forEach((x) => { x.classList.add('wrong'); setTimeout(() => { x.classList.remove('wrong'); x.setAttribute('aria-pressed', 'false'); }, 420); }); }
    selL = selR = null;
  };
  el.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.side === 'l') { if (selL) selL.setAttribute('aria-pressed', 'false'); selL = b; speak(L[+b.dataset.w].w, api.lang); } else { if (selR) selR.setAttribute('aria-pressed', 'false'); selR = b; sfx('tap'); }
    b.setAttribute('aria-pressed', 'true'); tryPair();
  }));
  return { check: () => ({ ok: miss < 3, answer: '' }), manual: true };
};
function tilesUI(el, tokens, api, { zh, target }) {
  const bank = shuffle(tokens.map((t, i) => ({ t, i })));
  el.insertAdjacentHTML('beforeend', `<div class="answer-line"></div><div class="bank">${bank.map((x, j) => `<button class="tile ${zh ? 'zh' : ''}" type="button" data-j="${j}">${esc(x.t)}</button>`).join('')}</div>`);
  const line = el.querySelector('.answer-line'), picked = [];
  el.querySelectorAll('.bank .tile').forEach((b) => b.addEventListener('click', () => {
    sfx('tile'); b.classList.add('used'); picked.push(+b.dataset.j);
    const c = h(`<button class="tile ${zh ? 'zh' : ''}" type="button">${esc(bank[+b.dataset.j].t)}</button>`);
    c.addEventListener('click', () => { sfx('tile'); const k = [...line.children].indexOf(c); picked.splice(k, 1); c.remove(); b.classList.remove('used'); api.ready(picked.length > 0); });
    line.appendChild(c); api.ready(true);
    if (zh && api.lang === 'zh') speak(bank[+b.dataset.j].t, 'zh', { rate: 1.1 });
  }));
  return () => {
    const said = picked.map((j) => bank[j].t).join(zh ? '' : ' ');
    return norm(said, api.lang) === norm(target, api.lang);
  };
}
R.order = (el, it, api) => {
  const { s } = it, zh = api.lang === 'zh';
  el.innerHTML = `<p class="q">Sắp xếp thành câu đúng</p><div class="prompt"><button class="mini-say" type="button" aria-label="Nghe">${I.speaker}</button><div>${esc(s.vi)}</div></div>`;
  el.querySelector('.mini-say').addEventListener('click', (e) => speak(textOf(api.lang, s), api.lang, { btn: e.currentTarget }));
  const target = s.tk.join(zh ? '' : ' ');
  const done = tilesUI(el, s.tk, api, { zh, target });
  return { check: () => { const ok = done(); if (!audioOff()) speak(textOf(api.lang, s), api.lang); return { ok, answer: zh ? strip(s.t) : s.t }; } };
};
R.listenOrder = (el, it, api) => {
  if (audioOff()) return R.order(el, it, api);
  const { s } = it;
  el.innerHTML = `<p class="q">Nghe rồi xếp lại câu</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div>`;
  wireSay(el, textOf(api.lang, s), api.lang); setTimeout(() => speak(textOf(api.lang, s), api.lang, { btn: el.querySelector('.say') }), 250);
  const done = tilesUI(el, s.tk, api, { zh: true, target: s.tk.join('') });
  return { check: () => ({ ok: done(), answer: `${strip(s.t)} — ${s.vi}` }) };
};
R.listenLine = (el, it, api) => {
  if (audioOff()) return R.order(el, { s: it.s }, api);
  const { s } = it, zh = api.lang === 'zh';
  const others = pick(it.pool.filter((x) => x !== s), 2), opts = shuffle([s, ...others]);
  el.innerHTML = `<p class="q">Câu bạn vừa nghe nghĩa là gì?</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div>${optsHTML(opts.map((o) => esc(o.vi)), api.lang)}`;
  wireSay(el, textOf(api.lang, s), api.lang); setTimeout(() => speak(textOf(api.lang, s), api.lang, { btn: el.querySelector('.say') }), 250);
  const done = single(el, api, opts.indexOf(s));
  return { check: () => ({ ok: done(), answer: `${zh ? strip(s.t) : s.t}` }) };
};
R.dictation = (el, it, api) => {
  if (audioOff()) return R.order(el, it, api);
  const { s } = it;
  el.innerHTML = `<p class="q">Nghe và gõ lại câu</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div><textarea class="type-in" rows="3" placeholder="Gõ câu bạn nghe được…" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>`;
  wireSay(el, s.t, api.lang); setTimeout(() => speak(s.t, api.lang, { btn: el.querySelector('.say') }), 250);
  const ta = el.querySelector('textarea'); ta.addEventListener('input', () => api.ready(ta.value.trim().length > 2));
  setTimeout(() => ta.focus({ preventScroll: true }), 300);
  return { check: () => { const r = compare(s.t, ta.value, 'en'); return { ok: r.score >= 0.86, answer: s.t, note: r.score >= 0.6 && r.score < 0.86 ? 'Gần đúng rồi, xem lại các từ còn thiếu.' : '' }; } };
};
R.spell = (el, it, api) => {
  if (audioOff()) return R.wordFromVi(el, it, api);
  const { w } = it;
  el.innerHTML = `<p class="q">Nghe và gõ từ</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div><input class="input" placeholder="Gõ từ bạn nghe được" autocapitalize="off" autocomplete="off" spellcheck="false" />`;
  wireSay(el, w.w, 'en'); setTimeout(() => speak(w.w, 'en', { btn: el.querySelector('.say') }), 250);
  const inp = el.querySelector('input'); inp.addEventListener('input', () => api.ready(inp.value.trim().length > 0));
  setTimeout(() => inp.focus({ preventScroll: true }), 300);
  return { check: () => ({ ok: norm(inp.value, 'en') === norm(w.w, 'en'), answer: `${w.w} = ${w.vi}` }) };
};
R.blank = (el, it, api) => {
  const { s, w } = it, zh = api.lang === 'zh';
  const txt = textOf(api.lang, s), re = zh ? w.w : new RegExp('\\b' + w.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const shown = zh ? txt.replace(w.w, '＿＿') : txt.replace(re, '_____');
  const opts = shuffle([w, ...distract(api.unit, w, 'w')]);
  el.innerHTML = `<p class="q">Chọn từ điền vào chỗ trống</p><div class="prompt"><div class="big ${zh ? 'zh' : ''}" style="font-size:${zh ? '1.5rem' : '1.2rem'}">${esc(shown)}</div></div>${optsHTML(opts.map((o) => esc(o.w)), api.lang, zh)}`;
  const done = single(el, api, opts.indexOf(w));
  return { check: () => { const ok = done(); if (!audioOff()) speak(txt, api.lang); return { ok, answer: `${txt} — ${s.vi}` }; } };
};
R.mcq = (el, it, api) => {
  const zh = api.lang === 'zh' && /[㐀-鿿]/.test(it.opts.join(''));
  const order = shuffle(it.opts.map((o, i) => i));
  const qtext = it.blank ? esc(it.q).replace(/_{2,}|＿+/g, '<b style="display:inline-block;min-width:60px;border-bottom:2px solid var(--acc)">&nbsp;</b>') : esc(it.q);
  el.innerHTML = `<p class="q" style="font-size:1rem;color:var(--graphite);margin-bottom:6px">${esc(it.note || '')}</p><div class="prompt"><div class="big ${zh || (api.lang === 'zh' && /[㐀-鿿]/.test(it.q)) ? 'zh' : ''}" style="font-size:${api.lang === 'zh' && /[㐀-鿿]/.test(it.q) ? '1.45rem' : '1.15rem'}">${qtext}${it.vi ? `<div class="py" style="margin-top:6px">${esc(it.vi)}</div>` : ''}</div></div>${optsHTML(order.map((i) => esc(it.opts[i])), api.lang, zh)}`;
  const done = single(el, api, order.indexOf(it.a));
  return { check: () => { const ok = done(); return { ok, answer: it.blank ? it.q.replace(/_{2,}|＿+/, it.opts[it.a]) : it.opts[it.a] }; } };
};
R.speak = (el, it, api) => {
  if (micOff()) return api.lang === 'zh' ? R.listenOrder(el, it, api) : R.order(el, it, api);
  const { s } = it, zh = api.lang === 'zh', txt = textOf(api.lang, s);
  el.innerHTML = `<p class="q">Đọc to câu này</p>
  <div class="prompt">${sayBtn()}<div><div class="target-line ${zh ? 'zh' : ''}" style="text-align:left">${esc(txt)}</div>${zh && S.settings.pinyin && s.py ? `<div class="py">${esc(s.py.join(' '))}</div>` : ''}<div class="muted" style="font-size:.9rem">${esc(s.vi)}</div></div></div>
  <button class="mic" type="button" aria-label="Bấm để nói">${I.mic}</button>
  <div class="heard">Bấm micro rồi đọc câu trên</div><div class="score"></div>
  <p style="text-align:center"><button class="chip skip" type="button">Không nói được lúc này</button></p>`;
  wireSay(el, txt, api.lang);
  let best = { score: 0 }, tries = 0;
  const mic = el.querySelector('.mic'), heard = el.querySelector('.heard'), sc = el.querySelector('.score');
  mic.addEventListener('click', async () => {
    if (mic.classList.contains('rec')) { stopListen(); return; }
    stopSpeak(); sfx('rec'); mic.classList.add('rec'); heard.textContent = 'Đang nghe…';
    try {
      const r = await listen(api.lang, { onPartial: (t) => { heard.textContent = t; } });
      mic.classList.remove('rec'); sfx('stop'); tries++;
      const cands = [r.text, ...(r.alts || [])].filter(Boolean);
      cands.forEach((c) => { const x = compare(txt, c, api.lang); if (x.score > best.score) best = x; });
      if (!cands.length) { heard.textContent = 'Chưa nghe rõ, bấm micro và nói lại nhé'; return; }
      heard.innerHTML = best.tokens.map((t, i) => `<span class="${best.hit[i] ? 'w-ok' : 'w-miss'}">${esc(t)}</span>`).join(zh ? '' : ' ');
      const n = Math.round(best.score * 5); sc.innerHTML = [0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      api.ready(best.score >= 0.7 || tries >= 2);
      if (best.score >= 0.7) { bump('speak'); api.autoCheck(); }
    } catch (e) {
      mic.classList.remove('rec');
      heard.textContent = e.message === 'not-allowed' ? 'Trình duyệt chưa cho dùng micro. Bật quyền micro rồi thử lại.' : 'Chưa nghe được, thử lại nhé';
      if (e.message === 'not-allowed' || e.message === 'unsupported') api.ready(true);
    }
  });
  el.querySelector('.skip').addEventListener('click', () => { pause.mic = Date.now() + 15 * 60000; api.skip('Đã tắt bài nói trong 15 phút'); });
  return { check: () => ({ ok: best.score >= 0.7, answer: txt, note: best.score ? `Khớp ${Math.round(best.score * 100)}%` : '' }) };
};
R.write = (el, it, api) => {
  const chars = Array.from(strip(it.w.w)).filter((c) => /[㐀-鿿]/.test(c));
  if (!window.HanziWriter || !chars.length) return R.wordFromVi(el, it, api);
  el.innerHTML = `<p class="q">Viết chữ “${esc(it.w.vi)}”</p><div class="hz-wrap"><div class="prompt" style="margin:0">${sayBtn()}<div><span class="py" style="font-size:1.1rem">${esc(it.w.py)}</span></div></div><div class="hz-box"><svg class="grid" viewBox="0 0 240 240"><line x1="0" y1="0" x2="240" y2="240"/><line x1="240" y1="0" x2="0" y2="240"/><line x1="120" y1="0" x2="120" y2="240"/><line x1="0" y1="120" x2="240" y2="120"/></svg><div id="hz"></div></div><div class="muted hz-info">Chữ ${1} / ${chars.length} · viết theo thứ tự nét</div><button class="chip hint" type="button">${I.eye} Xem cách viết</button></div>`;
  wireSay(el, it.w.w, 'zh');
  let ci = 0, mistakes = 0, writer = null;
  const css = getComputedStyle(document.documentElement);
  const run = () => {
    const box = el.querySelector('#hz'); box.innerHTML = '';
    writer = window.HanziWriter.create(box, chars[ci], { width: 240, height: 240, padding: 18, showCharacter: false, showOutline: true, strokeColor: css.getPropertyValue('--ink').trim() || '#1B2A44', outlineColor: css.getPropertyValue('--line').trim() || '#ccc', drawingColor: css.getPropertyValue('--zh').trim() || '#B7352B', highlightColor: '#F4C430', drawingWidth: 22 });
    el.querySelector('.hz-info').textContent = `Chữ ${ci + 1} / ${chars.length} · viết theo thứ tự nét`;
    writer.quiz({
      onCorrectStroke: () => sfx('tile'), onMistake: () => { mistakes++; sfx('tap'); },
      onComplete: (sum) => { sfx('pop'); ci++; if (ci < chars.length) setTimeout(run, 500); else { api.ready(true); api.autoCheck(); } },
    });
  };
  setTimeout(run, 50);
  el.querySelector('.hint').addEventListener('click', () => { if (writer) { writer.cancelQuiz && writer.cancelQuiz(); writer.animateCharacter({ onComplete: () => setTimeout(run, 300) }); } });
  return { check: () => ({ ok: mistakes <= chars.length * 3, answer: `${it.w.w} (${it.w.py})` }) };
};
// ---- các màn đọc / nghe dài (thông tin) ----
function glossMap(unit, lang) { const m = new Map(); unit.words.forEach((w) => m.set(lang === 'zh' ? w.w : w.w.toLowerCase(), w)); return m; }
function showGloss(target, w, lang) {
  document.querySelectorAll('.gloss').forEach((g) => g.remove());
  const r = target.getBoundingClientRect();
  const g = h(`<div class="gloss"><b class="${lang === 'zh' ? 'zh' : ''}">${esc(w.w)} ${lang === 'zh' ? `<span style="font-weight:400;opacity:.8;font-family:var(--f-body);font-size:.85rem">${esc(w.py)}</span>` : `<span style="font-weight:400;opacity:.8;font-size:.85rem">${esc(w.ipa || '')}</span>`}</b>${esc(w.vi)}</div>`);
  document.body.appendChild(g);
  const x = Math.min(window.innerWidth - g.offsetWidth - 10, Math.max(10, r.left)), y = r.top - g.offsetHeight - 8 < 10 ? r.bottom + 8 : r.top - g.offsetHeight - 8;
  g.style.left = x + 'px'; g.style.top = y + 'px';
  speak(w.w, lang); setTimeout(() => { const off = (e) => { if (!g.contains(e.target)) { g.remove(); document.removeEventListener('pointerdown', off); } }; document.addEventListener('pointerdown', off); }, 10);
}
function sentHTML(s, lang, gm) {
  if (lang === 'zh') {
    return s.tk.map((t, i) => { const w = gm.get(t); const py = s.pyTk ? s.pyTk[i] : ''; return `<ruby class="${w ? 'g' : ''}" data-g="${w ? esc(t) : ''}">${esc(t)}<rt>${esc(py)}</rt></ruby>`; }).join('');
  }
  return esc(s.t).replace(/[A-Za-z][A-Za-z'-]*/g, (m) => {
    const lw = m.toLowerCase(); const base = [lw, lw.replace(/s$/, ''), lw.replace(/es$/, ''), lw.replace(/ed$/, ''), lw.replace(/d$/, ''), lw.replace(/ing$/, ''), lw.replace(/ing$/, 'e')].find((x) => gm.has(x));
    return base ? `<span class="g" data-g="${esc(base)}">${m}</span>` : m;
  });
}
function wireGloss(el, unit, lang) {
  const gm = glossMap(unit, lang);
  el.querySelectorAll('[data-g]').forEach((x) => { if (!x.dataset.g) return; x.addEventListener('click', (e) => { e.stopPropagation(); showGloss(x, gm.get(x.dataset.g), lang); }); });
}
async function playSeq(nodes, texts, lang, stopRef) {
  for (let i = 0; i < texts.length; i++) {
    if (stopRef.stop) break;
    nodes.forEach((n) => n.classList.remove('now')); nodes[i].classList.add('now'); nodes[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    await speak(texts[i], lang); await new Promise((r) => setTimeout(r, 250));
  }
  nodes.forEach((n) => n.classList.remove('now'));
}
R.dialogue = (el, it, api) => {
  const d = api.unit.dlg, zh = api.lang === 'zh', speakers = [...new Set(d.lines.map((l) => l.s))];
  el.innerHTML = `<p class="q">${esc(d.title)}</p>
  <div class="toolbar"><button class="chip play" type="button">${I.play} Nghe cả đoạn</button><button class="chip vi" type="button" aria-pressed="${S.settings.vi}">Hiện nghĩa</button>${zh ? `<button class="chip pyb" type="button" aria-pressed="${S.settings.pinyin}">Pinyin</button>` : ''}</div>
  <div class="dlg ${S.settings.vi ? 'show-vi' : ''}">${d.lines.map((l) => `<div class="bubble ${l.s === speakers[1] ? 'me' : 'you'}" role="button" tabindex="0"><span class="who">${esc(l.s)}</span><span class="t ${zh ? 'zh' : ''}">${esc(textOf(api.lang, l))}</span>${zh ? `<small class="pyl" ${S.settings.pinyin ? '' : 'hidden'}>${esc((l.py || []).join(' '))}</small>` : ''}<small class="vi">${esc(l.vi)}</small></div>`).join('')}</div>
  <p class="muted" style="margin-top:14px;font-size:.88rem">Chạm vào từng câu để nghe lại.</p>`;
  const nodes = [...el.querySelectorAll('.bubble')], texts = d.lines.map((l) => textOf(api.lang, l)), stop = { stop: false };
  nodes.forEach((n, i) => n.addEventListener('click', () => { stop.stop = true; nodes.forEach((x) => x.classList.remove('now')); n.classList.add('now'); speak(texts[i], api.lang).then(() => n.classList.remove('now')); }));
  el.querySelector('.play').addEventListener('click', () => { stop.stop = false; playSeq(nodes, texts, api.lang, stop); });
  el.querySelector('.vi').addEventListener('click', (e) => { S.settings.vi = !S.settings.vi; save(); e.currentTarget.setAttribute('aria-pressed', S.settings.vi); el.querySelector('.dlg').classList.toggle('show-vi', S.settings.vi); });
  const pb = el.querySelector('.pyb'); if (pb) pb.addEventListener('click', (e) => { S.settings.pinyin = !S.settings.pinyin; save(); e.currentTarget.setAttribute('aria-pressed', S.settings.pinyin); el.querySelectorAll('.pyl').forEach((x) => x.hidden = !S.settings.pinyin); });
  if (!audioOff()) setTimeout(() => playSeq(nodes, texts, api.lang, stop), 500);
  api.onLeave = () => { stop.stop = true; stopSpeak(); };
  return { info: true };
};
// ---- đóng vai: người học nói phần của một nhân vật, máy đọc phần còn lại ----
R.roleplay = (el, it, api) => {
  const d = api.unit.dlg, zh = api.lang === 'zh', speakers = [...new Set(d.lines.map((l) => l.s))];
  const me = speakers.find((s) => /^(Minh|小明)$/.test(s)) || speakers[1] || speakers[0];
  const other = speakers.find((s) => s !== me) || '';
  const live = !micOff();
  el.innerHTML = `<p class="q">Đóng vai: bạn là ${esc(me)}</p>
  <p class="muted rp-sub">${live ? `Máy đọc lời ${esc(other)}, đến lượt bạn thì bấm micro và nói. Bấm “Hiện câu” nếu cần nhắc.` : `Máy đọc lời ${esc(other)}. Đến lượt bạn: nghe câu mẫu rồi nói theo thật to.`}</p>
  <div class="dlg rp"></div><div class="rp-turn"></div>`;
  const thread = el.querySelector('.rp'), turn = el.querySelector('.rp-turn'), stop = { stop: false };
  let i = 0, scores = [];
  const bubble = (l, mine, extra = '') => {
    const b = h(`<div class="bubble ${mine ? 'me' : 'you'} rp-in"><span class="who">${esc(mine ? 'Bạn' : l.s)}</span><span class="t ${zh ? 'zh' : ''}">${esc(textOf(api.lang, l))}</span>${zh && S.settings.pinyin && l.py ? `<small>${esc(l.py.join(' '))}</small>` : ''}<small class="vi" style="display:block">${esc(l.vi)}</small>${extra}</div>`);
    thread.appendChild(b); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return b;
  };
  const finishAll = () => {
    turn.innerHTML = `<div class="rp-done">${I.check}<b>Xong vai ${esc(me)}!</b>${scores.length ? `<span>Độ khớp trung bình ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100)}%</span>` : ''}</div>`;
    sfx('pop'); api.ready(true); api.autoOk();
  };
  const next = async () => {
    if (stop.stop) return;
    if (i >= d.lines.length) return finishAll();
    const l = d.lines[i];
    if (l.s !== me) {
      const b = bubble(l, false); b.classList.add('now');
      turn.innerHTML = `<div class="rp-wait"><span class="dots"><i></i><i></i><i></i></span> ${esc(l.s)} đang nói…</div>`;
      if (!audioOff()) await speak(textOf(api.lang, l), api.lang); else await new Promise((r) => setTimeout(r, 1400));
      b.classList.remove('now'); i++; return next();
    }
    const txt = textOf(api.lang, l);
    turn.innerHTML = `<div class="rp-card">
      <span class="tag">Đến lượt bạn</span>
      <div class="rp-vi">${esc(l.vi)}</div>
      <div class="rp-target ${zh ? 'zh' : ''} blur">${esc(txt)}${zh && S.settings.pinyin && l.py ? `<small class="py" style="display:block">${esc(l.py.join(' '))}</small>` : ''}</div>
      <div class="rp-act">
        <button class="chip reveal" type="button">${I.eye} Hiện câu</button>
        <button class="chip hear" type="button">${I.speaker} Nghe mẫu</button>
      </div>
      ${live ? `<button class="mic" type="button" aria-label="Bấm để nói">${I.mic}</button><div class="heard"></div>` : `<button class="btn acc wide said" type="button">${I.check} Tôi đã nói câu này</button>`}
    </div>`;
    const tgt = turn.querySelector('.rp-target');
    turn.querySelector('.reveal').addEventListener('click', () => { tgt.classList.remove('blur'); sfx('tap'); });
    turn.querySelector('.hear').addEventListener('click', (e) => { tgt.classList.remove('blur'); speak(txt, api.lang, { btn: e.currentTarget }); });
    if (!live) {
      tgt.classList.remove('blur');
      if (!audioOff()) speak(txt, api.lang);
      turn.querySelector('.said').addEventListener('click', () => { sfx('ok'); bump('speak'); bubble(l, true); i++; next(); });
      return;
    }
    const mic = turn.querySelector('.mic'), heard = turn.querySelector('.heard');
    let tries = 0;
    mic.addEventListener('click', async () => {
      if (mic.classList.contains('rec')) { stopListen(); return; }
      stopSpeak(); sfx('rec'); mic.classList.add('rec'); heard.textContent = 'Đang nghe…';
      try {
        const r = await listen(api.lang, { onPartial: (t) => { heard.textContent = t; } });
        mic.classList.remove('rec'); sfx('stop'); tries++;
        let best = { score: 0 };
        [r.text, ...(r.alts || [])].filter(Boolean).forEach((c) => { const x = compare(txt, c, api.lang); if (x.score > best.score) best = x; });
        if (best.score >= 0.6 || tries >= 3) {
          scores.push(best.score); if (best.score >= 0.6) { sfx('ok'); bump('speak'); } else sfx('tap');
          const b = bubble(l, true, `<span class="rp-score">${best.score >= 0.85 ? 'Rất chuẩn' : best.score >= 0.6 ? 'Ổn rồi' : 'Lần sau thử lại nhé'} · ${Math.round(best.score * 100)}%</span>`);
          if (best.score >= 0.6) b.classList.add('good');
          i++; setTimeout(next, 500);
        } else {
          sfx('bad'); tgt.classList.remove('blur');
          heard.innerHTML = best.tokens ? best.tokens.map((t, j) => `<span class="${best.hit[j] ? 'w-ok' : 'w-miss'}">${esc(t)}</span>`).join(zh ? '' : ' ') + `<br><small>Khớp ${Math.round(best.score * 100)}%, thử lại nhé</small>` : 'Chưa nghe rõ, thử lại nhé';
        }
      } catch (e) {
        mic.classList.remove('rec');
        heard.textContent = e.message === 'not-allowed' ? 'Trình duyệt chưa cho dùng micro. Bật quyền micro rồi thử lại.' : 'Chưa nghe được, thử lại nhé';
        if (e.message === 'not-allowed' || e.message === 'unsupported') { pause.mic = Date.now() + 15 * 60000; scores.push(0); bubble(l, true); i++; next(); }
      }
    });
  };
  setTimeout(next, 400);
  api.onLeave = () => { stop.stop = true; stopSpeak(); stopListen(); };
  return { check: () => ({ ok: true, answer: '' }), manual: true };
};
R.reading = (el, it, api) => {
  const rd = api.unit.read, zh = api.lang === 'zh', gm = glossMap(api.unit, api.lang);
  el.innerHTML = `<p class="q">${esc(rd.title)}</p>
  <div class="toolbar"><button class="chip play" type="button">${I.play} Nghe bài đọc</button><button class="chip vi" type="button" aria-pressed="false">Bản dịch</button>${zh ? `<button class="chip pyb" type="button" aria-pressed="${S.settings.pinyin}">Pinyin</button>` : ''}</div>
  <div class="reading ${zh ? 'zh' : ''} ${zh && !S.settings.pinyin ? 'no-py' : ''}">${rd.sents.map((s) => `<span class="s">${sentHTML(s, api.lang, gm)}</span>`).join(zh ? '' : ' ')}</div>
  <div class="vi-box" hidden>${esc(rd.sents.map((s) => s.vi).join(' '))}</div>
  <p class="muted" style="margin-top:12px;font-size:.88rem">Chạm vào từ gạch chân để xem nghĩa.</p>`;
  wireGloss(el, api.unit, api.lang);
  const nodes = [...el.querySelectorAll('.reading .s')], texts = rd.sents.map((s) => textOf(api.lang, s)), stop = { stop: false };
  el.querySelector('.play').addEventListener('click', () => { stop.stop = false; playSeq(nodes, texts, api.lang, stop); });
  el.querySelector('.vi').addEventListener('click', (e) => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); el.querySelector('.vi-box').hidden = !on; });
  const pb = el.querySelector('.pyb'); if (pb) pb.addEventListener('click', (e) => { S.settings.pinyin = !S.settings.pinyin; save(); e.currentTarget.setAttribute('aria-pressed', S.settings.pinyin); el.querySelector('.reading').classList.toggle('no-py', !S.settings.pinyin); });
  api.onLeave = () => { stop.stop = true; stopSpeak(); };
  return { info: true };
};
R.grammar = (el, it, api) => {
  const g = api.unit.gram, zh = api.lang === 'zh';
  el.innerHTML = `<div class="grammar"><p class="q" style="margin-bottom:4px">Ngữ pháp</p><div class="card"><h2>${esc(g.title)}</h2><p class="rule" style="margin:12px 0">${esc(g.rule)}</p><p style="color:var(--ink-2)">${esc(g.note || '')}</p></div>
  <div class="card"><ul>${g.ex.map((x, i) => `<li><span class="t ${zh ? 'zh' : ''}" style="display:flex;gap:8px;align-items:center"><button class="mini-say" type="button" data-i="${i}" aria-label="Nghe">${I.speaker}</button>${esc(textOf(api.lang, x))}</span>${zh && x.py ? `<small>${esc(x.py.join(' '))}</small>` : ''}<small>${esc(x.vi)}</small></li>`).join('')}</ul></div></div>`;
  el.querySelectorAll('.mini-say').forEach((b) => b.addEventListener('click', () => speak(textOf(api.lang, g.ex[+b.dataset.i]), api.lang, { btn: b })));
  return { info: true };
};

/* ---------------- trình chạy bài ---------------- */
export const runCustom = (o) => runLesson({ ...o, custom: true });
export function runLesson({ unit, k = 0, lang, onExit, queue: given, custom = false }) {
  const queue = given ? given.slice() : buildQueue(unit, k, lang);
  const total0 = queue.length;
  let idx = 0, right = 0, wrong = 0, requeued = 0, cur = null, state = 'answer', combo = 0;
  const t0 = Date.now(), seen = new WeakMap();
  const root = h(`<div class="player" data-lang="${lang}" role="dialog" aria-label="Bài học">
    <div class="p-top"><button class="icon-btn quit" type="button" aria-label="Thoát bài">${I.x}</button><div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i style="width:0%"></i></div></div>
    <div class="p-stage"><div class="p-inner"></div></div>
    <div class="p-foot"><div class="in"><div class="fb"><span class="mark"></span><div><b></b><p></p></div></div><div class="foot-row"><button class="btn ghost skipb" type="button" hidden>Bỏ qua</button><button class="btn acc check" type="button" disabled>Kiểm tra</button></div></div></div>
  </div>`);
  document.body.appendChild(root); document.body.style.overflow = 'hidden'; document.body.classList.add('playing');
  let innerEl = $('.p-inner', root); const foot = $('.p-foot', root), btn = $('.check', root), skipb = $('.skipb', root), bar = $('.prog i', root);
  let api = null;
  const setProg = () => { const p = Math.round((idx / (total0 + requeued)) * 100); bar.style.width = p + '%'; };
  function show() {
    if (api && api.onLeave) api.onLeave();
    document.querySelectorAll('.gloss').forEach((g) => g.remove());
    if (idx >= queue.length) return finish();
    const it = queue[idx]; state = 'answer';
    foot.classList.remove('ok', 'bad');
    const stage = $('.p-stage', root); stage.scrollTop = 0;
    const fresh = h('<div class="p-inner"></div>'); innerEl.replaceWith(fresh); innerEl = fresh;
    api = { unit, lang, ready: (v) => { if (state === 'answer') btn.disabled = !v; }, autoCheck: () => setTimeout(() => { if (state === 'answer') doCheck(); }, 450), autoOk: () => setTimeout(() => { if (state === 'answer') doCheck(); }, 380), skip: (msg) => { toastMsg(msg); queue.splice(idx, 1); total0Adj(); show(); }, keys: null, onLeave: null };
    cur = R[it.type](fresh, it, api);
    if (cur.info) { btn.disabled = false; btn.textContent = 'Tiếp tục'; state = 'info'; }
    else { btn.disabled = true; btn.textContent = 'Kiểm tra'; }
    skipb.hidden = !(it.type === 'listenWord' || it.type === 'listenLine' || it.type === 'dictation' || it.type === 'spell' || it.type === 'listenOrder' || it.type === 'roleplay' || it.type === 'write');
    setProg();
    function total0Adj() { /* giữ tiến độ */ }
  }
  function toastMsg(m) { const t = document.getElementById('toast'); if (!t) return; t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); }
  function doCheck() {
    const it = queue[idx], r = cur.check();
    state = 'checked'; btn.disabled = false; btn.textContent = 'Tiếp tục'; skipb.hidden = true;
    if (r.ok) {
      right++; combo++; foot.classList.add('ok'); sfx(combo > 0 && combo % 5 === 0 ? 'combo' : 'ok');
      $('.fb .mark', root).innerHTML = I.check; $('.fb b', root).textContent = ['Chính xác!', 'Đúng rồi!', 'Tuyệt!', 'Quá chuẩn!'][Math.floor(Math.random() * 4)] + (combo >= 5 ? `  ·  ${combo} câu liền` : '');
      $('.fb p', root).textContent = r.note || '';
    } else {
      wrong++; combo = 0; foot.classList.add('bad'); sfx('bad');
      $('.fb .mark', root).innerHTML = I.x; $('.fb b', root).textContent = 'Chưa đúng';
      $('.fb p', root).textContent = (r.answer ? 'Đáp án: ' + r.answer : '') + (r.note ? '  ' + r.note : '');
      const n = (seen.get(it) || 0); if (n < 1 && it.type !== 'match') { seen.set(it, n + 1); queue.push(it); requeued++; }
    }
    setProg();
  }
  let endResult = null;
  btn.addEventListener('click', () => {
    if (state === 'end') { close(); onExit(endResult); return; }
    if (state === 'answer') doCheck();
    else { if (state === 'info') sfx('tap'); idx++; show(); }
  });
  skipb.addEventListener('click', () => { if (!['roleplay', 'write'].includes(queue[idx].type)) { pause.audio = Date.now() + 15 * 60000; toastMsg('Đã tắt bài nghe trong 15 phút'); } queue.splice(idx, 1); show(); });
  const onKey = (e) => {
    if (e.target.matches('textarea, input')) { if (e.key === 'Enter' && !e.shiftKey && !btn.disabled) { e.preventDefault(); btn.click(); } return; }
    if (e.key === 'Enter' && !btn.disabled) { e.preventDefault(); btn.click(); }
    else if (/^[1-6]$/.test(e.key) && api && api.keys && state === 'answer') api.keys(+e.key - 1);
    else if (e.key === 'Escape') quit();
  };
  document.addEventListener('keydown', onKey);
  function close() { document.body.classList.remove('playing'); const cf = document.getElementById('confetti'); if (cf) cf.remove(); stopSpeak(); stopListen(); document.removeEventListener('keydown', onKey); root.remove(); document.body.style.overflow = ''; document.querySelectorAll('.gloss').forEach((g) => g.remove()); }
  function quit() {
    if (idx === 0 || confirmQuit()) { close(); onExit({ done: false }); }
  }
  function confirmQuit() { return window.confirm('Thoát bài học? Tiến độ của bài này sẽ không được lưu.'); }
  $('.quit', root).addEventListener('click', quit);
  function finish() {
    const acc = right / Math.max(1, right + wrong);
    const firstTime = !custom && !(S.done[unit.id] && S.done[unit.id][k]);
    const xp = custom ? Math.max(3, right) : 10 + (acc >= 0.95 ? 5 : acc >= 0.8 ? 2 : 0) + (firstTime ? 0 : -4);
    addXP(xp); bump('lessons');
    if (!custom) { markDone(unit.id, k); if (k === 0) addWords(lang, unit.words.map((w) => w.w)); }
    const mins = Math.max(1, Math.round((Date.now() - t0) / 60000)); S.minutes += mins; save(true);
    bar.style.width = '100%'; sfx('done');
    const fresh = h(`<div class="p-inner"><div class="result">
      <div class="res-art"><svg class="trophy" viewBox="0 0 200 120" aria-hidden="true"><path class="tr-m" d="M10 110h180L100 22z" fill="none" stroke="var(--acc)" stroke-width="7" stroke-linejoin="round"/><path class="tr-m" d="M55 110l45-50 45 50M100 22v88" fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/><circle cx="10" cy="110" r="7" fill="var(--ink)"/><circle cx="190" cy="110" r="7" fill="var(--ink)"/></svg>${mascot({ size: 96, mood: acc >= 0.8 ? 'wow' : 'happy', cls: 'jump', wave: true })}</div>
      <div><h1>${acc >= 0.95 ? 'Không sai câu nào!' : acc >= 0.8 ? 'Làm tốt lắm!' : 'Xong bài rồi!'}</h1><p class="muted" style="margin-top:6px">${custom ? 'Luyện tập' : esc(unit.title) + ' · ' + LESSONS[k].name}</p></div>
      <div class="stats"><div class="stat xp"><b data-count="${xp}">0</b><span>XP</span></div><div class="stat acc2"><b>${Math.round(acc * 100)}%</b><span>Chính xác</span></div><div class="stat tm"><b>${mins}′</b><span>Thời gian</span></div></div>
      ${k === 0 && !custom ? `<p class="muted">${unit.words.length} từ mới đã vào thẻ ôn tập.</p>` : ''}
    </div></div>`);
    innerEl.replaceWith(fresh); innerEl = fresh;
    fresh.querySelectorAll('.tr-m').forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.animate([{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 900, easing: 'cubic-bezier(.6,.05,.3,1)', fill: 'forwards' }); });
    const c = fresh.querySelector('[data-count]'); let v = 0; const step = () => { v++; c.textContent = v; if (v < xp) setTimeout(step, 600 / xp); }; setTimeout(step, 300);
    confetti();
    foot.classList.remove('ok', 'bad'); skipb.hidden = true; btn.disabled = false; btn.textContent = 'Tiếp tục'; state = 'end';
    endResult = { done: true, unit, k, xp };
  }
  show();
}
function confetti() {
  const cv = document.createElement('canvas'); cv.id = 'confetti'; document.body.appendChild(cv);
  const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  const cs = getComputedStyle(document.documentElement);
  const cols = ['--hl', '--en', '--zh', '--ink', '--ok'].map((v) => cs.getPropertyValue(v).trim());
  const P = Array.from({ length: 90 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * 0.38, vx: (Math.random() - .5) * 11, vy: -Math.random() * 12 - 4, r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, s: 6 + Math.random() * 7, c: cols[Math.floor(Math.random() * cols.length)] }));
  let f = 0; const t0 = performance.now();
  setTimeout(() => cv.remove(), 3200);
  const tick = () => {
    c.clearRect(0, 0, innerWidth, innerHeight);
    P.forEach((p) => { p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr; c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.beginPath(); c.moveTo(0, -p.s / 1.4); c.lineTo(p.s / 1.4, p.s / 1.6); c.lineTo(-p.s / 1.4, p.s / 1.6); c.closePath(); c.fill(); c.restore(); });
    if (++f < 150 && performance.now() - t0 < 3000 && cv.isConnected) requestAnimationFrame(tick); else cv.remove();
  };
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) tick(); else cv.remove();
}
