import express from 'express';
import { CHAINS, pad, padAddr } from './chains.js';
import { stakingConfig, STAKING_CHAIN, getCode, selector } from './deployments.js';

// Profile → Staking (owner 2026-10-26). Read-only: the signed-in user's own $GAZZ balance and Gazz Tanks on Robinhood
// Chain, plus what they have staked once BackxStaking is live. Nothing here signs or sends.
//   $GAZZ   0x08a5…85f3  ERC-20, 18 decimals (checked on-chain 2026-10-26)
//   Tanks   0x2613…a9f4  ERC-721, 1,000 tanks, art drawn on-chain (tokenURI = data: JSON with a data: SVG image),
//           not Enumerable, so which tanks a wallet holds comes from OpenSea (OPENSEA_API_KEY, later) or, without a
//           key, from one ownerOf scan of all tanks shared by every user and cached for 5 minutes.
export const GAZZ = '0x08a5d78a4bc7754e8aff87b4509e007baeb685f3';
export const TANKS = '0x261371a1c467b82d43975cbe526c901b2a5ea9f4';
const SEL = {
  balanceOf: selector('balanceOf(address)'), ownerOf: selector('ownerOf(uint256)'), tokenURI: selector('tokenURI(uint256)'),
  totalSupply: selector('totalSupply()'), gazzOf: selector('gazzOf(address)'), tankOwner: selector('tankOwner(uint256)'),
  unlockAt: selector('unlockAt(address)'), earned: selector('earned(address)'),
};
const ADDR = /^0x[0-9a-f]{40}$/;

/** Many eth_calls in small JSON-RPC batches (the public Robinhood RPC answers 429 to big or fast ones, so: 25 per
 *  batch, a short pause, and up to 4 retries with backoff). Failed calls (e.g. ownerOf of a burnt tank) return null. */
const BATCH = 25;
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function batchCall(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i += BATCH) {
    const part = calls.slice(i, i + BATCH);
    let js = null;
    for (let attempt = 0; attempt < 5 && !Array.isArray(js); attempt++) {
      if (attempt) await sleep(400 * 2 ** attempt);
      const r = await fetch(CHAINS[STAKING_CHAIN].rpc, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify(part.map((c, j) => ({ jsonrpc: '2.0', id: j, method: 'eth_call', params: [{ to: c.to, data: c.data }, 'latest'] }))),
      });
      js = await r.json().catch(() => null);
    }
    if (!Array.isArray(js)) throw new Error('rpc');
    if (i + BATCH < calls.length) await sleep(150);
    const byId = new Map(js.map((x) => [x.id, x]));
    for (let j = 0; j < part.length; j++) { const x = byId.get(j); out.push(x && !x.error && typeof x.result === 'string' ? x.result : null); }
  }
  return out;
}
const word = (hex, n = 0) => hex.slice(2 + n * 64, 2 + (n + 1) * 64);
const toAddr = (hex) => (hex && hex.length >= 66 ? '0x' + word(hex).slice(24) : null);
const toUint = (hex) => (hex && hex.length >= 66 ? BigInt('0x' + word(hex)) : 0n);
function toString(hex) {
  if (!hex || hex.length < 130) return null;
  const off = Number(BigInt('0x' + word(hex))) * 2, len = Number(BigInt('0x' + hex.slice(2 + off, 2 + off + 64)));
  return Buffer.from(hex.slice(2 + off + 64, 2 + off + 64 + len * 2), 'hex').toString('utf8');
}

/** Owner of every tank (index = id), one scan for all users. The public RPC needs ~1 minute for 1,000 ownerOf calls,
 *  so it runs in the background every 5 minutes (startTankScanner) and requests only read the last result. */
async function scanOwners(redis) {
  if (!(await redis.set('tanks:owners:lock', '1', 'EX', 240, 'NX'))) return; // another instance is scanning
  try {
    const [sup] = await batchCall([{ to: TANKS, data: SEL.totalSupply }]);
    const n = Math.min(Number(toUint(sup)) || 1000, 5000);
    const ids = Array.from({ length: n + 1 }, (_, i) => i); // ids may start at 0 or 1
    const res = await batchCall(ids.map((id) => ({ to: TANKS, data: SEL.ownerOf + pad(id) })));
    await redis.set('tanks:owners:v1', JSON.stringify(res.map((h) => toAddr(h))), 'EX', 3600);
  } finally { await redis.del('tanks:owners:lock'); }
}
const readOwners = async (redis) => JSON.parse((await redis.get('tanks:owners:v1')) || 'null');

/** Keeps the tank ownership scan fresh (only when no OpenSea key is set). Errors are retried on the next round. */
export function startTankScanner(redis) {
  if (process.env.OPENSEA_API_KEY?.trim()) return;
  const run = () => scanOwners(redis).catch(() => {});
  setTimeout(run, 5_000);
  setInterval(run, 5 * 60_000).unref();
}

