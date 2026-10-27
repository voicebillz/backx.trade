import express from 'express';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { config } from './config.js';
import { CHAINS, SAFE } from './chains.js';
import { rpc } from './wallet.js';
import { db } from './db.js';

// Keepers (owner 2026-10-23, docs/KEEPERS.md). Up to 64 keeper processes on several free hosts report their health
// here. The report is one-way and optional: keepers work from the chain alone and never need this API.
// Auth is per keeper: each one signs its report with its own ed25519 key; the public keys are in KEEPERS
// (Railway env, "id:gasAddress:reportPublicKeyBase64,..."). No browser, no session, no origin: not under /api.

const ROBINHOOD = 4663;
const keepers = new Map(config.keepers.map((k) => [k.id, { ...k, pub: createPublicKey({ key: Buffer.from(k.pub, 'base64'), format: 'der', type: 'spki' }) }]));

export const keeperReportRouter = express.Router();

// Key rotation (owner 2026-10-27): validators change their gas key every 30 days on their own server. The current
// address lives in keeper_addresses (KEEPERS env holds the first one). A new address is accepted only after the
// gas handover from the current address to the new one is found on-chain, so a stolen report key alone can never
// point funding or peer top-ups somewhere else.
const ADDR = /^0x[0-9a-f]{40}$/, TX = /^0x[0-9a-f]{64}$/;
const chainOf = (id, fallback) => Number(/-(\d+)-\d+$/.exec(id)?.[1] ?? fallback ?? ROBINHOOD);
async function currentRows() {
  const { rows } = await db.query('select id, chain_id, address, since, previous, handover_tx from keeper_addresses');
  return new Map(rows.map((r) => [r.id, r]));
}
const currentOf = (k, rows) => rows.get(k.id)?.address ?? k.address;

/** True when `tx` is a successful transfer of gas from `from` to `to` on that chain. */
async function handoverOnChain(chainId, from, to, tx) {
  const url = CHAINS[chainId]?.rpc;
  if (!url) return false;
  const [t, rc] = await Promise.all([rpc(url, 'eth_getTransactionByHash', [tx]), rpc(url, 'eth_getTransactionReceipt', [tx])]);
  return !!t && !!rc && rc.status === '0x1' && String(t.from).toLowerCase() === from && String(t.to).toLowerCase() === to && BigInt(t.value) > 0n;
}

// Raw body: the signature covers the exact bytes. 8 KB is plenty for a report.
keeperReportRouter.post('/heartbeat', express.raw({ type: 'application/json', limit: '8kb' }), async (req, res) => {
  const redis = req.app.locals.redis;
  const id = String(req.get('x-keeper-id') || '');
  const k = keepers.get(id);
  // Rate limit before any crypto: 10/min per IP, fail closed if Redis is down.
  try {
    const key = `rl:keeper:${req.ip}:${Math.floor(Date.now() / 60000)}`;
    const [[, n]] = await redis.multi().incr(key).expire(key, 70).exec();
    if (n > 10 * Math.max(keepers.size, 1)) return res.status(429).json({ error: 'rate_limited' });
  } catch { return res.status(503).json({ error: 'unavailable' }); }
  if (!k || !Buffer.isBuffer(req.body)) return res.status(401).json({ error: 'unauthorized' });
  let sig;
  try { sig = Buffer.from(String(req.get('x-keeper-sig') || ''), 'base64'); } catch { return res.status(401).json({ error: 'unauthorized' }); }
  if (sig.length !== 64 || !verify(null, req.body, k.pub, sig)) return res.status(401).json({ error: 'unauthorized' });
  let b;
  try { b = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'bad_request' }); }
  if (b.id !== id || typeof b.ts !== 'number' || Math.abs(Date.now() - b.ts) > 60_000) return res.status(400).json({ error: 'stale' });
  // Replay guard: the same signed report is accepted once.
  const once = await redis.set(`keeper:seen:${createHash('sha256').update(sig).digest('hex')}`, '1', 'EX', 120, 'NX');
  if (once !== 'OK') return res.status(409).json({ error: 'replay' });
  const n = (v) => (Number.isFinite(v) ? v : null);
  let rows;
  try { rows = await currentRows(); } catch { return res.status(503).json({ error: 'unavailable' }); }
  let cur = currentOf(k, rows);
  const addr = String(b.address || '').toLowerCase();
  const rot = b.rotation;
  if (rot && ADDR.test(String(rot.from)) && ADDR.test(String(rot.to)) && TX.test(String(rot.tx)) && rot.to === addr && rot.from === cur && rot.to !== cur) {
    // One on-chain check per handover tx every 5 minutes at most.
    const first = await redis.set(`keeper:rotchk:${rot.tx}`, '1', 'EX', 300, 'NX');
    const chainId = chainOf(id, b.chainId);
    if (first === 'OK' && await handoverOnChain(chainId, rot.from, rot.to, rot.tx).catch(() => false)) {
      try {
        await db.query(
          `insert into keeper_addresses (id, chain_id, address, previous, handover_tx, since, updated_at) values ($1, $2, $3, $4, $5, now(), now())
           on conflict (id) do update set chain_id = $2, address = $3, previous = $4, handover_tx = $5, since = now(), updated_at = now()`,
          [id, chainId, rot.to, rot.from, rot.tx]);
        cur = rot.to;
      } catch { await redis.del(`keeper:rotchk:${rot.tx}`); }   // try again on the next report
    }
  }
  const clean = {
    id, rank: n(b.rank), version: String(b.version || '').slice(0, 16), block: String(b.block || '').slice(0, 20),
    balanceWei: /^\d{1,30}$/.test(b.balanceWei) ? b.balanceWei : null, open: n(b.open), sent: n(b.sent), landed: n(b.landed),
    failed: n(b.failed), skipped: n(b.skipped), p50ms: n(b.p50ms), p95ms: n(b.p95ms), rpcErrors: n(b.rpcErrors),
    address: addr === cur ? cur : null, rotating: ADDR.test(addr) && addr !== cur ? addr : null, at: Date.now(),
  };
  await redis.set(`keeper:hb:${id}`, JSON.stringify(clean), 'EX', 7 * 86400);
  // Reply: the current gas addresses of the other validators on this chain, for gas top-ups among themselves.
  const chainId = chainOf(id, b.chainId);
  const peers = [...keepers.values()].filter((p) => p.id !== id && chainOf(p.id, rows.get(p.id)?.chain_id) === chainId).map((p) => currentOf(p, rows));
  res.json({ peers });
});

