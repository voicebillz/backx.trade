import express from 'express';
import { RPC, rpc } from './wallet.js';
import { universe } from './markets.js';
import { CHAINS as MARKET_CHAINS } from './chains.js';

// Same-chain swaps in the user's own wallet, routed by LI.FI across DEXes. The one cross-chain route is
// /move-usdc: USDC from the user's wallet to the market's reserve currency on another chain, to the SAME address.
// The server only quotes and checks; the user's Privy wallet signs. Every quote is built for
// the signed-in user's own address and only ever points at the LI.FI contract.
const CHAINS = {
  ethereum: { id: 1, cg: 'ethereum', native: { symbol: 'ETH', cgId: 'ethereum' } },
  base: { id: 8453, cg: 'base', native: { symbol: 'ETH', cgId: 'ethereum' } },
  bsc: { id: 56, cg: 'binance-smart-chain', native: { symbol: 'BNB', cgId: 'binancecoin' } },
};
const NATIVE = '0x0000000000000000000000000000000000000000';
// Stablecoins pinned per chain: on BNB Chain they are separate "Binance-Peg" coins outside our universe.
const STABLES = {
  ethereum: [['usd-coin', 'USDC', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'], ['tether', 'USDT', '0xdac17f958d2ee523a2206206994597c13d831ec7']],
  base: [['usd-coin', 'USDC', '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'], ['tether', 'USDT', '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2']],
  bsc: [['usd-coin', 'USDC', '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d'], ['tether', 'USDT', '0x55d398326f99059ff775485246999027b3197955']],
};
// LI.FI Diamond: the only contract a swap or approval may target (same address on these chains).
const LIFI_DIAMOND = '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae';
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
// Refuse routes that lose more than this vs. fair USD value (fees + impact + slippage). The UI asks for an
// explicit confirmation above 3 %.
const MAX_LOSS = 0.1;
// How each chain keeps swaps out of a public mempool (shown in the UI; the wallet uses these RPCs).
const MEV = {
  ethereum: 'Private submission via MEV Blocker',
  base: 'Sequencer ordering, no public mempool',
  bsc: 'Private submission via PancakeSwap MEV Guard',
};

/** coingecko id → contract address per supported chain. Refreshed daily. */
async function platforms(redis) {
  const cached = await redis.get('platforms:v1');
  if (cached) return JSON.parse(cached);
  const r = await fetch('https://api.coingecko.com/api/v3/coins/list?include_platform=true', { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`coins/list ${r.status}`);
  const map = {};
  for (const c of await r.json()) {
    const p = {};
    for (const [key, ch] of Object.entries(CHAINS)) {
      const a = c.platforms?.[ch.cg];
      if (a && isAddr(a)) p[key] = a.toLowerCase();
    }
    if (Object.keys(p).length) map[c.id] = p;
  }
  await redis.set('platforms:v1', JSON.stringify(map), 'EX', 86400);
  return map;
}

async function tokenInfo(redis, chain, address) {
  const key = `lifi:token:${chain}:${address}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const r = await fetch(`https://li.quest/v1/token?chain=${CHAINS[chain].id}&token=${address}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const t = await r.json();
  if (!Number.isInteger(t.decimals) || t.decimals < 0 || t.decimals > 36) return null;
  const info = { decimals: t.decimals, symbol: String(t.symbol).slice(0, 16), priceUSD: Number(t.priceUSD) || null };
  await redis.set(key, JSON.stringify(info), 'EX', 3600);
  return info;
}

/** Decimal string → base units, rounded DOWN. */
function toUnits(v, decimals) {
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
function fromUnits(u, decimals) {
  const s = u.toString().padStart(decimals + 1, '0');
  const frac = decimals ? s.slice(-decimals).replace(/0+$/, '') : '';
  return (decimals ? s.slice(0, -decimals) : s) + (frac ? '.' + frac : '');
}

async function balanceOf(chain, token, owner) {
  if (token === NATIVE) return BigInt(await rpc(RPC[chain], 'eth_getBalance', [owner, 'latest']));
  const out = await rpc(RPC[chain], 'eth_call', [{ to: token, data: '0x70a08231' + owner.slice(2).padStart(64, '0') }, 'latest']);
  return out && out !== '0x' ? BigInt(out) : 0n;
}
async function allowance(chain, token, owner, spender) {
  const data = '0xdd62ed3e' + owner.slice(2).padStart(64, '0') + spender.slice(2).padStart(64, '0');
  const out = await rpc(RPC[chain], 'eth_call', [{ to: token, data }, 'latest']);
  return out && out !== '0x' ? BigInt(out) : 0n;
}

function parseCommon(req) {
  const chain = String(req.query.chain || '');
  if (!CHAINS[chain]) return { error: 'bad_chain' };
  const norm = (a) => String(a || '').toLowerCase();
  return { chain, from: norm(req.query.from), to: norm(req.query.to) };
}

export const swapRouter = express.Router();
swapRouter.use((req, res, next) => (req.user ? next() : res.status(401).json({ error: 'unauthorized' })));

/** Every listed coin that has a contract on this chain, plus the chain's native coin. */
swapRouter.get('/tokens', async (req, res) => {
  const chain = String(req.query.chain || '');
  if (!CHAINS[chain]) return res.status(400).json({ error: 'bad_chain' });
  const { redis } = req.app.locals;
  try {
    const [list, plat] = await Promise.all([universe(redis), platforms(redis)]);
    const native = list.find((m) => m.id === CHAINS[chain].native.cgId);
    const items = [{
      id: CHAINS[chain].native.cgId, symbol: CHAINS[chain].native.symbol, name: native?.name ?? CHAINS[chain].native.symbol,
      image: native?.image ?? null, address: NATIVE, price: native?.price ?? null, native: true,
    }];
    const seen = new Set([NATIVE]);
    // Native, then stablecoins, then every other listed coin by market cap.
    for (const [id, symbol, address] of STABLES[chain]) {
      const m = list.find((x) => x.id === id);
      items.push({ id, symbol, name: m?.name ?? symbol, image: m?.image ?? null, address, price: m?.price ?? 1 });
      seen.add(address);
    }
    const byCap = [...list].sort((a, b) => b.marketCap - a.marketCap);
    for (const m of byCap) {
      const a = plat[m.id]?.[chain];
      if (!a || seen.has(a)) continue;
      seen.add(a);
      items.push({ id: m.id, symbol: m.symbol, name: m.name, image: m.image, address: a, price: m.price });
    }
    res.json({ chain, items });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});

/** Balance of one token in the user's own wallet (for Max). */
swapRouter.get('/balance', async (req, res) => {
  const { chain, from, error } = parseCommon(req);
  if (error || !isAddr(from)) return res.status(400).json({ error: error || 'bad_token' });
  try {
    const info = from === NATIVE ? { decimals: 18 } : await tokenInfo(req.app.locals.redis, chain, from);
    if (!info) return res.status(400).json({ error: 'unknown_token' });
    const raw = await balanceOf(chain, from, req.user.address);
    res.json({ amount: fromUnits(raw, info.decimals), decimals: info.decimals });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});

/** Route + ready-to-sign transactions. amount is a decimal string, rounded down to base units. */
swapRouter.get('/quote', async (req, res) => {
  const { chain, from, to, error } = parseCommon(req);
  if (error) return res.status(400).json({ error });
  if (!isAddr(from) || !isAddr(to) || from === to) return res.status(400).json({ error: 'bad_token' });
  const slippage = Math.min(Math.max(Number(req.query.slippage) || 0.005, 0.001), 0.03);
  const { redis } = req.app.locals;
  const owner = req.user.address;
  try {
    const info = from === NATIVE ? { decimals: 18 } : await tokenInfo(redis, chain, from);
    if (!info) return res.status(400).json({ error: 'unknown_token' });
    const amount = toUnits(String(req.query.amount || ''), info.decimals);
    if (amount == null || amount <= 0n) return res.status(400).json({ error: 'bad_amount' });
    const bal = await balanceOf(chain, from, owner);
    if (bal < amount) return res.status(400).json({ error: 'insufficient', balance: fromUnits(bal, info.decimals) });

    const qs = new URLSearchParams({
      fromChain: String(CHAINS[chain].id), toChain: String(CHAINS[chain].id), fromToken: from, toToken: to,
      fromAmount: amount.toString(), fromAddress: owner, toAddress: owner, slippage: String(slippage),
      integrator: 'backx', order: 'CHEAPEST', allowBridges: 'none',
    });
    const r = await fetch(`https://li.quest/v1/quote?${qs}`, { signal: AbortSignal.timeout(15000) });
    const q = await r.json();
    if (!r.ok) return res.status(400).json({ error: 'no_route', message: String(q.message || '').slice(0, 160) });

    // Never hand the user a transaction we did not expect.
    const tx = q.transactionRequest;
    if (!tx || typeof tx.data !== 'string' || !/^0x[0-9a-fA-F]+$/.test(tx.data) || String(tx.to).toLowerCase() !== LIFI_DIAMOND || Number(tx.chainId) !== CHAINS[chain].id
      || String(tx.from || owner).toLowerCase() !== owner || String(q.action?.toAddress || owner).toLowerCase() !== owner) {
      return res.status(502).json({ error: 'route_rejected' });
    }
    const spender = String(q.estimate?.approvalAddress || '').toLowerCase();
    let approval = null;
    if (from !== NATIVE) {
      if (spender !== LIFI_DIAMOND) return res.status(502).json({ error: 'route_rejected' });
      if ((await allowance(chain, from, owner, spender)) < amount) {
        // Exact amount only: the swap spends it back to zero.
        approval = { to: from, data: '0x095ea7b3' + spender.slice(2).padStart(64, '0') + amount.toString(16).padStart(64, '0') };
      }
    }
    const toDec = q.action.toToken.decimals;
    // Sandwich / bad-route guard: what you get must be close to what you pay, at independent USD prices.
    const fromUsd = Number(q.estimate.fromAmountUSD) || 0;
    const toUsd = Number(q.estimate.toAmountUSD) || 0;
    const loss = fromUsd > 0 && toUsd > 0 ? 1 - toUsd / fromUsd : null;
    if (loss != null && loss > MAX_LOSS) return res.status(400).json({ error: 'price_impact', loss });
    res.json({
      quotedAt: Date.now(),
      loss,
      chainId: CHAINS[chain].id,
      fromAmount: fromUnits(amount, info.decimals),
      toAmount: fromUnits(BigInt(q.estimate.toAmount), toDec),
      toAmountMin: fromUnits(BigInt(q.estimate.toAmountMin), toDec),
      fromUsd: Number(q.estimate.fromAmountUSD) || null,
      toUsd: Number(q.estimate.toAmountUSD) || null,
      gasUsd: (q.estimate.gasCosts || []).reduce((s, g) => s + (Number(g.amountUSD) || 0), 0),
      feeUsd: (q.estimate.feeCosts || []).reduce((s, f) => s + (Number(f.amountUSD) || 0), 0),
      route: String(q.toolDetails?.name || q.tool || 'DEX').slice(0, 40),
      mev: MEV[chain],
      slippage,
      approval,
      tx: { to: LIFI_DIAMOND, data: tx.data, value: BigInt(tx.value || '0x0').toString() },
    });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});

/** Receipt status for a transaction the user just sent (read-only, any user's own tx hash). */
swapRouter.get('/receipt', async (req, res) => {
  const chain = String(req.query.chain || '');
  const hash = String(req.query.hash || '');
  if (!CHAINS[chain] || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return res.status(400).json({ error: 'bad_request' });
  try {
    const r = await rpc(RPC[chain], 'eth_getTransactionReceipt', [hash]);
    res.json({ status: r ? (r.status === '0x1' ? 'success' : 'reverted') : 'pending' });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});

// ---- Move USDC to the chain a market lives on (owner 2026-10-19) ---------------------------------------------
// Investing is paid in the market chain's reserve stablecoin (USDC where it exists). If the user's USDC sits on
// another chain, the app moves it first with a LI.FI bridge route. Same rules as swaps: the user's own wallet
// signs, the money only ever goes to the user's own address, the transaction and approval may only target the
// LI.FI Diamond, approvals are for the exact amount, and routes that lose more than 3 % are refused.
const MAX_BRIDGE_LOSS = 0.03;

swapRouter.get('/move-usdc', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const chain = String(req.query.from || '');
  const toChainId = Number(req.query.toChainId);
  const target = MARKET_CHAINS[toChainId];
  if (!CHAINS[chain] || !target || CHAINS[chain].id === toChainId) return res.status(400).json({ error: 'bad_chain' });
  if (!target.stable) return res.status(409).json({ error: 'no_stable', message: `${target.name} has no reserve stablecoin set yet.` });
  const owner = req.user.address;
  const usdc = STABLES[chain][0][2];
  try {
    const info = await tokenInfo(req.app.locals.redis, chain, usdc);
    if (!info) return res.status(503).json({ error: 'unavailable' });
    const amount = toUnits(String(req.query.amount || ''), info.decimals);
    if (amount == null || amount <= 0n) return res.status(400).json({ error: 'bad_amount' });
    const bal = await balanceOf(chain, usdc, owner);
    if (bal < amount) return res.status(400).json({ error: 'insufficient', balance: fromUnits(bal, info.decimals) });

    const qs = new URLSearchParams({
      fromChain: String(CHAINS[chain].id), toChain: String(toChainId), fromToken: usdc, toToken: target.stable.address,
      fromAmount: amount.toString(), fromAddress: owner, toAddress: owner, slippage: '0.005', integrator: 'backx', order: 'CHEAPEST',
    });
    const r = await fetch(`https://li.quest/v1/quote?${qs}`, { signal: AbortSignal.timeout(20000) });
    const q = await r.json();
    if (!r.ok) return res.status(400).json({ error: 'no_route', message: String(q.message || '').slice(0, 160) });

    const tx = q.transactionRequest;
    if (!tx || typeof tx.data !== 'string' || !/^0x[0-9a-fA-F]+$/.test(tx.data) || String(tx.to).toLowerCase() !== LIFI_DIAMOND
      || Number(tx.chainId) !== CHAINS[chain].id || String(tx.from || owner).toLowerCase() !== owner
      || String(q.action?.toAddress || '').toLowerCase() !== owner || Number(q.action?.toChainId) !== toChainId
      || String(q.action?.toToken?.address || '').toLowerCase() !== target.stable.address) {
      return res.status(502).json({ error: 'route_rejected' });
    }
    if (BigInt(tx.value || '0x0') !== 0n) return res.status(502).json({ error: 'route_rejected' }); // USDC in, no ETH out of the wallet
    const spender = String(q.estimate?.approvalAddress || '').toLowerCase();
    if (spender !== LIFI_DIAMOND) return res.status(502).json({ error: 'route_rejected' });
    const approval = (await allowance(chain, usdc, owner, spender)) < amount
      ? { to: usdc, data: '0x095ea7b3' + spender.slice(2).padStart(64, '0') + amount.toString(16).padStart(64, '0') }
      : null;
    const fromUsd = Number(q.estimate.fromAmountUSD) || 0;
    const toUsd = Number(q.estimate.toAmountUSD) || 0;
    const loss = fromUsd > 0 && toUsd > 0 ? 1 - toUsd / fromUsd : null;
    if (loss == null || loss > MAX_BRIDGE_LOSS) return res.status(400).json({ error: 'price_impact', loss });
    res.json({
      quotedAt: Date.now(), loss, chainId: CHAINS[chain].id, toChainId,
      fromAmount: fromUnits(amount, info.decimals),
      toAmountMin: fromUnits(BigInt(q.estimate.toAmountMin), q.action.toToken.decimals),
      toSymbol: target.stable.symbol, toChainName: target.name,
      seconds: Number(q.estimate.executionDuration) || null,
      route: String(q.toolDetails?.name || q.tool || 'Bridge').slice(0, 40),
      approval,
      tx: { to: LIFI_DIAMOND, data: tx.data, value: '0' },
    });
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});
