import { useEffect, useRef } from 'react';
import type { Market } from '../lib/markets';
import { arrow, pct, price } from '../lib/format';
import { CoinIcon } from './CoinIcon';

interface Props {
  items: Market[];
  hasMore: boolean;
  error: boolean;
  loadMore: () => void;
  selected: string | null;
  onSelect: (m: Market) => void;
}

/** Moving markets: highest 24h change first, 100 at a time, more load as you scroll. */
export function MarketList({ items, hasMore, error, loadMore, selected, onSelect }: Props) {
  const sentinel = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) loadMore(); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, items.length]);

  return (
    <aside className="panel markets" aria-label="Moving markets">
      <div className="markets-title">
        <span className="pulse" aria-hidden="true" />
        <h2>Moving Markets</h2>
        <span className="markets-sort">24h ▼</span>
      </div>
      <div className="markets-head label"><span>Market</span><span>Price</span><span>24h</span></div>
      <ul className="markets-list" aria-busy={items.length === 0 && !error}>
        {items.map((m, i) => (
          <li key={m.id}>
            <button className={'market-row' + (m.id === selected ? ' active' : '')} onClick={() => onSelect(m)} aria-current={m.id === selected}>
              <span className="market-sym">
                <span className="rank num">{i + 1}</span>
                <CoinIcon symbol={m.symbol} src={m.image} size={18} />
                <b>{m.symbol}</b>
                <small>{m.maxM}×</small>
              </span>
              <span className="num">{price(m.price)}</span>
              <span className={'chg num ' + (m.change24h >= 0 ? 'up' : 'down')}>{arrow(m.change24h)} {pct(m.change24h)}</span>
            </button>
          </li>
        ))}
        {items.length === 0 && !error && Array.from({ length: 14 }, (_, i) => (
          <li key={'s' + i} className="market-row skeleton-row" aria-hidden="true"><span className="sk sk-w60" /><span className="sk sk-w40" /><span className="sk sk-w30" /></li>
        ))}
        {error && <li className="empty">Markets did not load. <button className="link" onClick={loadMore}>Retry</button></li>}
        {hasMore && items.length > 0 && <li ref={sentinel} className="market-row skeleton-row" aria-hidden="true"><span className="sk sk-w60" /><span className="sk sk-w40" /><span className="sk sk-w30" /></li>}
      </ul>
    </aside>
  );
}
