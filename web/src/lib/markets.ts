// Demo markets until the price service is live. Numbers are illustrative, not quotes.
export type Kind = 'Native' | 'Meme' | 'Stock';

export interface Market {
  symbol: string;
  name: string;
  kind: Kind;
  price: number;
  change24h: number;   // percent
  volume24h: number;   // USD
  depth: number;       // pool depth, USD
  poolFee: number;     // per swap
  maxM: number;
}

export const MARKETS: Market[] = [
  { symbol: 'ETH',  name: 'Ether',          kind: 'Native', price: 4182.55,  change24h: 2.14,  volume24h: 48_200_000, depth: 25_000_000, poolFee: 0.0005, maxM: 25 },
  { symbol: 'PONS', name: 'Pons',           kind: 'Meme',   price: 0.04218,  change24h: 11.62, volume24h: 2_940_000,  depth: 1_050_000,  poolFee: 0.003,  maxM: 10 },
  { symbol: 'GAZZ', name: 'Gazz',           kind: 'Meme',   price: 0.001874, change24h: -4.31, volume24h: 312_000,    depth: 56_000,     poolFee: 0.003,  maxM: 3 },
  { symbol: 'TSLA', name: 'Tesla (tokenized)', kind: 'Stock', price: 412.37, change24h: -0.86, volume24h: 9_800_000,  depth: 8_000_000,  poolFee: 0.0005, maxM: 10 },
  { symbol: 'NVDA', name: 'NVIDIA (tokenized)', kind: 'Stock', price: 187.92, change24h: 1.27, volume24h: 12_400_000, depth: 9_500_000,  poolFee: 0.0005, maxM: 10 },
  { symbol: 'HOOD', name: 'Robinhood (tokenized)', kind: 'Stock', price: 131.06, change24h: 3.48, volume24h: 4_100_000, depth: 3_200_000, poolFee: 0.0005, maxM: 10 },
  { symbol: 'DOGE', name: 'Dogecoin',       kind: 'Meme',   price: 0.2471,   change24h: -1.92, volume24h: 6_700_000,  depth: 2_400_000,  poolFee: 0.003,  maxM: 10 },
];

export interface Candle { time: number; open: number; high: number; low: number; close: number }

/** Deterministic random walk so the demo chart is stable between reloads. */
export function demoCandles(m: Market, count = 240, stepSec = 300): Candle[] {
  let seed = [...m.symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const vol = m.kind === 'Meme' ? 0.012 : 0.004;
  const end = Math.floor(Date.now() / 1000 / stepSec) * stepSec;
  const out: Candle[] = [];
  // Walk backwards from the current price so the last close matches the header.
  let close = m.price;
  for (let i = 0; i < count; i++) {
    const open = close * (1 + (rnd() - 0.5) * vol * 2 - (m.change24h / 100) / count);
    const high = Math.max(open, close) * (1 + rnd() * vol);
    const low = Math.min(open, close) * (1 - rnd() * vol);
    out.push({ time: end - i * stepSec, open, high, low, close });
    close = open;
  }
  return out.reverse();
}
