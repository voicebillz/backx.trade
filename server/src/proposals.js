import express from 'express';
import { createHash } from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { db } from './db.js';
import { CHAINS } from './chains.js';

// BackX Proposals (owner 2026-11-04): a Yes/No question the community signals on, written in Admin → Proposals.
// Reading is public ON PURPOSE (the front-page banner and www.backx.trade/proposal are seen signed out), but it
// returns no user data and no totals: only the proposal text and the Yes/No split in percent, cached in Redis.
// Who may signal: ONE signal each, final (owner 2026-11-04: no changes, no retracts once signalled):
// - a signed-in account (session, www.backx.trade/proposal); it also counts as the account's participation;
// - an AI assistant connected through MCP, for its own user's account (signed internal call, server/src/mcp.js);
// - an agent with its own wallet (owner 2026-11-04 "voting for agents"): an EIP-191 signature over a fixed message,
//   outside /api at /agent/proposals (scripts send no Origin). EOA only, the wallet needs at least one transaction
//   on a launch chain (a speed bump against fresh throwaway wallets), the signature is used once, and the first
//   signal of a wallet is final. A wallet that is a BackX account's own wallet counts as that account.
export const proposalsRouter = express.Router();

const CACHE_S = 10;
const cacheKey = (id) => `bxp:agg:${id}`;
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const LAUNCH = [4663, 56, 8453, 42161];
const SKEW_MS = 5 * 60_000;

async function limit(redis, who, method) {
  const key = `rl:bxp:${who}:${Math.floor(Date.now() / 60000)}`;
  const [[, n]] = await redis.multi().incr(key).expire(key, 70).exec();
  return n <= (method === 'GET' ? 60 : 10);
}

proposalsRouter.use(async (req, res, next) => {
  try {
    if (!(await limit(req.app.locals.redis, req.user ? `u:${req.user.did}` : `ip:${req.ip}`, req.method))) return res.status(429).json({ error: 'rate_limited' });
  } catch {
    return res.status(503).json({ error: 'unavailable' });
  }
  if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'json_only' });
  next();
});

/** Yes/No in percent with one decimal (they add up to 100), or null while nobody has signalled. Never the counts. */
export function split(yes, no) {
  const total = yes + no;
  if (!total) return { yesPct: null, noPct: null };
  const yesPct = Math.round((yes * 1000) / total) / 10;
  return { yesPct, noPct: Math.round((100 - yesPct) * 10) / 10 };
}

const COUNTS = `select count(*) filter (where choice = 'yes')::int as yes, count(*) filter (where choice = 'no')::int as no
  from (select choice from proposal_signals where proposal_id = $1
        union all select choice from proposal_agent_signals where proposal_id = $1) s`;

async function aggregate(redis, id) {
  try {
    const hit = await redis.get(cacheKey(id));
    if (hit) return JSON.parse(hit);
  } catch { /* fall through to Postgres */ }
  const { rows } = await db.query(COUNTS, [id]);
  const out = split(rows[0].yes, rows[0].no);
  try { await redis.set(cacheKey(id), JSON.stringify(out), 'EX', CACHE_S); } catch { /* cache only */ }
  return out;
}

const publicOut = (p, agg, mine) => ({
  id: p.id, code: `BXP-${p.id}`, title: p.title, question: p.question, body: p.body, banner: p.banner,
  status: p.status, openedAt: p.opened_at, closedAt: p.closed_at, endsAt: p.ends_at, days: p.days, ...agg, mine,
});

// A proposal closes itself when its timer runs out (checked at most every 5 s, before any read or signal).
let lastSweep = 0;
async function sweep() {
  if (Date.now() - lastSweep < 5000) return;
  lastSweep = Date.now();
  await db.query(`update proposals set status = 'closed', closed_at = ends_at where status = 'open' and ends_at is not null and ends_at <= now()`);
}

