import { useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries, ColorType, CrosshairMode, LineStyle, createChart,
  type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { demoCandles, type Market } from '../lib/markets';
import type { Theme, PriceColors } from '../lib/theme';

const FRAMES = [
  { id: '1m', sec: 60 },
  { id: '5m', sec: 300 },
  { id: '1h', sec: 3600 },
  { id: '1d', sec: 86400 },
] as const;

interface Props {
  market: Market;
  theme: Theme;
  priceColors: PriceColors;
  entry: number;
  liqPrice: number;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function PriceChart({ market, theme, priceColors, entry, liqPrice }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const lines = useRef<IPriceLine[]>([]);
  const [frame, setFrame] = useState<(typeof FRAMES)[number]['id']>('5m');
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
    return () => { c.remove(); chart.current = null; series.current = null; lines.current = []; };
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
    const precision = market.price >= 1 ? 2 : market.price >= 0.01 ? 5 : 7;
    s.applyOptions({ priceFormat: { type: 'price', precision, minMove: 1 / 10 ** precision } });
    s.setData(demoCandles(market, 240, sec).map((d) => ({ ...d, time: d.time as UTCTimestamp })));
    chart.current?.timeScale().fitContent();
  }, [market, frame, ready]);

  // Entry + liquidation preview lines for the ticket.
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    lines.current.forEach((l) => s.removePriceLine(l));
    lines.current = [
      s.createPriceLine({ price: entry, color: css('--ink-3'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Entry' }),
      s.createPriceLine({ price: liqPrice, color: css('--down'), lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Liq.' }),
    ];
  }, [entry, liqPrice, theme, ready]);

  return (
    <section className="panel chart-panel" aria-label={`${market.symbol} price chart`}>
      <div className="chart-toolbar" role="tablist" aria-label="Timeframe">
        {FRAMES.map((f) => (
          <button key={f.id} role="tab" aria-selected={frame === f.id} className={frame === f.id ? 'active' : ''} onClick={() => setFrame(f.id)}>
            {f.id}
          </button>
        ))}
        <span className="chart-note">Demo data</span>
      </div>
      <div className="chart" ref={el} />
    </section>
  );
}
