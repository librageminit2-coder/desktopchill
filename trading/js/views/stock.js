// Trang chi tiết mã: nhận định 3 khung thời gian, biểu đồ có Fibo/hỗ trợ/kháng cự/tín hiệu, chỉ báo, cơ bản, khối ngoại, lưu nhận định.
import * as store from '../data/store.js?v=a69908ee';
import * as auth from '../auth.js?v=5f446a77';
import { features, score, keyZones } from '../engine/analyze.js?v=3c86c1df';
import { tradePlans } from '../engine/plan.js?v=887fce06';
import { bottomScore } from '../engine/bottom.js?v=78a2248a';
import { computeAll, toWeekly } from '../engine/indicators.js?v=8e6ac8b1';
import { priceChart, oscChart } from '../ui/chart.js?v=a75cd100';
import { $, $$, esc, ico, fmtP, fmtChg, fmtPct, fmtTy, fmtN, cls, priceCls, vClass, ring, toast, modal, HZ, HZ_SUB } from '../ui/util.js?v=70d78725';

let planHz = 'mid';
let root = null, sym = null, chart = null, osc = null, A = null, opts = null, fundData = null, foreignData = null, expanded = {}, lastBarKey = '';
const LS = 'dct_chart_opts';
const defOpts = { tf: 'D', range: 130, ma: true, bb: false, fib: false, lv: true, sig: true, osc: 'rsi', plan: true };
try { opts = { ...defOpts, ...JSON.parse(localStorage.getItem(LS) || '{}') }; } catch (e) { opts = { ...defOpts }; }
const saveOpts = () => { try { localStorage.setItem(LS, JSON.stringify(opts)); } catch (e) {} };
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function render(main, { arg }) {
  root = main; sym = arg; A = null; fundData = null; foreignData = null; expanded = {}; lastBarKey = '';
  const S = store.state;
  main.innerHTML = `
    <a href="#/co-hoi" class="btn ghost sm" style="margin-top:6px" onclick="if(history.length>1){history.back();return false}">${ico('back')}Quay lại</a>
    <section class="stock-head" id="head"></section>
    <div id="topPanel"></div>
    <section class="glass panel" id="planPanel" style="margin-bottom:16px"><div class="skeleton" style="height:180px"></div></section>
    <div id="bottomPanel"></div>
    <div class="verdicts" id="verdicts">${[0, 1, 2].map(() => '<div class="glass vcard"><div class="skeleton" style="height:180px"></div></div>').join('')}</div>
    <div class="grid g-main mt">
      <section class="glass panel">
        <div class="panel-h"><h2>Biểu đồ</h2>
          <div class="chart-tools">
            <div class="seg sm" id="tf">${[['D', 'Ngày'], ['W', 'Tuần'], ['I', 'Trong phiên']].map(([v, l]) => `<button data-v="${v}" class="${opts.tf === v ? 'on' : ''}">${l}</button>`).join('')}</div>
            <div class="seg sm" id="rg">${[[65, '3T'], [130, '6T'], [250, '1N'], [520, '2N']].map(([v, l]) => `<button data-v="${v}" class="${opts.range === v ? 'on' : ''}">${l}</button>`).join('')}</div>
          </div></div>
        <div class="toolbar" id="ov" style="margin-bottom:10px">
          ${[['plan', 'Kế hoạch'], ['ma', 'MA20/50/200'], ['bb', 'Bollinger'], ['fib', 'Fibonacci'], ['lv', 'Hỗ trợ / kháng cự'], ['sig', 'Tín hiệu']].map(([k, l]) => `<button class="chip ${opts[k] ? 'on' : ''}" data-k="${k}" aria-pressed="${!!opts[k]}">${l}</button>`).join('')}
        </div>
        <div class="chart-box" id="pc"><div class="chart-tip" id="tip"></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0 4px"><div class="seg sm" id="os">${[['rsi', 'RSI 14'], ['macd', 'MACD 12-26-9']].map(([v, l]) => `<button data-v="${v}" class="${opts.osc === v ? 'on' : ''}">${l}</button>`).join('')}</div><div class="legend" id="sigLegend"></div></div>
        <div class="chart-box sm" id="oc" style="height:130px"></div>
      </section>
      <div class="stack">
        <section class="glass panel zones" id="zones"><div class="skeleton" style="height:300px"></div></section>
        <section class="glass panel" id="book"></section>
      </div>
    </div>
    <section class="glass panel mt" id="inds"></section>
    <div class="grid g-2 mt">
      <section class="glass panel" id="fund"><div class="skeleton" style="height:200px"></div></section>
      <section class="glass panel" id="foreign"><div class="skeleton" style="height:200px"></div></section>
    </div>`;
  $('#tf').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts.tf = b.dataset.v; saveOpts(); $$('#tf button').forEach((x) => x.classList.toggle('on', x === b)); drawChart(true); });
  $('#rg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts.range = +b.dataset.v; saveOpts(); $$('#rg button').forEach((x) => x.classList.toggle('on', x === b)); drawChart(true); });
  $('#os').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; opts.osc = b.dataset.v; saveOpts(); $$('#os button').forEach((x) => x.classList.toggle('on', x === b)); drawChart(true); });
  $('#ov').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; const k = b.dataset.k; opts[k] = !opts[k]; b.classList.toggle('on', opts[k]); b.setAttribute('aria-pressed', opts[k]); saveOpts(); drawChart(true); });
  $('#verdicts').addEventListener('click', (e) => { const b = e.target.closest('[data-more]'); if (b) { expanded[b.dataset.more] = !expanded[b.dataset.more]; drawVerdicts(); } });
  main.addEventListener('click', (e) => { if (e.target.closest('#saveBtn')) saveNote(); });
  head();
  load();
}

