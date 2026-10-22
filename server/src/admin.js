import express from 'express';
import { db } from './db.js';
import { config } from './config.js';
import { listingReport, RULES, TIERS } from './listing.js';
import { CHAINS, SAFE, ethCall, decodeString, decodeUint, decodeAddresses, pad, padAddr } from './chains.js';
import { IMPLS, MAX_RUNTIME, ARTIFACTS_COMMIT, CREATE2_DEPLOYER, chainStatus, factoryAddress, factoryInitcode, create2Address, safeBatch } from './deployments.js';

// Admin portal API (owner 2026-10-19). Every route: verified session + wallet in ADMIN_WALLETS, else 404 so the
// portal's existence is not revealed. Own rate limit, strict validation, every write logged in admin_audit.
// CSRF: the global Origin guard + SameSite=Lax cookie, and writes only accept JSON bodies.
export const adminRouter = express.Router();

const CHAIN_IDS = new Set(Object.keys(CHAINS).map(Number));
const MAX_M = 20;              // contract caps per market are set by the Safe; the portal never goes above 20×
const POOL_FEES = new Set([1, 5, 25, 30, 100]); // bps: 0.01 / 0.05 / 0.25 / 0.3 / 1 %
// Same hosts as img-src in web/vercel.json: a logo from anywhere else would not load.
const LOGO_HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com', 'backx.trade']);

adminRouter.use(async (req, res, next) => {
  if (!req.user || !config.adminWallets.has(req.user.address)) return res.status(404).json({ error: 'not_found' });
  try {
    const key = `rl:admin:${req.user.address}:${Math.floor(Date.now() / 60000)}`;
    const [[, n]] = await req.app.locals.redis.multi().incr(key).expire(key, 70).exec();
    if (n > (req.method === 'GET' ? 120 : 30)) return res.status(429).json({ error: 'rate_limited' });
  } catch {
    return res.status(503).json({ error: 'unavailable' });
  }
  if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'json_only' });
  next();
});

const audit = (req, action, target, detail) =>
  db.query('insert into admin_audit (admin, action, target, detail) values ($1, $2, $3, $4)',
    [req.user.address, action, target, detail ? JSON.stringify(detail) : null]);

// ---- validation -------------------------------------------------------------------------------

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const text = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f<>]/.test(v);

/** Returns { asset } or { errors: { field: message } }. Never trusts types from the client. */
function validateAsset(b) {
  const e = {};
  const a = {};
  a.chain_id = b.chainId;
  if (!CHAIN_IDS.has(a.chain_id)) e.chainId = 'Pick a supported chain';
  a.symbol = typeof b.symbol === 'string' ? b.symbol.trim().toUpperCase() : '';
  if (!/^[A-Z0-9$._-]{1,16}$/.test(a.symbol)) e.symbol = '1–16 letters, digits or $ . _ -';
  a.name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!a.name || !text(a.name, 64)) e.name = '1–64 characters';
  a.token_address = typeof b.tokenAddress === 'string' ? b.tokenAddress.trim() : '';
  if (!ADDR.test(a.token_address) || /^0x0{40}$/.test(a.token_address)) e.tokenAddress = 'A 0x address (42 characters)';
  a.token_address = a.token_address.toLowerCase();
  a.decimals = b.decimals;
  if (!int(a.decimals, 0, 36)) e.decimals = '0–36';
  for (const [k, col] of [['poolAddress', 'pool_address'], ['oracleAddress', 'oracle_address'], ['adapterAddress', 'adapter_address']]) {
    const v = typeof b[k] === 'string' ? b[k].trim() : '';
    if (v && !ADDR.test(v)) e[k] = 'A 0x address, or leave empty';
    a[col] = v ? v.toLowerCase() : null;
  }
  a.pool_fee_bps = b.poolFeeBps;
  if (!POOL_FEES.has(a.pool_fee_bps)) e.poolFeeBps = 'Pick a pool fee tier';
  a.max_m = b.maxM;
  if (!int(a.max_m, 1, MAX_M)) e.maxM = `1–${MAX_M}×`;
  a.liq_margin_bps = b.liqMarginBps;
  if (!int(a.liq_margin_bps, 0, 500)) e.liqMarginBps = '0–5 %';
  a.logo_url = typeof b.logoUrl === 'string' ? b.logoUrl.trim() : '';
  if (a.logo_url) {
    let ok = false;
    try { const u = new URL(a.logo_url); ok = u.protocol === 'https:' && LOGO_HOSTS.has(u.hostname) && a.logo_url.length <= 300; } catch { /* invalid */ }
    if (!ok) e.logoUrl = 'https:// on CoinGecko or backx.trade (the site only loads images from these), or leave empty';
  }
  a.logo_url ||= null;
  a.enabled = b.enabled === true;
  a.max_position_usd = b.maxPositionUsd;
  if (!int(a.max_position_usd, 100, 10_000_000)) e.maxPositionUsd = '$100 – $10M';
  a.max_open_usd = b.maxOpenUsd;
  if (!int(a.max_open_usd, 1_000, 1_000_000_000) || a.max_open_usd < a.max_position_usd) e.maxOpenUsd = 'At least the max position, up to $1B';
  a.notes = typeof b.notes === 'string' ? b.notes.trim() : '';
  if (!text(a.notes, 500)) e.notes = 'Max 500 characters';
  a.notes ||= null;
  return Object.keys(e).length ? { errors: e } : { asset: a };
}

