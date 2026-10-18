import express from 'express';

// Read-only balance lookups for the signed-in user's own wallets. Nothing here signs or sends.
// Public RPCs by default; set RPC_* in Railway to use keyed endpoints (server-side only).
export const RPC = {
  ethereum: process.env.RPC_ETHEREUM || 'https://ethereum-rpc.publicnode.com',
  base: process.env.RPC_BASE || 'https://base-rpc.publicnode.com',
  bsc: process.env.RPC_BSC || 'https://bsc-dataseed.bnbchain.org',
  solana: process.env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com',
};

// What we show. `price` is the CoinGecko id.
const EVM_ASSETS = [
  { chain: 'ethereum', chainName: 'Ethereum', symbol: 'ETH', name: 'Ether', decimals: 18, price: 'ethereum' },
  { chain: 'ethereum', chainName: 'Ethereum', symbol: 'USDC', name: 'USD Coin', decimals: 6, price: 'usd-coin', token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
  { chain: 'base', chainName: 'Base', symbol: 'ETH', name: 'Ether', decimals: 18, price: 'ethereum' },
  { chain: 'base', chainName: 'Base', symbol: 'USDC', name: 'USD Coin', decimals: 6, price: 'usd-coin', token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' },
  { chain: 'bsc', chainName: 'BNB Chain', symbol: 'BNB', name: 'BNB', decimals: 18, price: 'binancecoin' },
  { chain: 'bsc', chainName: 'BNB Chain', symbol: 'USDC', name: 'USD Coin', decimals: 18, price: 'usd-coin', token: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' },
];
const SOL_ASSETS = [
  { chain: 'solana', chainName: 'Solana', symbol: 'SOL', name: 'Solana', decimals: 9, price: 'solana' },
  { chain: 'solana', chainName: 'Solana', symbol: 'USDC', name: 'USD Coin', decimals: 6, price: 'usd-coin', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
];

export async function rpc(url, method, params) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'rpc error');
  return j.result;
}

/** Exact decimal string from base units, no floating point. */
function units(raw, decimals) {
  const s = raw.toString().padStart(decimals + 1, '0');
  const int = s.slice(0, -decimals) || '0';
  const frac = s.slice(-decimals).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

async function evmBalance(a, address) {
  if (!a.token) return BigInt(await rpc(RPC[a.chain], 'eth_getBalance', [address, 'latest']));
  // balanceOf(address)
  const data = '0x70a08231' + address.slice(2).padStart(64, '0');
  const out = await rpc(RPC[a.chain], 'eth_call', [{ to: a.token, data }, 'latest']);
  return out && out !== '0x' ? BigInt(out) : 0n;
}

async function solBalance(a, address) {
  if (!a.mint) return BigInt((await rpc(RPC.solana, 'getBalance', [address])).value);
  const res = await rpc(RPC.solana, 'getTokenAccountsByOwner', [address, { mint: a.mint }, { encoding: 'jsonParsed' }]);
  return res.value.reduce((sum, acc) => sum + BigInt(acc.account.data.parsed.info.tokenAmount.amount), 0n);
}

async function prices(redis) {
  const cached = await redis.get('prices:v1');
  if (cached) return JSON.parse(cached);
  const ids = [...new Set([...EVM_ASSETS, ...SOL_ASSETS].map((a) => a.price))].join(',');
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`prices ${r.status}`);
  const p = await r.json();
  await redis.set('prices:v1', JSON.stringify(p), 'EX', 60);
  return p;
}

export const walletRouter = express.Router();

walletRouter.get('/balances', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'unauthorized' });
  const { redis } = req.app.locals;
  const { address, solanaAddress } = req.user;
  const key = `bal:v1:${address}:${solanaAddress || '-'}`;
  try {
    const cached = await redis.get(key);
    if (cached) return res.type('json').send(cached);

    const p = await prices(redis).catch(() => ({}));
    const jobs = [
      ...EVM_ASSETS.map((a) => evmBalance(a, address).then((raw) => [a, raw])),
      ...(solanaAddress ? SOL_ASSETS.map((a) => solBalance(a, solanaAddress).then((raw) => [a, raw])) : []),
    ];
    const settled = await Promise.allSettled(jobs);
    const assets = [];
    let failed = 0;
    for (const s of settled) {
      if (s.status !== 'fulfilled') { failed++; continue; }
      const [a, raw] = s.value;
      const amount = units(raw, a.decimals);
      const price = p[a.price]?.usd ?? null;
      assets.push({
        chain: a.chain, chainName: a.chainName, symbol: a.symbol, name: a.name,
        amount, price, usd: price == null ? null : Number(amount) * price,
      });
    }
    const body = JSON.stringify({
      totalUsd: assets.reduce((s, a) => s + (a.usd || 0), 0),
      assets,
      partial: failed > 0,
      updatedAt: new Date().toISOString(),
    });
    // Short cache: protects the RPCs, still feels live.
    await redis.set(key, body, 'EX', failed ? 5 : 20);
    res.type('json').send(body);
  } catch {
    res.status(503).json({ error: 'unavailable' });
  }
});
