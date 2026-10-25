import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { rememberLogos } from './assets';

// Demo market universe from the server (CoinGecko top coins, cached) until Robinhood Chain markets list.
export type Kind = 'Major' | 'Large' | 'Mid' | 'Small';

export interface Market {
  id: string;
  symbol: string;
  name: string;
  image: string;
  kind: Kind;
  price: number;
  change24h: number;   // percent
  volume24h: number;   // USD
  marketCap: number;   // USD
  depth: number;       // demo pool depth, USD
  poolFee: number;     // per swap
  maxM: number;        // Hedge
  liqMargin: number;   // execution margin: liquidate this share of the position earlier (contract liqMarginBps)
  shortMaxM: number;   // Short: lower, up-spikes gap harder (docs/backx/SHORT-SPEC.md)
}

interface Page { items: Market[]; hasMore: boolean }

/** Moving markets, highest 24h change first, 100 per page; loadMore() for infinite scroll. */
export function useMovingMarkets() {
  const [items, setItems] = useState<Market[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const loading = useRef(false);
  const page = useRef(0);

  const loadMore = useCallback(async () => {
    if (loading.current || !hasMore) return;
    loading.current = true;
    try {
      const r = await api<Page>(`/api/markets?page=${page.current}`);
      rememberLogos(r.items);
      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...r.items.filter((m) => !seen.has(m.id))];
      });
      setHasMore(r.hasMore);
      page.current++;
      setError(false);
    } catch {
      setError(true);
    } finally {
      loading.current = false;
    }
  }, [hasMore]);

  useEffect(() => { loadMore(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, hasMore, error, loadMore };
}

export async function searchMarkets(q: string, signal?: AbortSignal) {
  return api<{ items: Market[]; suggested: boolean }>(`/api/markets/search?q=${encodeURIComponent(q)}`, { signal });
}

export interface Candle { time: number; open: number; high: number; low: number; close: number }

/** Deterministic random walk so the demo chart is stable between reloads. */
export function demoCandles(m: Market, count = 240, stepSec = 300): Candle[] {
  let seed = [...m.symbol].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483647 || 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const vol = m.kind === 'Major' ? 0.004 : m.kind === 'Large' ? 0.007 : 0.012;
  const end = Math.floor(Date.now() / 1000 / stepSec) * stepSec;
  const out: Candle[] = [];
  // Walk backwards from the current price so the last close matches the header.
  let close = m.price;
  for (let i = 0; i < count; i++) {
    const open = close * (1 + (rnd() - 0.5) * vol * 2 - (m.change24h / 100) / count);
    const high = Math.max(open, close) * (1 + rnd() * vol);
    const low = Math.min(open, close) * (1 - rnd() * vol);
    out.push({ time: end - i * stepSec, open, high, low, close });
    close = open;
  }
  return out.reverse();
}
