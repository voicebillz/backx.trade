import express from 'express';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { SignJWT } from 'jose';
import { config } from './config.js';
import { db } from './db.js';
import { privyAccount } from './auth.js';
import { CHAINS, LAUNCH_CHAIN_IDS, ethCall, decodeUint, pad, padAddr } from './chains.js';
import { factoryAddress, stakingConfig, selector } from './deployments.js';

// MCP link (owner 2026-10-26, docs/backx/MCP-PLAN.md). mcp.backx.trade runs in its own Railway project with no
// database and no Privy secret. It learns who a user is ONLY from a short consent grant this API signs after a normal
// BackX login, and it may ask one thing back over a signed internal call: "may this account still connect, and what
// is its wallet?". Only accounts that log in with a social method may connect (owner 2026-10-26); accounts that
// log in with their own external wallet use the plain on-chain path (/skill.md) instead.

export const SCOPES = ['account:read', 'trade:prepare', 'issue:prepare', 'stake:prepare', 'claim:prepare'];

let signer = null; // { key, spki }
/** This API's grant key: made once, kept in Postgres (private network only), never printed or sent anywhere. */
export async function loadGrantKey() {
  let { rows } = await db.query(`select pem from server_keys where name = 'mcp-grant'`);
  if (!rows[0]) {
    const pem = generateKeyPairSync('ed25519').privateKey.export({ format: 'pem', type: 'pkcs8' });
    await db.query(`insert into server_keys (name, pem) values ('mcp-grant', $1) on conflict (name) do nothing`, [pem]);
    ({ rows } = await db.query(`select pem from server_keys where name = 'mcp-grant'`));
  }
  const key = createPrivateKey(rows[0].pem);
  signer = { key, spki: createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64') };
}

/** Social login + embedded wallet = may connect. The method is Privy's most recently verified login. */
async function eligibility(did) {
  const { address, method } = await privyAccount(did);
  if (!address) return { eligible: false, reason: 'no_embedded_wallet' };
  if (!method || method === 'wallet') return { eligible: false, reason: 'external_wallet_login', method };
  return { eligible: true, wallet: address, method };
}

// ---- public, outside /api: the grant key's public half (mcp.backx.trade pins it as API_GRANT_PUBLIC_KEY) ----------
export const mcpPublicRouter = express.Router();
mcpPublicRouter.get('/grant-key', (_req, res) => res.json({ alg: 'ed25519', spki: signer?.spki ?? null }));

// ---- /api/mcp: the consent page on app.backx.trade (session + origin guard + own rate limit) ---------------------
export const mcpRouter = express.Router();
mcpRouter.use(async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const key = `rl:mcp:${req.user.did}:${Math.floor(Date.now() / 60000)}`;
    const [[, n]] = await req.app.locals.redis.multi().incr(key).expire(key, 70).exec();
    if (n > 20) return res.status(429).json({ error: 'rate_limited' });
  } catch { return res.status(503).json({ error: 'unavailable' }); }
  if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'json_only' });
  next();
});

mcpRouter.get('/me', async (req, res, next) => {
  try {
    const e = await eligibility(req.user.did);
    const [{ rows }, { rows: d }] = await Promise.all([
      db.query('select client, scopes, created_at from mcp_consents where privy_did = $1 order by id desc limit 20', [req.user.did]),
      db.query('select at from mcp_disconnects where privy_did = $1', [req.user.did]),
    ]);
    const cut = d[0]?.at ?? null;
    res.json({
      eligible: e.eligible, reason: e.reason ?? null, mcpUrl: config.mcpUrl, disconnectedAt: cut,
      // A connection approved after the last "Disconnect all" is active; older ones were cut off.
      connections: rows.map((r) => ({ ...r, active: !cut || r.created_at > cut })),
    });
  } catch (e) { next(e); }
});