const assetOut = (r) => ({
  id: r.id, chainId: r.chain_id, symbol: r.symbol, name: r.name, tokenAddress: r.token_address, decimals: r.decimals,
  poolAddress: r.pool_address, oracleAddress: r.oracle_address, poolFeeBps: r.pool_fee_bps, maxM: r.max_m,
  liqMarginBps: r.liq_margin_bps, logoUrl: r.logo_url, enabled: r.enabled, notes: r.notes,
  adapterAddress: r.adapter_address, maxPositionUsd: r.max_position_usd, maxOpenUsd: r.max_open_usd,
  deployStatus: r.deploy_status, deployed: r.deployed,
  createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by,
});

const COLS = ['chain_id', 'symbol', 'name', 'token_address', 'decimals', 'pool_address', 'oracle_address', 'pool_fee_bps',
  'max_m', 'liq_margin_bps', 'logo_url', 'enabled', 'notes', 'adapter_address', 'max_position_usd', 'max_open_usd'];

// ---- listed assets ----------------------------------------------------------------------------

adminRouter.get('/assets', async (_req, res, next) => {
  try {
    const { rows } = await db.query('select * from listed_assets order by enabled desc, symbol asc limit 1000');
    res.json({ items: rows.map(assetOut) });
  } catch (e) { next(e); }
});

adminRouter.post('/assets', async (req, res, next) => {
  const v = validateAsset(req.body || {});
  if (v.errors) return res.status(400).json({ error: 'invalid', fields: v.errors });
  try {
    const vals = COLS.map((c) => v.asset[c]);
    const { rows } = await db.query(
      `insert into listed_assets (${COLS.join(', ')}, updated_by) values (${COLS.map((_, i) => `$${i + 1}`).join(', ')}, $${COLS.length + 1})
       returning *`, [...vals, req.user.address]);
    await audit(req, 'asset.create', `${rows[0].symbol} ${rows[0].token_address}`, v.asset);
    res.status(201).json(assetOut(rows[0]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'exists', fields: { tokenAddress: 'Already listed' } });
    next(e);
  }
});

