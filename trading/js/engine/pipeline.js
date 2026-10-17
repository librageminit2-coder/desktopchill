// Chạy toàn bộ phân tích cho cả sàn: đặc trưng → xếp hạng RS → thị trường → ngành → điểm từng mã.
import { features, rsRaw, score } from './analyze.js';
import { marketHealth, sectorStats, median } from './market.js';

const ok = (x) => x !== undefined && x !== null && !Number.isNaN(x) && Number.isFinite(x);

export function rankPct(map) {
  const e = Object.entries(map).filter(([, v]) => ok(v)).sort((a, b) => a[1] - b[1]);
  const out = {}; const n = e.length;
  e.forEach(([k], i) => { out[k] = n > 1 ? 1 + (98 * i) / (n - 1) : 50; });
  return out;
}

// input: { bars: {SYM: [...]}, index: [...], secOf, secNames, board: {SYM:{fNet}}, fund: {SYM:{...}}, advDec, sessionFrac }
export function runAll(input) {
  const { bars, index, secOf = {}, secNames = {}, board = {}, fund = {}, advDec = null, sessionFrac = 1, only = null } = input;
  const feats = {};
  for (const [sym, b] of Object.entries(bars)) {
    try { feats[sym] = features(b, { foreignNet: board[sym]?.fNet ?? null, sessionFrac }); } catch (e) { feats[sym] = null; console.warn('features', sym, e); }
  }
  const rsMap = rankPct(Object.fromEntries(Object.entries(feats).filter(([, f]) => f).map(([s, f]) => [s, rsRaw(f)])));
  const rsShortMap = rankPct(Object.fromEntries(Object.entries(feats).filter(([, f]) => f).map(([s, f]) => [s, f.roc.r20])));
  const market = marketHealth(index, feats, { advDec, sessionFrac });
  const pre = Object.fromEntries(Object.keys(feats).map((s) => [s, { rs: rsMap[s] }]));
  let sectors = sectorStats(feats, secOf, secNames, pre);
  const secByCode = Object.fromEntries(sectors.map((x) => [x.code, x]));
  // trung vị P/E, P/B theo ngành
  const secMed = {};
  for (const x of sectors) {
    const mem = Object.keys(feats).filter((s) => secOf[s] === x.code);
    secMed[x.code] = { pe: median(mem.map((s) => fund[s]?.pe).filter((v) => v > 0 && v < 80)), pb: median(mem.map((s) => fund[s]?.pb).filter((v) => v > 0 && v < 15)) };
  }
  const scores = {};
  for (const [sym, f] of Object.entries(feats)) {
    if (!f) continue; if (only && !only.includes(sym)) continue;
    const sec = secByCode[secOf[sym]];
    const ctx = { rs: rsMap[sym], rsShort: rsShortMap[sym], market, sector: sec ? { score: sec.score, name: sec.name, rank: sec.rank, total: sectors.length } : null, fund: fund[sym] || null, sectorMed: secMed[secOf[sym]] };
    try { scores[sym] = { ...score(f, ctx), rs: rsMap[sym], rsShort: rsShortMap[sym] }; } catch (e) { console.warn('score', sym, e); }
  }
  sectors = sectorStats(feats, secOf, secNames, scores);
  return { feats, scores, market, sectors, secMed };
}
