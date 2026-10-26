// Hedge and Short math. Hedge: docs/backx/HEDGE-ISSUER-SPEC.md (§3–§5).
// Short: docs/backx/SHORT-SPEC.md. Preview only: the contracts decide.

// Same numbers as contracts/src/BackxHedgeManager.sol / BackxShortManager.sol and docs/backx/FEES-AND-MARGINS.md (v4).
// v4: exposure is exactly m × margin. The amount the trader types is what they pay (owner 2026-10-19): fees and
// validator gas come out of it, the rest is the margin. Same as the contract's _stakeFor.
/** Platform (Treasury, $GAZZ holders' share) + Reserve Security Fund on the stake; borrow + RSF on the amount lent.
 *  A 1× hedge borrows nothing and pays only `spot` (owner 2026-10-25, contract Fees.spotBps). */
export const FEES = { platform: 0.02, spot: 0.003, borrow: 0.0025, rsfStake: 0.005, rsfLent: 0.0003 } as const;
/** Platform's share of the outcome on positions with a loan (owner 2026-10-25, contract gainBps / liqCutBps):
 *  2 % of a trader's gain, 5 % of what is left at a liquidation (before the issuers' share). */
export const OUTCOME = { gain: 0.02, liq: 0.05 } as const;

/** Fee rate on the margin for a position that lends lentMult × margin (contract _rates + _stakeFor). */
export const feeRate = (lentMult: number) =>
  (lentMult === 0 ? FEES.spot : FEES.platform + FEES.rsfStake) + lentMult * (FEES.borrow + FEES.rsfLent);
/** Validator gas per position (contract validation.gasUsd, flat USD): ≈ 2× one close/liquidation. Escrowed in the
 *  position, paid to whoever settles it; on your own close it goes to the Treasury (never refunded, owner 2026-10-26). ÅPEN: set from measured gas at deploy. */
export const KEEPER_GAS = 0.5; // $0.50: every validator earns at least this per settlement (owner 2026-10-26)
/** Extra margin on the issuers' principal; grows 0.02 % per step past 10×. */
export const buffer = (_side: 'hedge' | 'short', m: number) => 0.003 + 0.0002 * Math.max(m - 10, 0); // short: same since its margin is larger (2026-10-25)
/** Max position (notional) per coin: keeps price impact ≈ ≤ 0.5 % per way. */
export const maxNotional = (depthUsd: number) => depthUsd * 0.005;

// Per m (1..30): e = trader equity left at liquidation (issuers' cushion), s = issuers' share of that rest.
// p = issuers' share of a gain: a flat 10 % (Hedge 1× borrows nothing, so 0 %). Identical to the contract.
const E = [0, 4000, 4000, 3500, 3250, 3000, 2750, 2500, 2375, 2250, 2000, 1920, 1840, 1760, 1680, 1600, 1560, 1520, 1480, 1440, 1400, 1380, 1360, 1340, 1320, 1300, 1280, 1260, 1240, 1220, 1200];
const S = [0, 5000, 5000, 6000, 6500, 7000, 7500, 8000, 8167, 8333, 8500, 8600, 8700, 8800, 8900, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000];
const P = 0.1;

export function params(m: number) {
  const i = Math.min(Math.max(Math.round(m), 1), 30);
  return { e: E[i] / 1e4, s: S[i] / 1e4, p: P };
}

export type Side = 'hedge' | 'short';