async function load() {
  const my = sym;
  try {
    await store.barsOf(sym);
    if (my !== sym) return;
    analyze(); if (A?.plans) planHz = ['mid', 'short', 'long'].find((k) => A.plans[k]?.valid) || 'mid'; const b = store.state.bars[sym]; lastBarKey = b.length + ':' + b[b.length - 1].t + ':' + b[b.length - 1].c; drawAll(true);
  } catch (e) {
    if (my !== sym) return;
    $('#verdicts').innerHTML = `<div class="glass panel" style="grid-column:1/-1"><div class="empty"><h3>Không tải được dữ liệu ${esc(sym)}</h3><p>${esc(e.message)} — kiểm tra lại mã hoặc thử tải lại trang.</p></div></div>`;
  }
  store.fundOf(sym).then((f) => { if (my !== sym) return; fundData = f; analyze(); drawVerdicts(); drawFund(); }).catch(() => drawFund());
  store.src.foreignVND(sym, 30).then((d) => { if (my !== sym) return; foreignData = d; drawForeign(); }).catch(() => { foreignData = []; drawForeign(); });
}

function ctxFor() {
  const S = store.state, R = S.result; const row = R?.rows?.[sym]; const code = S.secOf[sym];
  const sec = R?.sectors?.find((x) => x.code === code);
  return { rs: row?.rs, rsShort: row?.rsShort, market: R?.market || null, sector: sec ? { score: sec.score, name: sec.name, rank: sec.rank, total: R.sectors.length } : null,
    fund: fundData ? { pe: fundData.pe, pb: fundData.pb, roe: fundData.roe, niGrowth: fundData.niGrowth, revGrowth: fundData.revGrowth, health: fundData.health } : null, sectorMed: R?.secMed?.[code] };
}
function analyze() {
  const S = store.state; const bars = S.bars[sym]; if (!bars || bars.length < 30) { A = null; return; }
  const ss = S.session || store.sessionInfo();
  const f = features(bars, { foreignNet: S.board[sym]?.fNet ?? null, sessionFrac: ss.frac });
  const ctx = ctxFor(); const sc = score(f, ctx);
  let bt = null; try { bt = bottomScore(f, ctx); } catch (e) { bt = null; }
  let plans = null; try { plans = tradePlans(f, { bottom: bt, market: ctx.market }); } catch (e) { plans = null; }
  A = { f, sc, zones: keyZones(f), bars, bt, plans };
}

function head() {
  const S = store.state; const b = S.board[sym]; const el = $('#head'); if (!el) return;
  const name = fundData?.name || S.names[sym] || ''; const sec = S.secNames[S.secOf[sym]] || fundData?.industry || '';
  const price = b?.price > 0 ? b.price : A?.f.price; const ref = b?.ref || (A ? A.f.ind.c[A.f.n - 2] : null);
  const ch = price && ref ? price - ref : null;
  el.innerHTML = `<div>
      <h1>${esc(sym)}</h1>
      <div class="nm">${esc(name)}${sec ? ` · ${esc(sec)}` : ''}</div>
      <div class="px"><span class="p num ${b ? priceCls(b) : cls(ch)}">${fmtP(price)}</span><span class="c num ${cls(ch)}">${ch !== null ? `${fmtChg(ch, price)} (${fmtPct((ch / ref) * 100)})` : ''}</span></div>
      ${b ? `<div class="meta"><span>Tham chiếu <b class="ref">${fmtP(b.ref)}</b></span><span>Trần <b class="ceil">${fmtP(b.ceil)}</b></span><span>Sàn <b class="floor">${fmtP(b.floor)}</b></span><span>Mở / cao / thấp <b>${fmtP(b.open)} / ${fmtP(b.high)} / ${fmtP(b.low)}</b></span><span>KL <b>${fmtN(b.vol)}</b></span><span>GTGD <b>${fmtTy(b.val)}</b></span>${A ? `<span>TB20 <b>${fmtTy(A.f.avgVal20)}</b></span>` : ''}</div>` : ''}
    </div>
    <div class="stock-actions"><button class="btn primary" id="saveBtn" ${A ? '' : 'disabled'}>${ico('bookmark')}Lưu nhận định</button></div>`;
}

function drawTop() {
  const el = $('#topPanel'); if (!el) return; const t = A?.f?.top;
  if (!t || t.score < 20) { el.innerHTML = ''; return; }
  const c = t.score >= 60 ? 'down' : t.score >= 40 ? 'down' : 'ref';
  el.innerHTML = `<section class="glass panel" style="margin-bottom:16px;border-color:color-mix(in srgb,var(--${c}) 45%,transparent)">
    <div class="panel-h"><h2>${ico('alert', `style="display:inline;width:18px;height:18px;vertical-align:-3px;color:var(--${c})"`)} Cảnh báo vùng đỉnh: <span class="${c}">${esc(t.level.label)}</span></h2><span class="sub">Điểm rủi ro ${t.score}/100</span></div>
    <p class="dim" style="font-size:.88rem;margin-bottom:10px">${t.score >= 60 ? 'Chỉ báo xu hướng có thể vẫn đẹp, nhưng nhiều dấu hiệu cho thấy tổ chức lớn đang chốt lời cho người mua sau. Điểm ngắn/trung hạn bị giới hạn tối đa 52 và kế hoạch chuyển sang đứng ngoài.' : t.score >= 40 ? 'Đã xuất hiện dấu hiệu phân phối ở vùng giá cao. Điểm ngắn/trung hạn bị giới hạn tối đa 59 (không xếp “Tích cực”), kế hoạch chuyển sang chờ điều chỉnh về trung bình thay vì mua đuổi.' : 'Mã đang tăng nóng — chưa phải tín hiệu bán, nhưng mua lúc này dễ bị rung lắc. Điểm đã bị trừ nhẹ; ưu tiên chờ nhịp điều chỉnh hoặc điểm breakout mới có R:R tốt hơn.'}</p>
    <div class="list">${t.signals.map((x) => `<div class="li"><div class="t" style="font-weight:600;font-size:.88rem">${esc(x.text)}</div><div class="v num down">+${x.pts}</div></div>`).join('')}</div></section>`;
}

