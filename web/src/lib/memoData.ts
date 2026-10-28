// Market numbers for the investor memo (research 2026-10-28). Every figure carries its source; "own calc" = computed
// from DefiLlama's public API on that date. Update before each send-out: these markets move monthly.

export const VENUES_SEP_2026 = {
  rows: [
    { label: 'CEX derivatives', value: 3940, text: '$3.94T' },
    { label: 'CEX spot', value: 1130, text: '$1.13T' },
    { label: 'Perp DEXs', value: 627, text: '$0.63T', hi: true },
    { label: 'DEX spot', value: 279, text: '$0.28T' },
  ],
  source: 'CoinDesk Research, Exchange Review September 2026 (published 2026-10-13).',
};

export const PERP_SHARE = {
  rows: [
    { label: 'January 2023', value: 0.11, text: '0.11 %' },
    { label: 'September 2026', value: 12.33, text: '12.3 %', hi: true },
  ],
  source: 'Castle Labs, perp DEX share of global perpetual volume (2026-10-02).',
};

export const PERP_DEX_SPLIT = {
  rows: [
    { label: 'Hyperliquid', value: 39 },
    { label: 'Lighter', value: 13 },
    { label: 'Variational', value: 12 },
    { label: 'Aster', value: 8.2 },
    { label: 'GMX', value: 2.0 },
    { label: 'Others', value: 25.8 },
  ],
  source: 'Castle Labs perp DEX rankings, 24 h volume on 2026-10-27 ($18.8B total).',
};

export const SPOT_DEX_SPLIT = {
  rows: [
    { label: 'Uniswap', value: 30.3 },
    { label: 'PancakeSwap', value: 11.1 },
    { label: 'Aerodrome', value: 7.9 },
    { label: 'Pump', value: 4.3 },
    { label: 'Orca', value: 3.6 },
    { label: 'Others', value: 42.8 },
  ],
  source: 'DefiLlama, DEX volume by protocol, 30 days to 2026-10-27 ($212B), own calc.',
};

export const CAPITAL = {
  rows: [
    { label: 'DeFi lending', value: 52.6, text: '$52.6B', hi: true },
    { label: 'DEX / AMM liquidity', value: 13.6, text: '$13.6B' },
  ],
  source: 'DefiLlama TVL by category, 2026-10-28, own calc.',
};

export const YEAR_2025 = [
  { v: '$85.7T', l: 'CEX derivatives volume, 2025 (CoinGlass)' },
  { v: '$7.9T', l: 'Perp DEX volume, 2025 (DefiLlama)' },
  { v: '$4.7T', l: 'DEX spot volume, 2025 (DefiLlama)' },
  { v: '$1.13B', l: 'Robinhood Chain TVL, 4 months after mainnet' },
];

export const LP_LOSS = {
  rows: [
    { label: 'Fees earned', value: 199.3, text: '$199M' },
    { label: 'Impermanent loss', value: 260.1, text: '$260M', hi: true },
  ],
  source: 'Topaze Blue / Bancor, "Impermanent Loss in Uniswap v3" (2021), 17 pools, May–Sep 2021; commissioned by Bancor.',
};
