import express from 'express';
import { db } from './db.js';

// "Join the venture!" (owner 2026-10-20). Shown to signed-in users behind the coming-soon overlay.
// Session required on every route; one participation per account (primary key on privy_did).
export const ventureRouter = express.Router();

ventureRouter.use(async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  try {
    const key = `rl:venture:${req.user.did}:${Math.floor(Date.now() / 60000)}`;
    const [[, n]] = await req.app.locals.redis.multi().incr(key).expire(key, 70).exec();
    if (n > (req.method === 'GET' ? 30 : 5)) return res.status(429).json({ error: 'rate_limited' });
  } catch {
    return res.status(503).json({ error: 'unavailable' });
  }
  if (req.method === 'POST' && !req.is('application/json')) return res.status(415).json({ error: 'json_only' });
  next();
});

const out = (row) => ({ joined: !!row, joinedAt: row?.joined_at ?? null });

ventureRouter.get('/me', async (req, res, next) => {
  try {
    const { rows } = await db.query('select joined_at from venture_participants where privy_did = $1', [req.user.did]);
    res.json(out(rows[0]));
  } catch (e) { next(e); }
});

// Idempotent: a second click (or a second tab) returns the first participation, never a new row.
ventureRouter.post('/participate', async (req, res, next) => {
  try {
    await db.query(
      `insert into venture_participants (privy_did, wallet_address) values ($1, $2) on conflict (privy_did) do nothing`,
      [req.user.did, req.user.address]);
    const { rows } = await db.query('select joined_at from venture_participants where privy_did = $1', [req.user.did]);
    res.json(out(rows[0]));
  } catch (e) { next(e); }
});
