import express from 'express';
import { db } from './db.js';
import { config } from './config.js';

// Admin portal API (owner 2026-10-19). Every route: verified session + wallet in ADMIN_WALLETS, else 404 so the
// portal's existence is not revealed. Own rate limit, strict validation, every write logged in admin_audit.
// CSRF: the global Origin guard + SameSite=Lax cookie, and writes only accept JSON bodies.
export const adminRouter = express.Router();

const ROBINHOOD_CHAIN_ID = 4663;
const CHAINS = new Set([ROBINHOOD_CHAIN_ID]);
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
  if (!CHAINS.has(a.chain_id)) e.chainId = 'Robinhood Chain (4663) only';
  a.symbol = typeof b.symbol === 'string' ? b.symbol.trim().toUpperCase() : '';
  if (!/^[A-Z0-9$._-]{1,16}$/.test(a.symbol)) e.symbol = '1–16 letters, digits or $ . _ -';
  a.name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!a.name || !text(a.name, 64)) e.name = '1–64 characters';
  a.token_address = typeof b.tokenAddress === 'string' ? b.tokenAddress.trim() : '';
  if (!ADDR.test(a.token_address) || /^0x0{40}$/.test(a.token_address)) e.tokenAddress = 'A 0x address (42 characters)';
  a.token_address = a.token_address.toLowerCase();
  a.decimals = b.decimals;
  if (!int(a.decimals, 0, 36)) e.decimals = '0–36';
  for (const [k, col] of [['poolAddress', 'pool_address'], ['oracleAddress', 'oracle_address']]) {
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
  a.notes = typeof b.notes === 'string' ? b.notes.trim() : '';
  if (!text(a.notes, 500)) e.notes = 'Max 500 characters';
  a.notes ||= null;
  return Object.keys(e).length ? { errors: e } : { asset: a };
}

const assetOut = (r) => ({
  id: r.id, chainId: r.chain_id, symbol: r.symbol, name: r.name, tokenAddress: r.token_address, decimals: r.decimals,
  poolAddress: r.pool_address, oracleAddress: r.oracle_address, poolFeeBps: r.pool_fee_bps, maxM: r.max_m,
  liqMarginBps: r.liq_margin_bps, logoUrl: r.logo_url, enabled: r.enabled, notes: r.notes,
  createdAt: r.created_at, updatedAt: r.updated_at, updatedBy: r.updated_by,
});

const COLS = ['chain_id', 'symbol', 'name', 'token_address', 'decimals', 'pool_address', 'oracle_address', 'pool_fee_bps',
  'max_m', 'liq_margin_bps', 'logo_url', 'enabled', 'notes'];

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
  if (!int(id, 1, 2 ** 31 - 1)) return res.status(404).json({ error: 'not_found' });
  const v = validateAsset(req.body || {});
  if (v.errors) return res.status(400).json({ error: 'invalid', fields: v.errors });
  try {
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
    const { rows } = await db.query('delete from listed_assets where id = $1 returning *', [id]);
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

// ---- audit ------------------------------------------------------------------------------------

adminRouter.get('/audit', async (_req, res, next) => {
  try {
    const { rows } = await db.query('select at, admin, action, target from admin_audit order by id desc limit 50');
    res.json({ items: rows });
  } catch (e) { next(e); }
});
