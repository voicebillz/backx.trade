import type { Candle } from './markets';

// Chart indicators (owner 2026-10-25), computed in the browser from the candles. Each returns one or more plots:
// overlays share the price pane, the rest get a pane of their own under the chart. Colours are token names.

export type Point = { time: number; value: number };
export interface Plot { name: string; kind: 'line' | 'hist'; color: string; data: Point[]; dashed?: boolean; signed?: boolean }
export interface IndicatorDef { id: string; name: string; group: 'Trend' | 'Volatility' | 'Momentum' | 'Volume'; overlay: boolean; plots: (c: Candle[]) => Plot[] }

const at = (c: Candle[], v: (number | null)[]): Point[] => v.flatMap((x, i) => (x == null || !Number.isFinite(x) ? [] : [{ time: c[i].time, value: x }]));
const closes = (c: Candle[]) => c.map((k) => k.close);

export function sma(v: number[], n: number): (number | null)[] {
  let sum = 0;
  return v.map((x, i) => { sum += x; if (i >= n) sum -= v[i - n]; return i >= n - 1 ? sum / n : null; });
}
export function ema(v: number[], n: number): (number | null)[] {
  const k = 2 / (n + 1); let e: number | null = null;
  return v.map((x, i) => { if (i < n - 1) return null; e = e == null ? v.slice(0, n).reduce((a, b) => a + b, 0) / n : x * k + e * (1 - k); return e; });
}
function wma(v: number[], n: number): (number | null)[] {
  const d = (n * (n + 1)) / 2;
  return v.map((_, i) => (i < n - 1 ? null : v.slice(i - n + 1, i + 1).reduce((a, x, j) => a + x * (j + 1), 0) / d));
}
function stdev(v: number[], n: number): (number | null)[] {
  return v.map((_, i) => { if (i < n - 1) return null; const w = v.slice(i - n + 1, i + 1), m = w.reduce((a, b) => a + b, 0) / n; return Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / n); });
}
function tr(c: Candle[]) { return c.map((k, i) => (i === 0 ? k.high - k.low : Math.max(k.high - k.low, Math.abs(k.high - c[i - 1].close), Math.abs(k.low - c[i - 1].close)))); }
function rma(v: number[], n: number): (number | null)[] {
  let r: number | null = null;
  return v.map((x, i) => { if (i < n - 1) return null; r = r == null ? v.slice(0, n).reduce((a, b) => a + b, 0) / n : (r * (n - 1) + x) / n; return r; });
}
const hh = (c: Candle[], i: number, n: number) => Math.max(...c.slice(Math.max(0, i - n + 1), i + 1).map((k) => k.high));
const ll = (c: Candle[], i: number, n: number) => Math.min(...c.slice(Math.max(0, i - n + 1), i + 1).map((k) => k.low));

export function rsi(v: number[], n = 14): (number | null)[] {
  const g = v.map((x, i) => (i ? Math.max(x - v[i - 1], 0) : 0)), l = v.map((x, i) => (i ? Math.max(v[i - 1] - x, 0) : 0));
  const ag = rma(g, n), al = rma(l, n);
  return v.map((_, i) => (ag[i] == null || al[i] == null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i]! / al[i]!)));
}

const line = (name: string, color: string, data: Point[], dashed?: boolean): Plot => ({ name, kind: 'line', color, data, dashed });

