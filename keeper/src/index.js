// BackX keeper (docs/KEEPERS.md, docs/backx/LIVENESS.md). Watches the Position Managers straight from the chain,
// liquidates and fills take-profits in batches, keeps the keeper gas wallets balanced among themselves, and
// optionally reports its health to api.backx.trade. It never needs BackX servers to do its job.
import { createPublicClient, createWalletClient, defineChain, fallback, http, webSocket, formatEther } from 'viem';
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import { createPrivateKey, sign } from 'node:crypto';
import { config } from './config.js';
import { managerAbi } from './abi.js';
import { makeRevenueShareJob } from './revenueShare.js';
import { makeKeyStore } from './keystore.js';

const VERSION = '0.2.0';
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const chain = defineChain({
  id: config.chainId, name: `chain-${config.chainId}`, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: config.rpcs.filter((u) => u.startsWith('https')) } },
  contracts: { multicall3: { address: MULTICALL3 } },
});
// Several RPC providers in order; a failing one is skipped automatically.
const transport = fallback(config.rpcs.map((u) => (u.startsWith('wss') ? webSocket(u) : http(u, { timeout: 4000 }))));
const pub = createPublicClient({ chain, transport, pollingInterval: config.pollMs });
const log = (...a) => console.log(new Date().toISOString(), config.id, ...a);

// ---- gas key: from KEEPER_KEY, or from the rotation store once this validator has rotated (see rotation below) --
let store = config.keyDir ? makeKeyStore({ dir: config.keyDir, secret: config.keySecret, id: config.id }) : null;
let keys = null;                       // { active: { key, since }, previous: { key, address, retiredAt, tx } | null }
try { keys = store?.load() ?? null; }
catch {
  // Sealed with another KEY_SECRET (setup.js was run again): keep the file untouched and validate with KEEPER_KEY.
  log(`key file ${store.file} does not open with this KEY_SECRET: rotation off. Put the old KEEPER_SET back to use it.`);
  store = null;
}
if (store && !keys) {
  // First start with rotation: the disk must take the key, else keep validating without rotating (never stop).
  try { keys = { active: { key: config.key, since: Date.now() }, previous: null }; store.save(keys); }
  catch (e) { log('KEY_DIR not writable, rotation off:', e.message); store = null; keys = null; }
}
if (keys && keys.active.key !== config.key && keys.previous?.key !== config.key) log('note: KEEPER_KEY is older than the rotated key on disk; using the key on disk');
let account, wallet, me;
const useKey = (k) => { account = privateKeyToAccount(k); wallet = createWalletClient({ chain, transport, account }); me = account.address.toLowerCase(); };
useKey(keys?.active.key ?? config.key);
let rotating = false;                  // while true no other loop sends, so nonces never collide

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
      // Take-profit or stop-loss: watched until the position closes (isLimitReached checks both on-chain).
      else if (l.eventName === 'LimitSet' || l.eventName === 'StopSet') { if ((l.args.limitValue ?? l.args.stopValue) > 0n) withLimit.get(m)?.add(id); }
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
  if (rotating) return;
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
  if (rotating) return;
  const mine = await pub.getBalance({ address: me });
  stats.balance = mine;
  if (config.sweepTo && mine > config.cap) {
    const value = mine - config.target;
    const hash = await wallet.sendTransaction({ to: config.sweepTo, value });
    return log('swept', formatEther(value), 'ETH to treasury', hash);
  }
  // Peers: the current addresses from the last report reply (they change on rotation); PEERS only without rotation,
  // since a fixed list would top up retired keys.
  const list = peerList && Date.now() - peerList.at < 15 * 60_000 ? peerList.peers : store ? [] : config.peers;
  if (!list.length) return;
  const peers = await Promise.all(list.filter((p) => p !== me).map(async (p) => ({ p, b: await pub.getBalance({ address: p }) })));
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
  if (rotating) return;
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
    // The last key change: the API accepts the new address only after it finds this gas transfer from the old
    // address to the new one on-chain, so a stolen report key alone cannot redirect anything.
    rotation: keys?.previous?.tx ? { from: keys.previous.address, to: me, tx: keys.previous.tx, at: keys.active.since } : null,
  });
  const sig = sign(null, Buffer.from(body), reportKey).toString('base64');
  try {
    const r = await fetch(config.reportUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-keeper-id': config.id, 'x-keeper-sig': sig }, body, signal: AbortSignal.timeout(5000) });
    const j = r.status === 200 ? await r.json() : null;
    if (Array.isArray(j?.peers)) peerList = { at: Date.now(), peers: j.peers.filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a)).map((a) => a.toLowerCase()) };
  } catch { /* the report is optional: never let it affect keeping */ }
}