const SETUP_ICON = { breakout: 'trend', pullback: 'arrowDown', reversal: 'refresh', wait: 'clock', none: 'minus' };
function ladder(P, price) {
  const pts = [['Mục tiêu 2', P.t2, 'up'], ['Mục tiêu 1', P.t1, 'up'], [P.entryHi ? 'Vùng vào trên' : 'Điểm vào', P.entryHi || P.entry, 'entry'], ...(P.entryHi ? [['Vùng vào dưới', P.entry, 'entry']] : []), ['Dừng lỗ', P.stop, 'down'], ['Giá hiện tại', price, 'text']].sort((a, b) => b[1] - a[1]);
  const lo = Math.min(...pts.map((x) => x[1])), hi = Math.max(...pts.map((x) => x[1])); const H = 230, y = (v) => 14 + (1 - (v - lo) / (hi - lo || 1)) * (H - 28);
  // giãn nhãn để không chồng nhau (tối thiểu 15px)
  const ly = pts.map((x) => y(x[1])); for (let k = 1; k < ly.length; k++) if (ly[k] - ly[k - 1] < 15) ly[k] = ly[k - 1] + 15;
  const over = ly[ly.length - 1] - (H - 6); if (over > 0) for (let k = ly.length - 1; k >= 0; k--) { ly[k] -= over; if (k && ly[k] - ly[k - 1] >= 15) break; }
  const base = P.entryHi || P.entry; const C = (col) => `var(--${col === 'text' ? 'text' : col})`; const FF = 'font-family="Plus Jakarta Sans, system-ui, sans-serif"';
  return `<svg viewBox="0 0 300 ${H}" style="width:100%;max-width:360px;height:auto" role="img" aria-label="Thang giá kế hoạch">
    <rect x="96" y="${y(P.t2)}" width="10" height="${Math.max(2, y(base) - y(P.t2))}" rx="3" fill="var(--up)" opacity=".35"/>
    <rect x="96" y="${y(base)}" width="10" height="${Math.max(2, y(P.stop) - y(base))}" rx="3" fill="var(--down)" opacity=".35"/>
    ${pts.map(([lb, v, col], k) => `<line x1="88" x2="114" y1="${y(v)}" y2="${y(v)}" stroke="${C(col)}" stroke-width="${col === 'text' ? 1.2 : 2}" ${col === 'text' ? 'stroke-dasharray="3 3"' : ''}/>
      <path d="M84 ${ly[k]} L88 ${y(v)} M114 ${y(v)} L118 ${ly[k]}" stroke="var(--border-strong)" fill="none"/>
      <text x="122" y="${ly[k] + 4}" font-size="11.5" fill="var(--text-dim)" ${FF}>${lb}</text>
      <text x="80" y="${ly[k] + 4}" font-size="11.5" text-anchor="end" fill="${C(col)}" font-weight="700" ${FF}>${fmtP(v)}</text>`).join('')}
  </svg>`;
}
function drawPlan() {
  const el = $('#planPanel'); if (!el || !A) return; const plans = A.plans;
  if (!plans) { el.innerHTML = ''; return; }
  const P = plans[planHz]; const price = A.f.price;
  const pct = (v) => ((v / (P.entryHi || P.entry) - 1) * 100);
  const hasPlan = P && P.setup !== 'none' && P.stop;
  el.innerHTML = `<div class="panel-h"><h2>Kế hoạch giao dịch</h2>
      <div class="seg sm" id="phz">${['short', 'mid', 'long'].map((k) => `<button data-v="${k}" class="${planHz === k ? 'on' : ''}">${HZ[k]} ${plans[k]?.valid ? '✓' : ''}</button>`).join('')}</div></div>
    ${hasPlan ? `<div class="grid g-main" style="gap:24px;align-items:center">
      <div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:6px"><span class="pill ${P.valid ? 'bull' : P.blocked ? 'bear' : 'neutral'}">${esc(P.verdict)}</span><b style="font-size:1.05rem">${ico(SETUP_ICON[P.setup] || 'minus', 'style="display:inline;width:16px;height:16px;vertical-align:-2px"')} ${esc(P.label)}</b></div>
        <p class="dim" style="font-size:.88rem;margin-bottom:12px">${esc(P.note || '')}</p>
        <div class="ind-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
          <div class="ind"><div class="l">${P.entryHi ? 'Vùng vào' : P.trigger === 'stop' ? 'Lệnh chờ mua trên' : 'Điểm vào'}</div><div class="v num" style="color:var(--entry)">${P.entryHi ? fmtP(P.entry) + ' – ' + fmtP(P.entryHi) : fmtP(P.entry)}</div><div class="s">${price ? `Cách giá hiện tại ${((P.entry / price - 1) * 100).toFixed(1)}%` : ''}</div></div>
          <div class="ind"><div class="l">Dừng lỗ</div><div class="v num down">${fmtP(P.stop)}</div><div class="s">−${P.riskPct.toFixed(1)}% = 1R</div></div>
          <div class="ind"><div class="l">Mục tiêu 1</div><div class="v num up">${fmtP(P.t1)}</div><div class="s">+${pct(P.t1).toFixed(1)}% · ${P.rr1.toFixed(1)}R</div></div>
          <div class="ind"><div class="l">Mục tiêu 2</div><div class="v num up">${fmtP(P.t2)}</div><div class="s">+${pct(P.t2).toFixed(1)}% · ${P.rr2.toFixed(1)}R</div></div>
          <div class="ind"><div class="l">Dời dừng lỗ về hòa vốn khi</div><div class="v num">${fmtP(P.breakeven)}</div><div class="s">Giá đi được +1R</div></div>
          <div class="ind"><div class="l">Dừng lỗ động (Chandelier)</div><div class="v num">${fmtP(P.chandelier)}</div><div class="s">Đỉnh 22 phiên − 3×ATR</div></div>
        </div>
        <p class="faint" style="font-size:.78rem;margin-top:10px">Quản trị vốn: mỗi lệnh chỉ nên rủi ro 1–2% tổng vốn. Khối lượng tối đa = (vốn × 1%) ÷ (giá vào − dừng lỗ). Ví dụ vốn 100 triệu, rủi ro 1 triệu → tối đa ${Math.floor(1e6 / Math.max(1, (P.entryHi || P.entry) - P.stop) / 100) * 100 > 0 ? (Math.floor(1e6 / ((P.entryHi || P.entry) - P.stop) / 100) * 100).toLocaleString('vi-VN') : '—'} cổ phiếu. Kế hoạch hết hiệu lực nếu sau ${P.expiry} phiên chưa khớp điểm vào.</p>
      </div>
      <div style="display:flex;justify-content:center">${ladder(P, price)}</div>
    </div>` : `<div class="empty" style="padding:24px"><h3>${esc(P?.label || 'Chưa có kế hoạch')}</h3><p>${esc(P?.note || '')}</p></div>`}`;
  $('#phz').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; planHz = b.dataset.v; drawPlan(); drawChart(true); });
}

