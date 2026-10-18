import crypto from 'node:crypto';
import express from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { db } from './db.js';

const SESSION_DAYS = 7;
// __Host- pins the cookie to api.backx.trade (no Domain, Path=/, Secure).
const COOKIE = config.isProd ? '__Host-backx_session' : 'backx_session';

const jwks = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${config.privyAppId}/jwks.json`), {
  cacheMaxAge: 6 * 60 * 60 * 1000,
});

const sha256 = (v) => crypto.createHash('sha256').update(v).digest();

function readCookie(req) {
  const raw = req.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

function setCookie(res, value, maxAgeSec) {
  const attrs = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (config.isProd) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

/** Verifies a Privy access token. Only alg, issuer and audience we expect. */
async function verifyPrivy(token) {
  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ['ES256'],
    issuer: 'privy.io',
    audience: config.privyAppId,
    clockTolerance: 30,
  });
  if (typeof payload.sub !== 'string' || !payload.sub.startsWith('did:privy:')) throw new Error('bad sub');
  return { did: payload.sub, sid: typeof payload.sid === 'string' ? payload.sid : null };
}

/**
 * The user's Privy embedded Ethereum wallet and the login method used, read from Privy
 * itself, never from the client. The method is the linked account verified most recently.
 */
async function privyAccount(did) {
  const r = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(did)}`, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${config.privyAppId}:${config.privyAppSecret}`).toString('base64'),
      'privy-app-id': config.privyAppId,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`privy users ${r.status}`);
  const user = await r.json();
  const w = (user.linked_accounts || []).find(
    (a) => a.type === 'wallet' && a.chain_type === 'ethereum' && a.wallet_client_type === 'privy',
  );
  const address = w && /^0x[0-9a-fA-F]{40}$/.test(w.address) ? w.address.toLowerCase() : null;
  const sol = (user.linked_accounts || []).find(
    (a) => a.type === 'wallet' && a.chain_type === 'solana' && a.wallet_client_type === 'privy',
  );
  // Base58, 32–44 chars. Case matters on Solana, so it is stored as is.
  const solanaAddress = sol && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sol.address) ? sol.address : null;
  const logins = (user.linked_accounts || [])
    .filter((a) => typeof a.type === 'string' && !/wallet/.test(a.type))
    .sort((a, b) => (b.latest_verified_at || 0) - (a.latest_verified_at || 0));
  // google_oauth → google, phone → phone, passkey → passkey. Short, fixed vocabulary.
  const method = logins[0] ? logins[0].type.replace(/_oauth$/, '').slice(0, 32) : null;
  return { address, solanaAddress, method };
}

/** Loads the session from the cookie and slides its expiry. Sets req.user or null. */
export async function loadSession(req, res, next) {
  req.user = null;
  const token = readCookie(req);
  if (!token || token.length > 128) return next();
  try {
    const { rows } = await db.query(
      `update sessions s set expires_at = now() + interval '${SESSION_DAYS} days'
         from users u
        where s.token_hash = $1 and s.revoked_at is null and s.expires_at > now() and u.privy_did = s.privy_did
        returning u.privy_did, u.wallet_address, u.solana_address, u.avatar_seed, u.beta_signup_at, u.signup_method`,
      [sha256(token)],
    );
    if (rows[0]) {
      const r = rows[0];
      req.user = {
        did: r.privy_did, address: r.wallet_address, solanaAddress: r.solana_address,
        avatarSeed: r.avatar_seed, memberSince: r.beta_signup_at, signupMethod: r.signup_method,
      };
      req.sessionHash = sha256(token);
      setCookie(res, token, SESSION_DAYS * 86400);
    }
    next();
  } catch (e) {
    next(e);
  }
}

/** Uploaded picture as a data URL, or null for the generated one. Only read where the profile is returned. */
async function avatarUrl(did) {
  const { rows } = await db.query('select avatar_mime, avatar_data from users where privy_did = $1', [did]);
  const r = rows[0];
  return r?.avatar_data ? `data:${r.avatar_mime};base64,${r.avatar_data.toString('base64')}` : null;
}

const me = (u) => ({
  address: u.address,
  solanaAddress: u.solanaAddress ?? null,
  isAdmin: config.adminWallets.has(u.address),
  avatarSeed: u.avatarSeed,
  memberSince: u.memberSince,
  signupMethod: u.signupMethod ?? null,
  avatarUrl: u.avatarUrl ?? null,
});

export const authRouter = express.Router();

// Stricter limit on login: 10 per 10 minutes per IP.
authRouter.post('/session', async (req, res, next) => {
  const { redis } = req.app.locals;
  const key = `rl:login:${req.ip}:${Math.floor(Date.now() / 600000)}`;
  try {
    const [[, n]] = await redis.multi().incr(key).expire(key, 660).exec();
    if (n > 10) return res.status(429).json({ error: 'rate_limited' });
  } catch {
    return res.status(503).json({ error: 'unavailable' });
  }

  const m = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(req.get('authorization') || '');
  if (!m) return res.status(401).json({ error: 'unauthorized' });

  let did, sid;
  try {
    ({ did, sid } = await verifyPrivy(m[1]));
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    // A Privy session that was signed out (here or via "Log out everywhere") never gets a new backx session.
    if (sid) {
      const { rowCount } = await db.query('select 1 from revoked_privy_sids where privy_sid = $1', [sid]);
      if (rowCount) return res.status(401).json({ error: 'session_revoked' });
    }
    const { address, solanaAddress, method } = await privyAccount(did);
    // Social login only: no embedded wallet (yet) means no session.
    if (!address) return res.status(409).json({ error: 'wallet_pending' });

    await db.query(
      `insert into users (privy_did, wallet_address, signup_method, last_login_method, solana_address) values ($1, $2, $3, $3, $4)
       on conflict (privy_did) do update set last_login_at = now(), last_login_method = excluded.last_login_method,
         signup_method = coalesce(users.signup_method, excluded.signup_method),
         solana_address = coalesce(excluded.solana_address, users.solana_address)`,
      [did, address, method, solanaAddress],
    );
    const token = crypto.randomBytes(32).toString('base64url');
    await db.query(
      `insert into sessions (token_hash, privy_did, privy_sid, expires_at) values ($1, $2, $3, now() + interval '${SESSION_DAYS} days')`,
      [sha256(token), did, sid],
    );
    setCookie(res, token, SESSION_DAYS * 86400);
    const { rows } = await db.query(
      'select solana_address, avatar_seed, beta_signup_at, signup_method from users where privy_did = $1', [did],
    );
    const r = rows[0];
    res.json(me({ address, solanaAddress: r.solana_address, avatarSeed: r.avatar_seed, memberSince: r.beta_signup_at, signupMethod: r.signup_method, avatarUrl: await avatarUrl(did) }));
  } catch (e) {
    next(e);
  }
});

authRouter.get('/me', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  try {
    res.json(me({ ...req.user, avatarUrl: await avatarUrl(req.user.did) }));
  } catch (e) {
    next(e);
  }
});

// Profile picture upload. The browser sends a ≤128 px PNG/JPEG/WebP as a data URL.
// Checked by magic bytes, not by the claimed type; SVG is refused (it can carry script).
const MAGIC = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
};
const MAX_AVATAR_BYTES = 40 * 1024;

authRouter.post('/avatar', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.image ?? ''));
  if (!m) return res.status(400).json({ error: 'bad_image' });
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_AVATAR_BYTES || !MAGIC[m[1]](bytes)) return res.status(400).json({ error: 'bad_image' });
  try {
    const key = `rl:avatar:${req.user.did}:${Math.floor(Date.now() / 3600000)}`;
    const [[, n]] = await req.app.locals.redis.multi().incr(key).expire(key, 3700).exec();
    if (n > 20) return res.status(429).json({ error: 'rate_limited' });
    await db.query('update users set avatar_mime = $2, avatar_data = $3 where privy_did = $1', [req.user.did, m[1], bytes]);
    res.json(me({ ...req.user, avatarUrl: `data:${m[1]};base64,${bytes.toString('base64')}` }));
  } catch (e) {
    next(e);
  }
});

authRouter.delete('/avatar', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  try {
    await db.query('update users set avatar_mime = null, avatar_data = null where privy_did = $1', [req.user.did]);
    res.json(me({ ...req.user, avatarUrl: null }));
  } catch (e) {
    next(e);
  }
});

/** Ends backx sessions and blocks their Privy sessions from logging back in. Old entries are pruned
 *  (Privy sessions do not outlive 90 days). */
async function revoke(where, arg) {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into revoked_privy_sids (privy_sid, privy_did)
         select distinct privy_sid, privy_did from sessions where ${where} and privy_sid is not null
       on conflict (privy_sid) do nothing`, [arg]);
    await client.query(`update sessions set revoked_at = now() where ${where} and revoked_at is null`, [arg]);
    await client.query("delete from revoked_privy_sids where revoked_at < now() - interval '90 days'");
    await client.query('commit');
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

authRouter.post('/logout', async (req, res, next) => {
  try {
    if (req.sessionHash) await revoke('token_hash = $1', req.sessionHash);
    setCookie(res, '', 0);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

authRouter.post('/logout-all', async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  try {
    await revoke('privy_did = $1', req.user.did);
    setCookie(res, '', 0);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
