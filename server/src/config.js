// All configuration comes from the environment. Missing required values stop
// the server at boot: no fallbacks, no defaults that silently open things up.

const isProd = process.env.NODE_ENV === 'production';

function required(name) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env ${name}`);
  return v;
}

function origins(raw) {
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const o of list) {
    const u = new URL(o); // throws on garbage
    if (u.origin !== o) throw new Error(`ALLOWED_ORIGINS entry must be a bare origin: ${o}`);
    if (isProd && u.protocol !== 'https:') throw new Error(`ALLOWED_ORIGINS must be https in production: ${o}`);
    if (o.includes('*')) throw new Error('ALLOWED_ORIGINS does not accept wildcards');
  }
  if (!list.length) throw new Error('ALLOWED_ORIGINS is empty');
  return new Set(list);
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 8080,
  allowedOrigins: origins(required('ALLOWED_ORIGINS')),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  // Needed once login is wired; required in production so it is set from day one.
  privyAppId: isProd ? required('PRIVY_APP_ID') : process.env.PRIVY_APP_ID?.trim() || '',
  // Requests per minute per IP across /api.
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN) || 120,
};
