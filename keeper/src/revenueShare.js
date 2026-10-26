// Staking payout, continuous (owner 2026-10-26). The Treasury keeps 10 % of platform fees for $GAZZ and Gazz Tanks
// stakers; distribute() passes it to BackxStaking and starts its 24 h stream in the same call. This job calls the
// public distribute() every hour once at least MIN_UNITS is waiting (anyone else could too). Nothing is sent while the
// Safe has not pointed the Treasury at the staking contract.
import { treasuryAbi } from './abi.js';

// Below this (USD base units; default $1 with 6-decimal USDC, set DISTRIBUTE_MIN = 1e18 on BNB Chain) it waits an hour.
const MIN_UNITS = BigInt(process.env.DISTRIBUTE_MIN || '1000000');

export function makeRevenueShareJob({ pub, wallet, account, cfg, log }) {
  return async function revenueShare() {
    const T = { address: cfg.treasury, abi: treasuryAbi };
    const [to, pending] = await Promise.all([
      pub.readContract({ ...T, functionName: 'holderRewards' }),
      pub.readContract({ ...T, functionName: 'pending', args: [cfg.usd] }),
    ]);
    if (/^0x0{40}$/i.test(to)) return; // staking not connected yet: the share keeps accruing in the Treasury
    if (pending >= MIN_UNITS) {
      const { request, result } = await pub.simulateContract({ account, ...T, functionName: 'distribute', args: [cfg.usd] });
      await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
      log(`stakers: ${result} USD units to ${to}, streaming over 24 h`);
    }
  };
}
