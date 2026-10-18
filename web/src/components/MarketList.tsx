import { forwardRef, useMemo, useState } from 'react';
import { MARKETS, type Market } from '../lib/markets';
import { arrow, pct, price } from '../lib/format';

interface Props { selected: string; onSelect: (m: Market) => void }

export const MarketList = forwardRef<HTMLInputElement, Props>(function MarketList({ selected, onSelect }, ref) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? MARKETS.filter((m) => m.symbol.toLowerCase().includes(s) || m.name.toLowerCase().includes(s)) : MARKETS;
  }, [q]);

  return (
    <aside className="panel markets" aria-label="Markets">
      <div className="markets-search">
        <label className="sr-only" htmlFor="market-search">Search markets</label>
        <input id="market-search" ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoComplete="off" />
      </div>
      <div className="markets-head label"><span>Market</span><span>Price</span><span>24h</span></div>
      <ul className="markets-list">
        {list.map((m) => (
          <li key={m.symbol}>
            <button className={'market-row' + (m.symbol === selected ? ' active' : '')} onClick={() => onSelect(m)} aria-current={m.symbol === selected}>
              <span className="market-sym">
                <b>{m.symbol}</b>
                <small>{m.maxM}×</small>
              </span>
              <span className="num">{price(m.price)}</span>
              <span className={'num ' + (m.change24h >= 0 ? 'up' : 'down')}>
                {arrow(m.change24h)} {pct(m.change24h)}
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="empty">No market matches “{q}”.</li>}
      </ul>
    </aside>
  );
});