function drawBottom() {
  const el = $('#bottomPanel'); if (!el) return; const b = A?.bt;
  if (!b || !b.inZone || b.score === null) { el.innerHTML = ''; return; }
  const key = b.score >= 75 ? 'vpos' : b.score >= 60 ? 'pos' : b.score > 45 ? 'neu' : b.score > 30 ? 'neg' : 'vneg';
  const stageCls = { falling: 'bear', basing: 'neutral', turning: 'bull' }[b.stage.key];
  const list = b.reasons.slice(0, 8);
  el.innerHTML = `<section class="glass panel s-${key}" style="margin-bottom:16px">
    <div class="panel-h"><h2>Vùng đáy — tiềm năng hồi phục</h2><span class="sub">Mã đã giảm ${Math.abs(b.drawdown).toFixed(0)}% từ đỉnh 52 tuần</span></div>
    <div class="grid g-main" style="gap:24px">
      <div><div class="vcard" style="padding:0"><div class="top">${ring(b.score)}<div><div class="hz">Điểm vùng đáy</div><div class="vd">${esc(key === 'vpos' || key === 'pos' ? 'Đáng chú ý' : key === 'neu' ? 'Chờ thêm tín hiệu' : 'Chưa nên bắt đáy')}</div><span class="pill ${stageCls}" style="margin-top:6px">${esc(b.stage.label)}</span></div></div>
        <ul>${list.map((r) => `<li>${ico(r.s >= 0.15 ? 'arrowUp' : r.s <= -0.15 ? 'arrowDown' : 'minus', `style="color:var(--${r.s >= 0.15 ? 'up' : r.s <= -0.15 ? 'down' : 'ref'})"`)}<span>${esc(r.text)}</span><span class="im num ${r.impact > 0.2 ? 'up' : r.impact < -0.2 ? 'down' : 'faint'}">${r.impact > 0 ? '+' : ''}${r.impact.toFixed(1)}</span></li>`).join('')}</ul></div></div>
      <div class="list">
        <div class="li"><div class="t">Hồi về Fibo 38,2% của sóng giảm</div><div class="v num">${fmtP(b.target382)} <small class="up">${b.upside382 > 0 ? '+' + b.upside382.toFixed(1) + '%' : 'đã vượt'}</small></div></div>
        <div class="li"><div class="t">Hồi về Fibo 61,8%</div><div class="v num">${fmtP(b.target618)} <small class="up">${b.upside618 > 0 ? '+' + b.upside618.toFixed(1) + '%' : 'đã vượt'}</small></div></div>
        <div class="li"><div class="t">Đỉnh 52 tuần</div><div class="v num">${fmtP(A.f.hi52)} <small class="up">+${(A.f.hi52 / A.f.price * 100 - 100).toFixed(0)}%</small></div></div>
        <div class="li"><div class="t">Mốc sai nếu thủng</div><div class="v num down">${fmtP(b.stopRef)} <small class="down">${(b.stopRef / A.f.price * 100 - 100).toFixed(1)}%</small></div></div>
        <p class="faint" style="font-size:.78rem;margin-top:10px">“Đang rơi”: chưa có điểm dừng, rủi ro bắt dao rơi. “Đang tạo đáy”: giá ngừng giảm, chờ tín hiệu xác nhận. “Xác nhận đảo chiều”: giá lấy lại EMA20 kèm đáy sau cao hơn hoặc MACD cắt lên.</p>
      </div>
    </div></section>`;
}

function drawVerdicts() {
  const el = $('#verdicts'); if (!el || !A) return;
  drawTop(); drawPlan(); drawBottom();
  el.innerHTML = ['short', 'mid', 'long'].map((hz) => {
    const x = A.sc[hz]; const list = expanded[hz] ? x.reasons : x.reasons.slice(0, 5);
    return `<article class="glass vcard ${vClass(x.verdict)}">
      <div class="top">${ring(x.score)}<div><div class="hz">${HZ[hz]} · ${HZ_SUB[hz]}</div><div class="vd">${esc(x.verdict.label)}</div></div></div>
      <ul>${list.map((r) => `<li>${ico(r.s >= 0.15 ? 'arrowUp' : r.s <= -0.15 ? 'arrowDown' : 'minus', `style="color:var(--${r.s >= 0.15 ? 'up' : r.s <= -0.15 ? 'down' : 'ref'})"`)}<span>${esc(r.text)}</span><span class="im num ${r.impact > 0.2 ? 'up' : r.impact < -0.2 ? 'down' : 'faint'}">${r.impact > 0 ? '+' : ''}${r.impact.toFixed(1)}</span></li>`).join('')}</ul>
      ${x.reasons.length > 5 ? `<button class="more" data-more="${hz}">${expanded[hz] ? 'Thu gọn' : `Xem đủ ${x.reasons.length} yếu tố`}</button>` : ''}
    </article>`;
  }).join('');
}

