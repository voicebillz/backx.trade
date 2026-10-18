// Hedge math from docs/backx/HEDGE-ISSUER-SPEC.md (§3–§5). Preview only: the contracts decide.

export const FEES = { holders: 0.02, borrow: 0.002, safety: 0.005 } as const;

// [m, e (hedger's remaining share at liquidation), s (issuer share of rest), p (issuer share of gain)]
const PARAMS: [number, number, number, number][] = [
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

export interface Quote {
  stake: number;
  m: number;
  equity: number;      // E: stake after opening fees
  loan: number;        // L = (m − 1) × stake
  fees: { holders: number; borrow: number; safety: number; swap: number; total: number };
  noLiquidation: boolean; // true at 1×
  liqDrop: number;     // fraction, e.g. 0.067
  liqPrice: number;
  ifUp10: { hedger: number; issuers: number };
  ifLiquidated: { hedgerKeeps: number; issuers: number };
}

/**
 * poolFee is per swap (0.003 = 0.3 %), depthUsd is pool depth. Swap + impact
 * is paid on the full position both ways and comes out of the hedger's side.
 */
export function quote(stake: number, m: number, entry: number, poolFee: number, depthUsd: number): Quote {
  // 1×: nothing is borrowed, so there is no liquidation and issuers get 0 %.
  if (m <= 1) {
    const holders = stake * FEES.holders, safety = stake * FEES.safety;
    const swap = stake * (2 * poolFee + 0.0002 * (1e6 / Math.max(depthUsd, 1e4)));
    const equity = stake - holders - safety;
    return {
      stake, m: 1, equity, loan: 0, noLiquidation: true,
      fees: { holders, borrow: 0, safety, swap, total: holders + safety + swap },
      liqDrop: 1, liqPrice: 0,
      ifUp10: { hedger: equity * 0.1 - holders - safety - swap, issuers: 0 },
      ifLiquidated: { hedgerKeeps: 0, issuers: 0 },
    };
  }
  const { e, s, p } = params(m);
  const holders = stake * FEES.holders;
  const safety = stake * FEES.safety;
  const loan = (m - 1) * stake;
  const borrow = loan * FEES.borrow;
  const swapRate = 2 * poolFee + 0.0002 * m * (1e6 / Math.max(depthUsd, 1e4));
  const swap = stake * m * swapRate;
  const equity = stake - holders - safety;
  const liqDrop = (1 - e) / m;
  const notional = equity + loan;

  const gain = notional * 0.10;
  const issuerGain = gain * p;
  const ifUp10 = {
    hedger: gain - issuerGain - holders - safety - borrow - swap,
    issuers: borrow + issuerGain,
  };
  const rest = e * equity;
  const ifLiquidated = { hedgerKeeps: rest * (1 - s), issuers: borrow + rest * s };

  return {
    stake, m, equity, loan, noLiquidation: false,
    fees: { holders, borrow, safety, swap, total: holders + borrow + safety + swap },
    liqDrop, liqPrice: entry * (1 - liqDrop), ifUp10, ifLiquidated,
  };
}
