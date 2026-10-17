// Bọc TradingView Lightweight Charts v4: biểu đồ nến + khối lượng + đường MA + mức Fibo/hỗ trợ/kháng cự + đánh dấu tín hiệu,
// kèm khung phụ (RSI hoặc MACD) đồng bộ trục thời gian.
const LC = () => window.LightweightCharts;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt0 = (p) => (p >= 1000 ? Math.round(p).toLocaleString('vi-VN') : (+p).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));
const fmt2 = (p) => (+p).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let fmt = fmt0;

function baseOpts(el, h, f = fmt0) {
  return {
    width: el.clientWidth, height: h, autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: css('--text-faint'), fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif', fontSize: 11, attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: css('--border') } },
    rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, rightOffset: 4, barSpacing: 7, minBarSpacing: 1.5 },
    crosshair: { mode: 0, vertLine: { color: css('--border-strong'), labelBackgroundColor: css('--surface-solid') || '#121927' }, horzLine: { color: css('--border-strong'), labelBackgroundColor: css('--surface-solid') || '#121927' } },
    localization: { locale: 'vi-VN', priceFormatter: f },
    handleScale: { axisPressedMouseMove: true }, handleScroll: { vertTouchDrag: false },
  };
}

export function priceChart(el, tipEl, { decimals = 0 } = {}) {
  const L = LC(); if (!L) { el.innerHTML = '<div class="empty">Không tải được thư viện biểu đồ.</div>'; return null; }
  const fp = decimals ? fmt2 : fmt0;
  const chart = L.createChart(el, baseOpts(el, el.clientHeight || 460, fp));
  const up = css('--up'), down = css('--down');
  const candles = chart.addCandlestickSeries({ upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceLineVisible: true, priceLineWidth: 1 });
  candles.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.22 } });
  const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
  chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  const lines = {};
  const mkLine = (k, color, w = 2) => (lines[k] = chart.addLineSeries({ color, lineWidth: w, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }));
  mkLine('ma20', css('--ma20')); mkLine('ma50', css('--ma50')); mkLine('ma200', css('--ma200'));
  mkLine('bbU', css('--text-faint'), 1); mkLine('bbL', css('--text-faint'), 1);
  lines.bbU.applyOptions({ lineStyle: 2 }); lines.bbL.applyOptions({ lineStyle: 2 });
  let priceLines = []; let data = [];

  chart.subscribeCrosshairMove((p) => {
    if (!tipEl) return;
    const b = p && p.time !== undefined ? p.seriesData.get(candles) : null;
    const d = b ? data.find((x) => x.time === p.time) : data[data.length - 1];
    if (!d) { tipEl.innerHTML = ''; return; }
    const i = data.indexOf(d); const prev = data[i - 1]; const ch = prev ? (d.close / prev.close - 1) * 100 : 0;
    const date = typeof d.time === 'number' ? new Date(d.time * 1000).toLocaleString('vi-VN', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: d.intraday ? undefined : 'numeric', hour: d.intraday ? '2-digit' : undefined, minute: d.intraday ? '2-digit' : undefined }) : d.time;
    tipEl.innerHTML = `<span>${date}</span><span>M <b>${fp(d.open)}</b></span><span>C <b>${fp(d.high)}</b></span><span>T <b>${fp(d.low)}</b></span><span>Đ <b class="${ch >= 0 ? 'up' : 'down'}">${fp(d.close)} (${ch >= 0 ? '+' : ''}${ch.toFixed(2)}%)</b></span><span>KL <b>${Math.round(d.vol).toLocaleString('vi-VN')}</b></span>`;
  });

  return {
    chart,
    set(bars, ind, opt = {}) {
      const intraday = !!opt.intraday;
      data = bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, vol: b.v, intraday }));
      candles.setData(data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      vol.setData(bars.map((b, i) => ({ time: b.t, value: b.v, color: (b.c >= (i ? bars[i - 1].c : b.o) ? up : down) + '66' })));
      const ser = (arr) => (arr ? bars.map((b, i) => (Number.isFinite(arr[i]) ? { time: b.t, value: arr[i] } : { time: b.t })) : []);
      lines.ma20.setData(opt.ma !== false && ind ? ser(ind.ma20) : []);
      lines.ma50.setData(opt.ma !== false && ind ? ser(ind.ma50) : []);
      lines.ma200.setData(opt.ma !== false && ind ? ser(ind.ma200) : []);
      lines.bbU.setData(opt.bb && ind ? ser(ind.bb.up) : []); lines.bbL.setData(opt.bb && ind ? ser(ind.bb.lo) : []);
      priceLines.forEach((pl) => candles.removePriceLine(pl)); priceLines = [];
      for (const lv of opt.levels || []) priceLines.push(candles.createPriceLine({ price: lv.p, color: lv.color, lineWidth: lv.w || 1, lineStyle: lv.style ?? 2, axisLabelVisible: true, title: lv.title || '' }));
      candles.setMarkers((opt.markers || []).filter((m) => m.time).sort((a, b) => a.time - b.time));
      chart.timeScale().applyOptions({ timeVisible: intraday, secondsVisible: false });
      if (opt.range && data.length > opt.range) chart.timeScale().setVisibleLogicalRange({ from: data.length - opt.range, to: data.length + 3 });
      else chart.timeScale().fitContent();
      tipEl && chart.applyOptions({}); // cập nhật chú thích
      if (tipEl && data.length) { const d = data[data.length - 1]; tipEl.innerHTML = ''; void d; }
    },
    destroy() { try { chart.remove(); } catch (e) {} },
  };
}