adminRouter.post('/assets/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!int(id, 1, 2 ** 31 - 1)) return next(); // e.g. /assets/verify, registered further down
  const v = validateAsset(req.body || {});
  if (v.errors) return res.status(400).json({ error: 'invalid', fields: v.errors });
  try {
    const cur = await db.query('select chain_id, token_address, deploy_status from listed_assets where id = $1', [id]);
    if (!cur.rows[0]) return res.status(404).json({ error: 'not_found' });
    if (cur.rows[0].deploy_status !== 'draft'
      && (cur.rows[0].chain_id !== v.asset.chain_id || cur.rows[0].token_address !== v.asset.token_address)) {
      return res.status(409).json({ error: 'deployed', fields: { tokenAddress: 'Contracts exist for this token: chain and token cannot change' } });
    }
    const vals = COLS.map((c) => v.asset[c]);
    const { rows } = await db.query(
      `update listed_assets set ${COLS.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = now(), updated_by = $${COLS.length + 1}
       where id = $${COLS.length + 2} returning *`, [...vals, req.user.address, id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'asset.update', `${rows[0].symbol} ${rows[0].token_address}`, v.asset);
    res.json(assetOut(rows[0]));
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'exists', fields: { tokenAddress: 'Already listed' } });
    next(e);
  }
});

adminRouter.delete('/assets/:id', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!int(id, 1, 2 ** 31 - 1)) return res.status(404).json({ error: 'not_found' });
  try {
    const { rows } = await db.query(`delete from listed_assets where id = $1 and deploy_status = 'draft' returning *`, [id]);
    if (!rows[0]) {
      const ex = await db.query('select 1 from listed_assets where id = $1', [id]);
      if (ex.rowCount) return res.status(409).json({ error: 'deployed' }); // contracts exist: disable instead
    }
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'asset.delete', `${rows[0].symbol} ${rows[0].token_address}`, assetOut(rows[0]));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- users ------------------------------------------------------------------------------------

const PAGE = 50;

adminRouter.get('/users', async (req, res, next) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const page = Math.max(0, Math.min(Number.parseInt(String(req.query.page ?? '0'), 10) || 0, 10_000));
  // Search by wallet (EVM or Solana) or sign-up method only: hex/base58/letters, nothing else reaches SQL.
  if (q && !/^[0-9a-z]{1,64}$/i.test(q.replace(/^0x/, ''))) return res.status(400).json({ error: 'invalid' });
  try {
    const where = q ? `where u.wallet_address like $1 or lower(u.solana_address) like $1 or u.signup_method = $2` : '';
    const args = q ? [`%${q}%`, q] : [];
    const [{ rows }, totals] = await Promise.all([
      db.query(
        `select u.wallet_address, u.solana_address, u.signup_method, u.last_login_method, u.beta_signup_at, u.last_login_at,
                (select count(*) from sessions s where s.privy_did = u.privy_did and s.revoked_at is null and s.expires_at > now())::int as sessions
           from users u ${where}
          order by u.beta_signup_at desc
          limit ${PAGE + 1} offset ${page * PAGE}`, args),
      db.query(
        `select count(*)::int as total,
                count(*) filter (where beta_signup_at > now() - interval '1 day')::int as day,
                count(*) filter (where beta_signup_at > now() - interval '7 days')::int as week,
                count(*) filter (where last_login_at > now() - interval '1 day')::int as active_day
           from users`),
    ]);
    const methods = await db.query(
      `select coalesce(signup_method, 'unknown') as method, count(*)::int as n from users group by 1 order by 2 desc`);
    res.json({
      items: rows.slice(0, PAGE).map((r) => ({
        address: r.wallet_address, solanaAddress: r.solana_address, signupMethod: r.signup_method,
        lastLoginMethod: r.last_login_method, signedUpAt: r.beta_signup_at, lastLoginAt: r.last_login_at,
        activeSessions: r.sessions, isAdmin: config.adminWallets.has(r.wallet_address),
      })),
      hasMore: rows.length > PAGE,
      page,
      stats: { ...totals.rows[0], methods: methods.rows },
    });
  } catch (e) { next(e); }
});

// ---- venture participants ("Join the venture!", owner 2026-10-20) ---------------------------------

