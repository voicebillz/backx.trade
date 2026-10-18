// Logos and colours for chains, wallet assets and markets.
import eth from 'cryptocurrency-icons/svg/color/eth.svg?url';
import bnb from 'cryptocurrency-icons/svg/color/bnb.svg?url';
import sol from 'cryptocurrency-icons/svg/color/sol.svg?url';
import usdc from 'cryptocurrency-icons/svg/color/usdc.svg?url';
import btc from 'cryptocurrency-icons/svg/color/btc.svg?url';
import doge from 'cryptocurrency-icons/svg/color/doge.svg?url';
import base from '../assets/base.svg?url';

export const TOKEN_LOGO: Record<string, string> = { ETH: eth, BNB: bnb, SOL: sol, USDC: usdc, BTC: btc, DOGE: doge };
export const CHAIN_LOGO: Record<string, string> = { ethereum: eth, base, bsc: bnb, solana: sol };

export interface EvmChain { key: 'ethereum' | 'base' | 'bsc'; id: number; name: string; native: string; feeReserve: string }
export const EVM_CHAINS: EvmChain[] = [
  // feeReserve: kept back on "Max" for native coins so the withdrawal can pay its own gas.
  { key: 'ethereum', id: 1, name: 'Ethereum', native: 'ETH', feeReserve: '0.0015' },
  { key: 'base', id: 8453, name: 'Base', native: 'ETH', feeReserve: '0.00005' },
  { key: 'bsc', id: 56, name: 'BNB Chain', native: 'BNB', feeReserve: '0.0005' },
];

export const USDC: Record<EvmChain['key'], { address: `0x${string}`; decimals: number }> = {
  ethereum: { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', decimals: 6 },
  base: { address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', decimals: 6 },
  bsc: { address: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals: 18 },
};
