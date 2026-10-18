// Trang Thị trường: câu nhận định, điểm sức khỏe, VN-Index, độ rộng, ngày phân phối, ngành, dòng tiền.
import * as store from '../data/store.js';
import { computeAll } from '../engine/indicators.js';
import { priceChart, areaChart } from '../ui/chart.js';
import { $, $$, esc, ico, fmtP, fmtIdx, fmtChg, fmtPct, fmtTy, fmtN, cls, avatar, scoreCell, dateVN } from '../ui/util.js';

let root = null, chart = null, bchart = null, range = 130, lastIdxLen = 0, lastIdxClose = 0;

function dial(score, tone) {
  const a0 = Math.PI, a1 = 0, r = 80, cx = 100, cy = 96; const t = score / 100; const ang = a0 + (a1 - a0) * t;
  const P = (a) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  const [x0, y0] = P(a0), [x1, y1] = P(a1), [xs, ys] = P(ang);
  const col = tone === 'pos' ? 'var(--up)' : tone === 'neg' ? 'var(--down)' : 'var(--ref)';
  const ticks = [0, 30, 44, 57, 70, 100].map((v) => { const a = a0 + (a1 - a0) * (v / 100); const [p, q] = [cx + (r + 10) * Math.cos(a), cy - (r + 10) * Math.sin(a)]; const [p2, q2] = [cx + (r + 4) * Math.cos(a), cy - (r + 4) * Math.sin(a)]; return `<line x1="${p}" y1="${q}" x2="${p2}" y2="${q2}" stroke="var(--text-faint)" stroke-width="1.5"/>`; }).join('');
  return `<svg viewBox="0 0 200 116" role="img" aria-label="Điểm sức khỏe thị trường ${score}/100">
    <path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" fill="none" stroke="color-mix(in srgb, var(--text) 12%, transparent)" stroke-width="12" stroke-linecap="round"/>
    <path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${xs} ${ys}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"/>
    ${ticks}
    <circle cx="${xs}" cy="${ys}" r="7" fill="var(--bg)" stroke="${col}" stroke-width="3"/>
    <text x="100" y="86" text-anchor="middle" font-family="Newsreader, Noto Serif, Georgia, serif" font-size="46" fill="var(--text)">${score}</text>
    <text x="100" y="108" text-anchor="middle" font-size="10" fill="var(--text-faint)" font-family="Plus Jakarta Sans">trên 100</text></svg>`;
}

