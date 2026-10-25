// Listing requirements (owner 2026-10-20). A coin only gets contracts if it passes these, checked live by the
// server (GeckoTerminal for market data, GoPlus for an automated on-chain token audit). The admin portal shows the
// same list as the "recipe" in the listing window, and deploy re-runs the checks: a failing coin is rejected.

import { CHAINS, LAUNCH_CHAIN_IDS, NATIVE_CG } from './chains.js';
import { rpc } from './wallet.js';

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

/** Tier from market cap AND liquidity: the stricter of the two decides. Max multiplication and minimum margin.
 *  Short (owner 2026-10-25, sim docs/backx/sim/short_roof.py): same caps as Hedge, a slightly larger margin
 *  (pumps gap harder than crashes) and a profit roof: the price fall at which a short closes automatically. */
export const TIERS = [
  { name: 'Major', minCap: 10e9, minLiq: 20e6, maxM: 20, minMarginBps: 150, shortMarginBps: 200, roofBps: 8000 },
  { name: 'Large', minCap: 1e9, minLiq: 5e6, maxM: 5, minMarginBps: 200, shortMarginBps: 300, roofBps: 7000 },
  { name: 'Mid', minCap: 100e6, minLiq: 2e6, maxM: 3, minMarginBps: 300, shortMarginBps: 400, roofBps: 6000 },
  { name: 'Small', minCap: RULES.minMarketCapUsd, minLiq: RULES.minLiquidityUsd, maxM: 2, minMarginBps: 400, shortMarginBps: 500, roofBps: 5000 },
];

const num = (v) => (v == null || v === '' ? null : Number(v));
const flag = (v) => v === '1' || v === 1;

// GeckoTerminal's free API allows about 10 calls a minute (measured 2026-10-23): space calls 6.5 s apart and
// retry once on 429.
let gtNext = 0;
async function getJson(url, retry = true) {
  if (url.startsWith('https://api.geckoterminal.com/')) {
    const wait = Math.max(0, gtNext - Date.now());
    gtNext = Math.max(Date.now(), gtNext) + 6500;
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }
  const r = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
  if (r.status === 429 && retry) { await new Promise((x) => setTimeout(x, 15000)); return getJson(url, false); }
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/**
 * Runs every check for one token. Returns { pass, tier, maxM, minMarginBps, maxPositionUsd, market, items[] } where
 * each item is { key, label, ok, value, required }. Cached 10 minutes in Redis (both APIs are rate limited).
 */
export async function listingReport(redis, chainId, token, opts = {}) {
  const key = `listing:v1:${chainId}:${token}${opts.underlyingCap ? ':u' : ''}`;
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

  // A wrapped major (cbBTC, WETH, BTCB…) is priced as the coin it wraps: use that coin's market cap.
  const marketCap = opts.underlyingCap ?? num(a.market_cap_usd) ?? num(a.fdv_usd);
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
    shortMarginBps: tier?.shortMarginBps ?? 500,
    roofBps: tier?.roofBps ?? 5000,
    maxPositionUsd: liquidity ? Math.floor(liquidity * RULES.maxPositionShareOfLiquidity) : 0,
    maxOpenUsd: liquidity ? Math.floor(liquidity * RULES.maxOpenShareOfLiquidity) : 0,
    market: { marketCap, liquidity, volume, ageDays, logo: typeof a.image_url === 'string' && a.image_url.startsWith('https://coin-images.coingecko.com/') ? a.image_url.slice(0, 300) : null },
    items,
    sources: { geckoterminal: gt.status === 'fulfilled', goplus: !!sec },
  };
  await redis.set(key, JSON.stringify(report), 'EX', 600);
  return report;
}

// ---- best chain to list a coin on (owner 2026-10-23) ----------------------------------------------------------------
// Majors exist on every launch chain, usually as a wrapped token with its own symbol. For a coin we find its biggest
// token on each launch chain (GeckoTerminal pool search), run the full listing check there, and pick:
// 1) a chain where it passes, 2) the highest tier (more multiplication allowed, set by liquidity on that chain),
// 3) the cheapest liquidation (gas), 4) the deepest liquidity. Gas is an estimate: gas price × 450k gas; on Base the
// L1 data fee comes on top.
export const UNDERLYING_CG = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', BNB: 'binancecoin' };
export const ALIASES = {
  BTC: ['cbBTC', 'WBTC', 'BTCB', 'BTC.b', 'BTC'], ETH: ['WETH', 'ETH'], SOL: ['SOL', 'WSOL'], BNB: ['WBNB', 'BNB'],
};
const TIER_RANK = { Major: 0, Large: 1, Mid: 2, Small: 3 };
const LIQ_GAS = 450_000n;

