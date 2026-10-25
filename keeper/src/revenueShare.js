// Weekly $GAZZ revenue share (owner 2026-10-25). The Treasury keeps 10 % of platform fees for $GAZZ holders and
// sends it to a contract gazz.fun controls; gazz.fun handles the distribution from there. distribute() is public,
// this job just pushes it once a week (anyone else could too). Nothing is sent while the Safe has not set the address.
import { treasuryAbi } from './abi.js';

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
    last = Date.now();
  };
}
