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

// Admin wallets: comma-separated EVM addresses (the admin's backx embedded wallet).
function wallets(raw) {
  const list = (raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const a of list) if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error(`ADMIN_WALLETS has an invalid address: ${a}`);
  return new Set(list);
}

// Keepers that may report health (docs/KEEPERS.md): "id:gasAddress:ed25519PublicKeyBase64,...", max 64. Optional.
function keeperList(raw) {
  const out = [];
  for (const item of (raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [id, address, pub] = item.split(':');
    if (!/^[a-z0-9-]{1,32}$/.test(id || '')) throw new Error(`KEEPERS: bad id ${id}`);
    if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) throw new Error(`KEEPERS: bad address for ${id}`);
    if (!/^[A-Za-z0-9+/=]{40,80}$/.test(pub || '')) throw new Error(`KEEPERS: bad public key for ${id}`);
    out.push({ id, address: address.toLowerCase(), pub });
  }
  if (out.length > 64) throw new Error('KEEPERS: at most 64');
  if (new Set(out.map((k) => k.id)).size !== out.length) throw new Error('KEEPERS: duplicate id');
  return out;
}

function mcpKey(raw) {
  const v = raw?.trim();
  if (!v) return null;
  if (!/^[A-Za-z0-9+/=]{40,80}$/.test(v)) throw new Error('MCP_PUBLIC_KEY must be the base64 SPKI from mcp.backx.trade/.well-known/backx-mcp-key');
  return v;
}

export const config = {
  isProd,
  port: Number(process.env.PORT) || 8080,
  allowedOrigins: origins(required('ALLOWED_ORIGINS')),
  databaseUrl: required('DATABASE_URL'),
  redisUrl: required('REDIS_URL'),
  privyAppId: required('PRIVY_APP_ID'),
  // Server-only. Used to read the user's linked accounts from Privy.
  privyAppSecret: required('PRIVY_APP_SECRET'),
  adminWallets: wallets(process.env.ADMIN_WALLETS),
  // Requests per minute per IP across /api.
  rateLimitPerMin: Number(process.env.RATE_LIMIT_PER_MIN) || 120,
  keepers: keeperList(process.env.KEEPERS),
  // MCP (owner 2026-10-26): where mcp.backx.trade lives, and its public key (base64 SPKI ed25519, shown at
  // <MCP_URL>/.well-known/backx-mcp-key). Without MCP_PUBLIC_KEY the internal MCP routes stay closed.
  mcpUrl: (process.env.MCP_URL?.trim() || 'https://mcp.backx.trade').replace(/\/+$/, ''),
  mcpPublicKey: mcpKey(process.env.MCP_PUBLIC_KEY),
  // This API's own public address: the issuer of MCP grants (mcp.backx.trade's API_URL must be the same).
  apiPublicUrl: (process.env.API_PUBLIC_URL?.trim() || 'https://api.backx.trade').replace(/\/+$/, ''),
};