const parseId = (v) => { const id = Number.parseInt(v, 10); return Number.isInteger(id) && id >= 1 && id <= 1e6 && String(id) === String(v) ? id : null; };

/** The proposal (null = latest: newest open, else newest closed). Drafts are never public. */
async function loadProposal(id) {
  await sweep();
  const { rows } = id
    ? await db.query(`select * from proposals where id = $1 and status <> 'draft'`, [id])
    : await db.query(`select * from proposals where status <> 'draft'
        order by (status = 'open') desc, coalesce(opened_at, created_at) desc, id desc limit 1`);
  return rows[0] ?? null;
}

async function mineOf(id, did) {
  if (!did) return null;
  const { rows } = await db.query('select choice from proposal_signals where proposal_id = $1 and privy_did = $2', [id, did]);
  return rows[0]?.choice ?? null;
}

/** Public view for one reader (did = their account, or null). */
export async function proposalView(redis, id, did) {
  const p = await loadProposal(id);
  return p ? publicOut(p, await aggregate(redis, p.id), await mineOf(p.id, did)) : null;
}

/** One account's signal (web session or MCP). Returns { proposal } or { error, status }. */
export async function signalAccount(redis, id, did, wallet, choice) {
  if (choice !== 'yes' && choice !== 'no') return { error: 'invalid', status: 400 };
  const p = await loadProposal(id);
  if (!p) return { error: 'not_found', status: 404 };
  if (p.status !== 'open') return { error: 'closed', status: 409 };
  // First signal is final: no change, no retract (the primary key + do nothing; there is no delete route).
  const { rowCount } = await db.query(
    `insert into proposal_signals (proposal_id, privy_did, wallet_address, choice) values ($1, $2, $3, $4)
     on conflict (proposal_id, privy_did) do nothing`,
    [p.id, did, wallet, choice]);
  if (!rowCount) return { error: 'already_signalled', status: 409, proposal: publicOut(p, await aggregate(redis, p.id), await mineOf(p.id, did)) };
  // A signal is a participation too (idempotent, one row per account).
  await db.query('insert into venture_participants (privy_did, wallet_address) values ($1, $2) on conflict (privy_did) do nothing', [did, wallet]);
  try { await redis.del(cacheKey(p.id)); } catch { /* expires in 10 s anyway */ }
  return { proposal: publicOut(p, await aggregate(redis, p.id), choice) };
}

/** Every public proposal, newest first: the open one on top, then earlier ones. Percent only. */
export async function proposalList(redis) {
  await sweep();
  const { rows } = await db.query(`select * from proposals where status <> 'draft'
    order by (status = 'open') desc, coalesce(opened_at, created_at) desc, id desc limit 50`);
  return Promise.all(rows.map(async (p) => publicOut(p, await aggregate(redis, p.id), null)));
}

proposalsRouter.get('/', async (req, res, next) => {
  try { res.json({ items: await proposalList(req.app.locals.redis) }); } catch (e) { next(e); }
});

proposalsRouter.get('/latest', async (req, res, next) => {
  try { res.json({ proposal: await proposalView(req.app.locals.redis, null, req.user?.did) }); } catch (e) { next(e); }
});

proposalsRouter.get('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'not_found' });
  try {
    const p = await proposalView(req.app.locals.redis, id, req.user?.did);
    if (!p) return res.status(404).json({ error: 'not_found' });
    res.json({ proposal: p });
  } catch (e) { next(e); }
});

proposalsRouter.post('/:id/signal', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'not_found' });
  try {
    const r = await signalAccount(req.app.locals.redis, id, req.user.did, req.user.address, req.body?.choice);
    if (r.error) return res.status(r.status).json({ error: r.error, proposal: r.proposal });
    res.json(r);
  } catch (e) { next(e); }
});

// ---- agents with their own wallet: /agent/proposals (outside /api) ---------------------------------------------