// ---- key rotation (owner 2026-10-27, docs/KEEPERS.md "Key rotation") --------------------------------------------
// Every ROTATE_DAYS this server makes a new gas key, saves it (encrypted, read back) BEFORE any money moves, then the
// old key claims its validator rewards (to SWEEP_TO, else the new key) and sends its gas to the new key. The old
// key stays as "previous" (the last batch) and forwards anything that still arrives until the next rotation.
let peerList = null;   // { at, peers } from the last report reply
const DUST = 30_000_000_000_000n;   // 0.00003 ETH left behind: OP-stack chains add an L1 fee estimateGas does not show

/** Moves what `fromKey` holds to `to`: rewards via claimTo, then all gas but a small reserve. Returns the gas tx. */
async function sweepKey(fromKey, to, minClaim) {
  const acct = privateKeyToAccount(fromKey);
  const w = createWalletClient({ chain, transport, account: acct });
  for (const m of config.managers) {
    const owed = await pub.readContract({ address: m, abi: managerAbi, functionName: 'claimable', args: [acct.address] });
    if (owed === 0n || owed < minClaim) continue;
    const { request } = await pub.simulateContract({ account: acct, address: m, abi: managerAbi, functionName: 'claimTo', args: [config.sweepTo ?? to] });
    const hash = await w.writeContract(request);
    await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
    log('handover claim', String(owed), 'from', m, hash);
  }
  const [bal, fees] = await Promise.all([pub.getBalance({ address: acct.address }), pub.estimateFeesPerGas()]);
  const reserve = 21_000n * (fees.maxFeePerGas ?? fees.gasPrice ?? 0n) * 3n + DUST;
  if (bal <= reserve * 2n) return null;
  const hash = await w.sendTransaction({ to, value: bal - reserve });
  const rc = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (rc.status !== 'success') throw new Error(`gas handover failed ${hash}`);
  log('handover gas', formatEther(bal - reserve), 'ETH', acct.address.toLowerCase(), '→', to, hash);
  return hash;
}

async function rotation() {
  if (!store) return;
  // The last batch: forward late rewards and any gas that still reaches the previous key.
  if (keys.previous) {
    const tx = await sweepKey(keys.previous.key, me, config.claimMin);
    if (tx && !keys.previous.tx) { keys.previous.tx = tx; store.save(keys); }   // a handover that was cut short
  }
  if (Date.now() - keys.active.since < config.rotateDays * 86_400_000) return;
  // The handover itself needs gas: with too little, wait for a top-up instead of stranding a key.
  const [bal, fees] = await Promise.all([pub.getBalance({ address: me }), pub.estimateFeesPerGas()]);
  if (bal <= (21_000n * (fees.maxFeePerGas ?? fees.gasPrice ?? 0n) * 3n + DUST) * 2n) return log('rotation due, waiting for gas');
  rotating = true;
  await new Promise((r) => setTimeout(r, 3000));   // let a send already under way finish first
  try {
    const oldKey = keys.active.key, oldAddr = me;
    const next = generatePrivateKey(), nextAddr = privateKeyToAddress(next).toLowerCase();
    // 1. The new key is on disk (encrypted, read back) before anything is sent to it.
    keys = { active: { key: next, since: Date.now() }, previous: { key: oldKey, address: oldAddr, retiredAt: Date.now(), tx: null } };
    store.save(keys);
    log('rotating', oldAddr, '→', nextAddr);
    // 2. Rewards and gas from the old key to the new one; 3. switch, the gas tx is the proof the API checks.
    const tx = await sweepKey(oldKey, nextAddr, 0n);
    keys.previous.tx = tx;
    store.save(keys);
    log('rotated');
  } finally {
    // Always act with the key on disk: if the handover broke off, the hourly pass above finishes it from the
    // previous key (and records its gas tx as the proof).
    useKey(keys.active.key);
    peerList = null;
    rotating = false;
  }
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
log(`keeper ${VERSION} rank ${config.rank} wallet ${me}${store ? ` rotates every ${config.rotateDays} d` : ''} watching ${config.managers.length} manager(s) on ${config.rpcs.length} RPC(s), multicall3 ${multicallOk ? 'on' : 'off'}`);
loop('tick', tick, config.pollMs);
loop('balance', balance, 60_000);
loop('claim', claimRewards, 15 * 60_000);
loop('report', report, config.reportEveryMs);
if (store) loop('rotation', rotation, 60 * 60_000);
// Staking payout: Treasury.distribute (which starts the stakers' 24 h stream) every hour.
if (config.treasury) loop('revenue-share', makeRevenueShareJob({ pub, wallet, account, cfg: config.treasury, log }), 60 * 60_000);
