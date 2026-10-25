import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { demoCandles, type Market } from '../lib/markets';
import type { Theme, PriceColors } from '../lib/theme';
import { Dropdown } from './Dropdown';

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
    return () => { ro.disconnect(); cancelAnimationFrame(raf); c.remove(); chart.current = null; series.current = null; lines.current = []; };
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
    s.applyOptions({ upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down });
  }, [theme, priceColors, ready]);

  // Data.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const sec = FRAMES.find((f) => f.id === frame)!.sec;
    const precision = market.price >= 1 ? 2 : market.price >= 0.01 ? 5 : 8;
    s.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } });
    s.setData(demoCandles(market, 240, sec).map((d) => ({ ...d, time: d.time as UTCTimestamp })));
    chart.current?.timeScale().fitContent();
  }, [market, frame, ready]);

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

  return (
    <section className="panel chart-panel" aria-label={`${market.symbol} price chart`}>
      <div className="chart-toolbar">
        <Dropdown label="Timeframe" value={frame} options={FRAME_OPTIONS} onChange={setFrame} compact />
        <span className="chart-note">Demo data</span>
      </div>
      <div className="chart" ref={el} />
    </section>
  );
}