adminRouter.get('/participants', async (req, res, next) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  const page = Math.max(0, Math.min(Number.parseInt(String(req.query.page ?? '0'), 10) || 0, 10_000));
  if (q && !/^(0x)?[0-9a-f]{1,40}$/.test(q)) return res.status(400).json({ error: 'invalid' });
  try {
    const where = q ? 'where p.wallet_address like $1' : '';
    const args = q ? [`%${q}%`] : [];
    const [{ rows }, totals] = await Promise.all([
      db.query(
        `select p.wallet_address, p.joined_at, u.signup_method, u.beta_signup_at
           from venture_participants p join users u on u.privy_did = p.privy_did ${where}
          order by p.joined_at desc
          limit ${PAGE + 1} offset ${page * PAGE}`, args),
      db.query(
        `select (select count(*) from venture_participants)::int as total,
                (select count(*) from venture_participants where joined_at > now() - interval '1 day')::int as day,
                (select count(*) from venture_participants where joined_at > now() - interval '7 days')::int as week,
                (select count(*) from users)::int as users`),
    ]);
    res.json({
      items: rows.slice(0, PAGE).map((r) => ({
        address: r.wallet_address, joinedAt: r.joined_at, signupMethod: r.signup_method, signedUpAt: r.beta_signup_at,
      })),
      hasMore: rows.length > PAGE,
      page,
      stats: totals.rows[0],
    });
  } catch (e) { next(e); }
});

// ---- audit ------------------------------------------------------------------------------------

adminRouter.get('/audit', async (_req, res, next) => {
  try {
    const { rows } = await db.query('select at, admin, action, target from admin_audit order by id desc limit 50');
    res.json({ items: rows });
  } catch (e) { next(e); }
});

// ---- chains, token search, on-chain check ------------------------------------------------------

adminRouter.get('/chains', async (_req, res, next) => {
  try {
    const items = await Promise.all(Object.entries(CHAINS).map(async ([id, c]) => ({
      id: Number(id), key: c.key, name: c.name, explorer: c.explorer, stable: c.stable, wrappedNative: c.wrappedNative,
      factory: await factoryAddress(Number(id)),
    })));
    res.json({ safe: SAFE, items });
  } catch (e) { next(e); }
});