// ---- admin views (mounted inside adminRouter: session + ADMIN_WALLETS already checked) -------------------------

const TARGET = 5_000_000_000_000_000n;    // 0.005 ETH per keeper, same default as the keeper's TARGET_WEI
const LOW = 1_500_000_000_000_000n;      // 0.0015 ETH, the keeper's LOW_WEI

async function balances(redis, rows) {
  const cached = await redis.get('keeper:balances');
  if (cached) return JSON.parse(cached);
  const out = {};
  await Promise.all([...keepers.values()].map(async (k) => {
    const url = CHAINS[chainOf(k.id, rows.get(k.id)?.chain_id)]?.rpc ?? CHAINS[ROBINHOOD].rpc;
    try { out[k.id] = BigInt(await rpc(url, 'eth_getBalance', [currentOf(k, rows), 'latest'])).toString(); } catch { out[k.id] = null; }
  }));
  await redis.set('keeper:balances', JSON.stringify(out), 'EX', 30);
  return out;
}

export function mountKeeperAdmin(adminRouter, audit) {
  adminRouter.get('/keepers', async (req, res) => {
    const redis = req.app.locals.redis;
    const cur = await currentRows();
    const [bal, hbs] = await Promise.all([balances(redis, cur), Promise.all([...keepers.keys()].map((id) => redis.get(`keeper:hb:${id}`)))]);
    const now = Date.now();
    const rows = [...keepers.values()].map((k, i) => {
      const hb = hbs[i] ? JSON.parse(hbs[i]) : null;
      const age = hb ? now - hb.at : null;
      return {
        id: k.id, address: currentOf(k, cur), host: k.id.split('-')[0], chainId: chainOf(k.id, cur.get(k.id)?.chain_id),
        since: cur.get(k.id)?.since ?? null, previous: cur.get(k.id)?.previous ?? null, handoverTx: cur.get(k.id)?.handover_tx ?? null,
        balanceWei: bal[k.id], heartbeat: hb, ageMs: age,
        status: !hb ? 'never' : age < 3 * 60_000 ? 'up' : age < 15 * 60_000 ? 'late' : 'down',
      };
    });
    res.json({ keepers: rows, targetWei: TARGET.toString(), lowWei: LOW.toString(), safe: SAFE, chainId: ROBINHOOD });
  });

  // Safe Transaction Builder file: tops every keeper up to the target from the Safe. The Safe signs; the server
  // never holds money or keys. ETH is Robinhood Chain's gas token.
  adminRouter.post('/keepers/fund-file', async (req, res) => {
    const rows = await currentRows();
    const bal = await balances(req.app.locals.redis, rows);
    const each = req.body?.mode === 'all' ? TARGET : null;
    const txs = [];
    // Robinhood Chain validators only (this file is for that chain's Safe), at their current (rotated) address.
    for (const k of [...keepers.values()].filter((x) => chainOf(x.id, rows.get(x.id)?.chain_id) === ROBINHOOD)) {
      const b = bal[k.id] == null ? null : BigInt(bal[k.id]);
      const value = each ?? (b != null && b < TARGET ? TARGET - b : 0n);
      if (value > 0n) txs.push({ to: currentOf(k, rows), value: value.toString(), data: null, contractMethod: null, contractInputsValues: null });
    }
    if (!txs.length) return res.status(409).json({ error: 'nothing_to_fund' });
    const total = txs.reduce((s, t) => s + BigInt(t.value), 0n);
    await audit(req, 'keepers.fund_file', String(ROBINHOOD), { keepers: txs.length, totalWei: total.toString() });
    res.json({
      version: '1.0', chainId: String(ROBINHOOD), createdAt: Date.now(),
      meta: { name: `backx: fund ${txs.length} keeper(s)`, description: `Tops keepers up to ${Number(TARGET) / 1e18} ETH. Total ${Number(total) / 1e18} ETH.`, createdFromSafeAddress: SAFE },
      transactions: txs,
    });
  });
}
