// Nguồn dữ liệu công khai (gọi trực tiếp từ trình duyệt). KBS là nguồn chính; VND/VPS dự phòng; Simplize cho chỉ số cơ bản.
const KBS = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/';

async function j(url, opt = {}, ms = 15000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opt, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
const dmy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
export const dayKey = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const parseT = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 1000; // "2026-10-15 07:00" → 00:00 UTC
export const parseTD = (s) => { const [d, m, y] = s.split('/').map(Number); return Date.UTC(y, m - 1, d) / 1000; }; // "16/10/2026"
const num = (x) => (typeof x === 'string' ? parseFloat(x) : x);

// ---------- KBS ----------
export async function hoseSymbols() { const r = await j(KBS + 'index/HOSE/stocks'); return r.data; }
export async function sectorMap() {
  const r = await j(KBS + 'sector/heatDiagram', {}, 20000);
  const secOf = {}, secNames = {}, names = {};
  for (const s of r) { secNames[s.code] = s.name; for (const d of s.data) { secOf[d.symbol] = s.code; names[d.symbol] = d.companyName; } }
  return { secOf, secNames, names };
}
export async function boardKBS(syms) {
  const r = await j(KBS + 'stock/iss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: syms.join(',') }) });
  const out = {};
  for (const x of r) {
    out[x.SB] = { sym: x.SB, price: x.CP, ref: x.RE, ceil: x.CL, floor: x.FL, open: x.OP, high: x.HI, low: x.LO, vol: x.TT, val: x.TV, avg: x.AP,
      fBuy: x.FB, fSell: x.FS, fRoom: x.FR, fNet: ((x.FB || 0) - (x.FS || 0)) * (x.AP || x.CP || x.RE), td: x.TD ? parseTD(x.TD) : null,
      bid: [[+x.B1 || 0, x.V1], [+x.B2 || 0, x.V2], [+x.B3 || 0, x.V3]], ask: [[+x.S1 || 0, x.U1], [+x.S2 || 0, x.U2], [+x.S3 || 0, x.U3]] };
  }
  return out;
}
export async function dailyKBS(sym, fromDays, isIndex = false) {
  const to = new Date(Date.now() + 2 * 86400000), from = new Date(Date.now() - fromDays * 86400000);
  const path = isIndex ? `index/${sym}/data_day` : `stocks/${sym}/data_day`;
  const r = await j(`${KBS}${path}?sdate=${dmy(from)}&edate=${dmy(to)}`, {}, 25000);
  const arr = (r.data_day || []).map((b) => ({ t: parseT(b.t), o: num(b.o), h: num(b.h), l: num(b.l), c: num(b.c), v: num(b.v), va: num(b.va) || num(b.v) * num(b.c) }));
  arr.sort((a, b) => a.t - b.t);
  return arr.filter((b, i) => b.c > 0 && (i === 0 || b.t !== arr[i - 1].t));
}
export async function intradayKBS(sym, tf = '5P', days = 3, isIndex = false) {
  const to = new Date(Date.now() + 2 * 86400000), from = new Date(Date.now() - days * 86400000);
  const path = isIndex ? `index/${sym}/data_${tf}` : `stocks/${sym}/data_${tf}`;
  const r = await j(`${KBS}${path}?sdate=${dmy(from)}&edate=${dmy(to)}`);
  const arr = (r[`data_${tf}`] || []).map((b) => {
    const s = b.t; const t = Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)) / 1000;
    return { t, o: num(b.o), h: num(b.h), l: num(b.l), c: num(b.c), v: num(b.v) };
  });
  return arr.sort((a, b) => a.t - b.t);
}
export async function tradesKBS(sym, limit = 200) {
  const r = await j(`${KBS}trade/history/${sym}?page=1&limit=${limit}`);
  return (r.data || []).map((x) => ({ time: x.FT, price: x.FMP, vol: x.FV, side: x.LC === 'B' ? 'B' : x.LC === 'S' ? 'S' : '' }));
}

// ---------- VPS (chỉ số realtime, dự phòng bảng giá) ----------
export async function indexVPS() {
  const r = await j('https://bgapidatafeed.vps.com.vn/getlistindexdetail/10,11');
  const out = {};
  for (const x of r) {
    const ot = (x.ot || '').split('|');
    const key = x.mc === '10' ? 'VNINDEX' : x.mc === '11' ? 'VN30' : x.mc;
    out[key] = { price: x.cIndex, ref: x.oIndex, vol: x.vol, value: x.value * 1e6, time: x.time, status: x.status, chg: +ot[0], chgPct: parseFloat(ot[1]), up: +ot[3], down: +ot[4], flat: +ot[5] };
  }
  return out;
}

// ---------- VNDirect (lịch sử dự phòng, khối ngoại) ----------
export async function dailyVND(sym, fromDays) {
  const to = Math.floor(Date.now() / 1000) + 86400, from = to - fromDays * 86400;
  const r = await j(`https://dchart-api.vndirect.com.vn/dchart/history?resolution=D&symbol=${sym}&from=${from}&to=${to}`, {}, 25000);
  if (!r.t) return [];
  const k = sym === 'VNINDEX' ? 1 : 1000; // dchart trả giá cổ phiếu theo nghìn đồng
  return r.t.map((t, i) => ({ t: Math.floor((t + 7 * 3600) / 86400) * 86400, o: r.o[i] * k, h: r.h[i] * k, l: r.l[i] * k, c: r.c[i] * k, v: r.v[i], va: r.v[i] * r.c[i] * k }));
}
export async function foreignVND(sym, size = 30) {
  const r = await j(`https://api-finfo.vndirect.com.vn/v4/foreigns?q=code:${sym}&sort=tradingDate&size=${size}`);
  return (r.data || []).map((x) => ({ date: x.tradingDate, buy: x.buyVal, sell: x.sellVal, net: x.netVal, room: x.currentRoom })).reverse();
}

// ---------- Simplize (chỉ số cơ bản) ----------
export async function fundamentals(sym) {
  const r = await j(`https://api.simplize.vn/api/company/summary/${sym}`);
  const d = r.data || {};
  const n = (x) => (x === null || x === undefined || x === '' ? NaN : +x);
  return { name: d.nameVi || d.name, industry: d.industryActivity, sector: d.bcEconomicSectorName, pe: n(d.peRatio), pb: n(d.pbRatio), eps: n(d.epsRatio), roe: n(d.roe), roa: n(d.roa),
    niGrowth: n(d.netIncomeLtmGrowth), revGrowth: n(d.revenueLtmGrowth), niQoq: n(d.netIncomeGrowthQoq), ni5y: n(d.netIncome5yGrowth), rev5y: n(d.revenue5yGrowth),
    divYield: n(d.dividendYieldCurrent), mcap: n(d.marketCap), freeFloat: n(d.freeFloatRate), beta: n(d.beta5y), evEbitda: n(d.evEbitdaRatio), bookValue: n(d.bookValue),
    health: n(d.financialHealthPoint), valuationPt: n(d.valuationPoint), growthPt: n(d.growthPoint), divPt: n(d.dividendPoint), pastPt: n(d.passPerformancePoint),
    risk: d.overallRiskLevel, website: d.website, logo: d.imageUrl, at: Date.now() };
}

// Chạy nhiều tác vụ với giới hạn song song
export async function pool(items, limit, fn, onEach) {
  let i = 0, done = 0; const out = new Array(items.length);
  const run = async () => { while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch (e) { out[k] = e; } done++; onEach && onEach(done, items.length, items[k], out[k]); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return out;
}