async function nativeUsd(redis) {
  const c = await redis.get('price:native:v1');
  if (c) return JSON.parse(c);
  const ids = [...new Set(Object.values(NATIVE_CG))].join(',');
  const j = await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
  const out = Object.fromEntries(Object.entries(j).map(([k, v]) => [k, v.usd]));
  await redis.set('price:native:v1', JSON.stringify(out), 'EX', 300);
  return out;
}

/** The token with the most DEX liquidity on `net` whose symbol is one of `symbols` (case-insensitive). */
async function findToken(net, symbols) {
  const want = new Set(symbols.map((x) => x.toLowerCase()));
  const best = new Map();
  for (const q of symbols) {
    const j = await getJson(`https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(q)}&network=${net}&page=1`).catch(() => null);
    for (const p of j?.data ?? []) {
      const name = String(p.attributes?.name || '');
      const reserve = Number(p.attributes?.reserve_in_usd || 0);
      for (const side of ['base_token', 'quote_token']) {
        const id = p.relationships?.[side]?.data?.id || '';
        const addr = id.split('_').pop();
        const sym = (side === 'base_token' ? name.split(' / ')[0] : name.split(' / ')[1]?.split(' ')[0]) || '';
        // 0x000…0 is GeckoTerminal's native coin: not a token the contracts can hold or GoPlus can audit.
        if (!/^0x[0-9a-f]{40}$/.test(addr) || /^0x0{40}$/.test(addr) || !want.has(sym.toLowerCase())) continue;
        const cur = best.get(addr) || { address: addr, symbol: sym, poolLiquidity: 0 };
        cur.poolLiquidity += reserve;
        best.set(addr, cur);
      }
    }
    // No early stop: every alias is searched so the main wrapper wins (WBTC on Arbitrum, ETH on BNB Chain).
  }
  return [...best.values()].sort((a, b) => b.poolLiquidity - a.poolLiquidity)[0] || null;
}

export async function bestChain(redis, symbol, chainIds = LAUNCH_CHAIN_IDS) {
  const key = `listing:best:v1:${symbol.toUpperCase()}:${chainIds.join(',')}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const symbols = ALIASES[symbol.toUpperCase()] ?? [symbol];
  const prices = await nativeUsd(redis).catch(() => ({}));
  const cg = UNDERLYING_CG[symbol.toUpperCase()];
  const underlyingCap = cg ? await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${cg}&vs_currencies=usd&include_market_cap=true`)
    .then((j) => j?.[cg]?.usd_market_cap ?? null).catch(() => null) : null;
  const rows = [];
  for (const chainId of chainIds) rows.push(await (async () => {
    const token = await findToken(GT_NETWORK[chainId], symbols).catch(() => null);
    let gasUsd = null;
    try {
      const gp = BigInt(await rpc(CHAINS[chainId].rpc, 'eth_gasPrice', []));
      const px = prices[NATIVE_CG[chainId]];
      if (px) gasUsd = Number(gp * LIQ_GAS) / 1e18 * px;
    } catch { /* unknown gas: ranked last on cost */ }
    if (!token) return { chainId, chain: CHAINS[chainId].name, token: null, pass: false, tier: null, maxM: 0, liquidity: null, gasUsd };
    const r = await listingReport(redis, chainId, token.address, { underlyingCap }).catch(() => null);
    return { chainId, chain: CHAINS[chainId].name, token: { address: token.address, symbol: token.symbol }, pass: !!r?.pass, tier: r?.tier ?? null,
      maxM: r?.maxM ?? 0, liquidity: r?.market?.liquidity ?? null, maxPositionUsd: r?.maxPositionUsd ?? 0, gasUsd };
  })());
  rows.sort((a, b) => (Number(b.pass) - Number(a.pass)) || ((TIER_RANK[a.tier] ?? 9) - (TIER_RANK[b.tier] ?? 9))
    || ((a.gasUsd ?? Infinity) - (b.gasUsd ?? Infinity)) || ((b.liquidity ?? 0) - (a.liquidity ?? 0)));
  const out = { symbol: symbol.toUpperCase(), best: rows[0]?.pass ? rows[0].chainId : null, rows, checkedAt: new Date().toISOString() };
  await redis.set(key, JSON.stringify(out), 'EX', 3600);
  return out;
}

/** Cached result, or null after starting the check in the background (it takes a minute or two). */
export async function bestChainCached(redis, symbol) {
  const sym = symbol.toUpperCase();
  const hit = await redis.get(`listing:best:v1:${sym}:${LAUNCH_CHAIN_IDS.join(',')}`);
  if (hit) return JSON.parse(hit);
  if (await redis.set(`listing:best:job:${sym}`, '1', 'EX', 300, 'NX') === 'OK') {
    bestChain(redis, sym).catch((e) => console.error('bestChain', sym, e.message)).finally(() => redis.del(`listing:best:job:${sym}`));
  }
  return null;
}
