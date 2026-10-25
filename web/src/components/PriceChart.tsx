import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type SeriesType, type UTCTimestamp,
} from 'lightweight-charts';
import { demoCandles, type Market } from '../lib/markets';
import { INDICATORS, INDICATOR_IDS } from '../lib/indicators';
import type { Theme, PriceColors } from '../lib/theme';
import { Dropdown } from './Dropdown';
import { IndicatorPicker } from './IndicatorPicker';
import { SnapshotButton } from './SnapshotButton';
import { ShareButton } from './ShareButton';

const FRAMES = [
  { id: '1m', label: '1 min', sec: 60 },
  { id: '5m', label: '5 min', sec: 300 },
  { id: '15m', label: '15 min', sec: 900 },
  { id: '30m', label: '30 min', sec: 1800 },
  { id: '1h', label: '1 hour', sec: 3600 },
  { id: '4h', label: '4 hours', sec: 14400 },
  { id: '1d', label: '1 day', sec: 86400 },
  { id: '1w', label: '1 week', sec: 604800 },
  { id: '1M', label: '1 month', sec: 2592000 },
] as const;
type FrameId = (typeof FRAMES)[number]['id'];
const FRAME_OPTIONS = FRAMES.map((f) => ({ value: f.id as FrameId, label: f.label }));

interface Props {
  market: Market;
  theme: Theme;
  priceColors: PriceColors;
  entry: number;
  liqPrice: number | null; // null at 1×: nothing to liquidate
  /** Take-profit and stop-loss from the ticket (null = not set). */
  tp?: number | null;
  sl?: number | null;
  /** Entry is a limit price (the position opens there, not at today's price). */
  limit?: boolean;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
/** A token colour at some opacity (tokens are hex). */
const alpha = (name: string, a: number) => {
  const h = css(name).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return css(name);
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
};
const IND_KEY = 'backx.indicators';
/** "Moving Average (SMA 20)" → "SMA 20" for the legend; names without a short form stay as they are. */
const shortName = (n: string) => { const m = /\(([^)]*[A-Za-z][^)]*)\)/.exec(n); return m ? m[1] : n; };