export interface Quote {
  side: Side;
  /** What the trader typed and pays, everything included. */
  amount: number;
  /** Margin X: the amount after fees and gas (contract _stakeFor). */
  stake: number;
  m: number;
  equity: number;         // E: the margin
  /** What leaves the wallet: margin + every fee + keeper gas (≤ amount). Trader results below are net of it. */
  paid: number;
  /** Hedge: USD lent by the USD vault, (m−1)·X. Short: USD value of the tokens lent by the token vault, m·E. */
  loan: number;
  notional: number;       // exposure in USD
  fees: { holders: number; borrow: number; rsf: number; gas: number; swap: number; total: number };
  noLiquidation: boolean; // Hedge at 1× only (nothing borrowed)
  liqMove: number;        // fraction: price fall (Hedge) or rise (Short) that liquidates
  liqPrice: number;
  /** Price moves 10 % in the trader's favour (up for Hedge, down for Short). */
  ifWin10: { trader: number; issuers: number };
  /** traderKeeps = USDC back to the wallet after a liquidation. */
  ifLiquidated: { traderKeeps: number; issuers: number; platform: number };
  /** Close at price ratio x (P / entry), as the contract settles it. A move past liquidation settles at the trigger. */
  at: (x: number) => Outcome;
}

/** trader = net result (payout − everything paid), issuers = total issuer income from the position. */
export interface Outcome { trader: number; issuers: number; platform: number; liquidated: boolean }

/** Contract default: a limit close fills at most 1 % worse than the limit (limitSlipBps). */
export const LIMIT_SLIP = 0.01;

/** Swap fee + price impact, one way, on a trade of `usd` through a pool. */
const oneWay = (usd: number, poolFee: number, depthUsd: number) => poolFee + usd / Math.max(depthUsd, 1e4);

/**
 * Hedge (price up). The USD vault lends L = (m−1)·X; X + L buys the token.
 * Issuer gets L back first, then p of the gain or s of the rest at liquidation.
 */
/** liqMargin: the market's execution margin (Market.liqMarginBps / 1e4); it moves liquidation earlier for the issuers' safety. */
/** Margin left from `amount` once fees and gas are paid; lentMult = m − 1 for a Hedge, m for a Short. */
export function marginFor(amount: number, lentMult: number): number {
  return Math.max(0, (amount - KEEPER_GAS) / (1 + feeRate(lentMult)));
}

export function quote(amount: number, m: number, entry: number, poolFee: number, depthUsd: number, liqMargin = 0): Quote {
  const mm = Math.max(1, Math.round(m));
  const { e, s, p } = params(mm);
  const stake = marginFor(amount, mm - 1);
  const loan = (mm - 1) * stake;
  const holders = stake * (loan === 0 ? FEES.spot : FEES.platform);
  const borrow = loan * FEES.borrow;
  const rsf = loan === 0 ? 0 : stake * FEES.rsfStake + loan * FEES.rsfLent;
  const gas = KEEPER_GAS;
  const paid = stake + holders + borrow + rsf + gas;
  const equity = stake;
  const notional = mm * stake;
  const cost = oneWay(notional, poolFee, depthUsd);
  const swap = notional * 2 * cost;
  const coins = notional * (1 - cost);
  // 1×: nothing is borrowed, so no liquidation and issuers get 0 %.
  const noLiquidation = mm === 1;
  // Net exit ≤ L·(1+buf) + e·E + margin·N (contract _hedgeThreshold), on what the coins sell for after fee and impact.
  const liqRatio = noLiquidation ? 0 : (loan * (1 + buffer('hedge', mm)) + e * equity + liqMargin * notional) / (coins * (1 - cost));
  const at = (x: number): Outcome => {
    if (!noLiquidation && x <= liqRatio) {
      const r = (coins * liqRatio * (1 - cost) - loan) * (1 - OUTCOME.liq);
      return { trader: r * (1 - s) - paid, issuers: borrow + r * s, platform: r / (1 - OUTCOME.liq) * OUTCOME.liq, liquidated: true };
    }
    const rest = coins * x * (1 - cost) - loan;
    const gain = noLiquidation ? 0 : Math.max(rest - equity, 0);
    return { trader: rest - gain * (p + OUTCOME.gain) - paid, issuers: borrow + gain * p, platform: gain * OUTCOME.gain, liquidated: false };
  };
  const win = at(1.1);
  const rest = e * equity;
  return {
    side: 'hedge', amount, stake, m: mm, equity, paid, loan, notional, noLiquidation,
    fees: { holders, borrow, rsf, gas, swap, total: holders + borrow + rsf + gas + swap },
    liqMove: noLiquidation ? 1 : Math.max(1 - liqRatio, 0), liqPrice: entry * liqRatio,
    ifWin10: { trader: win.trader, issuers: win.issuers },
    ifLiquidated: { traderKeeps: noLiquidation ? 0 : rest * (1 - OUTCOME.liq) * (1 - s), issuers: borrow + rest * (1 - OUTCOME.liq) * s, platform: rest * OUTCOME.liq },
    at,
  };
}

