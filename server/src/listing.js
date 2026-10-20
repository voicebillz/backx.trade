// Listing requirements (owner 2026-10-20). A coin only gets contracts if it passes these, checked live by the
// server (GeckoTerminal for market data, GoPlus for an automated on-chain token audit). The admin portal shows the
// same list as the "recipe" in the listing window, and deploy re-runs the checks: a failing coin is rejected.

const GT_NETWORK = { 4663: 'robinhood', 1: 'eth', 8453: 'base', 56: 'bsc', 42161: 'arbitrum', 10: 'optimism', 137: 'polygon_pos', 43114: 'avax' };

/** Hard minimums for any listing. */
export const RULES = {
  minMarketCapUsd: 10_000_000,
  minLiquidityUsd: 1_000_000,     // DEX liquidity on the coin's chain (all pools)
  minVolume24hUsd: 500_000,
  minPoolAgeDays: 30,
  maxPositionShareOfLiquidity: 0.005, // max position ≈ 0.5 % of DEX liquidity (≈ ≤ 0.5 % price impact)
  // All open hedges together ≤ 10 % of DEX liquidity: if every position is liquidated in the same crash, the keeper
  // can still sell them in a few batches inside the 2 % liquidation guard. 5 % is the recommended setting.
  maxOpenShareOfLiquidity: 0.10,
};

/** Tier from market cap AND liquidity: the stricter of the two decides. Max multiplication and minimum margin. */
export const TIERS = [
  { name: 'Major', minCap: 10e9, minLiq: 20e6, maxM: 20, minMarginBps: 150 },
  { name: 'Large', minCap: 1e9, minLiq: 5e6, maxM: 5, minMarginBps: 200 },
  { name: 'Mid', minCap: 100e6, minLiq: 2e6, maxM: 3, minMarginBps: 300 },
  { name: 'Small', minCap: RULES.minMarketCapUsd, minLiq: RULES.minLiquidityUsd, maxM: 2, minMarginBps: 400 },
];

const num = (v) => (v == null || v === '' ? null : Number(v));
const flag = (v) => v === '1' || v === 1;

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/**
 * Runs every check for one token. Returns { pass, tier, maxM, minMarginBps, maxPositionUsd, market, items[] } where
 * each item is { key, label, ok, value, required }. Cached 10 minutes in Redis (both APIs are rate limited).
 */
export async function listingReport(redis, chainId, token) {
  const key = `listing:v1:${chainId}:${token}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);

  const net = GT_NETWORK[chainId];
  const [gt, pools, gp] = await Promise.allSettled([
    getJson(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${token}`),
    getJson(`https://api.geckoterminal.com/api/v2/networks/${net}/tokens/${token}/pools?page=1`),
    getJson(`https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${token}`),
  ]);
  const a = gt.status === 'fulfilled' ? gt.value?.data?.attributes ?? {} : {};
  const poolList = pools.status === 'fulfilled' ? pools.value?.data ?? [] : [];
  const sec = gp.status === 'fulfilled' ? Object.values(gp.value?.result ?? {})[0] ?? null : null;

  const marketCap = num(a.market_cap_usd) ?? num(a.fdv_usd);
  const liquidity = num(a.total_reserve_in_usd);
  const volume = num(a.volume_usd?.h24);
  const created = poolList.map((p) => Date.parse(p.attributes?.pool_created_at)).filter(Number.isFinite);
  const ageDays = created.length ? Math.floor((Date.now() - Math.min(...created)) / 86_400_000) : null;
  const trusted = sec ? flag(sec.trust_list) : false;
  const taxes = sec ? [sec.buy_tax, sec.sell_tax, sec.transfer_tax].map((t) => Number(t || 0)) : [];

  const items = [
    { key: 'marketData', label: 'Market data found (GeckoTerminal)', ok: gt.status === 'fulfilled' && !!a.symbol, value: a.symbol ?? null, required: true },
    { key: 'marketCap', label: `Market cap ≥ $${RULES.minMarketCapUsd / 1e6}M`, ok: marketCap != null && marketCap >= RULES.minMarketCapUsd, value: marketCap, required: true },
    { key: 'liquidity', label: `DEX liquidity on this chain ≥ $${RULES.minLiquidityUsd / 1e6}M`, ok: liquidity != null && liquidity >= RULES.minLiquidityUsd, value: liquidity, required: true },
    { key: 'volume', label: `24 h volume ≥ $${RULES.minVolume24hUsd / 1e3}k`, ok: volume != null && volume >= RULES.minVolume24hUsd, value: volume, required: true },
    { key: 'age', label: `Trading for ≥ ${RULES.minPoolAgeDays} days`, ok: ageDays != null && ageDays >= RULES.minPoolAgeDays, value: ageDays, required: true },
    { key: 'audit', label: 'Automated token audit available (GoPlus)', ok: !!sec, value: null, required: true },
    { key: 'openSource', label: 'Verified source code', ok: !!sec && flag(sec.is_open_source), value: null, required: true },
    { key: 'honeypot', label: 'Not a honeypot (can be sold)', ok: !!sec && !flag(sec.is_honeypot) && !flag(sec.cannot_sell_all), value: null, required: true },
    { key: 'tax', label: 'No buy, sell or transfer tax', ok: !!sec && taxes.every((t) => t === 0), value: taxes.length ? Math.max(...taxes) : null, required: true },
    { key: 'mint', label: 'No hidden minting', ok: !!sec && (!flag(sec.is_mintable) || trusted), value: null, required: true },
    { key: 'owner', label: 'No hidden owner, no take-back of ownership', ok: !!sec && !flag(sec.hidden_owner) && !flag(sec.can_take_back_ownership), value: null, required: true },
    { key: 'blacklist', label: 'Transfers cannot be paused or blacklisted', ok: !!sec && ((!flag(sec.transfer_pausable) && !flag(sec.is_blacklisted)) || trusted), value: null, required: true },
    { key: 'selfdestruct', label: 'No self-destruct, tax cannot be changed', ok: !!sec && !flag(sec.selfdestruct) && !flag(sec.slippage_modifiable), value: null, required: true },
    { key: 'proxy', label: 'Token code cannot be swapped (not a proxy), or on a trusted list', ok: !!sec && (!flag(sec.is_proxy) || trusted), value: null, required: false },
  ];

  const tier = TIERS.find((t) => (marketCap ?? 0) >= t.minCap && (liquidity ?? 0) >= t.minLiq) ?? null;
  const pass = items.every((i) => !i.required || i.ok) && !!tier;
  const report = {
    pass,
    checkedAt: new Date().toISOString(),
    tier: tier?.name ?? null,
    maxM: tier?.maxM ?? 0,
    minMarginBps: tier?.minMarginBps ?? 500,
    maxPositionUsd: liquidity ? Math.floor(liquidity * RULES.maxPositionShareOfLiquidity) : 0,
    maxOpenUsd: liquidity ? Math.floor(liquidity * RULES.maxOpenShareOfLiquidity) : 0,
    market: { marketCap, liquidity, volume, ageDays, logo: typeof a.image_url === 'string' && a.image_url.startsWith('https://coin-images.coingecko.com/') ? a.image_url.slice(0, 300) : null },
    items,
    sources: { geckoterminal: gt.status === 'fulfilled', goplus: !!sec },
  };
  await redis.set(key, JSON.stringify(report), 'EX', 600);
  return report;
}