/** The user approved: sign a 2-minute grant for that one request and send the browser back to mcp.backx.trade. */
mcpRouter.post('/consent', async (req, res, next) => {
  try {
    const { request, scopes, client } = req.body ?? {};
    if (typeof request !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(request)) return res.status(400).json({ error: 'bad_request' });
    if (!Array.isArray(scopes) || !scopes.length || scopes.length > SCOPES.length || !scopes.every((s) => SCOPES.includes(s))) return res.status(400).json({ error: 'bad_scopes' });
    if (!signer) return res.status(503).json({ error: 'unavailable' });
    const e = await eligibility(req.user.did);
    if (!e.eligible) return res.status(403).json({ error: e.reason });
    if (e.wallet !== req.user.address) return res.status(409).json({ error: 'wallet_mismatch' });
    const grant = await new SignJWT({ wallet: e.wallet, req: request, scope: [...new Set(scopes)] })
      .setProtectedHeader({ alg: 'EdDSA' }).setIssuer(config.apiPublicUrl)
      .setAudience(config.mcpUrl).setSubject(req.user.did).setJti(randomUUID()).setIssuedAt().setExpirationTime('2m')
      .sign(signer.key);
    await db.query('delete from mcp_disconnects where privy_did = $1', [req.user.did]);
    await db.query('insert into mcp_consents (privy_did, client, scopes) values ($1, $2, $3)',
      [req.user.did, String(client ?? '').slice(0, 80), [...new Set(scopes)]]);
    const to = new URL(`${config.mcpUrl}/oauth/callback`);
    to.searchParams.set('request', request);
    to.searchParams.set('grant', grant);
    res.json({ redirect: to.toString() });
  } catch (e) { next(e); }
});