/** The exact text an agent signs (EIP-191 personal_sign). Lowercase wallet, ISO-8601 UTC time. */
export const agentMessage = (code, choice, wallet, issued) =>
  `BackX Proposal ${code}\nSignal: ${choice}\nWallet: ${wallet}\nIssued: ${issued}`;

/** Address that signed `message` (EIP-191), or null. */
export function recoverSigner(message, signature) {
  try {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return null;
    const m = new TextEncoder().encode(message);
    const hash = keccak_256(new Uint8Array([...new TextEncoder().encode(`\x19Ethereum Signed Message:\n${m.length}`), ...m]));
    const b = Buffer.from(signature.slice(2), 'hex');
    let v = b[64]; if (v >= 27) v -= 27;
    if (v !== 0 && v !== 1) return null;
    const pub = secp256k1.recoverPublicKey(new Uint8Array([v, ...b.subarray(0, 64)]), hash, { prehash: false });
    const full = secp256k1.Point.fromBytes(pub).toBytes(false);
    return '0x' + Buffer.from(keccak_256(full.subarray(1))).subarray(12).toString('hex');
  } catch { return null; }
}

/** Has this wallet ever sent a transaction on a launch chain? Cached 1 h (yes) / 10 min (no). */
async function hasHistory(redis, wallet) {
  const key = `bxp:hist:${wallet}`;
  try { const hit = await redis.get(key); if (hit) return hit === '1'; } catch { /* ask the chains */ }
  const counts = await Promise.allSettled(LAUNCH.map(async (c) => {
    const r = await fetch(CHAINS[c].rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionCount', params: [wallet, 'latest'] }),
    });
    const j = await r.json();
    if (j.error || typeof j.result !== 'string') throw new Error('rpc');
    return BigInt(j.result);
  }));
  if (counts.every((c) => c.status === 'rejected')) throw new Error('rpc');
  const ok = counts.some((c) => c.status === 'fulfilled' && c.value > 0n);
  try { await redis.set(key, ok ? '1' : '0', 'EX', ok ? 3600 : 600); } catch { /* cache only */ }
  return ok;
}

export const agentProposalsRouter = express.Router();
agentProposalsRouter.use((req, res, next) => {
  // Public machine route: no cookies, no credentials, so any origin may read it.
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
agentProposalsRouter.use(async (req, res, next) => {
  try {
    if (!(await limit(req.app.locals.redis, `agent:${req.ip}`, req.method))) return res.status(429).json({ error: 'rate_limited' });
  } catch { return res.status(503).json({ error: 'unavailable' }); }
  if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'json_only' });
  next();
});
agentProposalsRouter.use(express.json({ limit: '4kb' }));

const howTo = (p) => p && ({
  sign: agentMessage(p.code, '<yes|no>', '<your wallet, lowercase>', '<now, ISO-8601 UTC, e.g. 2026-11-04T18:00:00.000Z>'),
  post: `POST https://api.backx.trade/agent/proposals/${p.id}/signal {"wallet","choice","issued","signature"}`,
});

agentProposalsRouter.get('/latest', async (req, res, next) => {
  try { const p = await proposalView(req.app.locals.redis, null, null); res.json({ proposal: p, howTo: howTo(p) }); } catch (e) { next(e); }
});
agentProposalsRouter.get('/:id', async (req, res, next) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(404).json({ error: 'not_found' });
  try {
    const p = await proposalView(req.app.locals.redis, id, null);
    if (!p) return res.status(404).json({ error: 'not_found' });
    res.json({ proposal: p, howTo: howTo(p) });
  } catch (e) { next(e); }
});

