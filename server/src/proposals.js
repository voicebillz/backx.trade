import express from 'express';
import { db } from './db.js';

// BackX Proposals (owner 2026-11-04): a Yes/No question the community signals on, written in Admin → Proposals.
// Reading is public ON PURPOSE (the front-page banner and www.backx.trade/proposal are seen signed out), but it
// returns no user data and no totals: only the proposal text and the Yes/No split in percent, cached in Redis.
// Signalling needs a verified session: one signal per account per proposal (primary key), changeable while open,
// and it also counts as the account's participation (venture_participants).
export const proposalsRouter = express.Router();

const CACHE_S = 10;
const cacheKey = (id) => `bxp:agg:${id}`;

proposalsRouter.use(async (req, res, next) => {
  try {
    const who = req.user ? `u:${req.user.did}` : `ip:${req.ip}`;
    const key = `rl:bxp:${who}:${Math.floor(Date.now() / 60000)}`;
    const [[, n]] = await req.app.locals.redis.multi().incr(key).expire(key, 70).exec();
    if (n > (req.method === 'GET' ? 60 : 10)) return res.status(429).json({ error: 'rate_limited' });
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

async function aggregate(redis, id) {
  try {
    const hit = await redis.get(cacheKey(id));
    if (hit) return JSON.parse(hit);
  } catch { /* fall through to Postgres */ }
  const { rows } = await db.query(
    `select count(*) filter (where choice = 'yes')::int as yes, count(*) filter (where choice = 'no')::int as no
       from proposal_signals where proposal_id = $1`, [id]);
  const out = split(rows[0].yes, rows[0].no);
  try { await redis.set(cacheKey(id), JSON.stringify(out), 'EX', CACHE_S); } catch { /* cache only */ }
  return out;
}

const publicOut = (p, agg, mine) => ({
  id: p.id, code: `BXP-${p.id}`, title: p.title, question: p.question, body: p.body, banner: p.banner,
  status: p.status, openedAt: p.opened_at, closedAt: p.closed_at, ...agg, mine,
});

async function mineFor(req, id) {
  if (!req.user) return null;
  const { rows } = await db.query('select choice from proposal_signals where proposal_id = $1 and privy_did = $2', [id, req.user.did]);
  return rows[0]?.choice ?? null;
}

// The newest open proposal, else the newest closed one. Drafts are never public.
proposalsRouter.get('/latest', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `select * from proposals where status <> 'draft'
        order by (status = 'open') desc, coalesce(opened_at, created_at) desc, id desc limit 1`);
    if (!rows[0]) return res.json({ proposal: null });
    res.json({ proposal: publicOut(rows[0], await aggregate(req.app.locals.redis, rows[0].id), await mineFor(req, rows[0].id)) });
  } catch (e) { next(e); }
});

proposalsRouter.get('/:id', async (req, res, next) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1 || id > 1e6 || String(id) !== req.params.id) return res.status(404).json({ error: 'not_found' });
  try {
    const { rows } = await db.query(`select * from proposals where id = $1 and status <> 'draft'`, [id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ proposal: publicOut(rows[0], await aggregate(req.app.locals.redis, id), await mineFor(req, id)) });
  } catch (e) { next(e); }
});

proposalsRouter.post('/:id/signal', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const id = Number.parseInt(req.params.id, 10);
  const choice = req.body?.choice;
  if (!Number.isInteger(id) || id < 1 || id > 1e6 || String(id) !== req.params.id) return res.status(404).json({ error: 'not_found' });
  if (choice !== 'yes' && choice !== 'no') return res.status(400).json({ error: 'invalid' });
  try {
    const { rows } = await db.query('select * from proposals where id = $1', [id]);
    if (!rows[0] || rows[0].status === 'draft') return res.status(404).json({ error: 'not_found' });
    if (rows[0].status !== 'open') return res.status(409).json({ error: 'closed' });
    await db.query(
      `insert into proposal_signals (proposal_id, privy_did, wallet_address, choice) values ($1, $2, $3, $4)
       on conflict (proposal_id, privy_did) do update set choice = excluded.choice, at = now()`,
      [id, req.user.did, req.user.address, choice]);
    // A signal is a participation too (idempotent, one row per account).
    await db.query(
      'insert into venture_participants (privy_did, wallet_address) values ($1, $2) on conflict (privy_did) do nothing',
      [req.user.did, req.user.address]);
    try { await req.app.locals.redis.del(cacheKey(id)); } catch { /* expires in 10 s anyway */ }
    res.json({ proposal: publicOut(rows[0], await aggregate(req.app.locals.redis, id), choice) });
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
  return Object.keys(e).length ? { errors: e } : {
    p: { title: b.title.trim(), question: b.question.trim(), body: (b.body ?? '').replace(/\r\n/g, '\n').trim(), banner: (b.banner ?? '').trim(), status: b.status ?? 'draft' },
  };
}

const adminOut = (r) => ({
  id: r.id, code: `BXP-${r.id}`, title: r.title, question: r.question, body: r.body, banner: r.banner, status: r.status,
  createdAt: r.created_at, openedAt: r.opened_at, closedAt: r.closed_at, yes: r.yes ?? 0, no: r.no ?? 0,
});

export function mountProposalAdmin(router, audit) {
  router.get('/proposals', async (_req, res, next) => {
    try {
      const { rows } = await db.query(
        `select p.*, count(s.*) filter (where s.choice = 'yes')::int as yes, count(s.*) filter (where s.choice = 'no')::int as no
           from proposals p left join proposal_signals s on s.proposal_id = p.id
          group by p.id order by p.id desc limit 100`);
      res.json({ items: rows.map(adminOut) });
    } catch (e) { next(e); }
  });

  router.post('/proposals', async (req, res, next) => {
    const v = validate(req.body ?? {});
    if (v.errors) return res.status(400).json({ error: 'invalid', fields: v.errors });
    try {
      const { rows } = await db.query(
        `insert into proposals (title, question, body, banner, status, opened_at, closed_at)
         values ($1, $2, $3, $4, $5::text, case when $5::text = 'open' then now() end, case when $5::text = 'closed' then now() end) returning *`,
        [v.p.title, v.p.question, v.p.body, v.p.banner, v.p.status]);
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
        `update proposals set title = $2, question = $3, body = $4, banner = $5, status = $6::text,
                opened_at = case when $6::text = 'open' and opened_at is null then now() else opened_at end,
                closed_at = case when $6::text = 'closed' then coalesce(closed_at, now()) when $6::text = 'open' then null else closed_at end
          where id = $1 returning *`,
        [id, v.p.title, v.p.question, v.p.body, v.p.banner, v.p.status]);
      if (!rows[0]) return res.status(404).json({ error: 'not_found' });
      await audit(req, 'proposal.update', `BXP-${id}`, v.p);
      try { await req.app.locals.redis.del(cacheKey(id)); } catch { /* cache only */ }
      res.json({ item: adminOut(rows[0]) });
    } catch (e) { next(e); }
  });
}