export function PriceChart({ market, theme, priceColors, entry, liqPrice, tp = null, sl = null, limit = false }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const [frame, setFrame] = useState<FrameId>(() => {
    try { const v = localStorage.getItem('backx.frame'); if (FRAMES.some((f) => f.id === v)) return v as FrameId; } catch { /* storage off */ }
    return '5m';
  });
  useEffect(() => { try { localStorage.setItem('backx.frame', frame); } catch { /* storage off */ } }, [frame]);
  const [ready, setReady] = useState(false);
  // Indicators (owner 2026-10-25): chosen in the fx picker, saved per browser.
  const [active, setActive] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(IND_KEY) || '[]'); if (Array.isArray(v)) return v.filter((x) => INDICATOR_IDS.has(x)); } catch { /* storage off */ }
    return [];
  });
  useEffect(() => { try { localStorage.setItem(IND_KEY, JSON.stringify(active)); } catch { /* storage off */ } }, [active]);
  const indSeries = useRef<ISeriesApi<SeriesType>[]>([]);
  const sec = FRAMES.find((f) => f.id === frame)!.sec;
  const candles = useMemo(() => demoCandles(market, 240, sec), [market, sec]);

  // Create once.
  useEffect(() => {
    if (!el.current) return;
    const c = createChart(el.current, {
      autoSize: true,
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    });
    chart.current = c;
    series.current = c.addSeries(CandlestickSeries, { priceFormat: { type: 'price', precision: 6, minMove: 0.000001 } });
    setReady(true);
    // Panels can be dragged to any size (terminal layout): refit the candles to the new width and height, so a smaller
    // chart shows the same period instead of cutting off the oldest bars. Once per frame while dragging.
    let raf = 0, w = 0, h = 0;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (Math.abs(width - w) < 1 && Math.abs(height - h) < 1) return;
      w = width; h = height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => c.timeScale().fitContent());
    });
    ro.observe(el.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); c.remove(); chart.current = null; series.current = null; lines.current = []; indSeries.current = []; };
  }, []);

  // Theme and price colors come from CSS tokens.
  useEffect(() => {
    const c = chart.current, s = series.current;
    if (!c || !s) return;
    const up = css('--price-up'), down = css('--price-down');
    c.applyOptions({
      layout: { background: { type: ColorType.Solid, color: css('--panel') }, textColor: css('--ink-3'), fontFamily: css('--mono'), fontSize: 11 },
      grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
    });
    c.applyOptions({ layout: { panes: { separatorColor: css('--line'), separatorHoverColor: alpha('--ink-3', 0.3), enableResize: true } } });
    s.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
  }, [theme, priceColors, ready]);

  // Data.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const precision = market.price >= 1 ? 2 : market.price >= 0.01 ? 5 : 8;
    s.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } });
    s.setData(candles.map((d) => ({ time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close })));
    chart.current?.timeScale().fitContent();
  }, [candles, ready]);

  // Indicators: overlays on the price pane (volume on its own scale at the bottom), the rest one pane each below.
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    indSeries.current.forEach((x) => c.removeSeries(x));
    indSeries.current = [];
    for (let p = c.panes().length - 1; p > 0; p--) c.removePane(p);
    let pane = 0;
    const up = alpha('--price-up', 0.45), down = alpha('--price-down', 0.45);
    for (const ind of INDICATORS.filter((i) => active.includes(i.id))) {
      const idx = ind.overlay ? 0 : ++pane;
      for (const plot of ind.plots(candles)) {
        const time = (t: number) => t as UTCTimestamp;
        if (plot.kind === 'hist') {
          const volume = ind.id === 'vol';
          const s = c.addSeries(HistogramSeries, {
            priceLineVisible: false, lastValueVisible: !volume, title: volume ? '' : plot.name,
            ...(volume ? { priceScaleId: 'vol', priceFormat: { type: 'volume' } } : {}),
          }, idx);
          if (volume) s.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
          const byTime = new Map(candles.map((k) => [k.time, k]));
          s.setData(plot.data.map((d) => {
            const k = byTime.get(d.time)!;
            return { time: time(d.time), value: d.value, color: (volume ? k.close >= k.open : d.value >= 0) ? up : down };
          }));
          indSeries.current.push(s);
        } else {
          const s = c.addSeries(LineSeries, {
            color: css(plot.color), lineWidth: 1, lineStyle: plot.dashed ? LineStyle.Dashed : LineStyle.Solid,
            priceLineVisible: false, lastValueVisible: !ind.overlay, crosshairMarkerVisible: false, title: ind.overlay ? '' : plot.name,
          }, idx);
          s.setData(plot.data.map((d) => ({ time: time(d.time), value: d.value })));
          indSeries.current.push(s);
        }
      }
    }
    c.panes().forEach((p, i) => { if (i > 0) p.setHeight(96); });
  }, [active, candles, theme, priceColors, ready]);

  // Entry, liquidation, take-profit and stop-loss preview lines for the ticket.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    lines.current = [
      s.createPriceLine({ price: entry, color: css('--ink-3'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: limit ? 'Limit' : 'Entry' }),
      ...(liqPrice != null ? [s.createPriceLine({ price: liqPrice, color: css('--down'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Liq.' })] : []),
      ...(tp != null ? [s.createPriceLine({ price: tp, color: css('--up'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'TP' })] : []),
      ...(sl != null ? [s.createPriceLine({ price: sl, color: css('--warning'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'SL' })] : []),
    ];
    // Keep every line in view: the price scale stretches to include them.
    const marks = [entry, liqPrice, tp, sl].filter((v): v is number => v != null && v > 0);
    s.applyOptions({
      autoscaleInfoProvider: (base: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = base();
        if (!r || !marks.length) return r;
        return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...marks), maxValue: Math.max(r.priceRange.maxValue, ...marks) } };
      },
    });
  }, [entry, liqPrice, tp, sl, limit, theme, ready]);

  const toggle = (id: string) => setActive((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const frameLabel = FRAMES.find((f) => f.id === frame)!.label;
  return (
    <section className="panel chart-panel" aria-label={`${market.symbol} price chart`}>
      <div className="chart-toolbar">
        <Dropdown label="Timeframe" value={frame} options={FRAME_OPTIONS} onChange={setFrame} compact />
        <ShareButton symbol={market.symbol} name={market.name} />
        <IndicatorPicker active={active} onToggle={toggle} />
        <span className="chart-note">Demo data</span>
        <SnapshotButton chart={chart} title={`${market.symbol} · ${frameLabel}`} />
      </div>
      {active.length > 0 && (
        <div className="chart-legend" aria-label="Indicators on the chart">
          {INDICATORS.filter((i) => active.includes(i.id)).map((i) => (
            <span key={i.id} className="chart-legend-item">
              <i style={{ background: `var(${i.plots(candles.slice(-1))[0]?.color ?? '--ink-3'})` }} aria-hidden="true" />{shortName(i.name)}
              <button type="button" onClick={() => toggle(i.id)} aria-label={`Remove ${i.name}`}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="chart" ref={el} />
    </section>
  );
}