agentProposalsRouter.post('/:id/signal', async (req, res, next) => {
  const redis = req.app.locals.redis;
  const id = parseId(req.params.id);
  const { wallet, choice, issued, signature } = req.body ?? {};
  if (!id) return res.status(404).json({ error: 'not_found' });
  if (typeof wallet !== 'string' || !ADDR.test(wallet) || (choice !== 'yes' && choice !== 'no')
    || typeof issued !== 'string' || issued.length > 40 || typeof signature !== 'string') return res.status(400).json({ error: 'invalid' });
  const t = Date.parse(issued);
  if (!Number.isFinite(t) || new Date(t).toISOString() !== issued) return res.status(400).json({ error: 'invalid_issued', hint: 'ISO-8601 UTC with milliseconds, e.g. new Date().toISOString()' });
  if (Math.abs(Date.now() - t) > SKEW_MS) return res.status(400).json({ error: 'stale', hint: 'Sign with the current time (±5 minutes).' });
  try {
    const p = await loadProposal(id);
    if (!p) return res.status(404).json({ error: 'not_found' });
    if (p.status !== 'open') return res.status(409).json({ error: 'closed' });
    const w = wallet.toLowerCase();
    if (recoverSigner(agentMessage(`BXP-${p.id}`, choice, w, issued), signature) !== w) {
      return res.status(401).json({ error: 'bad_signature', hint: 'personal_sign the exact text from howTo.sign (EOA wallets only).' });
    }
    // Each signature counts once.
    if ((await redis.set(`bxp:sig:${createHash('sha256').update(signature.toLowerCase()).digest('hex')}`, '1', 'EX', 900, 'NX')) !== 'OK') {
      return res.status(409).json({ error: 'replay' });
    }
    // A BackX account's own wallet signals as that account (never twice).
    const { rows: acct } = await db.query('select privy_did, wallet_address from users where lower(wallet_address) = $1 limit 1', [w]);
    if (acct[0]) {
      const r = await signalAccount(redis, p.id, acct[0].privy_did, acct[0].wallet_address, choice);
      return r.error ? res.status(r.status).json({ error: r.error }) : res.json(r);
    }
    let history;
    try { history = await hasHistory(redis, w); } catch { return res.status(503).json({ error: 'unavailable' }); }
    if (!history) return res.status(403).json({ error: 'no_onchain_history', hint: 'The wallet needs at least one transaction on Robinhood Chain, BNB Chain, Base or Arbitrum.' });
    const { rowCount } = await db.query(
      `insert into proposal_agent_signals (proposal_id, wallet_address, choice, at) values ($1, $2, $3, $4)
       on conflict (proposal_id, wallet_address) do nothing`,
      [p.id, w, choice, new Date(t)]);
    if (!rowCount) return res.status(409).json({ error: 'already_signalled', hint: 'This wallet has already signalled on this proposal. A signal is final.' });
    try { await redis.del(cacheKey(p.id)); } catch { /* expires in 10 s anyway */ }
    res.json({ proposal: publicOut(p, await aggregate(redis, p.id), choice) });
  } catch (e) { next(e); }
});

// ---- admin (mounted on adminRouter: session + ADMIN_WALLETS, audited) -------------------------------------------

const line = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f<>]/.test(v);
const para = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000-\u0009\u000b-\u001f\u007f<>]/.test(v);
const STATUSES = new Set(['draft', 'open', 'closed']);

function validate(b) {
  const e = {};
  if (!line(b.title, 80)) e.title = '1–80 characters, no < >';
  if (!line(b.question, 200)) e.question = '1–200 characters, no < >';
  if (!para(b.body ?? '', 4000)) e.body = 'Up to 4,000 characters, no < >';
  if (!(b.banner === undefined || b.banner === '' || line(b.banner, 200))) e.banner = 'Up to 200 characters, no < >';
  if (b.status !== undefined && !STATUSES.has(b.status)) e.status = 'draft, open or closed';
  const days = b.days ?? 14;
  if (!Number.isInteger(days) || days < 1 || days > 365) e.days = '1–365 days';
  return Object.keys(e).length ? { errors: e } : {
    p: { title: b.title.trim(), question: b.question.trim(), body: (b.body ?? '').replace(/\r\n/g, '\n').trim(), banner: (b.banner ?? '').trim(), status: b.status ?? 'draft', days },
  };
}