function chartData() {
  const S = store.state; const bars = S.bars[sym];
  if (opts.tf === 'W') { const wk = toWeekly(bars); return { bars: wk, ind: computeAll(wk), weekly: true }; }
  return { bars, ind: A.f.ind };
}
async function drawChart(force) {
  if (!A) return;
  const pc = $('#pc'), oc = $('#oc'); if (!pc) return;
  if (!chart) { chart = priceChart(pc, $('#tip')); osc = chart ? oscChart(oc, chart) : null; }
  if (!chart) return;
  if (opts.tf === 'I') {
    try {
      const my = sym; const bars = await store.src.intradayKBS(sym, '5P', 7); if (my !== sym || !chart) return;
      const ind = computeAll(bars);
      chart.set(bars, ind, { intraday: true, ma: false, range: 160, levels: opts.lv ? levelLines() : [] });
      osc?.set(bars, ind, opts.osc);
      $('#sigLegend').innerHTML = '<span>Nến 5 phút · 7 ngày gần nhất</span>';
    } catch (e) { toast('Không tải được dữ liệu trong phiên: ' + e.message, 'err'); }
    return;
  }
  const { bars, ind, weekly } = chartData();
  const markers = [];
  if (opts.sig && !weekly) {
    const f = A.f; const T = (i) => bars[i]?.t;
    const up = css('--up'), down = css('--down');
    f.div.forEach((d) => markers.push({ time: T(d.b), position: d.kind === 'bull' ? 'belowBar' : 'aboveBar', color: d.kind === 'bull' ? up : down, shape: d.kind === 'bull' ? 'arrowUp' : 'arrowDown', text: (d.hidden ? 'PK ẩn ' : 'PK ') + d.name }));
    f.patterns.forEach((p) => markers.push({ time: T(p.b ?? bars.length - 1), position: p.kind === 'bull' ? 'belowBar' : 'aboveBar', color: p.kind === 'bull' ? up : down, shape: 'circle', text: p.name }));
    f.candles.filter((c) => c.kind !== 'neutral').forEach((c) => markers.push({ time: T(bars.length - 1), position: c.kind === 'bull' ? 'belowBar' : 'aboveBar', color: c.kind === 'bull' ? up : down, shape: 'square', text: c.name }));
    // gộp tín hiệu trùng ngày
    const byT = new Map(); for (const m of markers) { const k = m.time + m.position; if (byT.has(k)) byT.get(k).text += ' · ' + m.text; else byT.set(k, { ...m }); }
    markers.length = 0; markers.push(...byT.values());
  }
  chart.set(bars, ind, { ma: opts.ma, bb: opts.bb, range: weekly ? Math.round(opts.range / 5) + 10 : opts.range, levels: levelLines(), markers });
  osc?.set(bars, ind, opts.osc);
  const lg = [];
  if (opts.plan && A.plans?.[planHz]?.stop) lg.push('<span><i style="background:var(--entry)"></i>Điểm vào</span><span><i style="background:var(--down)"></i>Dừng lỗ</span><span><i style="background:var(--up)"></i>Mục tiêu</span>');
  if (opts.ma) lg.push('<span><i style="background:var(--ma20)"></i>MA20</span><span><i style="background:var(--ma50)"></i>MA50</span><span><i style="background:var(--ma200)"></i>MA200</span>');
  const planOn = opts.plan && A.plans?.[planHz]?.stop;
  if (!planOn && opts.fib && A.f.fib) lg.push('<span><i style="background:var(--text-faint)"></i>Fibonacci</span>');
  if (!planOn && opts.lv) lg.push('<span><i style="background:var(--up)"></i>Hỗ trợ</span><span><i style="background:var(--down)"></i>Kháng cự</span>');
  $('#sigLegend').innerHTML = lg.join('');
  void force;
}
function levelLines() {
  const out = []; if (!A) return out; const f = A.f;
  const P = A.plans?.[planHz];
  if (opts.plan && P && P.setup !== 'none' && P.stop) {
    out.push({ p: P.entry, color: css('--entry'), title: 'Vào', w: 2, style: 0 });
    if (P.entryHi) out.push({ p: P.entryHi, color: css('--entry'), title: 'Vùng vào', w: 1, style: 2 });
    out.push({ p: P.stop, color: css('--down'), title: 'Dừng lỗ', w: 2, style: 0 });
    out.push({ p: P.t1, color: css('--up'), title: 'Mục tiêu 1', w: 2, style: 0 });
    out.push({ p: P.t2, color: css('--up'), title: 'Mục tiêu 2', w: 1, style: 2 });
    return out;
  }
  if (opts.lv) { f.lv.support.slice(0, 2).forEach((s, i) => out.push({ p: s.p, color: css('--up'), title: i ? 'HT' : 'Hỗ trợ', w: i ? 1 : 2, style: i ? 2 : 0 })); f.lv.resistance.slice(0, 2).forEach((s, i) => out.push({ p: s.p, color: css('--down'), title: i ? 'KC' : 'Kháng cự', w: i ? 1 : 2, style: i ? 2 : 0 })); }
  if (opts.fib && f.fib) { f.fib.levels.filter((x) => [0.382, 0.5, 0.618].includes(x.r)).forEach((x) => out.push({ p: x.p, color: css('--text-faint'), title: (x.r * 100).toFixed(1) + '%', style: 1 })); }
  return out;
}