export const INDICATORS: IndicatorDef[] = [
  { id: 'vol', name: 'Volume', group: 'Volume', overlay: true, plots: (c) => [{ name: 'Volume', kind: 'hist', color: '--ink-3', signed: true, data: at(c, c.map((k) => k.volume ?? 0)) }] },
  { id: 'sma20', name: 'Moving Average (SMA 20)', group: 'Trend', overlay: true, plots: (c) => [line('SMA 20', '--info', at(c, sma(closes(c), 20)))] },
  { id: 'sma50', name: 'Moving Average (SMA 50)', group: 'Trend', overlay: true, plots: (c) => [line('SMA 50', '--warning', at(c, sma(closes(c), 50)))] },
  { id: 'sma200', name: 'Moving Average (SMA 200)', group: 'Trend', overlay: true, plots: (c) => [line('SMA 200', '--ink-2', at(c, sma(closes(c), 200)))] },
  { id: 'ema9', name: 'Exponential Moving Average (EMA 9)', group: 'Trend', overlay: true, plots: (c) => [line('EMA 9', '--brand', at(c, ema(closes(c), 9)))] },
  { id: 'ema21', name: 'Exponential Moving Average (EMA 21)', group: 'Trend', overlay: true, plots: (c) => [line('EMA 21', '--info', at(c, ema(closes(c), 21)))] },
  { id: 'wma20', name: 'Weighted Moving Average (WMA 20)', group: 'Trend', overlay: true, plots: (c) => [line('WMA 20', '--ink-2', at(c, wma(closes(c), 20)))] },
  { id: 'bb', name: 'Bollinger Bands (20, 2)', group: 'Volatility', overlay: true, plots: (c) => {
    const m = sma(closes(c), 20), sd = stdev(closes(c), 20);
    return [line('BB upper', '--info', at(c, m.map((x, i) => (x == null ? null : x + 2 * sd[i]!)))), line('BB basis', '--ink-3', at(c, m), true), line('BB lower', '--info', at(c, m.map((x, i) => (x == null ? null : x - 2 * sd[i]!))))];
  } },
  { id: 'kc', name: 'Keltner Channels (20, 2)', group: 'Volatility', overlay: true, plots: (c) => {
    const m = ema(closes(c), 20), a = rma(tr(c), 10);
    return [line('KC upper', '--warning', at(c, m.map((x, i) => (x == null || a[i] == null ? null : x + 2 * a[i]!)))), line('KC basis', '--ink-3', at(c, m), true), line('KC lower', '--warning', at(c, m.map((x, i) => (x == null || a[i] == null ? null : x - 2 * a[i]!))))];
  } },
  { id: 'dc', name: 'Donchian Channels (20)', group: 'Volatility', overlay: true, plots: (c) => [
    line('DC upper', '--ink-2', at(c, c.map((_, i) => (i < 19 ? null : hh(c, i, 20))))), line('DC lower', '--ink-2', at(c, c.map((_, i) => (i < 19 ? null : ll(c, i, 20))))),
  ] },
  { id: 'vwap', name: 'VWAP', group: 'Volume', overlay: true, plots: (c) => {
    let pv = 0, vv = 0;
    return [line('VWAP', '--brand', at(c, c.map((k) => { const v = k.volume ?? 1; pv += ((k.high + k.low + k.close) / 3) * v; vv += v; return pv / vv; })))];
  } },
  { id: 'psar', name: 'Parabolic SAR', group: 'Trend', overlay: true, plots: (c) => {
    if (c.length < 2) return [];
    let up = c[1].close >= c[0].close, sar = up ? c[0].low : c[0].high, ep = up ? c[0].high : c[0].low, af = 0.02;
    const out: (number | null)[] = [null];
    for (let i = 1; i < c.length; i++) {
      sar = sar + af * (ep - sar);
      if (up ? c[i].low < sar : c[i].high > sar) { up = !up; sar = ep; ep = up ? c[i].high : c[i].low; af = 0.02; }
      else if (up ? c[i].high > ep : c[i].low < ep) { ep = up ? c[i].high : c[i].low; af = Math.min(af + 0.02, 0.2); }
      out.push(sar);
    }
    return [{ ...line('SAR', '--ink-2', at(c, out)), dashed: true }];
  } },
  { id: 'ichi', name: 'Ichimoku (conversion, base)', group: 'Trend', overlay: true, plots: (c) => [
    line('Tenkan 9', '--info', at(c, c.map((_, i) => (i < 8 ? null : (hh(c, i, 9) + ll(c, i, 9)) / 2)))),
    line('Kijun 26', '--down', at(c, c.map((_, i) => (i < 25 ? null : (hh(c, i, 26) + ll(c, i, 26)) / 2)))),
  ] },
  { id: 'rsi', name: 'Relative Strength Index (RSI 14)', group: 'Momentum', overlay: false, plots: (c) => [line('RSI 14', '--brand', at(c, rsi(closes(c))))] },
  { id: 'macd', name: 'MACD (12, 26, 9)', group: 'Momentum', overlay: false, plots: (c) => {
    const f = ema(closes(c), 12), s = ema(closes(c), 26);
    const m = f.map((x, i) => (x == null || s[i] == null ? null : x - s[i]!));
    const first = m.findIndex((x) => x != null);
    const sig = [...Array(Math.max(first, 0)).fill(null), ...ema(m.slice(first).map((x) => x!), 9)];
    return [
      { name: 'Histogram', kind: 'hist', color: '--ink-3', signed: true, data: at(c, m.map((x, i) => (x == null || sig[i] == null ? null : x - sig[i]!))) },
      line('MACD', '--info', at(c, m)), line('Signal', '--warning', at(c, sig)),
    ];
  } },
  { id: 'stoch', name: 'Stochastic (14, 3)', group: 'Momentum', overlay: false, plots: (c) => {
    const k = c.map((x, i) => (i < 13 ? null : ((x.close - ll(c, i, 14)) / Math.max(hh(c, i, 14) - ll(c, i, 14), 1e-12)) * 100));
    const first = k.findIndex((x) => x != null);
    const d = [...Array(first).fill(null), ...sma(k.slice(first).map((x) => x!), 3)];
    return [line('%K', '--info', at(c, k)), line('%D', '--warning', at(c, d))];
  } },
  { id: 'wr', name: 'Williams %R (14)', group: 'Momentum', overlay: false, plots: (c) => [line('%R', '--info', at(c, c.map((x, i) => (i < 13 ? null : ((hh(c, i, 14) - x.close) / Math.max(hh(c, i, 14) - ll(c, i, 14), 1e-12)) * -100))))] },
  { id: 'cci', name: 'Commodity Channel Index (CCI 20)', group: 'Momentum', overlay: false, plots: (c) => {
    const tp = c.map((k) => (k.high + k.low + k.close) / 3), m = sma(tp, 20);
    return [line('CCI 20', '--info', at(c, tp.map((x, i) => { if (m[i] == null) return null; const w = tp.slice(i - 19, i + 1), md = w.reduce((a, y) => a + Math.abs(y - m[i]!), 0) / 20; return md ? (x - m[i]!) / (0.015 * md) : 0; })))];
  } },
  { id: 'mom', name: 'Momentum (10)', group: 'Momentum', overlay: false, plots: (c) => [line('MOM 10', '--info', at(c, c.map((k, i) => (i < 10 ? null : k.close - c[i - 10].close))))] },
  { id: 'roc', name: 'Rate of Change (ROC 9)', group: 'Momentum', overlay: false, plots: (c) => [line('ROC 9', '--info', at(c, c.map((k, i) => (i < 9 ? null : (k.close / c[i - 9].close - 1) * 100))))] },
  { id: 'atr', name: 'Average True Range (ATR 14)', group: 'Volatility', overlay: false, plots: (c) => [line('ATR 14', '--warning', at(c, rma(tr(c), 14)))] },
  { id: 'adx', name: 'Average Directional Index (ADX 14)', group: 'Trend', overlay: false, plots: (c) => {
    const up = c.map((k, i) => (i && k.high - c[i - 1].high > c[i - 1].low - k.low ? Math.max(k.high - c[i - 1].high, 0) : 0));
    const dn = c.map((k, i) => (i && c[i - 1].low - k.low > k.high - c[i - 1].high ? Math.max(c[i - 1].low - k.low, 0) : 0));
    const a = rma(tr(c), 14), pu = rma(up, 14), pd = rma(dn, 14);
    const pdi = a.map((x, i) => (x ? (100 * pu[i]!) / x : null)), mdi = a.map((x, i) => (x ? (100 * pd[i]!) / x : null));
    const dx = pdi.map((p, i) => (p == null || mdi[i] == null ? null : (100 * Math.abs(p - mdi[i]!)) / Math.max(p + mdi[i]!, 1e-12)));
    const first = dx.findIndex((x) => x != null);
    const adx = [...Array(first).fill(null), ...rma(dx.slice(first).map((x) => x!), 14)];
    return [line('ADX', '--brand', at(c, adx)), line('+DI', '--up', at(c, pdi)), line('−DI', '--down', at(c, mdi))];
  } },
  { id: 'obv', name: 'On Balance Volume (OBV)', group: 'Volume', overlay: false, plots: (c) => {
    let o = 0;
    return [line('OBV', '--info', at(c, c.map((k, i) => { if (i) o += k.close > c[i - 1].close ? (k.volume ?? 0) : k.close < c[i - 1].close ? -(k.volume ?? 0) : 0; return o; })))];
  } },
  { id: 'mfi', name: 'Money Flow Index (MFI 14)', group: 'Volume', overlay: false, plots: (c) => {
    const tp = c.map((k) => (k.high + k.low + k.close) / 3);
    return [line('MFI 14', '--brand', at(c, tp.map((_, i) => {
      if (i < 14) return null;
      let p = 0, n = 0;
      for (let j = i - 13; j <= i; j++) { const f = tp[j] * (c[j].volume ?? 0); if (tp[j] > tp[j - 1]) p += f; else if (tp[j] < tp[j - 1]) n += f; }
      return n === 0 ? 100 : 100 - 100 / (1 + p / n);
    })))];
  } },
];

export const INDICATOR_IDS = new Set(INDICATORS.map((i) => i.id));
