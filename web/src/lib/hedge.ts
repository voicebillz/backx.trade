// Hedge and Short math. Hedge: docs/backx/HEDGE-ISSUER-SPEC.md (§3–§5).
// Short: docs/backx/SHORT-SPEC.md. Preview only: the contracts decide.

export const FEES = { holders: 0.02, borrow: 0.002, safety: 0.005 } as const;
/** Liquidation buffer on the issuer's principal: 0.3 % for Hedge, 1 % for Short (up-spikes gap harder). */
export const BUFFER = { hedge: 0.003, short: 0.01 } as const;

// [m, e (trader's remaining share at liquidation), s (issuer share of rest), p (issuer share of gain)]
const PARAMS: [number, number, number, number][] = [
  [1, 0.40, 0.50, 0.15],
  [2, 0.40, 0.50, 0.15],
  [3, 0.35, 0.60, 0.20],
  [5, 0.30, 0.70, 0.25],
  [7, 0.25, 0.80, 0.30],
  [10, 0.20, 0.85, 0.30],
  [15, 0.15, 0.90, 0.30],
  [20, 0.12, 0.90, 0.30],
  [25, 0.10, 0.90, 0.30],
  [30, 0.08, 0.90, 0.30],
];

/** Linear interpolation over the spec's parameter table. */
export function params(m: number) {
  const i = PARAMS.findIndex(([pm]) => pm >= m);
  if (i <= 0) { const [, e, s, p] = PARAMS[Math.max(i, 0)]; return { e, s, p }; }
  const [m0, e0, s0, p0] = PARAMS[i - 1];
  const [m1, e1, s1, p1] = PARAMS[i];
  const t = (m - m0) / (m1 - m0);
  return { e: e0 + (e1 - e0) * t, s: s0 + (s1 - s0) * t, p: p0 + (p1 - p0) * t };
}

export type Side = 'hedge' | 'short';

export interface Quote {
  side: Side;
  stake: number;
  m: number;
  equity: number;         // E: stake after opening fees
  /** Hedge: USD lent by the USD vault, (m−1)·X. Short: USD value of the tokens lent by the token vault, m·E. */
  loan: number;
  notional: number;       // exposure in USD
  fees: { holders: number; borrow: number; safety: number; swap: number; total: number };
  noLiquidation: boolean; // Hedge at 1× only (nothing borrowed)
  liqMove: number;        // fraction: price fall (Hedge) or rise (Short) that liquidates
  liqPrice: number;
  /** Price moves 10 % in the trader's favour (up for Hedge, down for Short). */
  ifWin10: { trader: number; issuers: number };
  ifLiquidated: { traderKeeps: number; issuers: number };
}

/** Swap fee + price impact, one way, on a trade of `usd` through a pool. */
const oneWay = (usd: number, poolFee: number, depthUsd: number) => poolFee + usd / Math.max(depthUsd, 1e4);

/**
 * Hedge (price up). The USD vault lends L = (m−1)·X; E + L buys the token.
 * Issuer gets L back first, then p of the gain or s of the rest at liquidation.
 */
export function quote(stake: number, m: number, entry: number, poolFee: number, depthUsd: number): Quote {
  const holders = stake * FEES.holders, safety = stake * FEES.safety;
  if (m <= 1) {
    // 1×: nothing is borrowed, so no liquidation and issuers get 0 %.
    const equity = stake - holders - safety;
    const c = oneWay(equity, poolFee, depthUsd);
    const swap = equity * 2 * c;
    return {
      side: 'hedge', stake, m: 1, equity, loan: 0, notional: equity, noLiquidation: true,
      fees: { holders, borrow: 0, safety, swap, total: holders + safety + swap },
      liqMove: 1, liqPrice: 0,
      ifWin10: { trader: equity * (1 - c) * 1.1 * (1 - c) - stake, issuers: 0 },
      ifLiquidated: { traderKeeps: 0, issuers: 0 },
    };
  }
  const { e, s, p } = params(m);
  const loan = (m - 1) * stake;
  const borrow = loan * FEES.borrow;
  const equity = stake - holders - safety;
  const notional = equity + loan;
  const cost = oneWay(notional, poolFee, depthUsd);
  const swap = notional * 2 * cost;
  // Net exit ≤ L·(1+buf) + e·E  (spec §4), on what the coins sell for after fee and impact.
  const coins = notional * (1 - cost);
  const liqRatio = (loan * (1 + BUFFER.hedge) + e * equity) / (coins * (1 - cost));
  const gain = coins * 1.1 * (1 - cost) - loan - stake;
  const issuerGain = Math.max(gain, 0) * p;
  const rest = e * equity;
  return {
    side: 'hedge', stake, m, equity, loan, notional, noLiquidation: false,
    fees: { holders, borrow, safety, swap, total: holders + borrow + safety + swap },
    liqMove: Math.max(1 - liqRatio, 0), liqPrice: entry * liqRatio,
    ifWin10: { trader: gain - issuerGain, issuers: borrow + issuerGain },
    ifLiquidated: { traderKeeps: rest * (1 - s), issuers: borrow + rest * s },
  };
}

/**
 * Short (price down). The token vault lends q tokens worth N = m·E; they are sold for USD.
 * Closing buys q back and returns them to the issuer first; then p of the gain or s of the rest.
 * Liquidation when the buy-back cost (with fee, impact, buffer) leaves only e·E.
 */
export function shortQuote(stake: number, m: number, entry: number, poolFee: number, depthUsd: number): Quote {
  const { e, s, p } = params(m);
  const holders = stake * FEES.holders, safety = stake * FEES.safety;
  const e0 = stake - holders - safety;
  const notional = m * e0;
  const borrow = notional * FEES.borrow;
  const equity = e0 - borrow;
  const cost = oneWay(notional, poolFee, depthUsd);
  const usdHeld = equity + notional * (1 - cost);
  const buyBack = (x: number) => notional * x * (1 + cost);
  const liqRatio = (usdHeld - e * equity) / (notional * (1 + cost) * (1 + BUFFER.short));
  const gain = usdHeld - buyBack(0.9) - stake; // net of every fee, as sim/short_sim.py
  const issuerGain = Math.max(gain, 0) * p;
  const rest = e * equity;
  return {
    side: 'short', stake, m, equity, loan: notional, notional, noLiquidation: false,
    fees: { holders, borrow, safety, swap: notional * 2 * cost, total: holders + borrow + safety + notional * 2 * cost },
    liqMove: Math.max(liqRatio - 1, 0), liqPrice: entry * liqRatio,
    ifWin10: { trader: gain - issuerGain, issuers: borrow + issuerGain },
    ifLiquidated: { traderKeeps: rest * (1 - s), issuers: borrow + rest * s },
  };
}
