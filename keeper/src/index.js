// BackX keeper (docs/KEEPERS.md, docs/backx/LIVENESS.md). Watches the Position Managers straight from the chain,
// liquidates and fills take-profits in batches, keeps the keeper gas wallets balanced among themselves, and
// optionally reports its health to api.backx.trade. It never needs BackX servers to do its job.
import { createPublicClient, createWalletClient, defineChain, fallback, http, webSocket, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createPrivateKey, sign } from 'node:crypto';
import { config } from './config.js';
import { managerAbi } from './abi.js';
import { makeHolderJob } from './holders.js';

const VERSION = '0.1.0';
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const chain = defineChain({
  id: config.chainId, name: `chain-${config.chainId}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: config.rpcs.filter((u) => u.startsWith('https')) } },
  contracts: { multicall3: { address: MULTICALL3 } },
});
// Several RPC providers in order; a failing one is skipped automatically.
const transport = fallback(config.rpcs.map((u) => (u.startsWith('wss') ? webSocket(u) : http(u, { timeout: 4000 }))));
const pub = createPublicClient({ chain, transport, pollingInterval: config.pollMs });
const account = privateKeyToAccount(config.key);
const wallet = createWalletClient({ chain, transport, account });
const me = account.address.toLowerCase();
const log = (...a) => console.log(new Date().toISOString(), config.id, ...a);

// ---- state ---------------------------------------------------------------------------------------------------
const open = new Map(config.managers.map((m) => [m, new Set()]));     // manager → open position ids
const withLimit = new Map(config.managers.map((m) => [m, new Set()]));
const orders = new Map(config.managers.map((m) => [m, new Set()]));   // manager → waiting entry orders
const firstDue = new Map();      // `${m}:${kind}:${id}` → { ms, block } when first seen due
const inFlight = new Map();      // same key → ms sent (no resend for 10 s)
const stats = { sent: 0, landed: 0, failed: 0, skipped: 0, latencies: [], block: 0n, balance: 0n, rpcErrors: 0 };
let lastBlock = config.startBlock > 0n ? config.startBlock - 1n : 0n;
let multicallOk = true;

// ---- index positions from events (chain only) ------------------------------------------------------------------
async function indexTo(head) {
  const STEP = 5000n;
  for (let from = lastBlock + 1n; from <= head; from += STEP) {
    const to = from + STEP - 1n > head ? head : from + STEP - 1n;
    const logs = await pub.getContractEvents({ address: config.managers, abi: managerAbi, fromBlock: from, toBlock: to });
    for (const l of logs) {
      const m = l.address.toLowerCase(), id = l.args.id;
      if (l.eventName === 'Opened') open.get(m)?.add(id);
      else if (l.eventName === 'Closed') { open.get(m)?.delete(id); withLimit.get(m)?.delete(id); }
      else if (l.eventName === 'LimitSet') { if (l.args.limitValue > 0n) withLimit.get(m)?.add(id); else withLimit.get(m)?.delete(id); }
      else if (l.eventName === 'OrderPlaced') orders.get(m)?.add(l.args.orderId);
      else if (l.eventName === 'OrderFilled' || l.eventName === 'OrderCancelled') orders.get(m)?.delete(l.args.orderId);
    }
    lastBlock = to;
  }
}

// ---- which positions are due right now -------------------------------------------------------------------------
async function check(m, fn, ids) {
  if (!ids.length) return [];
  if (multicallOk) {
    try {
      const res = await pub.multicall({ allowFailure: true, contracts: ids.map((id) => ({ address: m, abi: managerAbi, functionName: fn, args: [id] })) });
      // Every call failing means multicall itself is broken, not that nothing is due: never read that as "safe".
      if (res.every((r) => r.status === 'failure')) throw new Error('multicall failed');
      return ids.filter((_, i) => res[i].status === 'success' && res[i].result === true);
    } catch { multicallOk = false; log('multicall3 not usable, using single calls'); }
  }
  const out = [];
  for (let i = 0; i < ids.length; i += 25) {
    const part = ids.slice(i, i + 25);
    const r = await Promise.allSettled(part.map((id) => pub.readContract({ address: m, abi: managerAbi, functionName: fn, args: [id] })));
    if (r.every((x) => x.status === 'rejected')) throw new Error(`${fn}: RPC failed`);   // unknown is not "safe"
    r.forEach((x, k) => { if (x.status === 'fulfilled' && x.value) out.push(part[k]); });
  }
  return out;
}

// ---- send: wait for our rank, re-check, then one batch transaction ---------------------------------------------
async function settle(m, kind, ids) {
  const now = Date.now();
  const fn = kind === 'liq' ? 'liquidateBatch' : kind === 'lim' ? 'executeLimitBatch' : 'fillOrderBatch';
  const ready = ids.filter((id) => {
    const k = `${m}:${kind}:${id}`;
    if (!firstDue.has(k)) firstDue.set(k, { ms: now, block: stats.block });
    const sentAt = inFlight.get(k);
    return stats.block - firstDue.get(k).block >= BigInt(config.rank * config.rankBlocks) && !(sentAt && now - sentAt < 10_000);
  });
  for (let i = 0; i < ready.length; i += config.batch) {
    const part = ready.slice(i, i + config.batch);
    try {
      // Simulation = the re-check: if a faster keeper already settled them, done is 0 and we spend nothing.
      const { result, request } = await pub.simulateContract({ account, address: m, abi: managerAbi, functionName: fn, args: [part] });
      if (result === 0n) { stats.skipped += part.length; continue; }
      const hash = await wallet.writeContract(request);
      stats.sent++;
      for (const id of part) inFlight.set(`${m}:${kind}:${id}`, Date.now());
      pub.waitForTransactionReceipt({ hash, timeout: 30_000 }).then((rc) => {
        if (rc.status === 'success') {
          stats.landed++;
          for (const id of part) {
            const t0 = firstDue.get(`${m}:${kind}:${id}`);
            if (t0) stats.latencies.push(Date.now() - t0.ms);
          }
          if (stats.latencies.length > 500) stats.latencies.splice(0, stats.latencies.length - 500);
        } else stats.failed++;
      }).catch(() => { stats.failed++; });
      log(fn, `${part.length} ids`, hash);
    } catch (e) {
      stats.failed++;
      log(fn, 'failed:', e.shortMessage || e.message);
    }
  }
}

async function tick() {
  const head = await pub.getBlockNumber();
  stats.block = head;
  if (head > lastBlock) await indexTo(head);
  for (const m of config.managers) {
    const liq = await check(m, 'isLiquidatable', [...open.get(m)]);
    const lim = await check(m, 'isLimitReached', [...withLimit.get(m)].filter((id) => open.get(m).has(id)));
    const ord = await check(m, 'isOrderFillable', [...orders.get(m)]);
    // Forget positions that are no longer due (closed or price recovered).
    for (const k of [...firstDue.keys()]) {
      const [mm, kind, id] = k.split(':');
      if (mm === m && !(kind === 'liq' ? liq : kind === 'lim' ? lim : ord).some((x) => String(x) === id)) firstDue.delete(k);
    }
    await Promise.all([settle(m, 'liq', liq), settle(m, 'lim', lim), settle(m, 'ord', ord)]);
  }
}

// ---- gas balance: top up the poorest peer, sweep the excess to the treasury ------------------------------------
// Only the richest keeper acts (ties by address), so 50 keepers never all send at once. Uses the chain only.
async function balance() {
  const mine = await pub.getBalance({ address: me });
  stats.balance = mine;
  if (config.sweepTo && mine > config.cap) {
    const value = mine - config.target;
    const hash = await wallet.sendTransaction({ to: config.sweepTo, value });
    return log('swept', formatEther(value), 'ETH to treasury', hash);
  }
  if (!config.peers.length) return;
  const peers = await Promise.all(config.peers.filter((p) => p !== me).map(async (p) => ({ p, b: await pub.getBalance({ address: p }) })));
  const richest = [...peers, { p: me, b: mine }].sort((a, b) => (a.b === b.b ? (a.p < b.p ? -1 : 1) : a.b > b.b ? -1 : 1))[0];
  if (richest.p !== me || mine <= config.target * 2n) return;
  const poorest = peers.sort((a, b) => (a.b < b.b ? -1 : 1))[0];
  if (!poorest || poorest.b >= config.low) return;
  const need = config.target - poorest.b, spare = mine - config.target;
  const value = need < spare ? need : spare;
  const hash = await wallet.sendTransaction({ to: poorest.p, value });
  log('topped up', poorest.p, formatEther(value), 'ETH', hash);
}

// ---- validator rewards: USDC (gas + accuracy bonus) is credited in each manager; claim it to the treasury -------
// Claimed to SWEEP_TO (the Safe) when set, else to this wallet, once at least CLAIM_MIN (default $1) is waiting.
async function claimRewards() {
  for (const m of config.managers) {
    const owed = await pub.readContract({ address: m, abi: managerAbi, functionName: 'claimable', args: [me] });
    if (owed < config.claimMin) continue;
    const { request } = await pub.simulateContract({ account, address: m, abi: managerAbi, functionName: 'claimTo', args: [config.sweepTo ?? me] });
    const hash = await wallet.writeContract(request);
    log('claimed', String(owed), 'USD units from', m, hash);
  }
}

// ---- optional health report to api.backx.trade (signed, ed25519) ----------------------------------------------
const reportKey = config.reportKey ? createPrivateKey({ key: Buffer.from(config.reportKey, 'base64'), format: 'der', type: 'pkcs8' }) : null;
const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
async function report() {
  if (!config.reportUrl || !reportKey) return;
  const body = JSON.stringify({
    id: config.id, address: me, rank: config.rank, version: VERSION, chainId: config.chainId, ts: Date.now(),
    block: String(stats.block), balanceWei: String(stats.balance),
    open: [...open.values()].reduce((n, s) => n + s.size, 0), sent: stats.sent, landed: stats.landed, failed: stats.failed,
    skipped: stats.skipped, p50ms: pct(stats.latencies, 0.5), p95ms: pct(stats.latencies, 0.95), rpcErrors: stats.rpcErrors,
  });
  const sig = sign(null, Buffer.from(body), reportKey).toString('base64');
  try {
    await fetch(config.reportUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-keeper-id': config.id, 'x-keeper-sig': sig }, body, signal: AbortSignal.timeout(5000) });
  } catch { /* the report is optional: never let it affect keeping */ }
}

// ---- loops: each one survives errors on its own ----------------------------------------------------------------
async function loop(name, fn, everyMs) {
  for (;;) {
    const t = Date.now();
    try { await fn(); } catch (e) { stats.rpcErrors++; log(name, 'error:', e.shortMessage || e.message); }
    await new Promise((r) => setTimeout(r, Math.max(0, everyMs - (Date.now() - t))));
  }
}

// Multicall3 is not on every chain: check once, otherwise read positions one by one.
multicallOk = ((await pub.getCode({ address: MULTICALL3 }).catch(() => undefined)) ?? '0x') !== '0x';
log(`keeper ${VERSION} rank ${config.rank} wallet ${me} watching ${config.managers.length} manager(s) on ${config.rpcs.length} RPC(s), multicall3 ${multicallOk ? 'on' : 'off'}`);
loop('tick', tick, config.pollMs);
loop('balance', balance, 60_000);
loop('claim', claimRewards, 15 * 60_000);
loop('report', report, config.reportEveryMs);
// Weekly $GAZZ holder payout: checked hourly, the contract allows one round per 7 days.
if (config.holders) loop('holders', makeHolderJob({ pub, wallet, account, cfg: config.holders, log }), 60 * 60_000);
