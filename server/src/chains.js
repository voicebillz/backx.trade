// EVM chains backx can run its contracts on (owner 2026-10-19). Addresses checked against LI.FI's token list
// 2026-10-19. Coins from non-EVM chains (Bitcoin, Solana, Cardano, XRP, Dogecoin, …) are listed through their
// wrapped/bridged token on one of these chains (cbBTC, WBTC, Wormhole SOL, Binance-Peg ADA/XRP/DOGE, …): the
// contracts are Solidity and only run on EVM chains.
//
// stable = the reserve currency issuers deposit and traders pay with on that chain (USDC where it exists).
// Robinhood Chain has no USDC on LI.FI yet: its stable is OPEN (owner decides, e.g. Paxos USDG), set RESERVE_STABLE_4663.

const env = (k) => process.env[k]?.trim() || null;

export const CHAINS = {
  4663: { key: 'robinhood', name: 'Robinhood Chain', safePrefix: null, rpc: env('RPC_ROBINHOOD') || 'https://rpc.mainnet.chain.robinhood.com',
    explorer: 'https://robin.etherscan.io', stable: env('RESERVE_STABLE_4663') ? { symbol: env('RESERVE_STABLE_SYMBOL_4663') || 'USD', address: env('RESERVE_STABLE_4663'), decimals: Number(env('RESERVE_STABLE_DECIMALS_4663') || 6) } : null,
    wrappedNative: { symbol: 'WETH', address: '0x0bd7d308f8e1639fab988df18a8011f41eacad73', decimals: 18 } },
  1: { key: 'ethereum', name: 'Ethereum', safePrefix: 'eth', rpc: env('RPC_ETHEREUM') || 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io', stable: { symbol: 'USDC', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
    wrappedNative: { symbol: 'WETH', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', decimals: 18 } },
  8453: { key: 'base', name: 'Base', safePrefix: 'base', rpc: env('RPC_BASE') || 'https://base-rpc.publicnode.com',
    explorer: 'https://basescan.org', stable: { symbol: 'USDC', address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
    wrappedNative: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 } },
  56: { key: 'bsc', name: 'BNB Chain', safePrefix: 'bnb', rpc: env('RPC_BSC') || 'https://bsc-dataseed.bnbchain.org',
    explorer: 'https://bscscan.com', stable: { symbol: 'USDC', address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
    wrappedNative: { symbol: 'WBNB', address: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', decimals: 18 } },
  42161: { key: 'arbitrum', name: 'Arbitrum', safePrefix: 'arb1', rpc: env('RPC_ARBITRUM') || 'https://arb1.arbitrum.io/rpc',
    explorer: 'https://arbiscan.io', stable: { symbol: 'USDC', address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
    wrappedNative: { symbol: 'WETH', address: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1', decimals: 18 } },
  10: { key: 'optimism', name: 'Optimism', safePrefix: 'oeth', rpc: env('RPC_OPTIMISM') || 'https://mainnet.optimism.io',
    explorer: 'https://optimistic.etherscan.io', stable: { symbol: 'USDC', address: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', decimals: 6 },
    wrappedNative: { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18 } },
  137: { key: 'polygon', name: 'Polygon', safePrefix: 'matic', rpc: env('RPC_POLYGON') || 'https://polygon-bor-rpc.publicnode.com',
    explorer: 'https://polygonscan.com', stable: { symbol: 'USDC', address: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6 },
    wrappedNative: { symbol: 'WPOL', address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', decimals: 18 } },
  43114: { key: 'avalanche', name: 'Avalanche', safePrefix: 'avax', rpc: env('RPC_AVALANCHE') || 'https://api.avax.network/ext/bc/C/rpc',
    explorer: 'https://snowtrace.io', stable: { symbol: 'USDC', address: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', decimals: 6 },
    wrappedNative: { symbol: 'WAVAX', address: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7', decimals: 18 } },
};

/** Launch chains (owner 2026-10-23): BackX starts on these four EVM chains and adds the others later. Solana is the
 *  fifth wanted chain but is not EVM: the Solidity contracts cannot run there (it needs its own program), so SOL is
 *  listed through a wrapped SOL token on one of these until then. Native gas token per chain for cost estimates. */
export const LAUNCH_CHAIN_IDS = [4663, 56, 8453, 42161];
export const NATIVE_CG = { 4663: 'ethereum', 56: 'binancecoin', 8453: 'ethereum', 42161: 'ethereum', 1: 'ethereum', 10: 'ethereum', 137: 'polygon-ecosystem-token', 43114: 'avalanche-2' };

/** Safe that owns everything; the same address must exist on each chain we deploy to (Safe multichain deploy). */
export const SAFE = '0xfa408F75490C0412d4a5F45FA7553Aff03249BE4';

export async function ethCall(chainId, to, data) {
  const c = CHAINS[chainId];
  const r = await fetch(c.rpc, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const j = await r.json();
  if (j.error) throw new Error('rpc');
  return j.result;
}

const word = (hex, i) => hex.slice(2 + i * 64, 2 + (i + 1) * 64);

/** ABI string (dynamic) or bytes32-style legacy return. */
export function decodeString(hex) {
  if (!hex || hex === '0x') return null;
  if (hex.length === 66) return Buffer.from(hex.slice(2), 'hex').toString('utf8').replace(/\0+$/, '');
  const off = Number(BigInt('0x' + word(hex, 0))) / 32;
  const len = Number(BigInt('0x' + word(hex, off)));
  return Buffer.from(hex.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2), 'hex').toString('utf8');
}

export const decodeUint = (hex) => (hex && hex !== '0x' ? BigInt('0x' + word(hex, 0)) : null);
export const decodeAddresses = (hex, n) => Array.from({ length: n }, (_, i) => '0x' + word(hex, i).slice(24));

export const pad = (v) => BigInt(v).toString(16).padStart(64, '0');
export const padAddr = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
