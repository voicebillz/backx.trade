import type { Side } from './hedge';

// Demo rows for admins until positions come from the contracts. Shared by the account panel and the ticket's Sell tab.
export interface DemoPosition { sym: string; side: Side; m: number; size: number; entry: number; mark: number; liq: number | null }

export const DEMO_POSITIONS: DemoPosition[] = [
  { sym: 'ETH', side: 'hedge', m: 5, size: 500, entry: 2391.2, mark: 2418.1, liq: 2079.3 },
  { sym: 'SOL', side: 'hedge', m: 3, size: 300, entry: 104.2, mark: 108.9, liq: 72.3 },
  { sym: 'BTC', side: 'hedge', m: 3, size: 300, entry: 80510, mark: 82012, liq: 62390 },
  { sym: 'BTC', side: 'short', m: 2, size: 200, entry: 83100, mark: 82012, liq: 118400 },
  { sym: 'DOGE', side: 'hedge', m: 1, size: 120, entry: 0.2391, mark: 0.2471, liq: null },
  { sym: 'BNB', side: 'hedge', m: 2, size: 200, entry: 715.0, mark: 723.4, liq: 509.1 },
];

/** Result in USD: a hedge gains when the price rises, a short when it falls. */
export const pnlOf = (p: DemoPosition) => p.size * p.m * (p.side === 'hedge' ? p.mark / p.entry - 1 : 1 - p.mark / p.entry);