const adminOut = (r) => ({
  id: r.id, code: `BXP-${r.id}`, title: r.title, question: r.question, body: r.body, banner: r.banner, status: r.status,
  createdAt: r.created_at, openedAt: r.opened_at, closedAt: r.closed_at, endsAt: r.ends_at, days: r.days, yes: r.yes ?? 0, no: r.no ?? 0, agents: r.agents ?? 0, agentYes: r.agent_yes ?? 0, day: r.day ?? 0,
});

export function mountProposalAdmin(router, audit) {
  router.get('/proposals', async (_req, res, next) => {
    try {
      lastSweep = 0; await sweep();
      const { rows } = await db.query(
        `select p.*,
                (select count(*) from proposal_signals s where s.proposal_id = p.id and s.choice = 'yes')::int
                  + (select count(*) from proposal_agent_signals a where a.proposal_id = p.id and a.choice = 'yes')::int as yes,
                (select count(*) from proposal_signals s where s.proposal_id = p.id and s.choice = 'no')::int
                  + (select count(*) from proposal_agent_signals a where a.proposal_id = p.id and a.choice = 'no')::int as no,
                (select count(*) from proposal_agent_signals a where a.proposal_id = p.id)::int as agents,
                (select count(*) from proposal_agent_signals a where a.proposal_id = p.id and a.choice = 'yes')::int as agent_yes,
                (select count(*) from proposal_signals s where s.proposal_id = p.id and s.at > now() - interval '1 day')::int
                  + (select count(*) from proposal_agent_signals a where a.proposal_id = p.id and a.at > now() - interval '1 day')::int as day
           from proposals p order by p.id desc limit 100`);
      res.json({ items: rows.map(adminOut) });
    } catch (e) { next(e); }
  });

  router.post('/proposals', async (req, res, next) => {
    const v = validate(req.body ?? {});
    if (v.errors) return res.status(400).json({ error: 'invalid', fields: v.errors });
    try {
      const { rows } = await db.query(
        `insert into proposals (title, question, body, banner, status, days, opened_at, closed_at, ends_at)
         values ($1, $2, $3, $4, $5::text, $6::int, case when $5::text = 'open' then now() end, case when $5::text = 'closed' then now() end,
                 case when $5::text = 'open' then now() + make_interval(days => $6::int) end) returning *`,
        [v.p.title, v.p.question, v.p.body, v.p.banner, v.p.status, v.p.days]);
      await audit(req, 'proposal.create', `BXP-${rows[0].id}`, v.p);
      res.json({ item: adminOut(rows[0]) });
    } catch (e) { next(e); }
  });

  router.post('/proposals/:id', async (req, res, next) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'not_found' });
    const v = validate(req.body ?? {});
    if (v.errors) return res.status(400).json({ error: 'invalid', fields: v.errors });
    try {
      const { rows } = await db.query(
        `with prev as (select status as was from proposals where id = $1)
         update proposals set title = $2, question = $3, body = $4, banner = $5, status = $6::text, days = $7::int,
                -- (re)opening starts the timer now; editing an open one keeps its start and moves the end
                opened_at = case when $6::text = 'open' and (select was from prev) <> 'open' then now() else opened_at end,
                ends_at = case when $6::text = 'open' and (select was from prev) <> 'open' then now() + make_interval(days => $7::int)
                               when $6::text = 'open' then opened_at + make_interval(days => $7::int) else ends_at end,
                closed_at = case when $6::text = 'closed' and (select was from prev) <> 'closed' then now()
                                 when $6::text = 'closed' then closed_at else null end
          where id = $1 returning *`,
        [id, v.p.title, v.p.question, v.p.body, v.p.banner, v.p.status, v.p.days]);
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      await audit(req, 'proposal.update', `BXP-${id}`, v.p);
      try { await req.app.locals.redis.del(cacheKey(id)); } catch { /* cache only */ }
      res.json({ item: adminOut(rows[0]) });
    } catch (e) { next(e); }
  });
}