/** Token search on a chain (LI.FI's list, cached 6 h): BTC → cbBTC/WBTC, SOL → Wormhole SOL, ADA → Binance-Peg … */
adminRouter.get('/tokens', async (req, res, next) => {
  const chainId = Number(req.query.chainId);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
  if (!CHAIN_IDS.has(chainId) || !/^[a-z0-9 .$_-]{1,32}$/i.test(q)) return res.status(400).json({ error: 'invalid' });
  try {
    const key = `lifi:tokens:${chainId}`;
    let list = JSON.parse((await req.app.locals.redis.get(key)) || 'null');
    if (!list) {
      const r = await fetch(`https://li.quest/v1/tokens?chains=${chainId}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) return res.status(502).json({ error: 'upstream' });
      list = ((await r.json()).tokens?.[chainId] || [])
        .filter((t) => /^0x[0-9a-fA-F]{40}$/.test(t.address) && !/^0x0{40}$/.test(t.address))
        .map((t) => ({ symbol: String(t.symbol).slice(0, 16), name: String(t.name).slice(0, 64), address: t.address.toLowerCase(), decimals: t.decimals }));
      await req.app.locals.redis.set(key, JSON.stringify(list), 'EX', 6 * 3600);
    }
    const hits = list.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
      .sort((a, b) => (a.symbol.toLowerCase() === q ? -1 : 0) - (b.symbol.toLowerCase() === q ? -1 : 0))
      .slice(0, 20);
    res.json({ items: hits });
  } catch (e) { next(e); }
});

/** Reads name/symbol/decimals from the token contract itself (read-only RPC): proves the address is a token. */
adminRouter.post('/assets/verify', async (req, res) => {
  const chainId = req.body?.chainId;
  const token = typeof req.body?.tokenAddress === 'string' ? req.body.tokenAddress.trim().toLowerCase() : '';
  if (!CHAIN_IDS.has(chainId) || !ADDR.test(token)) return res.status(400).json({ error: 'invalid' });
  try {
    const [n, s, d] = await Promise.all([ethCall(chainId, token, '0x06fdde03'), ethCall(chainId, token, '0x95d89b41'), ethCall(chainId, token, '0x313ce567')]);
    // An address without code answers "0x": that is a wallet, not a token.
    const raw = decodeUint(d);
    const symbol = decodeString(s);
    if (raw == null || raw > 36n || !symbol) throw new Error('not a token');
    const decimals = Number(raw);
    res.json({ name: (decodeString(n) || '').slice(0, 64), symbol: symbol.slice(0, 16), decimals });
  } catch {
    res.status(422).json({ error: 'not_a_token' });
  }
});

// ---- deploy: the portal prepares, the Safe signs ----------------------------------------------------------

const CREATE_MARKET = '0x085bd065'; // createMarket((address,address,address,uint8,uint8,uint128,uint128,uint128,uint16,uint16,uint16))
const SET_OF = '0x637a31db';        // setOf(address)

/**
 * Builds factory.createMarket for this asset as a Safe Transaction Builder batch. Nothing is signed or sent here:
 * the server never holds keys. The owner opens it in the Safe app, signs, and the factory deploys the coin's
 * reserve, security fund and position manager in that one transaction.
 */
adminRouter.post('/assets/:id/deploy', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!int(id, 1, 2 ** 31 - 1)) return res.status(404).json({ error: 'not_found' });
  try {
    const { rows } = await db.query('select * from listed_assets where id = $1', [id]);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'not_found' });
    const chain = CHAINS[a.chain_id];
    const factory = await factoryAddress(a.chain_id);
    const missing = [];
    if (!factory) missing.push(`the Market Factory on ${chain.name} (Admin → Contracts)`);
    if (!chain.stable) missing.push(`the reserve stablecoin on ${chain.name} (RESERVE_STABLE_${a.chain_id})`);
    if (!a.adapter_address) missing.push('the swap adapter address');
    if (!a.oracle_address) missing.push('the TWAP oracle address');
    if (a.deploy_status === 'deployed') return res.status(409).json({ error: 'already_deployed' });
    // Listing requirements, checked live (owner 2026-10-20). A coin that fails is rejected: no transaction is built.
    let report;
    try { report = await listingReport(req.app.locals.redis, a.chain_id, a.token_address); } catch { return res.status(502).json({ error: 'checks_unavailable' }); }
    if (!report.pass) {
      const failed = report.items.filter((i) => i.required && !i.ok).map((i) => i.label);
      if (!report.tier) failed.push('Market cap and liquidity below the Small tier');
      return res.status(409).json({ error: 'listing_rejected', missing: failed, report });
    }
    if (a.max_m > report.maxM) missing.push(`max multiplication ${a.max_m}× is above the ${report.tier} tier cap (${report.maxM}×)`);
    if (a.liq_margin_bps < report.minMarginBps) missing.push(`liquidation margin must be at least ${report.minMarginBps / 100} % for the ${report.tier} tier`);
    if (a.max_position_usd > report.maxPositionUsd) missing.push(`max position must be at most $${report.maxPositionUsd.toLocaleString('en-US')} (0.5 % of DEX liquidity)`);
    if (a.max_open_usd > report.maxOpenUsd) missing.push(`max open hedges must be at most $${report.maxOpenUsd.toLocaleString('en-US')} (10 % of DEX liquidity, so a crash can be sold fast)`);
    if (missing.length) return res.status(409).json({ error: 'not_ready', missing });

    const unit = 10n ** BigInt(chain.stable.decimals);
    const data = CREATE_MARKET + padAddr(a.token_address) + padAddr(a.adapter_address) + padAddr(a.oracle_address)
      + pad(a.max_m) + pad(0) + pad(BigInt(a.max_position_usd) * unit) + pad(BigInt(a.max_open_usd) * unit) + pad(0)
      + pad(3000) + pad(3000) + pad(a.liq_margin_bps);
    const batch = {
      version: '1.0', chainId: String(a.chain_id), createdAt: Date.now(),
      meta: { name: `backx: list ${a.symbol} on ${chain.name}`, description: `Deploys the ${a.symbol} reserve, security fund and position manager (BackxMarketFactory.createMarket).`, createdFromSafeAddress: SAFE },
      transactions: [{ to: factory, value: '0', data, contractMethod: null, contractInputsValues: null }],
    };
    await db.query(`update listed_assets set deploy_status = 'proposed', updated_at = now(), updated_by = $2 where id = $1`, [id, req.user.address]);
    await audit(req, 'asset.deploy_prepared', `${a.symbol} ${a.token_address}`, { chainId: a.chain_id, factory });
    res.json({
      batch,
      safeUrl: chain.safePrefix
        ? `https://app.safe.global/apps/open?safe=${chain.safePrefix}:${SAFE}&appUrl=${encodeURIComponent('https://apps-portal.safe.global/tx-builder')}`
        : 'https://app.safe.global/',
    });
  } catch (e) { next(e); }
});