/** Disconnect every assistant: from the next token refresh (≤ 15 min) mcp.backx.trade gets "not eligible". */
mcpRouter.post('/disconnect', async (req, res, next) => {
  try {
    await db.query('insert into mcp_disconnects (privy_did) values ($1) on conflict (privy_did) do update set at = now()', [req.user.did]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- /internal/mcp: signed machine calls from mcp.backx.trade only (no browser, no session, outside /api) --------
const mcpKey = config.mcpPublicKey ? createPublicKey({ key: Buffer.from(config.mcpPublicKey, 'base64'), format: 'der', type: 'spki' }) : null;
export const mcpInternalRouter = express.Router();
mcpInternalRouter.post('/:op', express.raw({ type: 'application/json', limit: '4kb' }), async (req, res, next) => {
  if (!mcpKey) return res.status(404).json({ error: 'not_found' });
  const redis = req.app.locals.redis;
  try {
    const key = `rl:mcpint:${Math.floor(Date.now() / 60000)}`;
    const [[, n]] = await redis.multi().incr(key).expire(key, 70).exec();
    if (n > 600) return res.status(429).json({ error: 'rate_limited' });
  } catch { return res.status(503).json({ error: 'unavailable' }); }
  let sig;
  try { sig = Buffer.from(String(req.get('x-mcp-sig') || ''), 'base64'); } catch { return res.status(401).json({ error: 'unauthorized' }); }
  if (!Buffer.isBuffer(req.body) || sig.length !== 64 || !verify(null, req.body, mcpKey, sig)) return res.status(401).json({ error: 'unauthorized' });
  let b;
  try { b = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'bad_request' }); }
  if (b.op !== req.params.op || typeof b.ts !== 'number' || Math.abs(Date.now() - b.ts) > 60_000 || !/^[0-9a-f]{32}$/.test(b.nonce || '')) {
    return res.status(400).json({ error: 'stale' });
  }
  if ((await redis.set(`mcpint:seen:${createHash('sha256').update(sig).digest('hex')}`, '1', 'EX', 120, 'NX')) !== 'OK') return res.status(409).json({ error: 'replay' });
  try {
    if (b.op === 'account') {
      if (typeof b.sub !== 'string' || !/^did:privy:[A-Za-z0-9]{10,64}$/.test(b.sub)) return res.status(400).json({ error: 'bad_request' });
      const { rows } = await db.query(
        `select u.wallet_address, d.privy_did as disconnected from users u left join mcp_disconnects d on d.privy_did = u.privy_did where u.privy_did = $1`, [b.sub]);
      if (!rows[0] || rows[0].disconnected) return res.json({ eligible: false });
      const e = await eligibility(b.sub);
      return res.json(e.eligible ? { eligible: true, wallet: e.wallet } : { eligible: false });
    }
    return res.status(404).json({ error: 'not_found' });
  } catch (e) { next(e); }
});

// ---- Independent check of a prepared bundle before the user signs it on app.backx.trade/sign -------------------
// The MCP server is a separate system; the sign page asks THIS API whether every step only calls BackX contracts,
// with an allowed function, paying back to the user's own wallet. A compromised MCP server can therefore not get a
// user to sign a transfer or an approval to a stranger: the page refuses to sign anything this check rejects.

const fn = (sig) => selector(sig).slice(2);
const SEL = {
  approve: fn('approve(address,uint256)'), setApprovalForAll: fn('setApprovalForAll(address,bool)'),
  open: fn('open(uint256,uint8,uint256,uint256)'), close: fn('close(uint256,uint256)'), setLimit: fn('setLimit(uint256,uint256)'),
  setStop: fn('setStop(uint256,uint256)'), placeOrder: fn('placeOrder(uint8,uint256,uint256,bool,uint40,uint256,uint16)'), cancelOrder: fn('cancelOrder(uint256)'),
  deposit: fn('deposit(uint256,address)'), withdraw: fn('withdraw(uint256,address,address)'), requestRedeem: fn('requestRedeem(uint256)'),
  cancelRequest: fn('cancelRequest(uint256)'), claimRewards: fn('claimRewards()'), claimRewardsFor: fn('claimRewardsFor(address)'),
  stake: fn('stake(uint256,uint256[])'), unstake: fn('unstake(uint256,uint256[])'), claim: fn('claim()'), claimFor: fn('claimFor(address)'),
  aggregate3: fn('aggregate3((address,bool,bytes)[])'),
  marketCount: selector('marketCount()'), tokens: selector('tokens(uint256)'), setOf: selector('setOf(address)'),
};
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11';
const GAZZ_TOKEN = '0x08a5d78a4bc7754e8aff87b4509e007baeb685f3';
const word = (hex, i) => hex.slice(i * 64, (i + 1) * 64);
const addrAt = (hex, i) => '0x' + word(hex, i).slice(24);
const uintAt = (hex, i) => BigInt('0x' + (word(hex, i) || '0'));

/** Every BackX contract on a chain, by role, read from the chain (cached 5 minutes). */
async function knownContracts(redis, chainId) {
  const cacheKey = `mcp:known:${chainId}`;
  const hit = await redis.get(cacheKey);
  if (hit) return JSON.parse(hit);
  const k = { managers: [], vaults: [], tokens: [], staking: null, tanks: null };
  const chain = CHAINS[chainId];
  if (chain?.stable) k.tokens.push(chain.stable.address.toLowerCase());
  const f = await factoryAddress(chainId).catch(() => null);
  if (f) {
    const n = Number(decodeUint(await ethCall(chainId, f, SEL.marketCount)));
    for (let i = 0; i < Math.min(n, 500); i++) {
      const token = addrAt((await ethCall(chainId, f, SEL.tokens + pad(i))).slice(2), 0);
      const set = (await ethCall(chainId, f, SEL.setOf + padAddr(token))).slice(2);
      const [hedge, usdVault, , short, tokenVault] = [0, 1, 2, 3, 4].map((j) => addrAt(set, j));
      k.tokens.push(token);
      k.managers.push(hedge, short);
      k.vaults.push(usdVault, tokenVault);
    }
  }
  const sc = stakingConfig(chainId);
  if (sc?.address) { k.staking = sc.address; k.tanks = sc.tanks; k.tokens.push(GAZZ_TOKEN); }
  const zero = '0x' + '0'.repeat(40);
  for (const key of ['managers', 'vaults', 'tokens']) k[key] = [...new Set(k[key].filter((a) => a && a !== zero))];
  await redis.set(cacheKey, JSON.stringify(k), 'EX', 300);
  return k;
}

export function checkCall(k, wallet, to, data, inMulticall = false) {
  const sel = data.slice(2, 10), args = data.slice(10);
  const spenders = [...k.managers, ...k.vaults, ...(k.staking ? [k.staking] : [])];
  if (inMulticall) {
    if (k.vaults.includes(to) && sel === SEL.claimRewardsFor && addrAt(args, 0) === wallet) return null;
    if (to === k.staking && sel === SEL.claimFor && addrAt(args, 0) === wallet) return null;
    return 'Batched calls may only claim rewards to your own wallet.';
  }
  if (k.tokens.includes(to)) return sel === SEL.approve && spenders.includes(addrAt(args, 0)) ? null : 'Only approvals to BackX contracts are allowed on a token.';
  if (to === k.tanks) return sel === SEL.setApprovalForAll && addrAt(args, 0) === k.staking && uintAt(args, 1) === 1n ? null : 'Tanks may only be approved for BackX staking.';
  if (k.managers.includes(to)) return [SEL.open, SEL.close, SEL.setLimit, SEL.setStop, SEL.placeOrder, SEL.cancelOrder].includes(sel) ? null : 'Function not allowed on a market.';
  if (k.vaults.includes(to)) {
    if (sel === SEL.deposit) return addrAt(args, 1) === wallet ? null : 'Shares must go to your own wallet.';
    if (sel === SEL.withdraw) return addrAt(args, 1) === wallet && addrAt(args, 2) === wallet ? null : 'Withdrawals must go to your own wallet.';
    if (sel === SEL.claimRewardsFor) return addrAt(args, 0) === wallet ? null : 'Rewards must go to your own wallet.';
    return [SEL.requestRedeem, SEL.cancelRequest, SEL.claimRewards].includes(sel) ? null : 'Function not allowed on a reserve.';
  }
  if (to === k.staking) {
    if (sel === SEL.claimFor) return addrAt(args, 0) === wallet ? null : 'Rewards must go to your own wallet.';
    return [SEL.stake, SEL.unstake, SEL.claim].includes(sel) ? null : 'Function not allowed on staking.';
  }
  if (to === MULTICALL3 && sel === SEL.aggregate3) {
    // aggregate3((address,bool,bytes)[]): head = offset of the array; at it the length, then one offset per element
    // (relative to the first offset word); each element = target, allowFailure, offset of bytes (relative to the
    // element), and at that the bytes length and data. All offsets in bytes.
    const arr = Number(uintAt(args, 0)) * 2;
    const n = Number(BigInt('0x' + args.slice(arr, arr + 64)));
    if (n < 1 || n > 100) return 'Bad batch.';
    const content = arr + 64;
    for (let i = 0; i < n; i++) {
      const el = args.slice(content + Number(BigInt('0x' + args.slice(content + i * 64, content + (i + 1) * 64))) * 2);
      const target = addrAt(el, 0);
      const bOff = Number(uintAt(el, 2)) * 2;
      const len = Number(BigInt('0x' + el.slice(bOff, bOff + 64)));
      const why = checkCall(k, wallet, target, '0x' + el.slice(bOff + 64, bOff + 64 + len * 2), true);
      if (why) return why;
    }
    return null;
  }
  return 'Not a BackX contract.';
}

mcpRouter.post('/verify', async (req, res, next) => {
  try {
    const { chainId, steps } = req.body ?? {};
    if (!LAUNCH_CHAIN_IDS.includes(chainId)) return res.status(400).json({ error: 'bad_chain' });
    if (!Array.isArray(steps) || !steps.length || steps.length > 10) return res.status(400).json({ error: 'bad_request' });
    const k = await knownContracts(req.app.locals.redis, chainId);
    const problems = [];
    steps.forEach((s, i) => {
      const to = String(s?.to || '').toLowerCase(), data = String(s?.data || '').toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(to) || !/^0x([0-9a-f]{2}){4,20000}$/.test(data) || (s.value && s.value !== '0')) { problems.push({ step: i, why: 'Malformed step.' }); return; }
      let why;
      try { why = checkCall(k, req.user.address, to, data); } catch { why = 'Malformed step.'; }
      if (why) problems.push({ step: i, why });
    });
    res.json({ ok: problems.length === 0, problems });
  } catch (e) { next(e); }
});
