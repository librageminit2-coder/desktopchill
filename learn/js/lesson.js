// Bộ máy bài học: tạo bài tập từ nội dung chủ đề và chạy từng bước
import { I } from './icons.js?v=10';
import { mascot } from './mascot.js?v=10';
import { sfx } from './sound.js?v=10';
import { speak, stopSpeak, listen, stopListen, canListen, canSpeak, compare, norm, micMsg, micBlocked, MIC_HELP, listenLong, stopLong } from './speech.js?v=10';
const FATAL_MIC = ['not-allowed', 'service-not-allowed', 'unsupported', 'network', 'audio-capture'];
const micErrHTML = (code) => `<span class="mic-err">${esc(micMsg(code))}</span>${micBlocked(code) ? MIC_HELP : ''}`;
const lvl = (mic) => (v) => mic.style.setProperty('--lv', v.toFixed(3));
import { S, addXP, markDone, addWords, save, bump, setStars } from './store.js?v=10';

const $ = (s, r = document) => r.querySelector(s);
const h = (str) => { const t = document.createElement('template'); t.innerHTML = str.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a, n) => shuffle(a).slice(0, n);
const strip = (s) => s.replace(/\s+/g, '');
export const LESSONS = [
  { k: 0, name: 'Vocabulary 1', desc: '10 new words: listen, see examples, match meanings', icon: 'book' },
  { k: 1, name: 'Vocabulary 2', desc: '10 more words, plus a recap of part 1', icon: 'cards' },
  { k: 2, name: 'Dialogue 1', desc: 'Listen, rebuild lines and speak along', icon: 'chat' },
  { k: 3, name: 'Dialogue 2', desc: 'A second situation, then role-play it', icon: 'roleplay' },
  { k: 4, name: 'Reading', desc: 'Read, answer questions, take dictation', icon: 'read' },
  { k: 5, name: 'Grammar 1', desc: 'First pattern: understand, fill in, build sentences', icon: 'ruler' },
  { k: 6, name: 'Grammar 2', desc: 'Second pattern: understand, fill in, speak', icon: 'target' },
  { k: 7, name: 'Unit test', desc: 'Listening, speaking, reading, words and grammar together', icon: 'trophy' },
];
const IELTS_NAMES = ['Academic vocabulary 1', 'Academic vocabulary 2', 'Speaking Part 1', 'Speaking Parts 2–3', 'Reading', 'High-band grammar', 'Writing', 'Unit test'];
const IELTS_DESC = ['10 academic words: meaning, collocations, examples', '10 more words plus paraphrasing', 'Short natural answers with extension', 'Cue card talk, then a Part 3 discussion as the candidate', 'IELTS-style passage with T/F/NG and multiple choice', 'Structures that lift your Grammatical Range score', 'Task, plan, model answer and your own timed essay', 'All four skills from this unit'];
export const lessonName = (lang, k) => (lang === 'ielts' ? IELTS_NAMES[k] : LESSONS[k].name);
export const lessonDesc = (lang, k) => (lang === 'ielts' ? IELTS_DESC[k] : LESSONS[k].desc);
// tạm tắt bài nói / nghe khi người học đang ở nơi không tiện
const pause = { mic: 0, audio: 0 };
const micOff = () => Date.now() < pause.mic || !canListen();
const audioOff = () => Date.now() < pause.audio || !canSpeak();