function render(main) {
  root = main;
  main.innerHTML = `
    <section class="hero" id="hero"></section>
    <div id="notice"></div>
    <div class="grid g-main">
      <section class="glass panel">
        <div class="panel-h"><h2>VN-Index <span class="sub" style="font-weight:500">· chấm đỏ là ngày phân phối</span></h2>
          <div class="chart-tools"><div class="legend"><span><i style="background:var(--ma20)"></i>MA20</span><span><i style="background:var(--ma50)"></i>MA50</span><span><i style="background:var(--ma200)"></i>MA200</span></div>
          <div class="seg sm" id="rng">${[[65, '3T'], [130, '6T'], [250, '1N'], [520, '2N']].map(([v, l]) => `<button data-v="${v}" class="${v === range ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
        <div class="chart-box" id="idxChart"><div class="chart-tip" id="idxTip"></div></div>
      </section>
      <div class="stack">
        <section class="glass panel" id="breadth"></section>
        <section class="glass panel" id="dist"></section>
      </div>
    </div>
    <section class="glass panel mt" id="why"></section>
    <section class="mt"><div class="panel-h" style="padding:0 4px"><h2>Ngành — dòng tiền đang ở đâu</h2><span class="sub">Xếp theo sức mạnh giá, độ rộng và dòng tiền của ngành</span></div>
      <div class="table-wrap glass" id="sectors"></div></section>
    <div class="grid g-3 mt">
      <section class="glass panel" id="flow"></section>
      <section class="glass panel" id="foreign"></section>
      <section class="glass panel" id="signals"></section>
    </div>`;
  $('#rng').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; range = +b.dataset.v; $$('#rng button').forEach((x) => x.classList.toggle('on', x === b)); drawIndex(true); });
  main.addEventListener('click', (e) => {
    const th = e.target.closest('#sectors th.sort');
    if (th) { const k = th.dataset.k; secSort = { k, dir: secSort.k === k ? -secSort.dir : 1 }; $('#sectors').innerHTML = sectorsHTML(store.state.result?.sectors); return; }
    const r = e.target.closest('[data-sym]'); if (r) location.hash = '#/ma/' + r.dataset.sym;
  });
  update('all');
}

function heroHTML() {
  const S = store.state, m = S.result?.market, L = S.idxLive, ss = S.session || store.sessionInfo();
  const idx = S.index; const last = idx[idx.length - 1];
  const price = L?.price || last?.c, ref = L?.ref || idx[idx.length - 2]?.c;
  const ch = price && ref ? price - ref : null, chp = ch !== null ? (ch / ref) * 100 : null;
  const fNet = Object.values(S.board).reduce((s, b) => s + (b.fNet || 0), 0);
  const td = Object.values(S.board).find((b) => b.td)?.td;
  const dateTxt = td ? new Date(td * 1000).toLocaleDateString('vi-VN', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' }) : '';
  const headline = m ? m.headline : 'Đang đọc dữ liệu thị trường…';
  return `<div>
      <div class="hero-date"><span>${esc(dateTxt.charAt(0).toUpperCase() + dateTxt.slice(1))}</span><span class="pill ghost">${esc(ss.label)}</span></div>
      <h1>${esc(headline)}</h1>
      <div class="hero-idx">
        <span class="v num">${price ? fmtIdx(price) : '—'}</span>
        <span class="c num ${cls(ch)}">${ch !== null ? `${fmtChg(ch, 1)} (${fmtPct(chp)})` : ''}</span>
        ${L?.value ? `<span class="k">Giá trị khớp <b>${fmtTy(L.value)}</b>${m && Number.isFinite(m.valueRatio) ? ` · ${Math.round(m.valueRatio * 100)}% so với TB20` : ''}</span>` : ''}
        ${Object.keys(S.board).length ? `<span class="k">Khối ngoại <b class="${cls(fNet)}">${fNet >= 0 ? 'mua' : 'bán'} ròng ${fmtTy(Math.abs(fNet))}</b></span>` : ''}
        ${S.vn30?.price ? `<span class="k">VN30 <b>${fmtIdx(S.vn30.price)}</b> <b class="${cls(S.vn30.chg)}">${fmtPct(S.vn30.chgPct)}</b></span>` : ''}
      </div>
    </div>
    <div class="dial">${m ? dial(m.score, m.tone) : '<div class="skeleton" style="height:116px"></div>'}
      <div class="phase" style="color:${m ? (m.tone === 'pos' ? 'var(--up)' : m.tone === 'neg' ? 'var(--down)' : 'var(--ref)') : 'inherit'}">${m ? esc(m.phase) : '&nbsp;'}</div>
      <div class="cap">Điểm sức khỏe thị trường</div></div>`;
}

function noticeHTML() {
  const S = store.state; const p = S.progress;
  const errs = S.errors.length ? `<div class="note-bar err">${ico('alert')}<div>${esc(S.errors[S.errors.length - 1])}</div></div>` : '';
  if (p.total && p.done < p.total) return errs + `<div class="glass loading" style="margin-bottom:16px"><span class="spin"></span><span>${esc(p.phase)}: ${p.done}/${p.total} mã${p.done ? '' : ' — lần đầu mất khoảng 1 phút, các lần sau dùng bộ nhớ đệm'}</span><span class="track"><i style="width:${(100 * p.done) / p.total}%"></i></span></div>`;
  if (!p.total && !S.result) return errs + `<div class="glass loading" style="margin-bottom:16px"><span class="spin"></span><span>${esc(p.phase)}…</span></div>`;
  return errs;
}

function drawIndex(force) {
  const S = store.state; const idx = S.index; if (!idx.length) return;
  const el = $('#idxChart'); if (!el) return;
  const lastC = idx[idx.length - 1].c;
  if (!force && chart && idx.length === lastIdxLen && lastC === lastIdxClose) return;
  if (!chart) chart = priceChart(el, $('#idxTip'), { decimals: 2 });
  if (!chart) return;
  const ind = computeAll(idx); const m = S.result?.market;
  const markers = [];
  if (m) for (const d of m.dist) { const b = idx[idx.length - 1 - d.ago]; if (b) markers.push({ time: b.t, position: 'aboveBar', color: getComputedStyle(document.documentElement).getPropertyValue('--down').trim(), shape: 'circle', size: 0.6 }); }
  chart.set(idx, ind, { range, markers });
  lastIdxLen = idx.length; lastIdxClose = lastC;
}

function breadthHTML(m) {
  if (!m) return `<div class="panel-h"><h3>Độ rộng thị trường</h3></div><div class="skeleton" style="height:180px"></div>`;
  const tot = m.adv + m.dec + m.unch || 1;
  return `<div class="panel-h"><h3>Độ rộng thị trường</h3><span class="sub">${m.newHighs} đỉnh / ${m.newLows} đáy 52 tuần</span></div>
    <div class="breadth-bar" role="img" aria-label="${m.adv} mã tăng, ${m.unch} đứng giá, ${m.dec} mã giảm"><span style="width:${(100 * m.adv) / tot}%;background:var(--up)"></span><span style="width:${(100 * m.unch) / tot}%;background:var(--ref)"></span><span style="width:${(100 * m.dec) / tot}%;background:var(--down)"></span></div>
    <div class="breadth-legend"><span class="up">${m.adv} tăng</span><span class="ref">${m.unch} đứng</span><span class="down">${m.dec} giảm</span></div>
    <div class="kpis" style="margin-top:14px;grid-template-columns:1fr 1fr">
      <div><div class="dim" style="font-size:.78rem;font-weight:600">Trên MA50</div><div style="font-size:1.5rem;font-weight:800" class="num">${m.above50.toFixed(0)}%</div></div>
      <div><div class="dim" style="font-size:.78rem;font-weight:600">Trên MA200</div><div style="font-size:1.5rem;font-weight:800" class="num">${m.above200.toFixed(0)}%</div></div>
    </div>
    <div style="font-size:.76rem;color:var(--text-faint);margin-top:8px">% cổ phiếu trên MA50 — 60 phiên gần nhất</div>
    <div id="bChart" style="height:110px;margin-top:4px"></div>`;
}
function drawBreadth(m) {
  const el = $('#bChart'); if (!el || !m) return;
  bchart?.destroy(); const idx = store.state.index;
  const pts = m.breadthHist.map((v, k) => ({ time: idx[idx.length - 60 + k]?.t, value: v })).filter((p) => p.time && Number.isFinite(p.value));
  bchart = areaChart(el, pts, { height: 110, fmtV: (v) => v.toFixed(0) + '%' });
}

function distHTML(m) {
  if (!m) return `<div class="panel-h"><h3>Ngày phân phối</h3></div><div class="skeleton" style="height:70px"></div>`;
  const set = new Set(m.dist.map((d) => d.ago));
  const dots = Array.from({ length: 25 }, (_, k) => 24 - k).map((ago) => `<i class="${set.has(ago) ? 'on' : ''}${m.ftd && m.ftd.ago === ago ? ' ftd' : ''}" title="${ago === 0 ? 'Hôm nay' : ago + ' phiên trước'}"></i>`).join('');
  const n = m.dist.length;
  return `<div class="panel-h"><h3>Ngày phân phối</h3><span class="sub">25 phiên gần nhất</span></div>
    <div style="display:flex;align-items:baseline;gap:10px"><span style="font-family:var(--display);font-size:2.6rem;line-height:1" class="${n >= 5 ? 'down' : n <= 2 ? 'up' : 'ref'}">${n}</span><span class="dim" style="font-size:.86rem">${n >= 6 ? 'Áp lực bán lớn — rủi ro điều chỉnh cao' : n >= 4 ? 'Áp lực bán đang tích tụ' : 'Áp lực bán thấp'}</span></div>
    <div class="dots" aria-hidden="true">${dots}</div>
    <p class="faint" style="font-size:.76rem;margin-top:10px">Phiên chỉ số giảm ≥ 0,2% với khối lượng cao hơn phiên trước — dấu hiệu tổ chức lớn bán ra.${m.ftd ? ` <span class="up">Có ngày bùng nổ xác nhận ${m.ftd.ago === 0 ? 'hôm nay' : m.ftd.ago + ' phiên trước'}.</span>` : ''}</p>`;
}

function whyHTML(m) {
  if (!m) return '';
  const row = (x) => `<div class="li"><div style="display:flex;gap:10px;align-items:center">${ico(x.s >= 0.15 ? 'arrowUp' : x.s <= -0.15 ? 'arrowDown' : 'minus', `style="width:16px;height:16px;flex-shrink:0;color:var(--${x.s >= 0.15 ? 'up' : x.s <= -0.15 ? 'down' : 'ref'})"`)}<span>${esc(x.text)}</span></div><div class="v num ${x.impact > 0.2 ? 'up' : x.impact < -0.2 ? 'down' : 'faint'}">${x.impact > 0 ? '+' : ''}${x.impact.toFixed(1)}</div></div>`;
  const half = Math.ceil(m.parts.length / 2);
  return `<div class="panel-h"><h3>Vì sao thị trường được ${m.score} điểm</h3><span class="sub">Mỗi yếu tố cộng hoặc trừ điểm so với mức trung tính 50</span></div>
    <div class="grid g-2" style="gap:0 30px"><div class="list">${m.parts.slice(0, half).map(row).join('')}</div><div class="list">${m.parts.slice(half).map(row).join('')}</div></div>`;
}

let secSort = { k: 'rank', dir: 1 };
function sectorsHTML(secs) {
  if (!secs) return '<div class="skeleton" style="height:240px;margin:14px"></div>';
  const rows = [...secs].sort((a, b) => { const k = secSort.k; return (k === 'rank' ? a.rank - b.rank : (b[k] - a[k])) * secSort.dir; });
  const th = (k, l, r) => `<th class="sort ${r ? 'r' : ''} ${secSort.k === k ? 'sorted' : ''}" data-k="${k}">${l}</th>`;
  const flowBar = (f) => { if (!Number.isFinite(f)) return '—'; const w = Math.min(100, (f / 2) * 100); const c = f >= 1.15 ? 'var(--up)' : f <= 0.8 ? 'var(--down)' : 'var(--ref)'; return `<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end"><div class="hbar" style="width:80px"><i style="left:0;width:${w}%;background:${c}"></i><span class="mid"></span></div><b class="num" style="min-width:42px;text-align:right">${Math.round(f * 100)}%</b></div>`; };
  return `<table><thead><tr>${th('rank', '#')}<th>Ngành</th>${th('score', 'Điểm', 1)}${th('chg', 'Hôm nay', 1)}${th('chg5', '5 phiên', 1)}${th('chg20', '20 phiên', 1)}${th('flow', 'Giá trị GD so với TB20', 1)}${th('above50', 'Trên MA50', 1)}<th>Mã dẫn dắt</th></tr></thead><tbody>
    ${rows.map((x) => `<tr><td class="faint num">${x.rank}</td><td><b>${esc(x.name)}</b> <span class="faint" style="font-size:.76rem">${x.count} mã</span></td>
      <td class="r"><span class="score ${x.score >= 65 ? 's-vpos' : x.score >= 55 ? 's-pos' : x.score > 45 ? 's-neu' : x.score > 35 ? 's-neg' : 's-vneg'}"><span class="bar"><i style="width:${x.score}%"></i></span><b class="num">${Math.round(x.score)}</b></span></td>
      <td class="r num ${cls(x.chg)}">${fmtPct(x.chg)}</td><td class="r num ${cls(x.chg5)}">${fmtPct(x.chg5, 1)}</td><td class="r num ${cls(x.chg20)}">${fmtPct(x.chg20, 1)}</td>
      <td class="r">${flowBar(x.flow)}</td><td class="r num">${Number.isFinite(x.above50) ? x.above50.toFixed(0) + '%' : '—'}</td>
      <td><div class="tags" style="flex-wrap:nowrap">${x.leaders.map((s) => `<button class="pill ghost" data-sym="${s}">${s}</button>`).join('')}</div></td></tr>`).join('')}
    </tbody></table>`;
}

