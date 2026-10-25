// Weekly $GAZZ holder payout (owner 2026-10-25). The Treasury keeps 10 % of platform fees for $GAZZ holders and sends
// it to BackxHolderRewards; this job, run only by the validator the Safe made operator, pays it out once a week:
//   1. Treasury.distribute(USDC) moves the holders' share in;
//   2. a snapshot of $GAZZ on Robinhood Chain from Transfer events (chain only, no indexer): each holder counts with
//      the LOWEST balance it had during the past week, so buying just before the payout and selling after earns nothing;
//   3. startRound fixes the budget, pay() sends it pro rata in batches. Dust below PAYOUT_MIN stays for next week.
// The contract enforces the rest: at most one round per 7 days, never above the budget, nobody paid twice.
import { createPublicClient, http } from 'viem';
import { erc20Abi, holderRewardsAbi, treasuryAbi } from './abi.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const DEAD = '0x000000000000000000000000000000000000dead';

/** First block on `client` with a timestamp ≥ ts (binary search). */
async function blockAt(client, ts, lo, hi) {
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const b = await client.getBlock({ blockNumber: mid });
    if (b.timestamp < ts) lo = mid + 1n; else hi = mid;
  }
  return lo;
}

/** Each address's lowest $GAZZ balance between block `start` and `head`: its balance at `start`, lowered by every
 *  outgoing transfer after it. Someone who had none at `start` scores 0, whatever it bought later. */
export async function weeklyLows(client, gazz, from, start, head, exclude) {
  const bal = new Map();
  let low = null;
  const STEP = 10_000n;
  for (let a = from; a <= head; a += STEP) {
    const b = a + STEP - 1n > head ? head : a + STEP - 1n;
    const logs = await client.getContractEvents({ address: gazz, abi: erc20Abi, eventName: 'Transfer', fromBlock: a, toBlock: b });
    for (const l of logs) {
      if (!low && l.blockNumber >= start) low = new Map(bal); // the week starts here
      const f = l.args.from.toLowerCase(), t = l.args.to.toLowerCase(), v = l.args.value;
      const nf = (bal.get(f) ?? 0n) - v;
      bal.set(f, nf);
      bal.set(t, (bal.get(t) ?? 0n) + v);
      if (low && low.has(f) && nf < low.get(f)) low.set(f, nf);
    }
  }
  low ??= new Map(bal);
  const skip = new Set([ZERO, DEAD, gazz.toLowerCase(), ...exclude]);
  return new Map([...low].filter(([k, v]) => v > 0n && !skip.has(k)));
}

export function makeHolderJob({ pub, wallet, account, cfg, log }) {
  const gazzClient = createPublicClient({ transport: http(cfg.gazzRpc, { timeout: 15_000 }) });
  const R = { address: cfg.rewards, abi: holderRewardsAbi };

  return async function holderPayout() {
    const [op, paused, gap, round] = await Promise.all([
      pub.readContract({ ...R, functionName: 'operator' }), pub.readContract({ ...R, functionName: 'paused' }),
      pub.readContract({ ...R, functionName: 'minGap' }), pub.readContract({ ...R, functionName: 'rounds', args: [cfg.usd] }),
    ]);
    if (op.toLowerCase() !== account.address.toLowerCase() || paused) return;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const startedAt = round[1];
    if (startedAt !== 0n && now < startedAt + BigInt(gap)) return; // not a week yet

    // 1. Pull the holders' share in from the Treasury.
    if ((await pub.readContract({ address: cfg.treasury, abi: treasuryAbi, functionName: 'pending', args: [cfg.usd] })) > 0n) {
      const { request } = await pub.simulateContract({ account, address: cfg.treasury, abi: treasuryAbi, functionName: 'distribute', args: [cfg.usd] });
      await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
    }

    // 2. Snapshot: lowest balance over the past week.
    const head = await gazzClient.getBlockNumber();
    const weekAgo = now - BigInt(gap);
    const start = await blockAt(gazzClient, weekAgo, cfg.fromBlock, head);
    const lows = await weeklyLows(gazzClient, cfg.gazz, cfg.fromBlock, start, head, cfg.exclude);
    const total = [...lows.values()].reduce((a, b) => a + b, 0n);
    if (total === 0n) return log('holders: no qualifying $GAZZ holders this week');

    // 3. Open the round and pay pro rata, rounded down.
    const sim = await pub.simulateContract({ account, ...R, functionName: 'startRound', args: [cfg.usd] });
    const [id, budget] = sim.result;
    if (budget === 0n) return log('holders: nothing to pay this week');
    await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(sim.request) });
    const rows = [...lows].map(([a, w]) => [a, budget * w / total]).filter(([, v]) => v >= cfg.minPayout);
    let sent = 0n;
    for (let i = 0; i < rows.length; i += cfg.perTx) {
      const part = rows.slice(i, i + cfg.perTx);
      const { request } = await pub.simulateContract({ account, ...R, functionName: 'pay', args: [cfg.usd, part.map((r) => r[0]), part.map((r) => r[1])] });
      await pub.waitForTransactionReceipt({ hash: await wallet.writeContract(request) });
      sent += part.reduce((a, r) => a + r[1], 0n);
    }
    log(`holders: round ${id} paid ${sent} of ${budget} USD units to ${rows.length} holders`);
  };
}