/** Reads the factory registry (read-only). Once the Safe has executed, stores the new contract addresses. */
adminRouter.post('/assets/:id/check', async (req, res, next) => {
  const id = Number(req.params.id);
  if (!int(id, 1, 2 ** 31 - 1)) return res.status(404).json({ error: 'not_found' });
  try {
    const { rows } = await db.query('select * from listed_assets where id = $1', [id]);
    const a = rows[0];
    if (!a) return res.status(404).json({ error: 'not_found' });
    const factory = await factoryAddress(a.chain_id);
    if (!factory) return res.status(409).json({ error: 'no_factory' });
    let out;
    try { out = await ethCall(a.chain_id, factory, SET_OF + padAddr(a.token_address)); } catch { return res.status(502).json({ error: 'rpc' }); }
    // Five addresses back (manager, usdVault, hedgeFund, tokenVault, shortFund); anything else = no factory code there.
    if (typeof out !== 'string' || !/^0x[0-9a-fA-F]{320}$/.test(out)) return res.json(assetOut(a));
    const [manager, usdVault, hedgeFund] = decodeAddresses(out, 3);
    if (/^0x0{40}$/.test(manager)) return res.json(assetOut(a));
    const deployed = { manager, usdVault, hedgeFund, factory, checkedAt: new Date().toISOString() };
    const upd = await db.query(`update listed_assets set deploy_status = 'deployed', deployed = $2, updated_at = now(), updated_by = $3 where id = $1 returning *`,
      [id, JSON.stringify(deployed), req.user.address]);
    await audit(req, 'asset.deployed', `${a.symbol} ${a.token_address}`, deployed);
    res.json(assetOut(upd.rows[0]));
  } catch (e) { next(e); }
});

// ---- core contracts per chain ("Contracts", owner 2026-10-22) ------------------------------------------
// Read-only chain checks, cached 60 s per chain. Deploying = a Safe Transaction Builder file; the server signs nothing.

async function contractsOf(redis, chainId, fresh) {
  const key = `contracts:v1:${chainId}`;
  if (!fresh) { const c = await redis.get(key); if (c) return JSON.parse(c); }
  const s = await chainStatus(chainId);
  await redis.set(key, JSON.stringify(s), 'EX', 60);
  return s;
}