function drawZones() {
  const el = $('#zones'); if (!el || !A) return;
  const price = A.f.price; const z = A.zones.zones; const col = { sup: 'var(--up)', res: 'var(--down)', fib: 'var(--text-faint)', ext: 'var(--accent)', ma: 'var(--ma50)' };
  const rows = []; let placed = false;
  for (const x of z) {
    if (!placed && x.p < price) { rows.push(`<div class="cur-line num"><span>Giá hiện tại</span><span>${fmtP(price)}</span></div>`); placed = true; }
    const d = (x.p / price - 1) * 100;
    rows.push(`<div class="li"><div class="t"><span class="zone-dot" style="background:${col[x.type]}"></span>${esc(x.label)}${x.touches ? ` <span class="faint" style="font-weight:500;font-size:.76rem">· ${x.touches} lần chạm</span>` : ''}</div><div class="v num">${fmtP(x.p)} <small class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}%</small></div></div>`);
  }
  if (!placed) rows.push(`<div class="cur-line num"><span>Giá hiện tại</span><span>${fmtP(price)}</span></div>`);
  const f = A.f;
  el.innerHTML = `<div class="panel-h"><h3>Vùng giá đáng chú ý</h3><span class="sub">${f.fib ? 'Fibo theo sóng ' + (f.fib.up ? 'tăng' : 'giảm') + ' gần nhất' : ''}</span></div>
    <div class="list" style="max-height:430px;overflow:auto">${rows.join('')}</div>
    ${A.zones.invalidation ? `<p class="faint" style="font-size:.78rem;margin-top:10px">Nếu giá đóng cửa dưới <b class="down">${fmtP(A.zones.invalidation)}</b> (hỗ trợ gần trừ 0,5 ATR), các nhận định tích cực ngắn hạn nên được xem lại.</p>` : ''}`;
}

function drawBook() {
  const el = $('#book'); if (!el) return; const b = store.state.board[sym];
  if (!b || !b.bid) { el.innerHTML = '<div class="panel-h"><h3>Sổ lệnh</h3></div><p class="faint" style="font-size:.86rem">Chưa có dữ liệu bảng giá.</p>'; return; }
  const max = Math.max(...b.bid.map((x) => x[1] || 0), ...b.ask.map((x) => x[1] || 0), 1);
  const pc = (p) => (p >= b.ceil ? 'ceil' : p <= b.floor ? 'floor' : p > b.ref ? 'up' : p < b.ref ? 'down' : 'ref');
  const row = (x, side) => (x[0] > 0 ? `<div class="li"><div style="display:flex;align-items:center;gap:10px"><b class="num ${pc(x[0])}" style="width:62px">${fmtP(x[0])}</b><div class="hbar" style="width:120px"><i style="left:0;width:${((x[1] || 0) / max) * 100}%;background:var(--${side === 'b' ? 'up' : 'down'})"></i></div></div><div class="v num">${fmtN(x[1])}</div></div>` : '');
  const fb = b.fBuy || 0, fs = b.fSell || 0;
  el.innerHTML = `<div class="panel-h"><h3>Sổ lệnh</h3><span class="sub">3 bước giá tốt nhất</span></div>
    <div class="faint" style="font-size:.74rem;font-weight:700">Dư bán</div><div class="list">${[...b.ask].reverse().map((x) => row(x, 's')).join('')}</div>
    <div class="faint" style="font-size:.74rem;font-weight:700;margin-top:8px">Dư mua</div><div class="list">${b.bid.map((x) => row(x, 'b')).join('')}</div>
    <p class="dim" style="font-size:.8rem;margin-top:10px">Khối ngoại hôm nay: mua ${fmtN(fb)} · bán ${fmtN(fs)} cp · <b class="${cls(b.fNet)}">ròng ${fmtTy(b.fNet)}</b>${b.fRoom > 0 ? ` · room còn ${fmtN(b.fRoom)} cp` : ''}</p>`;
}

function drawInds() {
  const el = $('#inds'); if (!el || !A) return; const f = A.f; const row = store.state.result?.rows?.[sym];
  const it = (l, v, s, c = '') => `<div class="ind"><div class="l">${l}</div><div class="v num ${c}">${v}</div><div class="s">${s}</div></div>`;
  const rsiS = f.rsi >= 70 ? 'Quá mua' : f.rsi <= 30 ? 'Quá bán' : f.rsi >= 50 ? 'Động lượng tăng' : 'Động lượng yếu';
  el.innerHTML = `<div class="panel-h"><h3>Chỉ báo kỹ thuật</h3><span class="sub">Tính trên nến ngày</span></div><div class="ind-grid">
    ${it('RSI (14)', f.rsi.toFixed(1), rsiS, f.rsi >= 70 ? 'down' : f.rsi <= 30 ? 'up' : '')}
    ${it('MACD', (f.hist >= 0 ? '+' : '') + fmtN(f.hist, f.price > 1000 ? 0 : 2), f.hist > 0 ? (f.hist > f.histPrev ? 'Dương, mở rộng' : 'Dương, thu hẹp') : f.hist < f.histPrev ? 'Âm, mở rộng' : 'Âm, thu hẹp', cls(f.hist))}
    ${it('ADX (14)', f.adx.toFixed(0), f.adx >= 25 ? `Xu hướng ${f.pdi > f.mdi ? 'tăng' : 'giảm'} mạnh` : f.adx >= 20 ? 'Xu hướng vừa' : 'Không xu hướng')}
    ${it('Stochastic', `${f.stochK.toFixed(0)} / ${f.stochD.toFixed(0)}`, f.stochK > 80 ? 'Vùng quá mua' : f.stochK < 20 ? 'Vùng quá bán' : f.stochK > f.stochD ? '%K trên %D' : '%K dưới %D')}
    ${it('MFI (14)', f.mfi.toFixed(0), f.mfi >= 80 ? 'Dòng tiền quá nóng' : f.mfi <= 20 ? 'Dòng tiền cạn kiệt' : 'Trung tính')}
    ${it('CMF (20)', (f.cmf >= 0 ? '+' : '') + f.cmf.toFixed(2), f.cmf > 0.05 ? 'Đang tích lũy' : f.cmf < -0.05 ? 'Đang phân phối' : 'Cân bằng', cls(f.cmf))}
    ${it('Khối lượng', Number.isFinite(f.rvol) ? f.rvol.toFixed(2) + '×' : '—', 'So với TB 20 phiên (quy đổi theo thời gian phiên)')}
    ${it('ATR (14)', f.atrPct.toFixed(1) + '%', 'Biên độ dao động trung bình/phiên')}
    ${it('RS', row ? Math.round(row.rs) : '—', 'Sức mạnh giá so với toàn sàn (1–99)')}
    ${it('Tăng/giảm KL 50 phiên', f.udRatio.toFixed(2), f.udRatio > 1.2 ? 'Gom hàng' : f.udRatio < 0.8 ? 'Xả hàng' : 'Trung tính', f.udRatio > 1.2 ? 'up' : f.udRatio < 0.8 ? 'down' : '')}
    ${it('Đỉnh 52 tuần', fmtP(f.hi52), `Giá cách ${f.fromHi.toFixed(1)}%`)}
    ${it('Đáy 52 tuần', fmtP(f.lo52), `Giá cách +${f.fromLo.toFixed(1)}%`)}
  </div>`;
}

