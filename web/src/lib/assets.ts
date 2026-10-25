// Logos and colours for chains, wallet assets and markets.
import eth from 'cryptocurrency-icons/svg/color/eth.svg?url';
import bnb from 'cryptocurrency-icons/svg/color/bnb.svg?url';
import sol from 'cryptocurrency-icons/svg/color/sol.svg?url';
import usdc from 'cryptocurrency-icons/svg/color/usdc.svg?url';
import btc from 'cryptocurrency-icons/svg/color/btc.svg?url';
import doge from 'cryptocurrency-icons/svg/color/doge.svg?url';
import usdt from 'cryptocurrency-icons/svg/color/usdt.svg?url';
import dai from 'cryptocurrency-icons/svg/color/dai.svg?url';
import base from '../assets/base.svg?url';

export const TOKEN_LOGO: Record<string, string> = { ETH: eth, WETH: eth, BNB: bnb, WBNB: bnb, SOL: sol, USDC: usdc, USDT: usdt, DAI: dai, BTC: btc, WBTC: btc, DOGE: doge };
export const CHAIN_LOGO: Record<string, string> = { ethereum: eth, base, bsc: bnb, solana: sol, arbitrum: '/chains/arbitrum.png', robinhood: '/chains/robinhood.png' };

/** Logos of every listed coin, filled from the market list (CoinGecko images), so a bare symbol anywhere
 *  (USDC, ETH, the coin you issue or trade) shows its real logo. */
export const LISTED_LOGO: Record<string, string> = {};
export function rememberLogos(items: { symbol: string; image: string }[]) {
  for (const m of items) if (m.image && !LISTED_LOGO[m.symbol]) LISTED_LOGO[m.symbol] = m.image;
}

export interface EvmChain { key: 'ethereum' | 'base' | 'bsc' | 'arbitrum'; id: number; name: string; native: string; feeReserve: string }
export const EVM_CHAINS: EvmChain[] = [
  // feeReserve: kept back on "Max" for native coins so the withdrawal can pay its own gas.
  { key: 'ethereum', id: 1, name: 'Ethereum', native: 'ETH', feeReserve: '0.0015' },
  { key: 'base', id: 8453, name: 'Base', native: 'ETH', feeReserve: '0.00005' },
  { key: 'bsc', id: 56, name: 'BNB Chain', native: 'BNB', feeReserve: '0.0005' },
  { key: 'arbitrum', id: 42161, name: 'Arbitrum', native: 'ETH', feeReserve: '0.00005' },
];

export const USDC: Record<EvmChain['key'], { address: `0x${string}`; decimals: number }> = {
  ethereum: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  base: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
  bsc: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
  arbitrum: { address: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', decimals: 6 },
};
