import assert from 'node:assert/strict';
import { rsi, sma, ema, macd, atr, adx, toWeekly } from '../js/engine/indicators.js';
import { zigzag, divergences, chartPatterns, candles, levels, fibonacci } from '../js/engine/structure.js';
import { computeAll } from '../js/engine/indicators.js';
import { runAll } from '../js/engine/pipeline.js';
import { SYMS, SEC_OF, SEC_NAMES, genBars, genIndex } from './fixture.mjs';

// --- chỉ báo cơ bản ---
const up = Array.from({ length: 40 }, (_, i) => 10 + i);
assert.equal(rsi(up, 14).at(-1), 100);
const alt = Array.from({ length: 60 }, (_, i) => 10 + (i % 2));
assert.ok(Math.abs(rsi(alt, 14).at(-1) - 50) < 6, 'rsi alt ~50');
assert.deepEqual(sma([1, 2, 3, 4], 2).slice(1), [1.5, 2.5, 3.5]);
assert.ok(Math.abs(ema(up, 10).at(-1) - (up.at(-1) - 4.5)) < 0.01, 'ema lag on linear');
// Wilder RSI so với giá trị chuẩn (ví dụ kinh điển của Wilder, RSI ≈ 70.53 tại phiên 15)
const W = [44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64];
const rw = rsi(W, 14); assert.ok(Math.abs(rw[14] - 70.46) < 0.3, 'wilder rsi ' + rw[14]);
// --- zigzag ---
const zz = [10, 12, 15, 13, 11, 14, 18, 16, 12];
const piv = zigzag(zz, zz, 0.1); assert.ok(piv.length >= 3, 'zigzag pivots');
// --- phân kỳ dương dựng tay ---
{
  const p = [], o = [];
  for (let i = 0; i < 60; i++) { p.push(100 - i * 0.2); o.push(50); }
  // đáy 1 sâu RSI 20, đáy 2 giá thấp hơn nhưng RSI 35
  const set = (i, pr, os) => { for (let k = -3; k <= 3; k++) { p[i + k] = pr + Math.abs(k) * 1.5; o[i + k] = os + Math.abs(k) * 3; } };
  set(35, 80, 20); set(53, 78, 35);
  for (let i = 57; i < 60; i++) { p[i] = 80 + (i - 56); o[i] = 45; }
  const d = divergences(Object.assign(p.slice(), { highs: p, lows: p }), o, { name: 'RSI' });
  assert.ok(d.some((x) => x.kind === 'bull' && !x.hidden), 'bull divergence ' + JSON.stringify(d));
}
// --- toàn sàn ---
const bars = Object.fromEntries(SYMS.map((s) => [s, genBars(s)]));
const t0 = performance.now();
const res = runAll({ bars, index: genIndex(), secOf: SEC_OF, secNames: SEC_NAMES, sessionFrac: 1 });
const ms = performance.now() - t0;
console.log('symbols', SYMS.length, 'runAll ms', ms.toFixed(0));
assert.ok(res.market && res.market.score >= 0 && res.market.score <= 100);
console.log('market', res.market.phase, res.market.score, res.market.headline, 'above50', res.market.above50.toFixed(0), 'dist', res.market.dist.length);
const sc = Object.entries(res.scores);
assert.ok(sc.length > 370);
for (const [s, x] of sc) for (const hz of ['short', 'mid', 'long']) { assert.ok(x[hz].score >= 0 && x[hz].score <= 100, s + hz); assert.ok(x[hz].reasons.length > 2, s + hz + ' reasons'); }
const top = sc.sort((a, b) => b[1].mid.score - a[1].mid.score).slice(0, 5);
for (const [s, x] of top) console.log(s, x.short.score, x.mid.score, x.long.score, '|', x.mid.reasons.slice(0, 3).map((r) => r.text).join(' / '));
const dist = { short: [0,0,0,0,0], mid: [0,0,0,0,0], long: [0,0,0,0,0] };
for (const [, x] of sc) for (const hz of ['short', 'mid', 'long']) dist[hz][Math.min(4, Math.floor(x[hz].score / 20))]++;
console.log('score distribution (0-20,..,80-100)', JSON.stringify(dist));
const pats = {}; let divs = 0, cds = 0;
for (const f of Object.values(res.feats)) { if (!f) continue; f.patterns.forEach((p) => (pats[p.key] = (pats[p.key] || 0) + 1)); divs += f.div.length; cds += f.candles.length; }
console.log('patterns', JSON.stringify(pats), 'divergences', divs, 'candles', cds);
console.log('sectors', res.sectors.slice(0, 5).map((x) => `${x.rank}.${x.name} ${x.score.toFixed(0)} [${x.leaders.join(',')}]`).join(' | '));
const f = res.feats.FPT; console.log('FPT fib', f.fib && f.fib.zone, 'sup', f.sup && f.sup.p, 'res', f.res && f.res.p);
console.log('ALL OK');
// vùng đáy + kịch bản
const inZone = Object.values(res.scores).filter((x) => x.bottom?.inZone);
console.log('bottom inZone', inZone.length, 'stages', JSON.stringify(inZone.reduce((m, x) => ((m[x.bottom.stage.key] = (m[x.bottom.stage.key] || 0) + 1), m), {})));
const bt = Object.entries(res.scores).filter(([, x]) => x.bottom?.inZone).sort((a, b) => b[1].bottom.score - a[1].bottom.score).slice(0, 3);
for (const [s, x] of bt) console.log('BOTTOM', s, x.bottom.score, x.bottom.stage.label, '|', x.bottom.reasons.slice(0, 3).map((r) => r.text).join(' / '));
assert.ok(res.scenario, 'scenario');
console.log('scenario eps', JSON.stringify(res.scenario.nEp), 'secUp', res.scenario.secUp.slice(0, 3).map((s) => s.name + ' ' + s.upScore.toFixed(0)).join(', '));
console.log('stockUp', res.scenario.stockUp.slice(0, 3).map((s) => s.sym + ' ' + s.score.toFixed(0) + ' [' + s.why.join('; ') + ']').join(' || '));
console.log('triggers', JSON.stringify(res.scenario.triggers));
console.log('BOTTOM+SCENARIO OK');
