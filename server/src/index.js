import express from 'express';
import pg from 'pg';
import Redis from 'ioredis';
import { config } from './config.js';

const db = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
// family: 0 lets ioredis resolve Railway's IPv6 private network.
const redis = new Redis(config.redisUrl, { family: 0, maxRetriesPerRequest: 2, lazyConnect: false });
redis.on('error', (e) => console.error('redis:', e.message));
db.on('error', (e) => console.error('postgres:', e.message));

const app = express();
app.disable('x-powered-by');
// Exactly one proxy hop (Railway's edge) so req.ip is the client, not spoofable via X-Forwarded-For chains.
app.set('trust proxy', 1);

// Security headers on every response.
app.use((_req, res, next) => {
  res.set({
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cache-Control': 'no-store',
  });
  next();
});

// Health for Railway. Says only whether we are up, nothing about internals.
app.get('/health', async (_req, res) => {
  try {
    await Promise.all([db.query('select 1'), redis.ping()]);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// --- Everything under /api is closed by default ---------------------------

function originOf(req) {
  const o = req.get('origin');
  if (o) return o;
  const ref = req.get('referer');
  if (!ref) return null;
  try { return new URL(ref).origin; } catch { return null; }
}

// CORS: exact allowlist, credentials allowed only for those origins. Fail closed.
app.use('/api', (req, res, next) => {
  const origin = req.get('origin');
  if (origin && config.allowedOrigins.has(origin)) {
    res.set({
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,Idempotency-Key',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(origin && config.allowedOrigins.has(origin) ? 204 : 403);
  next();
});

// Origin guard: browsers always send Origin/Referer; anything else is rejected.
// This stops other websites using a visitor's session. It does NOT stop scripts
// (they can fake headers), which is why every route that reads or writes user
// data must also require a verified session.
app.use('/api', (req, res, next) => {
  const o = originOf(req);
  if (!o || !config.allowedOrigins.has(o)) return res.status(403).json({ error: 'forbidden' });
  next();
});

// Rate limit per IP in Redis (shared across instances). Fail closed if Redis is down.
app.use('/api', async (req, res, next) => {
  const key = `rl:ip:${req.ip}:${Math.floor(Date.now() / 60000)}`;
  try {
    const [[, n]] = await redis.multi().incr(key).expire(key, 70).exec();
    res.set('RateLimit-Remaining', String(Math.max(config.rateLimitPerMin - n, 0)));
    if (n > config.rateLimitPerMin) return res.status(429).json({ error: 'rate_limited' });
    next();
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});

app.use('/api', express.json({ limit: '64kb' }));

// Routes come here. Every route that touches a user requires a verified session
// (see docs/backx/SECURITY-AUTH.md). There are no public write routes.

app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// Never leak stack traces.
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.type === 'entity.too.large' ? 413 : 400).json({ error: 'bad_request' });
});

// '::' listens on IPv4 and IPv6 (Railway private networking is IPv6).
const server = app.listen(config.port, process.env.HOST || '::', () => console.log(`backx api on :${config.port}`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close(() => Promise.allSettled([db.end(), redis.quit()]).then(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