function drawFund() {
  const el = $('#fund'); if (!el) return; const F = fundData; const S = store.state; const med = S.result?.secMed?.[S.secOf[sym]] || {};
  if (!F) { el.innerHTML = '<div class="panel-h"><h3>Chỉ số cơ bản</h3></div><p class="faint" style="font-size:.86rem">Chưa lấy được dữ liệu cơ bản cho mã này.</p>'; return; }
  const v = (x, d = 1, suf = '') => (Number.isFinite(x) ? x.toLocaleString('vi-VN', { maximumFractionDigits: d }) + suf : '—');
  const it = (l, val, s, c = '') => `<div class="ind"><div class="l">${l}</div><div class="v num ${c}">${val}</div><div class="s">${s || ''}</div></div>`;
  el.innerHTML = `<div class="panel-h"><h3>Chỉ số cơ bản</h3><span class="sub">Nguồn: Simplize</span></div><div class="ind-grid">
    ${it('P/E', v(F.pe), Number.isFinite(med.pe) ? `Trung vị ngành ${v(med.pe)}` : '')}
    ${it('P/B', v(F.pb, 2), Number.isFinite(med.pb) ? `Trung vị ngành ${v(med.pb, 2)}` : '')}
    ${it('EPS', v(F.eps, 0), 'đồng/cổ phiếu')}
    ${it('ROE', v(F.roe, 1, '%'), F.roe >= 20 ? 'Rất tốt' : F.roe >= 12 ? 'Khá' : 'Thấp', F.roe >= 15 ? 'up' : F.roe < 8 ? 'down' : '')}
    ${it('ROA', v(F.roa, 1, '%'))}
    ${it('LN 12 tháng', (F.niGrowth > 0 ? '+' : '') + v(F.niGrowth, 1, '%'), 'so với cùng kỳ', cls(F.niGrowth))}
    ${it('Doanh thu 12 tháng', (F.revGrowth > 0 ? '+' : '') + v(F.revGrowth, 1, '%'), 'so với cùng kỳ', cls(F.revGrowth))}
    ${it('Cổ tức', v(F.divYield, 2, '%'), 'tỷ suất hiện tại')}
    ${it('Vốn hóa', fmtTy(F.mcap), Number.isFinite(F.freeFloat) ? `Free float ${v(F.freeFloat, 0, '%')}` : '')}
    ${it('Beta 5 năm', v(F.beta, 2), F.beta > 1.2 ? 'Biến động mạnh hơn thị trường' : F.beta < 0.8 ? 'Ít biến động' : 'Tương đương thị trường')}
  </div>
  ${F.health ? `<p class="dim" style="font-size:.8rem;margin-top:10px">Điểm Simplize (1–5): sức khỏe tài chính ${F.health} · định giá ${F.valuationPt ?? '—'} · tăng trưởng ${F.growthPt ?? '—'} · cổ tức ${F.divPt ?? '—'}${F.risk ? ` · mức rủi ro ${{ low: 'thấp', medium: 'trung bình', high: 'cao' }[F.risk] || F.risk}` : ''}</p>` : ''}`;
}

function drawForeign() {
  const el = $('#foreign'); if (!el) return; const d = foreignData;
  if (!d || !d.length) { el.innerHTML = '<div class="panel-h"><h3>Khối ngoại 30 phiên</h3></div><p class="faint" style="font-size:.86rem">Chưa có dữ liệu khối ngoại.</p>'; return; }
  const max = Math.max(...d.map((x) => Math.abs(x.net)), 1); const W = 600, H = 150, bw = W / d.length;
  const sum5 = d.slice(-5).reduce((s, x) => s + x.net, 0), sum20 = d.slice(-20).reduce((s, x) => s + x.net, 0);
  const bars = d.map((x, i) => { const h = (Math.abs(x.net) / max) * (H / 2 - 6); const y = x.net >= 0 ? H / 2 - h : H / 2; return `<rect x="${i * bw + 1}" y="${y}" width="${Math.max(1, bw - 2)}" height="${Math.max(1, h)}" rx="2" fill="var(--${x.net >= 0 ? 'up' : 'down'})"><title>${x.date}: ${x.net >= 0 ? 'mua' : 'bán'} ròng ${fmtTy(Math.abs(x.net))}</title></rect>`; }).join('');
  el.innerHTML = `<div class="panel-h"><h3>Khối ngoại 30 phiên</h3><span class="sub">Nguồn: VNDirect</span></div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:8px"><div><div class="faint" style="font-size:.76rem;font-weight:700">5 phiên</div><b class="num ${cls(sum5)}">${sum5 >= 0 ? '+' : '−'}${fmtTy(Math.abs(sum5))}</b></div><div><div class="faint" style="font-size:.76rem;font-weight:700">20 phiên</div><b class="num ${cls(sum20)}">${sum20 >= 0 ? '+' : '−'}${fmtTy(Math.abs(sum20))}</b></div></div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" role="img" aria-label="Giá trị mua bán ròng của khối ngoại 30 phiên"><line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="var(--border-strong)"/>${bars}</svg>
    <div style="display:flex;justify-content:space-between;font-size:.72rem" class="faint"><span>${d[0].date.split('-').reverse().join('/')}</span><span>${d[d.length - 1].date.split('-').reverse().join('/')}</span></div>`;
}