/* ---------------- dựng hàng đợi bài tập ---------------- */
function textOf(lang, x) { return lang === 'zh' ? strip(x.t) : x.t; }
const okLen = (x, a = 3, b = 12) => x && x.tk && x.tk.length >= a && x.tk.length <= b;
function vocabQueue(Wn, W, lang, q) {
  const groups = [Wn.slice(0, 3), Wn.slice(3, 6), Wn.slice(6, 8), Wn.slice(8, 10)].filter((g) => g.length);
  groups.forEach((g, gi) => {
    g.forEach((w) => q.push({ type: 'learn', w }));
    shuffle(g).forEach((w, i) => q.push(i % 2 ? { type: 'listenWord', w } : { type: 'meaning', w }));
    if (gi === 1 || gi === 3) { const ex = Wn.slice(0, (gi + 1) * 3).filter((w) => okLen({ tk: w.exTk }, 3, 11)); if (ex.length) { const w = pick(ex, 1)[0]; q.push({ type: 'order', s: { t: w.ex, vi: w.exVi, tk: w.exTk, py: w.exPy } }); } }
  });
  q.push({ type: 'match', words: pick(Wn, Math.min(5, Wn.length)) });
  pick(Wn, 3).forEach((w) => q.push({ type: 'wordFromVi', w }));
  if (lang === 'zh') pick(Wn.filter((w) => strip(w.w).length <= 2), 2).forEach((w) => q.push({ type: 'write', w }));
  else pick(Wn.filter((w) => !/\s/.test(w.w)), 2).forEach((w) => q.push({ type: 'spell', w }));
  const ex = Wn.filter((w) => okLen({ tk: w.exTk }, 3, 11));
  if (ex.length) { const w = pick(ex, 1)[0]; q.push({ type: 'speak', s: { t: w.ex, vi: w.exVi, tk: w.exTk, py: w.exPy } }); }
}
function dlgQueue(D, which, W, q, roleplay) {
  const L = D.lines;
  q.push({ type: 'dialogue', d: which });
  pick(L.filter((l) => okLen(l)), 3).forEach((l) => q.push({ type: 'order', s: l }));
  pick(L, 2).forEach((l) => q.push({ type: 'listenLine', s: l, pool: L }));
  pick(L.filter((l) => okLen(l, 2, 12)), 2).forEach((l) => q.push({ type: 'speak', s: l }));
  pick(W, 2).forEach((w) => q.push({ type: 'meaning', w }));
  if (roleplay) q.push({ type: 'roleplay', d: which });
}
function gramQueue(G, which, W, q, extraSents) {
  q.push({ type: 'grammar', g: which });
  G.drill.forEach((d) => q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: G.title, vi: d.vi }));
  pick(G.ex.filter((x) => okLen(x)), 3).forEach((s) => q.push({ type: 'order', s }));
  pick(G.ex.filter((x) => okLen(x)), 1).forEach((s) => q.push({ type: 'speak', s }));
  pick(extraSents, 1).forEach((s) => q.push({ type: 'speak', s }));
  pick(W, 3).forEach((w, i) => q.push(i === 1 ? { type: 'listenWord', w } : { type: 'wordFromVi', w }));
}
export function buildQueue(unit, k, lang) {
  const W = unit.words, W1 = W.slice(0, 10), W2 = W.slice(10, 20), q = [];
  const D2 = unit.dlg2 && unit.dlg2.lines && unit.dlg2.lines.length ? unit.dlg2 : unit.dlg;
  const G2 = unit.gram2 && unit.gram2.drill ? unit.gram2 : unit.gram;
  const sentences = [...unit.dlg.lines, ...D2.lines, ...unit.read.sents, ...unit.gram.ex, ...G2.ex].filter((x) => okLen(x));
  if (lang === 'ielts' && (k === 3 || k === 5 || k === 6)) {
    if (k === 3) { if (unit.cue) q.push({ type: 'cue' }); dlgQueue(D2, D2 === unit.dlg ? 'dlg' : 'dlg2', W, q, true); return q; }
    if (k === 5) { gramQueue(unit.gram, 'gram', W, q, sentences); if (G2 !== unit.gram) { q.push({ type: 'grammar', g: 'gram2' }); G2.drill.forEach((d) => q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: G2.title, vi: d.vi })); } return q; }
    if (k === 6 && unit.write) { q.push({ type: 'writeTask' }); pick(W, 4).forEach((w, i) => q.push({ type: i % 2 ? 'wordFromVi' : 'meaning', w })); return q; }
  }
  if (k === 0) vocabQueue(W1, W, lang, q);
  else if (k === 1) {
    if (W2.length) { vocabQueue(W2, W, lang, q); pick(W1, 3).forEach((w, i) => q.splice(6 + i * 5, 0, { type: i % 2 ? 'listenWord' : 'meaning', w })); }
    else vocabQueue(W1, W, lang, q);
  } else if (k === 2) dlgQueue(unit.dlg, 'dlg', W, q, D2 === unit.dlg);
  else if (k === 3) dlgQueue(D2, D2 === unit.dlg ? 'dlg' : 'dlg2', W, q, true);
  else if (k === 4) {
    q.push({ type: 'reading' });
    unit.read.q.forEach((x) => q.push({ type: 'mcq', q: x.q, opts: x.opts, a: x.a, note: 'From the reading' }));
    pick(unit.read.sents.filter((s) => okLen(s, 4, 14)), 3).forEach((s) => q.push(lang === 'zh' ? { type: 'listenOrder', s } : { type: 'dictation', s }));
    const withWord = unit.read.sents.map((s) => ({ s, w: W.find((w) => textOf(lang, s).toLowerCase().includes((lang === 'zh' ? w.w : w.w.toLowerCase()))) })).filter((x) => x.w);
    pick(withWord, 3).forEach((x) => q.push({ type: 'blank', s: x.s, w: x.w }));
    pick(unit.read.sents.filter((s) => okLen(s, 3, 12)), 1).forEach((s) => q.push({ type: 'speak', s }));
  } else if (k === 5) gramQueue(unit.gram, 'gram', W, q, sentences);
  else if (k === 6) gramQueue(G2, G2 === unit.gram ? 'gram' : 'gram2', W, q, sentences);
  else {
    // kiểm tra chủ đề: không có thẻ học, trộn mọi kỹ năng
    pick(W, 6).forEach((w, i) => q.push({ type: ['meaning', 'listenWord', 'wordFromVi'][i % 3], w }));
    q.push({ type: 'match', words: pick(W, 5) });
    [unit.dlg, D2].forEach((D) => pick(D.lines.filter((l) => okLen(l)), 1).forEach((s) => q.push({ type: 'order', s })));
    pick(D2.lines, 1).forEach((l) => q.push({ type: 'listenLine', s: l, pool: D2.lines }));
    pick(unit.read.sents.filter((s) => okLen(s, 4, 14)), 1).forEach((s) => q.push(lang === 'zh' ? { type: 'listenOrder', s } : { type: 'dictation', s }));
    pick(unit.read.q, 2).forEach((x) => q.push({ type: 'mcq', q: x.q, opts: x.opts, a: x.a, note: 'From the reading: ' + unit.read.title }));
    [unit.gram, G2].forEach((G) => pick(G.drill, 2).forEach((d) => q.push({ type: 'mcq', q: d.t, opts: d.opts, a: d.a, blank: true, note: G.title, vi: d.vi })));
    pick(sentences, 2).forEach((s) => q.push({ type: 'speak', s }));
  }
  return q;
}