/**
 * Short (price down). The token vault lends q tokens worth N = m·X; they are sold for USD.
 * Closing buys q back and returns them to the issuer first; then p of the gain or s of the rest.
 * Liquidation when the buy-back cost (with fee, impact, buffer) leaves only e·E.
 */
export function shortQuote(amount: number, m: number, entry: number, poolFee: number, depthUsd: number, liqMargin = 0, roof = 0.8): Quote {
  const mm = Math.max(1, Math.round(m));
  const { e, s, p } = params(mm);
  const stake = marginFor(amount, mm);
  const holders = stake * FEES.platform;
  const notional = mm * stake;
  const borrow = notional * FEES.borrow;
  const rsf = stake * FEES.rsfStake + notional * FEES.rsfLent;
  const gas = KEEPER_GAS;
  const paid = stake + holders + borrow + rsf + gas;
  const equity = stake;
  const cost = oneWay(notional, poolFee, depthUsd);
  const usdHeld = equity + notional * (1 - cost);
  const buyBack = (x: number) => notional * x * (1 + cost);
  // Contract _threshold: (C − e·X − margin·N) / (1 + buf) is the buy-back cost that liquidates.
  const liqRatio = (usdHeld - e * equity - liqMargin * notional) / (notional * (1 + cost) * (1 + buffer('short', mm)));
  const at = (y: number): Outcome => {
    const x = Math.max(y, 1 - roof); // the profit roof closes it: no gain past it
    if (x >= liqRatio) {
      const r = (usdHeld - buyBack(liqRatio)) * (1 - OUTCOME.liq);
      return { trader: r * (1 - s) - paid, issuers: borrow + r * s, platform: r / (1 - OUTCOME.liq) * OUTCOME.liq, liquidated: true };
    }
    const rest = usdHeld - buyBack(x);
    const gain = Math.max(rest - equity, 0);
    return { trader: rest - gain * (p + OUTCOME.gain) - paid, issuers: borrow + gain * p, platform: gain * OUTCOME.gain, liquidated: false };
  };
  const win = at(0.9);
  const rest = e * equity;
  return {
    side: 'short', amount, stake, m: mm, equity, paid, loan: notional, notional, noLiquidation: false,
    fees: { holders, borrow, rsf, gas, swap: notional * 2 * cost, total: holders + borrow + rsf + gas + notional * 2 * cost },
    liqMove: Math.max(liqRatio - 1, 0), liqPrice: entry * liqRatio,
    ifWin10: { trader: win.trader, issuers: win.issuers },
    ifLiquidated: { traderKeeps: rest * (1 - OUTCOME.liq) * (1 - s), issuers: borrow + rest * (1 - OUTCOME.liq) * s, platform: rest * OUTCOME.liq },
    at,
  };
}

/** Short per tier (owner 2026-10-25, server listing.js TIERS): margin and profit roof from the coin's cap. */
export function shortTier(maxM: number) {
  return maxM >= 20 ? { margin: 0.02, roof: 0.8 } : maxM >= 5 ? { margin: 0.03, roof: 0.7 } : maxM >= 3 ? { margin: 0.04, roof: 0.6 } : { margin: 0.05, roof: 0.5 };
}
