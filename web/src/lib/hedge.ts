// Hedge and Short math. Hedge: docs/backx/HEDGE-ISSUER-SPEC.md (§3–§5).
// Short: docs/backx/SHORT-SPEC.md. Preview only: the contracts decide.

// Same numbers as contracts/src/BackxPositionManager.sol and docs/backx/FEES-AND-MARGINS.md (v3).
/** holders + Reserve Security Fund on the stake; borrow + RSF on the amount lent. */
export const FEES = { holders: 0.02, borrow: 0.002, rsfStake: 0.005, rsfLent: 0.0003 } as const;
/** Extra margin on the issuers' principal; grows 0.02 % per step past 10×. */
export const buffer = (side: 'hedge' | 'short', m: number) => (side === 'hedge' ? 0.003 : 0.006) + 0.0002 * Math.max(m - 10, 0);
/** Max position (notional) per coin: keeps price impact ≈ ≤ 0.5 % per way. */
export const maxNotional = (depthUsd: number) => depthUsd * 0.005;

// Per m (1..30): e = trader equity left at liquidation (issuers' cushion), s = issuers' share of that rest,
// p = issuers' share of a gain. Identical to the contract defaults.
const E = [0, 4000, 4000, 3500, 3250, 3000, 2750, 2500, 2375, 2250, 2000, 1920, 1840, 1760, 1680, 1600, 1560, 1520, 1480, 1440, 1400, 1380, 1360, 1340, 1320, 1300, 1280, 1260, 1240, 1220, 1200];
const S = [0, 5000, 5000, 6000, 6500, 7000, 7500, 8000, 8167, 8333, 8500, 8600, 8700, 8800, 8900, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000];
const P = [0, 1500, 1500, 2000, 2250, 2500, 2750, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000, 3000];

export function params(m: number) {
  const i = Math.min(Math.max(Math.round(m), 1), 30);
  return { e: E[i] / 1e4, s: S[i] / 1e4, p: P[i] / 1e4 };
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
  fees: { holders: number; borrow: number; rsf: number; swap: number; total: number };
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
  const holders = stake * FEES.holders;
  if (m <= 1) {
    const safety = stake * FEES.rsfStake;
    // 1×: nothing is borrowed, so no liquidation and issuers get 0 %.
    const equity = stake - holders - safety;
    const c = oneWay(equity, poolFee, depthUsd);
    const swap = equity * 2 * c;
    return {
      side: 'hedge', stake, m: 1, equity, loan: 0, notional: equity, noLiquidation: true,
      fees: { holders, borrow: 0, rsf: safety, swap, total: holders + safety + swap },
      liqMove: 1, liqPrice: 0,
      ifWin10: { trader: equity * (1 - c) * 1.1 * (1 - c) - stake, issuers: 0 },
      ifLiquidated: { traderKeeps: 0, issuers: 0 },
    };
  }
  const { e, s, p } = params(m);
  const loan = (m - 1) * stake;
  const borrow = loan * FEES.borrow;
  const rsf = stake * FEES.rsfStake + loan * FEES.rsfLent;
  const equity = stake - holders - rsf - borrow;
  const notional = equity + loan;
  const cost = oneWay(notional, poolFee, depthUsd);
  const swap = notional * 2 * cost;
  // Net exit ≤ L·(1+buf) + e·E  (spec §4), on what the coins sell for after fee and impact.
  const coins = notional * (1 - cost);
  const liqRatio = (loan * (1 + buffer('hedge', m)) + e * equity) / (coins * (1 - cost));
  const gain = coins * 1.1 * (1 - cost) - loan - stake;
  const issuerGain = Math.max(gain, 0) * p;
  const rest = e * equity;
  return {
    side: 'hedge', stake, m, equity, loan, notional, noLiquidation: false,
    fees: { holders, borrow, rsf, swap, total: holders + borrow + rsf + swap },
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
  const holders = stake * FEES.holders;
  const e0 = stake - holders - stake * FEES.rsfStake;
  const notional = m * e0;
  const borrow = notional * FEES.borrow;
  const rsf = stake * FEES.rsfStake + notional * FEES.rsfLent;
  const equity = stake - holders - rsf - borrow;
  const cost = oneWay(notional, poolFee, depthUsd);
  const usdHeld = equity + notional * (1 - cost);
  const buyBack = (x: number) => notional * x * (1 + cost);
  const liqRatio = (usdHeld - e * equity) / (notional * (1 + cost) * (1 + buffer('short', m)));
  const gain = usdHeld - buyBack(0.9) - stake; // net of every fee, as sim/short_sim.py
  const issuerGain = Math.max(gain, 0) * p;
  const rest = e * equity;
  return {
    side: 'short', stake, m, equity, loan: notional, notional, noLiquidation: false,
    fees: { holders, borrow, rsf, swap: notional * 2 * cost, total: holders + borrow + rsf + notional * 2 * cost },
    liqMove: Math.max(liqRatio - 1, 0), liqPrice: entry * liqRatio,
    ifWin10: { trader: gain - issuerGain, issuers: borrow + issuerGain },
    ifLiquidated: { traderKeeps: rest * (1 - s), issuers: borrow + rest * s },
  };
}