adminRouter.get('/contracts', async (req, res, next) => {
  try {
    const redis = req.app.locals.redis;
    const chains = await Promise.all(Object.keys(CHAINS).map((id) => contractsOf(redis, Number(id), false).catch(() => ({ chainId: Number(id), name: CHAINS[id].name, error: 'rpc' }))));
    res.json({ safe: SAFE, deployer: CREATE2_DEPLOYER, maxRuntime: MAX_RUNTIME, sourceCommit: ARTIFACTS_COMMIT, chains });
  } catch (e) { next(e); }
});

adminRouter.post('/contracts/check', async (req, res, next) => {
  const chainId = req.body?.chainId;
  if (!CHAIN_IDS.has(chainId)) return res.status(400).json({ error: 'invalid' });
  try { res.json(await contractsOf(req.app.locals.redis, chainId, true)); } catch { res.status(502).json({ error: 'rpc' }); }
});

adminRouter.post('/contracts/deploy', async (req, res, next) => {
  const b = req.body ?? {};
  const chainId = b.chainId;
  if (!CHAIN_IDS.has(chainId)) return res.status(400).json({ error: 'invalid' });
  const chain = CHAINS[chainId];
  try {
    const st = await contractsOf(req.app.locals.redis, chainId, true);
    const item = st.items.find((i) => i.key === b.key);
    if (!item) return res.status(400).json({ error: 'invalid' });
    if (item.status === 'deployed') return res.status(409).json({ error: 'already_deployed' });
    if (item.blocked.length) return res.status(409).json({ error: 'not_ready', missing: item.blocked });

    let initcode, config = null;
    if (item.key === 'factory') {
      const errors = {};
      for (const k of ['feeCollector', 'keeper', 'keeperWallet']) {
        if (typeof b[k] !== 'string' || !ADDR.test(b[k]) || /^0x0{40}$/.test(b[k])) errors[k] = 'A 0x address (42 characters)';
      }
      if (Object.keys(errors).length) return res.status(400).json({ error: 'invalid', fields: errors });
      config = { feeCollector: b.feeCollector.toLowerCase(), keeper: b.keeper.toLowerCase(), keeperWallet: b.keeperWallet.toLowerCase(), usd: chain.stable.address };
      initcode = factoryInitcode(chain.stable.address, config);
    } else {
      initcode = IMPLS.find((c) => c.key === item.key).initcode;
    }
    const address = create2Address(initcode);
    await db.query(
      `insert into core_contracts (chain_id, name, address, status, config, created_by) values ($1, $2, $3, 'proposed', $4, $5)
       on conflict (chain_id, name) do update set address = excluded.address, status = 'proposed', config = excluded.config, created_by = excluded.created_by, created_at = now()
       where core_contracts.status <> 'deployed'`,
      [chainId, item.key, address, config ? JSON.stringify(config) : null, req.user.address]);
    await req.app.locals.redis.del(`contracts:v1:${chainId}`);
    await audit(req, 'contract.deploy_prepared', `${item.key} ${chain.name}`, { chainId, address, config });
    res.json({
      address,
      batch: safeBatch(chainId, item.label, initcode),
      safeUrl: chain.safePrefix
        ? `https://app.safe.global/apps/open?safe=${chain.safePrefix}:${SAFE}&appUrl=${encodeURIComponent('https://apps-portal.safe.global/tx-builder')}`
        : 'https://app.safe.global/',
    });
  } catch (e) { next(e); }
});

// ---- listing requirements -----------------------------------------------------------------------

adminRouter.get('/listing-rules', (_req, res) => res.json({ rules: RULES, tiers: TIERS }));

/** Live listing checks for one token (market data + automated on-chain audit). Read-only. */
adminRouter.get('/listing-check', async (req, res) => {
  const chainId = Number(req.query.chainId);
  const token = String(req.query.token || '').toLowerCase();
  if (!CHAIN_IDS.has(chainId) || !ADDR.test(token)) return res.status(400).json({ error: 'invalid' });
  try {
    res.json(await listingReport(req.app.locals.redis, chainId, token));
  } catch {
    res.status(502).json({ error: 'checks_unavailable' });
  }
});