/** Tank ids a wallet holds: OpenSea when OPENSEA_API_KEY is set, else the on-chain scan. */
async function tanksOf(redis, address) {
  const key = process.env.OPENSEA_API_KEY?.trim();
  if (key) {
    const ids = [];
    let next = '';
    for (let page = 0; page < 10; page++) {
      const u = `https://api.opensea.io/api/v2/chain/robinhood/account/${address}/nfts?collection=gazztanks&limit=200${next ? `&next=${encodeURIComponent(next)}` : ''}`;
      const r = await fetch(u, { headers: { 'X-API-KEY': key, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('opensea');
      const j = await r.json();
      for (const n of j.nfts ?? []) if (String(n.contract).toLowerCase() === TANKS && /^\d+$/.test(String(n.identifier))) ids.push(Number(n.identifier));
      if (!j.next) break;
      next = j.next;
    }
    return ids;
  }
  const owners = await readOwners(redis);
  return owners ? owners.flatMap((o, id) => (o === address ? [id] : [])) : null; // null: first scan still running
}

/** Name and on-chain image (data: SVG) per tank, cached a day each. */
async function tankMeta(redis, ids) {
  const keys = ids.map((id) => `tank:meta:v1:${id}`);
  const got = keys.length ? await redis.mget(keys) : [];
  const miss = ids.filter((_, i) => !got[i]);
  if (miss.length) {
    const uris = await batchCall(miss.map((id) => ({ to: TANKS, data: SEL.tokenURI + pad(id) })));
    const pipe = redis.multi();
    miss.forEach((id, i) => {
      let meta = { name: `GAZZ TANK #${id}`, image: null };
      try {
        const s = toString(uris[i]);
        if (s?.startsWith('data:application/json;base64,')) {
          const j = JSON.parse(Buffer.from(s.split(',', 2)[1], 'base64').toString('utf8'));
          const img = typeof j.image === 'string' && j.image.startsWith('data:image/svg+xml;base64,') && j.image.length < 200_000 ? j.image : null;
          meta = { name: typeof j.name === 'string' ? j.name.slice(0, 64) : meta.name, image: img };
        }
      } catch { /* keep the fallback */ }
      got[ids.indexOf(id)] = JSON.stringify(meta);
      pipe.set(`tank:meta:v1:${id}`, JSON.stringify(meta), 'EX', 86400);
    });
    await pipe.exec();
  }
  return ids.map((id, i) => ({ id, ...JSON.parse(got[i]) }));
}

export const stakeRouter = express.Router();

/** The signed-in user's $GAZZ and Tanks, in the wallet and staked. Session required; own address only. */
stakeRouter.get('/assets', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const { redis } = req.app.locals;
  const address = String(req.user.address).toLowerCase();
  if (!ADDR.test(address)) return res.status(400).json({ error: 'invalid' });
  const cacheKey = `stake:assets:v1:${address}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return res.type('json').send(cached);

    const staking = stakingConfig(STAKING_CHAIN);
    const live = staking?.address ? await getCode(STAKING_CHAIN, staking.address).catch(() => false) : false;
    const [bal, stakedGazz, unlock, earned] = await batchCall([
      { to: GAZZ, data: SEL.balanceOf + padAddr(address) },
      ...(live ? ['gazzOf', 'unlockAt', 'earned'].map((f) => ({ to: staking.address, data: SEL[f] + padAddr(address) })) : []),
    ]);
    const ownedOrNull = await tanksOf(redis, address);
    const owned = ownedOrNull ?? [];
    // Tanks in the staking contract: ask it whose they are.
    let staked = [];
    const owners = live ? await readOwners(redis) : null;
    if (live && owners) {
      const inPool = owners.flatMap((o, id) => (o === staking.address ? [id] : []));
      const who = await batchCall(inPool.map((id) => ({ to: staking.address, data: SEL.tankOwner + pad(id) })));
      staked = inPool.filter((_, i) => toAddr(who[i]) === address);
    }
    const meta = await tankMeta(redis, [...owned, ...staked].slice(0, 300));
    const body = JSON.stringify({
      gazz: { address: GAZZ, decimals: 18, wallet: (bal ? toUint(bal) : 0n).toString(), staked: (stakedGazz ? toUint(stakedGazz) : 0n).toString() },
      tanks: { address: TANKS, loading: ownedOrNull === null, owned: meta.filter((m) => owned.includes(m.id)), staked: meta.filter((m) => staked.includes(m.id)) },
      staking: live ? { address: staking.address, unlockAt: Number(toUint(unlock)), earned: toUint(earned).toString() } : null,
      lockDays: 90,
      source: process.env.OPENSEA_API_KEY ? 'opensea' : 'chain',
      updatedAt: new Date().toISOString(),
    });
    if (ownedOrNull !== null) await redis.set(cacheKey, body, 'EX', 60);
    res.type('json').send(body);
  } catch (e) {
    if (process.env.STAKE_DEBUG) console.error(e);
    res.status(502).json({ error: 'unavailable' });
  }
});
