import express from 'express';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { config } from './config.js';
import { CHAINS, SAFE } from './chains.js';
import { rpc } from './wallet.js';

// Keepers (owner 2026-10-23, docs/KEEPERS.md). Up to 64 keeper processes on several free hosts report their health
// here. The report is one-way and optional: keepers work from the chain alone and never need this API.
// Auth is per keeper: each one signs its report with its own ed25519 key; the public keys are in KEEPERS
// (Railway env, "id:gasAddress:reportPublicKeyBase64,..."). No browser, no session, no origin: not under /api.

const ROBINHOOD = 4663;
const keepers = new Map(config.keepers.map((k) => [k.id, { ...k, pub: createPublicKey({ key: Buffer.from(k.pub, 'base64'), format: 'der', type: 'spki' }) }]));

export const keeperReportRouter = express.Router();

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
  const clean = {
    id, rank: n(b.rank), version: String(b.version || '').slice(0, 16), block: String(b.block || '').slice(0, 20),
    balanceWei: /^\d{1,30}$/.test(b.balanceWei) ? b.balanceWei : null, open: n(b.open), sent: n(b.sent), landed: n(b.landed),
    failed: n(b.failed), skipped: n(b.skipped), p50ms: n(b.p50ms), p95ms: n(b.p95ms), rpcErrors: n(b.rpcErrors),
    address: String(b.address || '').toLowerCase() === k.address ? k.address : null, at: Date.now(),
  };
  await redis.set(`keeper:hb:${id}`, JSON.stringify(clean), 'EX', 7 * 86400);
  res.status(204).end();
});

// ---- admin views (mounted inside adminRouter: session + ADMIN_WALLETS already checked) -------------------------

const TARGET = 5_000_000_000_000_000n;    // 0.005 ETH per keeper, same default as the keeper's TARGET_WEI
const LOW = 1_500_000_000_000_000n;      // 0.0015 ETH, the keeper's LOW_WEI

async function balances(redis) {
  const cached = await redis.get('keeper:balances');
  if (cached) return JSON.parse(cached);
  const out = {};
  await Promise.all([...keepers.values()].map(async (k) => {
    try { out[k.id] = BigInt(await rpc(CHAINS[ROBINHOOD].rpc, 'eth_getBalance', [k.address, 'latest'])).toString(); } catch { out[k.id] = null; }
  }));
  await redis.set('keeper:balances', JSON.stringify(out), 'EX', 30);
  return out;
}

export function mountKeeperAdmin(adminRouter, audit) {
  adminRouter.get('/keepers', async (req, res) => {
    const redis = req.app.locals.redis;
    const [bal, hbs] = await Promise.all([balances(redis), Promise.all([...keepers.keys()].map((id) => redis.get(`keeper:hb:${id}`)))]);
    const now = Date.now();
    const rows = [...keepers.values()].map((k, i) => {
      const hb = hbs[i] ? JSON.parse(hbs[i]) : null;
      const age = hb ? now - hb.at : null;
      return {
        id: k.id, address: k.address, host: k.id.split('-')[0], balanceWei: bal[k.id], heartbeat: hb, ageMs: age,
        status: !hb ? 'never' : age < 3 * 60_000 ? 'up' : age < 15 * 60_000 ? 'late' : 'down',
      };
    });
    res.json({ keepers: rows, targetWei: TARGET.toString(), lowWei: LOW.toString(), safe: SAFE, chainId: ROBINHOOD });
  });

  // Safe Transaction Builder file: tops every keeper up to the target from the Safe. The Safe signs; the server
  // never holds money or keys. ETH is Robinhood Chain's gas token.
  adminRouter.post('/keepers/fund-file', async (req, res) => {
    const bal = await balances(req.app.locals.redis);
    const each = req.body?.mode === 'all' ? TARGET : null;
    const txs = [];
    for (const k of keepers.values()) {
      const b = bal[k.id] == null ? null : BigInt(bal[k.id]);
      const value = each ?? (b != null && b < TARGET ? TARGET - b : 0n);
      if (value > 0n) txs.push({ to: k.address, value: value.toString(), data: null, contractMethod: null, contractInputsValues: null });
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