async function saveNote() {
  if (!A) return;
  const S = store.state; const f = A.f; const m = S.result?.market;
  const pick = (hz) => ({ score: A.sc[hz].score, verdict: A.sc[hz].verdict.label, key: A.sc[hz].verdict.key, reasons: A.sc[hz].reasons.slice(0, 6).map((r) => ({ t: r.text, i: Math.round(r.impact * 10) / 10 })) });
  const idxPrice = S.idxLive?.price || S.index[S.index.length - 1]?.c || null;
  const data = { short: pick('short'), mid: pick('mid'), long: pick('long'), t: f.ind && S.bars[sym][S.bars[sym].length - 1].t,
    sup: f.sup?.p ?? null, res: f.res?.p ?? null, inval: A.zones.invalidation, rs: S.result?.rows?.[sym]?.rs ?? null,
    market: m ? { score: m.score, phase: m.phase } : null, top: f.top ? { score: f.top.score, level: f.top.level.label } : null, sector: S.secNames[S.secOf[sym]] || null, patterns: f.patterns.map((p) => p.name), bottom: A.bt?.inZone && A.bt.score !== null ? { score: A.bt.score, stage: A.bt.stage.label } : null, name: S.names[sym] || fundData?.name || '' };
  const planOpt = (hz) => { const P = A.plans?.[hz]; if (!P || P.setup === 'none' || !P.stop) return `<label class="ind" style="opacity:.55"><input type="radio" name="phz" value="${hz}" disabled> <b>${HZ[hz]}</b><div class="s">${esc(P?.label || 'Chưa có kế hoạch')}</div></label>`;
    return `<label class="ind" style="cursor:pointer"><input type="radio" name="phz" value="${hz}" ${hz === planHz ? 'checked' : ''}> <b>${HZ[hz]}</b> <span class="pill ${P.valid ? 'bull' : 'neutral'}" style="margin-left:4px">${P.rr1.toFixed(1)}R</span>
      <div class="s" style="margin-top:4px">${esc(P.label)}<br>Vào ${P.entryHi ? fmtP(P.entry) + '–' + fmtP(P.entryHi) : fmtP(P.entry)} · Dừng ${fmtP(P.stop)} · MT1 ${fmtP(P.t1)}</div></label>`; };
  const res = await modal({
    title: `Lưu nhận định ${sym}`,
    body: `<p class="dim" style="font-size:.9rem">Lưu lại giá <b>${fmtP(f.price)}</b>, điểm và lý do của ba khung thời gian, cùng một kế hoạch giao dịch (vào – dừng lỗ – mục tiêu). Trang “Đã lưu” sẽ theo dõi xem kế hoạch có khớp lệnh, chạm mục tiêu hay dính dừng lỗ.</p>
      <div class="kpis" style="grid-template-columns:repeat(3,1fr)">${['short', 'mid', 'long'].map((hz) => `<div class="ind ${vClass(A.sc[hz].verdict)}"><div class="l">${HZ[hz]}</div><div class="v" style="color:var(--sc)">${Math.round(A.sc[hz].score)}</div><div class="s">${A.sc[hz].verdict.label}</div></div>`).join('')}</div>
      <div class="field"><label>Kế hoạch giao dịch sẽ được theo dõi</label><div class="kpis" style="grid-template-columns:repeat(3,1fr)">${['short', 'mid', 'long'].map(planOpt).join('')}</div></div>
      <div class="field"><label for="nt">Ghi chú của bạn (không bắt buộc)</label><textarea class="input" id="nt" maxlength="1000" placeholder="Vì sao bạn quan tâm mã này, kế hoạch theo dõi…"></textarea></div>`,
    actions: [{ label: 'Hủy' }, { label: 'Lưu nhận định', kind: 'primary', run: async (el) => { const hz = el.querySelector('input[name=phz]:checked')?.value; const P = hz ? A.plans[hz] : null;
      if (P) data.plan = { hz, setup: P.setup, label: P.label, entry: P.entry, entryHi: P.entryHi, trigger: P.trigger || (P.entryHi ? 'zone' : 'stop'), stop: P.stop, t1: P.t1, t2: P.t2, rr1: P.rr1, rr2: P.rr2, riskPct: P.riskPct, expiry: P.expiry, valid: P.valid, verdict: P.verdict };
      await auth.notes.save({ symbol: sym, price: f.price, idxPrice, data, note: $('#nt', el).value.trim() }); return true; } }],
  });
  if (res) toast(`Đã lưu nhận định ${sym}`);
}

function drawAll(force) { head(); drawVerdicts(); drawChart(force); drawZones(); drawBook(); drawInds(); }

export default {
  render,
  update(what) {
    if (!root || !sym) return;
    if (what === 'board') { head(); drawBook(); }
    const bars = store.state.bars[sym]; const k = bars?.length ? bars.length + ':' + bars[bars.length - 1].t + ':' + bars[bars.length - 1].c : '';
    if (A && k && k !== lastBarKey) { lastBarKey = k; analyze(); head(); drawVerdicts(); drawZones(); drawInds(); if (opts.tf !== 'I') drawChart(); return; }
    if (what === 'result' && A) { analyze(); drawVerdicts(); drawInds(); }
  },
  destroy() { osc?.destroy(); chart?.destroy(); chart = null; osc = null; root = null; sym = null; },
};
