// Web Worker: giữ toàn bộ lịch sử giá và chạy phân tích cả sàn, trả về bản tóm tắt gọn cho giao diện.
import { runAll } from './pipeline.js?v=1f9548ce';

let S = { bars: {}, index: [], secOf: {}, secNames: {}, board: {}, fund: {}, advDec: null, sessionFrac: 1 };

function upsertToday(arr, bar) {
  if (!bar || !arr) return;
  const last = arr[arr.length - 1];
  if (!last || bar.t > last.t) arr.push(bar); else if (bar.t === last.t) arr[arr.length - 1] = { ...last, ...bar };
}

function summarize(res) {
  const rows = {};
  for (const [sym, f] of Object.entries(res.feats)) {
    if (!f) continue; const sc = res.scores[sym]; if (!sc) continue;
    const pick = (hz) => ({ score: sc[hz].score, verdict: sc[hz].verdict, top: sc[hz].reasons.filter((r) => Math.abs(r.impact) > 0.5).slice(0, 4).map((r) => ({ text: r.text, impact: r.impact })) });
    const tags = [];
    f.patterns.forEach((p) => tags.push({ k: p.key, kind: p.kind, label: p.name + (p.confirmed ? '' : ' (đang hình thành)'), confirmed: p.confirmed }));
    f.div.forEach((d) => tags.push({ k: 'div', kind: d.kind, label: (d.hidden ? 'Phân kỳ ẩn ' : 'Phân kỳ ') + (d.kind === 'bull' ? 'dương ' : 'âm ') + d.name }));
    f.candles.filter((c) => c.kind !== 'neutral').forEach((c) => tags.push({ k: 'candle', kind: c.kind, label: c.name }));
    if (f.newHigh) tags.push({ k: 'hi52', kind: 'bull', label: 'Đỉnh 52 tuần' });
    if (f.newLow) tags.push({ k: 'lo52', kind: 'bear', label: 'Đáy 52 tuần' });
    if (f.cross) tags.push({ k: 'cross', kind: f.cross.kind === 'golden' ? 'bull' : 'bear', label: f.cross.kind === 'golden' ? 'Giao cắt vàng' : 'Giao cắt tử thần' });
    if (f.rvol >= 2 && f.chg > 0) tags.push({ k: 'flow', kind: 'bull', label: 'Tiền vào đột biến' });
    if (f.bbSqueeze) tags.push({ k: 'squeeze', kind: 'neutral', label: 'Bollinger co hẹp' });
    if (f.top && f.top.score >= 40) tags.unshift({ k: 'top', kind: 'bear', label: f.top.level.label });
    else if (f.top && f.top.score >= 20) tags.push({ k: 'top', kind: 'neutral', label: 'Tăng nóng' });
    const c = f.ind.c; const spark = c.slice(-60).map((x) => Math.round(x * 100) / 100);
    rows[sym] = { sym, price: f.price, chg: f.chg, chg5: f.chg5, chg20: f.chg20, rvol: f.rvol, avgVal20: f.avgVal20, valToday: f.ind.va[f.n - 1], rsi: f.rsi, adx: f.adx,
      fromHi: f.fromHi, foreignNet: f.foreignNet, rs: sc.rs, rsShort: sc.rsShort, above50: f.price > f.ma50, above200: f.price > f.ma200, ma50: f.ma50, ma200: f.ma200,
      short: pick('short'), mid: pick('mid'), long: pick('long'), tags, top: f.top ? { score: f.top.score, level: f.top.level } : null,
      plan: sc.plans ? Object.fromEntries(Object.entries(sc.plans).map(([k, x]) => [k, { setup: x.setup, label: x.label, valid: !!x.valid, rr1: x.rr1 ?? null, entry: x.entry ?? null, entryHi: x.entryHi ?? null, stop: x.stop ?? null, t1: x.t1 ?? null, riskPct: x.riskPct ?? null }])) : null,
      bottom: sc.bottom && sc.bottom.inZone && sc.bottom.score !== null && sc.bottom.stage ? { score: sc.bottom.score, stage: sc.bottom.stage, drawdown: sc.bottom.drawdown, fromLow: sc.bottom.fromLow, upside382: sc.bottom.upside382, target382: sc.bottom.target382, top: sc.bottom.reasons.filter((r) => Math.abs(r.impact) > 0.5).slice(0, 4).map((r) => ({ text: r.text, impact: r.impact })) } : null, spark, sup: f.sup?.p ?? null, res: f.res?.p ?? null, lastT: f.ind && S.bars[sym] ? S.bars[sym][S.bars[sym].length - 1].t : null };
  }
  const m = res.market;
  const market = m ? { ...m, ind: undefined, struct: { label: m.struct.label, score: m.struct.score }, dist: m.dist.map((d) => ({ ago: m.ind.c.length - 1 - d.i, ch: d.ch })), ftd: m.ftd } : null;
  return { rows, market, sectors: res.sectors, secMed: res.secMed, scenario: res.scenario, at: Date.now() };
}

function run() {
  const t0 = performance.now();
  const res = runAll(S);
  const out = summarize(res); out.ms = Math.round(performance.now() - t0);
  postMessage({ type: 'result', data: out });
}

let pending = null;
function schedule() { clearTimeout(pending); pending = setTimeout(() => { try { run(); } catch (e) { postMessage({ type: 'error', error: String(e && e.stack || e) }); } }, 30); }

onmessage = (ev) => {
  const { type, data } = ev.data;
  if (type === 'init') { S = { ...S, ...data }; schedule(); }
  else if (type === 'bars') { Object.assign(S.bars, data); schedule(); }
  else if (type === 'meta') { Object.assign(S, data); schedule(); }
  else if (type === 'fund') { Object.assign(S.fund, data); schedule(); }
  else if (type === 'tick') {
    // data: { today: {SYM: bar}, idxToday: bar, board: {SYM:{fNet}}, advDec, sessionFrac }
    for (const [sym, bar] of Object.entries(data.today || {})) upsertToday(S.bars[sym], bar);
    if (data.idxToday) upsertToday(S.index, data.idxToday);
    if (data.board) S.board = data.board; if (data.advDec) S.advDec = data.advDec; if (data.sessionFrac) S.sessionFrac = data.sessionFrac;
    schedule();
  }
};