function listItem(r, right, sub) {
  const S = store.state;
  return `<div class="li click" data-sym="${r.sym}"><div style="display:flex;gap:10px;align-items:center;min-width:0">${avatar(r.sym)}<div style="min-width:0"><div class="t">${r.sym}</div><div class="d">${esc(sub ?? S.names[r.sym] ?? '')}</div></div></div><div class="v">${right}</div></div>`;
}
function flowHTML(rows) {
  if (!rows) return '<div class="skeleton" style="height:240px"></div>';
  const top = Object.values(rows).filter((r) => r.chg > 0 && r.avgVal20 >= 3e9 && Number.isFinite(r.rvol)).sort((a, b) => b.rvol * Math.log10(b.valToday) - a.rvol * Math.log10(a.valToday)).slice(0, 7);
  return `<div class="panel-h"><h3>Tiền vào mạnh hôm nay</h3><span class="sub">Giá tăng, giá trị GD vượt trung bình</span></div><div class="list">${top.length ? top.map((r) => listItem(r, `<span class="up num">${fmtPct(r.chg)}</span><small>${r.rvol.toFixed(1)}× TB20 · ${fmtTy(r.valToday)}</small>`)).join('') : '<p class="faint" style="font-size:.86rem">Chưa có mã nổi bật.</p>'}</div>`;
}
function foreignHTML() {
  const B = store.state.board; const arr = Object.values(B).filter((b) => Number.isFinite(b.fNet) && b.fNet !== 0);
  if (!arr.length) return '<div class="panel-h"><h3>Khối ngoại</h3></div><p class="faint" style="font-size:.86rem">Chưa có giao dịch khối ngoại.</p>';
  const buy = [...arr].sort((a, b) => b.fNet - a.fNet).slice(0, 4), sell = [...arr].sort((a, b) => a.fNet - b.fNet).slice(0, 4);
  const max = Math.max(...buy.map((b) => b.fNet), ...sell.map((b) => -b.fNet));
  const row = (b) => `<div class="li click" data-sym="${b.sym}"><div style="display:flex;gap:10px;align-items:center"><b style="width:44px">${b.sym}</b><div class="hbar" style="width:110px"><i style="${b.fNet > 0 ? 'left:0' : 'left:0'};width:${(Math.abs(b.fNet) / max) * 100}%;background:var(--${b.fNet > 0 ? 'up' : 'down'})"></i></div></div><div class="v num ${cls(b.fNet)}">${b.fNet > 0 ? '+' : '−'}${fmtTy(Math.abs(b.fNet))}</div></div>`;
  return `<div class="panel-h"><h3>Khối ngoại</h3><span class="sub">Mua/bán ròng nhiều nhất hôm nay</span></div><div class="list">${buy.map(row).join('')}</div><div style="height:8px"></div><div class="list">${sell.map(row).join('')}</div>`;
}
function signalsHTML(rows) {
  if (!rows) return '<div class="skeleton" style="height:240px"></div>';
  const pri = { 'base-breakout': 9, 'double-bottom': 7, ihs: 8, 'asc-tri': 6, flag: 6, div: 5, hi52: 4, cross: 4, flow: 3 };
  const list = [];
  for (const r of Object.values(rows)) {
    if (r.avgVal20 < 3e9) continue;
    for (const t of r.tags) { if (t.kind !== 'bull' || !pri[t.k] || (t.confirmed === false)) continue; list.push({ r, t, w: pri[t.k] + r.mid.score / 50 }); }
  }
  list.sort((a, b) => b.w - a.w); const seen = new Set(); const out = [];
  for (const x of list) { if (seen.has(x.r.sym)) continue; seen.add(x.r.sym); out.push(x); if (out.length >= 7) break; }
  return `<div class="panel-h"><h3>Tín hiệu kỹ thuật mới</h3><span class="sub">Mã thanh khoản ≥ 3 tỷ/phiên</span></div><div class="list">${out.length ? out.map(({ r, t }) => listItem(r, `<span class="num ${cls(r.chg)}">${fmtPct(r.chg)}</span><small>${scoreCell(r.mid)}</small>`, t.label)).join('') : '<p class="faint" style="font-size:.86rem">Chưa có tín hiệu tích cực nổi bật.</p>'}</div>`;
}

let lastResAt = 0;
function update(what) {
  if (!root) return;
  const S = store.state, R = S.result;
  $('#hero').innerHTML = heroHTML();
  $('#notice').innerHTML = noticeHTML();
  if (what === 'index' || what === 'all' || what === 'board' || what === 'result') drawIndex(what === 'result');
  if (R && R.at !== lastResAt || what === 'all') {
    lastResAt = R?.at || 0; const m = R?.market;
    $('#breadth').innerHTML = breadthHTML(m); drawBreadth(m);
    $('#dist').innerHTML = distHTML(m);
    $('#why').innerHTML = whyHTML(m); $('#why').style.display = m ? '' : 'none';
    $('#sectors').innerHTML = sectorsHTML(R?.sectors);
    $('#flow').innerHTML = flowHTML(R?.rows);
    $('#signals').innerHTML = signalsHTML(R?.rows);
  }
  if (what === 'board' || what === 'all' || what === 'result') $('#foreign').innerHTML = foreignHTML();
}

export default {
  render,
  update,
  destroy() { chart?.destroy(); bchart?.destroy(); chart = null; bchart = null; root = null; lastIdxLen = 0; lastResAt = 0; },
};
export { dateVN, fmtN };
