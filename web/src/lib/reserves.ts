import type { Market } from './markets';
import { marginFor } from './hedge';

// Every coin has a USD reserve (USDC) that lends dollars to Hedges (price up).
// The token reserve for Shorts is off in the product for now (owner 2026-10-19; contracts keep it disabled).
// Demo numbers, stable per coin, until the vaults exist on-chain.
export function demoReserves(m: Market) {
  let s = [...m.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 11) % 2147483647 || 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = m.marketCap > 1e10 ? 4e6 : m.marketCap > 1e9 ? 1.2e6 : 2.5e5;
  const usdRes = Math.round(base * (0.4 + r()));
  const usdUtil = 0.3 + r() * 0.6;
  const aprBase = m.maxM >= 25 ? 6 : m.maxM >= 10 ? 11 : 16;
  return {
    usd: { reserve: usdRes, util: usdUtil, apr: aprBase * (0.6 + usdUtil) + r() * 3 },
  };
}

/** Contract: a vault lends until 90 % of its assets are out (BackxReserveVault.maxUtilBps). */
export const MAX_UTIL = 0.9;

/** USDC the reserve can still lend (BackxReserveVault.availableToLend). Demo numbers until the vaults are live. */
export function availableToLend(m: Market): number {
  const { reserve, util } = demoReserves(m).usd;
  return Math.max(0, reserve * (MAX_UTIL - util));
}

/**
 * Highest multiplication for an amount paid (fees included) right now (BackxPositionManager.maxHedgeMFor): the coin's
 * cap, limited by what issuers can lend ((m − 1) · margin ≤ available) and by the max position size.
 */
export function maxHedgeMFor(m: Market, amount: number, maxNotionalUsd: number): number {
  if (!(amount > 0)) return m.maxM;
  const avail = availableToLend(m);
  for (let k = m.maxM; k > 1; k--) {
    const x = marginFor(amount, k - 1);
    if ((k - 1) * x <= avail && k * x <= maxNotionalUsd) return k;
  }
  return 1;
}