// Khung phụ RSI / MACD
export function oscChart(el, master) {
  const L = LC(); if (!L) return null;
  const chart = L.createChart(el, { ...baseOpts(el, el.clientHeight || 140), timeScale: { visible: false, borderVisible: false } });
  const s = { };
  s.rsi = chart.addLineSeries({ color: css('--ma50'), lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
  s.hist = chart.addHistogramSeries({ priceLineVisible: false, lastValueVisible: false });
  s.macd = chart.addLineSeries({ color: css('--ma50'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  s.sig = chart.addLineSeries({ color: css('--ma20'), lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
  let pls = [];
  // đồng bộ với biểu đồ chính
  const sync = (r) => { if (r) chart.timeScale().setVisibleLogicalRange(r); };
  master.chart.timeScale().subscribeVisibleLogicalRangeChange(sync);
  return {
    chart,
    set(bars, ind, mode = 'rsi') {
      const ser = (arr) => bars.map((b, i) => (Number.isFinite(arr[i]) ? { time: b.t, value: arr[i] } : { time: b.t }));
      pls.forEach((p) => s.rsi.removePriceLine(p)); pls = [];
      if (mode === 'rsi') {
        s.rsi.setData(ser(ind.rsi)); s.hist.setData([]); s.macd.setData([]); s.sig.setData([]);
        for (const [v, c] of [[70, css('--down')], [30, css('--up')], [50, css('--text-faint')]]) pls.push(s.rsi.createPriceLine({ price: v, color: c, lineWidth: 1, lineStyle: 2, axisLabelVisible: false }));
      } else {
        s.rsi.setData([]);
        s.hist.setData(bars.map((b, i) => (Number.isFinite(ind.macd.hist[i]) ? { time: b.t, value: ind.macd.hist[i], color: (ind.macd.hist[i] >= 0 ? css('--up') : css('--down')) + '99' } : { time: b.t })));
        s.macd.setData(ser(ind.macd.line)); s.sig.setData(ser(ind.macd.signal));
      }
      const r = master.chart.timeScale().getVisibleLogicalRange(); if (r) chart.timeScale().setVisibleLogicalRange(r);
    },
    destroy() { try { master.chart.timeScale().unsubscribeVisibleLogicalRangeChange(sync); } catch (e) {} try { chart.remove(); } catch (e) {} },
  };
}

// Biểu đồ vùng đơn giản (độ rộng thị trường, VN-Index nhỏ)
export function areaChart(el, points, { color, height, fmtV } = {}) {
  const L = LC(); if (!L) return null;
  const chart = L.createChart(el, { ...baseOpts(el, height || el.clientHeight || 160), rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.05 } }, handleScroll: false, handleScale: false, localization: { locale: 'vi-VN', priceFormatter: fmtV || fmt } });
  const c = color || css('--accent');
  const s = chart.addAreaSeries({ lineColor: c, topColor: c + '55', bottomColor: c + '00', lineWidth: 2, priceLineVisible: false });
  s.setData(points); chart.timeScale().fitContent();
  return { chart, series: s, destroy() { try { chart.remove(); } catch (e) {} } };
}