/* ---------------- các dạng bài ---------------- */
const sayBtn = (cls = '') => `<button class="say ${cls}" type="button" aria-label="${cls ? 'Listen slowly' : 'Listen'}">${cls ? I.turtle : I.speaker}</button>`;
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
  el.innerHTML = `<p class="q">New word</p>
  <div class="learn-card">
    <span class="tag">${esc(w.pos || '')}</span>
    <div class="word">${sayBtn()}<div><h2 class="${zh ? 'zh' : ''}">${esc(w.w)}</h2><div class="ipa">${esc(zh ? w.py : w.ipa || '')}</div></div>${sayBtn('slow')}</div>
    <div class="mean">${esc(w.vi)}</div>
    ${w.ex ? `<div class="ex"><div class="t ${zh ? 'zh' : ''}"><button class="mini-say" type="button" aria-label="Listen to the example">${I.speaker}</button><span>${esc(zh ? strip(w.ex) : w.ex)}</span></div>${zh && w.exPy ? `<small>${esc(w.exPy.join(' '))}</small>` : ''}<small>${esc(w.exVi || '')}</small></div>` : ''}
  </div>`;
  wireSay(el, w.w, api.lang);
  const ms = el.querySelector('.mini-say'); if (ms) ms.addEventListener('click', () => speak(w.ex, api.lang, { btn: ms }));
  if (!audioOff()) setTimeout(() => speak(w.w, api.lang, { btn: el.querySelector('.say') }), 250);
  return { info: true };
};
R.meaning = (el, it, api) => {
  const { w } = it, opts = shuffle([w, ...distract(api.unit, w, 'vi')]);
  el.innerHTML = `<p class="q">What does this mean?</p><div class="prompt">${sayBtn()}<div class="big ${api.lang === 'zh' ? 'zh' : ''}">${esc(w.w)}${api.lang === 'zh' && S.settings.pinyin ? `<div class="py">${esc(w.py)}</div>` : ''}</div></div>${optsHTML(opts.map((o) => esc(o.vi)), api.lang)}`;
  wireSay(el, w.w, api.lang); if (!audioOff()) setTimeout(() => speak(w.w, api.lang), 200);
  const done = single(el, api, opts.indexOf(w));
  return { check: () => ({ ok: done(), answer: `${w.w} = ${w.vi}` }) };
};
R.wordFromVi = (el, it, api) => {
  const { w } = it, zh = api.lang === 'zh', opts = shuffle([w, ...distract(api.unit, w, 'w')]);
  el.innerHTML = `<p class="q">Pick the word for “${esc(w.vi)}”</p>${optsHTML(opts.map((o) => zh ? `${esc(o.w)}${S.settings.pinyin ? `<span class="py">${esc(o.py)}</span>` : ''}` : esc(o.w)), api.lang, zh)}`;
  const done = single(el, api, opts.indexOf(w), (i) => speak(opts[i].w, api.lang));
  return { check: () => ({ ok: done(), answer: w.w }) };
};
R.listenWord = (el, it, api) => {
  if (audioOff()) return R.meaning(el, it, api);
  const { w } = it, zh = api.lang === 'zh', opts = shuffle([w, ...distract(api.unit, w, 'w')]);
  el.innerHTML = `<p class="q">Listen and pick the word</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div>${optsHTML(opts.map((o) => zh ? esc(o.w) : esc(o.w)), api.lang, zh)}`;
  wireSay(el, w.w, api.lang); setTimeout(() => speak(w.w, api.lang, { btn: el.querySelector('.say') }), 250);
  const done = single(el, api, opts.indexOf(w));
  return { check: () => ({ ok: done(), answer: `${w.w}${zh ? ' (' + w.py + ')' : ''} = ${w.vi}` }) };
};
R.match = (el, it, api) => {
  const zh = api.lang === 'zh', L = shuffle(it.words), Rr = shuffle(it.words);
  el.innerHTML = `<p class="q">Match words to meanings</p><div class="match">${L.map((w, i) => `<button class="opt ${zh ? 'zh' : ''}" data-side="l" data-w="${i}" style="grid-column:1;grid-row:${i + 1}">${esc(w.w)}</button>`).join('')}${Rr.map((w, i) => `<button class="opt" data-side="r" data-w="${i}" style="grid-column:2;grid-row:${i + 1}">${esc(w.vi)}</button>`).join('')}</div>`;
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
  el.innerHTML = `<p class="q">Build the sentence</p><div class="prompt"><button class="mini-say" type="button" aria-label="Listen">${I.speaker}</button><div>${esc(s.vi)}</div></div>`;
  el.querySelector('.mini-say').addEventListener('click', (e) => speak(textOf(api.lang, s), api.lang, { btn: e.currentTarget }));
  const target = s.tk.join(zh ? '' : ' ');
  const done = tilesUI(el, s.tk, api, { zh, target });
  return { check: () => { const ok = done(); if (!audioOff()) speak(textOf(api.lang, s), api.lang); return { ok, answer: zh ? strip(s.t) : s.t }; } };
};
R.listenOrder = (el, it, api) => {
  if (audioOff()) return R.order(el, it, api);
  const { s } = it;
  el.innerHTML = `<p class="q">Listen and rebuild the sentence</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div>`;
  wireSay(el, textOf(api.lang, s), api.lang); setTimeout(() => speak(textOf(api.lang, s), api.lang, { btn: el.querySelector('.say') }), 250);
  const done = tilesUI(el, s.tk, api, { zh: true, target: s.tk.join('') });
  return { check: () => ({ ok: done(), answer: `${strip(s.t)} — ${s.vi}` }) };
};
R.listenLine = (el, it, api) => {
  if (audioOff()) return R.order(el, { s: it.s }, api);
  const { s } = it, zh = api.lang === 'zh';
  const others = pick(it.pool.filter((x) => x !== s), 2), opts = shuffle([s, ...others]);
  el.innerHTML = `<p class="q">What did you hear?</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div>${optsHTML(opts.map((o) => esc(o.vi)), api.lang)}`;
  wireSay(el, textOf(api.lang, s), api.lang); setTimeout(() => speak(textOf(api.lang, s), api.lang, { btn: el.querySelector('.say') }), 250);
  const done = single(el, api, opts.indexOf(s));
  return { check: () => ({ ok: done(), answer: `${zh ? strip(s.t) : s.t}` }) };
};
R.dictation = (el, it, api) => {
  if (audioOff()) return R.order(el, it, api);
  const { s } = it;
  el.innerHTML = `<p class="q">Listen and type the sentence</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div><textarea class="type-in" rows="3" placeholder="Type what you hear…" autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>`;
  wireSay(el, s.t, api.lang); setTimeout(() => speak(s.t, api.lang, { btn: el.querySelector('.say') }), 250);
  const ta = el.querySelector('textarea'); ta.addEventListener('input', () => api.ready(ta.value.trim().length > 2));
  setTimeout(() => ta.focus({ preventScroll: true }), 300);
  return { check: () => { const r = compare(s.t, ta.value, 'en'); return { ok: r.score >= 0.86, answer: s.t, note: r.score >= 0.6 && r.score < 0.86 ? 'Almost there. Check the missing words.' : '' }; } };
};
R.spell = (el, it, api) => {
  if (audioOff()) return R.wordFromVi(el, it, api);
  const { w } = it;
  el.innerHTML = `<p class="q">Listen and spell the word</p><div class="listen-big">${sayBtn()}${sayBtn('slow')}</div><input class="input" placeholder="Type the word you hear" autocapitalize="off" autocomplete="off" spellcheck="false" />`;
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
  el.innerHTML = `<p class="q">Fill in the blank</p><div class="prompt"><div class="big ${zh ? 'zh' : ''}" style="font-size:${zh ? '1.5rem' : '1.2rem'}">${esc(shown)}</div></div>${optsHTML(opts.map((o) => esc(o.w)), api.lang, zh)}`;
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
  el.innerHTML = `<p class="q">Say this sentence</p>
  <div class="prompt">${sayBtn()}<div><div class="target-line ${zh ? 'zh' : ''}" style="text-align:left">${esc(txt)}</div>${zh && S.settings.pinyin && s.py ? `<div class="py">${esc(s.py.join(' '))}</div>` : ''}<div class="muted" style="font-size:.9rem">${esc(s.vi)}</div></div></div>
  <button class="mic" type="button" aria-label="Tap to speak">${I.mic}</button>
  <div class="heard">Tap the mic and read the sentence above</div><div class="score"></div>
  <p style="text-align:center"><button class="chip skip" type="button">Can't speak right now</button></p>`;
  wireSay(el, txt, api.lang);
  let best = { score: 0 }, tries = 0;
  const mic = el.querySelector('.mic'), heard = el.querySelector('.heard'), sc = el.querySelector('.score');
  mic.addEventListener('click', async () => {
    if (mic.classList.contains('rec')) { stopListen(); return; }
    stopSpeak(); sfx('rec'); mic.classList.add('rec'); heard.textContent = 'Listening…';
    try {
      const r = await listen(api.lang, { onPartial: (t) => { heard.textContent = t; }, onLevel: lvl(mic) });
      mic.classList.remove('rec'); sfx('stop'); tries++;
      const cands = [r.text, ...(r.alts || [])].filter(Boolean);
      cands.forEach((c) => { const x = compare(txt, c, api.lang); if (x.score > best.score) best = x; });
      if (!cands.length) { heard.textContent = 'Didn\'t catch that. Tap the mic and try again.'; return; }
      heard.innerHTML = best.tokens.map((t, i) => `<span class="${best.hit[i] ? 'w-ok' : 'w-miss'}">${esc(t)}</span>`).join(zh ? '' : ' ');
      const n = Math.round(best.score * 5); sc.innerHTML = [0, 1, 2, 3, 4].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
      api.ready(best.score >= 0.7 || tries >= 2);
      if (best.score >= 0.7) { bump('speak'); api.autoCheck(); }
    } catch (e) {
      mic.classList.remove('rec'); sfx('bad');
      heard.innerHTML = micErrHTML(e.message);
      if (FATAL_MIC.includes(e.message)) el.querySelector('.skip').textContent = 'Continue without speaking';
    }
  });
  el.querySelector('.skip').addEventListener('click', () => { pause.mic = Date.now() + 15 * 60000; api.skip('Speaking exercises off for 15 minutes'); });
  return { check: () => ({ ok: best.score >= 0.7, answer: txt, note: best.score ? `${Math.round(best.score * 100)}% match` : '' }) };
};
R.write = (el, it, api) => {
  const chars = Array.from(strip(it.w.w)).filter((c) => /[㐀-鿿]/.test(c));
  if (!window.HanziWriter || !chars.length) return R.wordFromVi(el, it, api);
  el.innerHTML = `<p class="q">Write the character for “${esc(it.w.vi)}”</p><div class="hz-wrap"><div class="prompt" style="margin:0">${sayBtn()}<div><span class="py" style="font-size:1.1rem">${esc(it.w.py)}</span></div></div><div class="hz-box"><svg class="grid" viewBox="0 0 240 240"><line x1="0" y1="0" x2="240" y2="240"/><line x1="240" y1="0" x2="0" y2="240"/><line x1="120" y1="0" x2="120" y2="240"/><line x1="0" y1="120" x2="240" y2="120"/></svg><div id="hz"></div></div><div class="muted hz-info">Character ${1} / ${chars.length} · follow the stroke order</div><button class="chip hint" type="button">${I.eye} Show me</button></div>`;
  wireSay(el, it.w.w, 'zh');
  let ci = 0, mistakes = 0, writer = null;
  const css = getComputedStyle(document.documentElement);
  const run = () => {
    const box = el.querySelector('#hz'); box.innerHTML = '';
    writer = window.HanziWriter.create(box, chars[ci], { width: 240, height: 240, padding: 18, showCharacter: false, showOutline: true, strokeColor: css.getPropertyValue('--ink').trim() || '#1B2A44', outlineColor: css.getPropertyValue('--line').trim() || '#ccc', drawingColor: css.getPropertyValue('--zh').trim() || '#B7352B', highlightColor: '#F4C430', drawingWidth: 22 });
    el.querySelector('.hz-info').textContent = `Character ${ci + 1} / ${chars.length} · follow the stroke order`;
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
  const d = api.unit[it.d || 'dlg'] || api.unit.dlg, zh = api.lang === 'zh', speakers = [...new Set(d.lines.map((l) => l.s))];
  el.innerHTML = `<p class="q">${esc(d.title)}</p>
  <div class="toolbar"><button class="chip play" type="button">${I.play} Play all</button><button class="chip vi" type="button" aria-pressed="${S.settings.vi}">Translation</button>${zh ? `<button class="chip pyb" type="button" aria-pressed="${S.settings.pinyin}">Pinyin</button>` : ''}</div>
  <div class="dlg ${S.settings.vi ? 'show-vi' : ''}">${d.lines.map((l) => `<div class="bubble ${l.s === speakers[1] ? 'me' : 'you'}" role="button" tabindex="0"><span class="who">${esc(l.s)}</span><span class="t ${zh ? 'zh' : ''}">${esc(textOf(api.lang, l))}</span>${zh ? `<small class="pyl" ${S.settings.pinyin ? '' : 'hidden'}>${esc((l.py || []).join(' '))}</small>` : ''}<small class="vi">${esc(l.vi)}</small></div>`).join('')}</div>
  <p class="muted" style="margin-top:14px;font-size:.88rem">Tap any line to hear it again.</p>`;
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
  const d = api.unit[it.d || 'dlg'] || api.unit.dlg, zh = api.lang === 'zh', speakers = [...new Set(d.lines.map((l) => l.s))];
  const me = speakers.find((s) => /^(Minh|小明|Candidate)$/.test(s)) || speakers[1] || speakers[0];
  const other = speakers.find((s) => s !== me) || '';
  let live = !micOff(), note = '';
  el.innerHTML = `<p class="q">Role-play: you are ${esc(me)}</p>
  <p class="muted rp-sub">${live ? `The app reads ${esc(other)}'s lines. On your turn, tap the mic and speak. Tap “Show line” if you need a hint.` : `The app reads ${esc(other)}'s lines. On your turn, listen to the model and say it out loud.`}</p>
  <div class="dlg rp"></div><div class="rp-turn"></div>`;
  const thread = el.querySelector('.rp'), turn = el.querySelector('.rp-turn'), stop = { stop: false };
  let i = 0, scores = [];
  const bubble = (l, mine, extra = '') => {
    const b = h(`<div class="bubble ${mine ? 'me' : 'you'} rp-in"><span class="who">${esc(mine ? 'You' : l.s)}</span><span class="t ${zh ? 'zh' : ''}">${esc(textOf(api.lang, l))}</span>${zh && S.settings.pinyin && l.py ? `<small>${esc(l.py.join(' '))}</small>` : ''}<small class="vi" style="display:block">${esc(l.vi)}</small>${extra}</div>`);
    thread.appendChild(b); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return b;
  };
  const finishAll = () => {
    turn.innerHTML = `<div class="rp-done">${I.check}<b>${esc(me)}'s part done!</b>${scores.length ? `<span>Average match ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100)}%</span>` : ''}</div>`;
    sfx('pop'); api.ready(true); api.autoOk();
  };
  const next = async () => {
    if (stop.stop) return;
    if (i >= d.lines.length) return finishAll();
    const l = d.lines[i];
    if (l.s !== me) {
      const b = bubble(l, false); b.classList.add('now');
      turn.innerHTML = `<div class="rp-wait"><span class="dots"><i></i><i></i><i></i></span> ${esc(l.s)} is speaking…</div>`;
      if (!audioOff()) await speak(textOf(api.lang, l), api.lang); else await new Promise((r) => setTimeout(r, 1400));
      b.classList.remove('now'); i++; return next();
    }
    const txt = textOf(api.lang, l);
    turn.innerHTML = `<div class="rp-card">${note}
      <span class="tag">Your turn</span>
      <div class="rp-vi">${esc(l.vi)}</div>
      <div class="rp-target ${zh ? 'zh' : ''} blur">${esc(txt)}${zh && S.settings.pinyin && l.py ? `<small class="py" style="display:block">${esc(l.py.join(' '))}</small>` : ''}</div>
      <div class="rp-act">
        <button class="chip reveal" type="button">${I.eye} Show line</button>
        <button class="chip hear" type="button">${I.speaker} Hear model</button>
      </div>
      ${live ? `<button class="mic" type="button" aria-label="Tap to speak">${I.mic}</button><div class="heard"></div>` : `<button class="btn acc wide said" type="button">${I.check} I said it</button>`}
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
      stopSpeak(); sfx('rec'); mic.classList.add('rec'); heard.textContent = 'Listening…';
      try {
        const r = await listen(api.lang, { onPartial: (t) => { heard.textContent = t; }, onLevel: lvl(mic) });
        mic.classList.remove('rec'); sfx('stop'); tries++;
        let best = { score: 0 };
        [r.text, ...(r.alts || [])].filter(Boolean).forEach((c) => { const x = compare(txt, c, api.lang); if (x.score > best.score) best = x; });
        if (best.score >= 0.6 || tries >= 3) {
          scores.push(best.score); if (best.score >= 0.6) { sfx('ok'); bump('speak'); } else sfx('tap');
          const b = bubble(l, true, `<span class="rp-score">${best.score >= 0.85 ? 'Spot on' : best.score >= 0.6 ? 'Good' : 'Try again next time'} · ${Math.round(best.score * 100)}%</span>`);
          if (best.score >= 0.6) b.classList.add('good');
          i++; setTimeout(next, 500);
        } else {
          sfx('bad'); tgt.classList.remove('blur');
          heard.innerHTML = best.tokens ? best.tokens.map((t, j) => `<span class="${best.hit[j] ? 'w-ok' : 'w-miss'}">${esc(t)}</span>`).join(zh ? '' : ' ') + `<br><small>${Math.round(best.score * 100)}% match, try again</small>` : 'Didn\'t catch that, try again';
        }
      } catch (e) {
        mic.classList.remove('rec'); sfx('bad');
        if (FATAL_MIC.includes(e.message)) { live = false; note = micErrHTML(e.message) + '<p class="muted" style="margin-top:6px">For now, listen to the model, say it, then tap “I said it”.</p>'; next(); }
        else heard.innerHTML = micErrHTML(e.message);
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
  <div class="toolbar"><button class="chip play" type="button">${I.play} Listen</button><button class="chip vi" type="button" aria-pressed="false">Translation</button>${zh ? `<button class="chip pyb" type="button" aria-pressed="${S.settings.pinyin}">Pinyin</button>` : ''}</div>
  <div class="reading ${zh ? 'zh' : ''} ${zh && !S.settings.pinyin ? 'no-py' : ''}">${rd.sents.map((s) => `<span class="s">${sentHTML(s, api.lang, gm)}</span>`).join(zh ? '' : ' ')}</div>
  <div class="vi-box" hidden>${esc(rd.sents.map((s) => s.vi).join(' '))}</div>
  <p class="muted" style="margin-top:12px;font-size:.88rem">Tap an underlined word to see its meaning.</p>`;
  wireGloss(el, api.unit, api.lang);
  const nodes = [...el.querySelectorAll('.reading .s')], texts = rd.sents.map((s) => textOf(api.lang, s)), stop = { stop: false };
  el.querySelector('.play').addEventListener('click', () => { stop.stop = false; playSeq(nodes, texts, api.lang, stop); });
  el.querySelector('.vi').addEventListener('click', (e) => { const b = e.currentTarget, on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on); el.querySelector('.vi-box').hidden = !on; });
  const pb = el.querySelector('.pyb'); if (pb) pb.addEventListener('click', (e) => { S.settings.pinyin = !S.settings.pinyin; save(); e.currentTarget.setAttribute('aria-pressed', S.settings.pinyin); el.querySelector('.reading').classList.toggle('no-py', !S.settings.pinyin); });
  api.onLeave = () => { stop.stop = true; stopSpeak(); };
  return { info: true };
};
R.grammar = (el, it, api) => {
  const g = api.unit[it.g || 'gram'] || api.unit.gram, zh = api.lang === 'zh';
  el.innerHTML = `<div class="grammar"><p class="q" style="margin-bottom:4px">Grammar</p><div class="card"><h2>${esc(g.title)}</h2><p class="rule" style="margin:12px 0">${esc(g.rule)}</p><p style="color:var(--ink-2)">${esc(g.note || '')}</p></div>
  <div class="card"><ul>${g.ex.map((x, i) => `<li><span class="t ${zh ? 'zh' : ''}" style="display:flex;gap:8px;align-items:center"><button class="mini-say" type="button" data-i="${i}" aria-label="Nghe">${I.speaker}</button>${esc(textOf(api.lang, x))}</span>${zh && x.py ? `<small>${esc(x.py.join(' '))}</small>` : ''}<small>${esc(x.vi)}</small></li>`).join('')}</ul></div></div>`;
  el.querySelectorAll('.mini-say').forEach((b) => b.addEventListener('click', () => speak(textOf(api.lang, g.ex[+b.dataset.i]), api.lang, { btn: b })));
  return { info: true };
};

