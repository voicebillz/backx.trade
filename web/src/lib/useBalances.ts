import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface Asset {
  chain: 'ethereum' | 'base' | 'bsc' | 'solana';
  chainName: string;
  symbol: string;
  name: string;
  amount: string;      // exact decimal string
  price: number | null;
  usd: number | null;
}
export interface Balances { totalUsd: number; assets: Asset[]; partial: boolean; updatedAt: string }

/** The signed-in user's on-chain balances (read via the API), refreshed every 30 s. */
export function useBalances(enabled: boolean) {
  const [data, setData] = useState<Balances | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try { setData(await api<Balances>('/api/wallet/balances')); setError(false); }
    catch { setError(true); }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return { data, error, refresh };
}
