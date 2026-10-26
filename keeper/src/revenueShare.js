// Weekly $GAZZ revenue share (owner 2026-10-25/26). The Treasury keeps 10 % of platform fees for $GAZZ stakers and
// sends it to BackxStaking ($GAZZ + Gazz Tanks staking), which streams it to stakers over 7 days once sync() is called.
// Both calls are public; this job just makes them once a week (anyone else could too). Nothing is sent while the Safe
// has not pointed the Treasury at the staking contract.
import { stakingAbi, treasuryAbi } from './abi.js';

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function makeRevenueShareJob({ pub, wallet, account, cfg, log }) {
  let last = 0;
  return async function revenueShare() {
    if (Date.now() - last < WEEK) return;
    const T = { address: cfg.treasury, abi: treasuryAbi };
    const [to, pending] = await Promise.all([
      pub.readContract({ ...T, functionName: 'holderRewards' }),
      pub.readContract({ ...T, functionName: 'pending', args: [cfg.usd] }),
    ]);
    if (/^0x0{40}$/i.test(to)) return; // gazz.fun's address not set yet: the share keeps accruing in the Treasury
    if (pending > 0n) {
      const { request, result } = await pub.simulateContract({ account, ...T, functionName: 'distribute', args: [cfg.usd] });
      await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
      log(`revenue share: ${result} USD units to ${to}`);
    }
    // Start streaming it to the stakers (staking contract only; skipped if the share goes anywhere else).
    try {
      const { request, result } = await pub.simulateContract({ account, address: to, abi: stakingAbi, functionName: 'sync' });
      if (result > 0n) { await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) }); log(`staking: ${result} USD units streaming to stakers`); }
    } catch { /* not a staking contract */ }
    last = Date.now();
  };
}