// ---- IELTS Writing: đề, dàn ý, tự viết có bấm giờ, tự chấm theo 4 tiêu chí, bài mẫu ----
const LINKERS = ['however', 'moreover', 'furthermore', 'in addition', 'therefore', 'consequently', 'as a result', 'for example', 'for instance', 'in contrast', 'on the other hand', 'whereas', 'although', 'despite', 'nevertheless', 'in conclusion', 'overall', 'firstly', 'secondly', 'finally', 'this means', 'which', 'while', 'similarly', 'in particular', 'to sum up', 'not only'];
R.writeTask = (el, it, api) => {
  const w = api.unit.write, unitWords = api.unit.words.map((x) => x.w.toLowerCase());
  const min = w.min || (w.task === 'Task 1' ? 150 : 250), mins = w.minutes || (w.task === 'Task 1' ? 20 : 40);
  el.innerHTML = `<p class="q">Writing ${esc(w.task)}</p>
  <div class="wt-prompt"><span class="tag">Task · ${mins} minutes · at least ${min} words</span><p>${esc(w.prompt)}</p>${w.data ? `<pre class="wt-data">${esc(w.data)}</pre>` : ''}</div>
  <details class="wt-plan"><summary>${I.list} Suggested plan</summary><ol>${(w.plan || []).map((p) => `<li>${esc(p)}</li>`).join('')}</ol></details>
  <div class="wt-bar"><button class="chip wt-timer" type="button">${I.play} Start timer ${mins}:00</button><span class="wt-count">0 / ${min} words</span><span class="wt-link">0 linkers</span><span class="wt-voc">0 unit words</span></div>
  <textarea class="type-in wt-area" rows="12" placeholder="Write your answer here. You can jot a plan first, then turn it into paragraphs." spellcheck="true"></textarea>
  <div class="wt-after" hidden>
    <h3>Self-check against the 4 IELTS criteria</h3>
    <div class="wt-crit">${[['Task Response', 'Every part of the task answered, clear position, ideas backed by specific examples'], ['Coherence & Cohesion', 'One main idea per paragraph, varied linkers, no repetition'], ['Lexical Resource', 'Precise vocabulary and collocations, little repetition'], ['Grammatical Range', 'A mix of complex sentences, few grammar or spelling errors']].map(([t, d], i) => `<label class="wt-c"><input type="checkbox" data-i="${i}"><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div>
    <h3>Model answer (band ${esc(w.band || '8–9')})</h3>
    <div class="wt-model">${(w.model || []).map((p) => `<p>${esc(p).replace(new RegExp('\\b(' + unitWords.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b', 'gi'), '<mark>$1</mark>')}</p>`).join('')}</div>
    <p class="muted" style="font-size:.86rem">Highlighted words are from this unit. The model answer was written by desktopchill as a reference; it is not an official, examiner-graded script.</p>
  </div>`;
  const ta = el.querySelector('.wt-area'), cnt = el.querySelector('.wt-count'), lk = el.querySelector('.wt-link'), vc = el.querySelector('.wt-voc');
  try { const d = localStorage.getItem('dcl_wt_' + api.unit.id); if (d) ta.value = d; } catch (e) {}
  const stats = () => {
    const txt = ta.value, words = (txt.match(/[A-Za-z][A-Za-z'-]*/g) || []).length, low = ' ' + txt.toLowerCase().replace(/\s+/g, ' ') + ' ';
    const links = LINKERS.filter((x) => low.includes(' ' + x + ' ') || low.includes(' ' + x + ',')).length;
    const voc = unitWords.filter((x) => low.includes(x)).length;
    cnt.textContent = `${words} / ${min} words`; cnt.classList.toggle('ok', words >= min);
    lk.textContent = `${links} linkers`; vc.textContent = `${voc} unit words`;
    api.ready(words >= 40); return { words, links, voc };
  };
  ta.addEventListener('input', () => { stats(); try { localStorage.setItem('dcl_wt_' + api.unit.id, ta.value); } catch (e) {} });
  stats();
  let tid = 0; const tb = el.querySelector('.wt-timer');
  tb.addEventListener('click', () => {
    if (tid) { clearInterval(tid); tid = 0; tb.innerHTML = `${I.play} Resume timer`; return; }
    let left = (tb._left ?? mins * 60);
    const draw = () => { const m = Math.floor(left / 60), s2 = left % 60; tb.innerHTML = `${I.x} ${m}:${String(s2).padStart(2, '0')}`; tb.classList.toggle('late', left < 120); };
    draw(); tid = setInterval(() => { left--; tb._left = left; draw(); if (left <= 0) { clearInterval(tid); tid = 0; sfx('quest'); tb.innerHTML = 'Time\'s up'; } }, 1000);
    ta.focus();
  });
  api.onLeave = () => clearInterval(tid);
  let shown = false;
  return { check: () => { const st = stats(); if (!shown) { shown = true; el.querySelector('.wt-after').hidden = false; ta.readOnly = true; clearInterval(tid); } return { ok: st.words >= min * 0.6, answer: '', note: `${st.words} words · ${st.links} linkers · ${st.voc} unit words. See the model and self-check below.` }; } };
};
// ---- IELTS Speaking Part 2: thẻ đề, 1 phút chuẩn bị, nói tối đa 2 phút, phân tích bài nói ----
const FILLERS = ['um', 'uh', 'er', 'erm', 'like', 'you know', 'i mean', 'sort of', 'kind of', 'actually', 'basically'];
R.cue = (el, it, api) => {
  const c = api.unit.cue, unitWords = api.unit.words.map((x) => x.w.toLowerCase());
  el.innerHTML = `<p class="q">Speaking Part 2</p>
  <div class="cue-card"><span class="tag">Cue card</span><h3>${esc(c.card)}</h3><p class="muted">You should say:</p><ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>
  <textarea class="type-in cue-notes" rows="3" placeholder="Quick notes during your 1-minute preparation (keywords, not full sentences)"></textarea>
  <div class="cue-stage">
    <div class="cue-clock"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52"/></svg><b>1:00</b><small>prepare</small></div>
    <div class="cue-act"><button class="btn acc cue-go" type="button">${I.play} Start 1-minute preparation</button><button class="chip cue-skip" type="button">Skip prep, speak now</button></div>
  </div>
  <div class="cue-out" hidden><div class="cue-trans"></div><div class="cue-stats"></div><h3>Model answer (band ${esc(c.band || '8+')})</h3><div class="wt-model">${c.model.map((p) => `<p>${esc(p)}</p>`).join('')}</div></div>`;
  const clock = el.querySelector('.cue-clock'), fg = clock.querySelector('.fg'), lab = clock.querySelector('b'), sm = clock.querySelector('small');
  const C = 2 * Math.PI * 52; fg.style.strokeDasharray = C;
  let tid = 0, phase = 'idle';
  const run = (secs, label, done) => { let left = secs; sm.textContent = label; const tick = () => { lab.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; fg.style.strokeDashoffset = C * (1 - left / secs); }; tick(); clearInterval(tid); tid = setInterval(() => { left--; tick(); if (left <= 0) { clearInterval(tid); done(); } }, 1000); };
  const act = el.querySelector('.cue-act'), out = el.querySelector('.cue-out');
  const analyse = (text, ms) => {
    const low = ' ' + text.toLowerCase() + ' ', words = (text.match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
    const wpm = ms ? Math.round(words / (ms / 60000)) : 0, fill = FILLERS.reduce((a, f) => a + (low.split(' ' + f + ' ').length - 1), 0);
    const voc = unitWords.filter((x) => low.includes(x));
    out.hidden = false;
    el.querySelector('.cue-trans').innerHTML = text ? `<b>Transcript</b><p>${esc(text)}</p>` : '<p class="muted">No transcript (speaking without the microphone).</p>';
    el.querySelector('.cue-stats').innerHTML = text ? `<span><b>${words}</b> words</span><span><b>${wpm}</b> words/min ${wpm < 100 ? '(a bit slow, aim for 120–160)' : wpm > 180 ? '(a bit fast)' : '(good)'}</span><span><b>${fill}</b> fillers</span><span><b>${voc.length}</b> unit words${voc.length ? ': ' + esc(voc.slice(0, 6).join(', ')) : ''}</span>` : '';
    api.ready(true); sfx('pop');
  };
  const speakNow = () => {
    phase = 'talk'; el.querySelector('.cue-notes').readOnly = true;
    if (micOff()) {
      act.innerHTML = `<p class="muted">Speak your answer out loud for up to 2 minutes. When time is up or you tap Done, the model answer appears.</p><button class="btn acc cue-end" type="button">${I.check} Done</button>`;
      run(120, 'speaking', () => analyse('', 0)); act.querySelector('.cue-end').addEventListener('click', () => { clearInterval(tid); analyse('', 0); });
      return;
    }
    act.innerHTML = `<button class="mic rec" type="button" aria-label="Stop">${I.mic}</button><div class="heard">Listening… keep talking for up to 2 minutes</div><button class="chip cue-end" type="button">Stop and see results</button>`;
    const mic = act.querySelector('.mic'), heard = act.querySelector('.heard');
    run(120, 'speaking', () => stopLong());
    listenLong('ielts', { onText: (t) => { heard.textContent = t.split(' ').slice(-24).join(' '); }, onLevel: lvl(mic), maxMs: 121000 })
      .then((r) => { clearInterval(tid); mic.classList.remove('rec'); bump('speak'); analyse(r.text, r.ms); })
      .catch((e) => { clearInterval(tid); mic.classList.remove('rec'); heard.innerHTML = micErrHTML(e.message); analyse('', 0); });
    const stop = () => stopLong(); mic.addEventListener('click', stop); act.querySelector('.cue-end').addEventListener('click', stop);
  };
  el.querySelector('.cue-go').addEventListener('click', () => { sfx('tap'); act.innerHTML = `<button class="chip cue-skip2" type="button">Ready, speak now</button>`; act.querySelector('.cue-skip2').addEventListener('click', () => { clearInterval(tid); speakNow(); }); el.querySelector('.cue-notes').focus(); run(60, 'prepare', speakNow); });
  el.querySelector('.cue-skip').addEventListener('click', () => { clearInterval(tid); speakNow(); });
  api.onLeave = () => { clearInterval(tid); stopLong(); };
  return { check: () => ({ ok: true, answer: '' }), manual: true };
};

/* ---------------- trình chạy bài ---------------- */
export const runCustom = (o) => runLesson({ ...o, custom: true });
export function runLesson({ unit, k = 0, lang, onExit, queue: given, custom = false }) {
  const queue = given ? given.slice() : buildQueue(unit, k, lang);
  const total0 = queue.length;
  let idx = 0, right = 0, wrong = 0, requeued = 0, cur = null, state = 'answer', combo = 0, maxCombo = 0;
  const t0 = Date.now(), seen = new WeakMap();
  const root = h(`<div class="player" data-lang="${lang}" role="dialog" aria-label="Lesson">
    <div class="p-top"><button class="icon-btn quit" type="button" aria-label="Quit lesson">${I.x}</button><div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i style="width:0%"></i></div><div class="combo" aria-live="polite">${I.flame}<b>0</b></div></div>
    <div class="p-stage"><div class="p-inner"></div></div>
    <div class="p-foot"><div class="in"><div class="fb"><span class="mark"></span><div><b></b><p></p></div></div><div class="foot-row"><button class="btn ghost skipb" type="button" hidden>Skip</button><button class="btn acc check" type="button" disabled>Check</button></div></div></div>
  </div>`);
  document.body.appendChild(root); document.body.style.overflow = 'hidden'; document.body.classList.add('playing');
  let innerEl = $('.p-inner', root); const foot = $('.p-foot', root), btn = $('.check', root), skipb = $('.skipb', root), bar = $('.prog i', root);
  let api = null;
  const comboEl = $('.combo', root);
  const comboUI = () => { comboEl.querySelector('b').textContent = '×' + combo; comboEl.classList.toggle('on', combo >= 2); comboEl.classList.toggle('hot', combo >= 5); comboEl.classList.remove('bump'); void comboEl.offsetWidth; if (combo >= 2) comboEl.classList.add('bump'); };
  const comboBurst = (n) => { const b = h(`<div class="combo-burst"><span>Combo</span><b>×${n}</b></div>`); root.appendChild(b); setTimeout(() => b.remove(), 1300); };
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
    if (cur.info) { btn.disabled = false; btn.textContent = 'Continue'; state = 'info'; }
    else { btn.disabled = true; btn.textContent = 'Check'; }
    skipb.hidden = !(it.type === 'listenWord' || it.type === 'listenLine' || it.type === 'dictation' || it.type === 'spell' || it.type === 'listenOrder' || it.type === 'roleplay' || it.type === 'write' || it.type === 'cue' || it.type === 'writeTask');
    setProg();
    function total0Adj() { /* giữ tiến độ */ }
  }
  function toastMsg(m) { const t = document.getElementById('toast'); if (!t) return; t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2200); }
  function doCheck() {
    const it = queue[idx], r = cur.check();
    state = 'checked'; btn.disabled = false; btn.textContent = 'Continue'; skipb.hidden = true;
    if (r.ok) {
      right++; combo++; maxCombo = Math.max(maxCombo, combo); foot.classList.add('ok'); sfx(combo > 0 && combo % 5 === 0 ? 'combo' : 'ok');
      comboUI(); if (combo % 5 === 0) comboBurst(combo);
      $('.fb .mark', root).innerHTML = I.check; $('.fb b', root).textContent = ['Correct!', 'Nice!', 'Great!', 'Spot on!'][Math.floor(Math.random() * 4)] + (combo >= 5 ? `  ·  ${combo} in a row` : '');
      $('.fb p', root).textContent = r.note || '';
    } else {
      wrong++; combo = 0; comboUI(); foot.classList.add('bad'); sfx('bad'); root.classList.remove('shake'); void root.offsetWidth; root.classList.add('shake');
      $('.fb .mark', root).innerHTML = I.x; $('.fb b', root).textContent = 'Not quite';
      $('.fb p', root).textContent = (r.answer ? 'Answer: ' + r.answer : '') + (r.note ? '  ' + r.note : '');
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
  skipb.addEventListener('click', () => { if (!['roleplay', 'write', 'cue', 'writeTask'].includes(queue[idx].type)) { pause.audio = Date.now() + 15 * 60000; toastMsg('Listening exercises off for 15 minutes'); } queue.splice(idx, 1); show(); });
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
  function confirmQuit() { return window.confirm('Quit this lesson? Your progress in it will not be saved.'); }
  $('.quit', root).addEventListener('click', quit);
  function finish() {
    const acc = right / Math.max(1, right + wrong);
    const firstTime = !custom && !(S.done[unit.id] && S.done[unit.id][k]);
    const xp = custom ? Math.max(3, right) : 10 + (acc >= 0.95 ? 5 : acc >= 0.8 ? 2 : 0) + (firstTime ? 0 : -4);
    const stars = acc >= 0.95 ? 3 : acc >= 0.8 ? 2 : 1;
    const bonus = maxCombo >= 10 ? 5 : maxCombo >= 5 ? 2 : 0;
    addXP(xp + bonus); bump('lessons');
    if (acc >= 0.999 && right >= 5) S.counts.perfect = (S.counts.perfect || 0) + 1;
    S.counts.combo = Math.max(S.counts.combo || 0, maxCombo);
    let newStars = false;
    if (!custom) { newStars = setStars(unit.id, k, stars); markDone(unit.id, k); if (k === 0) addWords(lang, unit.words.slice(0, 10).map((w) => w.w)); if (k === 1) addWords(lang, unit.words.slice(10, 20).map((w) => w.w)); }
    const mins = Math.max(1, Math.round((Date.now() - t0) / 60000)); S.minutes += mins; save(true);
    bar.style.width = '100%'; sfx('done');
    const fresh = h(`<div class="p-inner"><div class="result">
      <div class="res-art"><svg class="burst" viewBox="0 0 200 150" aria-hidden="true"><g class="rays"><path d="M100 75 L230 66 L230 84Z"/><path d="M100 75 L217 132 L208 148Z"/><path d="M100 75 L173 183 L157 192Z"/><path d="M100 75 L109 205 L91 205Z"/><path d="M100 75 L43 192 L27 183Z"/><path d="M100 75 L-8 148 L-17 132Z"/><path d="M100 75 L-30 84 L-30 66Z"/><path d="M100 75 L-17 18 L-8 2Z"/><path d="M100 75 L27 -33 L43 -42Z"/><path d="M100 75 L91 -55 L109 -55Z"/><path d="M100 75 L157 -42 L173 -33Z"/><path d="M100 75 L208 2 L217 18Z"/></g><circle cx="100" cy="80" r="46" class="halo"/><g class="stars"><path class="s1" d="M30 40l4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/><path class="s2" d="M170 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path class="s3" d="M160 110l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/></g></svg>${mascot({ size: 96, mood: acc >= 0.8 ? 'wow' : 'happy', cls: 'jump', wave: true })}</div>
      ${custom ? '' : `<div class="res-stars" aria-label="${stars} stars">${[1, 2, 3].map((i) => `<span class="st ${i <= stars ? 'on' : ''}" style="--d:${0.35 + i * 0.28}s">${I.star}</span>`).join('')}</div>`}
      <div><h1>${acc >= 0.95 ? 'Perfect!' : acc >= 0.8 ? 'Well done!' : 'Lesson complete!'}</h1><p class="muted" style="margin-top:6px">${custom ? 'Practice' : esc(unit.title) + ' · ' + lessonName(lang, k)}${newStars && !firstTime ? ' · New star record' : ''}</p></div>
      <div class="stats"><div class="stat xp"><b data-count="${xp + bonus}">0</b><span>XP${bonus ? ' (+' + bonus + ' combo)' : ''}</span></div><div class="stat acc2"><b>${Math.round(acc * 100)}%</b><span>Accuracy</span></div><div class="stat cb"><b>×${maxCombo}</b><span>Best combo</span></div><div class="stat tm"><b>${mins}′</b><span>Time</span></div></div>
      ${(k === 0 || k === 1) && !custom ? `<p class="muted">${Math.min(10, unit.words.length - k * 10)} new words added to your review deck.</p>` : ''}
    </div></div>`);
    innerEl.replaceWith(fresh); innerEl = fresh;
    const c = fresh.querySelector('[data-count]'), tot = xp + bonus; let v = 0; const step = () => { v++; c.textContent = v; if (v < tot) setTimeout(step, 600 / tot); }; setTimeout(step, 300);
    if (!custom) [1, 2, 3].forEach((i) => { if (i <= stars) setTimeout(() => sfx('star'), 350 + i * 280); });
    confetti();
    foot.classList.remove('ok', 'bad'); skipb.hidden = true; btn.disabled = false; btn.textContent = 'Continue'; state = 'end';
    endResult = { done: true, unit, k, xp: xp + bonus, stars, acc };
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
